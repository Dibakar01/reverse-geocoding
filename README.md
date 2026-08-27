<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/mascot-dark.svg">
  <img alt="" src="assets/mascot-light.svg" width="104">
</picture>

# Nishaan

**Coordinates in, the city you actually belong to out.**<br>
No Google, no API keys, no external calls, no dependencies.

[![tests](https://img.shields.io/github/actions/workflow/status/Dibakar01/reverse-geocoding/test.yml?branch=main&style=flat-square&label=tests&color=d92819)](../../actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/Dibakar01/reverse-geocoding?style=flat-square&color=d92819)](../../releases)
[![licence MIT](https://img.shields.io/badge/licence-MIT-d92819?style=flat-square)](LICENSE)
[![dependencies 0](https://img.shields.io/badge/dependencies-0-1a1211?style=flat-square)](package.json)
[![data GeoNames CC BY 4.0](https://img.shields.io/badge/data-GeoNames_CC_BY_4.0-7a6a68?style=flat-square)](https://www.geonames.org/)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/demo-dark.png">
  <img alt="The demo: a globe drawn from all 621,128 places as points of light, so the continents are made of the data itself. India glows densest because it holds 558,000 of them. A ring marks the picked point near Mumbai and a panel reads: you are in Mumbai, Khar, Mumbai Suburban district, Maharashtra, India, resolved in 2 ms." src="assets/demo-light.png" width="100%">
</picture>

<sub><b>Spin it. Click anywhere. That is the whole interface.</b><br>
The continents are not a texture — every dot is one of the 621,128 places in the dataset.</sub>

**[Try it live →](https://dibakar01.github.io/reverse-geocoding/demo/)**

</div>

## The demo

**[dibakar01.github.io/reverse-geocoding/demo](https://dibakar01.github.io/reverse-geocoding/demo/)**

One page, no scrolling. Drag to spin, click anywhere on Earth, read your city. It
runs **entirely in your browser** — the extract is fetched once, decompressed with
`DecompressionStream`, and every lookup after that happens on your device.
Nothing is sent anywhere.

The globe *is* the dataset. All 621,128 coordinates go to the GPU as a point
buffer and are drawn on a sphere, so the coastlines emerge from the data rather
than from an image — which is why India glows brightest, holding 558,000 of them.
It is **raw WebGL with hand-written matrix maths**: no Three.js, no library, so
the zero-dependency rule holds in the demo too. Browsers without WebGL get
coordinate entry rather than a blank page.

Picking inverts drawing exactly — screen to ray, ray to sphere, then the same
rotation undone by transposing it. Round-tripping four cities through `spinTo`
and picking the canvas centre returns the original coordinates to two decimals.

**Nishaan**, the mascot, blinks while idle and bounces when an answer lands. Both
stop under `prefers-reduced-motion`. Expect ~240 MB of tab memory while the index
is held: comfortable on a laptop, heavy on an old phone.

## Run it

```sh
npm run build-data   # once: downloads ~21 MB from GeoNames, builds data/
npm start            # :3000
npm test             # 30 assertions
```

```sh
curl 'localhost:3000/reverse?lat=22.5800&lon=88.4200'
```

```json
{
  "locality": "Salt Lake City",
  "district": "North 24 Parganas",
  "city": "Kolkata",
  "state": "West Bengal",
  "country": "India",
  "displayName": "Salt Lake City, Kolkata, West Bengal, India"
}
```

Salt Lake is administratively in **North 24 Parganas**, not Kolkata district. It
is still Kolkata. That gap between the administrative answer and the true one is
the whole problem this solves.

## Which city do I belong to?

Not "what is nearest". Nearest gives you *Dam Dam* for Salt Lake and *Dharavi*
for Bandra. Belonging is a question about **orbit** — whose pull are you in?

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-animated-dark.svg">
  <img alt="Coordinates go in and the city they belong to comes out. Koramangala resolves to Bengaluru, Salt Lake City to Kolkata, Vashi to Navi Mumbai. 621,128 places, 0.7 ms per lookup, zero dependencies." src="assets/hero-animated-light.svg" width="100%">
</picture>

```
score = population / distance²        ×1.6 if the city is in your own district
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/rules-dark.svg">
  <img alt="Four rules decide where a place belongs. One, never across a state line: Delhi outweighs Noida from 20 km, but Noida is in Uttar Pradesh and is its own city. Two, districts weigh rather than rule: obey them and Salt Lake leaves Kolkata, ignore them and Noida joins Delhi, so they act as a 1.6x weight. Three, size alone cannot spot a suburb: Ambattur is 10.04x smaller than Chennai and is one of its zones, Kalyan is 10.05x smaller than Mumbai and is its own city. Four, distance decides it: absorption needs both a size ratio and closeness within the parent city footprint." src="assets/rules-light.svg" width="100%">
</picture>

### How a place finds its city

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/flow-dark.svg">
  <img alt="How places are clubbed: 124,057 by orbit, 465,069 by their district's largest city, 32,002 with no parent city." src="assets/flow-light.svg" width="100%">
</picture>

Computed **once, at build time**, and stored as a row index. So the mapping is
fixed and inspectable, the same locality always resolves to the same city, and
the runtime lookup is a plain nearest-neighbour scan with no scoring in it.

## Accuracy

An independent audit of 37 well-known localities found the first version unfit to
ship — Delhi resolved correctly for under half its own area. Both rules measured
over the same points and the same data, 121 samples within ~10 km of each centre:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/accuracy-dark.svg">
  <img alt="Share of points near each metro that resolve to it, nearest big place versus clubbed to a city, in percent: Delhi 17 to 99, Mumbai 79 to 97, Bengaluru 82 to 97, Chennai 49 to 100, Kolkata 26 to 88, Hyderabad 39 to 99, Pune 81 to 88, Ahmedabad 99 to 100, Kochi 61 to 77. Mean rises from 59 to 94 percent." src="assets/accuracy-light.svg" width="100%">
</picture>

Mean metro accuracy goes from **59% to 94%**. The chart is generated by
`npm run measure`, so it cannot drift from the code.

Three separate causes, each needing its own fix:

- **Suburbs claimed themselves.** A city wins itself at distance zero, so every
  suburb over 20 k became a "city" — Borivli instead of Mumbai, Bopal instead of
  Ahmedabad. Fixed by the ratio-plus-footprint rule above.
- **`PPLX` was excluded outright.** It stopped Dharavi beating Mumbai, but
  GeoNames files **Navi Mumbai**, a planned city of 2.6 M, under the same code.
  Dominance separates them properly, so the exclusion is gone.
- **Taluks masquerading as towns.** GeoNames lists *Kanayannur* at 851,406 —
  larger than Kochi's 633,553 — because that is the taluk's population. Such
  records are barred, detected by an exact population match against a same-named
  `ADM2`/`ADM3` unit, never a hand-written list. Administrative seats are exempt:
  Kolkata and Chennai are coterminous with the units they head, and barring them
  dropped both to 0%.

## Why offline

| | Nishaan | Nominatim | Photon / Pelias |
|---|---|---|---|
| Cost | free | free | server bill |
| Rate limit | none | 1 req/sec | none |
| Runtime calls | **none** | every lookup | local |
| Setup | `npm run build-data` | none | Elasticsearch + multi-GB import |

A 1 req/sec cap shared by two production sites is a queue and a dependency that
can throttle or vanish. Photon and Pelias mean running Elasticsearch for
street-level precision this never needed.

## Data

| Source | Rows | Why |
|---|---:|---|
| GeoNames `IN.zip`, class P | 557,995 | every populated place in India, down to neighbourhoods |
| GeoNames `cities5000`, minus India | 63,133 | rest of the world, population ≥ 5,000 |

**621,128 places, 8.2 MB gzipped.** India uses the full country gazetteer rather
than `cities1000`, which holds only 7,068 Indian places and no neighbourhoods —
the difference between "Bengaluru" and "Koramangala, Bengaluru".

## API

**`GET /reverse?lat=<-90..90>&lon=<-180..180>`** → the JSON above. `400` on a bad
coordinate, `404` on an unknown path, `Access-Control-Allow-Origin: *`.

**`GET /health`** → `{ "ok": true, "places": 621128, "cached": 42 }`

Results are cached in memory by coordinates rounded to 4 dp (~11 m), flushed to
`cache.json` every 10 s and on shutdown. An unreadable or unwritable cache is
logged and ignored, never fatal.

## Connect your app

Click any point in the demo, open **`</> API`**, and it hands you working code for
that exact coordinate — cURL, JavaScript, React, Node or Python. Change the host
field and every snippet updates. The live response sits underneath, so what you
copy is what you will get.

<picture>
  <img alt="The demo's API panel open beside the globe. A point near Kolkata is picked, and the panel shows a JavaScript fetch snippet for lat 22.58, lon 88.42 with a copy button, and below it the live JSON response: locality Salt Lake City, district North 24 Parganas, city Kolkata, state West Bengal, country India." src="assets/connect-light.png" width="100%">
</picture>

### Drop-in connectors

[`connectors/`](connectors/) holds real clients, not snippets. Each one caches by
rounded coordinate, times out rather than hanging, and validates the range before
making a request.

| File | For | Notes |
|---|---|---|
| [`browser.js`](connectors/browser.js) | Any web page | `reverseGeocode()` and `locateUser()`, abortable, typed `GeocodeError` |
| [`react.js`](connectors/react.js) | React 16.8+ | `useReverseGeocode(lat, lon)` and `useMyCity()`, cancels superseded requests |
| [`node.mjs`](connectors/node.mjs) | Node 18+ | adds `reverseAll()` for bulk enrichment with bounded concurrency |
| [`client.py`](connectors/client.py) | Python 3.9+ | standard library only — no `requests` |

```js
import { locateUser } from './connectors/browser.js';

const place = await locateUser({ base: 'https://your-host' });
document.querySelector('#city').textContent = place.city;
```

```python
from client import ReverseGeocoder

geo = ReverseGeocoder("https://your-host")
print(geo.reverse(22.5800, 88.4200)["city"])      # Kolkata
```

### OpenAPI

[`openapi.yaml`](openapi.yaml) describes both endpoints, so Postman, Insomnia and
client generators can import the API directly rather than being hand-wired.

There is **no authentication and no rate limit** — the service answers from an
in-process dataset and makes no outbound calls, so there is no key to manage and
nothing to bill. Put a proxy in front if you expose it publicly.

## Deploy

```sh
docker build -t nishaan . && docker run -p 3000:3000 nishaan
```

GeoNames is downloaded and trimmed in a build stage, so `curl` and `unzip` never
reach the final image. Railway detects the `Dockerfile` with no further
configuration; budget 512 MB. A `systemd` unit for a plain VPS is in
[`CLAUDE.md`](CLAUDE.md).

## Layout

```
core.js                   shared lookup — indexing and nearest-neighbour scan
geocode.js                Node entry point: reads data/ from disk
server.js                 HTTP endpoint, validation, caching
test.js                   30 assertions, most of them city-clubbing cases
scripts/assign-cities.mjs clubs every place to a parent city, at build time
scripts/measure-accuracy.mjs  scores both rules over identical points
scripts/build-figures.mjs generates the README figures from that measurement
demo/globe.js             the globe — raw WebGL, no library
connectors/               drop-in clients: browser, React, Node, Python
openapi.yaml              machine-readable API description
data/                     the extract, committed so the demo can fetch it
```

## Limits

- **City-level, not street-level.** No house numbers, roads or postcodes.
- **Nearest place, not point-in-polygon.** Near a border the state can be wrong.
- **Coverage outside India is coarse** — population ≥ 5,000 only.
- **~5% of places have no parent city**, mostly remote districts with no town
  over 20,000. There `city` repeats `locality` rather than inventing one.
- **Populations are GeoNames' own and often stale**, and they drive the
  clustering. Noida is listed at 294 k against a real figure several times that.

## Contributing

The most valuable contribution is **a coordinate that resolves to the wrong
city** — [report one](../../issues/new?template=wrong-city.yml). Every rule in
`scripts/assign-cities.mjs` exists because a real place resolved wrongly, and
most are constrained from both sides. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [SECURITY.md](SECURITY.md).

## Attribution

Data from [GeoNames](https://www.geonames.org/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). **Attribution is a
licence condition.** Any site showing these results needs a visible credit:

```html
Location data © <a href="https://www.geonames.org/">GeoNames</a>,
licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
```

No OpenStreetMap data is used, so no ODbL obligation and no Nominatim usage
policy applies. The code is [MIT](LICENSE); the data licence is separate and
stays with GeoNames.

<div align="center">
<br>
<sub>Changing how places are clubbed? Add the locality to <code>test.js</code> first —<br>
every rule here exists because a real place was assigned to the wrong city.</sub>
</div>
