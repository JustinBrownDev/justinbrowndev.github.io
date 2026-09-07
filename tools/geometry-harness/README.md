# JWEB geometry harness

Offline geometry/collision/circulation validation tooling integrated from the audited V6 harness on 2026-09-06.

**Ownership:** JWEB runtime planners/builders remain the source of runtime geometry, collision, circulation and physical constraints. This harness is read-only dev tooling: it serializes, renders, audits and fails on contradictions; it is never imported by `main.js` or the streaming hot path.

## Fast selftests

Windows:
```bat
cd /d tools\geometry-harness && RUN_TESTS.cmd
```

POSIX:
```sh
cd tools/geometry-harness && ./RUN_TESTS.sh
```

Dependencies: Python 3, `numpy`, `Pillow`; Node.js for JWEB capture/authority scans.

## Audit live JWEB generation

From repo root:
```sh
node tools/geometry-harness/source/audit_jweb_authority.mjs --repo . --chunks "0,0;1,0;2,0;24,0" --seed 671278205 --strict --out /tmp/jweb-geometry-authority.json
```

The headless audit checks build exceptions, stair physical-fit/clear-width violations, ramp rise mismatches, and malformed circulation reservations.

## Render a generated chunk

```sh
python tools/geometry-harness/source/jweb_silhouette_tester.py city --repo . --chunk 16,0 --seed 671278205 --strict-geometry -o /tmp/jweb-geometry-city
```

Silhouette differences localize suspicious regions; JWEB's own physical/semantic metadata remains deciding evidence.

Interior partition-wall paint (the sidecar planes `realizeBuildingPlanWallRuns()` adds to each face of a Building Plan interior wall) is excluded by default, same as windows/doors/roads -- it's cosmetic noise for the original structural-authority use case. Pass `--include-interior-paint` when debugging that paint (or the partition wall behind it) poking through the exterior shell and becoming visible from outside.

```sh
python tools/geometry-harness/source/jweb_silhouette_tester.py city --repo . --chunk 16,0 --seed 671278205 --include-interior-paint -o /tmp/jweb-geometry-city-paint
```

## Authored fixtures

```sh
python tools/geometry-harness/source/jweb_silhouette_tester.py tools/geometry-harness/specs/horse-statue.json -o /tmp/horse-statue --strict-geometry
```

Fixtures cover fork, fence, house, apartment stair, horse statue and wall/business sign geometry.

## Provenance

`audit/2026-09-06/` preserves the compact report, validation notes, original minimal source patch and JSON evidence that motivated integration. Generated PNG/contact-sheet/output trees are intentionally excluded; they are reproducible artifacts, not source.
