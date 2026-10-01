"""
Test fixtures — in-memory SQLite so tests never touch the real database.

DATABASE_URL is forced BEFORE any app import: app.config runs load_dotenv()
at import time, and load_dotenv never overrides variables that already exist
in the environment, so this shields tests from backend/.env.
"""
import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
# Import every model module so Base.metadata knows all tables
from app.models import user, organization, tournament, tournament_member, event, group, player, match  # noqa: F401


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Rate limiters are process-global; tests that register several users
    from the same fake IP must not trip each other's limits."""
    from app.utils import ratelimit
    for lim in (ratelimit.login_limiter, ratelimit.register_limiter, ratelimit.public_registration_limiter):
        lim.reset()
    yield
