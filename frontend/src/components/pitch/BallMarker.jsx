import { motion } from "framer-motion";

const PITCH_WIDTH = 105;
const PITCH_HEIGHT = 68;

function toPitchCoordinate(position = { x: 0.5, y: 0.5 }) {
  return {
    x: Math.max(0, Math.min(1, position.x ?? 0.5)) * PITCH_WIDTH,
    y: (1 - Math.max(0, Math.min(1, position.y ?? 0.5))) * PITCH_HEIGHT,
  };
}

export default function BallMarker({
  position = { x: 0.5, y: 0.5 },
  previousPosition = { x: 0.5, y: 0.5 },
  motionType = "line",
  animationKey = "resting-ball",
}) {
  const current = toPitchCoordinate(position);
  const previous = toPitchCoordinate(previousPosition);
  const arcPeak = Math.min(previous.y, current.y) - 5;

  const cx = motionType === "arc" ? [previous.x, (previous.x + current.x) / 2, current.x] : current.x;
  const cy = motionType === "arc" ? [previous.y, arcPeak, current.y] : current.y;

  return (
    <motion.circle
      key={animationKey}
      initial={{ cx: previous.x, cy: previous.y }}
      animate={{ cx, cy }}
      transition={{
        duration: motionType === "arc" ? 0.95 : 0.6,
        ease: "easeInOut",
      }}
      r="1.5"
      className="fill-white stroke-slate-950"
      strokeWidth="0.75"
    />
  );
}
