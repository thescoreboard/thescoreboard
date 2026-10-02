"""
Table Tennis scoring engine.

All TT-specific rules:
- First to 11 points, win by 2
- Deuce at 10-10: serve alternates every point
- 7-0 instant match win (configurable)
- Best of N sets (configurable: 3 or 5)
- Serve rotation every 2 points (every 1 at deuce)
"""
from typing import Optional
from app.sports.base import BaseSport
from app.sports.table_tennis.config import DEFAULT_CONFIG, VALID_SETS_TO_WIN
from app.sports.set_rules import validate_set_score


class TableTennis(BaseSport):

    valid_sets_to_win = VALID_SETS_TO_WIN

    def validate_score(self, score_p1, score_p2, config, **ctx):
        iw = config.get("instant_win") or {}
        if iw.get("enabled") and max(score_p1, score_p2) == iw.get("score", 7):
            return  # house rule: the game may legitimately end at 7-0
        validate_set_score(
            score_p1, score_p2,
            target=config.get("points_per_set", 11), margin=config.get("win_margin", 2),
        )

    def get_default_config(self) -> dict:
        return DEFAULT_CONFIG.copy()

    def validate_config(self, config: dict) -> dict:
        """Validate and normalize TT config."""
        clean = DEFAULT_CONFIG.copy()

        if "sets_to_win" in config:
            stw = int(config["sets_to_win"])
            if stw not in VALID_SETS_TO_WIN:
                raise ValueError(f"sets_to_win must be one of {VALID_SETS_TO_WIN}")
            clean["sets_to_win"] = stw

        if "points_per_set" in config:
            pps = int(config["points_per_set"])
            if pps < 5 or pps > 21:
                raise ValueError("points_per_set must be between 5 and 21")
            clean["points_per_set"] = pps
            clean["deuce_starts_at"] = pps - 1

        if "instant_win" in config:
            iw = config["instant_win"]
            if isinstance(iw, dict):
                clean["instant_win"] = {
                    "enabled": bool(iw.get("enabled", True)),
                    "score": int(iw.get("score", 7)),
                    "opponent_score": int(iw.get("opponent_score", 0)),
                }
            elif isinstance(iw, bool):
                clean["instant_win"]["enabled"] = iw

        return clean

    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        """Check if a set has been won."""
        pts = config.get("points_per_set", 11)
        margin = config.get("win_margin", 2)
        deuce_at = config.get("deuce_starts_at", pts - 1)

        is_deuce = score_p1 >= deuce_at and score_p2 >= deuce_at

        if is_deuce:
            # At deuce, need to win by margin
            if score_p1 - score_p2 >= margin:
                return 1
            if score_p2 - score_p1 >= margin:
                return 2
        else:
            if score_p1 >= pts:
                return 1
            if score_p2 >= pts:
                return 2

        return None

    def check_match_winner(self, sets_won_p1: int, sets_won_p2: int, config: dict) -> Optional[int]:
        """Check if match is won (best of N sets)."""
        stw = config.get("sets_to_win", 3)
        if sets_won_p1 >= stw:
            return 1
        if sets_won_p2 >= stw:
            return 2
        return None

    def check_instant_win(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        """Check the 7-0 instant match win rule."""
        iw = config.get("instant_win", {})
        if not iw.get("enabled", False):
            return None

        target = iw.get("score", 7)
        opp = iw.get("opponent_score", 0)

        if score_p1 == target and score_p2 == opp:
            return 1
        if score_p2 == target and score_p1 == opp:
            return 2
        return None

    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        """
        Determine who is serving.
        - Normal play: serve switches every 2 points from first_server.
        - Deuce (both >= deuce_starts_at): serve switches every point.
        """
        total = score_p1 + score_p2
        deuce_at = config.get("deuce_starts_at", 10)
        is_deuce = score_p1 >= deuce_at and score_p2 >= deuce_at
        other = 2 if first_server == 1 else 1

        if is_deuce:
            # Points since deuce started
            deuce_total = total - (deuce_at * 2)
            interval = config.get("serve_interval_deuce", 1)
            flips = deuce_total // interval if interval else 0
        else:
            interval = config.get("serve_interval", 2)
            flips = total // interval if interval else 0

        return first_server if flips % 2 == 0 else other

    def get_match_summary(self, match) -> dict:
        """Build a TT-specific match summary. Works for singles and doubles."""
        parts = sorted(match.participants, key=lambda p: p.position)
        sets = sorted(match.sets, key=lambda s: s.set_number) if match.sets else []

        p1 = parts[0] if len(parts) > 0 else None
        p2 = parts[1] if len(parts) > 1 else None

        def _name(p):
            if not p:
                return "TBD"
            if p.team:
                return p.team.name
            if p.player:
                return p.player.name
            return "TBD"

        return {
            "match_id": match.match_id,
            "status": match.status,
            "stage": match.stage,
            "round": match.round,
            "table_number": match.table_number,
            "current_server": match.current_server,
            "player_1": {
                "name": _name(p1),
                "score": p1.score if p1 else 0,
                "is_winner": p1.is_winner if p1 else False,
            },
            "player_2": {
                "name": _name(p2),
                "score": p2.score if p2 else 0,
                "is_winner": p2.is_winner if p2 else False,
            },
            "sets": [
                {
                    "set_number": s.set_number,
                    "score_p1": s.score_p1,
                    "score_p2": s.score_p2,
                    "winner": s.winner_position,
                    "is_complete": s.is_complete,
                }
                for s in sets
            ],
        }
