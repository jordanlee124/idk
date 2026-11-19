// Night waves, enemy movement, turrets and shells. All automatic.
DF.combat = (function () {
  const C = DF.CONFIG;

  function startNight(s) {
    const n = C.nights[s.day - 1];
    const list = [];
    for (const [type, count] of Object.entries(n.groups)) {
      for (let i = 0; i < count; i++) list.push(type);
    }
    // Shuffle, then push brutes toward the back so the night builds up.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    list.sort((a, b) => (a === 'brute') - (b === 'brute'));
    s.spawnQueue = list.map((type, i) => ({
      type,
      t: n.spawnTime * Math.pow(i / list.length, 0.85) + Math.random() * 1.5,
    })).sort((a, b) => a.t - b.t);
    s.nightClock = 0;
    s.enemies = [];
    s.shells = [];
    s.night = { kills: 0, fuelGained: 0, foodGained: 0, fuelBurned: 0, wallLost: 0 };
  }

  function spawn(s, type) {
    const def = C.enemies[type];
    const hp = def.hp * C.nights[s.day - 1].hpMult;
    s.enemies.push({
      type, def, hp, maxHp: hp,
      x: 1 + Math.random() * (C.cols - 2),
      y: -def.r,
      seed: Math.random() * 10,
      attacking: false,
      hit: 0,
    });
  }

  function damage(s, e, amount) {
    if (e.hp <= 0) return;
    e.hp -= amount;
    e.hit = 0.12;
    if (e.hp <= 0) {
      s.stats.kills++;
      s.night.kills++;
      DF.economy.onKill(s, e.def);
      s.effects.push({ kind: 'burst', x: e.x, y: e.y, r: e.def.r, t: 0, life: 0.4, type: e.type });
      s.effects.push({ kind: 'text', x: e.x, y: e.y, text: '+' + fmt(e.def.fuel) + ' fuel', t: 0, life: 1.0, color: '#f0a64b' });
    }
  }

  function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

  function tick(s, dt) {
    s.nightClock += dt;
    while (s.spawnQueue.length && s.spawnQueue[0].t <= s.nightClock) spawn(s, s.spawnQueue.shift().type);

    const wallTop = C.wallRow;
    for (const e of s.enemies) {
      e.hit = Math.max(0, e.hit - dt);
      const stopY = wallTop - e.def.r * 0.6;
      if (e.y < stopY) {
        e.y = Math.min(stopY, e.y + e.def.speed * dt);
        e.x += Math.sin(s.time * 2.2 + e.seed) * 0.25 * dt;
        e.x = Math.max(1, Math.min(C.cols - 1, e.x)); // drawn toward the outpost lights, never hugging the edge
        e.attacking = false;
      } else {
        e.attacking = true;
        const dmg = e.def.dps * dt;
        s.wallHp -= dmg;
        s.night.wallLost += dmg;
      }
    }

    // Turrets
    for (const b of s.buildings) {
      if (!DF.factory.isTurret(b.type)) continue;
      const def = C.buildings[b.type];
      b.cool = Math.max(0, b.cool - dt);
      const tx = b.x + 0.5, ty = b.y + 0.5;
      let target = null, best = -Infinity;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - tx, e.y - ty);
        if (d <= def.range && e.y > best) { best = e.y; target = e; }
      }
      b.status = !target ? 'idle' : s.stock.ammo < def.ammo ? 'noammo' : 'firing';
      if (target) b.aim = Math.atan2(target.y - ty, target.x - tx);
      if (!target || b.cool > 0 || s.stock.ammo < def.ammo) continue;
      s.stock.ammo -= def.ammo;
      s.stats.ammoFired += def.ammo;
      b.cool = 1 / def.rate;
      b.flash = 0.08;
      if (b.type === 'gun') {
        damage(s, target, def.dmg);
        s.effects.push({ kind: 'tracer', x1: tx, y1: ty, x2: target.x, y2: target.y, t: 0, life: 0.08 });
      } else {
        // Lead the target a little so slow brutes get hit.
        const lead = target.attacking ? 0 : target.def.speed * def.flight;
        s.shells.push({ x0: tx, y0: ty, x1: target.x, y1: Math.min(target.y + lead, wallTop - 0.1), t: 0, life: def.flight });
      }
    }

    for (const b of s.buildings) if (b.flash) b.flash = Math.max(0, b.flash - dt);

    // Mortar shells
    for (const sh of s.shells) {
      sh.t += dt;
      if (sh.t >= sh.life && !sh.done) {
        sh.done = true;
        const def = C.buildings.mortar;
        for (const e of s.enemies) {
          if (Math.hypot(e.x - sh.x1, e.y - sh.y1) <= def.splash + e.def.r) damage(s, e, def.dmg);
        }
        s.effects.push({ kind: 'boom', x: sh.x1, y: sh.y1, r: def.splash, t: 0, life: 0.35 });
      }
    }
    s.shells = s.shells.filter((sh) => !sh.done);
    s.enemies = s.enemies.filter((e) => e.hp > 0);

    if (s.wallHp <= 0) { s.wallHp = 0; return 'lost'; }
    if (!s.spawnQueue.length && !s.enemies.length && !s.shells.length) return 'survived';
    return null;
  }

  return { startNight, tick };
})();
