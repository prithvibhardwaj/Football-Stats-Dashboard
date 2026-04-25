const OUTCOME_STYLES = {
  W: "bg-emerald-400/90",
  D: "bg-amber-300/90",
  L: "bg-rose-400/90",
};

function intensityClass(goalDiff = 0) {
  const magnitude = Math.abs(goalDiff);

  if (magnitude >= 3) return "h-6 w-5";
  if (magnitude >= 2) return "h-5 w-[18px]";
  return "h-[18px] w-4";
}

export default function FormHeatmap({ results = [] }) {
  return (
    <div className="flex items-center gap-1">
      {results.map((result, index) => (
        <div
          key={`${result.outcome}-${index}`}
          className={`rounded-sm transition ${OUTCOME_STYLES[result.outcome] || "bg-white/10"} ${intensityClass(result.goalDiff)}`}
          title={`${result.outcome} (${result.goalDiff > 0 ? "+" : ""}${result.goalDiff})`}
        />
      ))}
    </div>
  );
}
