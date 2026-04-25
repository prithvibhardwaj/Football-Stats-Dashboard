import { LogOut, Menu, Search, ShieldCheck, UserCircle2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { apiClient } from "../../lib/api";
import { getCurrentSeasonYear } from "../../lib/season";

import { normalizePinnedTeam, saveOnboardingSelection, searchTeams } from "../../lib/onboarding";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/useAuthStore";
import { Button } from "../ui/button";

const EMPTY_SLOTS = [null, null, null];

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const season = getCurrentSeasonYear();
        const [teamsData, playersData] = await Promise.all([
          apiClient.get(`/api/teams?search=${encodeURIComponent(trimmed)}`).catch(() => null),
          apiClient.get(`/api/players?search=${encodeURIComponent(trimmed)}&season=${season}`).catch(() => null),
        ]);

        const teams = (Array.isArray(teamsData?.response) ? teamsData.response : []).slice(0, 4).map((item) => ({
          type: "team",
          id: item.team?.id ?? item.id,
          label: item.team?.name ?? item.name ?? "",
          sub: item.league?.name ?? item.country ?? "",
        }));

        const players = (Array.isArray(playersData?.response) ? playersData.response : []).slice(0, 4).map((item) => ({
          type: "player",
          id: item.player?.id,
          label: item.player?.name ?? "",
          sub: item.statistics?.[0]?.team?.name ?? "",
        }));

        setResults([...teams, ...players].filter((r) => r.id && r.label));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  function handleSelect(result) {
    navigate(result.type === "team" ? `/team/${result.id}` : `/player/${result.id}`);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full md:w-[22rem]">
      <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
        <Search className="h-4 w-4 flex-shrink-0" />
        <input
          className="w-full bg-transparent text-white placeholder:text-[color:var(--color-text-muted)]"
          placeholder="Search teams, players, referees"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
      </label>

      {open && query.trim().length >= 3 && (
        <div className="panel-muted absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-white/10 p-2 shadow-xl">
          {loading ? (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">Searching…</div>
          ) : results.length ? (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="block w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                onClick={() => handleSelect(r)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{r.label}</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[color:var(--color-text-muted)]">
                    {r.type}
                  </span>
                </div>
                {r.sub && <p className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">{r.sub}</p>}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">No results found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSwitcherSlot({
  index,
  selectedTeam,
  query,
  isActive,
  results,
  loading,
  onActivate,
  onQueryChange,
  onSelectTeam,
  onClearTeam,
}) {
  const shouldShowResults =
    isActive &&
    query.trim().length >= 3 &&
    (!selectedTeam || query.trim().toLowerCase() !== selectedTeam.name.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Pinned team {index + 1}</p>
        {selectedTeam ? (
          <button type="button" className="text-xs text-[color:var(--color-text-muted)]" onClick={() => onClearTeam(index)}>
            Clear
          </button>
        ) : null}
      </div>
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <Search className="h-4 w-4 text-[color:var(--color-text-muted)]" />
        <input
          value={query}
          className="w-full bg-transparent text-sm text-white placeholder:text-[color:var(--color-text-muted)]"
          placeholder="Search teams"
          onFocus={() => onActivate(index)}
          onChange={(event) => onQueryChange(index, event.target.value)}
        />
      </label>
      {selectedTeam ? (
        <div className="panel-muted flex items-center justify-between gap-3 p-3">
          <div>
            <p className="text-sm font-medium text-white">{selectedTeam.name}</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{selectedTeam.leagueName}</p>
          </div>
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
        </div>
      ) : null}
      {shouldShowResults ? (
        <div className="panel-muted max-h-44 overflow-y-auto p-2">
          {loading ? (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">Searching...</div>
          ) : results.length ? (
            results.map((team) => (
              <button
                key={`${team.id}-${team.leagueId}`}
                type="button"
                className="block w-full rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                onClick={() => onSelectTeam(index, team)}
              >
                <p className="text-sm font-medium text-white">{team.name}</p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {team.leagueName} • {team.country}
                </p>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">No matching teams found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Navbar({ isSidebarCollapsed = false, onToggleSidebar = () => {} }) {
  const navigate = useNavigate();
  const { authError, logout, user, pinnedTeams, setPinnedTeams } = useAuthStore(useShallow((state) => ({
    authError: state.authError,
    logout: state.logout,
    user: state.user,
    pinnedTeams: state.pinnedTeams,
    setPinnedTeams: state.setPinnedTeams,
  })));

  const normalizedPinnedTeams = useMemo(
    () => pinnedTeams.map(normalizePinnedTeam).filter(Boolean),
    [pinnedTeams],
  );

  const [isTeamSwitcherOpen, setIsTeamSwitcherOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState(EMPTY_SLOTS);
  const [queries, setQueries] = useState(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const paddedTeams = [...normalizedPinnedTeams.slice(0, 3)];
    while (paddedTeams.length < 3) {
      paddedTeams.push(null);
    }

    setSelectedTeams(paddedTeams);
    setQueries(paddedTeams.map((team) => team?.name ?? ""));
  }, [normalizedPinnedTeams]);

  useEffect(() => {
    if (!isTeamSwitcherOpen) {
      return undefined;
    }

    const query = queries[activeSlot] ?? "";
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 3) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;
    setIsSearching(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const searchResults = await searchTeams(trimmedQuery);
        if (!cancelled) {
          setResults(
            searchResults.filter(
              (candidate) => !selectedTeams.some((team, slotIndex) => slotIndex !== activeSlot && team?.id === candidate.id),
            ),
          );
          setError("");
        }
      } catch (searchError) {
        if (!cancelled) {
          setError(searchError.message || "Team search failed.");
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeSlot, isTeamSwitcherOpen, queries, selectedTeams]);

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      logout();
    }
  }

  function handleQueryChange(slotIndex, value) {
    setActiveSlot(slotIndex);
    setQueries((current) => current.map((query, index) => (index === slotIndex ? value : query)));

    if (!value.trim()) {
      setSelectedTeams((current) => current.map((team, index) => (index === slotIndex ? null : team)));
    }
  }

  function handleSelectTeam(slotIndex, team) {
    setSelectedTeams((current) => current.map((entry, index) => (index === slotIndex ? team : entry)));
    setQueries((current) => current.map((query, index) => (index === slotIndex ? team.name : query)));
    setResults([]);
    setError("");
  }

  function handleClearTeam(slotIndex) {
    setSelectedTeams((current) => current.map((team, index) => (index === slotIndex ? null : team)));
    setQueries((current) => current.map((query, index) => (index === slotIndex ? "" : query)));
    setActiveSlot(slotIndex);
  }

  async function handleSaveTeamSwitch() {
    const completedSelection = selectedTeams.filter(Boolean);

    if (!user?.id) {
      setError("You need to be logged in to change pinned teams.");
      return;
    }

    if (completedSelection.length !== 3) {
      setError("Choose exactly 3 teams before saving.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const { pinnedTeams: savedTeams, leagueIds, authError: saveWarning } = await saveOnboardingSelection({
        userId: user.id,
        selectedTeams: completedSelection,
      });

      setPinnedTeams(savedTeams, leagueIds, saveWarning);
      setIsTeamSwitcherOpen(false);
      navigate("/dashboard");
    } catch (saveError) {
      setError(saveError.message || "Failed to update pinned teams.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <header className="relative z-40 flex flex-col gap-4 border-b border-white/10 bg-slate-950/40 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
      {authError && normalizedPinnedTeams.length === 0 ? (
        <div className="w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {authError}
        </div>
      ) : null}

      <div className="flex w-full items-center gap-3 md:w-auto">
        <Button
          variant="ghost"
          className="hidden h-11 w-11 shrink-0 rounded-full border border-white/10 bg-white/5 p-0 text-white hover:bg-white/10 lg:inline-flex"
          onClick={onToggleSidebar}
          type="button"
          aria-label={isSidebarCollapsed ? "Open navigation" : "Collapse navigation"}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <GlobalSearch />
      </div>

      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center">
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:bg-white/10 md:min-w-[20rem]"
          onClick={() => {
            setIsTeamSwitcherOpen((open) => !open);
            setError("");
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Team switcher</p>
          <p className="mt-1 truncate font-medium">
            {normalizedPinnedTeams.length ? normalizedPinnedTeams.map((team) => team.name).join(" • ") : "Choose 3 teams"}
          </p>
        </button>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
          <UserCircle2 className="h-4 w-4 text-[color:var(--color-accent)]" />
          <span className="hidden sm:inline">{user?.email ?? "Analyst"}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {isTeamSwitcherOpen ? (
        <div className="panel absolute left-4 right-4 top-[calc(100%+12px)] z-50 p-5 md:left-auto md:right-8 md:w-full md:max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">Pinned teams</p>
              <h2 className="mt-2 text-xl font-semibold">Update your 3-club watchlist</h2>
            </div>
            <button type="button" className="rounded-full border border-white/10 p-2 text-[color:var(--color-text-muted)]" onClick={() => setIsTeamSwitcherOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((slotIndex) => (
              <TeamSwitcherSlot
                key={slotIndex}
                index={slotIndex}
                selectedTeam={selectedTeams[slotIndex]}
                query={queries[slotIndex]}
                isActive={activeSlot === slotIndex}
                results={results}
                loading={isSearching}
                onActivate={setActiveSlot}
                onQueryChange={handleQueryChange}
                onSelectTeam={handleSelectTeam}
                onClearTeam={handleClearTeam}
              />
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Saving here updates Supabase and bumps the shared team selection state for downstream refetches.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setIsTeamSwitcherOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={selectedTeams.filter(Boolean).length !== 3 || isSaving} onClick={handleSaveTeamSwitch} type="button">
                {isSaving ? "Saving..." : "Save teams"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
