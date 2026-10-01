"""
Input validation helpers. They raise HTTPException(400) with a plain-string
detail (not pydantic's 422 list) because both clients show `detail` verbatim.
"""
from fastapi import HTTPException

VALID_FORMATS = ("group_knockout", "direct_knockout", "round_robin")
VALID_PARTICIPANT_TYPES = ("individual", "team", "doubles_pair")
MIN_PASSWORD_LENGTH = 8


def clean_name(value, label: str = "Name", max_len: int = 255) -> str:
    v = (value or "").strip()
    if not v:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    if len(v) > max_len:
        raise HTTPException(status_code=400, detail=f"{label} must be at most {max_len} characters")
    return v


def check_format(value, *, required: bool) -> None:
    if value is None:
        if required:
            raise HTTPException(status_code=400, detail=f"Format is required (one of {list(VALID_FORMATS)})")
        return
    if value not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Format must be one of {list(VALID_FORMATS)}")


def check_participant_type(value) -> str:
    v = value or "individual"
    if v not in VALID_PARTICIPANT_TYPES:
        raise HTTPException(status_code=400, detail=f"Participant type must be one of {list(VALID_PARTICIPANT_TYPES)}")
    return v


def check_password(value: str) -> None:
    if len(value or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
