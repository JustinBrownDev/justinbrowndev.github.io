import { cityAssetPlacementMetadata } from '../vendor/city-pack/placement-metadata.js';
import { EXTERIOR_OPPORTUNITY_PRIORITY, exteriorAssetVisualImpact } from './exterior-spectacle-priority.js';

export const SEMANTIC_CONTEXT_MULTIPLIER_SCHEMA = 'jweb.semantic-context-multiplier.v1';

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

const GROUND_CONTEXT_RE = /(bench|chair|stool|crate|box|cabinet|locker|cart|bin|trash|planter|vending|machine|rack|cone|barrel|bucket|case|tool|pump|trolley|bicycle|fan|lamp|light|table|stand|canister|tank|compressor|generator|washer|dryer|refrigerator|freezer|newspaper|phone|atm|kiosk|spool)/i;
const ROOF_CONTEXT_RE = /(vent|fan|duct|hvac|antenna|tank|pump|generator|transformer|compressor|satellite|air.?condition|condenser|exhaust|boiler|electrical|utility|radio|mast|dish|cooling|blower)/i;
const WALL_OUTDOOR_RE = /(camera|cctv|security|light|lamp|sconce|fan|vent|duct|hvac|air.?condition|condenser|meter|panel|electrical|utility|junction|alarm|speaker|antenna|dish|cable|conduit|pipe|hose|fire|sign|notice|intercom|transformer|service)/i;
const WALL_INDOOR_RE = /(painting|portrait|picture|mirror|clock|whiteboard|blackboard|chalkboard|bookshelf|bedroom|bathroom|kitchen|classroom)/i;
const MIN_CONTEXT_PROP_SCALE = 0.16;
const CATALOG_SEARCH_DEPTH = 512;
const MAX_CONTEXT_TASKS = 320;

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
    const placement = cityAssetPlacementMetadata(def);
    const mount = def?.placement?.mount ?? placement.mount ?? def.mount ?? 'ground';
    const affinities = new Set([...(placement.placementAffinity ?? []), ...(def?.placement?.placementAffinity ?? [])]);

    if (mount === 'wall' || affinities.has('wall-adjacent')) return 'wall';
    if (mount === 'roof' || affinities.has('roof') || ROOF_CONTEXT_RE.test(text)) return 'roof';
    if (mount === 'surface' || def?.placement?.requiresSupportSurface) return null;
    // Ground is intentionally broad. Placement metadata + opportunity fit, not an
    // asset-name whitelist, decides whether the corpus can participate.
    if (mount === 'ground') return 'ground';
    if (WALL_OUTDOOR_RE.test(text)) return 'wall';
    return null;
}

function buildCatalog(assets) {
    if (catalogCache.has(assets)) return catalogCache.get(assets);
    const byRole = { wall: [], ground: [], roof: [] };
    let semanticProps = 0;
    let rejectedCollider = 0;
    let roleEligibleBeforeCollision = 0;
    for (const def of assets ?? []) {
        if (!isSemanticRuntimeProp(def)) continue;
        semanticProps++;
        const collision = def.collision ?? 'none';
        if (collision !== 'none') {
            const clone = { ...def, collision: 'none' };
            if (contextualRole(clone)) roleEligibleBeforeCollision++;
            rejectedCollider++;
            continue;
        }
        const role = contextualRole(def);
        if (role) { byRole[role].push(def); roleEligibleBeforeCollision++; }
    }
    for (const pool of Object.values(byRole)) pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const contextualEligible = byRole.wall.length + byRole.ground.length + byRole.roof.length;
    const catalog = {
        byRole,
        stats: {
            manifestAssets: Array.isArray(assets) ? assets.length : 0,
            semanticProps, contextualEligible,
            roleEligibleBeforeCollision,
            coverageRatio: semanticProps ? contextualEligible / semanticProps : 0,
            wall: byRole.wall.length,
            wallOutdoorBiased: byRole.wall.filter(def => WALL_OUTDOOR_RE.test(assetText(def))).length,
            ground: byRole.ground.length,
            roof: byRole.roof.length,
            precommitOnlyBecauseCollider: rejectedCollider,
            colliderPromotionIsDataOnlyAfterPrecommit: true,
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

function contextualAssetScore(def, context, role) {
    let score = programScore(def, context) * 3;
    if (role === 'wall') {
        const text = assetText(def);
        if (WALL_OUTDOOR_RE.test(text)) score += 6;
        if (WALL_INDOOR_RE.test(text)) score -= 4;
        const [, , depth] = dimensions(def);
        if (depth <= 0.55) score += 1;
    } else if (role === 'roof' && ROOF_CONTEXT_RE.test(assetText(def))) {
        score += 3;
    }
    return score;
}

function chooseAsset(pool, context, opportunity, seed, usedAssetIds = null) {
    if (!pool?.length) return null;
    const role = ROLE_BY_OPPORTUNITY[opportunity.role];
    const budget = fitBudget(opportunity, role);
    const start = seed % pool.length;
    let best = null;
    for (let i = 0; i < Math.min(pool.length, CATALOG_SEARCH_DEPTH); i++) {
        const def = pool[(start + i * 17) % pool.length];
        const scale = fitScale(def, budget);
        if (scale < MIN_CONTEXT_PROP_SCALE) continue;
        const novelty = usedAssetIds?.has(def.id) ? -5 : 0;
        const visualImpact = exteriorAssetVisualImpact(def, scale, budget, role);
        const candidate = { def, scale, visualImpact, score: contextualAssetScore(def, context, role) + visualImpact + novelty, ordinal: i };
        if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.ordinal < best.ordinal)) best = candidate;
    }
    return best;
}

function contextMap(semanticContext) {
    const map = new Map();
    for (const context of semanticContext?.entities ?? []) map.set(context.id, context);
    for (const context of semanticContext?.spaces ?? []) map.set(context.id, context);
    return map;
}

function opportunityRoleCounts(semanticContext, entityId) {
    const counts = { wall: 0, ground: 0, roof: 0 };
    for (const opportunity of semanticContext?.opportunities ?? []) {
        const id = opportunity.entityId ?? opportunity.hostId ?? null;
        if (id !== entityId) continue;
        const role = ROLE_BY_OPPORTUNITY[opportunity.role];
        if (role) counts[role]++;
    }
    return counts;
}

function entityPhysicalBudget(semanticContext, entityId) {
    const surfaces = (semanticContext?.surfaces ?? []).filter(surface => surface?.entityId === entityId);
    let wallArea = 0;
    let facadeMeters = 0;
    for (const surface of surfaces) {
        const width = Math.max(0, finite(surface.half) * 2);
        const height = Math.max(0, finite(surface.yMax) - finite(surface.yMin));
        facadeMeters += width;
        wallArea += width * height;
    }
    const available = opportunityRoleCounts(semanticContext, entityId);
    const wallNatural = surfaces.length ? clamp(Math.round(wallArea / 10.5 + facadeMeters / 20), 5, 20) : clamp(available.wall, 0, 10);
    const roofNatural = clamp(Math.ceil(available.roof * 0.90), 0, 5);
    const groundNatural = clamp(Math.ceil(available.ground * 0.50), 0, 3);
    const budget = {
        wall: Math.min(available.wall, wallNatural),
        roof: Math.min(available.roof, roofNatural),
        ground: Math.min(available.ground, groundNatural),
        wallArea,
        facadeMeters,
    };
    budget.total = budget.wall + budget.roof + budget.ground;
    return budget;
}

function rankedOpportunities(chunk, semanticContext, occupied) {
    const grouped = new Map();
    for (const opportunity of semanticContext?.opportunities ?? []) {
        const role = ROLE_BY_OPPORTUNITY[opportunity?.role];
        if (!role || opportunity?.decorationMayIntrude === false || opportunity?.spectacleReserved === true || occupied.has(opportunity.id)) continue;
        if (!Number.isFinite(opportunity?.transform?.x) || !Number.isFinite(opportunity?.transform?.y) || !Number.isFinite(opportunity?.transform?.z)) continue;
        const entityId = opportunity.entityId ?? opportunity.hostId ?? '__world__';
        const entry = {
            opportunity,
            entityId,
            role,
            priority: EXTERIOR_OPPORTUNITY_PRIORITY[opportunity.role] ?? 9,
            rank: hash32(`${chunk?.key ?? 'world'}:semantic-context-multiplier:${opportunity.id}`),
        };
        const list = grouped.get(entityId) ?? [];
        list.push(entry);
        grouped.set(entityId, list);
    }

    const queues = [...grouped.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    for (const [, queue] of queues) queue.sort((a, b) => a.priority - b.priority || a.rank - b.rank || String(a.opportunity.id).localeCompare(String(b.opportunity.id)));

    // Round-robin across entities so the visible shell gets broader before any
    // single authored site or procedural building gets to deepen. This removes
    // payload-count amplification while spectacle/identity opportunities win before micro hardware.
    const ranked = [];
    for (let layer = 0; ; layer++) {
        let emitted = 0;
        for (const [, queue] of queues) {
            if (!queue[layer]) continue;
            ranked.push(queue[layer]);
            emitted++;
        }
        if (!emitted) break;
    }
    return ranked;
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
    const entityIds = [...new Set(opportunities.map(entry => entry.entityId))];
    const budgetByEntity = new Map(entityIds.map(entityId => [entityId, entityPhysicalBudget(semanticContext, entityId)]));
    const naturalLimit = [...budgetByEntity.values()].reduce((sum, budget) => sum + budget.total, 0);
    const limit = Math.max(0, Math.floor(maxTasks ?? clamp(naturalLimit, 0, MAX_CONTEXT_TASKS)));
    const perEntityRole = new Map();
    const tasks = [];
    const usedAssetIds = new Set();
    const roleCounts = { wall: 0, ground: 0, roof: 0 };

    for (const { opportunity, entityId, role } of opportunities) {
        if (tasks.length >= limit) break;
        const pool = catalog.byRole[role];
        if (!pool?.length) continue;
        const entityBudget = budgetByEntity.get(entityId) ?? { wall: 0, ground: 0, roof: 0, total: 0 };
        const usage = perEntityRole.get(entityId) ?? { wall: 0, ground: 0, roof: 0 };
        if ((usage[role] ?? 0) >= (entityBudget[role] ?? 0)) continue;
        const context = contexts.get(opportunity.contextId) ?? null;
        const seed = hash32(`${chunk.key}:${opportunity.id}:${context?.program ?? 'mixed'}:${usage[role] ?? 0}`);
        const chosen = chooseAsset(pool, context, opportunity, seed, usedAssetIds);
        if (!chosen) continue;
        const { def, scale, visualImpact } = chosen;
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
                relationTo: opportunity.surfaceId ?? opportunity.hostId ?? null,
                instanceId,
            },
            semanticFit: { ...budget, scale, minScale: MIN_CONTEXT_PROP_SCALE, maxScale: 1 },
            contextualCosmetic: true,
        });
        usage[role] = (usage[role] ?? 0) + 1;
        perEntityRole.set(entityId, usage);
        usedAssetIds.add(def.id);
        roleCounts[role]++;
    }

    const entityBudgets = Object.fromEntries([...budgetByEntity.entries()].map(([entityId, budget]) => [entityId, budget]));
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
            naturalTaskBudget: naturalLimit,
            entityBudgets,
            minScale: MIN_CONTEXT_PROP_SCALE,
            catalogSearchDepth: CATALOG_SEARCH_DEPTH,
        },
    };
}
