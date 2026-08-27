## What this changes

<!-- One or two lines. -->

## If you changed how places are clubbed

Every rule in `scripts/assign-cities.mjs` exists because a real place resolved to
the wrong city, and each one is load-bearing in both directions — the thresholds
are pinned by tests on both sides.

- [ ] Added the locality to `test.js` **before** changing the rule
- [ ] `npm run build-data && npm test` passes
- [ ] Checked the change did not regress other metros

Rules are cheap to add and expensive to remove. If a threshold moved, say which
places justify the new value and which ones constrain it from the other side.
