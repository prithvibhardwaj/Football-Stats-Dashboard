import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, Outlet, createBrowserRouter, RouterProvider } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import Navbar from "./components/layout/Navbar";
import ProtectedRoute, { RouteLoadingScreen } from "./components/layout/ProtectedRoute";
import Sidebar from "./components/layout/Sidebar";
import { missingClientEnv } from "./lib/config";
import { derivePreferredLeagueIds, loadSavedSelection, normalizePinnedTeam, persistSavedSelection } from "./lib/onboarding";
import { describeSavedTeamsSyncError, fetchUserPreferences, fetchUserTeams, isSupabaseConfigured, supabase } from "./lib/supabase";
import { useAuthStore } from "./store/useAuthStore";
import ComparePage from "./pages/ComparePage";
import Dashboard from "./pages/Dashboard";
import LeagueHub from "./pages/LeagueHub";
import Login from "./pages/Login";
import MatchPage from "./pages/MatchPage";
import Onboarding from "./pages/Onboarding";
import PlayerPage from "./pages/PlayerPage";
import RefereePage from "./pages/RefereePage";
import ReplayPage from "./pages/ReplayPage";
import TeamPage from "./pages/TeamPage";
import "./index.css";

function ConfigurationErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="panel max-w-2xl p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Configuration required</p>
        <h1 className="mt-3 text-3xl font-semibold">Frontend environment variables are missing</h1>
        <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">
          Add the required variables to your frontend environment before starting or deploying this app.
        </p>
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-medium text-white">Missing variables</p>
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--color-text-muted)]">
            {missingClientEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PublicRoute() {
  const { session, isLoading, hasCompletedOnboarding } = useAuthStore(useShallow((state) => ({
    session: state.session,
    isLoading: state.isLoading,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
  })));

  if (isLoading) {
    return <RouteLoadingScreen />;
  }

  if (!session) {
    return <Outlet />;
  }

  return <Navigate to={hasCompletedOnboarding ? "/dashboard" : "/onboarding"} replace />;
}

function AuthSessionManager({ children }) {
  const setAuthState = useAuthStore((state) => state.setAuthState);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setSession = useAuthStore((state) => state.setSession);

  React.useEffect(() => {
    let active = true;

    async function applySession(session, fallbackError = null) {
      setLoading(true);

      if (!session?.user) {
        if (active) {
          setAuthState({
            session: null,
            pinnedTeams: [],
            leagueIds: [],
            authError: fallbackError,
          });
          setLoading(false);
        }
        return;
      }

      const localSelection = loadSavedSelection(session.user.id);

      try {
        const [pinnedTeamsRaw, preferences] = await Promise.all([
          fetchUserTeams(session.user.id),
          fetchUserPreferences(session.user.id),
        ]);
        const remotePinnedTeams = pinnedTeamsRaw.map(normalizePinnedTeam).filter(Boolean);
        const remoteLeagueIds = preferences?.league_ids?.length ? preferences.league_ids : derivePreferredLeagueIds(remotePinnedTeams);
        const shouldUseLocalSelection = !remotePinnedTeams.length && Boolean(localSelection?.pinnedTeams?.length);
        const pinnedTeams = shouldUseLocalSelection ? localSelection.pinnedTeams : remotePinnedTeams;
        const leagueIds = shouldUseLocalSelection ? localSelection.leagueIds : remoteLeagueIds;

        if (pinnedTeams.length) {
          persistSavedSelection(session.user.id, { pinnedTeams, leagueIds });
        }

        if (active) {
          setAuthState({
            session,
            pinnedTeams,
            leagueIds,
            authError: fallbackError,
          });
        }
      } catch (error) {
        const fallbackSelection = localSelection ?? { pinnedTeams: [], leagueIds: [] };

        if (active) {
          setAuthState({
            session,
            pinnedTeams: fallbackSelection.pinnedTeams,
            leagueIds: fallbackSelection.leagueIds,
            authError: fallbackSelection.pinnedTeams.length
              ? describeSavedTeamsSyncError(error)
              : error.message || "Failed to load saved teams.",
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    async function initializeAuth() {
      if (!isSupabaseConfigured || !supabase) {
        setAuthState({
          session: null,
          pinnedTeams: [],
          leagueIds: [],
          authError: null,
        });
        setLoading(false);
        return;
      }

      setLoading(true);

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      await applySession(session, error?.message ?? null);
    }

    void initializeAuth();

    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      const currentState = useAuthStore.getState();
      const currentUserId = currentState.session?.user?.id ?? null;
      const nextUserId = session?.user?.id ?? null;
      const isSameSignedInUser = Boolean(currentUserId && nextUserId && currentUserId === nextUserId);

      // Supabase can emit SIGNED_IN and TOKEN_REFRESHED again when the tab regains
      // focus; update the session token in place instead of reloading the app shell.
      if (isSameSignedInUser && event !== "SIGNED_OUT") {
        setSession(session);
        return;
      }

      void applySession(session);
    });

    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [setAuthState, setLoading, setSession]);

  return children;
}

function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("footy-iq:sidebar-collapsed") === "true";
  });

  React.useEffect(() => {
    window.localStorage.setItem("footy-iq:sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const toggleSidebar = React.useCallback(() => {
    setIsSidebarCollapsed((current) => !current);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Navbar isSidebarCollapsed={isSidebarCollapsed} onToggleSidebar={toggleSidebar} />
        <main className="relative z-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      {
        path: "/login",
        element: <Login />,
      },
    ],
  },
  {
    element: <ProtectedRoute requireOnboarding={false} />,
    children: [
      {
        path: "/onboarding",
        element: <Onboarding />,
      },
    ],
  },
  {
    element: <ProtectedRoute requireOnboarding />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/league/:leagueId", element: <LeagueHub /> },
          { path: "/match/:matchId", element: <MatchPage /> },
          { path: "/match/:matchId/replay", element: <ReplayPage /> },
          { path: "/team/:teamId", element: <TeamPage /> },
          { path: "/player/:playerId", element: <PlayerPage /> },
          { path: "/compare", element: <ComparePage /> },
          { path: "/referee/:refereeId", element: <RefereePage /> },
        ],
      },
    ],
  },
]);

async function bootstrap() {
  if (missingClientEnv.length) {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <ConfigurationErrorScreen />
      </React.StrictMode>,
    );
    return;
  }

  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledRequest: "bypass",
    });
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AuthSessionManager>
        <RouterProvider router={router} />
      </AuthSessionManager>
    </React.StrictMode>,
  );
}

bootstrap();
