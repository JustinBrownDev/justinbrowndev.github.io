export const SEMANTIC_EXTERIOR_AUTHORITY_SCHEMA = 'jweb.semantic-exterior-authority.v1';

const TASK_ROLE_PREFERENCES = Object.freeze({
    sign: ['facade-sign-zone', 'portal-lintel-zone'],
    awning: ['facade-sign-zone'],
    flyer: ['portal-flank-wall-zone', 'facade-poster-zone'],
    graffiti: ['facade-poster-zone'],
    pipe: ['facade-service-band', 'wall-mounted-prop-zone', 'portal-flank-wall-zone', 'connector-service-zone'],
    ivy: ['wall-mounted-prop-zone', 'facade-poster-zone'],
    security: ['portal-lintel-zone', 'portal-flank-wall-zone', 'wall-mounted-prop-zone'],
    'elevator-hardware': ['wall-mounted-prop-zone', 'portal-flank-wall-zone'],
    'street-fixture': ['portal-flank-ground-zone', 'ground-edge-zone', 'connector-service-zone', 'beside-door-zone'],
    'spray-cans': ['portal-flank-ground-zone', 'ground-edge-zone'],
    'roof-clutter': ['roof-utility-zone'],
    'roof-topper': ['roof-utility-zone'],
});

const EXTERIOR_TASK_KINDS = new Set(Object.keys(TASK_ROLE_PREFERENCES));

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
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

export function exteriorRolePreferences(task) {
    if (!task) return [];
    if (String(task.kind ?? '').startsWith('plaza-')) return ['ground-open-zone'];
    if (task.kind === 'overhead-cable') return ['inter-entity-service-span'];
    return TASK_ROLE_PREFERENCES[task.kind] ?? [];
}

export function requiresSemanticExteriorPlacement(task) {
    if (!task) return false;
    return EXTERIOR_TASK_KINDS.has(task.kind)
        || String(task.kind ?? '').startsWith('plaza-')
        || task.kind === 'overhead-cable';
}

function candidatePool(task, opportunities, role) {
    const entityPool = opportunities.filter(item => item?.role === role
        && item?.decorationMayIntrude !== false
        && (!task.entityId || item.entityId === task.entityId || item.hostId === task.entityId));
    if (!entityPool.length) return [];
    const sidePool = task.side ? entityPool.filter(item => item.side === task.side) : [];
    return sidePool.length ? sidePool : entityPool;
}

export function chooseSemanticExteriorOpportunity(task, opportunities, claimedOpportunityIds = null) {
    const preferences = exteriorRolePreferences(task);
    for (let preferenceIndex = 0; preferenceIndex < preferences.length; preferenceIndex++) {
        const role = preferences[preferenceIndex];
        const pool = candidatePool(task, opportunities, role);
        if (!pool.length) continue;
        const ranked = pool.map(item => ({
            item,
            rank: hash32(`${task.seed >>> 0}:${task.kind}:${role}:${item.id}`) + (claimedOpportunityIds?.has(item.id) ? 0x100000000 : 0),
        })).sort((a, b) => a.rank - b.rank || String(a.item.id).localeCompare(String(b.item.id)));
        return ranked[0].item;
    }
    return null;
}

export function bindSemanticExteriorPlacement(task, opportunity) {
    if (!task || !opportunity?.transform) return null;
    const transform = opportunity.transform;
    if (![transform.x, transform.y, transform.z].every(Number.isFinite)) return null;
    task.semanticOpportunityId = opportunity.id;
    task.semanticHostId = opportunity.surfaceId ?? opportunity.hostId ?? task.entityId ?? null;
    task.spatialTopologyHostId = opportunity.spatialTopologyHostId ?? opportunity.connectorId ?? task.semanticHostId;
    task.semanticPlacement = {
        schema: SEMANTIC_EXTERIOR_AUTHORITY_SCHEMA,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        rotY: finite(transform.rotY),
        mode: `semantic-exterior:${opportunity.role}`,
        role: opportunity.role,
        opportunityId: opportunity.id,
        hostId: task.semanticHostId,
        surfaceId: opportunity.surfaceId ?? null,
        connectorId: opportunity.connectorId ?? null,
        apertureId: opportunity.apertureId ?? null,
        reservationIds: [...(opportunity.reservationIds ?? [])],
    };
    if (opportunity.bounds) task.semanticOpportunityBounds = { ...opportunity.bounds };
    if (opportunity.region) task.semanticOpportunityRegion = { ...opportunity.region };
    if (opportunity.span) task.semanticSpan = {
        start: { ...opportunity.span.start },
        end: { ...opportunity.span.end },
    };
    return task.semanticPlacement;
}

export function semanticPlacementPoint(task) {
    const placement = task?.semanticPlacement;
    if (!placement || ![placement.x, placement.y, placement.z].every(Number.isFinite)) {
        throw new Error(`[semantic-exterior] ${task?.kind ?? 'unknown'} reached realization without authoritative placement`);
    }
    return { x: placement.x, y: placement.y, z: placement.z, ry: finite(placement.rotY) };
}

export function semanticExteriorProvenance(task) {
    const placement = task?.semanticPlacement;
    if (!placement) return null;
    return {
        schema: SEMANTIC_EXTERIOR_AUTHORITY_SCHEMA,
        opportunityId: task.semanticOpportunityId ?? placement.opportunityId ?? null,
        hostId: task.semanticHostId ?? placement.hostId ?? null,
        spatialTopologyHostId: task.spatialTopologyHostId ?? null,
        connectorId: placement.connectorId ?? null,
        apertureId: placement.apertureId ?? null,
        role: placement.role ?? null,
        mode: placement.mode ?? null,
    };
}
