import { emptyCtx, rebuildCtx, type Ctx } from './econ';
import { chronicleSystem } from './systems/chronicle';
import { climateSystem } from './systems/climate';
import { foodSystem } from './systems/food';
import { migrationSystem } from './systems/migration';
import { populationSystem } from './systems/population';
import { stageSystem } from './systems/stage';
import { techSystem } from './systems/tech';
import type { World } from './types';

const ctxCache = new WeakMap<World, Ctx>();

function getCtx(world: World): Ctx {
  let ctx = ctxCache.get(world);
  if (!ctx) {
    ctx = emptyCtx(world);
    ctxCache.set(world, ctx);
  }
  return ctx;
}

/**
 * Advance the world by one year. Systems run in a fixed order; nothing here reads a clock or Math.random.
 * 1 climate, 2 food, 3 population, 4 migration and splitting, 5 tech, 6 stage check, 9 chronicle.
 * (7 relations, 8 polities and 10 player influence arrive in later milestones.)
 */
export function step(world: World): World {
  if (world.ended) {
    world.year++;
    return world;
  }
  world.year++;
  const ctx = getCtx(world);
  rebuildCtx(world, ctx);
  climateSystem(world, ctx);
  foodSystem(world, ctx);
  populationSystem(world);
  rebuildCtx(world, ctx);
  migrationSystem(world, ctx);
  rebuildCtx(world, ctx);
  techSystem(world, ctx);
  stageSystem(world);
  chronicleSystem(world);
  return world;
}

export function run(world: World, years: number): World {
  for (let i = 0; i < years; i++) step(world);
  return world;
}
