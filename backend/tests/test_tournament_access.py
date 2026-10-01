"""
Per-tournament multi-user access — authorization matrix.

Five personas exercised against the danger zone and day-to-day endpoints:
  owner      — OrgMember of the owning org (implicit permanent admin)
  t_admin    — TournamentMember role="admin" (invited admin)
  t_staff    — TournamentMember role="staff" (organising team)
  outsider   — authenticated user with no relation to the tournament
  superadmin — is_superadmin=True

Also regression-tests the previously-unprotected endpoints
(add_player_to_event, add_team_to_event, list_org_teams).
"""
import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.models.tournament_member import TournamentMember
from app.models.event import Event
from app.models.match import Match
from app.models.player import Player
from app.models.user import User
from app.utils.auth import get_current_user


def _setup(db):
    org = Organization(name="Club", slug="club")
    db.add(org); db.flush()

    def mk_user(email, name, **kw):
        u = User(email=email, name=name, plan="free", **kw)
        db.add(u); db.flush()
        return u

    owner      = mk_user("owner@x.com", "Owner")
    t_admin    = mk_user("tadmin@x.com", "Invited Admin")
    t_staff    = mk_user("tstaff@x.com", "Invited Staff")
    outsider   = mk_user("outsider@x.com", "Outsider")
    superadmin = mk_user("super@x.com", "Super", is_superadmin=True)

    db.add(OrgMember(org_id=org.org_id, user_id=owner.user_id, role="admin"))

    t = Tournament(org_id=org.org_id, name="Open", slug="open")
    db.add(t); db.flush()
    ev = Event(tournament_id=t.tournament_id, name="TT Singles",
               sport_key="table_tennis", format="direct_knockout")
    db.add(ev); db.flush()
    m = Match(event_id=ev.event_id, round=1, stage="final", status="scheduled")
    db.add(m); db.flush()
    p = Player(name="Player One", org_id=org.org_id)
    db.add(p); db.flush()

    db.add(TournamentMember(tournament_id=t.tournament_id, user_id=t_admin.user_id, role="admin"))
    db.add(TournamentMember(tournament_id=t.tournament_id, user_id=t_staff.user_id, role="staff"))
    db.commit()

    current = {"user": owner}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current["user"]

    users = {"owner": owner, "t_admin": t_admin, "t_staff": t_staff,
             "outsider": outsider, "superadmin": superadmin}
    return t, ev, m, p, org, users, current, TestClient(app)


def _as(current, users, who):
    current["user"] = users[who]


def test_staff_can_do_day_to_day_but_not_danger_zone(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "t_staff")

        # Day-to-day: allowed
        r = client.patch(f"/api/orgs/{org.org_id}/tournaments/{t.tournament_id}",
                         json={"city": "Mumbai"})
        assert r.status_code == 200, r.text

        r = client.get(f"/api/orgs/tournaments/{t.tournament_id}/workspace")
        assert r.status_code == 200, r.text
        assert r.json()["my_role"] == "staff"

        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/sponsors",
                        json={"name": "Acme", "tier": "gold"})
        assert r.status_code == 200, r.text

        r = client.patch(f"/api/matches/{m.match_id}/status", json={"status": "scheduled"})
        assert r.status_code == 200, r.text

        r = client.post(f"/api/players/events/{ev.event_id}/participants",
                        params={"player_id": p.player_id})
        assert r.status_code == 200, r.text

        # Danger zone: blocked
        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition",
                        params={"target_status": "live"})
        assert r.status_code == 403, r.text

        r = client.delete(f"/api/orgs/{org.org_id}/tournaments/{t.tournament_id}")
        assert r.status_code == 403, r.text

        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        assert r.status_code == 403, r.text

        r = client.post(f"/api/tournaments/{t.tournament_id}/invites",
                        json={"role": "staff"})
        assert r.status_code == 403, r.text
    finally:
        app.dependency_overrides.clear()


def test_invited_admin_gets_danger_zone(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "t_admin")

        r = client.get(f"/api/orgs/tournaments/{t.tournament_id}/workspace")
        assert r.status_code == 200 and r.json()["my_role"] == "admin"

        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        assert r.status_code == 200, r.text

        r = client.post(f"/api/tournaments/{t.tournament_id}/invites", json={"role": "staff"})
        assert r.status_code == 200, r.text

        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition",
                        params={"target_status": "live"})
        assert r.status_code == 200, r.text

        r = client.delete(f"/api/orgs/{org.org_id}/tournaments/{t.tournament_id}")
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()


def test_outsider_blocked_everywhere(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "outsider")

        for method, url, kwargs in [
            ("get",    f"/api/orgs/tournaments/{t.tournament_id}/workspace", {}),
            ("patch",  f"/api/orgs/{org.org_id}/tournaments/{t.tournament_id}", {"json": {"city": "X"}}),
            ("post",   f"/api/orgs/tournaments/{t.tournament_id}/transition", {"params": {"target_status": "live"}}),
            ("post",   f"/api/orgs/tournaments/{t.tournament_id}/sponsors", {"json": {"name": "A", "tier": "gold"}}),
            ("patch",  f"/api/matches/{m.match_id}/status", {"json": {"status": "scheduled"}}),
            ("get",    f"/api/tournaments/{t.tournament_id}/members", {}),
            # Regression: previously-unprotected endpoints
            ("post",   f"/api/players/events/{ev.event_id}/participants", {"params": {"player_id": p.player_id}}),
            ("post",   f"/api/events/{ev.event_id}/teams", {"params": {"team_id": 1}}),
            ("get",    f"/api/orgs/{org.org_id}/teams", {}),
            ("post",   f"/api/players/events/{ev.event_id}/groups", {"params": {"name": "Group A"}}),
        ]:
            r = getattr(client, method)(url, **kwargs)
            assert r.status_code == 403, f"{method.upper()} {url} → {r.status_code}: {r.text}"
    finally:
        app.dependency_overrides.clear()


def test_owner_and_superadmin_are_admin_without_membership_row(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        for who in ("owner", "superadmin"):
            _as(current, users, who)
            r = client.get(f"/api/orgs/tournaments/{t.tournament_id}/workspace")
            assert r.status_code == 200 and r.json()["my_role"] == "admin", (who, r.text)
            r = client.get(f"/api/tournaments/{t.tournament_id}/members")
            assert r.status_code == 200, (who, r.text)
    finally:
        app.dependency_overrides.clear()


def test_owner_listed_as_org_source_and_protected(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "t_admin")
        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        members = {mm["user_id"]: mm for mm in r.json()["members"]}
        owner_id = users["owner"].user_id
        assert members[owner_id]["source"] == "org"
        assert members[owner_id]["role"] == "admin"

        # Owners cannot be demoted or removed via this API
        r = client.patch(f"/api/tournaments/{t.tournament_id}/members/{owner_id}",
                         json={"role": "staff"})
        assert r.status_code == 400, r.text
        r = client.delete(f"/api/tournaments/{t.tournament_id}/members/{owner_id}")
        assert r.status_code == 400, r.text
    finally:
        app.dependency_overrides.clear()


def test_staff_can_leave_and_loses_access(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "t_staff")
        staff_id = users["t_staff"].user_id

        r = client.delete(f"/api/tournaments/{t.tournament_id}/members/{staff_id}")
        assert r.status_code == 200, r.text

        r = client.get(f"/api/orgs/tournaments/{t.tournament_id}/workspace")
        assert r.status_code == 403, r.text
    finally:
        app.dependency_overrides.clear()


def test_admin_can_promote_and_demote_invited_members(db):
    t, ev, m, p, org, users, current, client = _setup(db)
    try:
        _as(current, users, "owner")
        staff_id = users["t_staff"].user_id

        r = client.patch(f"/api/tournaments/{t.tournament_id}/members/{staff_id}",
                         json={"role": "admin"})
        assert r.status_code == 200 and r.json()["role"] == "admin"

        _as(current, users, "t_staff")  # now an admin
        r = client.get(f"/api/tournaments/{t.tournament_id}/members")
        assert r.status_code == 200, r.text

        _as(current, users, "owner")
        r = client.patch(f"/api/tournaments/{t.tournament_id}/members/{staff_id}",
                         json={"role": "staff"})
        assert r.status_code == 200 and r.json()["role"] == "staff"

        r = client.delete(f"/api/tournaments/{t.tournament_id}/members/{staff_id}")
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()
