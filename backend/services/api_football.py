from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import HTTPException

from services.cache import RedisCache
from services.rate_limiter import DailyAPIRateLimiter


API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"

LIVE_MATCH_TTL = 30
FIXTURES_TTL = 300
SEASON_STATS_TTL = 3600
HISTORICAL_TTL = 86400


class APIFootballService:
    def __init__(
        self,
        cache: RedisCache,
        rate_limiter: DailyAPIRateLimiter,
        api_key: str | None = None,
        base_url: str = API_FOOTBALL_BASE_URL,
        timeout: float = 15.0,
    ):
        self.cache = cache
        self.rate_limiter = rate_limiter
        self.api_key = api_key or os.getenv("API_FOOTBALL_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def _fetch(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise HTTPException(
                status_code=500,
                detail="API-Football key is not configured",
            )

        await self.rate_limiter.consume()

        headers = {
            "x-apisports-key": self.api_key,
        }
        filtered_params = {
            key: value
            for key, value in (params or {}).items()
            if value is not None and not (isinstance(value, str) and value.strip() == "")
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/{endpoint.lstrip('/')}",
                    params=filtered_params,
                    headers=headers,
                )
                response.raise_for_status()
                payload = response.json()
                self._raise_for_api_errors(payload)
                return payload
        except httpx.HTTPStatusError as exc:
            await self.rate_limiter.release()
            upstream_detail = exc.response.text or "API-Football request failed"
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=upstream_detail,
            ) from exc
        except httpx.HTTPError as exc:
            await self.rate_limiter.release()
            raise HTTPException(
                status_code=502,
                detail="Failed to reach API-Football",
            ) from exc

    async def get_cached(
        self,
        *,
        cache_key: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        ttl: int | None,
    ) -> dict[str, Any]:
        cached_response = await self.cache.get_json(cache_key)
        if cached_response is not None and not self._payload_has_errors(cached_response):
            return cached_response

        if self.cache.client is None:
            raise HTTPException(
                status_code=503,
                detail="Redis cache unavailable",
            )

        response = await self._fetch(endpoint=endpoint, params=params)
        await self.cache.set_json(cache_key, response, ttl=ttl)
        return response

    async def get_live_match_events(self, fixture_id: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:fixtures:{fixture_id}:events:live",
            endpoint="/fixtures/events",
            params={"fixture": fixture_id},
            ttl=LIVE_MATCH_TTL,
        )

    async def get_fixture(self, fixture_id: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:fixtures:{fixture_id}:detail",
            endpoint="/fixtures",
            params={"id": fixture_id},
            ttl=FIXTURES_TTL,
        )

    async def get_fixtures(self, **params: Any) -> dict[str, Any]:
        serialized = self._serialize_params(params)
        return await self.get_cached(
            cache_key=f"api_football:fixtures:{serialized}",
            endpoint="/fixtures",
            params=params,
            ttl=FIXTURES_TTL,
        )

    async def get_fixture_statistics(self, fixture_id: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:fixtures:{fixture_id}:statistics",
            endpoint="/fixtures/statistics",
            params={"fixture": fixture_id},
            ttl=LIVE_MATCH_TTL,
        )

    async def get_standings(self, league_id: int, season: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:standings:{league_id}:{season}",
            endpoint="/standings",
            params={"league": league_id, "season": season},
            ttl=FIXTURES_TTL,
        )

    async def get_leagues(self, **params: Any) -> dict[str, Any]:
        serialized = self._serialize_params(params)
        return await self.get_cached(
            cache_key=f"api_football:leagues:{serialized}",
            endpoint="/leagues",
            params=params,
            ttl=HISTORICAL_TTL,
        )

    async def get_top_scorers(self, league_id: int, season: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:leagues:{league_id}:{season}:top_scorers",
            endpoint="/players/topscorers",
            params={"league": league_id, "season": season},
            ttl=SEASON_STATS_TTL,
        )

    async def get_top_assists(self, league_id: int, season: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:leagues:{league_id}:{season}:top_assists",
            endpoint="/players/topassists",
            params={"league": league_id, "season": season},
            ttl=SEASON_STATS_TTL,
        )

    async def get_team_statistics(
        self,
        league_id: int,
        season: int,
        team_id: int,
    ) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:teams:{team_id}:statistics:{league_id}:{season}",
            endpoint="/teams/statistics",
            params={"league": league_id, "season": season, "team": team_id},
            ttl=SEASON_STATS_TTL,
        )

    async def get_player_statistics(self, **params: Any) -> dict[str, Any]:
        serialized = self._serialize_params(params)
        return await self.get_cached(
            cache_key=f"api_football:players:{serialized}",
            endpoint="/players",
            params=params,
            ttl=SEASON_STATS_TTL,
        )

    async def get_head_to_head(self, home_team_id: int, away_team_id: int) -> dict[str, Any]:
        h2h_value = f"{home_team_id}-{away_team_id}"
        return await self.get_cached(
            cache_key=f"api_football:h2h:{h2h_value}",
            endpoint="/fixtures/headtohead",
            params={"h2h": h2h_value},
            ttl=HISTORICAL_TTL,
        )

    async def get_injuries(self, fixture_id: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:fixtures:{fixture_id}:injuries",
            endpoint="/injuries",
            params={"fixture": fixture_id},
            ttl=SEASON_STATS_TTL,
        )

    async def get_teams(self, **params: Any) -> dict[str, Any]:
        serialized = self._serialize_params(params)
        return await self.get_cached(
            cache_key=f"api_football:teams:{serialized}",
            endpoint="/teams",
            params=params,
            ttl=HISTORICAL_TTL,
        )

    async def get_team_information(self, team_id: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:teams:{team_id}:detail",
            endpoint="/teams",
            params={"id": team_id},
            ttl=HISTORICAL_TTL,
        )

    async def get_referee_fixtures(self, referee_name: str, season: int) -> dict[str, Any]:
        return await self.get_cached(
            cache_key=f"api_football:referee:{referee_name}:{season}",
            endpoint="/fixtures",
            params={"referee": referee_name, "season": season},
            ttl=HISTORICAL_TTL,
        )

    @staticmethod
    def _serialize_params(params: dict[str, Any]) -> str:
        filtered_params = {key: value for key, value in params.items() if value is not None}
        return "&".join(f"{key}={filtered_params[key]}" for key in sorted(filtered_params))

    @staticmethod
    def _payload_has_errors(payload: dict[str, Any] | None) -> bool:
        if not isinstance(payload, dict):
            return False

        errors = payload.get("errors")
        if isinstance(errors, dict):
            return any(bool(value) for value in errors.values())
        if isinstance(errors, list):
            return any(bool(value) for value in errors)
        return bool(errors)

    @classmethod
    def _raise_for_api_errors(cls, payload: dict[str, Any]) -> None:
        if not cls._payload_has_errors(payload):
            return

        errors = payload.get("errors")
        if isinstance(errors, dict):
            detail = "; ".join(f"{key}: {value}" for key, value in errors.items() if value)
        elif isinstance(errors, list):
            detail = "; ".join(str(value) for value in errors if value)
        else:
            detail = str(errors)

        raise HTTPException(status_code=502, detail=detail or "API-Football returned an error payload")
