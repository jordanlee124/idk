// Seeded random numbers. All sim randomness goes through these functions and the
// generator state lives inside the world, so a given seed always gives the same history.

export function hashSeed(...parts: number[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Anything that carries generator state (the world, or a standalone stream). */
export interface RngState {
  rng: number;
}

/** Uniform float in [0, 1). mulberry32. */
export function rand(s: RngState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: RngState, n: number): number {
  return Math.floor(rand(s) * n);
}

export function randRange(s: RngState, lo: number, hi: number): number {
  return lo + rand(s) * (hi - lo);
}

export function chance(s: RngState, p: number): boolean {
  return rand(s) < p;
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  return arr[randInt(s, arr.length)];
}

export function gauss(s: RngState): number {
  const u = 1 - rand(s);
  const v = rand(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson-distributed integer with the given mean (normal approximation when large). */
export function poisson(s: RngState, mean: number): number {
  if (mean <= 0) return 0;
  if (mean < 30) {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rand(s);
    } while (p > limit);
    return k - 1;
  }
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss(s)));
}
