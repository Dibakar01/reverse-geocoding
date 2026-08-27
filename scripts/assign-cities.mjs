// Clubs every place to a parent city, once, at build time.
//
// A place belongs to the strongest city whose orbit it sits in:
//   score = population / distance², weighted 1.6x when the city is in the
//   place's own district, and never considered across a state line.
//
// Why not districts alone: Salt Lake sits in North 24 Parganas, not Kolkata
// district, yet it is plainly Kolkata. Why not gravity alone: Delhi's 11 M
// outweighs Noida at 20 km, yet Noida is a different state and its own city.
// Administrative containment is evidence, not proof — so it is a weight.
//
// Anything the orbit rule cannot claim — a village with no town within reach —
// falls back to the largest city in its own district, which is a plain
// administrative fact rather than a guess.
import { readFileSync } from 'node:fs';

const MIN_CITY_POP = 20_000;   // below this a place is not somewhere you "belong to"
const MIN_REACH_KM = 5;
const MAX_REACH_KM = 60;
const SAME_DISTRICT_BONUS = 1.6;
const DOMINANCE = 15;          // a neighbour this many times larger owns you
const CELL = 1;                // degrees; > max reach, so neighbours suffice

const lines = readFileSync(process.argv[2], 'utf8').split('\n');
const P = [];
for (const line of lines) {
  const c = line.split('\t');
  if (c.length < 8) continue;
  P.push({ line, lat: +c[1], lon: +c[2], cc: c[3], a1: c[4], a2: c[5], pop: +c[6] || 0, fc: c[7] });
}

// A city's pull reaches further the bigger it is, but never unboundedly.
const reach = (pop) => Math.min(MAX_REACH_KM, Math.max(MIN_REACH_KM, 0.02 * Math.sqrt(pop)));

const distKm = (a, blat, blon) => {
  const k = Math.cos((a.lat * Math.PI) / 180);
  let dx = blon - a.lon;
  if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
  return Math.hypot(blat - a.lat, dx * k) * 111;
};

const key = (la, lo) => `${Math.floor(la / CELL)}:${Math.floor(lo / CELL)}`;
const bucket = (idx) => {
  const g = new Map();
  for (const i of idx) {
    const k = key(P[i].lat, P[i].lon);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(i);
  }
  return g;
};
const near = (g, p) => {
  const out = [];
  const gy = Math.floor(p.lat / CELL), gx = Math.floor(p.lon / CELL);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) out.push(...(g.get(`${gy + dy}:${gx + dx}`) ?? []));
  return out;
};

let candidates = [];
for (let i = 0; i < P.length; i++) {
  const p = P[i];
  if (p.pop >= MIN_CITY_POP && p.fc !== 'PPLX') candidates.push(i);
}

// A seed always wins itself at distance zero, so without this pass every suburb
// over the threshold becomes its own "city" — Borivli instead of Mumbai, Bopal
// instead of Ahmedabad. Feature codes cannot tell them apart (Thane and Borivli
// are both plain PPL), and neither can districts, because Mumbai and Delhi carry
// no admin2 at all. What does separate them is dominance: a neighbour an order
// of magnitude larger, close enough to reach you, owns you. Thane is only ~7x
// smaller than Mumbai and stays its own city; Borivli is ~21x smaller and does not.
const cgrid = bucket(candidates);
const demoted = new Set();
for (const i of candidates) {
  const p = P[i];
  for (const j of near(cgrid, p)) {
    if (j === i) continue;
    const b = P[j];
    if (b.cc !== p.cc || b.a1 !== p.a1) continue;
    if (b.pop < DOMINANCE * p.pop) continue;
    if (distKm(p, b.lat, b.lon) > reach(b.pop)) continue;
    demoted.add(i);
    break;
  }
}
candidates = candidates.filter((i) => !demoted.has(i));
const grid = bucket(candidates);
const seeds = candidates.length;

// Largest city seed per district, for the fallback tier.
const districtCity = new Map();
for (const i of candidates) {
  const p = P[i];
  if (!p.a2) continue;
  const k = `${p.cc}.${p.a1}.${p.a2}`;
  const held = districtCity.get(k);
  if (held === undefined || P[held].pop < p.pop) districtCity.set(k, i);
}

const out = [];
let byOrbit = 0, byDistrict = 0;
for (const p of P) {
  let best = -1, bestScore = 0;
  const gy = Math.floor(p.lat / CELL), gx = Math.floor(p.lon / CELL);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const i of grid.get(`${gy + dy}:${gx + dx}`) ?? []) {
        const s = P[i];
        if (s.cc !== p.cc || s.a1 !== p.a1) continue;   // never cross a state line
        const d = distKm(p, s.lat, s.lon);
        if (d > reach(s.pop)) continue;
        const bonus = p.a2 && s.a2 === p.a2 ? SAME_DISTRICT_BONUS : 1;
        const score = (bonus * s.pop) / Math.max(d * d, 0.25);
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
  }
  if (best >= 0) {
    byOrbit++;
  } else if (p.a2) {
    const fallback = districtCity.get(`${p.cc}.${p.a1}.${p.a2}`);
    if (fallback !== undefined) { best = fallback; byDistrict++; }
  }
  out.push(`${p.line}\t${best}`);
}

const clubbed = byOrbit + byDistrict;
process.stderr.write(
  `  ${P.length.toLocaleString()} places, ${seeds.toLocaleString()} city seeds ` +
  `(${demoted.size.toLocaleString()} demoted as suburbs)\n` +
  `  clubbed ${clubbed.toLocaleString()} (${((clubbed / P.length) * 100).toFixed(1)}%): ` +
  `${byOrbit.toLocaleString()} by orbit, ${byDistrict.toLocaleString()} by district\n`);
process.stdout.write(out.join('\n'));
