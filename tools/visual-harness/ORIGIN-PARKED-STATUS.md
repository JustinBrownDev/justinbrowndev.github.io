> **Historical provenance only.** This parked state is superseded by `LIVE-INTEGRATION-STATUS.md`; the current tree has a lazy live REAL CITY seam in `main.js` and first-class artistic review.

# JWEB visual harness - parked checkpoint

Parked: 2026-09-06

This is a preservation bundle, not a pushzip and not a claim that the current JWEB `main` has been integrated.

## User steer at park time

- Keep the harness code complete and pretty much portable.
- Do **not** build or retain a complicated "works on anything" source patcher/rebaser.
- When a future pushzip is requested, inspect the then-current `main` and write the small JWEB host seam fresh against that revision.

## Current shape

- Full-world runtime capture path.
- Void/generator specimen path using the real Kowloon generator.
- Direct geometry-fixture specimen path.
- Semantic target catalog/search and discrete decomposition.
- Visual/collider/semantic separation.
- Beauty, silhouette, normals, depth, wireframe, object-ID, instance-ID, collider, semantic, and overlay passes.
- Derived grayscale/low-pass/high-pass/Sobel/threshold images.
- ZIP + manifest capture plumbing with segmentation color mappings.
- Browser self-test page for real WebGL PNG/pass validation.
- Narrow portability docs and a tiny future-main integration contract.

## Validation state

- Node/fixture/generator-side harness work had been passing during the session.
- Browser/WebGL rendering is intentionally **not** marked proven in this environment; `tools/visual-harness/browser-selftest.html` is the acceptance page to run on a normal WebGL-capable desktop browser.
- At the time this work was parked, GitHub `main` had moved to commit `68e1e02b61701518fda307e8ddd139e22350ea36` (`refactor: trim architecture and publish color progressively`). The permanent harness was intentionally not auto-rebased onto it.

## Known cleanup note

`tools/visual-harness/README.md` currently lists `tools/visual-harness/tests/portable_contract_selftest.mjs` in the test commands, but that file is not present in this parked tree. Treat that line as a documentation leftover unless/until the test is added. No further development was done after the user asked to dump and park.

## Bundle contents

- `workspace/` - everything in the active visual-harness work directory at park time, including the extracted JWEB session snapshot and intermediate `precomplete/` material.
- `original-input/` - the exact ZIP that started this continuation session.
