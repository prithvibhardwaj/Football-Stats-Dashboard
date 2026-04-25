import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import FormHeatmap from "../components/charts/FormHeatmap";
import MatchCard from "../components/match/MatchCard";
import InjuryBadge from "../components/shared/InjuryBadge";
import PlayerCard from "../components/shared/PlayerCard";
import { summarizeInjuries, useInjuries } from "../hooks/useInjuries";
import { apiClient } from "../lib/api";
import { getTeamKeyPlayers } from "../lib/players";
import { LEAGUE_NAME_BY_ID, normalizePinnedTeam } from "../lib/onboarding";
import { getCurrentSeasonYear, getSeasonLabel, isHistoricalSeason } from "../lib/season";
import { useAuthStore } from "../store/useAuthStore";
import { useCompareStore } from "../store/useCompareStore";

function normalizeFixture(raw) {
  if (!raw?.fixture) {
    return null;
  }

  const { fixture, teams, goals, league } = raw;
  const short = fixture.status?.short ?? "NS";
  const isLive = ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(short);
  const isFinished = ["FT", "AET", "PEN"].includes(short);
  const scoreline = isLive || isFinished ? `${goals?.home ?? 0} - ${goals?.away ?? 0}` : "Upcoming";
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
    leagueId: league?.id ?? null,
    homeTeam: teams?.home?.name ?? "",
    awayTeam: teams?.away?.name ?? "",
    homeTeamId: teams?.home?.id ?? null,
    awayTeamId: teams?.away?.id ?? null,
    status: isLive ? "LIVE" : isFinished ? "FT" : dateLabel,
    scoreline,
    momentum: 0,
    date: fixture.date ?? null,
  };
}

function extractForm(fixtures, teamId) {
  const tid = Number(teamId);

  return fixtures
    .filter((fixture) => ["FT", "AET", "PEN"].includes(fixture?.fixture?.status?.short))
    .slice(-5)
    .map((fixture) => {
      const isHome = fixture.teams?.home?.id === tid;
      const homeGoals = fixture.goals?.home ?? 0;
      const awayGoals = fixture.goals?.away ?? 0;
      const goalDiff = isHome ? homeGoals - awayGoals : awayGoals - homeGoals;

      return {
        outcome: goalDiff > 0 ? "W" : goalDiff < 0 ? "L" : "D",
        goalDiff,
      };
    });
}

function extractStatsForm(formString) {
  return String(formString ?? "")
    .trim()
    .split("")
    .filter((result) => ["W", "D", "L"].includes(result))
    .slice(-5)
    .map((result) => ({
      outcome: result,
      goalDiff: result === "W" ? 1 : result === "L" ? -1 : 0,
    }));
}

function toNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value) {
  const numericValue = toNumber(value);
  return numericValue == null ? null : numericValue.toFixed(2);
}

function isFinishedFixture(rawFixture) {
  return ["FT", "AET", "PEN"].includes(rawFixture?.fixture?.status?.short);
}

function isUpcomingFixture(rawFixture) {
  if (isFinishedFixture(rawFixture)) {
    return false;
  }

  const short = rawFixture?.fixture?.status?.short ?? "NS";
  return short !== "CANC" && short !== "PST" && short !== "ABD";
}

function pickUpcomingFixture(rawFixtures) {
  const now = Date.now();

  return rawFixtures.find((fixture) => {
    if (!isUpcomingFixture(fixture)) {
      return false;
    }

    const fixtureTime = fixture?.fixture?.date ? new Date(fixture.fixture.date).getTime() : now;
    return fixtureTime >= now - 6 * 60 * 60 * 1000;
  }) ?? null;
}

function inferLeagueIdFromFixtures(rawFixtures, preferredLeagueId) {
  if (preferredLeagueId) {
    return Number(preferredLeagueId);
  }

  const counts = new Map();
  rawFixtures.forEach((fixture) => {
    const leagueId = fixture?.league?.id;
    if (!leagueId) {
      return;
    }

    counts.set(leagueId, (counts.get(leagueId) ?? 0) + 1);
  });

  let selectedLeagueId = null;
  let highestCount = -1;
  for (const [leagueId, count] of counts.entries()) {
    if (count > highestCount) {
      highestCount = count;
      selectedLeagueId = leagueId;
    }
  }

  return selectedLeagueId;
}

function buildRelevantFixtures(rawFixtures, historicalSeason) {
  const finishedFixtures = rawFixtures.filter(isFinishedFixture);
  const upcomingFixtures = rawFixtures.filter(isUpcomingFixture);

  if (historicalSeason) {
    return upcomingFixtures.length
      ? [...upcomingFixtures.slice(0, 5), ...finishedFixtures.slice(-8)]
      : finishedFixtures.slice(-10);
  }

  return [...finishedFixtures.slice(-8), ...upcomingFixtures.slice(0, 5)];
}

function uniqueFixturesById(fixtures) {
  const fixtureMap = new Map();

  fixtures.forEach((fixture) => {
    const fixtureId = fixture?.fixture?.id;
    if (!fixtureId || fixtureMap.has(fixtureId)) {
      return;
    }

    fixtureMap.set(fixtureId, fixture);
  });

  return Array.from(fixtureMap.values());
}

function useTeamPageData(teamId, preferredLeagueId = null) {
  const [state, setState] = useState({
    loading: true,
    teamName: "",
    leagueName: "",
    leagueId: preferredLeagueId,
    position: null,
    goalsPerGame: null,
    goalsAgainstPerGame: null,
    winRate: null,
    cleanSheets: null,
    failedToScore: null,
    topFormation: null,
    nextFixtureId: null,
    hasUpcomingFixtures: false,
    form: [],
    fixtures: [],
    players: [],
    historicalSeason: false,
    error: null,
  });

  useEffect(() => {
    if (!teamId) {
      return undefined;
    }

    let cancelled = false;
    const season = getCurrentSeasonYear();
    const historicalSeason = isHistoricalSeason(season);

    async function fetchTeamPageData() {
      try {
        setState((current) => ({ ...current, loading: true, error: null }));

        const [teamData, fixtureData, nextFixtureData] = await Promise.all([
          apiClient.get(`/api/teams/${teamId}`).catch(() => null),
          apiClient.get(`/api/teams/${teamId}/fixtures?season=${season}`).catch(() => null),
          apiClient.get(`/api/teams/${teamId}/fixtures?next=5`).catch(() => null),
        ]);

        const rawFixtures = uniqueFixturesById([
          ...(Array.isArray(fixtureData?.response) ? fixtureData.response : []),
          ...(Array.isArray(nextFixtureData?.response) ? nextFixtureData.response : []),
        ])
          .slice()
          .sort((left, right) => new Date(left?.fixture?.date ?? 0) - new Date(right?.fixture?.date ?? 0));
        const leagueId = inferLeagueIdFromFixtures(rawFixtures, preferredLeagueId);

        const [statsData, standingsData, keyPlayers] = leagueId
          ? await Promise.all([
              apiClient.get(`/api/teams/${teamId}/statistics?league_id=${leagueId}&season=${season}`).catch(() => null),
              apiClient.get(`/api/leagues/${leagueId}/standings?season=${season}`).catch(() => null),
              getTeamKeyPlayers(Number(teamId), Number(leagueId), season).catch(() => []),
            ])
          : [null, null, []];

        if (cancelled) {
          return;
        }

        const teamInfo = Array.isArray(teamData?.response) ? teamData.response[0] : null;
        const stats = statsData?.response ?? null;
        const nextFixtureRaw = pickUpcomingFixture(rawFixtures);
        const standingsRows = standingsData?.response?.[0]?.league?.standings?.[0];
        const position = Array.isArray(standingsRows)
          ? standingsRows.find((row) => String(row.team?.id) === String(teamId))?.rank ?? null
          : null;
        const goalsForTotal = toNumber(stats?.goals?.for?.total?.total) ?? 0;
        const goalsAgainstTotal = toNumber(stats?.goals?.against?.total?.total) ?? 0;
        const played = toNumber(stats?.fixtures?.played?.total) ?? 0;
        const wins = toNumber(stats?.fixtures?.wins?.total) ?? 0;
        const topFormation = Array.isArray(stats?.lineups)
          ? [...stats.lineups].sort((left, right) => (right?.played ?? 0) - (left?.played ?? 0))[0]?.formation ?? null
          : null;
        const goalsPerGame = played > 0
          ? formatDecimal(goalsForTotal / played)
          : formatDecimal(stats?.goals?.for?.average?.total);
        const goalsAgainstPerGame = played > 0
          ? formatDecimal(goalsAgainstTotal / played)
          : formatDecimal(stats?.goals?.against?.average?.total);
        const winRate = played > 0 ? `${Math.round((wins / played) * 100)}%` : null;
        const form = rawFixtures.length
          ? extractForm(rawFixtures.filter(isFinishedFixture).slice(-5), teamId)
          : extractStatsForm(stats?.form);

        setState({
          loading: false,
          teamName: teamInfo?.team?.name ?? `Team ${teamId}`,
          leagueName: stats?.league?.name ?? LEAGUE_NAME_BY_ID[leagueId] ?? "",
          leagueId,
          position,
          goalsPerGame,
          goalsAgainstPerGame,
          winRate,
          cleanSheets: toNumber(stats?.clean_sheet?.total),
          failedToScore: toNumber(stats?.failed_to_score?.total),
          topFormation,
          nextFixtureId: nextFixtureRaw?.fixture?.id ?? null,
          hasUpcomingFixtures: rawFixtures.some(isUpcomingFixture),
          form,
          fixtures: buildRelevantFixtures(rawFixtures, historicalSeason).map(normalizeFixture).filter(Boolean),
          players: keyPlayers,
          historicalSeason,
          error: null,
        });
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error.message || "Failed to load team page.",
          }));
        }
      }
    }

    void fetchTeamPageData();

    return () => {
      cancelled = true;
    };
  }, [preferredLeagueId, teamId]);

  return state;
}

export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const pinnedTeams = useAuthStore((state) => state.pinnedTeams);
  const setComparedPlayer = useCompareStore((state) => state.setComparedPlayer);

  const pinnedMatch = useMemo(
    () => pinnedTeams.map(normalizePinnedTeam).find((team) => String(team?.id) === String(teamId)),
    [pinnedTeams, teamId],
  );

  const data = useTeamPageData(teamId, pinnedMatch?.leagueId ?? null);
  const displayName = data.teamName || pinnedMatch?.name || `Team ${teamId}`;
  const displayLeague = data.leagueName || pinnedMatch?.leagueName || "";
  const injuryState = useInjuries(data.nextFixtureId);
  const availability = summarizeInjuries(injuryState.injuries, displayName);
  const seasonLabel = getSeasonLabel();

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-accent)]" />
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-rose-300">Failed to load team data: {data.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Team profile</p>
          <h1 className="mt-3 text-3xl font-semibold">{displayName}</h1>
          {displayLeague ? (
            <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
              {data.leagueId ? <Link to={`/league/${data.leagueId}`} className="hover:underline">{displayLeague}</Link> : displayLeague}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            Using {seasonLabel} data{data.historicalSeason ? " from the latest season available on your API plan." : "."}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {availability.count > 0 ? <InjuryBadge label={`${availability.count} injuries`} tone={availability.count > 2 ? "danger" : "warning"} /> : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">League position</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.position ? `${data.position}` : "-"}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Goals / game</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.goalsPerGame ?? "-"}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Current form</p>
              <div className="mt-3">
                {data.form.length ? <FormHeatmap results={data.form} /> : <p className="text-sm text-[color:var(--color-text-muted)]">No recent data</p>}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Conceded / game</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.goalsAgainstPerGame ?? "-"}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Win rate</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.winRate ?? "-"}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Clean sheets</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.cleanSheets ?? "-"}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Failed to score</p>
              <p className="mt-2 text-2xl font-semibold text-white">{data.failedToScore ?? "-"}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Primary formation</p>
              <p className="mt-2 text-2xl font-semibold text-white">{data.topFormation ?? "-"}</p>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-xl font-semibold">Availability snapshot</h2>
          <div className="mt-4 space-y-3">
            {injuryState.loading ? (
              <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                Loading availability...
              </div>
            ) : availability.list.length ? (
              availability.list.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 px-4 py-3">
                  <p className="text-sm font-medium text-white">{entry.playerName}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    {entry.injuryType}
                    {entry.expectedReturn ? ` | expected ${entry.expectedReturn}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                {data.nextFixtureId ? "No injury records for the selected fixture." : data.historicalSeason ? `No remaining fixtures in ${seasonLabel}.` : "No upcoming fixture found."}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            {data.hasUpcomingFixtures ? "Upcoming + recent matches" : data.historicalSeason ? `Season fixtures (${seasonLabel})` : "Upcoming + recent matches"}
          </p>
          {data.fixtures.length ? (
            data.fixtures.map((match) => <MatchCard key={match.id} match={match} />)
          ) : (
            <p className="text-sm text-[color:var(--color-text-muted)]">No fixture data available.</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Key players</p>
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Use the compare buttons to drop a player straight into the left or right side of the comparison page.
            </p>
          </div>
          {data.players.length ? (
            <div className="grid gap-4">
              {data.players.map((player, index) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  compareLabel={index % 2 === 0 ? "Compare left" : "Compare right"}
                  onCompare={(selectedPlayer) => {
                    setComparedPlayer(index % 2 === 0 ? "leftPlayer" : "rightPlayer", selectedPlayer);
                    navigate("/compare");
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[color:var(--color-text-muted)]">No key-player data available for this team in the configured season.</p>
          )}
        </div>
      </section>
    </div>
  );
}
