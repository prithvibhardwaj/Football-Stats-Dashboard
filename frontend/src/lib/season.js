export function getCurrentSeasonYear(dateInput = new Date()) {
  const configuredSeason = Number(import.meta.env.VITE_DATA_SEASON);
  if (Number.isFinite(configuredSeason) && configuredSeason > 0) {
    return configuredSeason;
  }

  const date = new Date(dateInput);
  const monthIndex = date.getUTCMonth();
  const year = date.getUTCFullYear();

  return monthIndex >= 6 ? year : year - 1;
}

export function getSeasonLabel(season = getCurrentSeasonYear()) {
  return `${season}/${String(season + 1).slice(-2)}`;
}

export function isHistoricalSeason(season = getCurrentSeasonYear(), dateInput = new Date()) {
  const date = new Date(dateInput);
  const monthIndex = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const activeSeasonStart = monthIndex >= 6 ? year : year - 1;

  return season < activeSeasonStart;
}
