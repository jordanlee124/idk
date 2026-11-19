// Game loop, touch controls, HUD, panels and saving.
(function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;
  const W = DF.world;
  const R = DF.render;
  const $ = (id) => document.getElementById(id);

  let s = load() || W.newGame();
  const ui = { tool: 'hand', dir: 1, ghost: null, selected: null, toastTimer: 0 };

  // ---------- Saving ----------
  function save() {
    try {
      const data = {
        v: 2, seed: s.seed, time: s.time, stock: s.stock, nextRaid: s.nextRaid, raidCount: s.raidCount, cam: s.cam, stats: s.stats,
        b: s.buildings.map((b) => [b.type, b.x, b.y, b.dir, b.tier, b.residents, Math.round(b.hp), b.ore || '']),
      };
      localStorage.setItem(C.saveKey, JSON.stringify(data));
    } catch (e) { /* storage blocked: the game still runs, it just won't resume */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(C.saveKey);
      if (!raw) return null;
      const d = JSON.parse(raw);
      const g = W.newGame();
      g.tiles.clear(); g.buildings.length = 0;
      Object.assign(g, { seed: d.seed, time: d.time, stock: { ...C.start, ...d.stock }, nextRaid: d.nextRaid, raidCount: d.raidCount, cam: d.cam, stats: d.stats || g.stats });
      for (const [type, x, y, dir, tier, residents, hp, ore] of d.b) {
        const b = W.addBuilding(g, { type, x, y, dir, tier, residents, w: type === 'hall' ? 2 : 1, h: type === 'hall' ? 2 : 1 });
        if (C.buildings[type]) b.hp = Math.min(hp, b.maxHp);
        if (ore) b.ore = ore;
      }
      DF.town.recount(g);
      return g;
    } catch (e) { return null; }
  }

  // ---------- Toolbar ----------
  const TOOLS = ['hand', 'belt', 'splitter', 'mine', 'smelter', 'lumber', 'farm', 'hut', 'depot', 'armory', 'turret', 'wall', 'workshop', 'remove'];
  const bar = $('tools');
  for (const t of TOOLS) {
    const btn = document.createElement('button');
    btn.id = 't-' + t;
    btn.dataset.tool = t;
    const def = C.buildings[t];
    btn.innerHTML = `<canvas width="56" height="56"></canvas><span class="n">${t === 'hand' ? 'Move' : t === 'remove' ? 'Remove' : def.name}</span>`;
    btn.addEventListener('click', () => {
      if (def && s.pop < def.unlock) { toast(def.name + ' unlocks at ' + def.unlock + ' people'); return; }
      ui.tool = ui.tool === t && t !== 'hand' ? 'hand' : t;
      ui.selected = null;
      refreshToolbar();
    });
    bar.append(btn);
    drawToolIcon(btn.querySelector('canvas'), t);
  }

  function drawToolIcon(cv, t) {
    const c = cv.getContext('2d');
    if (t === 'hand' || t === 'remove') {
      c.strokeStyle = t === 'remove' ? '#ff7b7b' : '#e8e4ef'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath();
      if (t === 'remove') { c.moveTo(16, 16); c.lineTo(40, 40); c.moveTo(40, 16); c.lineTo(16, 40); }
      else { c.moveTo(28, 10); c.lineTo(28, 46); c.moveTo(10, 28); c.lineTo(46, 28); }
      c.stroke();
      return;
    }
    // Reuse the board renderer on a tiny fake state
    const fake = { time: 0, cam: { x: 0.5, y: 0.5, zoom: 44 / C.tile }, buildings: [], tiles: new Map(), pop: 99 };
    R.drawIcon(c, fake, { type: t, x: 0, y: 0, w: 1, h: 1, dir: 1, inp: {}, out: [], hp: 1, maxHp: 1, tier: 1, residents: 4, short: 0, aim: -Math.PI / 4, status: '' });
  }

  function refreshToolbar() {
    for (const btn of bar.children) {
      const t = btn.dataset.tool, def = C.buildings[t];
      btn.classList.toggle('on', ui.tool === t);
      btn.classList.toggle('locked', !!def && s.pop < def.unlock);
    }
    $('rotate').hidden = !['belt', 'splitter', 'mine', 'smelter', 'lumber', 'farm', 'armory', 'workshop'].includes(ui.tool);
    $('rotate').querySelector('.arrow').textContent = D.arrow[ui.dir];
    info();
  }
  $('rotate').addEventListener('click', () => { ui.dir = (ui.dir + 1) % 4; refreshToolbar(); });

  // ---------- Info line ----------
  function goal() {
    const has = (t, f) => s.buildings.some((b) => b.type === t && (!f || f(b)));
    const d = s.stats.delivered;
    if (!has('farm')) return 'Build a Farm on grass, pointed at the town hall or a Depot. Huts eat food.';
    if (!d.food) return 'Food has to reach the town. Point the farm into the hall, or belt it to a Depot.';
    if (!has('lumber')) return 'Build Lumber on forest and get the wood to town. Houses want wood.';
    if (!has('mine', (b) => b.ore === 'iron') || !has('mine', (b) => b.ore === 'coal')) return 'Mine iron (blue-grey) and coal (black). Two fingers pan the map to find them.';
    if (!has('smelter')) return 'A Smelter needs both iron ore and coal. Belt both into it.';
    if (!d.plate) return 'Belt plates into the town. Everything you build is paid from town stock.';
    if (s.pop < 8) return 'Build more Houses inside the circle. A fed house fills up and grows.';
    if (!has('turret')) return 'Raids come every few minutes. Build an Armory for ammo and some Turrets.';
    if (s.pop < 10) return 'At 10 people the Workshop unlocks. Its tools turn Houses into Manors.';
    if (!has('hut', (b) => b.tier === 2)) return 'Feed houses food, wood and tools to grow Manors.';
    return 'Keep growing. Town circle widens as population rises.';
  }
  function info() {
    const t = ui.tool, def = C.buildings[t];
    let text;
    if (t === 'hand') text = goal();
    else if (t === 'remove') text = 'Tap or drag to remove. You get the full cost back.';
    else text = `<b>${def.name}</b> · ${W.costText(def.cost)}${def.workers ? ' · ' + def.workers + ' worker' + (def.workers > 1 ? 's' : '') : ''}. ${def.desc}`;
    $('info').innerHTML = text;
  }

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; ui.toastTimer = 2.2; }

  // ---------- Inspect panel ----------
  function select(b) {
    ui.selected = b;
    renderPanel();
  }
  function renderPanel() {
    const b = ui.selected, p = $('panel');
    if (!b || !s.buildings.includes(b)) { p.hidden = true; ui.selected = null; return; }
    p.hidden = false;
    const def = C.buildings[b.type];
    let title, rows = [];
    if (b.type === 'hall') {
      title = 'Town hall';
      const tiers = [0, 0, 0];
      for (const h of s.buildings) if (h.type === 'hut') tiers[h.tier]++;
      rows.push(['People', s.pop], ['Workers in use', s.workersUsed + ' / ' + s.pop]);
      if (s.workersWanted > s.workersUsed) rows.push(['Machines without workers', s.workersWanted - s.workersUsed]);
      rows.push(['Huts · Houses · Manors', tiers.join(' · ')]);
      const dem = DF.town.demand(s);
      for (const [k, v] of Object.entries(dem)) rows.push([C.items[k].name + ' eaten / min', v + ' (have ' + Math.floor(s.stock[k]) + ')']);
    } else if (b.type === 'hut') {
      const tier = C.tiers[b.tier], next = C.tiers[b.tier + 1];
      title = tier.name;
      rows.push(['Residents', b.residents + ' / ' + tier.residents]);
      rows.push(['Wants / min', Object.entries(tier.needs).map(([k, v]) => v + ' ' + C.items[k].name.toLowerCase()).join(', ')]);
      rows.push(['Status', b.short ? 'Short on supplies' : b.residents < tier.residents ? 'Filling up' : 'Content']);
      if (next) rows.push(['Becomes ' + next.name + ' with', Object.keys(next.needs).map((k) => C.items[k].name.toLowerCase()).join(', ')]);
    } else {
      title = def.name;
      const st = { ok: 'Working', idle: 'Waiting for input', blocked: 'Output blocked', noworkers: 'No free workers', noammo: 'No ammo in stock', firing: 'Firing' }[b.status];
      if (st) rows.push(['Status', st]);
      if (b.type === 'depot') rows.push(['Status', W.inTown(s, b.x, b.y) ? 'Sending to town' : 'Outside the town circle']);
      const inp = Object.entries(b.inp).filter(([, v]) => v > 0);
      if (DF.sim.ACCEPTS[b.type]) rows.push(['Holding', inp.length ? inp.map(([k, v]) => v + ' ' + C.items[k].name.toLowerCase()).join(', ') : 'nothing']);
      if (b.ore) rows.push(['Digging', C.items[b.ore].name]);
      rows.push(['Health', Math.ceil(b.hp) + ' / ' + b.maxHp]);
      rows.push(['', def.desc]);
    }
    $('pTitle').textContent = title;
    $('pRows').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const rotatable = def && !['hut', 'depot', 'turret', 'wall'].includes(b.type);
    $('pRotate').hidden = !rotatable;
    $('pRemove').hidden = b.type === 'hall';
  }
  $('pRotate').addEventListener('click', () => { if (ui.selected) { ui.selected.dir = (ui.selected.dir + 1) % 4; renderPanel(); } });
  $('pRemove').addEventListener('click', () => { if (ui.selected) { W.removeBuilding(s, ui.selected, true); ui.selected = null; renderPanel(); } });
  $('pClose').addEventListener('click', () => { ui.selected = null; renderPanel(); });

  // ---------- Touch controls ----------
  // One finger: builds with a tool selected, pans with Move. Two fingers: always pan and pinch-zoom.
  const canvas = $('board');
  const pointers = new Map();
  let gesture = null, pinch = null;
  const DRAG_TOOLS = { belt: true, wall: true, remove: true };

  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      // Second finger: undo a stroke that only just started, then pinch.
      if (gesture && gesture.placed.length && performance.now() - gesture.t0 < 400) {
        for (const b of gesture.placed) if (s.buildings.includes(b)) W.removeBuilding(s, b, true);
      }
      gesture = null; ui.ghost = null;
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: s.cam.zoom, mid: R.toWorld(s, (a.x + b.x) / 2, (a.y + b.y) / 2) };
      return;
    }
    if (pointers.size > 2) return;
    const p = local(e);
    const pan = ui.tool === 'hand' || e.button === 1 || e.button === 2;
    gesture = { pan, start: p, last: p, cell: R.tileAt(s, p.x, p.y), lastCell: null, moved: false, placed: [], t0: performance.now(), pos: p };
    if (!pan && !DRAG_TOOLS[ui.tool]) ui.ghost = { type: ui.tool, x: gesture.cell.x, y: gesture.cell.y, dir: ui.dir };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      s.cam.zoom = Math.max(C.zoomMin, Math.min(C.zoomMax, pinch.z0 * d / pinch.d0));
      // Keep the world point that started under the fingers under them.
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const t = C.tile * s.cam.zoom;
      s.cam.x = pinch.mid.x - (m.x - R.view.w / 2) / t;
      s.cam.y = pinch.mid.y - (m.y - R.view.h / 2) / t;
      return;
    }
    const g = gesture;
    if (!g) return;
    g.pos = p;
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 8) g.moved = true;
    if (g.pan) {
      const t = C.tile * s.cam.zoom;
      s.cam.x -= (p.x - g.last.x) / t; s.cam.y -= (p.y - g.last.y) / t;
      g.last = p;
      return;
    }
    strokeTo(g, p);
  });

  function strokeTo(g, p) {
    const c = R.tileAt(s, p.x, p.y);
    if (!DRAG_TOOLS[ui.tool]) { ui.ghost = { type: ui.tool, x: c.x, y: c.y, dir: ui.dir }; return; }
    if (!g.lastCell) {
      if (c.x === g.cell.x && c.y === g.cell.y) return;
      g.lastCell = g.cell;
      if (ui.tool !== 'belt') strokeCell(g, g.cell.x, g.cell.y, ui.dir);
    }
    // Walk one tile at a time so fast swipes leave no gaps.
    let guard = 0;
    while ((c.x !== g.lastCell.x || c.y !== g.lastCell.y) && guard++ < 60) {
      const sx = Math.sign(c.x - g.lastCell.x), sy = sx ? 0 : Math.sign(c.y - g.lastCell.y);
      const dir = sx > 0 ? 1 : sx < 0 ? 3 : sy > 0 ? 2 : 0;
      if (ui.tool === 'belt') {
        const prev = W.at(s, g.lastCell.x, g.lastCell.y);
        if (prev && prev.type === 'belt') prev.dir = dir;
        else strokeCell(g, g.lastCell.x, g.lastCell.y, dir);
        ui.dir = dir;
      }
      g.lastCell = { x: g.lastCell.x + sx, y: g.lastCell.y + sy };
      strokeCell(g, g.lastCell.x, g.lastCell.y, dir);
    }
  }

  function strokeCell(g, x, y, dir) {
    const b = W.at(s, x, y);
    if (ui.tool === 'remove') { if (b && b.type !== 'hall') W.removeBuilding(s, b, true); return; }
    if (b) { if (b.type === 'belt' && ui.tool === 'belt') b.dir = dir; return; }
    const err = W.place(s, ui.tool, x, y, dir);
    if (!err) g.placed.push(W.at(s, x, y));
    else if (err.startsWith('Needs') && !g.warned) { toast(err); g.warned = true; }
  }

  function endGesture(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const g = gesture;
    if (!g || pointers.size > 0) { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    const ghost = ui.ghost; ui.ghost = null;
    if (e.type === 'pointercancel') return;
    if (g.pan) {
      if (!g.moved) { const c = R.tileAt(s, g.start.x, g.start.y); select(W.at(s, c.x, c.y)); }
      return;
    }
    if (DRAG_TOOLS[ui.tool]) {
      if (g.lastCell) return; // it was a stroke
      tapTool(g.cell.x, g.cell.y);
      return;
    }
    if (ghost) tapTool(ghost.x, ghost.y);
  }
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function tapTool(x, y) {
    const b = W.at(s, x, y);
    if (ui.tool === 'remove') { if (b && b.type !== 'hall') W.removeBuilding(s, b, true); return; }
    if (b) {
      if (b.type === ui.tool && !['hut', 'depot', 'turret', 'wall'].includes(b.type)) { b.dir = (b.dir + 1) % 4; ui.dir = b.dir; refreshToolbar(); }
      else select(b);
      return;
    }
    const err = W.place(s, ui.tool, x, y, ui.dir);
    if (err) toast(err);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const before = R.toWorld(s, p.x, p.y);
    s.cam.zoom = Math.max(C.zoomMin, Math.min(C.zoomMax, s.cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    const after = R.toWorld(s, p.x, p.y);
    s.cam.x += before.x - after.x; s.cam.y += before.y - after.y;
  }, { passive: false });

  // Drag near the screen edge while building and the map scrolls along.
  function edgePan(dt) {
    const g = gesture;
    if (!g || g.pan || pinch || !g.moved) return;
    const m = 40, v = 9 / s.cam.zoom; // tiles per second at the edge
    let vx = 0, vy = 0;
    if (g.pos.x < m) vx = -1; else if (g.pos.x > R.view.w - m) vx = 1;
    if (g.pos.y < m) vy = -1; else if (g.pos.y > R.view.h - m) vy = 1;
    if (!vx && !vy) return;
    s.cam.x += vx * v * dt; s.cam.y += vy * v * dt;
    strokeTo(g, g.pos);
  }

  // ---------- Menu ----------
  $('menuBtn').addEventListener('click', () => { $('menu').hidden = false; $('confirmNew').hidden = true; });
  $('mResume').addEventListener('click', () => { $('menu').hidden = true; });
  $('mHome').addEventListener('click', () => { s.cam.x = 0.5; s.cam.y = 0.5; s.cam.zoom = 1; $('menu').hidden = true; });
  $('mNew').addEventListener('click', () => { $('confirmNew').hidden = false; });
  $('mNewYes').addEventListener('click', () => { s = W.newGame(); ui.selected = null; save(); $('menu').hidden = true; refreshToolbar(); });
  $('intro').querySelector('button').addEventListener('click', () => { $('intro').hidden = true; });

  // ---------- HUD ----------
  let lastHud = '';
  function hud() {
    const st = s.stock;
    const free = s.pop - s.workersUsed;
    const raid = s.nextRaid > 0 ? fmtTime(s.nextRaid) : 'now';
    const vals = [s.pop, free, Math.floor(st.food), Math.floor(st.wood), Math.floor(st.plate), Math.floor(st.tools), Math.floor(st.ammo), raid, s.enemies.length];
    const key = vals.join('|');
    if (key === lastHud) return;
    lastHud = key;
    $('pop').textContent = s.pop;
    $('free').textContent = free + ' free';
    $('food').textContent = vals[2];
    $('wood').textContent = vals[3];
    $('plate').textContent = vals[4];
    $('tools2').textContent = vals[5];
    $('ammo').textContent = vals[6];
    $('raid').textContent = s.enemies.length ? s.enemies.length + ' raiders' : 'Raid in ' + raid;
    $('raid').classList.toggle('hot', s.enemies.length > 0 || s.nextRaid < C.raids.warn);
    $('c-food').classList.toggle('low', st.food < 5);
    if (ui.selected) renderPanel();
  }
  function fmtTime(t) { const m = Math.floor(t / 60), sec = Math.floor(t % 60); return m + ':' + String(sec).padStart(2, '0'); }

  // ---------- Loop ----------
  let lastUnlockPop = s.pop;
  function step(dt) {
    s.time += dt;
    DF.sim.tick(s, dt);
    DF.raids.tick(s, dt, toast);
    s.townClock += dt;
    if (s.townClock >= C.townTick) {
      s.townClock = 0;
      for (const ev of DF.town.tick(s)) s.effects.push({ kind: 'text', x: ev.b.x + 0.5, y: ev.b.y, text: ev.text, color: ev.color, t: 0, life: 1.6 });
      const newly = Object.values(C.buildings).filter((d) => d.unlock > lastUnlockPop && d.unlock <= s.pop);
      if (newly.length) { toast('Unlocked: ' + newly.map((d) => d.name).join(', ')); refreshToolbar(); }
      lastUnlockPop = Math.max(lastUnlockPop, s.pop);
      refreshToolbar();
    }
    for (const f of s.effects) f.t += dt;
    s.effects = s.effects.filter((f) => f.t < f.life);
  }

  let last = performance.now(), saveClock = 0;
  function loop(now) {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (ui.toastTimer > 0) { ui.toastTimer -= dt; if (ui.toastTimer <= 0) $('toast').hidden = true; }
    edgePan(dt);
    saveClock += dt;
    if (saveClock >= C.saveEvery) { saveClock = 0; save(); }
    if (!$('menu').hidden || !$('intro').hidden) dt = 0; // paused behind overlays
    while (dt > 0) { const h = Math.min(dt, 1 / 30); step(h); dt -= h; }
    R.frame(s, ui);
    hud();
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('resize', () => R.resize());
  R.init(canvas);
  refreshToolbar();
  if (s.time > 5) $('intro').hidden = true;
  requestAnimationFrame(loop);

  DF.debug = { get state() { return s; }, set state(v) { s = v; }, save, load, step };
})();
