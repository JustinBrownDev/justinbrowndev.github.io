# Portability boundaries

The harness is portable **across JWEB revisions**, not intended to be a standalone rendering engine.

## Stable/core files

These should not care how `main.js` is organized:

- `visual-probe-core.js` — bounds, catalog/query, render-fragment extraction, fixture/physics proxy construction, framing and image filters.
- `runtime-visual-probe.js` — browser capture API. It consumes a host context rather than importing `main.js`.
- `geometry-fixture-adapter.js` — converts geometry-harness specs into exact visual/collider targets.
- `browser-selftest.html` / `browser-selftest.js` — synthetic WebGL validation independent of the city runtime.

## Narrow JWEB-specific files

- `jweb-generator-adapter.js` — the only generator-specimen bridge to `kowloon-fabric-engine.js` and `world-contract.js`.
- `specimen.js` — uses the generator adapter or geometry-fixture adapter. JWEB lighting config is optional and has a neutral fallback.
- the small host block described in `INTEGRATION.md` — lives in current `main.js`, is lazy/dev-only, and is the only full-world integration point that should move when JWEB ownership changes.

If the project moves, prefer editing those narrow seams rather than teaching the harness to understand old and new architectures simultaneously.

## Runtime dependencies

Core live capture requires:

- THREE supplied by the host;
- a `THREE.Scene`, camera and `WebGLRenderer`;
- browser Canvas/WebGL APIs.

Direct fixture mode additionally expects the existing `tools/geometry-harness/specs/` tree. Generator specimen mode additionally expects the current Kowloon generator and world-contract modules.
