export const SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA = 'jweb.semantic-context-multiplier.v1';

const ROLE_BY_OPPORTUNITY = Object.freeze({
    'facade-sign-zone': 'wall',
    'facade-poster-zone': 'wall',
    'wall-mounted-prop-zone': 'wall',
    'beside-door-zone': 'ground',
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

const GROUND_CONTEXT_RE = /(bench|chair|stool|crate|box|cabinet|locker|cart|bin|trash|planter|vending|machine|rack|cone|barrel|bucket|case|tool|pump|trolley|bicycle|fan|lamp|light|table|stand|canister|tank|compressor|generator|washer|dryer|refrigerator|freezer|newspaper|phone|atm|kiosk|spool)/i;
const ROOF_CONTEXT_RE = /(vent|fan|duct|hvac|antenna|tank|pump|generator|transformer|compressor|satellite|air.?condition|condenser|exhaust|boiler|electrical|utility|radio|mast|dish|cooling|blower)/i;
const MAX_CONTEXT_PROPS_PER_ENTITY = 8;
const MIN_CONTEXT_PROP_SCALE = 0.16;
const CATALOG_SEARCH_DEPTH = 160;

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

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

function assetText(def) {
    return `${def?.id ?? ''} ${def?.kind ?? ''} ${def?.semanticClass ?? ''} ${def?.file ?? ''}`;
}

function dimensions(def) {
    const dims = Array.isArray(def?.dimensionsXYZ) ? def.dimensionsXYZ : [0.6, 0.8, 0.6];
    return [Math.max(0.04, finite(Number(dims[0]), 0.6)), Math.max(0.04, finite(Number(dims[1]), 0.8)), Math.max(0.04, finite(Number(dims[2]), 0.6))];
}

function isSemanticRuntimeProp(def) {
    return !!def?.id && !!def?.file && def?.semanticGraph?.roles?.includes?.('semantic-prop');
}

function contextualRole(def) {
    if (!isSemanticRuntimeProp(def)) return null;
    if ((def.collision ?? 'none') !== 'none') return null;
    const text = assetText(def);
    const [width, height, depth] = dimensions(def);
    if (def.mount === 'wall') return 'wall';
    if (def.mount !== 'ground') return null;
    if (ROOF_CONTEXT_RE.test(text) && width <= 4.5 && depth <= 4.5 && height <= 5.0) return 'roof';
    if (GROUND_CONTEXT_RE.test(text) && width <= 2.4 && depth <= 2.4 && height <= 3.0) return 'ground';
    return null;
}

function buildCatalog(assets) {
    if (catalogCache.has(assets)) return catalogCache.get(assets);
    const byRole = { wall: [], ground: [], roof: [] };
    let semanticProps = 0;
    let rejectedCollider = 0;
    for (const def of assets ?? []) {
        if (!isSemanticRuntimeProp(def)) continue;
        semanticProps++;
        if ((def.collision ?? 'none') !== 'none') {
            rejectedCollider++;
            continue;
        }
        const role = contextualRole(def);
        if (role) byRole[role].push(def);
    }
    for (const pool of Object.values(byRole)) pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const catalog = {
        byRole,
        stats: {
            manifestAssets: Array.isArray(assets) ? assets.length : 0,
            semanticProps,
            contextualEligible: byRole.wall.length + byRole.ground.length + byRole.roof.length,
            wall: byRole.wall.length,
            ground: byRole.ground.length,
            roof: byRole.roof.length,
            precommitOnlyBecauseCollider: rejectedCollider,
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
    if (role === 'wall') return {
        width: Math.max(0.28, finite(raw.width, 1.0) * 0.94),
        height: Math.max(0.28, finite(raw.height, 1.1) * 0.94),
        depth: 0.48,
        anchor: 'center',
    };
    if (role === 'roof') return {
        width: Math.max(0.45, finite(raw.width, 1.4) * 0.90),
        height: 2.8,
        depth: Math.max(0.45, finite(raw.depth, 1.4) * 0.90),
        anchor: 'floor',
    };
    return {
        width: Math.max(0.36, finite(raw.width, 0.62) * 0.96),
        height: 2.05,
        depth: Math.max(0.36, finite(raw.depth, 0.70) * 0.96),
        anchor: 'floor',
    };
}

function fitScale(def, budget) {
    const [width, height, depth] = dimensions(def);
    return Math.min(1, budget.width / width, budget.height / height, budget.depth / depth);
}

function chooseAsset(pool, context, opportunity, seed) {
    if (!pool?.length) return null;
    const budget = fitBudget(opportunity, ROLE_BY_OPPORTUNITY[opportunity.role]);
    const start = seed % pool.length;
    let fallback = null;
    for (let i = 0; i < Math.min(pool.length, CATALOG_SEARCH_DEPTH); i++) {
        const def = pool[(start + i * 17) % pool.length];
        const scale = fitScale(def, budget);
        if (scale < MIN_CONTEXT_PROP_SCALE) continue;
        const candidate = { def, scale, score: programScore(def, context) };
        if (candidate.score) return candidate;
        if (!fallback) fallback = candidate;
    }
    return fallback;
}

function contextMap(semanticContext) {
    const map = new Map();
    for (const context of semanticContext?.entities ?? []) map.set(context.id, context);
    for (const context of semanticContext?.spaces ?? []) map.set(context.id, context);
    return map;
}

function rankedOpportunities(chunk, semanticContext, occupied) {
    return (semanticContext?.opportunities ?? [])
        .filter(opportunity => ROLE_BY_OPPORTUNITY[opportunity?.role])
        .filter(opportunity => opportunity?.decorationMayIntrude !== false)
        .filter(opportunity => !occupied.has(opportunity.id))
        .filter(opportunity => Number.isFinite(opportunity?.transform?.x) && Number.isFinite(opportunity?.transform?.y) && Number.isFinite(opportunity?.transform?.z))
        .map(opportunity => ({ opportunity, rank: hash32(`${chunk?.key ?? 'world'}:semantic-context-multiplier:${opportunity.id}`) }))
        .sort((a, b) => a.rank - b.rank || String(a.opportunity.id).localeCompare(String(b.opportunity.id)));
}

export function compileSemanticContextMultiplier({ chunk, payload, assets, existingTasks = [], maxTasks = null } = {}) {
    if (!chunk || !payload || !Array.isArray(assets)) throw new Error('compileSemanticContextMultiplier requires chunk, payload, and assets');
    const semanticContext = payload.semanticContext;
    if (!semanticContext?.opportunities?.length) {
        return { schema: SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA, tasks: [], stats: { manifestAssets: assets.length, generated: 0, reason: 'no-semantic-opportunities' } };
    }

    const catalog = buildCatalog(assets);
    const contexts = contextMap(semanticContext);
    const occupied = new Set(existingTasks.map(task => task?.semanticOpportunityId).filter(Boolean));
    const opportunities = rankedOpportunities(chunk, semanticContext, occupied);
    const buildingCount = (payload.entities ?? []).filter(entity => entity?.kind === 'building').length;
    const limit = Math.max(0, Math.floor(maxTasks ?? clamp(24 + Math.ceil(buildingCount * 5.5), 36, 128)));
    const perEntity = new Map();
    const tasks = [];
    const usedAssetIds = new Set();
    const roleCounts = { wall: 0, ground: 0, roof: 0 };

    for (const { opportunity } of opportunities) {
        if (tasks.length >= limit) break;
        const role = ROLE_BY_OPPORTUNITY[opportunity.role];
        const pool = catalog.byRole[role];
        if (!pool?.length) continue;
        const entityId = opportunity.entityId ?? opportunity.hostId ?? null;
        const entityUses = perEntity.get(entityId) ?? 0;
        if (entityUses >= MAX_CONTEXT_PROPS_PER_ENTITY) continue;
        const context = contexts.get(opportunity.contextId) ?? null;
        const seed = hash32(`${chunk.key}:${opportunity.id}:${context?.program ?? 'mixed'}:${tasks.length}`);
        const chosen = chooseAsset(pool, context, opportunity, seed);
        if (!chosen) continue;
        const { def, scale } = chosen;
        const budget = fitBudget(opportunity, role);
        const placement = opportunity.transform;
        const instanceId = `${chunk.key}:context-prop:${hash32(`${opportunity.id}:${def.id}`)}`;
        tasks.push({
            kind: 'semantic-context-prop',
            entityId,
            assetId: def.id,
            program: context?.program ?? 'mixed',
            seed,
            instanceId,
            semanticContextId: opportunity.contextId ?? context?.id ?? null,
            semanticOpportunityId: opportunity.id,
            semanticHostId: opportunity.surfaceId ?? opportunity.hostId ?? entityId,
            spatialTopologyHostId: opportunity.spatialTopologyHostId ?? null,
            semanticContextRole: role,
            semanticLayer: opportunity.layer ?? context?.layer ?? null,
            semanticPlacement: {
                x: placement.x,
                y: placement.y,
                z: placement.z,
                rotY: finite(placement.rotY),
                mode: `context-opportunity:${opportunity.role}`,
                relationTo: opportunity.surfaceId ?? opportunity.hostId ?? null,
                instanceId,
            },
            semanticFit: { ...budget, scale, minScale: MIN_CONTEXT_PROP_SCALE, maxScale: 1 },
            contextualCosmetic: true,
        });
        perEntity.set(entityId, entityUses + 1);
        usedAssetIds.add(def.id);
        roleCounts[role]++;
    }

    return {
        schema: SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA,
        tasks,
        stats: {
            ...catalog.stats,
            opportunitiesConsidered: opportunities.length,
            occupiedOpportunities: occupied.size,
            generated: tasks.length,
            uniqueAssets: usedAssetIds.size,
            roles: roleCounts,
            maxTasks: limit,
            maxPerEntity: MAX_CONTEXT_PROPS_PER_ENTITY,
            minScale: MIN_CONTEXT_PROP_SCALE,
            catalogSearchDepth: CATALOG_SEARCH_DEPTH,
        },
    };
}
