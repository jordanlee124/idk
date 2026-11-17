import { describe, expect, it } from 'vitest';
import { hashSeed, poisson, rand } from '../src/sim/rng';
import { generateMap, largestLandmass } from '../src/sim/mapgen';
import { T } from '../src/sim/content/terrain';

describe('rng', () => {
  it('repeats exactly from the same state', () => {
    const a = { rng: hashSeed(5) };
    const b = { rng: hashSeed(5) };
    for (let i = 0; i < 100; i++) expect(rand(a)).toBe(rand(b));
  });
  it('poisson has roughly the requested mean', () => {
    const s = { rng: hashSeed(9) };
    for (const mean of [0.5, 4, 80]) {
      let sum = 0;
      for (let i = 0; i < 4000; i++) sum += poisson(s, mean);
      expect(sum / 4000).toBeGreaterThan(mean * 0.9);
      expect(sum / 4000).toBeLessThan(mean * 1.1);
    }
  });
});

describe('map generation', () => {
  it('gives the same map for the same seed and different maps for different seeds', () => {
    const a = generateMap(42);
    const b = generateMap(42);
    const c = generateMap(43);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.terrain)).not.toBe(JSON.stringify(c.terrain));
  });
  it('makes a usable continent with rivers and variety on many seeds', () => {
    for (const seed of [1, 2, 3, 99, 4471, 123456]) {
      const m = generateMap(seed);
      expect(largestLandmass(m)).toBeGreaterThan(700);
      expect(m.river.some((r) => r === 1)).toBe(true);
      const kinds = new Set(m.terrain);
      expect(kinds.has(T.Grassland) || kinds.has(T.Plains)).toBe(true);
      expect(kinds.size).toBeGreaterThanOrEqual(5);
      expect(m.fert.every((f) => f >= 0 && f <= 1)).toBe(true);
    }
  });
});
