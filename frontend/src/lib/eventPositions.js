function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function attackingDirection(team = "home", half = 1) {
  const switches = half > 1;
  if (team === "away") {
    return switches ? "right" : "left";
  }

  return switches ? "left" : "right";
}

export function approximateEventPosition(event) {
  const type = `${event.type || ""} ${event.detail || ""}`.toLowerCase();
  const half = Number(event.half ?? 1);
  const direction = attackingDirection(event.team, half);
  const goalX = direction === "right" ? 0.95 : 0.05;
  const boxEdgeX = direction === "right" ? 0.82 : 0.18;
  const midfieldX = direction === "right" ? 0.7 : 0.3;
  const foulSeed = Number(event.id || event.eventId || 1);

  if (type.includes("goal")) return { x: goalX, y: 0.5 };
  if (type.includes("shot on")) return { x: boxEdgeX, y: 0.5 };
  if (type.includes("shot off")) return { x: midfieldX, y: 0.5 };
  if (type.includes("corner")) {
    return { x: goalX, y: seededRandom(foulSeed) > 0.5 ? 0.95 : 0.05 };
  }
  if (type.includes("substitution")) return { x: 0.5, y: event.team === "away" ? 0.96 : 0.04 };
  if (type.includes("foul") || type.includes("yellow") || type.includes("red")) {
    return {
      x: event.team === "away" ? 0.25 + seededRandom(foulSeed) * 0.25 : 0.5 + seededRandom(foulSeed) * 0.25,
      y: 0.15 + seededRandom(foulSeed + 3) * 0.7,
    };
  }

  return { x: 0.5, y: 0.5 };
}
