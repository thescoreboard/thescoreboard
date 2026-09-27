from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.player import PlayerOut


class MatchSetOut(BaseModel):
    set_number: int
    score_p1: int
    score_p2: int
    winner_position: Optional[int]
    is_complete: bool

    class Config:
        from_attributes = True


class MatchParticipantOut(BaseModel):
    mp_id: int
    player: Optional[PlayerOut] = None
    position: int
    score: int
    is_winner: bool

    class Config:
        from_attributes = True


class MatchOut(BaseModel):
    match_id: int
    event_id: int
    group_id: Optional[int]
    round: int
    stage: str
    status: str
    table_number: Optional[int]
    court_number: Optional[int]
    current_server: Optional[int]
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    live_state: Optional[dict]
    participants: List[MatchParticipantOut] = []
    sets: List[MatchSetOut] = []

    class Config:
        from_attributes = True


class MatchCreate(BaseModel):
    group_id: Optional[int] = None
    round: int = 1
    stage: str = "group"
    # Individual / doubles-player events
    player1_id: Optional[int] = None
    player2_id: Optional[int] = None
    # Team events
    team1_id: Optional[int] = None
    team2_id: Optional[int] = None
    table_number: Optional[int] = None


class ScoreUpdate(BaseModel):
    """
    For set-based sports (TT, badminton): update current set score.
    For non-set sports: update match score directly.
    """
    score_p1: int
    score_p2: int
    current_server: Optional[int] = None  # 1 or 2


class MatchStatusUpdate(BaseModel):
    status: str  # scheduled | live | done
    table_number: Optional[int] = None
    sets_to_win: Optional[int] = None
