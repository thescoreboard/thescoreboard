"""Entries / groups / event PATCH are locked once fixtures exist (round-robin may still grow)."""
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
    r = c.post("/api/auth/register", json={"email": "a@t.com", "password": "Passw0rd!x", "name": "A"})
    H = {"Authorization": f"Bearer {r.json()['access_token']}"}
    org = c.post("/api/orgs/", json={"name": "A"}, headers=H).json()["org_id"]

    def event(sport, fmt, n):
        t = c.post(f"/api/orgs/{org}/tournaments", json={"name": "T", "events": [
            {"name": "E", "sport_key": sport, "format": fmt, "participant_type": "individual"}]}, headers=H).json()
        eid = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]["event_id"]
        ids = [enrol(eid) for _ in range(n)]
        return t, eid, ids

    def newplayer():
        return c.post(f"/api/players/?org_id={org}", json={"name": "P"}, headers=H).json()["player_id"]

    def enrol(eid):
        pid = newplayer()
        assert c.post(f"/api/players/events/{eid}/participants?player_id={pid}", headers=H).status_code == 200
        return pid

    yield c, H, org, event, newplayer
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def gen(c, H, eid):
    return c.post(f"/api/orgs/events/{eid}/generate-fixtures", headers=H)


def test_knockout_entries_close_after_fixtures(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "direct_knockout", 4)
    assert gen(c, H, eid).status_code == 200
    late = newplayer()
    assert c.post(f"/api/players/events/{eid}/participants?player_id={late}", headers=H).status_code == 409


def test_round_robin_can_still_grow(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "round_robin", 3)
    assert gen(c, H, eid).status_code == 200
    late = newplayer()
    assert c.post(f"/api/players/events/{eid}/participants?player_id={late}", headers=H).status_code == 200
    assert gen(c, H, eid).json()["matches_created"] == 3


def test_cannot_remove_participant_who_is_in_fixtures(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "round_robin", 3)
    assert c.delete(f"/api/players/events/{eid}/participants/{ids[0]}", headers=H).status_code == 200  # no fixtures yet
    ids[0] = None
    assert gen(c, H, eid).status_code == 200
    assert c.delete(f"/api/players/events/{eid}/participants/{ids[1]}", headers=H).status_code == 409


def test_event_patch_cannot_bypass_locks_or_enum(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "direct_knockout", 4)
    assert c.patch(f"/api/events/{eid}", json={"format": "swiss"}, headers=H).status_code == 400
    assert c.patch(f"/api/events/{eid}", json={"status": "banana"}, headers=H).status_code == 400
    assert c.patch(f"/api/events/{eid}", json={"name": "  "}, headers=H).status_code == 400
    assert c.patch(f"/api/events/{eid}", json={"format": "round_robin"}, headers=H).status_code == 200  # no fixtures yet
    assert gen(c, H, eid).status_code == 200
    assert c.patch(f"/api/events/{eid}", json={"format": "direct_knockout"}, headers=H).status_code == 409
    assert c.patch(f"/api/events/{eid}", json={"name": "Renamed"}, headers=H).status_code == 200


def test_group_assignment_locked_after_fixtures(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "group_knockout", 4)
    assert c.post(f"/api/events/{eid}/generate-groups?num_groups=2", headers=H).status_code == 200
    assert c.patch(f"/api/players/events/{eid}/participants/{ids[0]}", headers=H).status_code == 409   # clear group
