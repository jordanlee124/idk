// Duskforge: every tunable number lives here.
window.DF = window.DF || {};

DF.CONFIG = {
  tile: 32, // base tile size in px at zoom 1
  zoomMin: 0.45,
  zoomMax: 2.2,
  beltSpeed: 2.0, // tiles per second
  townTick: 10, // seconds between town consumption checks
  saveEvery: 10, // seconds between autosaves
  saveKey: 'duskforge-save-v2',

  start: { plate: 70, wood: 50, food: 30, tools: 0, ammo: 20, iron: 0, coal: 0 },

  // Item kinds and how they look
  items: {
    iron:  { name: 'Iron ore', color: '#7f93b0' },
    coal:  { name: 'Coal',     color: '#2b2b30' },
    wood:  { name: 'Wood',     color: '#a8743f' },
    food:  { name: 'Food',     color: '#9ccf5a' },
    plate: { name: 'Plates',   color: '#cfd8e2' },
    tools: { name: 'Tools',    color: '#e0a83a' },
    ammo:  { name: 'Ammo',     color: '#ffd25e' },
  },

  // Buildings. cost is taken from the town stock. workers are people the building needs.
  // unlock is the population needed before it appears in the build bar.
  buildings: {
    belt:     { name: 'Belt',     cost: { plate: 1 }, workers: 0, unlock: 0, hp: 20, desc: 'Moves items. Drag to lay a line.' },
    splitter: { name: 'Splitter', cost: { plate: 4 }, workers: 0, unlock: 0, hp: 20, desc: 'Sends items forward, left and right in turn.' },
    lumber:   { name: 'Lumber',   cost: { wood: 5 },  workers: 1, unlock: 0, hp: 40, period: 4.5, out: 'wood', on: 'forest', desc: 'Cuts wood. Place on forest.' },
    farm:     { name: 'Farm',     cost: { wood: 6 },  workers: 1, unlock: 0, hp: 40, period: 5.0, out: 'food', on: 'grass', desc: 'Grows food on open grass.' },
    mine:     { name: 'Mine',     cost: { plate: 8, wood: 4 }, workers: 1, unlock: 0, hp: 50, period: 2.5, on: 'ore', desc: 'Digs iron or coal. Place on a deposit.' },
    smelter:  { name: 'Smelter',  cost: { plate: 10 }, workers: 1, unlock: 0, hp: 50, period: 2.0, desc: 'Iron ore + coal → plate.' },
    workshop: { name: 'Workshop', cost: { plate: 15, wood: 10 }, workers: 2, unlock: 10, hp: 50, period: 3.0, desc: '2 plates → tools.' },
    armory:   { name: 'Armory',   cost: { plate: 12 }, workers: 1, unlock: 0, hp: 50, period: 2.0, desc: '1 plate → 4 ammo.' },
    depot:    { name: 'Depot',    cost: { wood: 8 },  workers: 0, unlock: 0, hp: 60, desc: 'Drop-off into the town stock. Must be inside the town.' },
    hut:      { name: 'House',    cost: { wood: 6 },  workers: 0, unlock: 0, hp: 150, desc: 'Homes for workers. Must be inside the town.' },
    turret:   { name: 'Turret',   cost: { plate: 12 }, workers: 0, unlock: 0, hp: 80, range: 5, rate: 2, dmg: 5, desc: 'Shoots raiders. Uses ammo from the town stock.' },
    wall:     { name: 'Wall',     cost: { wood: 2 },  workers: 0, unlock: 0, hp: 120, desc: 'Cheap blocker. Raiders have to chew through it.' },
  },

  // House tiers. Needs are per house per minute, drawn from the town stock.
  tiers: [
    { name: 'Hut',   residents: 2, needs: { food: 3 } },
    { name: 'House', residents: 4, needs: { food: 4, wood: 3 } },
    { name: 'Manor', residents: 8, needs: { food: 6, wood: 3, tools: 2 } },
  ],
  upgradeAfter: 3, // town ticks fully supplied before moving up a tier
  downgradeAfter: 2, // town ticks short before moving down

  founders: 3, // people who live in the town hall and never leave, so a colony can always restart
  townRadiusBase: 6,
  townRadiusPerPop: 0.18,

  raids: {
    first: 360, // seconds until the first raid
    every: 210,
    warn: 30,
    distance: 26, // how far from the town hall raiders appear
    // Raid size grows with time and population
    size: (t, pop) => 1 + Math.floor(t / 300) + Math.floor(pop / 15),
    bruteFrom: 900,
  },
  enemies: {
    crawler: { hp: 14, speed: 0.8, dps: 4,  r: 0.3, color: '#9b5de5' },
    brute:   { hp: 60, speed: 0.5, dps: 10, r: 0.45, color: '#e05252' },
  },
  raidFoodSteal: 6,
};

DF.DIRS = {
  dx: [0, 1, 0, -1],
  dy: [-1, 0, 1, 0],
  opposite: (d) => (d + 2) % 4,
  arrow: ['↑', '→', '↓', '←'],
};
