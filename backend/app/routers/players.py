"""
Player routes — register players, add to events, manage groups.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.database import get_db
from app.models.user import User
from app.models.tournament import Tournament
from app.models.event import Event
from app.models.player import Player
from app.models.group import Group, EventParticipant
from app.schemas.player import PlayerCreate, PlayerOut, EventParticipantOut
from app.utils.auth import get_current_user
from app.utils.event_rules import event_has_fixtures, ensure_entries_open, ensure_can_remove_participant
from app.utils.tournament_access import require_org_access, require_event_access

router = APIRouter()


# ── Player CRUD ──────────────────────────────────────────────

def _check_org_member(org_id: int, user: User, db: Session) -> None:
    """Raise 403 unless the caller may use this org's player pool: org
    members, superadmins, and members of any tournament owned by the org
    (tournament staff need to register players)."""
    require_org_access(org_id, user, db)


@router.post("/", response_model=PlayerOut)
def create_player(
    data: PlayerCreate,
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # SEC-2: verify the caller belongs to this org before creating a player under it
    if org_id:
        _check_org_member(org_id, user, db)
    player = Player(
        name=data.name,
        age=data.age,
        gender=data.gender,
        phone=data.phone,
        email=data.email,
        seed_level=data.seed_level,
        org_id=org_id,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.get("/", response_model=List[PlayerOut])
def list_players(
    org_id: int,   # SEC-1: now required — prevents leaking all players across all orgs
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_org_member(org_id, user, db)
    return db.query(Player).filter(Player.org_id == org_id).order_by(Player.name).all()


@router.delete("/{player_id}")
def delete_player(
    player_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    # SEC-3: verify ownership before deleting
    if player.org_id:
        _check_org_member(player.org_id, user, db)
    elif player.user_id != user.user_id and not user.is_superadmin:
        # org-less players are personal profiles (or orphans of a deleted org):
        # only the linked user may delete them.
        raise HTTPException(status_code=403, detail="Not authorized to delete this player")
    # DI-3: refuse to hard-delete a player who has already appeared in matches —
    # the match_participants FK is ON DELETE CASCADE, so deleting would silently
    # strip them out of completed matches and corrupt history/standings.
    from app.models.match import MatchParticipant
    in_matches = db.query(MatchParticipant).filter(
        MatchParticipant.player_id == player_id).first()
    if in_matches:
        raise HTTPException(
            status_code=409,
            detail="This player has match history and cannot be deleted. "
                   "Remove them from their events instead.",
        )
    db.delete(player)
    db.commit()
    return {"ok": True}


# ── Event enrollment ─────────────────────────────────────────

SEED_SCORES = {"beginner": 2, "intermediate": 5, "advanced": 8, "pro": 10}


@router.post("/events/{event_id}/participants")
def add_player_to_event(
    event_id: int,
    player_id: int,
    group_id: Optional[int] = None,
    seed: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # SEC-4: enrolling a player mutates the event — require tournament access
    event, tournament, _ = require_event_access(event_id, user, db)

    ensure_entries_open(event, db)
    if event.participant_type != "individual":
        raise HTTPException(
            status_code=400,
            detail=f"This event is for {event.participant_type} entries, not individual players.",
        )
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.org_id is not None and player.org_id != tournament.org_id:
        raise HTTPException(status_code=403, detail="This player belongs to a different organization")
    if group_id is not None and not db.query(Group).filter(
        Group.group_id == group_id, Group.event_id == event_id
    ).first():
        raise HTTPException(status_code=404, detail="Group not found in this event")

    existing = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.player_id == player_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Player already enrolled in this event")

    # Auto-compute seed score from player's seed_level if not explicitly provided
    if seed is None and player.seed_level:
        seed = SEED_SCORES.get(player.seed_level.lower())

    ep = EventParticipant(
        event_id=event_id,
        player_id=player_id,
        group_id=group_id,
        seed=seed,
    )
    db.add(ep)
    db.commit()
    return {"ok": True, "ep_id": ep.ep_id}


@router.get("/events/{event_id}/participants")
def get_event_participants(event_id: int, db: Session = Depends(get_db)):
    """Public — get all participants grouped by group."""
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    groups = (
        db.query(Group)
        .filter(Group.event_id == event_id)
        .order_by(Group.name)
        .all()
    )

    result = []
    for group in groups:
        participants = (
            db.query(EventParticipant)
            .filter(
                EventParticipant.event_id == event_id,
                EventParticipant.group_id == group.group_id,
            )
            .options(joinedload(EventParticipant.player))
            .all()
        )
        result.append({
            "group_id": group.group_id,
            "group_name": group.name,
            "players": [
                {
                    "player_id": ep.player.player_id,
                    "name": ep.player.name,
                    "age": ep.player.age,
                    "gender": ep.player.gender,
                    "seed": ep.seed,
                }
                for ep in participants
                if ep.player
            ],
        })

    # Also include ungrouped participants
    ungrouped = (
        db.query(EventParticipant)
        .filter(
            EventParticipant.event_id == event_id,
            EventParticipant.group_id == None,
        )
        .options(joinedload(EventParticipant.player))
        .all()
    )
    if ungrouped:
        result.append({
            "group_id": None,
            "group_name": "Ungrouped",
            "players": [
                {
                    "player_id": ep.player.player_id,
                    "name": ep.player.name,
                    "age": ep.player.age,
                    "gender": ep.player.gender,
                    "seed": ep.seed,
                }
                for ep in ungrouped
                if ep.player
            ],
        })

    return result


@router.patch("/events/{event_id}/participants/{player_id}")
def assign_player_group(
    event_id: int,
    player_id: int,
    group_id: Optional[int] = None,
    seed_level: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set (or clear) a participant's group and/or seed level."""
    require_event_access(event_id, user, db)
    ep = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.player_id == player_id,
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in this event")
    if group_id is not None:
        group = db.query(Group).filter(
            Group.group_id == group_id, Group.event_id == event_id
        ).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found in this event")
    # Only update group_id when it was explicitly passed in the request
    # (None here means "was not sent", not "clear the group")
    # We use a sentinel approach: group_id=None with no seed_level = clear group
    # group_id=None with seed_level = seed-only update, don't touch group
    if seed_level is None:
        # Legacy group-assignment path: always update group_id
        if group_id != ep.group_id and event_has_fixtures(event_id, db):
            raise HTTPException(status_code=409, detail="Groups are locked once fixtures have been generated.")
        ep.group_id = group_id

    if seed_level is not None:
        # "" means "remove seed"; otherwise map level → numeric score
        if seed_level == "":
            ep.seed = None
            player = db.query(Player).filter(Player.player_id == player_id).first()
            if player:
                player.seed_level = None
        else:
            score = SEED_SCORES.get(seed_level.lower())
            if score is None:
                raise HTTPException(status_code=400, detail=f"Invalid seed_level: {seed_level}")
            ep.seed = score
            player = db.query(Player).filter(Player.player_id == player_id).first()
            if player:
                player.seed_level = seed_level.lower()

    db.commit()
    return {"ok": True}


@router.delete("/events/{event_id}/participants/{player_id}")
def remove_player_from_event(
    event_id: int,
    player_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_event_access(event_id, user, db)
    ep = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.player_id == player_id,
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in this event")
    ensure_can_remove_participant(event_id, player_id=player_id, db=db)
    db.delete(ep)
    db.commit()
    return {"ok": True}


# ── Groups ───────────────────────────────────────────────────

@router.post("/events/{event_id}/groups")
def create_group(
    event_id: int,
    name: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_event_access(event_id, user, db)

    group = Group(event_id=event_id, name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return {"ok": True, "group_id": group.group_id, "name": group.name}
