export const CODE_LORE_CONTENT_JUNK_CONTENT = Object.freeze([
    "CODELORE|content/junk-content.js|0001|---------- junk props: ~240 deliberately crude, instanced ----------",
    "CODELORE|content/junk-content.js|0002|\"poorly made\" is the brief, not a compromise: every one of these is a",
    "CODELORE|content/junk-content.js|0003|single shared primitive (box/cylinder/cone/sphere/tube), scaled and",
    "CODELORE|content/junk-content.js|0004|colored per-instance. That's also why this can afford to be 240 of",
    "CODELORE|content/junk-content.js|0005|them instead of 20 -- 5 InstancedMesh draw calls cover all of them,",
    "CODELORE|content/junk-content.js|0006|regardless of count, instead of one draw call per item. Placement is",
    "CODELORE|content/junk-content.js|0007|situational, not a flat random pool: each descriptor is tagged to the",
    "CODELORE|content/junk-content.js|0008|real feature types that already exist (construction zones, crime",
    "CODELORE|content/junk-content.js|0009|scenes, parks, streets, alleys) and only spawns there.",
    "CODELORE|content/junk-content.js|0010|parked/abandoned vehicles -- crude single-box silhouettes, same",
    "CODELORE|content/junk-content.js|0011|\"one shared primitive, scaled and colored\" rule as everything else",
    "CODELORE|content/junk-content.js|0012|here. Long boxes give a wide circle collider (radius = half the",
    "CODELORE|content/junk-content.js|0013|longer side), a known simplification already accepted for carts",
    "CODELORE|content/junk-content.js|0014|and pallets, not a new one."
]);
