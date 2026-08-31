export const SPATIAL_CLAIM_SCHEMA = 'jweb.spatial-claim.v1';
export const SPATIAL_CLAIM_AUTHORITY_SCHEMA = 'jweb.spatial-claim-authority.v1';

const EPS = 1e-5;

export const SPATIAL_CLAIM_TYPES = Object.freeze({
    CIRCULATION_CLEARANCE: 'circulation-clearance',
    PORTAL_CLEARANCE: 'portal-clearance',
    STAIR_SHAFT: 'stair-shaft',
    STAIR_LANDING: 'stair-landing',
    BRIDGE_PORTAL: 'bridge-portal',
    FACADE_APERTURE: 'facade-aperture',
    SPECTACLE_SURFACE: 'spectacle-surface',
    EXTERIOR_OPPORTUNITY: 'exterior-opportunity',
    MACRO_EQUIPMENT: 'macro-equipment',
    ROOF_EQUIPMENT: 'roof-equipment',
    SERVICE_BAND: 'service-band',
    STRUCTURAL: 'structural',
    GAMEPLAY_CLEARANCE: 'gameplay-clearance',
    AUTHORED_RESERVED_SPACE: 'authored-reserved-space',
    MICRO_CLUTTER: 'micro-clutter',
    FACADE_CLUTTER: 'facade-clutter',
});

const TYPE_DEFAULTS = Object.freeze({
    [SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE]: { priority: 950, semanticTier: 'clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.PORTAL_CLEARANCE]: { priority: 970, semanticTier: 'clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.STAIR_SHAFT]: { priority: 990, semanticTier: 'structural-clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.STAIR_LANDING]: { priority: 980, semanticTier: 'clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.BRIDGE_PORTAL]: { priority: 965, semanticTier: 'clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.FACADE_APERTURE]: { priority: 960, semanticTier: 'architectural', category: 'aperture', blocks: ['opportunity', 'spectacle', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.SPECTACLE_SURFACE]: { priority: 800, semanticTier: 'spectacle', category: 'spectacle', blocks: ['opportunity', 'decoration', 'clutter', 'equipment'] },
    [SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY]: { priority: 500, semanticTier: 'medium', category: 'opportunity', blocks: ['opportunity', 'spectacle', 'decoration', 'clutter', 'equipment'] },
    [SPATIAL_CLAIM_TYPES.MACRO_EQUIPMENT]: { priority: 650, semanticTier: 'macro', category: 'equipment', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'clearance', 'aperture'] },
    [SPATIAL_CLAIM_TYPES.ROOF_EQUIPMENT]: { priority: 640, semanticTier: 'macro', category: 'equipment', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'clearance'] },
    [SPATIAL_CLAIM_TYPES.SERVICE_BAND]: { priority: 560, semanticTier: 'medium', category: 'equipment', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'clearance', 'aperture'] },
    [SPATIAL_CLAIM_TYPES.STRUCTURAL]: { priority: 930, semanticTier: 'structural', category: 'structure', blocks: ['clearance', 'aperture', 'decoration', 'clutter', 'equipment'] },
    [SPATIAL_CLAIM_TYPES.GAMEPLAY_CLEARANCE]: { priority: 940, semanticTier: 'clearance', category: 'clearance', blocks: ['opportunity', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.AUTHORED_RESERVED_SPACE]: { priority: 1000, semanticTier: 'authored', category: 'authored', blocks: ['clearance', 'aperture', 'opportunity', 'spectacle', 'decoration', 'clutter', 'equipment', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.MICRO_CLUTTER]: { priority: 150, semanticTier: 'micro', category: 'clutter', blocks: ['clearance', 'aperture', 'spectacle', 'opportunity', 'equipment', 'clutter', 'structure', 'authored'] },
    [SPATIAL_CLAIM_TYPES.FACADE_CLUTTER]: { priority: 220, semanticTier: 'medium', category: 'decoration', blocks: ['clearance', 'aperture', 'spectacle', 'opportunity', 'equipment', 'decoration', 'structure', 'authored'] },
});

const SEMANTIC_TIER_RANK = Object.freeze({
    authored: 100,
    structural: 95,
    'structural-clearance': 92,
    clearance: 90,
    architectural: 85,
    spectacle: 80,
    identity: 70,
    macro: 60,
    medium: 40,
    micro: 20,
    advisory: 0,
});

function finite(name, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`spatial claim requires finite ${name}`);
    return number;
}

function normalizeOwner(owner) {
    if (typeof owner === 'string' && owner) return { system: 'unknown', id: owner };
    if (!owner?.id) throw new Error('spatial claim requires owner.id');
    return {
        system: String(owner.system ?? 'unknown'),
        id: String(owner.id),
        ...(owner.scopeId != null ? { scopeId: String(owner.scopeId) } : {}),
    };
}

function ownerKey(owner) {
    return `${owner.system}:${owner.id}:${owner.scopeId ?? ''}`;
}

function normalizedBox3(geometry, strict = true) {
    const x = Number.isFinite(geometry.x) ? Number(geometry.x) : null;
    const y = Number.isFinite(geometry.y) ? Number(geometry.y) : null;
    const z = Number.isFinite(geometry.z) ? Number(geometry.z) : null;
    const halfX = Number.isFinite(geometry.halfX) ? Math.max(0, Number(geometry.halfX)) : null;
    const halfY = Number.isFinite(geometry.halfY) ? Math.max(0, Number(geometry.halfY)) : null;
    const halfZ = Number.isFinite(geometry.halfZ) ? Math.max(0, Number(geometry.halfZ)) : null;
    const minX = Number.isFinite(geometry.minX) ? Number(geometry.minX) : x != null && halfX != null ? x - halfX : NaN;
    const maxX = Number.isFinite(geometry.maxX) ? Number(geometry.maxX) : x != null && halfX != null ? x + halfX : NaN;
    const minY = Number.isFinite(geometry.minY) ? Number(geometry.minY) : Number.isFinite(geometry.yMin) ? Number(geometry.yMin) : y != null && halfY != null ? y - halfY : strict ? NaN : -Infinity;
    const maxY = Number.isFinite(geometry.maxY) ? Number(geometry.maxY) : Number.isFinite(geometry.yMax) ? Number(geometry.yMax) : y != null && halfY != null ? y + halfY : strict ? NaN : Infinity;
    const minZ = Number.isFinite(geometry.minZ) ? Number(geometry.minZ) : z != null && halfZ != null ? z - halfZ : NaN;
    const maxZ = Number.isFinite(geometry.maxZ) ? Number(geometry.maxZ) : z != null && halfZ != null ? z + halfZ : NaN;
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)
        || (strict && ![minY, maxY].every(Number.isFinite))
        || !(maxX > minX) || !(maxY > minY) || !(maxZ > minZ)) {
        throw new Error('spatial box3 geometry requires positive ordered bounds');
    }
    return { kind: 'box3', minX, maxX, minY, maxY, minZ, maxZ };
}

function normalizedCylinder3(geometry, strict = true) {
    const x = finite('cylinder.x', geometry.x);
    const z = finite('cylinder.z', geometry.z);
    const radius = finite('cylinder.radius', geometry.radius);
    const minY = Number.isFinite(geometry.minY) ? Number(geometry.minY) : Number.isFinite(geometry.yMin) ? Number(geometry.yMin) : strict ? NaN : -Infinity;
    const maxY = Number.isFinite(geometry.maxY) ? Number(geometry.maxY) : Number.isFinite(geometry.yMax) ? Number(geometry.yMax) : strict ? NaN : Infinity;
    if (!(radius > 0) || (strict && ![minY, maxY].every(Number.isFinite)) || !(maxY > minY)) {
        throw new Error('spatial cylinder3 geometry requires positive radius and ordered height');
    }
    return { kind: 'cylinder3', x, z, radius, minY, maxY };
}

function normalizeGeometry(geometry, strict = true) {
    if (!geometry?.kind) throw new Error('spatial claim requires typed geometry');
    if (geometry.kind === 'box3') return normalizedBox3(geometry, strict);
    if (geometry.kind === 'cylinder3') return normalizedCylinder3(geometry, strict);
    if (geometry.kind === 'surface-ref') {
        if (!geometry.surfaceId) throw new Error('surface-ref geometry requires surfaceId');
        return { kind: 'surface-ref', surfaceId: String(geometry.surfaceId) };
    }
    if (geometry.kind === 'surface-region') {
        if (!geometry.surfaceId) throw new Error('surface-region geometry requires surfaceId');
        const uMin = finite('surface-region.uMin', geometry.uMin);
        const uMax = finite('surface-region.uMax', geometry.uMax);
        const vMin = finite('surface-region.vMin', geometry.vMin);
        const vMax = finite('surface-region.vMax', geometry.vMax);
        if (!(uMax > uMin) || !(vMax > vMin)) throw new Error('surface-region geometry requires positive ordered local bounds');
        return { kind: 'surface-region', surfaceId: String(geometry.surfaceId), uMin, uMax, vMin, vMax };
    }
    if (geometry.kind === 'opportunity-ref') {
        if (!geometry.opportunityId) throw new Error('opportunity-ref geometry requires opportunityId');
        return {
            kind: 'opportunity-ref',
            opportunityId: String(geometry.opportunityId),
            ...(geometry.surfaceId != null ? { surfaceId: String(geometry.surfaceId) } : {}),
        };
    }
    if (geometry.kind === 'compound') {
        const parts = (geometry.parts ?? []).map(part => normalizeGeometry(part, strict));
        if (!parts.length) throw new Error('compound spatial geometry requires at least one part');
        return { kind: 'compound', parts };
    }
    throw new Error(`unsupported spatial claim geometry kind: ${geometry.kind}`);
}

export function spatialBoxGeometry(box) {
    return normalizeGeometry({ kind: 'box3', ...box }, false);
}

export function spatialCylinderGeometry(cylinder) {
    return normalizeGeometry({ kind: 'cylinder3', ...cylinder }, false);
}

function defaultConflictPolicy(claimType) {
    const defaults = TYPE_DEFAULTS[claimType] ?? { category: 'authored', blocks: ['authored'], semanticTier: 'medium', priority: 300 };
    return {
        mode: 'selective',
        category: defaults.category,
        blocks: [...defaults.blocks],
        compatible: [],
    };
}

function normalizeConflictPolicy(claimType, policy) {
    const base = defaultConflictPolicy(claimType);
    if (typeof policy === 'string') return { ...base, mode: policy };
    const merged = { ...base, ...(policy ?? {}) };
    return {
        mode: String(merged.mode ?? 'selective'),
        category: String(merged.category ?? base.category),
        blocks: [...new Set((merged.blocks ?? base.blocks).map(String))],
        compatible: [...new Set((merged.compatible ?? []).map(String))],
    };
}

export function createSpatialClaim({
    id,
    owner,
    geometry,
    claimType,
    priority = null,
    semanticTier = null,
    conflictPolicy = null,
    lifetime = null,
    provenance = null,
    metadata = null,
} = {}) {
    if (!id || !claimType) throw new Error('spatial claim requires id and claimType');
    const defaults = TYPE_DEFAULTS[claimType] ?? {};
    const normalizedLifetime = typeof lifetime === 'string'
        ? { kind: lifetime }
        : { kind: String(lifetime?.kind ?? 'plan'), ...(lifetime?.scopeId != null ? { scopeId: String(lifetime.scopeId) } : {}) };
    return {
        schema: SPATIAL_CLAIM_SCHEMA,
        id: String(id),
        owner: normalizeOwner(owner),
        claimType: String(claimType),
        geometry: normalizeGeometry(geometry, true),
        priority: Number.isFinite(priority) ? Number(priority) : Number(defaults.priority ?? 300),
        semanticTier: String(semanticTier ?? defaults.semanticTier ?? 'medium'),
        conflictPolicy: normalizeConflictPolicy(claimType, conflictPolicy),
        lifetime: normalizedLifetime,
        provenance: provenance ? { ...provenance } : null,
        metadata: metadata ? { ...metadata } : null,
    };
}

function partsOf(geometry) {
    return geometry?.kind === 'compound' ? geometry.parts.flatMap(partsOf) : geometry ? [geometry] : [];
}

function verticalOverlap(a0, a1, b0, b1, padding = 0, epsilon = EPS) {
    return a0 - padding < b1 - epsilon && a1 + padding > b0 + epsilon;
}

function boxBox(a, b, padding, epsilon, verticalPadding = padding) {
    return verticalOverlap(a.minY, a.maxY, b.minY, b.maxY, verticalPadding, epsilon)
        && a.minX - padding < b.maxX - epsilon && a.maxX + padding > b.minX + epsilon
        && a.minZ - padding < b.maxZ - epsilon && a.maxZ + padding > b.minZ + epsilon;
}

function boxCylinder(box, cylinder, padding, epsilon, verticalPadding = padding) {
    if (!verticalOverlap(box.minY, box.maxY, cylinder.minY, cylinder.maxY, verticalPadding, epsilon)) return false;
    const nearestX = Math.max(box.minX - padding, Math.min(cylinder.x, box.maxX + padding));
    const nearestZ = Math.max(box.minZ - padding, Math.min(cylinder.z, box.maxZ + padding));
    const dx = cylinder.x - nearestX;
    const dz = cylinder.z - nearestZ;
    const radius = cylinder.radius + padding;
    return dx * dx + dz * dz < radius * radius - epsilon;
}

function cylinderCylinder(a, b, padding, epsilon, verticalPadding = padding) {
    if (!verticalOverlap(a.minY, a.maxY, b.minY, b.maxY, verticalPadding, epsilon)) return false;
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    const radius = a.radius + b.radius + padding;
    return dx * dx + dz * dz < radius * radius - epsilon;
}

function primitiveIntersects(a, b, padding = 0, epsilon = EPS, verticalPadding = padding) {
    if (a.kind === 'box3' && b.kind === 'box3') return boxBox(a, b, padding, epsilon, verticalPadding);
    if (a.kind === 'box3' && b.kind === 'cylinder3') return boxCylinder(a, b, padding, epsilon, verticalPadding);
    if (a.kind === 'cylinder3' && b.kind === 'box3') return boxCylinder(b, a, padding, epsilon, verticalPadding);
    if (a.kind === 'cylinder3' && b.kind === 'cylinder3') return cylinderCylinder(a, b, padding, epsilon, verticalPadding);
    if (a.kind === 'surface-ref' && b.kind === 'surface-ref') return a.surfaceId === b.surfaceId;
    if (a.kind === 'surface-ref' && b.kind === 'surface-region') return a.surfaceId === b.surfaceId;
    if (a.kind === 'surface-region' && b.kind === 'surface-ref') return a.surfaceId === b.surfaceId;
    if (a.kind === 'surface-region' && b.kind === 'surface-region') {
        return a.surfaceId === b.surfaceId
            && a.uMin < b.uMax - epsilon && a.uMax > b.uMin + epsilon
            && a.vMin < b.vMax - epsilon && a.vMax > b.vMin + epsilon;
    }
    if (a.kind === 'surface-ref' && b.kind === 'opportunity-ref') return !!b.surfaceId && a.surfaceId === b.surfaceId;
    if (a.kind === 'opportunity-ref' && b.kind === 'surface-ref') return !!a.surfaceId && a.surfaceId === b.surfaceId;
    if (a.kind === 'opportunity-ref' && b.kind === 'opportunity-ref') return a.opportunityId === b.opportunityId;
    return false;
}

export function spatialGeometryIntersects(a, b, { padding = 0, epsilon = EPS, verticalPadding = padding } = {}) {
    if (!a || !b) return false;
    const left = partsOf(a);
    const right = partsOf(b);
    for (const x of left) for (const y of right) if (primitiveIntersects(x, y, padding, epsilon, verticalPadding)) return true;
    return false;
}

function policyBlocks(policy, other) {
    if (policy.mode === 'advisory') return false;
    if (policy.compatible.includes(other.category)) return false;
    if (policy.mode === 'exclusive') return true;
    return policy.blocks.includes('*') || policy.blocks.includes(other.category);
}

export function compareSpatialClaimAuthority(a, b) {
    const priority = Number(b?.priority ?? 0) - Number(a?.priority ?? 0);
    if (priority) return priority;
    const tier = (SEMANTIC_TIER_RANK[b?.semanticTier] ?? 0) - (SEMANTIC_TIER_RANK[a?.semanticTier] ?? 0);
    if (tier) return tier;
    const owner = ownerKey(a.owner).localeCompare(ownerKey(b.owner));
    if (owner) return owner;
    return String(a.id).localeCompare(String(b.id));
}

export function evaluateSpatialClaimPair(a, b) {
    if (!a || !b) throw new Error('spatial claim pair evaluation requires two claims');
    if (a.id === b.id) return { compatible: true, overlap: true, winner: a.id, loser: null, reason: 'same-claim' };
    const overlap = spatialGeometryIntersects(a.geometry, b.geometry);
    if (!overlap) return { compatible: true, overlap: false, winner: null, loser: null, reason: 'disjoint' };
    const blocked = policyBlocks(a.conflictPolicy, b.conflictPolicy) || policyBlocks(b.conflictPolicy, a.conflictPolicy);
    if (!blocked) return { compatible: true, overlap: true, winner: null, loser: null, reason: 'policy-compatible' };
    const order = compareSpatialClaimAuthority(a, b);
    const winner = order <= 0 ? a : b;
    const loser = winner === a ? b : a;
    return {
        compatible: false,
        overlap: true,
        winner: winner.id,
        loser: loser.id,
        reason: `${winner.claimType}-over-${loser.claimType}`,
    };
}

export function resolveSpatialClaims(claims = []) {
    const normalized = [...claims];
    const ids = new Set();
    for (const claim of normalized) {
        if (claim?.schema !== SPATIAL_CLAIM_SCHEMA) throw new Error('resolveSpatialClaims requires normalized spatial claims');
        if (ids.has(claim.id)) throw new Error(`duplicate spatial claim id: ${claim.id}`);
        ids.add(claim.id);
    }
    normalized.sort(compareSpatialClaimAuthority);
    const accepted = [];
    const rejected = [];
    for (const claim of normalized) {
        let blocker = null;
        let decision = null;
        for (const existing of accepted) {
            const pair = evaluateSpatialClaimPair(existing, claim);
            if (!pair.compatible && pair.winner === existing.id) {
                blocker = existing;
                decision = pair;
                break;
            }
        }
        if (blocker) rejected.push({ claim, blocker, decision });
        else accepted.push(claim);
    }
    return { schema: SPATIAL_CLAIM_AUTHORITY_SCHEMA, accepted, rejected };
}

export class SpatialClaimAuthority {
    constructor(claims = []) {
        this.schema = SPATIAL_CLAIM_AUTHORITY_SCHEMA;
        this._claims = new Map();
        if (claims.length) this.replace(claims);
    }

    replace(claims = []) {
        const resolved = resolveSpatialClaims(claims);
        this._claims = new Map(resolved.accepted.map(claim => [claim.id, claim]));
        return resolved;
    }

    resolveWith(claim) {
        return resolveSpatialClaims([...this._claims.values(), claim]);
    }

    canClaim(claim) {
        const resolved = this.resolveWith(claim);
        return resolved.accepted.some(item => item.id === claim.id)
            && [...this._claims.keys()].every(id => resolved.accepted.some(item => item.id === id));
    }

    claim(claim) {
        const resolved = this.resolveWith(claim);
        const acceptedIds = new Set(resolved.accepted.map(item => item.id));
        if (!acceptedIds.has(claim.id)) {
            const rejected = resolved.rejected.find(item => item.claim.id === claim.id) ?? null;
            return { accepted: false, displaced: [], rejected };
        }
        const displaced = [...this._claims.keys()].filter(id => !acceptedIds.has(id));
        this._claims = new Map(resolved.accepted.map(item => [item.id, item]));
        return { accepted: true, displaced, rejected: null };
    }

    remove(id) { return this._claims.delete(String(id)); }

    releaseScope(scopeId) {
        const target = String(scopeId);
        let removed = 0;
        for (const [id, claim] of this._claims) {
            if (claim.lifetime?.scopeId === target || claim.owner?.scopeId === target) {
                this._claims.delete(id);
                removed++;
            }
        }
        return removed;
    }

    releaseLifetime(kind) {
        const target = String(kind);
        let removed = 0;
        for (const [id, claim] of this._claims) {
            if (claim.lifetime?.kind === target) {
                this._claims.delete(id);
                removed++;
            }
        }
        return removed;
    }

    claims() { return [...this._claims.values()].sort(compareSpatialClaimAuthority); }
    has(id) { return this._claims.has(String(id)); }
    get size() { return this._claims.size; }
}

function circulationClaimType(kind) {
    const value = String(kind ?? '').toLowerCase();
    if (value === 'stair-shaft') return SPATIAL_CLAIM_TYPES.STAIR_SHAFT;
    if (value.includes('landing')) return SPATIAL_CLAIM_TYPES.STAIR_LANDING;
    if (value.includes('portal')) return SPATIAL_CLAIM_TYPES.PORTAL_CLEARANCE;
    if (value.includes('bridge')) return SPATIAL_CLAIM_TYPES.BRIDGE_PORTAL;
    if (value.includes('circulation-clearance')) return SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE;
    if (value.includes('scaffold') || value.includes('ramp') || value.includes('corridor')) return SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE;
    return SPATIAL_CLAIM_TYPES.GAMEPLAY_CLEARANCE;
}

export function spatialClaimFromCirculationReservation(reservation, overrides = {}) {
    if (reservation?.spatialClaim?.schema === SPATIAL_CLAIM_SCHEMA) return reservation.spatialClaim;
    if (!reservation?.id) throw new Error('circulation reservation adapter requires id');
    const claimType = overrides.claimType ?? circulationClaimType(reservation.kind);
    return createSpatialClaim({
        id: overrides.id ?? `spatial:${reservation.id}`,
        owner: overrides.owner ?? {
            system: 'building-plan-circulation',
            id: String(reservation.connectorId ?? reservation.source ?? reservation.id),
            ...(overrides.scopeId != null ? { scopeId: String(overrides.scopeId) } : {}),
        },
        claimType,
        geometry: {
            kind: 'box3',
            x: reservation.x,
            z: reservation.z,
            halfX: Number.isFinite(reservation.halfX) ? reservation.halfX : Number(reservation.sx) * 0.5,
            halfZ: Number.isFinite(reservation.halfZ) ? reservation.halfZ : Number(reservation.sz) * 0.5,
            minY: reservation.yMin,
            maxY: reservation.yMax,
            ...(Number.isFinite(reservation.minX) ? { minX: reservation.minX } : {}),
            ...(Number.isFinite(reservation.maxX) ? { maxX: reservation.maxX } : {}),
            ...(Number.isFinite(reservation.minZ) ? { minZ: reservation.minZ } : {}),
            ...(Number.isFinite(reservation.maxZ) ? { maxZ: reservation.maxZ } : {}),
        },
        priority: overrides.priority,
        semanticTier: overrides.semanticTier,
        conflictPolicy: overrides.conflictPolicy,
        lifetime: overrides.lifetime ?? { kind: 'chunk', ...(overrides.scopeId != null ? { scopeId: String(overrides.scopeId) } : {}) },
        provenance: overrides.provenance ?? {
            sourceSystem: 'circulation-reservations',
            sourceId: reservation.id,
            legacyKind: reservation.kind ?? null,
            legacySource: reservation.source ?? null,
        },
        metadata: overrides.metadata,
    });
}

export function firstSpatialBox(geometry) {
    return partsOf(geometry).find(part => part.kind === 'box3') ?? null;
}

export function attachSpatialClaimToReservation(reservation, claim) {
    if (!reservation || typeof reservation !== 'object') throw new Error('spatial claim attachment requires reservation object');
    if (claim?.schema !== SPATIAL_CLAIM_SCHEMA) throw new Error('spatial claim attachment requires canonical claim');
    Object.defineProperties(reservation, {
        spatialClaimId: { value: claim.id, enumerable: false },
        spatialClaimSchema: { value: claim.schema, enumerable: false },
        spatialClaim: { value: claim, enumerable: false },
    });
    return reservation;
}

export function circulationReservationFromSpatialClaim(claim, legacy = {}) {
    if (claim?.schema !== SPATIAL_CLAIM_SCHEMA) throw new Error('circulation adapter requires spatial claim');
    const box = firstSpatialBox(claim.geometry);
    if (!box) throw new Error('circulation reservation projection requires box3 claim geometry');
    const x = Number.isFinite(legacy.x) ? legacy.x : (box.minX + box.maxX) * 0.5;
    const z = Number.isFinite(legacy.z) ? legacy.z : (box.minZ + box.maxZ) * 0.5;
    const reservation = {
        ...legacy,
        id: String(legacy.id ?? claim.provenance?.sourceId ?? claim.id),
        kind: String(legacy.kind ?? claim.provenance?.legacyKind ?? claim.claimType),
        x,
        z,
        halfX: Number.isFinite(legacy.halfX) ? legacy.halfX : (box.maxX - box.minX) * 0.5,
        halfZ: Number.isFinite(legacy.halfZ) ? legacy.halfZ : (box.maxZ - box.minZ) * 0.5,
        yMin: Number.isFinite(legacy.yMin) ? legacy.yMin : box.minY,
        yMax: Number.isFinite(legacy.yMax) ? legacy.yMax : box.maxY,
        minX: Number.isFinite(legacy.minX) ? legacy.minX : box.minX,
        maxX: Number.isFinite(legacy.maxX) ? legacy.maxX : box.maxX,
        minZ: Number.isFinite(legacy.minZ) ? legacy.minZ : box.minZ,
        maxZ: Number.isFinite(legacy.maxZ) ? legacy.maxZ : box.maxZ,
        source: legacy.source ?? claim.provenance?.legacySource ?? null,
    };
    // Keep the compatibility object's claim metadata non-enumerable so older
    // spread/serialization consumers retain their familiar outward shape.
    return attachSpatialClaimToReservation(reservation, claim);
}

export function spatialReferenceParts(claimOrGeometry) {
    const geometry = claimOrGeometry?.geometry ?? claimOrGeometry;
    return partsOf(geometry).filter(part => part.kind === 'surface-ref' || part.kind === 'surface-region' || part.kind === 'opportunity-ref');
}

export function spatialClaimFromFacadeAperture(aperture, overrides = {}) {
    if (!aperture?.id || !aperture?.surfaceId) throw new Error('facade aperture adapter requires id and surfaceId');
    return createSpatialClaim({
        id: overrides.id ?? `spatial:${aperture.id}`,
        owner: overrides.owner ?? {
            system: 'semantic-context',
            id: String(aperture.connectorId ?? aperture.id),
            ...(overrides.scopeId != null ? { scopeId: String(overrides.scopeId) } : {}),
        },
        claimType: SPATIAL_CLAIM_TYPES.FACADE_APERTURE,
        geometry: {
            kind: 'surface-region',
            surfaceId: aperture.surfaceId,
            uMin: aperture.uMin, uMax: aperture.uMax,
            vMin: aperture.vMin, vMax: aperture.vMax,
        },
        priority: overrides.priority,
        semanticTier: overrides.semanticTier,
        conflictPolicy: overrides.conflictPolicy,
        lifetime: overrides.lifetime ?? { kind: 'context', ...(overrides.scopeId != null ? { scopeId: String(overrides.scopeId) } : {}) },
        provenance: overrides.provenance ?? {
            sourceSystem: 'semantic-context',
            sourceId: aperture.id,
            connectorId: aperture.connectorId ?? null,
        },
        metadata: overrides.metadata ?? { clearanceReservationIds: [...(aperture.clearance ?? [])] },
    });
}

export function legacyExteriorReservationsFromSpatialClaim(claim, { planId = null, entityId = null, requestTier = null, source = null, idPrefix = null } = {}) {
    if (claim?.schema !== SPATIAL_CLAIM_SCHEMA) throw new Error('exterior reservation adapter requires spatial claim');
    const refs = spatialReferenceParts(claim);
    const prefix = idPrefix ?? `${planId ?? claim.owner.id}:reservation`;
    return refs.map((ref, index) => ({
        id: `${prefix}:${index}`,
        planId: planId ?? claim.owner.id,
        entityId,
        requestTier: requestTier ?? claim.semanticTier,
        scope: ref.kind === 'opportunity-ref' ? 'opportunity' : 'surface',
        surfaceId: ref.surfaceId ?? null,
        opportunityId: ref.kind === 'opportunity-ref' ? ref.opportunityId : claim.metadata?.opportunityId ?? null,
        source,
        spatialClaimId: claim.id,
        spatialClaimSchema: claim.schema,
    }));
}
