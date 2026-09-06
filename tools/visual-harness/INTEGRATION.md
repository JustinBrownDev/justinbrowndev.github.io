# JWEB runtime integration seam

The visual harness is wired to the current JWEB runtime through one deliberately small, hand-written seam in `main.js`. It is **live but lazy**: normal boot does not statically import `tools/visual-harness/runtime-visual-probe.js`. The module loads only when a developer/agent calls `window.__debug.visualProbe.install()` or opens JWEB with `?visualProbe=1`.

## Permanent host contract

`runtime-visual-probe.js` consumes a host context rather than importing `main.js`:

```js
{
  THREE,
  scene,
  camera,
  renderer,
  composer,          // optional, for exact live-screen capture
  chunkSize,         // optional but supplied by current JWEB
  setFreecam,        // optional; current JWEB supplies it for REAL CITY travel
  onCameraMoved,     // optional; current JWEB queues/refreshes streamer work
  getCurrentChunk,   // optional; improves chunk-settlement verification
  getPayloadEntries, // () => [{ payload, chunkKey?, source? }, ...]
  getStatus,         // optional; settlement/debug status
}
```

Everything else — target cataloging, exact instance extraction, void rendering, masks, image filters, artistic lenses, ZIPs and manifests — stays in `tools/visual-harness/`.

## Current JWEB authorities

The current `main.js` seam publishes each live payload once from these authorities:

- READY `worldChunkStreamer.chunks` payloads;
- `unifiedSpawnFabricPayloads`;
- `unifiedSpawnRelationshipPayloads`;
- `authoredCeilingOverlayPayload`.

It also passes the current scene/camera/renderer/composer, `STREAM_CHUNK_SIZE`, freecam control, current-chunk lookup, and a camera-moved hook that immediately asks the streamer to queue/update the new neighborhood.

This is intentional. REAL CITY captures should visualize the same committed payloads the player sees rather than reconstructing a parallel pseudo-city.

## Moving-main rule

JWEB `main` is still a moving target. Do not add a source-text patcher or compatibility archaeology. If ownership moves, update only the narrow `visualProbePayloadEntries()`/host-context block in current `main.js`, then rerun the harness contract tests. Keep the runtime probe itself ignorant of JWEB source layout.

## Integration checks

Before trusting a release or agent capture:

1. `node tools/visual-harness/tests/portable_contract_selftest.mjs`
2. `node tools/visual-harness/tests/fixture_specimen_selftest.mjs`
3. `node tools/visual-harness/tests/visual_probe_selftest.mjs`
4. Browser: `tools/visual-harness/browser-selftest.html` must report PASS on WebGL-capable desktop hardware.
5. Open one fixture specimen.
6. Open one generator specimen.
7. Open `/?visualProbe=1`, confirm `window.__jwebVisualProbe`, then run `runtimeLocation()` and one `captureWorld()`.
8. For REAL CITY travel, run `gotoChunk()` and verify the returned current chunk matches the requested chunk before reviewing images.
9. For artistic work, run at least one `captureArtPass()` with a lens appropriate to the change.
