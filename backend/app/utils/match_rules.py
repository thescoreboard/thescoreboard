"""
Match-level rules shared by every router and serializer.

A match "requires a winner" when it sits in an elimination bracket: someone has
to advance, so a level result must be settled (extra time, penalties, super
over) before it can be finished. League / pool fixtures ("round_robin",
"group") may end level — a draw or a tie is a valid result there.

This is decided from the match's STAGE, never from "stage != 'group'": a
round-robin fixture has stage "round_robin", which the old check mistook for
a knockout.
"""

KNOCKOUT_STAGES = frozenset({
    "preliminary", "round_of_32", "round_of_16", "knockout",
    "quarter", "semi", "final", "third_place",
})


def requires_winner(stage) -> bool:
    return stage in KNOCKOUT_STAGES
