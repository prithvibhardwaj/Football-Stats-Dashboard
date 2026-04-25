from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


DEFAULT_MODEL_VERSION = "poisson-v1"
DEFAULT_ARTIFACT = {
    "home_intercept": 0.14,
    "away_intercept": 0.04,
    "weights": {
        "rolling_avg_goals_scored": 0.28,
        "rolling_avg_goals_conceded": -0.12,
        "rolling_avg_xg_for": 0.32,
        "rolling_avg_xg_against": -0.14,
        "current_league_position_normalized": -0.24,
        "head_to_head_win_rate": 0.08,
        "days_since_last_match": 0.015,
        "key_player_availability_score": 0.2,
        "average_shots_on_target_per_game": 0.05,
        "home_away_advantage_factor": 0.16,
        "opponent_defensive_strength": -0.18,
    },
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
    return math.exp(-rate) * (rate**goals) / math.factorial(goals)


def _expected_goals(side_features: dict[str, float], intercept: float, weights: dict[str, float], is_home: bool) -> float:
    score = intercept
    for feature_name, weight in weights.items():
        score += float(side_features.get(feature_name, 0.0)) * weight

    if is_home:
        score += 0.08

    return max(0.2, min(4.2, math.exp(score / 3.2)))


def _joint_probability_matrix(home_rate: float, away_rate: float, max_goals: int = 7) -> list[list[float]]:
    return [
        [poisson_pmf(home_goals, home_rate) * poisson_pmf(away_goals, away_rate) for away_goals in range(max_goals + 1)]
        for home_goals in range(max_goals + 1)
    ]


def _outcome_probabilities(home_rate: float, away_rate: float) -> tuple[float, float, float, tuple[int, int]]:
    matrix = _joint_probability_matrix(home_rate, away_rate)
    home_win = 0.0
    draw = 0.0
    away_win = 0.0
    best_score = (0, 0)
    best_probability = -1.0

    for home_goals, row in enumerate(matrix):
        for away_goals, probability in enumerate(row):
            if home_goals > away_goals:
                home_win += probability
            elif home_goals == away_goals:
                draw += probability
            else:
                away_win += probability

            if probability > best_probability:
                best_probability = probability
                best_score = (home_goals, away_goals)

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


def predict_outcome(features: dict[str, Any], artifact_blob: dict[str, Any] | None = None, timestamp: str | None = None) -> PredictionResult:
    artifact = artifact_blob or DEFAULT_ARTIFACT
    weights = artifact.get("weights", DEFAULT_ARTIFACT["weights"])

    home_rate = _expected_goals(features["home"], artifact.get("home_intercept", 0.1), weights, is_home=True)
    away_rate = _expected_goals(features["away"], artifact.get("away_intercept", 0.05), weights, is_home=False)
    home_win, draw, away_win, best_score = _outcome_probabilities(home_rate, away_rate)
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
