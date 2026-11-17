import { type RngState, chance, pick, randInt, randRange } from './rng';
import { CODAS, ONSETS, TRAITS, VOWELS } from './content/names';
import type { Culture } from './types';

function sample<T>(s: RngState, pool: readonly T[], n: number): T[] {
  const out: T[] = [];
  const copy = [...pool];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(randInt(s, copy.length), 1)[0]);
  return out;
}

export function makeFirstCulture(s: RngState, id: number): Culture {
  const c: Culture = {
    id,
    name: '',
    parent: null,
    hue: randRange(s, 0, 360),
    traits: sample(s, TRAITS, 2) as string[],
    onsets: sample(s, ONSETS, 6),
    vowels: sample(s, VOWELS, 4),
    codas: sample(s, CODAS, 5),
  };
  c.name = capitalise(makeWord(s, c, 2 + randInt(s, 2)));
  return c;
}

/** A culture that has drifted from its parent: a few sounds and traits change, the hue moves a little. */
export function driftCulture(s: RngState, parent: Culture, id: number, existingNames: Set<string>): Culture {
  const swap = (pool: string[], all: readonly string[]) => {
    const next = [...pool];
    const i = randInt(s, next.length);
    const repl = pick(s, all);
    if (!next.includes(repl)) next[i] = repl;
    return next;
  };
  const c: Culture = {
    id,
    name: '',
    parent: parent.id,
    hue: (parent.hue + (chance(s, 0.5) ? 1 : -1) * randRange(s, 18, 55) + 360) % 360,
    traits: [...parent.traits],
    onsets: swap(swap(parent.onsets, ONSETS), ONSETS),
    vowels: swap(parent.vowels, VOWELS),
    codas: swap(parent.codas, CODAS),
  };
  if (chance(s, 0.3)) {
    const t = pick(s, TRAITS) as string;
    if (!c.traits.includes(t)) c.traits[randInt(s, c.traits.length)] = t;
  }
  for (let tries = 0; tries < 8; tries++) {
    c.name = capitalise(makeWord(s, c, 2 + randInt(s, 2)));
    if (!existingNames.has(c.name)) break;
  }
  return c;
}

export function makeWord(s: RngState, c: Pick<Culture, 'onsets' | 'vowels' | 'codas'>, syllables: number): string {
  let w = '';
  for (let i = 0; i < syllables; i++) {
    w += pick(s, c.onsets) + pick(s, c.vowels);
    if (i === syllables - 1 || chance(s, 0.25)) w += pick(s, c.codas);
  }
  return w;
}

export function capitalise(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function personName(s: RngState, c: Culture): string {
  return capitalise(makeWord(s, c, 2));
}

export function placeName(s: RngState, c: Culture): string {
  return capitalise(makeWord(s, c, 2 + randInt(s, 2)));
}
