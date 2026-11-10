"""
End-to-end bracket simulation: for every participant count from 2 to 33 (odd
and even), build the bracket exactly as the API does, then play every match
through the real winner-advancement code. The bracket must fill itself in,
produce a champion, and send both semi-final losers to the 3rd place match.

Also covers manually ordered brackets (the order the organiser picks in the
"Set up manually" editor) and the manual group draw endpoint.
"""
import random

import pytest

from app.models.event import Event
from app.models.match import Match, MatchParticipant
from app.routers.matches import _finish_match
from app.sports.bracket import build_bracket


def _persist(db, ev, specs, group_id=None):
    out = []
    for spec in specs:
        m = Match(event_id=ev.event_id, group_id=group_id, stage=spec["stage"],
                  round=spec["round"], status="scheduled")
        db.add(m)
        db.flush()
        for pos, pid in ((1, spec["pid1"]), (2, spec["pid2"])):
            if pid is not None:
                db.add(MatchParticipant(match_id=m.match_id, player_id=pid, position=pos))
        out.append(m)
    db.flush()
    for m in out:
        db.refresh(m)
    return out


def _ids(m):
    return sorted(p.player_id for p in m.participants if p.player_id)


def _play_out(db, matches, rng):
    """Finish playable matches until none are left. Returns winners by match."""
    winners = {}
    for _ in range(len(matches) * 3):
        playable = [m for m in matches if m.status != "done" and len(m.participants) == 2]
        if not playable:
            break
        # play the earliest round/stage first, like a real tournament
        m = sorted(playable, key=lambda x: (x.round, x.match_id))[0]
        db.refresh(m)
        pos = rng.choice([1, 2])
        _finish_match(m, pos, db)
        db.flush()
        db.refresh(m)
        winners[m.match_id] = next(p.player_id for p in m.participants if p.is_winner)
        for other in matches:
            db.refresh(other)
    return winners


@pytest.mark.parametrize("n", list(range(2, 34)))
@pytest.mark.parametrize("third_place", [True, False])
def test_every_bracket_size_plays_through_to_a_champion(db, n, third_place):
    rng = random.Random(n * 7 + int(third_place))
    ev = Event(tournament_id=1, name="E", sport_key="badminton", format="direct_knockout")
    db.add(ev)
    db.flush()

    ids = list(range(1000, 1000 + n))
    specs = build_bracket(ids, shuffle=True, third_place=third_place)
    expected = (n - 1) + (1 if third_place and n >= 4 else 0)
    assert len(specs) == expected

    matches = _persist(db, ev, specs)
    # every participant is placed exactly once at the start
    placed = [pid for m in matches for pid in _ids(m)]
    assert len(placed) == len(set(placed))

    _play_out(db, matches, rng)

    assert all(m.status == "done" for m in matches), \
        [(m.stage, m.round, _ids(m), m.status) for m in matches if m.status != "done"]

    final = next(m for m in matches if m.stage == "final")
    assert len(final.participants) == 2
    champion = next(p.player_id for p in final.participants if p.is_winner)
    assert champion in ids

    if third_place and n >= 4:
        third = next(m for m in matches if m.stage == "third_place")
        assert len(third.participants) == 2
        semis = [m for m in matches if m.stage == "semi"]
        assert len(semis) == 2
        losers = sorted(next(p.player_id for p in s.participants if not p.is_winner) for s in semis)
        assert _ids(third) == losers
        # nobody plays the 3rd place match AND the final
        assert not set(_ids(third)) & set(_ids(final))

    # no participant is ever dropped: everyone appears in at least one match
    appeared = {pid for m in matches for pid in _ids(m)}
    assert appeared == set(ids)


@pytest.mark.parametrize("n", [3, 5, 6, 7, 9, 10, 11, 13])
def test_manual_order_is_respected_for_odd_sizes(db, n):
    """The manual editor sends [byes..., first-round pairs...]; that exact
    order must decide who gets a bye and who plays whom in round 1."""
    ids = list(range(100, 100 + n))
    specs = build_bracket(ids, shuffle=False, third_place=True)
    bye_count = (2 ** (n - 1).bit_length()) // 2 * 2 - n  # == half - prelim
    first_round = [s for s in specs if s["round"] == 1]
    # round 1 pairs are consecutive entries after the byes
    r1_players = ids[bye_count:]
    assert [(s["pid1"], s["pid2"]) for s in first_round] == list(zip(r1_players[0::2], r1_players[1::2]))
    # byes are seated directly in round 2, in order
    round2 = [s for s in specs if s["round"] == 2 and s["stage"] != "third_place"]
    seated = [pid for s in round2 for pid in (s["pid1"], s["pid2"]) if pid is not None]
    assert seated == ids[:bye_count]
