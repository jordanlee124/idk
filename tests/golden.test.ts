import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { run } from '../src/sim/step';
import { fnv } from './helpers';

const SEED = 1234;
// If you change any rule or number on purpose, history changes: re-run and paste the new fingerprint.
const GOLDEN_2000 = '790f739c';

describe('golden seed', () => {
  it('same seed, same 2,000 years, byte for byte', () => {
    const a = run(createWorld(SEED), 2000);
    const b = run(createWorld(SEED), 2000);
    const ja = JSON.stringify(a);
    expect(ja).toBe(JSON.stringify(b));
    expect(a.year).toBe(2000);
    expect(fnv(ja)).toBe(GOLDEN_2000);
  }, 60000);
  it('survives a save and load in the middle without changing history', () => {
    const straight = run(createWorld(SEED), 900);
    const half = run(createWorld(SEED), 450);
    const reloaded = JSON.parse(JSON.stringify(half));
    run(reloaded, 450);
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(straight));
  }, 60000);
});
