// System 6: promote or demote each group against the stage thresholds.
import { STAGES } from '../content/stages';
import { ring1 } from '../econ';
import { placeName } from '../names';
import type { RngState } from '../rng';
import type { World } from '../types';
import { makeChief } from './population';

export function stageSystem(world: World): void {
  const rng = world as RngState;
  for (const g of world.groups) {
    g.sedentary++;
    const culture = world.cultures[g.cultureId];

    if (g.stage === 'band' && g.pop >= STAGES.tribeAt) {
      g.stage = 'tribe';
      const first = !world.firsts.includes('tribe');
      if (first) world.firsts.push('tribe');
      const chief = makeChief(world, g);
      world.events.push({ kind: 'tribe', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, n: g.pop, extra: `Chief ${chief.name}`, first });
    } else if (g.stage === 'tribe' && g.pop < STAGES.bandBelow) {
      g.stage = 'band';
      g.leader = null;
      world.events.push({ kind: 'band_again', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, n: g.pop });
    }

    if (g.stage === 'tribe' && g.techs.includes('agriculture') && g.sedentary >= STAGES.villageSedentaryYears && g.pop >= STAGES.villageMinPop) {
      if (ring1(world.map)[g.tile].some((t) => world.map.fert[t] >= 0.3)) {
        g.stage = 'village';
        g.placeName = placeName(rng, culture);
        const first = !world.firsts.includes('village');
        if (first) world.firsts.push('village');
        world.events.push({ kind: 'village', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, n: g.pop, text: g.placeName, first });
      }
    } else if (g.stage === 'village' && g.famine >= STAGES.villageFamineYears) {
      world.events.push({ kind: 'village_lost', year: world.year, groupId: g.id, cultureId: g.cultureId, tile: g.tile, text: g.placeName ?? 'their village' });
      g.stage = g.pop >= STAGES.tribeAt ? 'tribe' : 'band';
      g.sedentary = 0;
      g.placeName = null;
      g.famine = 0;
    }
  }
}
