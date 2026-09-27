"""
Dashboard — single aggregated endpoint for the organiser dashboard.
Replaces three sequential calls (me + orgs + tournaments) with one.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.models.tournament_member import TournamentMember
from app.models.event import Event
from app.utils.auth import get_current_user
from app.utils.roles import compute_roles

router = APIRouter()


def _serialize_dashboard_tournament(t: Tournament) -> dict:
    return {
        "tournament_id": t.tournament_id,
        "org_id":        t.org_id,
        "name":          t.name,
        "slug":          t.slug,
        "status":        t.status,
        "registration_open": t.registration_open,
        "venue":         t.venue,
        "city":          t.city,
        "state":         t.state,
        "poster_url":    t.poster_url,
        "logo_url":      t.logo_url,
        "events": [
            {
                "event_id":  e.event_id,
                "name":      e.name,
                "sport_key": e.sport_key,
                "format":    e.format,
                "status":    e.status,
            }
            for e in (t.events or [])
        ],
    }


@router.get("")
def get_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Fetch orgs the user belongs to
    if user.is_superadmin:
        orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    else:
        memberships = db.query(OrgMember).filter(OrgMember.user_id == user.user_id).all()
        org_ids = [m.org_id for m in memberships]
        orgs = (
            db.query(Organization).filter(Organization.org_id.in_(org_ids)).all()
            if org_ids else []
        )

    org_ids = [o.org_id for o in orgs]

    # Fetch all tournaments for all orgs in one query, with events eager-loaded
    tournaments = (
        db.query(Tournament)
        .options(joinedload(Tournament.events))
        .filter(Tournament.org_id.in_(org_ids))
        .order_by(Tournament.created_at.desc())
        .all()
        if org_ids else []
    )

    # Group tournaments by org
    by_org: dict[int, list] = {o.org_id: [] for o in orgs}
    for t in tournaments:
        by_org[t.org_id].append(_serialize_dashboard_tournament(t))

    # Tournaments shared with the user via TournamentMember (invited access),
    # excluding tournaments they already see through their own orgs.
    shared_q = (
        db.query(TournamentMember, Tournament)
        .join(Tournament, Tournament.tournament_id == TournamentMember.tournament_id)
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
        .filter(TournamentMember.user_id == user.user_id)
    )
    if org_ids:
        shared_q = shared_q.filter(~Tournament.org_id.in_(org_ids))
    shared_rows = shared_q.order_by(Tournament.created_at.desc()).all()
    shared_tournaments = [
        {
            **_serialize_dashboard_tournament(t),
            "my_role":  tm.role,
            "org_name": t.organization.name if t.organization else None,
        }
        for tm, t in shared_rows
    ]

    return {
        "user": {
            "user_id":      user.user_id,
            "name":         user.name,
            "email":        user.email,
            "avatar_url":   user.avatar_url,
            "is_superadmin": user.is_superadmin,
            "plan":         user.plan,
            "roles":        compute_roles(user, db),
        },
        "orgs": [
            {
                "org_id":      o.org_id,
                "name":        o.name,
                "slug":        o.slug,
                "city":        o.city,
                "state":       o.state,
                "tournaments": by_org[o.org_id],
            }
            for o in orgs
        ],
        "shared_tournaments": shared_tournaments,
    }
