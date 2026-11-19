# Duskforge

A small factory-defence game for phone browsers. By day you build a production line on a grid. At night creatures attack the wall, and your turrets can only fire the ammo your factory made.

## Play

Open `index.html` in any browser. There is no build step. To play on a phone, enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root) and open the Pages URL.

## How it works

- **Mine** (on an ore deposit) → **Smelter** (ore to plate, burns fuel) → **Workshop** (plate to ammo).
- Every machine pushes its output in the direction of its white arrow. **Belts** carry items. Drag to lay them.
- Anything that reaches the wall is stored: **ammo** feeds turrets, **plates** pay for building.
- **Gun** turrets are cheap and fire 1 ammo per shot. **Mortars** unlock on day 2 and hit groups for 3 ammo.
- Each dawn colonists eat food and the heaters burn fuel. Kills give fuel and food back.
- Survive 5 nights to win. You lose if the wall falls or the food runs out.

## Code layout

| File | What it does |
| --- | --- |
| `js/config.js` | Every tunable number: costs, rates, enemy stats, the five nights |
| `js/state.js` | Game state and the economy (stock, wall delivery, dawn upkeep) |
| `js/factory.js` | Placement rules and the production simulation |
| `js/combat.js` | Waves, enemy movement, turrets, mortar shells |
| `js/render.js` | Canvas drawing |
| `js/main.js` | Game loop, phases, touch input, HUD and overlays |

The v2 colony market is meant to plug into `DF.economy` in `js/state.js`: route delivered goods to a market there and run price and happiness updates in `DF.economy.dawn()`.
