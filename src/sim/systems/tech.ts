// System 5: discovery, diffusion through contact, loss on collapse (handled when a group dies out).
import { TECHS, TECH_BY_ID, type TechDef } from '../content/techs';
import { TUNING } from '../content/stages';
import { ring1, ringN, type Ctx } from '../econ';
import { distance } from '../hex';
import { chance, pick, type RngState } from '../rng';
import type { Group, World } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function eligible(world: World, g: Group, tech: TechDef): boolean {
  if (g.techs.includes(tech.id)) return false;
  if (!tech.requires.every((r) => g.techs.includes(r))) return false;
  const tiles = ring1(world.map)[g.tile];
  if (tech.needsWater && !tiles.some((t) => world.map.coast[t] || world.map.river[t])) return false;
  if (tech.needsFertile && !tiles.some((t) => world.map.fert[t] >= tech.needsFertile!)) return false;
  return true;
}

export function techSystem(world: World, ctx: Ctx): void {
  const rng = world as RngState;

  // Discovery.
  for (const g of world.groups) {
    const popFactor = clamp(Math.sqrt(g.pop / 25), 0.4, 3);
    const curious = world.cultures[g.cultureId].traits.includes('curious') ? 1.5 : 1;
    const pressure = clamp((g.crowding - 0.6) / 0.4, 0, 1);
    for (const tech of TECHS) {
      if (!eligible(world, g, tech)) continue;
      const p = ((TUNING.discoveryScale / tech.difficulty) * popFactor * curious) * (tech.pressure ? 1 + 2.5 * pressure : 1);
      if (!chance(rng, p)) continue;
      g.techs.push(tech.id);
      if (tech.id === 'agriculture') g.sedentary = 0;
      const key = `tech:${tech.id}`;
      const first = !world.firsts.includes(key);
      if (first) world.firsts.push(key);
      world.events.push({ kind: 'discovery', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, techId: tech.id, first });
    }
  }

  // Diffusion: neighbours within a few tiles trade ideas, with a delay.
  const rings = ringN(world.map, 3);
  for (const g of world.groups) {
    for (const t of rings[g.tile]) {
      const idx = ctx.occ[t];
      if (idx < 0) continue;
      const other = world.groups[idx];
      if (!other || other.id === g.id) continue;
      const d = Math.max(1, distance(g.tile, other.tile, world.map.w));
      if (!chance(rng, TUNING.contactChance / d)) continue;
      const teachable = other.techs.map((id) => TECH_BY_ID[id]).filter((tech) => tech && eligible(world, g, tech));
      if (!teachable.length || !chance(rng, TUNING.contactLearnChance)) continue;
      const tech = pick(rng, teachable);
      g.techs.push(tech.id);
      if (tech.id === 'agriculture') g.sedentary = 0;
      world.events.push({ kind: 'learned', year: world.year, groupId: g.id, otherGroupId: other.id, cultureId: g.cultureId, otherCultureId: other.cultureId, tile: g.tile, techId: tech.id });
    }
  }
}
