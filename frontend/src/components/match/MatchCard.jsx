import { Link } from "react-router-dom";

import MomentumBar from "../charts/MomentumBar";

export default function MatchCard({ match }) {
  return (
    <article className="panel space-y-4 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{match.competition}</p>
          <h3 className="mt-2 text-lg font-semibold">
            {match.homeTeam} vs {match.awayTeam}
          </h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[color:var(--color-text-muted)]">
          {match.status}
        </span>
      </div>
      <MomentumBar value={match.momentum} homeLabel={match.homeTeam} awayLabel={match.awayTeam} />
      <div className="flex items-center justify-between text-sm text-[color:var(--color-text-muted)]">
        <span>{match.scoreline}</span>
        <Link to={`/match/${match.id}`} className="text-[color:var(--color-accent)]">
          Open match
        </Link>
      </div>
    </article>
  );
}
