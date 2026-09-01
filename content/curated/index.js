import { MIDRANGE_VOICE, MIDRANGE_PAIRS } from './midrange.js';
import { PROJECTION_VOICE, PROJECTION_PAIRS } from './projection.js';
import { HARDWARE_VOICE, HARDWARE_PAIRS } from './hardware.js';
import { FABRICATION_VOICE, FABRICATION_PAIRS } from './fabrication.js';
import { ELECTRONICS_VOICE, ELECTRONICS_PAIRS } from './electronics.js';
import { REFRIGERATION_VOICE, REFRIGERATION_PAIRS } from './refrigeration.js';
import { SYSTEMS_VOICE, SYSTEMS_PAIRS } from './systems.js';
import { URBAN_VOICE, URBAN_PAIRS } from './urban.js';
import { TUTORIAL_PAIRS, TUTORIAL_WORDS } from './tutorial.js';
import { MYTH_VOICE, MYTH_PAIRS } from './myth.js';
import { AUTOMOTIVE_VOICE, AUTOMOTIVE_PAIRS } from './automotive.js';
import { PRINTMAKING_VOICE, PRINTMAKING_PAIRS } from './printmaking.js';
import { RADIO_VOICE, RADIO_PAIRS } from './radio.js';
import { LOGISTICS_VOICE, LOGISTICS_PAIRS } from './logistics.js';
import { MUNICIPAL_VOICE, MUNICIPAL_PAIRS } from './municipal.js';
import { MECHANICAL_VOICE, MECHANICAL_PAIRS } from './mechanical.js';
import { COMPUTING_VOICE, COMPUTING_PAIRS } from './computing.js';
import { RAIL_VOICE, RAIL_PAIRS } from './rail.js';
import { MAINTENANCE_VOICE, MAINTENANCE_PAIRS } from './maintenance.js';
import { MEASUREMENT_VOICE, MEASUREMENT_PAIRS } from './measurement.js';
import { THEATER_VOICE, THEATER_PAIRS } from './theater.js';
import { OPERATORS_VOICE, OPERATORS_PAIRS } from './operators.js';
import { DATACENTER_VOICE, DATACENTER_PAIRS } from './datacenter.js';
import { NETWORKING_VOICE, NETWORKING_PAIRS } from './networking.js';
import { ELECTRICAL_VOICE, ELECTRICAL_PAIRS } from './electrical.js';
import { PLUMBING_VOICE, PLUMBING_PAIRS } from './plumbing.js';
import { HVAC_VOICE, HVAC_PAIRS } from './hvac.js';
import { MACHINING_VOICE, MACHINING_PAIRS } from './machining.js';
import { METROLOGY_VOICE, METROLOGY_PAIRS } from './metrology.js';
import { CONTROLS_VOICE, CONTROLS_PAIRS } from './controls.js';
import { ARCHIVES_VOICE, ARCHIVES_PAIRS } from './archives.js';
import { CLERICAL_VOICE, CLERICAL_PAIRS } from './clerical.js';
import { LIBRARY_VOICE, LIBRARY_PAIRS } from './library.js';
import { PRINTING_VOICE, PRINTING_PAIRS } from './printing.js';
import { PHOTOGRAPHY_VOICE, PHOTOGRAPHY_PAIRS } from './photography.js';
import { BICYCLES_VOICE, BICYCLES_PAIRS } from './bicycles.js';
import { PLANTS_VOICE, PLANTS_PAIRS } from './plants.js';
import { AVIATION_VOICE, AVIATION_PAIRS } from './aviation.js';
import { BROADCAST_VOICE, BROADCAST_PAIRS } from './broadcast.js';

const merge = (...lists) => Object.freeze([...new Set(lists.flat())]);
const mergePairs = (...lists) => Object.freeze(lists.flat().filter((pair, index, all) => all.findIndex(other => other[0] === pair[0] && other[1] === pair[1]) === index));
const mergeVoice = (...voices) => Object.freeze({
    nouns: merge(...voices.map(v => v.nouns)),
    verbs: merge(...voices.map(v => v.verbs)),
    joints: merge(...voices.map(v => v.joints)),
});

export const CURATED_REMIX_VOICES = Object.freeze({
    street: mergeVoice(URBAN_VOICE, HARDWARE_VOICE, LOGISTICS_VOICE, MUNICIPAL_VOICE, RAIL_VOICE, AUTOMOTIVE_VOICE, BICYCLES_VOICE, PLUMBING_VOICE),
    system: mergeVoice(SYSTEMS_VOICE, MIDRANGE_VOICE, ELECTRONICS_VOICE, COMPUTING_VOICE, OPERATORS_VOICE, DATACENTER_VOICE, NETWORKING_VOICE, CONTROLS_VOICE),
    myth: mergeVoice(MYTH_VOICE, REFRIGERATION_VOICE, FABRICATION_VOICE, MECHANICAL_VOICE, PRINTMAKING_VOICE, MACHINING_VOICE, PHOTOGRAPHY_VOICE, PLANTS_VOICE),
    infra: mergeVoice(SYSTEMS_VOICE, ELECTRONICS_VOICE, REFRIGERATION_VOICE, MAINTENANCE_VOICE, MEASUREMENT_VOICE, MUNICIPAL_VOICE, ELECTRICAL_VOICE, PLUMBING_VOICE, HVAC_VOICE, CONTROLS_VOICE, DATACENTER_VOICE),
    undercity: mergeVoice(MIDRANGE_VOICE, URBAN_VOICE, PROJECTION_VOICE, RAIL_VOICE, RADIO_VOICE, THEATER_VOICE, ARCHIVES_VOICE, LIBRARY_VOICE, PRINTING_VOICE, BROADCAST_VOICE),
    wanted: Object.freeze({
        nouns: merge(['THE CITATION', 'THE WITNESS', 'THE SOURCE', 'THE MISSING CONTEXT', 'THE ORIGINAL LINK', 'THE SECOND OPINION', 'THE RECEIPT', 'THE FULL STORY'], SYSTEMS_VOICE.nouns, COMPUTING_VOICE.nouns, OPERATORS_VOICE.nouns, ARCHIVES_VOICE.nouns, CLERICAL_VOICE.nouns),
        verbs: merge(['MISSING', 'UNCONFIRMED', 'STILL WANTED', 'NOT IN CACHE', 'ASK AGAIN', 'CHECK THE SOURCE', 'LEFT NO FORWARDING ADDRESS', 'MAY EXIST'], SYSTEMS_VOICE.verbs, MEASUREMENT_VOICE.verbs, ARCHIVES_VOICE.verbs, CLERICAL_VOICE.verbs),
        joints: merge(['BEHIND', 'INSIDE', 'AFTER', 'WITHOUT', 'BEYOND'], SYSTEMS_VOICE.joints, MUNICIPAL_VOICE.joints, ARCHIVES_VOICE.joints),
    }),
    midrange: MIDRANGE_VOICE,
    projection: PROJECTION_VOICE,
    hardware: HARDWARE_VOICE,
    fabrication: FABRICATION_VOICE,
    electronics: ELECTRONICS_VOICE,
    refrigeration: REFRIGERATION_VOICE,
    urban: URBAN_VOICE,
    automotive: AUTOMOTIVE_VOICE,
    printmaking: PRINTMAKING_VOICE,
    radio: RADIO_VOICE,
    logistics: LOGISTICS_VOICE,
    municipal: MUNICIPAL_VOICE,
    mechanical: MECHANICAL_VOICE,
    computing: COMPUTING_VOICE,
    rail: RAIL_VOICE,
    maintenance: MAINTENANCE_VOICE,
    measurement: MEASUREMENT_VOICE,
    theater: THEATER_VOICE,
    operators: OPERATORS_VOICE,
    datacenter: DATACENTER_VOICE,
    networking: NETWORKING_VOICE,
    electrical: ELECTRICAL_VOICE,
    plumbing: PLUMBING_VOICE,
    hvac: HVAC_VOICE,
    machining: MACHINING_VOICE,
    metrology: METROLOGY_VOICE,
    controls: CONTROLS_VOICE,
    archives: ARCHIVES_VOICE,
    clerical: CLERICAL_VOICE,
    library: LIBRARY_VOICE,
    printing: PRINTING_VOICE,
    photography: PHOTOGRAPHY_VOICE,
    bicycles: BICYCLES_VOICE,
    plants: PLANTS_VOICE,
    aviation: AVIATION_VOICE,
    broadcast: BROADCAST_VOICE,
});

export const CURATED_GRAFFITI_VOICE_NAMES = Object.freeze(Object.keys(CURATED_REMIX_VOICES));
export const CURATED_STREET_SIGN_PAIRS = mergePairs(URBAN_PAIRS, HARDWARE_PAIRS, LOGISTICS_PAIRS, MUNICIPAL_PAIRS, RAIL_PAIRS, AUTOMOTIVE_PAIRS, BICYCLES_PAIRS, PLUMBING_PAIRS, ELECTRICAL_PAIRS, AVIATION_PAIRS);
export const CURATED_SYSTEM_SIGN_PAIRS = mergePairs(SYSTEMS_PAIRS, MIDRANGE_PAIRS, ELECTRONICS_PAIRS, COMPUTING_PAIRS, OPERATORS_PAIRS, RADIO_PAIRS, DATACENTER_PAIRS, NETWORKING_PAIRS, CONTROLS_PAIRS, BROADCAST_PAIRS);
export const CURATED_LORE_PAIRS = mergePairs(MYTH_PAIRS, REFRIGERATION_PAIRS, FABRICATION_PAIRS, MECHANICAL_PAIRS, PRINTMAKING_PAIRS, PROJECTION_PAIRS, THEATER_PAIRS, MACHINING_PAIRS, PHOTOGRAPHY_PAIRS, PLANTS_PAIRS);
export const CURATED_INFRA_PAIRS = mergePairs(MAINTENANCE_PAIRS, MEASUREMENT_PAIRS, MUNICIPAL_PAIRS, LOGISTICS_PAIRS, RAIL_PAIRS, ELECTRICAL_PAIRS, PLUMBING_PAIRS, HVAC_PAIRS, DATACENTER_PAIRS, NETWORKING_PAIRS, CONTROLS_PAIRS);
export const CURATED_RECORDS_PAIRS = mergePairs(ARCHIVES_PAIRS, CLERICAL_PAIRS, LIBRARY_PAIRS, PRINTING_PAIRS);
export const CURATED_CODE_LORE_PAIRS = Object.freeze([]);
export const CURATED_TUTORIAL_PAIRS = TUTORIAL_PAIRS;
export const CURATED_ABOUT_PAIRS = mergePairs([
    ['MEASURE, DON\'T GUESS', 'evidence before confidence'], ['TAKE IT APART', 'to see how it works'], ['FIX THE SYSTEM', 'not just the symptom'],
    ['KEEP THE OLD PART', 'until the new one proves itself'], ['FOLLOW THE SIGNAL', 'from source to effect'], ['BUILD THE TOOL', 'if the tool does not exist'],
    ['READ THE MACHINE', 'it usually tells you'], ['TRY THE SIDE DOOR', 'front doors are overrated'], ['MAKE IT WALKABLE', 'geometry should mean something'],
    ['MAKE READY MEAN READY', 'one owner, one truth'], ['THE WORLD CONTINUES', 'local detail, unbounded address space']
], MEASUREMENT_PAIRS, MAINTENANCE_PAIRS, OPERATORS_PAIRS, COMPUTING_PAIRS, METROLOGY_PAIRS, ARCHIVES_PAIRS);
export const CURATED_GRAFFITI_TAGS = Object.freeze(merge(
    TUTORIAL_WORDS,
    ...Object.values(CURATED_REMIX_VOICES).map(voice => voice.nouns)
));
export const CURATED_PACK_SUMMARY = Object.freeze({
    voices: Object.keys(CURATED_REMIX_VOICES).length,
    streetPairs: CURATED_STREET_SIGN_PAIRS.length,
    systemPairs: CURATED_SYSTEM_SIGN_PAIRS.length,
    lorePairs: CURATED_LORE_PAIRS.length,
    infraPairs: CURATED_INFRA_PAIRS.length,
    recordsPairs: CURATED_RECORDS_PAIRS.length,
    codeLorePairs: CURATED_CODE_LORE_PAIRS.length,
    graffitiTags: CURATED_GRAFFITI_TAGS.length,
});
