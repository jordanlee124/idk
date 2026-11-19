// Light defence: occasional raids walk toward the town hall and chew what's in the way.
DF.raids = (function () {
  const C = DF.CONFIG;
  const W = DF.world;
  const R = C.raids;
  const WALKABLE = { belt: true, splitter: true };

  function tick(s, dt, notify) {
    s.nextRaid -= dt;
    if (s.raidDir === null && s.nextRaid <= R.warn) {
      s.raidDir = Math.random() * Math.PI * 2;
      notify('Raid incoming from the ' + compass(s.raidDir) + ' in ' + Math.ceil(s.nextRaid) + 's');
    }
    if (s.nextRaid <= 0) {
      const n = R.size(s.time, s.pop);
      for (let i = 0; i < n; i++) {
        const brute = s.time >= R.bruteFrom && i % 4 === 3;
        const a = s.raidDir + (Math.random() - 0.5) * 0.5;
        const d = R.distance + Math.random() * 4;
        const def = C.enemies[brute ? 'brute' : 'crawler'];
        s.enemies.push({ type: brute ? 'brute' : 'crawler', def, hp: def.hp * (1 + s.raidCount * 0.08), maxHp: def.hp * (1 + s.raidCount * 0.08),
          x: Math.cos(a) * d, y: Math.sin(a) * d, delay: i * 0.6, seed: Math.random() * 10, hit: 0, chewing: null });
      }
      s.raidCount++;
      s.nextRaid = R.every;
      s.raidDir = null;
      notify('The raid has arrived');
    }

    for (const e of s.enemies) {
      if (e.delay > 0) { e.delay -= dt; continue; }
      e.hit = Math.max(0, e.hit - dt);
      const dist = Math.hypot(e.x, e.y);
      if (dist < 1.4) {
        // Reached the hall: grab food and flee.
        s.stock.food = Math.max(0, s.stock.food - C.raidFoodSteal);
        s.effects.push({ kind: 'text', x: e.x, y: e.y, text: '−' + C.raidFoodSteal + ' food', color: '#ff5d5d', t: 0, life: 1.4 });
        e.hp = 0; e.fled = true;
        continue;
      }
      const ux = -e.x / dist, uy = -e.y / dist;
      const ahead = W.at(s, Math.floor(e.x + ux * (e.def.r + 0.1)), Math.floor(e.y + uy * (e.def.r + 0.1)));
      if (ahead && !WALKABLE[ahead.type] && ahead.type !== 'hall') {
        e.chewing = ahead;
        ahead.hp -= e.def.dps * dt;
        ahead.hurt = 0.15;
        if (ahead.hp <= 0) {
          s.effects.push({ kind: 'boom', x: ahead.x + 0.5, y: ahead.y + 0.5, r: 0.8, t: 0, life: 0.4 });
          W.removeBuilding(s, ahead, false);
          e.chewing = null;
        }
      } else {
        e.chewing = null;
        e.x += ux * e.def.speed * dt + Math.sin(s.time * 3 + e.seed) * uy * 0.3 * dt;
        e.y += uy * e.def.speed * dt - Math.sin(s.time * 3 + e.seed) * ux * 0.3 * dt;
      }
    }

    for (const b of s.buildings) {
      if (b.hurt) b.hurt = Math.max(0, b.hurt - dt);
      if (b.type !== 'turret') continue;
      const def = C.buildings.turret;
      b.cool = Math.max(0, b.cool - dt);
      const tx = b.x + 0.5, ty = b.y + 0.5;
      let target = null, best = Infinity;
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.delay > 0) continue;
        const d = Math.hypot(e.x - tx, e.y - ty);
        if (d <= def.range && d < best) { best = d; target = e; }
      }
      b.status = !target ? 'idle' : s.stock.ammo < 1 ? 'noammo' : 'firing';
      if (!target) continue;
      b.aim = Math.atan2(target.y - ty, target.x - tx);
      if (b.cool > 0 || s.stock.ammo < 1) continue;
      s.stock.ammo -= 1;
      b.cool = 1 / def.rate;
      b.flash = 0.08;
      target.hp -= def.dmg;
      target.hit = 0.1;
      s.effects.push({ kind: 'tracer', x1: tx, y1: ty, x2: target.x, y2: target.y, t: 0, life: 0.08 });
      if (target.hp <= 0) s.effects.push({ kind: 'burst', x: target.x, y: target.y, r: target.def.r, color: target.def.color, t: 0, life: 0.4 });
    }
    for (const b of s.buildings) if (b.flash) b.flash = Math.max(0, b.flash - dt);
    s.enemies = s.enemies.filter((e) => e.hp > 0);
  }

  function compass(a) {
    const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    return names[Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8];
  }

  return { tick, compass };
})();
