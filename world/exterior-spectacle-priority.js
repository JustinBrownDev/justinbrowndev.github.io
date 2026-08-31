// Shared exterior refinement law.
//
// Deterministic planning decides what exists. Runtime refinement decides what
// the player sees next. The visual order is intentionally coarse-to-fine:
// near -> spectacle -> identity -> macro infrastructure -> medium -> micro.

export const EXTERIOR_VISUAL_TIER = Object.freeze({
    spectacle: 0,
    identity: 1,
    macro: 2,
    medium: 3,
    micro: 4,
});

export const EXTERIOR_OPPORTUNITY_PRIORITY = Object.freeze({
    'corner-media-band': 0,
    'facade-spectacle-span': 0,
    'roof-spectacle-envelope': 0,
    'facade-sign-zone': 1,
    'roof-utility-zone': 2,
    'facade-service-band': 3,
    'portal-lintel-zone': 3,
    'portal-flank-wall-zone': 4,
    'wall-mounted-prop-zone': 5,
    'portal-flank-ground-zone': 5,
    'connector-service-zone': 5,
    'ground-open-zone': 6,
    'beside-door-zone': 6,
    'ground-edge-zone': 7,
    'facade-poster-zone': 8,
});

export const EXTERIOR_TASK_KIND_PRIORITY = Object.freeze({
    'roof-topper': 0,
    sign: 0,
    awning: 1,
    'roof-clutter': 1,
    pipe: 1,
    'elevator-hardware': 2,
    'street-fixture': 2,
    'overhead-cable': 2,
    security: 3,
    ivy: 3,
    'semantic-identity': 3,
    'semantic-functional': 4,
    'interior-prop': 4,
    'spray-cans': 5,
    graffiti: 5,
    flyer: 6,
    'semantic-life': 6,
});

export const EXTERIOR_FIRST_PASS_KIND_ORDER = Object.freeze([
    'roof-topper', 'sign', 'awning', 'roof-clutter', 'pipe', 'elevator-hardware',
    'street-fixture', 'security', 'ivy', 'graffiti', 'spray-cans', 'flyer',
]);

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

function dimensions(def = {}) {
    const raw = Array.isArray(def.dimensionsXYZ) ? def.dimensionsXYZ : [0.6, 0.8, 0.6];
    return [
        Math.max(0.04, finite(raw[0], 0.6)),
        Math.max(0.04, finite(raw[1], 0.8)),
        Math.max(0.04, finite(raw[2], 0.6)),
    ];
}

export function exteriorOpportunityVisualTier(role) {
    if (role === 'corner-media-band' || role === 'facade-spectacle-span' || role === 'roof-spectacle-envelope') return 'spectacle';
    if (role === 'facade-sign-zone' || role === 'roof-utility-zone') return 'identity';
    if (role === 'facade-service-band') return 'macro';
    if (role === 'portal-lintel-zone' || role === 'portal-flank-wall-zone' || role === 'wall-mounted-prop-zone') return 'medium';
    return 'micro';
}

export function exteriorAssetVisualImpact(def, scale = 1, budget = {}, role = 'wall') {
    const [width, height, depth] = dimensions(def);
    const retained = clamp(finite(scale, 1), 0, 1);
    const realizedArea = role === 'roof'
        ? width * depth * retained * retained
        : width * height * retained * retained;
    const hostArea = role === 'roof'
        ? Math.max(0.01, finite(budget.width, width) * finite(budget.depth, depth))
        : Math.max(0.01, finite(budget.width, width) * finite(budget.height, height));
    const hostShare = clamp(realizedArea / hostArea, 0, 1.5);
    const base = Math.log1p(realizedArea) * 4 + retained * 3 + hostShare * 2;
    // Large catalog objects should stay large. Once an asset must shrink below
    // roughly half native scale, its spectacle value collapses quickly instead
    // of letting a billboard win a camera-sized slot as a toy miniature.
    const retentionPenalty = retained < 0.55 ? Math.pow(retained / 0.55, 2) : 1;
    return base * retentionPenalty;
}

export function exteriorPlacementVisualImpact(placement = {}) {
    const sx = Math.max(0.04, finite(placement.sx, 0.04));
    const sy = Math.max(0.04, finite(placement.sy, 0.04));
    const sz = Math.max(0.04, finite(placement.sz, 0.04));
    const tier = exteriorOpportunityVisualTier(placement.role);
    const faceArea = Math.max(sx * sy, sx * sz, sy * sz);
    const tierBonus = tier === 'spectacle' ? 12 : tier === 'identity' ? 6 : tier === 'macro' ? 3 : tier === 'medium' ? 1 : 0;
    return faceArea + tierBonus;
}

export function exteriorTaskVisualImpact(task = {}) {
    if (Number.isFinite(task.semanticVisualImpact)) return task.semanticVisualImpact;
    if (Number.isFinite(task.exteriorVisualImpact)) return task.exteriorVisualImpact;
    switch (task.kind) {
        case 'roof-topper': return 9;
        case 'sign': return Math.max(1, finite(task.width, 1) * finite(task.height, 1));
        case 'awning': return Math.max(1, finite(task.width, 1) * finite(task.depth, 0.8));
        case 'roof-clutter': return 4.5;
        case 'pipe': return Math.max(1, finite(task.height, 2) * 0.55);
        case 'elevator-hardware': return 3.6;
        case 'overhead-cable': return 3.2;
        case 'street-fixture': return 2.4;
        case 'security': return 1.6;
        case 'ivy': return 1.4;
        case 'graffiti': return Math.max(0.4, finite(task.width, 1) * finite(task.height, 0.5) * 0.35);
        case 'flyer': return 0.25;
        case 'spray-cans': return 0.18;
        default: return 1;
    }
}

export function exteriorTaskVisualTier(task = {}) {
    if (task.exteriorVisualTier && EXTERIOR_VISUAL_TIER[task.exteriorVisualTier] !== undefined) return task.exteriorVisualTier;
    if (task.semanticOpportunityRole) return exteriorOpportunityVisualTier(task.semanticOpportunityRole);
    if (task.semanticContextRole === 'roof') return 'identity';
    if (task.kind === 'roof-topper' || task.kind === 'sign') return 'identity';
    if (task.kind === 'awning' || task.kind === 'roof-clutter' || task.kind === 'pipe' || task.kind === 'overhead-cable') return 'macro';
    if (task.kind === 'elevator-hardware' || task.kind === 'street-fixture' || task.kind === 'security' || task.kind === 'ivy') return 'medium';
    if (task.kind === 'graffiti' || task.kind === 'flyer' || task.kind === 'spray-cans') return 'micro';
    return 'medium';
}

export function exteriorTaskPriorityKey(task, { playerPosition = null, taskPosition = null, firstPassIncomplete = false } = {}) {
    const position = taskPosition ?? task.semanticPlacement ?? task.transform ?? null;
    const hasPlayer = Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.z);
    const hasTask = Number.isFinite(position?.x) && Number.isFinite(position?.z);
    const distance = hasPlayer && hasTask
        ? Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z)
        : 0;
    // Six-meter bands make proximity lexicographically stronger without letting a
    // one-centimeter difference beat a skyline-sized object in the same street pocket.
    const distanceBand = Math.floor(distance / 6);
    const tier = exteriorTaskVisualTier(task);
    return [
        firstPassIncomplete ? (task.firstPassBundle ? 0 : 1) : 0,
        distanceBand,
        EXTERIOR_VISUAL_TIER[tier] ?? EXTERIOR_VISUAL_TIER.medium,
        -exteriorTaskVisualImpact(task),
        distance,
        String(task.entityId ?? ''),
        String(task.kind ?? ''),
        finite(task.seed, 0) >>> 0,
    ];
}

export function compareExteriorPriorityKeys(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
        const av = a[i];
        const bv = b[i];
        if (av === bv) continue;
        if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
        return finite(av) - finite(bv);
    }
    return 0;
}
