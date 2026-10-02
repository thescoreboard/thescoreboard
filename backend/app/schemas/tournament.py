from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class EventInput(BaseModel):
    """Event to create as part of tournament creation wizard.

    format must be provided.
    """
    name: str
    sport_key: str
    format: Optional[str] = None
    participant_type: Optional[str] = "individual"  # individual | doubles_pair | team
    sport_config: Optional[dict] = None
    squad_size:   Optional[int] = None    # cricket
    team_size:    Optional[int] = None    # football (players on field)
    substitutes:  Optional[int] = None    # football (bench size)


class TournamentCreate(BaseModel):
    """Step 1-5 of creation wizard combined."""
    name: str
    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    is_published: bool = False
    primary_color: Optional[str] = None
    events: List[EventInput] = []


class TournamentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    registration_start_date: Optional[date] = None
    registration_end_date: Optional[date] = None
    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    poster_url: Optional[str] = None
    logo_url: Optional[str] = None
    og_image_url: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    is_published: Optional[bool] = None


class SponsorCreate(BaseModel):
    name:          str
    tier:          str = "partner"  # title | gold | silver | bronze | partner
    logo_url:      Optional[str] = None
    website:       Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description:   Optional[str] = None


class SponsorUpdate(BaseModel):
    name:          Optional[str] = None
    tier:          Optional[str] = None
    logo_url:      Optional[str] = None
    website:       Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description:   Optional[str] = None


class SponsorOut(BaseModel):
    sponsor_id:    int
    name:          str
    logo_url:      Optional[str]
    tier:          str
    website:       Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str] = None
    description:   Optional[str]

    class Config:
        from_attributes = True


class TournamentOut(BaseModel):
    tournament_id: int
    org_id: int
    name: str
    slug: str
    description: Optional[str]
    registration_start_date: Optional[date] = None
    registration_end_date: Optional[date] = None
    poster_url: Optional[str]
    logo_url: Optional[str]
    primary_color: Optional[str]
    secondary_color: Optional[str]
    venue: Optional[str]
    city: Optional[str]
    state: Optional[str]
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    status: str
    is_active: bool
    is_published: bool
    registration_open: bool = False
    created_at: datetime
    sponsors: List[SponsorOut] = []

    class Config:
        from_attributes = True