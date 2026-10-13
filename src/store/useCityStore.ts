/**
 * The store is a thin UI projection of the engine: it holds the throttled
 * snapshot, the accumulated AI actions feed and the Before/After comparison.
 * It never drives the simulation — commands go out through `cityEngine`.
 */

import { create } from 'zustand';
import { cityEngine, type Comparison, type EngineSnapshot } from '@/engine/engine';
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { matchIntent, type IntentResult } from '@/engine/intent';
import type { FeedItem, ScenarioId, SimMode, Speed } from '@/engine/types';

const MAX_FEED_ITEMS = 120;

export interface AskResult {
  query: string;
  intent: IntentResult;
  /** Set once both headless runs have finished. */
  comparison: Comparison | null;
  pending: boolean;
}

export interface CityStore {
  snapshot: EngineSnapshot;
  feed: FeedItem[];
  comparison: Comparison | null;
  ask: AskResult | null;
  activeQuery: string;
  started: boolean;

  init: () => void;
  trigger: (scenarioId: ScenarioId) => void;
  submitQuery: (query: string) => void;
  setMode: (mode: SimMode) => void;
  toggleMode: () => void;
  setSpeed: (speed: Speed) => void;
  togglePause: () => void;
  stop: () => void;
  focusIncident: () => void;
  clearAsk: () => void;
}

export const useCityStore = create<CityStore>((set, get) => ({
  snapshot: cityEngine.snapshot(),
  feed: [],
  comparison: null,
  ask: null,
  activeQuery: '',
  started: false,

  init: () => {
    if (get().started) return;
    set({ started: true });
    cityEngine.subscribe(({ snapshot, feed, finished }) => {
      const state = get();
      const nextFeed = feed.length > 0 ? [...state.feed, ...feed] : state.feed;
      const trimmed = nextFeed.length > MAX_FEED_ITEMS ? nextFeed.slice(-MAX_FEED_ITEMS) : nextFeed;
      set({ snapshot, feed: trimmed });

      if (finished) {
        // A run has just ended: make sure the comparison card reflects it.
        const comparison = state.comparison?.scenarioId === finished.scenarioId ? state.comparison : null;
        if (comparison) set({ comparison });
      }
    });

    // Deep links:
    //   ?scenario=water-main          open straight into a replay
    //   &advance=12                   jump that many simulated minutes in
    //   &speed=4                      start at a faster clock
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('scenario');
    const speed = Number(params.get('speed'));
    if (speed === 2 || speed === 4) cityEngine.setSpeed(speed);
    if (!requested || !SCENARIO_BY_ID.has(requested as ScenarioId)) return;
    get().trigger(requested as ScenarioId);

    const advance = Number(params.get('advance'));
    if (!Number.isFinite(advance) || advance <= 0) return;
    // Step the replay to the requested minute before the first paint, so a link
    // can point at the interesting part of the incident.
    let guard = 0;
    while (cityEngine.snapshot().timeMin < advance && guard++ < 4000) cityEngine.tick(0.25);
  },

  trigger: (scenarioId) => {
    cityEngine.start(scenarioId, cityEngine.mode);
    // Warm the comparison cache so the results card is instant when asked for.
    void scheduleComparison(set, scenarioId, get);
  },

  submitQuery: (query) => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    const intent = matchIntent(trimmed);
    set({ activeQuery: trimmed, ask: { query: trimmed, intent, comparison: null, pending: intent.match !== null } });
    if (!intent.match) return;
    cityEngine.start(intent.match.scenarioId, cityEngine.mode);
    void scheduleComparison(set, intent.match.scenarioId, get);
  },

  setMode: (mode) => cityEngine.setMode(mode),
  toggleMode: () => cityEngine.setMode(cityEngine.mode === 'coordinated' ? 'siloed' : 'coordinated'),
  setSpeed: (speed) => cityEngine.setSpeed(speed),
  togglePause: () => cityEngine.togglePause(),
  stop: () => cityEngine.stop(),
  focusIncident: () => {
    const center = get().snapshot.incidentCenter;
    if (center) cityEngine.focusOn(center);
  },
  clearAsk: () => set({ ask: null, activeQuery: '' }),
}));

/**
 * The headless comparison runs the full timeline twice, which costs a fraction
 * of a second. Defer it a frame so the replay starts immediately.
 */
async function scheduleComparison(
  set: (partial: Partial<CityStore>) => void,
  scenarioId: ScenarioId,
  get: () => CityStore,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const comparison = cityEngine.comparison(scenarioId);
  set({ comparison });
  const ask = get().ask;
  if (ask && ask.intent.match?.scenarioId === scenarioId) {
    set({ ask: { ...ask, comparison, pending: false } });
  }
}
