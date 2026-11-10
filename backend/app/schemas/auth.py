from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import List, Optional


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    access_token: str   # OAuth2 access token returned by useGoogleLogin implicit flow


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    user_id: int
    email: str
    name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_superadmin: bool
    plan: str = "free"
    created_at: Optional[datetime] = None
    roles: List[str] = []

    class Config:
        from_attributes = True
