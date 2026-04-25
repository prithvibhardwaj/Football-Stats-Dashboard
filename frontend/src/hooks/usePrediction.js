import { useEffect, useState } from "react";

import { apiClient } from "../lib/api";

function normalizePrediction(payload) {
  if (!payload) {
    return null;
  }

  return {
    fixtureId: payload.fixture_id,
    homeTeam: payload.home_team,
    awayTeam: payload.away_team,
    scoreline: payload.scoreline || `${payload.home_team} ${payload.predicted_score} ${payload.away_team}`,
    predictedScore: payload.predicted_score,
    confidence: payload.confidence ?? "Medium",
    homeWin: Math.round((payload.home_win_probability ?? 0) * 100),
    draw: Math.round((payload.draw_probability ?? 0) * 100),
    awayWin: Math.round((payload.away_win_probability ?? 0) * 100),
    keyPlayerAbsent:
      Boolean(payload.warnings?.includes("Key player absent")) || (payload.key_player_availability_score ?? 1) < 0.7,
    timestamp: payload.timestamp,
    validUntil: payload.valid_until,
    modelVersion: payload.model_version,
    features: payload.features,
    warnings: payload.warnings ?? [],
  };
}

export function usePrediction(fixtureId, options = {}) {
  const { enabled = true } = options;
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(Boolean(fixtureId && enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fixtureId || !enabled) {
      setPrediction(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchPrediction() {
      try {
        setLoading(true);
        const result = await apiClient.get(`/api/predictions/${fixtureId}`);
        if (!cancelled) {
          setPrediction(normalizePrediction(result));
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setPrediction(null);
          setError(requestError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPrediction();

    return () => {
      cancelled = true;
    };
  }, [enabled, fixtureId]);

  return { prediction, loading, error };
}
