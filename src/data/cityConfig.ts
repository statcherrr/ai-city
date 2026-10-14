/** Tunables for the procedural city and the traffic model. */

export const CITY_NAME = 'Meridian Bay';
export const DISTRICT_NAME = 'Sector 4';

/** Fixed PRNG seed: every replay of a scenario produces the identical city. */
export const CITY_SEED = 20261013;

/** 20 x 20 city blocks, so 21 x 21 = 441 intersections. */
export const GRID_BLOCKS = 20;
/** World units per block (roughly 100 m). */
export const BLOCK = 8;
export const NODES_PER_SIDE = GRID_BLOCKS + 1;
export const CITY_HALF = (GRID_BLOCKS * BLOCK) / 2;

export const ROAD_WIDTH = 4.2;
export const ROAD_LIFT = 0.06;
/** Lateral offset that keeps vehicles on the right-hand side of the road. */
export const LANE_OFFSET = 1.4;

/** Wall-clock time the shift starts at, in minutes past midnight. */
export const START_CLOCK_MIN = 22 * 60 + 45;
/** Simulation minutes elapsed per real second at 1x speed. */
export const SIM_MIN_PER_REAL_SECOND = 0.35;
/** The engine always integrates in this fixed step so replays stay deterministic. */
export const FIXED_STEP_MIN = 0.05;
/** Traffic-signal cycle length in simulated seconds. */
export const SIGNAL_CYCLE_SEC = 90;

/**
 * Vehicle speeds in world units per simulated minute. One block is 8 units, so
 * a car at 42 u/min covers roughly five blocks a minute (~30 km/h).
 */
export const AGENT_SPEED = {
  car: 42,
  bus: 30,
  'fire-truck': 52,
  plow: 20,
  police: 58,
  utility: 38,
} as const;

export const AGENT_COUNTS = {
  cars: 46,
  buses: 4,
  'fire-trucks': 2,
  plows: 3,
  police: 2,
  utility: 2,
} as const;

/** Visual palette. */
export const PALETTE = {
  background: '#05070d',
  fog: '#070b14',
  ground: '#0a0f18',
  road: '#141a26',
  roadEdge: '#1d2635',
  water: '#071a2b',
  park: '#0c2019',
  building: '#161d2b',
  buildingAlt: '#1b2333',
  windowWarm: '#ffcf8a',
  windowCool: '#8fe6ff',
  windowOff: '#0b0f17',
  transit: '#a06bff',
  incident: '#ff4d4d',
  detour: '#ffb020',
} as const;
