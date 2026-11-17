// System 2: production from the land, consumption, stores, famine.
import { TUNING } from '../content/stages';
import { aggregate, capacityAt, farmEfficiency, type Ctx } from '../econ';
import type { World } from '../types';

export function foodSystem(world: World, ctx: Ctx): void {
  world.groups.forEach((g, i) => {
    const agg = aggregate(g.techs);
    const supply = capacityAt(world, ctx, g.tile, agg, farmEfficiency(g), g, i);
    g.capacity = supply;
    g.crowding = supply > 0 ? g.pop / supply : 9;

    // Stores: only settlers keep them, and they spoil a little.
    const storeCap = g.stage === 'village' ? g.pop * (agg.store + TUNING.baseStore) : g.pop * agg.store * 0.5;
    g.food *= 1 - TUNING.storeDecay;
    let eaten = supply;
    if (supply >= g.pop) {
      g.food = Math.min(storeCap, g.food + (supply - g.pop));
      g.foodRatio = supply / Math.max(1, g.pop);
    } else {
      const deficit = g.pop - supply;
      const use = Math.min(g.food, deficit);
      g.food -= use;
      eaten = supply + use;
      g.foodRatio = eaten / Math.max(1, g.pop);
    }
    // Hungry years are counted in the population system, which also knows the deaths.
    void eaten;
  });
}
