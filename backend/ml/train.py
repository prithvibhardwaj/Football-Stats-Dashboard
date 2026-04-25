from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
from scipy.optimize import minimize

from ml.poisson_model import DEFAULT_ARTIFACT, DEFAULT_MODEL_VERSION
from services.api_football import APIFootballService
from services.db import save_model_artifact, session_scope


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

async def _collect_match_rows(
    service: APIFootballService,
    league_id: int,
    seasons: list[int],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for season in seasons:
        payload = await service.get_fixtures(league=league_id, season=season, status="FT")
        for row in payload.get("response", []):
            goals = row.get("goals", {})
            home_goals = goals.get("home")
            away_goals = goals.get("away")
            if home_goals is None or away_goals is None:
                continue
            teams = row.get("teams", {})
            home_id = teams.get("home", {}).get("id")
            away_id = teams.get("away", {}).get("id")
            home_name = teams.get("home", {}).get("name", str(home_id))
            away_name = teams.get("away", {}).get("name", str(away_id))
            if home_id is None or away_id is None:
                continue
            rows.append({
                "home_id": int(home_id),
                "away_id": int(away_id),
                "home_name": home_name,
                "away_name": away_name,
                "home_goals": int(home_goals),
                "away_goals": int(away_goals),
            })
    return rows


# ---------------------------------------------------------------------------
# Dixon-Coles MLE
# ---------------------------------------------------------------------------

def _tau(h: int, a: int, lam: float, mu: float, rho: float) -> float:
    if h == 0 and a == 0:
        return 1.0 - lam * mu * rho
    if h == 1 and a == 0:
        return 1.0 + mu * rho
    if h == 0 and a == 1:
        return 1.0 + lam * rho
    if h == 1 and a == 1:
        return 1.0 - rho
    return 1.0


def _neg_log_likelihood(
    params: np.ndarray,
    home_idx: np.ndarray,
    away_idx: np.ndarray,
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    n_teams: int,
) -> float:
    # params layout: [attack_0..n-1, defence_0..n-1, log_home_adv, log_mu, rho]
    attacks = params[:n_teams]
    defences = params[n_teams: 2 * n_teams]
    home_adv = math.exp(params[2 * n_teams])
    mu = math.exp(params[2 * n_teams + 1])
    rho = params[2 * n_teams + 2]

    ha = attacks[home_idx]
    hd = defences[home_idx]
    aa = attacks[away_idx]
    ad = defences[away_idx]

    lam = mu * ha * ad * home_adv   # expected home goals
    nu = mu * aa * hd               # expected away goals

    lam = np.clip(lam, 0.05, 15.0)
    nu = np.clip(nu, 0.05, 15.0)

    ll = (
        home_goals * np.log(lam) - lam
        + away_goals * np.log(nu) - nu
        # log-factorial terms cancel in optimisation but kept for correctness
        - np.array([math.lgamma(h + 1) for h in home_goals])
        - np.array([math.lgamma(a + 1) for a in away_goals])
    )

    # Dixon-Coles tau correction (vectorised for low scores)
    tau_vals = np.ones(len(home_goals))
    mask_00 = (home_goals == 0) & (away_goals == 0)
    mask_10 = (home_goals == 1) & (away_goals == 0)
    mask_01 = (home_goals == 0) & (away_goals == 1)
    mask_11 = (home_goals == 1) & (away_goals == 1)
    tau_vals[mask_00] = 1.0 - lam[mask_00] * nu[mask_00] * rho
    tau_vals[mask_10] = 1.0 + nu[mask_10] * rho
    tau_vals[mask_01] = 1.0 + lam[mask_01] * rho
    tau_vals[mask_11] = 1.0 - rho

    tau_vals = np.clip(tau_vals, 1e-10, None)
    ll += np.log(tau_vals)

    return -float(np.sum(ll))


def _fit_model(rows: list[dict[str, Any]]) -> dict[str, Any]:
    team_ids = sorted({r["home_id"] for r in rows} | {r["away_id"] for r in rows})
    team_index = {tid: i for i, tid in enumerate(team_ids)}
    n = len(team_ids)

    home_idx = np.array([team_index[r["home_id"]] for r in rows], dtype=int)
    away_idx = np.array([team_index[r["away_id"]] for r in rows], dtype=int)
    home_goals = np.array([r["home_goals"] for r in rows], dtype=float)
    away_goals = np.array([r["away_goals"] for r in rows], dtype=float)

    # Initial params: all attacks=1, all defences=1, home_adv=log(1.35), mu=log(1.35), rho=-0.13
    x0 = np.concatenate([
        np.ones(n),           # attack
        np.ones(n),           # defence
        [math.log(1.35)],     # log home_advantage
        [math.log(1.35)],     # log league_avg_goals (mu)
        [-0.13],              # rho
    ])

    # Sum-to-zero constraint on attack parameters so the model is identifiable
    def attack_sum_constraint(params: np.ndarray) -> float:
        return float(np.sum(params[:n])) - n

    constraints = [{"type": "eq", "fun": attack_sum_constraint}]

    bounds = (
        [(0.1, 5.0)] * n        # attack bounds
        + [(0.1, 5.0)] * n      # defence bounds
        + [(-1.0, 1.5)]         # log home_adv
        + [(-1.0, 1.5)]         # log mu
        + [(-0.5, 0.5)]         # rho
    )

    result = minimize(
        _neg_log_likelihood,
        x0,
        args=(home_idx, away_idx, home_goals, away_goals, n),
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-9},
    )

    params = result.x
    attacks = params[:n]
    defences = params[n: 2 * n]
    home_advantage = math.exp(float(params[2 * n]))
    league_avg_goals = math.exp(float(params[2 * n + 1]))
    rho = float(params[2 * n + 2])

    teams_out: dict[str, Any] = {}
    for tid, idx in team_index.items():
        home_row = next((r for r in rows if r["home_id"] == tid), None)
        away_row = next((r for r in rows if r["away_id"] == tid), None)
        name = (home_row or away_row or {}).get("home_name") or (away_row or {}).get("away_name") or str(tid)
        teams_out[str(tid)] = {
            "name": name,
            "attack": round(float(attacks[idx]), 6),
            "defence": round(float(defences[idx]), 6),
        }

    return {
        "home_advantage": round(home_advantage, 6),
        "league_avg_goals": round(league_avg_goals, 6),
        "rho": round(rho, 6),
        "teams": teams_out,
        "converged": bool(result.success),
        "n_matches": len(rows),
        "n_teams": n,
    }


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

async def train_league_model(
    service: APIFootballService,
    *,
    league_id: int,
    seasons: list[int],
) -> dict[str, Any]:
    rows = await _collect_match_rows(service, league_id, seasons)

    if len(rows) < 20:
        artifact = {
            **DEFAULT_ARTIFACT,
            "version": f"{DEFAULT_MODEL_VERSION}-{league_id}-insufficient-data",
        }
        metrics = {
            "training_matches": len(rows),
            "converged": False,
            "note": "Insufficient data for fitting — fewer than 20 completed matches",
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        fitted = _fit_model(rows)
        version = f"{DEFAULT_MODEL_VERSION}-{league_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        artifact = {
            "version": version,
            "home_advantage": fitted["home_advantage"],
            "league_avg_goals": fitted["league_avg_goals"],
            "rho": fitted["rho"],
            "teams": fitted["teams"],
        }
        metrics = {
            "training_matches": fitted["n_matches"],
            "n_teams": fitted["n_teams"],
            "converged": fitted["converged"],
            "home_advantage": fitted["home_advantage"],
            "league_avg_goals": fitted["league_avg_goals"],
            "rho": fitted["rho"],
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }

    with session_scope() as db:
        save_model_artifact(
            db,
            league_id=league_id,
            season_range=f"{min(seasons)}-{max(seasons)}",
            model_name="Dixon-Coles Poisson model",
            version=artifact["version"],
            metrics=metrics,
            artifact_path=None,
            artifact_blob=json.dumps(artifact),
        )

    return {"league_id": league_id, "metrics": metrics, "artifact": artifact}


async def train_default_leagues(service: APIFootballService) -> list[dict[str, Any]]:
    current_year = datetime.now(timezone.utc).year
    seasons = [current_year - 2, current_year - 1]
    leagues = [39, 140, 78, 135, 61]  # PL, La Liga, Bundesliga, Serie A, Ligue 1
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
