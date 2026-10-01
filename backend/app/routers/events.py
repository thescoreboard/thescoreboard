"""
Event routes — manage sport events within a tournament.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.tournament import Tournament
from app.models.event import Event
from app.models.match import Match
from app.schemas.event import EventCreate, EventUpdate, EventOut, EventSetupInput
from app.utils.auth import get_current_user
from app.utils.event_rules import EVENT_STATUSES
from app.utils.tournament_access import require_tournament_access, require_event_access
from app.sports.registry import get_sport_engine, list_sports

router = APIRouter()

_VALID_FORMATS = ["group_knockout", "direct_knockout", "round_robin"]


def _get_tournament_and_check(tournament_id: int, user: User, db: Session) -> Tournament:
    t, _ = require_tournament_access(tournament_id, user, db)
    return t


def _get_event_and_check(event_id: int, user: User, db: Session) -> Event:
    event, _, _ = require_event_access(event_id, user, db)
    return event


@router.get("/sports")
def get_available_sports():
    """List all supported sports for the event creation form."""
    return list_sports()


@router.post("/tournaments/{tournament_id}/events", response_model=EventOut)
def create_event(
    tournament_id: int,
    data: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _get_tournament_and_check(tournament_id, user, db)

    try:
        engine = get_sport_engine(data.sport_key)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    base_config = engine.get_default_config()
    if data.sport_config:
        try:
            base_config = engine.validate_config({**base_config, **data.sport_config})
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid sport config: {e}")

    if data.format not in _VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Format must be one of {_VALID_FORMATS}")

    participant_type = data.participant_type or "individual"

    event = Event(
        tournament_id=tournament_id,
        name=data.name,
        sport_key=data.sport_key,
        format=data.format,
        participant_type=participant_type,
        sport_config=base_config,
        is_configured=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/tournaments/{tournament_id}/events", response_model=List[EventOut])
def list_events(tournament_id: int, db: Session = Depends(get_db)):
    """Public — list all events in a tournament."""
    return (
        db.query(Event)
        .filter(Event.tournament_id == tournament_id, Event.is_active == True)
        .order_by(Event.created_at)
        .all()
    )


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _get_event_and_check(event_id, user, db)

    if data.sport_config is not None:
        engine = get_sport_engine(event.sport_key)
        try:
            data.sport_config = engine.validate_config(data.sport_config)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid sport config: {e}")

    update_data = data.model_dump(exclude_unset=True)

    # Same locks as /configure: PATCH must not be a back door around them.
    if "format" in update_data and update_data["format"] is not None:
        if update_data["format"] not in _VALID_FORMATS:
            raise HTTPException(status_code=400, detail=f"Format must be one of {_VALID_FORMATS}")
    if update_data.get("status") is not None and update_data["status"] not in EVENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {list(EVENT_STATUSES)}")
    if update_data.get("name") is not None and not update_data["name"].strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    has_matches = db.query(Match).filter(Match.event_id == event_id).count() > 0
    if has_matches and "format" in update_data and update_data["format"] != event.format:
        raise HTTPException(status_code=409, detail="Format cannot be changed after fixtures have been generated.")
    if "sport_config" in update_data and db.query(Match).filter(
        Match.event_id == event_id, Match.status == "done"
    ).count() > 0:
        raise HTTPException(status_code=409, detail="Scoring rules cannot be changed after matches are completed.")

    # participant_type is stored as-is ("individual", "doubles_pair", "team")

    for field, val in update_data.items():
        setattr(event, field, val)

    db.commit()
    db.refresh(event)
    return event


# ── Sport setup wizard ────────────────────────────────────────

@router.post("/events/{event_id}/configure", response_model=EventOut)
def configure_event(
    event_id: int,
    data: EventSetupInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Save (or re-save) the sport-specific configuration for one event.

    This is the endpoint called by the setup wizard shown in the dashboard
    when organiser opens an unconfigured multi-sport event for the first time.

    Edit lock rules
    ---------------
    Not yet configured     → always allowed
    Configured, no fixtures → always allowed (full edit)
    Configured, has fixtures but no completed matches
                           → sport_config edits allowed;
                             format + participant_type are LOCKED
    Configured, has completed matches → all changes rejected
    """
    event = _get_event_and_check(event_id, user, db)

    # ── Edit lock checks (only apply when re-editing an already configured event)
    if event.is_configured:
        match_count = db.query(Match).filter(Match.event_id == event_id).count()
        if match_count > 0:
            completed_count = db.query(Match).filter(
                Match.event_id == event_id, Match.status == "done"
            ).count()
            if completed_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail="Configuration cannot be changed after matches are completed.",
                )
            # Fixtures exist but none finished — lock format + participant_type only
            if data.format != event.format or data.participant_type != event.participant_type:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Format and participant type cannot be changed after fixtures have been "
                        "generated. Delete all fixtures first, then reconfigure."
                    ),
                )

    # ── Validate format
    if data.format not in _VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Format must be one of {_VALID_FORMATS}",
        )

    # ── Validate and merge sport config
    try:
        engine = get_sport_engine(event.sport_key)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    merged_config = engine.get_default_config()
    if data.sport_config:
        try:
            merged_config = engine.validate_config({**merged_config, **data.sport_config})
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid sport config: {e}")

    participant_type = data.participant_type or "individual"

    # ── Apply
    event.format           = data.format
    event.participant_type = participant_type
    event.sport_config     = merged_config
    event.is_configured    = True

    if data.squad_size  is not None: event.squad_size  = data.squad_size
    if data.team_size   is not None: event.team_size   = data.team_size
    if data.substitutes is not None: event.substitutes = data.substitutes
    if data.name:                    event.name        = data.name.strip()

    db.commit()
    db.refresh(event)
    return event
