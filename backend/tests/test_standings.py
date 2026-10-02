"""One standings implementation: points rules, tie-breaks, per-sport aggregates (via the real HTTP API)."""
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
from app.routers import tournaments


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
    tournaments._standings_cache.clear()
    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": "a@t.com", "password": "Passw0rd!x", "name": "A"})
    H = {"Authorization": f"Bearer {r.json()['access_token']}"}
    org = c.post("/api/orgs/", json={"name": "A"}, headers=H).json()["org_id"]

    def build(sport, fmt="round_robin", ptype="team", n=3, cfg=None, names=None):
        ev = {"name": "E", "sport_key": sport, "format": fmt, "participant_type": ptype}
        if cfg:
            ev["sport_config"] = cfg
        t = c.post(f"/api/orgs/{org}/tournaments", json={"name": "T", "events": [ev]}, headers=H).json()
        eid = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]["event_id"]
        ids = {}
        for i in range(n):
            nm = (names or "ABCDEFGH")[i]
            if ptype == "team":
                x = c.post(f"/api/orgs/{org}/teams", json={"name": nm}, headers=H).json()["team_id"]
                c.post(f"/api/events/{eid}/teams?team_id={x}", headers=H)
            else:
                x = c.post(f"/api/players/?org_id={org}", json={"name": nm}, headers=H).json()["player_id"]
                c.post(f"/api/players/events/{eid}/participants?player_id={x}", headers=H)
            ids[nm] = x
        assert c.post(f"/api/orgs/events/{eid}/generate-fixtures", headers=H).status_code == 200 or fmt == "group_knockout"
        ms = c.get(f"/api/events/{eid}/matches", headers=H).json()
        key = "team_id" if ptype == "team" else "player_id"

        def find(a, b):
            for m in ms:
                if {m["player_1"][key], m["player_2"][key]} == {ids[a], ids[b]}:
                    return m["match_id"], m["player_1"][key] == ids[a]
            raise KeyError((a, b))
        return eid, find

    def table(eid):
        tournaments._standings_cache.clear()
        rows = c.get(f"/api/events/{eid}/standings").json()["groups"][0]["rows"]
        return {r["name"]: r for r in rows}, [r["name"] for r in rows]

    yield c, H, build, table
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def football(c, H, mid, g1, g2):
    c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=H)
    c.patch(f"/api/matches/{mid}/score", json={"score_p1": g1, "score_p2": g2}, headers=H)
    return c.post(f"/api/matches/{mid}/finish", json={}, headers=H)


def test_football_points_draws_and_goal_difference(world):
    c, H, build, table = world
    eid, find = build("football", n=3)
    m, a_first = find("A", "B")
    football(c, H, m, *((3, 1) if a_first else (1, 3)))                                    # A 3-1 B
    m, _ = find("B", "C")
    football(c, H, m, 2, 2)                                                                # B 2-2 C
    m, _ = find("A", "C")
    c.patch(f"/api/matches/{m}/status", json={"status": "live"}, headers=H)                # live: must not count
    c.patch(f"/api/matches/{m}/score", json={"score_p1": 5, "score_p2": 0}, headers=H)
    t, order = table(eid)
    assert (t["A"]["played"], t["A"]["wins"], t["A"]["points"], t["A"]["scored"], t["A"]["conceded"], t["A"]["diff"]) == (1, 1, 3, 3, 1, 2)
    assert (t["B"]["draws"], t["B"]["losses"], t["B"]["points"]) == (1, 1, 1)
    assert (t["C"]["draws"], t["C"]["points"], t["C"]["played"]) == (1, 1, 1)
    assert order[0] == "A"
    assert t["A"]["ranking_points"] == t["A"]["points"] and t["A"]["matches_played"] == 1     # legacy keys


def test_football_tiebreak_goal_difference(world):
    c, H, build, table = world
    eid, find = build("football", n=4)
    m, f = find("A", "D")
    football(c, H, m, *((4, 0) if f else (0, 4)))
    m, f = find("B", "C")
    football(c, H, m, *((1, 0) if f else (0, 1)))
    t, order = table(eid)
    assert t["A"]["points"] == t["B"]["points"] == 3
    assert order.index("A") < order.index("B")          # +4 beats +1


def test_zero_played_participants_listed(world):
    c, H, build, table = world
    eid, find = build("football", n=3)
    t, order = table(eid)
    assert set(t) == {"A", "B", "C"} and all(r["played"] == 0 and r["points"] == 0 for r in t.values())


def test_cricket_runs_nrr_and_ties(world):
    c, H, build, table = world
    eid, find = build("cricket", n=3, cfg={"overs": 10})
    m, a_first = find("A", "B")
    bf = 1 if a_first else 2          # A bats first
    c.patch(f"/api/matches/{m}/status", json={"status": "live"}, headers=H)
    c.patch(f"/api/matches/{m}/score", json={"score_p1": 100, "score_p2": 4, "half": 1, "minute": 60,
                                             "cricket_live_state": {"batting_first": bf}}, headers=H)
    c.post(f"/api/matches/{m}/finish", json={}, headers=H)
    c.patch(f"/api/matches/{m}/score", json={"score_p1": 80, "score_p2": 10, "half": 2, "minute": 54}, headers=H)   # all out
    assert c.post(f"/api/matches/{m}/finish", json={}, headers=H).status_code == 200
    # tie: B v C
    m2, b_first = find("B", "C")
    bf2 = 1 if b_first else 2
    c.patch(f"/api/matches/{m2}/status", json={"status": "live"}, headers=H)
    c.patch(f"/api/matches/{m2}/score", json={"score_p1": 60, "score_p2": 3, "half": 1, "minute": 60,
                                              "cricket_live_state": {"batting_first": bf2}}, headers=H)
    c.post(f"/api/matches/{m2}/finish", json={}, headers=H)
    c.patch(f"/api/matches/{m2}/score", json={"score_p1": 60, "score_p2": 5, "half": 2, "minute": 60}, headers=H)
    assert c.post(f"/api/matches/{m2}/finish", json={}, headers=H).status_code == 200

    t, order = table(eid)
    # A: 100 runs in 10 ov; conceded 80 in 10 ov (all out => full quota)
    assert (t["A"]["scored"], t["A"]["conceded"], t["A"]["points"], t["A"]["wins"]) == (100, 80, 2, 1)
    assert t["A"]["nrr"] == pytest.approx(100 / 10 - 80 / 10, abs=1e-3)
    # B: lost to A, then tied C -> 1 point; runs = 80 + 60 for, 100 + 60 against
    assert (t["B"]["scored"], t["B"]["conceded"], t["B"]["points"], t["B"]["draws"], t["B"]["losses"]) == (140, 160, 1, 1, 1)
    assert t["C"]["points"] == 1 and t["C"]["draws"] == 1
    assert order[0] == "A"


def test_cricket_chasing_team_nrr_uses_overs_actually_faced(world):
    c, H, build, table = world
    eid, find = build("cricket", n=2, cfg={"overs": 20})
    m, a_first = find("A", "B")
    bf = 1 if a_first else 2
    c.patch(f"/api/matches/{m}/status", json={"status": "live"}, headers=H)
    c.patch(f"/api/matches/{m}/score", json={"score_p1": 120, "score_p2": 6, "half": 1, "minute": 120,
                                             "cricket_live_state": {"batting_first": bf}}, headers=H)
    c.post(f"/api/matches/{m}/finish", json={}, headers=H)
    c.patch(f"/api/matches/{m}/score", json={"score_p1": 121, "score_p2": 2, "half": 2, "minute": 90}, headers=H)  # chased in 15 ov
    c.post(f"/api/matches/{m}/finish", json={}, headers=H)
    t, _ = table(eid)
    assert t["B"]["wins"] == 1
    assert t["B"]["nrr"] == pytest.approx(121 / 15 - 120 / 20, abs=1e-3)


def test_table_tennis_sets_and_walkover(world):
    c, H, build, table = world
    eid, find = build("table_tennis", ptype="individual", n=3)
    m, a_first = find("A", "B")
    c.patch(f"/api/matches/{m}/status", json={"status": "live"}, headers=H)
    for _ in range(2):
        c.patch(f"/api/matches/{m}/score", json={"score_p1": 11 if a_first else 5, "score_p2": 5 if a_first else 11}, headers=H)
    m2, b_first = find("B", "C")
    assert c.post(f"/api/matches/{m2}/walkover?winner_position={2 if b_first else 1}", headers=H).status_code == 200   # C wins by walkover
    t, order = table(eid)
    assert (t["A"]["wins"], t["A"]["points"], t["A"]["sets_won"], t["A"]["sets_lost"], t["A"]["points_for"], t["A"]["points_against"]) == (1, 2, 2, 0, 22, 10)
    assert (t["C"]["wins"], t["C"]["points"]) == (1, 2)
    assert t["C"]["sets_won"] == 0 and t["C"]["points_for"] == 0          # placeholder walkover scores ignored
    assert (t["B"]["losses"], t["B"]["played"]) == (2, 2)


def test_group_knockout_splits_by_group(world):
    c, H, build, table = world
    eid, _ = build("badminton", fmt="group_knockout", ptype="individual", n=4)
    assert c.post(f"/api/events/{eid}/generate-groups?num_groups=2", headers=H).status_code == 200
    tournaments._standings_cache.clear()
    groups = c.get(f"/api/events/{eid}/standings").json()["groups"]
    assert len(groups) == 2 and all(len(g["rows"]) == 2 for g in groups)
