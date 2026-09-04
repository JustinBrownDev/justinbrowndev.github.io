export const PHYSICAL_TRUTH_SCHEMA = 'jweb.physical-truth.v1';
export const PHYSICAL_TRUTH_DATA_VERSION = 'us-reference-2026-08-v1';
export const PHYSICAL_WEIRDNESS_VERSION = 'jweb.physical-weirdness.v1';
export const GAMEPLAY_TRAVERSAL_SCHEMA = 'jweb.gameplay-traversal.v1';

const INCH = 0.0254;

export const PHYSICAL_AUTHORITY = Object.freeze({
    ADA_2010_DOOR_CLEAR: Object.freeze({
        id: 'ADA-2010-404.2.3',
        domain: 'accessibility',
        edition: '2010 ADA Standards',
        sourceClass: 'federal-accessibility-standard',
        url: 'https://www.access-board.gov/ada/chapter/ch04/',
    }),
    ADA_2010_ROUTE_CLEAR: Object.freeze({
        id: 'ADA-2010-403.5.1',
        domain: 'accessibility',
        edition: '2010 ADA Standards',
        sourceClass: 'federal-accessibility-standard',
        url: 'https://www.access-board.gov/ada/chapter/ch04/',
    }),
    IBC_2024_DOOR: Object.freeze({
        id: 'IBC-2024-1010.1.1',
        domain: 'building-egress',
        edition: '2024 IBC',
        sourceClass: 'model-building-code',
        url: 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-10-means-of-egress',
    }),
    IBC_2024_STAIR: Object.freeze({
        id: 'IBC-2024-1011',
        domain: 'building-egress',
        edition: '2024 IBC',
        sourceClass: 'model-building-code',
        url: 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-10-means-of-egress',
    }),
    IRC_2021: Object.freeze({
        id: 'IRC-2021-R311.2/R311.7',
        domain: 'one-two-family-residential',
        edition: '2021 IRC',
        sourceClass: 'model-residential-code',
        url: 'https://codes.iccsafe.org/content/IRC2021P1/chapter-3-building-planning',
    }),
    OSHA_1910_25: Object.freeze({
        id: 'OSHA-29-CFR-1910.25',
        domain: 'industrial-workplace',
        edition: 'current eCFR rule',
        sourceClass: 'federal-workplace-rule',
        url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.25',
    }),
    GENERATOR_PRACTICE: Object.freeze({
        id: 'JWEB-GENERATOR-PRACTICE-v1',
        domain: 'ordinary-practice',
        edition: 'v1',
        sourceClass: 'generator-practice-not-law',
        url: null,
    }),
});

function sourceValue(value, unit = 'in') {
    const canonicalSI = unit === 'in' ? value * INCH : value;
    return Object.freeze({ sourceValue: value, sourceUnit: unit, canonicalSI });
}

function measure({ id, authority, min = null, max = null, common = null, preferred, notes = null }) {
    return Object.freeze({ id, authority, minimum: min, maximum: max, commonRange: common, preferred, notes });
}

const M = Object.freeze({
    accessibleDoorClear: measure({
        id: 'door.clearWidth', authority: PHYSICAL_AUTHORITY.ADA_2010_DOOR_CLEAR,
        min: sourceValue(32), common: [sourceValue(34), sourceValue(36)], preferred: sourceValue(36),
        notes: 'Accessible-route clear passage, measured as clear opening; not nominal leaf width.',
    }),
    publicDoorHeight: measure({
        id: 'door.clearHeight', authority: PHYSICAL_AUTHORITY.IBC_2024_DOOR,
        min: sourceValue(80), common: [sourceValue(80), sourceValue(84)], preferred: sourceValue(80),
        notes: 'Clear opening height reference for egress doors; kept separate from ADA clear-width provenance.',
    }),
    dwellingEgressDoorClear: measure({
        id: 'door.clearWidth', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(32), common: [sourceValue(32), sourceValue(36)], preferred: sourceValue(36),
        notes: 'Required dwelling egress-door clear width; not a rule for every private interior door.',
    }),
    dwellingEgressDoorHeight: measure({
        id: 'door.clearHeight', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(78), common: [sourceValue(80), sourceValue(84)], preferred: sourceValue(80),
    }),
    serviceDoorClear: measure({
        id: 'door.clearWidth', authority: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        common: [sourceValue(30), sourceValue(36)], preferred: sourceValue(32),
        notes: 'Ordinary service/maintenance generator range; not represented as code compliance.',
    }),
    serviceDoorHeight: measure({
        id: 'door.clearHeight', authority: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        common: [sourceValue(78), sourceValue(84)], preferred: sourceValue(80),
        notes: 'Ordinary service/maintenance generator range; not represented as code compliance.',
    }),
    publicStairRiser: measure({
        id: 'stair.riserHeight', authority: PHYSICAL_AUTHORITY.IBC_2024_STAIR,
        max: sourceValue(7), common: [sourceValue(6.5), sourceValue(7)], preferred: sourceValue(7),
    }),
    publicStairTread: measure({
        id: 'stair.treadDepth', authority: PHYSICAL_AUTHORITY.IBC_2024_STAIR,
        min: sourceValue(11), common: [sourceValue(11), sourceValue(12)], preferred: sourceValue(11),
    }),
    publicStairHeadroom: measure({
        id: 'stair.headroom', authority: PHYSICAL_AUTHORITY.IBC_2024_STAIR,
        min: sourceValue(80), common: [sourceValue(80), sourceValue(84)], preferred: sourceValue(80),
        notes: 'IBC 2024 Section 1011.3 minimum stairway headroom.',
    }),
    publicStairWidth: measure({
        id: 'stair.clearWidth', authority: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        common: [sourceValue(42), sourceValue(48)], preferred: sourceValue(44),
        notes: 'Common generator range. Required width depends on occupant load and other IBC conditions.',
    }),
    publicLandingDepth: measure({
        id: 'landing.depth', authority: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        common: [sourceValue(44), sourceValue(60)], preferred: sourceValue(48),
        notes: 'Common generator range; actual code requirement is context-sensitive.',
    }),
    dwellingStairRiser: measure({
        id: 'stair.riserHeight', authority: PHYSICAL_AUTHORITY.IRC_2021,
        max: sourceValue(7.75), common: [sourceValue(7), sourceValue(7.75)], preferred: sourceValue(7.5),
    }),
    dwellingStairTread: measure({
        id: 'stair.treadDepth', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(10), common: [sourceValue(10), sourceValue(11)], preferred: sourceValue(10),
    }),
    dwellingStairHeadroom: measure({
        id: 'stair.headroom', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(80), common: [sourceValue(80), sourceValue(84)], preferred: sourceValue(80),
        notes: 'IRC 2021 Section R311.7.2 stairway headroom.',
    }),
    dwellingStairWidth: measure({
        id: 'stair.clearWidth', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(36), common: [sourceValue(36), sourceValue(42)], preferred: sourceValue(36),
    }),
    dwellingLandingDepth: measure({
        id: 'landing.depth', authority: PHYSICAL_AUTHORITY.IRC_2021,
        min: sourceValue(36), common: [sourceValue(36), sourceValue(42)], preferred: sourceValue(36),
    }),
    industrialStairRiser: measure({
        id: 'stair.riserHeight', authority: PHYSICAL_AUTHORITY.OSHA_1910_25,
        max: sourceValue(9.5), common: [sourceValue(7), sourceValue(8.5)], preferred: sourceValue(7.5),
    }),
    industrialStairTread: measure({
        id: 'stair.treadDepth', authority: PHYSICAL_AUTHORITY.OSHA_1910_25,
        min: sourceValue(9.5), common: [sourceValue(9.5), sourceValue(11)], preferred: sourceValue(10),
    }),
    industrialStairHeadroom: measure({
        id: 'stair.headroom', authority: PHYSICAL_AUTHORITY.OSHA_1910_25,
        min: sourceValue(80), common: [sourceValue(80), sourceValue(84)], preferred: sourceValue(80),
        notes: 'OSHA 29 CFR 1910.25(b)(2) vertical clearance above stair treads.',
    }),
    industrialStairWidth: measure({
        id: 'stair.clearWidth', authority: PHYSICAL_AUTHORITY.OSHA_1910_25,
        min: sourceValue(22), common: [sourceValue(30), sourceValue(42)], preferred: sourceValue(36),
    }),
    industrialLandingDepth: measure({
        id: 'landing.depth', authority: PHYSICAL_AUTHORITY.OSHA_1910_25,
        min: sourceValue(30), common: [sourceValue(36), sourceValue(48)], preferred: sourceValue(36),
    }),
    accessibleRouteWidth: measure({
        id: 'route.clearWidth', authority: PHYSICAL_AUTHORITY.ADA_2010_ROUTE_CLEAR,
        min: sourceValue(36), common: [sourceValue(42), sourceValue(60)], preferred: sourceValue(48),
        notes: 'General accessible-route clear-width reference; doorway clear width is resolved separately.',
    }),
});

const PROFILE = Object.freeze({
    'residential-lodging': Object.freeze({
        floorHeight: [2.75, 3.25],
        door: { width: M.dwellingEgressDoorClear, height: M.dwellingEgressDoorHeight },
        stair: { riser: M.dwellingStairRiser, tread: M.dwellingStairTread, width: M.dwellingStairWidth, landingDepth: M.dwellingLandingDepth, headroom: M.dwellingStairHeadroom },
    }),
    'mercantile-public': Object.freeze({
        floorHeight: [3.05, 4.35],
        door: { width: M.accessibleDoorClear, height: M.publicDoorHeight },
        stair: { riser: M.publicStairRiser, tread: M.publicStairTread, width: M.publicStairWidth, landingDepth: M.publicLandingDepth, headroom: M.publicStairHeadroom },
    }),
    business: Object.freeze({
        floorHeight: [2.95, 4.05],
        door: { width: M.accessibleDoorClear, height: M.publicDoorHeight },
        stair: { riser: M.publicStairRiser, tread: M.publicStairTread, width: M.publicStairWidth, landingDepth: M.publicLandingDepth, headroom: M.publicStairHeadroom },
    }),
    'assembly-institutional': Object.freeze({
        floorHeight: [3.2, 4.8],
        door: { width: M.accessibleDoorClear, height: M.publicDoorHeight },
        stair: { riser: M.publicStairRiser, tread: M.publicStairTread, width: M.publicStairWidth, landingDepth: M.publicLandingDepth, headroom: M.publicStairHeadroom },
    }),
    'industrial-service': Object.freeze({
        floorHeight: [3.35, 5.6],
        door: { width: M.serviceDoorClear, height: M.serviceDoorHeight },
        stair: { riser: M.industrialStairRiser, tread: M.industrialStairTread, width: M.industrialStairWidth, landingDepth: M.industrialLandingDepth, headroom: M.industrialStairHeadroom },
    }),
    storage: Object.freeze({
        floorHeight: [3.1, 5.8],
        door: { width: M.serviceDoorClear, height: M.serviceDoorHeight },
        stair: { riser: M.industrialStairRiser, tread: M.industrialStairTread, width: M.industrialStairWidth, landingDepth: M.industrialLandingDepth, headroom: M.industrialStairHeadroom },
    }),
    'maintenance-utility': Object.freeze({
        floorHeight: [2.8, 4.8],
        door: { width: M.serviceDoorClear, height: M.serviceDoorHeight },
        stair: { riser: M.industrialStairRiser, tread: M.industrialStairTread, width: M.industrialStairWidth, landingDepth: M.industrialLandingDepth, headroom: M.industrialStairHeadroom },
    }),
});

function hashString(value) {
    let h = 2166136261 >>> 0;
    for (const ch of String(value ?? '')) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function deterministic01(key) { return hashString(key) / 4294967295; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function si(value) { return Number(value?.canonicalSI ?? value) || 0; }

function selectRange(range, key) {
    if (!Array.isArray(range)) return Number(range) || 0;
    const lo = si(range[0]);
    const hi = si(range[1]);
    return lo + (hi - lo) * deterministic01(key);
}

function selectMeasurement(measurement, key) {
    if (Array.isArray(measurement?.commonRange)) return selectRange(measurement.commonRange, key);
    return si(measurement?.preferred);
}

function physicalModifiers(family, weirdness, key) {
    const w = clamp(Number(weirdness) || 0, 0, 1);
    const ageSign = deterministic01(`${key}:age-sign`) < 0.5 ? -1 : 1;
    const weirdSign = deterministic01(`${key}:weird-sign`) < 0.5 ? -1 : 1;
    const ageMagnitude = deterministic01(`${key}:age-magnitude`) * 0.035;
    const weirdMagnitude = w * w;
    const publicFamily = ['mercantile-public', 'business', 'assembly-institutional'].includes(family);
    return Object.freeze({
        ageLocal: Object.freeze({
            widthScale: 1 + ageSign * ageMagnitude,
            verticalScale: 1 - ageSign * ageMagnitude * 0.45,
            source: 'jweb.age-local-variation.v1',
        }),
        weirdness: Object.freeze({
            amount: w,
            widthScale: clamp(1 + weirdSign * weirdMagnitude * (publicFamily ? 0.07 : 0.12), 0.82, 1.18),
            verticalScale: clamp(1 - weirdSign * weirdMagnitude * 0.045, 0.90, 1.12),
            stairSteepness: clamp(1 + weirdSign * weirdMagnitude * (['industrial-service', 'maintenance-utility'].includes(family) ? 0.10 : 0.06), 0.90, 1.12),
            source: PHYSICAL_WEIRDNESS_VERSION,
        }),
    });
}

function recordMeasurement(measurement, selectedSI, ageLocalSI, realizedSI, modifiers) {
    const min = measurement?.minimum ? si(measurement.minimum) : null;
    const max = measurement?.maximum ? si(measurement.maximum) : null;
    const outside = (min != null && realizedSI < min - 1e-9) || (max != null && realizedSI > max + 1e-9);
    return Object.freeze({
        schema: PHYSICAL_TRUTH_SCHEMA,
        truthDataVersion: PHYSICAL_TRUTH_DATA_VERSION,
        measurementType: measurement?.id ?? null,
        provenance: measurement?.authority ?? PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        sourceMinimum: measurement?.minimum ?? null,
        sourceMaximum: measurement?.maximum ?? null,
        commonRange: measurement?.commonRange ?? null,
        preferredSourceValue: measurement?.preferred ?? null,
        notes: measurement?.notes ?? null,
        selectedNominalSI: selectedSI,
        baselineSI: selectedSI,
        ageLocalModifiedSI: ageLocalSI,
        weirdnessModifiedSI: realizedSI,
        realizedSI,
        gameplayAdjustmentSI: null,
        modifiers,
        classification: outside
            ? 'deliberate-weirdness-outside-modern-baseline'
            : modifiers.weirdness.amount > 0.45 ? 'weird-but-within-baseline' : 'ordinary-or-plausible',
    });
}

function doorMeasuresForRole(profile, role) {
    if (role === 'accessible-public-entry') return { width: M.accessibleDoorClear, height: M.publicDoorHeight };
    if (role === 'dwelling-entry') return { width: M.dwellingEgressDoorClear, height: M.dwellingEgressDoorHeight };
    if (role === 'maintenance-access' || role === 'service-route' || role === 'roof-access') {
        return { width: M.serviceDoorClear, height: M.serviceDoorHeight };
    }
    return profile.door;
}

export function resolvePhysicalTruth({ physicalUse, role = 'primary-public', weirdness = 0, stableKey = '' } = {}) {
    const family = typeof physicalUse === 'string' ? physicalUse : physicalUse?.family;
    const profile = PROFILE[family] ?? PROFILE.business;
    const doorMeasures = doorMeasuresForRole(profile, role);
    const modifiers = physicalModifiers(family, weirdness, stableKey);

    const doorWidthBase = selectMeasurement(doorMeasures.width, `${stableKey}:door-width`);
    const doorHeightBase = selectMeasurement(doorMeasures.height, `${stableKey}:door-height`);
    const stairRiserBase = selectMeasurement(profile.stair.riser, `${stableKey}:stair-riser`);
    const stairTreadBase = selectMeasurement(profile.stair.tread, `${stableKey}:stair-tread`);
    const stairWidthBase = selectMeasurement(profile.stair.width, `${stableKey}:stair-width`);
    const landingBase = selectMeasurement(profile.stair.landingDepth, `${stableKey}:landing-depth`);
    const headroomBase = selectMeasurement(profile.stair.headroom, `${stableKey}:stair-headroom`);
    const floorBase = selectRange(profile.floorHeight, `${stableKey}:floor-height`);

    const doorwayWeirdScale = role === 'maintenance-access'
        ? Math.min(1, modifiers.weirdness.widthScale)
        : modifiers.weirdness.widthScale;
    const doorWidthAged = doorWidthBase * modifiers.ageLocal.widthScale;
    const doorHeightAged = doorHeightBase * modifiers.ageLocal.verticalScale;
    const riserAged = stairRiserBase / modifiers.ageLocal.verticalScale;
    const treadAged = stairTreadBase * modifiers.ageLocal.widthScale;

    const result = {
        schema: PHYSICAL_TRUTH_SCHEMA,
        truthDataVersion: PHYSICAL_TRUTH_DATA_VERSION,
        weirdnessVersion: PHYSICAL_WEIRDNESS_VERSION,
        physicalUse: family,
        role,
        stableKey: String(stableKey),
        door: {
            clearWidth: recordMeasurement(doorMeasures.width, doorWidthBase, doorWidthAged, doorWidthAged * doorwayWeirdScale, modifiers),
            clearHeight: recordMeasurement(doorMeasures.height, doorHeightBase, doorHeightAged, doorHeightAged * modifiers.weirdness.verticalScale, modifiers),
            approachDepthSI: role === 'accessible-public-entry' ? 1.22 : role === 'primary-public' ? 1.10 : 0.92,
            approachDepthAuthority: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
            approachDepthNotes: role === 'accessible-public-entry'
                ? 'Generator reservation inspired by accessible maneuvering needs; actual ADA 404.2.4 clearance depends on approach and swing.'
                : 'Generator circulation reservation, not a universal code dimension.',
        },
        stair: {
            riser: recordMeasurement(profile.stair.riser, stairRiserBase, riserAged, riserAged * modifiers.weirdness.stairSteepness, modifiers),
            tread: recordMeasurement(profile.stair.tread, stairTreadBase, treadAged, treadAged / modifiers.weirdness.stairSteepness, modifiers),
            widthSI: stairWidthBase * modifiers.ageLocal.widthScale * modifiers.weirdness.widthScale,
            widthProvenance: profile.stair.width.authority ?? PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
            landingDepthSI: landingBase * modifiers.ageLocal.widthScale * modifiers.weirdness.widthScale,
            landingDepthProvenance: profile.stair.landingDepth.authority ?? PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
            headroom: recordMeasurement(profile.stair.headroom, headroomBase, headroomBase * modifiers.ageLocal.verticalScale, headroomBase * modifiers.ageLocal.verticalScale * modifiers.weirdness.verticalScale, modifiers),
            headroomSI: headroomBase * modifiers.ageLocal.verticalScale * modifiers.weirdness.verticalScale,
        },
        route: {
            headroomSI: Math.max(1.88, headroomBase * modifiers.ageLocal.verticalScale * modifiers.weirdness.verticalScale),
            accessibleClearWidthSI: selectMeasurement(M.accessibleRouteWidth, `${stableKey}:accessible-route`),
            accessibleClearWidthProvenance: M.accessibleRouteWidth.authority,
        },
        floorHeight: {
            baselineSI: floorBase,
            selectedNominalSI: floorBase,
            ageLocalModifiedSI: floorBase * modifiers.ageLocal.verticalScale,
            weirdnessModifiedSI: floorBase * modifiers.ageLocal.verticalScale * modifiers.weirdness.verticalScale,
            realizedSI: floorBase * modifiers.ageLocal.verticalScale * modifiers.weirdness.verticalScale,
            commonRangeSI: [...profile.floorHeight],
            provenance: PHYSICAL_AUTHORITY.GENERATOR_PRACTICE,
        },
        modifiers,
    };
    return Object.freeze(result);
}

export function deriveStairFlight({ rise, truth, stableKey = '', availableRun = null } = {}) {
    if (!(rise > 0) || !truth?.stair) throw new Error('deriveStairFlight requires positive rise and resolved physical truth');
    const maxRiser = Math.max(0.08, truth.stair.riser.realizedSI);
    const nominalTread = Math.max(0.08, truth.stair.tread.realizedSI);
    const riserCount = Math.max(1, Math.ceil(rise / maxRiser - 1e-12));
    const exactRiser = rise / riserCount;
    const requiredRun = Math.max(0, (riserCount - 1) * nominalTread);
    const finiteRun = Number.isFinite(availableRun) && availableRun >= 0 ? availableRun : requiredRun;
    const realizedTread = riserCount > 1 ? finiteRun / (riserCount - 1) : 0;
    const sourceMinimumTread = truth.stair.tread.sourceMinimum ? si(truth.stair.tread.sourceMinimum) : null;
    // Preserve the existing source-minimum compression behavior for ordinary
    // stairs, but never let that source minimum invalidate a deliberately weird
    // resolved truth that is already below it. Geometry must satisfy whichever
    // admissible tread floor is lower: resolved truth or the source minimum.
    const geometryMinimumTread = sourceMinimumTread == null
        ? null
        : Math.min(nominalTread, sourceMinimumTread);
    const runOutsideResolvedTruth = geometryMinimumTread != null
        && riserCount > 1
        && realizedTread + 1e-9 < geometryMinimumTread;
    const resolvedTruthOutsideSourceMinimum = sourceMinimumTread != null
        && nominalTread + 1e-9 < sourceMinimumTread;
    return Object.freeze({
        schema: 'jweb.stair-flight.v1',
        stableKey: String(stableKey),
        rise,
        riserCount,
        stepCount: riserCount,
        riserHeight: exactRiser,
        nominalTreadDepth: nominalTread,
        requiredRun,
        realizedRun: finiteRun,
        realizedTreadDepth: realizedTread,
        clearWidth: truth.stair.widthSI,
        landingDepth: truth.stair.landingDepthSI,
        headroom: truth.stair.headroomSI,
        fitClassification: runOutsideResolvedTruth ? 'geometry-fit-outside-truth' : 'fits-resolved-truth',
        baselineClassification: resolvedTruthOutsideSourceMinimum
            ? 'resolved-truth-outside-source-minimum'
            : 'resolved-truth-within-source-minimum',
        fitThresholdTreadDepth: geometryMinimumTread,
        fitThresholdBasis: resolvedTruthOutsideSourceMinimum
            ? 'resolved-truth'
            : (sourceMinimumTread == null ? 'unconstrained-source' : 'source-minimum'),
        physicalTruth: truth,
    });
}

export function gameplayTraversalEnvelope({
    playerRadius = 0.22,
    bodyHeight = 1.80,
    maxStep = 0.65,
    jumpSpeed = 5.5,
    gravity = -16,
    horizontalSpeed = 4.5,
    sprintMultiplier = 1.7,
    jumpSafetyFactor = 0.72,
    minJumpLandingDepth = 0.85,
} = {}) {
    const gravityMagnitude = Math.max(0.001, Math.abs(Number(gravity) || 16));
    const resolvedJumpSpeed = Math.max(0, Number(jumpSpeed) || 0);
    const resolvedHorizontalSpeed = Math.max(0, Number(horizontalSpeed) || 0);
    const resolvedSprintMultiplier = Math.max(1, Number(sprintMultiplier) || 1);
    const safety = clamp(Number(jumpSafetyFactor) || 0.72, 0.35, 0.95);
    const apexHeight = resolvedJumpSpeed * resolvedJumpSpeed / (2 * gravityMagnitude);
    const sameLevelFlightTime = resolvedJumpSpeed > 0 ? (2 * resolvedJumpSpeed / gravityMagnitude) : 0;
    const easySameLevelRange = resolvedHorizontalSpeed * sameLevelFlightTime * safety;
    const sprintSameLevelRange = resolvedHorizontalSpeed * resolvedSprintMultiplier * sameLevelFlightTime * safety;
    const bidirectionalRise = Math.min(Math.max(0, Number(maxStep) || 0), apexHeight * 0.55);
    return Object.freeze({
        schema: GAMEPLAY_TRAVERSAL_SCHEMA,
        playerRadius,
        bodyHeight,
        maxStep,
        jump: Object.freeze({
            jumpSpeed: resolvedJumpSpeed,
            gravityMagnitude,
            horizontalSpeed: resolvedHorizontalSpeed,
            sprintMultiplier: resolvedSprintMultiplier,
            safetyFactor: safety,
            apexHeight,
            sameLevelFlightTime,
            easySameLevelRange,
            sprintSameLevelRange,
            maxBidirectionalRise: bidirectionalRise,
            minLandingDepth: Math.max(0.55, Number(minJumpLandingDepth) || 0.85),
            authority: 'gameplay-controller-ballistic-envelope',
        }),
        authority: 'gameplay-controller-not-architecture',
        mayRelaxTraversal: true,
        architecturalInput: false,
    });
}
