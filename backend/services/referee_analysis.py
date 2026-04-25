from __future__ import annotations

import json
from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from services.api_football import APIFootballService
from services.db import get_latest_model_artifact, save_model_artifact


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _summarize_referee_fixtures(fixtures_payload: dict[str, Any]) -> dict[str, Any]:
    fixtures = fixtures_payload.get("response", [])
    matches_count = len(fixtures)

    yellow_cards = 0
    red_cards = 0
    penalties = 0
    home_wins = 0
    completed_matches = 0
    team_counter: Counter[str] = Counter()

    for fixture in fixtures:
        teams = fixture.get("teams", {})
        goals = fixture.get("goals", {})
        events = fixture.get("events") or fixture.get("fixture_events") or []
        home_name = teams.get("home", {}).get("name", "Home Team")
        away_name = teams.get("away", {}).get("name", "Away Team")
        team_counter.update([home_name, away_name])

        home_goals = goals.get("home")
        away_goals = goals.get("away")
        if home_goals is not None and away_goals is not None:
            completed_matches += 1
            if _safe_int(home_goals) > _safe_int(away_goals):
                home_wins += 1

        for event in events:
            event_type = f"{event.get('type', '')} {event.get('detail', '')}".lower()
            if "yellow" in event_type:
                yellow_cards += 1
            if "red" in event_type:
                red_cards += 1
            if "penalty" in event_type:
                penalties += 1

    home_win_rate = (home_wins / completed_matches) if completed_matches else 0.0
    league_average_home_win_rate = 0.45

    return {
        "matches_refereed": matches_count,
        "average_yellow_cards_per_game": round(yellow_cards / matches_count, 2) if matches_count else 0.0,
        "average_red_cards_per_game": round(red_cards / matches_count, 2) if matches_count else 0.0,
        "penalty_award_rate": round(penalties / matches_count, 2) if matches_count else 0.0,
        "home_win_rate": round(home_win_rate, 4),
        "league_average_home_win_rate": league_average_home_win_rate,
        "home_bias_delta": round((home_win_rate - league_average_home_win_rate) * 100, 1),
        "most_frequent_teams": [
            {"team_name": team_name, "matches": appearances}
            for team_name, appearances in team_counter.most_common(5)
        ],
        "recent_fixtures": [
            {
                "fixture_id": fixture.get("fixture", {}).get("id"),
                "date": fixture.get("fixture", {}).get("date"),
                "home_team": fixture.get("teams", {}).get("home", {}).get("name"),
                "away_team": fixture.get("teams", {}).get("away", {}).get("name"),
                "home_goals": fixture.get("goals", {}).get("home"),
                "away_goals": fixture.get("goals", {}).get("away"),
            }
            for fixture in fixtures[:10]
        ],
    }


async def get_referee_analysis(
    *,
    referee_name: str,
    season: int,
    service: APIFootballService,
    db: Session,
) -> dict[str, Any]:
    league_id = 0
    artifact = get_latest_model_artifact(db, league_id)
    cache_key = f"referee:{referee_name.lower()}:{season}"

    if artifact and artifact.model_name == "referee_analysis" and artifact.version == cache_key and artifact.artifact_blob:
        try:
            cached = json.loads(artifact.artifact_blob)
            if isinstance(cached, dict):
                return cached
        except json.JSONDecodeError:
            pass

    fixtures_payload = await service.get_referee_fixtures(referee_name=referee_name, season=season)
    summary = _summarize_referee_fixtures(fixtures_payload)
    payload = {
        "referee_name": referee_name,
        "season": season,
        **summary,
    }

    save_model_artifact(
        db,
        league_id=league_id,
        season_range=str(season),
        model_name="referee_analysis",
        version=cache_key,
        metrics={
            "matches_refereed": summary["matches_refereed"],
        },
        artifact_path=None,
        artifact_blob=json.dumps(payload),
    )
    db.commit()
    return payload
