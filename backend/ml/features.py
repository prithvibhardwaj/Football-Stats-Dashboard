from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from services.api_football import APIFootballService


@dataclass
class FixtureContext:
    fixture_id: int
    league_id: int
    season: int
    status: str
    kickoff_at: datetime | None
    home_team_id: int
    home_team_name: str
    away_team_id: int
    away_team_name: str
    home_goals: int | None
    away_goals: int | None
    referee_name: str | None
    venue_name: str | None
    raw_fixture: dict[str, Any]


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _build_fixture_context(fixture_payload: dict[str, Any]) -> FixtureContext:
    fixture_response = fixture_payload.get("response", [])
    if not fixture_response:
        raise ValueError("Fixture response missing")

    fixture = fixture_response[0]
    fixture_info = fixture.get("fixture", {})
    league = fixture.get("league", {})
    teams = fixture.get("teams", {})
    goals = fixture.get("goals", {})

    return FixtureContext(
        fixture_id=int(fixture_info.get("id")),
        league_id=int(league.get("id")),
        season=int(league.get("season")),
        status=str(fixture_info.get("status", {}).get("short", "NS")),
        kickoff_at=_parse_datetime(fixture_info.get("date")),
        home_team_id=int(teams.get("home", {}).get("id")),
        home_team_name=str(teams.get("home", {}).get("name", "Home Team")),
        away_team_id=int(teams.get("away", {}).get("id")),
        away_team_name=str(teams.get("away", {}).get("name", "Away Team")),
        home_goals=goals.get("home"),
        away_goals=goals.get("away"),
        referee_name=fixture_info.get("referee"),
        venue_name=fixture_info.get("venue", {}).get("name"),
        raw_fixture=fixture,
    )


async def get_fixture_context(service: APIFootballService, fixture_id: int) -> FixtureContext:
    """Fetch a fixture and return its context. Costs exactly 1 API call."""
    fixture_payload = await service.get_fixture(fixture_id)
    return _build_fixture_context(fixture_payload)
