/**
 * Headless smoke test: runs every scenario in both modes and prints the metrics
 * the dashboard reports. Run with `npm run verify`.
 */

import { SCENARIOS } from '@/data/scenarios';
import { generateCity } from '@/engine/city';
import { Simulation } from '@/engine/sim';
import type { RunSummary, SimMode } from '@/engine/types';

const city = generateCity();
const modes: SimMode[] = ['coordinated', 'siloed'];

function run(scenarioId: string, mode: SimMode): RunSummary {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`no scenario ${scenarioId}`);
  const sim = new Simulation({ city, scenario, mode });
  const guard = Math.ceil(sim.totalMin / 0.05) + 10;
  let steps = 0;
  for (let i = 0; i < guard && !sim.finished; i++) {
    sim.advance();
    steps++;
  }
  if (!sim.finished) throw new Error(`scenario ${scenarioId} ${mode} did not finish in ${steps} steps`);
  return sim.summary();
}

function fmt(value: number | null, unit = '', digits = 1): string {
  return value === null ? '  n/a' : `${value.toFixed(digits)}${unit}`;
}

let failures = 0;

for (const scenario of SCENARIOS) {
  console.log(`\n=== ${scenario.id} — ${scenario.name} ===`);
  const results: Record<SimMode, RunSummary> = {} as Record<SimMode, RunSummary>;
  for (const mode of modes) {
    const summary = run(scenario.id, mode);
    results[mode] = summary;
    const m = summary.metrics;
    console.log(
      [
        `  ${mode.padEnd(12)}`,
        `response ${fmt(m.responseTimeMin, ' min')}`,
        `| resolved ${fmt(m.resolutionMin, ' min')}`,
        `| peak traffic ${m.peakTrafficDelayPct.toFixed(0)}%`,
        `| health ${m.healthLow.toFixed(1)} -> ${m.healthEnd.toFixed(1)}`,
        `| actions ${m.coordinatedActions}`,
        `| feed ${summary.feed.length}`,
      ].join(' '),
    );
  }

  const fast = results.coordinated.metrics;
  const slow = results.siloed.metrics;
  const checks: [string, boolean][] = [
    ['coordinated resolves in fewer minutes', (fast.resolutionMin ?? Infinity) < (slow.resolutionMin ?? Infinity)],
    ['coordinated response is faster', (fast.responseTimeMin ?? Infinity) < (slow.responseTimeMin ?? Infinity)],
    ['coordinated fires more cross-department actions', fast.coordinatedActions > slow.coordinatedActions],
    ['peak traffic delay recorded', fast.peakTrafficDelayPct > 0],
    ['health recovers above the trough', fast.healthEnd > fast.healthLow],
    ['feed has entries', results.coordinated.feed.length > 4],
  ];
  for (const [label, ok] of checks) {
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
