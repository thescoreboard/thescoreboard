"""Finished matches are immutable except through Rematch / Undo; bracket stays consistent."""
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

    def build(sport, fmt, ptype, n):
        t = c.post(f"/api/orgs/{org}/tournaments", json={"name": "T", "events": [
            {"name": "E", "sport_key": sport, "format": fmt, "participant_type": ptype}]}, headers=H).json()
        eid = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]["event_id"]
        for i in range(n):
            if ptype == "team":
                x = c.post(f"/api/orgs/{org}/teams", json={"name": f"T{i}"}, headers=H).json()["team_id"]
                c.post(f"/api/events/{eid}/teams?team_id={x}", headers=H)
            else:
                x = c.post(f"/api/players/?org_id={org}", json={"name": f"P{i}"}, headers=H).json()["player_id"]
                c.post(f"/api/players/events/{eid}/participants?player_id={x}", headers=H)
        assert c.post(f"/api/orgs/events/{eid}/generate-fixtures", headers=H).status_code == 200
        return t, eid, c.get(f"/api/events/{eid}/matches", headers=H).json()

    yield c, H, build
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def _score(c, H, mid, a, b):
    return c.patch(f"/api/matches/{mid}/score", json={"score_p1": a, "score_p2": b}, headers=H)


def _finish_football(c, H, mid, a, b, winner=None):
    c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=H)
    _score(c, H, mid, a, b)
    return c.post(f"/api/matches/{mid}/finish", json={} if winner is None else {"winner_position": winner}, headers=H)


def test_done_match_cannot_be_rescored_refinished_or_status_changed(world):
    c, H, build = world
    _, eid, ms = build("football", "round_robin", "team", 3)
    mid = ms[0]["match_id"]
    assert _finish_football(c, H, mid, 2, 1).status_code == 200
    assert _score(c, H, mid, 0, 5).status_code == 409
    assert c.post(f"/api/matches/{mid}/finish", json={"winner_position": 2}, headers=H).status_code == 409
    assert c.patch(f"/api/matches/{mid}/status", json={"status": "scheduled"}, headers=H).status_code == 409
    m = c.get(f"/api/matches/{mid}", headers=H).json()
    assert m["player_1"]["is_winner"] and m["player_1"]["score"] == 2        # unchanged


def test_status_cannot_be_set_to_done_via_patch(world):
    c, H, build = world
    _, eid, ms = build("football", "round_robin", "team", 3)
    assert c.patch(f"/api/matches/{ms[0]['match_id']}/status", json={"status": "done"}, headers=H).status_code == 400
    assert c.patch(f"/api/matches/{ms[0]['match_id']}/status", json={"status": "banana"}, headers=H).status_code == 400


def test_rematch_is_the_way_to_change_a_result(world):
    c, H, build = world
    _, eid, ms = build("football", "round_robin", "team", 3)
    mid = ms[0]["match_id"]
    _finish_football(c, H, mid, 2, 1)
    assert c.post(f"/api/matches/{mid}/rematch", headers=H).status_code == 200
    assert _finish_football(c, H, mid, 0, 3).status_code == 200
    assert c.get(f"/api/matches/{mid}", headers=H).json()["player_2"]["is_winner"]


def test_undo_on_finished_tt_match_reopens_it_cleanly(world):
    c, H, build = world
    _, eid, ms = build("table_tennis", "round_robin", "individual", 2)
    mid = ms[0]["match_id"]
    c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=H)
    _score(c, H, mid, 11, 2); _score(c, H, mid, 11, 2)
    assert c.get(f"/api/matches/{mid}", headers=H).json()["status"] == "done"
    r = c.post(f"/api/matches/{mid}/undo-set", headers=H)
    assert r.status_code == 200
    m = c.get(f"/api/matches/{mid}", headers=H).json()
    assert m["status"] == "live"
    assert not m["player_1"]["is_winner"] and not m["player_2"]["is_winner"]
    assert m["player_1"]["score"] == 1 and m["player_2"]["score"] == 0
    assert m["sets"][-1]["is_complete"] is False
    st = c.get(f"/api/events/{eid}/standings").json()["groups"][0]["rows"]
    assert all(row["wins"] == 0 for row in st)
    # and the match can be completed again
    _score(c, H, mid, 11, 5)
    assert c.get(f"/api/matches/{mid}", headers=H).json()["status"] == "done"


def test_undo_response_matches_database_when_a_set_is_removed(world):
    c, H, build = world
    _, eid, ms = build("table_tennis", "round_robin", "individual", 2)
    mid = ms[0]["match_id"]
    c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=H)
    _score(c, H, mid, 11, 5)
    r1 = c.post(f"/api/matches/{mid}/undo-set", headers=H).json()    # clears (empty) set 2? -> removes it
    fresh = c.get(f"/api/matches/{mid}", headers=H).json()
    assert [s["set_number"] for s in r1["sets"]] == [s["set_number"] for s in fresh["sets"]]


def test_deleting_done_bracket_match_retracts_or_refuses(world):
    c, H, build = world
    _, eid, ms = build("table_tennis", "direct_knockout", "individual", 4)
    semis = [m for m in ms if m["stage"] == "semi"]
    c.post(f"/api/matches/{semis[0]['match_id']}/walkover?winner_position=1", headers=H)
    final = next(m for m in c.get(f"/api/events/{eid}/matches", headers=H).json() if m["stage"] == "final")
    assert final["player_1"]["player_id"] or final["player_2"]["player_id"]
    assert c.delete(f"/api/matches/{semis[0]['match_id']}", headers=H).status_code == 200
    final = next(m for m in c.get(f"/api/events/{eid}/matches", headers=H).json() if m["stage"] == "final")
    assert final["player_1"]["player_id"] is None and final["player_2"]["player_id"] is None   # winner pulled back out


def test_cannot_complete_tournament_with_unfinished_playable_matches(world):
    c, H, build = world
    t, eid, ms = build("football", "round_robin", "team", 3)
    tid = t["tournament_id"]
    assert c.post(f"/api/orgs/tournaments/{tid}/transition?target_status=live", headers=H).status_code == 200
    assert c.post(f"/api/orgs/tournaments/{tid}/transition?target_status=completed", headers=H).status_code == 409
    for m in ms:
        assert _finish_football(c, H, m["match_id"], 1, 0).status_code == 200
    assert c.post(f"/api/orgs/tournaments/{tid}/transition?target_status=completed", headers=H).status_code == 200
