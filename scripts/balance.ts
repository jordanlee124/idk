// Headless balance report: `npm run balance [seeds...]` runs the sim and prints a timeline per seed.
import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';

const seeds = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
if (!seeds.length) seeds.push(1, 2, 3, 4, 5);
const years = 3000;

for (const seed of seeds) {
  const w = createWorld(seed);
  const t0 = Date.now();
  let firstAg = -1, firstVillage = -1, firstTribe = -1, maxGroups = 0;
  const marks: string[] = [];
  for (let y = 1; y <= years; y++) {
    step(w);
    if (firstTribe < 0 && w.firsts.includes('tribe')) firstTribe = y;
    if (firstAg < 0 && w.firsts.includes('tech:agriculture')) firstAg = y;
    if (firstVillage < 0 && w.firsts.includes('village')) firstVillage = y;
    maxGroups = Math.max(maxGroups, w.groups.length);
    if (y % 250 === 0) {
      const pop = w.groups.reduce((a, g) => a + g.pop, 0);
      const vill = w.groups.filter((g) => g.stage === 'village').length;
      const ag = w.groups.filter((g) => g.techs.includes('agriculture')).length;
      marks.push(`y${y}: agri ${ag} pop ${pop} groups ${w.groups.length} villages ${vill} cultures ${w.cultures.length}`);
    }
  }
  const ms = Date.now() - t0;
  console.log(`seed ${seed}: tribe@${firstTribe} agri@${firstAg} village@${firstVillage} maxGroups ${maxGroups} ended=${w.ended} chron=${w.chronicle.length} (${ms}ms)`);
  for (const m of marks) console.log('   ', m);
}
