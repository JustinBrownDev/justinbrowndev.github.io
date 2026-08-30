export const PROJECTION_VOICE = Object.freeze({
    nouns: Object.freeze([
        'PROJECTION BOOTH', 'CHANGEOVER', 'PLATTER', 'TAKE-UP REEL', 'FEED REEL', 'APERTURE PLATE', 'LENS TURRET', 'FOCUS KNOB', 'DOUSER',
        'XENON LAMP', 'LAMPHOUSE', 'RECTIFIER', 'SOUNDHEAD', 'FOIL CUE', 'FRAME LINE', 'LEADER', 'TAIL', 'SPLICE', 'GATE', 'INTERMITTENT',
        'SHUTTER', 'PORT GLASS', 'MASKING', 'HOUSE LIGHTS', 'CUE LIGHT', 'SHOW PRINT', 'TRAILER PACK', 'BOOTH CLOCK', 'CARBON ARC GHOST'
    ]),
    verbs: Object.freeze([
        'THREADS', 'FOCUSES', 'FRAMES', 'SPLICES', 'CHANGEOVERS', 'STRIKES', 'DOWSES', 'REWINDS', 'CUES', 'MASKS', 'TRIMS', 'LISTENS', 'RIDES GAIN',
        'WATCHES THE GATE', 'CLEANS THE LENS', 'CHECKS THE FRAME LINE', 'WAITS FOR THE DOT', 'STARTS ON TIME', 'RUNS THE SHOW'
    ]),
    joints: Object.freeze(['BEHIND', 'ABOVE', 'THROUGH', 'PAST', 'BETWEEN', 'UNDER', 'BEFORE', 'AFTER', 'INSIDE'])
});

export const PROJECTION_PAIRS = Object.freeze([
    ['PROJECTION BOOTH', 'upstairs, door closed'], ['THREAD THE MACHINE', 'emulsion where it belongs'], ['FRAME LINE', 'one tooth off is still wrong'],
    ['CHANGEOVER', 'watch for the cue dots'], ['HOUSE LIGHTS', 'down on picture'], ['DOUSER', 'light exists before the audience sees it'], ['LAMPHOUSE', 'do not stare into it'],
    ['PORT GLASS', 'the room watches through here'], ['SPLICE BENCH', 'cut · tape · inspect'], ['SHOW PRINT', 'handle by the edges'], ['BOOTH CLOCK', 'the show starts whether you are ready'],
    ['FOCUS', 'center first, corners second'], ['MASKING', 'make the picture fit the room'], ['TAKE-UP', 'everything has to go somewhere'], ['LEADER', 'countdown to somebody else\'s story']
]);
