# JWEB runtime integration seam

The visual harness is deliberately **not** patched into `main.js` by a generic rewriter. **The parked-tool pushzip that lands this directory intentionally does not modify `main.js`.** Keep the harness portable and, only when full-world capture is actually needed, adapt the host in one small hand-written block against the then-current `main`.

## Permanent contract

`runtime-visual-probe.js` only needs this host context:

```js
{
  THREE,
  scene,
  camera,
  renderer,
  composer,          // optional; used for exact live-screen capture when present
  getPayloadEntries, // () => [{ payload, chunkKey?, source? }, ...]
  getStatus,         // optional; () => settlement/debug status
}
```

Everything else — target cataloging, exact instance extraction, void rendering, masks, filters, ZIPs and manifests — stays inside `tools/visual-harness/`.

## Example JWEB-shaped adapter for a later runtime-integration cut

When a later cut intentionally integrates full-world capture into a particular `main.js`, inspect its current authorities and write the equivalent of this near the existing `window.__debug` setup:

```js
function visualProbePayloadEntries() {
    const entries = [];

    for (const chunk of worldChunkStreamer?.chunks?.values?.() ?? []) {
        if (chunk?.payload?.root) {
            entries.push({ payload: chunk.payload, chunkKey: chunk.key, source: 'world-stream' });
        }
    }

    for (const [key, payload] of unifiedSpawnFabricPayloads.entries()) {
        if (payload?.root) {
            entries.push({ payload, chunkKey: '0,0', source: `authored-fabric:${key}` });
        }
    }

    for (const payload of unifiedSpawnRelationshipPayloads) {
        if (payload?.root) {
            entries.push({ payload, chunkKey: '0,0', source: 'authored-relationship' });
        }
    }

    return entries;
}

async function installVisualProbe() {
    if (window.__jwebVisualProbe) return window.__jwebVisualProbe;
    const { installJwebVisualProbe } = await import('./tools/visual-harness/runtime-visual-probe.js');
    return installJwebVisualProbe({
        THREE,
        scene,
        camera,
        renderer,
        composer,
        getPayloadEntries: visualProbePayloadEntries,
        getStatus: () => window.__debug?.perf?.() ?? null,
    });
}

window.__debug.visualProbe = {
    install: installVisualProbe,
    payloadEntries: visualProbePayloadEntries,
};

if (new URLSearchParams(location.search).get('visualProbe') === '1') {
    installVisualProbe().catch(error => console.error('[visual-probe] install failed', error));
}
```

That block is an **example seam, not a patch artifact**. If the live project renames or consolidates payload ownership, change only `visualProbePayloadEntries()` and the obvious runtime references. Do not make the harness search source text, infer line numbers, or silently guess replacement authorities.

## Integration checks for a future pushzip

Before packaging against a moving `main`:

1. Confirm the current scene/camera/renderer/composer variables.
2. Confirm which collections own committed streamed and authored Kowloon payloads.
3. Make `getPayloadEntries()` return each live payload once.
4. Attach the lazy installer to the current debug surface.
5. Run the Node harness tests.
6. Open `tools/visual-harness/browser-selftest.html` and require PASS.
7. Open one direct fixture specimen, one generator specimen, and the real world with `?visualProbe=1`.
8. Only then build the normal JWEB pushzip from that current main.

The goal is a tiny fresh integration each time, not a clever compatibility layer.
