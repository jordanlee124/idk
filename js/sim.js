// Production: belts, splitters, extractors and crafting machines.
DF.sim = (function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;
  const W = DF.world;
  const B = C.buildings;

  const ACCEPTS = {
    smelter: { iron: 4, coal: 4 },
    workshop: { plate: 6 },
    armory: { plate: 4 },
  };

  // Try to move `item` into tile (x, y), travelling in direction `travel`.
  function insert(s, x, y, item, travel) {
    const b = W.at(s, x, y);
    if (!b) return false;
    switch (b.type) {
      case 'belt':
        if (b.item || travel === D.opposite(b.dir)) return false;
        b.item = { k: item, p: travel === b.dir ? 0 : 0.5 };
        return true;
      case 'splitter':
        if (b.item) return false;
        b.item = { k: item, p: 0, from: D.opposite(travel) };
        return true;
      case 'hall':
      case 'depot':
        if (b.type === 'depot' && !W.inTown(s, b.x, b.y)) return false;
        DF.town.receive(s, item);
        return true;
      default: {
        const acc = ACCEPTS[b.type];
        if (!acc || !acc[item]) return false;
        if ((b.inp[item] || 0) >= acc[item]) return false;
        b.inp[item] = (b.inp[item] || 0) + 1;
        return true;
      }
    }
  }

  function pushFront(s, b, item) {
    return insert(s, b.x + D.dx[b.dir], b.y + D.dy[b.dir], item, b.dir);
  }

  function craft(b, dt, period, ready, outMax, finish) {
    if (!b.staffed) { b.status = 'noworkers'; return; }
    if (b.out.length >= outMax) { b.status = 'blocked'; return; }
    if (!ready()) { b.status = 'idle'; b.prog = 0; return; }
    b.status = 'ok';
    b.prog += dt;
    if (b.prog >= period) { b.prog = 0; finish(); }
  }

  function tick(s, dt) {
    for (const b of s.buildings) {
      const def = B[b.type];
      switch (b.type) {
        case 'belt':
          if (b.item) {
            b.item.p = Math.min(1, b.item.p + dt * C.beltSpeed);
            if (b.item.p >= 1 && pushFront(s, b, b.item.k)) b.item = null;
          }
          break;
        case 'splitter':
          if (b.item) {
            b.item.p = Math.min(1, b.item.p + dt * C.beltSpeed);
            if (b.item.p >= 1) {
              const outs = [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4].filter((d) => d !== b.item.from);
              for (let i = 0; i < outs.length; i++) {
                const d = outs[(b.rr + i) % outs.length];
                if (insert(s, b.x + D.dx[d], b.y + D.dy[d], b.item.k, d)) { b.rr = (b.rr + i + 1) % outs.length; b.item = null; break; }
              }
            }
          }
          break;
        case 'mine':
        case 'lumber':
        case 'farm': {
          const item = def.out || b.ore;
          craft(b, dt, def.period, () => true, 1, () => b.out.push(item));
          break;
        }
        case 'smelter':
          craft(b, dt, def.period, () => b.inp.iron >= 1 && b.inp.coal >= 1, 2, () => {
            b.inp.iron--; b.inp.coal--; b.out.push('plate');
          });
          break;
        case 'workshop':
          craft(b, dt, def.period, () => b.inp.plate >= 2, 2, () => { b.inp.plate -= 2; b.out.push('tools'); });
          break;
        case 'armory':
          craft(b, dt, def.period, () => b.inp.plate >= 1, 4, () => { b.inp.plate -= 1; for (let i = 0; i < 4; i++) b.out.push('ammo'); });
          break;
      }
      if (b.out.length && pushFront(s, b, b.out[0])) b.out.shift();
    }
  }

  return { tick, insert, ACCEPTS };
})();
