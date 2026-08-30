export const HARDWARE_VOICE = Object.freeze({
    nouns: Object.freeze([
        'KEY MACHINE', 'FASTENER DRAWER', 'PIPE THREAD', 'COPPER FITTING', 'PVC ELBOW', 'FURNACE FILTER', 'UTILITY KNIFE', 'LOCK CYLINDER', 'HINGE BIN',
        'PAINT SHAKER', 'COLOR CARD', 'EXTENSION CORD', 'TOGGLE BOLT', 'MASONRY ANCHOR', 'HOSE CLAMP', 'GREASE FITTING', 'COTTER PIN', 'WOOD SCREW',
        'MACHINE SCREW', 'HEX NUT', 'WASHER', 'O-RING', 'BALL VALVE', 'GATE VALVE', 'PIPE NIPPLE', 'BRAIDED LINE', 'SHOP RAG', 'PEG HOOK', 'AISLE TAG'
    ]),
    verbs: Object.freeze([
        'CUTS KEYS', 'MATCHES THREADS', 'COUNTS FASTENERS', 'SHAKES PAINT', 'FINDS THE FITTING', 'CHECKS THE SIZE', 'MEASURES TWICE', 'OPENS THE DRAWER',
        'RESTOCKS', 'LABELS', 'POINTS TO AISLE NINE', 'KNOWS THE WEIRD PART', 'FINDS A SUBSTITUTE', 'SAYS BRING THE OLD ONE IN'
    ]),
    joints: Object.freeze(['IN', 'ON', 'UNDER', 'BESIDE', 'BETWEEN', 'BEHIND', 'PAST', 'NEXT TO'])
});

export const HARDWARE_PAIRS = Object.freeze([
    ['KEYS CUT', 'while you wait'], ['FASTENERS', 'one drawer deeper'], ['BRING THE OLD PART', 'we can match it'], ['PIPE FITTINGS', 'thread type matters'],
    ['PAINT SHAKER', 'lid confirmed first'], ['FURNACE FILTERS', 'write the size down'], ['MACHINE SCREWS', 'not wood screws'], ['TOGGLE BOLTS', 'for the hollow wall'],
    ['HOSE CLAMPS', 'one size larger than you guessed'], ['O-RINGS', 'small rubber, large consequences'], ['AISLE NINE', 'then look lower'], ['SHOP RAGS', 'never really clean'],
    ['UTILITY KNIVES', 'fresh blade, less force'], ['LOCK CYLINDERS', 'bring the key if you have it'], ['PEGBOARD', 'every tool has an outline']
]);
