# Duskforge

An endless factory and town builder for phone browsers. You lay out mines, smelters and belts on an open map. Your factory feeds a town, and the town gives you the workers to build a bigger factory. Small raids arrive every few minutes.

## Play

Open `index.html` in any browser. There is no build step. To play on a phone, enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root) and open the Pages URL. The game autosaves on the device.

## Controls

- **Two fingers** pan and pinch-zoom at any time.
- **Move tool:** one finger pans, and a tap opens a building's details (rotate, remove, status).
- **Build tools:** press, slide to aim, release to place. **Belt**, **Wall** and **Remove** follow your finger as you drag, and the map scrolls when you drag near an edge.
- Tap a building with its own tool to rotate it. The round button sets the direction for new buildings.
- On desktop, the mouse wheel zooms and right-drag pans.

## How it works

- Every machine pushes its output toward its white arrow, into a belt or the next machine.
- Goods enter the town at the **town hall** or a **Depot** (inside the town circle). Everything you build is paid for from that stock.
- **Houses** eat food. Supplied with wood they become Houses, and with tools as well they become Manors. Each step up adds residents.
- **Machines need workers.** When the population drops, food and wood get workers first. Three founders live in the hall so the colony can always recover.
- **Raids** come from a random direction (an edge marker shows where). Turrets fire ammo from the town stock, and Walls slow raiders down.

## Code layout

| File | What it does |
| --- | --- |
| `js/config.js` | Every tunable number: costs, rates, house needs, raids |
| `js/world.js` | Endless procedural terrain, game state, placement rules |
| `js/sim.js` | Belts, splitters, extractors and crafting |
| `js/town.js` | Town stock, houses, tiers, population and workers |
| `js/raids.js` | Raids, raider movement, turrets |
| `js/render.js` | Camera and canvas drawing |
| `js/main.js` | Touch controls, HUD, panels, loop, save and load |

The v2 colony market is meant to plug into `js/town.js`. Houses already express demand per minute, and a market would turn that demand plus stock levels into prices and happiness.
