/**
 * Vehicle agents. A fleet of plain-data agents walks the road graph edge by
 * edge; positions are integrated from the fixed simulation step, so rendering
 * only ever reads `x`/`z`/`heading` and never mutates simulation state.
 *
 * Movement is per-edge with a lateral lane offset (right-hand traffic) and a
 * stop-line check against the traffic signal at the next intersection.
 */

import { AGENT_COUNTS, AGENT_SPEED, BLOCK, CITY_SEED, LANE_OFFSET } from '@/data/cityConfig';
import type { CityModel } from './city';
import { nodeId, nodeI, nodeJ, NODE_COUNT, worldX, worldZ, type Axis, type NodeId } from './graph';
import { Rng } from './rng';

export type AgentKind = 'car' | 'bus' | 'fire-truck' | 'plow' | 'police' | 'utility';


/** Distance a stopped vehicle keeps from the intersection centre, in units. */
const STOP_DISTANCE = 1.7;
/** Dwell time at a transit stop, in simulated minutes. */
const BUS_DWELL_MIN = 0.12;

export interface Agent {
  id: number;
  kind: AgentKind;
  path: NodeId[];
  leg: number;
  /** Progress along the edge from `path[leg]` to `path[leg + 1]`, 0..1. */
  progress: number;
  speed: number;
  laneOffset: number;
  x: number;
  z: number;
  heading: number;
  state: 'cruise' | 'waiting' | 'idle';
  /** True while the unit is responding to a dispatch. */
  onCall: boolean;
  active: boolean;
  home: NodeId;
  target: NodeId;
  lineId: string | null;
  stopIndex: number;
  dwell: number;
  /** Incremented each time the unit reaches its dispatched target. */
  completedCalls: number;
  /** Emergency light-bar phase, advanced only for on-call units. */
  blink: number;
}

export interface FleetContext {
  dtMin: number;
  /** Signal permission for `axis` at `node`. */
  canPass: (node: NodeId, axis: Axis) => boolean;
  /** Plan a route; the simulator owns closures and penalties. */
  plan: (from: NodeId, to: NodeId) => NodeId[];
}

/** Mutable per-agent state captured so a replay starts from the identical city. */
export interface AgentState {
  id: number;
  leg: number;
  progress: number;
  path: NodeId[];
  active: boolean;
  onCall: boolean;
  target: NodeId;
  home: NodeId;
  stopIndex: number;
  dwell: number;
  x: number;
  z: number;
  heading: number;
  state: Agent['state'];
  completedCalls: number;
}

export interface FleetState {
  agents: AgentState[];
  rng: number;
}

export function axisOf(a: NodeId, b: NodeId): Axis {
  return nodeJ(a) === nodeJ(b) ? 'ew' : 'ns';
}

export class Fleet {
  readonly agents: Agent[] = [];
  readonly byKind: Record<AgentKind, Agent[]> = {
    car: [],
    bus: [],
    'fire-truck': [],
    plow: [],
    police: [],
    utility: [],
  };
  /** O(1) signal lookup by node, built from the city's signal node list. */
  readonly signals: Uint8Array;
  private readonly index = new Map<number, Agent>();
  private readonly rng: Rng;
  private nextId = 0;

  constructor(private readonly city: CityModel, signalNodes: NodeId[], seed = CITY_SEED) {
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.signals = new Uint8Array(NODE_COUNT);
    for (const node of signalNodes) this.signals[node] = 1;
    this.spawnAmbient();
  }

  hasSignal(node: NodeId): boolean {
    return this.signals[node] === 1;
  }

  agent(id: number): Agent | undefined {
    return this.index.get(id);
  }

  /** Capture the exact traffic state, so a scenario replay is deterministic. */
  saveState(): FleetState {
    return {
      rng: this.rng.saveState(),
      agents: this.agents.map((agent) => ({
        id: agent.id,
        leg: agent.leg,
        progress: agent.progress,
        path: agent.path.slice(),
        active: agent.active,
        onCall: agent.onCall,
        target: agent.target,
        home: agent.home,
        stopIndex: agent.stopIndex,
        dwell: agent.dwell,
        x: agent.x,
        z: agent.z,
        heading: agent.heading,
        state: agent.state,
        completedCalls: agent.completedCalls,
      })),
    };
  }

  restoreState(saved: FleetState): void {
    this.rng.loadState(saved.rng);
    for (const state of saved.agents) {
      const agent = this.index.get(state.id);
      if (!agent) continue;
      agent.leg = state.leg;
      agent.progress = state.progress;
      agent.path = state.path.slice();
      agent.active = state.active;
      agent.onCall = state.onCall;
      agent.target = state.target;
      agent.home = state.home;
      agent.stopIndex = state.stopIndex;
      agent.dwell = state.dwell;
      agent.x = state.x;
      agent.z = state.z;
      agent.heading = state.heading;
      agent.state = state.state;
      agent.completedCalls = state.completedCalls;
    }
  }

  private spawnAmbient(): void {
    const fireStation = this.city.landmarks.find((l) => l.kind === 'fire-station');
    const depot = this.city.landmarks.find((l) => l.kind === 'depot');
    const policeHq = this.city.landmarks.find((l) => l.kind === 'police-hq');
    const waterPlant = this.city.landmarks.find((l) => l.kind === 'water-plant');

    for (let n = 0; n < AGENT_COUNTS.cars; n++) {
      const agent = this.create('car', this.randomNode(), this.randomNode());
      this.routeTo(agent, agent.target);
    }

    for (let n = 0; n < AGENT_COUNTS.buses; n++) {
      const stops = this.city.transit.stops;
      const startIndex = Math.floor((n / AGENT_COUNTS.buses) * stops.length);
      const agent = this.create('bus', nodeId(stops[startIndex]!.point.i, stops[startIndex]!.point.j), 0);
      agent.lineId = this.city.transit.id;
      agent.stopIndex = startIndex;
      // Offset each bus along the loop so they are evenly spaced.
      this.routeTo(agent, this.stopNode(startIndex + 1));
      this.fastForward(agent, (n / AGENT_COUNTS.buses) * this.city.transit.loop.length * BLOCK);
    }

    for (let n = 0; n < AGENT_COUNTS['fire-trucks']; n++) {
      this.park('fire-truck', nodeId(fireStation?.point.i ?? 10, fireStation?.point.j ?? 6), n);
    }
    for (let n = 0; n < AGENT_COUNTS.plows; n++) {
      this.park('plow', nodeId(depot?.point.i ?? 17, depot?.point.j ?? 17), n);
    }
    for (let n = 0; n < AGENT_COUNTS.utility; n++) {
      this.park('utility', nodeId(waterPlant?.point.i ?? 6, waterPlant?.point.j ?? 2), n);
    }
    for (let n = 0; n < AGENT_COUNTS.police; n++) {
      const agent = this.create('police', nodeId(policeHq?.point.i ?? 9, policeHq?.point.j ?? 11), 0);
      agent.target = this.randomNode();
      this.routeTo(agent, agent.target);
    }
  }

  private create(kind: AgentKind, home: NodeId, target: NodeId): Agent {
    const agent: Agent = {
      id: this.nextId++,
      kind,
      path: [home],
      leg: 0,
      progress: 0,
      speed: AGENT_SPEED[kind],
      laneOffset: LANE_OFFSET + this.rng.float(-0.12, 0.12),
      x: worldX(nodeI(home)),
      z: worldZ(nodeJ(home)),
      heading: 0,
      state: 'cruise',
      onCall: false,
      active: true,
      home,
      target,
      lineId: null,
      stopIndex: 0,
      dwell: 0,
      completedCalls: 0,
      blink: this.rng.float(0, Math.PI * 2),
    };
    this.agents.push(agent);
    this.byKind[kind].push(agent);
    this.index.set(agent.id, agent);
    return agent;
  }

  private park(kind: AgentKind, home: NodeId, slot: number): Agent {
    const agent = this.create(kind, home, home);
    agent.active = false;
    agent.state = 'idle';
    // Depot slots run along the block behind the building.
    const lateral = (slot - 1) * 2.4;
    agent.x = worldX(nodeI(home)) + lateral;
    agent.z = worldZ(nodeJ(home)) + 3.2;
    agent.heading = 0;
    return agent;
  }

  private randomNode(): NodeId {
    return nodeId(this.rng.int(0, 20), this.rng.int(0, 20));
  }

  private stopNode(index: number): NodeId {
    const stops = this.city.transit.stops;
    const stop = stops[((index % stops.length) + stops.length) % stops.length]!;
    return nodeId(stop.point.i, stop.point.j);
  }

  private routeTo(agent: Agent, target: NodeId, path?: NodeId[]): void {
    const from = agent.path[agent.leg] ?? agent.path[0]!;
    const planned = path ?? this.plan(from, target);
    if (planned.length < 2) {
      // Unreachable (fully closed network): idle instead of teleporting.
      agent.path = [from];
      agent.leg = 0;
      agent.progress = 0;
      agent.state = 'idle';
      return;
    }
    agent.path = planned;
    agent.leg = 0;
    agent.progress = 0;
    agent.target = target;
    agent.state = 'cruise';
  }

  /** Advance an agent along its path so ambient traffic is not all at the start line. */
  private fastForward(agent: Agent, distance: number): void {
    let budget = distance;
    let guard = 0;
    while (budget > 0 && guard++ < 400) {
      const remaining = (1 - agent.progress) * BLOCK;
      if (budget < remaining) {
        agent.progress += budget / BLOCK;
        budget = 0;
      } else {
        budget -= remaining;
        agent.leg += 1;
        agent.progress = 0;
        if (agent.leg >= agent.path.length - 1) break;
      }
    }
    this.integrate(agent);
  }

  /** A private plan hook; the simulator re-plans with closures in mind. */
  private plan(from: NodeId, to: NodeId): NodeId[] {
    return this.city.router.route(from, to);
  }

  /** Bring a parked unit onto the road. Returns null when the fleet is exhausted. */
  dispatch(kind: AgentKind, target: NodeId, from?: NodeId): Agent | null {
    const pool = this.byKind[kind];
    let agent: Agent | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of pool) {
      if (candidate.active && candidate.onCall) continue;
      const distance = manhattanUnits(candidate.path[candidate.leg] ?? candidate.home, from ?? target);
      if (distance < bestDistance) {
        bestDistance = distance;
        agent = candidate;
      }
    }
    if (!agent) return null;
    agent.active = true;
    agent.onCall = true;
    agent.dwell = 0;
    this.routeTo(agent, target);
    return agent;
  }

  /** Send plows down a corridor, from end to end. */
  dispatchAlong(kind: AgentKind, corridorPoints: NodeId[]): Agent | null {
    const pool = this.byKind[kind];
    const agent = pool.find((a) => !a.onCall) ?? null;
    if (!agent) return null;
    agent.active = true;
    agent.onCall = true;
    agent.state = 'cruise';
    agent.path = corridorPoints;
    agent.leg = 0;
    agent.progress = 0;
    agent.target = corridorPoints[corridorPoints.length - 1]!;
    return agent;
  }

  update(ctx: FleetContext): void {
    for (const agent of this.agents) {
      if (!agent.active) continue;
      this.step(agent, ctx);
      this.integrate(agent);
      if (agent.kind === 'fire-truck' || agent.kind === 'plow' || agent.kind === 'police' || agent.kind === 'utility') {
        agent.blink += ctx.dtMin * 12;
      }
    }
  }

  private step(agent: Agent, ctx: FleetContext): void {
    if (agent.dwell > 0) {
      agent.dwell -= ctx.dtMin;
      agent.state = 'waiting';
      return;
    }
    let budget = agent.speed * ctx.dtMin;
    let guard = 0;
    agent.state = 'cruise';
    while (budget > 0 && guard++ < 12) {
      const from = agent.path[agent.leg];
      const to = agent.path[agent.leg + 1];
      if (from === undefined || to === undefined) {
        this.arrive(agent, ctx);
        break;
      }
      const remaining = (1 - agent.progress) * BLOCK;

      if (this.hasSignal(to)) {
        const axis = axisOf(from, to);
        const stopProgress = (BLOCK - STOP_DISTANCE) / BLOCK;
        if (!ctx.canPass(to, axis) && agent.progress < stopProgress) {
          if (remaining <= STOP_DISTANCE) {
            agent.progress = stopProgress;
            agent.state = 'waiting';
            return;
          }
        }
      }

      if (budget < remaining) {
        agent.progress += budget / BLOCK;
        return;
      }
      budget -= remaining;
      agent.leg += 1;
      agent.progress = 0;
      if (agent.leg >= agent.path.length - 1) {
        this.arrive(agent, ctx);
        return;
      }
    }
  }

  /** Agent reached the end of its path: reschedule, or complete a call. */
  private arrive(agent: Agent, ctx: FleetContext): void {
    agent.leg = Math.max(0, agent.path.length - 1);
    agent.progress = 1;
    if (agent.onCall) {
      agent.onCall = false;
      agent.completedCalls += 1;
      if (agent.kind === 'fire-truck' || agent.kind === 'plow' || agent.kind === 'utility') {
        agent.active = false;
        agent.state = 'idle';
        return;
      }
    }
    if (agent.kind === 'bus') {
      agent.dwell = BUS_DWELL_MIN;
      agent.stopIndex += 1;
      this.routeTo(agent, this.stopNode(agent.stopIndex));
      return;
    }
    this.routeTo(agent, this.randomNode());
    void ctx;
  }

  private integrate(agent: Agent): void {
    const from = agent.path[agent.leg];
    const to = agent.path[agent.leg + 1];
    if (from === undefined || to === undefined) return;
    const ax = worldX(nodeI(from));
    const az = worldZ(nodeJ(from));
    const bx = worldX(nodeI(to));
    const bz = worldZ(nodeJ(to));
    const t = Math.min(1, Math.max(0, agent.progress));
    // Right-hand lane offset, inlined: the travel direction rotated +90 degrees
    // on the x/z plane. This runs for every vehicle every step, so it must not
    // build a vector object.
    const dx = Math.sign(nodeI(to) - nodeI(from));
    const dz = Math.sign(nodeJ(to) - nodeJ(from));
    agent.x = ax + (bx - ax) * t - dz * agent.laneOffset;
    agent.z = az + (bz - az) * t + dx * agent.laneOffset;
    agent.heading = Math.atan2(bx - ax, bz - az);
  }
}

function manhattanUnits(a: NodeId, b: NodeId): number {
  return (Math.abs(nodeI(a) - nodeI(b)) + Math.abs(nodeJ(a) - nodeJ(b))) * BLOCK;
}
