export const PHYSICAL_USE_SCHEMA = 'jweb.physical-use.v1';

export const PHYSICAL_USE_FAMILIES = Object.freeze([
    'residential-lodging',
    'mercantile-public',
    'business',
    'assembly-institutional',
    'industrial-service',
    'storage',
    'maintenance-utility',
]);

const MORPHOLOGY_POOLS = Object.freeze({
    'dense-tenement': Object.freeze([
        'mercantile-public', 'mercantile-public', 'mercantile-public',
        'residential-lodging', 'residential-lodging',
        'business', 'assembly-institutional',
    ]),
    'service-tenement': Object.freeze([
        'industrial-service', 'industrial-service', 'industrial-service',
        'maintenance-utility', 'maintenance-utility',
        'mercantile-public', 'storage',
    ]),
    'workshop-warehouse': Object.freeze([
        'industrial-service', 'industrial-service', 'industrial-service',
        'storage', 'storage', 'maintenance-utility', 'mercantile-public',
    ]),
    'vertical-stack': Object.freeze([
        'business', 'business', 'business',
        'residential-lodging', 'residential-lodging',
        'assembly-institutional', 'assembly-institutional',
        'storage', 'maintenance-utility',
    ]),
    default: PHYSICAL_USE_FAMILIES,
});

const PROGRAM_USE = Object.freeze({
    diner: ['mercantile-public'],
    laundromat: ['mercantile-public'],
    grocery: ['mercantile-public'],
    convenience: ['mercantile-public'],
    pharmacy: ['mercantile-public', 'assembly-institutional'],
    florist: ['mercantile-public'],
    butcher: ['mercantile-public'],
    hardware_store: ['mercantile-public', 'industrial-service'],
    print_shop: ['mercantile-public', 'industrial-service'],
    photo_lab: ['mercantile-public', 'industrial-service'],
    bar: ['assembly-institutional', 'mercantile-public'],
    arcade: ['assembly-institutional', 'mercantile-public'],
    motel_room: ['residential-lodging'],
    office: ['business'],
    '1980s_office': ['business'],
    bank: ['business', 'mercantile-public'],
    post_office: ['business', 'mercantile-public'],
    library: ['assembly-institutional', 'business'],
    archive: ['storage', 'business'],
    clinic: ['assembly-institutional', 'business'],
    dentist: ['assembly-institutional', 'business'],
    school_classroom: ['assembly-institutional'],
    courtroom: ['assembly-institutional'],
    police_booking: ['assembly-institutional'],
    funeral_home: ['assembly-institutional'],
    fire_station: ['industrial-service', 'assembly-institutional'],
    auto_shop: ['industrial-service'],
    electronics_repair: ['industrial-service', 'mercantile-public'],
    laboratory: ['industrial-service', 'business'],
    projection_booth: ['maintenance-utility', 'assembly-institutional'],
    radio_station: ['business', 'maintenance-utility'],
    boiler_room: ['maintenance-utility', 'industrial-service'],
    factory_control: ['maintenance-utility', 'industrial-service'],
    server_room: ['maintenance-utility', 'storage'],
    mainframe_room: ['maintenance-utility', 'storage'],
});

function hashString(value) {
    let h = 2166136261 >>> 0;
    const s = String(value ?? '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function familyListForMorphology(morphology) {
    return MORPHOLOGY_POOLS[morphology] ?? MORPHOLOGY_POOLS.default;
}

export function classifyPhysicalUse({ morphology = 'default', stableKey = '', districtContext = 'kowloon', override = null } = {}) {
    if (override) {
        if (!PHYSICAL_USE_FAMILIES.includes(override)) throw new Error(`unknown physical-use family ${override}`);
        return Object.freeze({
            schema: PHYSICAL_USE_SCHEMA,
            family: override,
            morphology,
            districtContext,
            decision: 'explicit-override',
            stableKey: String(stableKey),
        });
    }
    const pool = familyListForMorphology(morphology);
    const index = hashString(`${districtContext}:${morphology}:${stableKey}`) % pool.length;
    return Object.freeze({
        schema: PHYSICAL_USE_SCHEMA,
        family: pool[index],
        morphology,
        districtContext,
        decision: 'deterministic-coarse-classifier',
        stableKey: String(stableKey),
    });
}

export function physicalUseFamiliesForProgram(program) {
    return Object.freeze([...(PROGRAM_USE[program] ?? [])]);
}

export function programCompatibleWithPhysicalUse(program, physicalUse) {
    const family = typeof physicalUse === 'string' ? physicalUse : physicalUse?.family;
    if (!family || !PHYSICAL_USE_FAMILIES.includes(family)) return false;
    const families = PROGRAM_USE[program];
    return Array.isArray(families) && families.includes(family);
}

export function compatibleProgramsForPhysicalUse(programs, physicalUse) {
    return (programs ?? []).filter(program => programCompatibleWithPhysicalUse(program, physicalUse));
}

export function chooseCompatibleProgram({ programs = [], physicalUse, stableKey = '' } = {}) {
    const compatible = compatibleProgramsForPhysicalUse(programs, physicalUse);
    if (!compatible.length) return null;
    return compatible[hashString(`${physicalUse?.family ?? physicalUse}:${stableKey}`) % compatible.length];
}

export function programsForPhysicalUse(physicalUse) {
    const family = typeof physicalUse === 'string' ? physicalUse : physicalUse?.family;
    if (!family || !PHYSICAL_USE_FAMILIES.includes(family)) return [];
    return Object.freeze(Object.keys(PROGRAM_USE).filter(program => PROGRAM_USE[program].includes(family)).sort());
}
