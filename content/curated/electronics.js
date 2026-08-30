export const ELECTRONICS_VOICE = Object.freeze({
    nouns: Object.freeze([
        'BREADBOARD', 'PERFBOARD', 'SOLDER MASK', 'GROUND PLANE', 'TRACE', 'VIA', 'HEADER', 'JUMPER', 'PULL-UP', 'PULL-DOWN', 'MOSFET', 'RELAY',
        'OP-AMP', 'COMPARATOR', 'REGULATOR', 'RECTIFIER', 'CAPACITOR', 'INDUCTOR', 'DIODE', 'TRANSISTOR', 'SHUNT', 'FUSE', 'OSCILLOSCOPE', 'LOGIC PROBE',
        'BENCH SUPPLY', 'MULTIMETER', 'SOLDER STATION', 'FLUX', 'DESOLDER BRAID', 'HEAT SHRINK', 'RIBBON CABLE', 'IDC CONNECTOR', 'CRYSTAL', 'CLOCK LINE'
    ]),
    verbs: Object.freeze([
        'PROBES', 'MEASURES', 'BIASes', 'SWITCHES', 'RECTIFIES', 'REGULATES', 'FILTERS', 'OSCILLATES', 'PULLS HIGH', 'PULLS LOW', 'FLOATS', 'LATCHES',
        'DEBOUNCES', 'SOLDERS', 'REWORKS', 'TRACES THE SIGNAL', 'CHECKS GROUND FIRST', 'LIMITS CURRENT', 'WATCHES THE RAIL', 'FINDS THE SHORT'
    ]),
    joints: Object.freeze(['AT', 'ON', 'BETWEEN', 'BEFORE', 'AFTER', 'THROUGH', 'UNDER', 'ACROSS'])
});

export const ELECTRONICS_PAIRS = Object.freeze([
    ['CHECK GROUND FIRST', 'then argue with the signal'], ['BENCH SUPPLY', 'current limit on'], ['OSCILLOSCOPE', 'look before guessing'], ['BREADBOARD', 'temporary by tradition'],
    ['FLUX', 'make the solder want to be there'], ['HEAT SHRINK', 'remember before soldering'], ['PULL-UP', 'floating is a choice too'], ['RELAY', 'small signal, loud click'],
    ['MOSFET', 'gate says yes or no'], ['RECTIFIER', 'one direction preferred'], ['CAPACITOR', 'charge with a memory'], ['LOGIC PROBE', 'high · low · pulse'],
    ['DESOLDER BRAID', 'undoing is a skill'], ['MULTIMETER', 'continuity before philosophy'], ['CLOCK LINE', 'everything agrees on when']
]);
