import BallMarker from "./BallMarker";
import EventIcon from "./EventIcon";

const PITCH_WIDTH = 105;
const PITCH_HEIGHT = 68;
const BOX_DEPTH = 16.5;
const BOX_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const CENTER_X = PITCH_WIDTH / 2;
const CENTER_Y = PITCH_HEIGHT / 2;
const PENALTY_SPOT_DISTANCE = 11;
const CENTER_CIRCLE_RADIUS = 9.15;
const PENALTY_ARC_RADIUS = 9.15;
const PENALTY_ARC_OFFSET = 5.5;
const GOAL_WIDTH = 7.32;

function normalizePosition(position = { x: 0.5, y: 0.5 }, halfTime = false) {
  return {
    x: halfTime ? 1 - (position.x ?? 0.5) : (position.x ?? 0.5),
    y: position.y ?? 0.5,
  };
}

function renderEvents(events, halfTime) {
  return events.map((event, index) => {
    const position = normalizePosition({ x: event.x, y: event.y }, halfTime);

    return (
      <EventIcon
        key={event.id || `${event.type}-${index}`}
        event={event}
        position={position}
        isActive={Boolean(event.isActive)}
      />
    );
  });
}

export default function FootballPitch({
  events = [],
  ballPosition = { x: 0.5, y: 0.5 },
  previousBallPosition = { x: 0.5, y: 0.5 },
  ballMotion = "line",
  ballAnimationKey = "resting-ball",
  isLive = false,
  homeTeamColour = "#34d399",
  awayTeamColour = "#f59e0b",
  halfTime = false,
}) {
  const currentBallPosition = normalizePosition(ballPosition, halfTime);
  const priorBallPosition = normalizePosition(previousBallPosition, halfTime);
  const leftPenaltyAreaY = (PITCH_HEIGHT - BOX_WIDTH) / 2;
  const leftGoalAreaY = (PITCH_HEIGHT - GOAL_AREA_WIDTH) / 2;
  const goalY = (PITCH_HEIGHT - GOAL_WIDTH) / 2;

  return (
    <div className="panel overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">
        <span>{isLive ? "Live tracker" : "Replay pitch"}</span>
        <span>105m x 68m static pitch</span>
      </div>
      <svg
        viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}
        className="w-full rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(19,78,54,0.95)_0%,_rgba(20,83,45,0.95)_100%)]"
        role="img"
        aria-label="Football pitch"
      >
        <rect x="0.5" y="0.5" width={PITCH_WIDTH - 1} height={PITCH_HEIGHT - 1} fill="none" stroke="white" strokeWidth="0.5" />
        <line x1={CENTER_X} y1="0.5" x2={CENTER_X} y2={PITCH_HEIGHT - 0.5} stroke="white" strokeWidth="0.5" />
        <circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_CIRCLE_RADIUS} fill="none" stroke="white" strokeWidth="0.5" />
        <circle cx={CENTER_X} cy={CENTER_Y} r="0.7" fill="white" />

        <rect x="0.5" y={leftPenaltyAreaY} width={BOX_DEPTH} height={BOX_WIDTH} fill="none" stroke="white" strokeWidth="0.5" />
        <rect x={PITCH_WIDTH - BOX_DEPTH - 0.5} y={leftPenaltyAreaY} width={BOX_DEPTH} height={BOX_WIDTH} fill="none" stroke="white" strokeWidth="0.5" />
        <rect x="0.5" y={leftGoalAreaY} width={GOAL_AREA_DEPTH} height={GOAL_AREA_WIDTH} fill="none" stroke="white" strokeWidth="0.5" />
        <rect x={PITCH_WIDTH - GOAL_AREA_DEPTH - 0.5} y={leftGoalAreaY} width={GOAL_AREA_DEPTH} height={GOAL_AREA_WIDTH} fill="none" stroke="white" strokeWidth="0.5" />

        <rect x="-1.5" y={goalY} width="2" height={GOAL_WIDTH} fill="none" stroke={homeTeamColour} strokeWidth="0.45" />
        <rect x={PITCH_WIDTH - 0.5} y={goalY} width="2" height={GOAL_WIDTH} fill="none" stroke={awayTeamColour} strokeWidth="0.45" />

        <circle cx={PENALTY_SPOT_DISTANCE} cy={CENTER_Y} r="0.7" fill="white" />
        <circle cx={PITCH_WIDTH - PENALTY_SPOT_DISTANCE} cy={CENTER_Y} r="0.7" fill="white" />

        <path
          d={`M ${PENALTY_SPOT_DISTANCE + PENALTY_ARC_OFFSET} ${CENTER_Y - 7.312} A ${PENALTY_ARC_RADIUS} ${PENALTY_ARC_RADIUS} 0 0 0 ${PENALTY_SPOT_DISTANCE + PENALTY_ARC_OFFSET} ${CENTER_Y + 7.312}`}
          fill="none"
          stroke="white"
          strokeWidth="0.5"
        />
        <path
          d={`M ${PITCH_WIDTH - PENALTY_SPOT_DISTANCE - PENALTY_ARC_OFFSET} ${CENTER_Y - 7.312} A ${PENALTY_ARC_RADIUS} ${PENALTY_ARC_RADIUS} 0 0 1 ${PITCH_WIDTH - PENALTY_SPOT_DISTANCE - PENALTY_ARC_OFFSET} ${CENTER_Y + 7.312}`}
          fill="none"
          stroke="white"
          strokeWidth="0.5"
        />

        <path d="M 0.5 8 A 8 8 0 0 1 8.5 0.5" fill="none" stroke="white" strokeWidth="0.5" />
        <path d={`M ${PITCH_WIDTH - 0.5} 8 A 8 8 0 0 0 ${PITCH_WIDTH - 8.5} 0.5`} fill="none" stroke="white" strokeWidth="0.5" />
        <path d={`M 0.5 ${PITCH_HEIGHT - 8} A 8 8 0 0 0 8.5 ${PITCH_HEIGHT - 0.5}`} fill="none" stroke="white" strokeWidth="0.5" />
        <path
          d={`M ${PITCH_WIDTH - 0.5} ${PITCH_HEIGHT - 8} A 8 8 0 0 1 ${PITCH_WIDTH - 8.5} ${PITCH_HEIGHT - 0.5}`}
          fill="none"
          stroke="white"
          strokeWidth="0.5"
        />

        {renderEvents(events, halfTime)}
        <BallMarker
          position={currentBallPosition}
          previousPosition={priorBallPosition}
          motionType={ballMotion}
          animationKey={ballAnimationKey}
        />
      </svg>
    </div>
  );
}
