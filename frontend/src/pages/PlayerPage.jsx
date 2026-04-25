import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import RadarChart from "../components/charts/RadarChart";
import PlayerCard from "../components/shared/PlayerCard";
import { apiClient } from "../lib/api";
import { buildPlayerRadarValues, buildPlayerRawValues, normalizePlayerStatItem } from "../lib/players";
import { getCurrentSeasonYear } from "../lib/season";
import { useCompareStore } from "../store/useCompareStore";

const STAT_DEFINITIONS = [
  { label: "Appearances", key: "appearances" },
  { label: "Goals", key: "goals" },
  { label: "Assists", key: "assists" },
  { label: "Key passes", key: "keyPasses" },
  { label: "Pass accuracy", key: "passAccuracy", suffix: "%" },
  { label: "Successful dribbles", key: "dribbles" },
  { label: "Tackles", key: "tackles" },
  { label: "Interceptions", key: "interceptions" },
  { label: "Aerials won", key: "aerialsWon" },
  { label: "Rating", key: "rating" },
];

export default function PlayerPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setComparedPlayer = useCompareStore((state) => state.setComparedPlayer);

  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const season = getCurrentSeasonYear();
    const queryParams = new URLSearchParams({ season: String(season) });
    const leagueId = searchParams.get("league");
    const teamId = searchParams.get("team");

    if (leagueId) {
      queryParams.set("league", leagueId);
    }
    if (teamId) {
      queryParams.set("team", teamId);
    }

    apiClient.get(`/api/players/${playerId}?${queryParams.toString()}`)
      .then((data) => {
        if (cancelled) {
          return;
        }

        const items = Array.isArray(data?.response) ? data.response : [];
        setPlayerData(items.length ? normalizePlayerStatItem(items[0]) : null);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.message || "Failed to load player.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-accent)]" />
      </div>
    );
  }

  if (error || !playerData) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-rose-300">
          {error ? `Failed to load player: ${error}` : "Player not found."}
        </p>
      </div>
    );
  }

  const radarValues = buildPlayerRadarValues(playerData);
  const rawValues = buildPlayerRawValues(playerData);
  const cardPlayer = {
    ...playerData,
    values: radarValues,
    raw: rawValues,
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <PlayerCard
          player={cardPlayer}
          compareLabel="Add to comparison"
          onCompare={(player) => {
            setComparedPlayer("leftPlayer", player);
            navigate("/compare");
          }}
        />

        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Player detail</p>
          <h1 className="mt-3 text-3xl font-semibold">{playerData.name}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            {playerData.teamName ? `${playerData.teamName} | ` : ""}
            {playerData.leagueName ? `${playerData.leagueName} | ` : ""}
            {playerData.position}
            {playerData.nationality ? ` | ${playerData.nationality}` : ""}
            {playerData.age ? ` | Age ${playerData.age}` : ""}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STAT_DEFINITIONS.map(({ label, key, suffix }) => {
              const value = playerData[key];
              if (value == null) {
                return null;
              }

              return (
                <div key={key} className="panel-muted p-4">
                  <p className="text-sm text-[color:var(--color-text-muted)]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {value}
                    {suffix ?? ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <RadarChart
        title="Player profile radar"
        subtitle="Normalised against high-end season totals from the configured data season."
        metrics={Object.keys(radarValues)}
        series={[
          {
            label: playerData.name,
            values: radarValues,
            stroke: "#f59e0b",
            fill: "rgba(245,158,11,0.16)",
          },
        ]}
      />
    </div>
  );
}
