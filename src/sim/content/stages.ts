// Stage thresholds and tuning numbers. Every number here is a starting value to tune.

export const STAGES = {
  /** A band becomes a tribe at this many people. */
  tribeAt: 30,
  /** A tribe shrinks back to a band below this. */
  bandBelow: 20,
  /** A tribe above this size always tries to split. */
  tribeSplitAt: 150,
  /** Years a tribe that knows Agriculture must stay put to become a village. */
  villageSedentaryYears: 20,
  /** Minimum people for a settled village. */
  villageMinPop: 25,
  /** Consecutive hungry years that undo a village. */
  villageFamineYears: 3,
} as const;

export const TUNING = {
  birthRate: 0.026,
  deathRate: 0.022,
  /** Extra kin-cooperation for very small groups, so the founders usually survive. */
  smallGroupSize: 14,
  smallGroupBirthBoost: 1.35,
  smallGroupDeathCut: 0.6,
  forageFood: 14,
  farmFood: 34,
  /** Share of a tile's food a group gets from tiles next to its own, and two steps away. */
  ring1Share: 0.5,
  ring2Share: 0.22,
  /** Tribes farm at this fraction of a settled village's efficiency. */
  tribeFarmEfficiency: 0.5,
  /** Fraction of a tile's yield lost in full cold with no protection. */
  coldPenalty: 0.7,
  baseStore: 0.25,
  storeDecay: 0.12,
  /** Crowding at which a group considers splitting (people / food capacity). */
  crowdSplit: 0.88,
  minSplitPop: 40,
  splitChancePerYear: 0.15,
  splitFraction: 0.4,
  splitRadius: 6,
  moveRadius: 3,
  /** Base yearly chance to look for better land. */
  wanderChance: 0.03,
  /** Contact chance per neighbouring group per year (divided by distance). */
  contactChance: 0.012,
  contactLearnChance: 0.4,
  /** Yearly chance of a new drought somewhere. */
  droughtChance: 0.006,
  /** Base yearly discovery scale. */
  discoveryScale: 1,
  /** Chance a daughter group forgets one tech it inherited. */
  forgetOnSplit: 0.02,
  /** Years of an initial warm-up in which the founding band is shielded. */
  founderShieldYears: 150,
} as const;

export const DIRECTIONS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
