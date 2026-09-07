// Canonical JWEB TODO list.
//
// This is plain inline data on purpose: the repo's .gitignore deliberately
// keeps *.md files (other than README.md / STREAMING-WORLD-ARCHITECTURE.md)
// out of the public site — they're working-directory scratch, never
// published. A /TODO.md fetched at runtime would never actually ship.
//
// So this module *is* the canonical source spawn-todo-runtime.js reads.
// Each entry can be a plain string (an open task) or an object
// { text, state } if you ever want to mark one done without deleting it.
//
// Current priority order, synthesized from the 2026-09-07 architecture
// reports (spawn scene semantics, spawn TODO bridge, skyway junctions,
// occupancy/shell allocation) after verifying each against current main:
export const SPAWN_TODO_ITEMS = [
    'Add proportion-to-intent and narrowness checks to the space allocator healthy gates so a defining program room cannot collapse to its bare minimum',
    'Reduce ordinary building height regime toward ~0.67x street-to-street span, landmarks excepted',
    'Rebuild spawn TV/seating around a focal-frame: viewing half-space, same room, sightline not crossing a wall',
    'Reconnect spawn host selection to real Building Plan room topology instead of the flattened module/floor fabric-space model',
    'Fix broken generated-cross-chunk-transport-seams-selftest.mjs (calls a removed factory method)',
    'Skyway junction authority Phase A/B: plan guard/rail topology up front instead of retroactive carve-after-overlap',
];
