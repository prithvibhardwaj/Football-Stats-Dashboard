from fastapi import APIRouter, Depends, Query

from services.api_football import APIFootballService
from services.dependencies import get_api_football_service


router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("")
async def search_players(
    search: str | None = None,
    team: int | None = None,
    league: int | None = None,
    season: int | None = None,
    page: int | None = Query(default=None, ge=1),
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_player_statistics(
        search=search,
        team=team,
        league=league,
        season=season,
        page=page,
    )


@router.get("/{player_id}")
async def player_detail(
    player_id: int,
    season: int,
    league: int | None = None,
    team: int | None = None,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_player_statistics(
        id=player_id,
        season=season,
        league=league,
        team=team,
    )
