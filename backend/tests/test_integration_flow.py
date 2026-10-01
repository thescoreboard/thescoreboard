"""
End-to-end integration test through the real HTTP API:

  badminton group_knockout with 8 players
  → generate groups (2 × 4, mini-brackets)
  → knockout generation REFUSED while group finals are unplayed
  → play out the group stage (walkovers)
  → generate championship: cross-paired seeding (champion vs other group's
    runner-up, never champion-vs-champion or a group rematch in round 1)
  → play semis → final fills via stage-keyed advancement
  → outsiders get 403 on score endpoints
"""
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
from app.models.player import Player
from app.models.tournament import Tournament
from app.models.user import User
from app.utils.auth import get_current_user, get_current_user_id


@pytest.fixture()
def ctx():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db = Session()

    org = Organization(name="Club", slug="club")
    db.add(org); db.flush()
    organiser = User(email="org@x.com", name="Organiser")
    outsider  = User(email="out@x.com", name="Outsider")
    db.add_all([organiser, outsider]); db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=organiser.user_id, role="admin"))
    t = Tournament(org_id=org.org_id, name="Open", slug="open")
    db.add(t); db.flush()
    ev = Event(tournament_id=t.tournament_id, name="BD Singles",
               sport_key="badminton", format="group_knockout", is_configured=True)
    db.add(ev); db.flush()

    players = []
    for i in range(1, 9):
        p = Player(name=f"P{i}", org_id=org.org_id)
        db.add(p); db.flush()
        db.add(EventParticipant(event_id=ev.event_id, player_id=p.player_id))
        players.append(p)
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: organiser
    app.dependency_overrides[get_current_user_id] = lambda: organiser.user_id

    yield {
        "db": db, "event": ev, "organiser": organiser, "outsider": outsider,
        "players": {p.player_id: p.name for p in players},
        "client": TestClient(app),
    }

    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def _matches(client, eid):
    r = client.get(f"/api/events/{eid}/matches")
    assert r.status_code == 200, r.text
    return r.json()


def _walkover_all_playable(client, eid):
    """Walk over every scheduled 2-player match until none remain (pos 1 wins)."""
    for _ in range(20):
        pending = [
            m for m in _matches(client, eid)
            if m["status"] == "scheduled"
            and m["player_1"]["player_id"] and m["player_2"]["player_id"]
        ]
        if not pending:
            return
        for m in pending:
            r = client.post(f"/api/matches/{m['match_id']}/walkover?winner_position=1")
            assert r.status_code == 200, r.text
    raise AssertionError("group stage never completed")


def test_full_group_knockout_flow(ctx):
    client, eid = ctx["client"], ctx["event"].event_id

    # ── Phase 1: groups ──
    r = client.post(f"/api/events/{eid}/generate-groups?num_groups=2")
    assert r.status_code == 200, r.text
    assert r.json()["groups_created"] == 2
    assert r.json()["matches_created"] == 6          # (2 semi + 1 final) × 2

    # ── Knockout generation must be REFUSED before group finals are done ──
    r = client.post(f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group=2")
    assert r.status_code == 400
    assert "completed final" in r.json()["detail"]

    # ── Play out the group stage ──
    _walkover_all_playable(client, eid)
    group_finals = [m for m in _matches(client, eid)
                    if m["group_id"] and m["stage"] == "final"]
    assert len(group_finals) == 2
    assert all(m["status"] == "done" for m in group_finals)

    champions  = {m["group_id"]: (m["player_1"] if m["player_1"]["is_winner"] else m["player_2"])["player_id"] for m in group_finals}
    runners_up = {m["group_id"]: (m["player_2"] if m["player_1"]["is_winner"] else m["player_1"])["player_id"] for m in group_finals}

    # ── Phase 2: championship ──
    r = client.post(f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group=2")
    assert r.status_code == 200, r.text
    assert r.json()["qualifiers"] == 4
    assert r.json()["matches_created"] == 3          # 2 semis + final

    db = ctx["db"]
    ko = [m for m in _matches(client, eid) if not m["group_id"]]
    semis = [m for m in ko if m["stage"] == "semi"]
    final = next(m for m in ko if m["stage"] == "final")
    assert len(semis) == 2

    # Seeding: every semi is champion vs the OTHER group's runner-up
    group_of = {}
    for gid, pid in champions.items():  group_of[pid] = (gid, "champ")
    for gid, pid in runners_up.items(): group_of[pid] = (gid, "runner")
    for s in semis:
        a = group_of[s["player_1"]["player_id"]]
        b = group_of[s["player_2"]["player_id"]]
        assert a[0] != b[0], "group-mates rematch in championship round 1"
        assert {a[1], b[1]} == {"champ", "runner"}, "champion meets champion in round 1"

    # ── qualifiers_per_group > 2 must be rejected ──
    r = client.post(f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group=3")
    assert r.status_code == 400

    # ── Play the semis → the final must fill via stage-keyed advancement ──
    for s in semis:
        r = client.post(f"/api/matches/{s['match_id']}/walkover?winner_position=1")
        assert r.status_code == 200, r.text
    final = next(m for m in _matches(client, eid) if not m["group_id"] and m["stage"] == "final")
    assert final["player_1"]["player_id"] is not None
    assert final["player_2"]["player_id"] is not None

    # ── Real badminton scoring on the final: 21-15, 21-18 → done ──
    fid = final["match_id"]
    assert client.patch(f"/api/matches/{fid}/status", json={"status": "live"}).status_code == 200
    assert client.patch(f"/api/matches/{fid}/score", json={"score_p1": 21, "score_p2": 15}).status_code == 200
    r = client.patch(f"/api/matches/{fid}/score", json={"score_p1": 21, "score_p2": 18})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "done"
    assert body["player_1"]["is_winner"] is True
    assert body["player_1"]["score"] == 2            # sets won


def test_outsider_gets_403_on_score_endpoints(ctx):
    client, eid = ctx["client"], ctx["event"].event_id
    client.post(f"/api/events/{eid}/generate-groups?num_groups=2")
    m = next(m for m in _matches(client, eid)
             if m["player_1"]["player_id"] and m["player_2"]["player_id"])

    # Re-point auth at a user who is NOT a member of the organization
    app.dependency_overrides[get_current_user] = lambda: ctx["outsider"]

    assert client.patch(f"/api/matches/{m['match_id']}/score",
                        json={"score_p1": 5, "score_p2": 0}).status_code == 403
    assert client.post(f"/api/matches/{m['match_id']}/walkover?winner_position=1").status_code == 403
    assert client.delete(f"/api/matches/{m['match_id']}").status_code == 403
    assert client.patch(f"/api/matches/{m['match_id']}/status",
                        json={"status": "live"}).status_code == 403
