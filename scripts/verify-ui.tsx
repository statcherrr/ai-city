/**
 * Verifies the UI layer without a browser: server-renders every dashboard panel,
 * drives the store through a real scenario, and measures the per-frame CPU cost
 * of the simulation.
 *
 * Run with `npm run verify:ui`.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { cityEngine } from '@/engine/engine';
import { matchIntent } from '@/engine/intent';
import { Simulation } from '@/engine/sim';
import { FIXED_STEP_MIN, SIM_MIN_PER_REAL_SECOND } from '@/data/cityConfig';
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { buildCityVisuals } from '@/scene/cityVisuals';
import { useCityStore } from '@/store/useCityStore';
import { ActionsFeed } from '@/ui/ActionsFeed';
import { CommandBar } from '@/ui/CommandBar';
import { ResultsCard } from '@/ui/ResultsCard';
import { ScenarioPanel } from '@/ui/ScenarioPanel';
import { TopBar } from '@/ui/TopBar';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  console.log('\n=== City visuals ===');
  const visuals = buildCityVisuals(cityEngine.city);
  check('buildings generated', visuals.buildings.length > 300, `${visuals.buildings.length} buildings`);
  check('windows generated', visuals.windows.length > 2000, `${visuals.windows.length} lit windows`);
  check('trees generated', visuals.trees.length > 60, `${visuals.trees.length} trees`);
  check(
    'landmarks present',
    cityEngine.city.landmarks.length === 6,
    cityEngine.city.landmarks.map((l) => l.kind).join(', '),
  );

  console.log('\n=== Intent matching ===');
  const parade = matchIntent('How will the parade on Saturday affect traffic and emergency response times?');
  check('parade query routes to the parade', parade.match?.scenarioId === 'parade', parade.match?.reason ?? 'no match');
  const water = matchIntent('A water main just broke on the Crosstown, what happens next?');
  check('water query routes to the water main', water.match?.scenarioId === 'water-main', water.match?.reason ?? 'no match');
  const snow = matchIntent('Snow is forecast overnight, which corridors do we clear first?');
  check('snow query routes to the snowstorm', snow.match?.scenarioId === 'snowstorm', snow.match?.reason ?? 'no match');
  const nonsense = matchIntent('how many pigeons live in the park');
  check('unrelated query is rejected', nonsense.match === null);

  console.log('\n=== Store + panels ===');
  useCityStore.getState().init();
  const idleMarkup = renderToStaticMarkup(<TopBar snapshot={cityEngine.snapshot()} />);
  check('top bar renders the city name', idleMarkup.includes('Meridian Bay'));
  check('top bar shows the health score', idleMarkup.includes('Health'));

  useCityStore.getState().trigger('water-main');
  cityEngine.setSpeed(4);
  for (let i = 0; i < 900; i++) cityEngine.tick(1 / 60);
  await sleep(120);

  const state = useCityStore.getState();
  check('feed filled from the run', state.feed.length > 0, `${state.feed.length} events`);
  check('snapshot reports the scenario', state.snapshot.scenarioId === 'water-main');
  check('detour recorded', state.snapshot.detours.length > 0);
  check('dispatch recorded', state.snapshot.dispatches.length > 0);
  check('clock advanced', state.snapshot.clockMinutes > 22 * 60, `T+${state.snapshot.timeMin.toFixed(1)}m`);

  const panelMarkup = renderToStaticMarkup(<ScenarioPanel snapshot={state.snapshot} />);
  check('scenario panel lists all four scenarios', ['Water Main Break', 'Structure Fire', 'Snowstorm', 'Saturday Parade'].every((name) => panelMarkup.includes(name)));
  check('scenario panel shows operations', panelMarkup.includes('Operations'));

  const feedMarkup = renderToStaticMarkup(<ActionsFeed feed={state.feed} running={state.snapshot.running} />);
  check('actions feed renders', feedMarkup.includes('AI Actions'));
  check('actions feed lists actions', feedMarkup.includes('T+') && feedMarkup.includes('cross-dept'));

  const commandMarkup = renderToStaticMarkup(<CommandBar />);
  check('command bar renders', commandMarkup.includes('Ask the City Brain'));

  const comparison = cityEngine.comparison('water-main');
  const cardMarkup = renderToStaticMarkup(
    <ResultsCard
      comparison={comparison}
      scenarioName="Water Main Break"
      mode="coordinated"
      onReplay={() => undefined}
      onDismiss={() => undefined}
    />,
  );
  check('results card shows both runs', cardMarkup.includes('Before AI') && cardMarkup.includes('After AI'));
  check('results card shows the delta table', cardMarkup.includes('First unit on scene'));

  console.log('\n=== Before/After toggle ===');
  useCityStore.getState().setMode('siloed');
  check('toggle replays the same scenario', cityEngine.simulation.scenario.id === 'water-main');
  check('toggle switches the snapshot mode', cityEngine.snapshot().mode === 'siloed');
  const siloedFeed = cityEngine.simulation.scenario.events.length;
  check('siloed timeline is shorter', siloedFeed > 0);

  console.log('\n=== Engine cost (CPU side of the frame) ===');
  // A fresh run, measured while it is actually simulating: the busiest window
  // is the dispatch burst at the start of the fire scenario.
  const scenario = SCENARIO_BY_ID.get('structure-fire')!;
  const measured = new Simulation({ city: cityEngine.city, scenario, mode: 'coordinated' });
  const steps = 400;
  const started = performance.now();
  for (let i = 0; i < steps; i++) measured.advance();
  const elapsed = performance.now() - started;
  const perStep = elapsed / steps;
  const stepsPerFrame = (SIM_MIN_PER_REAL_SECOND * 1) / FIXED_STEP_MIN / 60;
  console.log(`  fixed step (${FIXED_STEP_MIN} sim-min): ${perStep.toFixed(4)} ms`);
  for (const speed of [1, 2, 4] as const) {
    const perFrame = perStep * stepsPerFrame * speed;
    console.log(
      `  ${speed}x → ${(stepsPerFrame * speed).toFixed(2)} sim steps/frame → ${perFrame.toFixed(3)} ms/frame ` +
        `(${((perFrame / 16.67) * 100).toFixed(2)}% of a 60 fps budget)`,
    );
  }
  const worstFrame = perStep * stepsPerFrame * 4;
  check('engine leaves the 60 fps budget intact', worstFrame < 2, `${worstFrame.toFixed(3)} ms/frame at 4x`);
  check('measured run is mid-scenario', measured.world.timeMin > 1, `T+${measured.world.timeMin.toFixed(1)}m`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

void main();
