"""
Auth routes — email/password register & login, Google SSO, player profile.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.player import Player
from app.models.organization import OrgMember
from app.models.group import EventParticipant
from app.models.event import Event
from app.models.tournament import Tournament
from app.models.match import Match, MatchParticipant
from app.schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest,
    TokenOut, UserOut, PlayerProfileIn, PlayerProfileOut,
)
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user
from app.utils.ratelimit import login_limiter, register_limiter
from app.utils.roles import compute_roles

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, dependencies=[Depends(register_limiter)])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
        phone=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active != False).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Google SSO ────────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured on this server")

    try:
        import httpx
        # Verify the token was issued to OUR OAuth client before trusting it.
        # Without the audience check, an access token a user granted to ANY
        # third-party app would sign that app's operator in here as the user.
        ti = httpx.get(
            "https://www.googleapis.com/oauth2/v3/tokeninfo",
            params={"access_token": req.access_token},
            timeout=5.0,
        )
        if ti.status_code != 200 or ti.json().get("aud") != settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Invalid Google token")

        resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
            timeout=5.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        info = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Google userinfo request failed: %s", e)
        raise HTTPException(status_code=401, detail="Could not verify Google token")

    # Refuse unverified emails — we link accounts by email below, so an
    # unverified address could hijack an existing local account.
    if info.get("email_verified") not in (True, "true"):
        raise HTTPException(status_code=401, detail="Google account email is not verified")

    google_id  = info["sub"]
    email      = info["email"]
    name       = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            email=email,
            password_hash=None,
            name=name,
            google_id=google_id,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        if user.google_id is None:
            user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    result = UserOut.model_validate(user)
    if profile:
        result.player_profile = PlayerProfileOut.model_validate(profile)
    result.roles = compute_roles(user, db)
    return result


# ── Player profile ────────────────────────────────────────────────────────────

@router.get("/player-profile")
def get_player_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        return None
    return PlayerProfileOut.model_validate(profile)


@router.put("/player-profile", response_model=PlayerProfileOut)
def save_player_profile(
    req: PlayerProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        profile = Player(
            user_id=user.user_id,
            name=req.name,
            phone=req.phone,
            age=req.age,
            gender=req.gender or "Male",
            location=req.location,
            email=user.email,
        )
        db.add(profile)
    else:
        profile.name     = req.name
        profile.phone    = req.phone    or profile.phone
        profile.age      = req.age      if req.age      is not None else profile.age
        profile.gender   = req.gender   or profile.gender
        profile.location = req.location or profile.location
    db.commit()
    db.refresh(profile)
    return PlayerProfileOut.model_validate(profile)


# ── Player history endpoints ──────────────────────────────────────────────────

_STAGE_ORDER = {"group": 0, "quarter": 1, "semi": 2, "third_place": 3, "final": 4}
_STAGE_LABELS = {
    "group": "Group Stage",
    "quarter": "Quarter-Final",
    "semi": "Semi-Final",
    "third_place": "Third Place",
    "final": "Final",
}


def _stage_reached_label(stage: str, won: bool) -> str:
    if stage == "final":
        return "Champion" if won else "Runner-up"
    if stage == "third_place":
        return "3rd Place" if won else "4th Place"
    return _STAGE_LABELS.get(stage, stage.replace("_", " ").title())


# ── Account deletion ──────────────────────────────────────────────────────────

@router.delete("/me", status_code=204)
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Permanently remove a user's personal data (GDPR / Google Play requirement).

    Strategy: anonymise the User + Player rows so that existing tournament and
    match history records (which reference player_id / user_id via FK) remain
    intact.  The account becomes unreachable — email is replaced with a unique
    sentinel, password hash and Google ID are cleared, and is_active is set to
    False so no new token can be issued for the account.
    """
    import uuid
    anon_suffix = uuid.uuid4().hex[:10]

    # Anonymise PII on the Player profile (keep row for FK integrity)
    player = db.query(Player).filter(Player.user_id == user.user_id).first()
    if player:
        player.name     = "Deleted User"
        player.phone    = None
        player.location = None
        player.email    = f"deleted_{user.user_id}_{anon_suffix}@deleted.invalid"

    # Remove org membership so they no longer have organiser access
    db.query(OrgMember).filter(OrgMember.user_id == user.user_id).delete(synchronize_session=False)

    # Anonymise the User row — wipe all PII, block future logins
    user.email         = f"deleted_{user.user_id}_{anon_suffix}@deleted.invalid"
    user.name          = "Deleted User"
    user.phone         = None
    user.password_hash = None
    user.google_id     = None
    user.avatar_url    = None
    user.is_active     = False

    db.commit()
    # Return 204 No Content — client must clear its local token immediately


def _best_finish_for_player(db: Session, player_ids: list[int], tournament_id: int) -> str | None:
    """Return the best finish label for these player_ids within a tournament."""
    rows = (
        db.query(Match, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.match_id == Match.match_id)
        .join(Event, Event.event_id == Match.event_id)
        .filter(
            Event.tournament_id == tournament_id,
            MatchParticipant.player_id.in_(player_ids),
            Match.status == "done",
        )
        .all()
    )
    if not rows:
        return None
    best_row = max(rows, key=lambda r: _STAGE_ORDER.get(r[0].stage or "group", 0))
    match, mp = best_row
    return _stage_reached_label(match.stage or "group", bool(mp.is_winner))


def _bulk_best_finish(db: Session, player_ids: list[int], tournament_ids: list[int]) -> dict[int, str | None]:
    """Return best-finish label per tournament_id — single DB query for all tournaments."""
    if not player_ids or not tournament_ids:
        return {}
    rows = (
        db.query(Match, MatchParticipant, Event.tournament_id)
        .join(MatchParticipant, MatchParticipant.match_id == Match.match_id)
        .join(Event, Event.event_id == Match.event_id)
        .filter(
            Event.tournament_id.in_(tournament_ids),
            MatchParticipant.player_id.in_(player_ids),
            Match.status == "done",
        )
        .all()
    )
    # Group rows by tournament_id, then pick the best stage per tournament
    from collections import defaultdict
    by_tournament: dict[int, list] = defaultdict(list)
    for match, mp, tid in rows:
        by_tournament[tid].append((match, mp))

    result: dict[int, str | None] = {}
    for tid in tournament_ids:
        t_rows = by_tournament.get(tid)
        if not t_rows:
            result[tid] = None
            continue
        best_match, best_mp = max(t_rows, key=lambda r: _STAGE_ORDER.get(r[0].stage or "group", 0))
        result[tid] = _stage_reached_label(best_match.stage or "group", bool(best_mp.is_winner))
    return result


@router.get("/my-tournaments")
def get_my_tournaments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all tournaments the authenticated user has registered in."""
    players = db.query(Player).filter(Player.user_id == user.user_id).all()
    if not players:
        return []

    player_ids = [p.player_id for p in players]

    eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.player_id.in_(player_ids))
        .all()
    )
    if not eps:
        return []

    # ── Bulk load: 1 query for events, 1 query for tournaments ──────────────
    event_ids = list({ep.event_id for ep in eps})
    events = db.query(Event).filter(Event.event_id.in_(event_ids)).all()
    event_map: dict[int, Event] = {e.event_id: e for e in events}

    tournament_ids = list({e.tournament_id for e in events})
    tournaments = (
        db.query(Tournament)
        .filter(Tournament.tournament_id.in_(tournament_ids), Tournament.is_active == True)
        .all()
    )
    t_map: dict[int, Tournament] = {t.tournament_id: t for t in tournaments}

    # Best finish per tournament — single bulk query for all tournaments
    finish_map = _bulk_best_finish(db, player_ids, [tid for tid in tournament_ids if tid in t_map])

    # Deduplicate by tournament; keep first ep per tournament
    seen: dict[int, dict] = {}
    for ep in eps:
        event = event_map.get(ep.event_id)
        if not event:
            continue
        t = t_map.get(event.tournament_id)
        if not t:
            continue
        tid = t.tournament_id
        if tid not in seen:
            seen[tid] = {
                "tournament_id":    t.tournament_id,
                "name":             t.name,
                "slug":             t.slug,
                "status":           t.status,
                "sport_key":        event.sport_key,
                "event_name":       event.name,
                "city":             t.city,
                "participant_status": ep.status,
                "stage_reached":    finish_map.get(tid),
            }

    result = list(seen.values())
    status_order = {"live": 0, "registration": 1, "upcoming": 1, "fixtures": 2,
                    "completed": 3, "cancelled": 4}
    result.sort(key=lambda x: (status_order.get(x["status"], 9), x["name"]))
    return result


@router.get("/my-stats")
def get_my_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return match stats for the authenticated user."""
    players = db.query(Player).filter(Player.user_id == user.user_id).all()
    empty = {
        "tournaments_count": 0, "matches_played": 0,
        "wins": 0, "losses": 0, "win_pct": 0, "by_sport": {},
    }
    if not players:
        return empty

    player_ids = [p.player_id for p in players]

    # ── Bulk load events for all participations (1 query) ───────────────────
    eps = db.query(EventParticipant).filter(EventParticipant.player_id.in_(player_ids)).all()
    all_event_ids = list({ep.event_id for ep in eps})
    events_bulk = db.query(Event).filter(Event.event_id.in_(all_event_ids)).all()
    event_map: dict[int, Event] = {e.event_id: e for e in events_bulk}

    tournament_ids: set[int] = {e.tournament_id for e in events_bulk}
    # Map: event_id → sport_key (no per-row DB queries needed)
    event_sport_map: dict[int, str] = {e.event_id: e.sport_key for e in events_bulk}
    # Map: tournament_id → set of sport_keys played in that tournament
    tournament_sports: dict[int, set[str]] = {}
    for e in events_bulk:
        tournament_sports.setdefault(e.tournament_id, set()).add(e.sport_key)

    # Match stats (1 query)
    rows = (
        db.query(Match, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.match_id == Match.match_id)
        .filter(
            MatchParticipant.player_id.in_(player_ids),
            Match.status == "done",
        )
        .all()
    )

    matches_played = len(rows)
    wins   = sum(1 for _, mp in rows if mp.is_winner)
    losses = matches_played - wins
    win_pct = round(wins / matches_played * 100) if matches_played else 0

    # Per-sport breakdown — event_sport_map covers all event_ids, no extra queries
    by_sport: dict[str, dict] = {}
    for match, mp in rows:
        sport_key = event_sport_map.get(match.event_id, "unknown")
        if sport_key not in by_sport:
            by_sport[sport_key] = {
                "matches": 0, "wins": 0, "losses": 0, "win_pct": 0,
                "best_finish": None, "_best_rank": -1,
            }
        by_sport[sport_key]["matches"] += 1
        if mp.is_winner:
            by_sport[sport_key]["wins"] += 1
        else:
            by_sport[sport_key]["losses"] += 1

    # Compute win_pct per sport
    for data in by_sport.values():
        m = data["matches"]
        data["win_pct"] = round(data["wins"] / m * 100) if m else 0

    # Best finish: single bulk query for all tournaments, then distribute per sport
    FINISH_RANK = {
        "Champion": 6, "Runner-up": 5, "3rd Place": 4, "4th Place": 3,
        "Semi-Final": 2, "Quarter-Final": 1, "Group Stage": 0,
    }
    finish_bulk = _bulk_best_finish(db, player_ids, list(tournament_ids))
    for tid in tournament_ids:
        label = finish_bulk.get(tid)
        if not label:
            continue
        rank = FINISH_RANK.get(label, -1)
        for sport_key in tournament_sports.get(tid, set()):
            if sport_key in by_sport and rank > by_sport[sport_key]["_best_rank"]:
                by_sport[sport_key]["_best_rank"] = rank
                by_sport[sport_key]["best_finish"] = label

    # Remove internal helper key before returning
    for data in by_sport.values():
        data.pop("_best_rank", None)

    return {
        "tournaments_count": len(tournament_ids),
        "matches_played": matches_played,
        "wins": wins,
        "losses": losses,
        "win_pct": win_pct,
        "by_sport": by_sport,
    }
