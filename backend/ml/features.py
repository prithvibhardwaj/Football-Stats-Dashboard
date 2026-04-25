from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import mean
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


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, str):
        stripped = value.strip().replace("%", "")
        if stripped == "":
            return default
        try:
            return float(stripped)
        except ValueError:
            return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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


def _iter_fixture_rows(fixtures_payload: dict[str, Any]) -> list[dict[str, Any]]:
    return list(fixtures_payload.get("response", []))


def _sort_rows_by_date_desc(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: _parse_datetime(row.get("fixture", {}).get("date")) or datetime.min, reverse=True)


def _team_side(row: dict[str, Any], team_id: int) -> tuple[dict[str, Any], dict[str, Any], bool]:
    teams = row.get("teams", {})
    home = teams.get("home", {})
    away = teams.get("away", {})
    is_home = int(home.get("id", -1)) == int(team_id)
    team = home if is_home else away
    opponent = away if is_home else home
    return team, opponent, is_home


def _row_goals(row: dict[str, Any], team_id: int) -> tuple[float, float]:
    goals = row.get("goals", {})
    home_goals = _safe_float(goals.get("home"))
    away_goals = _safe_float(goals.get("away"))
    _, _, is_home = _team_side(row, team_id)
    return (home_goals, away_goals) if is_home else (away_goals, home_goals)


def _approximate_xg(goals_for: float, goals_against: float) -> tuple[float, float]:
    return max(0.2, goals_for * 0.85 + 0.45), max(0.2, goals_against * 0.85 + 0.45)


def _recent_metrics(rows: list[dict[str, Any]], team_id: int, home_away_split: bool | None = None) -> dict[str, float]:
    filtered_rows: list[dict[str, Any]] = []
    for row in rows:
        _, _, is_home = _team_side(row, team_id)
        if home_away_split is not None and is_home != home_away_split:
            continue
        filtered_rows.append(row)

    recent = filtered_rows[:5]
    if not recent:
        return {
            "goals_for": 1.2,
            "goals_against": 1.2,
            "xg_for": 1.25,
            "xg_against": 1.25,
            "shots_on_target": 4.0,
        }

    goals_for_values: list[float] = []
    goals_against_values: list[float] = []
    xg_for_values: list[float] = []
    xg_against_values: list[float] = []

    for row in recent:
        goals_for, goals_against = _row_goals(row, team_id)
        xg_for, xg_against = _approximate_xg(goals_for, goals_against)
        goals_for_values.append(goals_for)
        goals_against_values.append(goals_against)
        xg_for_values.append(xg_for)
        xg_against_values.append(xg_against)

    return {
        "goals_for": mean(goals_for_values),
        "goals_against": mean(goals_against_values),
        "xg_for": mean(xg_for_values),
        "xg_against": mean(xg_against_values),
        "shots_on_target": mean([(value * 2.2) + 1.0 for value in goals_for_values]),
    }


def _days_since_last_match(rows: list[dict[str, Any]]) -> float:
    if not rows:
        return 7.0
    latest_date = _parse_datetime(rows[0].get("fixture", {}).get("date"))
    if latest_date is None:
        return 7.0
    now = datetime.now(timezone.utc)
    latest_utc = latest_date if latest_date.tzinfo else latest_date.replace(tzinfo=timezone.utc)
    return max(0.0, (now - latest_utc).total_seconds() / 86400)


def _league_position_map(standings_payload: dict[str, Any]) -> tuple[dict[int, int], int, float]:
    response = standings_payload.get("response", [])
    if not response:
        return {}, 20, 1.4

    rows = response[0].get("league", {}).get("standings", [[]])[0]
    position_by_team: dict[int, int] = {}
    goals_against_values: list[float] = []

    for row in rows:
        team_id = int(row.get("team", {}).get("id", -1))
        position_by_team[team_id] = int(row.get("rank", 0))
        goals_against = row.get("all", {}).get("goals", {}).get("against")
        played = _safe_float(row.get("all", {}).get("played"), 1.0)
        goals_against_values.append(_safe_float(goals_against) / max(played, 1.0))

    return position_by_team, max(len(rows), 1), mean(goals_against_values) if goals_against_values else 1.4


def _h2h_win_rate(h2h_payload: dict[str, Any], team_id: int) -> float:
    rows = _iter_fixture_rows(h2h_payload)[:10]
    if not rows:
        return 0.5

    wins = 0.0
    for row in rows:
        goals_for, goals_against = _row_goals(row, team_id)
        if goals_for > goals_against:
            wins += 1
        elif goals_for == goals_against:
            wins += 0.5

    return wins / len(rows)


def _win_rate(rows: list[dict[str, Any]], team_id: int, is_home_split: bool) -> float:
    filtered = []
    for row in rows:
        _, _, is_home = _team_side(row, team_id)
        if is_home == is_home_split:
            filtered.append(row)

    if not filtered:
        return 0.5

    total = 0.0
    for row in filtered:
        goals_for, goals_against = _row_goals(row, team_id)
        if goals_for > goals_against:
            total += 1
        elif goals_for == goals_against:
            total += 0.5

    return total / len(filtered)


def _extract_player_stats(payload: dict[str, Any]) -> list[dict[str, Any]]:
    response = payload.get("response", [])
    players: list[dict[str, Any]] = []
    for item in response:
        player = item.get("player", {})
        stats = item.get("statistics", [{}])
        primary_stats = stats[0] if stats else {}
        players.append(
            {
                "id": player.get("id"),
                "name": player.get("name"),
                "position": primary_stats.get("games", {}).get("position"),
                "goals": _safe_float(primary_stats.get("goals", {}).get("total")),
            }
        )
    return players


def _availability_score(injuries_payload: dict[str, Any], player_stats_payload: dict[str, Any]) -> float:
    injuries = injuries_payload.get("response", [])
    absent_names = {
        (item.get("player", {}).get("name") or "").strip().lower()
        for item in injuries
        if (item.get("player", {}).get("name") or "").strip()
    }

    players = _extract_player_stats(player_stats_payload)
    top_scorers = sorted(players, key=lambda item: item["goals"], reverse=True)[:3]
    first_choice_goalkeeper = next((player for player in players if (player["position"] or "").upper() == "G"), None)

    goalkeeper_absent = 1 if first_choice_goalkeeper and first_choice_goalkeeper["name"].lower() in absent_names else 0
    top_scorer_absent = 1 if top_scorers and top_scorers[0]["name"].lower() in absent_names else 0
    other_key_absent = sum(1 for player in top_scorers[1:] if player["name"].lower() in absent_names)

    return max(0.0, 1 - (0.3 * goalkeeper_absent) - (0.4 * top_scorer_absent) - (0.15 * other_key_absent))


async def build_prediction_features(service: APIFootballService, fixture_id: int) -> tuple[FixtureContext, dict[str, Any]]:
    fixture_payload = await service.get_fixture(fixture_id)
    fixture = _build_fixture_context(fixture_payload)

    home_recent_payload, away_recent_payload, standings_payload, h2h_payload, injuries_payload, home_stats_payload, away_stats_payload, home_players_payload, away_players_payload, season_results_payload = await asyncio.gather(
        service.get_fixtures(team=fixture.home_team_id, league=fixture.league_id, season=fixture.season, status="FT"),
        service.get_fixtures(team=fixture.away_team_id, league=fixture.league_id, season=fixture.season, status="FT"),
        service.get_standings(league_id=fixture.league_id, season=fixture.season),
        service.get_head_to_head(home_team_id=fixture.home_team_id, away_team_id=fixture.away_team_id),
        service.get_injuries(fixture_id=fixture.fixture_id),
        service.get_team_statistics(league_id=fixture.league_id, season=fixture.season, team_id=fixture.home_team_id),
        service.get_team_statistics(league_id=fixture.league_id, season=fixture.season, team_id=fixture.away_team_id),
        service.get_player_statistics(team=fixture.home_team_id, league=fixture.league_id, season=fixture.season, page=1),
        service.get_player_statistics(team=fixture.away_team_id, league=fixture.league_id, season=fixture.season, page=1),
        service.get_fixtures(league=fixture.league_id, season=fixture.season, status="FT"),
    )

    home_recent_rows = _sort_rows_by_date_desc(_iter_fixture_rows(home_recent_payload))[:10]
    away_recent_rows = _sort_rows_by_date_desc(_iter_fixture_rows(away_recent_payload))[:10]
    season_rows = _sort_rows_by_date_desc(_iter_fixture_rows(season_results_payload))
    standings_map, league_size, league_avg_goals_against = _league_position_map(standings_payload)

    home_recent = _recent_metrics(home_recent_rows, fixture.home_team_id, home_away_split=True)
    away_recent = _recent_metrics(away_recent_rows, fixture.away_team_id, home_away_split=False)
    home_overall = _recent_metrics(home_recent_rows, fixture.home_team_id)
    away_overall = _recent_metrics(away_recent_rows, fixture.away_team_id)

    home_availability = _availability_score(injuries_payload, home_players_payload)
    away_availability = _availability_score(injuries_payload, away_players_payload)

    features = {
        "fixture_id": fixture.fixture_id,
        "league_id": fixture.league_id,
        "season": fixture.season,
        "status": fixture.status,
        "kickoff_at": fixture.kickoff_at.isoformat() if fixture.kickoff_at else None,
        "home": {
            "team_id": fixture.home_team_id,
            "team_name": fixture.home_team_name,
            "rolling_avg_goals_scored": round(home_recent["goals_for"], 4),
            "rolling_avg_goals_conceded": round(home_recent["goals_against"], 4),
            "rolling_avg_xg_for": round(home_overall["xg_for"], 4),
            "rolling_avg_xg_against": round(home_overall["xg_against"], 4),
            "current_league_position_normalized": round(min(1.0, standings_map.get(fixture.home_team_id, league_size) / league_size), 4),
            "head_to_head_win_rate": round(_h2h_win_rate(h2h_payload, fixture.home_team_id), 4),
            "days_since_last_match": round(_days_since_last_match(home_recent_rows), 4),
            "key_player_availability_score": round(home_availability, 4),
            "average_shots_on_target_per_game": round(home_overall["shots_on_target"], 4),
            "home_away_advantage_factor": round(_win_rate(season_rows, fixture.home_team_id, True) - _win_rate(season_rows, fixture.home_team_id, False), 4),
            "opponent_defensive_strength": round(away_overall["goals_against"] / max(league_avg_goals_against, 0.1), 4),
            "team_statistics_snapshot": home_stats_payload.get("response", {}),
        },
        "away": {
            "team_id": fixture.away_team_id,
            "team_name": fixture.away_team_name,
            "rolling_avg_goals_scored": round(away_recent["goals_for"], 4),
            "rolling_avg_goals_conceded": round(away_recent["goals_against"], 4),
            "rolling_avg_xg_for": round(away_overall["xg_for"], 4),
            "rolling_avg_xg_against": round(away_overall["xg_against"], 4),
            "current_league_position_normalized": round(min(1.0, standings_map.get(fixture.away_team_id, league_size) / league_size), 4),
            "head_to_head_win_rate": round(_h2h_win_rate(h2h_payload, fixture.away_team_id), 4),
            "days_since_last_match": round(_days_since_last_match(away_recent_rows), 4),
            "key_player_availability_score": round(away_availability, 4),
            "average_shots_on_target_per_game": round(away_overall["shots_on_target"], 4),
            "home_away_advantage_factor": round(_win_rate(season_rows, fixture.away_team_id, False) - _win_rate(season_rows, fixture.away_team_id, True), 4),
            "opponent_defensive_strength": round(home_overall["goals_against"] / max(league_avg_goals_against, 0.1), 4),
            "team_statistics_snapshot": away_stats_payload.get("response", {}),
        },
    }

    return fixture, features
