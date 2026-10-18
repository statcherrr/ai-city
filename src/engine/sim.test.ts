import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '@/data/scenarios';
import { generateCity } from '@/engine/city';
import { Simulation } from '@/engine/sim';

describe('Simulation - Rationale', () => {
  it('includes rationale on every feed item', () => {
    const city = generateCity();
    const scenario = SCENARIOS.find((s) => s.id === 'parade');
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const sim = new Simulation({ city, scenario, mode: 'coordinated' });
    const guard = Math.ceil(sim.totalMin / 0.05) + 10;
    for (let i = 0; i < guard && !sim.finished; i++) {
      sim.advance();
    }
    expect(sim.finished).toBe(true);
    const feed = sim.getFeed();
    expect(feed.length).toBeGreaterThan(0);
    for (let i = 0; i < feed.length; i++) {
      expect(feed[i]?.rationale).toBeDefined();
    }
  });
});
