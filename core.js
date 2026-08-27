// Environment-agnostic reverse-geocoding core. Takes already-decompressed text
// and returns a lookup. No node: imports, so the browser demo and the server
// run the same code rather than two drifting copies.

const CITY_POP = 100_000;
const CITY_MAX_DEG = 100 / 111; // ~100 km expressed in degrees
const CITY_MAX_DEG2 = CITY_MAX_DEG * CITY_MAX_DEG;

export function createGeocoder({ places, admin1, countries: countryText }) {
  // "IN.16" -> "Maharashtra"
  const states = new Map();
  for (const line of admin1.split('\n')) {
    const [code, name] = line.split('\t');
    if (code) states.set(code, name);
  }

  // "IN" -> "India"
  const countries = new Map();
  for (const line of countryText.split('\n')) {
    if (!line || line[0] === '#') continue;
    const col = line.split('\t');
    if (col[0]) countries.set(col[0], col[4]);
  }

  // Upper bound on rows; the unused tail is cheaper than growing the arrays.
  const max = (places.length / 30) | 0;
  const lat = new Float32Array(max);
  const lon = new Float32Array(max);
  const pop = new Int32Array(max);
  const name = new Array(max);
  const cc = new Array(max);
  const a1 = new Array(max);
  // PPLX is GeoNames for "section of a populated place", i.e. a neighbourhood.
  // Dharavi is PPLX with a population of 700k; it is not a city.
  const isSection = new Uint8Array(max);

  // Country and admin1 codes repeat across hundreds of thousands of rows, so
  // hold one string per distinct code instead of 1.2 M near-identical ones.
  const pool = new Map();
  const intern = (s) => {
    const hit = pool.get(s);
    if (hit !== undefined) return hit;
    pool.set(s, s);
    return s;
  };

  // Walk line by line rather than splitting. `split` would materialise 621k
  // strings at once, and that peak — not the retained data — is what pins
  // hundreds of MB of V8 pages for the life of the process.
  // ponytail: still ~238 MB RSS for ~40 MB of live data, because each line
  // still allocates temporary slices. Parsing fields by character offset would
  // cut it further; only worth it if a memory limit actually bites.
  let n = 0;
  let start = 0;
  while (start < places.length) {
    let end = places.indexOf('\n', start);
    if (end === -1) end = places.length;
    const col = places.slice(start, end).split('\t');
    start = end + 1;
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
  pool.clear();

  // A "city" is the nearest place that is big enough to be one, is not merely a
  // district of one, and is close enough to plausibly contain the point.
  // Otherwise the locality is the best we can honestly say.
  function lookup(qlat, qlon) {
    // Equirectangular approximation: fine for nearest-neighbour ranking, and
    // the longitude scale is what makes it correct away from the equator.
    const k = Math.cos((qlat * Math.PI) / 180);
    let bestD = Infinity, best = -1;
    let cityD = Infinity, city = -1;

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

  return { lookup, placeCount: n };
}
