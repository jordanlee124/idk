import { createWorld } from '../src/sim/world';
import { emptyCtx, rebuildCtx } from '../src/sim/econ';
import type { World, Group } from '../src/sim/types';
import { newGroup } from '../src/sim/world';

export function fnv(text: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A world with its single founding band, plus a fresh context. */
export function fresh(seed = 7): { world: World; ctx: ReturnType<typeof emptyCtx> } {
  const world = createWorld(seed);
  const ctx = emptyCtx(world);
  rebuildCtx(world, ctx);
  return { world, ctx };
}

export function addGroup(world: World, tile: number, pop: number, techs: string[], cultureId = 0): Group {
  const g = newGroup(world.nextId++, cultureId, tile, pop, techs, world.year, null);
  world.groups.push(g);
  return g;
}
