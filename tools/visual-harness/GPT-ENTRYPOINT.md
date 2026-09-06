# GPT entrypoint — JWEB visual probe

Use this before inventing one-off screenshot/debug-render code. The point of the tool is to give a GPT or developer repeatable pictures **and** exact IDs/geometry authority that lead back into JWEB source.

## Choose the cheapest truthful mode

1. **Direct fixture first** when `tools/geometry-harness/specs/` already describes the object. This is the most surgical path: no `main.js`, no world streamer and no city/chunk generator. Exact fixture component IDs remain individually photographable.
2. **Generator specimen** when the object only exists through procedural JWEB generation but the rest of the city is irrelevant. It builds one deterministic Kowloon payload in a void.
3. **Full world / REAL CITY** when neighboring architecture, streaming/publication, authored spawn, materials, lighting, post-processing or player context matters. The current tree has the live seam installed lazily; use `?visualProbe=1` or `window.__debug.visualProbe.install()`.

Never infer physics from a plausible beauty image. Search JWEB's published semantic/physics authority first and keep the manifest with every image packet.

## Fast paths

Direct fixture:

```text
node tools/visual-harness/serve.mjs --port 8123
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=fixture&fixture=apartment-stair&target=flight-low
```

Exact fixture pieces can be addressed directly:

```text
...&target=flight-low:step:4
...&target=flight-low:collider-ramp
```

Generated specimen:

```text
http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=compound-stair
```

Full REAL CITY console:

```js
const p = await window.__debug.visualProbe.install();
p.search({ text: 'compound-stair', kind: 'semantic-connector' });
p.related('compound-stair');
await p.captureTarget('compound-stair', { download: true });
```

For several discrete parts around one object:

```js
await p.captureDecomposition('compound-stair', {
  maxParts: 12,
  download: true,
});
```

For the whole requested investigation — **normal world first, then targets** — use one call:

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

That packet includes the current player canvas (`screen-exact`), normal world capture, target views, isolated visual geometry, physical collider masks, semantic/design masks, deterministic object/instance segmentation, filters and manifests.


## Artistic pass — use this during implementation, not only after a bug report

When the task is aesthetic, composition, architectural language, material/color, skyline, facade rhythm, or circulation legibility, use `captureArtPass()` instead of inventing a bug-shaped reason to invoke the harness.

```js
const p = await window.__debug.visualProbe.install();
await p.captureArtPass([
  {query:'guarded-catwalk', role:'circulation'},
  {query:'compound-stair', role:'vertical-rhythm'},
], {
  lenses:['composition','massing','circulation','material'],
  download:true,
  name:'agent-art-pass',
});
```

For a non-spawn real-city sample:

```js
await p.captureArtPass(['hanging-bridge','guarded-catwalk'], {
  location:{chunk:[8,8],height:42,lookAtY:12},
  lenses:['composition','massing','circulation','readability'],
  download:true,
});
```

The art-pass manifest includes the questions each lens is meant to answer. Read the beauty image first, then use simplified passes as evidence about *why* the composition reads well or poorly. Aesthetic review should not be reduced to collision correctness.

## Diagnostic reading order

- `beauty`: what the renderer normally shows.
- `silhouette` / `depth` / `normals`: shape and occlusion without material noise.
- `object-id`: one collision-free color per isolated render object, with RGB → source-object mapping in the manifest.
- `instance-id`: one collision-free color per **source instance**, even inside one huge JWEB `InstancedMesh` bucket; the manifest maps RGB back to the original instance index.
- `collider`: physical player collision only.
- `semantic`: circulation/transport/guard intent only.
- `visual-collider-overlay`: mismatch spotting.
- Sobel/high-pass/threshold: image-space shape cues for vision analysis.

For a clicked shared instance, reuse `p.pick().captureQuery` with `captureObject()` to isolate only that exact source instance.

Pair defect packets with `tools/geometry-harness/` for invariant/collision truth. Keep this harness lazy and read-only; it must never become gameplay authority. For a moving `main.js`, adapt only the small host seam described in `INTEGRATION.md`; do not invent a source patcher.
