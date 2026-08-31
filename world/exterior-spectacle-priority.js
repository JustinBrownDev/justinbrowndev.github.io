// Shared exterior refinement law.
//
// Deterministic planning decides what exists. Runtime refinement decides what
// the player sees next. The visual order is intentionally coarse-to-fine:
// near neighborhood -> coverage wave -> local proximity -> visual mass.

export const EXTERIOR_VISUAL_TIER = Object.freeze({
    spectacle: 0,
    identity: 1,
    macro: 2,
    medium: 3,
    micro: 4,
});

// A street pocket is deliberately wider than the old six-meter scheduler band.
// Inside this radius-equivalent band, an uncovered building's meaningful coarse
// work beats trivial refinement on a neighbor. Crossing into a farther band still
// makes proximity authoritative, so distant spectacle cannot starve nearby work.
export const EXTERIOR_COVERAGE_NEIGHBORHOOD_METERS = 18;
export const EXTERIOR_LOCAL_DISTANCE_BAND_METERS = 6;

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

// Composition waves are explicit building-plan policy, not a probabilistic prop
// heuristic. Unmanaged tasks receive a conservative tier-derived wave so existing
// semantic/interior work keeps a deterministic place in the same scheduler.
export function exteriorTaskCompositionWave(task = {}) {
    const planned = Number(task?.exteriorComposition?.wave);
    if (Number.isFinite(planned)) return Math.max(0, Math.floor(planned));
    const tier = exteriorTaskVisualTier(task);
    if (tier === 'spectacle' || tier === 'identity' || tier === 'macro') return 2;
    if (tier === 'medium') return 3;
    return 4;
}

export function exteriorTaskNeighborhoodBand(distance) {
    return Math.floor(Math.max(0, finite(distance)) / EXTERIOR_COVERAGE_NEIGHBORHOOD_METERS);
}

export function exteriorTaskPriorityKey(task, { playerPosition = null, taskPosition = null, firstPassIncomplete = false } = {}) {
    const position = taskPosition ?? task.semanticPlacement ?? task.transform ?? null;
    const hasPlayer = Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.z);
    const hasTask = Number.isFinite(position?.x) && Number.isFinite(position?.z);
    const distance = hasPlayer && hasTask
        ? Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z)
        : 0;
    const neighborhoodBand = exteriorTaskNeighborhoodBand(distance);
    const localDistanceBand = Math.floor(distance / EXTERIOR_LOCAL_DISTANCE_BAND_METERS);
    const tier = exteriorTaskVisualTier(task);
    const wave = exteriorTaskCompositionWave(task);
    return [
        // Existing first-pass contract remains the strongest breadth guarantee:
        // every visible entity gets its one composition anchor before deepening.
        firstPassIncomplete ? (task.firstPassBundle ? 0 : 1) : 0,
        // Across the active street pocket, breadth of meaningful composition wins.
        neighborhoodBand,
        // Wave 0 anchor, 1 coverage floor, 2 optional coarse, 3 medium, 4 micro.
        firstPassIncomplete ? 0 : wave,
        // Once wave parity is satisfied, return to tight near-before-far ordering.
        localDistanceBand,
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
