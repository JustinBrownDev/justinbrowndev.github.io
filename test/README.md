# Progressive full-fidelity runtime

`test/main.js` is the progressive scheduling fork of the original city runtime. It now powers `/` as well as `/test`; the former synchronous homepage is preserved at `/synchronous/` through the untouched root `main.js`.

## Hard invariants

- Maze carving, BuildingSite/signature builders, collision registration, content, assets, props, traversal rules, and player physics remain the real implementations. There is no proxy grid, placeholder city, fake-building worker, or simplified alternate world.
- Relative module imports point back to the authoritative root support modules. `/test/index.html` uses `<base href="../">`; `/index.html` does not need it.
- The bootstrap renderer uses the real camera and `PointerLockControls`; after generation they are handed directly to the full physics/runtime.
- Progressive scheduling changes *when* real work happens, not whether it happens. Deferred decoration continues outward until every sector is complete if the page is left running.

## Player-nearest scheduling

1. Create renderer/camera/lighting and start painting before waiting on the large noise corpus.
2. Carve the authoritative maze and place the player in the real topology.
3. Materialize BuildingSites nearest the current player first. Re-prioritize after actual browser yields so movement can redirect the remaining queue.
4. Stream streets/alleys as spatial instance chunks and flush each completed nearest chunk immediately instead of waiting to batch the entire grid.
5. Sort async model placement batches nearest-player-first when their GLTF becomes available.
6. Seed decoration from the nearest sectors, then keep an idle queue ordered around the current player. Far sectors remain eligible so an idle tab eventually converges to the complete world.
7. Give independently scheduled building/decor units stable local RNG streams, so player movement changes priority rather than making an individual unit's content timing-dependent.
8. Run the full static-world optimizer progressively: spatial chunking, material dedupe, opaque-mesh merging, pruning, and matrix freezing all remain enabled, but yield between roots/chunks. Nearest chunks are optimized first and async asset arrivals are queued safely during the pass.

`?frameBudget=2..12` controls how many milliseconds of synchronous work the progressive runtime may spend in a slice before yielding for paint/input. Default: 7ms desktop, 5ms mobile/potato.
