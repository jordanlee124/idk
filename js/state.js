// Game state and the stockpile/economy rules.
//
// The v2 market (colonists buying food, fuel and goods; prices reacting to supply)
// is meant to plug in here: give the stock a `market` object, call it from
// DF.economy.dawn(), and let deliverToWall() route goods to it.
DF.newGame = function () {
  const C = DF.CONFIG;
  const grid = [];
  for (let y = 0; y < C.rows; y++) grid.push(new Array(C.cols).fill(null));
  const deposits = new Set(C.deposits.map(([x, y]) => x + ',' + y));
  return {
    grid,
    deposits,
    buildings: [], // flat list in placement order, kept in sync with grid
    stock: { ...C.start },
    wallHp: C.wallMaxHp,
    day: 1, // 1-based; night N follows day N
    phase: 'title', // title | day | night | dawn | won | lost
    dayTimer: C.dayLength[0],
    time: 0,
    speed: 1,
    enemies: [],
    spawnQueue: [],
    nightClock: 0,
    shells: [],
    effects: [], // tracers, bursts, floating text
    stats: { kills: 0, ammoMade: 0, platesMade: 0, ammoFired: 0 },
    night: { kills: 0, fuelGained: 0, foodGained: 0, fuelBurned: 0, wallLost: 0 },
    delivered: { ammo: 0, plate: 0 },
    lostReason: '',
  };
};

DF.economy = {
  canAfford(s, cost) { return s.stock.plates >= cost; },
  spend(s, cost) { s.stock.plates -= cost; },
  refund(s, cost) { s.stock.plates += cost; },

  // An item arriving at the wall. Returns false if the wall refuses it (ore).
  deliverToWall(s, item) {
    if (item === 'ammo') { s.stock.ammo++; s.delivered.ammo++; return true; }
    if (item === 'plate') { s.stock.plates++; s.delivered.plate++; return true; }
    return false;
  },

  onKill(s, def) {
    s.stock.food += def.food;
    s.stock.fuel += def.fuel;
    s.night.foodGained += def.food;
    s.night.fuelGained += def.fuel;
  },

  // Runs once when a night is survived. Returns a report for the dawn screen.
  dawn(s) {
    const C = DF.CONFIG;
    const eaten = C.colonists;
    s.stock.food -= eaten;
    const heater = Math.min(C.heaterFuelPerNight, s.stock.fuel);
    s.stock.fuel -= heater;
    const repair = Math.min(C.wallRepairAtDawn, C.wallMaxHp - s.wallHp);
    s.wallHp += repair;
    return { eaten, heater, repair, starving: s.stock.food < 0 };
  },
};
