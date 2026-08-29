# `/test` performance rewrite

This path is a clean performance baseline. It deliberately does **not** import the production `main.js`, the large production HTML UI, Three.js, GLTF assets, audio, textures, or noise corpora on the critical path.

## Critical-path rules

1. **First paint and controls win.** `index.html` is ~2 KB and `app.js` is the only boot script.
2. **No framework/runtime dependency.** The renderer is direct WebGL2, so there is no library download/parse/initialization tax.
3. **One geometry draw call.** Ground and buildings share one cube mesh and one instanced draw.
4. **No per-frame world generation.** Procedural chunks are generated in `world-worker.js` after first paint; user input starts the worker immediately, otherwise an idle callback starts it.
5. **Nearest work first.** The worker reprioritizes around the player's current chunk, drops obsolete queued work, and yields between chunks.
6. **Bounded work.** Generation radius, render radius, retained chunk radius, instance count, DPR, and physical pixel count are all capped.
7. **Adaptive fill rate.** Resolution scales down only after sustained slow frames and recovers conservatively with hysteresis. Canvas resizing does not occur every frame.
8. **Collision is local and cheap.** Only loaded neighboring chunks are checked and each building is a simple 2D AABB.
9. **No frame-loop DOM churn.** The HUD updates four times per second. The animation loop does not create world objects or rebuild buffers unless chunk visibility/data changed.
10. **Background work pauses in hidden tabs.** Input is cleared and the worker is paused when the page is hidden.

## Current scope

The test intentionally proves the hard base first: immediate pointer-lock/WASD movement through a progressively populated procedural city while maintaining a tiny boot path and stable render cost.

Production systems should return as independent lazy modules, not as a monolith. Recommended order:

- near-player signage / fixtures only after the containing chunk exists;
- textures only after geometry is visible and the frame budget is healthy;
- audio only after user interaction;
- GLB landmarks only inside an approach radius, decoded off the critical path;
- simulation agents at lower update rates and only near the player;
- large text/noise corpora as indexed/ranged shards requested by need, never 60+ MB whole-file startup fetches;
- decorative UI after interaction or idle time.

The performance contract is that none of those systems may delay the base renderer, pointer lock, movement, or the nearest geometry stream.
