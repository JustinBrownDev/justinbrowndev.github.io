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
    // All 7 items from the 2026-09-07 architecture-report synthesis landed:
    // spawn support-area inflation, allocator proportion/narrowness, ceiling
    // -height sidecar, focal-frame seating, Building Plan room reconnection,
    // the broken cross-chunk seam test, and skyway junction authority (Phase
    // A geometry + Phase B wired into live rail-gap carving). The deeper
    // junction-owns-structure/global-corridor vision (report 3's Phase C+)
    // is real, explicitly-scoped future work, not something left undone here.
];
