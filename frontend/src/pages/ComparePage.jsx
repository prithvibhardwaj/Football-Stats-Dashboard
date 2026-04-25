import { Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import RadarChart from "../components/charts/RadarChart";
import { Button } from "../components/ui/button";
import { searchPlayersByName } from "../lib/players";
import { getCurrentSeasonYear } from "../lib/season";
import { useAuthStore } from "../store/useAuthStore";
import { useCompareStore } from "../store/useCompareStore";

function usePlayerSearch(query, leagueIds) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const season = getCurrentSeasonYear();
        const items = await searchPlayersByName(trimmed, leagueIds, season);
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [leagueIds, query]);

  return { results, loading };
}

function PlayerPicker({ label, value, onSelect, onClear }) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const leagueIds = useAuthStore((state) => state.leagueIds);
  const { results, loading } = usePlayerSearch(open ? query : "", leagueIds);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.name]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function handleSelect(player) {
    onSelect(player);
    setQuery(player.name);
    setOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">{label}</p>

      {value ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{value.name}</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              {value.position}
              {value.teamName ? ` | ${value.teamName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full p-1 text-[color:var(--color-text-muted)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <Search className="h-4 w-4 flex-shrink-0 text-[color:var(--color-text-muted)]" />
          <input
            className="w-full bg-transparent text-sm text-white placeholder:text-[color:var(--color-text-muted)]"
            placeholder="Search players..."
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
          />
          {loading ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[color:var(--color-text-muted)]" /> : null}
        </label>
      )}

      {open && !value && query.trim().length >= 3 ? (
        <div className="panel-muted absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-white/10 p-2 shadow-xl">
          {loading ? (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">Searching...</div>
          ) : results.length ? (
            results.map((player) => (
              <button
                key={player.id}
                type="button"
                className="block w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                onClick={() => handleSelect(player)}
              >
                <p className="text-sm font-medium text-white">{player.name}</p>
                <p className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">
                  {player.position}
                  {player.teamName ? ` | ${player.teamName}` : ""}
                </p>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">No players found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ComparePage() {
  const { leftPlayer, rightPlayer, setComparedPlayer, clearComparison } = useCompareStore(useShallow((state) => ({
    leftPlayer: state.leftPlayer,
    rightPlayer: state.rightPlayer,
    setComparedPlayer: state.setComparedPlayer,
    clearComparison: state.clearComparison,
  })));

  const metrics = [
    "Goals",
    "Assists",
    "Key Passes",
    "Dribbles",
    "Aerials Won",
    "Tackles",
    "Interceptions",
    "Pass Accuracy",
  ];

  const radarSeries = useMemo(() => {
    const series = [];

    if (leftPlayer?.values) {
      series.push({
        label: leftPlayer.name,
        values: leftPlayer.values,
        stroke: "#34d399",
        fill: "rgba(52,211,153,0.18)",
      });
    }

    if (rightPlayer?.values) {
      series.push({
        label: rightPlayer.name,
        values: rightPlayer.values,
        stroke: "#f59e0b",
        fill: "rgba(245,158,11,0.18)",
      });
    }

    return series;
  }, [leftPlayer, rightPlayer]);

  const leftPlayerHref = leftPlayer?.leagueId && leftPlayer?.teamId
    ? `/player/${leftPlayer.id}?league=${leftPlayer.leagueId}&team=${leftPlayer.teamId}`
    : leftPlayer?.id ? `/player/${leftPlayer.id}` : "";
  const rightPlayerHref = rightPlayer?.leagueId && rightPlayer?.teamId
    ? `/player/${rightPlayer.id}?league=${rightPlayer.leagueId}&team=${rightPlayer.teamId}`
    : rightPlayer?.id ? `/player/${rightPlayer.id}` : "";

  const tableRows = useMemo(() => {
    if (!leftPlayer?.raw || !rightPlayer?.raw) {
      return [];
    }

    return metrics.map((metric) => ({
      metric,
      left: leftPlayer.raw[metric] ?? "-",
      right: rightPlayer.raw[metric] ?? "-",
    }));
  }, [leftPlayer, metrics, rightPlayer]);

  return (
    <div className="space-y-6">
      <section className="panel grid gap-4 p-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <PlayerPicker
          label="Player one"
          value={leftPlayer}
          onSelect={(player) => setComparedPlayer("leftPlayer", player)}
          onClear={() => setComparedPlayer("leftPlayer", null)}
        />
        <PlayerPicker
          label="Player two"
          value={rightPlayer}
          onSelect={(player) => setComparedPlayer("rightPlayer", player)}
          onClear={() => setComparedPlayer("rightPlayer", null)}
        />
        <Button variant="secondary" onClick={clearComparison} type="button">
          Reset
        </Button>
      </section>

      {!leftPlayer && !rightPlayer ? (
        <div className="panel p-12 text-center">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Search for two players above to compare them on the radar chart.
          </p>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            You can also click <strong className="text-white">Compare left</strong> or <strong className="text-white">Compare right</strong> on any player card to pre-fill a slot.
          </p>
        </div>
      ) : null}

      {radarSeries.length >= 1 ? (
        <RadarChart
          title="Player comparison"
          subtitle="Normalised against high-end season totals from the configured data season."
          metrics={metrics}
          series={radarSeries}
        />
      ) : null}

      {leftPlayer && rightPlayer && tableRows.length ? (
        <section className="panel p-6">
          <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-4 text-sm font-medium text-[color:var(--color-text-muted)]">
            <span>
              {leftPlayer.id ? <Link to={leftPlayerHref} className="hover:underline">{leftPlayer.name}</Link> : leftPlayer.name}
            </span>
            <span className="text-center">Metric</span>
            <span className="text-right">
              {rightPlayer.id ? <Link to={rightPlayerHref} className="hover:underline">{rightPlayer.name}</Link> : rightPlayer.name}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {tableRows.map(({ metric, left, right }) => (
              <div key={metric} className="grid grid-cols-3 gap-4 rounded-2xl border border-white/10 px-4 py-3 text-sm">
                <span className="text-white">{left}</span>
                <span className="text-center text-[color:var(--color-text-muted)]">{metric}</span>
                <span className="text-right text-white">{right}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
