import { compileSpawnSpatialPlan } from './spawn-spatial-plan.js';
import { createMediaIntent } from './jweb-media-channel-pack/index.mjs';

const LOCATION_URL = new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url);
const ASSET_URL = new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url);

export function hashString32(value) {
    let h = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function weightedPick(rng, values) {
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + Math.max(0, Number(value?.weight) || 1), 0);
    if (!(total > 0)) return values[Math.floor(rng() * values.length) % values.length];
    let ticket = rng() * total;
    for (const value of values) {
        ticket -= Math.max(0, Number(value?.weight) || 1);
        if (ticket <= 0) return value;
    }
    return values[values.length - 1];
}

function assertString(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`[spawn-location] ${label} must be a non-empty string`);
}

function normalizeCount(value) {
    if (!Array.isArray(value) || value.length !== 2) return [1, 1];
    const lo = Math.max(0, Math.floor(Number(value[0]) || 0));
    const hi = Math.max(lo, Math.floor(Number(value[1]) || lo));
    return [lo, hi];
}

function clonePlain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

export const START_SCENE_PROFILES = Object.freeze([
    // Exposed roofs stay human-scale most of the time, with a rare oversized
    // object that still reads as something dragged outside rather than a facade.
    Object.freeze({ id: 'small-tv-roof', hostArchetypes: ['exposed-roof'], weight: 1.15, mediaFamily: 'spawn.media.television', mediaScale: 0.78, supportScale: 1.0, seatRange: [2, 3], detailBudget: 3, seatRadiiM: [1.25, 1.55, 1.85], vocabularyTags: ['portable', 'patio', 'cheap', 'folding', 'improvised', 'weather'] }),
    Object.freeze({ id: 'normal-tv-roof', hostArchetypes: ['exposed-roof'], weight: 1.35, mediaFamily: 'spawn.media.television', mediaScale: 1.0, supportScale: 1.0, seatRange: [2, 3], detailBudget: 4, seatRadiiM: [1.3, 1.65, 1.95], vocabularyTags: ['patio', 'cheap', 'improvised', 'rooftop', 'portable'] }),
    Object.freeze({ id: 'big-tv-roof', hostArchetypes: ['exposed-roof'], weight: 0.9, mediaFamily: 'spawn.media.television', mediaScale: 1.25, supportScale: 1.05, seatRange: [2, 3], detailBudget: 4, seatRadiiM: [1.45, 1.8, 2.15], minHostAreaM2: 7, vocabularyTags: ['industrial', 'salvaged', 'improvised', 'patio'] }),
    Object.freeze({ id: 'super-big-tv-roof', hostArchetypes: ['exposed-roof'], weight: 0.34, mediaFamily: 'spawn.media.television', mediaScale: 1.75, supportScale: 1.18, seatRange: [2, 4], detailBudget: 5, seatRadiiM: [1.75, 2.15, 2.55], minHostAreaM2: 14, vocabularyTags: ['industrial', 'salvaged', 'construction', 'bench'] }),
    Object.freeze({ id: 'radio-roof', hostArchetypes: ['exposed-roof'], weight: 0.92, mediaFamily: 'spawn.media.radio', mediaScale: 0.9, supportScale: 1.0, seatRange: [2, 3], detailBudget: 4, seatRadiiM: [1.2, 1.5, 1.8], vocabularyTags: ['portable', 'cheap', 'folding', 'patio', 'communications'] }),

    // An actual overhead slab/mass earns the next scale family.
    Object.freeze({ id: 'super-big-shelter', hostArchetypes: ['sheltered-roof'], weight: 0.75, mediaFamily: 'spawn.media.television', mediaScale: 1.75, supportScale: 1.15, seatRange: [2, 4], detailBudget: 5, seatRadiiM: [1.7, 2.1, 2.5], minHostAreaM2: 14, requireOverhead: true, vocabularyTags: ['workshop', 'industrial', 'folding', 'repurposed', 'warm', 'tarp'] }),
    Object.freeze({ id: 'mega-big-shelter', hostArchetypes: ['sheltered-roof'], weight: 1.55, mediaFamily: 'spawn.media.television', mediaScale: [2.45, 2.1, 1.8], supportScale: 1.25, seatRange: [3, 4], detailBudget: 6, seatRadiiM: [2.0, 2.55, 3.1], minHostAreaM2: 20, minContiguousAreaM2: 18, requireOverhead: true, mediaRecipes: ['flat-screen'], vocabularyTags: ['workshop', 'industrial', 'repurposed', 'bench', 'warm', 'repair'] }),
    Object.freeze({ id: 'radio-under-shelter', hostArchetypes: ['sheltered-roof'], weight: 0.42, mediaFamily: 'spawn.media.radio', mediaScale: 1.05, supportScale: 1.0, seatRange: [2, 4], detailBudget: 5, seatRadiiM: [1.25, 1.6, 2.0], minHostAreaM2: 10, requireOverhead: true, vocabularyTags: ['workshop', 'industrial', 'office', 'repair', 'communications'] }),

    // GIGA belongs to a real retail/frontage room, preferably in hanging fabric.
    Object.freeze({ id: 'giga-shopfront', hostArchetypes: ['hanging-storefront'], weight: 1.0, mediaFamily: 'spawn.media.television', mediaScale: [4.0, 3.2, 2.2], supportScale: 1.15, seatRange: [3, 4], detailBudget: 6, seatRadiiM: [2.6, 3.25, 4.0], minHostAreaM2: 30, minContiguousAreaM2: 24, minWallSpanM: 3.8, requireOverhead: true, mediaVariantIds: ['tv.flat.wall-salvage'], vocabularyTags: ['retail', 'diner', 'chrome', 'office', 'repurposed', 'takeout', 'reading'] }),

    // TERRA is deliberately extreme, but current JWEB buildings are assembled from
    // structural bays rather than unicorn-sized single slabs. Treat a large covered
    // operational floor with a real 9m wall as the warehouse / TV-dome host.
    Object.freeze({ id: 'terra-backroom', hostArchetypes: ['deep-backroom'], weight: 1.0, mediaFamily: 'spawn.media.television', mediaScale: [10.0, 4.9, 3.0], supportScale: 1.25, seatRange: [4, 4], detailBudget: 6, seatRadiiM: [3.2, 4.0, 4.8], minHostAreaM2: 90, minContiguousAreaM2: 42, minHostSpanM: 6.2, minWallSpanM: 9.0, requireOverhead: true, mediaVariantIds: ['tv.flat.wall-salvage'], vocabularyTags: ['warehouse', 'storage', 'utility', 'service', 'workshop', 'industrial', 'repair', 'fluorescent', 'bench'] }),
]);

export const SPAWN_FLAVOR_ALIASES = Object.freeze({
    small: 'small-tv-roof',
    normal: 'normal-tv-roof',
    big: 'big-tv-roof',
    super: 'super-big-tv-roof',
    'super-big': 'super-big-tv-roof',
    radio: 'radio-roof',
    shelter: 'mega-big-shelter',
    sheltered: 'mega-big-shelter',
    mega: 'mega-big-shelter',
    'mega-big': 'mega-big-shelter',
    'sheltered-super': 'super-big-shelter',
    'radio-shelter': 'radio-under-shelter',
    giga: 'giga-shopfront',
    shop: 'giga-shopfront',
    shopfront: 'giga-shopfront',
    terra: 'terra-backroom',
    backroom: 'terra-backroom',
});

const SPAWN_PROFILE_BY_ID = new Map(START_SCENE_PROFILES.map(profile => [profile.id, profile]));

const SPAWN_MEDIA_POOLS = Object.freeze({
    'small-tv-roof': Object.freeze([['live-news.al-jazeera-english', 0.66], ['linear-cartoons.blender-open-movies', 0.34], ['live-public-affairs.dvids', 0.10]]),
    'normal-tv-roof': Object.freeze([['live-news.al-jazeera-english', 0.56], ['linear-cartoons.blender-open-movies', 0.44], ['live-public-affairs.dvids', 0.12]]),
    'big-tv-roof': Object.freeze([['live-news.al-jazeera-english', 0.46], ['linear-cartoons.blender-open-movies', 0.54], ['live-public-affairs.dvids', 0.12]]),
    'super-big-tv-roof': Object.freeze([['live-news.al-jazeera-english', 0.34], ['linear-cartoons.blender-open-movies', 0.66], ['live-public-affairs.dvids', 0.12]]),
    'radio-roof': Object.freeze([['live-news.al-jazeera-english', 0.74], ['linear-cartoons.blender-open-movies', 0.26], ['live-public-affairs.dvids', 0.18]]),
    'super-big-shelter': Object.freeze([['live-news.al-jazeera-english', 0.42], ['linear-cartoons.blender-open-movies', 0.58], ['live-public-affairs.dvids', 0.12]]),
    'mega-big-shelter': Object.freeze([['live-news.al-jazeera-english', 0.30], ['linear-cartoons.blender-open-movies', 0.70], ['live-public-affairs.dvids', 0.12]]),
    'radio-under-shelter': Object.freeze([['live-news.al-jazeera-english', 0.68], ['linear-cartoons.blender-open-movies', 0.32], ['live-public-affairs.dvids', 0.18]]),
    'giga-shopfront': Object.freeze([['live-news.al-jazeera-english', 0.18], ['linear-cartoons.blender-open-movies', 0.82], ['live-public-affairs.dvids', 0.10]]),
    'terra-backroom': Object.freeze([['live-news.al-jazeera-english', 0.54], ['linear-cartoons.blender-open-movies', 0.46], ['live-public-affairs.dvids', 0.14]]),
});

const SPAWN_MEDIA_ALIASES = Object.freeze({
    news: 'live-news.al-jazeera-english',
    aljazeera: 'live-news.al-jazeera-english',
    cartoons: 'linear-cartoons.blender-open-movies',
    cartoon: 'linear-cartoons.blender-open-movies',
    blender: 'linear-cartoons.blender-open-movies',
    dvids: 'live-public-affairs.dvids',
});

export function normalizeSpawnFlavorOverride(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return null;
    const id = SPAWN_FLAVOR_ALIASES[raw] ?? raw;
    return SPAWN_PROFILE_BY_ID.has(id) ? id : null;
}

export function readSpawnFlavorOverride(search = globalThis?.location?.search ?? '') {
    try { return normalizeSpawnFlavorOverride(new URLSearchParams(String(search)).get('spawnFlavor')); }
    catch (_) { return null; }
}

export function forcedHostArchetypeForSpawnFlavor(value = readSpawnFlavorOverride()) {
    const profile = SPAWN_PROFILE_BY_ID.get(normalizeSpawnFlavorOverride(value));
    return profile?.hostArchetypes?.[0] ?? null;
}

export function readSpawnMediaOverride(search = globalThis?.location?.search ?? '') {
    try {
        const raw = String(new URLSearchParams(String(search)).get('spawnMedia') ?? '').trim().toLowerCase();
        if (!raw) return null;
        return SPAWN_MEDIA_ALIASES[raw] ?? raw;
    } catch (_) { return null; }
}

function chooseSpawnMediaIntent(startProfile, stableKey, forcedSourceKey = readSpawnMediaOverride()) {
    let sourceKey = forcedSourceKey;
    if (!sourceKey) {
        const pool = SPAWN_MEDIA_POOLS[startProfile?.id] ?? SPAWN_MEDIA_POOLS['normal-tv-roof'];
        const candidates = pool.map(([key, weight]) => ({ key, weight }));
        const picked = weightedPick(mulberry32(hashString32(`spawn-media:${stableKey}:${startProfile?.id ?? 'normal'}`)), candidates);
        sourceKey = picked?.key ?? 'live-news.al-jazeera-english';
    }
    return createMediaIntent({
        sourceKey,
        defaultAudio: 'proximity',
        fallback: startProfile?.mediaFamily === 'spawn.media.radio' ? 'silent radio / weak carrier' : 'dark glass / subtle static / NO SIGNAL',
    }) ?? clonePlain({ sourceKey, defaultAudio: 'proximity', networkFailureIsFatal: false });
}

function profileFitsHost(profile, hostSpace) {
    if (!profile || !hostSpace) return true;
    const archetype = hostSpace.hostArchetype ?? 'exposed-roof';
    if (profile.hostArchetypes?.length && !profile.hostArchetypes.includes(archetype)) return false;
    if (profile.requireOverhead && hostSpace.overheadCovered !== true) return false;
    if (Number.isFinite(profile.minHostAreaM2) && finite(Number(hostSpace.supportAreaM2), 0) + 1e-6 < profile.minHostAreaM2) return false;
    if (Number.isFinite(profile.minContiguousAreaM2) && finite(Number(hostSpace.largestSupportPatchAreaM2), 0) + 1e-6 < profile.minContiguousAreaM2) return false;
    if (Number.isFinite(profile.minHostSpanM) && finite(Number(hostSpace.maxSupportSpanM), 0) + 1e-6 < profile.minHostSpanM) return false;
    if (Number.isFinite(profile.minWallSpanM) && finite(Number(hostSpace.maxWallSpanM), 0) + 1e-6 < profile.minWallSpanM) return false;
    return true;
}

function pickStartProfile(rootSeed, hostSpace = null, forcedFlavor = readSpawnFlavorOverride()) {
    // No host means we do not know that any oversized scene can physically fit.
    // Keep unknown/fallback composition conservative; production binding passes
    // the selected host and unlocks larger place-conditioned tiers there.
    const evaluatedHost = hostSpace ?? {
        hostArchetype: 'exposed-roof', supportAreaM2: 0, largestSupportPatchAreaM2: 0,
        maxWallSpanM: 0, overheadCovered: false, nearbyWalls: [],
    };
    const forcedId = normalizeSpawnFlavorOverride(forcedFlavor);
    const forcedProfile = forcedId ? SPAWN_PROFILE_BY_ID.get(forcedId) : null;
    if (forcedProfile && profileFitsHost(forcedProfile, evaluatedHost)) return forcedProfile;
    const matching = START_SCENE_PROFILES.filter(profile => profileFitsHost(profile, evaluatedHost));
    const pool = matching.length ? matching : START_SCENE_PROFILES.filter(profile => profile.id === 'normal-tv-roof' || profile.id === 'radio-roof');
    return weightedPick(mulberry32(rootSeed ^ 0x6a09e667), pool) ?? START_SCENE_PROFILES[0];
}

function scaledDimensions(dimensions, scale) {
    const factors = Array.isArray(scale)
        ? [0, 1, 2].map(index => Math.max(0.45, Math.min(16.0, Number(scale[index]) || 1)))
        : Array(3).fill(Math.max(0.45, Math.min(16.0, Number(scale) || 1)));
    return dimensions.map((value, index) => Number((value * factors[index]).toFixed(4)));
}

function pickVariantForProfile(rng, variants, profile, { media = false, hostSpace = null } = {}) {
    let pool = [...variants];
    if (media && hostSpace) {
        const compatible = pool.filter(variant => {
            if (variant?.placement?.mount !== 'wall') return true;
            const width = scaledDimensions(variant.dimensionsM, profile?.mediaScale ?? 1)[0];
            return (hostSpace.nearbyWalls ?? []).some(wall => {
                const dx = Number(wall?.x2) - Number(wall?.x1);
                const dz = Number(wall?.z2) - Number(wall?.z1);
                return Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) >= width + 0.18;
            });
        });
        if (compatible.length) pool = compatible;
    }
    if (media && profile?.mediaVariantIds?.length) {
        const ids = new Set(profile.mediaVariantIds);
        const filtered = pool.filter(variant => ids.has(variant.id));
        if (filtered.length) pool = filtered;
    }
    if (media && profile?.mediaRecipes?.length) {
        const recipes = new Set(profile.mediaRecipes);
        const filtered = pool.filter(variant => recipes.has(variant.constructionRecipe));
        if (filtered.length) pool = filtered;
    }
    const preferred = new Set(profile?.vocabularyTags ?? []);
    if (!preferred.size) return weightedPick(rng, pool);
    const biased = pool.map(variant => {
        const matches = (variant.tags ?? []).reduce((sum, tag) => sum + (preferred.has(tag) ? 1 : 0), 0);
        return { ...variant, weight: (Math.max(0.05, Number(variant.weight) || 1)) * (1 + matches * 1.35) };
    });
    return weightedPick(rng, biased);
}

export function compileSpawnLocationRuntime({ location, assets } = {}) {
    if (!location || !assets) throw new Error('[spawn-location] location and asset corpus are required');
    assertString(location.id, 'location.id');
    assertString(location.identity, 'location.identity');
    if (location.binding?.authority !== 'fabric-space') {
        throw new Error('[spawn-location] spawn must bind to fabric-space authority');
    }
    if (location.binding?.placementGuarantee !== 'exactly-one-player-spawn') {
        throw new Error('[spawn-location] spawn must declare exactly-one-player-spawn guarantee');
    }
    if (location.binding?.geometryOwnership && location.binding.geometryOwnership !== 'external-fabric-and-connectors') {
        throw new Error('[spawn-location] authored spawn may not own geometry topology');
    }
    const familyById = new Map();
    for (const family of assets.families ?? []) {
        assertString(family.id, 'asset family id');
        if (familyById.has(family.id)) throw new Error(`[spawn-location] duplicate asset family ${family.id}`);
        const variants = [...(family.variants ?? [])];
        if (!variants.length) throw new Error(`[spawn-location] asset family ${family.id} has no variants`);
        familyById.set(family.id, { ...family, variants });
    }
    const slots = (location.compositionSlots ?? []).map(slot => {
        assertString(slot.slot, 'composition slot');
        const families = [...(slot.families ?? [])];
        if (!families.length) throw new Error(`[spawn-location] slot ${slot.slot} has no asset families`);
        for (const familyId of families) if (!familyById.has(familyId)) {
            throw new Error(`[spawn-location] slot ${slot.slot} references unknown family ${familyId}`);
        }
        return { ...slot, count: normalizeCount(slot.count), families };
    });
    const selectionPolicy = {
        searchRadiusM: 20,
        radialStepM: 2,
        spokes: 16,
        verticalProbeAboveOriginM: 64,
        minElevationAboveOriginM: 3,
        preferredElevationAboveOriginM: 7,
        edgeProbeRadiusM: 0.8,
        edgeProbeDirections: 8,
        minEdgeSupportedDirections: 6,
        edgeDropToleranceM: 0.65,
        contextProbeRadiusM: 5.5,
        contextProbeDirections: 12,
        higherContextDeltaM: 1.8,
        sameLevelToleranceM: 0.75,
        preferredHigherContextDirections: 2,
        localPeakPenalty: 18,
        maxNavigationCandidates: 10,
        navigationDirections: 8,
        navigationSeconds: 1.35,
        navigationDistanceM: 2.2,
        minNavigableHeadings: 3,
        verticalRouteDeltaM: 0.7,
        fabricSurfaceToleranceM: 0.18,
        requireFabricConnector: true,
        ...clonePlain(location.binding?.selection ?? {}),
    };
    return Object.freeze({
        schema: 'jweb.spawn-location-runtime.v2',
        location: clonePlain(location),
        assets: clonePlain(assets),
        familyById,
        slots,
        selectionPolicy: Object.freeze(selectionPolicy),
    });
}

export function createSpawnComposition(runtime, stableKey, hostSpace = null) {
    if (!runtime) return null;
    const location = runtime.location;
    const rootSeed = hashString32(`${location.id}:${stableKey}`);
    const forcedFlavor = readSpawnFlavorOverride();
    const startProfile = pickStartProfile(rootSeed, hostSpace, forcedFlavor);
    const microstories = location.microstories ?? [];
    const story = weightedPick(mulberry32(rootSeed ^ 0x4d3c2b1a), microstories);
    const selected = [];
    const usedVariants = new Set();

    for (let slotIndex = 0; slotIndex < runtime.slots.length; slotIndex++) {
        const slot = runtime.slots[slotIndex];
        const rng = mulberry32(rootSeed ^ hashString32(`${slot.slot}:${slotIndex}`));
        let [lo, hi] = slot.count;
        if (slot.slot === 'seating' && Array.isArray(startProfile.seatRange)) {
            lo = Math.max(lo, startProfile.seatRange[0]);
            hi = Math.min(hi, Math.max(lo, startProfile.seatRange[1]));
        }
        const count = lo + Math.floor(rng() * (hi - lo + 1));
        const picks = [];
        for (let i = 0; i < count; i++) {
            let familyId;
            if (slot.slot === 'primary-tv' && slot.families.includes(startProfile.mediaFamily)) {
                familyId = startProfile.mediaFamily;
            } else {
                familyId = slot.families[Math.floor(rng() * slot.families.length) % slot.families.length];
            }
            const family = runtime.familyById.get(familyId);
            const unused = family.variants.filter(variant => !usedVariants.has(variant.id));
            const variant = pickVariantForProfile(rng, unused.length ? unused : family.variants, startProfile, { media: slot.slot === 'primary-tv', hostSpace });
            usedVariants.add(variant.id);
            const baseDimensions = [...variant.dimensionsM];
            const dimensionsM = slot.slot === 'primary-tv'
                ? scaledDimensions(baseDimensions, startProfile.mediaScale)
                : (slot.slot === 'tv-support' ? scaledDimensions(baseDimensions, startProfile.supportScale ?? 1) : baseDimensions);
            picks.push({
                familyId,
                variantId: variant.id,
                label: variant.label,
                dimensionsM,
                constructionRecipe: variant.constructionRecipe,
                tags: [...(variant.tags ?? [])],
                placement: clonePlain(variant.placement ?? null),
            });
        }
        selected.push({
            slot: slot.slot,
            required: slot.required === true,
            relationship: slot.relationship ?? null,
            picks,
        });
    }

    return Object.freeze({
        schema: 'jweb.spawn-composition.v2',
        locationId: location.id,
        stableKey: String(stableKey),
        story: story ? { id: story.id, story: story.story, bias: [...(story.bias ?? [])] } : null,
        hostArchetype: hostSpace?.hostArchetype ?? 'exposed-roof',
        startProfile: Object.freeze({ ...startProfile }),
        hardInvariantBeats: (location.hardInvariants ?? []).map(item => item.beat),
        slots: selected,
        requestedStartProfile: forcedFlavor,
        media: chooseSpawnMediaIntent(startProfile, stableKey),
        progressiveRealization: clonePlain(location.progressiveRealization ?? []),
    });
}

export function bindSpawnLocationRuntime(runtime, proof) {
    if (!runtime || !proof?.pose) return null;
    const pose = proof.pose;
    const hostSpace = clonePlain(proof.fabricSpace ?? proof.locationSelection?.hostSpace ?? null);
    const routeFan = clonePlain(proof.routeFan ?? []);
    const stableKey = `${hostSpace?.spaceId ?? 'local'}:${pose.x.toFixed(3)},${pose.feetY.toFixed(3)},${pose.z.toFixed(3)}`;
    const composition = createSpawnComposition(runtime, stableKey, hostSpace);
    const spatialPlan = hostSpace ? compileSpawnSpatialPlan({
        locationId: runtime.location.id,
        pose,
        hostSpace,
        routeFan,
        composition,
    }) : null;
    return Object.freeze({
        schema: 'jweb.bound-spawn-location.v2',
        locationId: runtime.location.id,
        identity: runtime.location.identity,
        role: runtime.location.role,
        locationClass: runtime.location.locationClass,
        binding: clonePlain(runtime.location.binding),
        spatialFingerprint: clonePlain(runtime.location.spatialFingerprint),
        pose: { ...pose },
        selection: clonePlain(proof.locationSelection ?? null),
        hostSpace,
        routeFan,
        composition,
        spatialPlan,
        zones: clonePlain(runtime.location.zones ?? []),
        hardInvariants: clonePlain(runtime.location.hardInvariants ?? []),
        semanticRequirements: clonePlain(runtime.location.semanticRequirements ?? []),
    });
}

export async function loadSpawnLocationRuntime({ locationUrl = LOCATION_URL, assetUrl = ASSET_URL } = {}) {
    const [locationResponse, assetResponse] = await Promise.all([fetch(locationUrl), fetch(assetUrl)]);
    if (!locationResponse.ok) throw new Error(`[spawn-location] failed to load location data: ${locationResponse.status} ${locationResponse.statusText}`);
    if (!assetResponse.ok) throw new Error(`[spawn-location] failed to load asset data: ${assetResponse.status} ${assetResponse.statusText}`);
    return compileSpawnLocationRuntime({
        location: await locationResponse.json(),
        assets: await assetResponse.json(),
    });
}

export const LIVE_SPAWN_LOCATION_RUNTIME = typeof window === 'undefined'
    ? null
    : await loadSpawnLocationRuntime();
