"""
Auth routes — email/password register & login, Google SSO, player profile.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.player import Player
from app.models.organization import OrgMember
from app.schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest,
    TokenOut, UserOut,
)
from app.utils.validation import check_password, clean_name
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user
from app.utils.ratelimit import login_limiter, register_limiter
from app.utils.roles import compute_roles

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, dependencies=[Depends(register_limiter)])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    check_password(req.password)
    name = clean_name(req.name, "Name", 150)
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=name,
        phone=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active != False).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Google SSO ────────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured on this server")

    try:
        import httpx
        # Verify the token was issued to OUR OAuth client before trusting it.
        # Without the audience check, an access token a user granted to ANY
        # third-party app would sign that app's operator in here as the user.
        ti = httpx.get(
            "https://www.googleapis.com/oauth2/v3/tokeninfo",
            params={"access_token": req.access_token},
            timeout=5.0,
        )
        if ti.status_code != 200 or ti.json().get("aud") != settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Invalid Google token")

        resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
            timeout=5.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        info = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Google userinfo request failed: %s", e)
        raise HTTPException(status_code=401, detail="Could not verify Google token")

    # Refuse unverified emails — we link accounts by email below, so an
    # unverified address could hijack an existing local account.
    if info.get("email_verified") not in (True, "true"):
        raise HTTPException(status_code=401, detail="Google account email is not verified")

    google_id  = info["sub"]
    email      = info["email"]
    name       = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            email=email,
            password_hash=None,
            name=name,
            google_id=google_id,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        if user.google_id is None:
            user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = UserOut.model_validate(user)
    result.roles = compute_roles(user, db)
    return result


# ── Account deletion ──────────────────────────────────────────────────────────

@router.delete("/me", status_code=204)
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Permanently remove a user's personal data (GDPR / Google Play requirement).

    Strategy: anonymise the User + Player rows so that existing tournament and
    match history records (which reference player_id / user_id via FK) remain
    intact.  The account becomes unreachable — email is replaced with a unique
    sentinel, password hash and Google ID are cleared, and is_active is set to
    False so no new token can be issued for the account.
    """
    import uuid
    anon_suffix = uuid.uuid4().hex[:10]

    # Anonymise PII on the Player profile (keep row for FK integrity)
    player = db.query(Player).filter(Player.user_id == user.user_id).first()
    if player:
        player.name     = "Deleted User"
        player.phone    = None
        player.location = None
        player.email    = f"deleted_{user.user_id}_{anon_suffix}@deleted.invalid"

    # Remove org membership so they no longer have organiser access
    db.query(OrgMember).filter(OrgMember.user_id == user.user_id).delete(synchronize_session=False)

    # Anonymise the User row — wipe all PII, block future logins
    user.email         = f"deleted_{user.user_id}_{anon_suffix}@deleted.invalid"
    user.name          = "Deleted User"
    user.phone         = None
    user.password_hash = None
    user.google_id     = None
    user.avatar_url    = None
    user.is_active     = False

    db.commit()
    # Return 204 No Content — client must clear its local token immediately
