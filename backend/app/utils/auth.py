"""
Auth utilities — password hashing, JWT, and FastAPI dependencies.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError
import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user_id(
    authorization: Optional[str] = Header(None),
) -> int:
    """
    Lightweight auth dependency — decodes the JWT and returns the user_id.
    Does NOT query the database, making it ~2-3x faster than get_current_user.
    Use this on every endpoint that only needs to verify the caller is
    authenticated but doesn't actually inspect User model fields.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    try:
        user_id = int(payload.get("sub", 0))
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return user_id


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Full auth dependency — decodes JWT and fetches the User row from DB.
    Use this only when you need to inspect User model fields (plan, org, etc.).
    For simple auth-gating prefer get_current_user_id (no DB hit).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    try:
        user_id = int(payload.get("sub", 0))
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.user_id == user_id, User.is_active != False).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return user


def get_superadmin(user: User = Depends(get_current_user)) -> User:
    """Dependency — only allows through users with is_superadmin=True."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


def require_pro(user: User = Depends(get_current_user)) -> User:
    """Dependency — only allows through users on the 'pro' plan.
    Returns a 403 with detail='pro_required' so the frontend can show
    a specific upgrade prompt rather than a generic error.
    """
    if user.plan != "pro":
        raise HTTPException(status_code=403, detail="pro_required")
    return user

def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of 401 - for public
    endpoints that show extra detail to authorised callers."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        payload = decode_token(authorization.split(" ", 1)[1])
        user_id = int(payload.get("sub", 0))
    except (HTTPException, ValueError, TypeError):
        return None
    if not user_id:
        return None
    return db.query(User).filter(User.user_id == user_id, User.is_active != False).first()
