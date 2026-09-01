import { cityAssetPlacementMetadata } from '../vendor/city-pack/placement-metadata.js';
import { exteriorAssetVisualImpact } from './exterior-spectacle-priority.js';

export const SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA = 'jweb.semantic-context-multiplier.v3';

// This module is now a corpus-selection service, not a population authority.
// The Exterior Composition Authority supplies one explicit request + one reserved
// semantic opportunity. Nothing here walks opportunity grids or derives counts.
const ROLE_BY_OPPORTUNITY = Object.freeze({
    'facade-sign-zone': 'wall',
    'facade-poster-zone': 'wall',
    'wall-mounted-prop-zone': 'wall',
    'beside-door-zone': 'ground',
    'portal-flank-ground-zone': 'ground',
    'ground-edge-zone': 'ground',
    'connector-service-zone': 'ground',
    'ground-open-zone': 'ground',
    'portal-flank-wall-zone': 'wall',
    'portal-lintel-zone': 'wall',
    'facade-service-band': 'wall',
    'roof-utility-zone': 'roof',
});

const PROGRAM_ALIASES = Object.freeze({
    commercial: ['bar', 'barber', 'cafe', 'convenience', 'diner', 'florist', 'grocery', 'hardware_store', 'pharmacy', 'shop', 'store', 'workshop'],
    office: ['office', '1980s_office', 'bank', 'archive', 'library', 'post_office', 'radio_station', 'server_room', 'mainframe_room'],
    public: ['civic', 'clinic', 'courtroom', 'dentist', 'fire_station', 'library', 'police_booking', 'school', 'school_classroom'],
    residential: ['residential', 'motel_room'],
    industrial: ['auto_shop', 'boiler_room', 'electronics_repair', 'factory_control', 'laboratory', 'print_shop', 'projection_booth', 'workshop'],
    mixed: [],
});

const ROOF_CONTEXT_RE = /(vent|fan|duct|hvac|antenna|tank|pump|generator|transformer|compressor|satellite|air.?condition|condenser|exhaust|boiler|electrical|utility|radio|mast|dish|cooling|blower)/i;
const WALL_OUTDOOR_RE = /(camera|cctv|security|light|lamp|sconce|fan|vent|duct|hvac|air.?condition|condenser|meter|panel|electrical|utility|junction|alarm|speaker|antenna|dish|cable|conduit|pipe|hose|fire|sign|notice|intercom|transformer|service)/i;
const WALL_INDOOR_RE = /(painting|portrait|picture|mirror|clock|whiteboard|blackboard|chalkboard|bookshelf|bedroom|bathroom|kitchen|classroom)/i;
const FAMILY_PATTERNS = Object.freeze({
    // Keep these intent predicates specific. Broad namespace words such as
    // `food_service` or `radio_station` are context, not proof that a cooler
    // door is a duct riser or a radio console is a roof antenna.
    'mechanical-service': /(hvac|duct|vent|fan|condenser|compressor|generator|transformer|pump|boiler|pipe|conduit|air.?condition|exhaust|cooling|blower|chiller|furnace)/i,
    'vertical-mechanical': /(pipe|duct|conduit|riser|vent|exhaust|downspout|smokestack|vent_stack)/i,
    'roof-mechanical': /(hvac|duct|vent|fan|condenser|compressor|generator|transformer|pump|boiler|antenna|mast|satellite|tank|cooling|blower|chiller)/i,
    'roof-antenna': /(antenna|satellite|telecom[_ -]?mast|radio[_ -]?mast|receiver[_ -]?dish|transmitter[_ -]?mast|aerial[_ -]?mast)/i,
    'security-hardware': /(camera|cctv|security|alarm|intercom|speaker|light|lamp|sconce|call.?panel)/i,
    'electrical-hardware': /(meter|electrical|utility[_ -]?panel|junction|transformer|fuse|breaker|switchgear)/i,
    'street-service': /(vending|atm|kiosk|news|phone|bin|trash|crate|cabinet|locker|cart|rack|barrel|tank|machine)/i,
    signage: /(sign|notice|menu|board|display|screen|poster)/i,
});
const MIN_CONTEXT_PROP_SCALE = 0.16;
const CATALOG_SEARCH_DEPTH = 768;
const catalogCache = new WeakMap();

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

function assetText(def) {
    return `${def?.id ?? ''} ${def?.kind ?? ''} ${def?.semanticClass ?? ''} ${def?.file ?? ''}`;
}

function dimensions(def) {
    const dims = Array.isArray(def?.dimensionsXYZ) ? def.dimensionsXYZ : [0.6, 0.8, 0.6];
    return [
        Math.max(0.04, finite(dims[0], 0.6)),
        Math.max(0.04, finite(dims[1], 0.8)),
        Math.max(0.04, finite(dims[2], 0.6)),
    ];
}

function isSemanticRuntimeProp(def) {
    return !!def?.id && !!def?.file && def?.semanticGraph?.roles?.includes?.('semantic-prop');
}

function contextualRole(def) {
    if (!isSemanticRuntimeProp(def)) return null;
    const text = assetText(def);
    const placement = cityAssetPlacementMetadata(def);
    const mount = def?.placement?.mount ?? placement.mount ?? def.mount ?? 'ground';
    const affinities = new Set([...(placement.placementAffinity ?? []), ...(def?.placement?.placementAffinity ?? [])]);

    if (mount === 'wall' || affinities.has('wall-adjacent')) return 'wall';
    if (mount === 'roof' || affinities.has('roof') || ROOF_CONTEXT_RE.test(text)) return 'roof';
    if (mount === 'surface' || def?.placement?.requiresSupportSurface) return null;
    if (mount === 'ground') return 'ground';
    if (WALL_OUTDOOR_RE.test(text)) return 'wall';
    return null;
}

function buildCatalog(assets) {
    if (catalogCache.has(assets)) return catalogCache.get(assets);
    const byRole = { wall: [], ground: [], roof: [] };
    let semanticProps = 0;
    let colliderBearingContextual = 0;
    for (const def of assets ?? []) {
        if (!isSemanticRuntimeProp(def)) continue;
        semanticProps++;
        const role = contextualRole(def);
        if (!role) continue;
        byRole[role].push(def);
        if ((def.collision ?? 'none') !== 'none') colliderBearingContextual++;
    }
    for (const pool of Object.values(byRole)) pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const contextualEligible = byRole.wall.length + byRole.ground.length + byRole.roof.length;
    const catalog = {
        byRole,
        stats: {
            manifestAssets: Array.isArray(assets) ? assets.length : 0,
            semanticProps,
            contextualEligible,
            coverageRatio: semanticProps ? contextualEligible / semanticProps : 0,
            wall: byRole.wall.length,
            wallOutdoorBiased: byRole.wall.filter(def => WALL_OUTDOOR_RE.test(assetText(def))).length,
            ground: byRole.ground.length,
            roof: byRole.roof.length,
            colliderBearingContextual,
            // Compatibility counter retained for diagnostics: collider metadata no
            // longer globally removes an asset from visual contextual planning.
            precommitOnlyBecauseCollider: 0,
            visualColliderPolicy: 'macro-only-deferred-proxy',
            plannerRequestOnly: true,
        },
    };
    catalogCache.set(assets, catalog);
    return catalog;
}

function programsForContext(context) {
    const direct = context?.program ? [String(context.program)] : [];
    return [...new Set([...direct, ...(PROGRAM_ALIASES[context?.program] ?? [])])];
}

function programScore(def, context) {
    const wanted = programsForContext(context);
    if (!wanted.length) return 0;
    const programs = def?.programs ?? [];
    return wanted.some(program => programs.includes(program)) ? 1 : 0;
}

function fitBudget(opportunity, role) {
    const raw = opportunity?.clearanceBudget ?? {};
    const bounds = opportunity?.bounds ?? {};
    if (role === 'wall') return {
        width: Math.max(0.28, finite(raw.width, finite(opportunity?.availableWidth, 1.0)) * 0.94),
        height: Math.max(0.28, finite(raw.height, finite(opportunity?.availableHeight, 1.1)) * 0.94),
        depth: Math.max(0.20, finite(raw.depth, 0.58)),
        anchor: 'center',
    };
    if (role === 'roof') return {
        width: Math.max(0.45, finite(raw.width, finite(bounds.halfX, 0.7) * 2) * 0.90),
        height: Math.max(1.0, finite(raw.height, 3.4)),
        depth: Math.max(0.45, finite(raw.depth, finite(bounds.halfZ, 0.7) * 2) * 0.90),
        anchor: 'floor',
    };
    return {
        width: Math.max(0.36, finite(raw.width, 0.82) * 0.96),
        height: Math.max(1.0, finite(raw.height, 2.25)),
        depth: Math.max(0.36, finite(raw.depth, 0.90) * 0.96),
        anchor: 'floor',
    };
}

function fitScale(def, budget) {
    const [width, height, depth] = dimensions(def);
    return Math.min(1, budget.width / width, budget.height / height, budget.depth / depth);
}

function contextualAssetScore(def, context, role) {
    let score = programScore(def, context) * 3;
    if (role === 'wall') {
        const text = assetText(def);
        if (WALL_OUTDOOR_RE.test(text)) score += 6;
        if (WALL_INDOOR_RE.test(text)) score -= 6;
        const [, , depth] = dimensions(def);
        if (depth <= 0.65) score += 1;
    } else if (role === 'roof' && ROOF_CONTEXT_RE.test(assetText(def))) {
        score += 5;
    }
    return score;
}

function familyMatches(def, family) {
    if (!family || family === 'any') return true;
    const pattern = FAMILY_PATTERNS[family];
    return pattern ? pattern.test(assetText(def)) : true;
}

function familyScore(def, family) {
    if (!family || family === 'any') return 0;
    const pattern = FAMILY_PATTERNS[family];
    if (!pattern) return 0;
    return familyMatches(def, family) ? 18 : -8;
}

function scaleClassScore(def, scale, role, desiredScaleClass) {
    const [w, h, d] = dimensions(def);
    const retained = Math.max(0, scale);
    const realizedLongest = Math.max(w, h, d) * retained;
    const realizedFace = role === 'roof' ? w * d * retained * retained : w * h * retained * retained;
    if (desiredScaleClass === 'spectacle') return realizedLongest * 4 + realizedFace * 3 + retained * 6;
    if (desiredScaleClass === 'large' || desiredScaleClass === 'macro') {
        const largeBonus = realizedLongest >= 1.55 ? 13 : realizedLongest >= 1.05 ? 5 : -8;
        return largeBonus + realizedFace * 2.3 + retained * 4;
    }
    if (desiredScaleClass === 'medium') {
        const target = 0.9;
        return 5 - Math.abs(realizedLongest - target) * 2 + retained * 2;
    }
    if (desiredScaleClass === 'micro' || desiredScaleClass === 'small') {
        return realizedLongest <= 0.9 ? 5 : -Math.max(0, realizedLongest - 0.9) * 3;
    }
    return 0;
}

function macroVisualRequest(request = {}) {
    const scaleClass = String(request?.desiredScaleClass ?? '');
    return scaleClass === 'large' || scaleClass === 'macro' || scaleClass === 'spectacle';
}

function chooseAsset(pool, context, opportunity, seed, request = {}, usedAssetIds = null, diagnostics = null) {
    const role = ROLE_BY_OPPORTUNITY[opportunity.role];
    const budget = fitBudget(opportunity, role);
    const trace = diagnostics && typeof diagnostics === 'object' ? diagnostics : null;
    if (trace) Object.assign(trace, {
        role,
        poolSize: pool?.length ?? 0,
        examined: 0,
        collisionRejected: 0,
        fitRejected: 0,
        familyRejected: 0,
        chosenAssetId: null,
        chosenScale: null,
        outcome: null,
    });
    if (!pool?.length) {
        if (trace) trace.outcome = 'empty-role-pool';
        return null;
    }
    const start = seed % pool.length;
    const strictFamily = !!FAMILY_PATTERNS[request.semanticFamily];
    let best = null;
    let bestFamilyMatch = null;
    for (let i = 0; i < Math.min(pool.length, CATALOG_SEARCH_DEPTH); i++) {
        const def = pool[(start + i * 17) % pool.length];
        if (trace) trace.examined++;
        // Collision is architectural truth, not a reason to hide a high-value
        // machine. Only explicit macro visual requests may defer activation;
        // medium/micro decoration still requires collision-free candidates.
        if ((def.collision ?? 'none') !== 'none' && !macroVisualRequest(request)) {
            if (trace) trace.collisionRejected++;
            continue;
        }
        const scale = fitScale(def, budget);
        if (scale < MIN_CONTEXT_PROP_SCALE) {
            if (trace) trace.fitRejected++;
            continue;
        }
        const familyMatch = familyMatches(def, request.semanticFamily);
        if (strictFamily && !familyMatch && trace) trace.familyRejected++;
        const novelty = usedAssetIds?.has(def.id) ? -7 : 0;
        const visualImpact = exteriorAssetVisualImpact(def, scale, budget, role);
        const score = contextualAssetScore(def, context, role)
            + familyScore(def, request.semanticFamily)
            + scaleClassScore(def, scale, role, request.desiredScaleClass)
            + visualImpact
            + novelty;
        const candidate = { def, scale, visualImpact, score, ordinal: i, budget, role };
        if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.ordinal < best.ordinal)) best = candidate;
        if (familyMatch
            && (!bestFamilyMatch || candidate.score > bestFamilyMatch.score || (candidate.score === bestFamilyMatch.score && candidate.ordinal < bestFamilyMatch.ordinal))) {
            bestFamilyMatch = candidate;
        }
    }
    // Explicit family requests are contracts. If the corpus lacks a compatible
    // member, return null so the planner can use its deterministic realizer.
    const selected = strictFamily ? bestFamilyMatch : best;
    if (trace) {
        trace.chosenAssetId = selected?.def?.id ?? null;
        trace.chosenScale = selected?.scale ?? null;
        trace.outcome = selected ? 'selected'
            : strictFamily && best ? 'family-miss'
                : trace.collisionRejected + trace.fitRejected > 0 ? 'collision-or-fit-exhausted'
                    : 'no-candidate';
    }
    return selected;
}

function contextMap(semanticContext) {
    const map = new Map();
    for (const context of semanticContext?.entities ?? []) map.set(context.id, context);
    for (const context of semanticContext?.spaces ?? []) map.set(context.id, context);
    return map;
}

export function semanticContextCatalogStats(assets) {
    if (!Array.isArray(assets)) throw new Error('semanticContextCatalogStats requires assets');
    return { ...buildCatalog(assets).stats };
}

export function selectSemanticContextAsset({ chunk, payload, assets, opportunity, request = {}, usedAssetIds = null, diagnostics = null } = {}) {
    if (!chunk || !payload || !Array.isArray(assets) || !opportunity) throw new Error('selectSemanticContextAsset requires chunk, payload, assets, and opportunity');
    if (opportunity.decorationMayIntrude === false || opportunity.spectacleReserved === true) {
        if (diagnostics && typeof diagnostics === 'object') diagnostics.outcome = 'opportunity-disabled';
        return null;
    }
    const role = ROLE_BY_OPPORTUNITY[opportunity.role];
    if (!role) {
        if (diagnostics && typeof diagnostics === 'object') diagnostics.outcome = 'unsupported-role';
        return null;
    }
    const catalog = buildCatalog(assets);
    const context = contextMap(payload.semanticContext).get(opportunity.contextId) ?? null;
    const seed = hash32(`${chunk.key}:${opportunity.id}:${context?.program ?? 'mixed'}:${request.semanticFamily ?? 'any'}:${request.desiredScaleClass ?? 'any'}`);
    const chosen = chooseAsset(catalog.byRole[role], context, opportunity, seed, request, usedAssetIds, diagnostics);
    if (!chosen) return null;
    const { def, scale, visualImpact, budget } = chosen;
    const collisionMode = def.collision ?? 'none';
    const collisionDeferred = collisionMode !== 'none';
    const [nativeWidth, nativeHeight, nativeDepth] = dimensions(def);
    const collisionProxy = collisionDeferred ? {
        shape: 'box',
        width: nativeWidth * scale,
        height: nativeHeight * scale,
        depth: nativeDepth * scale,
        anchor: budget.anchor,
        sourceMode: collisionMode,
        activation: 'deferred',
    } : null;
    const placement = opportunity.transform;
    if (![placement?.x, placement?.y, placement?.z].every(Number.isFinite)) {
        if (diagnostics && typeof diagnostics === 'object') diagnostics.outcome = 'invalid-transform';
        return null;
    }
    if (diagnostics && typeof diagnostics === 'object') {
        diagnostics.collisionDeferred = collisionDeferred;
        diagnostics.collisionMode = collisionMode;
        diagnostics.realizedScale = scale;
    }
    const instanceId = `${chunk.key}:context-prop:${hash32(`${opportunity.id}:${def.id}:${request.planRequestId ?? ''}`)}`;
    const priorityTier = request.priorityTier ?? (request.desiredScaleClass === 'large' || request.desiredScaleClass === 'macro' ? 'macro' : 'medium');
    return {
        kind: 'semantic-context-prop',
        entityId: opportunity.entityId ?? opportunity.hostId ?? request.entityId ?? null,
        assetId: def.id,
        program: context?.program ?? 'mixed',
        seed,
        instanceId,
        semanticContextId: opportunity.contextId ?? context?.id ?? null,
        semanticOpportunityId: opportunity.id,
        semanticHostId: opportunity.surfaceId ?? opportunity.hostId ?? opportunity.entityId ?? null,
        spatialTopologyHostId: opportunity.spatialTopologyHostId ?? null,
        semanticContextRole: role,
        semanticOpportunityRole: opportunity.role,
        semanticVisualImpact: visualImpact,
        semanticNativeScaleRetention: scale,
        semanticLayer: opportunity.layer ?? context?.layer ?? null,
        semanticShellPriority: opportunity.shellPriority ?? (role === 'wall' ? 'deepen' : 'ambient'),
        semanticPlacement: {
            x: placement.x,
            y: placement.y,
            z: placement.z,
            rotY: finite(placement.rotY),
            mode: `context-opportunity:${opportunity.role}`,
            role: opportunity.role,
            opportunityId: opportunity.id,
            relationTo: opportunity.surfaceId ?? opportunity.hostId ?? null,
            surfaceId: opportunity.surfaceId ?? null,
            connectorId: opportunity.connectorId ?? null,
            apertureId: opportunity.apertureId ?? null,
            reservationIds: [...(opportunity.reservationIds ?? [])],
            instanceId,
        },
        semanticFit: { ...budget, scale, minScale: MIN_CONTEXT_PROP_SCALE, maxScale: 1 },
        semanticCollisionMode: collisionMode,
        semanticCollisionDeferred: collisionDeferred,
        semanticCollisionPolicy: collisionDeferred ? 'topology-precommit-deferred-proxy' : 'none',
        semanticCollisionProxy: collisionProxy,
        exteriorVisualTier: priorityTier,
        exteriorPlanOwner: request.planOwner ?? 'exterior-composition-authority',
        exteriorReservationOwner: request.reservationOwner ?? request.planRequestId ?? opportunity.id,
        exteriorRequest: {
            semanticFamily: request.semanticFamily ?? 'any',
            desiredScaleClass: request.desiredScaleClass ?? 'medium',
            targetSurface: opportunity.role,
            priorityTier,
            planRequestId: request.planRequestId ?? null,
        },
        contextualCosmetic: true,
        semanticExteriorAuthority: true,
    };
}

// Compatibility wrapper for callers/tests that want to submit several *explicit*
// planner requests. Automatic density budgeting is intentionally gone.
export function compileSemanticContextMultiplier({ chunk, payload, assets, requests = [] } = {}) {
    if (!chunk || !payload || !Array.isArray(assets)) throw new Error('compileSemanticContextMultiplier requires chunk, payload, and assets');
    const catalog = buildCatalog(assets);
    if (!Array.isArray(requests) || !requests.length) {
        return {
            schema: SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA,
            tasks: [],
            stats: { ...catalog.stats, generated: 0, reason: 'planner-requests-required', automaticPopulationDisabled: true },
        };
    }
    const opportunities = new Map((payload.semanticContext?.opportunities ?? []).map(item => [item.id, item]));
    const tasks = [];
    const usedAssetIds = new Set();
    const roles = { wall: 0, ground: 0, roof: 0 };
    for (const request of requests) {
        const opportunity = request?.opportunity ?? opportunities.get(request?.opportunityId);
        if (!opportunity) continue;
        const task = selectSemanticContextAsset({ chunk, payload, assets, opportunity, request, usedAssetIds });
        if (!task) continue;
        tasks.push(task);
        usedAssetIds.add(task.assetId);
        if (roles[task.semanticContextRole] !== undefined) roles[task.semanticContextRole]++;
    }
    return {
        schema: SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA,
        tasks,
        stats: {
            ...catalog.stats,
            requests: requests.length,
            generated: tasks.length,
            macroRequests: requests.filter(request => macroVisualRequest(request)).length,
            macroGenerated: tasks.filter(task => macroVisualRequest(task.exteriorRequest)).length,
            colliderDeferredVisuals: tasks.filter(task => task.semanticCollisionDeferred).length,
            uniqueAssets: usedAssetIds.size,
            roles,
            minScale: MIN_CONTEXT_PROP_SCALE,
            catalogSearchDepth: CATALOG_SEARCH_DEPTH,
            automaticPopulationDisabled: true,
        },
    };
}
