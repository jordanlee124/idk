import type { ChronicleEntry, Culture, Drought, Group, StatPoint, WorldMap } from '../sim/types';

export interface GroupView extends Group {
  leaderName: string | null;
}

export type ToSim =
  | { t: 'new'; seed: number }
  | { t: 'load'; json: string }
  | { t: 'speed'; yps: number }
  | { t: 'seek' } // run flat out until the next major chronicle entry, then pause
  | { t: 'save' };

export type FromSim =
  | { t: 'map'; seed: number; map: WorldMap }
  | {
      t: 'snap';
      year: number;
      groups: GroupView[];
      /** Sent only when the list changed. */
      cultures: Culture[] | null;
      chron: ChronicleEntry[];
      droughts: Drought[];
      era: 'normal' | 'dry' | 'wet';
      climateMod: number;
      stats: StatPoint[];
      ended: boolean;
      yps: number;
      seeking: boolean;
      /** Years per second actually achieved, for the speed readout. */
      achieved: number;
      techCoverage: Record<string, number>;
    }
  | { t: 'saved'; json: string }
  | { t: 'error'; message: string };
