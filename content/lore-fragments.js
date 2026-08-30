import { QP } from '../runtime/main-quantitative-literals.js';
import { CURATED_LORE_PAIRS, CURATED_SYSTEM_SIGN_PAIRS, CURATED_STREET_SIGN_PAIRS, CURATED_INFRA_PAIRS, CURATED_RECORDS_PAIRS } from './curated/index.js';

 
 
 
 
export const MYTHOLOGY_FRAGMENTS = [
    ...CURATED_LORE_PAIRS,
    ['FOUR BUTTONS', 'time -- power -- start -- stop'],
    ['THE FIFTH WAS JUDGED', 'ruled unnecessary, disputed since'],
    ['HIS EMINENCE OF REFRIGERATION', 'sovereign of the cycle'],
    ['THE VISE-GRIP REVELATION', 'the moment gripping acquired state'],
    ['8gH', 'a signature attached to opened structures'],
    ['TAKE IT APART', 'to see how it works'],
     
     
     
    ...(() => {
        const titles = [
            'KEEPER', 'PROTECTOR', 'DEFENDER', 'WARDEN', 'MASTER', 'PATRIARCH',
            'LORD', 'SOVEREIGN', 'FATHER', 'JUDGE', 'WITNESS', 'FIRST ENGINEER',
        ];
        const domains = [
            'THE COMPRESSOR', 'THE SUCTION LINE', 'THE DISCHARGE LINE', 'THE EVAPORATOR',
            'THE CONDENSER', 'THE REVERSING VALVE', 'THE CYCLE', 'THE FIFTH BUTTON',
            'THE VISE', 'THE OPEN CASE', 'THE FOUR BUTTONS', 'THE SMALL PLANT DEPARTMENT',
            'THE RIGHT LAYER', 'THE SEALED BLACK BOX',
        ];
        const subs = [
            'not disputed, allegedly', 'ruled unnecessary', 'convened once, never again',
            'sealed since installation', 'opened anyway', 'still rotating', 'never plugged in',
            'compress -- condense -- expand -- evaporate', 'a title, not a job', 'self-appointed',
        ];
        const out = [];
        let i = QP[3535];
        for (const t of titles) for (const d of domains) out.push([`${t} OF ${d}`, subs[i++ % subs.length]]);
        return out;
    })(),
];

 
 
 
 
 
 
 
export const INFRA_LORE_FRAGMENTS = [
    ...CURATED_SYSTEM_SIGN_PAIRS,
    ...CURATED_INFRA_PAIRS,
    ['THE HUMMING RIG', 'a back-room machine nobody official admits exists'],
    ['BORROWED SILICON', 'a slice of a bigger machine, pretending to be whole'],
    ['THE LEASH LENGTH', 'how much fast-memory a mind gets before it forgets'],
    ['THE THROTTLE COLLAR', 'a wattage cap keeping the rig from screaming'],
    ['THE DOORWAY, NOT THE GUEST', "won't see its own hardware? fix the wall"],
    ['THE TOKEN GATE', 'nothing talks to the mind without a whispered key'],
    ['THE CLOSED LOOP', 'speaks only inside these walls, never out'],
    ['PLAINTEXT DREAD', 'the itch of wires still carrying things in the clear'],
    ['QUANTIZED GHOST', 'a shrunk-down copy of a bigger mind, cheaper, good enough'],
    ['THE CONTAINER JAR', 'a sealed vessel the mind lives in -- smash it, rebuild it'],
    ['UNLESS-STOPPED', 'a vow to come back no matter what kills it'],
    ["MEASURE, DON'T GUESS", 'theoretical capacity means nothing until it sweats'],
    ['RECURSION SICKNESS', 'the building, the room, the bowl, the fly on the fruit'],
    ['THE PROVENANCE OBSESSION', 'never move a fact without its source stapled on'],
    ['THE REALITY WARNING LABEL', 'no archive holds the true inside of every locked room'],
     
     
    ...(() => {
        const subjects = [
            'THE HUMMING RIG', 'BORROWED SILICON', 'THE TOKEN GATE', 'THE CLOSED LOOP',
            'QUANTIZED GHOST', 'THE CONTAINER JAR', 'THE THROTTLE COLLAR',
            'THE ABSTRACTION-CROSSER', 'THE EVIDENCE HUNGER', 'THE DRIFTING FINISH LINE',
        ];
        const predicates = [
            'KNOWS', 'REMEMBERS', 'NEVER SLEEPS', 'ADMITS NOTHING', 'KEEPS NO RECORD',
            "WON'T BE RUSHED", 'ASKS FOR THE RECEIPT', 'STILL COUNTING', 'WAS HERE FIRST',
            'TRUSTS NOTHING UNMEASURED',
        ];
        const subs = [
            'not up for debate', 'measured, not guessed', 'still true, probably',
            'the wattage cap holds', 'the key was never written down', 'checked, not assumed',
        ];
        const out = [];
        let i = QP[3536];
        for (const s of subjects) for (const p of predicates) out.push([`${s} ${p}`, subs[i++ % subs.length]]);
        return out;
    })(),
];

 
 
 
 
 
 
export const UNDERCITY_LORE_FRAGMENTS = [
    ...CURATED_STREET_SIGN_PAIRS,
    ...CURATED_RECORDS_PAIRS,
    ['THE LEDGER SPIRE', 'the oldest core module in the tower-stack'],
    ['THE FILING DAEMON', 'used to eat submissions all night, choked on duplicates'],
    ['THE NOTICE ENGINE', 'sometimes prints the address in the wrong window'],
    ['THE MACRO VAULT', 'overwrite it wholesale, erase a decade of tribal knowledge'],
    ['THE ROLLBACK SHADOW', 'every current object has a ghost twin in the obsolete-vault'],
    ['THE PATCH COURIER', 'can push code to every district at once -- handled like a loaded weapon'],
    ['THE WORK-FILE ORACLE', 'the unglamorous process that actually populates the numbers'],
    ['THE JURISDICTION MATRIX', 'trusted like scripture, consulted like a rumor'],
    ['THE ROUTING SIGIL', 'two digits, opposite meaning, in two different towers'],
    ['THE ACCUMULATOR BLEED', 'a combined total quietly eating into the wrong bucket'],
    ['THE LEVEL-CHECK GHOST', 'ship the format and its programs together, always'],
    ['THE PHANTOM JOB', "an error that escaped from someone else's batch run"],
    ['THE SENTINEL TUPLE', 'a blank key that should never match a real row, but sometimes does'],
    ['THE SPOOL GRAVEYARD', 'finished print jobs that never actually reached paper'],
    ['THE VERSION-SKEW TAX', 'forty-plus installs, each slightly different, expected identical'],
    ['THE GHOST TYPO', 'a misspelling baked in so deep nobody dares fix it'],
     
     
    ...(() => {
        const subjects = [
            'THE LEDGER SPIRE', 'THE FILING DAEMON', 'THE ROLLBACK SHADOW', 'THE PATCH COURIER',
            'THE ROUTING SIGIL', 'THE JURISDICTION MATRIX', 'THE SPOOL GRAVEYARD',
            'THE SENTINEL TUPLE', 'THE PHANTOM JOB', 'THE MACRO VAULT',
        ];
        const predicates = [
            'KNOWS', 'REMEMBERS', 'WAS HERE FIRST', 'NEVER SLEEPS', 'ADMITS NOTHING',
            'KEEPS NO RECORD', "WON'T EXPLAIN ITSELF", 'ASKS NO QUESTIONS', 'STILL RUNNING',
            'OUTLASTS EVERYONE WHO BUILT IT',
        ];
        const subs = [
            'check the wire before the code', 'diff always, ask first',
            'older than most who fix it', 'folklore, not current truth',
            'correlate before you panic', 'go look there first',
        ];
        const out = [];
        let i = QP[3537];
        for (const s of subjects) for (const p of predicates) out.push([`${s} ${p}`, subs[i++ % subs.length]]);
        return out;
    })(),
];
