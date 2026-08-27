import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lookup, placeCount } from './geocode.js';

const PORT = Number(process.env.PORT) || 3000;
const CACHE_FILE = process.env.CACHE_FILE || './cache.json';
const CACHE_MAX = 100_000;

// Disk cache is a plain JSON array of [key, value] pairs, flushed periodically.
// It is only ever a cache: if the file is corrupt or the path is not writable we
// say so and carry on, because a 0.7 ms lookup does not justify crashing over it.
const load = () => {
  try {
    return existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : [];
  } catch (err) {
    console.warn(`Ignoring unreadable cache at ${CACHE_FILE}: ${err.message}`);
    return [];
  }
};
const cache = new Map(load());
let dirty = false;

const flush = () => {
  if (!dirty) return;
  try {
    writeFileSync(CACHE_FILE, JSON.stringify([...cache]));
    dirty = false;
  } catch (err) {
    console.warn(`Could not write cache to ${CACHE_FILE}: ${err.message}`);
    dirty = false; // stop retrying every 10s on a path that will not work
  }
};
setInterval(flush, 10_000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flush(); process.exit(0); });
}

const send = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=86400',
  });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') return send(res, 200, { ok: true, places: placeCount, cached: cache.size });
  if (url.pathname !== '/reverse') return send(res, 404, { error: 'Not found. Use GET /reverse?lat=..&lon=..' });

  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return send(res, 400, { error: 'lat must be a number in -90..90 and lon a number in -180..180' });
  }

  // ~11 m of resolution, which is well past what city-level data can justify.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  let result = cache.get(key);
  if (!result) {
    result = lookup(lat, lon);
    if (!result) return send(res, 404, { error: 'No place found' });
    // ponytail: whole-cache reset at the cap. An LRU only earns its keep if
    // the reset ever shows up as a latency spike.
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, result);
    dirty = true;
  }
  send(res, 200, result);
}).listen(PORT, () => {
  console.log(`Reverse geocoder on :${PORT} — ${placeCount.toLocaleString()} places, ${cache.size} cached`);
});
