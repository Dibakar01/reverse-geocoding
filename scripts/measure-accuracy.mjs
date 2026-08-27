// Measures metro accuracy two ways over the SAME points and the SAME data, so
// the comparison is fair: the original "nearest big place" heuristic, versus the
// precomputed city clubbing. Emits JSON that the README figures are drawn from,
// so the picture can never drift from the numbers.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { lookup } from '../geocode.js';

const text = gunzipSync(readFileSync(new URL('../data/places.tsv.gz', import.meta.url))).toString('utf8');
const lat = [], lon = [], name = [], pop = [], section = [];
for (const line of text.split('\n')) {
  const c = line.split('\t');
  if (c.length < 9) continue;
  name.push(c[0]); lat.push(+c[1]); lon.push(+c[2]);
  pop.push(+c[6] || 0); section.push(c[7] === 'PPLX');
}

// The heuristic this project started with.
const CITY_POP = 100_000, MAX2 = (100 / 111) ** 2;
function nearestBigPlace(qlat, qlon) {
  const k = Math.cos((qlat * Math.PI) / 180);
  let bestD = Infinity, best = -1, cityD = Infinity, city = -1;
  for (let i = 0; i < lat.length; i++) {
    let dx = lon[i] - qlon;
    if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
    dx *= k;
    const dy = lat[i] - qlat, d = dy * dy + dx * dx;
    if (d < bestD) { bestD = d; best = i; }
    if (d < cityD && pop[i] >= CITY_POP && !section[i]) { cityD = d; city = i; }
  }
  return city >= 0 && cityD <= MAX2 ? name[city] : name[best];
}

const METROS = [
  ['Delhi', 28.6139, 77.2090], ['Mumbai', 19.0760, 72.8777], ['Bengaluru', 12.9716, 77.5946],
  ['Chennai', 13.0827, 80.2707], ['Kolkata', 22.5726, 88.3639], ['Hyderabad', 17.3850, 78.4867],
  ['Pune', 18.5204, 73.8567], ['Ahmedabad', 23.0225, 72.5714], ['Kochi', 9.9312, 76.2673],
];

export function measure() {
const out = [];
for (const [metro, la, lo] of METROS) {
  let clubbed = 0, heuristic = 0, total = 0;
  for (let dy = -0.09; dy <= 0.0901; dy += 0.018) {
    for (let dx = -0.09; dx <= 0.0901; dx += 0.018) {
      total++;
      if (lookup(la + dy, lo + dx).city === metro) clubbed++;
      if (nearestBigPlace(la + dy, lo + dx) === metro) heuristic++;
    }
  }
  out.push({ metro, before: Math.round((heuristic / total) * 100), after: Math.round((clubbed / total) * 100), points: total });
}
return out;
}

// Also usable directly: `node scripts/measure-accuracy.mjs`
// pathToFileURL, not string concatenation: a checkout path containing a space
// percent-encodes in import.meta.url and would never match.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(measure(), null, 2) + '\n');
}
