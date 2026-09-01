import { GENERATION_LANES } from '../config/performance-isolation.js';
import {
    EXTERIOR_OPPORTUNITY_PRIORITY,
    EXTERIOR_VISUAL_TIER,
    exteriorTaskVisualImpact,
    exteriorTaskVisualTier,
} from './exterior-spectacle-priority.js';
import {
    bindSemanticExteriorPlacement,
    chooseSemanticExteriorOpportunity,
} from './semantic-exterior-authority.js';
import {
    buildingSemanticCompositionStyles,
    ensureBuildingSemanticTruth,
} from './building-semantic-truth.js';
import {
    createSpatialClaim,
    legacyExteriorReservationsFromSpatialClaim,
    SPATIAL_CLAIM_TYPES,
    SpatialClaimAuthority,
    spatialClaimFromCirculationReservation,
    spatialClaimFromFacadeAperture,
} from './spatial-claims.js';
import { districtExteriorPolicyForEntity } from './district-block-composition.js';
import { frontageContentContextFromBinding } from './frontage-semantic-binding.js';

export const EXTERIOR_COMPOSITION_SCHEMA = 'jweb.exterior-composition-authority.v2';
export const EXTERIOR_COMPOSITION_RUNTIME_SCHEMA = 'jweb.exterior-composition-runtime.v1';
export const EXTERIOR_MEDIA_SCHEMA = 'jweb.semantic-media-surface.v1';

const MANAGED_BUILDING_EXTERIOR_KINDS = new Set([
    'sign', 'awning', 'graffiti', 'flyer', 'pipe', 'ivy', 'security',
    'elevator-hardware', 'street-fixture', 'roof-clutter', 'roof-topper',
    'spray-cans', 'semantic-context-prop', 'exterior-prop-field',
]);

const MEDIA_CURRENCIES = Object.freeze(['CREDITS', 'TOKENS', 'MARKS', 'DINAR', 'YEN', 'UNITS', 'GUILDERS', 'SCRIP']);
const MEDIA_FAMILIES = Object.freeze([
    'commercial-ad',
    'municipal-notice',
    'market-value',
    'data-feed',
    'transport-network',
    'institutional',
    'service-warning',
]);

export const EXTERIOR_COMPOSITION_STYLES = Object.freeze({
    MEDIA_MONSTER: 'media-monster',
    SIGNAGE_BAZAAR: 'signage-bazaar',
    PIPE_NIGHTMARE: 'pipe-nightmare',
    SERVICE_BUNKER: 'service-bunker',
    INSTITUTIONAL_MONOLITH: 'institutional-monolith',
    ROOF_HEAVY: 'roof-heavy',
    MIXED: 'mixed',
});

// The profiles are building-plan density policy. They bound realized composition
// after candidate discovery, so a dense opportunity lattice can never become a
// de-facto density instruction merely because it exposed more slots.
const STYLE_PROFILES = Object.freeze({
    [EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER]: Object.freeze({
        densityCeiling: 4,
        coverageFloor: 1,
        caps: Object.freeze({ spectacle: 1, identity: 1, macro: 1, medium: 1, micro: 0 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR]: Object.freeze({
        densityCeiling: 6,
        coverageFloor: 2,
        caps: Object.freeze({ spectacle: 1, identity: 2, macro: 1, medium: 1, micro: 1 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE]: Object.freeze({
        densityCeiling: 5,
        coverageFloor: 2,
        caps: Object.freeze({ spectacle: 0, identity: 1, macro: 3, medium: 1, micro: 0 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER]: Object.freeze({
        densityCeiling: 5,
        coverageFloor: 2,
        caps: Object.freeze({ spectacle: 0, identity: 1, macro: 2, medium: 2, micro: 0 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH]: Object.freeze({
        densityCeiling: 2,
        coverageFloor: 1,
        caps: Object.freeze({ spectacle: 0, identity: 1, macro: 0, medium: 1, micro: 0 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY]: Object.freeze({
        densityCeiling: 5,
        coverageFloor: 2,
        caps: Object.freeze({ spectacle: 0, identity: 2, macro: 2, medium: 1, micro: 0 }),
    }),
    [EXTERIOR_COMPOSITION_STYLES.MIXED]: Object.freeze({
        densityCeiling: 7,
        coverageFloor: 2,
        caps: Object.freeze({ spectacle: 0, identity: 2, macro: 2, medium: 2, micro: 1 }),
    }),
});

function rngForSeed(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function mediaAssemblyGroups(task) {
    const placements = task?.fieldPlan?.placements ?? [];
    const screens = placements.filter(item => item?.shape === 'box' && /megascreen/i.test(String(item?.assemblyKind ?? '')));
    const groups = new Map();
    for (let index = 0; index < screens.length; index++) {
        const placement = screens[index];
        const assemblyId = String(placement.assemblyId ?? `${entityIdOf(task)}:megascreen:${task.seed ?? 0}`);
        const group = groups.get(assemblyId) ?? [];
        group.push({ placement, sourceIndex: index });
        groups.set(assemblyId, group);
    }
    return groups;
}

function cleanMediaText(value, fallback) {
    return String(value ?? fallback).replace(/\s+/g, ' ').trim() || fallback;
}

function mediaLayoutFor(assemblyKind, placements) {
    const segmentCount = placements.length;
    const totalSpan = placements.reduce((sum, item) => sum + Math.max(0.01, finite(item.placement?.sx, 1)), 0);
    return {
        mode: segmentCount > 1
            ? (/corner/i.test(String(assemblyKind ?? '')) ? 'continuous-corner' : 'coordinated-band')
            : 'single-surface',
        segmentCount,
        continuation: segmentCount > 1,
        totalSpan,
    };
}

export function attachSpectacleMedia({ chunk, tasks = [], pairFor = null } = {}) {
    const chunkKey = String(chunk?.key ?? 'world');
    let surfaces = 0;
    let assemblies = 0;
    let coordinatedAssemblies = 0;
    const familyCounts = {};

    for (const task of tasks ?? []) {
        if (task?.kind !== 'exterior-prop-field' || exteriorTaskVisualTier(task) !== 'spectacle') continue;
        const groups = mediaAssemblyGroups(task);
        if (!groups.size) continue;
        const descriptors = [];

        for (const [assemblyId, members] of groups) {
            const assemblyKind = members[0]?.placement?.assemblyKind ?? 'megascreen';
            const planId = task.exteriorPlanId ?? task.exteriorComposition?.planId ?? task.exteriorCompositionPlanId ?? null;
            const ownerKey = planId ?? `unowned-exterior:${chunkKey}`;
            const semanticContentContext = task.semanticContentContext ?? frontageContentContextFromBinding(task.frontageBinding);
            const campaignKey = semanticContentContext?.campaignKey ?? `${entityIdOf(task)}:generic-frontage`;
            const seed = hash32(`${chunkKey}:${ownerKey}:${entityIdOf(task)}:${assemblyId}:${campaignKey}:semantic-media`);
            const contentRng = rngForSeed(hash32(`${seed}:content`));
            const metadataRng = rngForSeed(hash32(`${seed}:metadata`));
            const requested = typeof pairFor === 'function'
                ? pairFor({ task, assemblyId, assemblyKind, seed, rng: contentRng, placements: members.map(item => item.placement), semanticContentContext })
                : null;
            const title = cleanMediaText(requested?.[0] ?? requested?.title, 'PUBLIC SIGNAL');
            const subtitle = cleanMediaText(requested?.[1] ?? requested?.subtitle, 'INDEX TRANSMISSION');
            const family = cleanMediaText(
                requested?.family,
                MEDIA_FAMILIES[Math.floor(metadataRng() * MEDIA_FAMILIES.length) % MEDIA_FAMILIES.length],
            );
            const amount = 12 + Math.floor(metadataRng() * 9987);
            const currency = MEDIA_CURRENCIES[Math.floor(metadataRng() * MEDIA_CURRENCIES.length) % MEDIA_CURRENCIES.length];
            const layout = mediaLayoutFor(assemblyKind, members);
            const surfaceIds = [...new Set(members.map(item => item.placement?.surfaceId).filter(Boolean).map(String))];
            const opportunityIds = [...new Set(members.map(item => item.placement?.semanticOpportunityId).filter(Boolean).map(String))];
            const contextIds = [...new Set(members.map(item => item.placement?.semanticContextId).filter(Boolean).map(String))];
            const descriptor = {
                schema: EXTERIOR_MEDIA_SCHEMA,
                id: `${ownerKey}:${assemblyId}:media:${seed.toString(16).padStart(8, '0')}`,
                kind: 'semantic-media',
                family,
                contentSource: typeof pairFor === 'function' ? 'procedural-text-exciter' : 'fallback-static',
                title,
                subtitle,
                value: { amount, currency, label: `${amount} ${currency}` },
                campaignSeed: seed,
                contentSeed: seed,
                campaignKey,
                chunkKey,
                entityId: entityIdOf(task),
                hostBuildingId: entityIdOf(task),
                buildingSemanticTruthId: task.buildingSemanticTruthId ?? task.exteriorComposition?.buildingSemanticTruthId ?? null,
                buildingPlanId: semanticContentContext?.buildingPlanId ?? null,
                buildingPlanFingerprint: semanticContentContext?.buildingPlanFingerprint ?? null,
                semanticProgram: semanticContentContext?.program ?? task.buildingSemanticProgram ?? task.program ?? task.semanticProgram ?? null,
                semanticDestinationId: semanticContentContext?.destinationId ?? null,
                districtId: semanticContentContext?.districtId ?? task.districtId ?? chunk?.districtId ?? null,
                districtFamily: semanticContentContext?.districtFamily ?? null,
                frontageBindingKey: semanticContentContext?.bindingKey ?? null,
                frontageRole: semanticContentContext?.frontageRole ?? null,
                publicRole: semanticContentContext?.publicRole ?? null,
                landmark: !!semanticContentContext?.landmark,
                exteriorPlanId: planId,
                exteriorRequestId: task.exteriorRequestId ?? task.exteriorComposition?.requestId ?? null,
                exteriorReservationIds: [...(task.exteriorReservationIds ?? task.exteriorComposition?.reservationIds ?? [])],
                assemblyId,
                assemblyKind,
                semanticContextId: contextIds[0] ?? null,
                semanticContextIds: contextIds,
                surfaceIds,
                semanticOpportunityIds: opportunityIds,
                layout,
            };

            let cursor = 0;
            for (let index = 0; index < members.length; index++) {
                const member = members[index];
                const placement = member.placement;
                const span = Math.max(0.01, finite(placement?.sx, 1));
                const u0 = layout.totalSpan > 0 ? cursor / layout.totalSpan : 0;
                const u1 = layout.totalSpan > 0 ? (cursor + span) / layout.totalSpan : 1;
                placement.media = descriptor;
                placement.mediaSegment = {
                    index,
                    count: members.length,
                    surfaceId: placement.surfaceId ?? null,
                    semanticOpportunityId: placement.semanticOpportunityId ?? null,
                    span,
                    u0,
                    u1,
                    continuationBefore: index > 0,
                    continuationAfter: index < members.length - 1,
                };
                cursor += span;
                surfaces++;
            }

            descriptors.push(descriptor);
            assemblies++;
            if (members.length > 1) coordinatedAssemblies++;
            familyCounts[family] = (familyCounts[family] ?? 0) + 1;
        }

        task.mediaAssemblies = descriptors;
        task.mediaSurfaceCount = descriptors.reduce((sum, descriptor) => sum + descriptor.layout.segmentCount, 0);
        task.mediaAssemblyCount = descriptors.length;
    }

    return { assemblies, surfaces, coordinatedAssemblies, familyCounts };
}

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function entityIdOf(task) {
    const value = task?.entityId;
    return value == null ? '' : String(value);
}

function buildingEntityMap(payload) {
    const map = new Map();
    for (const entity of payload?.entities ?? []) {
        if (entity?.kind !== 'building' && entity?.kind !== 'district-landmark') continue;
        map.set(String(entity.id), entity);
    }
    return map;
}

export function isManagedBuildingExteriorTask(task, payload) {
    const buildings = payload instanceof Map ? payload : buildingEntityMap(payload);
    const entityId = entityIdOf(task);
    return buildings.has(entityId) && MANAGED_BUILDING_EXTERIOR_KINDS.has(String(task?.kind ?? ''));
}

function managedBuildingExterior(task, buildings) {
    return isManagedBuildingExteriorTask(task, buildings);
}

function taskSurfaceKeys(task) {
    const keys = new Set();
    if (task?.semanticHostId && /(?:^|:)surface(?::|$)/i.test(String(task.semanticHostId))) keys.add(String(task.semanticHostId));
    if (task?.surfaceId) keys.add(String(task.surfaceId));
    if (task?.semanticPlacement?.surfaceId) keys.add(String(task.semanticPlacement.surfaceId));
    for (const placement of task?.fieldPlan?.placements ?? []) {
        if (placement?.surfaceId) keys.add(String(placement.surfaceId));
        for (const id of placement?.spectacleSurfaceIds ?? []) if (id) keys.add(String(id));
    }
    return keys;
}

function taskOpportunityId(task) {
    return task?.semanticOpportunityId ?? task?.semanticPlacement?.opportunityId
        ?? task?.fieldPlan?.placements?.[0]?.semanticOpportunityId ?? null;
}

function taskConflictSurfaceKeys(task) {
    const keys = new Set();
    const opportunityId = taskOpportunityId(task);
    const tier = exteriorTaskVisualTier(task);
    for (const placement of task?.fieldPlan?.placements ?? []) {
        for (const id of placement?.spectacleSurfaceIds ?? []) if (id) keys.add(String(id));
    }
    // Semantic opportunities already encode clipped/free facade or roof regions. Distinct
    // opportunities on the same facade may coexist; only spectacle (or unscoped legacy
    // work with no opportunity identity) claims the whole physical surface.
    if (tier === 'spectacle' || !opportunityId) {
        if (task?.surfaceId) keys.add(String(task.surfaceId));
        if (task?.semanticPlacement?.surfaceId) keys.add(String(task.semanticPlacement.surfaceId));
        for (const placement of task?.fieldPlan?.placements ?? []) {
            if (placement?.surfaceId) keys.add(String(placement.surfaceId));
        }
    }
    return keys;
}

function styleScoreBonus(entry, style) {
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const role = String(task.semanticOpportunityRole ?? '');
    switch (style) {
        case EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER:
            return tier === 'spectacle' ? 130 : task.kind === 'sign' ? 28 : tier === 'macro' ? 12 : 0;
        case EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR:
            return task.kind === 'sign' ? 70 : role === 'facade-sign-zone' ? 55 : task.kind === 'graffiti' ? 12 : 0;
        case EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE:
            return task.kind === 'pipe' ? 80 : role === 'facade-service-band' ? 55 : tier === 'macro' ? 30 : 0;
        case EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER:
            return role === 'facade-service-band' ? 70
                : task.kind === 'elevator-hardware' || task.kind === 'security' ? 38
                    : tier === 'macro' ? 32 : 0;
        case EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH:
            return task.kind === 'sign' ? 22 : tier === 'micro' ? -80 : role === 'wall-mounted-prop-zone' ? -24 : 0;
        case EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY:
            return task.kind === 'roof-topper' ? 85 : task.kind === 'roof-clutter' ? 60
                : task.semanticContextRole === 'roof' || role === 'roof-utility-zone' ? 55 : 0;
        default:
            return 0;
    }
}

function candidateScore(entry, style = EXTERIOR_COMPOSITION_STYLES.MIXED) {
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const impact = Math.max(0, exteriorTaskVisualImpact(task));
    let score = impact * 10 + styleScoreBonus(entry, style);
    if (entry.wasFirstPass) score += 8;
    if (entry.source === 'planner-context') score += 18;
    else if (entry.source === 'planner-field') score += 14;
    else if (entry.source === 'field') score += tier === 'macro' ? 14 : 8;
    else if (entry.source === 'authored') score += 7;
    else score += 2;
    if (task?.exteriorRequest?.desiredScaleClass === 'large' || task?.exteriorRequest?.desiredScaleClass === 'macro') score += 24;
    if (task.kind === 'sign') score += 30;
    if (task.semanticOpportunityRole === 'facade-sign-zone') score += 10;
    if (task.kind === 'roof-topper') score += 4;
    return score;
}

function anchorScore(entry, style) {
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const tierRank = EXTERIOR_VISUAL_TIER[tier] ?? EXTERIOR_VISUAL_TIER.medium;
    let score = 100 - tierRank * 18 + Math.min(25, exteriorTaskVisualImpact(task)) + styleScoreBonus(entry, style) * 0.3;
    if (task.kind === 'sign') score += 30;
    if (task.kind === 'exterior-prop-field' && tier === 'spectacle') score += 80;
    if (task.semanticOpportunityRole === 'facade-sign-zone') score += 10;
    return score;
}

function stableEntryCompare(chunkKey, a, b, style = EXTERIOR_COMPOSITION_STYLES.MIXED) {
    const scoreDiff = candidateScore(b, style) - candidateScore(a, style);
    if (scoreDiff) return scoreDiff;
    const hashA = hash32(`${chunkKey}:${a.source}:${entityIdOf(a.task)}:${a.task.kind}:${a.task.seed ?? 0}:${taskOpportunityId(a.task) ?? ''}`);
    const hashB = hash32(`${chunkKey}:${b.source}:${entityIdOf(b.task)}:${b.task.kind}:${b.task.seed ?? 0}:${taskOpportunityId(b.task) ?? ''}`);
    return hashA - hashB || String(a.task.kind).localeCompare(String(b.task.kind));
}

function bestSpectaclePerEntity(chunkKey, groups, buildings) {
    const best = [];
    for (const [entityId, entries] of groups) {
        const spectacles = entries
            .filter(entry => exteriorTaskVisualTier(entry.task) === 'spectacle')
            .sort((a, b) => stableEntryCompare(chunkKey, a, b, EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER));
        if (!spectacles.length) continue;
        const entity = buildings.get(entityId);
        const districtPolicy = districtExteriorPolicyForEntity(entity);
        best.push({
            entityId,
            entry: spectacles[0],
            landmark: entity?.kind === 'district-landmark' ? 1 : 0,
            districtHierarchy: districtPolicy.anchor ? 2 : districtPolicy.secondaryLandmark ? 1 : 0,
            districtSpectaclePriority: districtPolicy.spectaclePriority ?? 0,
            spectacleCorridor: districtPolicy.spectacleCorridor ? 1 : 0,
            impact: exteriorTaskVisualImpact(spectacles[0].task),
            rank: hash32(`${chunkKey}:${entityId}:spectacle-choice`),
        });
    }
    best.sort((a, b) => b.landmark - a.landmark
        || b.districtHierarchy - a.districtHierarchy
        || b.districtSpectaclePriority - a.districtSpectaclePriority
        || b.spectacleCorridor - a.spectacleCorridor
        || b.impact - a.impact
        || a.rank - b.rank
        || a.entityId.localeCompare(b.entityId));
    return best;
}

function chooseSpectacleEntities(chunkKey, groups, buildings) {
    const eligible = bestSpectaclePerEntity(chunkKey, groups, buildings);
    if (!eligible.length) return { eligible, selected: new Map(), quota: 0 };
    // Evaluation-phase visibility: a populated chunk with enough valid hosts should
    // expose several obvious spectacles, while still leaving most buildings to
    // other deliberate composition styles. This is a district quota, not a prop roll.
    const minimum = eligible.length >= 5 ? 3 : Math.min(2, eligible.length);
    const quota = GENERATION_LANES.signageStress
        ? eligible.length
        : Math.min(eligible.length, 5, Math.max(minimum, Math.ceil(eligible.length * 0.32)));
    const selected = new Map(eligible.slice(0, quota).map(item => [item.entityId, item.entry]));
    return { eligible, selected, quota };
}

function buildingSemanticTruthForEntity(chunk, entityId, entity) {
    const existing = entity?.buildingSemanticTruth ?? entity?.buildingPlan?.buildingSemanticTruth ?? null;
    const truth = ensureBuildingSemanticTruth({
        existing,
        worldSeed: entity?.buildingPlan?.worldSeed ?? chunk?.worldSeed ?? 0,
        chunkKey: entity?.buildingPlan?.chunkKey ?? chunk?.key ?? 'world',
        entityId,
        physicalUse: entity?.physicalUse ?? null,
        archetype: entity?.archetype ?? entity?.physicalUse?.morphology ?? null,
        signatureType: entity?.buildingPlan?.signature?.signatureType ?? null,
        programHint: entity?.buildingPlan?.grammar?.semanticProgram ?? entity?.program ?? entity?.semanticProgram ?? null,
        districtContext: entity?.districtComposition ?? entity?.physicalUse?.districtContext ?? null,
        exteriorMacroPreference: entity?.exteriorMacroPreference ?? null,
    });
    if (entity) entity.buildingSemanticTruth = truth;
    return truth;
}

function physicalStylePool(entity) {
    const family = String(entity?.physicalUse?.family ?? '');
    const archetype = String(entity?.archetype ?? '');
    if (family === 'industrial-service' || /industrial|service|mechanical/i.test(archetype)) {
        return [
            EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE,
            EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER,
            EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
        ];
    }
    if (family === 'assembly-institutional' || /institution|civic|archive/i.test(archetype)) {
        return [
            EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH,
            EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY,
            EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
        ];
    }
    if (family === 'mercantile-public' || /market|commercial|retail/i.test(archetype)) {
        return [
            EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
            EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR,
            EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER,
        ];
    }
    if (family === 'residential-lodging' || /residential|lodging/i.test(archetype)) {
        return [
            EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
            EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
        ];
    }
    if (family === 'business' || /office|business/i.test(archetype)) {
        return [
            EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH,
            EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR,
            EXTERIOR_COMPOSITION_STYLES.MIXED,
            EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY,
        ];
    }
    return [
        EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE,
        EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR,
        EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER,
        EXTERIOR_COMPOSITION_STYLES.INSTITUTIONAL_MONOLITH,
        EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY,
        EXTERIOR_COMPOSITION_STYLES.MIXED,
    ];
}

function semanticStylePool(entity, buildingSemanticTruth = null) {
    if (buildingSemanticTruth) return buildingSemanticCompositionStyles(buildingSemanticTruth);
    const physical = physicalStylePool(entity);
    const districtPolicy = districtExteriorPolicyForEntity(entity);
    const districtBiases = [...(districtPolicy.styleBiases ?? [])];
    if (!districtBiases.length) return physical;
    // Compatibility fallback only: normal managed buildings already carry shared
    // Building Semantic Truth, which absorbs district identity before this planner.
    return [...districtBiases, ...districtBiases, ...physical];
}

function compositionStyleForEntity(chunkKey, entityId, entity, selectedSpectacleEntry, buildingSemanticTruth = null) {
    const rank = hash32(`${chunkKey}:${entityId}:composition-style`);
    if (selectedSpectacleEntry) {
        if (entity?.kind === 'district-landmark') return EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER;
        return rank % 4 === 0 ? EXTERIOR_COMPOSITION_STYLES.SIGNAGE_BAZAAR : EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER;
    }
    const pool = semanticStylePool(entity, buildingSemanticTruth);
    return pool[rank % pool.length];
}

function planIdFor(chunkKey, entityId) {
    return `${EXTERIOR_COMPOSITION_SCHEMA}:${chunkKey}:${entityId}:${hash32(`${chunkKey}:${entityId}:exterior-plan`).toString(16).padStart(8, '0')}`;
}

function planForEntity(chunkKey, entityId, entity, selectedSpectacleEntry, buildingSemanticTruth = null) {
    const districtPolicy = districtExteriorPolicyForEntity(entity);
    const style = compositionStyleForEntity(chunkKey, entityId, entity, selectedSpectacleEntry, buildingSemanticTruth);
    const profile = STYLE_PROFILES[style] ?? STYLE_PROFILES[EXTERIOR_COMPOSITION_STYLES.MIXED];
    const signageStress = GENERATION_LANES.signageStress === true;
    const caps = signageStress
        ? { spectacle: 2, identity: 8, macro: 2, medium: 1, micro: 0 }
        : { ...profile.caps };
    if (selectedSpectacleEntry && !signageStress) caps.spectacle = 1;
    return {
        schema: EXTERIOR_COMPOSITION_SCHEMA,
        id: planIdFor(chunkKey, entityId),
        entityId,
        buildingSemanticTruth,
        buildingSemanticTruthId: buildingSemanticTruth?.id ?? null,
        buildingSemanticTruthFingerprint: buildingSemanticTruth?.fingerprint ?? null,
        semanticProgram: buildingSemanticTruth?.program ?? entity?.program ?? entity?.semanticProgram ?? null,
        physicalUseFamily: buildingSemanticTruth?.physicalUseFamily ?? entity?.physicalUse?.family ?? null,
        style,
        districtCompositionId: districtPolicy.compositionId ?? null,
        districtBlockRole: districtPolicy.blockRole ?? null,
        districtFrontageCharacter: districtPolicy.frontageCharacter ?? null,
        districtSpectaclePriority: districtPolicy.spectaclePriority ?? 0,
        districtSpectacleCorridor: !!districtPolicy.spectacleCorridor,
        densityCeiling: signageStress ? 13 : profile.densityCeiling,
        coverageFloorTarget: signageStress ? 2 : profile.coverageFloor,
        caps,
    };
}

const CLAIMING_TIERS = new Set(['spectacle', 'identity', 'macro', 'medium']);

function exteriorClaimType(entry) {
    const tier = exteriorTaskVisualTier(entry.task);
    const role = String(entry.task?.semanticOpportunityRole ?? entry.task?.semanticPlacement?.role ?? '');
    if (tier === 'spectacle') return SPATIAL_CLAIM_TYPES.SPECTACLE_SURFACE;
    if (tier === 'macro' && /roof/i.test(role)) return SPATIAL_CLAIM_TYPES.ROOF_EQUIPMENT;
    if (tier === 'macro') return SPATIAL_CLAIM_TYPES.MACRO_EQUIPMENT;
    if (/service-band/i.test(role)) return SPATIAL_CLAIM_TYPES.SERVICE_BAND;
    if (tier === 'micro') return SPATIAL_CLAIM_TYPES.MICRO_CLUTTER;
    return SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY;
}

function finitePositive(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function taskPhysicalClaimParts(task, tier) {
    // Opportunity identity remains the precise semantic scope. Physical boxes are
    // supplemental for equipment/clutter so overlapping independently discovered
    // opportunities still arbitrate real space instead of only matching IDs.
    if (!['macro', 'medium', 'micro'].includes(tier)) return [];
    const parts = [];
    const placements = task?.fieldPlan?.placements ?? [];
    for (const placement of placements) {
        if (placement?.shape !== 'box') continue;
        const sx = finitePositive(placement.sx);
        const sy = finitePositive(placement.sy);
        const sz = finitePositive(placement.sz);
        if (![placement.x, placement.y, placement.z].every(Number.isFinite) || !(sx > 0 && sy > 0 && sz > 0)) continue;
        parts.push({ kind: 'box3', x: placement.x, y: placement.y, z: placement.z, halfX: sx * 0.5, halfY: sy * 0.5, halfZ: sz * 0.5 });
    }
    if (parts.length) return parts;

    const placement = task?.semanticPlacement;
    if (!placement || ![placement.x, placement.y, placement.z].every(Number.isFinite)) return parts;
    const clearance = task?.exteriorRequest?.clearance ?? task?.semanticOpportunityBounds ?? {};
    const width = finitePositive(clearance.width, finitePositive(task?.width, 0));
    const depth = finitePositive(clearance.depth, finitePositive(task?.depth, tier === 'macro' ? 0.8 : 0.42));
    const height = finitePositive(clearance.height, finitePositive(task?.height, tier === 'macro' ? 2.4 : 1.2));
    if (!(width > 0 && depth > 0 && height > 0)) return parts;
    parts.push({
        kind: 'box3',
        x: placement.x,
        y: placement.y,
        z: placement.z,
        halfX: width * 0.5,
        halfY: height * 0.5,
        halfZ: depth * 0.5,
    });
    return parts;
}

function exteriorSpatialClaimForEntry(chunkKey, entityId, entry, plan) {
    if (entry.spatialClaim) return entry.spatialClaim;
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const opportunityId = taskOpportunityId(task);
    const surfaces = [...taskSurfaceKeys(task)];
    const wholeSurfaceClaims = [...taskConflictSurfaceKeys(task)];
    const parts = [];

    if (wholeSurfaceClaims.length) {
        for (const surfaceId of wholeSurfaceClaims) parts.push({ kind: 'surface-ref', surfaceId });
    } else if (opportunityId != null) {
        parts.push({
            kind: 'opportunity-ref',
            opportunityId: String(opportunityId),
            ...(surfaces[0] ? { surfaceId: surfaces[0] } : {}),
        });
    } else if (surfaces.length) {
        for (const surfaceId of surfaces) parts.push({ kind: 'surface-ref', surfaceId });
    }
    parts.push(...taskPhysicalClaimParts(task, tier));
    if (!parts.length) {
        // Unscoped legacy work still receives an entity-local reference rather than
        // silently bypassing spatial ownership.
        parts.push({ kind: 'opportunity-ref', opportunityId: `${entityId}:legacy:${task.kind}:${task.seed ?? 0}` });
    }

    const geometry = parts.length === 1 ? parts[0] : { kind: 'compound', parts };
    const tierBase = { spectacle: 800, identity: 700, macro: 620, medium: 430, micro: 160 }[tier] ?? 300;
    const stableRank = hash32(`${chunkKey}:${entityId}:${entry.source}:${task.kind}:${task.seed ?? 0}:${opportunityId ?? ''}`);
    const priority = tierBase + (0xffffffff - stableRank) / 0x100000000;
    const claim = createSpatialClaim({
        id: `${plan.id}:claim:${hash32(`${entityId}:${entry.source}:${task.kind}:${task.seed ?? 0}:${opportunityId ?? ''}:${tier}`).toString(16).padStart(8, '0')}`,
        owner: { system: 'exterior-composition', id: plan.id, scopeId: entityId },
        claimType: exteriorClaimType(entry),
        geometry,
        priority,
        semanticTier: tier,
        lifetime: { kind: 'plan', scopeId: plan.id },
        provenance: {
            sourceSystem: 'exterior-composition-authority',
            sourceId: task.exteriorRequestId ?? null,
            sourceKind: task.kind,
            candidateSource: entry.source,
        },
        metadata: {
            entityId,
            opportunityId: opportunityId == null ? null : String(opportunityId),
            surfaceIds: surfaces,
            requestTier: tier,
        },
    });
    entry.spatialClaim = claim;
    return claim;
}

function projectLegacyExteriorReservations(claim, entry, reservations, planId) {
    if (!CLAIMING_TIERS.has(exteriorTaskVisualTier(entry.task))) return;
    const projected = legacyExteriorReservationsFromSpatialClaim(claim, {
        planId,
        entityId: entityIdOf(entry.task),
        requestTier: exteriorTaskVisualTier(entry.task),
        source: entry.source,
    });
    for (const reservation of projected) {
        reservations.push({ ...reservation, id: `${planId}:reservation:${reservations.length}` });
    }
}

function externalSpatialClaimsForEntity(payload, entity) {
    const claims = new Map();
    const sources = [
        ...(payload?.physics?.circulationReservations ?? []),
        ...(payload?.semanticContext?.spatialTopology?.reservations ?? []),
        ...(entity?.buildingPlan?.circulationClearances ?? []),
    ];
    for (const reservation of sources) {
        if (!reservation?.id) continue;
        try {
            const claim = spatialClaimFromCirculationReservation(reservation);
            claims.set(claim.id, claim);
        } catch {
            // Compatibility bridge is intentionally tolerant: malformed legacy
            // reservations remain the responsibility of their existing producer.
        }
    }
    // Portal-derived facade apertures participate in the same typed conflict
    // authority. Surface-local claims block only the actual threshold territory,
    // so unrelated opportunities on the same facade remain usable.
    for (const aperture of payload?.semanticContext?.spatialTopology?.apertures ?? []) {
        if (!aperture?.id || !aperture?.surfaceId) continue;
        if (entity?.id != null && aperture.entityId != null && String(aperture.entityId) !== String(entity.id)) continue;
        try {
            const claim = spatialClaimFromFacadeAperture(aperture, {
                owner: { system: 'access-portal', id: String(aperture.portalId ?? aperture.connectorId ?? aperture.id) },
                provenance: {
                    sourceSystem: 'access-portal',
                    sourceId: aperture.id,
                    portalId: aperture.portalId ?? null,
                    connectorId: aperture.connectorId ?? null,
                },
            });
            claims.set(claim.id, claim);
        } catch {
            // Invalid legacy aperture data remains owned by topology compatibility.
        }
    }
    return [...claims.values()];
}

function selectEntityEntries(chunkKey, entityId, entries, selectedSpectacleEntry, plan, externalSpatialClaims = []) {
    const selected = [];
    const selectedSet = new Set();
    const reservations = [];
    const claimAuthority = new SpatialClaimAuthority(externalSpatialClaims);

    const canAdmit = entry => {
        if (!entry || selectedSet.has(entry) || selected.length >= plan.densityCeiling) return false;
        const claim = exteriorSpatialClaimForEntry(chunkKey, entityId, entry, plan);
        return claimAuthority.canClaim(claim);
    };

    const admit = entry => {
        if (!canAdmit(entry)) return false;
        const claim = exteriorSpatialClaimForEntry(chunkKey, entityId, entry, plan);
        const decision = claimAuthority.claim(claim);
        if (!decision.accepted || decision.displaced.length) return false;
        selected.push(entry);
        selectedSet.add(entry);
        projectLegacyExteriorReservations(claim, entry, reservations, plan.id);
        return true;
    };

    if (selectedSpectacleEntry) admit(selectedSpectacleEntry);

    if (GENERATION_LANES.signageStress) {
        const spectacleCap = plan.caps.spectacle ?? 0;
        const spectaclePool = entries
            .filter(entry => !selectedSet.has(entry) && exteriorTaskVisualTier(entry.task) === 'spectacle')
            .sort((a, b) => stableEntryCompare(`${chunkKey}:${entityId}:spectacle-stress`, a, b, EXTERIOR_COMPOSITION_STYLES.MEDIA_MONSTER));
        for (const entry of spectaclePool) {
            if (selected.filter(item => exteriorTaskVisualTier(item.task) === 'spectacle').length >= spectacleCap) break;
            if (selected.length >= plan.densityCeiling) break;
            admit(entry);
        }
    }

    // Coarse physical identity wins before smaller facade identity when claims overlap.
    // This preserves the global big-before-small rule while coverage metadata still
    // decides which accepted high-tier request publishes first.
    const tierOrder = GENERATION_LANES.signageStress
        ? ['identity', 'macro', 'medium', 'micro'] : ['macro', 'identity', 'medium', 'micro'];
    for (const tier of tierOrder) {
        const cap = plan.caps[tier] ?? 0;
        if (!(cap > 0) || selected.length >= plan.densityCeiling) continue;
        const alreadyInTier = selected.filter(entry => exteriorTaskVisualTier(entry.task) === tier).length;
        const remaining = Math.min(cap - alreadyInTier, plan.densityCeiling - selected.length);
        if (!(remaining > 0)) continue;
        const pool = entries
            .filter(entry => !selectedSet.has(entry) && exteriorTaskVisualTier(entry.task) === tier)
            .sort((a, b) => stableEntryCompare(`${chunkKey}:${entityId}:${tier}`, a, b, plan.style));
        for (const entry of pool) {
            if (selected.filter(item => exteriorTaskVisualTier(item.task) === tier).length >= cap) break;
            if (selected.length >= plan.densityCeiling) break;
            admit(entry);
        }
    }

    if (!selected.length && entries.length) {
        admit([...entries].sort((a, b) => stableEntryCompare(`${chunkKey}:${entityId}:fallback`, a, b, plan.style))[0]);
    }

    const spatialClaims = claimAuthority.claims().filter(claim => claim.owner?.system === 'exterior-composition' && claim.owner?.id === plan.id);
    return {
        selected,
        reservations,
        spatialClaims,
        externalSpatialClaimCount: externalSpatialClaims.length,
    };
}

function coverageCandidate(entries, anchor, plan) {
    const coarse = entries.filter(entry => entry !== anchor && ['spectacle', 'identity', 'macro'].includes(exteriorTaskVisualTier(entry.task)));
    if (!coarse.length) return null;
    const preferredTier = plan.style === EXTERIOR_COMPOSITION_STYLES.PIPE_NIGHTMARE
        || plan.style === EXTERIOR_COMPOSITION_STYLES.SERVICE_BUNKER ? 'macro'
        : plan.style === EXTERIOR_COMPOSITION_STYLES.ROOF_HEAVY ? 'identity'
            : null;
    coarse.sort((a, b) => {
        const preferredA = preferredTier && exteriorTaskVisualTier(a.task) === preferredTier ? 1 : 0;
        const preferredB = preferredTier && exteriorTaskVisualTier(b.task) === preferredTier ? 1 : 0;
        return preferredB - preferredA || stableEntryCompare(`coverage-floor:${plan.entityId}`, a, b, plan.style);
    });
    return coarse[0] ?? null;
}

function assignCoverageMetadata(entries, selectedSpectacleEntry, plan) {
    for (const entry of entries) {
        entry.task.firstPassBundle = false;
        if (entry.task.firstPassClass && entry.task.firstPassClass !== 'hidden') entry.task.firstPassClass = 'composition-deep';
        delete entry.task.exteriorComposition;
    }
    if (!entries.length) return { anchor: null, required: [], waveCounts: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } };

    let anchor = selectedSpectacleEntry && entries.includes(selectedSpectacleEntry) ? selectedSpectacleEntry : null;
    if (!anchor) {
        anchor = [...entries].sort((a, b) => {
            const score = anchorScore(b, plan.style) - anchorScore(a, plan.style);
            return score || stableEntryCompare('coverage-anchor', a, b, plan.style);
        })[0];
    }
    anchor.task.firstPassBundle = true;
    anchor.task.firstPassClass = exteriorTaskVisualTier(anchor.task) === 'spectacle' ? 'spectacle' : 'exterior-composition-anchor';

    const required = [anchor];
    if (plan.coverageFloorTarget > 1) {
        const secondary = coverageCandidate(entries, anchor, plan);
        if (secondary) required.push(secondary);
    }
    const requiredSet = new Set(required);
    const waveCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let ordinal = 0;
    for (const entry of entries) {
        const tier = exteriorTaskVisualTier(entry.task);
        const isAnchor = entry === anchor;
        const coverageRequired = requiredSet.has(entry);
        const signageStressPriority = GENERATION_LANES.signageStress
            && (tier === 'spectacle' || entry.task.kind === 'sign');
        const wave = isAnchor ? 0
            : (coverageRequired || signageStressPriority) ? 1
                : tier === 'spectacle' || tier === 'identity' || tier === 'macro' ? 2
                    : tier === 'medium' ? 3 : 4;
        entry.task.exteriorComposition = {
            schema: EXTERIOR_COMPOSITION_SCHEMA,
            entityId: plan.entityId,
            buildingSemanticTruthId: plan.buildingSemanticTruthId,
            semanticProgram: plan.semanticProgram,
            style: plan.style,
            tier,
            wave,
            coverageRequired,
            coverageRole: isAnchor ? 'first-pass-anchor' : coverageRequired ? 'coarse-floor' : 'refinement',
            densityOrdinal: ordinal++,
            densityCeiling: plan.densityCeiling,
        };
        waveCounts[wave] = (waveCounts[wave] ?? 0) + 1;
    }
    return { anchor, required, waveCounts };
}

function annotatePlanRequests(plan, selected, reservations) {
    for (let ordinal = 0; ordinal < selected.length; ordinal++) {
        const entry = selected[ordinal];
        const tier = exteriorTaskVisualTier(entry.task);
        const requestId = `${plan.id}:request:${ordinal}`;
        const surfaceIds = [...taskSurfaceKeys(entry.task)];
        const opportunityId = taskOpportunityId(entry.task);
        const reservationIds = reservations.filter(reservation => {
            if (reservation.scope === 'opportunity') {
                return opportunityId != null && reservation.opportunityId === String(opportunityId);
            }
            return reservation.scope === 'surface' && surfaceIds.includes(reservation.surfaceId);
        }).map(reservation => reservation.id);
        const spatialClaimIds = entry.spatialClaim ? [entry.spatialClaim.id] : [];
        entry.task.exteriorComposition = {
            ...(entry.task.exteriorComposition ?? {}),
            schema: EXTERIOR_COMPOSITION_SCHEMA,
            planId: plan.id,
            requestId,
            entityId: plan.entityId,
            buildingSemanticTruthId: plan.buildingSemanticTruthId,
            semanticProgram: plan.semanticProgram,
            source: entry.source,
            tier,
            ordinal,
            surfaceIds,
            reservationIds,
            spatialClaimIds,
        };
        entry.task.buildingSemanticTruthId = plan.buildingSemanticTruthId;
        entry.task.buildingSemanticProgram = plan.semanticProgram;
        entry.task.exteriorPlanId = plan.id;
        entry.task.exteriorCompositionPlanId = plan.id;
        entry.task.exteriorRequestId = requestId;
        entry.task.exteriorReservationIds = reservationIds;
        entry.task.exteriorSpatialClaimIds = spatialClaimIds;
    }
}

function opportunitiesForEntity(payload, entityId) {
    return (payload?.semanticContext?.opportunities ?? []).filter(opportunity => {
        if (!opportunity || opportunity.decorationMayIntrude === false || opportunity.spectacleReserved === true) return false;
        return String(opportunity.entityId ?? opportunity.hostId ?? '') === String(entityId);
    });
}

function opportunitySize(opportunity) {
    const budget = opportunity?.clearanceBudget ?? {};
    const bounds = opportunity?.bounds ?? {};
    const width = finite(budget.width, finite(opportunity?.availableWidth, finite(bounds.halfX, 0) * 2));
    const height = finite(budget.height, finite(opportunity?.availableHeight, 0));
    const depth = finite(budget.depth, finite(bounds.halfZ, 0) * 2);
    return Math.max(0, width) * Math.max(0.3, height || depth || 1) + Math.max(0, depth) * 0.5;
}

function bestOpportunity(chunkKey, entityId, opportunities, roles, excludedIds = null) {
    const roleRank = new Map(roles.map((role, index) => [role, index]));
    const pool = opportunities.filter(item => roleRank.has(item.role) && !excludedIds?.has(item.id));
    if (!pool.length) return null;
    return pool.map(item => ({
        item,
        preference: roleRank.get(item.role),
        priority: EXTERIOR_OPPORTUNITY_PRIORITY[item.role] ?? 99,
        size: opportunitySize(item),
        rank: hash32(`${chunkKey}:${entityId}:planner-opportunity:${item.id}`),
    })).sort((a, b) => a.preference - b.preference || a.priority - b.priority || b.size - a.size || a.rank - b.rank || String(a.item.id).localeCompare(String(b.item.id)))[0].item;
}

function requestContract(entity, opportunity, spec) {
    const frontageBinding = opportunity?.frontageBinding ?? null;
    const contentContext = frontageContentContextFromBinding(frontageBinding);
    return {
        entityId: entity.id,
        semanticFamily: spec.semanticFamily,
        desiredScaleClass: spec.desiredScaleClass,
        targetSurface: opportunity.role,
        availableBounds: opportunity.bounds ? { ...opportunity.bounds } : { ...(opportunity.clearanceBudget ?? {}) },
        orientation: finite(opportunity.transform?.rotY),
        clearance: { ...(opportunity.clearanceBudget ?? {}) },
        buildingSemanticTruthId: entity?.buildingSemanticTruth?.id ?? entity?.buildingPlan?.buildingSemanticTruthId ?? null,
        styleProgramPreference: contentContext?.program
            ?? entity?.buildingSemanticTruth?.program
            ?? entity.program ?? entity.semanticProgram ?? entity.kind ?? 'mixed',
        planOwner: EXTERIOR_COMPOSITION_SCHEMA,
        reservationOwner: `${entity.id}:${opportunity.id}`,
        priorityTier: spec.priorityTier,
        planRequestId: spec.planRequestId,
        frontageBinding,
        contentContext,
        semanticProgram: contentContext?.program ?? null,
        semanticDestinationId: contentContext?.destinationId ?? null,
        frontageRole: contentContext?.frontageRole ?? null,
        publicRole: contentContext?.publicRole ?? null,
    };
}

function annotateTaskContract(task, entity, opportunity, request) {
    task.exteriorVisualTier ??= request.priorityTier;
    task.exteriorPlanOwner = request.planOwner;
    task.exteriorReservationOwner = request.reservationOwner;
    task.exteriorRequest = { ...(task.exteriorRequest ?? {}), ...request };
    task.buildingSemanticTruthId ??= request.buildingSemanticTruthId ?? null;
    task.buildingSemanticProgram ??= request.styleProgramPreference ?? null;
    task.semanticOpportunityRole ??= opportunity?.role ?? null;
    task.frontageBinding ??= request.frontageBinding ?? opportunity?.frontageBinding ?? null;
    task.semanticContentContext ??= request.contentContext ?? frontageContentContextFromBinding(task.frontageBinding);
    task.semanticProgram ??= task.semanticContentContext?.program ?? null;
    task.semanticDestinationId ??= task.semanticContentContext?.destinationId ?? null;
    if (opportunity && !task.semanticPlacement) bindSemanticExteriorPlacement(task, opportunity);
    return task;
}

function projectAuthoredCandidate(task, entity, opportunities) {
    const clone = { ...task };
    const opportunity = task.semanticPlacement
        ? opportunities.find(item => item.id === task.semanticOpportunityId) ?? null
        : chooseSemanticExteriorOpportunity(clone, opportunities, null);
    if (!opportunity && !clone.semanticPlacement) return null;
    const tier = exteriorTaskVisualTier(clone);
    const request = requestContract(entity, opportunity ?? { role: clone.semanticOpportunityRole, id: clone.semanticOpportunityId, transform: clone.semanticPlacement }, {
        semanticFamily: clone.kind,
        desiredScaleClass: tier === 'macro' ? 'large' : tier,
        priorityTier: tier,
        planRequestId: `${entity.id}:legacy-candidate:${clone.kind}:${clone.seed ?? 0}`,
    });
    return annotateTaskContract(clone, entity, opportunity, request);
}

function buildPlannerServiceCandidates({ chunk, payload, buildings, groups, selectContextAsset, planFieldRequest }) {
    if (typeof selectContextAsset !== 'function' && typeof planFieldRequest !== 'function') return { requests: 0, context: 0, field: 0, failed: 0 };
    const usedAssetIds = new Set();
    let requests = 0, context = 0, field = 0, failed = 0;
    const chunkKey = String(chunk?.key ?? 'world');

    const addServiceTask = (entity, opportunity, spec, preferContext = true) => {
        if (!opportunity) return null;
        requests++;
        const request = requestContract(entity, opportunity, {
            ...spec,
            planRequestId: `${entity.id}:${spec.priorityTier}:${spec.semanticFamily}:${opportunity.id}`,
        });
        let task = null;
        let source = null;
        if (preferContext && typeof selectContextAsset === 'function') {
            task = selectContextAsset({ chunk, payload, entity, opportunity, request, usedAssetIds });
            if (task) { source = 'planner-context'; context++; if (task.assetId) usedAssetIds.add(task.assetId); }
        }
        if (!task && typeof planFieldRequest === 'function') {
            task = planFieldRequest({ chunk, payload, entity, opportunity, request });
            if (task) { source = 'planner-field'; field++; }
        }
        if (!task) { failed++; return null; }
        annotateTaskContract(task, entity, opportunity, request);
        const list = groups.get(String(entity.id)) ?? [];
        list.push({ task, source, wasFirstPass: false });
        groups.set(String(entity.id), list);
        return task;
    };

    for (const [entityId, entity] of buildings) {
        const districtPolicy = districtExteriorPolicyForEntity(entity);
        const opportunities = opportunitiesForEntity(payload, entityId);
        if (!opportunities.length) continue;
        const reserved = new Set();
        const current = groups.get(entityId) ?? [];

        if (GENERATION_LANES.signageStress) {
            const facadeSpectacle = bestOpportunity(chunkKey, entityId, opportunities, ['corner-media-band', 'facade-spectacle-span'], reserved);
            if (facadeSpectacle) {
                addServiceTask(entity, facadeSpectacle, { semanticFamily: 'media-spectacle', desiredScaleClass: 'spectacle', priorityTier: 'spectacle' }, false);
                reserved.add(facadeSpectacle.id);
            }
            const roofSpectacle = bestOpportunity(chunkKey, entityId, opportunities, ['roof-spectacle-envelope'], reserved);
            if (roofSpectacle) {
                addServiceTask(entity, roofSpectacle, { semanticFamily: 'media-spectacle', desiredScaleClass: 'spectacle', priorityTier: 'spectacle' }, false);
                reserved.add(roofSpectacle.id);
            }
        } else {
            const spectacle = bestOpportunity(chunkKey, entityId, opportunities, ['corner-media-band', 'facade-spectacle-span', 'roof-spectacle-envelope'], reserved);
            if (spectacle) {
                addServiceTask(entity, spectacle, { semanticFamily: 'media-spectacle', desiredScaleClass: 'spectacle', priorityTier: 'spectacle' }, false);
                reserved.add(spectacle.id);
            }
        }

        const hasIdentity = current.some(entry => exteriorTaskVisualTier(entry.task) === 'identity');
        if (!hasIdentity) {
            const sign = bestOpportunity(chunkKey, entityId, opportunities, ['facade-sign-zone'], reserved);
            if (sign) {
                addServiceTask(entity, sign, { semanticFamily: 'signage', desiredScaleClass: 'large', priorityTier: 'identity' }, false);
                reserved.add(sign.id);
            }
        }

        // Deliberately ask for building-scale mechanical features before hardware.
        // One facade and one roof macro request are enough to make large corpus
        // content common without turning opportunity count into density.
        const facadeMacro = bestOpportunity(chunkKey, entityId, opportunities, ['facade-service-band', 'wall-mounted-prop-zone'], reserved);
        const allowFacadeMacro = !GENERATION_LANES.signageStress
            || hash32(`${chunkKey}:${entityId}:signage-stress:facade-prop`) % 100 < 28;
        if (facadeMacro && allowFacadeMacro) {
            addServiceTask(entity, facadeMacro, {
                semanticFamily: entity.exteriorMacroPreference?.facadeSemanticFamily
                    ?? entity?.buildingSemanticTruth?.exteriorTendencies?.facadeSemanticFamily
                    ?? districtPolicy.facadeSemanticFamily
                    ?? (facadeMacro.role === 'facade-service-band' ? 'vertical-mechanical' : 'mechanical-service'),
                desiredScaleClass: 'large', priorityTier: 'macro',
            }, true);
            reserved.add(facadeMacro.id);
        }

        const roofMacro = bestOpportunity(chunkKey, entityId, opportunities, ['roof-utility-zone'], reserved);
        const allowRoofMacro = !GENERATION_LANES.signageStress
            || hash32(`${chunkKey}:${entityId}:signage-stress:roof-prop`) % 100 < 18;
        if (roofMacro && allowRoofMacro) {
            addServiceTask(entity, roofMacro, {
                semanticFamily: entity.exteriorMacroPreference?.roofSemanticFamily
                    ?? entity?.buildingSemanticTruth?.exteriorTendencies?.roofSemanticFamily
                    ?? districtPolicy.roofSemanticFamily ?? 'roof-mechanical',
                desiredScaleClass: 'large', priorityTier: 'macro',
            }, true);
            reserved.add(roofMacro.id);
        }

        const medium = bestOpportunity(chunkKey, entityId, opportunities, ['portal-lintel-zone', 'portal-flank-wall-zone', 'wall-mounted-prop-zone'], reserved);
        const allowMedium = !GENERATION_LANES.signageStress
            || hash32(`${chunkKey}:${entityId}:signage-stress:medium-prop`) % 100 < 14;
        if (medium && allowMedium) {
            addServiceTask(entity, medium, { semanticFamily: 'security-hardware', desiredScaleClass: 'medium', priorityTier: 'medium' }, true);
            reserved.add(medium.id);
        }
    }
    return { requests, context, field, failed, uniqueContextAssets: usedAssetIds.size };
}

export function compileExteriorCompositionAuthority({
    chunk,
    payload,
    authoredTasks = [],
    contextualTasks = [],
    fieldTasks = [],
    selectContextAsset = null,
    planFieldRequest = null,
} = {}) {
    if (!chunk || !payload) throw new Error('compileExteriorCompositionAuthority requires chunk and payload');
    const chunkKey = String(chunk.key ?? 'world');
    const buildings = buildingEntityMap(payload);
    const groups = new Map([...buildings.keys()].map(entityId => [entityId, []]));
    for (const [entityId, entity] of buildings) buildingSemanticTruthForEntity(chunk, entityId, entity);
    const untouched = [];

    const add = (task, source) => {
        if (!isManagedBuildingExteriorTask(task, buildings)) {
            untouched.push(task);
            return;
        }
        const entityId = entityIdOf(task);
        const entity = buildings.get(entityId);
        let projected = task;
        if (source === 'authored' && !task.semanticPlacement) {
            projected = projectAuthoredCandidate(task, entity, opportunitiesForEntity(payload, entityId));
        }
        if (!projected) return;
        const entry = { task: projected, source, wasFirstPass: !!projected.firstPassBundle };
        const group = groups.get(entityId) ?? [];
        group.push(entry);
        groups.set(entityId, group);
    };

    for (const task of authoredTasks ?? []) add(task, 'authored');
    for (const task of contextualTasks ?? []) add(task, 'context');
    for (const task of fieldTasks ?? []) add(task, 'field');

    const serviceStats = buildPlannerServiceCandidates({ chunk, payload, buildings, groups, selectContextAsset, planFieldRequest });
    const spectacle = chooseSpectacleEntities(chunkKey, groups, buildings);
    const accepted = [];
    const acceptedEntries = [];
    const perEntity = {};
    const plans = [];
    const styleCounts = {};
    const aggregateWaveCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let coverageFloorTasks = 0;
    let buildingsWithCoarseFloor = 0;

    for (const [entityId, entries] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const selectedSpectacleEntry = spectacle.selected.get(entityId) ?? null;
        const entity = buildings.get(entityId);
        const buildingSemanticTruth = buildingSemanticTruthForEntity(chunk, entityId, entity);
        const plan = planForEntity(chunkKey, entityId, entity, selectedSpectacleEntry, buildingSemanticTruth);
        const externalSpatialClaims = externalSpatialClaimsForEntity(payload, entity);
        const selection = selectEntityEntries(chunkKey, entityId, entries, selectedSpectacleEntry, plan, externalSpatialClaims);
        const selected = selection.selected;
        const coverage = assignCoverageMetadata(selected, selectedSpectacleEntry, plan);
        annotatePlanRequests(plan, selected, selection.reservations);

        for (const entry of selected) {
            accepted.push(entry.task);
            acceptedEntries.push(entry);
        }
        const tierCounts = { spectacle: 0, identity: 0, macro: 0, medium: 0, micro: 0 };
        for (const entry of selected) tierCounts[exteriorTaskVisualTier(entry.task)]++;
        for (const [wave, count] of Object.entries(coverage.waveCounts)) aggregateWaveCounts[wave] += count;
        coverageFloorTasks += coverage.required.length;
        if (coverage.required.length > 1) buildingsWithCoarseFloor++;
        styleCounts[plan.style] = (styleCounts[plan.style] ?? 0) + 1;

        const planRecord = {
            ...plan,
            chunkKey,
            requestIds: selected.map(entry => entry.task.exteriorRequestId),
            reservationIds: selection.reservations.map(item => item.id),
            reservations: selection.reservations,
            spatialClaimIds: selection.spatialClaims.map(item => item.id),
            spatialClaims: selection.spatialClaims,
            externalSpatialClaimCount: selection.externalSpatialClaimCount,
            tierCounts,
            waveCounts: coverage.waveCounts,
            spectacle: !!selectedSpectacleEntry,
            coverageFloor: {
                target: plan.coverageFloorTarget,
                planned: coverage.required.length,
                requestIds: coverage.required.map(entry => entry.task.exteriorRequestId),
                tiers: coverage.required.map(entry => exteriorTaskVisualTier(entry.task)),
            },
        };
        plans.push(planRecord);
        perEntity[entityId] = {
            planId: plan.id,
            buildingSemanticTruthId: plan.buildingSemanticTruthId,
            semanticProgram: plan.semanticProgram,
            physicalUseFamily: plan.physicalUseFamily,
            candidates: entries.length,
            accepted: selected.length,
            rejected: Math.max(0, entries.length - selected.length),
            spectacle: !!selectedSpectacleEntry,
            style: plan.style,
            densityCeiling: plan.densityCeiling,
            reservations: selection.reservations.length,
            spatialClaims: selection.spatialClaims.length,
            externalSpatialClaims: selection.externalSpatialClaimCount,
            coverageFloor: planRecord.coverageFloor,
            tierCounts,
            waveCounts: coverage.waveCounts,
            plannedLargeMacro: selected.filter(entry => ['large', 'macro'].includes(entry.task?.exteriorRequest?.desiredScaleClass)).length,
        };
    }

    const candidateCount = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
    const contextAccepted = acceptedEntries.filter(entry => entry.source === 'context' || entry.source === 'planner-context').length;
    const fieldAccepted = acceptedEntries.filter(entry => entry.source === 'field' || entry.source === 'planner-field').length;
    const authoredAccepted = acceptedEntries.filter(entry => entry.source === 'authored').length;
    const plannerContextAccepted = acceptedEntries.filter(entry => entry.source === 'planner-context').length;
    const plannerFieldAccepted = acceptedEntries.filter(entry => entry.source === 'planner-field').length;
    const anchorCount = acceptedEntries.filter(entry => entry.task.firstPassBundle).length;
    const maxAcceptedPerEntity = Math.max(0, ...Object.values(perEntity).map(item => item.accepted));
    const maxDensityCeiling = Math.max(0, ...Object.values(perEntity).map(item => item.densityCeiling));
    const taskOrder = new Map(acceptedEntries.map((entry, index) => [entry.task, index]));
    accepted.sort((a, b) => {
        const waveA = finite(a?.exteriorComposition?.wave, 9);
        const waveB = finite(b?.exteriorComposition?.wave, 9);
        const tierA = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(a)] ?? 9;
        const tierB = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(b)] ?? 9;
        return waveA - waveB || tierA - tierB || exteriorTaskVisualImpact(b) - exteriorTaskVisualImpact(a)
            || finite(taskOrder.get(a)) - finite(taskOrder.get(b));
    });

    return {
        schema: EXTERIOR_COMPOSITION_SCHEMA,
        plans,
        tasks: [...untouched, ...accepted],
        acceptedExteriorTasks: accepted,
        stats: {
            schema: EXTERIOR_COMPOSITION_SCHEMA,
            runtimeSchema: EXTERIOR_COMPOSITION_RUNTIME_SCHEMA,
            buildingsManaged: groups.size,
            buildingsWithComposition: Object.values(perEntity).filter(item => item.accepted > 0).length,
            plans: plans.length,
            candidates: candidateCount,
            accepted: accepted.length,
            rejected: Math.max(0, candidateCount - accepted.length),
            coverageAnchors: anchorCount,
            coverageFloorTasks,
            buildingsWithCoarseFloor,
            spectacleEligible: spectacle.eligible.length,
            spectacleQuota: spectacle.quota,
            spectacleSelected: spectacle.selected.size,
            contextAccepted,
            fieldAccepted,
            authoredAccepted,
            plannerContextAccepted,
            plannerFieldAccepted,
            plannerRequests: serviceStats.requests,
            plannerRequestFailures: serviceStats.failed,
            plannerContextCandidates: serviceStats.context,
            plannerFieldCandidates: serviceStats.field,
            uniqueContextAssetsRequested: serviceStats.uniqueContextAssets ?? 0,
            largeMacroAccepted: acceptedEntries.filter(entry => ['large', 'macro'].includes(entry.task?.exteriorRequest?.desiredScaleClass)).length,
            maxAcceptedPerEntity,
            maxDensityCeiling,
            reservationCount: plans.reduce((sum, plan) => sum + plan.reservations.length, 0),
            spatialClaimCount: plans.reduce((sum, plan) => sum + plan.spatialClaims.length, 0),
            externalSpatialClaimConsultations: plans.reduce((sum, plan) => sum + plan.externalSpatialClaimCount, 0),
            waveCounts: aggregateWaveCounts,
            styleCounts,
            perEntity,
            singleAuthority: true,
            opportunityGridIsCandidateOnly: true,
            plannerOwnsQuantity: true,
            legacyPopulationAfterPlanDisabled: true,
            coverageFloorPolicy: true,
            densityCeilingPolicy: true,
            neighborhoodWavePolicy: true,
            traceablePlanOwnership: true,
            highTierReservationsProtectLowerTier: true,
        },
    };
}

// Cooperative facade over the same Exterior Composition Authority semantics.
// The planner owns deterministic phase order; the runtime chooses only how many
// bounded units to execute before yielding.
export function createExteriorCompositionCompiler({
    chunk,
    payload,
    authoredTasks = [],
    contextualTasks = [],
    fieldTasks = [],
    selectContextAsset = null,
    planFieldRequest = null,
} = {}) {
    if (!chunk || !payload) throw new Error('createExteriorCompositionCompiler requires chunk and payload');
    const chunkKey = String(chunk.key ?? 'world');
    const buildings = buildingEntityMap(payload);
    const groups = new Map([...buildings.keys()].map(entityId => [entityId, []]));
    for (const [entityId, entity] of buildings) buildingSemanticTruthForEntity(chunk, entityId, entity);
    const untouched = [];
    const sourceTasks = [
        ...(authoredTasks ?? []).map(task => ({ task, source: 'authored' })),
        ...(contextualTasks ?? []).map(task => ({ task, source: 'context' })),
        ...(fieldTasks ?? []).map(task => ({ task, source: 'field' })),
    ];
    const serviceEntityIds = [...buildings.keys()];
    const planEntityIds = [...buildings.keys()].sort((a, b) => a.localeCompare(b));
    const service = {
        usedAssetIds: new Set(),
        requests: 0,
        context: 0,
        field: 0,
        failed: 0,
    };

    let phase = 'collect-candidates';
    let sourceCursor = 0;
    let serviceCursor = 0;
    let planCursor = 0;
    let spectacle = null;
    let result = null;
    let done = false;
    let unitsCompleted = 0;
    let stepCount = 0;
    let maxUnitsInStep = 0;

    const accepted = [];
    const acceptedEntries = [];
    const perEntity = {};
    const plans = [];
    const styleCounts = {};
    const aggregateWaveCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let coverageFloorTasks = 0;
    let buildingsWithCoarseFloor = 0;

    const add = (task, source) => {
        if (!isManagedBuildingExteriorTask(task, buildings)) {
            untouched.push(task);
            return;
        }
        const entityId = entityIdOf(task);
        const entity = buildings.get(entityId);
        let projected = task;
        if (source === 'authored' && !task.semanticPlacement) {
            projected = projectAuthoredCandidate(task, entity, opportunitiesForEntity(payload, entityId));
        }
        if (!projected) return;
        const entry = { task: projected, source, wasFirstPass: !!projected.firstPassBundle };
        const group = groups.get(entityId) ?? [];
        group.push(entry);
        groups.set(entityId, group);
    };

    const addServiceTask = (entity, opportunity, spec, preferContext = true) => {
        if (!opportunity) return null;
        service.requests++;
        const request = requestContract(entity, opportunity, {
            ...spec,
            planRequestId: `${entity.id}:${spec.priorityTier}:${spec.semanticFamily}:${opportunity.id}`,
        });
        let task = null;
        let source = null;
        if (preferContext && typeof selectContextAsset === 'function') {
            task = selectContextAsset({ chunk, payload, entity, opportunity, request, usedAssetIds: service.usedAssetIds });
            if (task) {
                source = 'planner-context';
                service.context++;
                if (task.assetId) service.usedAssetIds.add(task.assetId);
            }
        }
        if (!task && typeof planFieldRequest === 'function') {
            task = planFieldRequest({ chunk, payload, entity, opportunity, request });
            if (task) {
                source = 'planner-field';
                service.field++;
            }
        }
        if (!task) {
            service.failed++;
            return null;
        }
        annotateTaskContract(task, entity, opportunity, request);
        const list = groups.get(String(entity.id)) ?? [];
        list.push({ task, source, wasFirstPass: false });
        groups.set(String(entity.id), list);
        return task;
    };

    const buildServiceCandidatesForEntity = entityId => {
        if (typeof selectContextAsset !== 'function' && typeof planFieldRequest !== 'function') return;
        const entity = buildings.get(entityId);
        if (!entity) return;
        const districtPolicy = districtExteriorPolicyForEntity(entity);
        const opportunities = opportunitiesForEntity(payload, entityId);
        if (!opportunities.length) return;
        const reserved = new Set();
        const current = groups.get(entityId) ?? [];

        const spectacleOpportunity = bestOpportunity(chunkKey, entityId, opportunities,
            ['corner-media-band', 'facade-spectacle-span', 'roof-spectacle-envelope'], reserved);
        if (spectacleOpportunity) {
            addServiceTask(entity, spectacleOpportunity,
                { semanticFamily: 'media-spectacle', desiredScaleClass: 'spectacle', priorityTier: 'spectacle' }, false);
            reserved.add(spectacleOpportunity.id);
        }

        const hasIdentity = current.some(entry => exteriorTaskVisualTier(entry.task) === 'identity');
        if (!hasIdentity) {
            const sign = bestOpportunity(chunkKey, entityId, opportunities, ['facade-sign-zone'], reserved);
            if (sign) {
                addServiceTask(entity, sign, { semanticFamily: 'signage', desiredScaleClass: 'large', priorityTier: 'identity' }, false);
                reserved.add(sign.id);
            }
        }

        const facadeMacro = bestOpportunity(chunkKey, entityId, opportunities,
            ['facade-service-band', 'wall-mounted-prop-zone'], reserved);
        if (facadeMacro) {
            addServiceTask(entity, facadeMacro, {
                semanticFamily: entity.exteriorMacroPreference?.facadeSemanticFamily
                    ?? entity?.buildingSemanticTruth?.exteriorTendencies?.facadeSemanticFamily
                    ?? districtPolicy.facadeSemanticFamily
                    ?? (facadeMacro.role === 'facade-service-band' ? 'vertical-mechanical' : 'mechanical-service'),
                desiredScaleClass: 'large',
                priorityTier: 'macro',
            }, true);
            reserved.add(facadeMacro.id);
        }

        const roofMacro = bestOpportunity(chunkKey, entityId, opportunities, ['roof-utility-zone'], reserved);
        if (roofMacro) {
            addServiceTask(entity, roofMacro, {
                semanticFamily: entity.exteriorMacroPreference?.roofSemanticFamily
                    ?? entity?.buildingSemanticTruth?.exteriorTendencies?.roofSemanticFamily
                    ?? districtPolicy.roofSemanticFamily ?? 'roof-mechanical',
                desiredScaleClass: 'large',
                priorityTier: 'macro',
            }, true);
            reserved.add(roofMacro.id);
        }

        const medium = bestOpportunity(chunkKey, entityId, opportunities,
            ['portal-lintel-zone', 'portal-flank-wall-zone', 'wall-mounted-prop-zone'], reserved);
        if (medium) {
            addServiceTask(entity, medium,
                { semanticFamily: 'security-hardware', desiredScaleClass: 'medium', priorityTier: 'medium' }, true);
            reserved.add(medium.id);
        }
    };

    const selectPlanForEntity = entityId => {
        const entries = groups.get(entityId) ?? [];
        const selectedSpectacleEntry = spectacle?.selected.get(entityId) ?? null;
        const entity = buildings.get(entityId);
        const buildingSemanticTruth = buildingSemanticTruthForEntity(chunk, entityId, entity);
        const plan = planForEntity(chunkKey, entityId, entity, selectedSpectacleEntry, buildingSemanticTruth);
        const externalSpatialClaims = externalSpatialClaimsForEntity(payload, entity);
        const selection = selectEntityEntries(chunkKey, entityId, entries, selectedSpectacleEntry, plan, externalSpatialClaims);
        const selected = selection.selected;
        const coverage = assignCoverageMetadata(selected, selectedSpectacleEntry, plan);
        annotatePlanRequests(plan, selected, selection.reservations);

        for (const entry of selected) {
            accepted.push(entry.task);
            acceptedEntries.push(entry);
        }
        const tierCounts = { spectacle: 0, identity: 0, macro: 0, medium: 0, micro: 0 };
        for (const entry of selected) tierCounts[exteriorTaskVisualTier(entry.task)]++;
        for (const [wave, count] of Object.entries(coverage.waveCounts)) aggregateWaveCounts[wave] += count;
        coverageFloorTasks += coverage.required.length;
        if (coverage.required.length > 1) buildingsWithCoarseFloor++;
        styleCounts[plan.style] = (styleCounts[plan.style] ?? 0) + 1;

        const planRecord = {
            ...plan,
            chunkKey,
            requestIds: selected.map(entry => entry.task.exteriorRequestId),
            reservationIds: selection.reservations.map(item => item.id),
            reservations: selection.reservations,
            spatialClaimIds: selection.spatialClaims.map(item => item.id),
            spatialClaims: selection.spatialClaims,
            externalSpatialClaimCount: selection.externalSpatialClaimCount,
            tierCounts,
            waveCounts: coverage.waveCounts,
            spectacle: !!selectedSpectacleEntry,
            coverageFloor: {
                target: plan.coverageFloorTarget,
                planned: coverage.required.length,
                requestIds: coverage.required.map(entry => entry.task.exteriorRequestId),
                tiers: coverage.required.map(entry => exteriorTaskVisualTier(entry.task)),
            },
        };
        plans.push(planRecord);
        perEntity[entityId] = {
            planId: plan.id,
            buildingSemanticTruthId: plan.buildingSemanticTruthId,
            semanticProgram: plan.semanticProgram,
            physicalUseFamily: plan.physicalUseFamily,
            candidates: entries.length,
            accepted: selected.length,
            rejected: Math.max(0, entries.length - selected.length),
            spectacle: !!selectedSpectacleEntry,
            style: plan.style,
            densityCeiling: plan.densityCeiling,
            reservations: selection.reservations.length,
            spatialClaims: selection.spatialClaims.length,
            externalSpatialClaims: selection.externalSpatialClaimCount,
            coverageFloor: planRecord.coverageFloor,
            tierCounts,
            waveCounts: coverage.waveCounts,
            plannedLargeMacro: selected.filter(entry => ['large', 'macro'].includes(entry.task?.exteriorRequest?.desiredScaleClass)).length,
        };
    };

    const finalize = () => {
        const candidateCount = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
        const contextAccepted = acceptedEntries.filter(entry => entry.source === 'context' || entry.source === 'planner-context').length;
        const fieldAccepted = acceptedEntries.filter(entry => entry.source === 'field' || entry.source === 'planner-field').length;
        const authoredAccepted = acceptedEntries.filter(entry => entry.source === 'authored').length;
        const plannerContextAccepted = acceptedEntries.filter(entry => entry.source === 'planner-context').length;
        const plannerFieldAccepted = acceptedEntries.filter(entry => entry.source === 'planner-field').length;
        const anchorCount = acceptedEntries.filter(entry => entry.task.firstPassBundle).length;
        const maxAcceptedPerEntity = Math.max(0, ...Object.values(perEntity).map(item => item.accepted));
        const maxDensityCeiling = Math.max(0, ...Object.values(perEntity).map(item => item.densityCeiling));
        const taskOrder = new Map(acceptedEntries.map((entry, index) => [entry.task, index]));
        accepted.sort((a, b) => {
            const waveA = finite(a?.exteriorComposition?.wave, 9);
            const waveB = finite(b?.exteriorComposition?.wave, 9);
            const tierA = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(a)] ?? 9;
            const tierB = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(b)] ?? 9;
            return waveA - waveB || tierA - tierB || exteriorTaskVisualImpact(b) - exteriorTaskVisualImpact(a)
                || finite(taskOrder.get(a)) - finite(taskOrder.get(b));
        });

        result = {
            schema: EXTERIOR_COMPOSITION_SCHEMA,
            plans,
            tasks: [...untouched, ...accepted],
            acceptedExteriorTasks: accepted,
            stats: {
                schema: EXTERIOR_COMPOSITION_SCHEMA,
                runtimeSchema: EXTERIOR_COMPOSITION_RUNTIME_SCHEMA,
                buildingsManaged: groups.size,
                buildingsWithComposition: Object.values(perEntity).filter(item => item.accepted > 0).length,
                plans: plans.length,
                candidates: candidateCount,
                accepted: accepted.length,
                rejected: Math.max(0, candidateCount - accepted.length),
                coverageAnchors: anchorCount,
                coverageFloorTasks,
                buildingsWithCoarseFloor,
                spectacleEligible: spectacle?.eligible.length ?? 0,
                spectacleQuota: spectacle?.quota ?? 0,
                spectacleSelected: spectacle?.selected.size ?? 0,
                contextAccepted,
                fieldAccepted,
                authoredAccepted,
                plannerContextAccepted,
                plannerFieldAccepted,
                plannerRequests: service.requests,
                plannerRequestFailures: service.failed,
                plannerContextCandidates: service.context,
                plannerFieldCandidates: service.field,
                uniqueContextAssetsRequested: service.usedAssetIds.size,
                largeMacroAccepted: acceptedEntries.filter(entry => ['large', 'macro'].includes(entry.task?.exteriorRequest?.desiredScaleClass)).length,
                maxAcceptedPerEntity,
                maxDensityCeiling,
                reservationCount: plans.reduce((sum, plan) => sum + plan.reservations.length, 0),
                spatialClaimCount: plans.reduce((sum, plan) => sum + plan.spatialClaims.length, 0),
                externalSpatialClaimConsultations: plans.reduce((sum, plan) => sum + plan.externalSpatialClaimCount, 0),
                waveCounts: aggregateWaveCounts,
                styleCounts,
                perEntity,
                singleAuthority: true,
                opportunityGridIsCandidateOnly: true,
                plannerOwnsQuantity: true,
                legacyPopulationAfterPlanDisabled: true,
                coverageFloorPolicy: true,
                densityCeilingPolicy: true,
                neighborhoodWavePolicy: true,
                traceablePlanOwnership: true,
                highTierReservationsProtectLowerTier: true,
            },
        };
        done = true;
        phase = 'complete';
    };

    const totalUnits = sourceTasks.length + serviceEntityIds.length + 1 + planEntityIds.length + 1;
    const compiler = {
        schema: EXTERIOR_COMPOSITION_RUNTIME_SCHEMA,
        get done() { return done; },
        get phase() { return phase; },
        get result() { return result; },
        get unitsCompleted() { return unitsCompleted; },
        get totalUnits() { return totalUnits; },
        metrics() {
            return { schema: EXTERIOR_COMPOSITION_RUNTIME_SCHEMA, phase, done, unitsCompleted, totalUnits, stepCount, maxUnitsInStep };
        },
        step({ maxUnits = 1 } = {}) {
            if (done) return { done: true, phase, units: 0, unitsCompleted, totalUnits, result };
            const cap = Number.isFinite(maxUnits) ? Math.max(1, Math.floor(maxUnits)) : Infinity;
            let units = 0;
            while (!done && units < cap) {
                if (phase === 'collect-candidates') {
                    if (sourceCursor < sourceTasks.length) {
                        const item = sourceTasks[sourceCursor++];
                        add(item.task, item.source);
                        units++;
                    } else phase = 'service-candidates';
                    continue;
                }
                if (phase === 'service-candidates') {
                    if (serviceCursor < serviceEntityIds.length) {
                        buildServiceCandidatesForEntity(serviceEntityIds[serviceCursor++]);
                        units++;
                    } else phase = 'spectacle-selection';
                    continue;
                }
                if (phase === 'spectacle-selection') {
                    spectacle = chooseSpectacleEntities(chunkKey, groups, buildings);
                    phase = 'entity-plans';
                    units++;
                    continue;
                }
                if (phase === 'entity-plans') {
                    if (planCursor < planEntityIds.length) {
                        selectPlanForEntity(planEntityIds[planCursor++]);
                        units++;
                    } else phase = 'finalize';
                    continue;
                }
                if (phase === 'finalize') {
                    finalize();
                    units++;
                    continue;
                }
                throw new Error(`unknown exterior composition compiler phase: ${phase}`);
            }
            stepCount++;
            unitsCompleted += units;
            maxUnitsInStep = Math.max(maxUnitsInStep, units);
            return { done, phase, units, unitsCompleted, totalUnits, result };
        },
    };
    return compiler;
}
