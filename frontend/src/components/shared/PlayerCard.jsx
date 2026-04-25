import { Link } from "react-router-dom";

import { Button } from "../ui/button";

export default function PlayerCard({ player, onCompare, compareLabel = "Compare" }) {
  const playerHref = player.leagueId && player.teamId
    ? `/player/${player.id}?league=${player.leagueId}&team=${player.teamId}`
    : `/player/${player.id}`;

  return (
    <article className="panel space-y-4 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{player.position}</p>
        <h3 className="mt-2 text-lg font-semibold">{player.name}</h3>
        {player.teamName ? <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{player.teamName}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-[color:var(--color-text-muted)]">
        <div className="panel-muted p-3">
          <p>Goals</p>
          <p className="mt-1 text-xl font-semibold text-white">{player.goals}</p>
        </div>
        <div className="panel-muted p-3">
          <p>Assists</p>
          <p className="mt-1 text-xl font-semibold text-white">{player.assists}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link to={playerHref} className="flex-1">
          <Button className="w-full">Open profile</Button>
        </Link>
        {onCompare ? (
          <Button variant="secondary" className="flex-1 w-full" onClick={() => onCompare(player)} type="button">
            {compareLabel}
          </Button>
        ) : (
          <Link to="/compare" className="flex-1">
            <Button variant="secondary" className="w-full">
              {compareLabel}
            </Button>
          </Link>
        )}
      </div>
    </article>
  );
}
