/**
 * Scenario timelines.
 *
 * Each scenario is an ordered list of typed events `{ t, department, action, effect }`
 * where `t` is minutes from the incident start and `effect` is what the
 * simulation actually does. `t` values are authored for the coordinated (AI)
 * run; a `siloed` override describes what the same city did before the brain
 * existed. Events marked `coordination` are dropped in the siloed replay
 * because no department had the shared picture required to fire them.
 */

import type { Point, ScenarioTimeline } from '@/engine/types';

const p = (i: number, j: number): Point => ({ i, j });

/** Straight line of adjacent intersections, inclusive. */
function stretch(from: Point, to: Point): Point[] {
  const out: Point[] = [];
  const di = Math.sign(to.i - from.i);
  const dj = Math.sign(to.j - from.j);
  let i = from.i;
  let j = from.j;
  for (;;) {
    out.push(p(i, j));
    if (i === to.i && j === to.j) break;
    i += di;
    j += dj;
  }
  return out;
}

/** Crosstown closure from Column 8 to Column 10 on Row 10. */
const CROSSTOWN_CLOSURE = stretch(p(8, 10), p(10, 10));
/** Civic Row from Column 4 to Column 16 — the parade route. */
const PARADE_ROUTE = stretch(p(4, 5), p(16, 5));

const WATER_MAIN: ScenarioTimeline = {
  id: 'water-main',
  name: 'Water Main Break',
  headline: 'Pressure loss on the Crosstown main',
  brief:
    'A 90-year-old cast-iron main fails under Meridian Crosstown. Detect it from sensor telemetry, isolate the segment, and keep the city moving while a repair crew digs.',
  keywords: [
    'water',
    'main',
    'pipe',
    'leak',
    'break',
    'burst',
    'pressure',
    'flood',
    'hydrant',
    'h2o',
    'repair',
    'maintenance',
  ],
  focus: p(9, 10),
  events: [
    {
      t: 0,
      department: 'ai',
      action: 'Pressure drop detected on the Crosstown main',
      effect: {
        kind: 'incident',
        type: 'water',
        id: 'inc-water',
        label: 'Water main break',
        point: p(9, 10),
        severity: 6,
        radius: 2.4,
        resolveAt: 22,
      },
      coordination: true,
      siloed: {
        t: 5.5,
        note: 'Break reported by a resident after water reached the intersection',
      },
    },
    {
      t: 0.2,
      department: 'water',
      action: 'Repair crew dispatched to the exact pipe segment',
      effect: {
        kind: 'dispatch',
        id: 'd-crew',
        unit: 'utility',
        department: 'water',
        from: p(6, 2),
        to: p(9, 10),
        label: 'Water Repair Crew',
      },
      siloed: { t: 9.5, note: 'Repair crew dispatched to the reported intersection' },
    },
    {
      t: 0.6,
      department: 'transit',
      action: 'Crosstown Loop rerouted before the next bus departs',
      effect: {
        kind: 'route-update',
        id: 'r-line1',
        label: 'Line 1 detour via Row 12',
        lines: ['line-1'],
        affectedRiders: 2400,
      },
      coordination: true,
    },
    {
      t: 1,
      department: 'publicworks',
      action: 'Lane closure and detour signed between Col 8 and Col 10',
      effect: {
        kind: 'detour',
        id: 'det-crosstown',
        label: 'Crosstown closure, Col 8-10',
        blocked: CROSSTOWN_CLOSURE,
      },
      siloed: { t: 13 },
    },
    {
      t: 1.4,
      department: 'police',
      action: 'Two units to work the closure and the detour merge',
      effect: {
        kind: 'dispatch',
        id: 'd-pd1',
        unit: 'police',
        department: 'police',
        from: p(9, 11),
        to: p(8, 10),
        label: 'Traffic Division',
      },
      siloed: { t: 15 },
    },
    {
      t: 2,
      department: 'water',
      action: 'Isolation valves closed — district pressure held',
      effect: {
        kind: 'pressure',
        district: 'Sector 4',
        delta: -0.16,
        label: 'Main isolated, 3 blocks offline',
      },
      siloed: { t: 11 },
    },
    {
      t: 3,
      department: 'water',
      action: 'Crew on scene, excavation started on the exact segment',
      effect: {
        kind: 'note',
        id: 'n-dig',
        label: 'Excavation started',
        detail: 'AI pipe locator narrowed the break to a 4 m segment',
      },
      siloed: { t: 12.5, note: 'Crew probing the general area for the break' },
    },
    {
      t: 6,
      department: 'transit',
      action: 'School route 7A re-timed, students held at Meridian High',
      effect: {
        kind: 'note',
        id: 'n-school',
        label: 'School route 7A adjusted',
        detail: '184 students held 12 minutes instead of standing at a flooded stop',
      },
      coordination: true,
    },
    {
      t: 14,
      department: 'water',
      action: 'Repair clamp set, backfill in progress',
      effect: {
        kind: 'pressure',
        district: 'Sector 4',
        delta: 0.09,
        label: 'Pressure partially restored',
      },
      siloed: { t: 24 },
    },
    {
      t: 22,
      department: 'water',
      action: 'Main repaired, district pressure back to nominal',
      effect: { kind: 'resolve', id: 'inc-water', label: 'Water main break resolved' },
      siloed: { t: 34 },
    },
    {
      t: 24,
      department: 'ai',
      action: 'Sensor array re-baselined, corridor reopened to full traffic',
      effect: {
        kind: 'note',
        id: 'n-rebaseline',
        label: 'Corridor reopened',
        detail: 'Baseline re-learned so the next 2% pressure wobble is not a false positive',
      },
      coordination: true,
    },
  ],
};

const STRUCTURE_FIRE: ScenarioTimeline = {
  id: 'structure-fire',
  name: 'Structure Fire',
  headline: 'Working fire in a mid-rise on Row 7',
  brief:
    'A four-storey residential block is burning. Clear the response route, pre-empt the signals, and get hydrant pressure up in the neighbourhood before the first engine arrives.',
  keywords: [
    'fire',
    'burn',
    'flame',
    'smoke',
    'blaze',
    'alarm',
    'structure',
    'hydrant',
    'rescue',
    'arson',
  ],
  focus: p(13, 7),
  events: [
    {
      t: 0,
      department: 'ai',
      action: 'Smoke signature detected by the tower array — 4 alarms',
      effect: {
        kind: 'incident',
        type: 'fire',
        id: 'inc-fire',
        label: 'Structure fire',
        point: p(13, 7),
        severity: 7,
        radius: 2.8,
        resolveAt: 16,
      },
      coordination: true,
      siloed: { t: 1.8, note: 'Fire reported by a passer-by' },
    },
    {
      t: 0.15,
      department: 'fire',
      action: 'Engine 2 rolling, structure fire assignment',
      effect: {
        kind: 'dispatch',
        id: 'd-engine',
        unit: 'engine',
        department: 'fire',
        from: p(10, 6),
        to: p(13, 7),
        label: 'Engine 2',
      },
      siloed: { t: 4.5 },
    },
    {
      t: 0.3,
      department: 'fire',
      action: 'Ladder 1 assigned for roof access',
      effect: {
        kind: 'dispatch',
        id: 'd-ladder',
        unit: 'ladder',
        department: 'fire',
        from: p(10, 6),
        to: p(12, 7),
        label: 'Ladder 1',
      },
      siloed: { t: 8 },
    },
    {
      t: 0.5,
      department: 'ai',
      action: 'Green wave cleared on the response route',
      effect: {
        kind: 'green-wave',
        id: 'gw-fire',
        label: 'Signal pre-emption, 5 intersections',
        from: p(10, 6),
        to: p(13, 7),
      },
      coordination: true,
    },
    {
      t: 0.8,
      department: 'water',
      action: 'Hydrant pressure boosted in Sector 3',
      effect: {
        kind: 'pressure',
        district: 'Sector 3',
        delta: 0.14,
        label: 'Hydrant pressure boosted',
      },
      siloed: { t: 7.5 },
    },
    {
      t: 1.2,
      department: 'police',
      action: 'Perimeter closed, crowd pushed back two blocks',
      effect: {
        kind: 'detour',
        id: 'det-fire',
        label: 'Fire perimeter',
        blocked: [p(12, 7), p(13, 7)],
      },
      siloed: { t: 9 },
    },
    {
      t: 3.2,
      department: 'fire',
      action: 'Engine 2 on scene, hydrant hooked up',
      effect: {
        kind: 'note',
        id: 'n-onscene',
        label: 'First water on the fire',
        detail: 'Arrival reported automatically from unit telemetry',
      },
      siloed: { t: 9.5 },
    },
    {
      t: 4,
      department: 'fire',
      action: 'Primary search complete, all occupants accounted for',
      effect: {
        kind: 'note',
        id: 'n-search',
        label: 'All occupants accounted for',
        detail: '9 residents evacuated, 1 treated on scene',
      },
      siloed: { t: 16 },
    },
    {
      t: 9,
      department: 'fire',
      action: 'Knockdown — overhaul under way',
      effect: {
        kind: 'note',
        id: 'n-knockdown',
        label: 'Knockdown',
        detail: 'Fire confined to the third floor',
      },
      siloed: { t: 22 },
    },
    {
      t: 16,
      department: 'fire',
      action: 'Fire out, scene handed to investigators',
      effect: { kind: 'resolve', id: 'inc-fire', label: 'Structure fire resolved' },
      siloed: { t: 31 },
    },
  ],
};

const SNOWSTORM: ScenarioTimeline = {
  id: 'snowstorm',
  name: 'Snowstorm',
  headline: '6 cm/h overnight band, corridors at risk',
  brief:
    'A snow band is crossing the bay. Rank transit corridors by passenger volume, dispatch plows in that order, and keep buses on cleared lanes.',
  keywords: [
    'snow',
    'storm',
    'plow',
    'plough',
    'winter',
    'ice',
    'sleet',
    'blizzard',
    'grit',
    'chains',
  ],
  focus: p(10, 10),
  activatesPlows: true,
  events: [
    {
      t: 0,
      department: 'ai',
      action: 'Storm band arriving over the bay',
      effect: {
        kind: 'incident',
        type: 'snow',
        id: 'inc-snow',
        label: 'Snowstorm',
        point: p(10, 10),
        severity: 5,
        radius: 12,
        resolveAt: 22,
      },
      coordination: true,
      siloed: { t: 0.4, note: 'Snow began overnight' },
    },
    {
      t: 0.1,
      department: 'ai',
      action: 'Corridors ranked by passenger volume',
      effect: {
        kind: 'corridor-rank',
        label: 'Plow priority order set',
        corridors: [
          { id: 'c1', name: 'Meridian Crosstown (Row 10)', volume: 11800 },
          { id: 'c2', name: 'Harbor Avenue (Row 16)', volume: 8200 },
          { id: 'c3', name: 'Delta Bridge Line (Col 7)', volume: 6400 },
          { id: 'c4', name: 'Eastgate Arterial (Col 15)', volume: 5200 },
          { id: 'c5', name: 'Civic Row (Row 5)', volume: 3900 },
          { id: 'c6', name: 'Fairgrounds Spur (Col 3)', volume: 2600 },
        ],
      },
      coordination: true,
      siloed: {
        t: 0.4,
        note: 'Snow started — routes assigned by depot roster order',
        effect: {
          kind: 'corridor-rank',
          label: 'Plow order set by route number',
          corridors: [
            { id: 'c6', name: 'Fairgrounds Spur (Col 3)', volume: 2600 },
            { id: 'c5', name: 'Civic Row (Row 5)', volume: 3900 },
            { id: 'c3', name: 'Delta Bridge Line (Col 7)', volume: 6400 },
            { id: 'c4', name: 'Eastgate Arterial (Col 15)', volume: 5200 },
            { id: 'c2', name: 'Harbor Avenue (Row 16)', volume: 8200 },
            { id: 'c1', name: 'Meridian Crosstown (Row 10)', volume: 11800 },
          ],
        },
      },
    },
    {
      t: 0.6,
      department: 'publicworks',
      action: 'Plow 1 to Meridian Crosstown — 11,800 riders a day',
      effect: {
        kind: 'dispatch',
        id: 'd-plow1',
        unit: 'plow',
        department: 'publicworks',
        from: p(17, 17),
        to: p(20, 10),
        corridor: 'c1',
        label: 'Plow 1 — Crosstown',
      },
      siloed: { t: 9, note: 'Plow 1 to Meridian Crosstown, last on the roster' },
    },
    {
      t: 1.4,
      department: 'publicworks',
      action: 'Plow 2 to Harbor Avenue',
      effect: {
        kind: 'dispatch',
        id: 'd-plow2',
        unit: 'plow',
        department: 'publicworks',
        from: p(17, 17),
        to: p(0, 16),
        corridor: 'c2',
        label: 'Plow 2 — Harbor Ave',
      },
      siloed: { t: 4.5 },
    },
    {
      t: 2.4,
      department: 'publicworks',
      action: 'Plow 3 to the Delta Bridge approach',
      effect: {
        kind: 'dispatch',
        id: 'd-plow3',
        unit: 'plow',
        department: 'publicworks',
        from: p(17, 17),
        to: p(7, 20),
        corridor: 'c3',
        label: 'Plow 3 — Delta Bridge',
      },
      siloed: { t: 2.2 },
    },
    {
      t: 3,
      department: 'transit',
      action: 'Line 1 headways extended to 9 minutes, chains fitted',
      effect: {
        kind: 'route-update',
        id: 'r-snow',
        label: 'Winter timetable on Line 1',
        lines: ['line-1'],
        affectedRiders: 4200,
      },
      siloed: { t: 12 },
    },
    {
      t: 3.4,
      department: 'police',
      action: 'Fairgrounds hill routes closed, travel advisory issued',
      effect: {
        kind: 'detour',
        id: 'det-hill',
        label: 'Hill route closure',
        blocked: stretch(p(3, 2), p(3, 4)),
      },
      siloed: { t: 14 },
    },
    {
      t: 6,
      department: 'ai',
      action: 'Plow telemetry merged with transit tracking — buses follow cleared lanes',
      effect: {
        kind: 'note',
        id: 'n-merge',
        label: 'Buses follow cleared lanes',
        detail: 'Bus ETAs smoothed to 2-minute accuracy using live plow positions',
      },
      coordination: true,
    },
    {
      t: 18,
      department: 'publicworks',
      action: 'Crosstown and Harbor clear, salt run started',
      effect: {
        kind: 'note',
        id: 'n-clear',
        label: 'Two arterials clear',
        detail: 'Brine applied ahead of the morning peak',
      },
      siloed: { t: 34 },
    },
    {
      t: 22,
      department: 'publicworks',
      action: 'All ranked corridors cleared',
      effect: { kind: 'resolve', id: 'inc-snow', label: 'Snowstorm response complete' },
      siloed: { t: 46, note: 'Crosstown cleared two hours after the peak' },
    },
  ],
};

const PARADE: ScenarioTimeline = {
  id: 'parade',
  name: 'Saturday Parade',
  headline: 'What-if: 12,400 spectators on Civic Row',
  brief:
    'A predictive run, not an emergency. Section off Civic Row for the parade and watch what the plan does to commute times and emergency response.',
  keywords: [
    'parade',
    'saturday',
    'event',
    'festival',
    'march',
    'crowd',
    'what if',
    'whatif',
    'predict',
    'forecast',
    'route',
    'traffic',
  ],
  focus: p(10, 5),
  events: [
    {
      t: 0,
      department: 'ai',
      action: 'Simulating Saturday parade — 12,400 spectators on Civic Row',
      effect: {
        kind: 'incident',
        type: 'parade',
        id: 'inc-parade',
        label: 'Parade on Civic Row',
        point: p(10, 5),
        severity: 4,
        radius: 3.6,
        resolveAt: 30,
      },
      coordination: true,
      siloed: { t: 8, note: 'Parade started — Civic Row closed block by block' },
    },
    {
      t: 0.6,
      department: 'ai',
      action: 'Forecast: emergency response in Sector 4 rises 4.2 min without staging',
      effect: {
        kind: 'note',
        id: 'n-forecast',
        label: 'Response-time warning',
        detail: 'Two response corridors cross the parade route — staging recommended',
      },
      coordination: true,
    },
    {
      t: 1,
      department: 'police',
      action: 'Rolling closures along Civic Row, 18 barricades placed',
      effect: {
        kind: 'detour',
        id: 'det-parade',
        label: 'Parade route closure',
        blocked: PARADE_ROUTE,
      },
      siloed: { t: 8 },
    },
    {
      t: 1.6,
      department: 'transit',
      action: 'Line 1 rerouted via Fairgrounds, shuttle added at Union Market',
      effect: {
        kind: 'route-update',
        id: 'r-parade',
        label: 'Line 1 reroute + shuttle',
        lines: ['line-1'],
        affectedRiders: 6100,
      },
      siloed: { t: 11, note: 'Line 1 caught in the closure, passengers stranded' },
    },
    {
      t: 2.2,
      department: 'fire',
      action: 'Engine 2 staged inside the route for emergency access',
      effect: {
        kind: 'dispatch',
        id: 'd-stage',
        unit: 'engine',
        department: 'fire',
        from: p(10, 6),
        to: p(11, 6),
        label: 'Engine 2 — staging',
      },
      coordination: true,
    },
    {
      t: 2.6,
      department: 'publicworks',
      action: 'Extra litter crews and signage on the detour perimeter',
      effect: {
        kind: 'note',
        id: 'n-sign',
        label: 'Detour perimeter staffed',
        detail: 'Signage on Row 4 and Row 6 before the morning peak',
      },
      siloed: { t: 15 },
    },
    {
      t: 3.4,
      department: 'ai',
      action: 'Perimeter grid absorbs 38% of the block traffic',
      effect: {
        kind: 'green-wave',
        id: 'gw-parade',
        label: 'Signal timing retuned on Row 4 and Row 6',
        from: p(2, 4),
        to: p(18, 4),
      },
      coordination: true,
    },
    {
      t: 6,
      department: 'fire',
      action: 'Heat-exhaustion call — staged engine responds',
      effect: {
        kind: 'dispatch',
        id: 'd-medic',
        unit: 'ambulance',
        department: 'fire',
        from: p(11, 6),
        to: p(12, 5),
        label: 'Medic 3 — Union Market',
      },
      siloed: { t: 12, note: 'Heat-exhaustion call — medic delayed by the parade route' },
    },
    {
      t: 10,
      department: 'transit',
      action: 'Union Market dwell extended, extra bus on the shuttle',
      effect: {
        kind: 'note',
        id: 'n-dwell',
        label: 'Shuttle frequency doubled',
        detail: '1,900 extra boardings handled without leaving passengers behind',
      },
      coordination: true,
    },
    {
      t: 20,
      department: 'police',
      action: 'Reopening in waves — north half first',
      effect: {
        kind: 'note',
        id: 'n-reopen',
        label: 'Wave reopening',
        detail: 'Row 5 reopened west to east, one block every 4 minutes',
      },
      siloed: { t: 40 },
    },
    {
      t: 30,
      department: 'police',
      action: 'Civic Row reopened, barricades collected',
      effect: { kind: 'resolve', id: 'inc-parade', label: 'Parade cleared' },
      siloed: { t: 44 },
    },
  ],
};

export const SCENARIOS: ScenarioTimeline[] = [
  WATER_MAIN,
  STRUCTURE_FIRE,
  SNOWSTORM,
  PARADE,
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

/** Sample queries the command bar can be tried with. */
export const EXAMPLE_QUERIES = [
  'How will the parade on Saturday affect traffic and emergency response times?',
  'A water main just broke on the Crosstown — what happens next?',
  'There is smoke coming from a building on Row 7.',
  'Snow is forecast overnight. Which corridors do we clear first?',
];
