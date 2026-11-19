// Placement rules and the production simulation (mines, smelters, workshops, belts).
DF.factory = (function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;

  function inBounds(x, y) { return x >= 0 && y >= 0 && x < C.cols && y < C.rows; }
  function isTurret(t) { return t === 'gun' || t === 'mortar'; }

  // Returns null if placement is allowed, otherwise a short reason for the player.
  function placeError(s, type, x, y) {
    if (!inBounds(x, y)) return 'Out of bounds';
    const def = C.buildings[type];
    if (def.unlockDay && s.day < def.unlockDay) return def.name + ' unlocks on day ' + def.unlockDay;
    if (s.grid[y][x]) return 'Something is already there';
    if (y < C.wallRow) return 'That is the wasteland. Build inside the wall.';
    if (isTurret(type)) {
      if (y !== C.wallRow) return 'Turrets go on the wall';
    } else if (y === C.wallRow) {
      return 'Only turrets fit on the wall';
    }
    const onOre = s.deposits.has(x + ',' + y);
    if (type === 'mine' && !onOre) return 'Mines go on a glowing ore deposit';
    if (type !== 'mine' && onOre) return 'Keep ore deposits for mines';
    if (!DF.economy.canAfford(s, def.cost)) return 'Need ' + def.cost + ' plates';
    return null;
  }

  function place(s, type, x, y, dir) {
    const err = placeError(s, type, x, y);
    if (err) return err;
    const b = { type, x, y, dir, item: null, inp: 0, out: 0, prog: 0, cool: 0, aim: -Math.PI / 2, status: '' };
    s.grid[y][x] = b;
    s.buildings.push(b);
    DF.economy.spend(s, C.buildings[type].cost);
    return null;
  }

  function remove(s, x, y) {
    const b = inBounds(x, y) && s.grid[y][x];
    if (!b) return false;
    s.grid[y][x] = null;
    s.buildings.splice(s.buildings.indexOf(b), 1);
    DF.economy.refund(s, C.buildings[b.type].cost);
    return true;
  }

  // Try to move `item` into cell (x, y), travelling in direction `travel`.
  function insert(s, x, y, item, travel) {
    if (!inBounds(x, y)) return false;
    if (y === C.wallRow) return DF.economy.deliverToWall(s, item);
    if (y < C.wallRow) return false;
    const b = s.grid[y][x];
    if (!b) return false;
    if (b.type === 'belt') {
      if (b.item) return false;
      if (travel === D.opposite(b.dir)) return false; // can't push into a belt's output end
      // Fed from behind it enters at the back edge; fed from the side it enters mid-cell.
      b.item = { k: item, p: travel === b.dir ? 0 : 0.5 };
      return true;
    }
    if (b.type === 'smelter' && item === 'ore' && b.inp < C.buildings.smelter.inMax) { b.inp++; return true; }
    if (b.type === 'workshop' && item === 'plate' && b.inp < C.buildings.workshop.inMax) { b.inp++; return true; }
    return false;
  }

  function pushOut(s, b, item) {
    return insert(s, b.x + D.dx[b.dir], b.y + D.dy[b.dir], item, b.dir);
  }

  function tick(s, dt) {
    const B = C.buildings;
    for (const b of s.buildings) {
      switch (b.type) {
        case 'belt':
          if (b.item) {
            b.item.p = Math.min(1, b.item.p + dt * C.beltSpeed);
            if (b.item.p >= 1 && pushOut(s, b, b.item.k)) b.item = null;
          }
          break;
        case 'mine':
          if (b.out === 0) {
            b.prog += dt;
            if (b.prog >= B.mine.period) { b.prog = 0; b.out = 1; }
          }
          if (b.out > 0 && pushOut(s, b, 'ore')) b.out--;
          b.status = b.out > 0 ? 'blocked' : 'ok';
          break;
        case 'smelter': {
          const d = B.smelter;
          if (b.inp > 0 && b.out < d.outMax && s.stock.fuel >= d.fuelPerCraft) {
            b.prog += dt;
            b.status = 'ok';
            if (b.prog >= d.period) {
              b.prog = 0; b.inp--; b.out++;
              s.stock.fuel -= d.fuelPerCraft;
              s.night.fuelBurned += d.fuelPerCraft;
              s.stats.platesMade++;
            }
          } else {
            b.status = b.inp === 0 ? 'idle' : b.out >= d.outMax ? 'blocked' : 'nofuel';
          }
          if (b.out > 0 && pushOut(s, b, 'plate')) b.out--;
          break;
        }
        case 'workshop': {
          const d = B.workshop;
          if (b.inp > 0 && b.out + d.ammoPerPlate <= d.outMax) {
            b.prog += dt;
            b.status = 'ok';
            if (b.prog >= d.period) {
              b.prog = 0; b.inp--; b.out += d.ammoPerPlate;
              s.stats.ammoMade += d.ammoPerPlate;
            }
          } else {
            b.status = b.inp === 0 ? 'idle' : 'blocked';
          }
          if (b.out > 0 && pushOut(s, b, 'ammo')) b.out--;
          break;
        }
      }
    }
  }

  return { place, placeError, remove, tick, isTurret, inBounds };
})();
