/**
 * `CityEngine` is the only mutable bridge between the pure simulation and the
 * React app.
 *
 * The render loop calls `tick(realSeconds)` once per frame: it converts real
 * time into simulated minutes at the selected speed, integrates in fixed steps
 * (so a replay is identical no matter the frame rate), and publishes a snapshot
 * at a throttled rate. React never reads per-frame state; the 3D scene reaches
 * into the world and the fleet directly through this object.
 *
 * Two runs share one vehicle fleet: an event-less "nominal" run that keeps the
 * clock and the ambient traffic alive between incidents, and the scenario run
 * currently being replayed.
 */

import { CITY_SEED, DISTRICT_NAME, FIXED_STEP_MIN, SIM_MIN_PER_REAL_SECOND } from '@/data/cityConfig';
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { signalNodeIds, generateCity, type CityModel } from './city';
import { Fleet, type FleetState } from './agents';
import { Simulation, runHeadless } from './sim';
import type {
  Corridor,
  Detour,
  FeedItem,
  Incident,
  MetricSet,
  Point,
  ResponseDelta,
  RunSummary,
  ScenarioId,
  ScenarioTimeline,
  SimMode,
  Scores,
  Speed,
  UnitKind,
} from './types';

/** Dispatch state flattened for the UI (no engine references leak out). */
export interface SnapshotDispatch {
  id: string;
  label: string;
  unit: UnitKind;
  department: FeedItem['department'];
  etaMin: number;
  elapsedMin: number;
  progress: number;
  arrived: boolean;
}

export interface EngineSnapshot {
  scenarioId: ScenarioId | null;
  scenarioName: string;
  headline: string;
  brief: string;
  district: string;
  running: boolean;
  paused: boolean;
  speed: Speed;
  mode: SimMode;
  timeMin: number;
  totalMin: number;
  clockMinutes: number;
  progress: number;
  scores: Scores;
  metrics: MetricSet;
  comparisonDelta: ResponseDelta | null;
  incidents: Incident[];
  detours: Detour[];
  corridors: Corridor[];
  dispatches: SnapshotDispatch[];
  /** Where the incident is, for the camera and the map overlay. */
  incidentCenter: Point | null;
  /** Bumped whenever the camera should fly somewhere new. */
  focusToken: number;
  focus: Point | null;
}

export interface EngineUpdate {
  snapshot: EngineSnapshot;
  /** Feed items produced since the previous publish (already includes `finished`). */
  feed: readonly FeedItem[];
  /** Present on the publish that finishes a run. */
  finished: RunSummary | null;
}

export interface Comparison {
  scenarioId: ScenarioId;
  coordinated: RunSummary;
  siloed: RunSummary;
}

/** Publish at most ~12x a second; the 3D view reads the engine directly. */
const PUBLISH_INTERVAL_SEC = 0.08;

const NOMINAL_SCENARIO: ScenarioTimeline = {
  id: 'water-main',
  name: 'Live city feed',
  headline: 'Nominal operations',
  brief: 'All departments on shift. Trigger an incident to watch the brain coordinate a response.',
  keywords: [],
  focus: { i: 10, j: 10 },
  events: [],
};

/** The whole app shares one engine: it is the single source of simulated truth. */
export class CityEngine {
  readonly city: CityModel;
  readonly fleet: Fleet;
  readonly seed = CITY_SEED;
  speed: Speed = 1;
  paused = false;
  mode: SimMode = 'coordinated';

  private scenarioSim: Simulation | null = null;
  private nominalSim: Simulation;
  private accumulator = 0;
  private sincePublish = 0;
  private focusToken = 0;
  private focus: Point | null = null;
  private readonly baselineFleet: FleetState;
  private readonly listeners = new Set<(update: EngineUpdate) => void>();
  private readonly comparisonCache = new Map<ScenarioId, Comparison>();

  constructor() {
    this.city = generateCity(this.seed);
    this.fleet = new Fleet(this.city, signalNodeIds(), this.seed);
    this.baselineFleet = this.fleet.saveState();
    this.nominalSim = this.createNominal();
  }

  subscribe(listener: (update: EngineUpdate) => void): () => void {
    this.listeners.add(listener);
    listener({ snapshot: this.snapshot(), feed: [], finished: null });
    return () => this.listeners.delete(listener);
  }

  /** The run the 3D scene should render: the scenario if there is one, else ambient. */
  get simulation(): Simulation {
    return this.scenarioSim ?? this.nominalSim;
  }

  get scenarioRunning(): boolean {
    return this.scenarioSim !== null;
  }

  /** Frame hook: advance the simulation by `realSeconds` of wall-clock time. */
  tick(realSeconds: number): void {
    if (this.scenarioSim && this.paused) return;
    const dt = Math.min(0.25, realSeconds);
    this.accumulator += dt * SIM_MIN_PER_REAL_SECOND * this.speed;

    let feed: FeedItem[] | null = null;
    let finished: RunSummary | null = null;
    let guard = 0;

    while (this.accumulator >= FIXED_STEP_MIN && guard++ < 96) {
      this.accumulator -= FIXED_STEP_MIN;
      const sim = this.scenarioSim ?? this.nominalSim;
      const items = sim.advance();
      if (items.length > 0) {
        feed = feed ?? [];
        for (const item of items) feed.push(item);
      }
      if (sim.finished) {
        finished = sim.summary();
        // Hand the city back to the ambient run, keeping the clock continuous.
        this.nominalSim.seekTo(sim.world.timeMin);
        this.scenarioSim = null;
        break;
      }
    }

    this.sincePublish += dt;
    if (finished || feed || this.sincePublish >= PUBLISH_INTERVAL_SEC) {
      this.sincePublish = 0;
      this.publish(feed ?? [], finished);
    }
  }

  /**
   * Start (or restart) a scenario from t = 0. The fleet is rewound to the
   * baseline traffic snapshot first, so the same incident always plays out with
   * the same vehicles in the same places.
   */
  start(scenarioId: ScenarioId, mode: SimMode = this.mode): void {
    const scenario = SCENARIO_BY_ID.get(scenarioId);
    if (!scenario) return;
    this.fleet.restoreState(this.baselineFleet);
    this.mode = mode;
    this.scenarioSim = new Simulation({ city: this.city, scenario, mode, fleet: this.fleet });
    this.accumulator = 0;
    this.sincePublish = 0;
    this.paused = false;
    this.focusToken += 1;
    this.focus = scenario.focus;
    this.publish([], null);
  }

  /** Leave the scenario and go back to the ambient city. */
  stop(): void {
    if (this.scenarioSim) this.nominalSim.seekTo(this.scenarioSim.world.timeMin);
    this.scenarioSim = null;
    this.paused = false;
    this.focus = null;
    this.publish([], null);
  }

  togglePause(): void {
    if (!this.scenarioSim) return;
    this.paused = !this.paused;
    this.publish([], null);
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.publish([], null);
  }

  /** Switch Before/After and replay the same incident from the top. */
  setMode(mode: SimMode): void {
    const current = this.scenarioSim?.scenario.id;
    this.mode = mode;
    if (current) this.start(current, mode);
    else this.publish([], null);
  }

  /** Force a camera move (clicking an incident in the UI). */
  focusOn(point: Point): void {
    this.focus = point;
    this.focusToken += 1;
    this.publish([], null);
  }

  snapshot(): EngineSnapshot {
    const sim = this.simulation;
    const world = sim.world;
    const nominal = sim.isNominal;
    return {
      scenarioId: nominal ? null : sim.scenario.id,
      scenarioName: sim.scenario.name,
      headline: sim.scenario.headline,
      brief: sim.scenario.brief,
      district: DISTRICT_NAME,
      running: !nominal && !sim.finished,
      paused: this.paused,
      speed: this.speed,
      mode: this.mode,
      timeMin: world.timeMin,
      totalMin: sim.totalMin,
      clockMinutes: sim.clockMinutes,
      progress: nominal ? 0 : Math.min(1, world.timeMin / sim.totalMin),
      scores: { ...world.scores },
      metrics: { ...world.metrics },
      comparisonDelta: nominal || !sim.scenario.id ? null : this.computeComparisonDelta(sim.scenario.id),
      incidents: world.incidents.map((incident) => ({ ...incident })),
      detours: world.detours.map((detour) => ({ ...detour })),
      corridors: world.corridors.map((corridor) => ({ ...corridor })),
      dispatches: world.dispatches.map((dispatch) => ({
        id: dispatch.id,
        label: dispatch.label,
        unit: dispatch.unit,
        department: dispatch.department,
        etaMin: dispatch.etaMin,
        elapsedMin: (dispatch.arrivedAt ?? world.timeMin) - dispatch.dispatchedAt,
        progress:
          dispatch.arrivedAt !== null
            ? 1
            : Math.min(1, (world.timeMin - dispatch.dispatchedAt) / Math.max(0.05, dispatch.etaMin)),
        arrived: dispatch.arrivedAt !== null,
      })),
      incidentCenter: world.incidents[0]?.point ?? null,
      focusToken: this.focusToken,
      focus: this.focus,
    };
  }

  /** Compute the response-time delta between the two modes for the current scenario. */
  private computeComparisonDelta(scenarioId: ScenarioId): ResponseDelta {
    const scenario = SCENARIO_BY_ID.get(scenarioId);
    if (!scenario) return { responseTimeMin: null, resolutionMin: null, coordinatedActions: 0, responseUnit: 'min' };
    const c = runHeadless(this.city, scenario, 'coordinated');
    const s = runHeadless(this.city, scenario, 'siloed');
    return {
      responseTimeMin: c.metrics.responseTimeMin !== null && s.metrics.responseTimeMin !== null
        ? s.metrics.responseTimeMin - c.metrics.responseTimeMin
        : null,
      resolutionMin: c.metrics.resolutionMin !== null && s.metrics.resolutionMin !== null
        ? s.metrics.resolutionMin - c.metrics.resolutionMin
        : null,
      coordinatedActions: c.metrics.coordinatedActions - s.metrics.coordinatedActions,
      responseUnit: 'min',
    };
  }

  /** Fast-forward both modes and cache the pair for the comparison card. */
  comparison(scenarioId: ScenarioId): Comparison {
    const cached = this.comparisonCache.get(scenarioId);
    if (cached) return cached;
    const scenario = SCENARIO_BY_ID.get(scenarioId);
    if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
    const comparison: Comparison = {
      scenarioId,
      coordinated: runHeadless(this.city, scenario, 'coordinated'),
      siloed: runHeadless(this.city, scenario, 'siloed'),
    };
    this.comparisonCache.set(scenarioId, comparison);
    return comparison;
  }

  private createNominal(): Simulation {
    return new Simulation({
      city: this.city,
      scenario: NOMINAL_SCENARIO,
      mode: 'coordinated',
      fleet: this.fleet,
      durationMin: Number.POSITIVE_INFINITY,
    });
  }

  private publish(feed: readonly FeedItem[], finished: RunSummary | null): void {
    const update: EngineUpdate = { snapshot: this.snapshot(), feed, finished };
    for (const listener of this.listeners) listener(update);
  }
}

export const cityEngine = new CityEngine();
