import { useEffect, useReducer, useRef } from 'react';
import type { ChronicleEntry, Culture, Drought, StatPoint, WorldMap } from '../sim/types';
import type { FromSim, GroupView, ToSim } from '../worker/protocol';
import { startInline, startSim, type SimHost } from '../worker/host';

export interface SimState {
  seed: number;
  map: WorldMap | null;
  year: number;
  groups: GroupView[];
  cultures: Culture[];
  chronicle: ChronicleEntry[];
  droughts: Drought[];
  era: 'normal' | 'dry' | 'wet';
  climateMod: number;
  stats: StatPoint[];
  ended: boolean;
  yps: number;
  seeking: boolean;
  achieved: number;
  techCoverage: Record<string, number>;
  mode: 'worker' | 'inline' | 'starting';
  error: string | null;
}

export const initialState = (): SimState => ({
  seed: 0,
  map: null,
  year: 0,
  groups: [],
  cultures: [],
  chronicle: [],
  droughts: [],
  era: 'normal',
  climateMod: 1,
  stats: [],
  ended: false,
  yps: 0,
  seeking: false,
  achieved: 0,
  techCoverage: {},
  mode: 'starting',
  error: null,
});

export interface SimApi {
  state: React.MutableRefObject<SimState>;
  send: (m: ToSim) => void;
  /** Called with every message before React sees it (the map renderer listens here). */
  listen: (fn: (m: FromSim) => void) => () => void;
  saved: React.MutableRefObject<((json: string) => void) | null>;
}

/** Runs the sim host and keeps the latest state in a ref; React re-renders about ten times a second. */
export function useSim(initial: () => ToSim): SimApi {
  const state = useRef<SimState>(initialState());
  const host = useRef<SimHost | null>(null);
  const listeners = useRef(new Set<(m: FromSim) => void>());
  const saved = useRef<((json: string) => void) | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const lastMsg = useRef<ToSim | null>(null);
  const gotAny = useRef(false);
  const lastSpeed = useRef<ToSim | null>(null);

  useEffect(() => {
    const onMsg = (m: FromSim) => {
      gotAny.current = true;
      const s = state.current;
      switch (m.t) {
        case 'map':
          Object.assign(s, { ...initialState(), seed: m.seed, map: m.map, mode: s.mode === 'starting' ? host.current?.mode ?? 'worker' : s.mode });
          break;
        case 'snap':
          s.year = m.year;
          s.groups = m.groups;
          if (m.cultures) s.cultures = m.cultures;
          if (m.chron.length) {
            s.chronicle = s.chronicle.concat(m.chron);
            if (s.chronicle.length > 20000) s.chronicle = s.chronicle.slice(-15000);
          }
          s.droughts = m.droughts;
          s.era = m.era;
          s.climateMod = m.climateMod;
          if (m.stats.length) s.stats = m.stats;
          s.ended = m.ended;
          s.yps = m.yps;
          s.seeking = m.seeking;
          s.achieved = m.achieved;
          s.techCoverage = m.techCoverage;
          break;
        case 'saved':
          saved.current?.(m.json);
          break;
        case 'error':
          s.error = m.message;
          break;
      }
      for (const fn of listeners.current) fn(m);
    };

    const first = initial();
    lastMsg.current = first;
    let switched = false;
    const switchToInline = () => {
      if (switched) return;
      switched = true;
      host.current?.dispose();
      host.current = startInline(onMsg);
      state.current.mode = 'inline';
      host.current.send(first);
      if (lastSpeed.current) host.current.send(lastSpeed.current);
    };
    host.current = startSim(onMsg, switchToInline);
    state.current.mode = 'worker';
    if (!switched) host.current.send(first);
    // A worker that never answers (blocked in some sandboxes) gets replaced by running the simulation on the page.
    const fallback = setTimeout(() => {
      if (!gotAny.current) switchToInline();
    }, 1500);
    const tick = setInterval(force, 100);
    return () => {
      clearTimeout(fallback);
      clearInterval(tick);
      host.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One stable object for the life of the page, so components that depend on it do not tear down every render.
  const api = useRef<SimApi | null>(null);
  if (!api.current) {
    api.current = {
      state,
      send: (m) => {
        if (m.t === 'speed') lastSpeed.current = m;
        host.current?.send(m);
      },
      listen: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      saved,
    };
  }
  return api.current;
}
