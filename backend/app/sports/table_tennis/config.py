"""
Table Tennis configuration defaults.
"""

DEFAULT_CONFIG = {
    "sets_to_win": 2,        # best of 3 → need 2 to win (default; organisers can change per-match)
    "points_per_set": 11,    # first to 11
    "win_margin": 2,         # must win by 2 at deuce
    "deuce_starts_at": 10,   # deuce kicks in when both reach 10
    "serve_interval": 2,     # serve switches every 2 points
    "serve_interval_deuce": 1,  # every 1 point at deuce
    "instant_win": {          # optional house rule: 7-0 wins the SET early (not an official TT rule)
        "enabled": False,
        "score": 7,
        "opponent_score": 0,
    },
}

VALID_SETS_TO_WIN = [1, 2, 3]  # BO1, BO3, BO5  (sets_to_win = sets needed to win)
