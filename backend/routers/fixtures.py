from fastapi import APIRouter, Depends, Query

from services.api_football import APIFootballService
from services.dependencies import get_api_football_service


router = APIRouter(prefix="/api/fixtures", tags=["fixtures"])


@router.get("")
async def list_fixtures(
    league: int | None = None,
    season: int | None = None,
    team: int | None = None,
    date: str | None = None,
    status: str | None = None,
    live: str | None = None,
    last: int | None = Query(default=None, ge=1, le=50),
    next: int | None = Query(default=None, ge=1, le=50),
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixtures(
        league=league,
        season=season,
        team=team,
        date=date,
        status=status,
        live=live,
        last=last,
        next=next,
    )


@router.get("/h2h")
async def head_to_head(
    home_team_id: int,
    away_team_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_head_to_head(home_team_id=home_team_id, away_team_id=away_team_id)


@router.get("/{fixture_id}")
async def fixture_detail(
    fixture_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixture(fixture_id)


@router.get("/{fixture_id}/events")
async def fixture_events(
    fixture_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_live_match_events(fixture_id)


@router.get("/{fixture_id}/statistics")
async def fixture_statistics(
    fixture_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixture_statistics(fixture_id)


@router.get("/{fixture_id}/injuries")
async def fixture_injuries(
    fixture_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_injuries(fixture_id)
