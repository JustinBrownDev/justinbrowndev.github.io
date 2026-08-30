export const FABRICATION_VOICE = Object.freeze({
    nouns: Object.freeze([
        'WELD TABLE', 'GROUND CLAMP', 'MIG GUN', 'TIG TORCH', 'STINGER', 'FILLER ROD', 'WIRE SPOOL', 'CONTACT TIP', 'NOZZLE', 'REGULATOR',
        'ARGON BOTTLE', 'ACETYLENE BOTTLE', 'OXYGEN BOTTLE', 'ANGLE GRINDER', 'FLAP DISC', 'CUTOFF WHEEL', 'BENCH VISE', 'C-CLAMP', 'VISE-GRIP',
        'LAYOUT DYE', 'SCRIBE', 'CENTER PUNCH', 'CALIPER', 'SQUARE', 'TAPE MEASURE', 'BAND SAW', 'DRILL PRESS', 'CHIP BRUSH', 'SLAG HAMMER', 'HEAT-AFFECTED ZONE'
    ]),
    verbs: Object.freeze([
        'TACKS', 'FITS', 'CLAMPS', 'SQUARES', 'BEVELS', 'GRINDS', 'DEBURRS', 'WELDS', 'BRAZES', 'CUTS', 'DRILLS', 'PUNCHES', 'MEASURES', 'CHECKS DIAGONALS',
        'SETS THE GAS', 'CLEANS THE JOINT', 'BREAKS THE EDGE', 'LET IT COOL', 'FLIPS THE PART', 'FINISHES THE BEAD'
    ]),
    joints: Object.freeze(['ON', 'UNDER', 'AGAINST', 'BEFORE', 'AFTER', 'BETWEEN', 'THROUGH', 'ALONG'])
});

export const FABRICATION_PAIRS = Object.freeze([
    ['TACK FIRST', 'commit later'], ['CHECK THE DIAGONALS', 'square is a measurement'], ['GROUND CLAMP', 'clean metal helps'], ['MIG WIRE', 'feed smooth'],
    ['TIG TORCH', 'less hurry, more control'], ['ANGLE GRINDER', 'the universal apology'], ['BENCH VISE', 'third hand with a screw'], ['VISE-GRIP', 'geometry by persuasion'],
    ['CENTER PUNCH', 'drill starts where you meant'], ['CALIPER', 'trust but measure'], ['FLAP DISC', 'remove only what you intended'], ['ARGON', 'close the bottle when done'],
    ['WELD TABLE', 'flat enough to argue with'], ['DEBURR', 'future hands will notice'], ['HEAT-AFFECTED ZONE', 'the metal remembers']
]);
