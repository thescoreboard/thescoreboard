"""
Badminton scoring engine.

Rules (BWF standard):
  - Best of 3 games (sets_to_win = 2)
  - Each game first to 21 points, win by 2
  - At 29-all, next point wins (cap at 30)
  - Rally scoring: server changes every point (tracked externally via current_server)

Organiser-configurable options (via sport_config):
  - sets_to_win: 1 (single game), 2 (best of 3, default), 3 (best of 5)
  - points_per_set: 15 or 21 (default 21)
"""
from typing import Optional
from app.sports.base import BaseSport
from app.sports.set_rules import validate_set_score


DEFAULT_CONFIG = {
    "sets_to_win":          2,     # best of 3 → need 2 games
    "points_per_set":       21,    # first to 21
    "win_margin":           2,     # win by 2
    "deuce_starts_at":      20,    # deuce kicks in at 20-all
    "max_points":           30,    # cap: next point after 29-all wins
    "serve_changes_on_point": True, # rally scoring — server changes each point
}

VALID_SETS_TO_WIN = [1, 2, 3]     # BO1, BO3, BO5


class Badminton(BaseSport):

    valid_sets_to_win = VALID_SETS_TO_WIN

    def validate_score(self, score_p1, score_p2, config, **ctx):
        validate_set_score(
            score_p1, score_p2,
            target=config.get("points_per_set", 21), margin=config.get("win_margin", 2),
            cap=config.get("max_points", 30),
        )


    def get_default_config(self) -> dict:
        return DEFAULT_CONFIG.copy()

    def validate_config(self, config: dict) -> dict:
        clean = DEFAULT_CONFIG.copy()

        if "sets_to_win" in config:
            stw = int(config["sets_to_win"])
            if stw not in VALID_SETS_TO_WIN:
                raise ValueError(f"sets_to_win must be one of {VALID_SETS_TO_WIN}")
            clean["sets_to_win"] = stw

        if "points_per_set" in config:
            pps = int(config["points_per_set"])
            if pps not in (15, 21):
                raise ValueError("points_per_set must be 15 or 21")
            clean["points_per_set"] = pps
            clean["deuce_starts_at"] = pps - 1
            # Adjust cap proportionally (15-pt game caps at 17; 21-pt caps at 30)
            clean["max_points"] = 17 if pps == 15 else 30

        return clean

    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        pts     = config.get("points_per_set", 21)
        margin  = config.get("win_margin", 2)
        max_pts = config.get("max_points", 30)

        for pos, mine, theirs in [(1, score_p1, score_p2), (2, score_p2, score_p1)]:
            if mine >= pts and mine - theirs >= margin:
                return pos
            if mine >= max_pts and mine > theirs:
                return pos

        return None

    def check_match_winner(self, sets_won_p1: int, sets_won_p2: int, config: dict) -> Optional[int]:
        needed = config.get("sets_to_win", 2)
        if sets_won_p1 >= needed:
            return 1
        if sets_won_p2 >= needed:
            return 2
        return None

    def check_instant_win(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        return None  # Badminton has no instant-win rule

    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        # Rally scoring: server is whoever won the last point.
        # The current_server is updated by the scorer on every point.
        return None

    def get_match_summary(self, match) -> dict:
        """Build a badminton match summary — same structure as TT for API consistency."""
        parts = sorted(match.participants, key=lambda p: p.position)
        sets  = sorted(match.sets, key=lambda s: s.set_number) if match.sets else []

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
            "match_id":       match.match_id,
            "status":         match.status,
            "stage":          match.stage,
            "round":          match.round,
            "table_number":   match.table_number,
            "current_server": match.current_server,
            "player_1": {
                "name":      _name(p1),
                "score":     p1.score     if p1 else 0,
                "is_winner": p1.is_winner if p1 else False,
            },
            "player_2": {
                "name":      _name(p2),
                "score":     p2.score     if p2 else 0,
                "is_winner": p2.is_winner if p2 else False,
            },
            "sets": [
                {
                    "set_number":  s.set_number,
                    "score_p1":    s.score_p1,
                    "score_p2":    s.score_p2,
                    "winner":      s.winner_position,
                    "is_complete": s.is_complete,
                }
                for s in sets
            ],
        }

    @property
    def has_sets(self) -> bool:
        return True
