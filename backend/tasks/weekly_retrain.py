from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from ml.train import train_default_leagues
from services.api_football import APIFootballService
from services.cache import RedisCache
from services.rate_limiter import DailyAPIRateLimiter


def _scheduled_weekday() -> int:
    mapping = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    return mapping.get(os.getenv("MODEL_RETRAIN_DAY", "monday").lower(), 0)


def _scheduled_hour() -> int:
    try:
        return int(os.getenv("MODEL_RETRAIN_HOUR", "3"))
    except ValueError:
        return 3


def seconds_until_next_retrain() -> int:
    now = datetime.now(timezone.utc)
    target_weekday = _scheduled_weekday()
    target_hour = _scheduled_hour()

    days_ahead = (target_weekday - now.weekday()) % 7
    candidate = now + timedelta(days=days_ahead)
    candidate = candidate.replace(hour=target_hour, minute=0, second=0, microsecond=0)

    if candidate <= now:
        candidate += timedelta(days=7)

    return max(60, int((candidate - now).total_seconds()))


async def run_weekly_retrain(cache: RedisCache) -> list[dict]:
    service = APIFootballService(
        cache=cache,
        rate_limiter=DailyAPIRateLimiter(cache=cache),
    )
    return await train_default_leagues(service)


async def weekly_retrain_loop(cache: RedisCache) -> None:
    while True:
        await asyncio.sleep(seconds_until_next_retrain())
        try:
            await run_weekly_retrain(cache)
        except Exception:
            await asyncio.sleep(300)
