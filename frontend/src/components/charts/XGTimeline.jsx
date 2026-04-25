import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function GoalReferenceLabel({ viewBox, scorer }) {
  if (!viewBox) {
    return null;
  }

  return (
    <g>
      <rect
        x={viewBox.x - 34}
        y={viewBox.y - 24}
        width="68"
        height="16"
        rx="8"
        fill="rgba(2, 6, 23, 0.9)"
      />
      <text
        x={viewBox.x}
        y={viewBox.y - 13}
        textAnchor="middle"
        fill="white"
        fontSize="9"
      >
        {scorer}
      </text>
    </g>
  );
}

function TooltipContent({ active, payload, label, goals = [] }) {
  if (!active || !payload?.length) {
    return null;
  }

  const goalAtMinute = goals.find((goal) => Number(goal.minute) === Number(label));
  const lastEvent = payload[0]?.payload?.lastEvent;

  return (
    <div className="rounded-2xl border border-white/10 bg-[color:var(--color-panel)] px-4 py-3 shadow-2xl">
      <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">Minute {label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-2 text-sm text-white">
          {entry.name}: {Number(entry.value ?? 0).toFixed(2)}
        </p>
      ))}
      {goalAtMinute ? <p className="mt-2 text-xs text-emerald-200">Goal: {goalAtMinute.scorer}</p> : null}
      {lastEvent ? <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">Last event: {lastEvent}</p> : null}
    </div>
  );
}

export default function XGTimeline({
  data = [],
  goals = [],
  homeLabel = "Home",
  awayLabel = "Away",
}) {
  return (
    <div className="panel h-[320px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">xG Timeline</h3>
          <p className="text-sm text-[color:var(--color-text-muted)]">Cumulative threat by minute.</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,173,195,0.15)" />
          <XAxis dataKey="minute" stroke="#94adc3" domain={[0, "dataMax"]} />
          <YAxis stroke="#94adc3" />
          <Tooltip content={<TooltipContent goals={goals} />} />
          <Legend />
          {goals.map((goal) => (
            <ReferenceLine
              key={`${goal.minute}-${goal.scorer}`}
              x={goal.minute}
              stroke="#f8fafc"
              strokeDasharray="4 4"
              label={<GoalReferenceLabel scorer={goal.scorer} />}
            />
          ))}
          <Line
            type="monotone"
            dataKey="homeXg"
            name={homeLabel}
            stroke="#34d399"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="awayXg"
            name={awayLabel}
            stroke="#f59e0b"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
