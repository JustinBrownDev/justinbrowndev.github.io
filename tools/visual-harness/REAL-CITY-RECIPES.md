# REAL CITY + artistic review recipes

Start from repo root:

```text
tools\visual-harness\OPEN_VISUAL_HARNESS.cmd
```

That opens the ordinary JWEB runtime with `?visualProbe=1` plus fixture/generator/selftest pages. In the REAL CITY browser console:

```js
const p = await window.__debug.visualProbe.install();
```

## Current player view, normal + simplified composition evidence

```js
await p.captureArtPass([], {
  lenses: ['composition', 'massing', 'material', 'readability'],
  download: true,
  name: 'current-view-art-pass',
});
```

## Travel to a non-spawn chunk and review the district

```js
await p.captureArtPass([], {
  location: { chunk: [8, 8], height: 42, lookAtY: 12 },
  lenses: ['composition', 'massing', 'material', 'readability'],
  download: true,
  name: 'chunk-8-8-district-art',
});
```

`gotoChunk()` enables freecam, moves to the center of the requested real streamed chunk, immediately asks the live streamer to queue/update the new neighborhood, and waits for the requested local ring before capture.

## Review circulation as architecture, not merely collision

```js
await p.captureArtPass([
  { query: 'hanging-bridge', role: 'long-span exterior circulation' },
  { query: 'guarded-catwalk', role: 'local exterior circulation' },
  { query: 'compound-stair', role: 'vertical circulation rhythm' },
], {
  location: { chunk: [-9, 4], height: 42, lookAtY: 12 },
  lenses: ['composition', 'circulation', 'readability'],
  download: true,
  name: 'chunk--9-4-circulation-art',
});
```

The beauty images are the primary evidence. Semantic/collider overlays are secondary evidence for why movement reads clearly or poorly.

## Facade / wall language pass

```js
const facadeLike = p.search({ text: 'wall' }, { limit: 30 });
facadeLike.slice(0, 10);

await p.captureArtPass([
  { query: facadeLike[0]?.id ? { id: facadeLike[0].id, kind: facadeLike[0].targetKind, ownerId: facadeLike[0].ownerId } : 'wall' },
], {
  lenses: ['facade', 'composition', 'material'],
  download: true,
  name: 'facade-language-pass',
});
```

Prefer stronger semantic identities when JWEB publishes them. The harness should not invent facade meaning from pixels if the generator already knows the real construction topology.

## Pick whatever the agent is looking at

```js
const hit = p.pick();
hit;
await p.captureObject(hit.captureQuery.renderObject, {
  worldContext: true,
  download: true,
});
```

## Bug / engineering packet remains separate

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

Use `captureInvestigation()` when the question is correctness. Use `captureArtPass()` when the question is whether JWEB looks/reads/feels right. A single implementation task can use both.
