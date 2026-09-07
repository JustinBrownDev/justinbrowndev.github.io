# JWEB visual investigation harness

Companion to `tools/geometry-harness/`. The geometry harness answers **what geometry/collision authority exists?** This harness answers **what does that exact thing look like in the real renderer, in context, by itself, and under machine-friendly diagnostic masks?**

It is dev-only and lazy. The current JWEB `main.js` has a deliberately tiny host seam: normal boot does not statically import the harness, but `window.__debug.visualProbe.install()` (or `?visualProbe=1`) lazy-loads it against the exact live scene, renderer, streamer payloads, authored spawn fabric, authored relationships, and authored ceiling overlay. Fixture and generator-specimen modes remain available without booting the real city.

## Three capture paths

### 1. Full ordinary JWEB world — live REAL CITY mode

This path uses the real `main.js` runtime. Streamed/authored geometry, materials, lighting, player camera and post-processing remain normal. The integration is lazy and dev-only; simply having the harness in the tree does not add its module to ordinary boot.

```js
const p = await window.__debug.visualProbe.install();
await p.captureWorld({
  wait: { localRender: true, authoredStructures: true },
  download: true,
});
```

`captureWorld()` always attempts `world/current.screen-exact.png` from the live game canvas (EffectComposer if present, raw renderer otherwise) in addition to requested off-screen diagnostic passes.

The higher-level call encodes the intended bug-investigation workflow: **let normal JWEB build, capture the ordinary player screen, then capture targeted geometry**.

```js
await p.captureInvestigation([
  { query: 'compound-stair', decompose: true },
  { query: 'guarded-catwalk' },
  { query: 'hanging-bridge' },
], {
  wait: { localRender: true, authoredStructures: true },
  download: true,
});
```

### 2. Generator specimen — one procedural payload, no world boot

`specimen.html?mode=generator` does **not** import `main.js`. It creates an empty THREE scene and asks the real `KowloonFabricEngine` for one deterministic payload. This answers “is this generated stair/connector malformed by itself?” without booting the player/world-stream stack.

```text
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=stair&index=0
```

### 3. Direct geometry fixture — no city or chunk generation at all

When an object exists in `tools/geometry-harness/specs/`, the visual harness can instantiate the geometry-harness fixture directly into a void. It does not run `main.js`, the streamer, the world, or `KowloonFabricEngine`.

```text
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=fixture&fixture=apartment-stair&target=flight-low
```

The adapter preserves geometry-harness component IDs, including visual/collider roles. That makes very small pieces directly addressable:

```text
?mode=fixture&fixture=apartment-stair&target=flight-low:step:4
?mode=fixture&fixture=apartment-stair&target=flight-low:collider-ramp
```

Use `&capture=1&download=1` for one target or `&decompose=1&parts=12&download=1` for an automatic discrete-parts packet.


## Artistic review is a first-class use case

The harness is not only for defect hunting. `captureArtPass()` creates a beauty-first review packet for implementation agents while they are making artistic changes. It records the artistic questions in the manifest so the packet has an explicit review purpose instead of implicitly treating every capture as a bug.

Available lenses are `composition`, `massing`, `circulation`, `facade`, `material`, and `readability`. Each lens chooses complementary normal and simplified passes. For example, composition combines the real beauty image with grayscale/low-pass/silhouette/depth so an agent can judge hierarchy and shape before getting distracted by detail; circulation adds semantic and visual/collider overlays because movement legibility is part of the art.

```js
const p = await window.__debug.visualProbe.install();

await p.captureArtPass([
  { query: 'guarded-catwalk', role: 'exterior circulation' },
  { query: 'compound-stair', role: 'vertical rhythm' },
], {
  lenses: ['composition', 'massing', 'circulation', 'material'],
  download: true,
  name: 'current-city-art-pass',
});
```

REAL CITY mode can also move the actual player camera into a streamed chunk, wait for that local ring to publish, and then capture the same packet:

```js
await p.captureArtPass(['hanging-bridge', 'guarded-catwalk'], {
  location: { chunk: [8, 8], height: 42, lookAtY: 12 },
  lenses: ['composition', 'massing', 'circulation', 'readability'],
  download: true,
  name: 'chunk-8-8-art-pass',
});
```

Use `await p.gotoChunk(x, z, options)` when an agent wants to roam first and decide what to study from `p.search()`, `p.pick()`, or `p.related()`.

## Target authority: IDs first, image guessing last

`catalog()` indexes published geometry authority rather than relying on mesh-name guessing:

- geometry-fixture elements/components;
- semantic connectors;
- circulation reservations;
- exterior transport surfaces and edges;
- guard spans;
- collider platforms, ramps, walls, props and ceilings;
- payload roots / chunk ownership.

For generated-world targets, semantic bounds select the corresponding instances out of JWEB's large shared renderer buckets. For direct fixtures, exact object references are used, so `flight-low:step:4` is literally that component rather than an overlap approximation.

```js
p.search('stair');
p.search({ text: 'compound-stair', kind: 'semantic-connector' });
p.search('guarded-catwalk');
p.pick();                // center-screen raycast + nearest semantic targets
p.related('compound-stair'); // nearby/structurally related authorities
```

A raycast hit on an `InstancedMesh` keeps its `instanceId`. `captureObject({ uuid, instanceId })` photographs only that source instance rather than the whole shared renderer bucket. `pick().captureQuery` is directly reusable for this.

## Discrete decomposition

`captureDecomposition()` turns one target into several independent capture sets. In direct fixture mode it prioritizes diverse component families (collider, step, riser, handrail, post, etc.) rather than returning only the nearest repeated pieces. In world/generator mode it chooses nearby semantic/collider/transport authorities with per-kind caps.

```js
await p.captureDecomposition('compound-stair', {
  maxParts: 12,
  views: ['iso'],
  download: true,
});
```

This is intended for requests such as “just the walkway”, “just this stair”, “just the connector”, and “now show their collision/design volumes separately”.

## Render passes

Target capture defaults to `iso`, `front`, `right`, and `top` and can emit:

- **beauty** — normal selected visuals/lights;
- **silhouette** — white geometry / black background;
- **normals** — surface orientation;
- **depth** — camera depth with near/far fitted to the selected object;
- **wireframe** — triangle/topology cues;
- **object-id** — deterministic color per render object;
- **instance-id** — deterministic color per instance inside shared `InstancedMesh` buckets;
- **collider** — physical collision geometry only, cyan;
- **semantic** — design/circulation authority only:
  - connector purple,
  - reservation magenta,
  - transport surface orange,
  - transport edge yellow,
  - guard span green;
- **visual-collider-overlay** — visual geometry plus both physical and semantic authority.

The `object-id` and `instance-id` paths use collision-free per-capture palettes, disable tone mapping for the mask render, and publish the exact RGB/hex → source-object/source-instance mapping in the manifest. The diagnostic renderer is non-antialiased so segmentation boundaries do not invent blended IDs.

### Derived image filters

Beauty images can additionally emit:

- grayscale;
- lowpass-3 / lowpass-9;
- highpass-3 / highpass-9;
- Sobel edges;
- threshold masks.

These are deliberately redundant. Different geometry failures become obvious under different visual representations, and the set is useful to both human inspection and vision-model analysis.

## Manifests

Every target capture stores enough provenance to get from pixels back into code/data:

- target IDs/kinds and owner/chunk;
- semantic authority bounds;
- expanded selection bounds;
- actual camera framing bounds;
- exact fixture-object counts where applicable;
- selected render fragments and instance counts;
- triangle counts;
- physical collider proxy count;
- semantic proxy count;
- camera projection/position/quaternion/near/far;
- query/options and runtime status.

`captureSet()`, `captureDecomposition()` and `captureInvestigation()` add aggregate manifests around their child captures.

## Console examples

```js
const p = await window.__debug.visualProbe.install();

p.search('compound-stair');
p.related('compound-stair');

await p.captureTarget('compound-stair', { download: true });

await p.captureSet([
  { query: 'compound-stair', options: { index: 0 } },
  { query: 'guarded-catwalk', options: { index: 0 } },
  { query: 'hanging-bridge', options: { index: 0 } },
], { download: true, name: 'circulation-probe' });
```

## Local launch

From repo root:

```text
node tools/visual-harness/serve.mjs --port 8123
```

Then open the fixture/generator modes directly:

```text
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=fixture&fixture=apartment-stair&target=flight-low
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&target=stair
http://127.0.0.1:8123/tools/visual-harness/browser-selftest.html
```

For the real city, open `http://127.0.0.1:8123/?visualProbe=1` and use `window.__jwebVisualProbe` or `window.__debug.visualProbe.install()` from the console.

Windows can run `tools\visual-harness\OPEN_VISUAL_HARNESS.cmd`.

For moving-main integration boundaries, read `INTEGRATION.md` and `PORTABILITY.md`. There is intentionally no automatic source patcher.

## Headless automation (no browser required)

`headless-driver.mjs` is a from-scratch Chrome DevTools Protocol client (no
puppeteer/playwright dependency - talks raw CDP over Node's built-in
`WebSocket`, driving the system's own chromium-browser/google-chrome).
`capture.mjs` builds on it with two ready-to-use entry points that own the
`serve.mjs` lifecycle themselves:

```js
import { captureSpecimen, captureWorldInvestigation } from './tools/visual-harness/capture.mjs';

// fast/isolated - fixture or generator specimen
await captureSpecimen({ mode: 'fixture', fixture: 'apartment-stair', target: 'flight-low', outDir: '/tmp/out' });

// slow/full-generation - real running city, seed pinned for reproducibility
await captureWorldInvestigation({ queries: ['trash_can'], outDir: '/tmp/out' });
```

Both write PNGs + `manifest.json` under `outDir` and return `{ manifest, files }` on success, or throw with a real error (no match, page exception, settle timeout) on failure - callers decide how to report that. `tools/target-report/collectors.mjs` is the reference caller: real success flips a section to `real`; real failure keeps it `pending` with the exact error and a manual fallback command, never a faked result either way.

Known constraint: this machine has no GPU, so WebGL runs through SwiftShader (software rendering) - a full streamed city renders at only ~2-3 fps headless, and the harness's own settle-wait can legitimately time out before "local render ring complete" under that framerate. Fixture/generator (fast mode) captures don't have this problem (validated: real renders of `flight-low` and `stair` came back correctly shaded, not blank).

## Tests

```text
node tools/visual-harness/tests/portable_contract_selftest.mjs
node tools/visual-harness/tests/fixture_specimen_selftest.mjs
node tools/visual-harness/tests/visual_probe_selftest.mjs
node tools/visual-harness/tests/live_agent_api_selftest.mjs
```

The portable-contract test syntax-checks every harness script, keeps specimen/runtime modules independent of `main.js`, and verifies that the live host seam remains a lazy dynamic import over the current ownership authorities. The real-chunk selftest proves semantic stairs/catwalks resolve to actual renderer fragments and physics proxies against the supplied current JWEB tree. The fixture test proves exact stairs, individual treads, collider ramps, rails and OBJ groups can be independently selected without city generation. The live-agent API test exercises artistic presets and REAL CITY chunk navigation without needing a browser.

Browser/WebGL validation lives in `browser-selftest.html`. It builds synthetic shared-instance geometry, runs all render passes, verifies real PNG signatures, verifies every object/instance segmentation RGB against the manifest, checks exact collider/semantic palette colors, exercises one-instance capture, ZIP generation, duplicate logical capture requests, and the `maxParts=1` decomposition contract. The page must report `PASS` in a normal WebGL-capable desktop browser.

This coding environment has managed Chromium policy blocking all navigations (`URLBlocklist: ["*"]`), so the browser page cannot be opened here even though SwiftShader WebGL itself is available. The browser acceptance page remains deterministic for a normal desktop browser; Node/generator/fixture/live-agent validation is run here instead of falsely claiming a browser PASS.

## Relation to the geometry harness

Use both when possible:

1. Geometry harness: exact neutral visual/collider silhouettes and invariant checks.
2. Visual harness direct fixture: photograph the same fixture/component IDs in normal and diagnostic render passes.
3. Generator/world visual harness: inspect procedural/runtime context.
4. Compare manifest IDs/bounds with geometry-harness authority evidence.

The visual harness is intentionally **not** gameplay or physics authority. It visualizes JWEB's existing authority; it does not decide that geometry is valid because a screenshot looks plausible.
