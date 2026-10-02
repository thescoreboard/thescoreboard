"""
Tournament authorization — the single source of truth for who may do what
on a tournament and everything under it (events, matches, participants).

Role resolution (highest wins):
  superadmin                          -> "admin"
  OrgMember of the owning org         -> "admin"   (owner)
  otherwise                           -> None (no access)
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.organization import OrgMember
from app.models.tournament import Tournament
from app.models.event import Event

ROLE_ADMIN = "admin"
ROLE_STAFF = "staff"
_RANK = {ROLE_STAFF: 1, ROLE_ADMIN: 2}


def get_tournament_role(t: Tournament, user: User, db: Session) -> str | None:
    """Resolve the caller's effective role on a tournament, or None."""
    if user.is_superadmin:
        return ROLE_ADMIN
    org_member = db.query(OrgMember).filter(
        OrgMember.org_id == t.org_id, OrgMember.user_id == user.user_id).first()
    if org_member:
        return ROLE_ADMIN
    return None


def ensure_role(t: Tournament, user: User, db: Session, min_role: str = ROLE_STAFF) -> str:
    """403 unless the caller holds min_role or better on an already-loaded
    tournament. Returns the caller's role."""
    role = get_tournament_role(t, user, db)
    if role is None or _RANK[role] < _RANK[min_role]:
        raise HTTPException(status_code=403, detail="Not authorized for this tournament")
    return role


def require_tournament_access(
    tournament_id: int, user: User, db: Session, min_role: str = ROLE_STAFF,
) -> tuple[Tournament, str]:
    """404 if the tournament doesn't exist; 403 if the caller's role is
    missing or below min_role. Returns (tournament, role)."""
    t = db.query(Tournament).filter(Tournament.tournament_id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    role = ensure_role(t, user, db, min_role)
    return t, role


def require_event_access(
    event_id: int, user: User, db: Session, min_role: str = ROLE_STAFF,
) -> tuple[Event, Tournament, str]:
    """Resolve event -> tournament, then enforce tournament access."""
    ev = db.query(Event).filter(Event.event_id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    t, role = require_tournament_access(ev.tournament_id, user, db, min_role)
    return ev, t, role


def require_org_access(
    org_id: int, user: User, db: Session,
) -> None:
    """Org-scoped resources (player/team pools). Org members and superadmins pass."""
    if user.is_superadmin:
        return
    member = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.user_id).first()
    if member:
        return
    raise HTTPException(status_code=403, detail="Not authorized for this organization")
