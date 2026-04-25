import { create } from "zustand";

export const useAuthStore = create((set) => ({
  session: null,
  user: null,
  pinnedTeams: [],
  leagueIds: [],
  teamSelectionVersion: 0,
  hasCompletedOnboarding: false,
  authError: null,
  isLoading: true,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
    }),
  setAuthState: ({ session, pinnedTeams = [], leagueIds = [], authError = null }) =>
    set({
      session,
      user: session?.user ?? null,
      pinnedTeams,
      leagueIds,
      teamSelectionVersion: session?.user ? Date.now() : 0,
      hasCompletedOnboarding: pinnedTeams.length > 0,
      authError,
    }),
  setPinnedTeams: (pinnedTeams, leagueIds = null, authError = null) =>
    set({
      pinnedTeams,
      leagueIds: leagueIds ?? [],
      teamSelectionVersion: Date.now(),
      hasCompletedOnboarding: pinnedTeams.length > 0,
      authError,
    }),
  setLeagueIds: (leagueIds) => set({ leagueIds }),
  setLoading: (isLoading) => set({ isLoading }),
  setAuthError: (authError) => set({ authError }),
  logout: () =>
    set({
      session: null,
      user: null,
      pinnedTeams: [],
      leagueIds: [],
      teamSelectionVersion: 0,
      hasCompletedOnboarding: false,
      authError: null,
      isLoading: false,
    }),
}));
