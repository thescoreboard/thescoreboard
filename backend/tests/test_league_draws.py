"""League (round-robin) draws/ties must be finishable; knockout level results must not."""
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
from app.models.event import Event
from app.models.group import EventParticipant
from app.models.organization import Organization, OrgMember
from app.models.player import Team
from app.models.tournament import Tournament
from app.models.user import User
from app.utils.auth import get_current_user, get_current_user_id
from app.utils.match_rules import requires_winner


def test_requires_winner_by_stage():
    for st in ("preliminary", "round_of_16", "quarter", "semi", "final", "third_place"):
        assert requires_winner(st)
    for st in ("round_robin", "group", None):
        assert not requires_winner(st)


@pytest.fixture()
def make():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autocommit=False, autoflush=False)()
    org = Organization(name="C", slug="c"); db.add(org); db.flush()
    u = User(email="o@x.com", name="O"); db.add(u); db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=u.user_id, role="admin"))
    t = Tournament(org_id=org.org_id, name="T", slug="t"); db.add(t); db.flush()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: u
    app.dependency_overrides[get_current_user_id] = lambda: u.user_id
    client = TestClient(app)

    def build(sport, fmt, n=4):
        ev = Event(tournament_id=t.tournament_id, name=sport, sport_key=sport, format=fmt,
                   participant_type="team", is_configured=True)
        db.add(ev); db.flush()
        for i in range(n):
            tm = Team(name=f"T{i}", org_id=org.org_id); db.add(tm); db.flush()
            db.add(EventParticipant(event_id=ev.event_id, team_id=tm.team_id))
        db.commit()
        assert client.post(f"/api/orgs/events/{ev.event_id}/generate-fixtures").status_code == 200
        return ev.event_id, client.get(f"/api/events/{ev.event_id}/matches").json()

    yield client, build
    app.dependency_overrides.clear(); db.close(); engine.dispose()


@pytest.mark.parametrize("score", [(1, 1), (0, 0)])
def test_football_league_draw_finishes(make, score):
    client, build = make
    _, ms = build("football", "round_robin")
    m = ms[0]; mid = m["match_id"]
    assert m["requires_winner"] is False
    client.patch(f"/api/matches/{mid}/status", json={"status": "live"})
    client.patch(f"/api/matches/{mid}/score", json={"score_p1": score[0], "score_p2": score[1]})
    r = client.post(f"/api/matches/{mid}/finish", json={})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done"
    assert not r.json()["player_1"]["is_winner"] and not r.json()["player_2"]["is_winner"]


def test_football_knockout_draw_blocked_until_settled(make):
    client, build = make
    _, ms = build("football", "direct_knockout")
    m = next(x for x in ms if x["stage"] == "semi"); mid = m["match_id"]
    assert m["requires_winner"] is True
    client.patch(f"/api/matches/{mid}/status", json={"status": "live"})
    client.patch(f"/api/matches/{mid}/score", json={"score_p1": 2, "score_p2": 2})
    assert client.post(f"/api/matches/{mid}/finish", json={}).status_code == 400
    assert client.post(f"/api/matches/{mid}/finish", json={"winner_position": 2}).status_code == 200


def _cricket_to_tie(client, mid):
    client.patch(f"/api/matches/{mid}/status", json={"status": "live"})
    client.patch(f"/api/matches/{mid}/score", json={"score_p1": 100, "score_p2": 8, "half": 1, "minute": 120,
                                                    "cricket_live_state": {"batting_first": 1}})
    client.post(f"/api/matches/{mid}/finish", json={})
    client.patch(f"/api/matches/{mid}/score", json={"score_p1": 100, "score_p2": 9, "half": 2, "minute": 120})
    return client.post(f"/api/matches/{mid}/finish", json={})


def test_cricket_league_tie_finishes(make):
    client, build = make
    _, ms = build("cricket", "round_robin")
    r = _cricket_to_tie(client, ms[0]["match_id"])
    assert r.status_code == 200 and r.json()["status"] == "done"


def test_cricket_knockout_tie_blocked(make):
    client, build = make
    _, ms = build("cricket", "direct_knockout")
    semi = next(x for x in ms if x["stage"] == "semi")
    assert _cricket_to_tie(client, semi["match_id"]).status_code == 400
