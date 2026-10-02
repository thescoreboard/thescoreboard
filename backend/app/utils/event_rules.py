"""
Event lifecycle rules shared by organiser and public enrolment endpoints.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.match import Match, MatchParticipant

EVENT_STATUSES = ("setup", "live", "completed")


def event_has_fixtures(event_id: int, db: Session) -> bool:
    return db.query(Match.match_id).filter(Match.event_id == event_id).first() is not None


def entries_locked(event: Event, db: Session) -> bool:
    """Entries are frozen once a bracket / group draw exists. Round-robin is the
    exception: regenerating it only adds the pairs that are missing, so late
    entries are safe."""
    return event.format != "round_robin" and event_has_fixtures(event.event_id, db)


def ensure_entries_open(event: Event, db: Session) -> None:
    if entries_locked(event, db):
        raise HTTPException(
            status_code=409,
            detail="Fixtures have already been generated for this event, so entries are closed. "
                   "Reset the fixtures first to change the field.",
        )


def ensure_can_remove_participant(event_id: int, *, player_id=None, team_id=None, db: Session) -> None:
    q = (
        db.query(MatchParticipant.mp_id)
        .join(Match, Match.match_id == MatchParticipant.match_id)
        .filter(Match.event_id == event_id)
    )
    q = q.filter(MatchParticipant.player_id == player_id) if player_id is not None \
        else q.filter(MatchParticipant.team_id == team_id)
    if q.first():
        raise HTTPException(
            status_code=409,
            detail="This participant is already in generated fixtures and cannot be removed. "
                   "Reset the fixtures first.",
        )
