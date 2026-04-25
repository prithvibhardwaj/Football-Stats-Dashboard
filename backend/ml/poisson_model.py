from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


DEFAULT_MODEL_VERSION = "dixon-coles-v1"

# Fallback artifact used when no trained model exists for a league.
# Attack/defence ratings of 1.0 represent a perfectly average team.
# home_advantage is the multiplicative boost applied to the home team's attack.
DEFAULT_ARTIFACT: dict[str, Any] = {
    "version": DEFAULT_MODEL_VERSION,
    "home_advantage": 1.35,
    "league_avg_goals": 1.35,
    "teams": {},
}


@dataclass
class PredictionResult:
    predicted_home_goals: float
    predicted_away_goals: float
    home_win_probability: float
    draw_probability: float
    away_win_probability: float
    most_likely_scoreline: str
    confidence: str
    interval_width: float
    timestamp: str
    model_version: str


def poisson_pmf(goals: int, rate: float) -> float:
    rate = max(rate, 0.05)
    return math.exp(-rate) * (rate ** goals) / math.factorial(goals)


def _dixon_coles_tau(home_goals: int, away_goals: int, home_rate: float, away_rate: float, rho: float) -> float:
    """Low-score correction factor from Dixon & Coles (1997)."""
    if home_goals == 0 and away_goals == 0:
        return 1.0 - home_rate * away_rate * rho
    if home_goals == 1 and away_goals == 0:
        return 1.0 + away_rate * rho
    if home_goals == 0 and away_goals == 1:
        return 1.0 + home_rate * rho
    if home_goals == 1 and away_goals == 1:
        return 1.0 - rho
    return 1.0


def _expected_goals(
    home_team_id: int,
    away_team_id: int,
    artifact: dict[str, Any],
) -> tuple[float, float]:
    teams: dict[str, Any] = artifact.get("teams", {})
    mu = float(artifact.get("league_avg_goals", 1.35))
    home_adv = float(artifact.get("home_advantage", 1.35))

    home_entry = teams.get(str(home_team_id), {})
    away_entry = teams.get(str(away_team_id), {})

    home_attack = float(home_entry.get("attack", 1.0))
    home_defence = float(home_entry.get("defence", 1.0))
    away_attack = float(away_entry.get("attack", 1.0))
    away_defence = float(away_entry.get("defence", 1.0))

    # Dixon-Coles: lambda_home = mu * home_attack * away_defence * home_advantage
    home_rate = mu * home_attack * away_defence * home_adv
    away_rate = mu * away_attack * home_defence

    home_rate = max(0.2, min(6.0, home_rate))
    away_rate = max(0.2, min(6.0, away_rate))
    return home_rate, away_rate


def _joint_probability_matrix(
    home_rate: float,
    away_rate: float,
    rho: float,
    max_goals: int = 7,
) -> list[list[float]]:
    matrix: list[list[float]] = []
    for h in range(max_goals + 1):
        row: list[float] = []
        for a in range(max_goals + 1):
            p = (
                poisson_pmf(h, home_rate)
                * poisson_pmf(a, away_rate)
                * _dixon_coles_tau(h, a, home_rate, away_rate, rho)
            )
            row.append(max(0.0, p))
        matrix.append(row)
    return matrix


def _outcome_probabilities(
    home_rate: float,
    away_rate: float,
    rho: float,
) -> tuple[float, float, float, tuple[int, int]]:
    matrix = _joint_probability_matrix(home_rate, away_rate, rho)
    home_win = 0.0
    draw = 0.0
    away_win = 0.0
    best_score = (0, 0)
    best_probability = -1.0

    for h, row in enumerate(matrix):
        for a, probability in enumerate(row):
            if h > a:
                home_win += probability
            elif h == a:
                draw += probability
            else:
                away_win += probability
            if probability > best_probability:
                best_probability = probability
                best_score = (h, a)

    total = home_win + draw + away_win
    if total <= 0:
        return 0.33, 0.34, 0.33, best_score

    return home_win / total, draw / total, away_win / total, best_score


def _confidence(interval_width: float) -> str:
    if interval_width <= 1.4:
        return "High"
    if interval_width <= 2.2:
        return "Medium"
    return "Low"


def predict_outcome(
    home_team_id: int,
    away_team_id: int,
    artifact: dict[str, Any] | None = None,
    timestamp: str | None = None,
) -> PredictionResult:
    artifact = artifact or DEFAULT_ARTIFACT
    rho = float(artifact.get("rho", -0.13))

    home_rate, away_rate = _expected_goals(home_team_id, away_team_id, artifact)
    home_win, draw, away_win, best_score = _outcome_probabilities(home_rate, away_rate, rho)
    interval_width = math.sqrt(home_rate) + math.sqrt(away_rate)

    return PredictionResult(
        predicted_home_goals=round(home_rate, 3),
        predicted_away_goals=round(away_rate, 3),
        home_win_probability=round(home_win, 4),
        draw_probability=round(draw, 4),
        away_win_probability=round(away_win, 4),
        most_likely_scoreline=f"{best_score[0]}-{best_score[1]}",
        confidence=_confidence(interval_width),
        interval_width=round(interval_width, 4),
        timestamp=timestamp or "",
        model_version=artifact.get("version", DEFAULT_MODEL_VERSION),
    )
