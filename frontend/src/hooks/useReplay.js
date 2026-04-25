import { useEffect, useMemo, useRef, useState } from "react";

import { approximateEventPosition } from "../lib/eventPositions";

export function useReplay(events = []) {
  const processedEvents = useMemo(
    () =>
      [...events]
        .map((event, index) => ({
          ...event,
          replayId: event.id ?? `${event.type}-${event.minute}-${index}`,
          position:
            event.x !== undefined && event.y !== undefined
              ? { x: event.x, y: event.y }
              : approximateEventPosition(event),
        }))
        .sort((left, right) => {
          const leftMinute = Number(left.minute ?? 0);
          const rightMinute = Number(right.minute ?? 0);

          if (leftMinute === rightMinute) {
            return String(left.replayId).localeCompare(String(right.replayId));
          }

          return leftMinute - rightMinute;
        }),
    [events],
  );

  const maxMinute = useMemo(() => {
    const lastEventMinute = processedEvents.length ? Number(processedEvents[processedEvents.length - 1].minute ?? 90) : 90;
    return Math.max(95, Math.ceil(lastEventMinute));
  }, [processedEvents]);

  const [minute, setMinute] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [highlightedEventIds, setHighlightedEventIds] = useState([]);
  const [ballState, setBallState] = useState({
    previousPosition: { x: 0.5, y: 0.5 },
    position: { x: 0.5, y: 0.5 },
    motionType: "line",
    animationKey: "replay-origin",
  });
  const previousMinuteRef = useRef(0);
  const highlightTimeoutsRef = useRef([]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setMinute((currentMinute) => {
        if (currentMinute >= maxMinute) {
          return maxMinute;
        }

        return Math.min(maxMinute, currentMinute + speed * 0.5);
      });
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, maxMinute, speed]);

  useEffect(() => {
    if (minute >= maxMinute && isPlaying) {
      setIsPlaying(false);
    }
  }, [isPlaying, maxMinute, minute]);

  const visibleEvents = useMemo(
    () => processedEvents.filter((event) => Number(event.minute ?? 0) <= minute),
    [processedEvents, minute],
  );

  const eventLog = useMemo(() => [...visibleEvents].reverse(), [visibleEvents]);

  useEffect(() => {
    const previousMinute = previousMinuteRef.current;
    const crossedEvents = processedEvents.filter((event) => {
      const eventMinute = Number(event.minute ?? 0);
      return eventMinute > previousMinute && eventMinute <= minute;
    });

    const latestEvent = crossedEvents[crossedEvents.length - 1];
    const targetEvent = latestEvent ?? visibleEvents[visibleEvents.length - 1] ?? null;
    const nextPosition = targetEvent?.position ?? { x: 0.5, y: 0.5 };
    const nextMotionType = /goal|shot|corner/i.test(`${targetEvent?.type ?? ""} ${targetEvent?.detail ?? ""}`) ? "arc" : "line";

    setBallState((current) => ({
      previousPosition: current.position,
      position: nextPosition,
      motionType: targetEvent ? nextMotionType : "line",
      animationKey: targetEvent?.replayId ?? `minute-${Math.floor(minute)}`,
    }));

    if (crossedEvents.length) {
      const newIds = crossedEvents.map((event) => event.replayId);
      setHighlightedEventIds((current) => [...new Set([...current, ...newIds])]);

      newIds.forEach((eventId) => {
        const timeoutId = window.setTimeout(() => {
          setHighlightedEventIds((current) => current.filter((id) => id !== eventId));
        }, 3000);

        highlightTimeoutsRef.current.push(timeoutId);
      });
    }

    previousMinuteRef.current = minute;
  }, [minute, processedEvents, visibleEvents]);

  useEffect(
    () => () => {
      highlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      highlightTimeoutsRef.current = [];
    },
    [],
  );

  const decoratedVisibleEvents = useMemo(
    () =>
      visibleEvents.map((event) => ({
        ...event,
        id: event.replayId,
        x: event.position.x,
        y: event.position.y,
        isActive: highlightedEventIds.includes(event.replayId),
      })),
    [highlightedEventIds, visibleEvents],
  );

  function updateMinute(nextMinute) {
    previousMinuteRef.current = Math.min(previousMinuteRef.current, nextMinute);
    setMinute(Math.max(0, Math.min(maxMinute, nextMinute)));
  }

  return {
    minute,
    maxMinute,
    isPlaying,
    speed,
    visibleEvents: decoratedVisibleEvents,
    eventLog,
    activeEventIds: highlightedEventIds,
    ballPosition: ballState.position,
    previousBallPosition: ballState.previousPosition,
    ballMotion: ballState.motionType,
    ballAnimationKey: ballState.animationKey,
    halfTime: minute >= 46,
    setMinute: updateMinute,
    setIsPlaying,
    setSpeed,
  };
}
