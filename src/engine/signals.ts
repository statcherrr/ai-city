/**
 * Traffic-signal timing. Lights run on a fixed cycle driven by the simulation
 * clock, with two documented exceptions: a pre-emption map that forces one axis
 * green (the fire corridor green wave) and full override when a node is inside
 * an incident perimeter.
 */

import { SIGNAL_CYCLE_SEC } from '@/data/cityConfig';
import { nodeId, type Axis, type NodeId } from './graph';
import type { WorldState } from './types';

export type SignalColor = 'green' | 'amber' | 'red';

/** Cycle windows as fractions of `SIGNAL_CYCLE_SEC`. */
const WINDOWS = {
  nsGreen: 0.44,
  nsAmber: 0.49,
  ewGreen: 0.94,
  ewAmber: 0.99,
} as const;

/** Axis index stored in `WorldState.signalOverrides`: 0 = north/south, 1 = east/west. */
export const AXIS_NS = 0;
export const AXIS_EW = 1;

export function axisIndex(axis: Axis): number {
  return axis === 'ns' ? AXIS_NS : AXIS_EW;
}

function isGreen(frac: number, axis: Axis): boolean {
  return axis === 'ns' ? frac < WINDOWS.nsGreen : frac >= 0.49 && frac < WINDOWS.ewGreen;
}

function isAmber(frac: number, axis: Axis): boolean {
  return axis === 'ns'
    ? frac >= WINDOWS.nsGreen && frac < WINDOWS.nsAmber
    : frac >= WINDOWS.ewGreen && frac < WINDOWS.ewAmber;
}

/**
 * Recompute the pre-emption map. The green wave clears signals in sequence, so
 * an engine running the corridor sees green the whole way rather than stopping
 * at every other intersection.
 */
export function applyGreenWaves(world: WorldState): void {
  const { signalOverrides, greenWaves, timeMin } = world;
  signalOverrides.clear();
  for (const wave of greenWaves) {
    const elapsed = timeMin - wave.startedAt;
    if (elapsed < 0 || elapsed > wave.durationMin) continue;
    for (let k = 0; k < wave.points.length; k++) {
      const point = wave.points[k]!;
      // Each intersection switches 3 simulated seconds after the one behind it.
      if (elapsed * 60 < k * 3) break;
      const previous = wave.points[k - 1];
      const next = wave.points[k + 1];
      const neighbour = next ?? previous;
      if (!neighbour) continue;
      const horizontal = point.j === neighbour.j && point.i !== neighbour.i;
      signalOverrides.set(nodeId(point.i, point.j), horizontal ? AXIS_EW : AXIS_NS);
    }
  }
}

export function signalColor(world: WorldState, node: NodeId, axis: Axis, timeSec: number): SignalColor {
  const override = world.signalOverrides.get(node);
  if (override !== undefined) {
    return axisIndex(axis) === override ? 'green' : 'red';
  }
  const frac = (timeSec % SIGNAL_CYCLE_SEC) / SIGNAL_CYCLE_SEC;
  if (isGreen(frac, axis)) return 'green';
  if (isAmber(frac, axis)) return 'amber';
  return 'red';
}
