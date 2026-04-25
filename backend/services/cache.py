from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError


class RedisCache:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.client: Redis | None = None

    async def connect(self) -> bool:
        if not self.redis_url:
            return False

        try:
            self.client = Redis.from_url(self.redis_url, decode_responses=True)
            await self.client.ping()
            return True
        except RedisError:
            self.client = None
            return False

    async def ping(self) -> bool:
        if self.client is None:
            return False

        try:
            return bool(await self.client.ping())
        except RedisError:
            return False

    async def get(self, key: str) -> Any:
        if self.client is None:
            return None
        return await self.client.get(key)

    async def get_json(self, key: str) -> Any:
        raw_value = await self.get(key)
        if raw_value is None:
            return None

        try:
            return json.loads(raw_value)
        except (TypeError, json.JSONDecodeError):
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> bool:
        if self.client is None:
            return False
        return bool(await self.client.set(key, value, ex=ttl))

    async def set_json(self, key: str, value: Any, ttl: int | None = None) -> bool:
        return await self.set(key, json.dumps(value), ttl=ttl)

    async def increment(self, key: str, amount: int = 1) -> int | None:
        if self.client is None:
            return None
        return int(await self.client.incrby(key, amount))

    async def decrement(self, key: str, amount: int = 1) -> int | None:
        if self.client is None:
            return None
        return int(await self.client.decrby(key, amount))

    async def expire(self, key: str, ttl: int) -> bool:
        if self.client is None:
            return False
        return bool(await self.client.expire(key, ttl))

    async def ttl(self, key: str) -> int | None:
        if self.client is None:
            return None
        return int(await self.client.ttl(key))

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()
            self.client = None
