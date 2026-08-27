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
];

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
