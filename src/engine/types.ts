/** Shared domain types for the simulation engine. Engine code is pure TypeScript: no three.js. */

export type Department = 'fire' | 'police' | 'water' | 'publicworks' | 'transit' | 'ai';

export type ScenarioId = 'water-main' | 'structure-fire' | 'snowstorm' | 'parade';

/** `siloed` = departments acting alone (the "Before AI" replay). */
export type SimMode = 'coordinated' | 'siloed';

/** Time-compression presets available from the transport bar. */
export type Speed = 1 | 2 | 4;

export const SPEEDS: Speed[] = [1, 2, 4];

export type UnitKind = 'engine' | 'ladder' | 'plow' | 'police' | 'utility' | 'ambulance';

/** Display label and vehicle class for each dispatched unit type. */
export interface UnitMeta {
  label: string;
  vehicle: 'fire-truck' | 'plow' | 'police' | 'utility';
}

/** Integer grid coordinate of a road intersection. */
export interface Point {
  i: number;
  j: number;
}

/** Axis-aligned footprint in world units (x east, z south). */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Scores {
  health: number;
  infrastructure: number;
  traffic: number;
  emergency: number;
  transit: number;
}

export interface MetricSet {
  /** Minutes from incident start until the first responding unit arrives on scene. */
  responseTimeMin: number | null;
  /** Minutes until the incident is declared resolved. */
  resolutionMin: number | null;
  /** Peak traffic slowdown attributable to the incident, in percent. */
  peakTrafficDelayPct: number;
  /** Number of cross-department coordination actions the brain performed. */
  coordinatedActions: number;
  /** Lowest overall health score reached during the run. */
  healthLow: number;
  /** Overall health score at the end of the run. */
  healthEnd: number;
  /** Extra minutes passengers spent in transit, summed across affected lines. */
  transitDelayMin: number;
}

/** One-shot response-time delta shown in the Before/After toggle. */
export interface ResponseDelta {
  responseTimeMin: number | null;
  resolutionMin: number | null;
  coordinatedActions: number;
  responseUnit: string;
}

export type Effect =
  | {
      kind: 'incident';
      type: 'water' | 'fire' | 'snow' | 'parade';
      id: string;
      label: string;
      point: Point;
      severity: number;
      radius: number;
      resolveAt: number;
    }
  | { kind: 'detour'; id: string; label: string; blocked: Point[] }
  | {
      kind: 'dispatch';
      id: string;
      unit: UnitKind;
      department: Department;
      from: Point;
      to: Point;
      label: string;
      /** Route the unit along a named corridor instead of the shortest path. */
      corridor?: string;
      /** Overrides the distance/speed estimate when the dispatcher knows better. */
      travelMin?: number;
    }
  | { kind: 'route-update'; id: string; label: string; lines: string[]; affectedRiders: number }
  | { kind: 'green-wave'; id: string; label: string; from: Point; to: Point }
  | { kind: 'note'; id: string; label: string; detail: string }
  | { kind: 'pressure'; district: string; delta: number; label: string }
  | { kind: 'corridor-rank'; corridors: { id: string; name: string; volume: number }[]; label: string }
  | { kind: 'resolve'; id: string; label: string };

/** A single entry in a scenario timeline. `t` is minutes from the incident start. */
export interface ScenarioEvent {
  t: number;
  department: Department;
  action: string;
  effect: Effect;
  /** Agents of the brain: dropped entirely in the siloed (pre-AI) replay. */
  coordination?: boolean;
  /**
   * Explicit pre-AI behaviour. Unlisted fields fall back to the default degrade
   * rule (later, uncoordinated, and without the brain's shared picture).
   */
  siloed?: { t?: number; skip?: boolean; note?: string; effect?: Effect };
}

export interface ScenarioTimeline {
  id: ScenarioId;
  name: string;
  headline: string;
  /** What the mayor is being asked to decide, shown in the launcher. */
  brief: string;
  keywords: string[];
  /** Camera focus when the scenario starts. */
  focus: Point;
  events: ScenarioEvent[];
}

export interface Incident {
  id: string;
  type: 'water' | 'fire' | 'snow' | 'parade';
  label: string;
  point: Point;
  severity: number;
  radius: number;
  startedAt: number;
  resolveAt: number;
  resolved: boolean;
}

export interface Detour {
  id: string;
  label: string;
  /** The blocked stretch, drawn as a closure. */
  blocked: Point[];
  /** The alternative route the brain computed around it. */
  reroute: Point[];
  /** Set when the incident closes out and the street reopens. */
  reopened: boolean;
}

export interface Dispatch {
  id: string;
  unit: UnitKind;
  department: Department;
  label: string;
  agentId: number;
  target: Point;
  dispatchedAt: number;
  /** ETA in minutes, from the coordinator's own estimate. */
  etaMin: number;
  arrivedAt: number | null;
  /** Set when the unit was sent down a named corridor rather than point to point. */
  corridorId: string | null;
}

import type { Rationale } from './decision';

export interface FeedItem {
  id: number;
  t: number;
  department: Department;
  action: string;
  detail: string;
  /** True when the item only exists because departments shared their picture. */
  coordination: boolean;
  scenario: ScenarioId;
  mode: SimMode;
  rationale?: Rationale;
}

export interface Corridor {
  id: string;
  name: string;
  volume: number;
  rank: number;
  /** How many plows have finished this corridor. */
  cleared: number;
  /** Live handling progress of the plow currently on it, 0..1. */
  progress: number;
}

export interface GreenWave {
  id: string;
  label: string;
  points: Point[];
  startedAt: number;
  durationMin: number;
}

export interface WorldState {
  /** Minutes since the simulation started (not wall clock). */
  timeMin: number;
  incidents: Incident[];
  detours: Detour[];
  dispatches: Dispatch[];
  greenWaves: GreenWave[];
  corridors: Corridor[];
  /** Edge keys closed to traffic, as produced by `edgeKey()`. */
  closures: Set<string>;
  /** Optional per-node signal override: 0 = north/south green, 1 = east/west green. */
  signalOverrides: Map<number, number>;
  /** Water network pressure as a 0..1 fraction of nominal. */
  pressure: number;
  trafficDelayPct: number;
  transitDelayMin: number;
  /** Transit lines currently running a detour. */
  activeReroutes: number;
  scores: Scores;
  metrics: MetricSet;
}

export interface RunSummary {
  scenarioId: ScenarioId;
  mode: SimMode;
  metrics: MetricSet;
  feed: FeedItem[];
  /** Health score sampled every minute, for the comparison chart. */
  healthSeries: number[];
  trafficSeries: number[];
}
