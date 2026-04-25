import { AlertTriangle, CircleDot, RectangleHorizontal, ShieldAlert, Shirt } from "lucide-react";
import { motion } from "framer-motion";

const PITCH_WIDTH = 105;
const PITCH_HEIGHT = 68;

function pickIcon(type = "") {
  const label = type.toLowerCase();

  if (label.includes("goal")) return CircleDot;
  if (label.includes("yellow")) return AlertTriangle;
  if (label.includes("red")) return ShieldAlert;
  if (label.includes("sub")) return Shirt;

  return RectangleHorizontal;
}

export default function EventIcon({ event, position, isActive = false }) {
  const Icon = pickIcon(`${event.type || ""} ${event.detail || ""}`);
  const x = Math.max(0, Math.min(1, position.x ?? 0.5)) * PITCH_WIDTH;
  const y = (1 - Math.max(0, Math.min(1, position.y ?? 0.5))) * PITCH_HEIGHT;

  return (
    <foreignObject
      x={x - 2.5}
      y={y - 2.5}
      width="5"
      height="5"
      className="overflow-visible"
    >
      <motion.div
        initial={false}
        animate={
          isActive
            ? { scale: [1, 1.2, 1], opacity: [0.95, 1, 0.3] }
            : { scale: 1, opacity: 0.72 }
        }
        transition={{
          duration: isActive ? 3 : 0.3,
          ease: "easeOut",
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-slate-950/85 text-[color:var(--color-accent)] shadow-lg"
      >
        <Icon className="h-3 w-3" />
      </motion.div>
    </foreignObject>
  );
}
