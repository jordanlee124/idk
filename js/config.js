// Duskforge: all tunable numbers live here so balancing never means hunting through logic.
window.DF = window.DF || {};

DF.CONFIG = {
  cols: 9,
  rows: 12,
  wallRow: 4, // rows above this are the wasteland, rows below are the base

  // Ore deposits in the base, as [x, y]. Mines can only sit on these.
  deposits: [[1, 6], [7, 6], [4, 8], [1, 10], [7, 10]],

  start: { plates: 50, ammo: 12, fuel: 40, food: 10 },
  wallMaxHp: 150,
  wallRepairAtDawn: 40,
  colonists: 6, // each eats 1 food at dawn
  heaterFuelPerNight: 3, // the outpost burns this much fuel every night no matter what
  dayLength: [75, 50, 50, 50, 50], // seconds of daylight before each night
  totalNights: 5,

  beltSpeed: 2.2, // cells per second

  buildings: {
    belt:     { name: 'Belt',     cost: 1 },
    mine:     { name: 'Mine',     cost: 6,  period: 3.0 },
    smelter:  { name: 'Smelter',  cost: 8,  period: 1.8, fuelPerCraft: 0.5, inMax: 3, outMax: 2 },
    workshop: { name: 'Workshop', cost: 10, period: 2.0, ammoPerPlate: 2, inMax: 3, outMax: 4 },
    gun:      { name: 'Gun',      cost: 8,  range: 3.6, rate: 2.5, dmg: 4, ammo: 1, unlockDay: 1 },
    mortar:   { name: 'Mortar',   cost: 20, range: 5.2, rate: 0.55, dmg: 16, splash: 1.1, ammo: 3, flight: 0.7, unlockDay: 2 },
  },

  enemies: {
    crawler: { hp: 10, speed: 0.45, dps: 3,  r: 0.22, food: 0.35, fuel: 2 },
    swarmer: { hp: 5,  speed: 0.9,  dps: 1.5, r: 0.15, food: 0.15, fuel: 1 },
    brute:   { hp: 60, speed: 0.25, dps: 6,  r: 0.36, food: 2,    fuel: 6 },
  },

  // Each night: how long the spawning lasts (s), a health multiplier, and who comes.
  nights: [
    { spawnTime: 30, hpMult: 1.0,  groups: { crawler: 8 } },
    { spawnTime: 35, hpMult: 1.1,  groups: { crawler: 12, swarmer: 6 } },
    { spawnTime: 40, hpMult: 1.2,  groups: { crawler: 14, swarmer: 10, brute: 2 } },
    { spawnTime: 45, hpMult: 1.4,  groups: { crawler: 20, swarmer: 16, brute: 5 } },
    { spawnTime: 50, hpMult: 1.6,  groups: { crawler: 28, swarmer: 24, brute: 9 } },
  ],
};

DF.DIRS = {
  dx: [0, 1, 0, -1],
  dy: [-1, 0, 1, 0],
  opposite: (d) => (d + 2) % 4,
  arrow: ['↑', '→', '↓', '←'],
};
