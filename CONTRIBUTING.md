# Contributing

The most valuable contribution is **a coordinate that resolves to the wrong
city**. Open a [wrong-city report](../../issues/new?template=wrong-city.yml) with
the latitude, longitude, what you got, what you expected, and how you know.

## Setup

```sh
npm run build-data   # once — downloads ~21 MB from GeoNames
npm test             # 30 assertions, runs against the committed extract
npm start            # :3000
```

There are no dependencies to install. `package.json` has no `dependencies` block
and should not grow one — Node's standard library covers everything here.

## Changing how places are clubbed

`scripts/assign-cities.mjs` decides which city each place belongs to. Every rule
in it exists because a real place resolved wrongly, and **most are constrained
from both sides**:

- Absorption needs a size ratio *and* footprint distance. Ambattur is 10.04×
  smaller than Chennai and is one of its zones; Kalyan is 10.05× smaller than
  Mumbai and is its own city. Ratio alone cannot separate them.
- `PPLX` is deliberately *not* excluded from city seeds. Excluding it stopped
  Dharavi beating Mumbai but made Navi Mumbai — a planned city of 2.6 M filed
  under the same code — unrepresentable.
- The admin-unit bar must exempt administrative seats. Barring records that carry
  a district's population fixed Kochi, and dropped Kolkata and Chennai to **0%**
  until seats were exempted.

So: **add the locality to `test.js` first**, watch it fail, then change the rule.
A green suite proves only that the cases someone already thought of still pass —
when in doubt, run a breadth sweep across many metros, not just the case you are
fixing.

## Refreshing the data

```sh
npm run build-data
```

`data/` is committed on purpose: the static demo fetches it over HTTP, and CI
runs tests without pulling from GeoNames. A refresh producing a data diff is
expected.

## Attribution

Place data is GeoNames, CC BY 4.0. Attribution is a licence condition, not a
courtesy — anything that displays these results needs a visible credit.
