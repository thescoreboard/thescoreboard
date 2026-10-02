"""
Rate limiter tests — unit behaviour + a real 429 through the login endpoint.
"""
import os
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.utils.ratelimit import RateLimiter, login_limiter


def fake_request(ip="1.2.3.4", forwarded=None):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=ip))


# ── Unit behaviour ────────────────────────────────────────────

def test_allows_up_to_limit_then_429():
    rl = RateLimiter(3, 60)
    req = fake_request()
    for _ in range(3):
        rl(req)                       # must not raise
    with pytest.raises(HTTPException) as exc:
        rl(req)
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_separate_ips_have_separate_budgets():
    rl = RateLimiter(2, 60)
    rl(fake_request(ip="1.1.1.1"))
    rl(fake_request(ip="1.1.1.1"))
    rl(fake_request(ip="2.2.2.2"))    # different IP — must not raise
    with pytest.raises(HTTPException):
        rl(fake_request(ip="1.1.1.1"))


def test_uses_first_x_forwarded_for_entry():
    rl = RateLimiter(1, 60)
    rl(fake_request(forwarded="9.9.9.9, 10.0.0.1"))
    with pytest.raises(HTTPException):
        rl(fake_request(forwarded="9.9.9.9, 10.0.0.2"))  # same real client
    rl(fake_request(forwarded="8.8.8.8"))                # different client


# ── Endpoint-level: login returns 429 after the burst budget ──

def test_login_endpoint_rate_limited():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    app.dependency_overrides[get_db] = lambda: db
    login_limiter.reset()
    try:
        client = TestClient(app)
        body = {"email": "nobody@x.com", "password": "wrong"}
        statuses = [client.post("/api/auth/login", json=body).status_code
                    for _ in range(login_limiter.max_requests + 1)]
        assert all(s == 401 for s in statuses[:-1])   # wrong creds until budget spent
        assert statuses[-1] == 429
    finally:
        login_limiter.reset()
        app.dependency_overrides.clear()
        db.close()
        engine.dispose()
