import { Search, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { Button } from "../components/ui/button";
import {
  clearOnboardingDraft,
  derivePreferredLeagueIds,
  getLeagueNameById,
  loadOnboardingDraft,
  persistOnboardingDraft,
  saveOnboardingSelection,
  searchTeams,
} from "../lib/onboarding";
import { useAuthStore } from "../store/useAuthStore";

const EMPTY_SLOTS = [null, null, null];

function TeamSlot({
  index,
  query,
  selectedTeam,
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Pinned team {index + 1}</p>
        {selectedTeam ? (
          <button
            type="button"
            className="text-xs uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]"
            onClick={() => onClearTeam(index)}
          >
            Clear
          </button>
        ) : null}
      </div>
      <label className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <Search className="h-4 w-4 text-[color:var(--color-text-muted)]" />
        <input
          value={query}
          placeholder="Type at least 3 characters"
          className="w-full bg-transparent text-white placeholder:text-[color:var(--color-text-muted)]"
          onFocus={() => onActivate(index)}
          onChange={(event) => onQueryChange(index, event.target.value)}
        />
      </label>
      {selectedTeam ? (
        <div className="panel-muted flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-white">{selectedTeam.name}</p>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              {selectedTeam.leagueName} • {selectedTeam.country}
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
        </div>
      ) : null}
      {shouldShowResults ? (
        <div className="panel-muted max-h-72 overflow-y-auto p-2">
          {loading ? (
            <div className="px-3 py-4 text-sm text-[color:var(--color-text-muted)]">Searching teams...</div>
          ) : results.length ? (
            results.map((team) => (
              <button
                key={`${team.id}-${team.leagueId}`}
                type="button"
                className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                onClick={() => onSelectTeam(index, team)}
              >
                <div>
                  <p className="font-medium text-white">{team.name}</p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                    {team.leagueName} • {team.country}
                  </p>
                </div>
                <Trophy className="h-4 w-4 text-[color:var(--color-accent)]" />
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-[color:var(--color-text-muted)]">No matching teams found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, setPinnedTeams } = useAuthStore(useShallow((state) => ({
    user: state.user,
    setPinnedTeams: state.setPinnedTeams,
  })));

  const [selectedTeams, setSelectedTeams] = useState(EMPTY_SLOTS);
  const [searchQueries, setSearchQueries] = useState(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const draftHydratedRef = useRef(false);

  const completedSelection = selectedTeams.filter(Boolean);
  const derivedLeagueIds = useMemo(
    () => derivePreferredLeagueIds(completedSelection),
    [completedSelection],
  );

  useEffect(() => {
    if (!user?.id || draftHydratedRef.current) {
      return;
    }

    const draft = loadOnboardingDraft(user.id);
    if (draft) {
      setSelectedTeams(draft.selectedTeams);
      setSearchQueries(draft.searchQueries);
      const firstIncompleteSlot = draft.selectedTeams.findIndex((team) => !team);
      setActiveSlot(firstIncompleteSlot >= 0 ? firstIncompleteSlot : 0);
    }

    draftHydratedRef.current = true;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !draftHydratedRef.current) {
      return;
    }

    persistOnboardingDraft(user.id, {
      selectedTeams,
      searchQueries,
    });
  }, [searchQueries, selectedTeams, user?.id]);

  useEffect(() => {
    const query = searchQueries[activeSlot] ?? "";
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;
    setIsSearching(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchTeams(trimmedQuery);
        if (!cancelled) {
          setSearchResults(
            results.filter(
              (candidate) => !selectedTeams.some((team, slotIndex) => slotIndex !== activeSlot && team?.id === candidate.id),
            ),
          );
          setError("");
        }
      } catch (searchError) {
        if (!cancelled) {
          setSearchResults([]);
          setError(searchError.message || "Team search failed.");
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeSlot, searchQueries, selectedTeams]);

  function handleQueryChange(slotIndex, value) {
    setActiveSlot(slotIndex);
    setSearchQueries((currentQueries) =>
      currentQueries.map((query, index) => (index === slotIndex ? value : query)),
    );

    if (!value.trim()) {
      setSelectedTeams((currentTeams) => currentTeams.map((team, index) => (index === slotIndex ? null : team)));
    }
  }

  function handleSelectTeam(slotIndex, team) {
    setSelectedTeams((currentTeams) => currentTeams.map((entry, index) => (index === slotIndex ? team : entry)));
    setSearchQueries((currentQueries) => currentQueries.map((query, index) => (index === slotIndex ? team.name : query)));
    setSearchResults([]);
    setError("");
  }

  function handleClearTeam(slotIndex) {
    setSelectedTeams((currentTeams) => currentTeams.map((team, index) => (index === slotIndex ? null : team)));
    setSearchQueries((currentQueries) => currentQueries.map((query, index) => (index === slotIndex ? "" : query)));
    setActiveSlot(slotIndex);
  }

  async function handleSave() {
    if (!user?.id) {
      setError("You need to be logged in to save onboarding choices.");
      return;
    }

    if (completedSelection.length !== 3) {
      setError("Select exactly 3 teams before continuing.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const { pinnedTeams, leagueIds, authError } = await saveOnboardingSelection({
        userId: user.id,
        selectedTeams: completedSelection,
      });

      clearOnboardingDraft(user.id);
      setPinnedTeams(pinnedTeams, leagueIds, authError);

      navigate("/dashboard", { replace: true });
    } catch (saveError) {
      setError(saveError.message || "Failed to save onboarding choices.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12">
      <section className="grid w-full gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Onboarding</p>
          <h1 className="mt-3 text-3xl font-semibold">Choose exactly 3 teams to follow</h1>
          <p className="mt-3 max-w-2xl text-sm text-[color:var(--color-text-muted)]">
            Search by team name. Once you lock in your 3 clubs, the app fills the rest of your league watchlist using the
            priority order from your product spec.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((slotIndex) => (
              <TeamSlot
                key={slotIndex}
                index={slotIndex}
                query={searchQueries[slotIndex]}
                selectedTeam={selectedTeams[slotIndex]}
                isActive={activeSlot === slotIndex}
                results={searchResults}
                loading={isSearching}
                onActivate={setActiveSlot}
                onQueryChange={handleQueryChange}
                onSelectTeam={handleSelectTeam}
                onClearTeam={handleClearTeam}
              />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-white">{completedSelection.length} / 3 teams selected</p>
              <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                {completedSelection.length === 3
                  ? "Selection complete. You can save and continue."
                  : "Keep going until all 3 slots are filled."}
              </p>
            </div>
            <Button disabled={completedSelection.length !== 3 || isSaving} onClick={handleSave} type="button">
              {isSaving ? "Saving..." : "Save teams"}
            </Button>
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </div>

        <aside className="space-y-6">
          <section className="panel p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Pinned clubs</p>
            <div className="mt-5 space-y-3">
              {selectedTeams.map((team, index) => (
                <div key={`selected-${index}`} className="panel-muted flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-[color:var(--color-text-muted)]">Slot {index + 1}</p>
                    <p className="mt-1 font-medium text-white">{team?.name ?? "Waiting for selection"}</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                    {team?.leagueName ?? "Open"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Derived league list</p>
            <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">
              Your 3 team leagues plus the highest-priority uncovered leagues, capped at 8 total.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {derivedLeagueIds.map((leagueId) => (
                <span
                  key={leagueId}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {getLeagueNameById(leagueId)}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
