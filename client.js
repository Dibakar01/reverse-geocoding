// Drop-in client for artist.qalakaar.com and quest.qalakaar.com.
// Replace GEOCODER with your deployed URL.
const GEOCODER = 'https://geocode.qalakaar.com';

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const url = `${GEOCODER}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
  return res.json(); // { locality, district, city, state, country, displayName }
}

// Typical use: turn the browser's coordinates into something a human can read.
export function locateUser(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(reverseGeocode(pos.coords.latitude, pos.coords.longitude)),
      reject,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000, ...options },
    );
  });
}
