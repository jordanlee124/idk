// Canvas drawing. Reads state, never changes game rules.
DF.render = (function () {
  const C = DF.CONFIG;
  const D = DF.DIRS;
  const COL = {
    bg: '#0d0b14',
    waste: '#2a1622', wasteDot: '#3d2030', wasteFar: '#1c0f18',
    ground: '#141a1f', groundLine: '#1c252b',
    wall: '#4a4552', wallHi: '#625c6e', wallLo: '#332f3a',
    ore: '#d9823b', oreGlow: 'rgba(240,166,75,0.35)',
    plate: '#c9d3dd', ammo: '#ffd25e',
    belt: '#242a32', beltEdge: '#323a45', chevron: '#3f4958',
    mine: '#5f6f84', smelter: '#7a4434', workshop: '#3f6352', machineEdge: '#0c0f12',
    gun: '#a3afbf', mortar: '#8b9670',
    crawler: '#9b5de5', swarmer: '#7bd389', brute: '#e05252',
    hp: '#7bd389', hpBg: 'rgba(0,0,0,0.6)',
    text: '#e8e4ef', warn: '#ff5d5d', valid: 'rgba(240,166,75,0.55)',
  };

  let canvas, ctx, dpr = 1;
  const view = { cell: 40, ox: 0, oy: 0, w: 0, h: 0 };
  const speckles = [];

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
    for (let i = 0; i < 90; i++) {
      speckles.push({ x: Math.random() * C.cols, y: Math.random() * C.wallRow, r: 0.02 + Math.random() * 0.05 });
    }
    resize();
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    view.w = r.width; view.h = r.height;
    view.cell = Math.floor(Math.min(r.width / C.cols, r.height / C.rows));
    view.ox = Math.floor((r.width - view.cell * C.cols) / 2);
    view.oy = Math.floor((r.height - view.cell * C.rows) / 2);
  }

  function cellAt(px, py) {
    const x = Math.floor((px - view.ox) / view.cell);
    const y = Math.floor((py - view.oy) / view.cell);
    return { x, y };
  }

  const P = (v) => v * view.cell; // grid units to pixels (relative to origin)

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTerrain(s) {
    const c = view.cell;
    // Wasteland: darker toward the horizon
    const g = ctx.createLinearGradient(0, 0, 0, P(C.wallRow));
    g.addColorStop(0, COL.wasteFar);
    g.addColorStop(1, COL.waste);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, P(C.cols), P(C.wallRow));
    ctx.fillStyle = COL.wasteDot;
    for (const sp of speckles) { ctx.beginPath(); ctx.arc(P(sp.x), P(sp.y), P(sp.r), 0, 7); ctx.fill(); }

    // Base ground
    ctx.fillStyle = COL.ground;
    ctx.fillRect(0, P(C.wallRow + 1), P(C.cols), P(C.rows - C.wallRow - 1));
    ctx.strokeStyle = COL.groundLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= C.cols; x++) { ctx.moveTo(x * c + 0.5, P(C.wallRow + 1)); ctx.lineTo(x * c + 0.5, P(C.rows)); }
    for (let y = C.wallRow + 1; y <= C.rows; y++) { ctx.moveTo(0, y * c + 0.5); ctx.lineTo(P(C.cols), y * c + 0.5); }
    ctx.stroke();

    // Wall
    const wy = P(C.wallRow);
    ctx.fillStyle = COL.wall;
    ctx.fillRect(0, wy, P(C.cols), c);
    ctx.fillStyle = COL.wallHi;
    ctx.fillRect(0, wy, P(C.cols), c * 0.12);
    ctx.fillStyle = COL.wallLo;
    for (let x = 0; x < C.cols; x++) {
      ctx.fillRect(x * c, wy + c * 0.5, c, 1.5);
      ctx.fillRect(x * c + (x % 2 ? c * 0.25 : c * 0.75), wy + c * 0.12, 1.5, c * 0.38);
      ctx.fillRect(x * c + (x % 2 ? c * 0.75 : c * 0.25), wy + c * 0.5, 1.5, c * 0.5);
    }
    // Crenellations facing the wasteland
    ctx.fillStyle = COL.wallHi;
    for (let x = 0; x < C.cols * 2; x++) if (x % 2 === 0) ctx.fillRect(x * c / 2 + c * 0.1, wy - c * 0.12, c * 0.3, c * 0.12);

    // Ore deposits
    for (const key of s.deposits) {
      const [x, y] = key.split(',').map(Number);
      const cx = P(x + 0.5), cy = P(y + 0.5);
      const pulse = 0.75 + 0.25 * Math.sin(s.time * 2 + x);
      ctx.fillStyle = COL.oreGlow;
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.45, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.ore;
      crystal(cx - c * 0.15, cy + c * 0.1, c * 0.16);
      crystal(cx + c * 0.12, cy - c * 0.05, c * 0.2);
      crystal(cx + c * 0.02, cy + c * 0.2, c * 0.12);
    }
  }

  function crystal(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.4);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r * 0.6);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawItem(kind, x, y) {
    const c = view.cell;
    if (kind === 'ore') {
      ctx.fillStyle = COL.ore;
      ctx.beginPath(); ctx.arc(x, y, c * 0.13, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(x + c * 0.04, y + c * 0.03, c * 0.05, 0, 7); ctx.fill();
    } else if (kind === 'plate') {
      ctx.fillStyle = COL.plate;
      ctx.fillRect(x - c * 0.13, y - c * 0.09, c * 0.26, c * 0.18);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - c * 0.13, y - c * 0.09, c * 0.26, c * 0.04);
    } else {
      ctx.fillStyle = COL.ammo;
      rrect(x - c * 0.06, y - c * 0.13, c * 0.12, c * 0.26, c * 0.06); ctx.fill();
      ctx.fillStyle = '#b8862b';
      ctx.fillRect(x - c * 0.06, y + c * 0.05, c * 0.12, c * 0.08);
    }
  }

  function arrowTip(cx, cy, dir, size, color) {
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir];
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size * 0.5, -size * 0.7); ctx.lineTo(-size * 0.5, size * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBelt(s, b) {
    const c = view.cell, x = P(b.x), y = P(b.y);
    ctx.fillStyle = COL.belt;
    ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
    // Moving chevrons along the belt direction
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y + 1, c - 2, c - 2); ctx.clip();
    ctx.translate(x + c / 2, y + c / 2);
    ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][b.dir]);
    ctx.strokeStyle = COL.chevron;
    ctx.lineWidth = Math.max(2, c * 0.07);
    const off = (s.time * C.beltSpeed * c) % (c / 2);
    for (let i = -2; i <= 2; i++) {
      const px = i * c / 2 + off;
      ctx.beginPath();
      ctx.moveTo(px - c * 0.1, -c * 0.22); ctx.lineTo(px + c * 0.08, 0); ctx.lineTo(px - c * 0.1, c * 0.22);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = COL.beltEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, c - 3, c - 3);
  }

  function drawBeltItem(b) {
    if (!b.item) return;
    const t = b.item.p - 0.5;
    drawItem(b.item.k, P(b.x + 0.5 + D.dx[b.dir] * t), P(b.y + 0.5 + D.dy[b.dir] * t));
  }

  function drawMachine(s, b) {
    const c = view.cell, x = P(b.x), y = P(b.y), cx = x + c / 2, cy = y + c / 2;
    const pad = c * 0.08;
    ctx.fillStyle = COL[b.type];
    rrect(x + pad, y + pad, c - pad * 2, c - pad * 2, c * 0.14); ctx.fill();
    ctx.strokeStyle = COL.machineEdge; ctx.lineWidth = 2; ctx.stroke();
    const working = b.status === 'ok';

    if (b.type === 'mine') {
      // Drill head that spins while working
      ctx.save(); ctx.translate(cx, cy);
      if (working) ctx.rotate(s.time * 6);
      ctx.fillStyle = '#c3ccd8';
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c * 0.08, -c * 0.26); ctx.lineTo(-c * 0.08, -c * 0.26); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.arc(0, 0, c * 0.08, 0, 7); ctx.fill();
      ctx.restore();
    } else if (b.type === 'smelter') {
      ctx.fillStyle = '#2b1712';
      rrect(cx - c * 0.2, cy - c * 0.1, c * 0.4, c * 0.26, c * 0.05); ctx.fill();
      if (working) {
        const f = 0.6 + 0.4 * Math.sin(s.time * 14 + b.x);
        ctx.fillStyle = `rgba(255,123,58,${f})`;
        ctx.beginPath(); ctx.arc(cx, cy + c * 0.04, c * 0.12, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#5a3126';
      ctx.fillRect(cx + c * 0.08, cy - c * 0.32, c * 0.1, c * 0.18);
    } else if (b.type === 'workshop') {
      ctx.save(); ctx.translate(cx, cy);
      if (working) ctx.rotate(s.time * 2);
      ctx.fillStyle = '#9cc7ae';
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-c * 0.04, -c * 0.25, c * 0.08, c * 0.1); }
      ctx.beginPath(); ctx.arc(0, 0, c * 0.17, 0, 7); ctx.fill();
      ctx.fillStyle = COL.workshop; ctx.beginPath(); ctx.arc(0, 0, c * 0.07, 0, 7); ctx.fill();
      ctx.restore();
    }

    // Output arrow on the edge it pushes to
    arrowTip(cx + D.dx[b.dir] * c * 0.36, cy + D.dy[b.dir] * c * 0.36, b.dir, c * 0.09, '#ffffff');

    // Progress bar
    const period = C.buildings[b.type].period;
    if (b.prog > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + pad * 1.5, y + c - pad * 2.4, c - pad * 3, c * 0.06);
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(x + pad * 1.5, y + c - pad * 2.4, (c - pad * 3) * Math.min(1, b.prog / period), c * 0.06);
    }
    // Stall warning
    if (b.status === 'nofuel' || b.status === 'blocked') {
      ctx.fillStyle = b.status === 'nofuel' ? COL.warn : '#ffb347';
      ctx.beginPath(); ctx.arc(x + c - pad * 2, y + pad * 2, c * 0.1, 0, 7); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(c * 0.16)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x + c - pad * 2, y + pad * 2 + 1);
    }
  }

  function drawTurret(s, b) {
    const c = view.cell, cx = P(b.x + 0.5), cy = P(b.y + 0.55);
    ctx.fillStyle = '#1d1b22';
    ctx.beginPath(); ctx.arc(cx, cy, c * (b.type === 'mortar' ? 0.4 : 0.34), 0, 7); ctx.fill();
    ctx.fillStyle = COL[b.type];
    ctx.beginPath(); ctx.arc(cx, cy, c * (b.type === 'mortar' ? 0.32 : 0.26), 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.aim);
    ctx.fillStyle = '#2a2830';
    if (b.type === 'gun') {
      ctx.fillRect(0, -c * 0.06, c * 0.42, c * 0.12);
      if (b.flash > 0) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(c * 0.46, 0, c * 0.1, 0, 7); ctx.fill(); }
    } else {
      ctx.fillRect(0, -c * 0.11, c * 0.3, c * 0.22);
      if (b.flash > 0) { ctx.fillStyle = '#ffcf87'; ctx.beginPath(); ctx.arc(c * 0.34, 0, c * 0.14, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    if (b.status === 'noammo' && Math.floor(s.time * 3) % 2 === 0) {
      ctx.fillStyle = COL.warn;
      ctx.font = `bold ${Math.round(c * 0.2)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NO AMMO', cx, P(b.y) + c * 0.95);
    }
  }

  function drawEnemy(s, e) {
    const c = view.cell, x = P(e.x), y = P(e.y), r = P(e.def.r);
    const bob = Math.sin(s.time * 10 + e.seed) * r * 0.08;
    // Legs
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(1.5, r * 0.15);
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * r * 0.6, sw = Math.sin(s.time * 12 + e.seed + i) * r * 0.25;
      ctx.beginPath(); ctx.moveTo(x + lx, y); ctx.lineTo(x + lx * 1.5 - r * 0.5, y + r * 0.9 + sw); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + lx, y); ctx.lineTo(x + lx * 1.5 + r * 0.5, y + r * 0.9 - sw); ctx.stroke();
    }
    ctx.fillStyle = e.hit > 0 ? '#ffffff' : COL[e.type];
    ctx.beginPath(); ctx.ellipse(x, y + bob, r, r * 0.82, 0, 0, 7); ctx.fill();
    // Eyes glow at night
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y + r * 0.25 + bob, r * 0.13, 0, 7); ctx.arc(x + r * 0.3, y + r * 0.25 + bob, r * 0.13, 0, 7); ctx.fill();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = COL.hpBg; ctx.fillRect(x - r, y - r * 1.25, r * 2, Math.max(3, c * 0.05));
      ctx.fillStyle = COL.hp; ctx.fillRect(x - r, y - r * 1.25, r * 2 * (e.hp / e.maxHp), Math.max(3, c * 0.05));
    }
  }

  function drawEffects(s) {
    const c = view.cell;
    for (const sh of s.shells) {
      const k = sh.t / sh.life;
      const x = sh.x0 + (sh.x1 - sh.x0) * k, y = sh.y0 + (sh.y1 - sh.y0) * k;
      const arc = Math.sin(k * Math.PI) * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(P(x), P(y), c * 0.07, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffcf87';
      ctx.beginPath(); ctx.arc(P(x), P(y - arc), c * (0.08 + arc * 0.04), 0, 7); ctx.fill();
    }
    for (const f of s.effects) {
      const k = f.t / f.life;
      if (f.kind === 'tracer') {
        ctx.strokeStyle = `rgba(255,243,176,${1 - k})`; ctx.lineWidth = Math.max(1.5, c * 0.04);
        ctx.beginPath(); ctx.moveTo(P(f.x1), P(f.y1)); ctx.lineTo(P(f.x2), P(f.y2)); ctx.stroke();
      } else if (f.kind === 'boom') {
        ctx.fillStyle = `rgba(255,160,70,${0.55 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(P(f.x), P(f.y), P(f.r) * (0.4 + k * 0.6), 0, 7); ctx.fill();
      } else if (f.kind === 'burst') {
        ctx.fillStyle = COL[f.type];
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 6; i++) {
          const a = i * 1.047 + f.r, d = P(f.r) * (0.5 + k * 1.6);
          ctx.beginPath(); ctx.arc(P(f.x) + Math.cos(a) * d, P(f.y) + Math.sin(a) * d, P(f.r) * 0.25 * (1 - k), 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === 'text') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.font = `600 ${Math.round(c * 0.24)}px "Chakra Petch", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.text, P(f.x), P(f.y) - k * c * 0.6);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawHints(s, ui) {
    if (s.phase !== 'day' || !ui.tool) return;
    const c = view.cell;
    ctx.strokeStyle = COL.valid;
    ctx.setLineDash([c * 0.12, c * 0.08]);
    ctx.lineWidth = 2;
    for (let y = 0; y < C.rows; y++) for (let x = 0; x < C.cols; x++) {
      if (ui.tool === 'remove' || ui.tool === 'belt') continue;
      if (DF.factory.placeError({ ...s, stock: { plates: 1e9 } }, ui.tool, x, y)) continue;
      ctx.strokeRect(P(x) + 3, P(y) + 3, c - 6, c - 6);
    }
    ctx.setLineDash([]);
    if (ui.tool === 'gun' || ui.tool === 'mortar') {
      // Show reach of existing turrets of this type
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, P(C.cols), P(C.rows)); ctx.clip();
      for (const b of s.buildings) {
        if (b.type !== ui.tool) continue;
        ctx.strokeStyle = 'rgba(255,210,94,0.25)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(P(b.x + 0.5), P(b.y + 0.5), P(C.buildings[b.type].range), Math.PI, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function frame(s, ui) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.translate(view.ox, view.oy);

    drawTerrain(s);
    for (const b of s.buildings) if (b.type === 'belt') drawBelt(s, b);
    for (const b of s.buildings) if (b.type === 'belt') drawBeltItem(b);
    for (const b of s.buildings) {
      if (DF.factory.isTurret(b.type)) drawTurret(s, b);
      else if (b.type !== 'belt') drawMachine(s, b);
    }
    drawHints(s, ui);

    // Night falls: tint everything, then draw creatures and fire on top.
    const dark = s.darkness || 0;
    if (dark > 0) {
      ctx.fillStyle = `rgba(8,10,40,${0.42 * dark})`;
      ctx.fillRect(-view.ox, -view.oy, view.w, view.h);
    }
    for (const e of s.enemies) drawEnemy(s, e);
    drawEffects(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { init, resize, frame, cellAt, view };
})();
