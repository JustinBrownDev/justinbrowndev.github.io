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
    'Skyway junction authority Phase B: wire transport-junction-authority into pre-carve candidate surfaces so guard/rail topology is actually planned up front (Phase A geometry landed, tested on 10 hostile fixtures + property tests)',
];
