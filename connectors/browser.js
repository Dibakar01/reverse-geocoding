// Browser connector. Drop in, point BASE at your deployment, call it.
//
//   import { reverseGeocode, locateUser } from './browser.js';
//   const place = await reverseGeocode(19.0760, 72.8777);
//
// Results are memoised per coordinate, so repeated lookups of the same point
// cost nothing. Requests are abortable and time out rather than hanging.

const BASE = 'https://your-host';   // <- your deployment

const cache = new Map();
const key = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

export class GeocodeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeocodeError';
    this.status = status;
  }
}

export async function reverseGeocode(lat, lon, { base = BASE, signal, timeout = 8000 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new GeocodeError('lat must be -90..90 and lon -180..180', 400);
  }
  const k = key(lat, lon);
  if (cache.has(k)) return cache.get(k);

  // Time out on our own terms; a hung request should not hang the page.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });

  try {
    const url = `${base}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new GeocodeError(body.error || `Reverse geocode failed`, res.status);
    }
    const place = await res.json();
    cache.set(k, place);
    return place;
  } catch (err) {
    if (err.name === 'AbortError') throw new GeocodeError(`Timed out after ${timeout} ms`, 408);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// The common case: turn the browser's own position into a place.
export function locateUser(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new GeocodeError('Geolocation unavailable', 501));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(reverseGeocode(pos.coords.latitude, pos.coords.longitude, opts)),
      (err) => reject(new GeocodeError(err.message, 403)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000, ...opts.geolocation },
    );
  });
}
