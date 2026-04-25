import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { useRefereeAnalysis } from "../hooks/useRefereeAnalysis";
import { getCurrentSeasonYear } from "../lib/season";

const refereeProfiles = {
  1: "Michael Oliver",
  2: "Jose Sanchez",
  3: "Felix Zwayer",
};

const fallbackAnalysis = {
  referee_name: "Michael Oliver",
  matches_refereed: 28,
  average_yellow_cards_per_game: 4.6,
  average_red_cards_per_game: 0.22,
  penalty_award_rate: 0.31,
  home_bias_delta: 8,
  most_frequent_teams: [
    { team_name: "Arsenal", matches: 7 },
    { team_name: "Manchester City", matches: 6 },
    { team_name: "Liverpool", matches: 5 },
    { team_name: "Tottenham", matches: 4 },
    { team_name: "Chelsea", matches: 4 },
  ],
  recent_fixtures: [
    { fixture_id: 1, home_team: "Arsenal", away_team: "Brighton", home_goals: 2, away_goals: 1, date: "2026-04-18" },
    { fixture_id: 2, home_team: "Manchester City", away_team: "Wolves", home_goals: 3, away_goals: 0, date: "2026-04-15" },
    { fixture_id: 3, home_team: "Tottenham", away_team: "Newcastle", home_goals: 1, away_goals: 1, date: "2026-04-12" },
    { fixture_id: 4, home_team: "Chelsea", away_team: "Liverpool", home_goals: 2, away_goals: 2, date: "2026-04-10" },
  ],
};

export default function RefereePage() {
  const { refereeId } = useParams();
  const refereeName = useMemo(
    () => refereeProfiles[refereeId] ?? decodeURIComponent(refereeId ?? "Michael Oliver"),
    [refereeId],
  );
  const refereeState = useRefereeAnalysis(refereeName, getCurrentSeasonYear());
  const profile = refereeState.analysis ?? { ...fallbackAnalysis, referee_name: refereeName };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 md:grid-cols-[1fr_0.9fr]">
        <section className="panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Referee profile</p>
          <h1 className="mt-3 text-3xl font-semibold">{profile.referee_name}</h1>
          <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Matches</p>
              <p className="mt-2 text-2xl font-semibold text-white">{profile.matches_refereed}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Yellow cards</p>
              <p className="mt-2 text-2xl font-semibold text-white">{profile.average_yellow_cards_per_game}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Red cards</p>
              <p className="mt-2 text-2xl font-semibold text-white">{profile.average_red_cards_per_game}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[color:var(--color-text-muted)]">Penalties</p>
              <p className="mt-2 text-2xl font-semibold text-white">{profile.penalty_award_rate}</p>
            </div>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Home bias snapshot</h2>
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-[color:var(--color-text-muted)]">Home win % delta against league baseline</p>
            <p className="mt-3 text-4xl font-semibold text-white">
              {profile.home_bias_delta > 0 ? "+" : ""}
              {profile.home_bias_delta}% vs league avg
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
              Matches this season: {profile.matches_refereed}
            </div>
            <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
              Penalty award rate: {profile.penalty_award_rate} per match
            </div>
            <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
              Yellow cards trend: {profile.average_yellow_cards_per_game} per game
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Most refereed teams</h2>
          <ul className="mt-4 space-y-3 text-[color:var(--color-text-muted)]">
            {(profile.most_frequent_teams ?? []).map((team, index) => (
              <li key={team.team_name} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                <span>
                  {index + 1}. {team.team_name}
                </span>
                <span className="text-white">{team.matches} matches</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Recent assignments</h2>
          <div className="mt-4 space-y-3">
            {(profile.recent_fixtures ?? []).map((fixture) => (
              <div key={fixture.fixture_id} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                {fixture.home_team} {fixture.home_goals} - {fixture.away_goals} {fixture.away_team}
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
