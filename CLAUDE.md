# reverse-geocoding

Offline reverse geocoder replacing the Google Maps Geocoding API for
`artist.qalakaar.com` and `quest.qalakaar.com`. Lat/lon in,
`{locality, city, state, country, displayName}` out.

## Constraints that are not negotiable

- **Zero runtime dependencies and zero external calls.** `package.json` has no
  `dependencies` block and should not grow one. Node stdlib only.
- **No Google APIs, no API keys, free to run.**
- **Under ~300 lines excluding data files.** Currently 276.
- Ask before adding any data extract over 50 MB. The current one is 7.5 MB
  gzipped; `allCountries.zip` and OSM extracts are far past that line.

## Shape

`geocode.js` loads the GeoNames extract into typed arrays at import time and does
a linear nearest-neighbour scan. `server.js` is the HTTP layer, validation and
cache. `scripts/build-data.sh` produces `data/`, which is generated and
gitignored — run `npm run build-data` before anything else in a fresh checkout,
or `npm start` and `npm test` both fail on missing data.

## Things that look like bugs but are not

- **`city` can equal `locality`.** Deliberate. Where no place with ≥100k people
  sits within ~100 km, repeating the locality is more honest than naming a
  distant city.
- **`PPLX` is excluded from city candidates.** GeoNames marks neighbourhoods as
  `PPLX`, and some are huge — Dharavi has 700,000 residents and would otherwise
  beat Mumbai as the "city" for points in Bandra. Population alone cannot
  classify a place; the feature code can. There is a test for this.
- **Names come from `asciiname`, not `name`.** Half of all Indian place names
  carry diacritics (`Alīgarh`, `Āsansol`) and the plain spellings are the ones
  readers expect.
- **RSS is ~290 MB for ~90 MB of live data.** V8 keeps the pages it touched
  while parsing. Documented in a `ponytail:` comment in `geocode.js`.

- **`locality` is occasionally a road or a misplaced record** in dense city
  centres. Do not add a name-based filter to fix it. That was measured: an
  infrastructure-suffix regex matched 81 of 557,995 India records and 7 were real
  towns (`Abu Road`, `Marwar Junction`, `Dehu Road`). Nothing in the data
  separates `Koramangala` from `Nrupathunga Rd` — identical feature code,
  population and import date. `city`/`state`/`country` are unaffected.

## Working here

- Run `npm test` after changes. It covers the five required cities plus the two
  heuristic boundaries (`PPLX` exclusion and the no-city-nearby fallback), which
  are where the defects actually live.
- GeoNames data is CC BY 4.0. **Attribution on both websites is a licence
  condition.** If a hosted API is ever added as a fallback, its rate limit,
  `User-Agent` policy and attribution all come back into scope.
