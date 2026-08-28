# Handoff log

Context preserved across sessions for `reverse-geocoding` (Nishaan).

---

## Handoff: 2026-08-27

### Current Task State

**Shipped and stable.** An offline reverse geocoder that answers *which city a
coordinate belongs to*, plus a single-page WebGL globe demo and drop-in
connectors. Working tree clean, `main` pushed, CI green, `v1.0.0` tagged.

- Repo: https://github.com/Dibakar01/reverse-geocoding (public)
- Live demo: https://dibakar01.github.io/reverse-geocoding/demo/
- 30/30 tests, 621,128 places, ~0.7 ms per lookup, **zero npm dependencies**

The **HTTP API is not hosted anywhere** and does not need to be yet. GitHub Pages
serves static files only, so `/reverse` 404s there; the demo sidesteps this by
geocoding in the browser. The API becomes necessary only when
`artist.qalakaar.com` / `quest.qalakaar.com` integrate for real.

### Key Decisions

- **Approach 1 (offline GeoNames), implemented directly, not via an npm package.**
  Nominatim's 1 req/sec cap is a single point of failure for two production
  sites; Photon/Pelias means Elasticsearch for precision never needed;
  `local-reverse-geocoder` downloads the same data and adds a k-d tree dep.
- **India uses the full country gazetteer, not `cities1000`.** `cities1000` holds
  only 7,068 Indian places and no neighbourhoods; `IN.zip` holds 557,995.
- **`city` is a precomputed mapping, not a runtime rule.** `scripts/assign-cities.mjs`
  clubs each place at build time; `core.js` reads a stored row index. Do not
  reintroduce scoring into the lookup.
- **Districts weigh, they do not rule (1.6x).** Obeying them strictly ejects Salt
  Lake from Kolkata; pure gravity lets Delhi swallow Noida. Only the weighted
  form gets both right.
- **Absorption needs size ratio AND footprint distance.** Ambattur is 10.04x
  smaller than Chennai and is one of its zones; Kalyan is 10.05x smaller than
  Mumbai and is its own city. `DOMINANCE = 8` + `FOOTPRINT = 1.5`.
- **`PPLX` is NOT excluded from city seeds.** It used to be, to stop Dharavi
  beating Mumbai — but Navi Mumbai (2.6 M) is filed as `PPLX` too.
- **Admin-unit bar must exempt `PPLA*`/`PPLC` seats.** Barring records that carry
  a district's population fixed Kochi but dropped Kolkata and Chennai to **0%**
  until seats were exempted.
- **`core.js` has no `node:` imports on purpose** — the server and the browser
  demo share one implementation.
- **`data/` is committed** (8.2 MB) so the static demo can fetch it and CI needs
  no GeoNames download.
- **Rejected the Kaggle "Geolocations of Indian Cities" dataset.** It is a 2020
  GeoNames export; 3,507 of its 3,508 rows are already held, and its populations
  would demote 101 city seeds and halve Bengaluru/Hyderabad/Ahmedabad.
- **Rejected a fleet of agents** for the clubbing rewrite: serial fraction ~85%,
  Amdahl caps the win at ~1.2x. One fresh-context auditor was used instead, and
  it found real bugs.
- **Rejected Vercel.** Hobby prohibits commercial use (qalakaar sites are
  commercial) so it would cost $20/mo Pro, and serverless cold starts re-pay the
  ~250 ms index every time. This service wants a long-lived process.

### Modified Files

Everything is new this session. Core:

- `core.js` — shared lookup: indexing, nearest-neighbour scan, `localitiesOf`,
  `cityIndexAt`, `coords`. No `node:` imports.
- `geocode.js` — Node entry: reads `data/`, calls `createGeocoder`.
- `server.js` — HTTP layer, validation, in-memory + disk cache.
- `test.js` — 30 assertions, most of them city-clubbing regressions.
- `scripts/assign-cities.mjs` — the clubbing algorithm (orbit + district weight +
  dominance demotion + duplicate-root merge + fixpoint flattening).
- `scripts/build-data.sh` — downloads and trims GeoNames, pipes through the above.
- `scripts/measure-accuracy.mjs` — scores the old heuristic and the new clubbing
  over identical points; the README chart is generated from it.
- `scripts/build-figures.mjs` — generates all README SVGs in both themes.

Demo (single page, no scrolling):

- `demo/globe.js` — raw WebGL globe, hand-written matrix maths, ~210 lines.
- `demo/index.html`, `demo/app.js` — interface, API panel, Nishaan animations.

Integration:

- `connectors/{browser.js,react.js,node.mjs,client.py}` — drop-in clients.
- `openapi.yaml` — machine-readable API description.

Repo hygiene: `LICENSE` (MIT), `NOTICE` (GeoNames CC BY 4.0), `CONTRIBUTING.md`,
`SECURITY.md`, `CHANGELOG.md`, `.github/workflows/{test,verify-data}.yml`,
`.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `Dockerfile`,
`railway.json`, `assets/*` (12 generated figures + screenshots).

### Blockers / Open Questions

- **Social preview must be uploaded by hand.** GitHub has no API for it:
  Settings → General → Social preview → upload `assets/social-preview.png`.
  This is the only outstanding manual step.
- **API hosting undecided, and deliberately so.** Railway's trial on account
  `qalakaarx` expired; Vercel rejected (above). Not needed until the two sites
  integrate. `Dockerfile` runs anywhere when that time comes.
- **Docker image still never actually built** — no Docker on this machine. The
  file set was verified by simulation (see Critical Context), and stage 1's awk
  runs under macOS BWK awk, but Alpine busybox awk is unexercised.
- **Two known mis-assignments, both upstream data faults**, documented in README:
  Fort Kochi (GeoNames lists the Kanayannur taluk larger than Kochi — now fixed
  by the admin-unit bar, but the class of fault remains) and any place where
  GeoNames populations are badly stale (Noida is listed at 294 k).

### Next Steps

1. **Upload the social preview** (2 clicks, link above). Only manual item left.
2. **Decide API hosting when the sites integrate** — Railway Hobby ($5/mo) or a
   VPS you already pay for. Do not use Vercel Hobby (commercial-use ban).
3. **Build the Docker image once somewhere with Docker** to close the last
   unverified path. If stage 1 fails on busybox awk, the fallback is to `COPY`
   the committed `data/` instead of rebuilding it.
4. **Add GeoNames attribution to both websites** before shipping results — it is
   a licence condition, not a courtesy. Snippet is in the README.
5. Optional: alias search ("Bombay" → Mumbai) from GeoNames `alternatenames/IN.zip`
   (1.4 MB, current, same licence). Was scoped but not requested.

### Critical Context

- **`npm run build-data` is required in a fresh checkout** before `npm start` /
  `npm test`… except `data/` is committed, so it usually just works. Re-running it
  produces a data diff; that is expected on a GeoNames refresh.
- **The clubbing thresholds are constrained from BOTH sides.** Tests pin them.
  Lowering `DOMINANCE` below ~10 absorbs Kalyan-Dombivli into Mumbai (wrong);
  raising it lets Borivli claim itself (also wrong). Read the "Things that look
  like bugs but are not" section of `CLAUDE.md` before touching them.
- **Do not add a name-based filter for road-like localities.** Measured: an
  infrastructure regex matched 81 of 557,995 India records and 7 were real towns
  (`Abu Road`, `Marwar Junction`, `Dehu Road`). The demo filters them for display
  only, in `demo/app.js`.
- **Verification gotcha:** headless Chrome `--virtual-time-budget` freezes timers
  once exhausted, producing screenshots that look exactly like a hung page. Use
  CDP `Runtime.evaluate` polling in real time instead. This cost real time once.
- **Docker image file set was verified without Docker** by copying only the files
  the final stage `COPY`s into a temp dir and booting the server there. Repeat
  that check after changing imports — it is how the missing `core.js` was found.
- **The globe's picking is the exact inverse of its drawing.** If you change
  `toXYZ` or the rotation, re-run the round-trip check: `spinTo(lat,lon)` then
  `pick(centre)` must return the same coordinate to ~2 decimals.
- **Figures are generated, never hand-typed.** `npm run build-figures` regenerates
  every README SVG from `npm run measure`, so numbers cannot drift from code.
- **Session observation log** lives at
  `~/.claude/projects/-Users-dibakar-Claude-Code-Directory-projects-reverse-geocoding/skill-observations/log.md`
  with 7 OPEN observations from this session, unreviewed.

### Model Summary

- Goal: replace Google Maps Geocoding for two Qalakaar sites — lat/lon in,
  `{locality, district, city, state, country, displayName}` out, free, no keys.
- Delivered: offline geocoder over 621,128 GeoNames places, zero npm deps,
  ~0.7 ms lookups, 30/30 tests, MIT, `v1.0.0` tagged, CI green.
- The hard problem was **city membership**, not nearest-place: solved by a
  build-time clubbing pass (orbit score, district weight, state constraint,
  dominance demotion, district fallback) reaching 94.8% coverage.
- An **independent auditor called v1 unfit to ship** (Delhi 48%, Kochi 7%); three
  distinct bugs were found and fixed, taking mean metro accuracy 59% → 94%.
- My own 14 passing tests missed all of it — breadth against real geography
  found what adversarial depth did not.
- Demo rebuilt as a **single-page raw-WebGL globe** drawn from the dataset
  itself; drag to spin, click to geocode, no scrolling, no library.
- An in-demo **API panel** generates working cURL/JS/React/Node/Python code for
  the exact point picked; `connectors/` holds tested drop-in clients.
- Repo shipped as a product: About box, licence detected, community files, issue
  forms, PR template, release, OpenAPI spec, generated brand figures.
- **Demo is hosted (GitHub Pages, free, no sleep); the HTTP API is not** and is
  not needed yet.
- Blocked only on: manual social-preview upload; an API host decision deferred by
  choice; the Docker image never built for want of Docker locally.
- Kaggle dataset evaluated and **correctly rejected** — staler subset of the same
  source; adopting it would have demoted 101 city seeds.
- Just fixed: the Docker image was missing `core.js` and would have crashed on
  startup; also cleared a committed `.pyc`, a dead stub script and `client.js`.

### Handoff Context (paste into next session)

```
Project: ~/Claude/Code Directory/projects/reverse-geocoding  (branch main, clean, pushed)
Repo:    https://github.com/Dibakar01/reverse-geocoding   Live: /demo/ on GitHub Pages
Read CLAUDE.md FIRST — its "Things that look like bugs but are not" section is load-bearing.

Start with:
  npm test                  # expect 30/30; data/ is committed so no download needed
  npm start                 # :3000, then curl 'localhost:3000/reverse?lat=22.58&lon=88.42'
  npm run measure           # regenerates the accuracy numbers the README chart uses

Hard constraints — do not break:
  - package.json has NO dependencies block. Node stdlib only. The demo's globe is
    raw WebGL for this reason; do not add Three.js.
  - core.js must stay free of node: imports (server AND browser both import it).
  - Never reintroduce scoring into the runtime lookup; city is precomputed.
  - Clubbing thresholds in scripts/assign-cities.mjs are pinned by tests on BOTH
    sides. Add the failing locality to test.js BEFORE changing a rule.
  - GeoNames attribution is a licence condition on any site showing results.

If you change imports, re-verify the Docker file set without Docker:
  mkdir /tmp/sim && cp package.json core.js geocode.js server.js /tmp/sim/ \
    && cp -r data /tmp/sim/ && (cd /tmp/sim && PORT=3131 node server.js)

Outstanding: upload assets/social-preview.png via GitHub Settings > General.
API hosting is deliberately undecided — not needed until the two sites integrate.
```

---
