"""
Single source of truth for league / group standings.

Web, mobile and the organiser screens all render the output of
`compute_event_standings` — no client computes its own table.

Rules (per sport)
─────────────────
                points  tie-break order
  football      3/1/0   points, goal difference, goals for
  cricket       2/1/0   points, net run rate, runs for           (tie = 1 each)
  table_tennis  2/0/0   points, sets difference, rally-point difference
  badminton     2/0/0   points, sets difference, rally-point difference

Only FINISHED matches count (live matches never move the table). Walkovers
count as a win/loss but contribute no goals / runs / sets / points (their
scores are placeholders). Every enrolled participant appears, even at 0 played.

Each row carries generic columns (`scored`, `conceded`, `diff`) plus the
sport-specific ones and the legacy keys (`matches_played`, `ranking_points`,
`points_for`, `points_against`, `sets_won`, `sets_lost`) older clients read.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.group import EventParticipant, Group
from app.models.match import Match, MatchParticipant

POINTS = {
    "football":     {"win": 3, "draw": 1, "loss": 0},
    "cricket":      {"win": 2, "draw": 1, "loss": 0},
    "table_tennis": {"win": 2, "draw": 0, "loss": 0},
    "badminton":    {"win": 2, "draw": 0, "loss": 0},
}


def points_rules(event: Event) -> dict:
    return dict(POINTS.get(event.sport_key, POINTS["table_tennis"]))


def _blank(pid, name) -> dict:
    return {
        "participant_id": pid, "name": name,
        "played": 0, "wins": 0, "draws": 0, "losses": 0, "points": 0,
        "scored": 0, "conceded": 0, "diff": 0,
        "sets_won": 0, "sets_lost": 0, "points_for": 0, "points_against": 0,
        "nrr": None, "_runs_for": 0, "_runs_against": 0, "_balls_for": 0, "_balls_against": 0,
        "rank": 0,
    }


def _innings_summary(m: Match, inn: int, cfg: dict) -> Optional[dict]:
    """runs / wickets / balls for innings `inn`, from the MatchSet (runs, wickets)
    and the per-innings balls recorded in live_state['innings']."""
    s = next((x for x in m.sets if x.set_number == inn), None)
    if s is None:
        return None
    rec = ((m.live_state or {}).get("innings") or {}).get(str(inn)) or {}
    max_balls = int(cfg.get("overs", 20)) * 6
    balls = rec.get("balls")
    wickets = s.score_p2 or 0
    # ICC rule: an all-out side is deemed to have faced its full quota of overs.
    if wickets >= int(cfg.get("wickets", 10)) or not balls:
        balls = max_balls
    return {"runs": s.score_p1 or 0, "balls": min(balls, max_balls)}


def _apply_match(sport: str, m: Match, mp1, mp2, r1: dict, r2: dict, rules: dict, cfg: dict) -> None:
    walkover = bool((m.live_state or {}).get("walkover"))
    r1["played"] += 1
    r2["played"] += 1

    if mp1.is_winner:
        r1["wins"] += 1; r2["losses"] += 1
        r1["points"] += rules["win"]; r2["points"] += rules["loss"]
    elif mp2.is_winner:
        r2["wins"] += 1; r1["losses"] += 1
        r2["points"] += rules["win"]; r1["points"] += rules["loss"]
    else:
        r1["draws"] += 1; r2["draws"] += 1
        r1["points"] += rules["draw"]; r2["points"] += rules["draw"]

    if walkover:
        return

    if sport == "football":
        g1, g2 = mp1.score or 0, mp2.score or 0
        r1["scored"] += g1; r1["conceded"] += g2
        r2["scored"] += g2; r2["conceded"] += g1
        r1["points_for"] += g1; r1["points_against"] += g2
        r2["points_for"] += g2; r2["points_against"] += g1

    elif sport == "cricket":
        batting_first = (m.live_state or {}).get("batting_first", 1)
        first, second = (r1, r2) if batting_first == 1 else (r2, r1)
        i1 = _innings_summary(m, 1, cfg)
        i2 = _innings_summary(m, 2, cfg)
        if i1 and i2:
            first["_runs_for"] += i1["runs"];  first["_balls_for"] += i1["balls"]
            second["_runs_against"] += i1["runs"]; second["_balls_against"] += i1["balls"]
            second["_runs_for"] += i2["runs"]; second["_balls_for"] += i2["balls"]
            first["_runs_against"] += i2["runs"]; first["_balls_against"] += i2["balls"]
            for r in (r1, r2):
                r["scored"] = r["_runs_for"]; r["conceded"] = r["_runs_against"]
                r["points_for"] = r["_runs_for"]; r["points_against"] = r["_runs_against"]

    else:  # set-based: table tennis / badminton
        p1_sets = p2_sets = p1_pts = p2_pts = 0
        for s in m.sets:
            if s.is_complete and s.winner_position == 1:
                p1_sets += 1
            elif s.is_complete and s.winner_position == 2:
                p2_sets += 1
            p1_pts += s.score_p1 or 0
            p2_pts += s.score_p2 or 0
        r1["sets_won"] += p1_sets; r1["sets_lost"] += p2_sets
        r2["sets_won"] += p2_sets; r2["sets_lost"] += p1_sets
        r1["points_for"] += p1_pts; r1["points_against"] += p2_pts
        r2["points_for"] += p2_pts; r2["points_against"] += p1_pts
        r1["scored"] += p1_sets; r1["conceded"] += p2_sets
        r2["scored"] += p2_sets; r2["conceded"] += p1_sets


def _finalise(sport: str, row: dict) -> dict:
    row["diff"] = row["scored"] - row["conceded"]
    if sport == "cricket":
        if row["_balls_for"] and row["_balls_against"]:
            row["nrr"] = round(
                row["_runs_for"] / (row["_balls_for"] / 6) - row["_runs_against"] / (row["_balls_against"] / 6), 3)
        else:
            row["nrr"] = 0.0
    for k in ("_runs_for", "_runs_against", "_balls_for", "_balls_against"):
        row.pop(k, None)
    row["matches_played"] = row["played"]          # legacy keys
    row["ranking_points"] = row["points"]
    return row


def _sort_key(sport: str, row: dict):
    if sport == "cricket":
        return (-row["points"], -(row["nrr"] or 0), -row["scored"], row["name"].lower())
    if sport == "football":
        return (-row["points"], -row["diff"], -row["scored"], row["name"].lower())
    return (-row["points"], -row["diff"], -(row["points_for"] - row["points_against"]), row["name"].lower())


def compute_event_standings(event: Event, db: Session) -> dict:
    sport = event.sport_key
    rules = points_rules(event)
    cfg = event.sport_config or {}
    is_team = event.participant_type in ("team", "doubles_pair")

    matches = (
        db.query(Match)
        .filter(Match.event_id == event.event_id, Match.status == "done")
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
            joinedload(Match.sets),
        )
        .all()
    )

    def pid(mp):
        return mp.team_id if is_team else mp.player_id

    def name(mp):
        if is_team and mp.team:
            return mp.team.name
        return mp.player.name if mp.player else (mp.team.name if mp.team else "Unknown")

    table: dict = {}        # group_id -> {participant_id: row}

    def ensure(gid, p, n):
        g = table.setdefault(gid, {})
        if p not in g:
            g[p] = _blank(p, n)
        return g[p]

    for m in matches:
        parts = sorted(m.participants, key=lambda p: p.position)
        if len(parts) < 2:
            continue
        mp1, mp2 = parts[0], parts[1]
        if not pid(mp1) or not pid(mp2):
            continue
        r1 = ensure(m.group_id, pid(mp1), name(mp1))
        r2 = ensure(m.group_id, pid(mp2), name(mp2))
        _apply_match(sport, m, mp1, mp2, r1, r2, rules, cfg)

    eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event.event_id)
        .options(joinedload(EventParticipant.player), joinedload(EventParticipant.team))
        .all()
    )
    for ep in eps:
        p = ep.team_id if is_team else ep.player_id
        n = ep.team.name if (is_team and ep.team) else (ep.player.name if ep.player else "Unknown")
        ensure(ep.group_id if event.format == "group_knockout" else None, p, n)

    def rows_for(gid):
        rows = [_finalise(sport, r) for r in table.get(gid, {}).values()]
        rows.sort(key=lambda r: _sort_key(sport, r))
        for i, r in enumerate(rows, 1):
            r["rank"] = i
        return rows

    groups_out = []
    if event.format == "group_knockout":
        groups = db.query(Group).filter(Group.event_id == event.event_id).order_by(Group.name).all()
        for g in groups:
            groups_out.append({"group_id": g.group_id, "name": g.name, "rows": rows_for(g.group_id)})
    else:
        groups_out.append({"group_id": None, "name": "Standings", "rows": rows_for(None)})

    return {
        "event_id": event.event_id,
        "format": event.format,
        "sport_key": sport,
        "points_rules": rules,
        "groups": groups_out,
    }
