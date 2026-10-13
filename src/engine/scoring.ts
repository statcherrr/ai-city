/**
 * City Health Score. The four sub-scores are pure functions of world state, and
 * the displayed values ease toward those targets so recovery reads as a curve
 * rather than a jump.
 */

import type { Scores, WorldState } from './types';

export const SCORE_WEIGHTS = {
  infrastructure: 0.3,
  traffic: 0.25,
  emergency: 0.25,
  transit: 0.2,
} as const;

export function targetScores(world: WorldState): Scores {
  let infrastructure = 97;
  let emergency = 96;
  for (const incident of world.incidents) {
    if (incident.resolved) continue;
    infrastructure -= incident.severity * 1.9;
    emergency -= incident.severity * 1.2;
  }
  infrastructure -= (1 - Math.min(1, world.pressure)) * 28;

  const traffic = 96 - world.trafficDelayPct * 0.78;

  let emergencyPenalty = 0;
  for (const dispatch of world.dispatches) {
    if (dispatch.arrivedAt !== null) continue;
    const enRoute = Math.min(6, world.timeMin - dispatch.dispatchedAt);
    emergencyPenalty += Math.max(0, enRoute) * 1.4;
  }
  emergency -= Math.min(28, emergencyPenalty);

  const transit = 95 - world.transitDelayMin * 1.7 - world.closures.size * 1.2;

  const clamp = (v: number): number => Math.max(38, Math.min(99, v));
  const infrastructureC = clamp(infrastructure);
  const trafficC = clamp(traffic);
  const emergencyC = clamp(emergency);
  const transitC = clamp(transit);
  const health =
    infrastructureC * SCORE_WEIGHTS.infrastructure +
    trafficC * SCORE_WEIGHTS.traffic +
    emergencyC * SCORE_WEIGHTS.emergency +
    transitC * SCORE_WEIGHTS.transit;

  return {
    health,
    infrastructure: infrastructureC,
    traffic: trafficC,
    emergency: emergencyC,
    transit: transitC,
  };
}

/** Exponential ease with a ~20 simulated-second time constant. */
export function easeScores(current: Scores, target: Scores, dtMin: number): void {
  const alpha = 1 - Math.exp(-dtMin / 0.33);
  current.health += (target.health - current.health) * alpha;
  current.infrastructure += (target.infrastructure - current.infrastructure) * alpha;
  current.traffic += (target.traffic - current.traffic) * alpha;
  current.emergency += (target.emergency - current.emergency) * alpha;
  current.transit += (target.transit - current.transit) * alpha;
}

export function easeTowards(current: number, target: number, dtMin: number, tau = 0.4): number {
  return current + (target - current) * (1 - Math.exp(-dtMin / tau));
}
