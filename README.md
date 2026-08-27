# Reverse Geocoding

A self-hosted reverse geocoder for `artist.qalakaar.com` and `quest.qalakaar.com`.
Give it a latitude and longitude, get back a human-readable place.

```
GET /reverse?lat=12.9352&lon=77.6245
→ {"locality":"Koramangala","city":"Bengaluru","state":"Karnataka",
   "country":"India","displayName":"Koramangala, Bengaluru, Karnataka, India"}
```

No Google APIs, no keys, no external calls at runtime, no npm dependencies.

## Why this approach

Three options were on the table. This is the first one.

**Offline lookup (chosen).** The service loads a trimmed GeoNames extract into
memory at boot and answers from RAM. Nothing leaves the box, so there is no rate
limit to respect, no third-party outage to absorb, no per-call cost, and no
usage policy to violate. A lookup takes about 0.7 ms.

**Nominatim / a free hosted API (rejected).** OpenStreetMap's public Nominatim
is capped at 1 request per second and its usage policy forbids relying on it for
a production application. Two consumer websites behind a single shared 1 req/sec
bucket is a queue, and a dependency that can throttle or disappear.

**Photon or Pelias (rejected).** Both mean running Elasticsearch and importing a
multi-gigabyte OSM extract, for street-level precision this use case never asked
for. It would cost more to operate than the problem is worth.

No npm reverse-geocoding package is used either. `local-reverse-geocoder` and
friends download the same GeoNames data and add a k-d tree dependency; the whole
lookup is 40 lines and a linear scan is already sub-millisecond.

## Data

| Source | Rows | Why |
|---|---|---|
| GeoNames `IN.zip`, feature class P | 557,995 | Every populated place in India, down to neighbourhoods |
| GeoNames `cities5000.zip`, minus India | 63,133 | Rest of the world, population ≥ 5,000 |

**621,128 places, 7.5 MB gzipped on disk.**

India deliberately uses the full country gazetteer rather than `cities1000`.
`cities1000` holds only 7,068 Indian places — barely more than `cities5000`'s
6,531 — and none of the neighbourhoods. The country dump has Bandra, Andheri
East, Bandra Kurla Complex and Koramangala, which is the difference between
"Mumbai" and "Koramangala, Bengaluru" in the `locality` field.

## Running locally

Requires Node 20+ and `curl`, `unzip`, `awk`, `gzip` for the one-time data build.

```sh
npm run build-data   # downloads ~21 MB from GeoNames, writes data/ (once)
npm start            # listens on :3000
npm test             # 7 assertions over known coordinates
```

```sh
curl 'localhost:3000/reverse?lat=19.0760&lon=72.8777'
curl localhost:3000/health
```

Re-run `npm run build-data` every few months to pick up GeoNames updates.
Nothing else needs to change.

## API

### `GET /reverse?lat=<-90..90>&lon=<-180..180>`

```json
{
  "locality": "Koramangala",
  "city": "Bengaluru",
  "state": "Karnataka",
  "country": "India",
  "displayName": "Koramangala, Bengaluru, Karnataka, India"
}
```

`displayName` is the non-empty fields joined by `, ` with duplicates removed, so
a point in central Mumbai reads `Mumbai, Maharashtra, India`, not
`Mumbai, Mumbai, Maharashtra, India`.

Spot-checked against real Indian coordinates:

```
Colaba, Mumbai        -> Colaba, Mumbai, Maharashtra, India
Andheri East, Mumbai  -> Andheri East, Mumbai, Maharashtra, India
Koramangala, Blr      -> Koramangala, Bengaluru, Karnataka, India
Connaught Place       -> Connaught Place, New Delhi, Delhi, India
T Nagar, Chennai      -> Thyagaraya Nagar, Chennai, Tamil Nadu, India
Banjara Hills, Hyd    -> Banjara Hills, Hyderabad, Telangana, India
```

`400` on a missing or out-of-range coordinate, `404` on an unknown path.
`Access-Control-Allow-Origin: *` is set so browsers can call it directly, and
responses carry `Cache-Control: public, max-age=86400`.

### `GET /health`

```json
{ "ok": true, "places": 621128, "cached": 42 }
```

## Caching

Results are cached in memory, keyed by coordinates rounded to 4 decimal places
(~11 m — finer than city-level data can justify). The map is flushed to
`cache.json` every 10 seconds and on `SIGINT`/`SIGTERM`, and reloaded at boot, so
a restart keeps its hit rate. Set `CACHE_FILE` to move it. The cache is only ever
a cache: an unreadable or unwritable file is logged and ignored rather than
crashing the service.

At 100,000 entries the cache clears wholesale rather than evicting an LRU. That
is deliberate — with a 0.7 ms miss, a periodic cold start is cheaper than the
bookkeeping.

## Using it from the two websites

`client.js` is a drop-in ES module. Point `GEOCODER` at your deployment:

```js
const GEOCODER = 'https://geocode.qalakaar.com';

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const url = `${GEOCODER}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
  return res.json();
}
```

The common case, turning the browser's own position into something readable:

```js
import { reverseGeocode } from './client.js';

navigator.geolocation.getCurrentPosition(async (pos) => {
  const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
  document.querySelector('#location').textContent = place.displayName;
});
```

`client.js` also exports `locateUser()`, which wraps both steps and rejects if
the browser denies permission.

CORS is open to `*`. The endpoint is read-only and costs nothing per call, so
this is deliberate. To lock it to your own origins, replace the wildcard in
`send()` in `server.js` with a check against an allow-list.

## Deploying

### Docker

```sh
docker build -t reverse-geocoding .
docker run -p 3000:3000 reverse-geocoding
```

The GeoNames download and extract happen in a build stage, so `curl` and `unzip`
never reach the final image and the container starts with its data already
baked in. The container writes its cache to `/tmp/cache.json`, which does not
survive a restart; mount a volume and set `CACHE_FILE` to keep it.

> Not yet verified — Docker was not installed on the machine this was built on.
> The build script it runs was tested standalone against the same file set the
> stage copies.

### Railway

Railway detects the `Dockerfile` and needs no further configuration.

```sh
railway init
railway up
railway domain
```

`PORT` is injected by Railway and read automatically. Budget at least 512 MB of
RAM: the process settles around 290 MB resident (see below). Add a volume
mounted at `/data` with `CACHE_FILE=/data/cache.json` if you want the disk cache
to survive deploys — it is a pure optimisation, not a requirement.

### VPS with systemd

```sh
git clone <repo> /opt/reverse-geocoding && cd /opt/reverse-geocoding
npm run build-data
```

```ini
# /etc/systemd/system/reverse-geocoding.service
[Service]
WorkingDirectory=/opt/reverse-geocoding
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```sh
systemctl enable --now reverse-geocoding
```

Put nginx or Caddy in front for TLS. The process is single-threaded; one
instance handles far more than these two sites will produce, but `PORT`-shifted
replicas behind the proxy scale it if that ever changes.

## Attribution

This service uses data from [GeoNames](https://www.geonames.org/), licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). **Attribution is
a licence condition, not a courtesy.** Both websites must carry a visible credit
wherever geocoded results are shown — a footer line is enough:

```html
Location data © <a href="https://www.geonames.org/">GeoNames</a>,
licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
```

GeoNames provides the data "as is" without warranty of accuracy, timeliness or
completeness.

No OpenStreetMap data is used, so no OSM/ODbL attribution applies and there is no
Nominatim usage policy in play — no rate limit, no `User-Agent` requirement. If
you ever add a hosted API as a fallback, both obligations return.

## Known accuracy limits

Be honest with users about what this can and cannot tell them.

- **City-level, not street-level.** There are no house numbers, roads, postcodes
  or building names, and there is no way to add them without approach 3.
- **Nearest place, not point-in-polygon.** The answer is the closest gazetteer
  entry, not the region the point provably falls inside. Within a few kilometres
  of a state or national border the `state` and `country` can be wrong, because
  the nearest town may sit on the other side of the line.
- **Coverage outside India is coarse.** The rest of the world only carries places
  above 5,000 population, so a point in rural Nebraska or the Australian outback
  may resolve to a town tens of kilometres away, reported without any hint of the
  distance.
- **`city` is a heuristic.** It is the nearest place that has ≥100,000 people, is
  not a neighbourhood (GeoNames `PPLX`), and lies within ~100 km. Where no such
  place exists, `city` repeats `locality` rather than inventing one. The
  neighbourhood exclusion matters: Dharavi has 700,000 residents and is a
  district of Mumbai, not a city.
- **Points at sea return the nearest land.** There is no "no result" for open
  ocean, and no distance is reported, so a point 400 km offshore looks the same
  as one downtown. Validate coordinates upstream if that matters.
- **Names are ASCII.** GeoNames' `asciiname` is used, so `Aligarh`, not
  `Alīgarh`. Half of all Indian place names carry diacritics and the plain
  spellings are the ones readers expect.
- **Populations are stale.** GeoNames figures come from assorted censuses of
  varying age, which shifts the `city` threshold in fast-growing towns.
- **Individual GeoNames records are occasionally wrong, and `locality` wears
  it.** India's gazetteer was bulk-imported, and a few entries are roads
  (`Nrupathunga Rd`), landmarks (`Badami House`) or simply misplaced — one
  record for `Dobbespet`, a town 40 km away, sits in the middle of Bengaluru. In
  a dense city centre the nearest record is sometimes one of these. There is no
  field that separates them: `Koramangala` and `Nrupathunga Rd` are byte-for-byte
  the same shape — feature code `PPL`, population `0`, same import date. Filtering
  by name was measured and rejected: it caught 81 records out of 557,995 and 7 of
  those were real towns (`Abu Road`, `Marwar Junction`, `Dehu Road`). `city`,
  `state` and `country` are unaffected, because those come from the 7,134 entries
  that carry a real population. Treat `locality` as a helpful hint and
  `displayName` as the safe thing to show.
- **The extract is a snapshot.** New places appear only when you re-run
  `npm run build-data`.

## The demo page

`demo/` is a static page that runs the geocoder **entirely in the browser** —
it fetches the same extract, decompresses it with `DecompressionStream`, and
calls the same `core.js` the server does. No server, no cold start, nothing sent
anywhere. It exists so the service can be shown to people without hosting it.

Open it locally with any static server from the repo root:

```sh
python3 -m http.server 8099
# then http://127.0.0.1:8099/demo/
```

It downloads ~7.9 MB once, indexes in ~250 ms, and each lookup runs in a few
milliseconds. Expect roughly 240 MB of tab memory while it holds the index, so
it is comfortable on a laptop and heavy on an older phone.

Mascot: **Nishaan** (`demo/mascot.svg`), Hindi/Urdu for *landmark*. Brand red
`#d92819` on white, with a `favicon.svg` variant that stays legible at 16 px.

## Layout

```
core.js               shared lookup — indexing and nearest-neighbour scan
geocode.js            Node entry point: reads data/ from disk, calls core
server.js             HTTP endpoint, validation, caching
client.js             browser client for the two websites
test.js               7 assertions over known coordinates
scripts/build-data.sh downloads and trims the GeoNames extract
data/                 the extract, committed so the static demo can fetch it
demo/                 static browser demo (index.html, app.js, mascot.svg)
```

293 lines for the service, excluding data and the demo page.

`core.js` is deliberately free of `node:` imports so that the server and the
browser demo share one implementation instead of two that drift.

## Resource use

Measured on macOS with Node 24, after loading all 621,128 places:

| | |
|---|---|
| Cold start | ~0.4 s |
| Lookup (cache miss) | ~0.7 ms |
| Lookup (cache hit) | in-memory map read |
| Live data | ~40 MB |
| Resident (RSS) | ~240 MB |

RSS runs well above live data because V8 does not return the pages it touched
while indexing. It does not grow with traffic, and capping the heap
(`--max-old-space-size=96`) still serves correctly, so 512 MB is a safe
allocation. These figures are from macOS; container numbers were not measured.
