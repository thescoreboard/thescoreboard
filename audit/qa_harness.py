"""QA harness: real HTTP (TestClient) + real JWT auth, in-memory SQLite. Prints a results table."""
import os, sys, json, itertools
os.environ["DATABASE_URL"] = ""
os.environ["ENV"] = "dev"
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
@sa_event.listens_for(engine, "connect")
def _fk(dbapi, _):  # Postgres enforces FKs; make SQLite do likewise
    dbapi.execute("PRAGMA foreign_keys=ON")
Base.metadata.create_all(bind=engine)
S = sessionmaker(bind=engine, autocommit=False, autoflush=False)
def _db():
    d = S()
    try: yield d
    finally: d.close()
app.dependency_overrides[get_db] = _db
c = TestClient(app, raise_server_exceptions=False)

RES = []
def check(name, cond, detail=""):
    RES.append((name, "PASS" if cond else "FAIL", str(detail)[:230]))
def note(name, detail):  # informational
    RES.append((name, "INFO", str(detail)[:230]))

_n = itertools.count(1)
def reg(email=None):
    email = email or f"u{next(_n)}@t.com"
    r = c.post("/api/auth/register", json={"email": email, "password": "Passw0rd!x", "name": "U " + email})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}

A = reg("a@t.com"); B = reg("b@t.com")

def mkorg(h, name="Club"):
    r = c.post("/api/orgs/", json={"name": name}, headers=h); return r
def mktour(h, org, events, name="Cup", multi=False):
    return c.post(f"/api/orgs/{org}/tournaments", json={"name": name, "is_multi_sport": multi, "events": events}, headers=h)

# ───────── Organisation ─────────
r = mkorg(A); check("org: create", r.status_code == 200, r.text); ORG = r.json()["org_id"]
r2 = mkorg(A); check("org: duplicate name allowed w/ unique slug", r2.status_code == 200 and r2.json()["slug"] != r.json()["slug"], r2.text)
r = mkorg(A, ""); check("org: empty name rejected", r.status_code in (400, 422), f"{r.status_code}")
r = mkorg(A, "x" * 400); check("org: 400-char name rejected (<=255 col)", r.status_code in (400, 422), f"{r.status_code}")
r = c.post("/api/orgs/", json={"name": "NoAuth"}); check("org: unauthenticated 401", r.status_code == 401, r.status_code)
r = c.get(f"/api/orgs/{ORG}", headers=B); check("org: other user GET 403", r.status_code == 403, r.status_code)
r = c.delete(f"/api/orgs/{ORG}", headers=B); check("org: other user DELETE 403", r.status_code == 403, r.status_code)
r = c.get("/api/orgs/99999", headers=A); check("org: non-existent 404", r.status_code == 404, r.status_code)
r = c.get(f"/api/orgs/{ORG}/tournaments", headers=B); check("org: other user list tournaments 403", r.status_code == 403, r.status_code)
r = c.post(f"/api/orgs/{ORG}/tournaments", json={"name": "Hack", "events": []}, headers=B); check("org: other user create tournament 403", r.status_code == 403, r.status_code)
r = c.patch(f"/api/orgs/{ORG}", json={"name": "x"}, headers=A); note("org: no PATCH/edit endpoint for org", r.status_code)

# ───────── Tournament ─────────
r = mktour(A, ORG, [], name=""); check("tournament: empty name rejected", r.status_code in (400, 422), r.status_code)
r = mktour(A, ORG, [{"name": "E", "sport_key": "polo", "format": "round_robin"}]); check("tournament: unknown sport 400", r.status_code == 400, r.status_code)
r = mktour(A, ORG, [{"name": "E", "sport_key": "football", "format": "swiss"}]); check("tournament: unknown format at create rejected", r.status_code in (400, 422), f"{r.status_code} (format unvalidated in create wizard)")
r = mktour(A, ORG, [{"name": "E", "sport_key": "football", "format": "round_robin", "participant_type": "banana"}]); check("tournament: bogus participant_type rejected", r.status_code in (400, 422), r.status_code)
r = mktour(A, ORG, [{"name": "E", "sport_key": "table_tennis", "format": "round_robin", "sport_config": {"sets_to_win": 9}}]); check("tournament: invalid sport_config rejected", r.status_code == 400, r.status_code)
r = mktour(A, ORG, [{"name": "E", "sport_key": "table_tennis", "format": None}]); note("tournament: single-sport with format=None", f"{r.status_code} -> {'created event with format NULL' if r.status_code==200 else r.text[:80]}")
r = c.post(f"/api/orgs/{ORG}/tournaments", json={"name": "Cup", "events": [], "start_date": "2026-10-01"}, headers=A)
r = mktour(A, ORG, [], name="Same Name"); r_ = mktour(A, ORG, [], name="Same Name"); check("tournament: duplicate name unique slug", r.json()["slug"] != r_.json()["slug"])
note("tournament: start_date/end_date columns exist but no create/update schema exposes them", "dates cannot be set via API")

# helpers for event setup
def mkevent_tour(sport, fmt, ptype, cfg=None, name=None):
    ev = {"name": name or f"{sport}-{fmt}", "sport_key": sport, "format": fmt, "participant_type": ptype}
    if cfg: ev["sport_config"] = cfg
    r = mktour(A, ORG, [ev], name=f"T {sport} {fmt} {next(_n)}")
    assert r.status_code == 200, r.text
    t = r.json()
    w = c.get(f"/api/orgs/tournaments/{t['tournament_id']}/workspace", headers=A).json()
    eid = w["events"][0]["event_id"]
    return t, eid

def mkteams(eid, n, team=True, prefix="T", sport=None):
    ids = []
    for i in range(n):
        if team:
            r = c.post(f"/api/orgs/{ORG}/teams", json={"name": f"{prefix}{i+1}-{next(_n)}", "sport_key": sport, "members": [{"name": "m"}]}, headers=A)
            tid = r.json()["team_id"]
            rr = c.post(f"/api/events/{eid}/teams?team_id={tid}", headers=A)
        else:
            r = c.post(f"/api/players/?org_id={ORG}", json={"name": f"{prefix}{i+1}-{next(_n)}"}, headers=A)
            tid = r.json()["player_id"]
            rr = c.post(f"/api/players/events/{eid}/participants?player_id={tid}", headers=A)
        assert rr.status_code == 200, rr.text
        ids.append(tid)
    return ids

def matches(eid):
    r = c.get(f"/api/events/{eid}/matches", headers=A)
    return r.json() if r.status_code == 200 else r

def gen(eid, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return c.post(f"/api/orgs/events/{eid}/generate-fixtures" + (f"?{qs}" if qs else ""), headers=A)

def standings(eid):
    return c.get(f"/api/events/{eid}/standings", headers=A).json()

def go_live(mid): return c.patch(f"/api/matches/{mid}/status", json={"status": "live"}, headers=A)

# ───────── Round robin counts, n = 2..8 ─────────
for n in (2, 3, 4, 5, 6, 8):
    t, eid = mkevent_tour("football", "round_robin", "team")
    mkteams(eid, n)
    r = gen(eid); ms = matches(eid)
    pairs = {tuple(sorted((m["player_1"]["team_id"], m["player_2"]["team_id"]))) for m in ms}
    per = {}
    for m in ms:
        for k in ("player_1", "player_2"): per[m[k]["team_id"]] = per.get(m[k]["team_id"], 0) + 1
    ok = r.status_code == 200 and len(ms) == n * (n - 1) // 2 and len(pairs) == len(ms) and set(per.values()) == {n - 1}
    check(f"round robin n={n}: C(n,2) matches, unique pairs, each plays n-1", ok, f"matches={len(ms)} expected={n*(n-1)//2}")
t, eid = mkevent_tour("football", "round_robin", "team")
r = gen(eid); check("round robin n=0: rejected 400", r.status_code == 400, r.status_code)
mkteams(eid, 1); r = gen(eid); check("round robin n=1: rejected 400", r.status_code == 400, r.status_code)
mkteams(eid, 2); r = gen(eid); check("RR gen #1 ok", r.status_code == 200)
r = gen(eid); check("RR regenerate is idempotent (0 new)", r.status_code == 200 and r.json()["matches_created"] == 0, r.text)
mkteams(eid, 1); r = gen(eid); check("RR: add 4th team after fixtures -> only the 3 new pairs created", r.json()["matches_created"] == 3, r.text)

# ───────── Knockout bracket full progression, n = 2..9, 12 ─────────
def play_ko(eid, third=False):
    """Walkover (pos1 wins) every playable match until bracket is complete. Return final match dict."""
    for _ in range(40):
        ms = matches(eid)
        pend = [m for m in ms if m["status"] == "scheduled" and m["player_1"]["name"] != "TBD" and m["player_2"]["name"] != "TBD"]
        if not pend: break
        for m in pend:
            rr = c.post(f"/api/matches/{m['match_id']}/walkover?winner_position=1", headers=A)
            assert rr.status_code == 200, rr.text
    return matches(eid)

for n in (2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17):
    for third in (False, True) if n in (4, 5, 8) else (False,):
        t, eid = mkevent_tour("table_tennis", "direct_knockout", "individual")
        mkteams(eid, n, team=False)
        r = gen(eid, **({"third_place": "true"} if third else {}))
        ms = matches(eid)
        exp = n - 1 + (1 if third and n >= 4 else 0)
        check(f"KO n={n} third={third}: match count n-1(+1)", r.status_code == 200 and len(ms) == exp, f"got {len(ms)} expected {exp}")
        ms = play_ko(eid)
        done = [m for m in ms if m["status"] == "done"]
        stuck = [m for m in ms if m["status"] != "done"]
        final = next((m for m in ms if m["stage"] == "final"), None)
        champ_ok = final and final["status"] == "done" and any(final[k]["is_winner"] for k in ("player_1", "player_2"))
        # every player appears in round-1 or via byes; losers eliminated: count distinct players who ever played
        check(f"KO n={n} third={third}: full bracket completes via advancement, champion decided", bool(champ_ok) and not stuck, f"done={len(done)} stuck={[(m['stage'], m['round'], m['player_1']['name'], m['player_2']['name']) for m in stuck][:3]}")
        if third and n >= 4:
            tp = next(m for m in ms if m["stage"] == "third_place")
            sf_losers = set()
            for m in ms:
                if m["stage"] == "semi":
                    l = m["player_2"] if m["player_1"]["is_winner"] else m["player_1"]
                    sf_losers.add(l["player_id"])
            tp_players = {tp["player_1"]["player_id"], tp["player_2"]["player_id"]}
            check(f"KO n={n}: third-place match gets semi losers", tp_players == sf_losers and tp["status"] == "done", f"{tp_players} vs {sf_losers}")

# duplicate-opponent / rematch check in KO n=8
t, eid = mkevent_tour("table_tennis", "direct_knockout", "individual"); mkteams(eid, 8, team=False); gen(eid)
ms = play_ko(eid)
pairs = [tuple(sorted((m["player_1"]["player_id"], m["player_2"]["player_id"]))) for m in ms]
check("KO n=8: no duplicate fixtures", len(pairs) == len(set(pairs)))

# KO regenerate rules
t, eid = mkevent_tour("table_tennis", "direct_knockout", "individual"); mkteams(eid, 4, team=False); gen(eid)
r = gen(eid); check("KO regenerate before play replaces bracket", r.status_code == 200 and len(matches(eid)) == 3)
m0 = [m for m in matches(eid) if m["player_1"]["name"] != "TBD"][0]
c.post(f"/api/matches/{m0['match_id']}/walkover?winner_position=1", headers=A)
r = gen(eid); check("KO regenerate after a match done refused 400", r.status_code == 400, r.status_code)

# ───────── State machine ─────────
t, eid = mkevent_tour("table_tennis", "direct_knockout", "individual"); ids = mkteams(eid, 4, team=False); gen(eid)
newp = c.post(f"/api/players/?org_id={ORG}", json={"name": "Late"}, headers=A).json()["player_id"]
r = c.post(f"/api/players/events/{eid}/participants?player_id={newp}", headers=A)
check("state: add participant AFTER fixtures generated is blocked", r.status_code in (400, 409), f"{r.status_code} (silently accepted; bracket now omits them)")
r = c.delete(f"/api/players/events/{eid}/participants/{ids[0]}", headers=A)
check("state: remove participant who is in generated fixtures is blocked", r.status_code in (400, 409), f"{r.status_code}")
ms = matches(eid); ghost = [m for m in ms if any(m[k]["player_id"] == ids[0] for k in ("player_1", "player_2"))]
note("state: removed player still in fixtures", f"{len(ghost)} match(es) still reference removed player" if r.status_code == 200 else "n/a")
r = c.patch(f"/api/events/{eid}", json={"format": "round_robin"}, headers=A)
check("state: change event format after fixtures via PATCH /events is blocked", r.status_code in (400, 409), f"{r.status_code} (configure endpoint locks this; PATCH bypasses lock)")
r = c.patch(f"/api/events/{eid}", json={"status": "banana"}, headers=A)
check("state: event.status accepts only valid enum", r.status_code in (400, 422), r.status_code)
r = c.patch(f"/api/events/{eid}", json={"format": "swiss"}, headers=A)
check("state: PATCH event invalid format rejected", r.status_code in (400, 422), r.status_code)
m0 = [m for m in matches(eid) if m["player_1"]["name"] != "TBD" and m["player_2"]["name"] != "TBD"][0]
final = next(m for m in matches(eid) if m["stage"] == "final")
r = c.patch(f"/api/matches/{final['match_id']}/score", json={"score_p1": 11, "score_p2": 0}, headers=A)
check("state: score entry on match with TBD participants rejected", r.status_code == 400, r.status_code)
r = c.patch(f"/api/matches/{m0['match_id']}/status", json={"status": "done"}, headers=A)
check("state: PATCH status=done directly (no winner) is blocked", r.status_code in (400, 409), f"{r.status_code} -> sets done with no winner, no advancement")
if r.status_code == 200:
    mm = c.get(f"/api/matches/{m0['match_id']}", headers=A).json()
    note("state: match forced 'done' without winner", f"is_winner={mm['player_1']['is_winner']}/{mm['player_2']['is_winner']}")
r = c.patch(f"/api/matches/{m0['match_id']}/status", json={"status": "scheduled"}, headers=A)
note("state: status can be moved done->scheduled freely", r.status_code)
tr = c.post(f"/api/orgs/tournaments/{t['tournament_id']}/transition?target_status=completed", headers=A)
check("state: complete tournament w/ unplayed matches blocked", tr.status_code in (400, 409), f"{tr.status_code} (draft->completed not allowed anyway)")
c.post(f"/api/orgs/tournaments/{t['tournament_id']}/transition?target_status=live", headers=A)
tr = c.post(f"/api/orgs/tournaments/{t['tournament_id']}/transition?target_status=completed", headers=A)
check("state: live->completed with unplayed matches is blocked", tr.status_code in (400, 409), f"{tr.status_code}")
# fixtures on a draft tournament
t2, e2 = mkevent_tour("football", "round_robin", "team"); mkteams(e2, 3); r = gen(e2)
note("state: fixtures can be generated while tournament is draft", r.status_code)
r = c.post(f"/api/events/{e2}/teams?team_id=999999", headers=A)
check("state: enrol nonexistent team id -> 404 (not 500)", r.status_code == 404, r.status_code)
r = c.post(f"/api/players/events/{e2}/participants?player_id=1", headers=A)
check("state: enrol a PLAYER into a TEAM event rejected", r.status_code == 400, r.status_code)

# ───────── IDOR / cross-org ─────────
orgB = mkorg(B, "Other").json()["org_id"]
tB = mktour(B, orgB, [{"name": "E", "sport_key": "football", "format": "round_robin", "participant_type": "team"}], name="B cup").json()
eB = c.get(f"/api/orgs/tournaments/{tB['tournament_id']}/workspace", headers=B).json()["events"][0]["event_id"]
teamB = c.post(f"/api/orgs/{orgB}/teams", json={"name": "BTeam"}, headers=B).json()["team_id"]
teamA = c.post(f"/api/orgs/{ORG}/teams", json={"name": "ATeam"}, headers=A).json()["team_id"]
check("idor: A cannot read B tournament workspace", c.get(f"/api/orgs/tournaments/{tB['tournament_id']}/workspace", headers=A).status_code == 403)
check("idor: A cannot get B tournament", c.get(f"/api/orgs/tournaments/{tB['tournament_id']}", headers=A).status_code == 403)
check("idor: A cannot PATCH B tournament", c.patch(f"/api/orgs/{orgB}/tournaments/{tB['tournament_id']}", json={"name": "pwn"}, headers=A).status_code == 403)
check("idor: A cannot DELETE B tournament", c.delete(f"/api/orgs/{orgB}/tournaments/{tB['tournament_id']}", headers=A).status_code == 403)
check("idor: A cannot generate fixtures on B event", gen(eB).status_code == 403)
check("idor: A cannot enrol into B event", c.post(f"/api/events/{eB}/teams?team_id={teamA}", headers=A).status_code == 403)
check("idor: A cannot PATCH B event", c.patch(f"/api/events/{eB}", json={"name": "pwn"}, headers=A).status_code == 403)
check("idor: A cannot create event in B tournament", c.post(f"/api/tournaments/{tB['tournament_id']}/events", json={"name": "x", "sport_key": "football", "format": "round_robin"}, headers=A).status_code == 403)
check("idor: A cannot list B teams", c.get(f"/api/orgs/{orgB}/teams", headers=A).status_code == 403)
check("idor: A cannot delete B team", c.delete(f"/api/teams/{teamB}", headers=A).status_code == 403)
r = c.post(f"/api/events/{e2}/teams?team_id={teamB}", headers=A)
check("idor: A cannot enrol B's team into A's event (cross-org reference)", r.status_code in (400, 403, 404), f"{r.status_code} -> B's team (name+roster) now appears in A's public event")
pub = c.get(f"/api/events/{e2}/teams").json()
note("idor: unauthenticated GET /events/{id}/teams exposes members/contact_phone", f"members exposed={bool(pub and pub[0]['team'] and 'contact_phone' in pub[0]['team'])}")
pp = c.get(f"/api/players/events/{eid}/participants")
note("unauth GET /players/events/{id}/participants keys", list(pp.json()[0].keys()) if pp.status_code == 200 and pp.json() else pp.status_code)
check("auth: tampered JWT rejected", c.get("/api/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401)
check("auth: wrong password 401", c.post("/api/auth/login", json={"email": "a@t.com", "password": "nope"}).status_code == 401)
r = c.post("/api/auth/register", json={"email": "a@t.com", "password": "Passw0rd!x", "name": "dup"}); check("auth: duplicate email rejected", r.status_code in (400, 409), r.status_code)
r = c.post("/api/auth/register", json={"email": "weak@t.com", "password": "1", "name": "w"}); check("auth: 1-char password rejected", r.status_code in (400, 422), f"{r.status_code}")

# ───────── FOOTBALL scoring + standings ─────────
def fb_play(mid, g1, g2, winner=None, via_score=True):
    go_live(mid)
    r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": g1, "score_p2": g2}, headers=A)
    assert r.status_code == 200, r.text
    body = {} if winner is None else {"winner_position": winner}
    return c.post(f"/api/matches/{mid}/finish", json=body, headers=A)

t, eid = mkevent_tour("football", "round_robin", "team"); tm = mkteams(eid, 4, sport="football"); gen(eid)
ms = matches(eid)
def mm(a, b):
    for m in ms:
        if {m["player_1"]["team_id"], m["player_2"]["team_id"]} == {a, b}: return m
    raise KeyError
m = mm(tm[0], tm[1]); p1_is_a = m["player_1"]["team_id"] == tm[0]
g = (3, 1) if p1_is_a else (1, 3)
r = fb_play(m["match_id"], *g); check("football: finish 3-1 ok", r.status_code == 200 and r.json()["status"] == "done", r.text[:100])
check("football: winner flagged", (r.json()["player_1"] if p1_is_a else r.json()["player_2"])["is_winner"] is True)
m = mm(tm[2], tm[3]); r = fb_play(m["match_id"], 1, 1); check("football: 1-1 draw finishable in league", r.status_code == 200 and not r.json()["player_1"]["is_winner"] and not r.json()["player_2"]["is_winner"])
m = mm(tm[0], tm[2]); r = fb_play(m["match_id"], 0, 0); check("football: 0-0 finishable", r.status_code == 200)
m = mm(tm[1], tm[3]); r = fb_play(m["match_id"], 9, 8) if m["player_1"]["team_id"] == tm[1] else fb_play(m["match_id"], 8, 9); check("football: high scoring 9-8", r.status_code == 200)
st = standings(eid)["groups"][0]["rows"]
byid = {x["participant_id"]: x for x in st}
note("football standings rows (after 3-1, 1-1, 0-0, 9-8[tm1 wins])", [(x["name"][:2], x["matches_played"], x["wins"], x["losses"], x["ranking_points"], x["points_for"], x["points_against"], x["sets_won"], x["sets_lost"]) for x in st])
check("football: draw earns a point (3/1/0 or 2/1/0)", byid[tm[3]]["ranking_points"] >= 1 and byid[tm[2]]["ranking_points"] >= 1, f"tm3 pts={byid[tm[3]]['ranking_points']} (draw gives 0 — no draw column in standings)")
check("football: standings expose draws + goal difference", all("draws" in x for x in st), f"row keys={list(st[0].keys())}")
note("football: backend win = 2 pts (web/mobile public tables use 3)", byid[tm[0]]["ranking_points"])
check("football: goals-for aggregated correctly (tm0: 3+0=3)", byid[tm[0]]["points_for"] == 3, byid[tm[0]]["points_for"])
# 0 played participants appear
# correction after completion
m = mm(tm[0], tm[1]); mid = m["match_id"]
r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": 0, "score_p2": 5}, headers=A)
mm_ = c.get(f"/api/matches/{mid}", headers=A).json()
check("football: score change on a DONE match is rejected (or requires rematch)", r.status_code in (400, 409), f"{r.status_code}; status now={mm_['status']} winner flags={mm_['player_1']['is_winner']}/{mm_['player_2']['is_winner']} (score {mm_['player_1']['score']}-{mm_['player_2']['score']}) -> stale winner vs new score")
# football negative / invalid
m = [x for x in matches(eid) if x["status"] == "scheduled"]
if m:
    mid = m[0]["match_id"]
    check("football: negative score rejected", c.patch(f"/api/matches/{mid}/score", json={"score_p1": -1, "score_p2": 0}, headers=A).status_code == 422)
    check("football: 10000 goals rejected", c.patch(f"/api/matches/{mid}/score", json={"score_p1": 10000, "score_p2": 0}, headers=A).status_code == 422)
    r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": 500, "score_p2": 0}, headers=A)
    check("football: 500 goals sanity-capped", r.status_code in (400, 422), f"{r.status_code} (cap is 9999)")
    r = c.post(f"/api/matches/{mid}/finish", json={}, headers=A)
    note("football: finish an unstarted scheduled match (no live)", r.status_code)
    r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": "abc", "score_p2": 0}, headers=A); check("football: string score 422", r.status_code == 422)
    r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": 1.5, "score_p2": 0}, headers=A); check("football: float score 422", r.status_code == 422, r.status_code)
    r = c.patch(f"/api/matches/{mid}/score", json={"score_p1": 1}, headers=A); check("football: missing score 422", r.status_code == 422)
r = c.post(f"/api/matches/999999/finish", json={}, headers=A); check("match: finish nonexistent 404", r.status_code == 404, r.status_code)
# finish twice
m_done = [x for x in matches(eid) if x["status"] == "done"][0]
r = c.post(f"/api/matches/{m_done['match_id']}/finish", json={}, headers=A); check("football: finish already-done match rejected", r.status_code in (400, 409), r.status_code)
r = c.post(f"/api/matches/{m_done['match_id']}/walkover?winner_position=2", headers=A); check("walkover on done match 400", r.status_code == 400)
r = c.post(f"/api/matches/{m_done['match_id']}/walkover?winner_position=5", headers=A); note("walkover winner_position=5 on done", r.status_code)

# football knockout draw
t, eid = mkevent_tour("football", "direct_knockout", "team"); tm = mkteams(eid, 4, sport="football"); gen(eid)
m = [x for x in matches(eid) if x["stage"] == "semi"][0]
r = fb_play(m["match_id"], 2, 2); check("football KO: draw cannot be finished", r.status_code == 400, r.text[:100])
r = fb_play(m["match_id"], 2, 2, winner=2); check("football KO: draw settled by explicit winner (pens) ok", r.status_code == 200 and r.json()["player_2"]["is_winner"], r.text[:100])
r = c.post(f"/api/matches/{m['match_id']}/finish", json={"winner_position": 2}, headers=A)
final = next(x for x in matches(eid) if x["stage"] == "final")
check("football KO: winner advanced to final", any(final[k]["team_id"] == m["player_2"]["team_id"] for k in ("player_1", "player_2")))
r = c.patch(f"/api/matches/{m['match_id']}/score", json={"score_p1": 5, "score_p2": 0}, headers=A)
check("football KO: re-scoring a done semi cannot silently desync from bracket", r.status_code in (400, 409), f"{r.status_code}")

# ───────── CRICKET ─────────
def cricket_innings(mid, runs, wkts, inn, balls=120):
    return c.patch(f"/api/matches/{mid}/score", json={"score_p1": runs, "score_p2": wkts, "half": inn, "minute": balls, "overs": f"{balls//6}.{balls%6}", "cricket_live_state": {"batting_first": 1} if inn == 1 else None}, headers=A)
t, eid = mkevent_tour("cricket", "round_robin", "team"); tm = mkteams(eid, 3, sport="cricket"); gen(eid)
ms = matches(eid); mid = ms[0]["match_id"]; go_live(mid)
r = cricket_innings(mid, 150, 6, 1); check("cricket: innings1 score accepted", r.status_code == 200, r.text[:120])
r = c.post(f"/api/matches/{mid}/finish", json={}, headers=A); check("cricket: end innings 1 -> match still live", r.status_code == 200 and r.json()["status"] == "live", r.text[:120])
r = cricket_innings(mid, 120, 10, 2); r = c.post(f"/api/matches/{mid}/finish", json={}, headers=A)
j = r.json(); check("cricket: after innings 2 team1 (150) beats team2 (120): done, winner=pos1", j["status"] == "done" and j["player_1"]["is_winner"], f"{j['player_1']}, {j['player_2']}")
check("cricket: aggregate score = runs per team", j["player_1"]["score"] == 150 and j["player_2"]["score"] == 120, f"{j['player_1']['score']}-{j['player_2']['score']}")
mid2 = ms[1]["match_id"]; go_live(mid2)
cricket_innings(mid2, 100, 8, 1); c.post(f"/api/matches/{mid2}/finish", json={}, headers=A)
cricket_innings(mid2, 100, 9, 2); r = c.post(f"/api/matches/{mid2}/finish", json={}, headers=A)
check("cricket: tie ends as done w/ no winner (should offer super over/tie)", r.json()["status"] == "done" and not r.json()["player_1"]["is_winner"] and not r.json()["player_2"]["is_winner"], r.text[:140])
st = standings(eid)["groups"][0]["rows"]
note("cricket standings rows (150/6 beat 120/10; tie 100/8 v 100/9)", [(x["name"][:2], x["matches_played"], x["wins"], x["ranking_points"], x["points_for"], x["points_against"]) for x in st])
x0 = next(x for x in st if x["participant_id"] == ms[0]["player_1"]["team_id"])
check("cricket: standings points_for = runs scored by that team only (150 + 100 across its two matches)", x0["points_for"] == 250, f"points_for={x0['points_for']} points_against={x0['points_against']} (sums BOTH innings' runs / wickets)")
check("cricket: Net Run Rate present in standings", any("nrr" in k.lower() for k in st[0]), list(st[0].keys()))
check("cricket: tie awards points to both", x0["ranking_points"] >= 0 and all(s["ranking_points"] >= 1 for s in st if s["participant_id"] in {ms[1]["player_1"]["team_id"], ms[1]["player_2"]["team_id"]} and s["matches_played"] == 1 and s["wins"] == 0 and s["losses"] == 0), "tie => 0 points each")
mid3 = ms[2]["match_id"]; go_live(mid3)
r = cricket_innings(mid3, 5, 11, 1); check("cricket: 11 wickets rejected (config wickets=10)", r.status_code in (400, 422), r.status_code)
r = cricket_innings(mid3, 5, 3, 1, balls=999); check("cricket: 999 balls (>20 overs) rejected", r.status_code in (400, 422), r.status_code)
r = cricket_innings(mid3, 5, 3, 7); check("cricket: innings=7 rejected (2 innings + super over)", r.status_code in (400, 422), r.status_code)
r = cricket_innings(mid3, 400, 3, 1); note("cricket: 400 runs in 20 overs accepted", r.status_code)

# ───────── TABLE TENNIS + BADMINTON set rules ─────────
def setmatch(sport, cfg=None, fmt="round_robin"):
    t, eid = mkevent_tour(sport, fmt, "individual", cfg); mkteams(eid, 2, team=False); gen(eid)
    mid = matches(eid)[0]["match_id"]; go_live(mid); return eid, mid
def sc(mid, a, b): return c.patch(f"/api/matches/{mid}/score", json={"score_p1": a, "score_p2": b}, headers=A)
def mj(mid): return c.get(f"/api/matches/{mid}", headers=A).json()

# TT default BO3 to 11
eid, mid = setmatch("table_tennis")
sc(mid, 10, 10); j = mj(mid); check("TT: 10-10 not complete", not j["sets"][0]["is_complete"])
sc(mid, 11, 10); j = mj(mid); check("TT: 11-10 not complete (win by 2)", not j["sets"][0]["is_complete"])
sc(mid, 12, 10); j = mj(mid); check("TT: 12-10 completes set 1", j["sets"][0]["is_complete"] and j["sets"][0]["winner"] == 1 and len(j["sets"]) == 2)
sc(mid, 11, 9); j = mj(mid); check("TT: 2-0 ends BO3, match done, winner=1", j["status"] == "done" and j["player_1"]["is_winner"] and j["player_1"]["score"] == 2, f"{j['status']} {j['player_1']['score']}-{j['player_2']['score']}")
r = sc(mid, 11, 0); check("TT: scoring a finished match rejected", r.status_code in (400, 409), r.status_code)
# instant win
eid, mid = setmatch("table_tennis")
sc(mid, 7, 0); j = mj(mid)
check("TT: score passing through 7-0 does NOT end the set (real rule: play to 11)", not j["sets"][0]["is_complete"], f"set1 complete={j['sets'][0]['is_complete']} winner={j['sets'][0]['winner']} — default config instant_win.enabled=True")
# invalid / impossible
eid, mid = setmatch("table_tennis")
r = sc(mid, 25, 3); j = mj(mid); check("TT: impossible set score 25-3 rejected", r.status_code in (400, 422), f"{r.status_code} set1={j['sets'][0]['score_p1']}-{j['sets'][0]['score_p2']} complete={j['sets'][0]['is_complete']}")
eid, mid = setmatch("table_tennis")
r = sc(mid, 15, 14); j = mj(mid); check("TT: 15-14 is a legal in-progress deuce score (kept open)", r.status_code == 200 and not j["sets"][0]["is_complete"], f"{r.status_code}")
eid, mid = setmatch("table_tennis")
r = sc(mid, 12, 5); check("TT: 12-5 (overshoot: should have ended at 11) rejected", r.status_code in (400, 422), r.status_code)
# TT BO5 and 21-point config honoured
eid, mid = setmatch("table_tennis", {"sets_to_win": 3, "points_per_set": 21})
sc(mid, 21, 5); j = mj(mid); check("TT cfg 21pts: 21-5 completes set", j["sets"][0]["is_complete"])
sc(mid, 21, 5); sc(mid, 11, 3); j = mj(mid); check("TT cfg BO5: after 2 set wins match NOT done", j["status"] != "done")
sc(mid, 21, 5); j = mj(mid); check("TT cfg BO5: 3 set wins -> done", j["status"] == "done")
eid, mid = setmatch("table_tennis", {"sets_to_win": 3, "points_per_set": 21}); sc(mid, 11, 9); j = mj(mid)
check("TT cfg 21pts: 11-9 does NOT complete set", not j["sets"][0]["is_complete"])
# TT undo-set
eid, mid = setmatch("table_tennis"); sc(mid, 11, 5); sc(mid, 3, 1)
r = c.post(f"/api/matches/{mid}/undo-set", headers=A); j = r.json()
check("TT undo-set: resets current in-progress set", r.status_code == 200 and j["sets"][-1]["score_p1"] == 0, j["sets"])
r = c.post(f"/api/matches/{mid}/undo-set", headers=A); j = r.json()
check("TT undo-set #2: reopens set 1", r.status_code == 200 and len(j["sets"]) == 1 and not j["sets"][0]["is_complete"] and j["player_1"]["score"] == 0, j["sets"])

# Badminton
eid, mid = setmatch("badminton")
sc(mid, 20, 20); sc(mid, 21, 20); j = mj(mid); check("BD: 21-20 not complete", not j["sets"][0]["is_complete"])
sc(mid, 22, 20); j = mj(mid); check("BD: 22-20 completes game", j["sets"][0]["is_complete"])
sc(mid, 29, 29); sc(mid, 30, 29); j = mj(mid); check("BD: 30-29 completes game 2 (cap) -> match done 2-0", j["status"] == "done", f"{j['status']}")
eid, mid = setmatch("badminton"); sc(mid, 21, 19); sc(mid, 15, 21); j = mj(mid); sc(mid, 21, 23); sc(mid, 21, 10); j2 = mj(mid)
check("BD: game 3 decider after 1-1; BO3 completes with 2 game wins", j2["status"] == "done" and len(j2["sets"]) == 3, [ (s["score_p1"], s["score_p2"]) for s in j2["sets"]])
eid, mid = setmatch("badminton"); r = sc(mid, 31, 0); j = mj(mid); check("BD: impossible 31-0 rejected", r.status_code in (400, 422), f"{r.status_code} set1={j['sets'][0]['score_p1']}-{j['sets'][0]['score_p2']}")
eid, mid = setmatch("badminton"); r = sc(mid, 25, 10); check("BD: 25-10 (overshoot) rejected", r.status_code in (400, 422), r.status_code)
eid, mid = setmatch("badminton", {"points_per_set": 15}); sc(mid, 15, 3); j = mj(mid); check("BD cfg 15pts: 15-3 completes", j["sets"][0]["is_complete"])
sc(mid, 16, 14); j = mj(mid); check("BD cfg 15pts: 16-14 completes game 2", j["status"] == "done")
eid, mid = setmatch("badminton", {"sets_to_win": 1}); sc(mid, 21, 5); check("BD cfg BO1: single game decides", mj(mid)["status"] == "done")
eid, mid = setmatch("badminton"); sc(mid, 7, 0); check("BD: 7-0 does not end game (no instant-win in badminton)", not mj(mid)["sets"][0]["is_complete"])
# TT/BD independence of config
from app.sports.registry import get_sport_engine
tt, bd = get_sport_engine("table_tennis"), get_sport_engine("badminton")
check("BD vs TT: engines independent (11-9 wins TT game, not BD)", tt.check_set_winner(11, 9, tt.get_default_config()) == 1 and bd.check_set_winner(11, 9, bd.get_default_config()) is None)
# per-match sets_to_win override
eid, mid = setmatch("badminton"); r = c.patch(f"/api/matches/{mid}/status", json={"status": "live", "sets_to_win": 7}, headers=A)
note("sets_to_win per-match override accepts 7 (config limits 1-3)", r.status_code)
r = c.patch(f"/api/matches/{mid}/status", json={"status": "live", "sets_to_win": 0}, headers=A); note("sets_to_win=0 accepted", r.status_code)
# rematch + corrections + standings
eid, mid = setmatch("table_tennis"); sc(mid, 11, 3); sc(mid, 11, 3)
s1 = standings(eid)["groups"][0]["rows"]; w1 = [x for x in s1 if x["wins"] == 1][0]["name"]
r = c.post(f"/api/matches/{mid}/rematch", headers=A); check("TT rematch resets match", r.status_code == 200 and r.json()["status"] == "scheduled")
s2 = standings(eid)["groups"][0]["rows"]
check("TT standings after rematch revert to 0 played (cache invalidated)", all(x["matches_played"] == 0 for x in s2), [(x["name"][:3], x["matches_played"]) for x in s2])
go_live(mid); sc(mid, 3, 11); sc(mid, 3, 11)
s3 = standings(eid)["groups"][0]["rows"]; w3 = [x for x in s3 if x["wins"] == 1][0]["name"]
check("TT score reversal (A 2-0 -> rematch -> B 2-0): standings flip", w1 != w3, f"{w1} -> {w3}")
# walkover standings in TT
eid, mid = setmatch("table_tennis"); c.post(f"/api/matches/{mid}/walkover?winner_position=1", headers=A)
r = standings(eid)["groups"][0]["rows"]; note("TT walkover standings (fabricated 11-0 sets)", [(x["name"][:3], x["wins"], x["points_for"], x["points_against"], x["sets_won"]) for x in r])
# undo on a done match
eid, mid = setmatch("table_tennis"); sc(mid, 11, 2); sc(mid, 11, 2)
r = c.post(f"/api/matches/{mid}/undo-set", headers=A); j = r.json()
check("TT undo-set on finished match reopens it", r.status_code == 200 and j["status"] == "live", f"{r.status_code} status={j.get('status')}")

# ───────── Group + Knockout ─────────
def gk(n, groups, sport="table_tennis", team=False, qpg=2, third=False):
    t, eid = mkevent_tour(sport, "group_knockout", "team" if team else "individual")
    mkteams(eid, n, team=team, sport=sport if team else None)
    r = c.post(f"/api/events/{eid}/generate-groups?num_groups={groups}", headers=A)
    return t, eid, r
for n, g in ((8, 2), (6, 2), (7, 2), (9, 3), (12, 4), (5, 2), (4, 2)):
    t, eid, r = gk(n, g)
    ok = r.status_code == 200
    if ok:
        sizes = r.json()["participants_per_group"]
        check(f"G+KO n={n} groups={g}: groups balanced (diff<=1)", max(sizes) - min(sizes) <= 1, sizes)
        ms = matches(eid)
        per_g = {}
        for m in ms: per_g.setdefault(m["group_id"], []).append(m)
        check(f"G+KO n={n} g={g}: each group bracket has size-1 matches", all(len(v) == s - 1 for v, s in zip(sorted(per_g.values(), key=len), sorted(sizes))), {k: len(v) for k, v in per_g.items()})
        for _ in range(30):
            pend = [m for m in matches(eid) if m["status"] == "scheduled" and m["group_id"] and m["player_1"]["name"] != "TBD" and m["player_2"]["name"] != "TBD"]
            if not pend: break
            for m in pend: c.post(f"/api/matches/{m['match_id']}/walkover?winner_position=1", headers=A)
        r = c.post(f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group=2", headers=A)
        check(f"G+KO n={n} g={g}: championship generated after groups complete", r.status_code == 200, r.text[:140])
        if r.status_code == 200:
            for _ in range(30):
                pend = [m for m in matches(eid) if m["status"] == "scheduled" and not m["group_id"] and m["player_1"]["name"] != "TBD" and m["player_2"]["name"] != "TBD"]
                if not pend: break
                for m in pend: c.post(f"/api/matches/{m['match_id']}/walkover?winner_position=1", headers=A)
            ko = [m for m in matches(eid) if not m["group_id"]]
            fin = next(m for m in ko if m["stage"] == "final")
            check(f"G+KO n={n} g={g}: championship final decided", fin["status"] == "done" and all(m["status"] == "done" for m in ko), [(m["stage"], m["status"]) for m in ko if m["status"] != "done"])
            expq = 2 * g
            check(f"G+KO n={n} g={g}: championship has qualifiers-1 matches", len(ko) == expq - 1, f"{len(ko)} vs {expq-1}")
    else:
        note(f"G+KO n={n} groups={g} generate", f"{r.status_code} {r.text[:100]}")
# group + KO state guards
t, eid, r = gk(8, 2)
r = c.post(f"/api/events/{eid}/generate-knockout-from-groups?qualifiers_per_group=2", headers=A); check("G+KO: knockout before groups done refused", r.status_code == 400)
r = gen(eid); check("G+KO: generic generate-fixtures refused", r.status_code == 400)
r = c.post(f"/api/events/{eid}/generate-groups?num_groups=2", headers=A); check("G+KO: regenerate groups before play allowed", r.status_code == 200)
r = c.post(f"/api/events/{eid}/generate-groups?num_groups=1", headers=A); check("G+KO: num_groups=1 rejected", r.status_code == 400)
r = c.post(f"/api/events/{eid}/generate-groups?num_groups=5", headers=A); check("G+KO: 8 players / 5 groups rejected", r.status_code == 400)
r = c.post(f"/api/events/{eid}/generate-group-matches", headers=A); check("G+KO: generate-group-matches when matches exist 409", r.status_code == 409)
standings_gk = standings(eid); check("G+KO: standings returns groups (empty rows ok)", len(standings_gk["groups"]) == 2)
# group-standings vs qualification: standings ignored
note("G+KO design", "groups are mini single-elimination brackets; qualification = group final winner/loser, NOT standings position")
# group+KO football (team)
t, eid, r = gk(6, 2, sport="football", team=True); check("G+KO football 6 teams / 2 groups generated", r.status_code == 200, r.text[:100])
# round-robin w/ participants withdrawn
# Delete referenced entities
t, eid = mkevent_tour("football", "round_robin", "team"); tm = mkteams(eid, 3); gen(eid)
r = c.delete(f"/api/teams/{tm[0]}", headers=A); check("delete team in fixtures blocked 409", r.status_code == 409, r.status_code)
m = matches(eid)[0]; r = c.delete(f"/api/matches/{m['match_id']}", headers=A); note("delete a scheduled fixture", r.status_code)
t4, e4 = mkevent_tour("table_tennis", "direct_knockout", "individual"); mkteams(e4, 4, team=False); gen(e4)
semi = [x for x in matches(e4) if x["stage"] == "semi"][0]
c.post(f"/api/matches/{semi['match_id']}/walkover?winner_position=1", headers=A)
r = c.delete(f"/api/matches/{semi['match_id']}", headers=A)
final_after = [x for x in matches(e4) if x["stage"] == "final"][0]
check("delete a DONE bracket match retracts its advanced winner (or is refused)", r.status_code in (400, 409) or (r.status_code == 200 and final_after["player_1"]["player_id"] is None and final_after["player_2"]["player_id"] is None), f"{r.status_code}")
r = c.delete(f"/api/orgs/{ORG}/tournaments/{t4['tournament_id']}", headers=A); check("delete tournament cascades", r.status_code == 200)
from app.models.match import Match; from app.models.group import EventParticipant
d = S(); orph = d.query(Match).filter(Match.event_id == e4).count(); orph2 = d.query(EventParticipant).filter(EventParticipant.event_id == e4).count()
check("delete tournament leaves no orphan matches/participants", orph == 0 and orph2 == 0, f"matches={orph} eps={orph2}")
from app.models.player import Player, Team
n_players_before = d.query(Player).filter(Player.org_id == ORG).count()
r = c.delete(f"/api/orgs/{ORG}", headers=A); check("delete org ok", r.status_code == 200)
d.expire_all(); left = d.query(Player).filter(Player.org_id == None).count(); lt = d.query(Team).filter(Team.org_id == None).count()
check("delete org leaves no orphaned players/teams (PII)", left == 0 and lt == 0, f"orphan players={left}, orphan teams={lt}")
# unauth
for mth, path in (("get", "/api/dashboard"), ("post", "/api/events/1/generate-fixtures"), ("patch", "/api/matches/1/score"), ("post", "/api/matches/1/finish"), ("delete", "/api/matches/1")):
    r = getattr(c, mth)(path, **({"json": {"score_p1": 1, "score_p2": 1}} if mth == "patch" else {}))
    check(f"unauth {mth.upper()} {path} -> 401", r.status_code == 401, r.status_code)

w = max(len(n) for n, _, _ in RES)
npass = sum(1 for _, s, _ in RES if s == "PASS"); nfail = sum(1 for _, s, _ in RES if s == "FAIL")
for n, s, d_ in RES:
    print(f"{s:4} | {n} | {d_}")
print(f"\nTOTAL pass={npass} fail={nfail} info={len(RES)-npass-nfail}")
