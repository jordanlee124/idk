// System 1: seasons of plenty and drought.
import { TUNING } from '../content/stages';
import { TERRAINS } from '../content/terrain';
import type { Ctx } from '../econ';
import { fbm, smooth } from '../mapgen';
import { ringN } from '../econ';
import { chance, gauss, randInt, randRange, type RngState } from '../rng';
import type { World } from '../types';

export function climateSystem(world: World, ctx: Ctx): void {
  const rng = world as RngState;
  const { map } = world;
  // Slow swings (a long warm age, a cold dry one) plus yearly noise: the engine of boom and bust.
  const t = world.year * Math.PI * 2;
  const slow = 0.15 * Math.sin(t / 540 + world.climate.phase) + 0.05 * Math.sin(t / 170 + world.climate.phase * 2.3);
  world.climate.mod = 1 + slow + gauss(rng) * 0.03;
  const era = world.climate.era;
  if (era === 'normal' && slow < -0.11) {
    world.climate.era = 'dry';
    world.events.push({ kind: 'era', year: world.year, text: 'A long cold, dry age begins. Harvests will fail more often and crowded lands will feel it first.' });
  } else if (era === 'normal' && slow > 0.11) {
    world.climate.era = 'wet';
    world.events.push({ kind: 'era', year: world.year, text: 'A long warm, wet age begins. The land is generous and the peoples will grow.' });
  } else if (era === 'dry' && slow > -0.05) {
    world.climate.era = 'normal';
    world.events.push({ kind: 'era', year: world.year, text: 'The dry age loosens its grip.' });
  } else if (era === 'wet' && slow < 0.05) {
    world.climate.era = 'normal';
    world.events.push({ kind: 'era', year: world.year, text: 'The warm, wet age fades.' });
  }

  // Regional weather: wet and dry patches that drift over a century or so, so some lands boom while others starve.
  const stamp = Math.floor(world.year / 5);
  if (ctx.weatherStamp !== stamp) {
    ctx.weatherStamp = stamp;
    const period = 140;
    const slice = Math.floor(world.year / period);
    const f = smooth((world.year % period) / period);
    for (let i = 0; i < map.w * map.h; i++) {
      const x = (i % map.w) + 0.5 * (((i / map.w) | 0) & 1);
      const y = (i / map.w) | 0;
      const a = fbm(world.seed + slice * 7919, x * 0.07, y * 0.09, 2);
      const b = fbm(world.seed + (slice + 1) * 7919, x * 0.07, y * 0.09, 2);
      ctx.weather[i] = 1 + (a + (b - a) * f - 0.5) * 1.1;
    }
  }

  world.droughts = world.droughts.filter((d) => d.until > world.year);
  if (chance(rng, TUNING.droughtChance)) {
    for (let tries = 0; tries < 20; tries++) {
      const tile = randInt(rng, map.w * map.h);
      if (!TERRAINS[map.terrain[tile]].habitable) continue;
      const radius = 2 + randInt(rng, 3);
      const d = { tile, radius, until: world.year + 4 + randInt(rng, 9), severity: randRange(rng, 0.35, 0.65) };
      world.droughts.push(d);
      const x = tile % map.w;
      const y = (tile / map.w) | 0;
      const region = `${y < map.h / 3 ? 'in the north' : y > (map.h * 2) / 3 ? 'in the south' : 'across the middle lands'}${x < map.w / 3 ? ', toward the west' : x > (map.w * 2) / 3 ? ', toward the east' : ''}`;
      const hit = world.groups.some((g) => ringN(map, radius)[tile].includes(g.tile));
      world.events.push({ kind: 'drought', year: world.year, tile, n: hit ? 1 : 0, text: region });
      break;
    }
  }
  ctx.droughtSev.fill(0);
  for (const d of world.droughts) {
    for (const t of ringN(map, d.radius)[d.tile]) ctx.droughtSev[t] = Math.max(ctx.droughtSev[t], d.severity);
  }
}
