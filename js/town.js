// The town: stock, houses, population and workers.
//
// v2 hook: the colony market (prices that react to supply, happiness) belongs here.
// Houses already express demand per minute in tick(); a market would turn that
// demand plus the stock level into prices instead of a plain yes/no supply check.
DF.town = (function () {
  const C = DF.CONFIG;

  const PRIORITY = { farm: 0, lumber: 1, mine: 2, smelter: 2, armory: 3, workshop: 4 };

  function receive(s, item) {
    s.stock[item] = (s.stock[item] || 0) + 1;
    s.stats.delivered[item] = (s.stats.delivered[item] || 0) + 1;
  }

  // Recompute population and hand out workers in build order.
  function recount(s) {
    let pop = C.founders;
    for (const b of s.buildings) if (b.type === 'hut') pop += b.residents;
    let used = 0;
    // Food and wood get workers first, so a shrinking town doesn't starve itself.
    const order = s.buildings.slice().sort((a, b) => (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9));
    for (const b of order) {
      const w = (C.buildings[b.type] || {}).workers || 0;
      if (!w) { b.staffed = true; continue; }
      b.staffed = used + w <= pop;
      if (b.staffed) used += w;
    }
    s.pop = pop;
    s.workersUsed = used;
    s.workersWanted = s.buildings.reduce((n, b) => n + ((C.buildings[b.type] || {}).workers || 0), 0);
    s.stats.peakPop = Math.max(s.stats.peakPop, pop);
  }

  function has(s, needs, f) {
    return Object.entries(needs).every(([k, v]) => s.stock[k] >= v * f);
  }

  // Total demand per minute at the current tiers (for the town panel).
  function demand(s) {
    const out = {};
    for (const b of s.buildings) {
      if (b.type !== 'hut') continue;
      for (const [k, v] of Object.entries(C.tiers[b.tier].needs)) out[k] = (out[k] || 0) + v;
    }
    return out;
  }

  function tick(s) {
    const f = C.townTick / 60;
    const events = [];
    for (const b of s.buildings) {
      if (b.type !== 'hut') continue;
      const tier = C.tiers[b.tier];
      if (has(s, tier.needs, f)) {
        for (const [k, v] of Object.entries(tier.needs)) s.stock[k] -= v * f;
        b.short = 0;
        b.happy++;
        b.residents = Math.min(tier.residents, b.residents + 1);
        const next = C.tiers[b.tier + 1];
        if (next && b.happy >= C.upgradeAfter && b.residents >= tier.residents && has(s, next.needs, f * 2)) {
          b.tier++;
          b.happy = 0;
          events.push({ b, text: next.name + '!' , color: '#9ccf5a' });
        }
      } else {
        // Eat what there is, then count it as a short tick.
        for (const [k, v] of Object.entries(tier.needs)) s.stock[k] = Math.max(0, s.stock[k] - v * f);
        b.happy = 0;
        b.short++;
        if (b.short >= C.downgradeAfter) {
          b.short = 0;
          if (b.tier > 0 && s.stock.food > 0) {
            b.tier--;
            b.residents = Math.min(b.residents, C.tiers[b.tier].residents);
            events.push({ b, text: 'Moved down', color: '#ff8a5d' });
          } else if (b.residents > 0) {
            b.residents--;
            events.push({ b, text: 'Left town', color: '#ff5d5d' });
          }
        }
      }
    }
    recount(s);
    return events;
  }

  return { receive, recount, tick, demand };
})();
