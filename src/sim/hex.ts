// Pointy-top hex grid in "odd-r" offset coordinates. Tile index = y * w + x.

const EVEN_ROW: [number, number][] = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_ROW: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function neighbours(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const dirs = y & 1 ? ODD_ROW : EVEN_ROW;
  const out: number[] = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
  }
  return out;
}

function toCube(x: number, y: number): [number, number, number] {
  const q = x - ((y - (y & 1)) >> 1);
  return [q, y, -q - y];
}

export function distance(a: number, b: number, w: number): number {
  const [aq, ar, as] = toCube(a % w, (a / w) | 0);
  const [bq, br, bs] = toCube(b % w, (b / w) | 0);
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/** All tiles within `r` steps of `i` (including `i`), nearest first. */
export function within(i: number, r: number, w: number, h: number): number[] {
  const seen = new Set<number>([i]);
  let frontier = [i];
  const out = [i];
  for (let step = 0; step < r; step++) {
    const next: number[] = [];
    for (const t of frontier) {
      for (const n of neighbours(t, w, h)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
          out.push(n);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/** Centre of a tile in units where a hex has width sqrt(3) and row spacing 1.5. */
export function centre(i: number, w: number): { x: number; y: number } {
  const x = i % w;
  const y = (i / w) | 0;
  return { x: Math.sqrt(3) * (x + 0.5 * (y & 1)), y: 1.5 * y };
}

/** Compass word for travelling from tile a to tile b. */
export function compass(a: number, b: number, w: number, names: string[]): string {
  const ca = centre(a, w);
  const cb = centre(b, w);
  const ang = Math.atan2(cb.y - ca.y, cb.x - ca.x); // screen coords: +y is south
  const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return names[idx];
}
