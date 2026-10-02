"""Per-sport score plausibility: reject what the rules cannot produce, accept everything real play can."""
import pytest

from app.sports.registry import get_sport_engine
from app.sports.set_rules import validate_set_score

TT = get_sport_engine("table_tennis")
BD = get_sport_engine("badminton")
CK = get_sport_engine("cricket")
FB = get_sport_engine("football")


def ok(engine, a, b, cfg=None, **ctx):
    engine.validate_score(a, b, cfg or engine.get_default_config(), **ctx)


def bad(engine, a, b, cfg=None, **ctx):
    with pytest.raises(ValueError):
        engine.validate_score(a, b, cfg or engine.get_default_config(), **ctx)


@pytest.mark.parametrize("a,b", [(0, 0), (5, 3), (10, 10), (11, 0), (11, 9), (11, 10), (10, 11), (12, 10), (13, 11), (15, 14), (30, 28)])
def test_tt_reachable_scores(a, b):
    ok(TT, a, b)


@pytest.mark.parametrize("a,b", [(12, 5), (25, 3), (12, 9), (13, 10), (11, 11), (14, 11)])
def test_tt_unreachable_scores(a, b):
    bad(TT, a, b)


def test_tt_instant_win_house_rule_only_when_enabled():
    cfg = TT.validate_config({"instant_win": {"enabled": True, "score": 7, "opponent_score": 0}})
    ok(TT, 7, 0, cfg)
    assert TT.get_default_config()["instant_win"]["enabled"] is False


def test_tt_respects_configured_target():
    cfg = TT.validate_config({"points_per_set": 21})
    ok(TT, 21, 5, cfg); bad(TT, 22, 5, cfg); ok(TT, 20, 19, cfg)


@pytest.mark.parametrize("a,b", [(21, 19), (21, 20), (22, 20), (29, 29), (30, 29), (30, 28), (0, 21 - 2)])
def test_badminton_reachable(a, b):
    ok(BD, a, b)


@pytest.mark.parametrize("a,b", [(31, 0), (25, 10), (31, 29), (22, 19), (30, 27), (24, 21)])
def test_badminton_unreachable(a, b):
    bad(BD, a, b)


def test_badminton_15_point_cap():
    cfg = BD.validate_config({"points_per_set": 15})
    ok(cfg and BD, 15, 3, cfg); ok(BD, 17, 16, cfg); ok(BD, 16, 14, cfg)
    bad(BD, 18, 16, cfg); bad(BD, 20, 3, cfg)


def test_set_rule_helper_basics():
    validate_set_score(11, 10, target=11)
    with pytest.raises(ValueError):
        validate_set_score(11, 11, target=11)


def test_cricket_limits():
    cfg = CK.get_default_config()                       # 20 overs, 10 wickets
    ok(CK, 150, 10, cfg, innings=1, balls=120)
    bad(CK, 150, 11, cfg, innings=1, balls=60)          # wickets
    bad(CK, 150, 5, cfg, innings=1, balls=121)          # > 20 overs
    bad(CK, 150, 5, cfg, innings=7, balls=10)           # innings
    bad(CK, 10, 1, cfg, innings=3, balls=3, live_state={})       # no super over running
    ok(CK, 10, 1, cfg, innings=3, balls=3, live_state={"is_super_over": True, "current_innings": 3})
    bad(CK, 10, 3, cfg, innings=3, balls=3, live_state={"is_super_over": True, "current_innings": 3})
    bad(CK, 10, 1, cfg, innings=3, balls=7, live_state={"is_super_over": True, "current_innings": 3})
    short = CK.validate_config({"overs": 10, "wickets": 8})
    bad(CK, 50, 9, short, innings=1, balls=30)
    bad(CK, 50, 3, short, innings=2, balls=61)


def test_football_cap():
    ok(FB, 9, 8); bad(FB, 100, 0)
