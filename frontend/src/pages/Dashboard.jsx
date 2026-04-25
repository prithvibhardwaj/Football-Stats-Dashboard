import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import FormHeatmap from "../components/charts/FormHeatmap";
import MatchCard from "../components/match/MatchCard";
import PredictionCard from "../components/shared/PredictionCard";
import { summarizeInjuries, useInjuries } from "../hooks/useInjuries";
import { usePrediction } from "../hooks/usePrediction";
import { useRefereeAnalysis } from "../hooks/useRefereeAnalysis";
import { apiClient } from "../lib/api";
import { LEAGUE_NAME_BY_ID, normalizePinnedTeam } from "../lib/onboarding";
import { getCurrentSeasonYear, getSeasonLabel, isHistoricalSeason } from "../lib/season";
import { useAuthStore } from "../store/useAuthStore";

function normalizeFixture(raw) {
  if (!raw?.fixture) {
    return null;
  }

  const { fixture, teams, goals, league } = raw;
  const short = fixture.status?.short ?? "NS";
  const isLive = ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(short);
  const isFinished = ["FT", "AET", "PEN"].includes(short);

  let scoreline = "Upcoming";
  if (isLive || isFinished) {
    scoreline = `${goals?.home ?? 0} - ${goals?.away ?? 0}`;
  }

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
    competition: league?.name ?? LEAGUE_NAME_BY_ID[league?.id] ?? "",
    homeTeam: teams?.home?.name ?? "",
    awayTeam: teams?.away?.name ?? "",
    homeTeamId: teams?.home?.id,
    awayTeamId: teams?.away?.id,
    status: isLive ? "LIVE" : isFinished ? "FT" : dateLabel,
    scoreline,
    momentum: 0,
    referee: fixture.referee ?? null,
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
      return { outcome: goalDiff > 0 ? "W" : goalDiff < 0 ? "L" : "D", goalDiff };
    });
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

function pickUpcomingFixture(fixtures) {
  const now = Date.now();

  return fixtures.find((fixture) => {
    if (!isUpcomingFixture(fixture)) {
      return false;
    }

    const fixtureTime = fixture?.fixture?.date ? new Date(fixture.fixture.date).getTime() : now;
    return fixtureTime >= now - 6 * 60 * 60 * 1000;
  }) ?? null;
}

function useTeamSummary(teamId, leagueId, version) {
  const [state, setState] = useState({
    loading: true,
    nextFixture: null,
    latestFixture: null,
    form: [],
    position: null,
    historicalSeason: false,
  });

  useEffect(() => {
    if (!teamId || !leagueId) {
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    const season = getCurrentSeasonYear();
    const historicalSeason = isHistoricalSeason(season);

    Promise.all([
      apiClient.get(`/api/leagues/${leagueId}/fixtures?season=${season}&team=${teamId}`).catch(() => null),
      apiClient.get(`/api/leagues/${leagueId}/standings?season=${season}`).catch(() => null),
    ]).then(([fixturesData, standingsData]) => {
      if (cancelled) {
        return;
      }

      const fixtures = (Array.isArray(fixturesData?.response) ? fixturesData.response : [])
        .slice()
        .sort((left, right) => new Date(left?.fixture?.date ?? 0) - new Date(right?.fixture?.date ?? 0));
      const finishedFixtures = fixtures.filter(isFinishedFixture);
      const nextRaw = pickUpcomingFixture(fixtures);
      const latestRaw = finishedFixtures.length ? finishedFixtures[finishedFixtures.length - 1] : null;
      const standingsRows = standingsData?.response?.[0]?.league?.standings?.[0];
      const position = Array.isArray(standingsRows)
        ? standingsRows.find((row) => String(row.team?.id) === String(teamId))?.rank ?? null
        : null;

      setState({
        loading: false,
        nextFixture: nextRaw ? normalizeFixture(nextRaw) : null,
        latestFixture: latestRaw ? normalizeFixture(latestRaw) : null,
        form: extractForm(finishedFixtures, teamId),
        position,
        historicalSeason,
      });
    }).catch(() => {
      if (!cancelled) {
        setState({
          loading: false,
          nextFixture: null,
          latestFixture: null,
          form: [],
          position: null,
          historicalSeason,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [teamId, leagueId, version]);

  return state;
}

const fallbackPinnedTeams = [
  { id: 33, name: "Manchester United", leagueId: 39, leagueName: "Premier League" },
  { id: 541, name: "Real Madrid", leagueId: 140, leagueName: "La Liga" },
  { id: 157, name: "Bayern Munich", leagueId: 78, leagueName: "Bundesliga" },
];

function PinnedTeamCard({ team, version }) {
  const summary = useTeamSummary(team.id, team.leagueId, version);
  const injuryState = useInjuries(summary.nextFixture?.id ?? null);
  const injurySummary = summarizeInjuries(injuryState.injuries, team.name);
  const seasonLabel = getSeasonLabel();

  const fixtureLabel = summary.loading
    ? "Loading..."
    : summary.nextFixture
      ? (() => {
          const isHome = summary.nextFixture.homeTeamId === Number(team.id);
          const opponent = isHome ? summary.nextFixture.awayTeam : summary.nextFixture.homeTeam;
          const prefix = isHome ? "vs" : "@";
          const when = summary.nextFixture.date
            ? new Date(summary.nextFixture.date).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })
            : "TBD";
          return `${prefix} ${opponent} | ${when}`;
        })()
      : summary.latestFixture
        ? (() => {
            const isHome = summary.latestFixture.homeTeamId === Number(team.id);
            const opponent = isHome ? summary.latestFixture.awayTeam : summary.latestFixture.homeTeam;
            return `${summary.latestFixture.scoreline} vs ${opponent}`;
          })()
        : "No fixture data";

  const fixtureHeading = summary.nextFixture
    ? "Upcoming fixture"
    : summary.historicalSeason
      ? `Latest result (${seasonLabel})`
      : "Latest result";

  return (
    <article className="panel space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{team.leagueName}</p>
          <h3 className="mt-2 text-xl font-semibold">{team.name}</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
          {summary.loading ? "..." : summary.position ? `#${summary.position}` : "-"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel-muted p-4">
          <p className="text-sm text-[color:var(--color-text-muted)]">{fixtureHeading}</p>
          <p className="mt-2 text-sm font-medium text-white">{fixtureLabel}</p>
        </div>
        <div className="panel-muted p-4">
          <p className="text-sm text-[color:var(--color-text-muted)]">Availability</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
              {summary.nextFixture ? (injuryState.loading ? "..." : `${injurySummary.count} injuries`) : `No remaining fixture in ${seasonLabel}`}
            </span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm text-[color:var(--color-text-muted)]">Last 5 form</p>
        <div className="mt-3">
          {summary.loading ? (
            <div className="h-6 animate-pulse rounded bg-white/5" />
          ) : summary.form.length ? (
            <FormHeatmap results={summary.form} />
          ) : (
            <p className="text-sm text-[color:var(--color-text-muted)]">No recent results</p>
          )}
        </div>
      </div>
    </article>
  );
}

function SelectedClubFixture({ team, version }) {
  const summary = useTeamSummary(team.id, team.leagueId, version);
  const match = summary.nextFixture ?? summary.latestFixture;

  if (summary.loading) {
    return <div className="panel h-32 animate-pulse p-5" />;
  }

  if (!match) {
    return (
      <div className="panel p-5 text-sm text-[color:var(--color-text-muted)]">
        No fixture data available for {team.name}.
      </div>
    );
  }

  return <MatchCard match={match} />;
}

function TeamPredictionRow({ team, version }) {
  const summary = useTeamSummary(team.id, team.leagueId, version);
  const predictionState = usePrediction(summary.nextFixture?.id ?? null, { enabled: Boolean(summary.nextFixture?.id) });
  const refereeState = useRefereeAnalysis(summary.nextFixture?.referee ?? null, getCurrentSeasonYear());
  const seasonLabel = getSeasonLabel();
  const analysis = refereeState.analysis;

  if (summary.loading) {
    return <div className="panel h-24 animate-pulse p-5" />;
  }

  if (!summary.nextFixture) {
    return (
      <article className="panel space-y-3 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{team.name} prediction</p>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
          No remaining fixtures in {seasonLabel}, so no current pre-match odds are available for {team.name}.
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      <PredictionCard
        prediction={predictionState.prediction}
        loading={predictionState.loading}
        error={predictionState.error}
        title={`${team.name} prediction`}
      />

      {summary.nextFixture.referee ? (
        <article className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Referee</p>
              <p className="mt-1 text-sm font-semibold text-white">{summary.nextFixture.referee}</p>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                {summary.nextFixture.homeTeam} vs {summary.nextFixture.awayTeam}
              </p>
            </div>
          </div>
          {!refereeState.loading && analysis ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Cards / game</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {analysis.average_yellow_cards_per_game?.toFixed(1) ?? "-"}
                </p>
              </div>
              <div className="panel-muted p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Home bias</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {analysis.home_bias_delta != null ? `${analysis.home_bias_delta > 0 ? "+" : ""}${analysis.home_bias_delta.toFixed(1)}%` : "-"}
                </p>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { pinnedTeams: storePinnedTeams, teamSelectionVersion } = useAuthStore(useShallow((state) => ({
    pinnedTeams: state.pinnedTeams,
    teamSelectionVersion: state.teamSelectionVersion,
  })));

  const pinnedTeams = (storePinnedTeams.length ? storePinnedTeams : fallbackPinnedTeams)
    .map(normalizePinnedTeam)
    .filter(Boolean)
    .slice(0, 3);

  const seasonLabel = getSeasonLabel();
  const historicalSeason = isHistoricalSeason();

  return (
    <div className="space-y-8">
      <section>
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Pinned team summary</p>
        <div className="grid gap-4 xl:grid-cols-3">
          {pinnedTeams.map((team) => (
            <PinnedTeamCard key={team.id} team={team} version={teamSelectionVersion} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Selected club fixtures</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {historicalSeason ? `Relevant matches from ${seasonLabel}` : "Upcoming or latest matches for your clubs"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
              {historicalSeason
                ? "Your API plan is currently serving archived season data, so the dashboard is showing the latest available fixtures for each club."
                : "Each card is tied directly to one of your pinned teams."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pinnedTeams.map((team) => (
              <SelectedClubFixture key={`fixture-${team.id}`} team={team} version={teamSelectionVersion} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Predictions and referee context</p>
          {pinnedTeams.map((team) => (
            <TeamPredictionRow key={`prediction-${team.id}`} team={team} version={teamSelectionVersion} />
          ))}
        </div>
      </section>
    </div>
  );
}
