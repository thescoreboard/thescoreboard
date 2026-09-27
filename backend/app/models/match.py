"""
Match            — a single game between two participants (players or teams).
MatchParticipant — each side in a match with aggregate score and winner flag.
MatchSet         — individual set scores for set-based sports (TT, badminton).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, JSON, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Match(Base):
    __tablename__ = "matches"

    match_id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.group_id", ondelete="SET NULL"), nullable=True, index=True)

    round = Column(Integer, nullable=False, default=1)
    stage = Column(String(50), default="group")  # group | quarter | semi | third_place | final
    status = Column(String(50), default="scheduled", index=True)  # scheduled | live | done
    table_number = Column(Integer, nullable=True)
    court_number = Column(Integer, nullable=True)  # for badminton/tennis
    # NOTE: `stage` deliberately has NO CHECK constraint — legacy rows carry
    # values like 'third'/'bye' that a strict enum would reject.

    # Who is currently serving (position 1 or 2), null if not applicable
    current_server = Column(Integer, nullable=True)

    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Sport-specific live state (flexible JSON for any sport)
    # TT: {"current_set": 2}
    # Cricket: {"current_over": 12.3, "current_innings": 1}
    # Football: {"half": 1, "minute": 34}
    live_state = Column(JSON, nullable=True)

    # Compound indexes for common query patterns
    __table_args__ = (
        Index("ix_matches_event_status", "event_id", "status"),
        Index("ix_matches_event_round",  "event_id", "stage", "round"),
        CheckConstraint(
            "status IN ('scheduled', 'live', 'done')", name="ck_matches_status"),
    )

    # Relationships
    event = relationship("Event", back_populates="matches")
    group = relationship("Group", back_populates="matches")
    participants = relationship(
        "MatchParticipant",
        back_populates="match",
        cascade="all, delete-orphan",
    )
    sets = relationship(
        "MatchSet",
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="MatchSet.set_number",
    )


class MatchParticipant(Base):
    """
    Each side in a match. Position 1 = home/first, Position 2 = away/second.
    Links to player (individual) or team (team sport).
    """
    __tablename__ = "match_participants"

    mp_id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False, index=True)

    # One of these is set
    player_id = Column(Integer, ForeignKey("players.player_id", ondelete="CASCADE"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=True, index=True)

    position = Column(Integer, nullable=False)  # 1 or 2
    score = Column(Integer, default=0)           # aggregate / total score
    is_winner = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("match_id", "position", name="uq_match_position"),
        CheckConstraint("position IN (1, 2)", name="ck_position_1_or_2"),
        # DI-1: exactly one of player_id / team_id must be set.
        CheckConstraint(
            "(player_id IS NULL) <> (team_id IS NULL)", name="ck_mp_one_side"),
    )

    match = relationship("Match", back_populates="participants")
    player = relationship("Player")
    team = relationship("Team")


class MatchSet(Base):
    """
    Individual set scores for set-based sports (Table Tennis, Badminton).
    Not used for football, cricket, etc.
    """
    __tablename__ = "match_sets"

    set_id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False, index=True)
    set_number = Column(Integer, nullable=False)  # 1, 2, 3, ...
    score_p1 = Column(Integer, default=0)
    score_p2 = Column(Integer, default=0)
    winner_position = Column(Integer, nullable=True)  # 1 or 2 or null if in-progress
    is_complete = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("match_id", "set_number", name="uq_match_set"),
    )

    match = relationship("Match", back_populates="sets")
