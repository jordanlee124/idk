import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/sim/content/stages';
import { T } from '../src/sim/content/terrain';
import { aggregate, capacityAt, farmEfficiency, rebuildCtx } from '../src/sim/econ';
import { chronicleSystem } from '../src/sim/systems/chronicle';
import { climateSystem } from '../src/sim/systems/climate';
import { foodSystem } from '../src/sim/systems/food';
import { migrationSystem } from '../src/sim/systems/migration';
import { populationSystem } from '../src/sim/systems/population';
import { stageSystem } from '../src/sim/systems/stage';
import { techSystem } from '../src/sim/systems/tech';
import { step } from '../src/sim/step';
import { addGroup, fresh } from './helpers';

/** A fertile land tile far from the founders, for placing test groups. */
function goodTile(world: ReturnType<typeof fresh>['world'], skip: number[] = []): number {
  const { map } = world;
  let best = -1;
  for (let i = 0; i < map.w * map.h; i++) {
    if (map.terrain[i] === T.Grassland && map.fert[i] > 0.7 && !skip.includes(i) && world.groups.every((g) => Math.abs(g.tile - i) > 200)) {
      best = i;
      if (map.coast[i] === 0) return i;
    }
  }
  return best;
}

describe('climate system', () => {
  it('keeps the yearly multiplier sane, and ends droughts', () => {
    const { world, ctx } = fresh();
    for (let y = 0; y < 400; y++) {
      world.year++;
      climateSystem(world, ctx);
      expect(world.climate.mod).toBeGreaterThan(0.6);
      expect(world.climate.mod).toBeLessThan(1.4);
    }
    world.droughts = [{ tile: 100, radius: 2, until: world.year + 3, severity: 0.5 }];
    world.year += 5;
    climateSystem(world, ctx);
    expect(world.droughts.length).toBe(0);
    expect(Math.max(...ctx.droughtSev)).toBe(0);
  });
});

describe('food system', () => {
  it('better techs feed more people; farming helps villages more than tribes', () => {
    const { world, ctx } = fresh();
    const tile = goodTile(world);
    const g = addGroup(world, tile, 40, ['fire', 'stone_tools']);
    rebuildCtx(world, ctx);
    const idx = world.groups.indexOf(g);
    const base = capacityAt(world, ctx, tile, aggregate(g.techs), 1, g, idx);
    const hunt = capacityAt(world, ctx, tile, aggregate([...g.techs, 'hunting']), 1, g, idx);
    const farm = aggregate([...g.techs, 'gathering', 'calendar', 'agriculture']);
    const asTribe = capacityAt(world, ctx, tile, farm, 0.5, g, idx);
    const asVillage = capacityAt(world, ctx, tile, farm, 1, g, idx);
    expect(hunt).toBeGreaterThan(base);
    expect(asTribe).toBeGreaterThan(hunt);
    expect(asVillage).toBeGreaterThan(asTribe);
    g.stage = 'village';
    expect(farmEfficiency(g)).toBe(1);
  });
  it('records hunger when there is not enough food, and stores surplus for settlers', () => {
    const { world, ctx } = fresh();
    const tile = goodTile(world);
    const g = addGroup(world, tile, 5000, ['fire', 'stone_tools']);
    rebuildCtx(world, ctx);
    foodSystem(world, ctx);
    expect(g.foodRatio).toBeLessThan(0.5);
    const v = addGroup(world, goodTile(world, [tile]), 10, ['fire', 'stone_tools', 'gathering', 'calendar', 'agriculture']);
    v.stage = 'village';
    rebuildCtx(world, ctx);
    for (let i = 0; i < 5; i++) foodSystem(world, ctx);
    expect(v.foodRatio).toBeGreaterThan(1);
    expect(v.food).toBeGreaterThan(0);
  });
});

describe('population system', () => {
  it('grows a well fed group and shrinks a starving one', () => {
    const { world, ctx } = fresh();
    const rich = addGroup(world, goodTile(world), 100, ['fire', 'stone_tools']);
    const poor = addGroup(world, goodTile(world, [rich.tile]), 100, ['fire', 'stone_tools']);
    rebuildCtx(world, ctx);
    rich.foodRatio = 1.6;
    poor.foodRatio = 0.3;
    let r = rich.pop;
    let p = poor.pop;
    for (let i = 0; i < 10; i++) {
      populationSystem(world);
    }
    r = rich.pop - r;
    p = poor.pop - p;
    expect(r).toBeGreaterThan(0);
    expect(p).toBeLessThan(0);
  });
  it('removes a dead group, forgets techs only it knew, and ends the world when nobody is left', () => {
    const { world } = fresh();
    for (const g of world.groups) g.pop = 0;
    world.groups[0].techs = ['fire', 'stone_tools'];
    populationSystem(world);
    expect(world.groups.length).toBe(0);
    expect(world.ended).toBe(true);
    expect(world.events.some((e) => e.kind === 'tech_lost')).toBe(true);
    expect(world.events.some((e) => e.kind === 'world_empty')).toBe(true);
  });
  it('lets the founders grow old and die', () => {
    const { world } = fresh();
    world.groups[0].pop = 20;
    world.groups[0].foodRatio = 1.2;
    world.year = 100;
    populationSystem(world);
    expect(world.characters.filter((c) => c.role === 'founder').every((c) => !c.alive)).toBe(true);
    expect(world.events.filter((e) => e.kind === 'founder_died').length).toBe(2);
  });
});

describe('migration system', () => {
  it('splits a crowded group: people are conserved and the new group lands on free land', () => {
    const { world, ctx } = fresh();
    const g = world.groups[0];
    g.pop = 160;
    g.crowding = 1.5;
    g.capacity = 100;
    g.stage = 'tribe';
    const total = g.pop;
    let split = false;
    for (let tries = 0; tries < 60 && !split; tries++) {
      rebuildCtx(world, ctx);
      migrationSystem(world, ctx);
      split = world.groups.length > 1;
      if (!split) g.pop = 160;
    }
    expect(split).toBe(true);
    const child = world.groups[1];
    expect(g.pop + child.pop).toBe(total);
    expect(child.tile).not.toBe(g.tile);
    expect(world.map.terrain[child.tile]).not.toBe(T.Ocean);
    expect(child.parent).toBe(g.id);
    expect(world.events.some((e) => e.kind === 'split')).toBe(true);
  });
});

describe('tech system', () => {
  it('discovers techs only when prerequisites are known, and spreads them to neighbours', () => {
    const { world, ctx } = fresh();
    const g = world.groups[0];
    g.pop = 200;
    g.crowding = 1;
    for (let y = 0; y < 8000 && !g.techs.includes('hunting'); y++) {
      world.year++;
      techSystem(world, ctx);
      expect(g.techs.includes('agriculture')).toBe(false); // needs Plant Lore and a Calendar first
    }
    expect(g.techs).toContain('hunting');
    // Diffusion: a neighbour knowing something the founders lack passes it on.
    const near = g.tile + 3;
    const n = addGroup(world, near, 50, ['fire', 'stone_tools', 'cooking']);
    g.techs = ['fire', 'stone_tools'];
    rebuildCtx(world, ctx);
    for (let y = 0; y < 3000 && !g.techs.includes('cooking'); y++) {
      world.year++;
      techSystem(world, ctx);
      n.techs = ['fire', 'stone_tools', 'cooking'];
    }
    expect(g.techs).toContain('cooking');
  });
});

describe('stage system', () => {
  it('promotes a band to a tribe, a settled farming tribe to a village, and demotes on famine', () => {
    const { world } = fresh();
    const g = world.groups[0];
    g.techs = ['fire', 'stone_tools', 'gathering', 'calendar', 'agriculture'];
    g.pop = STAGES.tribeAt;
    stageSystem(world);
    expect(g.stage).toBe('tribe');
    expect(g.leader).not.toBeNull();
    g.sedentary = STAGES.villageSedentaryYears;
    g.pop = 60;
    stageSystem(world);
    expect(g.stage).toBe('village');
    expect(g.placeName).toBeTruthy();
    g.famine = STAGES.villageFamineYears;
    stageSystem(world);
    expect(g.stage).toBe('tribe');
    expect(g.placeName).toBeNull();
    g.pop = STAGES.bandBelow - 1;
    stageSystem(world);
    expect(g.stage).toBe('band');
  });
  it('will not settle a tribe that has not farmed long enough', () => {
    const { world } = fresh();
    const g = world.groups[0];
    g.techs = ['fire', 'stone_tools', 'gathering', 'calendar', 'agriculture'];
    g.pop = 80;
    g.stage = 'tribe';
    g.sedentary = 3;
    stageSystem(world);
    expect(g.stage).toBe('tribe');
  });
});

describe('chronicle system', () => {
  it('turns events into dated sentences and clears them', () => {
    const { world } = fresh();
    world.year = 12;
    world.events.push({ kind: 'tribe', year: 12, groupId: 1, cultureId: 0, n: 31, first: true, extra: 'Chief Ola' });
    world.events.push({ kind: 'discovery', year: 12, groupId: 1, cultureId: 0, techId: 'hunting', first: true });
    const before = world.chronicle.length;
    chronicleSystem(world);
    expect(world.events.length).toBe(0);
    expect(world.chronicle.length).toBe(before + 2);
    const last = world.chronicle[world.chronicle.length - 1];
    expect(last.text).toContain('Organised Hunting');
    expect(last.year).toBe(12);
    expect(new Set(world.chronicle.map((c) => c.id)).size).toBe(world.chronicle.length);
  });
});

describe('step', () => {
  it('advances one year and never produces NaN', () => {
    const { world } = fresh(11);
    for (let i = 0; i < 300; i++) step(world);
    expect(world.year).toBe(300);
    for (const g of world.groups) {
      expect(Number.isFinite(g.pop)).toBe(true);
      expect(Number.isFinite(g.food)).toBe(true);
      expect(g.pop).toBeGreaterThan(0);
    }
  });
});
