import { ArrowUpDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import FormHeatmap from "../components/charts/FormHeatmap";
import RadarChart from "../components/charts/RadarChart";
import MatchCard from "../components/match/MatchCard";
import { apiClient } from "../lib/api";
import { LEAGUE_NAME_BY_ID } from "../lib/onboarding";
import { getCurrentSeasonYear } from "../lib/season";

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function formStringToResults(formStr) {
  if (!formStr) return [];
  return formStr
    .split("")
    .slice(-5)
    .map((char) => ({
      outcome: char === "W" ? "W" : char === "L" ? "L" : "D",
      goalDiff: char === "W" ? 1 : char === "L" ? -1 : 0,
    }));
}

function normalizeStandingsRow(row) {
  return {
    teamId: row.team?.id,
    team: row.team?.name ?? "",
    rank: row.rank ?? 0,
    played: row.all?.played ?? 0,
    won: row.all?.win ?? 0,
    drawn: row.all?.draw ?? 0,
    lost: row.all?.lose ?? 0,
    points: row.points ?? 0,
    goalsFor: row.all?.goals?.for ?? 0,
    goalsAgainst: row.all?.goals?.against ?? 0,
    goalDiff: row.goalsDiff ?? 0,
    form: formStringToResults(row.form),
    // xG and possession not in standard standings — leave as null
    xgFor: null,
    xgAgainst: null,
    possession: null,
    ppda: null,
  };
}

function normalizeScorer(item) {
  return {
    playerId: item.player?.id,
    player: item.player?.name ?? "",
    team: item.statistics?.[0]?.team?.name ?? "",
    value: item.statistics?.[0]?.goals?.total ?? 0,
  };
}

function normalizeAssister(item) {
  return {
    playerId: item.player?.id,
    player: item.player?.name ?? "",
    team: item.statistics?.[0]?.team?.name ?? "",
    value: item.statistics?.[0]?.goals?.assists ?? 0,
  };
}

function normalizeFixture(raw) {
  if (!raw?.fixture) return null;
  const { fixture, teams, goals, league } = raw;
  const short = fixture.status?.short ?? "NS";
  const isLive = ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(short);
  const isFinished = ["FT", "AET", "PEN"].includes(short);
  const scoreline =
    isLive || isFinished ? `${goals?.home ?? 0} - ${goals?.away ?? 0}` : "Upcoming";
  const dateLabel = fixture.date
    ? new Date(fixture.date).toLocaleString("en-GB", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "TBD";

  return {
    id: fixture.id,
    competition: league?.name ?? "",
    homeTeam: teams?.home?.name ?? "",
    awayTeam: teams?.away?.name ?? "",
    status: isLive ? "LIVE" : isFinished ? "FT" : dateLabel,
    scoreline,
    momentum: 0,
  };
}

function isFinishedFixture(rawFixture) {
  return ["FT", "AET", "PEN"].includes(rawFixture?.fixture?.status?.short);
}

function isUpcomingFixture(rawFixture) {
  const short = rawFixture?.fixture?.status?.short ?? "NS";
  if (isFinishedFixture(rawFixture)) {
    return false;
  }

  return short !== "CANC" && short !== "PST" && short !== "ABD";
}

// ---------------------------------------------------------------------------
// Radar series builder from standings rows
// ---------------------------------------------------------------------------

const RADAR_COLOURS = [
  { stroke: "#34d399", fill: "rgba(52,211,153,0.16)" },
  { stroke: "#f59e0b", fill: "rgba(245,158,11,0.16)" },
  { stroke: "#60a5fa", fill: "rgba(96,165,250,0.16)" },
  { stroke: "#f472b6", fill: "rgba(244,114,182,0.16)" },
  { stroke: "#a78bfa", fill: "rgba(167,139,250,0.16)" },
  { stroke: "#fb923c", fill: "rgba(251,146,60,0.16)" },
];

function buildRadarSeries(standings) {
  const top6 = standings.slice(0, 6);
  if (!top6.length) return [];

  const maxGF = Math.max(...top6.map((r) => r.goalsFor), 1);
  const maxGA = Math.max(...top6.map((r) => r.goalsAgainst), 1);
  const maxPts = Math.max(...top6.map((r) => r.points), 1);

  return top6.map((row, i) => ({
    label: row.team,
    stroke: RADAR_COLOURS[i % RADAR_COLOURS.length].stroke,
    fill: RADAR_COLOURS[i % RADAR_COLOURS.length].fill,
    values: {
      "Goals Scored": Math.round((row.goalsFor / maxGF) * 100),
      "Goals Conceded": Math.round(100 - (row.goalsAgainst / maxGA) * 100),
      "xG For": row.xgFor != null ? Math.min(100, row.xgFor) : Math.round((row.goalsFor / maxGF) * 90),
      "xG Against":
        row.xgAgainst != null
          ? Math.round(100 - row.xgAgainst)
          : Math.round(100 - (row.goalsAgainst / maxGA) * 90),
      Possession: row.possession ?? Math.round(40 + (row.points / maxPts) * 25),
      "Press Intensity": row.ppda != null ? Math.round(100 - row.ppda * 5) : Math.round(45 + (row.points / maxPts) * 30),
    },
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeagueHub() {
  const { leagueId } = useParams();
  const lid = Number(leagueId);
  const leagueName = LEAGUE_NAME_BY_ID[lid] ?? `League ${leagueId}`;
  const season = getCurrentSeasonYear();

  const [standings, setStandings] = useState([]);
  const [topScorers, setTopScorers] = useState([]);
  const [topAssisters, setTopAssisters] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sortKey, setSortKey] = useState("points");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (!lid) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.get(`/api/leagues/${lid}/standings?season=${season}`).catch(() => null),
      apiClient.get(`/api/leagues/${lid}/top-scorers?season=${season}`).catch(() => null),
      apiClient.get(`/api/leagues/${lid}/top-assists?season=${season}`).catch(() => null),
      apiClient.get(`/api/leagues/${lid}/fixtures?season=${season}`).catch(() => null),
    ]).then(([standingsData, scorersData, assistsData, fixturesData]) => {
      if (cancelled) return;

      const rawRows = standingsData?.response?.[0]?.league?.standings?.[0];
      setStandings(Array.isArray(rawRows) ? rawRows.map(normalizeStandingsRow) : []);

      const rawScorers = Array.isArray(scorersData?.response) ? scorersData.response : [];
      setTopScorers(rawScorers.slice(0, 10).map(normalizeScorer));

      const rawAssists = Array.isArray(assistsData?.response) ? assistsData.response : [];
      setTopAssisters(rawAssists.slice(0, 10).map(normalizeAssister));

      const rawFixtures = (Array.isArray(fixturesData?.response) ? fixturesData.response : [])
        .slice()
        .sort((left, right) => new Date(left?.fixture?.date ?? 0) - new Date(right?.fixture?.date ?? 0));
      const finishedFixtures = rawFixtures.filter(isFinishedFixture).slice(-10);
      const upcomingFixtures = rawFixtures.filter(isUpcomingFixture).slice(0, 10);
      setFixtures([...finishedFixtures, ...upcomingFixtures].map(normalizeFixture).filter(Boolean));

      setLoading(false);
    }).catch((err) => {
      if (!cancelled) { setError(err.message); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [lid, season]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStandings = useMemo(() => {
    const copy = [...standings];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [standings, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const radarSeries = useMemo(() => buildRadarSeries(sortedStandings), [sortedStandings]);

  const COLUMNS = [
    ["rank", "#"],
    ["team", "Team"],
    ["played", "P"],
    ["won", "W"],
    ["drawn", "D"],
    ["lost", "L"],
    ["goalsFor", "GF"],
    ["goalsAgainst", "GA"],
    ["goalDiff", "+/-"],
    ["points", "Pts"],
    ["form", "Form"],
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-accent)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-rose-300">Failed to load league data: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + standings */}
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">League hub</p>
              <h1 className="mt-3 text-3xl font-semibold">{leagueName}</h1>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white">
              {season}/{season + 1}
            </span>
          </div>

          {standings.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">No standings data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[color:var(--color-text-muted)]">
                  <tr>
                    {COLUMNS.map(([key, label]) => (
                      <th key={key} className="px-3 py-3 font-medium">
                        {key === "form" ? (
                          label
                        ) : (
                          <button
                            type="button"
                            className="flex items-center gap-1"
                            onClick={() => toggleSort(key)}
                          >
                            {label}
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStandings.map((row) => (
                    <tr key={row.teamId ?? row.team} className="border-t border-white/10">
                      <td className="px-3 py-3 text-[color:var(--color-text-muted)]">{row.rank}</td>
                      <td className="px-3 py-3 font-medium text-white">
                        {row.teamId ? (
                          <Link to={`/team/${row.teamId}`} className="hover:underline">
                            {row.team}
                          </Link>
                        ) : (
                          row.team
                        )}
                      </td>
                      <td className="px-3 py-3 text-white">{row.played}</td>
                      <td className="px-3 py-3 text-white">{row.won}</td>
                      <td className="px-3 py-3 text-white">{row.drawn}</td>
                      <td className="px-3 py-3 text-white">{row.lost}</td>
                      <td className="px-3 py-3 text-white">{row.goalsFor}</td>
                      <td className="px-3 py-3 text-white">{row.goalsAgainst}</td>
                      <td className={`px-3 py-3 font-medium ${row.goalDiff > 0 ? "text-emerald-300" : row.goalDiff < 0 ? "text-rose-300" : "text-white"}`}>
                        {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                      </td>
                      <td className="px-3 py-3 font-semibold text-white">{row.points}</td>
                      <td className="px-3 py-3">
                        <FormHeatmap results={row.form} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {radarSeries.length >= 2 ? (
          <RadarChart
            title="Top 6 team profile"
            subtitle="Comparative radar for the leading sides this season."
            metrics={["Goals Scored", "Goals Conceded", "xG For", "xG Against", "Possession", "Press Intensity"]}
            series={radarSeries}
          />
        ) : (
          <div className="panel flex items-center justify-center p-6">
            <p className="text-sm text-[color:var(--color-text-muted)]">Radar requires at least 2 teams in standings.</p>
          </div>
        )}
      </section>

      {/* Top scorers / assisters */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-xl font-semibold">Top scorers</h2>
          {topScorers.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">No data available.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {topScorers.map((entry, i) => (
                <div key={entry.playerId ?? entry.player} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                  <div>
                    <p className="font-medium text-white">
                      {i + 1}.{" "}
                      {entry.playerId ? (
                        <Link to={`/player/${entry.playerId}`} className="hover:underline">
                          {entry.player}
                        </Link>
                      ) : (
                        entry.player
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{entry.team}</p>
                  </div>
                  <span className="text-lg font-semibold text-white">{entry.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="text-xl font-semibold">Top assisters</h2>
          {topAssisters.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">No data available.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {topAssisters.map((entry, i) => (
                <div key={entry.playerId ?? entry.player} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                  <div>
                    <p className="font-medium text-white">
                      {i + 1}.{" "}
                      {entry.playerId ? (
                        <Link to={`/player/${entry.playerId}`} className="hover:underline">
                          {entry.player}
                        </Link>
                      ) : (
                        entry.player
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{entry.team}</p>
                  </div>
                  <span className="text-lg font-semibold text-white">{entry.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Fixtures */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Fixtures — last 10 &amp; next 10</p>
        </div>
        {fixtures.length === 0 ? (
          <p className="text-sm text-[color:var(--color-text-muted)]">No fixtures found.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {fixtures.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
