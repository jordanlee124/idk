// A view-only layer of individual people. The simulation still works in groups; each group is shown as a small
// sample of people who walk around its land and visibly choose what to do. Their choices are drawn from the group's
// real state (hunger, crowding, techs, whether it just moved or split), so what you see is why the group behaves as it does.
// Nothing here touches the seeded random generator or the world, so it cannot change history.
import { TERRAINS } from '../sim/content/terrain';
import { ringN } from '../sim/econ';
import { makeWord, capitalise } from '../sim/names';
import type { Culture, WorldMap } from '../sim/types';
import type { GroupView } from '../worker/protocol';

export type Activity = 'forage' | 'hunt' | 'fish' | 'farm' | 'rest' | 'search' | 'migrate' | 'split';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  forage: 'Foraging',
  hunt: 'Hunting',
  fish: 'Fishing',
  farm: 'Tending fields',
  rest: 'Resting at camp',
  search: 'Searching for food',
  migrate: 'Moving camp',
  split: 'Leaving to found a new camp',
};

export const ACTIVITY_COLOR: Record<Activity, string> = {
  forage: '#7fd16a',
  hunt: '#ef6a4c',
  fish: '#4cc3ef',
  farm: '#f2c744',
  rest: '#d9d4c7',
  search: '#ff9a3c',
  migrate: '#c58cf0',
  split: '#ff6fb1',
};

export interface Person {
  id: number;
  gid: number;
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  activity: Activity;
  /** Plain-language reason, written when the choice was made. */
  why: string;
  wait: number;
  /** Which tile of the group's land the person is heading to, as a description. */
  where: string;
  founder: boolean;
  arrived: boolean;
}

interface Prev {
  tile: number;
  foodRatio: number;
  crowding: number;
  capacity: number;
  pop: number;
}

/** Small deterministic generator for cosmetic choices (separate from the simulation's). */
function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many sample people a group shows: all of them while the group is tiny, a sample once it grows. */
export function sampleSize(pop: number): number {
  if (pop <= 6) return Math.max(1, pop);
  return Math.min(10, 4 + Math.round(Math.sqrt(pop) * 0.45));
}

export function pickActivity(g: GroupView, roll: number, hasWater: boolean): Activity {
  const knows = (t: string) => g.techs.includes(t);
  const w: [Activity, number][] = [];
  if (g.foodRatio < 0.9) {
    w.push(['search', 0.45], ['forage', 0.25], ['rest', 0.05]);
    if (knows('hunting')) w.push(['hunt', 0.25]);
    if (knows('fishing') && hasWater) w.push(['fish', 0.2]);
  } else if (g.stage === 'village') {
    w.push(['farm', 0.55], ['forage', 0.12], ['rest', 0.2]);
    if (knows('fishing') && hasWater) w.push(['fish', 0.13]);
  } else if (knows('agriculture')) {
    w.push(['farm', 0.3], ['forage', 0.3], ['rest', 0.2]);
    if (knows('hunting')) w.push(['hunt', 0.15]);
  } else {
    w.push(['forage', 0.45], ['rest', 0.2]);
    if (knows('hunting')) w.push(['hunt', 0.25]);
    if (knows('fishing') && hasWater) w.push(['fish', 0.15]);
  }
  const total = w.reduce((a, [, p]) => a + p, 0);
  let r = roll * total;
  for (const [a, p] of w) {
    r -= p;
    if (r <= 0) return a;
  }
  return w[0][0];
}

const f2 = (n: number) => n.toFixed(2);

export function explain(a: Activity, g: GroupView, extra?: string): string {
  const fed = g.foodRatio > 3 ? 'far more food than it needs' : `${f2(g.foodRatio)}× the food it needs`;
  switch (a) {
    case 'forage':
      return g.foodRatio >= 1.1 ? `Gathering roots, seeds and small game near camp. The group is well fed (${fed}), so there is no need to range far.` : `Gathering wild food near camp. The group is getting by (${fed}).`;
    case 'search':
      return `Ranging farther than usual. The group is going hungry (${fed}), so people are checking the edges of the land for anything edible.`;
    case 'hunt':
      return `Hunting with spears and cooperative drives (the group knows Organised Hunting). Meat is shared, and it takes pressure off the plants.`;
    case 'fish':
      return `Fishing the water beside camp (the group knows Fishing). It is a steady food source that does not depend on the plant harvest.`;
    case 'farm':
      return g.stage === 'village' ? `Working the fields. This village has stayed put with Agriculture, and its stores (${Math.round(g.food)} food) are what carry it through a bad year.` : `Planting and tending a plot. The group knows Agriculture and has stayed in one place ${g.sedentary} of the ${20} years it needs to become a village.`;
    case 'rest':
      return g.foodRatio >= 1 ? `Resting at camp. There is enough food (${fed}) and nothing pressing.` : `Resting between efforts. Food is short (${fed}) but there is little more to find nearby.`;
    case 'migrate':
      return extra ?? 'Following the group to better land.';
    case 'split':
      return extra ?? 'Leaving with a new band to found a camp of its own.';
  }
}

export class PeopleLayer {
  private people = new Map<number, Person[]>();
  private prev = new Map<number, Prev>();
  private nextId = 1;
  private groupsById = new Map<number, GroupView>();

  clear(): void {
    this.people.clear();
    this.prev.clear();
    this.groupsById.clear();
    this.nextId = 1;
  }

  all(): Person[] {
    const out: Person[] = [];
    for (const list of this.people.values()) out.push(...list);
    return out;
  }

  of(gid: number): Person[] {
    return this.people.get(gid) ?? [];
  }

  find(id: number): Person | null {
    for (const list of this.people.values()) for (const p of list) if (p.id === id) return p;
    return null;
  }

  private centre(map: WorldMap, tile: number, S: number, pad: number): { x: number; y: number } {
    const x = tile % map.w;
    const y = (tile / map.w) | 0;
    return { x: pad + S * Math.sqrt(3) * (x + 0.5 * (y & 1)), y: pad + S * 1.5 * y };
  }

  private spawn(g: GroupView, cultures: Culture[], S: number, at: { x: number; y: number }, founder: boolean, idx: number): Person {
    const id = this.nextId++;
    const rnd = mulberry(id * 7919 + g.id);
    const culture = cultures[g.cultureId];
    const name = founder && idx === 0 && g.leaderName ? g.leaderName : culture ? capitalise(makeWord({ rng: id * 31 + g.id }, culture, 2)) : `Person ${id}`;
    return { id, gid: g.id, name, x: at.x + (rnd() - 0.5) * S * 0.5, y: at.y + (rnd() - 0.5) * S * 0.5, tx: at.x, ty: at.y, activity: 'rest', why: '', wait: rnd() * 1.5, where: '', founder, arrived: true };
  }

  /** Reconcile the sample people with the latest groups. Called whenever a snapshot arrives. */
  sync(groups: GroupView[], map: WorldMap, cultures: Culture[], S: number, pad: number): void {
    this.groupsById = new Map(groups.map((g) => [g.id, g]));
    const live = new Set(groups.map((g) => g.id));
    for (const gid of [...this.people.keys()]) if (!live.has(gid)) this.people.delete(gid);
    for (const gid of [...this.prev.keys()]) if (!live.has(gid)) this.prev.delete(gid);

    for (const g of groups) {
      const centre = this.centre(map, g.tile, S, pad);
      const want = sampleSize(g.pop);
      let list = this.people.get(g.id);
      const prev = this.prev.get(g.id);
      if (!list) {
        list = [];
        this.people.set(g.id, list);
        const parent = g.parent != null ? this.groupsById.get(g.parent) : undefined;
        const parentList = parent ? this.people.get(parent.id) : undefined;
        if (parent && parentList && parentList.length) {
          // A new camp: its people set out from the parent's camp.
          const from = this.centre(map, parent.tile, S, pad);
          const pc = cultures[parent.cultureId]?.name ?? 'their kin';
          for (let i = 0; i < want; i++) {
            const p = this.spawn(g, cultures, S, from, false, i);
            p.activity = 'split';
            p.arrived = false;
            p.tx = centre.x + (((i * 37) % 11) - 5) * S * 0.07;
            p.ty = centre.y + (((i * 53) % 11) - 5) * S * 0.07;
            p.where = 'the new camp';
            p.why = `Leaving the ${pc} with a new band. The old camp had ${Math.round(parent.pop + g.pop)} people on land that feeds about ${Math.round(parent.capacity)}, so a part of the group went to find room of its own.`;
            p.wait = 0;
            list.push(p);
          }
        } else {
          for (let i = 0; i < want; i++) list.push(this.spawn(g, cultures, S, centre, g.id === 1 && g.founded === 0 && i < 2, i));
        }
      }
      while (list.length < want) list.push(this.spawn(g, cultures, S, centre, false, list.length));
      if (list.length > want) list.length = want;

      if (prev && prev.tile !== g.tile) {
        const why = `Following the group to new ground. The old camp fed about ${Math.round(prev.capacity)} people and ${Math.round(prev.pop)} lived on it (food ${f2(prev.foodRatio)}×), and this spot looked richer.`;
        for (const p of list) {
          p.activity = 'migrate';
          p.arrived = false;
          p.tx = centre.x + (((p.id * 37) % 11) - 5) * S * 0.06;
          p.ty = centre.y + (((p.id * 53) % 11) - 5) * S * 0.06;
          p.where = 'the new camp';
          p.why = why;
          p.wait = 0;
        }
      }
      this.prev.set(g.id, { tile: g.tile, foodRatio: g.foodRatio, crowding: g.crowding, capacity: g.capacity, pop: g.pop });
    }
  }

  private decide(p: Person, g: GroupView, map: WorldMap, S: number, pad: number): void {
    const rnd = mulberry((p.id * 2654435761 + (Math.floor(performance.now() / 250) | 0)) >>> 0);
    const tiles = ringN(map, 2)[g.tile];
    const land = (i: number) => TERRAINS[map.terrain[i]].habitable;
    const waterTiles = tiles.filter((t) => land(t) && (map.coast[t] || map.river[t]));
    const act = pickActivity(g, rnd(), waterTiles.length > 0);
    let pool: number[];
    switch (act) {
      case 'rest':
        pool = [g.tile];
        break;
      case 'farm':
        pool = tiles.slice(0, 7).filter((t) => land(t) && map.fert[t] >= 0.3);
        break;
      case 'fish':
        pool = waterTiles;
        break;
      case 'search':
      case 'hunt':
        pool = tiles.slice(7).filter(land);
        break;
      default:
        pool = tiles.slice(0, 7).filter(land);
    }
    if (!pool.length) pool = [g.tile];
    const t = pool[Math.floor(rnd() * pool.length)];
    const c = this.centre(map, t, S, pad);
    p.activity = act;
    p.tx = c.x + (rnd() - 0.5) * S * 1.1;
    p.ty = c.y + (rnd() - 0.5) * S * 1.0;
    const def = TERRAINS[map.terrain[t]];
    p.where = t === g.tile ? 'camp' : map.river[t] ? 'the river bank' : `the ${def.phrase}`;
    p.why = explain(act, g);
    p.arrived = false;
  }

  /** Advance the people by `dt` seconds of real time. */
  update(dt: number, map: WorldMap, S: number, pad: number): void {
    const speed = S * 1.3; // map px per second
    for (const [gid, list] of this.people) {
      const g = this.groupsById.get(gid);
      if (!g) continue;
      for (const p of list) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const travelling = p.activity === 'migrate' || p.activity === 'split';
        if (d > 1.5) {
          const k = Math.min(1, (speed * (travelling ? 1.5 : 1) * dt) / d);
          p.x += dx * k;
          p.y += dy * k;
          p.arrived = false;
          continue;
        }
        if (!p.arrived) {
          p.arrived = true;
          if (travelling) {
            p.activity = 'rest';
            p.why = 'Settling in at the new camp after the walk.';
            p.where = 'camp';
          }
          p.wait = (p.activity === 'rest' ? 2.2 : 1.4) + ((p.id * 13) % 17) / 7;
          continue;
        }
        p.wait -= dt;
        if (p.wait <= 0) this.decide(p, g, map, S, pad);
      }
    }
  }

  hit(mx: number, my: number, reach: number): Person | null {
    let best: Person | null = null;
    let bestD = reach;
    for (const list of this.people.values()) {
      for (const p of list) {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }
}
