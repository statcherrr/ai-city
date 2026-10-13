/**
 * Procedural city layout: which 20x20 block is water, park, civic or built-up,
 * where the landmark facilities sit, and which road corridors carry transit.
 *
 * Only structure lives here — the scene derives all visual detail (building
 * masses, windows, trees) from this layout with the shared seeded RNG, so the
 * engine stays free of rendering concerns.
 */

import { BLOCK, CITY_HALF, CITY_SEED, GRID_BLOCKS } from '@/data/cityConfig';
import { Rng } from './rng';
import { buildRoadGraph, nodeId, Router, type NodeId, type RoadGraph } from './graph';
import type { Point, Rect } from './types';

export type BlockKind = 'dense' | 'mid' | 'low' | 'park' | 'water' | 'civic';

export interface Block {
  i: number;
  j: number;
  kind: BlockKind;
  rect: Rect;
  /** 0 at the civic centre, 1 at the city edge — drives building heights. */
  centrality: number;
}

export type LandmarkKind =
  | 'hospital'
  | 'fire-station'
  | 'water-plant'
  | 'school'
  | 'depot'
  | 'police-hq';

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  name: string;
  point: Point;
  rect: Rect;
  height: number;
  color: string;
}

export interface TransitStop {
  id: string;
  name: string;
  point: Point;
}

export interface TransitLine {
  id: string;
  name: string;
  color: string;
  /** Road nodes the line runs along, in order, closing the loop. */
  loop: NodeId[];
  stops: TransitStop[];
}

export interface CorridorDef {
  id: string;
  name: string;
  points: Point[];
  /** Daily passenger volume — the plow ranking key. */
  volume: number;
}

export interface CityModel {
  seed: number;
  graph: RoadGraph;
  router: Router;
  blocks: Block[];
  landmarks: Landmark[];
  transit: TransitLine;
  corridors: CorridorDef[];
  /** River cells as world-space rectangles, for rendering. */
  riverRects: Rect[];
  riverBand: number[];
}

export const RIVER_BAND_DEPTH = 1.15;

/** Meandering river: a sine-tracked row index per column. */
function riverRowAt(i: number): number {
  return 4.2 + i * 0.62 + Math.sin(i * 0.47) * 1.4;
}

export function isWaterBlock(i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= GRID_BLOCKS || j >= GRID_BLOCKS) return false;
  return Math.abs(j - riverRowAt(i)) <= RIVER_BAND_DEPTH;
}

function blockRect(i: number, j: number): Rect {
  return {
    x: i * BLOCK - CITY_HALF + BLOCK / 2,
    z: j * BLOCK - CITY_HALF + BLOCK / 2,
    w: BLOCK,
    d: BLOCK,
  };
}

const CENTER = (GRID_BLOCKS - 1) / 2;

function centrality(i: number, j: number): number {
  const di = (i - CENTER) / CENTER;
  const dj = (j - CENTER) / CENTER;
  return Math.min(1, Math.hypot(di, dj) / Math.SQRT2);
}

interface LandmarkSpec {
  kind: LandmarkKind;
  name: string;
  color: string;
  preferred: Point;
  height: number;
}

const LANDMARK_SPECS: LandmarkSpec[] = [
  { kind: 'hospital', name: 'Bay General Hospital', color: '#7ef0ff', preferred: { i: 4, j: 16 }, height: 9 },
  { kind: 'fire-station', name: 'Engine 2 Fire Station', color: '#ff5a3c', preferred: { i: 10, j: 6 }, height: 5.4 },
  { kind: 'water-plant', name: 'Delta Water Treatment', color: '#22d3ee', preferred: { i: 6, j: 2 }, height: 4.4 },
  { kind: 'school', name: 'Meridian High School', color: '#f5b429', preferred: { i: 14, j: 13 }, height: 5.8 },
  { kind: 'depot', name: 'Public Works Depot', color: '#f5b429', preferred: { i: 17, j: 17 }, height: 4.6 },
  { kind: 'police-hq', name: 'Central Precinct', color: '#3f7dff', preferred: { i: 9, j: 11 }, height: 6.6 },
];

/** Walk outward from the preferred cell until a free, dry block is found. */
function findFreeCell(
  preferred: Point,
  taken: Set<number>,
  dry = true,
): Point {
  for (let ring = 0; ring < GRID_BLOCKS; ring++) {
    for (let di = -ring; di <= ring; di++) {
      for (let dj = -ring; dj <= ring; dj++) {
        if (ring > 0 && Math.abs(di) !== ring && Math.abs(dj) !== ring) continue;
        const i = preferred.i + di;
        const j = preferred.j + dj;
        if (i < 0 || j < 0 || i >= GRID_BLOCKS || j >= GRID_BLOCKS) continue;
        const key = j * GRID_BLOCKS + i;
        if (taken.has(key)) continue;
        if (dry && isWaterBlock(i, j)) continue;
        taken.add(key);
        return { i, j };
      }
    }
  }
  return preferred;
}

/** Build the whole city deterministically. Called once, at module init. */
export function generateCity(seed: number = CITY_SEED): CityModel {
  const rng = new Rng(seed);
  const graph = buildRoadGraph({ isWater: isWaterBlock });
  const router = new Router(graph);

  const taken = new Set<number>();
  const landmarks: Landmark[] = LANDMARK_SPECS.map((spec, index) => {
    const cell = findFreeCell(spec.preferred, taken);
    return {
      id: `lm-${index}-${spec.kind}`,
      kind: spec.kind,
      name: spec.name,
      point: cell,
      rect: blockRect(cell.i, cell.j),
      height: spec.height,
      color: spec.color,
    };
  });
  const landmarkCells = new Set(landmarks.map((l) => l.point.j * GRID_BLOCKS + l.point.i));

  // Reserve a handful of parks before filling the rest with housing.
  const parkCount = 7;
  for (let n = 0; n < parkCount; n++) {
    findFreeCell({ i: rng.int(1, GRID_BLOCKS - 2), j: rng.int(1, GRID_BLOCKS - 2) }, taken);
  }

  const blocks: Block[] = [];
  const riverRects: Rect[] = [];
  const riverBand: number[] = [];
  for (let i = 0; i < GRID_BLOCKS; i++) riverBand.push(riverRowAt(i));

  for (let i = 0; i < GRID_BLOCKS; i++) {
    for (let j = 0; j < GRID_BLOCKS; j++) {
      const rect = blockRect(i, j);
      const c = centrality(i, j);
      let kind: BlockKind;
      if (isWaterBlock(i, j)) {
        kind = 'water';
        riverRects.push(rect);
      } else if (landmarkCells.has(j * GRID_BLOCKS + i)) {
        kind = 'civic';
      } else if (taken.has(j * GRID_BLOCKS + i)) {
        kind = 'park';
      } else if (c < 0.28) {
        kind = 'dense';
      } else if (c < 0.62) {
        kind = 'mid';
      } else {
        kind = 'low';
      }
      blocks.push({ i, j, kind, rect, centrality: c });
    }
  }

  const transit = buildTransitLine();
  const corridors = buildCorridors();

  return { seed, graph, router, blocks, landmarks, transit, corridors, riverRects, riverBand };
}

/** The Crosstown Loop: a rectangle of roads through the civic core. */
function buildTransitLine(): TransitLine {
  const corners: Point[] = [
    { i: 5, j: 5 },
    { i: 15, j: 5 },
    { i: 15, j: 15 },
    { i: 5, j: 15 },
  ];
  const loop: NodeId[] = [];
  for (let c = 0; c < corners.length; c++) {
    const from = corners[c]!;
    const to = corners[(c + 1) % corners.length]!;
    const stepI = Math.sign(to.i - from.i);
    const stepJ = Math.sign(to.j - from.j);
    let i = from.i;
    let j = from.j;
    while (i !== to.i) {
      loop.push(nodeId(i, j));
      i += stepI;
    }
    while (j !== to.j) {
      loop.push(nodeId(i, j));
      j += stepJ;
    }
  }
  loop.push(nodeId(corners[0]!.i, corners[0]!.j));

  const stops: TransitStop[] = [
    ['Civic Center', { i: 5, j: 5 }],
    ['Union Market', { i: 10, j: 5 }],
    ['Riverside', { i: 15, j: 5 }],
    ['Eastgate', { i: 15, j: 10 }],
    ['Fairgrounds', { i: 15, j: 15 }],
    ['South Loop', { i: 10, j: 15 }],
    ['Meridian High', { i: 5, j: 15 }],
    ['West End', { i: 5, j: 10 }],
  ].map(([name, point], index) => ({
    id: `stop-${index}`,
    name: name as string,
    point: point as Point,
  }));

  return {
    id: 'line-1',
    name: 'Crosstown Loop',
    color: '#a06bff',
    loop,
    stops,
  };
}

/** Named traffic corridors. Volume drives the snow-plow priority order. */
function buildCorridors(): CorridorDef[] {
  const row = (j: number, from: number, to: number): Point[] =>
    Array.from({ length: to - from + 1 }, (_, k) => ({ i: from + k, j }));
  const col = (i: number, from: number, to: number): Point[] =>
    Array.from({ length: to - from + 1 }, (_, k) => ({ i, j: from + k }));

  return [
    { id: 'c1', name: 'Meridian Crosstown (Row 10)', points: row(10, 0, 20), volume: 11800 },
    { id: 'c2', name: 'Harbor Avenue (Row 16)', points: row(16, 0, 20), volume: 8200 },
    { id: 'c3', name: 'Delta Bridge Line (Col 7)', points: col(7, 0, 20), volume: 6400 },
    { id: 'c4', name: 'Eastgate Arterial (Col 15)', points: col(15, 0, 20), volume: 5200 },
    { id: 'c5', name: 'Civic Row (Row 5)', points: row(5, 0, 20), volume: 3900 },
    { id: 'c6', name: 'Fairgrounds Spur (Col 3)', points: col(3, 0, 20), volume: 2600 },
  ];
}

/** Ids of all nodes that carry a traffic signal (every other intersection). */
export function signalNodeIds(): NodeId[] {
  const ids: NodeId[] = [];
  for (let j = 0; j < GRID_BLOCKS + 1; j += 2) {
    for (let i = 0; i < GRID_BLOCKS + 1; i += 2) {
      ids.push(nodeId(i, j));
    }
  }
  return ids;
}
