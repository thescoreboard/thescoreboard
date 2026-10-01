"""
Match routes — create, score, and manage matches.
Scoring is delegated to the sport engine based on event.sport_key.
Supports: table_tennis, badminton (set-based), cricket (innings), football (goals).
"""
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Optional, Union
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.user import User
from app.models.event import Event
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.organization import OrgMember
from app.models.player import Player, Team
from app.models.tournament import Tournament
from app.schemas.match import MatchCreate, MatchOut, MatchStatusUpdate
from app.utils.auth import get_current_user, get_current_user_id
from app.utils.tournament_access import ensure_role
from app.utils.match_rules import requires_winner
from app.sports.registry import get_sport_engine

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class ScoreUpdate(BaseModel):
    score_p1: int = Field(..., ge=0, le=9999)
    score_p2: int = Field(..., ge=0, le=9999)
    current_server: Optional[int] = None

    # Cricket ball-by-ball
    overs:              Optional[str]  = None
    minute:             Optional[int]  = None   # balls bowled (legal deliveries) for cricket
    half:               Optional[int]  = None   # innings number for cricket (1, 2, 3 for super over)
    cricket_live_state: Optional[dict] = None

    # Football
    football_minute:     Optional[int]  = None
    football_half:       Optional[int]  = None
    football_pen_1:      Optional[int]  = None   # penalty goals team 1
    football_pen_2:      Optional[int]  = None   # penalty goals team 2
    football_live_state: Optional[dict] = None   # arbitrary live_state merge (pen_h1, pen_h2)


class FinishMatch(BaseModel):
    """Explicitly finish a match (football full-time, cricket innings complete)."""
    winner_position:          Optional[Union[int, str]] = None  # 1, 2, None for draw, "super_over" for cricket
    super_over_batting_first: Optional[int]             = None  # 1 or 2 — who bats first in super over


# ── Helpers ───────────────────────────────────────────────────

def _load_match(match_id: int, db: Session) -> Match:
    """
    Load a match with all related data in a single query.
    Eagerly loads Event so callers can access match.event without a second
    round-trip to the database (eliminates the separate db.query(Event) call).
    """
    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(
            joinedload(Match.event),                                        # ← no separate Event query needed
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
        )
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


def _check_event_access(event: Event, user: User, db: Session) -> None:
    """
    Only people with access to the owning tournament (org members, tournament
    members, or superadmins) may modify matches. Every mutating match endpoint
    must call this — a valid JWT alone is NOT enough (any registered player
    would qualify otherwise). Scoring is staff-level.
    """
    t = db.query(Tournament).filter(
        Tournament.tournament_id == event.tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_role(t, user, db)


def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []

    def _name(p):
        if not p:
            return "TBD"
        if p.player:
            return p.player.name
        if p.team:
            return p.team.name
        return "TBD"

    return {
        "match_id":       m.match_id,
        "event_id":       m.event_id,
        "group_id":       m.group_id,
        "stage":          m.stage,
        "requires_winner": requires_winner(m.stage),
        "round":          m.round,
        "status":         m.status,
        "table_number":   m.table_number,
        "current_server": m.current_server,
        "live_state":     m.live_state,
        "started_at":     str(m.started_at)  if m.started_at  else None,
        "finished_at":    str(m.finished_at) if m.finished_at else None,
        "player_1": {
            "player_id": p1.player_id if p1 else None,
            "team_id":   p1.team_id   if p1 else None,
            "name":      _name(p1),
            "score":     p1.score     if p1 else 0,
            "is_winner": p1.is_winner if p1 else False,
        },
        "player_2": {
            "player_id": p2.player_id if p2 else None,
            "team_id":   p2.team_id   if p2 else None,
            "name":      _name(p2),
            "score":     p2.score     if p2 else 0,
            "is_winner": p2.is_winner if p2 else False,
        },
        "sets": [
            {
                "set_number":  s.set_number,
                "score_p1":    s.score_p1,
                "score_p2":    s.score_p2,
                "winner":      s.winner_position,
                "is_complete": s.is_complete,
            }
            for s in sets
        ],
    }


def _place_in_match(
    target: Match,
    participant_id: int,
    position: int,
    is_team: bool,
    db: Session,
) -> None:
    """Insert a participant into a specific bracket slot if it is still empty."""
    already = db.query(MatchParticipant).filter(
        MatchParticipant.match_id == target.match_id,
        MatchParticipant.position == position,
    ).first()
    if already:
        return
    if is_team:
        db.add(MatchParticipant(match_id=target.match_id, team_id=participant_id, position=position))
    else:
        db.add(MatchParticipant(match_id=target.match_id, player_id=participant_id, position=position))


# Canonical stage ordering. Advancement is keyed off STAGE, not the round
# column: manually-created matches all carry round=1, so grouping by round
# would strand their winners ("knockout" is a legacy alias for round_of_16).
_STAGE_SEQ = {
    "preliminary": 0, "round_of_32": 1, "round_of_16": 2, "knockout": 2,
    "quarter": 3, "semi": 4, "final": 5,
}


def _stage_key(m: Match) -> int:
    return _STAGE_SEQ.get(m.stage, 0)


def _bracket_stages(match: Match, db: Session) -> Optional[dict]:
    """
    Load this match's bracket (same group scope, non-terminal stages) grouped
    by canonical stage order. Returns None when the event has no bracket.
    """
    event = match.event if match.event is not None else (
        db.query(Event).filter(Event.event_id == match.event_id).first()
    )
    if not event or event.format not in ("direct_knockout", "group_knockout"):
        return None

    q = db.query(Match).filter(
        Match.event_id == match.event_id,
        Match.stage.notin_(["third_place", "group"]),
    )
    if match.group_id is not None:
        q = q.filter(Match.group_id == match.group_id)
    else:
        q = q.filter(Match.group_id == None)  # noqa: E711
    bracket_matches = (
        q.options(joinedload(Match.participants), joinedload(Match.sets))
        .order_by(Match.round, Match.match_id)
        .all()
    )

    by_stage: dict = defaultdict(list)
    for m in bracket_matches:
        by_stage[_stage_key(m)].append(m)
    return by_stage


def _next_slot(match: Match, by_stage: dict):
    """
    Return (next_match, position, match_k): the slot this match's winner feeds
    into. next_match is None for terminal/unmapped matches. match_k is the
    match's index within its own stage (used for 3rd-place slot assignment).

    Bracket position mapping
    ─────────────────────────
    For stages after the first:  match k → next-stage match k//2, position k%2+1
    For the first stage (byes possible):
        bye_count = 2*|next_stage| - |current_stage|
        match k → next-stage match (bye_count+k)//2, position (bye_count+k)%2+1
    """
    keys = sorted(by_stage.keys())
    cur  = _stage_key(match)
    if cur not in keys:
        return None, None, 0
    cur_matches = by_stage[cur]
    match_k = next(
        (i for i, m in enumerate(cur_matches) if m.match_id == match.match_id), None)
    if match_k is None:
        return None, None, 0
    idx = keys.index(cur)
    if idx + 1 >= len(keys):
        return None, None, match_k
    next_matches = by_stage[keys[idx + 1]]
    # First stage may have byes; offset so its winners land after bye players.
    bye_count = (2 * len(next_matches) - len(cur_matches)) if idx == 0 else 0
    next_k = (bye_count + match_k) // 2
    pos    = (bye_count + match_k) % 2 + 1
    if next_k >= len(next_matches):
        return None, None, match_k
    return next_matches[next_k], pos, match_k


def _find_third_place(match: Match, db: Session) -> Optional[Match]:
    tq = db.query(Match).filter(
        Match.event_id == match.event_id, Match.stage == "third_place"
    )
    if match.group_id is not None:
        tq = tq.filter(Match.group_id == match.group_id)
    else:
        tq = tq.filter(Match.group_id == None)  # noqa: E711
    return tq.first()


def _advance_winner(match: Match, winner_position: Optional[int], db: Session) -> None:
    """
    After a knockout match finishes, propagate the winner into the correct
    slot of the next-stage match (and the loser into the third-place match
    when the stage is 'semi').
    """
    # Terminal stages never propagate; "group" stage = round-robin rows, also skip
    if not winner_position or match.stage in ("third_place", "final", "group"):
        return

    by_stage = _bracket_stages(match, db)
    if by_stage is None:
        return

    winner_mp = next((p for p in match.participants if p.position == winner_position), None)
    loser_mp  = next((p for p in match.participants if p.position != winner_position), None)
    if not winner_mp:
        return

    winner_id = winner_mp.player_id or winner_mp.team_id
    is_team   = winner_mp.team_id is not None

    next_match, pos, match_k = _next_slot(match, by_stage)
    if next_match is not None:
        _place_in_match(next_match, winner_id, pos, is_team, db)

    # ── Advance loser to third-place match (semi-finals only) ─
    if match.stage == "semi" and loser_mp:
        loser_id = loser_mp.player_id or loser_mp.team_id
        if loser_id:
            third = _find_third_place(match, db)
            if third:
                _place_in_match(third, loser_id, match_k + 1, is_team, db)


def _retract_advancement(match: Match, db: Session) -> None:
    """
    Before re-running a finished match (rematch / undo across a set boundary),
    pull its winner — and for semis, the loser placed in the 3rd-place match —
    back OUT of the downstream slots. Raises 409 when the downstream match has
    already started: re-running would silently corrupt the bracket otherwise.
    """
    if match.status != "done":
        return

    # A completed group final feeds the championship via generate-knockout —
    # re-running it after the championship exists would desync the bracket.
    if match.group_id is not None and match.stage == "final":
        championship = db.query(Match).filter(
            Match.event_id == match.event_id,
            Match.group_id == None,  # noqa: E711
        ).count()
        if championship:
            raise HTTPException(
                status_code=409,
                detail="The championship bracket was already generated from this "
                       "group's result. Regenerate the championship after changing "
                       "this match.",
            )
        return

    if match.stage in ("third_place", "final", "group", "round_robin"):
        return

    by_stage = _bracket_stages(match, db)
    if by_stage is None:
        return

    winner_mp = next((p for p in match.participants if p.is_winner), None)
    if not winner_mp:
        return
    winner_id = winner_mp.player_id or winner_mp.team_id
    loser_mp  = next((p for p in match.participants if not p.is_winner), None)

    def _pull(target: Optional[Match], participant_id) -> None:
        if target is None or participant_id is None:
            return
        # Query rows directly — target's already-loaded collections may not
        # include participants placed via db.add() earlier in this session.
        placed = next(
            (p for p in db.query(MatchParticipant)
                          .filter(MatchParticipant.match_id == target.match_id)
                          .all()
             if (p.player_id or p.team_id) == participant_id),
            None,
        )
        if not placed:
            return
        target_started = target.status != "scheduled" or any(
            (s.score_p1 or s.score_p2)
            for s in db.query(MatchSet).filter(MatchSet.match_id == target.match_id).all()
        )
        if target_started:
            raise HTTPException(
                status_code=409,
                detail="Cannot re-run this match: its result already feeds a match "
                       "that has started. Reset that match first.",
            )
        db.delete(placed)
        if placed in target.participants:
            target.participants.remove(placed)

    next_match, _pos, _match_k = _next_slot(match, by_stage)
    _pull(next_match, winner_id)
    if match.stage == "semi" and loser_mp:
        _pull(_find_third_place(match, db), loser_mp.player_id or loser_mp.team_id)


def _finish_match(match: Match, winner_position: Optional[int], db: Optional[Session] = None):
    match.status      = "done"
    match.finished_at = datetime.now(timezone.utc)
    for p in match.participants:
        p.is_winner = (p.position == winner_position) if winner_position else False
    if db is not None:
        _advance_winner(match, winner_position, db)


# ── WebSocket push helper ─────────────────────────────────────

# Debounce state: track the last push timestamp per tournament slug
# so that rapid score updates (e.g. cricket ball-by-ball) only trigger
# one full tournament-page rebuild per debounce window.
_ws_last_push: dict = {}
_ws_trailing: set = set()      # slugs with a trailing push already waiting
_ws_push_lock  = threading.Lock()
_WS_DEBOUNCE_SECS = 0.3


def _debounce_ws_push(slug: str) -> bool:
    """
    Rate-limit tournament-page rebuilds to one per _WS_DEBOUNCE_SECS per slug
    WITHOUT dropping the trailing update: a call landing inside the window
    waits out the remainder and then proceeds. (The old behaviour returned
    early, so the LAST update of a burst — e.g. the winning point — could
    stay invisible to WS clients until the next score change.)

    Returns True when the caller should build + push, False when another
    waiting call already covers this update.
    """
    now = time.monotonic()
    with _ws_push_lock:
        wait = _WS_DEBOUNCE_SECS - (now - _ws_last_push.get(slug, 0.0))
        if wait <= 0:
            _ws_last_push[slug] = now
            return True
        if slug in _ws_trailing:
            return False           # a trailing push is already scheduled
        _ws_trailing.add(slug)
    time.sleep(wait)               # we're on a background-task thread
    with _ws_push_lock:
        _ws_trailing.discard(slug)
        _ws_last_push[slug] = time.monotonic()
    return True


def _push_ws_update(event_id: int) -> None:
    """
    Background task — called after any score-changing commit.
    Opens a fresh DB session, builds the tournament payload, and pushes
    it to all WS clients currently watching that tournament.
    Also updates the HTTP page cache so polling clients immediately see
    fresh data without waiting for the next cache TTL expiry.
    Debounced: skips the rebuild if the same slug was pushed < 300 ms ago.
    """
    from app.database import SessionLocal
    from app.models.event import Event as _Event
    from app.ws.manager import manager
    from app.routers.public import _build_tournament_page_data, _set_t_page_cache
    from app.routers.tournaments import invalidate_standings_cache
    from sqlalchemy.orm import joinedload as _jl

    # Scores changed → cached standings for this event are stale. Do this
    # before any early return (debounce / no watchers) so polling clients
    # get fresh standings even when nobody is on the WebSocket.
    invalidate_standings_cache(event_id)

    db = SessionLocal()
    try:
        event = (
            db.query(_Event)
            .filter(_Event.event_id == event_id)
            .options(_jl(_Event.tournament))
            .first()
        )
        if not event or not event.tournament:
            return
        slug = event.tournament.slug
        if not manager.has_watchers(slug):
            return

        # Debounce with a guaranteed trailing push — never drops the last update
        if not _debounce_ws_push(slug):
            return

        # Build fresh data (bypasses HTTP cache) and push to WS clients.
        # Also warm the HTTP cache so polling clients get the new data immediately.
        data = _build_tournament_page_data(slug, db)
        _set_t_page_cache(slug, data)
        manager.push(slug, data)
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("WS push failed: %s", exc)
    finally:
        db.close()


# ── Routes ────────────────────────────────────────────────────

@router.get("/matches/{match_id}")
def get_match(
    match_id: int,
    db: Session = Depends(get_db),
    _uid: int = Depends(get_current_user_id),
):
    """
    Single-match fetch for the scorer screen.
    Returns the match data + the event's sport_config so the scorer doesn't
    have to load the entire workspace just to get one match.
    """
    match = _load_match(match_id, db)      # joinedloads participants + sets + event
    data  = _serialize_match(match)
    data["sport_config"] = match.event.sport_config
    data["sport_key"]    = match.event.sport_key
    data["event_id"]     = match.event_id
    return data


@router.get("/events/{event_id}/matches")
def get_matches(
    event_id: int,
    db: Session = Depends(get_db),
    _uid: int = Depends(get_current_user_id),
):
    matches = (
        db.query(Match)
        .filter(Match.event_id == event_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
        )
        .order_by(Match.stage, Match.round, Match.match_id)
        .all()
    )
    return [_serialize_match(m) for m in matches]


@router.post("/events/{event_id}/matches")
def create_match(
    event_id: int,
    data: MatchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _check_event_access(event, user, db)

    engine    = get_sport_engine(event.sport_key)
    use_teams = event.participant_type in ("team", "doubles_pair")

    # Resolve participant IDs (partial allowed — e.g. bye player in one slot)
    if use_teams:
        t1_id, t2_id = data.team1_id, data.team2_id
        p1_id = p2_id = None
        if t1_id and t2_id and t1_id == t2_id:
            raise HTTPException(status_code=400, detail="A team cannot play themselves")
        for tid in [t for t in [t1_id, t2_id] if t]:
            if not db.query(Team).filter(Team.team_id == tid).first():
                raise HTTPException(status_code=404, detail=f"Team {tid} not found")
    else:
        p1_id, p2_id = data.player1_id, data.player2_id
        t1_id = t2_id = None
        if p1_id and p2_id and p1_id == p2_id:
            raise HTTPException(status_code=400, detail="A player cannot play themselves")
        for pid in [p for p in [p1_id, p2_id] if p]:
            if not db.query(Player).filter(Player.player_id == pid).first():
                raise HTTPException(status_code=404, detail=f"Player {pid} not found")

    # Initialise live_state with sets_to_win so the scoring endpoint always
    # finds a configured value (mirrors what generate_fixtures does).
    default_stw = (event.sport_config or engine.get_default_config()).get("sets_to_win", 2)

    match = Match(
        event_id=event_id,
        group_id=data.group_id,
        round=data.round,
        stage=data.stage,
        status="scheduled",
        table_number=data.table_number,
        live_state={"sets_to_win": default_stw},
    )
    db.add(match)
    db.flush()

    # Add participants for every non-null slot (supports TBD matches and
    # half-filled matches where one side is a bye player).
    if use_teams:
        if t1_id:
            db.add(MatchParticipant(match_id=match.match_id, team_id=t1_id, position=1))
        if t2_id:
            db.add(MatchParticipant(match_id=match.match_id, team_id=t2_id, position=2))
    else:
        if p1_id:
            db.add(MatchParticipant(match_id=match.match_id, player_id=p1_id, position=1))
        if p2_id:
            db.add(MatchParticipant(match_id=match.match_id, player_id=p2_id, position=2))

    # Create the initial set for set-based sports (TT, Badminton).
    # Use the same detection as generate_fixtures: check_set_winner presence.
    if hasattr(engine, "check_set_winner"):
        db.add(MatchSet(match_id=match.match_id, set_number=1))

    db.commit()
    return _serialize_match(_load_match(match.match_id, db))


@router.patch("/matches/{match_id}/status")
def update_match_status(
    match_id: int,
    data: MatchStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    _check_event_access(match.event, user, db)
    if data.status not in ("scheduled", "live"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'scheduled' or 'live' - matches are completed via finish / walkover / scoring",
        )
    if match.status == "done":
        raise HTTPException(status_code=409, detail="This match is finished. Use Rematch to change its result.")
    if data.status == "live" and len(match.participants) < 2:
        raise HTTPException(
            status_code=400,
            detail="Both participants must be assigned before the match can go live",
        )
    event_id = match.event_id
    match.status = data.status
    if data.table_number is not None:
        match.table_number = data.table_number
    if data.sets_to_win is not None:
        allowed = getattr(get_sport_engine(match.event.sport_key), "valid_sets_to_win", None)
        if allowed is None or data.sets_to_win not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"sets_to_win must be one of {list(allowed) if allowed else 'n/a for this sport'}",
            )
        ls = dict(match.live_state or {})
        ls["sets_to_win"] = data.sets_to_win
        match.live_state = ls
    if data.status == "live" and not match.started_at:
        match.started_at = datetime.now(timezone.utc)
    elif data.status == "done" and not match.finished_at:
        match.finished_at = datetime.now(timezone.utc)
    # Serialize from the in-memory object (avoids a second SELECT after commit)
    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.patch("/matches/{match_id}/score")
def update_score(
    match_id: int,
    data: ScoreUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match    = _load_match(match_id, db)   # includes match.event via joinedload
    _check_event_access(match.event, user, db)
    if len(match.participants) < 2:
        raise HTTPException(
            status_code=400,
            detail="Both participants must be assigned before this match can be scored",
        )
    if match.status == "done":
        raise HTTPException(status_code=409, detail="This match is finished. Use Rematch to change its result.")
    event_id = match.event_id
    event    = match.event                 # no extra DB query — already loaded
    engine   = get_sport_engine(event.sport_key)
    config = dict(event.sport_config or engine.get_default_config())
    # Per-match sets_to_win overrides event-wide default (set during fixture generation)
    if match.live_state and "sets_to_win" in match.live_state:
        config["sets_to_win"] = match.live_state["sets_to_win"]

    sport = event.sport_key

    try:
        engine.validate_score(
            data.score_p1, data.score_p2, config,
            innings=data.half, balls=data.minute, live_state=match.live_state,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ── TABLE TENNIS & BADMINTON (set-based) ──────
    if sport in ("table_tennis", "badminton"):
        if data.current_server is not None:
            match.current_server = data.current_server

        current_set = next(
            (s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete),
            None
        )
        if not current_set:
            if match.status == "done":
                raise HTTPException(status_code=400, detail="No active set — match may be over")
            # No active set but match is still live/scheduled — initial set was never created
            # (e.g. fixture generated before this fix, or rematch edge case). Create it now.
            next_num = max((s.set_number for s in match.sets), default=0) + 1
            current_set = MatchSet(match_id=match.match_id, set_number=next_num)
            db.add(current_set)
            db.flush()

        current_set.score_p1 = data.score_p1
        current_set.score_p2 = data.score_p2

        # A set can be won either by reaching the normal point target (e.g. 11)
        # or by the 7-0 early-win rule.  Both are treated identically: the SET
        # is marked complete and we check whether enough sets have been won to
        # decide the match.  The 7-0 rule NEVER ends the match on its own.
        set_winner = engine.check_set_winner(data.score_p1, data.score_p2, config)
        if not set_winner and hasattr(engine, "check_instant_win"):
            set_winner = engine.check_instant_win(data.score_p1, data.score_p2, config)

        if set_winner:
            current_set.is_complete     = True
            current_set.winner_position = set_winner
            sets_won = {1: 0, 2: 0}
            for s in match.sets:
                if s.is_complete and s.winner_position:
                    sets_won[s.winner_position] += 1
            match_winner = engine.check_match_winner(sets_won[1], sets_won[2], config)
            if match_winner:
                _finish_match(match, match_winner, db)
            else:
                next_num = max(s.set_number for s in match.sets) + 1
                new_set  = MatchSet(match_id=match.match_id, set_number=next_num)
                db.add(new_set)
                db.flush()                    # assign set_id
                match.sets.append(new_set)    # keep in-memory list in sync so _serialize_match sees it

        # Update aggregate scores (sets won)
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            sets_won = {1: 0, 2: 0}
            for s in match.sets:
                if s.is_complete and s.winner_position:
                    sets_won[s.winner_position] += 1
            parts[0].score = sets_won[1]
            parts[1].score = sets_won[2]

    # ── CRICKET (ball-by-ball) ────────────────────────────────
    elif sport == "cricket":
        innings = data.half or 1
        balls   = data.minute or 0

        # Get or create the set for this innings
        target_set = next(
            (s for s in sorted(match.sets, key=lambda x: x.set_number) if s.set_number == innings),
            None
        )
        if not target_set:
            target_set = MatchSet(match_id=match.match_id, set_number=innings)
            db.add(target_set)
            db.flush()

        target_set.score_p1 = data.score_p1  # runs
        target_set.score_p2 = data.score_p2  # wickets

        # Update live_state
        ls = dict(match.live_state or {})
        ls["current_innings"] = innings
        ls["runs"]    = data.score_p1
        ls["wickets"] = data.score_p2
        ls["balls"]   = balls
        if data.overs:
            ls["overs"] = data.overs
        if data.cricket_live_state:
            ls.update(data.cricket_live_state)
        match.live_state = ls
        flag_modified(match, "live_state")

        # Update participant aggregate scores based on who batted in each innings
        batting_first = ls.get("batting_first", 1)
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            inn1 = next((s for s in match.sets if s.set_number == 1), None)
            inn2 = next((s for s in match.sets if s.set_number == 2), None)
            if batting_first == 1:
                # pos 1 batted in inn1, pos 2 batted in inn2
                parts[0].score = inn1.score_p1 if inn1 else 0
                parts[1].score = inn2.score_p1 if inn2 else 0
            else:
                # pos 2 batted in inn1, pos 1 batted in inn2
                parts[1].score = inn1.score_p1 if inn1 else 0
                parts[0].score = inn2.score_p1 if inn2 else 0

    # ── FOOTBALL (goals) ──────────────────────────────────────
    elif sport == "football":
        all_sets = sorted(match.sets, key=lambda x: x.set_number)
        current_set = next((s for s in all_sets if not s.is_complete), None)
        if not current_set:
            if all_sets:
                # All sets are marked complete (e.g. after finish_match was called).
                # Reuse the last set so we don't violate the uq_match_set constraint.
                current_set = all_sets[-1]
                current_set.is_complete = False
            else:
                new_set = MatchSet(match_id=match.match_id, set_number=1)
                db.add(new_set)
                db.flush()           # assigns set_id, no full reload needed
                current_set = new_set

        current_set.score_p1 = data.score_p1
        current_set.score_p2 = data.score_p2

        live_state = dict(match.live_state or {})
        if data.football_minute is not None:
            live_state["minute"] = data.football_minute
        if data.football_half is not None:
            live_state["half"] = data.football_half
        if data.football_pen_1 is not None:
            live_state["pen_goals_1"] = data.football_pen_1
        if data.football_pen_2 is not None:
            live_state["pen_goals_2"] = data.football_pen_2
        if data.football_live_state:
            live_state.update(data.football_live_state)
        match.live_state = live_state
        flag_modified(match, "live_state")

        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            parts[0].score = data.score_p1
            parts[1].score = data.score_p2

    # Flush writes to DB but keeps objects live in the session so we can
    # serialize them without a second SELECT.  Commit happens after serialization.
    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.post("/matches/{match_id}/finish")
def finish_match(
    match_id: int,
    data: FinishMatch,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Explicitly finish a match — used for football (full time) and
    cricket (all out / overs up / innings end).
    """
    match    = _load_match(match_id, db)   # includes match.event via joinedload
    _check_event_access(match.event, user, db)
    if len(match.participants) < 2:
        raise HTTPException(
            status_code=400,
            detail="Both participants must be assigned before this match can be finished",
        )
    if match.status == "done":
        raise HTTPException(status_code=409, detail="This match is finished. Use Rematch to change its result.")
    event_id = match.event_id
    event    = match.event                 # no extra DB query
    engine   = get_sport_engine(event.sport_key)
    config   = event.sport_config or engine.get_default_config()

    current_set = next(
        (s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete),
        None
    )

    # ── CRICKET ──────────────────────────────────────────────
    if event.sport_key == "cricket":
        ls = dict(match.live_state or {})

        # Super over requested
        if data.winner_position == "super_over":
            if current_set:
                current_set.is_complete = True
            so_num = len(match.sets) + 1
            db.add(MatchSet(match_id=match.match_id, set_number=so_num))
            ls["is_super_over"]   = True
            ls["current_innings"] = so_num
            ls["runs"]    = 0
            ls["wickets"] = 0
            ls["balls"]   = 0
            ls["ball_log"] = []
            if data.super_over_batting_first:
                ls["super_over_batting_first"] = data.super_over_batting_first
            match.live_state = ls
            db.flush()
            result = _serialize_match(match)
            db.commit()
            background_tasks.add_task(_push_ws_update, event_id)
            return result

        # Normal innings end
        if current_set:
            current_set.is_complete = True

        # Explicit winner override (e.g. coin-toss decision after tied super over)
        if isinstance(data.winner_position, int) and data.winner_position in (1, 2):
            _finish_match(match, data.winner_position, db)
            db.flush()
            result = _serialize_match(match)
            db.commit()
            background_tasks.add_task(_push_ws_update, event_id)
            return result

        all_sets  = sorted(match.sets, key=lambda s: s.set_number)
        completed = [s for s in all_sets if s.is_complete]
        n         = len(completed)
        batting_first = ls.get("batting_first", 1)

        if n > 0 and n % 2 == 0:
            # Even number of completed innings — compare the last pair to decide winner.
            # Odd innings = batting_first team, even innings = other team.
            last1 = completed[-2]  # second-to-last (batting_first team's most recent innings)
            last2 = completed[-1]  # last (other team's most recent innings)

            inn1_runs = last1.score_p1
            inn2_runs = last2.score_p1

            # Who batted in last1? odd set_number → batting_first, even → other
            first_of_pair_pos = batting_first if (last1.set_number % 2 == 1) else (3 - batting_first)

            if inn1_runs > inn2_runs:
                winner = first_of_pair_pos
            elif inn2_runs > inn1_runs:
                winner = 3 - first_of_pair_pos
            else:
                winner = None  # still tied
            if winner is None and requires_winner(match.stage):
                raise HTTPException(
                    status_code=400,
                    detail="A knockout match cannot end tied — play a super over (or pick a winner).",
                )
            _finish_match(match, winner, db)

        elif n % 2 == 1:
            # Odd number of completed innings — set up next innings
            next_num = n + 1
            ls["current_innings"] = next_num
            ls["runs"]    = 0
            ls["wickets"] = 0
            ls["balls"]   = 0
            ls["ball_log"] = []
            match.live_state = ls
            db.add(MatchSet(match_id=match.match_id, set_number=next_num))

    # ── FOOTBALL ─────────────────────────────────────────────
    elif event.sport_key == "football":
        if isinstance(data.winner_position, int):
            winner = data.winner_position
        elif match.sets:
            s      = match.sets[0]
            winner = engine.check_match_winner(s.score_p1, s.score_p2, config)
        else:
            winner = None

        if winner is None and requires_winner(match.stage):
            raise HTTPException(
                status_code=400,
                detail="A knockout match cannot end in a draw — settle it with extra time or penalties.",
            )

        if current_set:
            current_set.is_complete     = True
            current_set.winner_position = data.winner_position if isinstance(data.winner_position, int) else None
        _finish_match(match, winner, db)

    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.post("/matches/{match_id}/walkover")
def walkover_match(
    match_id: int,
    winner_position: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Record a walkover / no-show.
    The winner receives pts-0 in every required set and is immediately declared
    match winner.  Winner advances in the bracket exactly as after a normal win.
    """
    match = _load_match(match_id, db)
    _check_event_access(match.event, user, db)
    if match.status == "done":
        raise HTTPException(status_code=400, detail="Match is already done")
    if winner_position not in (1, 2):
        raise HTTPException(status_code=400, detail="winner_position must be 1 or 2")
    if len(match.participants) < 2:
        raise HTTPException(
            status_code=400,
            detail="Both participants must be assigned before recording a walkover",
        )

    event_id = match.event_id
    event  = match.event                   # already joinedloaded by _load_match
    engine = get_sport_engine(event.sport_key)
    config = dict(event.sport_config or engine.get_default_config())
    if match.live_state and "sets_to_win" in match.live_state:
        config["sets_to_win"] = match.live_state["sets_to_win"]

    sets_to_win = config.get("sets_to_win", 2)
    pts         = config.get("points_per_set", 11)

    # Wipe any existing sets
    for s in list(match.sets):
        db.delete(s)
    db.flush()

    parts = sorted(match.participants, key=lambda p: p.position)

    if hasattr(engine, "check_set_winner"):
        # Set-based sports (TT, Badminton): create N walkover sets, winner gets pts-0 each
        for i in range(1, sets_to_win + 1):
            db.add(MatchSet(
                match_id        = match.match_id,
                set_number      = i,
                score_p1        = pts if winner_position == 1 else 0,
                score_p2        = pts if winner_position == 2 else 0,
                is_complete     = True,
                winner_position = winner_position,
            ))
        if len(parts) == 2:
            parts[0].score = sets_to_win if winner_position == 1 else 0
            parts[1].score = sets_to_win if winner_position == 2 else 0
    else:
        # Non-set sports (Football, Cricket): single result row, 1–0 walkover
        db.add(MatchSet(
            match_id        = match.match_id,
            set_number      = 1,
            score_p1        = 1 if winner_position == 1 else 0,
            score_p2        = 1 if winner_position == 2 else 0,
            is_complete     = True,
            winner_position = winner_position,
        ))
        if len(parts) == 2:
            parts[0].score = 1 if winner_position == 1 else 0
            parts[1].score = 1 if winner_position == 2 else 0

    # Stamp started_at if match hadn't been started yet
    if not match.started_at:
        match.started_at = datetime.now(timezone.utc)

    # Flag in live_state so UI can display "Walkover" badge
    ls = dict(match.live_state or {})
    ls["walkover"]        = True
    ls["walkover_winner"] = winner_position
    match.live_state = ls

    _finish_match(match, winner_position, db)
    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.post("/matches/{match_id}/undo-set")
def undo_set(
    match_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    _check_event_access(match.event, user, db)
    event_id = match.event_id
    sets  = sorted(match.sets, key=lambda s: s.set_number)
    if not sets:
        raise HTTPException(status_code=400, detail="No sets to undo")

    if match.status == "done":
        # Reopen a finished match. Pull the already-propagated winner out of
        # the next bracket slot first (409 if that match has started).
        _retract_advancement(match, db)
        match.status      = "live"
        match.finished_at = None
        for p in match.participants:
            p.is_winner = False

    current = sets[-1]
    if current.score_p1 == 0 and current.score_p2 == 0 and len(sets) > 1:
        db.delete(current)
        match.sets.remove(current)   # keep the in-memory list in sync for the response
        prev = sets[-2]
        prev.is_complete     = False
        prev.winner_position = None
    else:
        current.score_p1        = 0
        current.score_p2        = 0
        current.is_complete     = False
        current.winner_position = None

    match.current_server = None
    parts = sorted(match.participants, key=lambda p: p.position)
    if len(parts) == 2:
        sets_won = {1: 0, 2: 0}
        for s in match.sets:
            if s.is_complete and s.winner_position:
                sets_won[s.winner_position] += 1
        parts[0].score = sets_won[1]
        parts[1].score = sets_won[2]

    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.post("/matches/{match_id}/rematch")
def rematch(
    match_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)        # includes match.event via joinedload
    _check_event_access(match.event, user, db)
    # Pull the already-propagated winner out of downstream bracket slots first
    # (raises 409 if the downstream match has started)
    _retract_advancement(match, db)
    event_id = match.event_id
    event    = match.event                   # no extra DB query
    preserved_sets = (match.live_state or {}).get("sets_to_win")
    match.status         = "scheduled"
    match.started_at     = None
    match.finished_at    = None
    match.current_server = None
    match.live_state     = {"sets_to_win": preserved_sets} if preserved_sets else None
    for p in match.participants:
        p.score     = 0
        p.is_winner = False
    for s in match.sets:
        db.delete(s)
    db.flush()

    engine = get_sport_engine(event.sport_key)
    if hasattr(engine, "check_set_winner"):
        db.add(MatchSet(match_id=match.match_id, set_number=1))

    db.flush()
    result = _serialize_match(match)
    db.commit()
    background_tasks.add_task(_push_ws_update, event_id)
    return result


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    _check_event_access(match.event, user, db)
    # A finished bracket match has already fed its winner into the next round:
    # pull it back out (409 if that match has started) before deleting.
    _retract_advancement(match, db)
    db.delete(match)
    db.commit()
    return {"ok": True}