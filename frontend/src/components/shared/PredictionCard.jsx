import InjuryBadge from "./InjuryBadge";

export default function PredictionCard({ prediction, loading = false, error = null, title = "Prediction" }) {
  const errorMessage = typeof error === "string" ? error : error?.message;

  if (loading) {
    return (
      <article className="panel space-y-4 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{title}</p>
        <div className="space-y-3">
          <div className="h-6 rounded-full bg-white/10" />
          <div className="h-24 rounded-3xl bg-white/5" />
          <div className="h-5 rounded-full bg-white/10" />
        </div>
      </article>
    );
  }

  if (error) {
    return (
      <article className="panel space-y-4 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{title}</p>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage || "Prediction unavailable right now."}
        </div>
      </article>
    );
  }

  if (!prediction) {
    return (
      <article className="panel space-y-4 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{title}</p>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
          No prediction available.
        </div>
      </article>
    );
  }

  return (
    <article className="panel space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">{title}</p>
          <h3 className="mt-2 text-lg font-semibold">{prediction.scoreline}</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">{prediction.confidence}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="panel-muted p-3">
          <p className="text-[color:var(--color-text-muted)]">Home</p>
          <p className="mt-1 text-xl font-semibold text-white">{prediction.homeWin}%</p>
        </div>
        <div className="panel-muted p-3">
          <p className="text-[color:var(--color-text-muted)]">Draw</p>
          <p className="mt-1 text-xl font-semibold text-white">{prediction.draw}%</p>
        </div>
        <div className="panel-muted p-3">
          <p className="text-[color:var(--color-text-muted)]">Away</p>
          <p className="mt-1 text-xl font-semibold text-white">{prediction.awayWin}%</p>
        </div>
      </div>
      {prediction.keyPlayerAbsent ? <InjuryBadge /> : null}
      {prediction.timestamp ? (
        <p className="text-xs text-[color:var(--color-text-muted)]">
          Generated {new Date(prediction.timestamp).toLocaleString()}
        </p>
      ) : null}
    </article>
  );
}
