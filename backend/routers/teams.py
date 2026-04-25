import asyncio
import re

from fastapi import APIRouter, Depends, Query

from services.api_football import APIFootballService
from services.dependencies import get_api_football_service


router = APIRouter(prefix="/api/teams", tags=["teams"])

# ---------------------------------------------------------------------------
# Alias expansion — maps common abbreviations / partial names to the terms
# the API-Football search endpoint actually matches on.
# Each entry is (pattern, [canonical_searches]).
# ---------------------------------------------------------------------------
_ALIAS_TABLE: list[tuple[re.Pattern, list[str]]] = [
    # Prefixes that add nothing: strip "FC", "AFC", "CF", "SC", "AC", "AS",
    # "SD", "RCD", "CD", "UD" so the core name is always tried bare.
    (re.compile(r"^(fc|afc|cf|sc|ac|as|sd|rcd|cd|ud)\s+(.+)$", re.I), [r"\2", r"\1 \2"]),
    (re.compile(r"^(.+)\s+(fc|afc|cf|sc|ac)$", re.I), [r"\1", r"\1 \2"]),

    # Popular short-form aliases → canonical API names
    (re.compile(r"^man\s*city$", re.I), ["Manchester City"]),
    (re.compile(r"^man\s*utd?\.?$", re.I), ["Manchester United"]),
    (re.compile(r"^man\s*united$", re.I), ["Manchester United"]),
    (re.compile(r"^spurs$", re.I), ["Tottenham"]),
    (re.compile(r"^tottenham$", re.I), ["Tottenham Hotspur"]),
    (re.compile(r"^barca$", re.I), ["Barcelona"]),
    (re.compile(r"^barcelona$", re.I), ["FC Barcelona", "Barcelona"]),
    (re.compile(r"^fc\s*barcelona$", re.I), ["Barcelona"]),
    (re.compile(r"^real\s*madrid$", re.I), ["Real Madrid"]),
    (re.compile(r"^atletico$", re.I), ["Atletico Madrid"]),
    (re.compile(r"^atl[eé]tico\s*madrid$", re.I), ["Atletico Madrid"]),
    (re.compile(r"^atletico\s*de\s*madrid$", re.I), ["Atletico Madrid"]),
    (re.compile(r"^inter$", re.I), ["Inter Milan", "Inter"]),
    (re.compile(r"^inter\s*milan$", re.I), ["Inter", "Inter Milan"]),
    (re.compile(r"^ac\s*milan$", re.I), ["Milan", "AC Milan"]),
    (re.compile(r"^milan$", re.I), ["Milan", "AC Milan"]),
    (re.compile(r"^juventus$", re.I), ["Juventus"]),
    (re.compile(r"^juve$", re.I), ["Juventus"]),
    (re.compile(r"^psg$", re.I), ["Paris Saint-Germain", "Paris SG"]),
    (re.compile(r"^paris\s*(saint.germain|sg)?$", re.I), ["Paris Saint-Germain", "Paris SG"]),
    (re.compile(r"^bayern$", re.I), ["Bayern Munich", "Bayern"]),
    (re.compile(r"^bvb$", re.I), ["Dortmund"]),
    (re.compile(r"^dortmund$", re.I), ["Borussia Dortmund", "Dortmund"]),
    (re.compile(r"^borussia\s*dortmund$", re.I), ["Dortmund"]),
    (re.compile(r"^borussia\s*m[oö]nchengladbach$", re.I), ["Borussia M'gladbach", "Monchengladbach"]),
    (re.compile(r"^gladbach$", re.I), ["Borussia M'gladbach"]),
    (re.compile(r"^ajax$", re.I), ["Ajax"]),
    (re.compile(r"^benfica$", re.I), ["Benfica", "SL Benfica"]),
    (re.compile(r"^sporting\s*(cp|lisbon)?$", re.I), ["Sporting CP", "Sporting"]),
    (re.compile(r"^porto$", re.I), ["FC Porto", "Porto"]),
    (re.compile(r"^celtic$", re.I), ["Celtic"]),
    (re.compile(r"^rangers$", re.I), ["Rangers"]),
    (re.compile(r"^arsenal$", re.I), ["Arsenal"]),
    (re.compile(r"^chelsea$", re.I), ["Chelsea"]),
    (re.compile(r"^liverpool$", re.I), ["Liverpool"]),
    (re.compile(r"^newcastle$", re.I), ["Newcastle United", "Newcastle"]),
    (re.compile(r"^west\s*ham$", re.I), ["West Ham United", "West Ham"]),
    (re.compile(r"^wolves$", re.I), ["Wolverhampton", "Wolves"]),
    (re.compile(r"^wolverhampton$", re.I), ["Wolverhampton Wanderers", "Wolverhampton"]),
    (re.compile(r"^villa$", re.I), ["Aston Villa"]),
    (re.compile(r"^aston\s*villa$", re.I), ["Aston Villa"]),
    (re.compile(r"^leicester$", re.I), ["Leicester City", "Leicester"]),
    (re.compile(r"^brighton$", re.I), ["Brighton"]),
    (re.compile(r"^everton$", re.I), ["Everton"]),
    (re.compile(r"^nottm?\s*forest$", re.I), ["Nottingham Forest", "Nottm Forest"]),
    (re.compile(r"^forest$", re.I), ["Nottingham Forest"]),
    (re.compile(r"^brentford$", re.I), ["Brentford"]),
    (re.compile(r"^fulham$", re.I), ["Fulham"]),
    (re.compile(r"^crystal\s*palace$", re.I), ["Crystal Palace"]),
    (re.compile(r"^sevilla$", re.I), ["Sevilla"]),
    (re.compile(r"^valencia$", re.I), ["Valencia"]),
    (re.compile(r"^villarreal$", re.I), ["Villarreal"]),
    (re.compile(r"^real\s*sociedad$", re.I), ["Real Sociedad"]),
    (re.compile(r"^bilbao$", re.I), ["Athletic Club", "Athletic Bilbao"]),
    (re.compile(r"^athletic\s*(club|bilbao)?$", re.I), ["Athletic Club", "Athletic Bilbao"]),
    (re.compile(r"^osasuna$", re.I), ["Osasuna"]),
    (re.compile(r"^napoli$", re.I), ["Napoli", "SSC Napoli"]),
    (re.compile(r"^roma$", re.I), ["Roma", "AS Roma"]),
    (re.compile(r"^lazio$", re.I), ["Lazio", "SS Lazio"]),
    (re.compile(r"^fiorentina$", re.I), ["Fiorentina"]),
    (re.compile(r"^atalanta$", re.I), ["Atalanta"]),
    (re.compile(r"^torino$", re.I), ["Torino"]),
    (re.compile(r"^monaco$", re.I), ["Monaco", "AS Monaco"]),
    (re.compile(r"^lyon$", re.I), ["Lyon", "Olympique Lyonnais"]),
    (re.compile(r"^marseille$", re.I), ["Marseille", "Olympique de Marseille"]),
    (re.compile(r"^lille$", re.I), ["Lille"]),
    (re.compile(r"^nice$", re.I), ["Nice", "OGC Nice"]),
    (re.compile(r"^rennes$", re.I), ["Rennes", "Stade Rennais"]),
    (re.compile(r"^rb\s*leipzig$", re.I), ["RB Leipzig", "Leipzig"]),
    (re.compile(r"^leipzig$", re.I), ["RB Leipzig", "Leipzig"]),
    (re.compile(r"^leverkusen$", re.I), ["Bayer Leverkusen", "Leverkusen"]),
    (re.compile(r"^bayer\s*leverkusen$", re.I), ["Leverkusen"]),
    (re.compile(r"^schalke$", re.I), ["Schalke"]),
    (re.compile(r"^hoffenheim$", re.I), ["Hoffenheim", "TSG Hoffenheim"]),
    (re.compile(r"^eintracht(\s*frankfurt)?$", re.I), ["Eintracht Frankfurt"]),
    (re.compile(r"^frankfurt$", re.I), ["Eintracht Frankfurt"]),
    (re.compile(r"^freiburg$", re.I), ["Freiburg", "SC Freiburg"]),
    (re.compile(r"^wolfsburg$", re.I), ["Wolfsburg", "VfL Wolfsburg"]),
    (re.compile(r"^stuttgart$", re.I), ["Stuttgart", "VfB Stuttgart"]),
    (re.compile(r"^hertha$", re.I), ["Hertha Berlin", "Hertha"]),
    (re.compile(r"^hamburg$", re.I), ["Hamburg", "Hamburger SV"]),
    (re.compile(r"^galatasaray$", re.I), ["Galatasaray"]),
    (re.compile(r"^fenerbahce$", re.I), ["Fenerbahce"]),
    (re.compile(r"^besiktas$", re.I), ["Besiktas"]),
    (re.compile(r"^porto$", re.I), ["Porto", "FC Porto"]),
    (re.compile(r"^braga$", re.I), ["Braga", "SC Braga"]),
]


def _expand_query(query: str) -> list[str]:
    """Return a deduplicated list of search terms to try for the given query."""
    q = query.strip()
    terms: list[str] = [q]

    for pattern, replacements in _ALIAS_TABLE:
        match = pattern.fullmatch(q)
        if match:
            for replacement in replacements:
                # Support back-references like r"\1", r"\2"
                try:
                    expanded = match.expand(replacement)
                except re.error:
                    expanded = replacement
                if expanded and expanded not in terms:
                    terms.append(expanded)

    # Always also try stripping common prefixes/suffixes if not already covered
    for prefix in ("FC ", "AFC ", "CF ", "SC ", "AC ", "AS ", "SD ", "CD ", "UD ", "RCD "):
        if q.upper().startswith(prefix.upper()) and q[len(prefix):] not in terms:
            terms.append(q[len(prefix):])
    for suffix in (" FC", " AFC", " CF", " SC", " AC"):
        if q.upper().endswith(suffix.upper()) and q[: -len(suffix)] not in terms:
            terms.append(q[: -len(suffix)])

    return terms


async def _search_single(service: APIFootballService, term: str, league: int | None, season: int | None, country: str | None) -> list[dict]:
    try:
        payload = await service.get_teams(search=term, league=league, season=season, country=country)
        return payload.get("response", []) if isinstance(payload, dict) else []
    except Exception:
        return []


@router.get("")
async def search_teams(
    search: str | None = None,
    league: int | None = None,
    season: int | None = None,
    country: str | None = None,
    service: APIFootballService = Depends(get_api_football_service),
):
    if not search or not search.strip():
        return await service.get_teams(league=league, season=season, country=country)

    terms = _expand_query(search.strip())

    results_per_term = await asyncio.gather(
        *[_search_single(service, term, league, season, country) for term in terms]
    )

    seen_ids: set[int] = set()
    merged: list[dict] = []
    for results in results_per_term:
        for item in results:
            team_id = item.get("team", {}).get("id") or item.get("id")
            if team_id and team_id not in seen_ids:
                seen_ids.add(team_id)
                merged.append(item)

    return {"response": merged, "results": len(merged), "errors": []}


@router.get("/{team_id}")
async def team_detail(
    team_id: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_team_information(team_id)


@router.get("/{team_id}/statistics")
async def team_statistics(
    team_id: int,
    league_id: int,
    season: int,
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_team_statistics(
        league_id=league_id,
        season=season,
        team_id=team_id,
    )


@router.get("/{team_id}/fixtures")
async def team_fixtures(
    team_id: int,
    season: int | None = None,
    league_id: int | None = None,
    status: str | None = None,
    last: int | None = Query(default=None, ge=1, le=50),
    next: int | None = Query(default=None, ge=1, le=50),
    service: APIFootballService = Depends(get_api_football_service),
):
    return await service.get_fixtures(
        team=team_id,
        season=season,
        league=league_id,
        status=status,
        last=last,
        next=next,
    )
