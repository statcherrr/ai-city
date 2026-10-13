/**
 * The road network: a 21x21 intersection lattice with A* routing.
 *
 * The router reuses flat typed arrays across calls (a generation stamp avoids
 * clearing them), so re-planning a route during a scenario allocates nothing
 * beyond the returned path.
 */

import { BLOCK, CITY_HALF, NODES_PER_SIDE } from '@/data/cityConfig';
import type { Point } from './types';

export type NodeId = number;

export const NODE_COUNT = NODES_PER_SIDE * NODES_PER_SIDE;
const GRID_LIMIT = NODES_PER_SIDE - 1;

export const nodeId = (i: number, j: number): NodeId => j * NODES_PER_SIDE + i;
export const nodeI = (id: NodeId): number => id % NODES_PER_SIDE;
export const nodeJ = (id: NodeId): number => Math.floor(id / NODES_PER_SIDE);
export const worldX = (i: number): number => i * BLOCK - CITY_HALF;
export const worldZ = (j: number): number => j * BLOCK - CITY_HALF;

export const pointToId = (p: Point): NodeId =>
  nodeId(clampIndex(p.i), clampIndex(p.j));

export const idToPoint = (id: NodeId): Point => ({ i: nodeI(id), j: nodeJ(id) });

function clampIndex(v: number): number {
  return Math.max(0, Math.min(NODES_PER_SIDE - 1, Math.round(v)));
}

export function edgeKey(a: NodeId, b: NodeId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export type Axis = 'ew' | 'ns';

export interface RoadEdge {
  a: NodeId;
  b: NodeId;
  key: string;
  axis: Axis;
  length: number;
  /** True where the road spans the river. */
  bridge: boolean;
  /** Index into the corridor list, when this stretch belongs to a named corridor. */
  corridor: number;
}

export interface Link {
  to: NodeId;
  edge: number;
}

export interface RoadGraph {
  edges: RoadEdge[];
  links: Link[][];
  /** bridge cells, keyed by the block index pair the bridge crosses. */
  bridgeBlocks: Set<number>;
}

export interface GraphOptions {
  /** Return true when the block (i, j) is water, so the crossing is a bridge. */
  isWater?: (i: number, j: number) => boolean;
}

export function buildRoadGraph(options: GraphOptions = {}): RoadGraph {
  const edges: RoadEdge[] = [];
  const links: Link[][] = Array.from({ length: NODE_COUNT }, () => []);
  const bridgeBlocks = new Set<number>();
  const isWater = options.isWater ?? (() => false);

  const add = (a: NodeId, b: NodeId, axis: Axis, blockI: number, blockJ: number): void => {
    const bridge = isWater(blockI, blockJ);
    if (bridge) bridgeBlocks.add(blockJ * NODES_PER_SIDE + blockI);
    const edge = edges.length;
    edges.push({ a, b, key: edgeKey(a, b), axis, length: BLOCK, bridge, corridor: -1 });
    links[a]!.push({ to: b, edge });
    links[b]!.push({ to: a, edge });
  };

  for (let j = 0; j < NODES_PER_SIDE; j++) {
    for (let i = 0; i < NODES_PER_SIDE; i++) {
      const here = nodeId(i, j);
      if (i < GRID_LIMIT) add(here, nodeId(i + 1, j), 'ew', i, j);
      if (j < GRID_LIMIT) add(here, nodeId(i, j + 1), 'ns', i, j);
    }
  }
  return { edges, links, bridgeBlocks };
}

export interface RouteOptions {
  /** Blocked edges (closed lanes, flooded underpasses). */
  closed?: ReadonlySet<string> | null;
  /** Extra cost multiplier applied to a specific edge; used to nudge traffic. */
  penalty?: ReadonlyMap<string, number> | null;
}

/**
 * A* over the lattice. Manhattan distance is an admissible heuristic because
 * every edge has length `BLOCK`, so the first goal pop is optimal.
 */
export class Router {
  private readonly gScore: Float64Array;
  private readonly fScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly stamp: Int32Array;
  private readonly heap: Int32Array;
  private generation = 0;

  constructor(private readonly graph: RoadGraph) {
    this.gScore = new Float64Array(NODE_COUNT);
    this.fScore = new Float64Array(NODE_COUNT);
    this.cameFrom = new Int32Array(NODE_COUNT);
    this.stamp = new Int32Array(NODE_COUNT);
    this.heap = new Int32Array(NODE_COUNT * 4);
  }

  /** Returns the node ids from `start` to `goal` inclusive, or [] if unreachable. */
  route(start: NodeId, goal: NodeId, options: RouteOptions = {}): NodeId[] {
    if (start === goal) return [start];
    const closed = options.closed ?? null;
    const penalty = options.penalty ?? null;
    const { gScore, fScore, cameFrom, stamp, heap, graph } = this;
    const gen = ++this.generation;
    let heapSize = 0;

    stamp[start] = gen;
    gScore[start] = 0;
    fScore[start] = heuristic(start, goal);
    cameFrom[start] = -1;
    heap[heapSize++] = start;

    while (heapSize > 0) {
      const current = this.pop(heapSize);
      heapSize--;
      if (current === goal) return this.reconstruct(current);

      const links = graph.links[current]!;
      for (let k = 0; k < links.length; k++) {
        const link = links[k]!;
        const edge = graph.edges[link.edge]!;
        if (closed !== null && closed.has(edge.key)) continue;
        let step = edge.length;
        if (penalty !== null) {
          const mul = penalty.get(edge.key);
          if (mul !== undefined) step *= mul;
        }
        const tentative = gScore[current]! + step;
        if (stamp[link.to] === gen && tentative >= gScore[link.to]!) continue;
        stamp[link.to] = gen;
        gScore[link.to] = tentative;
        fScore[link.to] = tentative + heuristic(link.to, goal);
        cameFrom[link.to] = current;
        heap[heapSize++] = link.to;
        this.siftUp(heapSize - 1);
      }
    }
    return [];
  }

  /** Total path length in world units. */
  distance(start: NodeId, goal: NodeId, options: RouteOptions = {}): number {
    const path = this.route(start, goal, options);
    return path.length > 1 ? (path.length - 1) * BLOCK : 0;
  }

  private pop(heapSize: number): NodeId {
    const { heap } = this;
    const top = heap[0]!;
    heap[0] = heap[heapSize - 1]!;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= heapSize - 1) break;
      const right = left + 1;
      let smallest = left;
      if (right < heapSize - 1 && this.fScore[heap[right]!]! < this.fScore[heap[left]!]!) {
        smallest = right;
      }
      if (this.fScore[heap[smallest]!]! >= this.fScore[heap[index]!]!) break;
      const swap = heap[index]!;
      heap[index] = heap[smallest]!;
      heap[smallest] = swap;
      index = smallest;
    }
    return top;
  }

  private siftUp(index: number): void {
    const { heap, fScore } = this;
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (fScore[heap[parent]!]! <= fScore[heap[child]!]!) break;
      const swap = heap[parent]!;
      heap[parent] = heap[child]!;
      heap[child] = swap;
      child = parent;
    }
  }

  private reconstruct(goal: NodeId): NodeId[] {
    const out: NodeId[] = [];
    let node = goal;
    while (node !== -1) {
      out.push(node);
      const prev = this.cameFrom[node]!;
      if (prev === node) break;
      node = prev;
    }
    out.reverse();
    return out;
  }
}

function heuristic(a: NodeId, b: NodeId): number {
  const di = Math.abs(nodeI(a) - nodeI(b));
  const dj = Math.abs(nodeJ(a) - nodeJ(b));
  return (di + dj) * BLOCK;
}
