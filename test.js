import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup } from './geocode.js';

const cases = [
  { name: 'Mumbai, IN',     lat: 19.0760, lon: 72.8777, city: 'Mumbai',    state: 'Maharashtra', country: 'India' },
  { name: 'Bengaluru, IN',  lat: 12.9716, lon: 77.5946, city: 'Bengaluru', state: 'Karnataka',   country: 'India' },
  { name: 'New Delhi, IN',  lat: 28.6139, lon: 77.2090, city: 'Delhi',     state: 'Delhi',       country: 'India' },
  { name: 'London, UK',     lat: 51.5074, lon: -0.1278, city: 'London',    state: 'England',     country: 'United Kingdom' },
  { name: 'New York, US',   lat: 40.7128, lon: -74.0060, city: 'New York', state: 'New York',    country: 'United States' },
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

test('Bandra resolves to a locality inside Mumbai', () => {
  const r = lookup(19.0596, 72.8295);
  assert.equal(r.city, 'Mumbai');
  assert.notEqual(r.locality, r.city, 'expected a sub-city locality, not just the city again');
});

test('mid-ocean point still returns something, without inventing a city', () => {
  const r = lookup(0, -140);
  assert.ok(r);
  assert.equal(r.locality, r.city, 'no populated place within 100 km, so city falls back to locality');
});
