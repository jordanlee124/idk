# Chronicle of Peoples

A world-history simulation you watch rather than play. Two founders begin on a generated continent; their descendants split, spread, discover things, settle into villages, starve, and scatter. A chronicle on the side writes the history as it happens.

This is milestone 1 ("Two to villages") of the plan: band, tribe and village stages, about 12 Stone Age techs, a seeded hex map, a chronicle, and save/load. No war, trade, kingdoms or player nudges yet.

## Run it

```
npm install
npm run dev        # open the printed address
npm run build      # one self-contained dist/index.html
npm test           # unit tests, golden seed test, 5-seed gate
npm run balance 1 2 3   # headless timeline for seeds, to tune numbers
```

Share a world with `#seed-4471` on the end of the address.

## Layout

- `src/sim`: the simulation. Pure TypeScript, no DOM, no `Math.random`; all randomness comes from one seeded generator stored in the world. `step(world)` runs the systems in a fixed order.
  - `content/`: techs, terrain, stage thresholds and tuning numbers. Balance by editing data here.
  - `systems/`: climate, food, population, migration (splitting), tech, stage, chronicle.
- `src/worker`: runs the sim in a Web Worker (falls back to the page if workers are blocked).
- `src/render`: the canvas map. `src/ui`: React panels.
- `tests/`: per-system tests and the golden seed test (`tests/golden.test.ts` holds the fingerprint of seed 1234 after 2,000 years; update it when you change a rule on purpose).
