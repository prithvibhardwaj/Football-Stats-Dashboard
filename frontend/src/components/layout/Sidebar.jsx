import { BarChart3, ChevronLeft, Compass, Home, Scale } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { getLeagueNameById, normalizePinnedTeam } from "../../lib/onboarding";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/useAuthStore";

function navLinkClass({ isActive }) {
  return `block rounded-2xl px-4 py-3 text-sm transition ${
    isActive
      ? "bg-white/10 text-white"
      : "text-[color:var(--color-text-muted)] hover:bg-white/5 hover:text-white"
  }`;
}

export default function Sidebar({ collapsed = false, onToggle = () => {} }) {
  const { pinnedTeams, leagueIds } = useAuthStore(useShallow((state) => ({
    pinnedTeams: state.pinnedTeams,
    leagueIds: state.leagueIds,
  })));

  const teams = pinnedTeams.map(normalizePinnedTeam).filter(Boolean);

  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-hidden border-r border-white/10 bg-slate-950/55 transition-[width,padding,opacity,border-color] duration-300 lg:flex lg:flex-col",
        collapsed ? "w-0 border-r-transparent p-0 opacity-0 pointer-events-none" : "w-72 p-6 opacity-100",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Link to="/dashboard" className="text-xl font-semibold tracking-[0.18em] text-white">
          FOOTY IQ
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-white/10 p-2 text-[color:var(--color-text-muted)] transition hover:bg-white/5 hover:text-white"
          aria-label="Collapse navigation"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-10 min-w-[15rem] space-y-8">
        <section>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Navigate</p>
          <div className="space-y-2">
            <NavLink to="/dashboard" className={navLinkClass}>
              <span className="flex items-center gap-3">
                <Home className="h-4 w-4" />
                Dashboard
              </span>
            </NavLink>
            <NavLink to="/compare" className={navLinkClass}>
              <span className="flex items-center gap-3">
                <Scale className="h-4 w-4" />
                Compare
              </span>
            </NavLink>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Your Leagues</p>
          <div className="space-y-2">
            {leagueIds.map((leagueId) => (
              <NavLink key={leagueId} to={`/league/${leagueId}`} className={navLinkClass}>
                <span className="flex items-center gap-3">
                  <Compass className="h-4 w-4" />
                  {getLeagueNameById(leagueId)}
                </span>
              </NavLink>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Pinned Teams</p>
          <div className="space-y-2">
            {teams.map((team) => (
              <NavLink key={team.id} to={`/team/${team.id}`} className={navLinkClass}>
                <span className="flex items-center gap-3">
                  <BarChart3 className="h-4 w-4" />
                  {team.name}
                </span>
              </NavLink>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
