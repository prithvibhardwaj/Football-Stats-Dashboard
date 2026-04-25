from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ml.features import get_fixture_context
from ml.poisson_model import DEFAULT_ARTIFACT, predict_outcome
from services.api_football import APIFootballService
from services.cache import RedisCache
from services.db import (
    get_latest_model_artifact,
    get_latest_prediction,
    save_prediction_record,
    upsert_match_record,
)


PREDICTION_TTL_SECONDS = 3600


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    if value.endswith("Z"):
        value = value.replace("Z", "+00:00")
    return datetime.fromisoformat(value)


def _fixture_cache_key(fixture_id: int) -> str:
    return f"predictions:{fixture_id}"


def _artifact_payload(artifact_blob: str | None) -> dict[str, Any]:
    if not artifact_blob:
        return DEFAULT_ARTIFACT
    try:
        parsed = json.loads(artifact_blob)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return DEFAULT_ARTIFACT


def _prediction_window(status: str, kickoff_at: datetime | None) -> datetime | None:
    now = datetime.now(timezone.utc)
    if status.upper() == "HT":
        return now + timedelta(hours=1)
    if kickoff_at is None:
        return now + timedelta(hours=1)
    kickoff_utc = kickoff_at if kickoff_at.tzinfo else kickoff_at.replace(tzinfo=timezone.utc)
    return kickoff_utc


async def generate_prediction(
    *,
    fixture_id: int,
    service: APIFootballService,
    cache: RedisCache,
    db: Session,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    # 1. Redis cache
    cached = await cache.get_json(_fixture_cache_key(fixture_id)) if cache.client is not None else None
    if cached is not None:
        valid_until = _parse_datetime(cached.get("valid_until"))
        if valid_until and valid_until > now:
            return cached

    # 2. DB cache — costs 0 API calls
    existing_prediction = get_latest_prediction(db, fixture_id)
    if existing_prediction and existing_prediction.valid_until:
        existing_valid_until = existing_prediction.valid_until
        existing_valid_utc = existing_valid_until if existing_valid_until.tzinfo else existing_valid_until.replace(tzinfo=timezone.utc)
        if existing_valid_utc > now:
            match_record = existing_prediction.match
            home_name = match_record.home_team_name if match_record else "Home"
            away_name = match_record.away_team_name if match_record else "Away"
            raw_output = existing_prediction.raw_output or {}
            most_likely = raw_output.get(
                "most_likely_scoreline",
                f"{round(existing_prediction.predicted_home_goals)}-{round(existing_prediction.predicted_away_goals)}",
            )
            parts = most_likely.split("-")
            scoreline = f"{home_name} {parts[0]} - {parts[1]} {away_name}" if len(parts) == 2 else most_likely
            return {
                "fixture_id": fixture_id,
                "home_team": home_name,
                "away_team": away_name,
                "predicted_score": f"{existing_prediction.predicted_home_goals:.2f}-{existing_prediction.predicted_away_goals:.2f}",
                "scoreline": scoreline,
                "home_win_probability": existing_prediction.home_win_probability,
                "draw_probability": existing_prediction.draw_probability,
                "away_win_probability": existing_prediction.away_win_probability,
                "confidence": existing_prediction.confidence,
                "key_player_availability_score": existing_prediction.key_player_availability_score,
                "timestamp": existing_prediction.generated_at.isoformat(),
                "valid_until": existing_prediction.valid_until.isoformat() if existing_prediction.valid_until else None,
                "model_version": existing_prediction.model_version,
                "features": existing_prediction.feature_payload,
                "warnings": [
                    w for w in [
                        "Key player absent" if (existing_prediction.key_player_availability_score or 1.0) < 0.7 else None
                    ] if w
                ],
            }

    # 3. Generate fresh prediction — costs exactly 1 API call
    fixture_context = await get_fixture_context(service, fixture_id)
    status = fixture_context.status
    kickoff_at = fixture_context.kickoff_at

    kickoff_utc = (
        kickoff_at if kickoff_at and kickoff_at.tzinfo
        else kickoff_at.replace(tzinfo=timezone.utc) if kickoff_at
        else None
    )
    if kickoff_utc and kickoff_utc <= now and status.upper() not in ("HT", "NS"):
        raise HTTPException(
            status_code=409,
            detail="Predictions are only available before kick-off or at half-time",
        )

    artifact_record = get_latest_model_artifact(db, fixture_context.league_id)
    artifact = _artifact_payload(artifact_record.artifact_blob if artifact_record else None)
    artifact.setdefault("version", artifact_record.version if artifact_record else DEFAULT_ARTIFACT.get("version", "dixon-coles-v1"))

    prediction = predict_outcome(
        home_team_id=fixture_context.home_team_id,
        away_team_id=fixture_context.away_team_id,
        artifact=artifact,
        timestamp=now.isoformat(),
    )

    valid_until = _prediction_window(status, kickoff_at)

    upsert_match_record(
        db,
        fixture_id=fixture_context.fixture_id,
        league_id=fixture_context.league_id,
        season=fixture_context.season,
        referee_name=fixture_context.referee_name,
        kickoff_at=fixture_context.kickoff_at,
        status=fixture_context.status,
        is_completed=fixture_context.status.upper() == "FT",
        home_team_id=fixture_context.home_team_id,
        home_team_name=fixture_context.home_team_name,
        away_team_id=fixture_context.away_team_id,
        away_team_name=fixture_context.away_team_name,
        home_goals=fixture_context.home_goals,
        away_goals=fixture_context.away_goals,
        venue_name=fixture_context.venue_name,
        raw_payload=fixture_context.raw_fixture,
    )

    raw_output = {
        "most_likely_scoreline": prediction.most_likely_scoreline,
        "interval_width": prediction.interval_width,
        "fixture_status": status,
    }

    save_prediction_record(
        db,
        fixture_id=fixture_context.fixture_id,
        predicted_home_goals=prediction.predicted_home_goals,
        predicted_away_goals=prediction.predicted_away_goals,
        home_win_probability=prediction.home_win_probability,
        draw_probability=prediction.draw_probability,
        away_win_probability=prediction.away_win_probability,
        confidence=prediction.confidence,
        key_player_availability_score=None,
        generated_at=now,
        valid_until=valid_until,
        model_version=prediction.model_version,
        feature_payload={
            "home_team_id": fixture_context.home_team_id,
            "away_team_id": fixture_context.away_team_id,
            "model_version": prediction.model_version,
        },
        raw_output=raw_output,
    )
    db.commit()

    scoreline = (
        f"{fixture_context.home_team_name} {prediction.most_likely_scoreline.split('-')[0]}"
        f" - {prediction.most_likely_scoreline.split('-')[1]} {fixture_context.away_team_name}"
    )
    response: dict[str, Any] = {
        "fixture_id": fixture_context.fixture_id,
        "home_team": fixture_context.home_team_name,
        "away_team": fixture_context.away_team_name,
        "predicted_score": f"{prediction.predicted_home_goals:.2f}-{prediction.predicted_away_goals:.2f}",
        "scoreline": scoreline,
        "most_likely_scoreline": prediction.most_likely_scoreline,
        "home_win_probability": prediction.home_win_probability,
        "draw_probability": prediction.draw_probability,
        "away_win_probability": prediction.away_win_probability,
        "confidence": prediction.confidence,
        "key_player_availability_score": None,
        "timestamp": prediction.timestamp,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "model_version": prediction.model_version,
        "features": None,
        "warnings": [],
    }

    if cache.client is not None:
        ttl_seconds = PREDICTION_TTL_SECONDS
        if valid_until is not None:
            ttl_seconds = max(1, min(PREDICTION_TTL_SECONDS, int((valid_until - now).total_seconds())))
        await cache.set_json(_fixture_cache_key(fixture_id), response, ttl=ttl_seconds)

    return response
