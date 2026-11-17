// Draws the hex map on a canvas: a pre-rendered terrain layer plus a per-frame overlay of peoples.
import { RIVER_COLOR, T, TERRAINS } from '../sim/content/terrain';
import { ringN } from '../sim/econ';
import { neighbours } from '../sim/hex';
import type { GroupView } from '../worker/protocol';
import type { Culture, Drought, WorldMap } from '../sim/types';

export type Overlay = 'peoples' | 'hunger' | 'farming';

const S = 18; // hex radius in map pixels
const SQ3 = Math.sqrt(3);
const PAD = S * 1.2;

function centreOf(i: number, w: number): { x: number; y: number } {
  const x = i % w;
  const y = (i / w) | 0;
  return { x: PAD + S * SQ3 * (x + 0.5 * (y & 1)), y: PAD + S * 1.5 * y };
}

function hexPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function mix(hex: string, target: number, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (v: number) => Math.round(v + (target - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function jitter(i: number): number {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 300;
  private cssH = 300;
  private map: WorldMap | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private mapW = 1;
  private mapH = 1;
  private cam = { x: 0, y: 0, zoom: 1 };
  private fitZoom = 1;
  private fly: { x: number; y: number; zoom: number } | null = null;
  private raf = 0;
  private needsDraw = true;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private lastPinch = 0;
  /** While true the camera keeps the settled part of the world in frame; any manual pan or zoom turns it off. */
  autoFrame = true;
  private lastFrameGroups = -1;
  onAutoFrameChange: (on: boolean) => void = () => {};

  groups: GroupView[] = [];
  cultures: Culture[] = [];
  droughts: Drought[] = [];
  year = 0;
  selectedId: number | null = null;
  overlay: Overlay = 'peoples';
  onPick: (g: GroupView | null, tile: number | null) => void = () => {};
  onHover: (tile: number | null, g: GroupView | null) => void = () => {};
  private hoverTile: number | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.bind();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.fly) {
        const f = this.fly;
        this.cam.x += (f.x - this.cam.x) * 0.18;
        this.cam.y += (f.y - this.cam.y) * 0.18;
        this.cam.zoom += (f.zoom - this.cam.zoom) * 0.18;
        if (Math.abs(f.x - this.cam.x) < 0.5 && Math.abs(f.y - this.cam.y) < 0.5 && Math.abs(f.zoom - this.cam.zoom) < 0.01) this.fly = null;
        this.needsDraw = true;
      }
      // New settlements ping for a few years, so keep animating while any is young.
      if (this.year < 220 || this.groups.some((g) => this.year - g.founded < 8 && this.year > 8)) this.needsDraw = true;
      if (this.needsDraw) {
        this.needsDraw = false;
        this.draw();
      }
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }

  requestDraw(): void {
    this.needsDraw = true;
  }

  resize(cssW: number, cssH: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = Math.max(50, cssW);
    this.cssH = Math.max(50, cssH);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    const wasFit = Math.abs(this.cam.zoom - this.fitZoom) < 1e-6;
    this.fitZoom = Math.min(this.cssW / this.mapW, this.cssH / this.mapH);
    if (wasFit || this.cam.zoom < this.fitZoom * 0.9) this.fit();
    this.needsDraw = true;
  }

  fit(): void {
    this.cam = { x: this.mapW / 2, y: this.mapH / 2, zoom: this.fitZoom };
    this.fly = null;
    this.needsDraw = true;
  }

  flyToTile(tile: number, zoom = 2.4): void {
    if (!this.map) return;
    this.manual();
    const c = centreOf(tile, this.map.w);
    this.fly = { x: c.x, y: c.y, zoom: Math.max(this.cam.zoom, zoom) };
  }

  setAutoFrame(on: boolean): void {
    this.autoFrame = on;
    this.lastFrameGroups = -1;
    this.onAutoFrameChange(on);
    if (on) this.updateAutoFrame(true);
  }

  private manual(): void {
    if (this.autoFrame) {
      this.autoFrame = false;
      this.onAutoFrameChange(false);
    }
  }

  /** Called when the groups change: keep the peopled part of the map in view, zoomed in close while there are few of them. */
  updateAutoFrame(force = false): void {
    const map = this.map;
    if (!this.autoFrame || !map || !this.groups.length) return;
    const n = this.groups.length;
    if (!force && this.lastFrameGroups >= 0 && n < this.lastFrameGroups * 1.25 && n > this.lastFrameGroups * 0.6 && n > 6) return;
    this.lastFrameGroups = n;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of this.groups) {
      const c = centreOf(g.tile, map.w);
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
    }
    const pad = S * 7;
    const w = x1 - x0 + pad * 2;
    const h = y1 - y0 + pad * 2;
    const zoom = Math.min(3.2, Math.max(this.fitZoom, Math.min(this.cssW / w, this.cssH / h)));
    const wholeMap = zoom <= this.fitZoom * 1.08;
    this.fly = wholeMap ? { x: this.mapW / 2, y: this.mapH / 2, zoom: this.fitZoom } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom };
  }

  setMap(map: WorldMap): void {
    this.map = map;
    this.mapW = PAD * 2 + S * SQ3 * (map.w + 0.5);
    this.mapH = PAD * 2 + S * 1.5 * map.h + S * 0.5;
    this.terrain = this.renderTerrain(map);
    this.fitZoom = Math.min(this.cssW / this.mapW, this.cssH / this.mapH);
    this.fit();
  }

  private renderTerrain(map: WorldMap): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    const scale = 1.6; // extra pixels so zooming in stays crisp
    cv.width = Math.ceil(this.mapW * scale);
    cv.height = Math.ceil(this.mapH * scale);
    const c = cv.getContext('2d')!;
    c.scale(scale, scale);
    c.fillStyle = '#1f4666';
    c.fillRect(0, 0, this.mapW, this.mapH);
    const n = map.w * map.h;
    for (let i = 0; i < n; i++) {
      const { x, y } = centreOf(i, map.w);
      const t = map.terrain[i];
      const def = TERRAINS[t];
      let fill: string;
      if (t === T.Ocean) {
        const nearLand = neighbours(i, map.w, map.h).some((nb) => map.terrain[nb] !== T.Ocean);
        fill = nearLand ? mix(def.color, 255, 0.18) : mix(def.color, 0, 0.1 + (0.5 - map.elev[i]) * 0.9);
      } else {
        const lift = (map.elev[i] - 0.65) * 0.5 + (jitter(i) - 0.5) * 0.08;
        fill = lift >= 0 ? mix(def.color, 255, lift) : mix(def.color, 0, -lift);
      }
      hexPath(c, x, y, S + 0.4);
      c.fillStyle = fill;
      c.fill();
    }
    // Glyphs for texture and readability.
    for (let i = 0; i < n; i++) {
      const t = map.terrain[i];
      if (t === T.Ocean || t === T.Grassland || t === T.Plains) continue;
      const { x, y } = centreOf(i, map.w);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.lineWidth = 1.2;
      if (t === T.Mountain) {
        c.beginPath();
        c.moveTo(x - S * 0.5, y + S * 0.35);
        c.lineTo(x, y - S * 0.45);
        c.lineTo(x + S * 0.5, y + S * 0.35);
        c.closePath();
        c.fillStyle = 'rgba(40,36,34,0.55)';
        c.fill();
      } else if (t === T.Hills) {
        c.beginPath();
        c.arc(x, y + S * 0.2, S * 0.38, Math.PI, 0);
        c.stroke();
      } else if (t === T.Forest) {
        for (let k = 0; k < 3; k++) {
          const a = jitter(i * 3 + k) * Math.PI * 2;
          c.beginPath();
          c.arc(x + Math.cos(a) * S * 0.38, y + Math.sin(a) * S * 0.34, S * 0.16, 0, Math.PI * 2);
          c.fill();
        }
      } else if (t === T.Desert) {
        c.fillRect(x - S * 0.25, y - 1, S * 0.5, 1.4);
      }
    }
    // Rivers.
    c.strokeStyle = RIVER_COLOR;
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      if (!map.river[i]) continue;
      const a = centreOf(i, map.w);
      let linked = false;
      for (const nb of neighbours(i, map.w, map.h)) {
        if (map.river[nb] && nb > i) {
          const b = centreOf(nb, map.w);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
          linked = true;
        } else if (map.river[nb]) linked = true;
        else if (map.terrain[nb] === T.Ocean) {
          const b = centreOf(nb, map.w);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
          c.stroke();
        }
      }
      if (!linked) {
        c.beginPath();
        c.arc(a.x, a.y, 1.6, 0, Math.PI * 2);
        c.fillStyle = RIVER_COLOR;
        c.fill();
      }
    }
    return cv;
  }

  // ---- coordinates ----
  private toMap(sx: number, sy: number): { x: number; y: number } {
    return { x: this.cam.x + (sx - this.cssW / 2) / this.cam.zoom, y: this.cam.y + (sy - this.cssH / 2) / this.cam.zoom };
  }

  private tileAtMap(mx: number, my: number): number | null {
    const map = this.map;
    if (!map) return null;
    let best = -1;
    let bestD = Infinity;
    const approxRow = Math.round((my - PAD) / (S * 1.5));
    for (let y = Math.max(0, approxRow - 1); y <= Math.min(map.h - 1, approxRow + 1); y++) {
      const approxCol = Math.round((mx - PAD) / (S * SQ3) - 0.5 * (y & 1));
      for (let x = Math.max(0, approxCol - 1); x <= Math.min(map.w - 1, approxCol + 1); x++) {
        const c = centreOf(y * map.w + x, map.w);
        const d = (c.x - mx) ** 2 + (c.y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = y * map.w + x;
        }
      }
    }
    return best >= 0 && bestD <= S * S ? best : null;
  }

  private markerRadius(g: GroupView): number {
    return 3.8 + Math.sqrt(g.pop) * 0.5;
  }

  private groupAt(sx: number, sy: number): GroupView | null {
    if (!this.map) return null;
    const m = this.toMap(sx, sy);
    let best: GroupView | null = null;
    let bestD = Infinity;
    for (const g of this.groups) {
      const c = centreOf(g.tile, this.map.w);
      const d = Math.hypot(c.x - m.x, c.y - m.y);
      const reach = Math.max(this.markerRadius(g) + 3, 9 / this.cam.zoom * 1.4);
      if (d < reach && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    return best;
  }

  // ---- input ----
  private bind(): void {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.dragMoved = 0;
      this.fly = null;
      if (this.pointers.size === 2) this.lastPinch = this.pinchDist();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) {
        const dx = e.offsetX - p.x;
        const dy = e.offsetY - p.y;
        p.x = e.offsetX;
        p.y = e.offsetY;
        if (this.pointers.size === 1) {
          this.dragMoved += Math.abs(dx) + Math.abs(dy);
          if (this.dragMoved > 6) this.manual();
          this.cam.x -= dx / this.cam.zoom;
          this.cam.y -= dy / this.cam.zoom;
          this.clampCam();
          this.needsDraw = true;
        } else if (this.pointers.size === 2) {
          const d = this.pinchDist();
          if (this.lastPinch > 0) this.zoomAt(this.cssW / 2, this.cssH / 2, d / this.lastPinch);
          this.lastPinch = d;
          this.dragMoved += 10;
        }
      } else if (this.map) {
        const m = this.toMap(e.offsetX, e.offsetY);
        const tile = this.tileAtMap(m.x, m.y);
        if (tile !== this.hoverTile) {
          this.hoverTile = tile;
          this.onHover(tile, this.groupAt(e.offsetX, e.offsetY));
        }
      }
    });
    const up = (e: PointerEvent) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.lastPinch = 0;
      if (had && this.dragMoved < 6 && this.pointers.size === 0) {
        const g = this.groupAt(e.offsetX, e.offsetY);
        const m = this.toMap(e.offsetX, e.offsetY);
        this.onPick(g, this.tileAtMap(m.x, m.y));
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => {
      this.hoverTile = null;
      this.onHover(null, null);
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.fly = null;
        this.manual();
        this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    cv.addEventListener('dblclick', () => {
      this.manual();
      this.fit();
    });
  }

  private pinchDist(): number {
    const pts = [...this.pointers.values()];
    return pts.length < 2 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toMap(sx, sy);
    this.cam.zoom = Math.min(4.5, Math.max(this.fitZoom * 0.85, this.cam.zoom * factor));
    const after = this.toMap(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
    this.needsDraw = true;
  }

  private clampCam(): void {
    this.cam.x = Math.min(this.mapW, Math.max(0, this.cam.x));
    this.cam.y = Math.min(this.mapH, Math.max(0, this.cam.y));
  }

  // ---- drawing ----
  private groupColor(g: GroupView, alpha: number): string {
    const culture = this.cultures[g.cultureId];
    const hue = culture ? culture.hue : 0;
    switch (this.overlay) {
      case 'hunger': {
        const k = Math.min(1, Math.max(0, (g.foodRatio - 0.75) / 0.45));
        return `hsla(${Math.round(k * 125)},80%,50%,${alpha})`;
      }
      case 'farming':
        if (g.stage === 'village') return `hsla(42,95%,55%,${alpha})`;
        if (g.techs.includes('agriculture')) return `hsla(70,70%,55%,${alpha})`;
        return `hsla(215,25%,60%,${alpha})`;
      default:
        return `hsla(${Math.round(hue)},68%,56%,${alpha})`;
    }
  }

  draw(): void {
    const c = this.ctx;
    const map = this.map;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#16384f';
    c.fillRect(0, 0, this.cssW, this.cssH);
    if (!map || !this.terrain) return;
    c.save();
    c.translate(this.cssW / 2 - this.cam.x * this.cam.zoom, this.cssH / 2 - this.cam.y * this.cam.zoom);
    c.scale(this.cam.zoom, this.cam.zoom);
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.terrain, 0, 0, this.mapW, this.mapH);

    // Droughts.
    const rings = ringN(map, 6);
    for (const d of this.droughts) {
      const r = rings[d.tile].filter((t) => {
        const a = centreOf(d.tile, map.w);
        const b = centreOf(t, map.w);
        return Math.hypot(a.x - b.x, a.y - b.y) <= (d.radius + 0.5) * S * 1.75;
      });
      c.fillStyle = `rgba(214,120,30,${0.18 + d.severity * 0.25})`;
      for (const t of r) {
        const p = centreOf(t, map.w);
        hexPath(c, p.x, p.y, S);
        c.fill();
      }
    }

    // Territories.
    const ring1 = ringN(map, 2);
    c.lineWidth = 1;
    for (const g of this.groups) {
      const tiles = ring1[g.tile];
      const own = g.stage === 'village' ? 0.55 : 0.5;
      for (let k = 0; k < Math.min(7, tiles.length); k++) {
        const t = tiles[k];
        if (map.terrain[t] === T.Ocean) continue;
        const p = centreOf(t, map.w);
        hexPath(c, p.x, p.y, S - 0.5);
        c.fillStyle = this.groupColor(g, k === 0 ? own : 0.2);
        c.fill();
      }
    }

    // Markers.
    const zoom = this.cam.zoom;
    for (const g of this.groups) {
      const p = centreOf(g.tile, map.w);
      const r = this.markerRadius(g);
      const culture = this.cultures[g.cultureId];
      const hue = culture ? culture.hue : 0;
      const young = this.year - g.founded;
      if (young < 8 && this.year > 8) {
        c.strokeStyle = `rgba(255,255,255,${0.9 - young / 9})`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(p.x, p.y, r + 3 + young * 2.2, 0, Math.PI * 2);
        c.stroke();
      }
      c.lineWidth = 1.6 / Math.sqrt(Math.max(1, zoom * 0.6));
      if (g.stage === 'village') {
        c.fillStyle = `hsl(${Math.round(hue)},72%,48%)`;
        c.strokeStyle = '#fff';
        const h = r * 1.05;
        c.beginPath();
        c.moveTo(p.x - h, p.y + h * 0.7);
        c.lineTo(p.x - h, p.y - h * 0.25);
        c.lineTo(p.x, p.y - h * 1.05);
        c.lineTo(p.x + h, p.y - h * 0.25);
        c.lineTo(p.x + h, p.y + h * 0.7);
        c.closePath();
        c.fill();
        c.stroke();
      } else if (g.stage === 'tribe') {
        c.fillStyle = `hsl(${Math.round(hue)},72%,48%)`;
        c.strokeStyle = '#fff';
        c.beginPath();
        c.arc(p.x, p.y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else {
        c.strokeStyle = '#fff';
        c.fillStyle = `hsl(${Math.round(hue)},72%,48%)`;
        c.beginPath();
        c.arc(p.x, p.y, r * 0.85, 0, Math.PI * 2);
        c.fill();
        c.setLineDash([3, 2]);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // The founders' first camp glows so nobody loses it while history is still just two people.
    if (this.year < 220) {
      const first = this.groups.find((g) => g.id === 1);
      if (first) {
        const p = centreOf(first.tile, map.w);
        const pulse = (Math.sin(performance.now() / 380) + 1) / 2;
        c.strokeStyle = `rgba(255,227,107,${0.5 + pulse * 0.4})`;
        c.lineWidth = 2.4 / Math.sqrt(zoom);
        c.beginPath();
        c.arc(p.x, p.y, this.markerRadius(first) + 5 + pulse * 5, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // Selection.
    const sel = this.groups.find((g) => g.id === this.selectedId);
    if (sel) {
      const p = centreOf(sel.tile, map.w);
      c.strokeStyle = '#ffe36b';
      c.lineWidth = 2.5 / Math.sqrt(zoom);
      c.beginPath();
      c.arc(p.x, p.y, this.markerRadius(sel) + 6, 0, Math.PI * 2);
      c.stroke();
      for (const t of ring1[sel.tile].slice(0, 19)) {
        if (map.terrain[t] === T.Ocean) continue;
        const q = centreOf(t, map.w);
        hexPath(c, q.x, q.y, S - 1);
        c.strokeStyle = 'rgba(255,227,107,0.35)';
        c.lineWidth = 1;
        c.stroke();
      }
    }

    // Labels when zoomed in.
    if (zoom >= 2) {
      c.font = `600 ${12.5 / zoom}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.lineJoin = 'round';
      for (const g of this.groups) {
        if (g.pop < 25 && g.id !== this.selectedId && zoom < 2.6) continue;
        const p = centreOf(g.tile, map.w);
        const label = (g.placeName ?? this.cultures[g.cultureId]?.name ?? '') + (zoom >= 2.6 ? ` · ${g.pop}` : '');
        const y = p.y - this.markerRadius(g) - 4 / zoom - 2;
        c.lineWidth = 3.5 / zoom;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.strokeText(label, p.x, y);
        c.fillStyle = '#fff';
        c.fillText(label, p.x, y);
      }
    }
    c.restore();
  }
}
