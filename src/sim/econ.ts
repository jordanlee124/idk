// Food, capacity and per-tick lookup tables shared by the systems.
import { TECH_BY_ID, type TechEffects } from './content/techs';
import { TERRAINS } from './content/terrain';
import { TUNING } from './content/stages';
import { neighbours } from './hex';
import type { Group, World, WorldMap } from './types';

export interface Ctx {
  /** Tile -> index in world.groups of the group standing there, or -1. */
  occ: Int32Array;
  /** Tile -> how many groups claim it (their own tile or an adjacent one). */
  claims: Uint8Array;
  /** Tile -> drought severity 0..1. */
  droughtSev: Float32Array;
  /** Tile -> regional weather multiplier on food (slow shifting wet and dry regions). */
  weather: Float32Array;
  /** Which 5-year slice `weather` was computed for. */
  weatherStamp: number;
}

/** A group works its own tile plus every tile this far around it. */
export const TERRITORY_RADIUS = 2;
/** Share of a tile's yield by position in a nearest-first ring list: own tile, ring 1, ring 2. */
export function tileWeight(k: number): number {
  return k === 0 ? 1 : k < 7 ? TUNING.ring1Share : TUNING.ring2Share;
}

const ring1Cache = new WeakMap<WorldMap, number[][]>();
const ringCache = new WeakMap<WorldMap, Map<number, number[][]>>();

/** For each tile: itself followed by its neighbours. */
export function ring1(map: WorldMap): number[][] {
  let r = ring1Cache.get(map);
  if (!r) {
    r = [];
    for (let i = 0; i < map.w * map.h; i++) r.push([i, ...neighbours(i, map.w, map.h)]);
    ring1Cache.set(map, r);
  }
  return r;
}

/** For each tile: every tile within `radius`, nearest first (cached). */
export function ringN(map: WorldMap, radius: number): number[][] {
  let byRadius = ringCache.get(map);
  if (!byRadius) {
    byRadius = new Map();
    ringCache.set(map, byRadius);
  }
  let r = byRadius.get(radius);
  if (!r) {
    r = [];
    const n = map.w * map.h;
    for (let i = 0; i < n; i++) {
      const seen = new Set<number>([i]);
      let frontier = [i];
      const out = [i];
      for (let step = 0; step < radius; step++) {
        const next: number[] = [];
        for (const t of frontier) {
          for (const nb of neighbours(t, map.w, map.h)) {
            if (!seen.has(nb)) {
              seen.add(nb);
              next.push(nb);
              out.push(nb);
            }
          }
        }
        frontier = next;
      }
      r.push(out);
    }
    byRadius.set(radius, r);
  }
  return r;
}

export function emptyCtx(world: World): Ctx {
  const n = world.map.w * world.map.h;
  return { occ: new Int32Array(n).fill(-1), claims: new Uint8Array(n), droughtSev: new Float32Array(n), weather: new Float32Array(n).fill(1), weatherStamp: -1 };
}

/** Rebuild occupancy and claims from the current groups. Drought severity is kept. */
export function rebuildCtx(world: World, ctx: Ctx): void {
  ctx.occ.fill(-1);
  ctx.claims.fill(0);
  const rings = ring1(world.map);
  const claimRings = ringN(world.map, TERRITORY_RADIUS);
  world.groups.forEach((g, i) => {
    ctx.occ[g.tile] = i;
    for (const t of claimRings[g.tile]) ctx.claims[t]++;
  });
  void rings;
}

export interface Agg extends Required<TechEffects> {
  key: string;
}
const aggCache = new Map<string, Agg>();

export function aggregate(techs: readonly string[]): Agg {
  const key = [...techs].sort().join(',');
  let a = aggCache.get(key);
  if (!a) {
    a = { key, forage: 0, fish: 0, farm: 0, store: 0, cold: 0, health: 0, droughtResist: 0, fertility: 0 };
    for (const id of techs) {
      const e = TECH_BY_ID[id]?.effects;
      if (!e) continue;
      for (const k of Object.keys(e) as (keyof TechEffects)[]) a[k] += e[k] ?? 0;
    }
    a.cold = Math.min(1, a.cold);
    a.health = Math.min(0.6, a.health);
    a.droughtResist = Math.min(0.9, a.droughtResist);
    aggCache.set(key, a);
  }
  return a;
}

export function traitFactor(world: World, g: Group, trait: string, factor: number): number {
  return world.cultures[g.cultureId]?.traits.includes(trait) ? factor : 1;
}

/**
 * Food (in "people fed") a group standing on `tile` would get with these techs.
 * `self` is the group currently attached (when evaluating a move or its present land); null for a brand-new group.
 */
export function capacityAt(
  world: World,
  ctx: Ctx,
  tile: number,
  agg: Agg,
  farmEff: number,
  self: Group | null,
  selfIndex: number,
): number {
  const { map, climate } = world;
  const rings = ringN(map, TERRITORY_RADIUS);
  const selfRing = self ? rings[self.tile] : null;
  let total = 0;
  const mine = rings[tile];
  for (let k = 0; k < mine.length; k++) {
    const t = mine[k];
    const def = TERRAINS[map.terrain[t]];
    if (!def.habitable) continue;
    const occ = ctx.occ[t];
    if (occ >= 0 && occ !== selfIndex) continue; // someone else's camp
    let share: number;
    if (k === 0) {
      share = 1;
    } else {
      let claimants = ctx.claims[t];
      if (selfRing && selfRing.includes(t)) claimants -= 1;
      claimants += 1;
      share = tileWeight(k) / claimants;
    }
    const drought = 1 - ctx.droughtSev[t] * (1 - agg.droughtResist);
    const fert = map.fert[t] * drought * climate.mod * ctx.weather[t];
    const cold = 1 - TUNING.coldPenalty * map.cold[t] * (1 - agg.cold);
    let y = TUNING.forageFood * fert * (1 + agg.forage) * cold;
    if (agg.fish > 0 && (map.coast[t] || map.river[t])) y += agg.fish * cold;
    if (agg.farm > 0) y += TUNING.farmFood * fert * def.farmable * agg.farm * farmEff * cold;
    total += y * share;
  }
  return total;
}

export function farmEfficiency(g: Group): number {
  return g.stage === 'village' ? 1 : TUNING.tribeFarmEfficiency;
}
