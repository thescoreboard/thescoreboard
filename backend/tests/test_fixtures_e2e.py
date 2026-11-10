"""
End-to-end fixture tests over the real HTTP API, for every format and every
participant count we care about (odd and even):

  * direct knockout — automatic and manual draws, n = 2..20
  * round robin     — n = 2..9, late joiners, partial fixtures
  * group + knockout — automatic and manual group draws, uneven group sizes,
                       1 or 2 qualifiers per group, automatic and manual
                       championship, played through to a champion
  * validation / guard rails

Every scenario is played to the end through the real scoring endpoints, so the
winner-advancement code is exercised exactly as in production.
"""
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

import itertools
import random

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.sports.bracket import stage_for_size  # noqa: F401  (documents the stage names)


# ── World ─────────────────────────────────────────────────────

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

    class W:
        pass

    w = W()
    w.c, w.H, w.org = c, H, org

    def new_event(sport, fmt, n):
        ptype = "team" if sport == "football" else "individual"
        t = c.post(f"/api/orgs/{org}/tournaments", json={"name": "T", "events": [
            {"name": "E", "sport_key": sport, "format": fmt, "participant_type": ptype}]}, headers=H).json()
        eid = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=H).json()["events"][0]["event_id"]
        ids = [w.enrol(eid, sport, i) for i in range(n)]
        return t, eid, ids

    def enrol(eid, sport, i):
        if sport == "football":
            x = c.post(f"/api/orgs/{org}/teams", json={"name": f"T{i}"}, headers=H).json()["team_id"]
            assert c.post(f"/api/events/{eid}/teams?team_id={x}", headers=H).status_code == 200
        else:
            x = c.post(f"/api/players/?org_id={org}", json={"name": f"P{i}"}, headers=H).json()["player_id"]
            assert c.post(f"/api/players/events/{eid}/participants?player_id={x}", headers=H).status_code == 200
        return x

    def matches(eid):
        return c.get(f"/api/events/{eid}/matches", headers=H).json()

    def pid(p):
        return None if not p else (p.get("team_id") or p.get("player_id"))

    def play_one(m, sport, win):
        mid = m["match_id"]
        c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=H)
        if sport == "football":
            a, b = (1, 0) if win == 1 else (0, 1)
            c.patch(f"/api/matches/{mid}/score", json={"score_p1": a, "score_p2": b}, headers=H)
            r = c.post(f"/api/matches/{mid}/finish", json={}, headers=H)
            assert r.status_code == 200, r.text
        else:
            for _ in range(2):
                a, b = (11, 2) if win == 1 else (2, 11)
                c.patch(f"/api/matches/{mid}/score", json={"score_p1": a, "score_p2": b}, headers=H)

    def play_all(eid, sport, rng, only=None):
        """Play every playable match (both sides known) until nothing is left.
        `only(m)` can restrict which matches get played (e.g. group stage only)."""
        for _ in range(500):
            ms = matches(eid)
            todo = [m for m in ms
                    if m["status"] != "done" and pid(m["player_1"]) and pid(m["player_2"])
                    and (only is None or only(m))]
            if not todo:
                return ms
            todo.sort(key=lambda m: (m["round"], m["match_id"]))
            play_one(todo[0], sport, rng.choice([1, 2]))
        raise AssertionError("bracket never settled")

    w.new_event, w.enrol, w.matches, w.pid, w.play_all, w.play_one = new_event, enrol, matches, pid, play_all, play_one
    w.gen = lambda eid, third=True, order=None: c.post(
        f"/api/orgs/events/{eid}/generate-fixtures{'?third_place=true' if third else ''}",
        json={"order": order} if order else None, headers=H)
    yield w
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


SPORTS = ["football", "table_tennis"]          # team events and individual events


# ── shared assertions ─────────────────────────────────────────

def check_complete_bracket(w, eid, ids, third=True):
    """Everything played, a champion exists, 3rd place got the semi losers."""
    ms = w.matches(eid)
    assert ms and all(m["status"] == "done" for m in ms), \
        [(m["stage"], m["round"], m["status"]) for m in ms if m["status"] != "done"]
    for m in ms:
        assert w.pid(m["player_1"]) and w.pid(m["player_2"]), f"match {m['match_id']} ended up with an empty slot"
    final = next(m for m in ms if m["stage"] == "final")
    champion = w.pid(final["player_1"]) if final["player_1"]["is_winner"] else w.pid(final["player_2"])
    assert champion in ids
    if third and len(ids) >= 4:
        semis = [m for m in ms if m["stage"] == "semi"]
        tp = next(m for m in ms if m["stage"] == "third_place")
        losers = {w.pid(s["player_2"]) if s["player_1"]["is_winner"] else w.pid(s["player_1"]) for s in semis}
        assert {w.pid(tp["player_1"]), w.pid(tp["player_2"])} == losers
    return champion


# ══════════════════════════════════════════════════════════════
# DIRECT KNOCKOUT
# ══════════════════════════════════════════════════════════════

@pytest.mark.parametrize("sport", SPORTS)
@pytest.mark.parametrize("n", range(2, 21))
def test_direct_knockout_auto_draw_plays_to_a_champion(world, sport, n):
    w = world
    t, eid, ids = w.new_event(sport, "direct_knockout", n)
    r = w.gen(eid)
    assert r.status_code == 200, r.text
    expected = (n - 1) + (1 if n >= 4 else 0)
    assert r.json()["matches_created"] == expected

    ms = w.matches(eid)
    seated = [w.pid(p) for m in ms for p in (m["player_1"], m["player_2"]) if w.pid(p)]
    assert sorted(seated) == sorted(ids), "every participant is seated exactly once at the start"

    w.play_all(eid, sport, random.Random(n))
    check_complete_bracket(w, eid, ids)


@pytest.mark.parametrize("n", range(2, 14))
def test_direct_knockout_manual_draw_is_honoured_and_completes(world, n):
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", n)
    rng = random.Random(n)
    order = ids[:]
    rng.shuffle(order)
    assert w.gen(eid, order=order).status_code == 200

    size = 1 << (n - 1).bit_length()
    byes = size - n
    ms = w.matches(eid)
    first = sorted([m for m in ms if m["round"] == 1], key=lambda m: m["match_id"])
    r1_players = order[byes:]
    assert [(w.pid(m["player_1"]), w.pid(m["player_2"])) for m in first] == \
        list(zip(r1_players[0::2], r1_players[1::2]))
    if byes:
        round2 = sorted([m for m in ms if m["round"] == 2 and m["stage"] != "third_place"], key=lambda m: m["match_id"])
        seated = [w.pid(p) for m in round2 for p in (m["player_1"], m["player_2"]) if w.pid(p)]
        assert seated == order[:byes], "bye teams sit in round 2, in the order chosen"

    w.play_all(eid, "football", rng)
    check_complete_bracket(w, eid, ids)


def test_direct_knockout_needs_two_participants(world):
    w = world
    for n in (0, 1):
        t, eid, ids = w.new_event("football", "direct_knockout", n)
        assert w.gen(eid).status_code == 400


def test_direct_knockout_cannot_be_redrawn_once_a_match_started(world):
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", 5)
    assert w.gen(eid).status_code == 200
    # re-drawing before anything is played is fine, automatically or manually
    assert w.gen(eid).status_code == 200
    assert w.gen(eid, order=ids[::-1]).status_code == 200
    m = next(m for m in w.matches(eid) if w.pid(m["player_1"]) and w.pid(m["player_2"]))
    w.c.patch(f"/api/matches/{m['match_id']}/status", json={"status": "live"}, headers=w.H)
    assert w.gen(eid).status_code == 400
    assert w.gen(eid, order=ids).status_code == 400


def test_direct_knockout_third_place_flag_is_respected(world):
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", 6)
    w.gen(eid, third=False)
    assert not any(m["stage"] == "third_place" for m in w.matches(eid))
    w.gen(eid, third=True)
    assert sum(m["stage"] == "third_place" for m in w.matches(eid)) == 1


def test_three_team_bracket_has_no_third_place_match(world):
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", 3)
    w.gen(eid, third=True)
    assert not any(m["stage"] == "third_place" for m in w.matches(eid))


def test_rematch_after_a_result_re_routes_the_bracket(world):
    """Changing a semi-final result must move the right team into the final."""
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", 4)
    w.gen(eid)
    semis = sorted([m for m in w.matches(eid) if m["stage"] == "semi"], key=lambda m: m["match_id"])
    w.play_one(semis[0], "football", 1)
    final = next(m for m in w.matches(eid) if m["stage"] == "final")
    first_winner = w.pid(final["player_1"])
    assert first_winner == w.pid(semis[0]["player_1"])
    assert w.c.post(f"/api/matches/{semis[0]['match_id']}/rematch", headers=w.H).status_code == 200
    final = next(m for m in w.matches(eid) if m["stage"] == "final")
    assert w.pid(final["player_1"]) is None                       # retracted
    w.play_one(semis[0], "football", 2)
    final = next(m for m in w.matches(eid) if m["stage"] == "final")
    assert w.pid(final["player_1"]) == w.pid(semis[0]["player_2"])


# ══════════════════════════════════════════════════════════════
# ROUND ROBIN
# ══════════════════════════════════════════════════════════════

@pytest.mark.parametrize("sport", SPORTS)
@pytest.mark.parametrize("n", range(2, 10))
def test_round_robin_every_pair_plays_once(world, sport, n):
    w = world
    t, eid, ids = w.new_event(sport, "round_robin", n)
    r = w.gen(eid)
    assert r.status_code == 200, r.text
    assert r.json()["matches_created"] == n * (n - 1) // 2

    ms = w.matches(eid)
    pairs = [frozenset((w.pid(m["player_1"]), w.pid(m["player_2"]))) for m in ms]
    assert len(pairs) == len(set(pairs)), "no pair is scheduled twice"
    assert set(pairs) == {frozenset(p) for p in itertools.combinations(ids, 2)}
    # nobody plays themselves
    assert all(len(p) == 2 for p in pairs)

    w.play_all(eid, sport, random.Random(n))
    assert all(m["status"] == "done" for m in w.matches(eid))
    st = w.c.get(f"/api/orgs/events/{eid}/standings", headers=w.H).json()
    rows = [row for g in st["groups"] for row in g["rows"]]
    assert len(rows) == n
    assert sum(r["matches_played"] for r in rows) == n * (n - 1)       # each match counts for both sides


def test_round_robin_late_joiner_only_gets_the_missing_fixtures(world):
    w = world
    t, eid, ids = w.new_event("football", "round_robin", 4)
    assert w.gen(eid).json()["matches_created"] == 6
    late = w.enrol(eid, "football", 99)
    r = w.gen(eid)
    assert r.json()["matches_created"] == 4                    # the new team vs each of the 4
    assert len(w.matches(eid)) == 10
    assert w.gen(eid).json()["matches_created"] == 0           # idempotent


def test_round_robin_needs_two_participants(world):
    w = world
    t, eid, ids = w.new_event("football", "round_robin", 1)
    assert w.gen(eid).status_code == 400


def test_round_robin_manual_single_fixtures(world):
    w = world
    t, eid, ids = w.new_event("football", "round_robin", 4)
    body = {"stage": "round_robin", "round": 1, "team1_id": ids[0], "team2_id": ids[1]}
    assert w.c.post(f"/api/events/{eid}/matches", json=body, headers=w.H).status_code == 200
    assert len(w.matches(eid)) == 1
    # generating afterwards fills in only the pairs that are still missing
    assert w.gen(eid).json()["matches_created"] == 5


# ══════════════════════════════════════════════════════════════
# GROUP + KNOCKOUT
# ══════════════════════════════════════════════════════════════

def play_groups(w, eid, sport, rng):
    return w.play_all(eid, sport, rng, only=lambda m: m["group_id"] is not None)


def championship_url(eid, q, third=True):
    return f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group={q}&third_place={'true' if third else 'false'}"


def expected_qualifiers(group_sizes, q):
    return len(group_sizes) * q


def finish_championship(w, eid, sport, rng, qualifiers):
    ms = w.matches(eid)
    champ = [m for m in ms if m["group_id"] is None]
    assert len(champ) == (qualifiers - 1) + (1 if qualifiers >= 4 else 0)
    w.play_all(eid, sport, rng)
    ms = w.matches(eid)
    assert all(m["status"] == "done" for m in ms)
    champ = [m for m in ms if m["group_id"] is None]
    final = next(m for m in champ if m["stage"] == "final")
    assert w.pid(final["player_1"]) and w.pid(final["player_2"])
    if qualifiers >= 4:
        semis = [m for m in champ if m["stage"] == "semi"]
        tp = next(m for m in champ if m["stage"] == "third_place")
        losers = {w.pid(s["player_2"]) if s["player_1"]["is_winner"] else w.pid(s["player_1"]) for s in semis}
        assert {w.pid(tp["player_1"]), w.pid(tp["player_2"])} == losers


GROUP_CASES = [(n, g) for n in range(4, 15) for g in range(2, n // 2 + 1) if g <= 5]


@pytest.mark.parametrize("n,groups", GROUP_CASES)
@pytest.mark.parametrize("q", [1, 2])
def test_group_knockout_auto_groups_to_champion(world, n, groups, q):
    w = world
    sport = "football"
    t, eid, ids = w.new_event(sport, "group_knockout", n)
    r = w.c.post(f"/api/events/{eid}/generate-groups?num_groups={groups}", headers=w.H)
    assert r.status_code == 200, r.text
    sizes = r.json()["participants_per_group"]
    assert sum(sizes) == n and len(sizes) == groups
    assert min(sizes) >= 2, "no group is too small to produce a group final"
    assert max(sizes) - min(sizes) <= 1, "groups are balanced"

    rng = random.Random(n * 31 + groups)
    ms = w.matches(eid)
    # everybody is seated in exactly one group bracket
    in_groups = {}
    for m in ms:
        for p in (m["player_1"], m["player_2"]):
            if w.pid(p):
                in_groups.setdefault(w.pid(p), set()).add(m["group_id"])
    assert set(in_groups) == set(ids) and all(len(v) == 1 for v in in_groups.values())

    # the championship can't be built before every group is finished
    assert w.c.post(championship_url(eid, q), headers=w.H).status_code == 400

    play_groups(w, eid, sport, rng)
    qualifiers = expected_qualifiers(sizes, q)
    r = w.c.post(championship_url(eid, q), headers=w.H)
    if qualifiers < 2:
        assert r.status_code == 400
        return
    assert r.status_code == 200, r.text
    assert r.json()["qualifiers"] == qualifiers
    finish_championship(w, eid, sport, rng, qualifiers)


def random_partition(rng, ids, groups):
    """Random group sizes, every group at least 2."""
    n = len(ids)
    sizes = [2] * groups
    for _ in range(n - 2 * groups):
        sizes[rng.randrange(groups)] += 1
    shuffled = ids[:]
    rng.shuffle(shuffled)
    out, i = [], 0
    for s in sizes:
        out.append(shuffled[i:i + s])
        i += s
    return out


MANUAL_CASES = [(5, 2), (6, 2), (7, 2), (7, 3), (8, 3), (9, 2), (9, 4), (11, 3), (13, 4), (14, 5)]


@pytest.mark.parametrize("n,groups", MANUAL_CASES)
@pytest.mark.parametrize("q", [1, 2])
def test_group_knockout_manual_groups_and_manual_championship(world, n, groups, q):
    w = world
    sport = "football"
    t, eid, ids = w.new_event(sport, "group_knockout", n)
    rng = random.Random(n * 17 + groups)
    parts = random_partition(rng, ids, groups)
    payload = {"groups": [{"name": f"Group {chr(65 + i)}", "participant_ids": p} for i, p in enumerate(parts)]}
    r = w.c.post(f"/api/events/{eid}/manual-groups", json=payload, headers=w.H)
    assert r.status_code == 200, r.text
    assert r.json()["groups_created"] == groups

    # each group's bracket respects the order the organiser chose
    ws = w.c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=w.H).json()["events"][0]
    by_name = {g["name"]: g["group_id"] for g in ws["groups"]}
    ms = w.matches(eid)
    for i, p in enumerate(parts):
        gid = by_name[f"Group {chr(65 + i)}"]
        gm = [m for m in ms if m["group_id"] == gid]
        size = 1 << (len(p) - 1).bit_length()
        byes = size - len(p)
        r1 = sorted([m for m in gm if m["round"] == 1], key=lambda m: m["match_id"])
        r1_players = p[byes:]
        assert [(w.pid(m["player_1"]), w.pid(m["player_2"])) for m in r1] == list(zip(r1_players[0::2], r1_players[1::2]))

    play_groups(w, eid, sport, rng)

    # manual championship: qualifiers in a random order
    finals = [m for m in w.matches(eid) if m["group_id"] is not None and m["stage"] == "final"]
    assert len(finals) == groups
    qualified = []
    for f in finals:
        win = f["player_1"] if f["player_1"]["is_winner"] else f["player_2"]
        lose = f["player_2"] if f["player_1"]["is_winner"] else f["player_1"]
        qualified.append(w.pid(win))
        if q == 2:
            qualified.append(w.pid(lose))
    order = qualified[:]
    rng.shuffle(order)
    if len(order) < 2:
        return
    r = w.c.post(championship_url(eid, q), json={"order": order}, headers=w.H)
    assert r.status_code == 200, r.text
    finish_championship(w, eid, sport, rng, len(order))


def test_group_knockout_manual_championship_order_is_validated(world):
    w = world
    t, eid, ids = w.new_event("football", "group_knockout", 8)
    assert w.c.post(f"/api/events/{eid}/generate-groups?num_groups=2", headers=w.H).status_code == 200
    play_groups(w, eid, "football", random.Random(1))
    finals = [m for m in w.matches(eid) if m["stage"] == "final" and m["group_id"] is not None]
    winners = [w.pid(f["player_1"]) if f["player_1"]["is_winner"] else w.pid(f["player_2"]) for f in finals]
    assert len(winners) == 2
    url = championship_url(eid, 1)
    assert w.c.post(url, json={"order": winners[:1]}, headers=w.H).status_code == 400          # one missing
    assert w.c.post(url, json={"order": winners + [ids[0]]}, headers=w.H).status_code == 400   # someone who didn't qualify
    assert w.c.post(url, json={"order": [winners[0], winners[0]]}, headers=w.H).status_code == 400
    assert not [m for m in w.matches(eid) if m["group_id"] is None], "nothing written by the failed attempts"
    assert w.c.post(url, json={"order": winners[::-1]}, headers=w.H).status_code == 200


def test_championship_cannot_be_regenerated_after_it_started(world):
    w = world
    t, eid, ids = w.new_event("football", "group_knockout", 8)
    w.c.post(f"/api/events/{eid}/generate-groups?num_groups=2", headers=w.H)
    play_groups(w, eid, "football", random.Random(2))
    assert w.c.post(championship_url(eid, 2), headers=w.H).status_code == 200
    assert w.c.post(championship_url(eid, 2), headers=w.H).status_code == 200      # not started: replaceable
    m = next(m for m in w.matches(eid) if m["group_id"] is None and w.pid(m["player_1"]) and w.pid(m["player_2"]))
    w.c.patch(f"/api/matches/{m['match_id']}/status", json={"status": "live"}, headers=w.H)
    assert w.c.post(championship_url(eid, 2), headers=w.H).status_code == 409


def test_group_guard_rails(world):
    w = world
    t, eid, ids = w.new_event("football", "group_knockout", 5)
    g = lambda name, p: {"name": name, "participant_ids": p}
    url = f"/api/events/{eid}/manual-groups"
    # more groups than the participants can fill (each needs 2)
    assert w.c.post(f"/api/events/{eid}/generate-groups?num_groups=3", headers=w.H).status_code == 400
    # a group of one
    assert w.c.post(url, json={"groups": [g("A", ids[:4]), g("B", ids[4:])]}, headers=w.H).status_code == 400
    # somebody missing / somebody twice / a stranger
    assert w.c.post(url, json={"groups": [g("A", ids[:2]), g("B", ids[2:4])]}, headers=w.H).status_code == 400
    assert w.c.post(url, json={"groups": [g("A", ids[:3]), g("B", ids[2:])]}, headers=w.H).status_code == 400
    assert w.c.post(url, json={"groups": [g("A", ids[:3]), g("B", [ids[3], 424242])]}, headers=w.H).status_code == 400
    # only one group
    assert w.c.post(url, json={"groups": [g("A", ids)]}, headers=w.H).status_code == 400
    # qualifiers per group must be 1 or 2
    assert w.c.post(championship_url(eid, 3), headers=w.H).status_code == 400
    ws = w.c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=w.H).json()["events"][0]
    assert ws["matches"] == [] and ws["groups"] == []
    # and a valid draw still works afterwards
    assert w.c.post(url, json={"groups": [g("A", ids[:3]), g("B", ids[3:])]}, headers=w.H).status_code == 200


def test_manual_groups_cannot_be_redone_once_play_started(world):
    w = world
    t, eid, ids = w.new_event("football", "group_knockout", 6)
    g = lambda name, p: {"name": name, "participant_ids": p}
    url = f"/api/events/{eid}/manual-groups"
    payload = {"groups": [g("A", ids[:3]), g("B", ids[3:])]}
    assert w.c.post(url, json=payload, headers=w.H).status_code == 200
    assert w.c.post(url, json={"groups": [g("A", ids[:2]), g("B", ids[2:])]}, headers=w.H).status_code == 200  # redo before play
    m = next(m for m in w.matches(eid) if w.pid(m["player_1"]) and w.pid(m["player_2"]))
    w.c.patch(f"/api/matches/{m['match_id']}/status", json={"status": "live"}, headers=w.H)
    assert w.c.post(url, json=payload, headers=w.H).status_code == 409


# ══════════════════════════════════════════════════════════════
# Lifecycle: a finished tournament can be completed
# ══════════════════════════════════════════════════════════════

@pytest.mark.parametrize("n", [3, 5, 6, 7])
def test_finished_knockout_can_be_marked_completed(world, n):
    w = world
    t, eid, ids = w.new_event("football", "direct_knockout", n)
    w.gen(eid)
    tid = t["tournament_id"]
    assert w.c.post(f"/api/orgs/tournaments/{tid}/transition?target_status=completed", headers=w.H).status_code == 409
    w.play_all(eid, "football", random.Random(n))
    assert w.c.post(f"/api/orgs/tournaments/{tid}/transition?target_status=completed", headers=w.H).status_code == 200
