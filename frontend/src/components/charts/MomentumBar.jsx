import { motion } from "framer-motion";

export default function MomentumBar({
  value = 0,
  homeLabel = "Home",
  awayLabel = "Away",
  homeColorClass = "bg-emerald-400",
  awayColorClass = "bg-amber-400",
}) {
  const dominantLabel = value > 20 ? homeLabel : value < -20 ? awayLabel : "Balanced";
  const indicatorPosition = Math.max(0, Math.min(100, 50 + value / 2));
  const clampedValue = Math.round(Math.max(-100, Math.min(100, value)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">
        <span>{homeLabel}</span>
        <span>{dominantLabel === "Balanced" ? "Balanced" : `${dominantLabel} on top`}</span>
        <span>{awayLabel}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
        <div className={`absolute inset-y-0 left-0 w-1/2 ${homeColorClass} opacity-65`} />
        <div className={`absolute inset-y-0 right-0 w-1/2 ${awayColorClass} opacity-65`} />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70" />
        <motion.div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-white shadow-lg"
          animate={{ left: `${indicatorPosition}%` }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
        <span>-100</span>
        <span>{clampedValue}</span>
        <span>+100</span>
      </div>
    </div>
  );
}
