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
const DOMINANCE = 8;           // a neighbour this many times larger may own you...
const FOOTPRINT = 1.5;         // ...but only within this multiple of its built-up radius
const URBAN_DENSITY = 10_000;  // people per km², to turn a population into a radius
const MERGE_KM = 3;            // two seeds this close are one city entered twice
const CELL = 1;                // degrees; > max reach, so neighbours suffice

// GeoNames sometimes files a taluk or district as if it were a town, copying the
// unit's population onto the settlement record: "Kanayannur" appears as a place
// of 851,406 — larger than Kochi — because that is the taluk's population. Such a
// record then outranks the real city. The tell is an identical population on a
// same-named ADM2/ADM3 unit. Only 33 records India-wide match; they are barred
// from being cities, though they remain geocodable as places.
const adminPop = new Map();
for (const line of readFileSync(process.argv[3], 'utf8').split('\n')) {
  const [name, pop] = line.split('\t');
  if (!name) continue;
  const v = +pop || 0;
  if (v > (adminPop.get(name) ?? 0)) adminPop.set(name, v);
}
// Administrative SEATS are exempt. Kolkata, Chennai and Gurugram are each
// coterminous with the unit they head, so their populations match by definition —
// barring them wipes out the city entirely. A genuine masquerade is a plain PPL:
// Kanayannur heads nothing, it simply inherited its taluk's number.
const isAdminSeat = (fc) => fc.startsWith('PPLA') || fc === 'PPLC';
const carriesAdminPopulation = (p) => {
  if (isAdminSeat(p.fc)) return false;
  const a = adminPop.get(p.name);
  return a > 0 && Math.abs(p.pop - a) / a < 0.1;
};

const lines = readFileSync(process.argv[2], 'utf8').split('\n');
const P = [];
for (const line of lines) {
  const c = line.split('\t');
  if (c.length < 8) continue;
  P.push({ line, name: c[0], lat: +c[1], lon: +c[2], cc: c[3], a1: c[4], a2: c[5], pop: +c[6] || 0, fc: c[7] });
}

// A city's pull reaches further the bigger it is, but never unboundedly.
const reach = (pop) => Math.min(MAX_REACH_KM, Math.max(MIN_REACH_KM, 0.02 * Math.sqrt(pop)));

// Roughly how far a city's built-up area extends, from its population and a
// typical urban density. Used to decide whether a neighbour is inside the city
// or merely near it.
const footprintKm = (pop) => Math.sqrt(pop / URBAN_DENSITY / Math.PI);

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

// PPLX ("section of a populated place") is NOT excluded here. It used to be, to
// stop Dharavi beating Mumbai — but GeoNames also files Navi Mumbai, a planned
// city of 2.6 M, as PPLX. The dominance pass below separates them properly:
// Dharavi is 18x smaller than Mumbai and sits inside it, Navi Mumbai is only 5x
// smaller and does not.
let candidates = [];
let adminMasquerade = 0;
for (let i = 0; i < P.length; i++) {
  if (P[i].pop < MIN_CITY_POP) continue;
  if (carriesAdminPopulation(P[i])) { adminMasquerade++; continue; }
  candidates.push(i);
}

// A seed always wins itself at distance zero, so without this pass every suburb
// over the threshold becomes its own "city" — Borivli instead of Mumbai, Bopal
// instead of Ahmedabad. Feature codes cannot tell them apart (Thane and Borivli
// are both plain PPL), and neither can districts, because Mumbai and Delhi carry
// no admin2 at all.
//
// Size ratio alone cannot either: Ambattur is 10.04x smaller than Chennai and is
// one of its corporation zones, while Kalyan is 10.05x smaller than Mumbai and is
// its own city. What separates them is distance relative to the parent's built-up
// area — Ambattur sits 13 km from Chennai, inside a ~12 km footprint; Kalyan sits
// 42 km from Mumbai, well outside its ~20 km one. So absorption needs both: much
// larger, AND close enough to actually contain you.
const cgrid = bucket(candidates);
const demoted = new Set();
for (const i of candidates) {
  const p = P[i];
  for (const j of near(cgrid, p)) {
    if (j === i) continue;
    const b = P[j];
    if (b.cc !== p.cc || b.a1 !== p.a1) continue;
    if (b.pop < DOMINANCE * p.pop) continue;
    if (distKm(p, b.lat, b.lon) > FOOTPRINT * footprintKm(b.pop)) continue;
    demoted.add(i);
    break;
  }
}
// GeoNames sometimes files one city as two records — Pimpri and Pimpri-Chinchwad
// sit 580 m apart, both over a million. Two seeds this close are one urban entity
// split in the source, so the smaller is folded into the larger.
for (const i of candidates) {
  if (demoted.has(i)) continue;
  const p = P[i];
  for (const j of near(cgrid, p)) {
    if (j === i || demoted.has(j)) continue;
    const b = P[j];
    if (b.cc !== p.cc || b.a1 !== p.a1) continue;
    if (b.pop < p.pop || (b.pop === p.pop && j < i)) continue;   // keep the larger
    if (distKm(p, b.lat, b.lon) > MERGE_KM) continue;
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

// A root is assigned like any other place, so it can be claimed by another root,
// leaving rows whose "parent city" is itself not a city. Follow each chain to its
// fixpoint so cityIndex always names a real root.
const parent = out.map((line) => +line.slice(line.lastIndexOf('\t') + 1));
let flattened = 0;
for (let i = 0; i < parent.length; i++) {
  let p = parent[i], guard = 0;
  while (p >= 0 && parent[p] >= 0 && parent[p] !== p && guard++ < 16) p = parent[p];
  if (p !== parent[i]) { flattened++; parent[i] = p; }
}
for (let i = 0; i < out.length; i++) {
  out[i] = out[i].slice(0, out[i].lastIndexOf('\t') + 1) + parent[i];
}

const clubbed = byOrbit + byDistrict;
process.stderr.write(
  `  ${P.length.toLocaleString()} places, ${seeds.toLocaleString()} city seeds ` +
  `(${demoted.size.toLocaleString()} demoted as suburbs, ` +
  `${adminMasquerade.toLocaleString()} barred as admin units)\n` +
  `  clubbed ${clubbed.toLocaleString()} (${((clubbed / P.length) * 100).toFixed(1)}%): ` +
  `${byOrbit.toLocaleString()} by orbit, ${byDistrict.toLocaleString()} by district; ` +
  `${flattened.toLocaleString()} chains flattened\n`);
process.stdout.write(out.join('\n'));
