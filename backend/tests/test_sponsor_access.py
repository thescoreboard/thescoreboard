"""
Sponsors are no longer a Pro-only feature: any org member can create, edit,
and delete sponsors, and sponsor logo uploads (path under "sponsors/") skip
the Pro gate on the shared media-upload endpoint. Tournament branding
(banners/posters/team logos) stays Pro-only.
"""
import io
import os
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.models.user import User
from app.utils.auth import get_current_user


def _setup(db, plan="free"):
    org = Organization(name="Club", slug="club")
    db.add(org); db.flush()
    user = User(email="u@x.com", name="Organiser", plan=plan)
    db.add(user); db.flush()
    db.add(OrgMember(org_id=org.org_id, user_id=user.user_id, role="admin"))
    t = Tournament(org_id=org.org_id, name="Open", slug="open")
    db.add(t); db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return t, TestClient(app)


def test_sponsor_contact_email_roundtrips(db):
    t, client = _setup(db, plan="free")
    try:
        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/sponsors",
                         json={"name": "Acme", "tier": "gold",
                               "contact_phone": "+91 9999999999",
                               "contact_email": "hello@acme.com"})
        assert r.status_code == 200, r.text
        assert r.json()["contact_email"] == "hello@acme.com"
        sid = r.json()["sponsor_id"]

        r = client.patch(f"/api/orgs/tournaments/{t.tournament_id}/sponsors/{sid}",
                          json={"contact_email": "updated@acme.com"})
        assert r.status_code == 200, r.text
        assert r.json()["contact_email"] == "updated@acme.com"
    finally:
        app.dependency_overrides.clear()


def test_free_plan_can_create_edit_delete_sponsor(db):
    t, client = _setup(db, plan="free")
    try:
        r = client.post(f"/api/orgs/tournaments/{t.tournament_id}/sponsors",
                         json={"name": "Acme", "tier": "gold"})
        assert r.status_code == 200, r.text
        sid = r.json()["sponsor_id"]

        r = client.patch(f"/api/orgs/tournaments/{t.tournament_id}/sponsors/{sid}",
                          json={"tier": "title"})
        assert r.status_code == 200, r.text
        assert r.json()["tier"] == "title"

        r = client.delete(f"/api/orgs/tournaments/{t.tournament_id}/sponsors/{sid}")
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()


@patch("app.routers.media.storage.upload_bytes", return_value="https://cdn.example.com/x.jpg")
def test_sponsor_logo_upload_free_plan_allowed(mock_upload, db):
    t, client = _setup(db, plan="free")
    try:
        r = client.post(
            "/api/media/upload",
            data={"bucket": "logos", "path": f"sponsors/{t.tournament_id}/logo.jpg"},
            files={"file": ("logo.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        )
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()


@patch("app.routers.media.storage.upload_bytes", return_value="https://cdn.example.com/x.jpg")
def test_tournament_logo_upload_free_plan_allowed(mock_upload, db):
    # Tournament logos (bucket "logos", tournaments/ path) became free-plan
    # in the payment-collection release — only posters/banners stay Pro-only.
    t, client = _setup(db, plan="free")
    try:
        r = client.post(
            "/api/media/upload",
            data={"bucket": "logos", "path": f"tournaments/{t.tournament_id}/logo.jpg"},
            files={"file": ("logo.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        )
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()


@patch("app.routers.media.storage.upload_bytes", return_value="https://cdn.example.com/x.jpg")
def test_tournament_poster_upload_free_plan_blocked(mock_upload, db):
    t, client = _setup(db, plan="free")
    try:
        r = client.post(
            "/api/media/upload",
            data={"bucket": "tournament-posters", "path": f"tournaments/{t.tournament_id}/poster.jpg"},
            files={"file": ("poster.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        )
        assert r.status_code == 403
        assert r.json()["detail"] == "pro_required"
    finally:
        app.dependency_overrides.clear()


@patch("app.routers.media.storage.upload_bytes", return_value="https://cdn.example.com/x.jpg")
def test_tournament_poster_upload_pro_plan_allowed(mock_upload, db):
    t, client = _setup(db, plan="pro")
    try:
        r = client.post(
            "/api/media/upload",
            data={"bucket": "tournament-posters", "path": f"tournaments/{t.tournament_id}/poster.jpg"},
            files={"file": ("poster.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        )
        assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()
