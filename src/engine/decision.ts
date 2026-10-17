/**
 * Explainable decision pipeline for every AI action in the city.
 *
 * Flow: Signals -> CandidateActions -> Scoring -> Selection -> Rationale.
 *
 * This ensures every dispatch, notification, or AI-driven event is transparent:
 *   - What signals were observed
 *   - What alternatives were considered and rejected
 *   - Why the chosen action was selected
 *   - What metric deltas drove the decision
 */



/** A candidate action with full decision metadata. */
export interface CandidateAction {
  id: string;
  department: string[];
  estimatedResponseTimeDelta: number; // minutes saved/reduced
  peopleAffected: number;
  vehiclesAffected: number;
  cost: number; // in simulated credits
  confidence: number; // 0-1, model confidence in this estimate
}

/** Scoring weights for the weighted-utility function. */
export interface ScoringWeights {
  responseTime: number;
  people: number;
  vehicles: number;
  cost: number;
}

/** Rationale recorded for every feed item. */
export interface Rationale {
  signalsObserved: string[];
  chosenAction: CandidateAction;
  alternativesRejected: { action: CandidateAction; score: number }[];
  metricDeltas: {
    responseTimeDelta: number;
    peopleAffected: number;
    vehiclesAffected: number;
    costDelta: number;
  };
}

/** Top-N selection result. */
export interface SelectionResult {
  chosen: CandidateAction;
  rejected: { action: CandidateAction; score: number }[]; // top 2 rejected
}

/**
 * Score a candidate action using a weighted-utility function.
 * Higher score = better choice.
 */
export function scoreCandidate(
  candidate: CandidateAction,
  weights: ScoringWeights
): number {
  // Weighted utility: higher is better
  const utility =
    weights.responseTime * candidate.estimatedResponseTimeDelta +
    weights.people * candidate.peopleAffected +
    weights.vehicles * candidate.vehiclesAffected -
    weights.cost * candidate.cost;
  // Clip to reasonable range and add small confidence boost
  return Math.max(0, utility) * (0.9 + 0.1 * candidate.confidence);
}

/**
 * Select the highest-utility candidate and record the top 2 rejected alternatives.
 */
export function selectBest(
  candidates: CandidateAction[],
  weights: ScoringWeights
): SelectionResult {
  if (candidates.length === 0) {
    return { chosen: null as any, rejected: [] };
  }

  // Score all candidates
  const scored = candidates.map((c) => ({
    action: c,
    score: scoreCandidate(c, weights),
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const chosen = scored[0].action;
  const rejected = scored.slice(1, 3).map((s) => ({
    action: s.action,
    score: s.score,
  }));

  return { chosen, rejected };
}

/**
 * Build a rationale for a chosen action.
 * Records signals observed, chosen action, and top rejected alternatives.
 */
export function buildRationale(
  signalsObserved: string[],
  chosen: CandidateAction,
  rejected: { action: CandidateAction; score: number }[]
): Rationale {
  return {
    signalsObserved,
    chosenAction: chosen,
    alternativesRejected: rejected,
    metricDeltas: {
      responseTimeDelta: chosen.estimatedResponseTimeDelta,
      peopleAffected: chosen.peopleAffected,
      vehiclesAffected: chosen.vehiclesAffected,
      costDelta: chosen.cost,
    },
  };
}

/** Default scoring weights (can be overridden from config). */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  responseTime: 0.4,
  people: 0.3,
  vehicles: 0.2,
  cost: -0.1,
};