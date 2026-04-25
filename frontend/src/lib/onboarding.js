import { apiClient } from "./api";
import { getCurrentSeasonYear } from "./season";
import { describeSavedTeamsSyncError, supabase } from "./supabase";

export const FALLBACK_LEAGUE_PRIORITY = [
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 78, name: "Bundesliga" },
  { id: 135, name: "Serie A" },
  { id: 61, name: "Ligue 1" },
  { id: 2, name: "UEFA Champions League" },
  { id: 88, name: "Eredivisie" },
  { id: 94, name: "Liga Portugal" },
  { id: 203, name: "Super Lig" },
  { id: 253, name: "MLS" },
  { id: 71, name: "Brasileirao" },
];

export const LEAGUE_NAME_BY_ID = FALLBACK_LEAGUE_PRIORITY.reduce((accumulator, league) => {
  accumulator[league.id] = league.name;
  return accumulator;
}, {});

let teamCatalogCache = null;
let teamCatalogPromise = null;

const SAVED_SELECTION_KEY_PREFIX = "footy-iq:saved-selection:";
const ONBOARDING_DRAFT_KEY_PREFIX = "footy-iq:onboarding-draft:";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorageJson(key) {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(key, value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local storage write failures and continue with in-memory state.
  }
}

function removeStorageItem(key) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore local storage cleanup failures.
  }
}

function getSavedSelectionKey(userId) {
  return `${SAVED_SELECTION_KEY_PREFIX}${userId}`;
}

function getOnboardingDraftKey(userId) {
  return `${ONBOARDING_DRAFT_KEY_PREFIX}${userId}`;
}

export function normalizePinnedTeam(team) {
  if (!team) {
    return null;
  }

  return {
    id: team.id ?? team.team_id,
    name: team.name ?? team.team_name,
    leagueId: team.leagueId ?? team.league_id,
    leagueName: team.leagueName ?? LEAGUE_NAME_BY_ID[team.leagueId ?? team.league_id] ?? "",
    country: team.country ?? "",
    logo: team.logo ?? null,
  };
}

export function getLeagueNameById(leagueId) {
  return LEAGUE_NAME_BY_ID[leagueId] ?? `League ${leagueId}`;
}

export function loadSavedSelection(userId) {
  if (!userId) {
    return null;
  }

  const payload = readStorageJson(getSavedSelectionKey(userId));
  const pinnedTeams = Array.isArray(payload?.pinnedTeams)
    ? payload.pinnedTeams.map(normalizePinnedTeam).filter(Boolean)
    : [];

  if (!pinnedTeams.length) {
    return null;
  }

  const leagueIds = Array.isArray(payload?.leagueIds) && payload.leagueIds.length
    ? payload.leagueIds
    : derivePreferredLeagueIds(pinnedTeams);

  return { pinnedTeams, leagueIds };
}

export function persistSavedSelection(userId, { pinnedTeams, leagueIds }) {
  if (!userId) {
    return;
  }

  const normalizedTeams = (Array.isArray(pinnedTeams) ? pinnedTeams : [])
    .map(normalizePinnedTeam)
    .filter(Boolean);

  if (!normalizedTeams.length) {
    removeStorageItem(getSavedSelectionKey(userId));
    return;
  }

  writeStorageJson(getSavedSelectionKey(userId), {
    pinnedTeams: normalizedTeams,
    leagueIds: Array.isArray(leagueIds) && leagueIds.length ? leagueIds : derivePreferredLeagueIds(normalizedTeams),
  });
}

export function loadOnboardingDraft(userId) {
  if (!userId) {
    return null;
  }

  const payload = readStorageJson(getOnboardingDraftKey(userId));
  const selectedTeams = Array.isArray(payload?.selectedTeams)
    ? payload.selectedTeams.slice(0, 3).map((team) => normalizePinnedTeam(team))
    : [];
  const searchQueries = Array.isArray(payload?.searchQueries)
    ? payload.searchQueries.slice(0, 3).map((query) => String(query ?? ""))
    : [];

  while (selectedTeams.length < 3) {
    selectedTeams.push(null);
  }

  while (searchQueries.length < 3) {
    searchQueries.push("");
  }

  const hasDraft = selectedTeams.some(Boolean) || searchQueries.some((query) => query.trim().length > 0);
  return hasDraft ? { selectedTeams, searchQueries } : null;
}

export function persistOnboardingDraft(userId, { selectedTeams, searchQueries }) {
  if (!userId) {
    return;
  }

  writeStorageJson(getOnboardingDraftKey(userId), {
    selectedTeams: (Array.isArray(selectedTeams) ? selectedTeams : [])
      .slice(0, 3)
      .map((team) => normalizePinnedTeam(team)),
    searchQueries: (Array.isArray(searchQueries) ? searchQueries : [])
      .slice(0, 3)
      .map((query) => String(query ?? "")),
  });
}

export function clearOnboardingDraft(userId) {
  if (!userId) {
    return;
  }

  removeStorageItem(getOnboardingDraftKey(userId));
}

const STRIP_PREFIXES = /^(fc|afc|cf|sc|ac|as|sd|rcd|cd|ud)\s+/i;
const STRIP_SUFFIXES = /\s+(fc|afc|cf|sc|ac)$/i;

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(STRIP_PREFIXES, "")
    .replace(STRIP_SUFFIXES, "")
    .trim();
}

function teamMatchesQuery(teamName, query) {
  const normalizedTeam = normalizeName(teamName);
  const normalizedQuery = normalizeName(query);

  if (normalizedTeam.includes(normalizedQuery) || normalizedQuery.includes(normalizedTeam)) {
    return true;
  }

  // Word-level: every word in the query appears somewhere in the team name
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 1);
  if (queryWords.length > 0 && queryWords.every((word) => normalizedTeam.includes(word))) {
    return true;
  }

  // Word-level reverse: every word in the team name appears in the query
  const teamWords = normalizedTeam.split(/\s+/).filter((w) => w.length > 1);
  if (teamWords.length > 0 && teamWords.every((word) => normalizedQuery.includes(word))) {
    return true;
  }

  return false;
}

function normalizeApiTeamResult(item) {
  const team = item.team ?? item;
  const league = item.league ?? null;
  if (!team?.id) return null;
  return {
    id: team.id,
    name: team.name,
    logo: team.logo ?? null,
    country: team.country ?? league?.country ?? "",
    leagueId: league?.id ?? null,
    leagueName: league?.name ?? "",
    season: league?.season ?? null,
  };
}

export async function searchTeams(query) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  // Always fire the live API search in parallel with the catalog lookup so
  // results are available even if the catalog hasn't loaded yet.
  let apiError = null;
  const [catalog, apiPayload] = await Promise.all([
    getFallbackTeamCatalog().catch(() => []),
    apiClient
      .get(`/api/teams?search=${encodeURIComponent(trimmedQuery)}`)
      .catch((err) => { apiError = err; return null; }),
  ]);

  const catalogMatches = catalog
    .filter((team) => teamMatchesQuery(team.name, trimmedQuery))
    .slice(0, 20);

  const apiResults = Array.isArray(apiPayload?.response)
    ? apiPayload.response.map(normalizeApiTeamResult).filter(Boolean)
    : [];

  // Merge: catalog matches first, then any API results not already present.
  const seen = new Set(catalogMatches.map((t) => t.id));
  const merged = [
    ...catalogMatches,
    ...apiResults.filter((t) => !seen.has(t.id)),
  ];

  if (merged.length === 0 && apiError) {
    throw new Error("Could not reach the backend. Make sure VITE_API_BASE_URL points to a running server.");
  }

  return merged.slice(0, 20);
}

async function getFallbackTeamCatalog() {
  if (teamCatalogCache) {
    return teamCatalogCache;
  }

  if (!teamCatalogPromise) {
    const season = getCurrentSeasonYear();
    teamCatalogPromise = Promise.all(
      FALLBACK_LEAGUE_PRIORITY.map((league) =>
        apiClient.get(`/api/leagues/${league.id}/standings?season=${season}`).catch(() => null),
      ),
    )
      .then((payloads) => {
        const catalogByTeamId = new Map();

        payloads.forEach((payload, index) => {
          const league = FALLBACK_LEAGUE_PRIORITY[index];
          const rows = payload?.response?.[0]?.league?.standings?.[0];
          if (!Array.isArray(rows)) {
            return;
          }

          rows.forEach((row) => {
            const team = row.team ?? {};
            if (!team.id || catalogByTeamId.has(team.id)) {
              return;
            }

            catalogByTeamId.set(team.id, {
              id: team.id,
              name: team.name ?? "Unknown team",
              logo: team.logo ?? null,
              country: payload?.response?.[0]?.league?.country ?? "",
              leagueId: league.id,
              leagueName: league.name,
              season,
            });
          });
        });

        teamCatalogCache = Array.from(catalogByTeamId.values()).sort((left, right) => left.name.localeCompare(right.name));
        return teamCatalogCache;
      })
      .finally(() => {
        teamCatalogPromise = null;
      });
  }

  return teamCatalogPromise;
}

async function resolveTeamLeague(team) {
  const normalizedTeam = normalizePinnedTeam(team);
  if (!normalizedTeam?.id) {
    throw new Error("Selected team is missing an id.");
  }

  if (normalizedTeam.leagueId) {
    return normalizedTeam;
  }

  const season = getCurrentSeasonYear();
  const fixturePayload = await apiClient.get(`/api/teams/${normalizedTeam.id}/fixtures?season=${season}`).catch(() => null);
  const fixtures = Array.isArray(fixturePayload?.response) ? fixturePayload.response : [];
  const league = fixtures[0]?.league ?? null;

  if (!league?.id) {
    throw new Error(`Could not determine the current league for ${normalizedTeam.name}.`);
  }

  return {
    ...normalizedTeam,
    leagueId: league.id,
    leagueName: league.name ?? getLeagueNameById(league.id),
    country: normalizedTeam.country || league.country || "",
  };
}

export function derivePreferredLeagueIds(selectedTeams) {
  const selectedLeagueIds = selectedTeams.map((team) => normalizePinnedTeam(team)?.leagueId).filter(Boolean);
  const uniqueLeagueIds = [...new Set(selectedLeagueIds)];

  for (const league of FALLBACK_LEAGUE_PRIORITY) {
    if (!uniqueLeagueIds.includes(league.id)) {
      uniqueLeagueIds.push(league.id);
    }

    if (uniqueLeagueIds.length >= 8) {
      break;
    }
  }

  return uniqueLeagueIds;
}

export async function saveOnboardingSelection({ userId, selectedTeams }) {
  const normalizedTeams = await Promise.all(
    selectedTeams.map((team) => resolveTeamLeague(team)),
  );
  const leagueIds = derivePreferredLeagueIds(normalizedTeams);
  persistSavedSelection(userId, { pinnedTeams: normalizedTeams, leagueIds });
  clearOnboardingDraft(userId);

  if (!supabase) {
    return {
      pinnedTeams: normalizedTeams,
      leagueIds,
      authError: "Supabase is not configured, so pinned teams are saved only on this device.",
    };
  }

  try {
    const { error: deleteTeamsError } = await supabase.from("user_teams").delete().eq("user_id", userId);

    if (deleteTeamsError) {
      throw deleteTeamsError;
    }

    const { error: insertTeamsError } = await supabase.from("user_teams").insert(
      normalizedTeams.map((team) => ({
        user_id: userId,
        team_id: team.id,
        team_name: team.name,
        league_id: team.leagueId,
      })),
    );

    if (insertTeamsError) {
      throw insertTeamsError;
    }

    const { error: preferencesError } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        league_ids: leagueIds,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    );

    if (preferencesError) {
      throw preferencesError;
    }
  } catch (error) {
    return {
      pinnedTeams: normalizedTeams,
      leagueIds,
      authError: describeSavedTeamsSyncError(error),
    };
  }

  return {
    pinnedTeams: normalizedTeams,
    leagueIds,
    authError: null,
  };
}
