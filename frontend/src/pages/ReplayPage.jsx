import { Clock3, Flag, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import FootballPitch from "../components/pitch/FootballPitch";
import ReplayControls from "../components/match/ReplayControls";
import { useReplay } from "../hooks/useReplay";
import { apiClient } from "../lib/api";

// ---------------------------------------------------------------------------
// Normalise raw API-Football events into the shape useReplay expects
// ---------------------------------------------------------------------------

function normalizeEvents(rawEvents, homeTeamName) {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .map((ev, index) => {
      const team = ev.team?.name ?? "";
      const side = team === homeTeamName ? "home" : "away";
      const minute = Number(ev.time?.elapsed ?? 0);
      const extra = Number(ev.time?.extra ?? 0);
      const effectiveMinute = minute + (extra > 0 ? extra / 10 : 0); // keep decimal for ordering

      // Map API event type to internal type string
      let type = ev.type ?? "Event";
      const detail = ev.detail ?? "";
      if (type === "Goal") type = "Goal";
      else if (type === "Card") type = detail.includes("Yellow") ? "Yellow Card" : "Red Card";
      else if (type === "subst") type = "Substitution";
      else if (detail.toLowerCase().includes("on target")) type = "Shot On Target";
      else if (detail.toLowerCase().includes("off target")) type = "Shot Off Target";
      else if (type === "Var") type = "VAR";

      return {
        id: `ev-${index}`,
        minute: effectiveMinute,
        type,
        detail: ev.detail ?? "",
        team: side,
        player: ev.player?.name ?? null,
        assist: ev.assist?.name ?? null,
        half: minute <= 45 ? 1 : 2,
      };
    })
    .filter((ev) => ev.minute >= 0)
    .sort((a, b) => a.minute - b.minute);
}

// ---------------------------------------------------------------------------
// Hook: fetch fixture metadata + events
// ---------------------------------------------------------------------------

function useMatchReplayData(matchId) {
  const [state, setState] = useState({
    loading: true,
    events: [],
    homeTeam: "",
    awayTeam: "",
    score: "",
    competition: "",
    venue: "",
    date: "",
    error: null,
  });

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      apiClient.get(`/api/fixtures/${matchId}`).catch(() => null),
      apiClient.get(`/api/fixtures/${matchId}/events`).catch(() => null),
    ]).then(([fixtureData, eventsData]) => {
      if (cancelled) return;

      const fix = Array.isArray(fixtureData?.response) ? fixtureData.response[0] : fixtureData?.response;
      const homeTeam = fix?.teams?.home?.name ?? "Home";
      const awayTeam = fix?.teams?.away?.name ?? "Away";
      const hg = fix?.goals?.home ?? 0;
      const ag = fix?.goals?.away ?? 0;
      const score = `${homeTeam} ${hg} - ${ag} ${awayTeam}`;
      const competition = fix?.league?.name ?? "";
      const venue = fix?.fixture?.venue?.name ?? "";
      const date = fix?.fixture?.date
        ? new Date(fix.fixture.date).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
        : "";

      const rawEvents = Array.isArray(eventsData?.response) ? eventsData.response : [];
      const events = normalizeEvents(rawEvents, homeTeam);

      setState({ loading: false, events, homeTeam, awayTeam, score, competition, venue, date, error: null });
    }).catch((err) => {
      if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
    });

    return () => { cancelled = true; };
  }, [matchId]);

  return state;
}

// ---------------------------------------------------------------------------
// Event log label
// ---------------------------------------------------------------------------

function eventLabel(event) {
  const parts = [event.type];
  if (event.detail && event.detail !== event.type) parts.push(event.detail);
  if (event.assist) parts.push(`Assist: ${event.assist}`);
  return parts.join(" • ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReplayPage() {
  const { matchId } = useParams();
  const matchData = useMatchReplayData(matchId);
  const replay = useReplay(matchData.events);

  if (matchData.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-accent)]" />
        <p className="ml-3 text-sm text-[color:var(--color-text-muted)]">Loading match replay…</p>
      </div>
    );
  }

  if (matchData.error) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-rose-300">Failed to load match: {matchData.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel grid gap-6 p-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">Historical replay</p>
              <h1 className="mt-2 text-3xl font-semibold">{matchData.score}</h1>
              {matchData.date && (
                <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{matchData.date}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {matchData.competition && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  {matchData.competition}
                </span>
              )}
              {matchData.venue && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  {matchData.venue}
                </span>
              )}
            </div>
          </div>

          {matchData.events.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-white/10">
              <p className="text-sm text-[color:var(--color-text-muted)]">No event data available for this match.</p>
            </div>
          ) : (
            <FootballPitch
              events={replay.visibleEvents}
              ballPosition={replay.ballPosition}
              previousBallPosition={replay.previousBallPosition}
              ballMotion={replay.ballMotion}
              ballAnimationKey={replay.ballAnimationKey}
              halfTime={replay.halfTime}
            />
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel-muted p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Replay clock</p>
            <p className="mt-2 text-3xl font-semibold text-white">{Math.floor(replay.minute)}&apos;</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              {matchData.homeTeam} vs {matchData.awayTeam}
            </p>
          </div>

          <div className="panel-muted p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Event log</p>
            <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {replay.eventLog.length ? (
                replay.eventLog.map((event) => (
                  <div
                    key={event.replayId ?? event.id}
                    className={`rounded-2xl border px-4 py-3 transition ${
                      replay.activeEventIds?.includes(event.replayId ?? event.id)
                        ? "border-[color:var(--color-accent)]/40 bg-amber-400/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{event.player ?? "Match event"}</p>
                      <span className="text-xs uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                        {Math.floor(event.minute)}&apos;
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{eventLabel(event)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                      {event.team === "home" ? matchData.homeTeam : matchData.awayTeam}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[color:var(--color-text-muted)]">
                  Start playback or scrub forward to reveal events.
                </p>
              )}
            </div>
          </div>
        </aside>
      </section>

      <ReplayControls
        minute={replay.minute}
        maxMinute={replay.maxMinute}
        isPlaying={replay.isPlaying}
        speed={replay.speed}
        onTogglePlay={() => replay.setIsPlaying(!replay.isPlaying)}
        onMinuteChange={replay.setMinute}
        onSpeedChange={replay.setSpeed}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel-muted flex items-start gap-3 p-4">
          <Clock3 className="mt-1 h-4 w-4 text-[color:var(--color-accent)]" />
          <div>
            <p className="text-sm font-medium text-white">Scrub any minute</p>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              The event log and pitch state stay synchronised with the replay clock.
            </p>
          </div>
        </div>
        <div className="panel-muted flex items-start gap-3 p-4">
          <Flag className="mt-1 h-4 w-4 text-[color:var(--color-accent)]" />
          <div>
            <p className="text-sm font-medium text-white">Approximate pitch positions</p>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Historical events resolve to deterministic replay coordinates when source x/y data is missing.
            </p>
          </div>
        </div>
        <div className="panel-muted flex items-start gap-3 p-4">
          <ShieldAlert className="mt-1 h-4 w-4 text-[color:var(--color-accent)]" />
          <div>
            <p className="text-sm font-medium text-white">Pulse on key moments</p>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Freshly crossed events pulse on the pitch and in the log for three seconds.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
