import {
    createBoxCirculationReservation,
    createRampCirculationReservation,
    createStairShaftReservation,
} from './circulation-reservations.js';
import { spacePlanTouchesPoint, spacePlanTouchesReservation } from './space-plan.js';
import { assertStairShaftContainsFlight } from './stair-volume-contract.js';
import {
    accessPortalFromConnector,
    normalizeAccessPortalSet,
    portalCollisionOpeningWidth,
} from './access-portals.js';

export const SEMANTIC_CONNECTOR_SCHEMA = 'jweb.semantic-connector.v1';

const SIDE_VECTOR = Object.freeze({
    north: Object.freeze({ x: 0, z: -1, ry: 0 }),
    south: Object.freeze({ x: 0, z: 1, ry: Math.PI }),
    west: Object.freeze({ x: -1, z: 0, ry: Math.PI * 0.5 }),
    east: Object.freeze({ x: 1, z: 0, ry: -Math.PI * 0.5 }),
});

function finite(name, value) {
    if (!Number.isFinite(value)) throw new Error(`semantic connector requires finite ${name}`);
    return value;
}

function positive(name, value) {
    finite(name, value);
    if (!(value > 0)) throw new Error(`semantic connector requires positive ${name}`);
    return value;
}

function connectorList(physics) {
    if (!physics) throw new Error('semantic connector registration requires physics payload');
    return physics.semanticConnectors ?? (physics.semanticConnectors = []);
}

function reservationList(physics) {
    if (!physics) throw new Error('semantic connector registration requires physics payload');
    return physics.circulationReservations ?? (physics.circulationReservations = []);
}

function unresolvedPhysicalTruth(kind, values) {
    return Object.freeze({
        schema: 'jweb.physical-truth-unresolved.v1',
        kind,
        status: 'legacy-fallback-explicitly-unresolved',
        architecturalAuthority: false,
        values: Object.freeze({ ...values }),
    });
}

function physicalTruthOrFallback(physicalTruth, kind, values) {
    return physicalTruth?.schema === 'jweb.physical-truth.v1'
        ? physicalTruth
        : unresolvedPhysicalTruth(kind, values);
}

function publishConnectorAccessPortal(physics, connector, spaces = []) {
    const portals = physics.accessPortals ?? (physics.accessPortals = []);
    const raw = accessPortalFromConnector(connector, { spaces });
    const existingIndex = portals.findIndex(portal => portal?.id === raw.id);
    if (existingIndex >= 0) portals[existingIndex] = raw;
    else portals.push(raw);
    const normalized = normalizeAccessPortalSet(portals);
    physics.accessPortals = normalized;
    const portalById = new Map(normalized.map(portal => [portal.id, portal]));
    for (const structural of connectorList(physics)) structural.accessPortal = portalById.get(String(structural.id)) ?? null;
    return portalById.get(String(connector.id)) ?? null;
}

export function semanticPortalForRect({
    id,
    rect,
    side,
    floor = 0,
    floorH = null,
    width = null,
    height = null,
    depth = null,
    tangent = null,
    physicalTruth = null,
    source = 'compound-portal',
    fromSpaceId = null,
    toSpaceId = null,
    metadata = null,
} = {}) {
    if (!id || !rect || !SIDE_VECTOR[side]) throw new Error('semantic portal requires id, rect, and cardinal side');
    const resolvedWidth = positive('width', Number(width) || Number(physicalTruth?.door?.clearWidth?.realizedSI) || 1.20);
    const resolvedHeight = positive('height', Number(height) || Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.20);
    const resolvedDepth = positive('depth', Number(depth) || Number(physicalTruth?.door?.approachDepthSI) || 1.20);
    const resolvedFloorH = positive('floorH', Number(floorH) || Number(physicalTruth?.floorHeight?.realizedSI) || 3.15);
    const truth = physicalTruthOrFallback(physicalTruth, 'portal', { width: resolvedWidth, height: resolvedHeight, depth: resolvedDepth, floorH: resolvedFloorH });
    const v = SIDE_VECTOR[side];
    const y = floor * resolvedFloorH;
    const horizontal = side === 'north' || side === 'south';
    const faceCenter = horizontal ? Number(rect.cx) : Number(rect.cz);
    const faceHalf = horizontal ? Number(rect.halfX) : Number(rect.halfZ);
    const requestedTangent = tangent === null || tangent === undefined ? NaN : Number(tangent);
    const minTangent = faceCenter - faceHalf + resolvedWidth * 0.5;
    const maxTangent = faceCenter + faceHalf - resolvedWidth * 0.5;
    const resolvedTangent = Number.isFinite(requestedTangent)
        ? Math.max(minTangent, Math.min(maxTangent, requestedTangent))
        : faceCenter;
    const x = horizontal ? resolvedTangent : Number(rect.cx) + v.x * Number(rect.halfX);
    const z = horizontal ? Number(rect.cz) + v.z * Number(rect.halfZ) : resolvedTangent;
    return {
        id,
        kind: 'portal-endpoint',
        x, y, z,
        tangent: resolvedTangent,
        width: resolvedWidth, height: resolvedHeight, depth: resolvedDepth, floorH: resolvedFloorH,
        side,
        normalX: v.x,
        normalZ: v.z,
        rotY: v.ry,
        source,
        fromSpaceId,
        toSpaceId,
        ...(metadata || {}),
        physicalTruth: truth,
        dimensionAuthority: truth.architecturalAuthority === false ? 'explicit-legacy-fallback' : 'resolved-physical-truth',
    };
}

export function createPortalConnector({
    id,
    portal,
    kind = 'door',
    source = portal?.source ?? 'portal',
    visualRole = 'doorway',
    approachDepth = null,
    physicalTruth = portal?.physicalTruth ?? null,
    metadata = null,
} = {}) {
    if (!id || !portal) throw new Error('portal connector requires id and portal');
    const depth = positive('portal.depth', portal.depth);
    const width = positive('portal.width', portal.width);
    const height = positive('portal.height', portal.height);
    const truth = physicalTruthOrFallback(physicalTruth, 'portal-connector', { width, height, depth });
    const solverMinimumApproach = 0.85; // collision/interaction solver floor, not architectural authority
    const approach = Math.max(depth, Number(approachDepth) || Number(truth?.door?.approachDepthSI) || depth, solverMinimumApproach);
    const horizontal = portal.side === 'north' || portal.side === 'south';
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`,
        kind: 'portal-sweep',
        x: portal.x,
        z: portal.z,
        halfX: horizontal ? width * 0.5 : approach * 0.5,
        halfZ: horizontal ? approach * 0.5 : width * 0.5,
        yMin: portal.y,
        yMax: portal.y + height,
        source,
        metadata: { connectorId: id, side: portal.side, visualRole },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id,
        kind,
        source,
        visualRole,
        fromSpaceId: portal.fromSpaceId ?? null,
        toSpaceId: portal.toSpaceId ?? null,
        endpoints: [portal],
        aperture: { width, height, depth },
        sweep: {
            type: 'portal',
            x: portal.x, z: portal.z, y0: portal.y, y1: portal.y + height,
            width, depth: approach, side: portal.side,
        },
        reservations: [reservation],
        physicalTruth: truth,
        solverEnvelope: { minimumApproach: solverMinimumApproach, authority: 'solver-clearance-not-architecture' },
        metadata: metadata || null,
    };
}

export function createStairConnector({
    id,
    x,
    z,
    openingWidth,
    openingDepth,
    baseY = 0,
    roofY,
    exitHeadroom = null,
    rampAxis,
    rampFrom,
    rampTo,
    rampHalfWidth,
    source = 'compound-stair',
    visualRole = 'stair',
    fromSpaceId = null,
    toSpaceId = null,
    physicalTruth = null,
    stairFlight = null,
    metadata = null,
} = {}) {
    const truth = physicalTruthOrFallback(physicalTruth, 'stair', { exitHeadroom: 2.1, endpointHeight: 2.0 });
    const resolvedHeadroom = positive('exitHeadroom', Number(exitHeadroom) || Number(truth?.stair?.headroomSI) || 2.1);
    const endpointHeight = Math.max(1.6, Number(truth?.route?.headroomSI) || 2.0);
    const shaft = createStairShaftReservation({
        id: `${id}:shaft`,
        x, z, openingWidth, openingDepth, baseY, roofY, exitHeadroom: resolvedHeadroom,
        rampAxis, rampFrom, rampTo, rampHalfWidth, source,
    });
    assertStairShaftContainsFlight({
        id,
        reservation: shaft,
        axis: rampAxis,
        from: rampFrom,
        to: rampTo,
        fixedCoord: rampAxis === 'x' ? z : x,
        halfWidth: rampHalfWidth,
        y0: baseY,
        y1: roofY,
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id,
        kind: 'stair',
        source,
        visualRole,
        fromSpaceId,
        toSpaceId,
        endpoints: [
            { id: `${id}:bottom`, kind: 'portal-endpoint', x, y: baseY, z, width: openingWidth, height: endpointHeight, depth: openingDepth, side: null },
            { id: `${id}:top`, kind: 'portal-endpoint', x, y: roofY, z, width: openingWidth, height: resolvedHeadroom, depth: openingDepth, side: null },
        ],
        aperture: { width: openingWidth, height: roofY - baseY + resolvedHeadroom, depth: openingDepth },
        sweep: {
            type: 'stair', axis: rampAxis, from: rampFrom, to: rampTo,
            fixedCoord: rampAxis === 'x' ? z : x,
            halfWidth: rampHalfWidth, y0: baseY, y1: roofY,
        },
        reservations: [shaft],
        primaryReservation: shaft,
        physicalTruth: truth,
        stairFlight,
        metadata: metadata || null,
    };
}

export function createRampConnector({
    id,
    kind = 'ramp',
    reservationKind = null,
    axis,
    from,
    to,
    fixedCoord,
    halfWidth,
    y0,
    y1,
    capsuleRadius = 0.28,
    headroom = null,
    source = null,
    visualRole = 'ramp',
    fromSpaceId = null,
    toSpaceId = null,
    physicalTruth = null,
    stairFlight = null,
    metadata = null,
} = {}) {
    const truth = physicalTruthOrFallback(physicalTruth, kind, { headroom: 1.95 });
    const resolvedHeadroom = positive('headroom', Number(headroom) || Number(truth?.route?.headroomSI) || 1.95);
    const reservation = createRampCirculationReservation({
        id: `${id}:sweep`, kind: reservationKind || `${kind}-sweep`, axis, from, to, fixedCoord, halfWidth,
        y0, y1, capsuleRadius, headroom: resolvedHeadroom, source,
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind, source, visualRole,
        fromSpaceId, toSpaceId,
        endpoints: [
            axis === 'x' ? { id: `${id}:a`, x: from, y: y0, z: fixedCoord } : { id: `${id}:a`, x: fixedCoord, y: y0, z: from },
            axis === 'x' ? { id: `${id}:b`, x: to, y: y1, z: fixedCoord } : { id: `${id}:b`, x: fixedCoord, y: y1, z: to },
        ],
        sweep: { type: kind, axis, from, to, fixedCoord, halfWidth, y0, y1, headroom: resolvedHeadroom },
        reservations: [reservation],
        primaryReservation: reservation,
        physicalTruth: truth,
        stairFlight,
        solverEnvelope: { capsuleRadius, authority: 'gameplay-clearance-not-architecture' },
        metadata: metadata || null,
    };
}

export function createLandingConnector({
    id,
    x,
    z,
    halfX,
    halfZ,
    y,
    headroom = null,
    source = null,
    visualRole = 'landing',
    reservationKind = 'landing-sweep',
    fromSpaceId = null,
    toSpaceId = null,
    physicalTruth = null,
    metadata = null,
} = {}) {
    const truth = physicalTruthOrFallback(physicalTruth, 'landing', { headroom: 1.96 });
    const resolvedHeadroom = positive('headroom', Number(headroom) || Number(truth?.route?.headroomSI) || 1.96);
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`, kind: reservationKind, x, z, halfX, halfZ,
        yMin: y + 0.01, yMax: y + resolvedHeadroom, source,
        metadata: { connectorId: id, ...(metadata || {}) },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'landing', source, visualRole,
        fromSpaceId, toSpaceId,
        endpoints: [{ id: `${id}:surface`, x, y, z }],
        sweep: { type: 'landing', x, z, halfX, halfZ, y0: y, y1: y + resolvedHeadroom },
        reservations: [reservation],
        primaryReservation: reservation,
        physicalTruth: truth,
        metadata: metadata || null,
    };
}

export function createBridgeConnector({
    id,
    axis,
    from,
    to,
    fixedCoord,
    halfWidth,
    y,
    source = 'skybridge',
    visualRole = 'bridge',
    fromSpaceId = null,
    toSpaceId = null,
    physicalTruth = null,
    metadata = null,
} = {}) {
    return createRampConnector({
        id, kind: 'bridge', axis, from, to, fixedCoord, halfWidth,
        y0: y, y1: y, capsuleRadius: 0.18, headroom: null,
        source, visualRole, fromSpaceId, toSpaceId, physicalTruth, metadata,
    });
}

export function createJumpConnector({
    id,
    axis,
    from,
    to,
    fixedCoord,
    halfWidth,
    y0,
    y1,
    apexHeight = 0,
    source = 'roof-jump-crossover',
    visualRole = 'roof-crossover',
    physicalTruth = null,
    traversalEnvelope = null,
    metadata = null,
} = {}) {
    if (!id || !['x', 'z'].includes(axis)) throw new Error('jump connector requires id and x/z axis');
    const resolvedHalfWidth = positive('halfWidth', Number(halfWidth));
    const start = finite('from', Number(from));
    const end = finite('to', Number(to));
    const fixed = finite('fixedCoord', Number(fixedCoord));
    const lowerY = Math.min(finite('y0', Number(y0)), finite('y1', Number(y1)));
    const upperY = Math.max(Number(y0), Number(y1));
    const bodyHeight = Math.max(1.2, Number(traversalEnvelope?.bodyHeight) || 1.8);
    const playerRadius = Math.max(0.05, Number(traversalEnvelope?.playerRadius) || 0.22);
    const arcTop = upperY + Math.max(0, Number(apexHeight) || 0) + bodyHeight;
    const lo = Math.min(start, end), hi = Math.max(start, end);
    const center = (lo + hi) * 0.5;
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`,
        kind: 'jump-sweep',
        x: axis === 'x' ? center : fixed,
        z: axis === 'x' ? fixed : center,
        halfX: axis === 'x' ? (hi - lo) * 0.5 + playerRadius : resolvedHalfWidth + playerRadius,
        halfZ: axis === 'x' ? resolvedHalfWidth + playerRadius : (hi - lo) * 0.5 + playerRadius,
        yMin: lowerY,
        yMax: arcTop,
        source,
        metadata: { connectorId: id, visualRole, traversalAuthority: traversalEnvelope?.jump?.authority ?? null, ...(metadata || {}) },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'jump', source, visualRole,
        fromSpaceId: null, toSpaceId: null,
        endpoints: [
            axis === 'x' ? { id: `${id}:a`, x: start, y: Number(y0), z: fixed } : { id: `${id}:a`, x: fixed, y: Number(y0), z: start },
            axis === 'x' ? { id: `${id}:b`, x: end, y: Number(y1), z: fixed } : { id: `${id}:b`, x: fixed, y: Number(y1), z: end },
        ],
        sweep: { type: 'jump', axis, from: start, to: end, fixedCoord: fixed, halfWidth: resolvedHalfWidth, y0: Number(y0), y1: Number(y1), apexHeight: Math.max(0, Number(apexHeight) || 0), arcTop },
        reservations: [reservation],
        primaryReservation: reservation,
        physicalTruth: physicalTruth ?? null,
        traversalEnvelope: traversalEnvelope ?? null,
        metadata: { portalFamily: 'roof-crossover', accessible: false, spaceBindingMode: 'transport-surface-only', ...(metadata || {}) },
    };
}

export function createFireEscapeConnector({
    id,
    x,
    z,
    halfX,
    halfZ,
    baseY,
    topY,
    source = 'exterior-scaffold',
    fromSpaceId = null,
    toSpaceId = null,
    physicalTruth = null,
    metadata = null,
} = {}) {
    const truth = physicalTruthOrFallback(physicalTruth, 'fire-escape', { headroom: 1.95 });
    const resolvedHeadroom = positive('headroom', Number(truth?.route?.headroomSI) || 1.95);
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`, kind: 'fire-escape-sweep', x, z, halfX, halfZ,
        yMin: baseY, yMax: topY + resolvedHeadroom, source,
        metadata: { connectorId: id, ...(metadata || {}) },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'fire-escape', source, visualRole: 'fire-escape',
        fromSpaceId, toSpaceId,
        endpoints: [{ id: `${id}:bottom`, x, y: baseY, z }, { id: `${id}:top`, x, y: topY, z }],
        sweep: { type: 'fire-escape', x, z, halfX, halfZ, y0: baseY, y1: topY },
        reservations: [reservation],
        physicalTruth: truth,
        metadata: metadata || null,
    };
}

export function registerSemanticConnector(physics, connector, { publishReservations = true } = {}) {
    if (!connector?.id || connector.schema !== SEMANTIC_CONNECTOR_SCHEMA) throw new Error('invalid semantic connector');
    const connectors = connectorList(physics);
    const existing = connectors.find(item => item.id === connector.id);
    if (existing) {
        publishConnectorAccessPortal(physics, existing);
        connector.accessPortal = existing.accessPortal ?? null;
        return connector;
    }
    connectors.push(connector);
    if (publishReservations) {
        const reservations = reservationList(physics);
        for (const reservation of connector.reservations ?? []) {
            if (!reservations.some(existingReservation => existingReservation.id === reservation.id)) reservations.push(reservation);
        }
    }
    publishConnectorAccessPortal(physics, connector);
    return connector;
}

export function connectorOpeningWidth(connector, fallback = 0) {
    if (connector?.accessPortal) {
        const portalWidth = portalCollisionOpeningWidth(connector.accessPortal, NaN);
        if (Number.isFinite(portalWidth) && portalWidth > 0) return portalWidth;
    }
    if (connector?.id) {
        const portalWidth = portalCollisionOpeningWidth(accessPortalFromConnector(connector), NaN);
        if (Number.isFinite(portalWidth) && portalWidth > 0) return portalWidth;
    }
    const width = Number(connector?.aperture?.width);
    return Number.isFinite(width) && width > 0 ? width : fallback;
}

function endpointDistanceToPlan(point, plan) {
    const cx = (plan.bounds.minX + plan.bounds.maxX) * 0.5;
    const cz = (plan.bounds.minZ + plan.bounds.maxZ) * 0.5;
    const dy = Math.abs((Number(point.y) || 0) - plan.yBase);
    return Math.hypot(point.x - cx, point.z - cz) + dy * 0.2;
}

function bestPlanForEndpoint(point, spacePlans) {
    const candidates = spacePlans.filter(plan => spacePlanTouchesPoint(plan, point, 0.85));
    candidates.sort((a, b) => endpointDistanceToPlan(point, a) - endpointDistanceToPlan(point, b) || a.id.localeCompare(b.id));
    return candidates[0] ?? null;
}

function connectorSpaceIds(connector, spacePlans) {
    const ids = [];
    const add = id => { if (id && !ids.includes(id)) ids.push(id); };
    for (const endpoint of connector.endpoints ?? []) add(bestPlanForEndpoint(endpoint, spacePlans)?.id);
    for (const reservation of connector.reservations ?? []) {
        for (const plan of spacePlans) if (spacePlanTouchesReservation(plan, reservation)) add(plan.id);
    }
    return ids;
}

function inferredConnectorKind(reservation) {
    const kind = String(reservation?.kind ?? '').toLowerCase();
    const source = String(reservation?.source ?? '').toLowerCase();
    if (source.includes('scaffold') || kind.includes('scaffold') || kind.includes('fire-escape')) return 'fire-escape';
    if (kind.includes('landing')) return 'landing';
    if (kind.includes('bridge')) return 'bridge';
    if (kind.includes('stair')) return 'stair';
    if (kind.includes('ramp') || source.includes('mezzanine')) return 'ramp';
    return 'circulation';
}

function endpointsForReservation(reservation, connectorId) {
    if ((reservation.axis === 'x' || reservation.axis === 'z')
        && Number.isFinite(reservation.from) && Number.isFinite(reservation.to)
        && Number.isFinite(reservation.fixedCoord)) {
        return [
            reservation.axis === 'x'
                ? { id: `${connectorId}:a`, x: reservation.from, y: Number(reservation.y0) || reservation.yMin, z: reservation.fixedCoord }
                : { id: `${connectorId}:a`, x: reservation.fixedCoord, y: Number(reservation.y0) || reservation.yMin, z: reservation.from },
            reservation.axis === 'x'
                ? { id: `${connectorId}:b`, x: reservation.to, y: Number(reservation.y1) || reservation.yMin, z: reservation.fixedCoord }
                : { id: `${connectorId}:b`, x: reservation.fixedCoord, y: Number(reservation.y1) || reservation.yMin, z: reservation.to },
        ];
    }
    return [
        { id: `${connectorId}:a`, x: reservation.x, y: reservation.yMin, z: reservation.z },
        { id: `${connectorId}:b`, x: reservation.x, y: reservation.yMax, z: reservation.z },
    ];
}

function wrapOrphanReservation(reservation) {
    const id = `${reservation.id}:connector`;
    const kind = inferredConnectorKind(reservation);
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id,
        kind,
        source: reservation.source ?? 'fabric-reservation',
        visualRole: kind,
        fromSpaceId: null,
        toSpaceId: null,
        endpoints: endpointsForReservation(reservation, id),
        sweep: { type: kind, derivedFromReservationId: reservation.id },
        reservations: [reservation],
        primaryReservation: reservation,
        physicalTruth: unresolvedPhysicalTruth(kind, { derivedFromReservationId: reservation.id }),
        metadata: { derivedFromReservation: true, originalKind: reservation.kind ?? null },
    };
}

export function ensureSemanticConnectorAuthority(physics, spacePlans = []) {
    if (!physics) throw new Error('connector authority requires physics payload');
    const connectors = connectorList(physics);
    const reservations = reservationList(physics);
    const ownedReservationIds = new Set();
    for (const connector of connectors) {
        for (const reservation of connector.reservations ?? []) ownedReservationIds.add(reservation.id);
    }
    let synthesized = 0;
    for (const reservation of reservations) {
        if (ownedReservationIds.has(reservation.id) || reservation.semanticConnectorEligible === false) continue;
        const connector = wrapOrphanReservation(reservation);
        connectors.push(connector);
        ownedReservationIds.add(reservation.id);
        synthesized++;
    }

    const knownSpaceIds = new Set(spacePlans.map(plan => String(plan?.id ?? '')).filter(Boolean));
    let preservedExplicitBindings = 0;
    let inferredBindings = 0;
    let resolvedEdges = 0;
    for (const connector of connectors) {
        // Structural/BuildingPlan authorities may already know every semantic space
        // served by a connector (especially a persistent stair spanning many floors).
        // Geometric inference is allowed to discover additional bindings, but must
        // never erase an explicit middle-floor stop merely because only the stair's
        // endpoints intersect that floor's simplified geometry.
        const explicitSpaceIds = [...new Set([
            connector.fromSpaceId,
            ...(connector.spaceIds ?? []),
            connector.toSpaceId,
        ]
            .filter(Boolean)
            .map(id => String(id))
            .filter(id => knownSpaceIds.has(id)))];
        const inferredSpaceIds = connector?.metadata?.spaceBindingMode === 'transport-surface-only'
            ? []
            : connectorSpaceIds(connector, spacePlans);
        const spaceIds = [...explicitSpaceIds];
        for (const id of inferredSpaceIds) if (!spaceIds.includes(id)) spaceIds.push(id);
        preservedExplicitBindings += explicitSpaceIds.length;
        inferredBindings += inferredSpaceIds.filter(id => !explicitSpaceIds.includes(id)).length;
        connector.spaceIds = spaceIds;
        if (!connector.fromSpaceId && spaceIds[0]) connector.fromSpaceId = spaceIds[0];
        if (!connector.toSpaceId && spaceIds[1]) connector.toSpaceId = spaceIds[1];
        for (const reservation of connector.reservations ?? []) {
            reservation.connectorId = connector.id;
        }
        if (connector.fromSpaceId && connector.toSpaceId) resolvedEdges++;
    }

    const portals = normalizeAccessPortalSet(connectors.map(connector => accessPortalFromConnector(connector, { spaces: spacePlans })));
    physics.accessPortals = portals;
    const portalById = new Map(portals.map(portal => [portal.id, portal]));
    for (const connector of connectors) connector.accessPortal = portalById.get(String(connector.id)) ?? null;

    return {
        connectors: connectors.length,
        portals: portals.length,
        reservations: reservations.length,
        synthesized,
        resolvedEdges,
        preservedExplicitBindings,
        inferredBindings,
        orphanReservations: reservations.filter(reservation => reservation.semanticConnectorEligible !== false && !reservation.connectorId).length,
    };
}
