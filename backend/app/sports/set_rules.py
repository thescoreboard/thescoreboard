"""
Reachability rule for a single game/set in a first-to-N, win-by-margin sport
(table tennis, badminton). The client sends the running score after every
point, so a score is valid iff it can occur in real play:

  * either side still below N              -> in progress (any score)
  * leader exactly at N                    -> the other side <= N-1
                                              (<= N-2 is a finished game, N-1 is deuce)
  * leader beyond N (deuce zone)           -> the other side >= N-1 and the gap
                                              is at most the win margin
  * optional hard cap (badminton 30/17)    -> the leader never exceeds it
"""


def validate_set_score(a: int, b: int, *, target: int, margin: int = 2, cap: int | None = None) -> None:
    hi, lo = max(a, b), min(a, b)
    if cap is not None and hi > cap:
        raise ValueError(f"A game cannot go beyond {cap} points.")
    if hi < target:
        return
    if hi == target:
        if lo <= target - 1:
            return
    else:
        if lo >= target - 1 and hi - lo <= margin:
            return
    raise ValueError(f"{a}-{b} is not a possible score in a game to {target} (win by {margin}).")
