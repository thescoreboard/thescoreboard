"""
Role computation — extracted from auth.py so it can be imported by any
router (dashboard, auth, etc.) without creating circular dependencies.
"""
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.organization import OrgMember


def compute_roles(user: User, db: Session) -> list[str]:
    """
    Derive the user's role list from DB state.
    Every authenticated user is a 'player'.
    'organiser' is added when they belong to at least one org.
    'superadmin' is added when the DB flag is set.
    """
    roles: list[str] = ["player"]
    has_org = db.query(OrgMember).filter(OrgMember.user_id == user.user_id).first()
    if has_org:
        roles.append("organiser")
    if user.is_superadmin:
        roles.append("superadmin")
    return roles
