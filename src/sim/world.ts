import { STARTING_TECHS } from './content/techs';
import { T, TERRAINS } from './content/terrain';
import { TUNING } from './content/stages';
import { capacityAt, aggregate, emptyCtx, rebuildCtx } from './econ';
import { largestLandmassTiles, generateMap } from './mapgen';
import { makeFirstCulture, personName } from './names';
import { hashSeed, rand, randInt, randRange, type RngState } from './rng';
import { pushChronicle } from './systems/chronicle';
import type { Character, Group, World } from './types';

export function newGroup(id: number, cultureId: number, tile: number, pop: number, techs: string[], year: number, parent: number | null): Group {
  return {
    id,
    cultureId,
    tile,
    pop,
    food: 0,
    carry: 0,
    techs: [...techs],
    stage: pop >= 30 ? 'tribe' : 'band',
    sedentary: 0,
    famine: 0,
    parent,
    founded: year,
    leader: null,
    placeName: null,
    foodRatio: 1,
    crowding: 0.5,
    capacity: pop,
  };
}

export function createWorld(seed: number): World {
  const map = generateMap(seed);
  const world: World = {
    seed,
    rng: hashSeed(seed, 12345),
    year: 0,
    nextId: 1,
    map,
    cultures: [],
    groups: [],
    characters: [],
    droughts: [],
    climate: { phase: 0, era: 'normal', mod: 1 },
    firsts: [],
    chronicle: [],
    chronSeq: 0,
    events: [],
    stats: [],
    kindCounts: {},
    lastGreatFamine: -999,
    recentFamines: 0,
    ended: false,
  };
  world.climate.phase = randRange(world as RngState, 0, Math.PI * 2);

  // Where the founders begin: good food, not frozen, on the main continent.
  const main = new Set(largestLandmassTiles(map));
  const ctx = emptyCtx(world);
  const agg = aggregate(STARTING_TECHS);
  const scored: { tile: number; score: number }[] = [];
  for (const t of main) {
    if (!TERRAINS[map.terrain[t]].habitable || map.terrain[t] === T.Desert || map.cold[t] > 0.35) continue;
    const x = t % map.w;
    const y = (t / map.w) | 0;
    const central = 1 - Math.hypot((x - map.w / 2) / map.w, (y - map.h / 2) / map.h);
    scored.push({ tile: t, score: capacityAt(world, ctx, t, agg, 0, null, -1) * (0.7 + central * 0.6) + (map.river[t] ? 2 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const top = scored.slice(0, 10);
  const start = top[randInt(world as RngState, top.length)].tile;

  const culture = makeFirstCulture(world as RngState, 0);
  world.cultures.push(culture);
  const group = newGroup(world.nextId++, culture.id, start, 2, STARTING_TECHS, 0, null);
  world.groups.push(group);
  rebuildCtx(world, ctx);

  const founders: Character[] = [];
  for (let i = 0; i < 2; i++) {
    founders.push({
      id: world.nextId++,
      name: personName(world as RngState, culture),
      role: 'founder',
      born: -20,
      dies: 38 + Math.floor(rand(world as RngState) * 22),
      groupId: group.id,
      cultureId: culture.id,
      alive: true,
    });
  }
  world.characters.push(...founders);
  group.leader = founders[0].id;
  world.firsts.push('tech:fire', 'tech:stone_tools');

  const def = TERRAINS[map.terrain[start]];
  pushChronicle(world, {
    year: 0,
    importance: 3,
    kind: 'founding',
    tile: start,
    groupId: group.id,
    text: `Two people, ${founders[0].name} and ${founders[1].name}, begin the ${culture.name} on the ${map.river[start] ? 'river banks of the ' : ''}${def.phrase}. They carry fire and stone tools, and nothing else.`,
  });
  return world;
}

export { TUNING };
