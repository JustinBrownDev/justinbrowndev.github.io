# JWEB geometry harness + project audit — 2026-09-06

## Executive result

The V5 harness was useful but not trustworthy enough to be a geometry oracle. It could manufacture collider mismatches and could print a large PASS count without having tested a physical JWEB assertion. After repairing those problems, the harness found two reproducible JWEB correctness defects and the minimal fixes remove them in deterministic probes.

## Harness defects found and repaired

### H1 — headline PASS was mostly mesh-integrity count

The V5 real-city snapshot contained `checks: []`. Its 9,318/9,318 PASS was one automatic mesh-integrity result per neutral batch. It did not prove visual/collider equivalence, support, circulation or traversal validity.

V6 reports mesh integrity, explicit physical assertions, capture health and semantic authority separately. Coverage is spelled out in reports/contact sheets.

### H2 — visual scene was reduced to local bounding boxes

V5 serialized every THREE mesh as a transformed local AABB parallelepiped. This erased holes, slopes and non-box profiles.

V6 defaults to actual BufferGeometry triangles, material groups, draw ranges, world transforms and instance transforms. Legacy `--visual-mode bounds` is explicit.

### H3 — prop top-Y semantics were wrong

JWEB physics treats `prop.height` as absolute top Y. V5 used `yMin + height`, stretching elevated props upward.

V6 uses `[yMin, height]` as the vertical interval and rejects `height <= yMin`.

### H4 — circular prop collision was drawn as a box

JWEB prop collision is radius-based in XZ. V5 created square boxes, inventing four collidable corners.

V6 emits a vertical 16-sided cylinder for the debug representation.

### H5 — malformed runtime numbers could become valid-looking zeros

V5 numeric helpers frequently used fallback zero/clamping. V6 records invalid physics in capture-health errors and omits the malformed element rather than fabricating geometry.

### H6 — valid planar visual geometry could be dropped

V5 skipped meshes whose local bounding box had a near-zero dimension. V6 exact triangles preserve non-degenerate planar surfaces.

### H7 — visibility handling was incomplete

V6 respects descendant/material visibility but treats the intentionally hidden build root as a staging boundary so pre-commit capture does not erase the whole payload.

### H8 — unknown role bits were silently masked

V6 rejects role bitmasks outside the supported visual/collider bits.

### H9 — non-zero clearance penetration depth was an AABB estimate

V5 detected real triangle intersection but estimated penetration depth from overlapping bounding boxes. V6 permits exact zero-penetration clearance and fails closed on positive tolerance until a true penetration solver exists.

### H10 — watertight and oriented-solid concepts were conflated

The shipped authored meshes are edge-closed but some are inconsistently wound. V6 preserves compatible topological `watertight` checks and adds `consistent_winding: true` for strict oriented-solid checks.

### H11 — no reusable semantic city authority scan

V6 adds both `source_metadata.authority_health` during city capture and standalone `source/audit_jweb_authority.mjs` for deterministic multi-chunk headless scans.

## JWEB defects found with repaired harness

### J1 — unresolved portal can crash chunk generation

Repro: world seed `671278205`, saved checkout, chunk `24,0`.

Failure:

```text
JWEB_TOWER_TRANSFER_BINDING_MISSING
city transfer endpoint lacks an authoritative Building Plan exchange binding
```

Root cause: transfer-demand selection accepts an explicitly unresolved portal because it only tests enabled + finite floor/depth data. Building Plan exchange binding intentionally accepts resolved portals only. The generated demand can therefore reference an endpoint for which a binding cannot exist.

Fix: exclude only explicit `resolved:false` portals from transfer-demand candidates. This retains compatibility with planning fixtures that omit the field.

### J2 — mezzanine stairs are published after declaring themselves outside physical truth

Across the seven sampled chunks that successfully built before repair (the eighth, `24,0`, crashed earlier):

```text
151 published stair connectors
30 tread/run fit violations
16 clear-width violations
```

All sampled violations came from `source: mezzanine-stair`.

Examples included realized tread 0.1714 m against a 0.2794 m admissible minimum, and a 1.15 m generated width against larger resolved clear widths. `deriveStairFlight()` correctly labeled these `geometry-fit-outside-truth`; the builder simply did not gate publication on that result.

Fix: optional mezzanine geometry is published only if the derived flight fits resolved truth **and** generated width satisfies `clearWidth`. Otherwise the optional feature is suppressed instead of becoming traversal/collision authority.

After repair across those seven chunks, plus the formerly crashing `24,0`:

```text
0 tread/run fit violations
0 clear-width violations
0 malformed circulation reservations
```

## Instrument sanity proof

V5 -> V6 collider-only pixels on chunk `16,0`, same seed/checkpoint:

```text
front       101 -> 0
side        140 -> 1
top          30 -> 0
isometric    77 -> 1
```

This is important: the audit did not “fix JWEB until the pictures went green.” It first removed geometry invented by the harness. Only after that were JWEB defects accepted when they were supported by JWEB's own semantic/physical authority.

## Fix artifacts

- `JWEB_GEOMETRY_HARNESS_AUDITED_V6.zip` — repaired reusable harness.
- `JWEB_HARNESS_FOUND_JWEB_FIXES.patch` — two JWEB source fixes + regressions; patch dry-run/application verified on a separate unpatched checkout.

## Recommended order

1. Land J1/J2 on a fresh current-main checkout and rerun the deterministic authority scan.
2. Put V6 under `tools/geometry-harness/` as dev tooling; keep it off runtime startup/streaming paths.
3. Add multi-seed authority soaking and failure minimization.
4. Add portal/binding and reservation/sweep invariants directly from JWEB semantic metadata.
5. Use image diff as localization/triage, not as the source of truth.
