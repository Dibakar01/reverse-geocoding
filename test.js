import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup, localitiesOf, cityIndexAt } from './geocode.js';

const cases = [
  { name: 'Mumbai, IN',    lat: 19.0760, lon: 72.8777, city: 'Mumbai',    state: 'Maharashtra', country: 'India' },
  { name: 'Bengaluru, IN', lat: 12.9716, lon: 77.5946, city: 'Bengaluru', state: 'Karnataka',   country: 'India' },
  { name: 'New Delhi, IN', lat: 28.6139, lon: 77.2090, city: 'Delhi',     state: 'Delhi',       country: 'India' },
  { name: 'London, UK',    lat: 51.5074, lon: -0.1278, city: 'London',    state: 'England',     country: 'United Kingdom' },
  { name: 'New York, US',  lat: 40.7128, lon: -74.0060, city: 'New York', state: 'New York',    country: 'United States' },
];

for (const c of cases) {
  test(c.name, () => {
    const r = lookup(c.lat, c.lon);
    assert.ok(r, 'expected a result');
    assert.ok(r.city.includes(c.city), `city ${JSON.stringify(r.city)} should contain ${JSON.stringify(c.city)}`);
    assert.equal(r.state, c.state);
    assert.equal(r.country, c.country);
    assert.ok(r.displayName.includes(c.country));
  });
}

// Every one of these is a locality that sits in a different administrative unit
// from the city it plainly belongs to, or next to a much larger city it does
// NOT belong to. They are the cases a nearest-big-place heuristic gets wrong.
const clubbing = [
  { name: 'Salt Lake sits in North 24 Parganas but belongs to Kolkata', lat: 22.5800, lon: 88.4200, city: 'Kolkata',   district: 'North 24 Parganas' },
  { name: 'Bandra is a Mumbai suburb, not Dharavi',                     lat: 19.0596, lon: 72.8295, city: 'Mumbai' },
  { name: 'Koramangala clubs to Bengaluru',                             lat: 12.9352, lon: 77.6245, city: 'Bengaluru' },
  { name: 'Noida stays Noida, it is not Delhi',                         lat: 28.5355, lon: 77.3910, city: 'Noida' },
  { name: 'Gurugram stays Gurugram, it is not Delhi',                   lat: 28.4595, lon: 77.0266, city: 'Gurugram' },
  { name: 'Thane stays Thane, it is not Mumbai',                        lat: 19.2183, lon: 72.9781, city: 'Thane' },
  { name: 'Banjara Hills clubs to Hyderabad',                           lat: 17.4126, lon: 78.4392, city: 'Hyderabad' },
  // A suburb over the seed threshold used to claim itself, because a seed wins
  // itself at distance zero. These are the cases the dominance pass fixed.
  { name: 'Borivali is absorbed into Mumbai, not its own city',         lat: 19.2307, lon: 72.8567, city: 'Mumbai' },
  { name: 'Electronic City is absorbed into Bengaluru',                 lat: 12.8452, lon: 77.6602, city: 'Bengaluru' },
  { name: 'Bopal is absorbed into Ahmedabad',                           lat: 23.0355, lon: 72.4700, city: 'Ahmedabad' },
  // ...but dominance must not over-absorb. Kalyan-Dombivli is 10x smaller than
  // Mumbai and 42 km away, and is its own municipal corporation.
  { name: 'Kalyan survives dominance and stays its own city',           lat: 19.2437, lon: 73.1355, city: 'Kalyan' },
  // Navi Mumbai is filed as PPLX, the same code as Dharavi. Excluding PPLX
  // outright made a planned city of 2.6 M unrepresentable.
  { name: 'Vashi belongs to Navi Mumbai, not Mumbai',                   lat: 19.0770, lon: 72.9986, city: 'Navi Mumbai' },
  { name: 'Kharghar belongs to Navi Mumbai',                            lat: 19.0330, lon: 73.0630, city: 'Navi Mumbai' },
  // Size ratio alone cannot separate these: Ambattur is 10.04x smaller than
  // Chennai and is one of its zones, Kalyan is 10.05x smaller than Mumbai and
  // is not. Distance against the parent's footprint is what decides it.
  { name: 'Ambattur is a Chennai corporation zone',                     lat: 13.0983, lon: 80.1614, city: 'Chennai' },
  { name: 'Dwarka belongs to Delhi, not Najafgarh',                     lat: 28.5921, lon: 77.0460, city: 'Delhi' },
  { name: 'Behala belongs to Kolkata',                                  lat: 22.4989, lon: 88.3186, city: 'Kolkata' },
  { name: 'Kukatpally belongs to Hyderabad',                            lat: 17.4849, lon: 78.4138, city: 'Hyderabad' },
  // GeoNames files the taluk Kanayannur as a place of 851,406 — larger than
  // Kochi — so it outranked the real city.
  { name: 'Fort Kochi belongs to Kochi, not the Kanayannur taluk',      lat: 9.9658,  lon: 76.2421, city: 'Kochi' },
  { name: 'Ernakulam belongs to Kochi',                                 lat: 9.9816,  lon: 76.2999, city: 'Kochi' },
  // ...but barring admin-population records must exempt administrative seats.
  // Kolkata and Chennai are coterminous with the units they head, so their
  // populations match by definition; barring them erased both cities.
  { name: 'Kolkata survives the admin-unit bar (it is a PPLA seat)',    lat: 22.5726, lon: 88.3639, city: 'Kolkata' },
  { name: 'Chennai survives the admin-unit bar',                        lat: 13.0827, lon: 80.2707, city: 'Chennai' },
  { name: 'Gurugram survives the admin-unit bar',                       lat: 28.4595, lon: 77.0266, city: 'Gurugram' },
];

test('every cityIndex names a real root, with no chains', async () => {
  // A root is assigned like any other place, so it can be claimed by another
  // root. Without flattening, two rows in one city land in different groups.
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const rows = gunzipSync(readFileSync(new URL('./data/places.tsv.gz', import.meta.url)))
    .toString('utf8').split('\n').map((l) => l.split('\t'));
  let notRoot = 0, outOfRange = 0;
  for (const r of rows) {
    if (r.length < 9) continue;
    const ci = Number(r[8]);
    if (ci < 0) continue;
    if (!rows[ci] || rows[ci].length < 9) { outOfRange++; continue; }
    if (Number(rows[ci][8]) !== ci) notRoot++;
  }
  assert.equal(outOfRange, 0, 'cityIndex out of range');
  assert.equal(notRoot, 0, 'cityIndex pointing at a non-root');
});

for (const c of clubbing) {
  test(c.name, () => {
    const r = lookup(c.lat, c.lon);
    assert.equal(r.city, c.city);
    if (c.district) assert.equal(r.district, c.district);
  });
}

test('a city is clubbed to itself and carries its localities', () => {
  const i = cityIndexAt(12.9352, 77.6245);           // Koramangala -> Bengaluru
  assert.ok(i >= 0, 'expected a parent city');
  const members = localitiesOf(i);
  assert.ok(members.length > 50, `expected many localities, got ${members.length}`);
  assert.ok(members.includes('Koramangala'), 'the queried locality should be a member');
});

test('mid-ocean point still returns something, without inventing a city', () => {
  const r = lookup(0, -140);
  assert.ok(r);
  assert.equal(r.locality, r.city, 'nothing to club to, so city falls back to locality');
});
