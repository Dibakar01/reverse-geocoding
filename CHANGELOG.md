# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-08-27

First release. An offline reverse geocoder that answers which city a coordinate
belongs to, with no external API and no dependencies.

### Added

- Reverse geocoding over 621,128 places — the full India gazetteer plus
  `cities5000` for the rest of the world. `GET /reverse?lat=&lon=` returns
  locality, district, city, state, country and a display name.
- **City clubbing**, precomputed at build time: every place is assigned to the
  city whose orbit it sits in — population over distance squared, weighted 1.6×
  for its own district, never across a state line — with a fallback to the
  largest city in its own district. 94.8% coverage.
- Suburb absorption by size ratio *and* footprint distance, so Borivali resolves
  to Mumbai while Kalyan stays its own city.
- A bar on settlement records carrying an administrative unit's population,
  detected by an exact match against a same-named `ADM2`/`ADM3`, with
  administrative seats exempted.
- In-memory and disk caching keyed to 4 decimal places.
- A browser demo running the same `core.js` entirely client-side, at
  [dibakar01.github.io/reverse-geocoding/demo](https://dibakar01.github.io/reverse-geocoding/demo/).
- Dockerfile, `railway.json`, and a drop-in browser client.
- 30 tests, most of them city-clubbing cases, plus a structural check that every
  `cityIndex` names a real root.

### Fixed, before release, after an independent audit

An audit of 37 localities found the first cut unfit to ship — Delhi resolved
correctly for under half its own area, Kochi for 7%. Metro accuracy after the
fixes: Delhi 48→99%, Chennai 77→100%, Mumbai 83→100%, Kochi 7→86%,
Kolkata 69→86%, Hyderabad 86→99%, Pune 73→91%, Ahmedabad 93→100%.

### Known limits

- City-level, not street-level. Nearest place, not point-in-polygon.
- ~5% of places have no parent city; there `city` repeats `locality`.
- Coverage outside India is population ≥ 5,000 only.
- GeoNames populations drive the clustering and some are badly stale.

[1.0.0]: https://github.com/Dibakar01/reverse-geocoding/releases/tag/v1.0.0
