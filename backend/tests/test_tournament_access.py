"""
Tournament authorization matrix.

  owner      — OrgMember of the owning org (admin)
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

    db.commit()

    current = {"user": owner}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current["user"]

    users = {"owner": owner,
             "outsider": outsider, "superadmin": superadmin}
    return t, ev, m, p, org, users, current, TestClient(app)


def _as(current, users, who):
    current["user"] = users[who]


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
    finally:
        app.dependency_overrides.clear()
