"""
Social share router — OG meta-tag HTML pages and OG image endpoints.

GET /api/share/t/{slug}              → HTML with OG tags + JS redirect (crawlers see tags, users get redirected)
GET /api/share/og/tournament/{slug}.png → 1200×630 tournament card PNG (cached in Supabase og-cache)
GET /api/share/og/match/{match_id}.png  → 1200×630 match card PNG (cached in Supabase og-cache)
"""
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.match import Match, MatchParticipant, MatchSet

# Maps DB stage values to human-readable round labels for OG images
_STAGE_LABEL_MAP = {
    "group":       "Group Stage",
    "quarter":     "Quarter-Final",
    "semi":        "Semi-Final",
    "third_place": "3rd Place",
    "final":       "Final",
}


def _mp_name(mp: MatchParticipant | None) -> str:
    """Return the display name for one side of a match (handles players AND teams)."""
    if mp is None:
        return "TBD"
    if mp.player:
        return mp.player.name
    if mp.team:
        return mp.team.name
    return "TBD"
from app.models.tournament import Tournament
from app.services import storage, og_generator

logger = logging.getLogger(__name__)
router = APIRouter()


def _origin(request: Request) -> str:
    """
    Return the public-facing scheme+host the request arrived on.
    Respects X-Forwarded-Proto / X-Forwarded-Host set by reverse proxies
    (nginx, Render, Vite dev proxy) so the OG image URL is always reachable
    by WhatsApp / social crawlers.
    Falls back to APP_URL if headers are absent (e.g. direct local calls).
    """
    host   = (request.headers.get("x-forwarded-host")
              or request.headers.get("host")
              or "")
    scheme = (request.headers.get("x-forwarded-proto")
              or request.url.scheme
              or "https")
    if host:
        return f"{scheme}://{host}"
    # Last resort: use APP_URL from settings
    return settings.APP_URL.rstrip("/")

SPORT_LABELS = {
    "cricket":      "Cricket",
    "football":     "Football",
    "badminton":    "Badminton",
    "table_tennis": "Table Tennis",
}

_OG_BUCKET = settings.BUCKET_OG_CACHE


# ── Helpers ───────────────────────────────────────────────────────────────────

def _og_redirect_html(
    title: str,
    description: str,
    image_url: str,
    redirect_url: str,
    url: str,
    deep_link: str = "",
) -> str:
    # title/description carry organiser-entered text (tournament name, city,
    # venue, participant names) — escape for the HTML context, and emit URLs
    # into the inline script as JSON literals so no value can break out of
    # its string and inject markup or JS.
    import html as _html
    import json as _json
    title       = _html.escape(title, quote=True)
    description = _html.escape(description, quote=True)
    image_url   = _html.escape(image_url, quote=True)
    url         = _html.escape(url, quote=True)
    redirect_js = _json.dumps(redirect_url)
    deep_js     = _json.dumps(deep_link)
    redirect_url = _html.escape(redirect_url, quote=True)

    deep_link_js = ""
    if deep_link:
        deep_link_js = f"""
  // Try to open the native app first; fall back to website after 1.5 s
  (function () {{
    var ua = navigator.userAgent || "";
    var isAndroid = /android/i.test(ua);
    var isIOS     = /iphone|ipad|ipod/i.test(ua);
    if (isAndroid || isIOS) {{
      var appUrl   = {deep_js};
      var webUrl   = {redirect_js};
      // Intent URL for Android (works even when browser intercepts custom schemes)
      var intentUrl = appUrl.replace(/^thescoreboard:\/\//, "intent://")
                            + "#Intent;scheme=thescoreboard;package=in.thescoreboard.app;end";
      var start = Date.now();
      setTimeout(function () {{
        // If we're still here after 1.5 s the app isn't installed — go to web
        if (Date.now() - start < 2000) window.location.replace(webUrl);
      }}, 1500);
      window.location.href = isAndroid ? intentUrl : appUrl;
      return;
    }}
    window.location.replace({redirect_js});
  }})();"""
    else:
        deep_link_js = f"window.location.replace({redirect_js});"

    return f"""<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title}</title>

  <!-- ── Primary meta ───────────────────────────── -->
  <meta name="description"        content="{description}"/>

  <!-- ── Open Graph (Facebook, Instagram, WhatsApp, LinkedIn) ── -->
  <meta property="og:site_name"   content="TheScoreBoard"/>
  <meta property="og:type"        content="website"/>
  <meta property="og:locale"      content="en_IN"/>
  <meta property="og:url"         content="{url}"/>
  <meta property="og:title"       content="{title}"/>
  <meta property="og:description" content="{description}"/>
  <meta property="og:image"       content="{image_url}"/>
  <meta property="og:image:secure_url" content="{image_url}"/>
  <meta property="og:image:type"  content="image/png"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt"   content="{title}"/>

  <!-- ── Twitter / X ───────────────────────────── -->
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:site"        content="@thescoreboardin"/>
  <meta name="twitter:title"       content="{title}"/>
  <meta name="twitter:description" content="{description}"/>
  <meta name="twitter:image"       content="{image_url}"/>
  <meta name="twitter:image:alt"   content="{title}"/>

  <!-- ── Smart redirect: app if installed, website otherwise ── -->
  <script>{deep_link_js}</script>
</head>
<body>
  <p>Redirecting… <a href="{redirect_url}">Click here if not redirected.</a></p>
</body>
</html>"""


def _cached_png(cache_key: str, generate_fn) -> bytes:
    """Return cached PNG bytes from Supabase, or generate + cache + return."""
    if settings.supabase_configured:
        try:
            pub = storage.get_public_url(_OG_BUCKET, cache_key)
            import httpx
            r = httpx.get(pub, timeout=5, follow_redirects=True)
            if r.status_code == 200:
                return r.content
        except Exception:
            pass

    png = generate_fn()

    if settings.supabase_configured:
        try:
            storage.upload_bytes(_OG_BUCKET, cache_key, png, "image/png", upsert=True)
        except Exception as exc:
            logger.warning("OG cache upload failed: %s", exc)

    return png


# ── Tournament share page ─────────────────────────────────────────────────────

@router.get("/t/{slug}", response_class=HTMLResponse)
def share_tournament(request: Request, slug: str, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.slug == slug, Tournament.is_active == True, Tournament.is_published == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    sport_keys = list({e.sport_key for e in t.events if e.is_active})
    sport_label = SPORT_LABELS.get(sport_keys[0]) if sport_keys else None

    title = t.name
    desc_parts = [p for p in [sport_label, t.city, t.venue] if p]
    description = " · ".join(desc_parts) if desc_parts else "Live tournament on TheScoreBoard"

    # og:image must always point directly to the backend (api.thescoreboard.in)
    # so WhatsApp / social crawlers can reach it even when the share page is
    # served via the Vercel frontend proxy at thescoreboard.in/share/t/{slug}.
    og_origin    = settings.APP_URL.rstrip("/")
    image_url    = f"{og_origin}/api/share/og/tournament/{slug}.png"
    frontend_url = f"{settings.SITE_URL}/t/{slug}"
    deep_link    = f"thescoreboard://t/{slug}"

    return HTMLResponse(_og_redirect_html(title, description, image_url, frontend_url, frontend_url, deep_link))


# ── Tournament OG image ───────────────────────────────────────────────────────

@router.get("/og/tournament/{slug}.png")
def og_tournament_image(slug: str, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.slug == slug, Tournament.is_active == True, Tournament.is_published == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    sport_keys = list({e.sport_key for e in t.events if e.is_active})
    sport_label = SPORT_LABELS.get(sport_keys[0]) if sport_keys else None

    cache_key = f"tournament/{slug}.png"

    def _gen():
        return og_generator.generate_tournament_card(
            name=t.name,
            status=t.status,
            sport_label=sport_label,
            city=t.city,
            venue=t.venue,
            primary_color=t.primary_color,
        )

    png = _cached_png(cache_key, _gen)
    return Response(content=png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


# ── Match share page ──────────────────────────────────────────────────────────

@router.get("/m/{match_id}", response_class=HTMLResponse)
def share_match(request: Request, match_id: int, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.event),
        )
        .filter(Match.match_id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    parts = sorted(match.participants, key=lambda p: p.position)
    t1 = _mp_name(parts[0] if len(parts) > 0 else None)
    t2 = _mp_name(parts[1] if len(parts) > 1 else None)

    title = f"{t1} vs {t2}"
    event_name = match.event.name if match.event else ""
    t_name = match.event.tournament.name if (match.event and match.event.tournament) else ""
    parts  = [p for p in [t_name, event_name, "Live on TheScoreBoard"] if p]
    description = " · ".join(parts)

    tournament_slug = match.event.tournament.slug if (match.event and match.event.tournament) else "tournament"

    og_origin    = settings.APP_URL.rstrip("/")
    image_url    = f"{og_origin}/api/share/og/match/{match_id}.png"
    frontend_url = f"{settings.SITE_URL}/t/{tournament_slug}"
    deep_link    = f"thescoreboard://t/{tournament_slug}"

    return HTMLResponse(_og_redirect_html(title, description, image_url, frontend_url, frontend_url, deep_link))


# ── Match OG image ────────────────────────────────────────────────────────────

@router.get("/og/match/{match_id}.png")
def og_match_image(match_id: int, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
            joinedload(Match.event),
        )
        .filter(Match.match_id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    parts = sorted(match.participants, key=lambda p: p.position)
    t1 = _mp_name(parts[0] if len(parts) > 0 else None)
    t2 = _mp_name(parts[1] if len(parts) > 1 else None)

    # Compute scores from sets (set-based sports like TT/Badminton).
    # For cricket/football the aggregate score lives on MatchParticipant.score.
    score1 = score2 = None
    if match.sets:
        s1 = sum(1 for s in match.sets if s.winner_position == 1)
        s2 = sum(1 for s in match.sets if s.winner_position == 2)
        score1, score2 = str(s1), str(s2)
    elif len(parts) >= 2 and parts[0].score is not None and parts[1].score is not None:
        score1, score2 = str(parts[0].score), str(parts[1].score)

    sport_key    = match.event.sport_key if match.event else None
    sport_label  = SPORT_LABELS.get(sport_key) if sport_key else None
    # Build round label from stage (Match has no round_name attribute)
    stage = match.stage or ""
    round_label  = _STAGE_LABEL_MAP.get(stage) or stage.replace("_", " ").title() or None
    t_name       = match.event.tournament.name if (match.event and match.event.tournament) else None
    t_color      = match.event.tournament.primary_color if (match.event and match.event.tournament) else None

    cache_key = f"match/{match_id}_{match.status}.png"

    def _gen():
        return og_generator.generate_match_card(
            team1=t1,
            team2=t2,
            score1=score1,
            score2=score2,
            status=match.status,
            round_label=round_label,
            tournament_name=t_name,
            sport_label=sport_label,
            primary_color=t_color,
        )

    # Live matches: skip cache so score is always fresh
    if match.status == "live":
        png = _gen()
    else:
        png = _cached_png(cache_key, _gen)

    return Response(content=png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=60" if match.status == "live" else "public, max-age=3600",
    })
