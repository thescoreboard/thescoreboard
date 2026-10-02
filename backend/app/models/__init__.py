"""
Import all models so SQLAlchemy registers them with Base.metadata.
"""
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament, Sponsor
from app.models.event import Event
from app.models.player import Player, Team, TeamMember
from app.models.group import Group, EventParticipant, Standing
from app.models.match import Match, MatchParticipant, MatchSet

__all__ = [
    "User",
    "Organization", "OrgMember",
    "Tournament", "Sponsor",
    "Event",
    "Player", "Team", "TeamMember",
    "Group", "EventParticipant", "Standing",
    "Match", "MatchParticipant", "MatchSet",
]