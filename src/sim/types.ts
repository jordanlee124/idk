// The whole world is plain JSON-serialisable data. Systems read and update it once per tick.

export type Stage = 'band' | 'tribe' | 'village';

export interface WorldMap {
  w: number;
  h: number;
  /** Terrain code per tile (see content/terrain.ts). */
  terrain: number[];
  /** Raw height 0..1, used for shading only. */
  elev: number[];
  /** Food richness 0..1 (includes river bonus). */
  fert: number[];
  /** 1 if a river runs through the tile. */
  river: number[];
  /** 1 if the tile is land touching the sea. */
  coast: number[];
  /** 0..1, how cold the ground is (needs clothing and fire). */
  cold: number[];
}

export interface Culture {
  id: number;
  name: string;
  parent: number | null;
  /** 0..360, kin cultures have nearby hues so related peoples look related on the map. */
  hue: number;
  traits: string[];
  /** Syllable pools for generating names in this culture's voice. */
  onsets: string[];
  vowels: string[];
  codas: string[];
}

export interface Group {
  id: number;
  cultureId: number;
  /** Tile index (y * w + x). */
  tile: number;
  pop: number;
  food: number;
  techs: string[];
  stage: Stage;
  /** Fractional births carried over (small groups give birth steadily rather than by luck alone). */
  carry: number;
  /** Years in the same place. */
  sedentary: number;
  /** Consecutive hungry years. */
  famine: number;
  parent: number | null;
  founded: number;
  leader: number | null;
  placeName: string | null;
  /** Food supply / people last tick. Below 1 means hungry. */
  foodRatio: number;
  /** Crowding: people / land capacity. */
  crowding: number;
  /** Total food capacity of claimed land. */
  capacity: number;
}

export interface Character {
  id: number;
  name: string;
  role: 'founder' | 'chief';
  born: number;
  /** Year they die; fixed at creation from the seeded generator. */
  dies: number;
  groupId: number;
  cultureId: number;
  alive: boolean;
}

export interface Drought {
  tile: number;
  radius: number;
  until: number;
  severity: number;
}

export type EventKind =
  | 'founding'
  | 'milestone'
  | 'split'
  | 'extinct'
  | 'tribe'
  | 'band_again'
  | 'village'
  | 'village_lost'
  | 'discovery'
  | 'learned'
  | 'tech_lost'
  | 'drought'
  | 'famine'
  | 'founder_died'
  | 'chief_changed'
  | 'world_empty'
  | 'era'
  | 'world_milestone';

/** What a system observed this tick. The chronicle system turns these into sentences. */
export interface SimEvent {
  kind: EventKind;
  year: number;
  tile?: number;
  groupId?: number;
  otherGroupId?: number;
  cultureId?: number;
  otherCultureId?: number;
  techId?: string;
  charId?: number;
  otherCharId?: number;
  n?: number;
  text?: string;
  /** Extra word for templates (direction phrase, etc.). */
  extra?: string;
  first?: boolean;
}

export interface ChronicleEntry {
  /** Running number, so the viewer can ask for "everything after #N" even when old detail is trimmed. */
  id: number;
  year: number;
  text: string;
  /** 3 = turning point, 2 = notable, 1 = minor detail. */
  importance: 1 | 2 | 3;
  kind: EventKind;
  tile?: number;
  groupId?: number;
}

export interface StatPoint {
  year: number;
  pop: number;
  groups: number;
  villages: number;
  tribes: number;
}

export interface Climate {
  phase: number;
  /** Long climate age currently in force. */
  era: 'normal' | 'dry' | 'wet';
  /** Multiplier on all food this year. */
  mod: number;
}

export interface World {
  seed: number;
  /** Generator state; the only source of randomness after map generation. */
  rng: number;
  year: number;
  nextId: number;
  map: WorldMap;
  cultures: Culture[];
  groups: Group[];
  characters: Character[];
  droughts: Drought[];
  climate: Climate;
  /** Things that have happened for the first time ("tech:fire", "tribe", "village"), for "first ever" lines. */
  firsts: string[];
  chronicle: ChronicleEntry[];
  chronSeq: number;
  /** Events produced this tick, consumed by the chronicle system. */
  events: SimEvent[];
  stats: StatPoint[];
  /** How many times each kind of event has been written, so routine repeats can be played down. */
  kindCounts: Record<string, number>;
  /** Year of the last "great famine" story. */
  lastGreatFamine: number;
  /** Famines seen since the last great-famine story. */
  recentFamines: number;
  /** Set once everyone is gone. */
  ended: boolean;
}
