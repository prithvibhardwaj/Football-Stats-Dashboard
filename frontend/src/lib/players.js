import { apiClient } from "./api";
import { FALLBACK_LEAGUE_PRIORITY } from "./onboarding";
import { getCurrentSeasonYear } from "./season";

const DEFAULT_SEARCH_LEAGUES = FALLBACK_LEAGUE_PRIORITY.slice(0, 5).map((league) => league.id);
const leagueCatalogCache = new Map();
const leagueCatalogPromises = new Map();

function toNumber(value, fallback = 0) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePlayerStatItem(item) {
  const player = item.player ?? {};
  const stats = item.statistics?.[0] ?? {};
  const goals = stats.goals ?? {};
  const passes = stats.passes ?? {};
  const dribbles = stats.dribbles ?? {};
  const tackles = stats.tackles ?? {};
  const duels = stats.duels ?? {};
  const games = stats.games ?? {};

  return {
    id: player.id,
    name: player.name ?? "Unknown",
    firstname: player.firstname ?? "",
    lastname: player.lastname ?? "",
    age: player.age ?? null,
    nationality: player.nationality ?? "",
    photo: player.photo ?? null,
    position: games.position ?? player.position ?? "-",
    teamId: stats.team?.id ?? null,
    teamName: stats.team?.name ?? "",
    leagueId: stats.league?.id ?? null,
    leagueName: stats.league?.name ?? "",
    goals: toNumber(goals.total),
    assists: toNumber(goals.assists),
    appearances: toNumber(games.appearences),
    minutesPlayed: toNumber(games.minutes),
    rating: games.rating != null ? toNumber(games.rating) : null,
    keyPasses: toNumber(passes.key),
    passAccuracy: passes.accuracy != null ? toNumber(passes.accuracy) : null,
    dribbles: toNumber(dribbles.success),
    tackles: toNumber(tackles.total),
    interceptions: toNumber(tackles.interceptions),
    aerialsWon: toNumber(duels.won),
  };
}

const RADAR_CAPS = {
  Goals: 30,
  Assists: 20,
  "Key Passes": 80,
  Dribbles: 80,
  "Aerials Won": 160,
  Tackles: 120,
  Interceptions: 80,
  "Pass Accuracy": 100,
};

export function buildPlayerRawValues(player) {
  return {
    Goals: player.goals ?? 0,
    Assists: player.assists ?? 0,
    "Key Passes": player.keyPasses ?? 0,
    Dribbles: player.dribbles ?? 0,
    "Aerials Won": player.aerialsWon ?? 0,
    Tackles: player.tackles ?? 0,
    Interceptions: player.interceptions ?? 0,
    "Pass Accuracy": player.passAccuracy != null ? `${Math.round(player.passAccuracy)}%` : "-",
  };
}

export function buildPlayerRadarValues(player) {
  return {
    Goals: Math.min(100, Math.round((toNumber(player.goals) / RADAR_CAPS.Goals) * 100)),
    Assists: Math.min(100, Math.round((toNumber(player.assists) / RADAR_CAPS.Assists) * 100)),
    "Key Passes": Math.min(100, Math.round((toNumber(player.keyPasses) / RADAR_CAPS["Key Passes"]) * 100)),
    Dribbles: Math.min(100, Math.round((toNumber(player.dribbles) / RADAR_CAPS.Dribbles) * 100)),
    "Aerials Won": Math.min(100, Math.round((toNumber(player.aerialsWon) / RADAR_CAPS["Aerials Won"]) * 100)),
    Tackles: Math.min(100, Math.round((toNumber(player.tackles) / RADAR_CAPS.Tackles) * 100)),
    Interceptions: Math.min(100, Math.round((toNumber(player.interceptions) / RADAR_CAPS.Interceptions) * 100)),
    "Pass Accuracy": Math.min(100, Math.round(toNumber(player.passAccuracy))),
  };
}

export function buildComparablePlayer(item) {
  const normalized = normalizePlayerStatItem(item);
  return {
    ...normalized,
    values: buildPlayerRadarValues(normalized),
    raw: buildPlayerRawValues(normalized),
  };
}

export function scorePlayerImpact(player) {
  return (
    toNumber(player.goals) * 8 +
    toNumber(player.assists) * 6 +
    toNumber(player.keyPasses) * 0.18 +
    toNumber(player.dribbles) * 0.12 +
    toNumber(player.tackles) * 0.08 +
    toNumber(player.interceptions) * 0.1 +
    toNumber(player.aerialsWon) * 0.04 +
    toNumber(player.rating) * 5
  );
}

function mergePlayer(basePlayer, incomingPlayer) {
  if (!basePlayer) {
    return incomingPlayer;
  }

  const mergedRating = Math.max(toNumber(basePlayer.rating, -1), toNumber(incomingPlayer.rating, -1));

  return {
    ...basePlayer,
    ...incomingPlayer,
    goals: Math.max(toNumber(basePlayer.goals), toNumber(incomingPlayer.goals)),
    assists: Math.max(toNumber(basePlayer.assists), toNumber(incomingPlayer.assists)),
    appearances: Math.max(toNumber(basePlayer.appearances), toNumber(incomingPlayer.appearances)),
    minutesPlayed: Math.max(toNumber(basePlayer.minutesPlayed), toNumber(incomingPlayer.minutesPlayed)),
    rating: mergedRating >= 0 ? mergedRating : null,
    keyPasses: Math.max(toNumber(basePlayer.keyPasses), toNumber(incomingPlayer.keyPasses)),
    passAccuracy: Math.max(toNumber(basePlayer.passAccuracy), toNumber(incomingPlayer.passAccuracy)),
    dribbles: Math.max(toNumber(basePlayer.dribbles), toNumber(incomingPlayer.dribbles)),
    tackles: Math.max(toNumber(basePlayer.tackles), toNumber(incomingPlayer.tackles)),
    interceptions: Math.max(toNumber(basePlayer.interceptions), toNumber(incomingPlayer.interceptions)),
    aerialsWon: Math.max(toNumber(basePlayer.aerialsWon), toNumber(incomingPlayer.aerialsWon)),
  };
}

async function getLeaguePlayerCatalog(leagueId, season = getCurrentSeasonYear()) {
  const cacheKey = `${leagueId}:${season}`;
  if (leagueCatalogCache.has(cacheKey)) {
    return leagueCatalogCache.get(cacheKey);
  }

  if (!leagueCatalogPromises.has(cacheKey)) {
    const promise = Promise.all([
      apiClient.get(`/api/leagues/${leagueId}/top-scorers?season=${season}`).catch(() => null),
      apiClient.get(`/api/leagues/${leagueId}/top-assists?season=${season}`).catch(() => null),
    ])
      .then(([scorersPayload, assistsPayload]) => {
        const mergedPlayers = new Map();
        const entries = [
          ...(Array.isArray(scorersPayload?.response) ? scorersPayload.response : []),
          ...(Array.isArray(assistsPayload?.response) ? assistsPayload.response : []),
        ];

        entries.forEach((item) => {
          const comparable = buildComparablePlayer(item);
          if (!comparable.id) {
            return;
          }

          const existing = mergedPlayers.get(comparable.id);
          mergedPlayers.set(comparable.id, mergePlayer(existing, comparable));
        });

        const catalog = Array.from(mergedPlayers.values())
          .map((player) => ({
            ...player,
            values: buildPlayerRadarValues(player),
            raw: buildPlayerRawValues(player),
          }))
          .sort((left, right) => scorePlayerImpact(right) - scorePlayerImpact(left));

        leagueCatalogCache.set(cacheKey, catalog);
        return catalog;
      })
      .finally(() => {
        leagueCatalogPromises.delete(cacheKey);
      });

    leagueCatalogPromises.set(cacheKey, promise);
  }

  return leagueCatalogPromises.get(cacheKey);
}

export async function searchPlayersByName(query, leagueIds = [], season = getCurrentSeasonYear()) {
  const trimmedQuery = query.trim().toLowerCase();
  if (trimmedQuery.length < 3) {
    return [];
  }

  const searchLeagueIds = [...new Set((leagueIds.length ? leagueIds : DEFAULT_SEARCH_LEAGUES).filter(Boolean))].slice(0, 5);
  const catalogs = await Promise.all(searchLeagueIds.map((leagueId) => getLeaguePlayerCatalog(leagueId, season)));
  const mergedPlayers = new Map();

  catalogs.flat().forEach((player) => {
    if (!player?.id) {
      return;
    }

    const existing = mergedPlayers.get(player.id);
    mergedPlayers.set(player.id, mergePlayer(existing, player));
  });

  return Array.from(mergedPlayers.values())
    .filter((player) => player.name.toLowerCase().includes(trimmedQuery))
    .sort((left, right) => scorePlayerImpact(right) - scorePlayerImpact(left))
    .slice(0, 12);
}

export async function getTeamKeyPlayers(teamId, leagueId, season = getCurrentSeasonYear()) {
  if (!teamId || !leagueId) {
    return [];
  }

  const catalog = await getLeaguePlayerCatalog(leagueId, season);
  return catalog
    .filter((player) => Number(player.teamId) === Number(teamId))
    .sort((left, right) => scorePlayerImpact(right) - scorePlayerImpact(left))
    .slice(0, 8);
}
