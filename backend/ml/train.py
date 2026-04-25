from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from statistics import mean

from ml.poisson_model import DEFAULT_ARTIFACT, DEFAULT_MODEL_VERSION
from services.api_football import APIFootballService
from services.db import save_model_artifact, session_scope


async def train_league_model(
    service: APIFootballService,
    *,
    league_id: int,
    seasons: list[int],
) -> dict:
    goal_values: list[float] = []
    total_matches = 0

    for season in seasons:
        fixtures_payload = await service.get_fixtures(league=league_id, season=season, status="FT")
        for row in fixtures_payload.get("response", []):
            goals = row.get("goals", {})
            home_goals = goals.get("home")
            away_goals = goals.get("away")
            if home_goals is None or away_goals is None:
                continue
            goal_values.extend([float(home_goals), float(away_goals)])
            total_matches += 1

    average_goals = mean(goal_values) if goal_values else 1.35
    artifact = {
        **DEFAULT_ARTIFACT,
        "version": f"{DEFAULT_MODEL_VERSION}-{league_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "goal_average": round(average_goals, 4),
    }
    metrics = {
        "training_matches": total_matches,
        "average_goals": round(average_goals, 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    with session_scope() as db:
        save_model_artifact(
            db,
            league_id=league_id,
            season_range=f"{min(seasons)}-{max(seasons)}",
            model_name="Poisson goals model",
            version=artifact["version"],
            metrics=metrics,
            artifact_path=None,
            artifact_blob=json.dumps(artifact),
        )

    return {
        "league_id": league_id,
        "metrics": metrics,
        "artifact": artifact,
    }


async def train_default_leagues(service: APIFootballService) -> list[dict]:
    current_year = datetime.now(timezone.utc).year
    seasons = [current_year - 2, current_year - 1]
    leagues = [39, 140, 78, 135, 61]
    results = []

    for league_id in leagues:
        results.append(await train_league_model(service, league_id=league_id, seasons=seasons))

    return results


def main() -> None:
    raise SystemExit(
        "Use the weekly retrain task or import train_default_leagues(service) from backend code. "
        "A configured APIFootballService instance is required."
    )


if __name__ == "__main__":
    main()
