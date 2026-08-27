// Offline reverse geocoder over GeoNames data. No network calls at runtime.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DATA = new URL('./data/', import.meta.url);
const read = (f) => {
  let buf;
  try {
    buf = readFileSync(new URL(f, DATA));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    throw new Error(`Missing data/${f}. Run: npm run build-data`);
  }
  return (f.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
};

// "IN.16" -> "Maharashtra"
const states = new Map();
for (const line of read('admin1CodesASCII.txt').split('\n')) {
  const [code, name] = line.split('\t');
  if (code) states.set(code, name);
}

// "IN" -> "India"
const countries = new Map();
for (const line of read('countryInfo.txt').split('\n')) {
  if (!line || line[0] === '#') continue;
  const col = line.split('\t');
  if (col[0]) countries.set(col[0], col[4]);
}

let rows = read('places.tsv.gz').split('\n');
const lat = new Float32Array(rows.length);
const lon = new Float32Array(rows.length);
const pop = new Int32Array(rows.length);
const name = new Array(rows.length);
const cc = new Array(rows.length);
const a1 = new Array(rows.length);
// PPLX is GeoNames for "section of a populated place", i.e. a neighbourhood.
// Dharavi is PPLX with a population of 700k; it is not a city.
const isSection = new Uint8Array(rows.length);

// Country and admin1 codes repeat across hundreds of thousands of rows, so hold
// one string per distinct code instead of 1.2 M near-identical ones.
const pool = new Map();
const intern = (s) => {
  const hit = pool.get(s);
  if (hit !== undefined) return hit;
  pool.set(s, s);
  return s;
};

let n = 0;
for (const row of rows) {
  const col = row.split('\t');
  if (col.length < 7) continue;
  name[n] = col[0];
  lat[n] = +col[1];
  lon[n] = +col[2];
  cc[n] = intern(col[3]);
  a1[n] = intern(col[4]);
  pop[n] = +col[5] || 0;
  isSection[n] = col[6] === 'PPLX' ? 1 : 0;
  n++;
}
rows = null; // ~23 MB of raw lines, dead once parsed
pool.clear();
// ponytail: ~290 MB RSS, of which only ~90 MB is live — the rest is V8 pages
// from the parse peak that never go back to the OS. Storing names as offsets
// into the decompressed buffer would roughly third it; do that if a memory
// limit ever actually bites, not before.

export const placeCount = n;

// A "city" is the nearest place that is big enough to be one, is not merely a
// district of one, and is close enough to plausibly contain the point.
// Otherwise the locality is the best we can honestly say.
const CITY_POP = 100_000;
const CITY_MAX_DEG = 100 / 111; // ~100 km expressed in degrees
const CITY_MAX_DEG2 = CITY_MAX_DEG * CITY_MAX_DEG;

export function lookup(qlat, qlon) {
  // Equirectangular approximation: fine for nearest-neighbour ranking, and the
  // longitude scale is what makes it correct away from the equator.
  const k = Math.cos((qlat * Math.PI) / 180);
  let bestD = Infinity, best = -1;
  let cityD = Infinity, city = -1;

  // ponytail: linear scan over ~621k rows, ~0.7 ms per lookup. Bucket by
  // 1-degree cell if that ever shows up in a profile.
  for (let i = 0; i < n; i++) {
    let dx = lon[i] - qlon;
    if (dx > 180) dx -= 360;
    else if (dx < -180) dx += 360; // antimeridian
    dx *= k;
    const dy = lat[i] - qlat;
    const d = dy * dy + dx * dx;
    if (d < bestD) { bestD = d; best = i; }
    if (d < cityD && pop[i] >= CITY_POP && !isSection[i]) { cityD = d; city = i; }
  }
  if (best < 0) return null;

  const locality = name[best];
  const parts = [
    locality,
    city >= 0 && cityD <= CITY_MAX_DEG2 ? name[city] : locality,
    states.get(`${cc[best]}.${a1[best]}`) || '',
    countries.get(cc[best]) || '',
  ];
  return {
    locality: parts[0],
    city: parts[1],
    state: parts[2],
    country: parts[3],
    displayName: [...new Set(parts.filter(Boolean))].join(', '),
  };
}
