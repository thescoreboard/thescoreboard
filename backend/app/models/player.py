"""
Player   — individual competitor (TT, Badminton).
Team     — a squad for team sports (Cricket, Football).
TeamMember — a player within a team roster.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Player(Base):
    __tablename__ = "players"

    player_id  = Column(Integer, primary_key=True)
    org_id     = Column(Integer, ForeignKey("organizations.org_id", ondelete="SET NULL"), nullable=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.user_id",        ondelete="SET NULL"), nullable=True, index=True)
    name       = Column(String(150), nullable=False)
    age        = Column(Integer,     nullable=True)
    gender     = Column(String(20),  nullable=True)
    phone      = Column(String(30),  nullable=True)
    email      = Column(String(200), nullable=True)
    location   = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    seed_level = Column(String(20), nullable=True)  # beginner / intermediate / advanced / pro

    org  = relationship("Organization")
    user = relationship("User", foreign_keys=[user_id])
    event_participations = relationship("EventParticipant", back_populates="player",
                                        foreign_keys="EventParticipant.player_id")


class Team(Base):
    __tablename__ = "teams"

    team_id       = Column(Integer, primary_key=True)
    org_id        = Column(Integer, ForeignKey("organizations.org_id", ondelete="SET NULL"), nullable=True, index=True)
    name          = Column(String(150), nullable=False)
    sport_key     = Column(String(50),  nullable=True)
    contact_name  = Column(String(150), nullable=True)
    contact_phone = Column(String(30),  nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    seed_level = Column(String(20), nullable=True)  # beginner / intermediate / advanced / pro

    logo_url   = Column(String(500), nullable=True)

    org = relationship("Organization")
    members              = relationship("TeamMember", back_populates="team",
                                        cascade="all, delete-orphan")
    event_participations = relationship("EventParticipant", back_populates="team",
                                        foreign_keys="EventParticipant.team_id")


class TeamMember(Base):
    __tablename__ = "team_members"

    tm_id         = Column(Integer, primary_key=True)
    team_id       = Column(Integer, ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False, index=True)
    name          = Column(String(150), nullable=False)
    role          = Column(String(50),  nullable=True)   # captain / vice_captain / player
    jersey_number = Column(Integer,     nullable=True)
    age           = Column(Integer,     nullable=True)
    gender        = Column(String(20),  nullable=True)   # used by gender-restricted events
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    team = relationship("Team", back_populates="members")