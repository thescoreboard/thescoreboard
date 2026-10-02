"""
Public routes — no auth required. For spectators and tournament discovery.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, distinct, or_
from typing import Optional, List
from datetime import datetime, timezone
import time

from app.utils.match_rules import requires_winner
from app.utils.event_rules import entries_locked
from app.database import get_db
from app.models.tournament import Tournament
from app.models.event import Event
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.group import EventParticipant
from app.models.player import Player, Team
from app.utils.ratelimit import public_registration_limiter

from pydantic import BaseModel

router = APIRouter()

# ── Simple in-memory cache for the homepage ──────────────────────────────────
# The homepage is the most-called public endpoint (every app open).
# 30-second TTL: data stays fresh enough while massively reducing DB load.
_homepage_cache: dict = {"data": None, "ts": 0.0}
HOMEPAGE_TTL = 30  # seconds

# ── Per-slug tournament page cache ───────────────────────────────────────────
# Each live score update triggers a WS broadcast + potentially several HTTP
# polls all hitting the same 3-query tournament-page rebuild simultaneously.
# A 5-second TTL coalesces bursts of reads without going stale for viewers
# (WS push always bypasses this cache and writes fresh data into it).
_t_page_cache: dict = {}   # slug → {"data": dict, "ts": float}
_T_PAGE_TTL = 5.0           # seconds


def _get_t_page_cache(slug: str) -> dict | None:
    entry = _t_page_cache.get(slug)
    if entry and (time.time() - entry["ts"]) < _T_PAGE_TTL:
        return entry["data"]
    return None


def _set_t_page_cache(slug: str, data: dict) -> None:
    _t_page_cache[slug] = {"data": data, "ts": time.time()}


def invalidate_public_caches(slug: str | None = None) -> None:
    """Drop the homepage cache and (optionally) one tournament page, e.g. after a
    public/private toggle, so the change shows up immediately."""
    _homepage_cache["data"] = None
    if slug:
        _t_page_cache.pop(slug, None)


def invalidate_tournament_cache(slug: str) -> None:
    """Called by the WS push task so the next HTTP poll sees fresh data."""
    _t_page_cache.pop(slug, None)


def _serialize_participants(event_id: int, db: Session) -> list:
    eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id)
        .options(
            joinedload(EventParticipant.player),
            joinedload(EventParticipant.team),
            joinedload(EventParticipant.group),
        )
        .all()
    )
    result = []
    for ep in eps:
        if ep.team:
            result.append({
                "id":      ep.team.team_id,
                "name":    ep.team.name,
                "type":    "team",
                "logo_url": ep.team.logo_url,
                "group":   ep.group.name if ep.group else None,
            })
        elif ep.player:
            result.append({
                "id":    ep.player.player_id,
                "name":  ep.player.name,
                "type":  "player",
                "group": ep.group.name if ep.group else None,
            })
    return result


# ── Schemas ───────────────────────────────────────────────────

class PublicRegistration(BaseModel):
    name:      str
    phone:     str
    age:       Optional[int] = None
    gender:    Optional[str] = "Male"
    event_ids: List[int]     = []


# ── Helpers ───────────────────────────────────────────────────

SPORT_URL_MAP = {
    "football":    "football",
    "cricket":     "cricket",
    "table-tennis":"table_tennis",
    "badminton":   "badminton",
}

SPORT_KEY_TO_URL = {v: k for k, v in SPORT_URL_MAP.items()}


def _sport_key_from_url(url_slug: str) -> str:
    key = SPORT_URL_MAP.get(url_slug)
    if not key:
        raise HTTPException(status_code=404, detail=f"Unknown sport: {url_slug}")
    return key


def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []

    def _name(p):
        if not p:
            return "TBD"
        if p.team:
            return p.team.name
        if p.player:
            return p.player.name
        return "TBD"

    return {
        "match_id":       m.match_id,
        "event_id":       m.event_id,
        "group_id":       m.group_id,
        "group":          m.group.name if m.group else None,
        "stage":          m.stage,
        "requires_winner": requires_winner(m.stage),
        "round":          m.round,
        "status":         m.status,
        "table_number":   m.table_number,
        "current_server": m.current_server,
        "live_state":     m.live_state or {},
        "player_1": {
            "name":      _name(p1),
            "score":     p1.score      if p1 else 0,
            "is_winner": p1.is_winner  if p1 else False,
        },
        "player_2": {
            "name":      _name(p2),
            "score":     p2.score      if p2 else 0,
            "is_winner": p2.is_winner  if p2 else False,
        },
        "sets": [
            {
                "set_number": s.set_number,
                "score_p1":   s.score_p1,
                "score_p2":   s.score_p2,
                "winner":     s.winner_position,
                "is_complete":s.is_complete,
            }
            for s in sets
        ],
    }


def _bulk_event_stats(event_ids: list, db: Session) -> dict:
    """
    Run 3 bulk queries to get match counts and participant counts for a list
    of event IDs. Returns a dict keyed by event_id with pre-computed stats.
    Replaces the per-event query loop that caused N×4 round trips.
    """
    if not event_ids:
        return {}

    # 1. Match counts grouped by (event_id, status)
    rows = (
        db.query(Match.event_id, Match.status, func.count(Match.match_id).label("n"))
        .filter(Match.event_id.in_(event_ids))
        .group_by(Match.event_id, Match.status)
        .all()
    )
    stats: dict = {eid: {"live": 0, "done": 0, "total": 0, "players": 0, "live_matches": []} for eid in event_ids}
    for eid, status, n in rows:
        stats[eid]["total"] += n
        if status == "live":
            stats[eid]["live"] = n
        elif status == "done":
            stats[eid]["done"] = n

    # 2. Participant counts grouped by event_id
    p_rows = (
        db.query(EventParticipant.event_id, func.count(EventParticipant.ep_id).label("n"))
        .filter(EventParticipant.event_id.in_(event_ids))
        .group_by(EventParticipant.event_id)
        .all()
    )
    for eid, n in p_rows:
        if eid in stats:
            stats[eid]["players"] = n

    # 3. Live match details (only if any are live)
    live_eids = [eid for eid, s in stats.items() if s["live"] > 0]
    if live_eids:
        live_ms = (
            db.query(Match)
            .filter(Match.event_id.in_(live_eids), Match.status == "live")
            .options(
                joinedload(Match.participants).joinedload(MatchParticipant.player),
                joinedload(Match.sets),
            )
            .all()
        )
        for m in live_ms:
            stats[m.event_id]["live_matches"].append(_serialize_match(m))

    return stats


def _build_tournament_card(t: Tournament, stats: dict, sport_filter: str = None) -> dict:
    """
    Build a tournament card using pre-loaded stats (no extra DB queries).
    `stats` is the dict returned by _bulk_event_stats, keyed by event_id.
    """
    events_summary = []
    t_live = t_total = t_done = t_players = 0
    sport_keys: set = set()

    for event in t.events:
        if not event.is_active:
            continue
        if sport_filter and event.sport_key != sport_filter:
            continue

        sport_keys.add(event.sport_key)
        s = stats.get(event.event_id, {"live": 0, "done": 0, "total": 0, "players": 0, "live_matches": []})

        events_summary.append({
            "event_id":      event.event_id,
            "name":          event.name,
            "sport_key":     event.sport_key,
            "format":        event.format,
            "live_count":    s["live"],
            "total_matches": s["total"],
            "done_matches":  s["done"],
            "player_count":  s["players"],
            "live_matches":  s["live_matches"],
        })

        t_live    += s["live"]
        t_total   += s["total"]
        t_done    += s["done"]
        t_players += s["players"]

    if t_live > 0:
        status = "live"
    elif t_done > 0 and t_done == t_total and t_total > 0:
        status = "completed"
    elif t_done > 0:
        status = "live"
    else:
        status = "upcoming"

    return {
        "tournament_id":     t.tournament_id,
        "name":              t.name,
        "slug":              t.slug,
        "description":       t.description,
        "venue":             t.venue,
        "city":              t.city,
        "state":             t.state,
        "venue_lat":         t.venue_lat,
        "venue_lng":         t.venue_lng,
        "poster_url":        t.poster_url,
        "primary_color":     t.primary_color,
        "org_name":          t.organization.name if t.organization else None,
        "sports":            list(sport_keys),
        "sport_urls":        [SPORT_KEY_TO_URL.get(s, s) for s in sport_keys],
        "status":            status,
        "is_live":           t_live > 0,
        "live_count":        t_live,
        "total_matches":     t_total,
        "completed_matches": t_done,
        "total_players":     t_players,
        "events":            events_summary,
    }


def _tournament_summary(t: Tournament, db: Session, sport_filter: str = None):
    """Thin wrapper kept for compatibility with single-tournament callers (sport page, search)."""
    event_ids = [e.event_id for e in t.events if e.is_active]
    stats = _bulk_event_stats(event_ids, db)
    return _build_tournament_card(t, stats, sport_filter)


# ── Homepage ──────────────────────────────────────────────────

@router.get("/home")
def homepage_data(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # Return cached result for non-search requests (TTL = 30s)
    # Searches are never cached since they're user-specific queries.
    if not q:
        now = time.time()
        if _homepage_cache["data"] is not None and (now - _homepage_cache["ts"]) < HOMEPAGE_TTL:
            return _homepage_cache["data"]

    query = (
        db.query(Tournament)
        .filter(Tournament.is_active == True, Tournament.is_published == True)
        .options(
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .order_by(Tournament.created_at.desc())
    )

    if q:
        query = query.filter(
            or_(
                Tournament.name.ilike(f"%{q}%"),
                Tournament.city.ilike(f"%{q}%"),
                Tournament.venue.ilike(f"%{q}%"),
            )
        )

    tournaments = query.all()

    # Single bulk query for all event stats across all tournaments
    all_event_ids = [e.event_id for t in tournaments for e in t.events if e.is_active]
    stats = _bulk_event_stats(all_event_ids, db)

    sports_data = {}
    all_cards = []

    for t in tournaments:
        card = _build_tournament_card(t, stats)
        if not card["events"]:
            continue
        all_cards.append(card)

        for sport_key in card["sports"]:
            if sport_key not in sports_data:
                sports_data[sport_key] = {
                    "sport_key":        sport_key,
                    "sport_url":        SPORT_KEY_TO_URL.get(sport_key, sport_key),
                    "tournament_count": 0,
                    "live_count":       0,
                    "tournaments":      [],
                }
            sports_data[sport_key]["tournament_count"] += 1
            if card["is_live"]:
                sports_data[sport_key]["live_count"] += 1
            sport_card = _build_tournament_card(t, stats, sport_filter=sport_key)
            if sport_card["events"]:
                sports_data[sport_key]["tournaments"].append(sport_card)

    for sd in sports_data.values():
        sd["tournaments"].sort(key=lambda c: (-int(c["is_live"]), -c["total_matches"]))
        sd["tournaments"] = sd["tournaments"][:6]

    all_cards.sort(key=lambda c: (-int(c["is_live"]), -c["total_matches"]))
    total_live = sum(c["live_count"] for c in all_cards)

    result = {
        "sports":             list(sports_data.values()),
        "trending":           all_cards[:8],
        "total_live_matches": total_live,
    }

    # Store in cache (only for non-search requests)
    if not q:
        _homepage_cache["data"] = result
        _homepage_cache["ts"]   = time.time()

    return result


# ── Sport page ────────────────────────────────────────────────

@router.get("/sport/{sport_url}")
def sport_page_data(
    sport_url: str,
    q: Optional[str] = None,
    city: Optional[str] = None,
    db: Session = Depends(get_db),
):
    sport_key = _sport_key_from_url(sport_url)

    tournament_ids = (
        db.query(distinct(Event.tournament_id))
        .filter(Event.sport_key == sport_key, Event.is_active == True)
        .all()
    )
    t_ids = [tid[0] for tid in tournament_ids]

    if not t_ids:
        return {"sport_key": sport_key, "sport_url": sport_url, "tournaments": [], "cities": []}

    query = (
        db.query(Tournament)
        .filter(Tournament.tournament_id.in_(t_ids), Tournament.is_active == True, Tournament.is_published == True)
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
    )

    if city:
        query = query.filter(Tournament.city.ilike(f"%{city}%"))

    if q:
        query = query.filter(
            or_(
                Tournament.name.ilike(f"%{q}%"),
                Tournament.city.ilike(f"%{q}%"),
                Tournament.venue.ilike(f"%{q}%"),
            )
        )

    tournaments = query.order_by(Tournament.created_at.desc()).all()

    all_event_ids = [e.event_id for t in tournaments for e in t.events if e.is_active]
    stats = _bulk_event_stats(all_event_ids, db)
    cards = [_build_tournament_card(t, stats, sport_filter=sport_key) for t in tournaments]
    cards = [c for c in cards if c["events"]]

    order = {"live": 0, "upcoming": 1, "completed": 2}
    cards.sort(key=lambda c: (order.get(c["status"], 1), -c["total_matches"]))

    cities = sorted(set(t.city for t in tournaments if t.city))

    return {
        "sport_key":  sport_key,
        "sport_url":  sport_url,
        "tournaments": cards,
        "cities":     cities,
    }


# ── All tournaments browse ────────────────────────────────────

@router.get("/tournaments")
def browse_tournaments(
    q:      Optional[str] = None,
    sport:  Optional[str] = None,  # e.g. "table_tennis"
    status: Optional[str] = None,  # live | upcoming | completed
    city:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Browse / explore all public tournaments with optional filtering.
    Used by the /tournaments page on the web frontend.
    """
    query = (
        db.query(Tournament)
        .filter(Tournament.is_active == True, Tournament.is_published == True)
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
        .order_by(Tournament.created_at.desc())
    )

    # If sport filter requested, scope to tournaments that have that sport
    if sport:
        sport_key = SPORT_URL_MAP.get(sport, sport)  # accept both url-slug and key
        t_ids = (
            db.query(distinct(Event.tournament_id))
            .filter(Event.sport_key == sport_key, Event.is_active == True)
            .all()
        )
        t_id_list = [tid[0] for tid in t_ids]
        query = query.filter(Tournament.tournament_id.in_(t_id_list))

    if city:
        query = query.filter(Tournament.city.ilike(f"%{city}%"))

    if q:
        query = query.filter(
            or_(
                Tournament.name.ilike(f"%{q}%"),
                Tournament.city.ilike(f"%{q}%"),
                Tournament.venue.ilike(f"%{q}%"),
            )
        )

    tournaments = query.all()

    all_event_ids = [e.event_id for t in tournaments for e in t.events if e.is_active]
    stats = _bulk_event_stats(all_event_ids, db)

    sport_filter_key = SPORT_URL_MAP.get(sport, sport) if sport else None
    cards = [_build_tournament_card(t, stats, sport_filter=sport_filter_key) for t in tournaments]
    cards = [c for c in cards if c["events"]]

    # Client-side status filter applied here (same pattern as sport page)
    if status:
        cards = [c for c in cards if c["status"] == status]

    order = {"live": 0, "upcoming": 1, "completed": 2}
    cards.sort(key=lambda c: (order.get(c["status"], 1), -c["total_matches"]))

    # Unique cities across all (unfiltered) result set for filter dropdown
    cities = sorted(set(t.city for t in tournaments if t.city))

    return {
        "tournaments": cards,
        "total":       len(cards),
        "cities":      cities,
    }


# ── Tournament detail (all sports) ───────────────────────────

def _build_tournament_page_data(slug: str, db: Session) -> dict:
    """
    Core data-fetching for the tournament page — always reads fresh from DB.
    Adds `sport_key` to every serialized match so mobile clients can pick the
    correct card renderer without looking up the parent event separately.
    Called by the HTTP route handler (which caches the result) and by the WS
    push task (which needs fresh data every time).
    """
    tournament = (
        db.query(Tournament)
        .filter(Tournament.slug == slug)
        .options(
            joinedload(Tournament.sponsors),
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .first()
    )
    if not tournament or not tournament.is_published or not tournament.is_active:
        # Drafts / unpublished tournaments are not public.
        raise HTTPException(status_code=404, detail="Tournament not found")

    active_events = [e for e in tournament.events if e.is_active]
    event_ids = [e.event_id for e in active_events]

    # ── Bulk load: 2 queries for ALL events instead of N×2 ──────────────────
    all_matches = (
        db.query(Match)
        .filter(Match.event_id.in_(event_ids))
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
            joinedload(Match.group),
        )
        .order_by(Match.stage, Match.round, Match.match_id)
        .all()
    ) if event_ids else []

    all_eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id.in_(event_ids))
        .options(
            joinedload(EventParticipant.player),
            joinedload(EventParticipant.team),
            joinedload(EventParticipant.group),
        )
        .all()
    ) if event_ids else []

    # Group in-memory by event_id
    matches_by_event: dict[int, list] = {eid: [] for eid in event_ids}
    for m in all_matches:
        matches_by_event[m.event_id].append(m)

    eps_by_event: dict[int, list] = {eid: [] for eid in event_ids}
    for ep in all_eps:
        eps_by_event[ep.event_id].append(ep)

    # sport_key per match: avoids the mobile needing to look up parent event
    sport_by_event: dict[int, str] = {e.event_id: e.sport_key for e in active_events}

    def _sm(m: Match) -> dict:
        d = _serialize_match(m)
        d["sport_key"] = sport_by_event.get(m.event_id, "")
        return d

    events_data = []
    for event in active_events:
        matches = matches_by_event[event.event_id]
        eps     = eps_by_event[event.event_id]

        participants = []
        for ep in eps:
            if ep.team:
                participants.append({
                    "id":       ep.team.team_id,
                    "name":     ep.team.name,
                    "type":     "team",
                    "logo_url": ep.team.logo_url,
                    "group":    ep.group.name if ep.group else None,
                })
            elif ep.player:
                participants.append({
                    "id":    ep.player.player_id,
                    "name":  ep.player.name,
                    "type":  "player",
                    "group": ep.group.name if ep.group else None,
                })

        events_data.append({
            "event_id":          event.event_id,
            "name":              event.name,
            "sport_key":         event.sport_key,
            "format":            event.format,
            "participant_type":  event.participant_type,
            "is_configured":     event.is_configured,
            "status":            event.status,
            "sport_config":      event.sport_config,
            "team_size":         event.team_size,
            "squad_size":        event.squad_size,
            "total_matches":     len(matches),
            "completed_matches": sum(1 for m in matches if m.status == "done"),
            "live_matches":      [_sm(m) for m in matches if m.status == "live"],
            "all_matches":       [_sm(m) for m in matches],
            "participants":      participants,
        })

    return {
        "tournament": {
            "tournament_id":   tournament.tournament_id,
            "name":            tournament.name,
            "slug":            tournament.slug,
            "description":     tournament.description,
            "status":          tournament.status,
            "registration_open": tournament.registration_open,
            "poster_url":      tournament.poster_url or getattr(tournament, "banner_url", None),
            "logo_url":        tournament.logo_url,
            "primary_color":   tournament.primary_color,
            "secondary_color": tournament.secondary_color,
            "venue":           tournament.venue,
            "city":            tournament.city,
            "state":           tournament.state,
            "venue_lat":       tournament.venue_lat,
            "venue_lng":       tournament.venue_lng,
            "org_name":        tournament.organization.name if tournament.organization else None,
            "sponsors": [
                {
                    "sponsor_id":  s.sponsor_id,
                    "name":        s.name,
                    "logo_url":    s.logo_url,
                    "tier":        s.tier,
                    "website":     s.website,
                    "description": s.description,
                }
                for s in tournament.sponsors
            ],
        },
        "events": events_data,
    }


@router.get("/t/{slug}")
def get_tournament_page(slug: str, db: Session = Depends(get_db)):
    """
    Public tournament page — served from a 5-second per-slug in-memory cache.
    The WS push task always fetches fresh data and writes it back into the cache,
    so HTTP pollers always see data that is at most one WS cycle old (≤5 s).
    """
    cached = _get_t_page_cache(slug)
    if cached is not None:
        return cached
    data = _build_tournament_page_data(slug, db)
    _set_t_page_cache(slug, data)
    return data


# ── Tournament detail (sport-filtered) ───────────────────────

@router.get("/sport/{sport_url}/tournament/{slug}")
def get_tournament_by_sport(
    sport_url: str,
    slug: str,
    db: Session = Depends(get_db),
):
    sport_key = _sport_key_from_url(sport_url)

    tournament = (
        db.query(Tournament)
        .filter(Tournament.slug == slug)
        .options(
            joinedload(Tournament.sponsors),
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .first()
    )
    if not tournament or not tournament.is_published or not tournament.is_active:
        # Drafts / unpublished tournaments are not public.
        raise HTTPException(status_code=404, detail="Tournament not found")

    active_events = [e for e in tournament.events if e.is_active and e.sport_key == sport_key]
    event_ids = [e.event_id for e in active_events]

    # Bulk load matches + participants for all filtered events (2 queries total)
    all_matches = (
        db.query(Match)
        .filter(Match.event_id.in_(event_ids))
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
            joinedload(Match.group),
        )
        .order_by(Match.stage, Match.round, Match.match_id)
        .all()
    ) if event_ids else []

    all_eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id.in_(event_ids))
        .options(
            joinedload(EventParticipant.player),
            joinedload(EventParticipant.team),
            joinedload(EventParticipant.group),
        )
        .all()
    ) if event_ids else []

    matches_by_event: dict[int, list] = {eid: [] for eid in event_ids}
    for m in all_matches:
        matches_by_event[m.event_id].append(m)

    eps_by_event: dict[int, list] = {eid: [] for eid in event_ids}
    for ep in all_eps:
        eps_by_event[ep.event_id].append(ep)

    events_data = []
    for event in active_events:
        matches = matches_by_event[event.event_id]
        eps     = eps_by_event[event.event_id]

        participants = []
        for ep in eps:
            if ep.team:
                participants.append({
                    "id": ep.team.team_id, "name": ep.team.name,
                    "type": "team", "logo_url": ep.team.logo_url,
                    "group": ep.group.name if ep.group else None,
                })
            elif ep.player:
                participants.append({
                    "id": ep.player.player_id, "name": ep.player.name,
                    "type": "player",
                    "group": ep.group.name if ep.group else None,
                })

        def _sm_sport(m: Match) -> dict:
            d = _serialize_match(m)
            d["sport_key"] = event.sport_key
            return d

        events_data.append({
            "event_id":          event.event_id,
            "name":              event.name,
            "sport_key":         event.sport_key,
            "format":            event.format,
            "participant_type":  event.participant_type,
            "is_configured":     event.is_configured,
            "status":            event.status,
            "sport_config":      event.sport_config,
            "team_size":         event.team_size,
            "squad_size":        event.squad_size,
            "total_matches":     len(matches),
            "completed_matches": sum(1 for m in matches if m.status == "done"),
            "live_matches":      [_sm_sport(m) for m in matches if m.status == "live"],
            "all_matches":       [_sm_sport(m) for m in matches],
            "participants":      participants,
        })

    return {
        "tournament": {
            "tournament_id": tournament.tournament_id,
            "name":          tournament.name,
            "slug":          tournament.slug,
            "description":   tournament.description,
            "status":        tournament.status,
            "registration_open": tournament.registration_open,
            "poster_url":    tournament.poster_url,
            "primary_color": tournament.primary_color,
            "venue":         tournament.venue,
            "city":          tournament.city,
            "state":         tournament.state,
            "venue_lat":       tournament.venue_lat,
            "venue_lng":       tournament.venue_lng,
            "org_name":        tournament.organization.name if tournament.organization else None,
            "sponsors": [
                {
                    "sponsor_id":  s.sponsor_id,
                    "name":        s.name,
                    "logo_url":    s.logo_url,
                    "tier":        s.tier,
                    "website":     s.website,
                    "description": s.description,
                }
                for s in tournament.sponsors
            ],
        },
        "sport_key": sport_key,
        "sport_url": sport_url,
        "events":    events_data,
    }


# ── Search ────────────────────────────────────────────────────

@router.get("/search")
def search(q: str, db: Session = Depends(get_db)):
    if not q or len(q) < 2:
        return {"results": []}

    tournaments = (
        db.query(Tournament)
        .filter(
            Tournament.is_active == True, Tournament.is_published == True,
            or_(
                Tournament.name.ilike(f"%{q}%"),
                Tournament.city.ilike(f"%{q}%"),
                Tournament.venue.ilike(f"%{q}%"),
            ),
        )
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
        .limit(10)
        .all()
    )

    # Single bulk stats query across ALL results (was N×3 queries — one
    # _bulk_event_stats call per tournament via _tournament_summary).
    all_event_ids = [e.event_id for t in tournaments for e in t.events if e.is_active]
    stats = _bulk_event_stats(all_event_ids, db)
    return {"results": [_build_tournament_card(t, stats) for t in tournaments]}


# ── Public registration ───────────────────────────────────────

@router.post("/tournaments/{tournament_id}/register",
             dependencies=[Depends(public_registration_limiter)])
def public_register(
    tournament_id: int,
    data: PublicRegistration,
    db: Session = Depends(get_db),
):
    """Public registration — no auth required. Creates player + enrolls in events."""
    tournament = db.query(Tournament).filter(
        Tournament.tournament_id == tournament_id,
        Tournament.is_active == True, Tournament.is_published == True,
    ).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not tournament.registration_open:
        raise HTTPException(
            status_code=400,
            detail="This tournament is not currently accepting registrations",
        )

    # Look up existing player by phone within this org only.
    # We scope to org_id to avoid matching a phone that belongs to a different org's player.
    player = None
    if data.phone:
        player = db.query(Player).filter(
            Player.phone == data.phone.strip(),
            Player.org_id == tournament.org_id,
        ).first()

    if not player:
        player = Player(
            name=data.name.strip(),
            phone=data.phone.strip() if data.phone else None,
            age=data.age,
            gender=data.gender,
            org_id=tournament.org_id,
        )
        db.add(player)
        db.flush()

    # Resolve target events — require explicit selection (no silent enroll-all)
    if not data.event_ids:
        raise HTTPException(status_code=400, detail="Please select at least one event to register for.")
    target_events = db.query(Event).filter(
        Event.tournament_id == tournament_id,
        Event.event_id.in_(data.event_ids),
        Event.is_active == True,
    ).all()
    target_events = [e for e in target_events if not entries_locked(e, db)]
    if not target_events:
        raise HTTPException(status_code=400, detail="Entries are closed for the selected event(s).")

    enrolled = []
    for event in target_events:
        already = db.query(EventParticipant).filter(
            EventParticipant.event_id == event.event_id,
            EventParticipant.player_id == player.player_id,
        ).first()
        if already:
            continue
        db.add(EventParticipant(
            event_id=event.event_id,
            player_id=player.player_id,
            group_id=None,
            seed=None,
        ))
        enrolled.append(event.event_id)

    db.commit()

    return {
        "ok":             True,
        "player_id":      player.player_id,
        "name":           player.name,
        "enrolled_events":enrolled,
        "message":        f"Successfully registered for {tournament.name}",
    }

