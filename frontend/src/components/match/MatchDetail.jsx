import { Clock3, Flag, ShieldAlert, Siren, Target, UserRoundX } from "lucide-react";

import MomentumBar from "../charts/MomentumBar";
import FootballPitch from "../pitch/FootballPitch";
import InjuryBadge from "../shared/InjuryBadge";
import PredictionCard from "../shared/PredictionCard";

function LiveStatCard({ icon: Icon, label, homeValue, awayValue }) {
  return (
    <div className="panel-muted flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2 text-[color:var(--color-text-muted)]">
        <Icon className="h-4 w-4 text-[color:var(--color-accent)]" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-sm font-semibold text-white">
        <span>{homeValue}</span>
        <span className="text-[color:var(--color-text-muted)]">vs</span>
        <span>{awayValue}</span>
      </div>
    </div>
  );
}

function InjuryList({ teamName, entries = [], loading = false }) {
  return (
    <div className="panel-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{teamName}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
            Injury + suspension tracker
          </p>
        </div>
        <InjuryBadge
          label={`${entries.length} absences`}
          tone={entries.length > 1 ? "danger" : "warning"}
        />
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-[color:var(--color-text-muted)]">Loading team availability...</p>
        ) : entries.length ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{entry.playerName}</p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{entry.position}</p>
                </div>
                <UserRoundX className="h-4 w-4 text-amber-200" />
              </div>
              <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">
                {entry.injuryType} | Expected return {entry.expectedReturn}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-[color:var(--color-text-muted)]">No recorded absences for this fixture.</p>
        )}
      </div>
    </div>
  );
}

function RefereePanel({ refereeAnalysis, loading = false, refereeName = "TBD" }) {
  if (loading) {
    return (
      <div className="panel-muted p-4">
        <p className="text-sm text-[color:var(--color-text-muted)]">Loading referee analysis...</p>
      </div>
    );
  }

  return (
    <div className="panel-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[color:var(--color-text-muted)]">Referee</p>
          <p className="mt-1 text-lg font-semibold text-white">{refereeAnalysis?.referee_name ?? refereeName}</p>
        </div>
        <Siren className="h-5 w-5 text-[color:var(--color-accent)]" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">Yellow cards</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {refereeAnalysis?.average_yellow_cards_per_game ?? "4.5"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">Home bias</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {refereeAnalysis ? `${refereeAnalysis.home_bias_delta > 0 ? "+" : ""}${refereeAnalysis.home_bias_delta}%` : "+4.0%"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">
        Penalties per match: {refereeAnalysis?.penalty_award_rate ?? "0.28"} | Red cards per match:{" "}
        {refereeAnalysis?.average_red_cards_per_game ?? "0.18"}
      </p>
    </div>
  );
}

function renderEventLabel(event) {
  return `${event.type}${event.detail ? ` | ${event.detail}` : ""}`;
}

export default function MatchDetail({
  match,
  events = [],
  eventLog = [],
  ballPosition,
  previousBallPosition,
  ballMotion,
  ballAnimationKey,
  liveStatistics,
  halfTime = false,
  prediction,
  predictionLoading = false,
  predictionError = null,
  injuries = [],
  injuriesLoading = false,
  refereeAnalysis = null,
  refereeLoading = false,
}) {
  const isLive = match?.status === "LIVE";
  const shouldShowPrediction =
    Boolean(prediction) ||
    Boolean(predictionError) ||
    predictionLoading ||
    match?.status === "NS" ||
    match?.status === "HT";
  const homePossession = liveStatistics?.homePossession ?? 0;
  const awayPossession = liveStatistics?.awayPossession ?? 0;
  const momentum = homePossession || awayPossession ? homePossession - awayPossession : match?.momentum ?? 0;
  const homeInjuries = injuries.filter((entry) => entry.teamName === match?.homeTeam);
  const awayInjuries = injuries.filter((entry) => entry.teamName === match?.awayTeam);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <FootballPitch
          events={events}
          ballPosition={ballPosition}
          previousBallPosition={previousBallPosition}
          ballMotion={ballMotion}
          ballAnimationKey={ballAnimationKey}
          isLive={isLive}
          halfTime={halfTime}
        />
        <div className="panel p-5">
          <MomentumBar
            value={momentum}
            homeLabel={match?.homeTeam ?? "Home"}
            awayLabel={match?.awayTeam ?? "Away"}
          />
        </div>
        {isLive ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <LiveStatCard
              icon={Clock3}
              label="Possession"
              homeValue={`${liveStatistics?.homePossession ?? 0}%`}
              awayValue={`${liveStatistics?.awayPossession ?? 0}%`}
            />
            <LiveStatCard
              icon={Target}
              label="Shots"
              homeValue={liveStatistics?.homeShots ?? 0}
              awayValue={liveStatistics?.awayShots ?? 0}
            />
            <LiveStatCard
              icon={Flag}
              label="Corners"
              homeValue={liveStatistics?.homeCorners ?? 0}
              awayValue={liveStatistics?.awayCorners ?? 0}
            />
            <LiveStatCard
              icon={ShieldAlert}
              label="Cards"
              homeValue={`${(liveStatistics?.homeYellowCards ?? 0) + (liveStatistics?.homeRedCards ?? 0)}`}
              awayValue={`${(liveStatistics?.awayYellowCards ?? 0) + (liveStatistics?.awayRedCards ?? 0)}`}
            />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <InjuryList teamName={match?.homeTeam ?? "Home Team"} entries={homeInjuries} loading={injuriesLoading} />
            <InjuryList teamName={match?.awayTeam ?? "Away Team"} entries={awayInjuries} loading={injuriesLoading} />
          </div>
        )}
      </div>
      <aside className="panel space-y-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">Match detail</p>
          <h2 className="mt-2 text-2xl font-semibold">
            {match?.homeTeam} vs {match?.awayTeam}
          </h2>
        </div>
        <div className="panel-muted p-4">
          <p className="text-sm text-[color:var(--color-text-muted)]">Kickoff</p>
          <p className="mt-1 text-lg font-medium">{match?.kickoff ?? "TBD"}</p>
        </div>
        <div className="panel-muted p-4">
          <p className="text-sm text-[color:var(--color-text-muted)]">Venue</p>
          <p className="mt-1 text-lg font-medium">{match?.venue ?? "Unknown"}</p>
        </div>
        <RefereePanel
          refereeAnalysis={refereeAnalysis}
          loading={refereeLoading}
          refereeName={match?.refereeName ?? "TBD"}
        />
        {shouldShowPrediction ? (
          <PredictionCard
            prediction={prediction}
            loading={predictionLoading}
            error={predictionError}
            title={match?.status === "HT" ? "Half-time prediction" : "Pre-match prediction"}
          />
        ) : null}
        {isLive ? (
          <div className="panel-muted p-4">
            <p className="text-sm text-[color:var(--color-text-muted)]">Live event log</p>
            <div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
              {eventLog.length ? (
                eventLog.map((event) => (
                  <div
                    key={`${event.id}-${event.minute}`}
                    className={`rounded-2xl border px-4 py-3 ${
                      event.isActive ? "border-[color:var(--color-accent)]/40 bg-amber-400/10" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{event.player}</p>
                      <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        {event.minute}'
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">{renderEventLabel(event)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                      {event.team === "away" ? match?.awayTeam : match?.homeTeam}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[color:var(--color-text-muted)]">Waiting for live events...</p>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
