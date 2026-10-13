/**
 * End-to-end browser check for the dashboard.
 *
 * Drives headless Chrome over the DevTools protocol: navigates to a deep link,
 * waits for the React effects to run (a plain `--dump-dom` fires at the load
 * event, before the store has started the replay), then reads the rendered text
 * twice to prove the simulation is actually advancing.
 *
 * Usage: node scripts/browser-check.mjs [url] [--chrome <path>]
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pngStats } from './png-stats.mjs';

const url = process.argv[2] ?? 'http://localhost:5199/?scenario=water-main&advance=14&speed=4';
const scenarioId = new URL(url).searchParams.get('scenario') ?? 'water-main';

/** Strings that only appear in the run for that scenario. */
const EXPECTATIONS = {
  'water-main': { name: 'Water Main Break', must: ['Repair Crew', 'Crosstown closure', 'Road closures', 'Sector 4'] },
  'structure-fire': { name: 'Structure Fire', must: ['Ladder 1', 'Fire perimeter', 'Sector 3'] },
  snowstorm: { name: 'Snowstorm', must: ['Plow 1 — Crosstown', 'Plow priority', 'Harbor Avenue'] },
  parade: { name: 'Saturday Parade', must: ['Parade route closure', 'Civic Row', 'Engine 2 — staging'] },
};
const expected = EXPECTATIONS[scenarioId];
if (!expected) throw new Error(`no expectations for scenario ${scenarioId}`);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const profile = mkdtempSync(join(tmpdir(), 'city-check-'));

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    events.push(message);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', (error) => reject(error));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { socket, ready, send, events };
}

const chrome = spawn(
  CHROME,
  [
    '--headless=old',
    '--no-sandbox',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,860',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  const wsUrl = await waitForDevTools();
  const client = connect(wsUrl);
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');

  console.log(`\nNavigating to ${url}`);
  await client.send('Page.navigate', { url });
  // Give the page time to load, mount React, run effects and simulate.
  await sleep(14000);

  const readText = async () =>
    (await client.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result
      .value ?? '';
  const evaluate = async (expression) =>
    (await client.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  const first = await readText();
  const canvases = await evaluate('document.querySelectorAll("canvas").length');
  await sleep(6000);
  const second = await readText();

  const consoleErrors = client.events
    .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
    .map((event) =>
      event.method === 'Runtime.exceptionThrown'
        ? event.params.exceptionDetails?.exception?.description ?? 'exception'
        : `${event.params.entry.level}: ${event.params.entry.text} (${event.params.entry.url ?? ''})`,
    )
    // A missing favicon is the only expected 404; GL performance warnings are
    // what software rendering looks like.
    .filter((text) => !text.includes('React DevTools'))
    .filter((text) => !/favicon/i.test(text))
    .filter((text) => !text.includes('GL Driver Message'));

  // Chrome's innerText applies text-transform, and the panels are uppercased.
  const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

  console.log('\n=== Rendered dashboard ===');
  check('city name is on screen', has(first, 'Meridian Bay'));
  check('scenario launcher is on screen', has(first, 'Trigger incident'));
  check('AI actions feed is on screen', has(first, 'AI Actions'));
  check('command bar is on screen', has(first, 'Run simulation'));
  check('health sub-scores are on screen', has(first, 'Infrastructure') && has(first, 'Emergency'));
  check('3D canvas is mounted', canvases >= 1, `${canvases} canvas element(s)`);

  console.log(`\n=== Live replay: ${scenarioId} ===`);
  check('scenario is running', has(first, expected.name) && !has(first, 'Live city feed'));
  check('operations panel is live', has(first, 'Operations'));
  check('a unit is assigned', has(first, 'Units assigned'));
  check('cross-department actions are tagged', has(first, 'cross-dept'));
  for (const needle of expected.must) check(`shows "${needle}"`, has(first, needle));
  check('the clock is advancing', /T\+\d/.test(second), second.match(/T\+[\d.]+m/)?.[0] ?? '');

  console.log('\n=== 3D scene (screenshot pixels) ===');
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/city-check.png', Buffer.from(shot.data, 'base64'));
  const stats = pngStats(shot.data);
  console.log(
    `  frame ${stats.width}x${stats.height} · mean luma ${stats.meanLuminance.toFixed(1)} · ` +
      `std dev ${stats.luminanceStdDev.toFixed(1)} · peak ${stats.maxLuminance.toFixed(0)} · ` +
      `${(stats.brightRatio * 100).toFixed(2)}% bright · ${stats.sampledColors} sampled colours`,
  );
  check('the frame is not blank', stats.luminanceStdDev > 6, `std dev ${stats.luminanceStdDev.toFixed(2)}`);
  check('the city is lit', stats.brightRatio > 0.002, `${(stats.brightRatio * 100).toFixed(3)}% bright pixels`);
  check('neon highlights blow out', stats.maxLuminance > 180, `peak ${stats.maxLuminance.toFixed(0)}`);
  check('the skyline has depth', stats.sampledColors > 400, `${stats.sampledColors} colours`);
  check('the city band is darker than the lit panels', stats.cityMeanLuminance < stats.meanLuminance * 2.2);

  console.log('\n=== Advancing over real time ===');
  check('the view updates while running', first !== second);
  check('no runtime errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const tail = second.split('\n').filter((line) => line.trim().length > 0).slice(0, 14).join('\n    ');
  console.log(`\n--- screen text sample ---\n    ${tail}`);

  console.log(`\n${failures === 0 ? 'ALL BROWSER CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
} catch (error) {
  failures++;
  console.error('browser check crashed:', error);
} finally {
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
