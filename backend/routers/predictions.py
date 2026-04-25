from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ml.predict import generate_prediction
from services.api_football import APIFootballService
from services.cache import RedisCache
from services.db import get_db
from services.dependencies import get_api_football_service, get_cache


router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("/{fixture_id}")
async def prediction_detail(
    fixture_id: int,
    service: APIFootballService = Depends(get_api_football_service),
    cache: RedisCache = Depends(get_cache),
    db: Session = Depends(get_db),
):
    return await generate_prediction(
        fixture_id=fixture_id,
        service=service,
        cache=cache,
        db=db,
    )
