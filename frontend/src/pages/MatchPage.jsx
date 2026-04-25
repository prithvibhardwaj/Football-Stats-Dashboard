import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import MatchDetail from "../components/match/MatchDetail";
import { useInjuries } from "../hooks/useInjuries";
import { useLiveMatch } from "../hooks/useLiveMatch";
import { usePrediction } from "../hooks/usePrediction";
import { useRefereeAnalysis } from "../hooks/useRefereeAnalysis";
import { getCurrentSeasonYear } from "../lib/season";

export default function MatchPage() {
  const { matchId } = useParams();
  const liveMatch = useLiveMatch(matchId);
  const match = liveMatch.match;
  const predictionEligible = Boolean(matchId) && ["NS", "TBD", "HT"].includes(match?.status ?? "");
  const predictionState = usePrediction(matchId, { enabled: predictionEligible });
  const injuriesState = useInjuries(matchId);
  const refereeState = useRefereeAnalysis(match?.refereeName, getCurrentSeasonYear());

  if (liveMatch.loading && !match) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--color-accent)]" />
      </div>
    );
  }

  if (liveMatch.error && !match) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-rose-300">
          Failed to load match data: {liveMatch.error.message || "Match unavailable."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MatchDetail
        match={match}
        events={liveMatch.events}
        eventLog={liveMatch.eventLog}
        ballPosition={liveMatch.ballPosition}
        previousBallPosition={liveMatch.previousBallPosition}
        ballMotion={liveMatch.ballMotion}
        ballAnimationKey={liveMatch.ballAnimationKey}
        liveStatistics={liveMatch.liveStatistics}
        halfTime={liveMatch.halfTime}
        prediction={predictionState.prediction}
        predictionLoading={predictionState.loading}
        predictionError={predictionState.error}
        injuries={injuriesState.injuries}
        injuriesLoading={injuriesState.loading}
        refereeAnalysis={refereeState.analysis}
        refereeLoading={refereeState.loading}
      />
    </div>
  );
}
