// System 3: births and deaths from food, disease and age; leaders and founders grow old.
import { STAGES, TUNING } from '../content/stages';
import { aggregate, traitFactor } from '../econ';
import { personName } from '../names';
import { poisson, randInt, type RngState } from '../rng';
import type { Character, Group, World } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function populationSystem(world: World): void {
  const rng = world as RngState;
  const firstGroupId = 1;
  for (const g of world.groups) {
    const agg = aggregate(g.techs);
    const r = g.foodRatio;
    const hunger = clamp(1 - r, 0, 1);

    let birth = TUNING.birthRate * (1 + agg.fertility) * traitFactor(world, g, 'fertile', 1.15) * clamp((r - 0.8) / 0.4, 0, 1);
    let death = TUNING.deathRate * (1 - agg.health) * traitFactor(world, g, 'hardy', 0.85);
    if (g.pop < TUNING.smallGroupSize) {
      birth *= TUNING.smallGroupBirthBoost;
      death *= TUNING.smallGroupDeathCut;
    }
    const before = g.pop;
    let births: number;
    let deaths: number;
    if (g.pop < TUNING.smallGroupSize) {
      // Tiny groups have children on a steady schedule and rarely lose adults: a story needs its founders to last.
      g.carry += g.pop * birth;
      births = Math.floor(g.carry);
      g.carry -= births;
      deaths = g.pop <= 3 && hunger < 0.2 ? 0 : poisson(rng, g.pop * (death + hunger * 0.35));
    } else {
      births = poisson(rng, g.pop * birth);
      deaths = poisson(rng, g.pop * (death + hunger * 0.35));
    }
    g.pop = Math.max(0, g.pop + births - deaths);

    if (hunger > 0.08) g.famine++;
    else g.famine = Math.max(0, g.famine - 1);
    if (g.famine === 2 && g.pop >= STAGES.tribeAt && hunger > 0.08) {
      world.events.push({ kind: 'famine', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, n: g.pop, text: g.placeName ?? undefined });
    }
    if (g.id === firstGroupId && world.year < 200) {
      for (const m of [6, 12, 20]) {
        const key = `ms:${m}`;
        if (before < m && g.pop >= m && !world.firsts.includes(key)) {
          world.firsts.push(key);
          world.events.push({ kind: 'milestone', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, n: g.pop });
        }
      }
    }
  }
  ageCharacters(world);
  removeExtinct(world);
}

function ageCharacters(world: World): void {
  const rng = world as RngState;
  for (const c of world.characters) {
    if (!c.alive || world.year < c.dies) continue;
    c.alive = false;
    const g = world.groups.find((x) => x.id === c.groupId);
    if (!g) continue;
    if (c.role === 'founder') {
      const otherAlive = world.characters.some((o) => o.role === 'founder' && o.alive && o.groupId === c.groupId);
      world.events.push({ kind: 'founder_died', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, extra: c.name, n: g.pop, first: otherAlive });
      if (otherAlive) g.leader = world.characters.find((o) => o.role === 'founder' && o.alive && o.groupId === c.groupId)!.id;
      else g.leader = null;
    } else if (g.leader === c.id) {
      makeChief(world, g); // succession happens quietly; only the founders' deaths are written up
    }
  }
  // Keep the list from growing without bound: forget dead non-founders.
  if (world.year % 50 === 0) world.characters = world.characters.filter((c) => c.alive || c.role === 'founder');
  void rng;
}

export function makeChief(world: World, g: Group): Character {
  const rng = world as RngState;
  const culture = world.cultures[g.cultureId];
  const chief: Character = {
    id: world.nextId++,
    name: personName(rng, culture),
    role: 'chief',
    born: world.year - 25,
    dies: world.year + 12 + randInt(rng, 30),
    groupId: g.id,
    cultureId: g.cultureId,
    alive: true,
  };
  world.characters.push(chief);
  g.leader = chief.id;
  return chief;
}

function removeExtinct(world: World): void {
  const dead = world.groups.filter((g) => g.pop <= 0);
  if (!dead.length) return;
  world.groups = world.groups.filter((g) => g.pop > 0);
  for (const g of dead) {
    world.events.push({
      kind: 'extinct',
      year: world.year,
      groupId: g.id,
      cultureId: g.cultureId,
      tile: g.tile,
      text: g.placeName ?? undefined,
      n: g.stage === 'village' ? 3 : g.stage === 'tribe' ? 2 : 1,
      extra: g.foodRatio < 0.95 ? 'hunger' : 'attrition',
    });
    for (const id of g.techs) {
      if (!world.groups.some((o) => o.techs.includes(id))) {
        world.events.push({ kind: 'tech_lost', year: world.year, techId: id, tile: g.tile, cultureId: g.cultureId });
      }
    }
  }
  for (const c of world.characters) if (c.alive && !world.groups.some((g) => g.id === c.groupId)) c.alive = false;
  if (world.groups.length === 0 && !world.ended) {
    world.ended = true;
    world.events.push({ kind: 'world_empty', year: world.year });
  }
}
