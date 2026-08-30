 
 
 
 
 
 
 
 
 
 
 
export const WIKI_FALLBACK = [
    ['DANCING MANIA', 'medieval outbreak, unexplained'],
    ['SPONTANEOUS HUMAN COMBUSTION', 'disputed phenomenon'],
    ['THE GREAT EMU WAR', 'Australia, 1932'],
    ["ROKO'S BASILISK", 'thought experiment'],
    ['TUNGUSKA EVENT', '1908, Siberia'],
    ['VOYNICH MANUSCRIPT', 'undeciphered, 15th c.'],
    ['LIST OF UNUSUAL DEATHS', 'exactly what it sounds like'],
    ['MOTHMAN', 'Point Pleasant, WV'],
    ['THE BLOOP', 'unexplained ocean sound'],
    ['WOW! SIGNAL', '1977, unexplained'],
    ['FERMI PARADOX', 'where is everybody'],
    ['TULIP MANIA', '1637, Dutch bubble'],
    ['BARNUM EFFECT', 'personality feedback'],
    ['DYATLOV PASS INCIDENT', '1959, unresolved'],
    ['ANTIKYTHERA MECHANISM', 'ancient analog computer'],
    ['CICADA 3301', 'internet mystery'],
    ['KASPAR HAUSER', 'feral child mystery'],
    ['PHANTOM TIME HYPOTHESIS', 'conspiracy theory'],
    ['BALL LIGHTNING', 'unexplained atmospheric'],
    ['THE DYATLOV PASS', 'nine hikers, 1959'],
];

 
 
 
 
 
 
 
 
 
export const PERSONAL_WANTED_FACTS = [
    ['NEVER FIT IN', 'hippie, skater, gay, freak, hacker'],
    ['MOSTLY STRAIGHT EDGE NOW', 'reformed, allegedly'],
    ['RAN TRACK', 'high school, distance events'],
    ['@BRUCEFALLITM', 'instagram -- unconfirmed sightings'],
    ['@SMALLPLANTENTHUSIAST', 'instagram -- succulents, mostly'],
    ['ARMED WITH OPINIONS', 'approach with snacks'],
     
     
    ['JUDGE OF THE FIFTH BUTTON', 'convened one microwave tribunal'],
    ['KEEPER OF THE CYCLE', 'compress -- condense -- expand -- evaporate'],
    ['THE WORKBENCH IS AN ALTAR', 'not a mess, allegedly'],
    ['NO USER-SERVICEABLE PARTS', 'disputed, opened anyway'],
     
     
     
    ['KEEPS A MACHINE HUMMING', 'back room, off any map, allegedly'],
    ['FIXES THE DOORWAY, NOT THE GHOST', 'the wall was blind, not the guest'],
    ['CARRIES A LOCKED JAR', 'a borrowed mind, fed just enough silicon'],
    ['MEASURES INSTEAD OF GUESSING', 'theoretical capacity means nothing unsweated'],
];

 
 
 
export const WANTED_TAGLINES = [
    ['KNOWLEDGE OF THIS TOPIC', 'REWARD: PEACE OF MIND'],
    ['ANY FURTHER DETAIL', 'REWARD: A GOOD STORY'],
    ['A CREDIBLE SOURCE', 'REWARD: DISBELIEF, EARNED'],
    ['ONE STRAIGHT ANSWER', 'REWARD: NONE OFFERED'],
    ['THE ORIGINAL CITATION', 'REWARD: GOOD LUCK'],
    ['A SECOND WITNESS', 'REWARD: STILL LOOKING'],
     
     
     
     
    ...(() => {
        const subjects = [
            'A WORKING LINK', 'THE REST OF THE SENTENCE', 'A NAME THAT MATCHES',
            'ANY CORROBORATION', 'A DATE THAT CHECKS OUT', 'THE MISSING CONTEXT',
            'A SOURCE THAT ISN\'T THIS PAGE', 'WHOEVER SAID THIS FIRST', 'THE FULL STORY',
            'ONE VERIFIABLE FACT', 'A SECOND OPINION', 'THE ORIGINAL POST',
            'A PLAUSIBLE EXPLANATION', 'ANYONE WHO REMEMBERS', 'THE FINE PRINT',
        ];
        const rewards = [
            'REWARD: PEACE OF MIND', 'REWARD: A GOOD STORY', 'REWARD: DISBELIEF, EARNED',
            'REWARD: NONE OFFERED', 'REWARD: GOOD LUCK', 'REWARD: STILL LOOKING',
            'REWARD: NOTHING, PROBABLY', 'REWARD: AN EXPLANATION, EVENTUALLY',
            'REWARD: A SHRUG', 'REWARD: YOU TELL ME',
        ];
        const out = [];
        for (const s of subjects) for (const r of rewards) out.push([s, r]);
        return out;
    })(),
];
