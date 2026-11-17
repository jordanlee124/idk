import { T, TERRAINS, RIVER_FERTILITY_BONUS } from './content/terrain';
import { neighbours } from './hex';
import { hashSeed, rand, randInt, type RngState } from './rng';
import type { WorldMap } from './types';

export const MAP_W = 72;
export const MAP_H = 52;

function lattice(seed: number, ix: number, iy: number): number {
  return hashSeed(seed, ix, iy) / 4294967296;
}

export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = lattice(seed, ix, iy);
  const b = lattice(seed, ix + 1, iy);
  const c = lattice(seed, ix, iy + 1);
  const d = lattice(seed, ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(seed: number, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(seed + o * 101, x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Tiles of the largest connected landmass. */
export function largestLandmassTiles(map: WorldMap): number[] {
  const { w, h, terrain } = map;
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || terrain[i] === T.Ocean) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      for (const n of neighbours(t, w, h)) {
        if (!seen[n] && terrain[n] !== T.Ocean) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

export function largestLandmass(map: WorldMap): number {
  return largestLandmassTiles(map).length;
}

function generateAttempt(seed: number, attempt: number): WorldMap {
  const w = MAP_W;
  const h = MAP_H;
  const n = w * h;
  const s = hashSeed(seed, attempt, 7);
  const stream: RngState = { rng: hashSeed(seed, attempt, 99) };

  // Height: noise pulled into a continent by a soft ellipse mask.
  const elevRaw = new Array<number>(n);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const ox = (hashSeed(s, 1) / 4294967296 - 0.5) * w * 0.18;
  const oy = (hashSeed(s, 2) / 4294967296 - 0.5) * h * 0.18;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 * (y & 1);
      const dx = (px - cx - ox) / (w * 0.5);
      const dy = (y - cy - oy) / (h * 0.5);
      const d = Math.sqrt(dx * dx + dy * dy);
      const mask = Math.max(0, 1 - Math.pow(d, 2.2));
      const noise = fbm(s, px * 0.075, y * 0.1, 5);
      elevRaw[y * w + x] = noise * 0.85 + mask * 0.42;
    }
  }
  const sea = quantile(elevRaw, 0.57);
  const elev = elevRaw.map((e) => Math.min(1, Math.max(0, (e - sea) / (1 - sea) * 0.5 + (e >= sea ? 0.5 : (e - sea) / sea * 0.5))));
  // elev 0.5 is sea level now; < 0.5 is water.

  const isLand = (i: number) => elev[i] >= 0.5;
  const landElev = (i: number) => (elev[i] - 0.5) * 2; // 0..1 above sea

  // Rough distance to the sea, for moisture.
  const dist = new Array<number>(n).fill(99);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) if (!isLand(i)) { dist[i] = 0; frontier.push(i); }
  for (let step = 1; step < 8 && frontier.length; step++) {
    const next: number[] = [];
    for (const t of frontier) for (const nb of neighbours(t, w, h)) if (dist[nb] > step) { dist[nb] = step; next.push(nb); }
    frontier = next;
  }

  // Rank-based thresholds keep biome mix sensible whatever the noise does.
  const rank = (vals: number[], idxs: number[]) => {
    const order = [...idxs].sort((a, b) => vals[a] - vals[b]);
    const r = new Array<number>(n).fill(0);
    order.forEach((idx, k) => { r[idx] = k / Math.max(1, order.length - 1); });
    return r;
  };
  const landIdx: number[] = [];
  for (let i = 0; i < n; i++) if (isLand(i)) landIdx.push(i);
  const moistRaw = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!isLand(i)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    moistRaw[i] = fbm(s + 5000, (x + 0.5 * (y & 1)) * 0.09, y * 0.12, 4) + Math.max(0, 3 - dist[i]) * 0.04;
  }
  const moistRank = rank(moistRaw, landIdx);
  const elevRank = rank(elev, landIdx);

  const terrain = new Array<number>(n).fill(T.Ocean);
  const fert = new Array<number>(n).fill(0);
  const cold = new Array<number>(n).fill(0);
  const moist = new Array<number>(n).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!isLand(i)) continue;
      const lat = Math.abs((y - cy) / cy); // 0 equator .. 1 pole
      const e = landElev(i);
      const temp = 1 - Math.pow(lat, 1.3) * 0.95 - e * 0.35;
      const m = moistRank[i];
      moist[i] = m;
      cold[i] = Math.min(1, Math.max(0, (0.5 - temp) * 2));
      let t: T;
      const er = elevRank[i];
      if (er > 0.975) t = T.Mountain;
      else if (temp < 0.2) t = T.Tundra;
      else if (er > 0.85) t = T.Hills;
      else if (m < 0.14 && temp > 0.4) t = T.Desert;
      else if (m > 0.66) t = T.Forest;
      else if (m < 0.4) t = T.Plains;
      else t = T.Grassland;
      terrain[i] = t;
      const base = TERRAINS[t].fertility;
      fert[i] = Math.min(1, Math.max(0, base * (0.75 + m * 0.5)));
    }
  }

  // Rivers: start in wet highlands, run downhill to the sea.
  const river = new Array<number>(n).fill(0);
  const sources: number[] = [];
  for (let i = 0; i < n; i++) if (isLand(i) && landElev(i) > 0.4 && moist[i] > 0.45 && terrain[i] !== T.Desert) sources.push(i);
  const riverCount = Math.floor(n / 150);
  for (let r = 0; r < riverCount && sources.length; r++) {
    let cur = sources.splice(randInt(stream, sources.length), 1)[0];
    const path = new Set<number>();
    for (let step = 0; step < 90; step++) {
      river[cur] = 1;
      path.add(cur);
      let best = -1;
      let bestE = elev[cur];
      for (const nb of neighbours(cur, w, h)) {
        if (path.has(nb)) continue;
        const jitter = (rand(stream) - 0.5) * 0.004;
        if (elev[nb] + jitter < bestE) {
          bestE = elev[nb] + jitter;
          best = nb;
        }
      }
      if (best < 0) break;
      if (!isLand(best) || river[best]) {
        if (!isLand(best)) river[cur] = 1;
        break;
      }
      cur = best;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!isLand(i)) continue;
    if (river[i]) {
      fert[i] = Math.min(1, fert[i] + RIVER_FERTILITY_BONUS);
      for (const nb of neighbours(i, w, h)) if (isLand(nb) && !river[nb]) fert[nb] = Math.min(1, fert[nb] + RIVER_FERTILITY_BONUS * 0.35);
    }
  }
  for (let i = 0; i < n; i++) if (terrain[i] === T.Mountain) fert[i] = Math.min(fert[i], 0.06);

  const coast = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!isLand(i)) continue;
    if (neighbours(i, w, h).some((nb) => !isLand(nb))) coast[i] = 1;
  }

  return {
    w,
    h,
    terrain,
    elev: elev.map((e) => Math.round(e * 1000) / 1000),
    fert: fert.map((f) => Math.round(f * 1000) / 1000),
    river,
    coast,
    cold: cold.map((c) => Math.round(c * 1000) / 1000),
  };
}

/** Generates a continent from a seed. Retries with a salted seed until the land is usable. */
export function generateMap(seed: number): WorldMap {
  let best: WorldMap | null = null;
  let bestSize = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const map = generateAttempt(seed, attempt);
    const size = largestLandmass(map);
    if (size >= 700) return map;
    if (size > bestSize) {
      best = map;
      bestSize = size;
    }
  }
  return best!;
}
