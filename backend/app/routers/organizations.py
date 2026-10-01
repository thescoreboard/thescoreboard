"""
Organization routes — create, manage, and delete clubs/schools.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.schemas.organization import OrgCreate, OrgOut
from app.utils.auth import get_current_user
from app.utils.slug import generate_unique_slug

router = APIRouter()


def _check_org_access(org_id: int, user: User, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not user.is_superadmin:
        member = db.query(OrgMember).filter(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.user_id,
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this organization")
    return org


def _check_org_admin(org_id: int, user: User, db: Session) -> Organization:
    """Stricter check — must be admin role, not just any member."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not user.is_superadmin:
        member = db.query(OrgMember).filter(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.user_id,
            OrgMember.role == "admin",
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Only org admins can perform this action")
    return org


@router.post("/", response_model=OrgOut)
def create_org(
    data: OrgCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    slug = generate_unique_slug(
        data.name,
        lambda s: db.query(Organization).filter(Organization.slug == s).first() is not None,
    )
    org = Organization(
        name=data.name,
        slug=slug,
        description=data.description,
        city=data.city,
        state=data.state,
    )
    db.add(org)
    db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=user.user_id, role="admin"))
    db.commit()
    db.refresh(org)
    return org


@router.get("/", response_model=List[OrgOut])
def list_my_orgs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.is_superadmin:
        return db.query(Organization).order_by(Organization.created_at.desc()).all()
    memberships = db.query(OrgMember).filter(OrgMember.user_id == user.user_id).all()
    org_ids = [m.org_id for m in memberships]
    if not org_ids:
        return []
    return db.query(Organization).filter(Organization.org_id.in_(org_ids)).all()


@router.get("/{org_id}", response_model=OrgOut)
def get_org(
    org_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _check_org_access(org_id, user, db)


@router.delete("/{org_id}")
def delete_org(
    org_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Delete an organization and ALL of its tournaments, events, matches, and players.
    Only org admins (or superadmin) can do this.
    """
    org = _check_org_admin(org_id, user, db)

    # Cascade: delete all tournaments under this org
    # SQLAlchemy cascade should handle children if set up on the model,
    # but we do it explicitly to be safe.
    tournaments = db.query(Tournament).filter(Tournament.org_id == org_id).all()
    for t in tournaments:
        db.delete(t)
    db.flush()

    # Players and teams carry PII (phone/email) and would otherwise be
    # orphaned with org_id NULL (FK is SET NULL). Delete them with the org.
    from app.models.player import Player, Team
    for team in db.query(Team).filter(Team.org_id == org_id).all():
        db.delete(team)
    for player in db.query(Player).filter(Player.org_id == org_id).all():
        db.delete(player)
    db.flush()

    # Delete all memberships
    db.query(OrgMember).filter(OrgMember.org_id == org_id).delete()

    # Delete the org itself
    db.delete(org)
    db.commit()
    return {"ok": True, "deleted_org_id": org_id}