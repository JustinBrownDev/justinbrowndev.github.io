import { CURATED_GRAFFITI_TAGS } from './curated/index.js';

 
 
 
export const BASE_GRAFFITI_TAGS = [
    'U R HERE', 'SEARCH != FIND', 'STILL LOOKING?', 'NOBODY HOME',
    '404 LOVE', 'HE WAS HERE', 'MORE THAN ONE', 'ASK THE GUY',
    'NOT THIS ONE EITHER', 'KEEP WALKING', 'PUBLIC SECRET', 'UNBOUND',
     
     
    'NO 5TH BUTTON', 'OPEN THE CASE', 'THE CYCLE KNOWS', 'JTHEWAY',
    'HEAT SHALL MOVE', 'WHO LEFT THIS OPEN', 'YES BUT HOW', 'REMOVE THE COVER',
     
     
     
    'THE HUMMING RIG', 'BORROWED SILICON', 'THE TOKEN GATE', 'UNLESS-STOPPED',
    'MEASURE DON\'T GUESS', 'QUANTIZED GHOST',
    'THE LEDGER SPIRE', 'THE ROLLBACK SHADOW', 'THE ROUTING SIGIL', 'THE GHOST TYPO',
    'GO LOOK AT THE WIRE', 'DIFF ALWAYS',
     
     
     
     
    ...(() => {
        const subjects = [
            'THE CYCLE', 'THE FIFTH BUTTON', 'THE VISE', 'THE WORKBENCH', 'THE OPEN CASE',
            'THE COMPRESSOR', 'THE MAGNETRON', 'JTHEWAY', '8gH', 'THE SEALED BLACK BOX',
            'THE REVERSING VALVE', 'THE SIGNAL',
        ];
        const predicates = [
            'KNOWS', 'REMEMBERS', 'WAS HERE', 'NEVER SLEEPS', 'IS WATCHING',
            "WON'T ROTATE", 'REMAINS SEALED', 'ADMITS NOTHING', 'STILL COMPRESSING',
            'HAS NO FIFTH BUTTON', 'ASKS WHAT IT DOES', 'NEVER PLUGGED IN',
            'KEEPS NO RECORD', 'OPENED ANYWAY',
        ];
        const out = [];
        for (const s of subjects) for (const p of predicates) out.push(`${s} ${p}`);
        return out;
    })(),
     
     
     
     
     
     
     
     
    ...CURATED_GRAFFITI_TAGS,
];
