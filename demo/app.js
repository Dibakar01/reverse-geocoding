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
let picked = { lat: 12.9352, lon: 77.6245 };   // whatever the snippets describe

// The snippets are the whole point of the panel: they must be correct for the
// exact point on screen, so they are generated from it rather than hardcoded.
const SNIPPETS = {
  cURL: (b, la, lo) => `curl '${b}/reverse?lat=${la}&lon=${lo}'`,

  JavaScript: (b, la, lo) => `const res = await fetch(
  '${b}/reverse?lat=${la}&lon=${lo}'
);
const place = await res.json();

console.log(place.city);          // ${geo ? geo.lookup(+la, +lo).city : ''}
console.log(place.displayName);`,

  React: (b, la, lo) => `import { useReverseGeocode } from './connectors/react.js';

function Where() {
  const { place, loading, error } = useReverseGeocode(
    ${la}, ${lo}, { base: '${b}' }
  );

  if (loading) return <p>Locating…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>You are in {place.city}</p>;
}`,

  Node: (b, la, lo) => `import { createClient } from './connectors/node.mjs';

const geo = createClient({ base: '${b}' });
const place = await geo.reverse(${la}, ${lo});

// Enrich many rows without stampeding the service:
const places = await geo.reverseAll(rows.map(r => [r.lat, r.lon]));`,

  Python: (b, la, lo) => `from client import ReverseGeocoder

geo = ReverseGeocoder("${b}")
place = geo.reverse(${la}, ${lo})

print(place["city"])              # ${geo ? geo.lookup(+la, +lo).city : ''}`,
};

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

  picked = { lat, lon };
  renderSnippet();
  $('resp').textContent = JSON.stringify(r, null, 2);
}

let activeTab = 'cURL';

function syncTabs() {
  for (const b of $('tabs').children) b.setAttribute('aria-selected', String(b.textContent === activeTab));
}

function renderSnippet() {
  const base = ($('base').value || 'http://localhost:3000').replace(/\/+$/, '');
  const la = picked.lat.toFixed(4), lo = picked.lon.toFixed(4);
  $('snippet').textContent = SNIPPETS[activeTab](base, la, lo);
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

  // --- integration panel -------------------------------------------------
  const tabs = $('tabs');
  for (const name of Object.keys(SNIPPETS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(name === activeTab));
    b.addEventListener('click', () => { activeTab = name; syncTabs(); renderSnippet(); });
    tabs.append(b);
  }
  syncTabs();
  renderSnippet();

  $('base').addEventListener('input', renderSnippet);
  const openApi = (on) => {
    $('api').classList.toggle('on', on);
    $('api').setAttribute('aria-hidden', String(!on));
  };
  $('apiBtn').addEventListener('click', () => openApi(!$('api').classList.contains('on')));
  $('apiClose').addEventListener('click', () => openApi(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') openApi(false); });

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('snippet').textContent);
      $('copy').textContent = 'Copied';
    } catch {
      $('copy').textContent = 'Press Ctrl+C';   // clipboard blocked without https or permission
    }
    setTimeout(() => { $('copy').textContent = 'Copy'; }, 1400);
  });

  // Exposed so the interface can be driven in tests.
  window.__nishaan = { geo, globe, present, renderSnippet };
})();
