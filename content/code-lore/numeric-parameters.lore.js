export const CODE_LORE_NUMERIC_PARAMETERS = Object.freeze([
    "CODELORE|numeric-parameters.js|0001|Exhaustive quantitative parameter runtime.",
    "CODELORE|numeric-parameters.js|0002|Authored game/runtime numeric literals are rewritten at build time to call",
    "CODELORE|numeric-parameters.js|0003|parameterNumber() exactly once, when their module initializes. Query values",
    "CODELORE|numeric-parameters.js|0004|therefore cost nothing in the render loop: hot paths read ordinary module-",
    "CODELORE|numeric-parameters.js|0005|local variables. Runtime-function literals can additionally register a tiny",
    "CODELORE|numeric-parameters.js|0006|generated setter so the P-panel can change future evaluations immediately.",
    "CODELORE|numeric-parameters.js|0007|CONFIG is handled separately after seeded randomization, so cfg.* overrides",
    "CODELORE|numeric-parameters.js|0008|mean \"final effective value for this load,\" not \"input to the randomizer.\""
]);
