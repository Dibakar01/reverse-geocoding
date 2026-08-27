// Browser entry point. Same core.js the server uses, different way of getting
// the bytes in.
import { createGeocoder } from '../core.js';

const $ = (id) => document.getElementById(id);
const status = $('status'), bar = $('bar');

const fail = (msg) => {
  status.className = 'status err';
  status.textContent = msg;
};

async function loadText(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (onProgress && total) onProgress(got / total);
  }

  let bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }

  // Some hosts serve .gz with Content-Encoding and the browser has already
  // undone it; others hand over the raw member. Check the magic number rather
  // than assume either way.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser lacks DecompressionStream. Try a current Chrome, Safari or Firefox.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder().decode(bytes);
}

const PRESETS = [
  ['Mumbai', 19.0760, 72.8777],
  ['Koramangala, Bengaluru', 12.9352, 77.6245],
  ['Connaught Place, Delhi', 28.6315, 77.2167],
  ['T Nagar, Chennai', 13.0418, 80.2341],
  ['Banjara Hills, Hyderabad', 17.4126, 78.4392],
  ['Salt Lake, Kolkata', 22.5800, 88.4200],
  ['London', 51.5074, -0.1278],
  ['New York', 40.7128, -74.0060],
];

let geo;

function render(lat, lon) {
  const t0 = performance.now();
  const r = geo.lookup(lat, lon);
  const ms = performance.now() - t0;
  if (!r) return fail('No place found for those coordinates.');

  $('display').textContent = r.displayName;
  $('r-locality').textContent = r.locality;
  $('r-city').textContent = r.city;
  $('r-state').textContent = r.state || '—';
  $('r-country').textContent = r.country || '—';
  $('timing').textContent =
    `${lat.toFixed(4)}, ${lon.toFixed(4)} · scanned ${geo.placeCount.toLocaleString()} places in ${ms.toFixed(1)} ms`;
  $('result').hidden = false;
}

function submit() {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return fail('Latitude must be between -90 and 90, longitude between -180 and 180.');
  }
  status.className = 'status';
  status.textContent = `Ready · ${geo.placeCount.toLocaleString()} places loaded.`;
  render(lat, lon);
}

(async () => {
  try {
    const [places, admin1, countries] = await Promise.all([
      loadText('../data/places.tsv.gz', (p) => { bar.style.width = `${Math.round(p * 100)}%`; }),
      loadText('../data/admin1CodesASCII.txt'),
      loadText('../data/countryInfo.txt'),
    ]);
    status.textContent = 'Indexing places…';
    bar.style.width = '100%';
    // Yield once so the browser paints "Indexing" before the parse blocks it.
    await new Promise((r) => setTimeout(r, 0));

    geo = createGeocoder({ places, admin1, countries });
    status.textContent = `Ready · ${geo.placeCount.toLocaleString()} places loaded.`;
    $('form').disabled = false;
  } catch (err) {
    return fail(`Could not load place data: ${err.message}`);
  }

  $('go').addEventListener('click', submit);
  for (const el of ['lat', 'lon']) {
    $(el).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  $('here').addEventListener('click', () => {
    if (!navigator.geolocation) return fail('This browser has no geolocation support.');
    status.textContent = 'Asking your browser for a position…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        $('lat').value = pos.coords.latitude.toFixed(4);
        $('lon').value = pos.coords.longitude.toFixed(4);
        submit();
      },
      (err) => fail(`Could not get your location: ${err.message}`),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });

  const chips = $('chips');
  for (const [label, lat, lon] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.addEventListener('click', () => {
      $('lat').value = lat;
      $('lon').value = lon;
      submit();
    });
    chips.append(b);
  }
  chips.hidden = false;
})();
