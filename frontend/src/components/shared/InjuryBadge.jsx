export default function InjuryBadge({ label = "Key player absent", tone = "danger" }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
      : "border-amber-300/30 bg-amber-300/10 text-amber-100";

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>;
}
