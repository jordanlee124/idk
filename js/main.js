// Game loop, phase changes, touch input and the HUD.
(function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;
  const $ = (id) => document.getElementById(id);

  let s = DF.newGame();
  const ui = { tool: 'mine', dir: 0, drag: null, toastTimer: 0 };

  // ---------- Phases ----------
  function startDay() {
    s.phase = 'day';
    s.dayTimer = C.dayLength[s.day - 1];
    s.speed = 1;
    hideOverlay();
    refreshToolbar();
  }

  function startNight() {
    if (s.phase !== 'day') return;
    s.phase = 'night';
    s.speed = 1;
    DF.combat.startNight(s);
    refreshToolbar();
  }

  function endNight(result) {
    s.effects = [];
    if (result === 'lost') {
      s.phase = 'lost';
      s.lostReason = 'wall';
      showEnd();
      return;
    }
    const r = DF.economy.dawn(s);
    if (r.starving) {
      s.phase = 'lost';
      s.lostReason = 'food';
      showEnd();
      return;
    }
    if (s.day >= C.totalNights) {
      s.phase = 'won';
      showEnd();
      return;
    }
    s.day++;
    s.phase = 'dawn';
    const n = s.night;
    const unlocks = Object.values(C.buildings).filter((b) => b.unlockDay === s.day).map((b) => b.name + ' turret');
    const next = C.nights[s.day - 1].groups;
    showOverlay({
      kicker: 'Dawn',
      title: 'Day ' + s.day + ' of ' + C.totalNights,
      rows: [
        ['Creatures killed', n.kills],
        ['Fuel salvaged from carcasses', '+' + n.fuelGained.toFixed(1)],
        ['Fuel burned by smelters', '−' + n.fuelBurned.toFixed(1)],
        ['Fuel burned by heaters', '−' + r.heater],
        ['Food foraged', '+' + n.foodGained.toFixed(1)],
        ['Food eaten by ' + C.colonists + ' colonists', '−' + r.eaten],
        ['Wall repaired', '+' + Math.round(r.repair)],
      ],
      note: (unlocks.length ? 'Unlocked: ' + unlocks.join(', ') + '. ' : '') +
        'Tonight: ' + describeWave(next) + '.',
      button: 'Start day ' + s.day,
      action: startDay,
    });
    s.night = { kills: 0, fuelGained: 0, foodGained: 0, fuelBurned: 0, wallLost: 0 };
  }

  function describeWave(groups) {
    const names = { crawler: 'crawlers', swarmer: 'swarmers', brute: 'brutes' };
    return Object.entries(groups).map(([k, v]) => v + ' ' + names[k]).join(', ');
  }

  function showEnd() {
    const won = s.phase === 'won';
    showOverlay({
      kicker: won ? 'Relief ship landed' : 'Outpost lost',
      title: won ? 'You held for ' + C.totalNights + ' nights' :
        s.lostReason === 'food' ? 'The colonists starved' : 'The wall fell on night ' + s.day,
      rows: [
        ['Creatures killed', s.stats.kills],
        ['Plates smelted', s.stats.platesMade],
        ['Ammo made', s.stats.ammoMade],
        ['Ammo fired', s.stats.ammoFired],
      ],
      note: won ? 'The factory was the army. Version 2 adds a colony market.' :
        s.lostReason === 'food' ? 'Every kill brings in food. More turrets in range of the creatures means more food.' :
        'More ammo reaching the wall, or turrets covering more of it, would have held.',
      button: 'Play again',
      action: () => { s = DF.newGame(); startDay(); },
    });
  }

  // ---------- Overlay and toast ----------
  function showOverlay(o) {
    $('ovKicker').textContent = o.kicker;
    $('ovTitle').textContent = o.title;
    const body = $('ovBody');
    body.innerHTML = '';
    if (o.html) body.innerHTML = o.html;
    if (o.rows) {
      const dl = document.createElement('dl');
      for (const [k, v] of o.rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
      }
      body.append(dl);
    }
    if (o.note) { const p = document.createElement('p'); p.className = 'note'; p.textContent = o.note; body.append(p); }
    $('ovButton').textContent = o.button;
    $('ovButton').onclick = o.action;
    $('overlay').hidden = false;
  }
  function hideOverlay() { $('overlay').hidden = true; }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    ui.toastTimer = 1.8;
  }

  // ---------- Toolbar ----------
  function refreshToolbar() {
    for (const btn of document.querySelectorAll('[data-tool]')) {
      const t = btn.dataset.tool;
      btn.classList.toggle('on', ui.tool === t);
      const def = C.buildings[t];
      const locked = def && def.unlockDay && s.day < def.unlockDay;
      btn.classList.toggle('locked', !!locked);
      btn.disabled = s.phase !== 'day';
    }
    $('rotate').disabled = s.phase !== 'day';
    $('rotate').querySelector('.arrow').textContent = D.arrow[ui.dir];
    const a = $('action');
    if (s.phase === 'night') { a.textContent = 'Speed ' + s.speed + '×'; a.classList.add('night'); }
    else { a.textContent = 'Start night'; a.classList.remove('night'); }
  }

  for (const btn of document.querySelectorAll('[data-tool]')) {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tool;
      const def = C.buildings[t];
      if (def && def.unlockDay && s.day < def.unlockDay) { toast(def.name + ' unlocks on day ' + def.unlockDay); return; }
      ui.tool = t;
      refreshToolbar();
    });
  }
  $('rotate').addEventListener('click', () => { ui.dir = (ui.dir + 1) % 4; refreshToolbar(); });
  $('action').addEventListener('click', () => {
    if (s.phase === 'day') startNight();
    else if (s.phase === 'night') { s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 3 : 1; refreshToolbar(); }
  });

  // ---------- Touch on the grid ----------
  const canvas = $('board');

  function cellFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return DF.render.cellAt(e.clientX - r.left, e.clientY - r.top);
  }

  function tapCell(x, y) {
    if (!DF.factory.inBounds(x, y)) return;
    const existing = s.grid[y][x];
    if (ui.tool === 'remove') {
      if (existing) DF.factory.remove(s, x, y);
      return;
    }
    if (existing && existing.type === ui.tool && !DF.factory.isTurret(existing.type)) {
      existing.dir = (existing.dir + 1) % 4; // tap again to rotate
      return;
    }
    if (existing) { toast('Something is already there. Use Remove first.'); return; }
    const err = DF.factory.place(s, ui.tool, x, y, ui.dir);
    if (err) toast(err);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (s.phase !== 'day') return;
    canvas.setPointerCapture(e.pointerId);
    const c = cellFromEvent(e);
    ui.drag = { start: c, last: c, moved: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = ui.drag;
    if (!d || s.phase !== 'day') return;
    const c = cellFromEvent(e);
    if (c.x === d.last.x && c.y === d.last.y) return;
    if (ui.tool !== 'belt' && ui.tool !== 'remove') return;
    // Walk one cell at a time so fast swipes still lay a continuous belt.
    while (c.x !== d.last.x || c.y !== d.last.y) {
      const stepX = Math.sign(c.x - d.last.x), stepY = stepX ? 0 : Math.sign(c.y - d.last.y);
      const next = { x: d.last.x + stepX, y: d.last.y + stepY };
      const dir = stepX > 0 ? 1 : stepX < 0 ? 3 : stepY > 0 ? 2 : 0;
      if (ui.tool === 'belt') {
        if (!d.moved) layBelt(d.last.x, d.last.y, dir);
        const prev = DF.factory.inBounds(d.last.x, d.last.y) && s.grid[d.last.y][d.last.x];
        if (prev && prev.type === 'belt') prev.dir = dir;
        layBelt(next.x, next.y, dir);
      } else {
        if (!d.moved) DF.factory.remove(s, d.last.x, d.last.y);
        DF.factory.remove(s, next.x, next.y);
      }
      d.moved = true;
      d.last = next;
    }
  });

  function layBelt(x, y, dir) {
    if (!DF.factory.inBounds(x, y)) return;
    const b = s.grid[y][x];
    if (b) { if (b.type === 'belt') b.dir = dir; return; }
    const err = DF.factory.place(s, 'belt', x, y, dir);
    if (err && err.startsWith('Need')) toast(err);
    else if (!err) ui.dir = dir;
  }

  canvas.addEventListener('pointerup', () => {
    const d = ui.drag;
    ui.drag = null;
    if (!d || s.phase !== 'day') return;
    if (!d.moved) tapCell(d.start.x, d.start.y);
    refreshToolbar();
  });
  canvas.addEventListener('pointercancel', () => { ui.drag = null; });

  // ---------- Hints ----------
  function hint() {
    if (s.phase === 'night') {
      if (s.stock.ammo <= 0 && s.buildings.some((b) => DF.factory.isTurret(b.type))) return 'Out of ammo! Turrets only fire what reaches the wall.';
      return 'Turrets fire on their own. Your factory keeps running through the night.';
    }
    const has = (t) => s.buildings.some((b) => b.type === t);
    if (!has('mine')) return 'Pick Mine, then tap a glowing ore deposit. Set the direction first with the arrow button.';
    if (!has('smelter')) return 'Place a Smelter where a mine\'s white arrow points. It turns ore into plates.';
    if (!has('workshop')) return 'A Workshop turns plates into ammo. Feed it from a smelter.';
    if (!has('gun')) return 'Put a Gun on the wall. It fires 1 ammo per shot.';
    if (s.delivered.ammo === 0) return 'Ammo has to reach the wall. Drag a belt up to it, or point the workshop straight at it.';
    if (s.delivered.plate === 0) return 'Plates that reach the wall pay for building. Try a second chain without a workshop.';
    if (s.stock.fuel < 3) return 'Fuel is low. Smelters stop without it. Kill creatures to salvage more.';
    return 'Tap a building again to rotate it. Drag to lay belts. Night falls when the timer runs out.';
  }

  // ---------- HUD ----------
  let lastHud = '';
  function hud() {
    const night = s.phase === 'night';
    const label = night ? 'Night ' + s.day : 'Day ' + s.day;
    const timer = night ? s.enemies.length + s.spawnQueue.length + ' left' : Math.ceil(s.dayTimer) + 's';
    const st = s.stock;
    const key = [label, timer, Math.floor(st.plates), Math.floor(st.ammo), st.fuel.toFixed(1), st.food.toFixed(1), Math.ceil(s.wallHp), hint()].join('|');
    if (key === lastHud) return;
    lastHud = key;
    $('phase').textContent = label;
    $('phase').classList.toggle('night', night);
    $('timer').textContent = timer;
    $('plates').textContent = Math.floor(st.plates);
    $('ammo').textContent = Math.floor(st.ammo);
    $('fuel').textContent = Math.floor(st.fuel);
    $('food').textContent = Math.floor(st.food);
    $('fuelChip').classList.toggle('low', st.fuel < 3);
    $('foodChip').classList.toggle('low', st.food < C.colonists);
    $('ammoChip').classList.toggle('low', st.ammo < 5);
    const pct = Math.max(0, s.wallHp / C.wallMaxHp);
    $('wallFill').style.width = (pct * 100) + '%';
    $('wallFill').classList.toggle('low', pct < 0.35);
    $('wallText').textContent = 'Wall ' + Math.ceil(s.wallHp);
    $('hint').textContent = hint();
    for (const btn of document.querySelectorAll('[data-tool]')) {
      const def = C.buildings[btn.dataset.tool];
      if (def) btn.classList.toggle('poor', st.plates < def.cost);
    }
  }

  // ---------- Loop ----------
  function step(dt) {
    s.time += dt;
    const target = s.phase === 'night' ? 1 : 0;
    s.darkness = (s.darkness || 0) + Math.sign(target - (s.darkness || 0)) * Math.min(Math.abs(target - (s.darkness || 0)), dt * 0.8);
    for (const f of s.effects) f.t += dt;
    s.effects = s.effects.filter((f) => f.t < f.life);

    if (s.phase === 'day') {
      DF.factory.tick(s, dt);
      s.dayTimer -= dt;
      if (s.dayTimer <= 0) startNight();
    } else if (s.phase === 'night') {
      DF.factory.tick(s, dt);
      const r = DF.combat.tick(s, dt);
      if (r) endNight(r);
    }
  }

  let last = performance.now();
  function loop(now) {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (ui.toastTimer > 0) { ui.toastTimer -= dt; if (ui.toastTimer <= 0) $('toast').hidden = true; }
    dt *= s.phase === 'night' ? s.speed : 1;
    while (dt > 0) { const h = Math.min(dt, 1 / 60); step(h); dt -= h; }
    DF.render.frame(s, ui);
    hud();
    requestAnimationFrame(loop);
  }

  DF.render.init(canvas);
  window.addEventListener('resize', () => DF.render.resize());
  refreshToolbar();
  showOverlay({
    kicker: 'A hostile world · 5 nights',
    title: 'Duskforge',
    html:
      '<p>Your outpost has five nights until the relief ship lands. Creatures come out of the wasteland after dark, and your turrets only fire ammo your factory made.</p>' +
      '<ol class="how">' +
      '<li><b>Day:</b> put a <b>Mine</b> on ore, point it into a <b>Smelter</b>, then into a <b>Workshop</b>, and get the ammo to the wall.</li>' +
      '<li><b>Plates</b> that reach the wall pay for building. <b>Fuel</b> runs the smelters.</li>' +
      '<li><b>Night:</b> turrets on the wall fight on their own. Kills give back fuel and food.</li>' +
      '</ol>',
    button: 'Begin day 1',
    action: startDay,
  });
  requestAnimationFrame(loop);

  // Expose for testing in the console.
  DF.debug = { get state() { return s; }, startNight, toast };
})();
