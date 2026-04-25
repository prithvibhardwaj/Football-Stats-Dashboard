import { useEffect, useState } from "react";

import { apiClient } from "../lib/api";
import { getCurrentSeasonYear } from "../lib/season";

export function useRefereeAnalysis(refereeName, season = getCurrentSeasonYear()) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(Boolean(refereeName));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!refereeName) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function fetchAnalysis() {
      try {
        setLoading(true);
        const payload = await apiClient.get(
          `/api/referees/${encodeURIComponent(refereeName)}/analysis?season=${season}`,
        );
        if (!cancelled) {
          setAnalysis(payload);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnalysis();

    return () => {
      cancelled = true;
    };
  }, [refereeName, season]);

  return { analysis, loading, error };
}
