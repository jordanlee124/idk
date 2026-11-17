import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';

// Automatic checks that back the milestone gate: histories survive, reach villages, and differ between seeds.
describe('milestone 1 gate (headless)', () => {
  it('on 5 seeds, founders survive, villages appear, and the histories differ', () => {
    const agriYears: number[] = [];
    const finals: string[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = createWorld(seed);
      let agri = -1;
      for (let y = 0; y < 2200; y++) {
        step(w);
        if (agri < 0 && w.firsts.includes('tech:agriculture')) agri = w.year;
      }
      expect(w.ended).toBe(false);
      expect(w.groups.length).toBeGreaterThan(50);
      expect(w.groups.some((g) => g.stage === 'village')).toBe(true);
      expect(w.chronicle.filter((c) => c.importance === 3).length).toBeGreaterThan(8);
      agriYears.push(agri);
      finals.push(`${w.groups.length}/${w.groups.reduce((a, g) => a + g.pop, 0)}`);
    }
    expect(agriYears.every((y) => y > 0)).toBe(true);
    expect(new Set(agriYears).size).toBeGreaterThanOrEqual(4);
    expect(new Set(finals).size).toBe(5);
  }, 120000);
  it('the founders almost always survive their first centuries (40 seeds)', () => {
    let alive = 0;
    for (let seed = 100; seed < 140; seed++) {
      const w = createWorld(seed);
      for (let y = 0; y < 300; y++) step(w);
      if (!w.ended) alive++;
    }
    expect(alive).toBeGreaterThanOrEqual(38);
  }, 120000);
});
