# /test progressive full-fidelity runtime

`/test` is a scheduling fork of the real root runtime, **not a second city generator**.

## Hard invariants

- `test/main.js` starts as an exact copy of root `main.js`.
- Maze carving, BuildingSite reservation, signature dispatch, building builders, collision registration, content, assets, props, traversal rules, and final optimizer are the root implementations.
- Building sites execute in the same order. Cooperative yields happen only **after** a completed site/row/phase; they do not consume RNG or replace geometry.
- No proxy grid, placeholder city, simplified AABB world, alternate `LOTS` lattice, or fake-building worker is permitted.
- Relative JS imports point back to the authoritative root modules. The `<base href="../">` keeps runtime asset/fetch URLs rooted exactly where the main page expects them.
- A bootstrap render/movement loop exists only while generation is incomplete. Once topology exists it constrains movement to real open maze cells. The same camera and `PointerLockControls` instance are handed to full player physics at completion.
- The real full runtime eventually converges: content/building/prop logic is not dropped for performance.

## Performance model

1. Start the three giant noise imports immediately (same as root).
2. Create renderer/camera/lighting and begin painting **before** awaiting that corpus.
3. Allow pointer-lock look + WASD during loading.
4. Carve the authoritative maze.
5. Stream authoritative building sites in original deterministic order, yielding when the frame work budget is exhausted or input is pending.
6. Stream street/alley surface preparation by rows.
7. Keep the existing near-first deferred decoration system.
8. Run traversal validation and the real static-world optimizer after a paint boundary.
9. Hand off to the unchanged full physics/render loop.

`?frameBudget=2..12` controls how many milliseconds of synchronous generation `/test` is allowed to spend in a slice before yielding for paint/input. Default: 7ms desktop, 5ms mobile/potato.
