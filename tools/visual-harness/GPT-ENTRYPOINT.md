# GPT entrypoint — JWEB visual probe

Use this before inventing one-off screenshot/debug-render code. The point of the tool is to give a GPT or developer repeatable pictures **and** exact IDs/geometry authority that lead back into JWEB source.

## Choose the cheapest truthful mode

1. **Direct fixture first** when `tools/geometry-harness/specs/` already describes the object. This is the most surgical path: no `main.js`, no world streamer and no city/chunk generator. Exact fixture component IDs remain individually photographable.
2. **Generator specimen** when the object only exists through procedural JWEB generation but the rest of the city is irrelevant. It builds one deterministic Kowloon payload in a void.
3. **Full world** when neighboring architecture, streaming/publication, authored spawn, materials, lighting, post-processing or player context can cause the bug. This requires the optional host seam; the parked-tool cut does not install that seam.

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

Full world console, **only after the host seam has been intentionally installed**:

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

Pair the packet with `tools/geometry-harness/` for invariant/collision truth. Keep this harness lazy and read-only; it must never become gameplay authority. For a moving `main.js`, adapt only the small host seam described in `INTEGRATION.md`; do not invent a source patcher.
