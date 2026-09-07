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
export const SPAWN_TODO_ITEMS = [
    'Write the TODOs',
];
