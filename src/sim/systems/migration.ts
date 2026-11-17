// System 4: crowded groups split, and the new group moves to the best free land; nomads wander toward richer ground.
import { DIRECTIONS, STAGES, TUNING } from '../content/stages';
import { TERRAINS } from '../content/terrain';
import { aggregate, capacityAt, rebuildCtx, ring1, ringN, type Ctx } from '../econ';
import { compass, distance } from '../hex';
import { driftCulture } from '../names';
import { chance, rand, type RngState } from '../rng';
import type { Group, World } from '../types';
import { newGroup } from '../world';

function describeDestination(world: World, from: number, to: number): string {
  const { map } = world;
  const dir = compass(from, to, map.w, DIRECTIONS);
  const def = TERRAINS[map.terrain[to]];
  const place = map.river[to] ? 'a river valley' : map.coast[to] ? 'the coast' : `the ${def.phrase}`;
  return `${dir}, to ${place}`;
}

interface Candidate {
  tile: number;
  score: number;
  cap: number;
}

function bestSite(world: World, ctx: Ctx, g: Group, selfIndex: number, radius: number, techs: string[], minDist: number, asNew: boolean): Candidate | null {
  const rng = world as RngState;
  const agg = aggregate(techs);
  const eff = g.stage === 'village' && !asNew ? 1 : TUNING.tribeFarmEfficiency;
  let best: Candidate | null = null;
  for (const t of ringN(world.map, radius)[g.tile]) {
    if (ctx.occ[t] >= 0) continue;
    if (!TERRAINS[world.map.terrain[t]].habitable) continue;
    // Camps keep a tile of space between them.
    if (ring1(world.map)[t].some((n) => ctx.occ[n] >= 0 && ctx.occ[n] !== (asNew ? -2 : selfIndex))) continue;
    const d = distance(g.tile, t, world.map.w);
    if (d < minDist) continue;
    const cap = capacityAt(world, ctx, t, agg, eff, asNew ? null : g, asNew ? -1 : selfIndex);
    const score = cap * (1 - 0.05 * d) * (0.92 + rand(rng) * 0.16);
    if (!best || score > best.score) best = { tile: t, score, cap };
  }
  return best;
}

export function migrationSystem(world: World, ctx: Ctx): void {
  const rng = world as RngState;
  const ids = world.groups.map((g) => g.id);
  const existingNames = new Set(world.cultures.map((c) => c.name));
  for (const id of ids) {
    const index = world.groups.findIndex((g) => g.id === id);
    if (index < 0) continue;
    const g = world.groups[index];
    if (g.pop <= 0) continue;

    const minSplit = g.stage === 'village' ? TUNING.minSplitPop + 20 : TUNING.minSplitPop;
    const wantsSplit = g.pop >= minSplit && (g.pop >= STAGES.tribeSplitAt || g.crowding >= TUNING.crowdSplit);
    if (wantsSplit && chance(rng, TUNING.splitChancePerYear)) {
      const childPop = Math.max(15, Math.round(g.pop * TUNING.splitFraction));
      const keeps = g.techs.filter(() => !chance(rng, TUNING.forgetOnSplit));
      const site = bestSite(world, ctx, g, index, TUNING.splitRadius, keeps, 2, true);
      if (site && site.cap >= childPop * 0.8) {
        splitGroup(world, ctx, g, site.tile, childPop, keeps, existingNames);
        continue;
      }
    }

    if (g.stage === 'village') continue;
    const knowsFarming = g.techs.includes('agriculture');
    let wander = TUNING.wanderChance * (g.foodRatio < 1.1 ? 3 : 1);
    if (knowsFarming && g.foodRatio >= 0.9) wander *= 0.15;
    if (chance(rng, wander)) {
      const site = bestSite(world, ctx, g, index, TUNING.moveRadius, g.techs, 1, false);
      if (site && site.cap > g.capacity * 1.25) {
        g.tile = site.tile;
        g.sedentary = 0;
        rebuildCtx(world, ctx);
      }
    }
  }
}

function splitGroup(world: World, ctx: Ctx, parent: Group, tile: number, childPop: number, techs: string[], existingNames: Set<string>): void {
  const rng = world as RngState;
  const parentCulture = world.cultures[parent.cultureId];
  let cultureId = parent.cultureId;
  if (chance(rng, 0.6)) {
    const culture = driftCulture(rng, parentCulture, world.cultures.length, existingNames);
    existingNames.add(culture.name);
    world.cultures.push(culture);
    cultureId = culture.id;
  }
  const foodShare = parent.food * (childPop / parent.pop);
  parent.pop -= childPop;
  parent.food -= foodShare;
  const child = newGroup(world.nextId++, cultureId, tile, childPop, techs, world.year, parent.id);
  child.food = foodShare * 0.5;
  world.groups.push(child);
  parent.crowding = parent.capacity > 0 ? parent.pop / parent.capacity : 9;
  const where = describeDestination(world, parent.tile, tile);
  world.events.push({
    kind: 'split',
    year: world.year,
    tile,
    groupId: child.id,
    otherGroupId: parent.id,
    cultureId,
    otherCultureId: parent.cultureId,
    text: where,
  });
  rebuildCtx(world, ctx);
}
