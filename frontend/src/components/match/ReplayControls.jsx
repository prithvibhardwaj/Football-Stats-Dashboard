import { Pause, Play } from "lucide-react";

import { Button } from "../ui/button";

export default function ReplayControls({
  minute,
  maxMinute = 95,
  isPlaying,
  speed,
  onTogglePlay,
  onMinuteChange,
  onSpeedChange,
}) {
  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Replay controls</p>
        <p className="text-sm font-semibold text-white">
          {minute.toFixed(1)}'
        </p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <Button variant="secondary" className="gap-2" onClick={onTogglePlay}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? "Pause" : "Play"}
      </Button>
      <input
        type="range"
        min="0"
        max={maxMinute}
        step="0.5"
        value={minute}
        onChange={(event) => onMinuteChange(Number(event.target.value))}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10"
      />
      <div className="flex items-center gap-2">
        {[0.5, 1, 2, 4].map((option) => (
          <Button
            key={option}
            variant={speed === option ? "default" : "ghost"}
            onClick={() => onSpeedChange(option)}
          >
            {option}x
          </Button>
        ))}
      </div>
      </div>
    </div>
  );
}
