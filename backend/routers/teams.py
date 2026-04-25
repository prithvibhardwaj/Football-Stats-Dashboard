from fastapi import APIRouter, Depends, Query

from services.api_football import APIFootballService
from services.dependencies import get_api_football_service


router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("")
async def search_teams(
    search: str | None = None,
    league: int | None = None,
    season: int | None = None,
    country: str | None = None,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_teams(
        search=search,
        league=league,
        season=season,
        country=country,
    )


@router.get("/{team_id}")
async def team_detail(
    team_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_team_information(team_id)


@router.get("/{team_id}/statistics")
async def team_statistics(
    team_id: int,
    league_id: int,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_team_statistics(
        league_id=league_id,
        season=season,
        team_id=team_id,
    )


@router.get("/{team_id}/fixtures")
async def team_fixtures(
    team_id: int,
    season: int | None = None,
    league_id: int | None = None,
    status: str | None = None,
    last: int | None = Query(default=None, ge=1, le=50),
    next: int | None = Query(default=None, ge=1, le=50),
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixtures(
        team=team_id,
        season=season,
        league=league_id,
        status=status,
        last=last,
        next=next,
    )
