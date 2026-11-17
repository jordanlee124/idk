// A view-only layer of buildings. How many tents, huts or houses a group has comes from its real state
// (people, whether it knows Shelter, whether it has settled as a village), and they are built in stages by
// the group's people. Nothing here touches the world, so it cannot change history.
import type { GroupView } from '../worker/protocol';

export type Kind = 'tent' | 'hut' | 'house';

export const KIND_WORD: Record<Kind, string> = { tent: 'tent', hut: 'hut', house: 'mud-brick house' };

export interface House {
  id: number;
  gid: number;
  slot: number;
  x: number;
  y: number;
  kind: Kind;
  /** 0 = bare ground, 1 = finished. Foundation, frame, walls and roof come at 0.25, 0.5, 0.8. */
  progress: number;
  /** Seconds since it appeared, for the pop-in animation. */
  age: number;
  /** Builders currently working on it. */
  builders: number;
}

export interface Ruin {
  x: number;
  y: number;
  kind: Kind;
  life: number;
}

export function stageName(p: number): string {
  if (p >= 1) return 'finished';
  if (p >= 0.8) return 'raising the roof';
  if (p >= 0.5) return 'laying walls';
  if (p >= 0.25) return 'setting the frame';
  return 'marking the foundation';
}

export function targetFor(g: GroupView): { kind: Kind; n: number } {
  if (g.stage === 'village') return { kind: 'house', n: Math.max(3, Math.min(40, Math.round(g.pop / 6))) };
  if (g.techs.includes('shelter')) return { kind: 'hut', n: Math.max(1, Math.min(8, Math.round(g.pop / 10))) };
  return { kind: 'tent', n: Math.max(1, Math.min(4, Math.round(g.pop / 10))) };
}

export class SettlementLayer {
  private byGroup = new Map<number, House[]>();
  private lastTile = new Map<number, number>();
  private nextId = 1;
  ruins: Ruin[] = [];

  clear(): void {
    this.byGroup.clear();
    this.lastTile.clear();
    this.ruins = [];
    this.nextId = 1;
  }

  of(gid: number): House[] {
    return this.byGroup.get(gid) ?? [];
  }

  all(): House[] {
    const out: House[] = [];
    for (const l of this.byGroup.values()) out.push(...l);
    return out;
  }

  /** The most advanced unfinished house of a group that can still take a builder. */
  openSite(gid: number): House | null {
    let best: House | null = null;
    for (const h of this.of(gid)) {
      if (h.progress >= 1 || h.builders >= 3) continue;
      if (!best || h.progress > best.progress) best = h;
    }
    return best;
  }

  total(gid: number): number {
    return this.of(gid).length;
  }

  /** Where the k-th building of a camp goes: a spiral out from the camp centre, kept on land. */
  private place(g: GroupView, cx: number, cy: number, k: number, S: number, onLand: (x: number, y: number) => boolean): { x: number; y: number } {
    const phase = (g.id * 2.17) % (Math.PI * 2);
    for (let attempt = 0; attempt < 40; attempt++) {
      const i = k + attempt * 0.37;
      const r = S * (0.3 + 0.2 * Math.sqrt(i + 1));
      const a = i * 2.399963 + phase;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.9;
      if (onLand(x, y)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  /**
   * Bring the buildings in line with the groups. In `instant` mode (fast speed, wide view) new buildings simply appear
   * finished; otherwise they start as bare ground and wait for builders.
   */
  sync(groups: GroupView[], centre: (tile: number) => { x: number; y: number }, S: number, onLand: (x: number, y: number) => boolean, instant: boolean): void {
    const live = new Set(groups.map((g) => g.id));
    for (const [gid, list] of [...this.byGroup]) {
      if (!live.has(gid)) {
        for (const h of list) if (h.kind !== 'tent') this.ruins.push({ x: h.x, y: h.y, kind: h.kind, life: 9 });
        this.byGroup.delete(gid);
        this.lastTile.delete(gid);
      }
    }
    for (const g of groups) {
      const c = centre(g.tile);
      let list = this.byGroup.get(g.id);
      if (!list) {
        list = [];
        this.byGroup.set(g.id, list);
      }
      const prevTile = this.lastTile.get(g.id);
      if (prevTile !== undefined && prevTile !== g.tile) {
        // The camp moved: tents are packed up, sturdier buildings are left to fall into ruin.
        for (const h of list) if (h.kind !== 'tent' && h.progress >= 0.5) this.ruins.push({ x: h.x, y: h.y, kind: h.kind, life: 10 });
        list.length = 0;
      }
      this.lastTile.set(g.id, g.tile);

      const want = targetFor(g);
      for (const h of list) {
        if (h.kind !== want.kind && rank(want.kind) > rank(h.kind)) {
          h.kind = want.kind; // upgrade in place: tents become huts, huts become brick houses
          h.progress = instant ? 1 : 0;
          h.age = 0;
        }
      }
      while (list.length < want.n) {
        const slot = list.length;
        const p = this.place(g, c.x, c.y, slot, S, onLand);
        list.push({ id: this.nextId++, gid: g.id, slot, x: p.x, y: p.y, kind: want.kind, progress: instant ? 1 : 0, age: instant ? 0 : 1, builders: 0 });
      }
      while (list.length > want.n) {
        const h = list.pop()!;
        if (h.kind !== 'tent' && h.progress >= 0.5) this.ruins.push({ x: h.x, y: h.y, kind: h.kind, life: 7 });
      }
      if (instant) for (const h of list) if (h.progress < 1) h.progress = 1;
    }
  }

  /** `dt` is real seconds. Unattended sites still creep forward so a group is never stuck. */
  update(dt: number): void {
    for (const list of this.byGroup.values()) {
      for (const h of list) {
        h.age += dt;
        if (h.progress < 1 && h.builders === 0) h.progress = Math.min(1, h.progress + 0.03 * dt);
      }
    }
    for (const r of this.ruins) r.life -= dt;
    if (this.ruins.some((r) => r.life <= 0)) this.ruins = this.ruins.filter((r) => r.life > 0);
  }

  /** A builder drops off a load. */
  deliver(houseId: number, amount: number): void {
    for (const list of this.byGroup.values()) {
      for (const h of list) {
        if (h.id === houseId) {
          h.progress = Math.min(1, h.progress + amount);
          return;
        }
      }
    }
  }

  find(houseId: number): House | null {
    for (const list of this.byGroup.values()) for (const h of list) if (h.id === houseId) return h;
    return null;
  }
}

function rank(k: Kind): number {
  return k === 'tent' ? 0 : k === 'hut' ? 1 : 2;
}

/** Paint one building at a given stage in building units (about 12 wide), with no animation. */
function paintHouse(c: CanvasRenderingContext2D, h: Pick<House, 'kind' | 'progress'>, lw: number): void {
  c.save();
  const p = h.progress;
  if (h.kind === 'tent') {
    const s = Math.max(0.25, p);
    c.fillStyle = '#d9c28f';
    c.strokeStyle = '#5a4528';
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(-3.2 * s, 2);
    c.lineTo(0, 2 - 5 * s);
    c.lineTo(3.2 * s, 2);
    c.closePath();
    c.fill();
    c.stroke();
  } else if (h.kind === 'hut') {
    const wallH = 2.4 * Math.min(1, Math.max(0, (p - 0.25) / 0.5));
    c.lineWidth = lw;
    if (p < 0.5) frame(c, 3.4, 3, p, lw);
    c.fillStyle = '#b79a62';
    c.strokeStyle = '#4a3a20';
    if (p >= 0.25) {
      c.beginPath();
      c.ellipse(0, 1.6, 3.4, 1.2, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillRect(-3, 1.6 - wallH, 6, wallH);
      c.strokeRect(-3, 1.6 - wallH, 6, wallH);
    }
    if (p >= 0.8) {
      const roof = Math.min(1, (p - 0.8) / 0.2);
      c.fillStyle = '#d8b15a';
      c.beginPath();
      c.moveTo(-3.8, 1.6 - wallH + 0.2);
      c.lineTo(0, 1.6 - wallH - 3.4 * roof);
      c.lineTo(3.8, 1.6 - wallH + 0.2);
      c.closePath();
      c.fill();
      c.stroke();
    }
  } else {
    // Mud-brick house: foundation stones, then a post frame, then walls rising course by course, then a roof.
    const w = 6.2;
    const hgt = 3.8;
    c.lineWidth = lw;
    if (p < 1) {
      c.fillStyle = '#8f8a80';
      c.strokeStyle = '#4f4b44';
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        c.fillRect(-w / 2 + t * w - 0.5, 2.1, 1, 0.9);
      }
      c.strokeRect(-w / 2, 1.2, w, 1.8);
    }
    if (p >= 0.25 && p < 0.55) frame(c, w, hgt, p, lw);
    if (p >= 0.45) {
      const rise = Math.min(1, (p - 0.45) / 0.35);
      const hh = hgt * rise;
      c.fillStyle = '#c98f5e';
      c.fillRect(-w / 2, 3 - hh, w, hh);
      c.strokeStyle = 'rgba(80,40,20,0.55)';
      c.lineWidth = Math.min(0.5, lw * 0.6);
      const courses = Math.floor(hh / 0.9);
      for (let r = 1; r <= courses; r++) {
        const y = 3 - r * 0.9;
        c.beginPath();
        c.moveTo(-w / 2, y);
        c.lineTo(w / 2, y);
        c.stroke();
        for (let x = -w / 2 + (r % 2 ? 0.8 : 1.6); x < w / 2; x += 1.6) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 0.9);
          c.stroke();
        }
      }
      c.strokeStyle = '#5a3320';
      c.lineWidth = lw;
      c.strokeRect(-w / 2, 3 - hh, w, hh);
      if (rise >= 1) {
        c.fillStyle = '#3d2417';
        c.fillRect(-0.7, 1.4, 1.4, 1.6);
      }
    }
    if (p >= 0.8) {
      const roof = Math.min(1, (p - 0.8) / 0.2);
      c.fillStyle = '#8a4b32';
      c.strokeStyle = '#4a2316';
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(-w / 2 - 0.8, 3 - hgt + 0.15);
      c.lineTo(0, 3 - hgt - 3 * roof);
      c.lineTo(w / 2 + 0.8, 3 - hgt + 0.15);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  if (h.progress < 1) {
    // Pile of materials beside the site.
    c.fillStyle = h.kind === 'house' ? '#b87a4c' : '#a58a55';
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = lw * 0.6;
    for (let i = 0; i < 3; i++) {
      c.fillRect(4.3 + (i % 2) * 1.5, 2.2 - Math.floor(i / 2) * 1.2, 1.4, 1);
      c.strokeRect(4.3 + (i % 2) * 1.5, 2.2 - Math.floor(i / 2) * 1.2, 1.4, 1);
    }
  }
  c.restore();
}

const SPRITE_SCALE = 7; // pixels per building unit
const SPRITE_W = 18;
const SPRITE_H = 16;
const sprites = new Map<string, HTMLCanvasElement>();

/** Buildings are painted once per kind and stage into small offscreen images, then stamped, so hundreds stay cheap. */
function sprite(kind: Kind, progress: number): HTMLCanvasElement {
  const bucket = progress >= 1 ? 24 : Math.floor(progress * 24);
  const key = `${kind}:${bucket}`;
  let cv = sprites.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = SPRITE_W * SPRITE_SCALE;
    cv.height = SPRITE_H * SPRITE_SCALE;
    const c = cv.getContext('2d')!;
    c.scale(SPRITE_SCALE, SPRITE_SCALE);
    c.translate(SPRITE_W / 2, SPRITE_H / 2 + 1);
    paintHouse(c, { kind, progress: bucket >= 24 ? 1 : (bucket + 0.5) / 24 }, 0.25);
    sprites.set(key, cv);
  }
  return cv;
}

/** Draw one building at its current stage, in map pixels. */
export function drawHouse(c: CanvasRenderingContext2D, h: House, _z: number, time: number): void {
  const pop = h.age < 0.35 ? 0.6 + (h.age / 0.35) * 0.4 : 1;
  const img = sprite(h.kind, h.progress);
  const k = 1.3 * pop;
  c.drawImage(img, h.x - (SPRITE_W / 2) * k, h.y - (SPRITE_H / 2 + 1) * k, SPRITE_W * k, SPRITE_H * k);
  if (h.kind === 'house' && h.progress >= 1) {
    // Hearth smoke.
    const t = (time / 1800 + h.id * 0.37) % 1;
    c.fillStyle = `rgba(220,220,220,${0.55 * (1 - t)})`;
    c.beginPath();
    c.arc(h.x + 1.8 + Math.sin(t * 6) * 0.4, h.y - 2.6 - t * 4, 0.7 + t * 0.7, 0, Math.PI * 2);
    c.fill();
  }
}

function frame(c: CanvasRenderingContext2D, w: number, h: number, p: number, lw: number): void {
  const k = Math.min(1, Math.max(0, (p - 0.25) / 0.25));
  c.strokeStyle = '#7a5530';
  c.lineWidth = lw * 1.2;
  for (const x of [-w / 2, w / 2, -w / 6, w / 6]) {
    c.beginPath();
    c.moveTo(x, 3);
    c.lineTo(x, 3 - h * k);
    c.stroke();
  }
  if (k >= 1) {
    c.beginPath();
    c.moveTo(-w / 2, 3 - h);
    c.lineTo(w / 2, 3 - h);
    c.stroke();
  }
}

export function drawRuin(c: CanvasRenderingContext2D, r: Ruin, z: number): void {
  const lw = 1 / Math.sqrt(Math.max(1, z));
  c.save();
  c.translate(r.x, r.y);
  c.globalAlpha = Math.min(1, r.life / 4) * 0.8;
  c.strokeStyle = '#6b665c';
  c.fillStyle = '#8f8a80';
  c.lineWidth = lw;
  c.strokeRect(-2.6, 1.4, 5.2, 1.6);
  c.fillRect(-2.6, 2.1, 1.1, 0.9);
  c.fillRect(1.4, 1.7, 1.2, 1.2);
  c.restore();
}

export function drawField(c: CanvasRenderingContext2D, x: number, y: number, angle: number, ripe: number, z: number): void {
  const lw = 1 / Math.sqrt(Math.max(1, z));
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.fillStyle = 'rgba(120,84,48,0.85)';
  c.fillRect(-5, -3, 10, 6);
  c.strokeStyle = ripe > 0.5 ? '#e0c04a' : '#6fae4f';
  c.lineWidth = lw * 1.1;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(-4.5, i * 1.1);
    c.lineTo(4.5, i * 1.1);
    c.stroke();
  }
  c.restore();
}
