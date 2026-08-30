export const URBAN_VOICE = Object.freeze({
    nouns: Object.freeze([
        'CROSSROAD', 'SERVICE ALLEY', 'LOADING DOCK', 'FIRE ESCAPE', 'ROOFTOP', 'CATWALK', 'STAIR TOWER', 'UTILITY ROOM', 'BASEMENT DOOR', 'SIDE ENTRANCE',
        'TRANSFORMER VAULT', 'MANHOLE', 'CURB CUT', 'BUS SHELTER', 'NEWSSTAND', 'PHONE BOOTH', 'PARKING METER', 'AWNING', 'BACK LOT', 'FENCE LINE',
        'WATER TOWER', 'VENT STACK', 'ROOF GARDEN', 'BOILER ROOM', 'MECHANICAL FLOOR', 'SERVICE CORRIDOR', 'CROSSWALK', 'MEDIAN', 'ALLEY LIGHT', 'DUMPSTER PAD'
    ]),
    verbs: Object.freeze([
        'CROSSES', 'CONNECTS', 'DEAD-ENDS', 'TURNS', 'CLIMBS', 'DESCENDS', 'DRAINS', 'VENTS', 'HUMS', 'FLICKERS', 'OPENS', 'LOCKS', 'LEAKS', 'RATTLES',
        'BACKS UP', 'CUTS THROUGH', 'LEADS SOMEWHERE', 'LOOKS CLOSED', 'IS NOT CLOSED'
    ]),
    joints: Object.freeze(['AT', 'PAST', 'UNDER', 'OVER', 'BEHIND', 'BETWEEN', 'ACROSS', 'INSIDE', 'NEXT TO'])
});

export const URBAN_PAIRS = Object.freeze([
    ['CROSSROAD', 'four ways to be wrong'], ['SERVICE ALLEY', 'deliveries after six'], ['FIRE ESCAPE', 'stairs on the outside'], ['LOADING DOCK', 'keep clear'],
    ['ROOFTOP ACCESS', 'door may alarm'], ['CATWALK', 'another route above'], ['STAIR TOWER', 'vertical street'], ['TRANSFORMER VAULT', 'no storage'],
    ['MANHOLE', 'the city has another floor'], ['CURB CUT', 'small geometry, real consequence'], ['MECHANICAL FLOOR', 'the building keeps its organs here'], ['SIDE ENTRANCE', 'front door is optional'],
    ['SERVICE CORRIDOR', 'public enough to walk'], ['BACK LOT', 'nothing is actually behind'], ['ALLEY LIGHT', 'daylight still needs help']
]);
