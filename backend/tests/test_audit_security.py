"""Regression tests for the audit's security findings (real JWT auth, real routes)."""
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    S = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def _db():
        d = S()
        try:
            yield d
        finally:
            d.close()
    app.dependency_overrides[get_db] = _db
    c = TestClient(app)

    def user(email):
        r = c.post("/api/auth/register", json={"email": email, "password": "Passw0rd!x", "name": email})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    A, B = user("a@t.com"), user("b@t.com")
    org_a = c.post("/api/orgs/", json={"name": "A"}, headers=A).json()["org_id"]
    org_b = c.post("/api/orgs/", json={"name": "B"}, headers=B).json()["org_id"]

    def tour(h, org, sport="football", ptype="team", name="T"):
        t = c.post(f"/api/orgs/{org}/tournaments", json={"name": name, "events": [
            {"name": "E", "sport_key": sport, "format": "round_robin", "participant_type": ptype}]}, headers=h).json()
        eid = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=h).json()["events"][0]["event_id"]
        return t, eid

    yield c, A, B, org_a, org_b, tour
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_cannot_delete_other_users_player_profile(world):
    c, A, B, *_ = world
    pid = c.put("/api/auth/player-profile", json={"name": "Vic", "phone": "1"}, headers=A).json()["player_id"]
    assert c.delete(f"/api/players/{pid}", headers=B).status_code == 403
    assert c.delete(f"/api/players/{pid}", headers=A).status_code == 200


def test_orphaned_team_not_deletable_by_anyone_and_org_delete_cleans_up(world):
    c, A, B, org_a, org_b, tour = world
    tid = c.post(f"/api/orgs/{org_a}/teams", json={"name": "X", "contact_phone": "9"}, headers=A).json()["team_id"]
    pid = c.post(f"/api/players/?org_id={org_a}", json={"name": "P", "phone": "9"}, headers=A).json()["player_id"]
    assert c.delete(f"/api/orgs/{org_a}", headers=A).status_code == 200
    # nothing left behind to be orphaned
    assert c.delete(f"/api/teams/{tid}", headers=B).status_code == 404
    assert c.delete(f"/api/players/{pid}", headers=B).status_code == 404


def test_public_roster_hides_contact_details_from_non_staff(world):
    c, A, B, org_a, org_b, tour = world
    t, eid = tour(A, org_a)
    tm = c.post(f"/api/orgs/{org_a}/teams", json={"name": "X", "contact_phone": "999", "contact_name": "Bob",
                                                   "members": [{"name": "m", "age": 15}]}, headers=A).json()["team_id"]
    assert c.post(f"/api/events/{eid}/teams?team_id={tm}", headers=A).status_code == 200
    pub = c.get(f"/api/events/{eid}/teams").json()[0]["team"]
    assert pub["contact_phone"] is None and pub["members"][0]["age"] is None
    assert pub["name"] == "X" and pub["members"][0]["name"] == "m"
    assert c.get(f"/api/events/{eid}/teams", headers=B).json()[0]["team"]["contact_phone"] is None
    assert c.get(f"/api/events/{eid}/teams", headers=A).json()[0]["team"]["contact_phone"] == "999"


def test_enrolment_guards(world):
    c, A, B, org_a, org_b, tour = world
    t, eid = tour(A, org_a)
    foreign = c.post(f"/api/orgs/{org_b}/teams", json={"name": "F"}, headers=B).json()["team_id"]
    assert c.post(f"/api/events/{eid}/teams?team_id={foreign}", headers=A).status_code == 403
    assert c.post(f"/api/events/{eid}/teams?team_id=99999", headers=A).status_code == 404
    mine = c.post(f"/api/orgs/{org_a}/teams", json={"name": "M"}, headers=A).json()["team_id"]
    assert c.post(f"/api/events/{eid}/teams?team_id={mine}&group_id=9999", headers=A).status_code == 404
    p = c.post(f"/api/players/?org_id={org_a}", json={"name": "P"}, headers=A).json()["player_id"]
    assert c.post(f"/api/players/events/{eid}/participants?player_id={p}", headers=A).status_code == 400  # team event
    t2, e2 = tour(A, org_a, sport="table_tennis", ptype="individual", name="T2")
    pf = c.post(f"/api/players/?org_id={org_b}", json={"name": "PF"}, headers=B).json()["player_id"]
    assert c.post(f"/api/players/events/{e2}/participants?player_id={pf}", headers=A).status_code == 403
    assert c.post(f"/api/players/events/{e2}/participants?player_id={p}", headers=A).status_code == 200


def test_draft_tournament_not_public_until_published(world):
    c, A, B, org_a, org_b, tour = world
    t, eid = tour(A, org_a)
    assert c.get(f"/api/public/t/{t['slug']}").status_code == 404
    assert c.post(f"/api/orgs/tournaments/{t['tournament_id']}/transition?target_status=live", headers=A).status_code == 200
    assert c.get(f"/api/public/t/{t['slug']}").status_code == 200
