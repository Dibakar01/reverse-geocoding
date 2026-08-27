// Browser entry point. Same core.js the server uses, different way of getting
// the bytes in.
import { createGeocoder } from '../core.js';

const $ = (id) => document.getElementById(id);
const note = $('note');
const say = (msg, isError = false) => {
  note.textContent = msg;
  note.className = isError ? 'note err' : 'note';
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

// India's gazetteer was bulk-imported and a handful of records are roads or
// landmarks rather than places ("Nrupathunga Rd", "Badami House"). They sit at
// city centres, so a nearest-first list surfaces them straight away. This hides
// them from that list only — geocoding still resolves them, which is correct if
// you are actually standing on one.
const INFRASTRUCTURE = /\s(Rd|Road|Flyover|Bridge|Underpass|Subway|Circle|Junction|House)$/;

const PRESETS = [
  ['Koramangala', 12.9352, 77.6245], ['Bandra', 19.0596, 72.8295],
  ['Salt Lake', 22.5800, 88.4200], ['Noida', 28.5355, 77.3910],
  ['Connaught Place', 28.6315, 77.2167], ['T Nagar', 13.0418, 80.2341],
  ['Banjara Hills', 17.4126, 78.4392], ['London', 51.5074, -0.1278],
];

let geo;

function show(lat, lon) {
  const t0 = performance.now();
  const r = geo.lookup(lat, lon);
  const cityIndex = geo.cityIndexAt(lat, lon);
  const ms = performance.now() - t0;
  if (!r) return say('No place found for those coordinates.', true);

  $('city').textContent = r.city;

  // Only say the locality when it adds something the city has not already said.
  const bits = [];
  if (r.locality && r.locality !== r.city) bits.push(r.locality);
  if (r.district && r.district !== r.city) bits.push(`<span>${r.district} district</span>`);
  $('where').innerHTML = bits.join(' · ');
  $('meta').textContent = [r.state, r.country].filter(Boolean).join(', ')
    + ` · ${lat.toFixed(4)}, ${lon.toFixed(4)} · ${ms.toFixed(0)} ms`;

  const also = $('also');
  if (cityIndex >= 0) {
    const members = geo.localitiesOf(cityIndex)
      .filter((m) => m !== r.locality && !INFRASTRUCTURE.test(m));
    if (members.length) {
      const head = members.slice(0, 8).join(', ');
      const rest = members.length - 8;
      $('alsoList').innerHTML = rest > 0 ? `${head} <em>and ${rest.toLocaleString()} more</em>` : head;
      also.hidden = false;
    } else also.hidden = true;
  } else also.hidden = true;

  $('answer').hidden = false;
  say(`${geo.placeCount.toLocaleString()} places loaded, all lookups run on your device.`);
}

function submit() {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return say('Latitude must be between −90 and 90, longitude between −180 and 180.', true);
  }
  show(lat, lon);
}

(async () => {
  try {
    const [places, admin1, admin2, countries] = await Promise.all([
      loadText('../data/places.tsv.gz', (p) => say(`Loading place data… ${Math.round(p * 100)}%`)),
      loadText('../data/admin1CodesASCII.txt'),
      loadText('../data/admin2Codes.txt'),
      loadText('../data/countryInfo.txt'),
    ]);
    say('Indexing places…');
    await new Promise((r) => setTimeout(r, 0)); // let that paint before we block
    geo = createGeocoder({ places, admin1, admin2, countries });
    say(`${geo.placeCount.toLocaleString()} places loaded, all lookups run on your device.`);
  } catch (err) {
    return say(`Could not load place data: ${err.message}`, true);
  }

  $('go').addEventListener('click', submit);
  for (const el of ['lat', 'lon']) {
    $(el).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  $('here').addEventListener('click', () => {
    if (!navigator.geolocation) return say('This browser has no geolocation support.', true);
    say('Asking your browser for a position…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        $('lat').value = pos.coords.latitude.toFixed(4);
        $('lon').value = pos.coords.longitude.toFixed(4);
        submit();
      },
      (err) => say(`Could not get your location: ${err.message}`, true),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });

  const chips = $('chips');
  for (const [label, lat, lon] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
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
