from fastapi import APIRouter, Depends, Query

from services.api_football import APIFootballService
from services.dependencies import get_api_football_service


router = APIRouter(prefix="/api/leagues", tags=["leagues"])


@router.get("")
async def list_leagues(
    id: int | None = None,
    name: str | None = None,
    country: str | None = None,
    season: int | None = None,
    current: bool | None = None,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_leagues(
        id=id,
        name=name,
        country=country,
        season=season,
        current="true" if current else None,
    )


@router.get("/{league_id}/standings")
async def league_standings(
    league_id: int,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_standings(league_id=league_id, season=season)


@router.get("/{league_id}/fixtures")
async def league_fixtures(
    league_id: int,
    season: int,
    team: int | None = None,
    date: str | None = None,
    status: str | None = None,
    last: int | None = Query(default=None, ge=1, le=50),
    next: int | None = Query(default=None, ge=1, le=50),
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixtures(
        league=league_id,
        season=season,
        team=team,
        date=date,
        status=status,
        last=last,
        next=next,
    )


@router.get("/{league_id}/top-scorers")
async def league_top_scorers(
    league_id: int,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_top_scorers(league_id=league_id, season=season)


@router.get("/{league_id}/top-assists")
async def league_top_assists(
    league_id: int,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_top_assists(league_id=league_id, season=season)
