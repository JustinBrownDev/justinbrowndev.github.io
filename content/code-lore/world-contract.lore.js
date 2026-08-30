export const CODE_LORE_WORLD_CONTRACT = Object.freeze([
    "CODELORE|world-contract.js|0001|Stable, renderer-agnostic world format contract.",
    "CODELORE|world-contract.js|0002|Keep this module free of THREE/browser state. A future authoritative server,",
    "CODELORE|world-contract.js|0003|replay tool, save upgrader, or multiplayer client must be able to answer the",
    "CODELORE|world-contract.js|0004|same identity/seed/chunk questions without importing the renderer.",
    "CODELORE|world-contract.js|0005|These are the only world-singular authored slots. They all resolve inside the",
    "CODELORE|world-contract.js|0006|pinned spawn district. Everything outside spawn is ordinary coordinate-",
    "CODELORE|world-contract.js|0007|addressed procedural world and therefore has no distributed uniqueness rule.",
    "CODELORE|world-contract.js|0008|Permanent generation hook: broad weirdness rises with distance from spawn.",
    "CODELORE|world-contract.js|0009|`value` is the stable monotonic gradient. `grain` is deterministic local",
    "CODELORE|world-contract.js|0010|texture. Future generators should usually consume `sampled`, while systems",
    "CODELORE|world-contract.js|0011|that need strict monotonic behavior can consume `value`."
]);
