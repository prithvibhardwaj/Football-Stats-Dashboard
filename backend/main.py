import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.fixtures import router as fixtures_router
from routers.leagues import router as leagues_router
from routers.players import router as players_router
from routers.predictions import router as predictions_router
from routers.referees import router as referees_router
from routers.teams import router as teams_router
from services.cache import RedisCache
from services.db import database_is_available, init_db
from tasks.weekly_retrain import weekly_retrain_loop


load_dotenv()


def _parse_origins(raw_value: str | None) -> list[str]:
    if not raw_value:
        return ["http://localhost:5173"]
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


def _required_backend_env() -> dict[str, bool]:
    return {
        "API_FOOTBALL_KEY": bool(os.getenv("API_FOOTBALL_KEY", "").strip()),
        "REDIS_URL": bool(os.getenv("REDIS_URL", "").strip()),
        "DATABASE_URL": bool(os.getenv("DATABASE_URL", "").strip()),
    }


async def _readiness_payload(request: Request) -> dict:
    cache: RedisCache = request.app.state.cache
    redis_connected = await cache.ping() if request.app.state.redis_connected else False
    required_env = _required_backend_env()
    database_ready = database_is_available()
    ready = all(required_env.values()) and redis_connected and database_ready

    return {
        "status": "ok" if ready else "degraded",
        "service": "backend",
        "ready": ready,
        "checks": {
            "redis": {
                "configured": bool(cache.redis_url),
                "connected": redis_connected,
            },
            "database": {
                "configured": required_env["DATABASE_URL"],
                "connected": database_ready,
            },
            "environment": {
                "required": required_env,
            },
        },
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    redis_url = os.getenv("REDIS_URL", "")
    cache = RedisCache(redis_url=redis_url)
    app.state.cache = cache
    app.state.redis_connected = await cache.connect()
    app.state.retrain_task = None
    if app.state.redis_connected:
        app.state.retrain_task = asyncio.create_task(weekly_retrain_loop(cache))
    try:
        yield
    finally:
        retrain_task = getattr(app.state, "retrain_task", None)
        if retrain_task is not None:
            retrain_task.cancel()
        await cache.close()


app = FastAPI(
    title="Football Analytics Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(os.getenv("FRONTEND_ORIGINS")),
    allow_origin_regex=os.getenv("FRONTEND_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.cache = RedisCache(redis_url=os.getenv("REDIS_URL", ""))
app.state.redis_connected = False
app.include_router(fixtures_router)
app.include_router(leagues_router)
app.include_router(teams_router)
app.include_router(players_router)
app.include_router(referees_router)
app.include_router(predictions_router)


@app.get("/health")
async def health(request: Request):
    return await _readiness_payload(request)


@app.get("/ready")
async def ready(request: Request):
    payload = await _readiness_payload(request)
    status_code = 200 if payload["ready"] else 503
    return JSONResponse(content=payload, status_code=status_code)
