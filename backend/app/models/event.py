"""
Event — a specific sport + format within a tournament.

Examples:
  - "Table Tennis Singles" (sport=table_tennis, format=group_knockout)
  - "Table Tennis Doubles" (sport=table_tennis, format=direct_knockout)
  - "Football 5-a-side"   (sport=football, format=round_robin)
  - "Cricket"             (sport=cricket, format=group_knockout)

Each event has its own groups, matches, and bracket — completely independent.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Event(Base):
    __tablename__ = "events"

    event_id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)  # "Table Tennis Singles"

    # Sport identifier — maps to the sports/ module
    # Values: table_tennis, badminton, cricket, football, etc.
    sport_key = Column(String(50), nullable=False, index=True)

    # Format of the event: group_knockout | direct_knockout | round_robin
    format = Column(String(50), nullable=True, default=None)

    # Is this a team sport or individual?
    # individual: match_participants link to players directly
    # team: match_participants link to teams
    participant_type = Column(String(20), nullable=False, default="individual")  # individual | team

    # Legacy flag — always True for events created by the wizard.
    is_configured = Column(Boolean, default=True)

    # Sport-specific config stored as JSON
    # For TT: {"sets_to_win": 3, "points_per_set": 11, "win_margin": 2, "instant_win": {"score": 7, "opponent": 0}}
    # For Football: {"half_duration_minutes": 45, "extra_time": true, "penalties": true}
    # For Cricket: {"overs": 20, "innings": 2}
    sport_config = Column(JSON, nullable=True)

    # Status
    status = Column(String(50), default="setup")  # setup | live | completed
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tournament = relationship("Tournament", back_populates="events")
    groups = relationship("Group", back_populates="event", cascade="all, delete-orphan")
    participants = relationship("EventParticipant", back_populates="event", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="event", cascade="all, delete-orphan")

    # Sport sub-format config
    squad_size  = Column(Integer, nullable=True)   # cricket
    team_size   = Column(Integer, nullable=True)   # football: players on field
    substitutes = Column(Integer, nullable=True)   # football: bench size