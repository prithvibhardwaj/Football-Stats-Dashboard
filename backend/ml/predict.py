from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ml.features import build_prediction_features
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
    normalized_status = status.upper()
    if normalized_status == "HT":
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
    fixture_payload = await service.get_fixture(fixture_id)
    fixture_response = fixture_payload.get("response", [])
    if not fixture_response:
        raise HTTPException(status_code=404, detail="Fixture not found")

    fixture = fixture_response[0]
    fixture_info = fixture.get("fixture", {})
    league = fixture.get("league", {})
    teams = fixture.get("teams", {})
    goals = fixture.get("goals", {})
    status = str(fixture_info.get("status", {}).get("short", "NS"))
    kickoff_at = _parse_datetime(fixture_info.get("date"))
    now = datetime.now(timezone.utc)
    kickoff_utc = kickoff_at if kickoff_at and kickoff_at.tzinfo else kickoff_at.replace(tzinfo=timezone.utc) if kickoff_at else None

    cached = await cache.get_json(_fixture_cache_key(fixture_id)) if cache.client is not None else None
    if cached is not None:
        valid_until = _parse_datetime(cached.get("valid_until"))
        if valid_until and valid_until > now:
          return cached

    if kickoff_utc and kickoff_utc <= now and status.upper() != "HT":
        raise HTTPException(
            status_code=409,
            detail="Predictions are only available before kick-off or at half-time",
        )

    existing_prediction = get_latest_prediction(db, fixture_id)
    if existing_prediction and existing_prediction.valid_until:
        existing_valid_until = existing_prediction.valid_until
        existing_valid_utc = existing_valid_until if existing_valid_until.tzinfo else existing_valid_until.replace(tzinfo=timezone.utc)
        if existing_valid_utc > now:
            return {
                "fixture_id": fixture_id,
                "predicted_score": f"{existing_prediction.predicted_home_goals:.2f}-{existing_prediction.predicted_away_goals:.2f}",
                "scoreline": f"{existing_prediction.predicted_home_goals:.2f}-{existing_prediction.predicted_away_goals:.2f}",
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
                    warning
                    for warning in [
                        "Key player absent" if (existing_prediction.key_player_availability_score or 1) < 0.7 else None
                    ]
                    if warning
                ],
            }

    fixture_context, features = await build_prediction_features(service, fixture_id)
    artifact = get_latest_model_artifact(db, fixture_context.league_id)
    artifact_payload = _artifact_payload(artifact.artifact_blob if artifact else None)
    artifact_payload.setdefault("version", artifact.version if artifact else DEFAULT_ARTIFACT.get("version", "poisson-v1"))

    prediction = predict_outcome(
        features,
        artifact_blob=artifact_payload,
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

    key_player_score = min(
        features["home"]["key_player_availability_score"],
        features["away"]["key_player_availability_score"],
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
        key_player_availability_score=key_player_score,
        generated_at=now,
        valid_until=valid_until,
        model_version=prediction.model_version,
        feature_payload=features,
        raw_output=raw_output,
    )
    db.commit()

    response = {
        "fixture_id": fixture_context.fixture_id,
        "home_team": fixture_context.home_team_name,
        "away_team": fixture_context.away_team_name,
        "predicted_score": f"{prediction.predicted_home_goals:.2f}-{prediction.predicted_away_goals:.2f}",
        "scoreline": f"{fixture_context.home_team_name} {prediction.most_likely_scoreline.split('-')[0]} - {prediction.most_likely_scoreline.split('-')[1]} {fixture_context.away_team_name}",
        "most_likely_scoreline": prediction.most_likely_scoreline,
        "home_win_probability": prediction.home_win_probability,
        "draw_probability": prediction.draw_probability,
        "away_win_probability": prediction.away_win_probability,
        "confidence": prediction.confidence,
        "key_player_availability_score": key_player_score,
        "timestamp": prediction.timestamp,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "model_version": prediction.model_version,
        "features": features,
        "warnings": ["Key player absent"] if key_player_score < 0.7 else [],
    }

    if cache.client is not None:
        ttl_seconds = PREDICTION_TTL_SECONDS
        if valid_until is not None:
            ttl_seconds = max(1, min(PREDICTION_TTL_SECONDS, int((valid_until - now).total_seconds())))
        await cache.set_json(_fixture_cache_key(fixture_id), response, ttl=ttl_seconds)

    return response
