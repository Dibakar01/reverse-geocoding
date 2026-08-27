// Environment-agnostic reverse-geocoding core. Takes already-decompressed text
// and returns a lookup. No node: imports, so the browser demo and the server
// run the same code rather than two drifting copies.
//
// Every place is already clubbed to a parent city by scripts/assign-cities.mjs,
// so a lookup here is a plain nearest-neighbour scan — no scoring at runtime.

export function createGeocoder({ places, admin1, admin2, countries: countryText }) {
  // "IN.16" -> "Maharashtra"
  const states = new Map();
  for (const line of admin1.split('\n')) {
    const [code, name] = line.split('\t');
    if (code) states.set(code, name);
  }

  // "IN.19.572" -> "Bangalore Urban". Column 2 is the ASCII name; 110 of India's
  // 763 districts carry diacritics in column 1, and we spell places in ASCII
  // everywhere else.
  const districts = new Map();
  for (const line of (admin2 ?? '').split('\n')) {
    const [code, name, ascii] = line.split('\t');
    if (code) districts.set(code, ascii || name);
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
  const cityOf = new Int32Array(max);   // index of the parent city, or -1
  const name = new Array(max);
  const cc = new Array(max);
  const a1 = new Array(max);
  const a2 = new Array(max);

  // Country, state and district codes repeat across hundreds of thousands of
  // rows, so hold one string per distinct code rather than 1.8 M copies.
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
  let n = 0;
  let start = 0;
  while (start < places.length) {
    let end = places.indexOf('\n', start);
    if (end === -1) end = places.length;
    const col = places.slice(start, end).split('\t');
    start = end + 1;
    if (col.length < 9) continue;
    name[n] = col[0];
    lat[n] = +col[1];
    lon[n] = +col[2];
    cc[n] = intern(col[3]);
    a1[n] = intern(col[4]);
    a2[n] = intern(col[5]);
    cityOf[n] = +col[8];
    n++;
  }
  pool.clear();

  function lookup(qlat, qlon) {
    // Equirectangular approximation: fine for nearest-neighbour ranking, and
    // the longitude scale is what makes it correct away from the equator.
    const k = Math.cos((qlat * Math.PI) / 180);
    let bestD = Infinity, best = -1;
    for (let i = 0; i < n; i++) {
      let dx = lon[i] - qlon;
      if (dx > 180) dx -= 360;
      else if (dx < -180) dx += 360; // antimeridian
      dx *= k;
      const dy = lat[i] - qlat;
      const d = dy * dy + dx * dx;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;

    const locality = name[best];
    const city = cityOf[best] >= 0 ? name[cityOf[best]] : locality;
    const district = a2[best] ? districts.get(`${cc[best]}.${a1[best]}.${a2[best]}`) || '' : '';
    const state = states.get(`${cc[best]}.${a1[best]}`) || '';
    const country = countries.get(cc[best]) || '';

    return {
      locality, district, city, state, country,
      // District is deliberately left out: it is useful as a field but noise in
      // a one-line address, and often repeats the city ("Bengaluru Urban").
      displayName: [...new Set([locality, city, state, country].filter(Boolean))].join(', '),
    };
  }

  // Everything clubbed under one city, for "who else is in my city", nearest to
  // the city centre first. Places claimed by orbit are by construction closer
  // than ones swept in by the district fallback, so ordering by distance
  // surfaces recognisable neighbourhoods rather than outlying villages.
  function localitiesOf(cityIndex) {
    if (cityIndex < 0) return [];
    const clat = lat[cityIndex], clon = lon[cityIndex];
    const k = Math.cos((clat * Math.PI) / 180);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (cityOf[i] !== cityIndex || i === cityIndex) continue;
      let dx = lon[i] - clon;
      if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
      dx *= k;
      const dy = lat[i] - clat;
      out.push({ name: name[i], d: dy * dy + dx * dx });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((p) => p.name);
  }

  function cityIndexAt(qlat, qlon) {
    const k = Math.cos((qlat * Math.PI) / 180);
    let bestD = Infinity, best = -1;
    for (let i = 0; i < n; i++) {
      let dx = lon[i] - qlon;
      if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
      dx *= k;
      const dy = lat[i] - qlat;
      const d = dy * dy + dx * dx;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? -1 : cityOf[best];
  }

  return { lookup, localitiesOf, cityIndexAt, placeCount: n };
}
