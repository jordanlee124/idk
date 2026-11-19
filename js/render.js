// Canvas drawing and the camera. Reads state, never changes game rules.
DF.render = (function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;
  const W = DF.world;
  const COL = {
    bg: '#10140f',
    grass: ['#26331f', '#283621', '#24301d', '#2a3823'],
    forest: '#1b2a18', tree: '#33532b', treeHi: '#40683a',
    iron: '#4c5a6b', ironHi: '#8fa4c0',
    coal: '#1f1f22', coalHi: '#3a3a40',
    rock: '#47443f', rockHi: '#5b5751',
    belt: '#2a2f36', chevron: '#4a5461', beltEdge: '#3a414c',
    machine: { mine: '#5f6f84', smelter: '#7a4434', workshop: '#3f6352', armory: '#6b5a2e', lumber: '#6b4a2a',
      farm: '#5b6b2a', depot: '#4a4058', splitter: '#3d4a5c', turret: '#8a96a6', wall: '#6a6460' },
    edge: '#0b0d0a',
    town: 'rgba(240,166,75,0.5)',
    warn: '#ff5d5d', valid: 'rgba(240,166,75,0.75)', invalid: 'rgba(255,93,93,0.75)',
  };

  let canvas, ctx, dpr = 1;
  const view = { w: 0, h: 0 };

  function init(c) { canvas = c; ctx = c.getContext('2d'); resize(); }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    view.w = r.width; view.h = r.height;
  }

  // ---------- Camera ----------
  function T(s) { return C.tile * s.cam.zoom; }
  function toScreen(s, wx, wy) { return { x: (wx - s.cam.x) * T(s) + view.w / 2, y: (wy - s.cam.y) * T(s) + view.h / 2 }; }
  function toWorld(s, sx, sy) { return { x: (sx - view.w / 2) / T(s) + s.cam.x, y: (sy - view.h / 2) / T(s) + s.cam.y }; }
  function tileAt(s, sx, sy) { const p = toWorld(s, sx, sy); return { x: Math.floor(p.x), y: Math.floor(p.y) }; }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hash(x, y) { let h = Math.imul(x * 73856093 ^ y * 19349663, 2654435761); return ((h >>> 0) % 1000) / 1000; }

  function drawTerrain(s, x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const kind = W.terrain(s, x, y);
      const px = (x - s.cam.x) * t + view.w / 2, py = (y - s.cam.y) * t + view.h / 2;
      const h = hash(x, y);
      ctx.fillStyle = kind === 'forest' ? COL.forest : kind === 'rock' ? COL.rock : COL.grass[Math.floor(h * 4)];
      ctx.fillRect(px, py, t + 0.5, t + 0.5);
      if (kind === 'forest') {
        ctx.fillStyle = COL.tree;
        ctx.beginPath(); ctx.arc(px + t * (0.3 + h * 0.2), py + t * 0.35, t * 0.26, 0, 7); ctx.fill();
        ctx.fillStyle = COL.treeHi;
        ctx.beginPath(); ctx.arc(px + t * 0.68, py + t * (0.62 + h * 0.1), t * 0.22, 0, 7); ctx.fill();
      } else if (kind === 'iron' || kind === 'coal') {
        ctx.fillStyle = kind === 'iron' ? COL.iron : COL.coal;
        for (let i = 0; i < 3; i++) {
          const ox = hash(x + i * 7, y) * 0.6 + 0.2, oy = hash(x, y + i * 5) * 0.6 + 0.2;
          ctx.beginPath(); ctx.arc(px + ox * t, py + oy * t, t * (0.14 + 0.05 * i), 0, 7); ctx.fill();
        }
        ctx.fillStyle = kind === 'iron' ? COL.ironHi : COL.coalHi;
        ctx.beginPath(); ctx.arc(px + t * 0.45, py + t * 0.42, t * 0.06, 0, 7); ctx.fill();
      } else if (kind === 'rock') {
        ctx.fillStyle = COL.rockHi;
        ctx.beginPath(); ctx.moveTo(px + t * 0.2, py + t * 0.8); ctx.lineTo(px + t * 0.5, py + t * 0.2); ctx.lineTo(px + t * 0.85, py + t * 0.8); ctx.closePath(); ctx.fill();
      }
    }
    // Faint grid when zoomed in enough to build
    if (t >= 22) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { const px = Math.round((x - s.cam.x) * t + view.w / 2) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, view.h); }
      for (let y = y0; y <= y1 + 1; y++) { const py = Math.round((y - s.cam.y) * t + view.h / 2) + 0.5; ctx.moveTo(0, py); ctx.lineTo(view.w, py); }
      ctx.stroke();
    }
  }

  function drawItem(kind, x, y, t) {
    const c = C.items[kind].color;
    ctx.fillStyle = c;
    if (kind === 'plate') { ctx.fillRect(x - t * 0.13, y - t * 0.09, t * 0.26, t * 0.18); }
    else if (kind === 'ammo') { rrect(x - t * 0.06, y - t * 0.12, t * 0.12, t * 0.24, t * 0.05); ctx.fill(); }
    else if (kind === 'tools') { ctx.fillRect(x - t * 0.12, y - t * 0.03, t * 0.24, t * 0.06); ctx.fillRect(x + t * 0.05, y - t * 0.1, t * 0.07, t * 0.2); }
    else if (kind === 'wood') { rrect(x - t * 0.14, y - t * 0.07, t * 0.28, t * 0.14, t * 0.06); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(x, y, t * 0.12, 0, 7); ctx.fill(); }
    if (kind === 'coal') { ctx.strokeStyle = '#55555c'; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function arrowTip(cx, cy, dir, size, color) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir]);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size * 0.5, -size * 0.7); ctx.lineTo(-size * 0.5, size * 0.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBelt(s, b, px, py, t, splitter) {
    ctx.fillStyle = splitter ? COL.machine.splitter : COL.belt;
    ctx.fillRect(px + 1, py + 1, t - 2, t - 2);
    ctx.save(); ctx.beginPath(); ctx.rect(px + 1, py + 1, t - 2, t - 2); ctx.clip();
    ctx.translate(px + t / 2, py + t / 2); ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][b.dir]);
    ctx.strokeStyle = COL.chevron; ctx.lineWidth = Math.max(1.5, t * 0.07);
    const off = splitter ? 0 : (s.time * C.beltSpeed * t) % (t / 2);
    for (let i = -2; i <= 2; i++) {
      const x = i * t / 2 + off;
      ctx.beginPath(); ctx.moveTo(x - t * 0.1, -t * 0.22); ctx.lineTo(x + t * 0.08, 0); ctx.lineTo(x - t * 0.1, t * 0.22); ctx.stroke();
    }
    if (splitter) {
      ctx.fillStyle = '#c3ccd8';
      for (const a of [0, Math.PI / 2, -Math.PI / 2]) { ctx.save(); ctx.rotate(a); ctx.fillRect(t * 0.18, -t * 0.04, t * 0.22, t * 0.08); ctx.restore(); }
    }
    ctx.restore();
  }

  function drawBuilding(s, b, t) {
    const p = toScreen(s, b.x, b.y);
    const px = p.x, py = p.y, w = b.w * t, h = b.h * t, cx = px + w / 2, cy = py + h / 2;
    if (b.type === 'belt' || b.type === 'splitter') { drawBelt(s, b, px, py, t, b.type === 'splitter'); return; }
    if (b.type === 'hall') {
      ctx.fillStyle = '#5a4630'; rrect(px + 3, py + 6, w - 6, h - 8, t * 0.12); ctx.fill();
      ctx.fillStyle = '#8a3b2e';
      ctx.beginPath(); ctx.moveTo(px, py + h * 0.42); ctx.lineTo(cx, py - t * 0.1); ctx.lineTo(px + w, py + h * 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0a64b'; ctx.fillRect(cx - t * 0.18, py + h * 0.6, t * 0.36, h * 0.32);
      return;
    }
    if (b.type === 'hut') { drawHouse(s, b, px, py, t); return; }
    if (b.type === 'wall') {
      ctx.fillStyle = COL.machine.wall; ctx.fillRect(px + 1, py + 1, t - 2, t - 2);
      ctx.fillStyle = '#4e4945'; ctx.fillRect(px + 1, py + t * 0.48, t - 2, 2); ctx.fillRect(px + t * 0.5, py + 1, 2, t * 0.48);
      hpBar(b, px, py, t);
      return;
    }
    const pad = t * 0.07;
    ctx.fillStyle = b.hurt ? '#ffffff' : COL.machine[b.type];
    rrect(px + pad, py + pad, t - pad * 2, t - pad * 2, t * 0.15); ctx.fill();
    ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.5; ctx.stroke();
    const working = b.status === 'ok';
    const icon = { mine: drawMine, smelter: drawSmelter, workshop: drawGear, armory: drawArmory, lumber: drawLumber, farm: drawFarm, depot: drawDepot, turret: drawTurret }[b.type];
    if (icon) icon(s, b, cx, cy, t, working);
    if (b.type !== 'turret' && b.type !== 'depot') arrowTip(cx + D.dx[b.dir] * t * 0.36, cy + D.dy[b.dir] * t * 0.36, b.dir, t * 0.09, '#ffffff');
    const def = C.buildings[b.type];
    if (def.period && b.prog > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px + pad * 2, py + t - pad * 2.6, t - pad * 4, Math.max(2, t * 0.06));
      ctx.fillStyle = '#ffd25e'; ctx.fillRect(px + pad * 2, py + t - pad * 2.6, (t - pad * 4) * Math.min(1, b.prog / def.period), Math.max(2, t * 0.06));
    }
    const bad = b.status === 'noworkers' ? '#ff5d5d' : b.status === 'noammo' ? '#ff5d5d' : b.status === 'blocked' ? '#ffb347' :
      (b.type === 'depot' && !W.inTown(s, b.x, b.y)) ? '#ff5d5d' : null;
    if (bad && t >= 16) {
      ctx.fillStyle = bad; ctx.beginPath(); ctx.arc(px + t - pad * 2, py + pad * 2, t * 0.11, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = `bold ${Math.round(t * 0.17)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.status === 'noworkers' ? 'W' : '!', px + t - pad * 2, py + pad * 2 + 1);
    }
    hpBar(b, px, py, t);
  }

  function hpBar(b, px, py, t) {
    if (b.hp >= b.maxHp) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px + 2, py - 4, t - 4, 3);
    ctx.fillStyle = '#ff5d5d'; ctx.fillRect(px + 2, py - 4, (t - 4) * Math.max(0, b.hp / b.maxHp), 3);
  }

  function drawHouse(s, b, px, py, t) {
    const roof = ['#8a5a3a', '#9b3f33', '#4f5f9a'][b.tier];
    const body = ['#6b5a44', '#7d6a52', '#8c8270'][b.tier];
    const inset = t * (0.16 - b.tier * 0.05);
    ctx.fillStyle = b.hurt ? '#fff' : body;
    ctx.fillRect(px + inset, py + t * 0.42, t - inset * 2, t * 0.5);
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(px + inset - t * 0.06, py + t * 0.46); ctx.lineTo(px + t / 2, py + t * 0.1); ctx.lineTo(px + t - inset + t * 0.06, py + t * 0.46); ctx.closePath(); ctx.fill();
    // Lit windows show residents
    const cap = C.tiers[b.tier].residents;
    const lit = Math.round((b.residents / cap) * 2);
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i < lit ? '#ffd27a' : '#2b2520';
      ctx.fillRect(px + t * (0.3 + i * 0.28), py + t * 0.56, t * 0.14, t * 0.14);
    }
    if (b.short > 0 && t >= 16) {
      ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(px + t * 0.85, py + t * 0.18, t * 0.1, 0, 7); ctx.fill();
    }
    hpBar(b, px, py, t);
  }

  function drawMine(s, b, cx, cy, t, on) {
    ctx.save(); ctx.translate(cx, cy); if (on) ctx.rotate(s.time * 5);
    ctx.fillStyle = b.ore === 'coal' ? '#8b8b96' : '#c3ccd8';
    for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(t * 0.08, -t * 0.25); ctx.lineTo(-t * 0.08, -t * 0.25); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.arc(0, 0, t * 0.08, 0, 7); ctx.fill(); ctx.restore();
  }
  function drawSmelter(s, b, cx, cy, t, on) {
    ctx.fillStyle = '#2b1712'; rrect(cx - t * 0.2, cy - t * 0.1, t * 0.4, t * 0.26, t * 0.05); ctx.fill();
    if (on) { ctx.fillStyle = `rgba(255,123,58,${0.6 + 0.4 * Math.sin(s.time * 14 + b.x)})`; ctx.beginPath(); ctx.arc(cx, cy + t * 0.04, t * 0.11, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#5a3126'; ctx.fillRect(cx + t * 0.08, cy - t * 0.32, t * 0.1, t * 0.18);
  }
  function drawGear(s, b, cx, cy, t, on) {
    ctx.save(); ctx.translate(cx, cy); if (on) ctx.rotate(s.time * 2);
    ctx.fillStyle = '#9cc7ae';
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-t * 0.04, -t * 0.25, t * 0.08, t * 0.1); }
    ctx.beginPath(); ctx.arc(0, 0, t * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = COL.machine.workshop; ctx.beginPath(); ctx.arc(0, 0, t * 0.07, 0, 7); ctx.fill(); ctx.restore();
  }
  function drawArmory(s, b, cx, cy, t, on) {
    for (let i = -1; i <= 1; i++) { ctx.fillStyle = '#ffd25e'; rrect(cx + i * t * 0.14 - t * 0.05, cy - t * 0.14 + (on ? Math.sin(s.time * 8 + i) * 2 : 0), t * 0.1, t * 0.26, t * 0.05); ctx.fill(); }
  }
  function drawLumber(s, b, cx, cy, t, on) {
    ctx.fillStyle = '#a8743f'; ctx.fillRect(cx - t * 0.22, cy - t * 0.02, t * 0.44, t * 0.12); ctx.fillRect(cx - t * 0.18, cy - t * 0.16, t * 0.36, t * 0.12);
    ctx.save(); ctx.translate(cx + t * 0.12, cy - t * 0.12); if (on) ctx.rotate(Math.sin(s.time * 8) * 0.6);
    ctx.fillStyle = '#c3ccd8'; ctx.fillRect(-t * 0.02, -t * 0.16, t * 0.04, t * 0.16); ctx.fillRect(-t * 0.08, -t * 0.18, t * 0.12, t * 0.06); ctx.restore();
  }
  function drawFarm(s, b, cx, cy, t, on) {
    ctx.strokeStyle = '#9ccf5a'; ctx.lineWidth = Math.max(1.5, t * 0.05);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * t * 0.15, cy + t * 0.2); ctx.lineTo(cx + i * t * 0.15 + (on ? Math.sin(s.time * 2 + i) * 2 : 0), cy - t * 0.18); ctx.stroke(); }
  }
  function drawDepot(s, b, cx, cy, t) {
    ctx.fillStyle = '#a89cc0'; ctx.fillRect(cx - t * 0.2, cy - t * 0.14, t * 0.4, t * 0.3);
    ctx.fillStyle = COL.machine.depot; ctx.fillRect(cx - t * 0.2, cy - t * 0.02, t * 0.4, t * 0.04);
  }
  function drawTurret(s, b, cx, cy, t) {
    ctx.fillStyle = '#2a2830'; ctx.beginPath(); ctx.arc(cx, cy, t * 0.26, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.aim);
    ctx.fillStyle = '#c3ccd8'; ctx.fillRect(0, -t * 0.06, t * 0.42, t * 0.12);
    if (b.flash > 0) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(t * 0.46, 0, t * 0.1, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  function drawEnemy(s, e, t) {
    if (e.delay > 0) return;
    const p = toScreen(s, e.x, e.y), r = e.def.r * t;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1.5, r * 0.15);
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * r * 0.6, sw = Math.sin(s.time * 12 + e.seed + i) * r * 0.25;
      ctx.beginPath(); ctx.moveTo(p.x + lx, p.y); ctx.lineTo(p.x + lx * 1.5 - r * 0.5, p.y + r * 0.9 + sw); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x + lx, p.y); ctx.lineTo(p.x + lx * 1.5 + r * 0.5, p.y + r * 0.9 - sw); ctx.stroke();
    }
    ctx.fillStyle = e.hit > 0 ? '#fff' : e.def.color;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.82, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y + r * 0.2, r * 0.13, 0, 7); ctx.arc(p.x + r * 0.3, p.y + r * 0.2, r * 0.13, 0, 7); ctx.fill();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - r, p.y - r * 1.3, r * 2, 3);
      ctx.fillStyle = '#7bd389'; ctx.fillRect(p.x - r, p.y - r * 1.3, r * 2 * (e.hp / e.maxHp), 3);
    }
  }

  function drawEffects(s, t) {
    for (const f of s.effects) {
      const k = f.t / f.life;
      if (f.kind === 'tracer') {
        const a = toScreen(s, f.x1, f.y1), b = toScreen(s, f.x2, f.y2);
        ctx.strokeStyle = `rgba(255,243,176,${1 - k})`; ctx.lineWidth = Math.max(1.5, t * 0.05);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (f.kind === 'boom' || f.kind === 'burst') {
        const p = toScreen(s, f.x, f.y);
        ctx.fillStyle = f.kind === 'boom' ? `rgba(255,160,70,${0.6 * (1 - k)})` : f.color;
        ctx.globalAlpha = f.kind === 'burst' ? 1 - k : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, f.r * t * (0.4 + k), 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'text') {
        const p = toScreen(s, f.x, f.y);
        ctx.globalAlpha = Math.min(1, 2 * (1 - k)); ctx.fillStyle = f.color;
        ctx.font = `600 ${Math.max(11, Math.round(t * 0.36))}px "Chakra Petch", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, p.x, p.y - k * t * 0.8); ctx.fillText(f.text, p.x, p.y - k * t * 0.8);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawGhost(s, ui, t) {
    const g = ui.ghost;
    if (!g) return;
    const p = toScreen(s, g.x, g.y);
    const err = W.placeError(s, g.type, g.x, g.y);
    ctx.globalAlpha = 0.55;
    drawBuilding(s, { ...g, w: 1, h: 1, hp: 1, maxHp: 1, inp: {}, out: [], status: '', tier: 0, residents: 0, aim: -Math.PI / 2 }, t);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = err ? COL.invalid : COL.valid; ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 1, p.y + 1, t - 2, t - 2);
    if (g.type === 'turret') {
      ctx.strokeStyle = 'rgba(255,210,94,0.35)';
      ctx.beginPath(); ctx.arc(p.x + t / 2, p.y + t / 2, C.buildings.turret.range * t, 0, 7); ctx.stroke();
    }
  }

  // Edge marker toward an incoming raid, or toward live raiders that are off screen.
  function drawRaidMarker(s) {
    let wx, wy;
    const live = s.enemies.filter((e) => e.delay <= 0);
    if (live.length) {
      let best = null, bd = Infinity;
      for (const e of live) { const d = Math.hypot(e.x, e.y); if (d < bd) { bd = d; best = e; } }
      const p = toScreen(s, best.x, best.y);
      if (p.x > 0 && p.y > 0 && p.x < view.w && p.y < view.h) return;
      wx = best.x; wy = best.y;
    } else if (s.raidDir !== null) {
      wx = Math.cos(s.raidDir) * C.raids.distance; wy = Math.sin(s.raidDir) * C.raids.distance;
    } else return;
    const p = toScreen(s, wx, wy);
    const m = 26;
    const x = Math.max(m, Math.min(view.w - m, p.x)), y = Math.max(m, Math.min(view.h - m, p.y));
    const pulse = 0.6 + 0.4 * Math.sin(s.time * 6);
    ctx.fillStyle = `rgba(255,93,93,${pulse})`;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0a0a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 1);
  }

  function frame(s, ui) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, view.w, view.h);
    const t = T(s);
    const tl = toWorld(s, 0, 0), br = toWorld(s, view.w, view.h);
    const x0 = Math.floor(tl.x) - 1, y0 = Math.floor(tl.y) - 1, x1 = Math.ceil(br.x), y1 = Math.ceil(br.y);
    drawTerrain(s, x0, y0, x1, y1, t);

    // Town boundary
    const c = toScreen(s, 0, 0);
    ctx.strokeStyle = COL.town; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(c.x, c.y, W.townRadius(s) * t, 0, 7); ctx.stroke(); ctx.setLineDash([]);

    const visible = (b) => b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1;
    for (const b of s.buildings) if ((b.type === 'belt' || b.type === 'splitter') && visible(b)) drawBuilding(s, b, t);
    for (const b of s.buildings) {
      if ((b.type === 'belt' || b.type === 'splitter') && b.item && visible(b)) {
        const k = b.type === 'belt' ? b.item.p - 0.5 : 0;
        const p = toScreen(s, b.x + 0.5 + D.dx[b.dir] * k, b.y + 0.5 + D.dy[b.dir] * k);
        drawItem(b.item.k, p.x, p.y, t);
      }
    }
    for (const b of s.buildings) if (b.type !== 'belt' && b.type !== 'splitter' && visible(b)) drawBuilding(s, b, t);
    if (ui.selected) {
      const p = toScreen(s, ui.selected.x, ui.selected.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 1, p.y - 1, ui.selected.w * t + 2, ui.selected.h * t + 2);
      if (ui.selected.type === 'turret') {
        ctx.strokeStyle = 'rgba(255,210,94,0.35)';
        ctx.beginPath(); ctx.arc(p.x + t / 2, p.y + t / 2, C.buildings.turret.range * t, 0, 7); ctx.stroke();
      }
    }
    for (const e of s.enemies) drawEnemy(s, e, t);
    drawGhost(s, ui, t);
    drawEffects(s, t);
    drawRaidMarker(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Draw one building into a small canvas (toolbar icons).
  function drawIcon(c2, fake, b) {
    const oc = ctx, ow = view.w, oh = view.h;
    ctx = c2; view.w = c2.canvas.width; view.h = c2.canvas.height;
    drawBuilding(fake, b, C.tile * fake.cam.zoom);
    ctx = oc; view.w = ow; view.h = oh;
  }

  return { init, resize, frame, toWorld, toScreen, tileAt, view, drawIcon };
})();
