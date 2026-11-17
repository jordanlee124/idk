// Owns the world and runs it at the requested speed. Used by the Web Worker, and directly on the page as a fallback.
import { TECHS } from '../sim/content/techs';
import { step } from '../sim/step';
import type { Culture, World } from '../sim/types';
import { createWorld } from '../sim/world';
import type { FromSim, GroupView, ToSim } from './protocol';

export class SimRunner {
  private world: World | null = null;
  private yps = 0;
  private acc = 0;
  private seeking = false;
  private lastTick = 0;
  private lastPost = 0;
  private lastChronId = 0;
  private lastCultureCount = -1;
  private lastStatsLen = -1;
  private achieved = 0;
  private yearsThisWindow = 0;
  private windowStart = 0;
  private dirty = true;

  /** `budgetMs` caps how long one tick of the loop may spend simulating, to keep the page responsive. */
  constructor(private post: (m: FromSim) => void, private now: () => number, private budgetMs = 40) {}

  handle(msg: ToSim): void {
    try {
      switch (msg.t) {
        case 'new':
          this.setWorld(createWorld(msg.seed));
          break;
        case 'load':
          this.setWorld(JSON.parse(msg.json) as World);
          break;
        case 'speed':
          this.yps = msg.yps;
          this.seeking = false;
          this.dirty = true;
          break;
        case 'seek':
          this.seeking = true;
          this.dirty = true;
          break;
        case 'save':
          if (this.world) this.post({ t: 'saved', json: JSON.stringify(this.world) });
          break;
      }
    } catch (e) {
      this.post({ t: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private setWorld(w: World): void {
    this.world = w;
    this.acc = 0;
    this.seeking = false;
    this.lastChronId = 0;
    this.lastCultureCount = -1;
    this.lastStatsLen = -1;
    this.lastTick = this.now();
    this.windowStart = this.lastTick;
    this.yearsThisWindow = 0;
    this.post({ t: 'map', seed: w.seed, map: w.map });
    this.dirty = true;
    this.snapshot(true);
  }

  /** Call regularly (about every 30 ms). */
  pump(): void {
    const w = this.world;
    if (!w) return;
    const t = this.now();
    const dt = Math.min(0.25, (t - this.lastTick) / 1000);
    this.lastTick = t;

    let years = 0;
    if (this.seeking) {
      const startSeq = w.chronSeq;
      const deadline = t + this.budgetMs;
      while (this.now() < deadline && !w.ended) {
        step(w);
        years++;
        if (this.majorSince(w, startSeq)) {
          this.seeking = false;
          this.yps = 0;
          break;
        }
        if (years >= 400) break;
      }
      if (w.ended) {
        this.seeking = false;
        this.yps = 0;
      }
    } else if (this.yps > 0 && !w.ended) {
      this.acc += this.yps * dt;
      const deadline = t + this.budgetMs;
      while (this.acc >= 1 && this.now() < deadline) {
        step(w);
        this.acc -= 1;
        years++;
      }
      if (this.acc > 5) this.acc = 5; // fell behind the requested speed: do not try to catch up
    }

    this.yearsThisWindow += years;
    if (t - this.windowStart >= 1000) {
      this.achieved = (this.yearsThisWindow * 1000) / (t - this.windowStart);
      this.yearsThisWindow = 0;
      this.windowStart = t;
    }
    if (years > 0 || this.dirty) {
      if (t - this.lastPost >= 60 || this.dirty) this.snapshot(false);
    }
  }

  /** True if a major (importance 3) entry has been written since entry number `seq`. */
  private majorSince(w: World, seq: number): boolean {
    for (let i = w.chronicle.length - 1; i >= 0; i--) {
      const c = w.chronicle[i];
      if (c.id <= seq) return false;
      if (c.importance === 3) return true;
    }
    return false;
  }

  private snapshot(force: boolean): void {
    const w = this.world;
    if (!w) return;
    this.dirty = false;
    this.lastPost = this.now();
    const leaders = new Map<number, string>();
    for (const c of w.characters) if (c.alive) leaders.set(c.id, (c.role === 'chief' ? 'Chief ' : '') + c.name);
    const groups: GroupView[] = w.groups.map((g) => ({ ...g, leaderName: g.leader != null ? leaders.get(g.leader) ?? null : null }));
    const chron = w.chronicle.filter((c) => c.id > this.lastChronId);
    if (chron.length) this.lastChronId = chron[chron.length - 1].id;
    let cultures: Culture[] | null = null;
    if (force || w.cultures.length !== this.lastCultureCount) {
      cultures = w.cultures;
      this.lastCultureCount = w.cultures.length;
    }
    const techCoverage: Record<string, number> = {};
    for (const t of TECHS) techCoverage[t.id] = 0;
    for (const g of w.groups) for (const id of g.techs) techCoverage[id] = (techCoverage[id] ?? 0) + 1;
    const statsChanged = w.stats.length !== this.lastStatsLen;
    this.lastStatsLen = w.stats.length;
    this.post({
      t: 'snap',
      year: w.year,
      groups,
      cultures,
      chron,
      droughts: w.droughts,
      era: w.climate.era,
      climateMod: w.climate.mod,
      stats: statsChanged || force ? w.stats : [],
      ended: w.ended,
      yps: this.yps,
      seeking: this.seeking,
      achieved: this.achieved,
      techCoverage,
    });
  }
}
