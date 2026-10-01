"""
Tournament invite links — lifecycle tests.

create → public info → accept → member row; idempotent re-accept;
admin-invite upgrades staff; expired/revoked → 410; org member → already_member.
"""
import os
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.models.tournament_member import TournamentMember, TournamentInvite
from app.models.user import User
from app.utils.auth import get_current_user


def _setup(db):
    org = Organization(name="Club", slug="club")
    db.add(org); db.flush()
    owner = User(email="owner@x.com", name="Owner", plan="free")
    joiner = User(email="joiner@x.com", name="Joiner", plan="free")
    db.add_all([owner, joiner]); db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=owner.user_id, role="admin"))
    t = Tournament(org_id=org.org_id, name="Open", slug="open")
    db.add(t); db.commit()

    current = {"user": owner}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    return t, org, owner, joiner, current, TestClient(app)


def test_invite_lifecycle_create_info_accept(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        # Owner creates a staff invite
        r = client.post(f"/api/tournaments/{t.tournament_id}/invites",
                        json={"role": "staff", "expires_in_days": 7})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        assert len(token) >= 24

        # Public info — no auth needed, shows preview
        r = client.get(f"/api/public/invites/{token}")
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is True
        assert body["tournament_name"] == "Open"
        assert body["role"] == "staff"
        assert body["inviter_name"] == "Owner"

        # Joiner accepts
        current["user"] = joiner
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 200, r.text
        assert r.json()["tournament_id"] == t.tournament_id
        assert r.json()["role"] == "staff"
        assert r.json()["already_member"] is False

        member = db.query(TournamentMember).filter_by(
            tournament_id=t.tournament_id, user_id=joiner.user_id).first()
        assert member is not None and member.role == "staff"
        assert member.invited_by == owner.user_id

        # Re-accept is idempotent — no duplicate row
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 200
        assert r.json()["already_member"] is True
        count = db.query(TournamentMember).filter_by(
            tournament_id=t.tournament_id, user_id=joiner.user_id).count()
        assert count == 1

        # Joiner can now access the workspace as staff
        r = client.get(f"/api/orgs/tournaments/{t.tournament_id}/workspace")
        assert r.status_code == 200 and r.json()["my_role"] == "staff"

        # Invite shows in the members list with use_count
        current["user"] = owner
        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        invites = r.json()["invites"]
        assert invites and invites[0]["use_count"] == 1
    finally:
        app.dependency_overrides.clear()


def test_admin_invite_upgrades_existing_staff(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        db.add(TournamentMember(tournament_id=t.tournament_id,
                                user_id=joiner.user_id, role="staff"))
        db.commit()

        r = client.post(f"/api/tournaments/{t.tournament_id}/invites", json={"role": "admin"})
        token = r.json()["token"]

        current["user"] = joiner
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

        member = db.query(TournamentMember).filter_by(
            tournament_id=t.tournament_id, user_id=joiner.user_id).first()
        db.refresh(member)
        assert member.role == "admin"
    finally:
        app.dependency_overrides.clear()


def test_staff_invite_never_downgrades_admin(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        db.add(TournamentMember(tournament_id=t.tournament_id,
                                user_id=joiner.user_id, role="admin"))
        db.commit()

        r = client.post(f"/api/tournaments/{t.tournament_id}/invites", json={"role": "staff"})
        token = r.json()["token"]

        current["user"] = joiner
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"  # kept
    finally:
        app.dependency_overrides.clear()


def test_expired_and_revoked_invites_rejected(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        expired = TournamentInvite(
            token="expiredtoken123", tournament_id=t.tournament_id, role="staff",
            created_by=owner.user_id,
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(expired); db.commit()

        r = client.get("/api/public/invites/expiredtoken123")
        assert r.json() == {"valid": False, "reason": "expired"} or r.json()["reason"] == "expired"

        current["user"] = joiner
        r = client.post("/api/tournaments/invites/expiredtoken123/accept")
        assert r.status_code == 410 and "invite_expired" in r.text

        # Revoke flow
        current["user"] = owner
        r = client.post(f"/api/tournaments/{t.tournament_id}/invites", json={"role": "staff"})
        token, invite_id = r.json()["token"], r.json()["invite_id"]
        r = client.delete(f"/api/tournaments/{t.tournament_id}/invites/{invite_id}")
        assert r.status_code == 200

        r = client.get(f"/api/public/invites/{token}")
        assert r.json()["valid"] is False and r.json()["reason"] == "revoked"

        current["user"] = joiner
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 410 and "invite_revoked" in r.text

        # Revoked invites don't show in the members list
        current["user"] = owner
        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        assert all(i["invite_id"] != invite_id for i in r.json()["invites"])
    finally:
        app.dependency_overrides.clear()


def test_org_member_accept_is_noop(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        r = client.post(f"/api/tournaments/{t.tournament_id}/invites", json={"role": "staff"})
        token = r.json()["token"]

        # Owner opens their own invite link — already an owner
        r = client.post(f"/api/tournaments/invites/{token}/accept")
        assert r.status_code == 200
        assert r.json()["already_member"] is True
        assert r.json()["role"] == "admin"
        assert db.query(TournamentMember).filter_by(
            tournament_id=t.tournament_id, user_id=owner.user_id).count() == 0
    finally:
        app.dependency_overrides.clear()


def test_unknown_token(db):
    t, org, owner, joiner, current, client = _setup(db)
    try:
        r = client.get("/api/public/invites/nosuchtoken")
        assert r.json()["valid"] is False and r.json()["reason"] == "not_found"

        r = client.post("/api/tournaments/invites/nosuchtoken/accept")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
