"""
Tournament — the top-level shareable entity.

Lifecycle: draft → live → completed. Just three states — whether the
tournament is publicly visible and whether it's wrapped up. Registration
availability is a SEPARATE concern (see `registration_open` below): it's
driven by registration_start_date/registration_end_date plus the organiser
being able to close it early, not by a lifecycle status. This lets fixtures
run and registration close independently, instead of forcing every
tournament through a single linear draft→registration→...→live pipeline.
"""
from datetime import date

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text, Float, JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

TOURNAMENT_STATUSES = ["draft", "live", "completed"]


class Tournament(Base):
    __tablename__ = "tournaments"

    tournament_id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Single-sport or multi-sport
    is_multi_sport = Column(Boolean, default=False)

    # Dates. start_date / end_date are legacy: the tournament page and API no
    # longer read or write them (columns kept so no destructive migration is
    # needed). Registration availability still uses the two dates below.
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    registration_start_date = Column(Date, nullable=True)
    registration_end_date   = Column(Date, nullable=True)

    # Branding
    poster_url   = Column(String(500), nullable=True)  # primary visual asset
    logo_url     = Column(String(500), nullable=True)  # square logo
    og_image_url = Column(String(500), nullable=True)
    primary_color    = Column(String(7), nullable=True)
    secondary_color  = Column(String(7), nullable=True)
    # banner_url kept in DB for backward compat — not exposed in API

    # Location
    venue = Column(String(255), nullable=True)
    city  = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    venue_lat = Column(Float, nullable=True)   # coordinates from OpenStreetMap picker
    venue_lng = Column(Float, nullable=True)

    # Legacy columns — prize pool / rules / contact info (tournament_info) and
    # payment collection (payment_*) were removed from the product. Nothing
    # reads or writes them any more; kept only to avoid a destructive migration.
    tournament_info = Column(JSON, nullable=True)
    payment_amount  = Column(Integer, nullable=True)
    payment_upi_id  = Column(String(100), nullable=True)
    payment_qr_url  = Column(String(500), nullable=True)

    # Lifecycle: draft → live → completed
    status = Column(String(50), default="draft", nullable=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    is_published = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="tournaments")
    events = relationship("Event", back_populates="tournament", cascade="all, delete-orphan")
    sponsors = relationship("Sponsor", back_populates="tournament", cascade="all, delete-orphan")

    @property
    def registration_open(self) -> bool:
        """
        True when players can currently register: the tournament is live AND
        today falls inside [registration_start_date, registration_end_date]
        (either bound is optional — no deadline means "open until closed").
        Organisers close registration early by moving registration_end_date
        to a past date, so no extra "closed" flag is needed.
        """
        if self.status != "live":
            return False
        today = date.today()
        if self.registration_start_date and today < self.registration_start_date:
            return False
        if self.registration_end_date and today > self.registration_end_date:
            return False
        return True


class Sponsor(Base):
    __tablename__ = "sponsors"

    sponsor_id    = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False, index=True)
    name          = Column(String(255), nullable=False)
    logo_url      = Column(String(500), nullable=True)
    tier          = Column(String(50),  default="partner")  # title | gold | silver | bronze | partner
    website       = Column(String(500), nullable=True)
    contact_phone = Column(String(50),  nullable=True)
    contact_email = Column(String(255), nullable=True)
    description   = Column(Text,        nullable=True)

    tournament = relationship("Tournament", back_populates="sponsors")