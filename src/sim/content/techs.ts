// The Stone Age tech graph. Pure data: prerequisites, how hard it is to discover, and what it does.

export interface TechEffects {
  /** Added to the foraging multiplier (0.2 = +20% wild food). */
  forage?: number;
  /** Flat food per claimed water-side tile (fishing). */
  fish?: number;
  /** Farming strength; the sim multiplies by each tile's farmability. */
  farm?: number;
  /** Fraction of a year's food a settlement can keep in store. */
  store?: number;
  /** Reduces the penalty for living on cold ground (0..1). */
  cold?: number;
  /** Reduces the death rate (0.1 = 10% fewer deaths). */
  health?: number;
  /** Reduces drought damage (0..1). */
  droughtResist?: number;
  /** Pushes birth rate up a little. */
  fertility?: number;
}

export interface TechDef {
  id: string;
  name: string;
  /** What a typical group takes to find this, in years of searching (bigger = rarer). */
  difficulty: number;
  requires: string[];
  /** Needs a claimed tile touching water. */
  needsWater?: boolean;
  /** Needs a claimed tile with at least this fertility. */
  needsFertile?: number;
  /** Discovery is likelier when the group is hungry or crowded. */
  pressure?: boolean;
  effects: TechEffects;
  blurb: string;
}

export const TECHS: TechDef[] = [
  { id: 'fire', name: 'Fire', difficulty: 400, requires: [], effects: { health: 0.08, cold: 0.25 }, blurb: 'Warmth, light and safety at night.' },
  { id: 'stone_tools', name: 'Stone Tools', difficulty: 400, requires: [], effects: { forage: 0.1 }, blurb: 'Knapped edges for cutting and digging.' },
  { id: 'hunting', name: 'Organised Hunting', difficulty: 900, requires: ['stone_tools'], pressure: true, effects: { forage: 0.25 }, blurb: 'Spears and cooperative drives.' },
  { id: 'shelter', name: 'Shelter', difficulty: 900, requires: ['fire'], effects: { health: 0.08, cold: 0.15 }, blurb: 'Huts of hide, branch and clay.' },
  { id: 'cooking', name: 'Cooking', difficulty: 800, requires: ['fire'], effects: { forage: 0.1, health: 0.08 }, blurb: 'Safer, richer meals.' },
  { id: 'clothing', name: 'Clothing', difficulty: 1000, requires: ['stone_tools'], effects: { cold: 0.55 }, blurb: 'Sewn hides against the cold.' },
  { id: 'fishing', name: 'Fishing', difficulty: 1000, requires: ['stone_tools'], needsWater: true, pressure: true, effects: { fish: 9 }, blurb: 'Hooks, nets and weirs.' },
  { id: 'gathering', name: 'Plant Lore', difficulty: 1500, requires: ['stone_tools', 'cooking'], pressure: true, effects: { forage: 0.2 }, blurb: 'Knowing which plants feed and when they seed.' },
  { id: 'calendar', name: 'Seasonal Calendar', difficulty: 2000, requires: ['gathering'], effects: { droughtResist: 0.4 }, blurb: 'Tracking the sun and the rains.' },
  { id: 'agriculture', name: 'Agriculture', difficulty: 4000, requires: ['gathering', 'calendar'], needsFertile: 0.3, pressure: true, effects: { farm: 0.9 }, blurb: 'Sowing, tending, harvesting: the root of settled life.' },
  { id: 'pottery', name: 'Pottery', difficulty: 4000, requires: ['fire', 'agriculture'], effects: { store: 0.6 }, blurb: 'Fired jars to keep the harvest.' },
  { id: 'herding', name: 'Herding', difficulty: 5000, requires: ['hunting', 'agriculture'], pressure: true, effects: { farm: 0.2, forage: 0.15, fertility: 0.1 }, blurb: 'Living beside tamed animals.' },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
export const STARTING_TECHS = ['fire', 'stone_tools'];
