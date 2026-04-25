from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from services.cache import RedisCache


DAILY_API_LIMIT = 80
RATE_LIMIT_PREFIX = "api_football:daily_usage"


@dataclass
class RateLimitStatus:
    allowed: bool
    used: int
    remaining: int
    reset_at: str


class DailyAPIRateLimiter:
    def __init__(self, cache: RedisCache, limit: int = DAILY_API_LIMIT):
        self.cache = cache
        self.limit = limit

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _key(self, current_time: datetime | None = None) -> str:
        timestamp = current_time or self._now()
        return f"{RATE_LIMIT_PREFIX}:{timestamp.strftime('%Y-%m-%d')}"

    def _seconds_until_reset(self, current_time: datetime | None = None) -> int:
        timestamp = current_time or self._now()
        tomorrow = (timestamp + timedelta(days=1)).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        return max(1, int((tomorrow - timestamp).total_seconds()))

    def _reset_at(self, current_time: datetime | None = None) -> str:
        timestamp = current_time or self._now()
        tomorrow = (timestamp + timedelta(days=1)).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        return tomorrow.isoformat()

    async def get_status(self) -> RateLimitStatus:
        key = self._key()
        used_raw = await self.cache.get(key)
        used = int(used_raw) if used_raw is not None else 0
        remaining = max(0, self.limit - used)

        return RateLimitStatus(
            allowed=used < self.limit,
            used=used,
            remaining=remaining,
            reset_at=self._reset_at(),
        )

    async def consume(self) -> RateLimitStatus:
        if self.cache.client is None:
            raise HTTPException(
                status_code=503,
                detail="Redis cache unavailable",
            )

        key = self._key()
        current_value = await self.cache.increment(key)
        if current_value is None:
            raise HTTPException(
                status_code=503,
                detail="Redis cache unavailable",
            )

        if current_value == 1:
            await self.cache.expire(key, self._seconds_until_reset())

        remaining = max(0, self.limit - current_value)
        status = RateLimitStatus(
            allowed=current_value <= self.limit,
            used=current_value,
            remaining=remaining,
            reset_at=self._reset_at(),
        )

        if not status.allowed:
            raise HTTPException(
                status_code=429,
                detail="Daily API limit reached",
            )

        return status
