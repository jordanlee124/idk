// Terrain is data: balance the land here, not in the systems.

export enum T {
  Ocean = 0,
  Grassland = 1,
  Plains = 2,
  Forest = 3,
  Hills = 4,
  Desert = 5,
  Tundra = 6,
  Mountain = 7,
}

export interface TerrainDef {
  id: T;
  name: string;
  /** Phrase used in the chronicle: "went east to the {phrase}". */
  phrase: string;
  color: string;
  /** Base food richness 0..1 before moisture and river bonuses. */
  fertility: number;
  /** How well the land can be farmed once a people know Agriculture (0..1). */
  farmable: number;
  habitable: boolean;
}

export const TERRAINS: TerrainDef[] = [
  { id: T.Ocean, name: 'Ocean', phrase: 'sea shore', color: '#2b5f8a', fertility: 0, farmable: 0, habitable: false },
  { id: T.Grassland, name: 'Grassland', phrase: 'grasslands', color: '#8fb85a', fertility: 0.85, farmable: 1, habitable: true },
  { id: T.Plains, name: 'Plains', phrase: 'open plains', color: '#c9c06a', fertility: 0.7, farmable: 0.9, habitable: true },
  { id: T.Forest, name: 'Forest', phrase: 'forests', color: '#4f7f43', fertility: 0.62, farmable: 0.45, habitable: true },
  { id: T.Hills, name: 'Hills', phrase: 'hill country', color: '#9a8a62', fertility: 0.4, farmable: 0.4, habitable: true },
  { id: T.Desert, name: 'Desert', phrase: 'dry lands', color: '#dcc890', fertility: 0.12, farmable: 0.25, habitable: true },
  { id: T.Tundra, name: 'Tundra', phrase: 'cold steppe', color: '#b9c8c4', fertility: 0.22, farmable: 0.15, habitable: true },
  { id: T.Mountain, name: 'Mountain', phrase: 'mountains', color: '#7c7a78', fertility: 0.04, farmable: 0, habitable: false },
];

export const RIVER_FERTILITY_BONUS = 0.25;
export const RIVER_COLOR = '#4f93c7';
