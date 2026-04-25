const EVENT_WEIGHTS = {
  goal: 20,
  shot_on_target: 5,
  shot_off_target: 2,
  corner: 3,
  dangerous_attack: 1,
};

function normalizeEventType(type = "", detail = "") {
  const label = `${type} ${detail}`.toLowerCase();

  if (label.includes("goal")) return "goal";
  if (label.includes("shot on")) return "shot_on_target";
  if (label.includes("shot off")) return "shot_off_target";
  if (label.includes("corner")) return "corner";
  if (label.includes("dangerous")) return "dangerous_attack";

  return null;
}

export function calculateMomentum(events = [], currentMinute = 0) {
  const windowStart = Math.max(0, currentMinute - 15);

  const totals = events.reduce(
    (accumulator, event) => {
      const type = normalizeEventType(event.type, event.detail);
      const minute = Number(event.minute ?? 0);

      if (!type || minute < windowStart || minute > currentMinute) {
        return accumulator;
      }

      const weight = EVENT_WEIGHTS[type];
      const side = event.team === "away" ? "away" : "home";
      accumulator[side] += weight;
      return accumulator;
    },
    { home: 0, away: 0 },
  );

  const value = ((totals.home - totals.away) / (totals.home + totals.away + 1)) * 100;

  return {
    value,
    home: totals.home,
    away: totals.away,
    dominantSide: value > 20 ? "home" : value < -20 ? "away" : null,
  };
}
