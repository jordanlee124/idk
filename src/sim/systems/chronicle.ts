// System 9: turn this tick's events into sentences for the world's history book.
import { TECH_BY_ID, TECHS } from '../content/techs';
import { TERRAINS } from '../content/terrain';
import type { ChronicleEntry, SimEvent, World } from '../types';

const MAX_ENTRIES = 8000;
/** The first N times a routine thing happens it is "notable"; after that it is background detail. */
const NOTABLE_LIMIT: Record<string, number> = { split: 18, tribe: 10, village: 10, village_lost: 8, famine: 8, extinct: 12, band_again: 6, learned: 14 };

export function pushChronicle(world: World, e: Omit<ChronicleEntry, 'id'>): void {
  world.chronicle.push({ ...e, id: ++world.chronSeq });
  if (world.chronicle.length > MAX_ENTRIES) {
    // Drop background detail first, oldest first, then (only if needed) the oldest of anything.
    let drop = world.chronicle.length - MAX_ENTRIES + 1000;
    const kept: ChronicleEntry[] = [];
    for (const c of world.chronicle) {
      if (drop > 0 && c.importance === 1) drop--;
      else kept.push(c);
    }
    world.chronicle = kept.length > MAX_ENTRIES ? kept.slice(kept.length - MAX_ENTRIES) : kept;
  }
}

function cultureName(world: World, id: number | undefined): string {
  return id === undefined ? 'a people' : world.cultures[id]?.name ?? 'a people';
}

function techName(id: string | undefined): string {
  return (id && TECH_BY_ID[id]?.name) || 'a craft';
}

function format(world: World, e: SimEvent): Omit<ChronicleEntry, 'id'> | null {
  const year = e.year;
  const base = { year, kind: e.kind, tile: e.tile, groupId: e.groupId };
  const count = (world.kindCounts[e.kind] = (world.kindCounts[e.kind] ?? 0) + 1);
  const routine = (normal: 1 | 2 | 3 = 2): 1 | 2 | 3 => (count <= (NOTABLE_LIMIT[e.kind] ?? 0) ? normal : 1);
  const c = `the ${cultureName(world, e.cultureId)}`;
  const oc = `the ${cultureName(world, e.otherCultureId)}`;
  const Cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (e.kind) {
    case 'milestone':
      return { ...base, importance: 2, text: `${Cap(c)} now number ${e.n}.` };
    case 'split': {
      const where = e.text ?? 'new land';
      return e.cultureId === e.otherCultureId
        ? { ...base, importance: 1, text: `A band of ${oc} left their kin and went ${where}.` }
        : { ...base, importance: routine(), text: `${Cap(c)} split from ${oc} and went ${where}.` };
    }
    case 'extinct': {
      const cause = e.extra === 'hunger' ? 'starved and were no more' : 'dwindled away and were forgotten';
      return { ...base, importance: e.n === 1 ? 1 : routine(e.n === 3 ? 3 : 2), text: `${Cap(c)}${e.text ? ` of ${e.text}` : ''} ${cause}.` };
    }
    case 'tribe':
      return e.first
        ? { ...base, importance: 3, text: `${Cap(c)} grow into the first tribe in the world, ${e.n} strong${e.extra ? `, led by ${e.extra}` : ''}.` }
        : { ...base, importance: routine(), text: `${Cap(c)} grow into a tribe of ${e.n}${e.extra ? ` under ${e.extra}` : ''}.` };
    case 'band_again':
      return { ...base, importance: routine(), text: `${Cap(c)} have dwindled to a mere band of ${e.n}.` };
    case 'village':
      return e.first
        ? { ...base, importance: 3, text: `${Cap(c)} stop wandering and found ${e.text}, the first village in the world: ${e.n} people living by their fields.` }
        : { ...base, importance: routine(), text: `${Cap(c)} settle at ${e.text} and become a village of ${e.n}.` };
    case 'village_lost':
      return { ...base, importance: routine(), text: `Hunger drives ${c} from their fields at ${e.text}; they take to the road again.` };
    case 'discovery': {
      const t = techName(e.techId);
      return e.first
        ? { ...base, importance: e.techId === 'agriculture' ? 3 : 2, text: `${Cap(c)} discover ${t}, the first people anywhere to do so.` }
        : { ...base, importance: 1, text: `${Cap(c)} discover ${t} for themselves.` };
    }
    case 'learned':
      return { ...base, importance: e.techId === 'agriculture' ? routine() : 1, text: `${Cap(c)} learn ${techName(e.techId)} from ${oc}.` };
    case 'tech_lost':
      return { ...base, importance: 3, text: `${techName(e.techId)} is forgotten: nobody alive still knows it.` };
    case 'drought': {
      const phrase = TERRAINS[world.map.terrain[e.tile ?? 0]]?.phrase ?? 'land';
      return { ...base, importance: e.n ? 2 : 1, text: `A long drought grips the ${phrase} ${e.text ?? ''}`.trim() + (e.n ? ', and the people there go hungry.' : '.') };
    }
    case 'famine':
      world.recentFamines++;
      return { ...base, importance: routine(), text: `Famine strikes ${c}${e.text ? ` of ${e.text}` : ''}; ${e.n} people remain.` };
    case 'founder_died':
      return e.first
        ? { ...base, importance: 2, text: `${e.extra}, one of the two founders, dies. ${Cap(c)} number ${e.n}.` }
        : { ...base, importance: 3, text: `${e.extra}, the last of the two founders, dies. ${Cap(c)} number ${e.n} and will tell stories of them.` };
    case 'era':
      return { ...base, importance: 3, text: e.text ?? 'The climate changes.' };
    case 'world_milestone':
      return { ...base, importance: 3, text: e.text ?? '' };
    case 'world_empty':
      return { ...base, importance: 3, text: 'The last people are gone. The land is quiet, and history ends here.' };
    default:
      return null;
  }
}

const POP_MARKS = [100, 500, 1000, 2500, 5000, 10000, 20000, 40000, 80000];

export function chronicleSystem(world: World): void {
  for (const e of world.events) {
    const entry = format(world, e);
    if (entry) pushChronicle(world, entry);
  }
  world.events.length = 0;

  // Great famine: many peoples going hungry in the same stretch of years deserves one headline.
  if (world.year - world.lastGreatFamine >= 40 && world.recentFamines >= 10) {
    world.lastGreatFamine = world.year;
    pushChronicle(world, { year: world.year, kind: 'famine', importance: 3, text: `A great famine: ${world.recentFamines} peoples have gone hungry in recent years.` });
  }
  if (world.year % 10 === 0) world.recentFamines = Math.floor(world.recentFamines * 0.5);

  if (world.year % 10 === 0) {
    let pop = 0;
    let villages = 0;
    let tribes = 0;
    for (const g of world.groups) {
      pop += g.pop;
      if (g.stage === 'village') villages++;
      else if (g.stage === 'tribe') tribes++;
    }
    world.stats.push({ year: world.year, pop, groups: world.groups.length, villages, tribes });

    for (const m of POP_MARKS) {
      const key = `pop:${m}`;
      if (pop >= m && !world.firsts.includes(key)) {
        world.firsts.push(key);
        pushChronicle(world, { year: world.year, kind: 'world_milestone', importance: 3, text: `The world now holds ${m.toLocaleString('en-US')} people.` });
      }
    }
    if (world.groups.length >= 8) {
      for (const t of TECHS) {
        const key = `half:${t.id}`;
        if (world.firsts.includes(key)) continue;
        const knowers = world.groups.filter((g) => g.techs.includes(t.id)).length;
        if (knowers * 2 >= world.groups.length && t.requires.length > 0) {
          world.firsts.push(key);
          pushChronicle(world, { year: world.year, kind: 'world_milestone', importance: 3, text: `${t.name} is now known to half of the world's peoples.` });
        }
      }
    }
  }
}
