// The endless map, game state and placement rules.
DF.world = (function () {
  const C = DF.CONFIG;

  // ---------- Terrain: a pure function of (x, y, seed), so the map never ends ----------
  function hash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y, scale, seed) {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed);
    const c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  // Guaranteed patches near the start so the first factory is always possible.
  const STARTER = [
    { x: 8, y: -4, r: 2.3, t: 'iron' },
    { x: -8, y: 3, r: 2.0, t: 'coal' },
    { x: 3, y: 9, r: 3.0, t: 'forest' },
    { x: -5, y: -9, r: 2.6, t: 'forest' },
  ];

  const cache = new Map();
  function terrain(s, x, y) {
    const k = x + ',' + y;
    let t = cache.get(k);
    if (t) return t;
    t = 'grass';
    const d = Math.hypot(x, y);
    for (const p of STARTER) if (Math.hypot(x - p.x, y - p.y) <= p.r) t = p.t;
    if (t === 'grass' && d > 12) {
      const seed = s.seed;
      if (noise(x, y, 7, seed + 1) > 0.78) t = 'iron';
      else if (noise(x, y, 7, seed + 2) > 0.8) t = 'coal';
      else if (noise(x, y, 11, seed + 3) > 0.66) t = 'forest';
      else if (noise(x, y, 13, seed + 4) > 0.8) t = 'rock';
    }
    if (cache.size > 200000) cache.clear();
    cache.set(k, t);
    return t;
  }

  // ---------- State ----------
  function newGame() {
    const s = {
      seed: Math.floor(Math.random() * 100000),
      time: 0,
      stock: { ...C.start },
      tiles: new Map(), // "x,y" -> building
      buildings: [],
      enemies: [],
      effects: [],
      nextRaid: C.raids.first,
      raidDir: null,
      raidCount: 0,
      townClock: 0,
      pop: 0,
      workersUsed: 0,
      cam: { x: 0.5, y: 0.5, zoom: 1 },
      stats: { delivered: {}, peakPop: 0 },
    };
    // Town hall (2x2) and three starting huts
    addBuilding(s, { type: 'hall', x: -1, y: -1, w: 2, h: 2, dir: 0 });
    for (const [x, y] of [[-3, -1], [-3, 1], [2, 1]]) addBuilding(s, { type: 'hut', x, y, dir: 0 });
    for (const b of s.buildings) if (b.type === 'hut') { b.residents = 2; }
    DF.town.recount(s);
    return s;
  }

  function key(x, y) { return x + ',' + y; }
  function at(s, x, y) { return s.tiles.get(key(x, y)) || null; }

  function addBuilding(s, o) {
    const def = C.buildings[o.type] || { hp: 9999 };
    const b = Object.assign({ w: 1, h: 1, dir: 0, item: null, inp: {}, out: [], prog: 0, cool: 0, status: '',
      hp: def.hp, maxHp: def.hp, tier: 0, residents: 0, happy: 0, short: 0, rr: 0, aim: -Math.PI / 2 }, o);
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) s.tiles.set(key(b.x + dx, b.y + dy), b);
    s.buildings.push(b);
    return b;
  }

  function removeBuilding(s, b, refund) {
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) s.tiles.delete(key(b.x + dx, b.y + dy));
    const i = s.buildings.indexOf(b);
    if (i >= 0) s.buildings.splice(i, 1);
    if (refund) for (const [k, v] of Object.entries(C.buildings[b.type].cost)) s.stock[k] += v;
    DF.town.recount(s);
  }

  function townRadius(s) { return C.townRadiusBase + s.pop * C.townRadiusPerPop; }
  function inTown(s, x, y) { return Math.hypot(x + 0.5, y + 0.5) <= townRadius(s); }

  function costText(cost) {
    return Object.entries(cost).map(([k, v]) => v + ' ' + C.items[k].name.toLowerCase()).join(', ');
  }

  // Returns null when allowed, otherwise a short reason.
  function placeError(s, type, x, y, ignoreCost) {
    const def = C.buildings[type];
    if (s.pop < def.unlock) return def.name + ' unlocks at ' + def.unlock + ' people';
    if (at(s, x, y)) return 'Something is already there';
    const t = terrain(s, x, y);
    if (t === 'rock') return 'Rock. Nothing can be built here.';
    if (def.on === 'ore' && t !== 'iron' && t !== 'coal') return 'Mines go on iron or coal';
    if (def.on === 'forest' && t !== 'forest') return 'Lumber goes on forest';
    if (def.on === 'grass' && t !== 'grass') return 'Farms need open grass';
    if (!def.on && (t === 'iron' || t === 'coal') && type !== 'belt' && type !== 'splitter' && type !== 'wall')
      return 'Keep deposits for mines';
    if ((type === 'hut' || type === 'depot') && !inTown(s, x, y)) return def.name + ' must be inside the town circle';
    if (def.workers && s.workersUsed + def.workers > s.pop) return 'Needs ' + def.workers + ' free worker' + (def.workers > 1 ? 's' : '') + '. Grow the town.';
    if (!ignoreCost) {
      for (const [k, v] of Object.entries(def.cost)) if (s.stock[k] < v) return 'Needs ' + costText(def.cost);
    }
    return null;
  }

  function place(s, type, x, y, dir) {
    const err = placeError(s, type, x, y);
    if (err) return err;
    const def = C.buildings[type];
    for (const [k, v] of Object.entries(def.cost)) s.stock[k] -= v;
    const b = addBuilding(s, { type, x, y, dir });
    if (def.on === 'ore') b.ore = terrain(s, x, y);
    DF.town.recount(s);
    return null;
  }

  return { terrain, newGame, at, key, addBuilding, removeBuilding, place, placeError, townRadius, inTown, costText };
})();
