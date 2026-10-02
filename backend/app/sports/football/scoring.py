"""
Football scoring engine.
Format: two halves, duration configurable by organiser (default 45+45).
No sets — match has one result: goals scored.

We store the match as a single "set":
  score_p1 = goals by team 1
  score_p2 = goals by team 2

live_state on Match stores: {"half": 1, "minute": 34, "extra_time": false}

Organiser can set custom durations — e.g. 5-a-side = 2×20min.
"""
from typing import Optional
from app.sports.base import BaseSport


MAX_GOALS = 99


class Football(BaseSport):

    def validate_score(self, score_p1, score_p2, config, **ctx):
        if max(score_p1, score_p2) > MAX_GOALS:
            raise ValueError(f"A team cannot score more than {MAX_GOALS} goals.")

    def get_default_config(self) -> dict:
        return {
            "half_duration_minutes": 45,   # each half length
            "halves": 2,                   # number of halves
            "extra_time": False,           # extra time if draw
            "extra_time_duration": 15,     # each extra time period
            "penalties": False,            # penalty shootout after ET
            "format": "11-a-side",         # display label only
        }

    def validate_config(self, config: dict) -> dict:
        c = self.get_default_config()
        c.update({k: v for k, v in config.items() if k in c})
        if not (5 <= c["half_duration_minutes"] <= 90):
            raise ValueError("half_duration_minutes must be between 5 and 90")
        if c["halves"] not in [1, 2]:
            raise ValueError("halves must be 1 or 2")
        return c

    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        """
        Football doesn't use set logic — we return None.
        Match completion is triggered by the organiser pressing 'Full Time'.
        """
        return None

    def check_instant_win(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        return None

    def check_match_winner(self, goals_p1: int, goals_p2: int, config: dict) -> Optional[int]:
        """
        Called when organiser ends the match.
        goals_p1 / goals_p2 passed as sets_won args by the caller.
        """
        if goals_p1 > goals_p2:
            return 1
        if goals_p2 > goals_p1:
            return 2
        return None  # draw

    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        return None  # no serving

    def get_match_summary(self, match) -> dict:
        return {}

    @property
    def sport_key(self) -> str:
        return "football"

    @property
    def display_name(self) -> str:
        return "Football"

    @property
    def has_sets(self) -> bool:
        return False  # single scoreline, no sets