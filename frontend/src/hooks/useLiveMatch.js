import { useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../lib/api";
import { approximateEventPosition } from "../lib/eventPositions";

function parseStatisticValue(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      return Number(trimmed.replace("%", ""));
    }

    return Number(trimmed);
  }

  return 0;
}

function pickStatistic(statistics = [], label) {
  const match = statistics.find((item) => item.type?.toLowerCase() === label.toLowerCase());
  return parseStatisticValue(match?.value ?? 0);
}

function normalizeLiveStatistics(payload) {
  const response = Array.isArray(payload?.response) ? payload.response : [];
  const home = response[0];
  const away = response[1];

  return {
    homePossession: pickStatistic(home?.statistics, "Ball Possession"),
    awayPossession: pickStatistic(away?.statistics, "Ball Possession"),
    homeShots: pickStatistic(home?.statistics, "Total Shots"),
    awayShots: pickStatistic(away?.statistics, "Total Shots"),
    homeCorners: pickStatistic(home?.statistics, "Corner Kicks"),
    awayCorners: pickStatistic(away?.statistics, "Corner Kicks"),
    homeYellowCards: pickStatistic(home?.statistics, "Yellow Cards"),
    awayYellowCards: pickStatistic(away?.statistics, "Yellow Cards"),
    homeRedCards: pickStatistic(home?.statistics, "Red Cards"),
    awayRedCards: pickStatistic(away?.statistics, "Red Cards"),
  };
}

function normalizeFixture(payload, fixtureId) {
  const fixture = payload?.response?.[0];

  if (!fixture) {
    return null;
  }

  return {
    id: fixture.fixture?.id ?? Number(fixtureId),
    homeTeam: fixture.teams?.home?.name ?? "Home Team",
    awayTeam: fixture.teams?.away?.name ?? "Away Team",
    kickoff: fixture.fixture?.date ?? "Live",
    venue: fixture.fixture?.venue?.name ?? "Unknown venue",
    refereeName: fixture.fixture?.referee ?? null,
    status: fixture.fixture?.status?.short ?? "LIVE",
    currentMinute: Number(fixture.fixture?.status?.elapsed ?? 0),
    scoreline: `${fixture.goals?.home ?? 0} - ${fixture.goals?.away ?? 0}`,
  };
}

function normalizeEvent(payloadEvent, index, fixtureResponse) {
  const teamName = payloadEvent.team?.name ?? payloadEvent.team ?? "";
  const homeName = fixtureResponse?.teams?.home?.name ?? "";
  const awayName = fixtureResponse?.teams?.away?.name ?? "";
  const teamSide =
    teamName && awayName && teamName.toLowerCase() === awayName.toLowerCase()
      ? "away"
      : teamName && homeName && teamName.toLowerCase() === homeName.toLowerCase()
        ? "home"
        : "home";

  return {
    id: payloadEvent.id ?? payloadEvent.time?.elapsed ?? index,
    minute: Number(payloadEvent.time?.elapsed ?? payloadEvent.minute ?? 0),
    extraMinute: Number(payloadEvent.time?.extra ?? payloadEvent.extraMinute ?? 0),
    type: payloadEvent.type ?? "Event",
    detail: payloadEvent.detail ?? "",
    comments: payloadEvent.comments ?? "",
    player: payloadEvent.player?.name ?? payloadEvent.player ?? "Unknown",
    team: teamSide,
    half: Number(payloadEvent.time?.elapsed ?? 0) >= 46 ? 2 : 1,
  };
}

function liveBallMotionForEvent(event) {
  return /goal|shot|corner/i.test(`${event?.type ?? ""} ${event?.detail ?? ""}`) ? "arc" : "line";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextPossessionStep(position, minute, statistics) {
  const homePossession = statistics.homePossession || 50;
  const awayPossession = statistics.awayPossession || 50;
  const homeHasBall = Math.random() * (homePossession + awayPossession || 100) < homePossession;
  const firstHalf = minute < 46;
  const homeDirection = firstHalf ? 1 : -1;
  const awayDirection = -homeDirection;
  const direction = homeHasBall ? homeDirection : awayDirection;
  const horizontalBias = Math.random() < 0.6 ? direction : -direction;
  const xStep = 0.03 * horizontalBias;
  const yStep = (Math.random() - 0.5) * 0.045;

  return {
    x: clamp(position.x + xStep, 0.04, 0.96),
    y: clamp(position.y + yStep, 0.06, 0.94),
  };
}

export function useLiveMatch(fixtureId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(fixtureId));
  const [error, setError] = useState(null);
  const [ballState, setBallState] = useState({
    previousPosition: { x: 0.5, y: 0.5 },
    position: { x: 0.5, y: 0.5 },
    motionType: "line",
    animationKey: "live-origin",
  });
  const [activeEventId, setActiveEventId] = useState(null);
  const latestEventIdRef = useRef(null);
  const activeEventTimeoutRef = useRef(null);

  useEffect(() => {
    if (!fixtureId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function fetchLiveMatch() {
      try {
        setLoading(true);
        const [fixture, events, statistics] = await Promise.all([
          apiClient.get(`/api/fixtures/${fixtureId}`),
          apiClient.get(`/api/fixtures/${fixtureId}/events`).catch(() => null),
          apiClient.get(`/api/fixtures/${fixtureId}/statistics`).catch(() => null),
        ]);

        if (!cancelled) {
          setData({ fixture, events, statistics });
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

    fetchLiveMatch();
    const intervalId = window.setInterval(fetchLiveMatch, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [fixtureId]);

  const match = useMemo(() => normalizeFixture(data?.fixture, fixtureId), [data?.fixture, fixtureId]);
  const liveStatistics = useMemo(() => normalizeLiveStatistics(data?.statistics), [data?.statistics]);
  const normalizedEvents = useMemo(
    () =>
      (Array.isArray(data?.events?.response) ? data.events.response : []).map((event, index) => {
        const normalized = normalizeEvent(event, index, data?.fixture?.response?.[0]);
        return {
          ...normalized,
          position: approximateEventPosition(normalized),
        };
      }),
    [data?.events, data?.fixture],
  );

  useEffect(() => {
    const latestEvent = normalizedEvents[normalizedEvents.length - 1];

    if (!latestEvent) {
      return;
    }

    if (latestEventIdRef.current === latestEvent.id) {
      return;
    }

    latestEventIdRef.current = latestEvent.id;
    setBallState((current) => ({
      previousPosition: current.position,
      position: latestEvent.position,
      motionType: liveBallMotionForEvent(latestEvent),
      animationKey: `event-${latestEvent.id}`,
    }));
    setActiveEventId(latestEvent.id);

    if (activeEventTimeoutRef.current) {
      window.clearTimeout(activeEventTimeoutRef.current);
    }

    activeEventTimeoutRef.current = window.setTimeout(() => {
      setActiveEventId(null);
    }, 3000);
  }, [normalizedEvents]);

  useEffect(() => {
    if (!match) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setBallState((current) => {
        const nextPosition = nextPossessionStep(current.position, match.currentMinute, liveStatistics);
        return {
          previousPosition: current.position,
          position: nextPosition,
          motionType: "line",
          animationKey: `walk-${Date.now()}`,
        };
      });
    }, 500);

    return () => {
      window.clearInterval(intervalId);
      if (activeEventTimeoutRef.current) {
        window.clearTimeout(activeEventTimeoutRef.current);
      }
    };
  }, [liveStatistics, match]);

  const decoratedEvents = useMemo(
    () =>
      normalizedEvents.map((event) => ({
        ...event,
        x: event.position.x,
        y: event.position.y,
        isActive: event.id === activeEventId,
      })),
    [activeEventId, normalizedEvents],
  );
  const eventLog = useMemo(() => [...decoratedEvents].reverse(), [decoratedEvents]);

  return {
    data,
    loading,
    error,
    match,
    liveStatistics,
    events: decoratedEvents,
    eventLog,
    ballPosition: ballState.position,
    previousBallPosition: ballState.previousPosition,
    ballMotion: ballState.motionType,
    ballAnimationKey: ballState.animationKey,
    halfTime: (match?.currentMinute ?? 0) >= 46,
  };
}
