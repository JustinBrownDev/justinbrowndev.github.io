import { compileSpawnSpatialPlan } from './spawn-spatial-plan.js';

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

export function createSpawnComposition(runtime, stableKey) {
    if (!runtime) return null;
    const location = runtime.location;
    const rootSeed = hashString32(`${location.id}:${stableKey}`);
    const microstories = location.microstories ?? [];
    const story = weightedPick(mulberry32(rootSeed ^ 0x4d3c2b1a), microstories);
    const selected = [];
    const usedVariants = new Set();

    for (let slotIndex = 0; slotIndex < runtime.slots.length; slotIndex++) {
        const slot = runtime.slots[slotIndex];
        const rng = mulberry32(rootSeed ^ hashString32(`${slot.slot}:${slotIndex}`));
        const [lo, hi] = slot.count;
        const count = lo + Math.floor(rng() * (hi - lo + 1));
        const picks = [];
        for (let i = 0; i < count; i++) {
            const familyId = slot.families[Math.floor(rng() * slot.families.length) % slot.families.length];
            const family = runtime.familyById.get(familyId);
            const unused = family.variants.filter(variant => !usedVariants.has(variant.id));
            const variant = weightedPick(rng, unused.length ? unused : family.variants);
            usedVariants.add(variant.id);
            picks.push({
                familyId,
                variantId: variant.id,
                label: variant.label,
                dimensionsM: [...variant.dimensionsM],
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
        schema: 'jweb.spawn-composition.v1',
        locationId: location.id,
        stableKey: String(stableKey),
        story: story ? { id: story.id, story: story.story, bias: [...(story.bias ?? [])] } : null,
        hardInvariantBeats: (location.hardInvariants ?? []).map(item => item.beat),
        slots: selected,
        media: clonePlain(location.mediaIntent ?? null),
        progressiveRealization: clonePlain(location.progressiveRealization ?? []),
    });
}

export function bindSpawnLocationRuntime(runtime, proof) {
    if (!runtime || !proof?.pose) return null;
    const pose = proof.pose;
    const hostSpace = clonePlain(proof.fabricSpace ?? proof.locationSelection?.hostSpace ?? null);
    const routeFan = clonePlain(proof.routeFan ?? []);
    const stableKey = `${hostSpace?.spaceId ?? 'local'}:${pose.x.toFixed(3)},${pose.feetY.toFixed(3)},${pose.z.toFixed(3)}`;
    const composition = createSpawnComposition(runtime, stableKey);
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
