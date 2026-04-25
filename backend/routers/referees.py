from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from services.api_football import APIFootballService
from services.db import get_db
from services.dependencies import get_api_football_service
from services.referee_analysis import get_referee_analysis


router = APIRouter(prefix="/api/referees", tags=["referees"])


@router.get("/{referee_name}/fixtures")
async def referee_fixtures(
    referee_name: str,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_referee_fixtures(referee_name=referee_name, season=season)


@router.get("/{referee_name}/analysis")
async def referee_analysis(
    referee_name: str,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
    db: Session = Depends(get_db),
):
    return await get_referee_analysis(
        referee_name=referee_name,
        season=season,
        service=service,
        db=db,
    )
