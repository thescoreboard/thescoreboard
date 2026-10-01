"""
Cricket scoring engine.
Format: limited-overs match (T20, ODI, or custom overs).
Each "set" = one innings. Match has 2 innings total.
Winner: team with higher runs after both innings, or chasing team
        reaches target before overs are up.

Stored in MatchSet:
  score_p1 = runs scored by team 1 in this innings
  score_p2 = wickets lost by team 1 in this innings
  (we repurpose the set fields — wickets go in score_p2 for the batting team)

live_state on Match stores: {"overs": "12.3", "target": 145}
"""
from typing import Optional
from app.sports.base import BaseSport


class Cricket(BaseSport):

    def validate_score(self, score_p1, score_p2, config, **ctx):
        """score_p1 = runs, score_p2 = wickets lost, ctx: innings, balls, live_state."""
        innings = ctx.get("innings") or 1
        balls = ctx.get("balls") or 0
        ls = ctx.get("live_state") or {}
        super_over = innings >= 3
        if super_over:
            if not ls.get("is_super_over") or innings > (ls.get("current_innings") or 0):
                raise ValueError("There is no super over in progress for this innings number.")
        elif innings not in (1, 2):
            raise ValueError("Innings must be 1 or 2 (3+ only for a super over).")
        max_wickets = 2 if super_over else config.get("wickets", 10)
        max_balls = 6 if super_over else config.get("overs", 20) * 6
        if score_p2 > max_wickets:
            raise ValueError(f"Wickets cannot exceed {max_wickets}.")
        if balls < 0 or balls > max_balls:
            raise ValueError(f"Balls bowled cannot exceed {max_balls} ({max_balls // 6} overs).")

    def get_default_config(self) -> dict:
        return {
            "overs": 20,             # max overs per innings (T20 default)
            "wickets": 10,           # wickets per innings
            "innings_count": 2,      # total innings in the match (1 per team)
            "duckworth_lewis": False, # not implemented — placeholder
        }

    def validate_config(self, config: dict) -> dict:
        c = self.get_default_config()
        c.update({k: v for k, v in config.items() if k in c})
        if not (1 <= c["overs"] <= 50):
            raise ValueError("overs must be between 1 and 50")
        if not (1 <= c["wickets"] <= 14):
            raise ValueError("wickets must be between 1 and 14")
        return c

    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        """
        For cricket, a 'set' = innings. We don't auto-complete an innings
        here — the organiser explicitly marks it done (all out or overs up).
        Return None always; completion is handled manually.
        """
        return None

    def check_match_winner(self, sets_won_p1: int, sets_won_p2: int, config: dict) -> Optional[int]:
        """
        Cricket match winner is determined by runs, not sets won.
        This is called externally with the actual run tallies.
        sets_won_p1 = total runs by team 1
        sets_won_p2 = total runs by team 2
        """
        if sets_won_p1 > sets_won_p2:
            return 1
        if sets_won_p2 > sets_won_p1:
            return 2
        return None  # tie / super over needed

    def check_instant_win(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        return None  # no instant win in cricket

    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        return None  # no serving concept

    def get_match_summary(self, match) -> dict:
        return {}

    @property
    def sport_key(self) -> str:
        return "cricket"

    @property
    def display_name(self) -> str:
        return "Cricket"

    @property
    def has_sets(self) -> bool:
        # We use sets to store innings
        return True