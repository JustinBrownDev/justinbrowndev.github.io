# V6 validation record

## Harness regression suites

All passed after the V6 changes:

- `tests/selftest.py` — PASS
- `tests/hardcore_selftest.py` — PASS
- `tests/unified_ingest_selftest.py` — PASS

`RUN_TESTS.sh` exits 0.

## Real city fixture — corrected capture

Saved full JWEB checkout, world seed `671278205`, chunk `16,0`, exact-triangle mode, 192x192:

- neutral batches: **9,319**
- triangles: **120,502**
- semantic connectors: **133**
- stair connectors: **31**
- circulation reservations: **133**
- capture-health errors: **0**
- semantic-authority errors: **0**
- coverage: `mesh-integrity+capture-health+semantic-authority`
- strict geometry result: **PASS**

Collider-only pixels:

- front: **0**
- side: **1**
- top: **0**
- isometric: **1**

The one-pixel edge cases are rasterization/proxy edge noise, not evidence of a broad collision protrusion.

## V5 -> V6 instrument correction proof

Same saved checkout / seed / chunk `16,0`:

- V5 collider-only: front 101, side 140, top 30, isometric 77
- V6 collider-only: front 0, side 1, top 0, isometric 1

Primary causes: V5 interpreted prop `height` as extent rather than absolute top Y and rendered circular prop colliders as square boxes.

## JWEB defect proof — unpatched checkout

The V6 authority path correctly fails on real generator defects:

- chunk `0,0`: semantic authority FAIL; four published mezzanine stair connectors were below their own resolved tread/run truth.
- chunk `24,0`: build FAIL with `JWEB_TOWER_TRANSFER_BINDING_MISSING`.

## JWEB fix proof

After the two minimal JWEB source repairs in `JWEB_HARNESS_FOUND_JWEB_FIXES.patch`:

- `tests/cut21q-sectional-circulation-selftest.mjs` — PASS
- `tests/mezzanine-physical-truth-selftest.mjs` — PASS; 11 valid mezzanines checked across chunks `0,0` and `1,0`
- strict harness authority scan of chunks `0,0;2,0;24,0` — **3/3 PASS**
- separate eight-chunk connector probe (`0,0;1,0;2,0;4,0;8,0;16,0;24,0;32,0`) — **0 tread-fit violations, 0 clear-width violations, 0 malformed reservations** after repair

Before the mezzanine publication gate, seven successfully built sampled chunks contained 30 tread/run violations and 16 clear-width violations among 151 published stair connectors; the eighth sampled chunk (`24,0`) failed earlier during tower-transfer binding.

## Patch portability check

The delivered patch was dry-run and then applied to a separate unpatched copy with ordinary `patch -p1`. All four hunks applied cleanly, both targeted JWEB tests passed, and the strict three-chunk authority scan passed.
