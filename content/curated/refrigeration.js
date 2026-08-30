export const REFRIGERATION_VOICE = Object.freeze({
    nouns: Object.freeze([
        'COMPRESSOR', 'CONDENSER', 'EVAPORATOR', 'METERING DEVICE', 'REVERSING VALVE', 'SUCTION LINE', 'LIQUID LINE', 'DISCHARGE LINE', 'ACCUMULATOR',
        'RECEIVER', 'FILTER DRIER', 'SIGHT GLASS', 'SERVICE PORT', 'SCHRADER CORE', 'MANIFOLD GAUGE', 'VACUUM PUMP', 'MICRON GAUGE', 'CONTACTOR', 'CAPACITOR',
        'DEFROST TIMER', 'THERMOSTAT', 'TXV', 'CAPILLARY TUBE', 'SUPERHEAT', 'SUBCOOLING', 'SATURATION', 'HEAD PRESSURE', 'SUCTION PRESSURE', 'COIL', 'FAN'
    ]),
    verbs: Object.freeze([
        'COMPRESSES', 'CONDENSES', 'EXPANDS', 'EVAPORATES', 'PUMPS HEAT', 'REVERSES', 'BOILS', 'CONDENSES AGAIN', 'PULLS VACUUM', 'HOLDS PRESSURE',
        'CHECKS SUPERHEAT', 'CHECKS SUBCOOLING', 'CYCLES', 'DEFROSTS', 'STARTS', 'STOPS', 'MOVES HEAT', 'REFUSES A FIFTH BUTTON'
    ]),
    joints: Object.freeze(['THROUGH', 'BETWEEN', 'BEFORE', 'AFTER', 'INSIDE', 'AROUND', 'UNDER', 'ABOVE'])
});

export const REFRIGERATION_PAIRS = Object.freeze([
    ['COMPRESS', 'raise the pressure'], ['CONDENSE', 'reject the heat'], ['EXPAND', 'drop the pressure'], ['EVAPORATE', 'absorb the heat'],
    ['FOUR BUTTONS', 'TIME · POWER · START · STOP'], ['REVERSING VALVE', 'same cycle, other direction'], ['SUCTION LINE', 'cool vapor returning'], ['LIQUID LINE', 'high side, still moving'],
    ['MICRON GAUGE', 'vacuum is a number'], ['FILTER DRIER', 'keep the bad stuff out'], ['SUPERHEAT', 'vapor past saturation'], ['SUBCOOLING', 'liquid below saturation'],
    ['CONTACTOR', 'big current, small command'], ['DEFROST', 'ice is not a feature'], ['MOVE HEAT', 'cold is the bookkeeping']
]);
