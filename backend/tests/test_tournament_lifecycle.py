"""
Tournament lifecycle: draft/live/completed transitions and the
registration_open computed property (registration is date-driven, not a
lifecycle status).
"""
import os
from datetime import date, timedelta

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.models.user import User
from app.utils.auth import get_current_user, get_current_user_id


@pytest.fixture()
def ctx(db):
    org = Organization(name="Club", slug="club")
    db.add(org); db.flush()
    organiser = User(email="org@x.com", name="Organiser")
    db.add(organiser); db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=organiser.user_id, role="admin"))
    t = Tournament(org_id=org.org_id, name="Open", slug="open", status="draft")
    db.add(t); db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: organiser
    app.dependency_overrides[get_current_user_id] = lambda: organiser.user_id

    yield {"db": db, "t": t, "client": TestClient(app)}

    app.dependency_overrides.clear()


# ── registration_open property ────────────────────────────────

def test_registration_closed_while_draft(ctx):
    t = ctx["t"]
    t.status = "live"
    assert t.registration_open is True   # no dates set → open once live
    t.status = "draft"
    assert t.registration_open is False


def test_registration_respects_end_date(ctx):
    t = ctx["t"]
    t.status = "live"; t.is_published = True
    t.registration_end_date = date.today() - timedelta(days=1)
    assert t.registration_open is False    # deadline passed
    t.registration_end_date = date.today() + timedelta(days=1)
    assert t.registration_open is True


def test_registration_respects_start_date(ctx):
    t = ctx["t"]
    t.status = "live"
    t.registration_start_date = date.today() + timedelta(days=1)
    assert t.registration_open is False    # hasn't opened yet
    t.registration_start_date = date.today()
    assert t.registration_open is True


def test_end_registration_now_by_setting_past_date(ctx):
    """The 'End Registration Now' UI action is just: set end date to yesterday."""
    t = ctx["t"]
    t.status = "live"
    assert t.registration_open is True
    t.registration_end_date = date.today() - timedelta(days=1)
    assert t.registration_open is False


# ── Lifecycle transition endpoint ─────────────────────────────

def test_draft_to_live_to_completed(ctx):
    client, t = ctx["client"], ctx["t"]
    r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition?target_status=live")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "live"

    r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition?target_status=completed")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


def test_completed_can_reopen_to_live(ctx):
    client, t = ctx["client"], ctx["t"]
    t.status = "completed"
    ctx["db"].commit()
    r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition?target_status=live")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "live"


def test_live_can_revert_to_draft(ctx):
    client, t = ctx["client"], ctx["t"]
    t.status = "live"
    ctx["db"].commit()
    r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition?target_status=draft")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "draft"


def test_draft_can_be_completed_directly(ctx):
    client = ctx["client"]
    r = client.post(f"/api/orgs/tournaments/{ctx['t'].tournament_id}/transition?target_status=completed")
    assert r.status_code == 200


def test_legacy_status_values_are_rejected(ctx):
    """The old 5-value statuses (registration/upcoming/fixtures/done) no
    longer exist — the endpoint must reject them outright rather than
    silently 400 deep inside the transition table like before."""
    client, t = ctx["client"], ctx["t"]
    for legacy in ("registration", "upcoming", "fixtures", "done"):
        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/transition?target_status={legacy}")
        assert r.status_code == 400


# ── Public registration endpoint uses registration_open ───────

def test_public_register_blocked_when_not_live(ctx):
    client = ctx["client"]
    ctx["t"].is_published = True; ctx["db"].commit()
    r = client.post(
        f"/api/public/tournaments/{ctx['t'].tournament_id}/register",
        json={"name": "Alice", "phone": "9999999999", "event_ids": []},
    )
    assert r.status_code == 400
    assert "not currently accepting" in r.json()["detail"]


def test_public_register_blocked_after_deadline(ctx):
    client, t = ctx["client"], ctx["t"]
    t.status = "live"; t.is_published = True
    t.registration_end_date = date.today() - timedelta(days=1)
    ctx["db"].commit()
    r = client.post(
        f"/api/public/tournaments/{t.tournament_id}/register",
        json={"name": "Alice", "phone": "9999999999", "event_ids": []},
    )
    assert r.status_code == 400
