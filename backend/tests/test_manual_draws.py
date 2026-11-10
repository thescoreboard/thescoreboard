"""Manual draws: bracket order for direct knockout / championship, and the atomic manual group draw."""
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




def _wf(c, H, eid):
    return c.get(f"/api/orgs/events/{eid}/workspace", headers=H)


def test_manual_order_decides_round_one_and_byes(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "direct_knockout", 5)
    # byes first (3 of them), then the single preliminary pair
    order = [ids[4], ids[3], ids[2], ids[0], ids[1]]
    r = c.post(f"/api/orgs/events/{eid}/generate-fixtures?third_place=true", json={"order": order}, headers=H)
    assert r.status_code == 200, r.text
    ev = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]
    ms = ev["matches"]
    prelim = [m for m in ms if m["stage"] == "preliminary"]
    assert len(prelim) == 1
    assert {prelim[0]["player_1"]["player_id"], prelim[0]["player_2"]["player_id"]} == {ids[0], ids[1]}
    semis = sorted([m for m in ms if m["stage"] == "semi"], key=lambda m: m["match_id"])
    assert (semis[0]["player_1"]["player_id"], semis[0]["player_2"]["player_id"]) == (ids[4], ids[3])
    assert semis[1]["player_1"]["player_id"] == ids[2]
    assert semis[1]["player_2"]["player_id"] is None          # winner of the preliminary
    assert any(m["stage"] == "third_place" for m in ms)


def test_manual_order_must_include_everyone_once(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "direct_knockout", 5)
    url = f"/api/orgs/events/{eid}/generate-fixtures"
    assert c.post(url, json={"order": ids[:4]}, headers=H).status_code == 400            # one missing
    assert c.post(url, json={"order": ids[:4] + [ids[0]]}, headers=H).status_code == 400  # duplicate
    assert c.post(url, json={"order": ids[:4] + [999999]}, headers=H).status_code == 400  # stranger
    ws = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()
    assert ws["events"][0]["matches"] == []                                                # nothing written


def test_manual_groups_are_atomic_and_validated(world):
    c, H, org, event, newplayer = world
    t, eid, ids = event("table_tennis", "group_knockout", 5)
    url = f"/api/orgs/events/{eid}/manual-groups"
    g = lambda name, p: {"name": name, "participant_ids": p}
    # a group of one can never produce a group final
    assert c.post(url, json={"groups": [g("Group A", ids[:4]), g("Group B", ids[4:])]}, headers=H).status_code == 400
    # somebody left out
    assert c.post(url, json={"groups": [g("Group A", ids[:2]), g("Group B", ids[2:4])]}, headers=H).status_code == 400
    ws = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]
    assert ws["matches"] == [] and ws["groups"] == []
    r = c.post(url, json={"groups": [g("Group A", ids[:3]), g("Group B", ids[3:])]}, headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["matches_created"] == 2 + 1          # 3-team bracket (prelim+final) + 2-team final
    ws = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]
    assert [x["name"] for x in ws["groups"]] == ["Group A", "Group B"]
