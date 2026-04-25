import { useEffect, useState } from "react";

import { apiClient } from "../lib/api";

function normalizeInjury(entry) {
  const player = entry.player ?? {};
  const fixture = entry.fixture ?? {};
  const team = entry.team ?? {};

  return {
    id: player.id ?? `${player.name}-${fixture.id ?? "fixture"}`,
    playerName: player.name ?? "Unknown player",
    teamId: team.id ?? null,
    teamName: team.name ?? "Unknown team",
    position: player.type ?? player.position ?? "N/A",
    injuryType: entry.injury?.type ?? entry.reason ?? "Unavailable",
    expectedReturn: entry.injury?.return ?? entry.injury?.date ?? "TBD",
  };
}

export function useInjuries(fixtureId) {
  const [injuries, setInjuries] = useState([]);
  const [loading, setLoading] = useState(Boolean(fixtureId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fixtureId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function fetchInjuries() {
      try {
        setLoading(true);
        const payload = await apiClient.get(`/api/fixtures/${fixtureId}/injuries`);
        if (!cancelled) {
          setInjuries((payload.response ?? []).map(normalizeInjury));
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError);
          setInjuries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchInjuries();

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  return { injuries, loading, error };
}

export function summarizeInjuries(injuries = [], teamName = null) {
  const teamInjuries = teamName ? injuries.filter((injury) => injury.teamName === teamName) : injuries;
  return {
    count: teamInjuries.length,
    list: teamInjuries,
  };
}
