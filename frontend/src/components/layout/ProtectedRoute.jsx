import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { useAuthStore } from "../../store/useAuthStore";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[color:var(--color-text-muted)]">
      Loading session...
    </div>
  );
}

export function RouteLoadingScreen() {
  return <LoadingScreen />;
}

export default function ProtectedRoute({ requireOnboarding = true }) {
  const location = useLocation();
  const { session, isLoading, hasCompletedOnboarding } = useAuthStore(useShallow((state) => ({
    session: state.session,
    isLoading: state.isLoading,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
  })));

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requireOnboarding && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!requireOnboarding && hasCompletedOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
