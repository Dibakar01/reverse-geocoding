// Browser entry point. Same core.js the server runs, plus a globe drawn from
// the same coordinates the lookup scans.
import { createGeocoder } from '../core.js';
import { createGlobe } from './globe.js';

const $ = (id) => document.getElementById(id);
const say = (m) => { $('status').textContent = m; };

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
    chunks.push(value); got += value.length;
    if (onProgress && total) onProgress(got / total);
  }
  let bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  // Some hosts serve .gz already decoded, others hand over the raw member.
  // Check the magic number rather than assume either way.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser lacks DecompressionStream.');
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(s).arrayBuffer());
  }
  return new TextDecoder().decode(bytes);
}

let geo, globe;

function present(lat, lon, { spin = false } = {}) {
  const t0 = performance.now();
  const r = geo.lookup(lat, lon);
  const ms = performance.now() - t0;
  if (!r) return;

  $('city').textContent = r.city;
  const bits = [];
  if (r.locality && r.locality !== r.city) bits.push(r.locality);
  if (r.district && r.district !== r.city) bits.push(`<span>${r.district} district</span>`);
  $('where').innerHTML = bits.join(' · ') || `<span>${[r.state, r.country].filter(Boolean).join(', ')}</span>`;
  $('meta').textContent = `${[r.state, r.country].filter(Boolean).join(', ')} · ${lat.toFixed(3)}, ${lon.toFixed(3)} · ${ms.toFixed(0)} ms`;
  $('answer').classList.add('on');

  // Nishaan reacts, which is the only feedback that a click registered.
  const pin = $('pin');
  pin.classList.remove('hit');
  void pin.offsetWidth;              // restart the animation
  pin.classList.add('hit');

  if (globe) {
    globe.setMarker(lat, lon);          // show where the answer came from
    if (spin) globe.spinTo(lat, lon);
  }
}

function fallbackMode(message) {
  say(message);
  $('fallback').style.display = 'block';
  $('bar').parentElement.style.display = 'none';
  $('go').addEventListener('click', () => {
    const lat = Number($('lat').value), lon = Number($('lon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return say('Latitude −90..90, longitude −180..180.');
    }
    $('loading').classList.add('gone');
    present(lat, lon);
  });
}

(async () => {
  try {
    const [places, admin1, admin2, countries] = await Promise.all([
      loadText('../data/places.tsv.gz', (p) => { $('bar').style.width = `${Math.round(p * 92)}%`; }),
      loadText('../data/admin1CodesASCII.txt'),
      loadText('../data/admin2Codes.txt'),
      loadText('../data/countryInfo.txt'),
    ]);
    say('Indexing…');
    $('bar').style.width = '96%';
    await new Promise((r) => setTimeout(r, 0));   // let that paint before we block
    geo = createGeocoder({ places, admin1, admin2, countries });
    $('bar').style.width = '100%';
  } catch (err) {
    return fallbackMode(`Could not load place data: ${err.message}`);
  }

  const canvas = $('globe');
  try {
    globe = createGlobe(canvas, geo.coords(), { near: '#d92819', far: '#c9b8b4' });
  } catch (err) {
    globe = null;
  }
  if (!globe) return fallbackMode('This browser has no WebGL, so the globe is unavailable.');

  $('loading').classList.add('gone');
  present(12.9352, 77.6245);           // open on Koramangala, already in view

  // Drag to spin. A click that did not drag is a pick.
  let down = null, moved = 0;
  const pos = (e) => (e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });
  const start = (e) => { down = pos(e); moved = 0; canvas.classList.add('dragging'); };
  const move = (e) => {
    if (!down) return;
    const p = pos(e);
    moved += Math.abs(p.x - down.x) + Math.abs(p.y - down.y);
    globe.drag(p.x - down.x, p.y - down.y);
    down = p;
    if (e.cancelable) e.preventDefault();
  };
  const end = (e) => {
    canvas.classList.remove('dragging');
    if (down && moved < 5) {
      const p = e.changedTouches ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY } : { x: e.clientX, y: e.clientY };
      const hit = globe.pick(p.x, p.y);
      if (hit) present(hit.lat, hit.lon);
      else $('hint').textContent = 'That was past the edge — try on the globe';
    }
    down = null;
  };
  canvas.addEventListener('pointerdown', start);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);

  $('here').addEventListener('click', () => {
    if (!navigator.geolocation) { $('hint').textContent = 'No geolocation in this browser'; return; }
    $('hint').textContent = 'Asking your browser…';
    navigator.geolocation.getCurrentPosition(
      (p) => { $('hint').textContent = 'Drag to spin · click anywhere'; present(p.coords.latitude, p.coords.longitude, { spin: true }); },
      (err) => { $('hint').textContent = `Location unavailable: ${err.message}`; },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });

  // Exposed so the interface can be driven in tests.
  window.__nishaan = { geo, globe, present };
})();
