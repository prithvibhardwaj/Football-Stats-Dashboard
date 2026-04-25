from fastapi import Request

from services.api_football import APIFootballService
from services.cache import RedisCache
from services.rate_limiter import DailyAPIRateLimiter


def get_cache(request: Request) -> RedisCache:
    return request.app.state.cache


def get_rate_limiter(request: Request) -> DailyAPIRateLimiter:
    return DailyAPIRateLimiter(cache=request.app.state.cache)


def get_api_football_service(request: Request) -> APIFootballService:
    return APIFootballService(
        cache=request.app.state.cache,
        rate_limiter=DailyAPIRateLimiter(cache=request.app.state.cache),
    )
