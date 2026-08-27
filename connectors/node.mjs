// Node connector, for server-side rendering or backend enrichment.
//
//   import { createClient } from './node.mjs';
//   const geo = createClient({ base: 'http://localhost:3000' });
//   const place = await geo.reverse(19.0760, 72.8777);
//
// Node 18+ (global fetch). No dependencies.

export function createClient({ base = 'http://localhost:3000', timeout = 8000, cacheSize = 5000 } = {}) {
  const cache = new Map();

  async function reverse(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error('lat must be -90..90 and lon -180..180');
    }
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const res = await fetch(`${base}/reverse?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `Reverse geocode failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const place = await res.json();
    // Crude bound: clear rather than evict. A cold start costs one lookup.
    if (cache.size >= cacheSize) cache.clear();
    cache.set(key, place);
    return place;
  }

  // Enrich many rows without stampeding the service.
  async function reverseAll(points, { concurrency = 8 } = {}) {
    const out = new Array(points.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, points.length) }, async () => {
      while (next < points.length) {
        const i = next++;
        const [lat, lon] = points[i];
        out[i] = await reverse(lat, lon).catch((error) => ({ error: error.message }));
      }
    }));
    return out;
  }

  const health = async () => (await fetch(`${base}/health`, { signal: AbortSignal.timeout(timeout) })).json();

  return { reverse, reverseAll, health };
}
