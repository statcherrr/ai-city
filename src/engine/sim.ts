/**
 * The simulation core.
 *
 * A `Simulation` owns one scenario run: it consumes the scenario timeline as
 * simulated minutes pass, applies each typed effect to the world state, drives
 * the vehicle fleet, and derives the live metrics (response time, traffic
 * delay, health score) the dashboard reads.
 *
 * Everything is a pure function of (city, scenario, mode, elapsed time), so the
 * same run can either be stepped interactively for the 3D view or fast-forwarded
 * headlessly to fill the Before/After comparison card.
 */

import { AGENT_SPEED, BLOCK, DISTRICT_NAME, FIXED_STEP_MIN, START_CLOCK_MIN } from '@/data/cityConfig';
import { UNITS } from '@/data/units';
import { signalNodeIds, type CityModel } from './city';
import { Fleet, type FleetContext } from './agents';
import { edgeKey, nodeI, nodeJ, pointToId, type Axis, type NodeId } from './graph';
import { easeScores, easeTowards, targetScores } from './scoring';
import { applyGreenWaves, signalColor } from './signals';
import {
  buildRationale,
  generateCandidateActions,
  selectBest,
  type CandidateAction,
  type IsolationContext,
  type Rationale,
  type Signal,
} from './decision';
import type {
  Corridor,
  Effect,
  FeedItem,
  Incident,
  RunSummary,
  ScenarioEvent,
  ScenarioTimeline,
  SimMode,
  WorldState,
} from './types';

/** Default degrade applied to pre-AI timelines that have no explicit override. */
const SILOED_SLACK = 1.35;

/** Minutes a department spends on its own paperwork before a unit leaves the barn. */
const DISPATCH_PROCESSING_MIN: Record<SimMode, number> = {
  coordinated: 0.15,
  siloed: 1.6,
};

/** Transit delay accrued per minute, per disrupted line. */
const TRANSIT_DELAY_PER_LINE_MIN = 0.35;

/**
 * A planned detour costs riders far less than buses stuck behind a closure with
 * no warning — that is the whole point of rerouting them early.
 */
const REROUTE_MITIGATION = 0.45;

/**
 * Without a shared picture, crews bring the wrong gear and take longer to
 * control an incident, so the same event lands harder on the city.
 */
const SILOED_IMPACT_MULTIPLIER = 1.25;

const DEFAULT_SILOED_DELAY: Record<Effect['kind'], number> = {
  incident: 2,
  detour: 3,
  dispatch: 3,
  'route-update': 6,
  'green-wave': 3,
  pressure: 3,
  'corridor-rank': 2,
  note: 2,
  resolve: 4,
};

export interface SimulationOptions {
  city: CityModel;
  scenario: ScenarioTimeline;
  mode: SimMode;
  /** Share one fleet across runs so the city keeps living between incidents. */
  fleet?: Fleet;
  /** Overrides the run length; the ambient (event-less) run never ends. */
  durationMin?: number;
}

export class Simulation {
  readonly city: CityModel;
  readonly scenario: ScenarioTimeline;
  readonly mode: SimMode;
  readonly world: WorldState;
  readonly fleet: Fleet;
  /** The scenario timeline resolved for this mode (see `resolveTimeline`). */
  readonly timeline: ScenarioEvent[];
  /** Minutes of simulation this run covers, including a short tail. */
  readonly totalMin: number;

  /** Set on the first event: the clock every response time is measured from. */
  incidentStartMin: number | null = null;
  finished = false;

  private cursor = 0;
  private readonly feed: FeedItem[] = [];
  private feedSeq = 0;
  private readonly healthSeries: number[] = [];
  private readonly trafficSeries: number[] = [];
  private nextSampleMin = 0;
  private readonly routeOptions: { closed: ReadonlySet<string> };
  private readonly fleetCtx: FleetContext;
  private readonly lastEventT: number;

  constructor(options: SimulationOptions) {
    this.city = options.city;
    this.scenario = options.scenario;
    this.mode = options.mode;
    this.timeline = resolveTimeline(options.scenario, options.mode);
    this.lastEventT = this.timeline.reduce((max, e) => Math.max(max, e.t), 0);
    this.totalMin = options.durationMin ?? this.lastEventT + 2;

    this.world = {
      timeMin: 0,
      incidents: [],
      detours: [],
      dispatches: [],
      greenWaves: [],
      corridors: [],
      closures: new Set<string>(),
      signalOverrides: new Map<number, number>(),
      pressure: 1,
      trafficDelayPct: 0,
      transitDelayMin: 0,
      activeReroutes: 0,
      scores: { health: 94, infrastructure: 96, traffic: 94, emergency: 95, transit: 93 },
      metrics: {
        responseTimeMin: null,
        resolutionMin: null,
        peakTrafficDelayPct: 0,
        coordinatedActions: 0,
        healthLow: 94,
        healthEnd: 94,
        transitDelayMin: 0,
      },
    };
    // The router reads closures from this set by reference; it is mutated in place.
    this.routeOptions = { closed: this.world.closures };

    this.fleet = options.fleet ?? new Fleet(this.city, signalNodeIds(), this.city.seed);

    this.fleetCtx = {
      dtMin: FIXED_STEP_MIN,
      canPass: (node, axis) => this.canPass(node, axis),
      plan: (from, to) => this.plan(from, to),
    };
  }

  /** Wall-clock minutes past midnight at the current simulation time. */
  get clockMinutes(): number {
    return (START_CLOCK_MIN + this.world.timeMin) % 1440;
  }

  /** True for the run that carries ambient traffic between incidents. */
  get isNominal(): boolean {
    return this.scenario.events.length === 0;
  }

  get timeSec(): number {
    return this.world.timeMin * 60;
  }

  /** Advance the run by one fixed step; returns any new feed items. */
  advance(): readonly FeedItem[] {
    if (this.finished) return EMPTY_FEED;
    const before = this.feed.length;
    this.consumeEvents();
    this.world.timeMin += FIXED_STEP_MIN;
    applyGreenWaves(this.world);
    this.fleet.update(this.fleetCtx);
    this.settleArrivals();
    this.updateDerived(FIXED_STEP_MIN);
    if (this.world.timeMin >= this.totalMin) this.finished = true;
    return this.feed.length === before ? EMPTY_FEED : this.feed.slice(before);
  }

  getFeed(): readonly FeedItem[] {
    return this.feed;
  }

  /** Move the run clock without simulating, used when handing over the city. */
  seekTo(timeMin: number): void {
    this.world.timeMin = timeMin;
  }

  summary(): RunSummary {
    return {
      scenarioId: this.scenario.id,
      mode: this.mode,
      metrics: { ...this.world.metrics },
      feed: [...this.feed],
      healthSeries: [...this.healthSeries],
      trafficSeries: [...this.trafficSeries],
    };
  }

  private plan(from: NodeId, to: NodeId): NodeId[] {
    return this.city.router.route(from, to, this.routeOptions);
  }

  private canPass(node: NodeId, axis: Axis): boolean {
    return signalColor(this.world, node, axis, this.timeSec) === 'green';
  }

  private consumeEvents(): void {
    while (this.cursor < this.timeline.length) {
      const event = this.timeline[this.cursor]!;
      if (event.t > this.world.timeMin) break;
      this.cursor++;
      this.applyEvent(event);
    }
  }

  private applyEvent(event: ScenarioEvent): void {
    const effect = event.effect;
    if (event.coordination) this.world.metrics.coordinatedActions++;
    if (this.incidentStartMin === null) this.incidentStartMin = this.world.timeMin;

    switch (effect.kind) {
      case 'incident':
        this.startIncident(effect, event);
        break;
      case 'detour':
        this.closeRoute(effect.id, effect.label, effect.blocked, event);
        break;
      case 'dispatch':
        this.dispatchUnit(effect, event);
        break;
      case 'green-wave':
        this.preemptSignals(effect.id, effect.label, effect.from, effect.to, event);
        break;
      case 'pressure':
        this.world.pressure = clamp(this.world.pressure + effect.delta, 0.08, 1.05);
        this.log(
          event,
          `${effect.district} pressure ${effect.delta > 0 ? 'restored' : 'reduced'}`,
          effect.label,
        );
        break;
      case 'corridor-rank':
        this.world.corridors = effect.corridors.map<Corridor>((c, index) => ({
          id: c.id,
          name: c.name,
          volume: c.volume,
          rank: index + 1,
          cleared: 0,
          progress: 0,
        }));
        this.log(event, event.action, `${effect.corridors.length} corridors ranked by ridership`);
        break;
      case 'route-update':
        this.world.activeReroutes += effect.lines.length;
        this.log(
          event,
          event.action,
          `${effect.lines.length} line(s) rerouted · ${effect.affectedRiders.toLocaleString()} riders/day`,
        );
        break;
      case 'note':
        this.log(event, effect.label, effect.detail);
        break;
      case 'resolve':
        this.resolveIncident(effect.id, event);
        break;
    }
  }

  private startIncident(effect: Extract<Effect, { kind: 'incident' }>, event: ScenarioEvent): void {
    const signals: Signal[] = [
      {
        id: `incident-${effect.id}`,
        department: event.department,
        description: `New incident: ${effect.label}`,
        priority: 5,
      },
    ];

    const isolationContext: IsolationContext = {
      mode: this.mode,
      department: this.mode === 'siloed' ? event.department : undefined,
    };

    const candidates = generateCandidateActions(signals, isolationContext);
    const selected = selectBest(candidates.length > 0 ? candidates : [
      {
        id: `incident-response-${effect.id}`,
        department: [event.department],
        estimatedResponseTimeDelta: 8,
        peopleAffected: 150,
        vehiclesAffected: 80,
        cost: 600,
        confidence: 0.8,
      },
    ]);
    const rationale = buildRationale(
      signals.map((s) => s.description),
      selected.chosen,
      selected.rejected
    );

    const incident: Incident = {
      id: effect.id,
      type: effect.type,
      label: effect.label,
      point: effect.point,
      radius: effect.radius,
      startedAt: this.world.timeMin,
      resolveAt: this.world.timeMin + effect.resolveAt,
      resolved: false,
      severity: effect.severity * (this.mode === 'siloed' ? SILOED_IMPACT_MULTIPLIER : 1),
    };
    this.world.incidents.push(incident);
    this.log(event, event.action, `${effect.severity}/10 severity · ${DISTRICT_NAME}`, rationale);
  }

  private resolveIncident(id: string, event: ScenarioEvent): void {
    const signals: Signal[] = [
      {
        id: `resolve-${id}`,
        department: event.department,
        description: `Resolve incident ${id}`,
        priority: 4,
      },
    ];

    const isolationContext: IsolationContext = {
      mode: this.mode,
      department: this.mode === 'siloed' ? event.department : undefined,
    };

    const candidates = generateCandidateActions(signals, isolationContext);
    const selected = selectBest(candidates.length > 0 ? candidates : [
      {
        id: `resolve-fallback-${id}`,
        department: [event.department],
        estimatedResponseTimeDelta: 12,
        peopleAffected: 100,
        vehiclesAffected: 60,
        cost: 400,
        confidence: 0.8,
      },
    ]);
    const rationale = buildRationale(
      signals.map((s) => s.description),
      selected.chosen,
      selected.rejected
    );

    const incident = this.world.incidents.find((i) => i.id === id);
    if (incident) incident.resolved = true;
    if (this.world.metrics.resolutionMin === null && this.incidentStartMin !== null) {
      this.world.metrics.resolutionMin = this.world.timeMin - this.incidentStartMin;
    }
    for (const detour of this.world.detours) detour.reopened = true;
    this.world.closures.clear();
    this.world.activeReroutes = 0;
    this.log(event, event.action, `Resolved ${this.world.timeMin.toFixed(0)} min after the call`, rationale);
  }

  private closeRoute(
    id: string,
    label: string,
    blocked: { i: number; j: number }[],
    event: ScenarioEvent,
  ): void {
    const signals: Signal[] = [
      {
        id: `reroute-${id}`,
        department: event.department,
        description: `Reroute required: ${label}`,
        priority: 4,
      },
    ];
    if (this.world.incidents.length > 0) {
      signals.push({
        id: `incident-for-reroute-${this.world.incidents[0]?.id}`,
        department: event.department,
        description: 'Incident blocks route',
        priority: 5,
      });
    }

    const isolationContext: IsolationContext = {
      mode: this.mode,
      department: this.mode === 'siloed' ? event.department : undefined,
    };

    const candidates = generateCandidateActions(signals, isolationContext);
    const selected = selectBest(candidates.length > 0 ? candidates : [
      {
        id: `reroute-fallback-${id}`,
        department: [event.department],
        estimatedResponseTimeDelta: 15,
        peopleAffected: 200,
        vehiclesAffected: 150,
        cost: 800,
        confidence: 0.75,
      },
    ]);
    const rationale = buildRationale(
      signals.map((s) => s.description),
      selected.chosen,
      selected.rejected
    );

    const nodes = blocked.map(pointToId);
    for (let k = 0; k + 1 < nodes.length; k++) {
      this.world.closures.add(edgeKey(nodes[k]!, nodes[k + 1]!));
    }
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    let reroute = this.plan(first, last);
    if (reroute.length < 2) reroute = this.plan(last, first);
    this.world.detours.push({
      id,
      label,
      blocked: blocked.slice(),
      reroute: reroute.map((node) => ({ i: nodeI(node), j: nodeJ(node) })),
      reopened: false,
    });
    this.log(
      event,
      event.action,
      `${nodes.length} blocks closed · detour ${Math.max(0, reroute.length - 1)} blocks`,
      rationale,
    );
  }

  private dispatchUnit(effect: Extract<Effect, { kind: 'dispatch' }>, event: ScenarioEvent): void {
    const vehicle = UNITS[effect.unit].vehicle;
    const from = pointToId(effect.from);
    const to = pointToId(effect.to);
    const processing = DISPATCH_PROCESSING_MIN[this.mode];

    // Generate signals from current state
    const signals: Signal[] = [
      {
        id: `dispatch-${effect.id}`,
        department: effect.department,
        description: `Dispatch request: ${effect.label}`,
        priority: 3,
      },
    ];
    if (this.world.incidents.length > 0) {
      signals.push({
        id: `incident-active-${this.world.incidents[0]?.id}`,
        department: effect.department,
        description: 'Active incident requiring response',
        priority: 5,
      });
    }

    const isolationContext: IsolationContext = {
      mode: this.mode,
      department: this.mode === 'siloed' ? event.department : undefined,
    };

    const candidates = generateCandidateActions(signals, isolationContext);
    const selected = selectBest(candidates.length > 0 ? candidates : [
      {
        id: `dispatch-fallback-${effect.id}`,
        department: [effect.department],
        estimatedResponseTimeDelta: 10,
        peopleAffected: 100,
        vehiclesAffected: 50,
        cost: 500,
        confidence: 0.7,
      },
    ]);
    const rationale = buildRationale(
      signals.map((s) => s.description),
      selected.chosen,
      selected.rejected
    );

    let agentId: number | null = null;
    let travelMin = 0;

    if (effect.corridor) {
      const corridor = this.city.corridors.find((c) => c.id === effect.corridor);
      const points = corridor ? corridor.points.map(pointToId) : [];
      const agent = points.length > 1 ? this.fleet.dispatchAlong(vehicle, points) : null;
      agentId = agent?.id ?? null;
      travelMin = points.length > 1 ? ((points.length - 1) * BLOCK) / AGENT_SPEED[vehicle] : 0;
    } else {
      const agent = this.fleet.dispatch(vehicle, to, from);
      agentId = agent?.id ?? null;
      const start = agent?.path[agent.leg];
      travelMin =
        start === undefined ? 0 : this.city.router.distance(start, to, this.routeOptions) / AGENT_SPEED[vehicle];
    }

    if (agentId === null) {
      this.log(event, event.action, 'No unit available — request queued', rationale);
      return;
    }

    const agent = this.fleet.agent(agentId);
    if (agent) agent.dwell = processing;

    const etaMin = processing + travelMin;
    this.world.dispatches.push({
      id: effect.id,
      unit: effect.unit,
      department: effect.department,
      label: effect.label,
      agentId,
      target: effect.to,
      dispatchedAt: this.world.timeMin,
      etaMin,
      arrivedAt: null,
      corridorId: effect.corridor ?? null,
    });
    this.log(event, event.action, `ETA ${etaMin.toFixed(1)} min · ${UNITS[effect.unit].label}`, rationale);
  }

  private preemptSignals(
    id: string,
    label: string,
    from: { i: number; j: number },
    to: { i: number; j: number },
    event: ScenarioEvent,
  ): void {
    const signals: Signal[] = [
      {
        id: `signal-${id}`,
        department: event.department,
        description: `Signal preemption: ${label}`,
        priority: 4,
      },
    ];
    if (this.world.incidents.length > 0) {
      signals.push({
        id: `incident-for-signal-${this.world.incidents[0]?.id}`,
        department: event.department,
        description: 'Route clearance needed for emergency response',
        priority: 5,
      });
    }

    const isolationContext: IsolationContext = {
      mode: this.mode,
      department: this.mode === 'siloed' ? event.department : undefined,
    };

    const candidates = generateCandidateActions(signals, isolationContext);
    const selected = selectBest(candidates.length > 0 ? candidates : [
      {
        id: `signal-fallback-${id}`,
        department: [event.department],
        estimatedResponseTimeDelta: 5,
        peopleAffected: 50,
        vehiclesAffected: 80,
        cost: 300,
        confidence: 0.7,
      },
    ]);
    const rationale = buildRationale(
      signals.map((s) => s.description),
      selected.chosen,
      selected.rejected
    );

    const path = this.plan(pointToId(from), pointToId(to));
    if (path.length < 2) {
      this.log(event, event.action, 'No valid path for signal preemption', rationale);
      return;
    }
    this.world.greenWaves.push({
      id,
      label,
      points: path.map((node) => ({ i: nodeI(node), j: nodeJ(node) })),
      startedAt: this.world.timeMin,
      durationMin: 6,
    });
    this.log(event, event.action, `${path.length - 1} intersections pre-empted`, rationale);
  }

  /** Attribute unit arrivals to dispatches, and advance corridor clearing. */
  private settleArrivals(): void {
    for (const dispatch of this.world.dispatches) {
      const agent = this.fleet.agent(dispatch.agentId);
      if (!agent) continue;

      if (dispatch.corridorId && dispatch.arrivedAt === null) {
        const corridor = this.corridorOf(dispatch);
        if (corridor) {
          corridor.progress = Math.min(1, agent.leg / Math.max(1, agent.path.length - 1));
        }
      }
      if (dispatch.arrivedAt !== null || agent.onCall) continue;

      dispatch.arrivedAt = this.world.timeMin;
      const corridor = dispatch.corridorId ? this.corridorOf(dispatch) : null;
      if (corridor) {
        corridor.cleared += 1;
        corridor.progress = 1;
        this.push({
          department: 'publicworks',
          action: `${dispatch.label} cleared`,
          detail: `Moving to the next ranked assignment · ${corridor.name}`,
          coordination: false,
        });
      }
      if (this.incidentStartMin !== null) {
        const response = this.world.timeMin - this.incidentStartMin;
        const current = this.world.metrics.responseTimeMin;
        if (current === null || response < current) this.world.metrics.responseTimeMin = response;
      }
    }
  }

  private corridorOf(dispatch: { corridorId: string | null }): Corridor | null {
    if (!dispatch.corridorId) return null;
    return this.world.corridors.find((c) => c.id === dispatch.corridorId) ?? null;
  }

  private updateDerived(dtMin: number): void {
    const world = this.world;

    const unresolved = world.incidents.reduce((sum, inc) => (inc.resolved ? sum : sum + inc.severity), 0);
    const target = Math.min(88, world.closures.size * 3.1 + unresolved * 4.2 + 6);
    world.trafficDelayPct = easeTowards(world.trafficDelayPct, target, dtMin, 0.5);

    // Transit keeps losing time for as long as the disruption stands. An
    // early, planned reroute cuts that loss roughly in half.
    const disrupted = world.activeReroutes > 0 || world.closures.size > 0 || unresolved > 0;
    if (disrupted) {
      const lines = Math.max(1, world.activeReroutes);
      const mitigation = world.activeReroutes > 0 && this.mode === 'coordinated' ? REROUTE_MITIGATION : 1;
      world.transitDelayMin += dtMin * TRANSIT_DELAY_PER_LINE_MIN * lines * mitigation;
      world.metrics.transitDelayMin = world.transitDelayMin;
    }

    easeScores(world.scores, targetScores(world), dtMin);
    const metrics = world.metrics;
    metrics.peakTrafficDelayPct = Math.max(metrics.peakTrafficDelayPct, world.trafficDelayPct);
    metrics.healthLow = Math.min(metrics.healthLow, world.scores.health);
    metrics.healthEnd = world.scores.health;

    if (world.timeMin >= this.nextSampleMin) {
      this.nextSampleMin += 1;
      this.healthSeries.push(world.scores.health);
      this.trafficSeries.push(world.trafficDelayPct);
    }
  }

  private log(event: ScenarioEvent, action: string, detail: string, rationale?: Rationale): void {
    this.push({
      department: event.department,
      action,
      detail,
      coordination: event.coordination === true,
      rationale,
    });
  }

  private push(item: {
    department: FeedItem['department'];
    action: string;
    detail: string;
    coordination: boolean;
    rationale?: Rationale;
  }): void {
    const rationale = item.rationale ?? {
      signalsObserved: [item.action],
      chosenAction: {
        id: `default-${item.action}`,
        department: [item.department],
        estimatedResponseTimeDelta: 0,
        peopleAffected: 0,
        vehiclesAffected: 0,
        cost: 0,
        confidence: 0.7,
      } as any,
      alternativesRejected: [],
      metricDeltas: {
        responseTimeDelta: 0,
        peopleAffected: 0,
        vehiclesAffected: 0,
        costDelta: 0,
      },
    };
    this.feed.push({
      id: this.feedSeq++,
      t: this.world.timeMin,
      department: item.department,
      action: item.action,
      detail: item.detail,
      scenario: this.scenario.id,
      mode: this.mode,
      coordination: item.coordination,
      rationale,
    });
  }
}

const EMPTY_FEED: readonly FeedItem[] = [];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolve a timeline for the requested mode. Coordinated runs use the authored
 * times; siloed runs push each event later (or drop it entirely when the event
 * only exists because departments shared their picture).
 */
export function resolveTimeline(scenario: ScenarioTimeline, mode: SimMode): ScenarioEvent[] {
  if (mode === 'coordinated') return [...scenario.events].sort((a, b) => a.t - b.t);

  const out: ScenarioEvent[] = [];
  for (const event of scenario.events) {
    const override = event.siloed;
    if (override?.skip) continue;
    if (event.coordination && !override) continue;
    const t = override?.t ?? event.t * SILOED_SLACK + DEFAULT_SILOED_DELAY[event.effect.kind];
    out.push({
      ...event,
      t,
      action: override?.note ?? event.action,
      effect: override?.effect ?? event.effect,
      coordination: false,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Fast-forward a whole run; used to fill comparison cards. */
export function runHeadless(city: CityModel, scenario: ScenarioTimeline, mode: SimMode): RunSummary {
  const sim = new Simulation({ city, scenario, mode });
  const guard = Math.ceil(sim.totalMin / FIXED_STEP_MIN) + 4;
  for (let i = 0; i < guard && !sim.finished; i++) sim.advance();
  return sim.summary();
}
