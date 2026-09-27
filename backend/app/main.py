"""
TheScoreBoard API — main application.
"""
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import auth, organizations, tournaments, tournament_members, events, players, matches, public, teams, media, share, ws as ws_router, dashboard, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Run alembic migrations on startup (handles prod deploys automatically)
try:
    from alembic.config import Config
    from alembic import command as alembic_command
    import os
    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    alembic_command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations applied.")
except Exception as _mig_err:
    if not settings.DATABASE_URL:
        # No DB configured (local dev) — fall back to create_all.
        logger.warning(f"Alembic migration skipped: {_mig_err}")
        try:
            Base.metadata.create_all(bind=engine)
        except Exception as _ddl_err:
            logger.error(f"DB unreachable at startup — continuing degraded: {_ddl_err}")
    else:
        # A real DB is configured: create_all() is a no-op for tables that
        # already exist, so silently swallowing this would leave the app
        # running against a stale schema (e.g. missing columns added by
        # pending migrations). Fail the deploy loudly instead.
        logger.exception("Alembic migration failed against a configured DATABASE_URL")
        raise

app = FastAPI(title=f"{settings.APP_NAME} API", version=settings.VERSION)


@app.on_event("startup")
async def _capture_event_loop():
    """Give the WS manager a reference to the running event loop so it can
    broadcast from sync route handlers via run_coroutine_threadsafe."""
    import asyncio
    from app.ws.manager import manager
    manager.set_loop(asyncio.get_event_loop())
    logger.info("WS manager ready — route: /api/ws/tournament/{slug}")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so every error shows in the backend console.
    Always mirrors back the CORS headers so the browser can read the error body."""
    logger.error(f"Unhandled error on {request.method} {request.url}:")
    logger.error(traceback.format_exc())
    origin = request.headers.get("origin", "")
    headers = {}
    if origin and (allowed_origins == ["*"] or origin in allowed_origins):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    # Never leak internal exception text to clients in production — the full
    # traceback is already logged above. Dev keeps the detail for debugging.
    detail = str(exc) if not settings.is_prod else "Internal server error"
    return JSONResponse(status_code=500, content={"detail": detail}, headers=headers)

# ── CORS Configuration ────────────────────────────────────────
# Support comma-separated origins: "https://dev.thescoreboard.in,http://localhost:5173"
allowed_origins = []
if settings.FRONTEND_URL == "*":
    allowed_origins = ["*"]
else:
    # Split by comma and strip whitespace
    allowed_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",") if origin.strip()]

logger.info(f"CORS allowed origins: {allowed_origins}")

# Compress JSON responses ≥1 KB — tournament payloads shrink ~5-10×,
# which dominates transfer time for mobile clients on venue WiFi.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Public routes (spectators, no auth) ───────────────────────
# IMPORTANT: must be registered BEFORE any router that uses wildcard path
# segments at the same /api prefix (e.g. tournaments.router /{org_id}/...).
# FastAPI matches routes in registration order, so the concrete /api/public/*
# paths must win over the wildcard /{org_id}/tournaments catch-all.
app.include_router(public.router,        prefix="/api/public",  tags=["public"])

# ── Authenticated routes (organizers) ─────────────────────────
app.include_router(dashboard.router,     prefix="/api/dashboard", tags=["dashboard"])
app.include_router(auth.router,          prefix="/api/auth",    tags=["auth"])
app.include_router(organizations.router, prefix="/api/orgs",    tags=["organizations"])
# Members/invites BEFORE the tournaments routers: its concrete
# /tournaments/{id}/members paths must win over wildcard overlaps.
app.include_router(tournament_members.router, prefix="/api",    tags=["tournament-members"])
app.include_router(tournaments.router,   prefix="/api/orgs",    tags=["tournaments"])
app.include_router(tournaments.router,   prefix="/api",         tags=["tournaments"])
app.include_router(events.router,        prefix="/api",         tags=["events"])
app.include_router(players.router,       prefix="/api/players", tags=["players"])
app.include_router(matches.router,       prefix="/api",         tags=["matches"])
app.include_router(teams.router, prefix="/api", tags=["teams"])

# ── Media upload (auth required) ──────────────────────────────
app.include_router(media.router,         prefix="/api/media",   tags=["media"])

# ── Super-admin panel (is_superadmin required) ────────────────
app.include_router(admin.router,         prefix="/api/admin",   tags=["admin"])

# ── Social share (no auth — crawlers must reach these) ────────
app.include_router(share.router,         prefix="/api/share",   tags=["share"])

# ── WebSocket (no auth — spectators connect here) ─────────────
app.include_router(ws_router.router,     prefix="/api/ws",      tags=["websocket"])


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV}
