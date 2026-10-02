from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class EventCreate(BaseModel):
    name: str
    sport_key: str
    format: str = "group_knockout"          # group_knockout | direct_knockout | round_robin
    participant_type: str = "individual"    # individual | team
    sport_config: Optional[dict] = None     # sport-specific overrides


class EventUpdate(BaseModel):
    name: Optional[str] = None
    format: Optional[str] = None
    sport_config: Optional[dict] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class EventSetupInput(BaseModel):
    """Payload for the first-time (or edit) sport setup wizard.

    Accepted for POST /events/{event_id}/configure.
    All fields except format and participant_type are optional — missing
    scoring/size fields fall back to engine defaults.
    """
    format: str                             # required: group_knockout | direct_knockout | round_robin
    participant_type: str                   # required: individual | doubles_pair | team
    sport_config: Optional[dict] = None    # scoring overrides; merged with engine defaults
    squad_size:   Optional[int] = None     # cricket: roster size
    team_size:    Optional[int] = None     # football: players on field (5 / 7 / 11)
    substitutes:  Optional[int] = None     # football: bench size
    name:         Optional[str] = None     # optional: rename the event during setup


class EventOut(BaseModel):
    event_id: int
    tournament_id: int
    name: str
    sport_key: str
    format: Optional[str]
    participant_type: str
    sport_config: Optional[dict]
    status: str
    is_active: bool
    is_configured: bool             # False until setup wizard is completed
    squad_size: Optional[int] = None
    team_size: Optional[int] = None
    substitutes: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
