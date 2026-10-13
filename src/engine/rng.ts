/**
 * Deterministic PRNG (mulberry32). Every random decision in the city — building
 * placement, window lighting, agent spawns and re-routes — draws from a seeded
 * stream, and the stream can be snapshotted and restored so a replay of the
 * same scenario produces byte-for-byte identical traffic.
 */
export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  private next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))] as T;
  }

  saveState(): number {
    return this.a;
  }

  loadState(state: number): void {
    this.a = state >>> 0;
  }
}

/** Stable hash of two ints, used for per-building shader/window variety. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
