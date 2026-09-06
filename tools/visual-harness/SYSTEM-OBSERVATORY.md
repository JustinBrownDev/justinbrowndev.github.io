# JWEB System Observatory

This is a diagnostic layer for seeing *systems* rather than every mesh/collider rectangle.
It was added because ordinary plan slices and density heatmaps were visually truthful but too dense to make system failures obvious.

## Two modes

### 1. Many-chunk topology sweep

Run on Windows:

```cmd
tools\visual-harness\RUN_SYSTEM_OBSERVATORY_7X7.cmd
```

Or directly:

```cmd
node tools\visual-harness\source\capture_system_observatory.mjs --seed 671278205 --center-x 4 --center-z 3 --radius 3 --out .visual-probe-output\system-observatory-7x7
```

The sweep is deliberately allowed to contain generator build failures. They are findings, not a harness crash. Add `--fail-on-build-error` if a CI-like non-zero exit is desired.

The overview starts with:

- `authority-pipeline.svg` — actual subsystem/data handoffs with observed faults pinned to the owning seam.
- `validation-seams.svg` — six contracts, with prevalence and family counts.
- `transport-failure-atlas.svg` — only marooned exterior transport, healthy graph omitted.
- `chunk-matrix.svg` — one diagnostic card per requested chunk, including literal BUILD FAILED cards.
- `system-fingerprint.svg` — recurring signatures across chunks.
- `code-system-map.svg` — real ES import relationships among the selected circulation/spatial source files.

Every built chunk gets a drill-down page with system story, transport component anatomy, attention ledger, building floor stacks, exact samples, and raw JSON.

### 2. Issue-focused structural sweep

```cmd
tools\visual-harness\RUN_SYSTEM_OBSERVATORY_R2.cmd --seed 671278205 --chunks "2,4;7,4;4,6;4,5;6,2;4,3"
```

This view intentionally suppresses detail to expose larger authored patterns:

- ground/hanging macro section and interlock,
- void/occupancy hierarchy,
- bridge family vs structural-grammar conflicts,
- stacked bridge structural systems,
- stair topology repetition,
- stair guard/detail density.

## Interpretation rules

`unreachableSpaces`, `unreachableTransportNodes`, explicit-egress failures, and generator contract throws are hard signals.

Plan/physical adjacency mismatch and ownership/binding counts are investigation signals. They are not automatically geometry bugs.

External portal/connector IDs that are promoted to `world` nodes by `world/circulation-graph.js` are boundary semantics, not dangling-reference bugs. The observatory resolves those before scoring unresolved references.

The observatory is a chooser: use it to identify a subsystem/chunk/building, then use the exact geometry/visual harness to prove the physical defect before changing geometry.

## R3 iteration helpers

R2 long sweeps support `--resume`, guarded by a SHA-256 fingerprint of the relevant generator source files plus seed/chunk configuration. Use a new output directory after changing source. `--resume-unsafe` is an explicit escape hatch, not the default.

Re-render cached summaries without rebuilding the city:

```cmd
tools\visual-harness\REBUILD_SYSTEM_OBSERVATORY_R2.cmd --out .visual-probe-output\system-observatory-r2
```

Compare two finished sweeps:

```cmd
tools\visual-harness\COMPARE_SYSTEM_OBSERVATORIES_R2.cmd --before C:\before --after C:\after --out C:\comparison
```

New R2 overview views include `runtime-pipeline.svg`, `module-atlas.svg`, `stair-contract-matrix.svg`, and `triage-target-deck.svg`. `triage-targets.json` is intended as machine-readable handoff to the exact REAL CITY visual harness.
