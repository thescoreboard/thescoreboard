"""
OG image generator.

Produces 1200×630 PNG share cards using Pillow.
Images are cached in the Supabase 'og-cache' bucket so they are only
generated once per tournament/match.

Font loading strategy:
  1. Look for bundled fonts in  <repo-root>/backend/assets/fonts/
  2. Try common system font paths (Linux CI, macOS, Windows)
  3. Fall back to Pillow's built-in bitmap font (no TTF required)

To get custom Unbounded / Space-Grotesk fonts in production:
  Place the .ttf files in  backend/assets/fonts/  and redeploy.
  The generator will pick them up automatically.
"""
import io
import os
import logging
import textwrap
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Colour palette (matches app CSS tokens) ───────────────────────────────────
C_BG        = (13,  13,  13)
C_SURFACE   = (26,  26,  26)
C_ELEVATED  = (34,  34,  34)
C_INK       = (255, 255, 255)
C_MUTED     = (136, 136, 136)
C_PRIMARY   = (255, 107, 53)   # --primary orange
C_GREEN     = (34,  197, 94)
C_GOLD      = (255, 204, 0)

OG_W, OG_H = 1200, 630

# ── Font loading ──────────────────────────────────────────────────────────────

_ASSETS = Path(__file__).parent.parent.parent / "assets" / "fonts"

_SYSTEM_BOLD_PATHS = [
    # Linux (CI / Render / Docker)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    # Windows
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
]

_SYSTEM_REGULAR_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def _load_font(size: int, bold: bool = False):
    """Return the best available ImageFont at the requested size."""
    try:
        from PIL import ImageFont
    except ImportError:
        return None

    # 1. Bundled custom fonts (highest priority)
    for name in (["Unbounded-Bold.ttf", "SpaceGrotesk-Bold.ttf"] if bold
                 else ["SpaceGrotesk-Regular.ttf", "Unbounded-Regular.ttf"]):
        candidate = _ASSETS / name
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size)
            except Exception:
                pass

    # 2. System fonts
    candidates = _SYSTEM_BOLD_PATHS if bold else _SYSTEM_REGULAR_PATHS
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass

    # 3. Pillow built-in (no custom size support but always works)
    return ImageFont.load_default()


# ── Drawing primitives ────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: Optional[str]) -> tuple:
    if not hex_color:
        return C_PRIMARY
    h = hex_color.lstrip("#")
    if len(h) == 6:
        try:
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        except ValueError:
            pass
    return C_PRIMARY


def _draw_background(img, draw, accent: tuple):
    """Dark gradient background with a radial glow at top-right."""
    from PIL import Image

    # Solid dark base
    draw.rectangle([0, 0, OG_W, OG_H], fill=C_BG)

    # Subtle radial glow overlay (top-right corner)
    glow = Image.new("RGBA", (OG_W, OG_H), (0, 0, 0, 0))
    from PIL import ImageDraw as _ID
    gd = _ID.Draw(glow)
    r, g, b = accent
    # Draw concentric circles from light to transparent
    for radius, alpha in [(400, 18), (300, 28), (200, 38), (100, 22)]:
        gd.ellipse(
            [OG_W - radius, -radius // 2, OG_W + radius, radius + radius // 2],
            fill=(r, g, b, alpha),
        )
    img.paste(glow, (0, 0), glow)


def _draw_left_stripe(draw, accent: tuple):
    """6px accent colour stripe on the left edge."""
    draw.rectangle([0, 0, 6, OG_H], fill=accent)


def _draw_branding(draw, accent: tuple):
    """'TheScoreBoard' wordmark top-left."""
    f_sm = _load_font(22, bold=True)
    x, y = 40, 36
    # 'The' in accent colour, 'Score' in white, 'Board' in accent
    # Since we can't easily do mixed-color inline text with default PIL,
    # draw the whole wordmark in white with the brand name.
    draw.text((x, y), "TheScoreBoard", font=f_sm, fill=C_INK)


def _draw_status_badge(draw, label: str, color: tuple, x_right: int, y: int):
    """Pill badge (e.g. LIVE, COMPLETED) anchored at its right edge."""
    f = _load_font(18, bold=True)
    if hasattr(f, "getbbox"):
        bbox = f.getbbox(label)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    else:
        tw, th = len(label) * 11, 18

    pad_x, pad_y = 20, 10
    bw, bh = tw + pad_x * 2, th + pad_y * 2
    x0 = x_right - bw
    draw.rounded_rectangle([x0, y, x_right, y + bh], radius=bh // 2, fill=color)
    draw.text((x0 + pad_x, y + pad_y), label, font=f, fill=C_INK)


def _wrap_text(text: str, max_chars: int) -> list[str]:
    return textwrap.wrap(text, width=max_chars) or [text]


def _draw_multiline(draw, lines: list[str], font, x: int, y: int,
                    color: tuple, line_height: int) -> int:
    """Draw lines and return the y position after the last line."""
    for line in lines:
        draw.text((x, y), line, font=font, fill=color)
        y += line_height
    return y


# ── Tournament card ───────────────────────────────────────────────────────────

def generate_tournament_card(
    name: str,
    status: str,
    sport_label: Optional[str] = None,
    city: Optional[str] = None,
    venue: Optional[str] = None,
    primary_color: Optional[str] = None,
) -> bytes:
    """Render a tournament OG share card.  Returns PNG bytes."""
    from PIL import Image, ImageDraw

    accent = _hex_to_rgb(primary_color)
    img    = Image.new("RGB", (OG_W, OG_H), C_BG)
    draw   = ImageDraw.Draw(img, "RGBA")

    _draw_background(img, draw, accent)
    _draw_left_stripe(draw, accent)
    _draw_branding(draw, accent)

    # Status badge
    status_cfg = {
        "live":         ("● LIVE",             C_PRIMARY),
        "registration": ("REGISTRATION OPEN",  C_GREEN),
        "completed":    ("COMPLETED",           (80, 80, 80)),
        "fixtures":     ("FIXTURES SET",        (37, 99, 235)),
        "draft":        ("COMING SOON",         (80, 80, 80)),
    }
    badge_label, badge_color = status_cfg.get(status, ("UPCOMING", (80, 80, 80)))
    _draw_status_badge(draw, badge_label, badge_color, OG_W - 40, 28)

    # Tournament name (large, wrapped)
    f_title = _load_font(72, bold=True)
    f_sub   = _load_font(28, bold=False)
    f_meta  = _load_font(24, bold=False)

    name_lines = _wrap_text(name.upper(), max_chars=22)
    title_y    = 180
    title_y    = _draw_multiline(draw, name_lines, f_title, 40, title_y, C_INK, 82)

    # Sport label pill
    if sport_label:
        pill_text = f"  {sport_label}  "
        f_pill    = _load_font(20, bold=True)
        draw.rounded_rectangle([40, title_y + 20, 40 + len(pill_text) * 12 + 10, title_y + 55],
                                radius=6, fill=C_ELEVATED)
        draw.text((50, title_y + 26), sport_label.upper(), font=f_pill, fill=accent)
        title_y += 65

    # Bottom meta row
    meta_parts = [p for p in [venue, city] if p]
    meta_text = "  ·  ".join(meta_parts)

    draw.rectangle([0, OG_H - 90, OG_W, OG_H], fill=C_SURFACE)
    draw.text((40, OG_H - 62), meta_text, font=f_meta, fill=C_MUTED)
    draw.text((OG_W - 40 - len("thescoreboard.in") * 14, OG_H - 62),
              "thescoreboard.in", font=f_meta, fill=(60, 60, 60))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ── Match card ────────────────────────────────────────────────────────────────

def generate_match_card(
    team1: str,
    team2: str,
    score1: Optional[str] = None,
    score2: Optional[str] = None,
    status: str = "scheduled",
    round_label: Optional[str] = None,
    tournament_name: Optional[str] = None,
    sport_label: Optional[str] = None,
    primary_color: Optional[str] = None,
) -> bytes:
    """Render a match OG share card.  Returns PNG bytes."""
    from PIL import Image, ImageDraw

    accent = _hex_to_rgb(primary_color)
    img    = Image.new("RGB", (OG_W, OG_H), C_BG)
    draw   = ImageDraw.Draw(img, "RGBA")

    _draw_background(img, draw, accent)
    _draw_left_stripe(draw, accent)
    _draw_branding(draw, accent)

    is_live = status == "live"
    is_done = status == "done"

    # Status badge
    if is_live:
        _draw_status_badge(draw, "● LIVE", C_PRIMARY, OG_W - 40, 28)
    elif is_done:
        _draw_status_badge(draw, "FT", C_GREEN, OG_W - 40, 28)

    # Round label
    if round_label:
        f_round = _load_font(22, bold=True)
        draw.text((40, 90), round_label.upper(), font=f_round, fill=C_MUTED)

    # Team names + scores
    f_team  = _load_font(60, bold=True)
    f_score = _load_font(80, bold=True)
    f_vs    = _load_font(36, bold=False)
    f_meta  = _load_font(24, bold=False)

    center_y = 280

    # Team 1 (left)
    t1_lines = _wrap_text(team1, max_chars=14)
    t1_x = 60
    y = center_y - len(t1_lines) * 35
    for line in t1_lines:
        draw.text((t1_x, y), line, font=f_team, fill=C_INK)
        y += 70

    # Team 2 (right-aligned)
    t2_lines = _wrap_text(team2, max_chars=14)
    t2_x = OG_W - 60
    y = center_y - len(t2_lines) * 35
    for line in t2_lines:
        if hasattr(f_team, "getbbox"):
            tw = f_team.getbbox(line)[2] - f_team.getbbox(line)[0]
        else:
            tw = len(line) * 36
        draw.text((t2_x - tw, y), line, font=f_team, fill=C_INK)
        y += 70

    # Centre: score or VS
    if (score1 is not None) and (score2 is not None) and (is_live or is_done):
        score_str = f"{score1}  –  {score2}"
        if hasattr(f_score, "getbbox"):
            sw = f_score.getbbox(score_str)[2] - f_score.getbbox(score_str)[0]
        else:
            sw = len(score_str) * 45
        score_x = (OG_W - sw) // 2
        score_color = C_PRIMARY if is_live else C_INK
        draw.text((score_x, center_y - 40), score_str, font=f_score, fill=score_color)
    else:
        vs = "VS"
        if hasattr(f_vs, "getbbox"):
            vw = f_vs.getbbox(vs)[2] - f_vs.getbbox(vs)[0]
        else:
            vw = 60
        draw.text(((OG_W - vw) // 2, center_y), vs, font=f_vs, fill=C_MUTED)

    # Bottom bar
    meta_parts = [p for p in [tournament_name, sport_label] if p]
    meta_text  = "  ·  ".join(meta_parts)

    draw.rectangle([0, OG_H - 90, OG_W, OG_H], fill=C_SURFACE)
    draw.text((40, OG_H - 62), meta_text, font=f_meta, fill=C_MUTED)
    draw.text((OG_W - 40 - len("thescoreboard.in") * 14, OG_H - 62),
              "thescoreboard.in", font=f_meta, fill=(60, 60, 60))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
