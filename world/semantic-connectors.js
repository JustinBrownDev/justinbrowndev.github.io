import {
    createBoxCirculationReservation,
    createRampCirculationReservation,
    createStairShaftReservation,
} from './circulation-reservations.js';
import { spacePlanTouchesPoint, spacePlanTouchesReservation } from './space-plan.js';

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

export function semanticPortalForRect({
    id,
    rect,
    side,
    floor = 0,
    floorH = 3.15,
    width = 1.20,
    height = 2.20,
    depth = 1.20,
    source = 'compound-portal',
    fromSpaceId = null,
    toSpaceId = null,
    metadata = null,
} = {}) {
    if (!id || !rect || !SIDE_VECTOR[side]) throw new Error('semantic portal requires id, rect, and cardinal side');
    positive('width', width); positive('height', height); positive('depth', depth); positive('floorH', floorH);
    const v = SIDE_VECTOR[side];
    const y = floor * floorH;
    const x = rect.cx + v.x * (side === 'west' || side === 'east' ? rect.halfX : 0);
    const z = rect.cz + v.z * (side === 'north' || side === 'south' ? rect.halfZ : 0);
    return {
        id,
        kind: 'portal-endpoint',
        x, y, z,
        width, height, depth,
        side,
        normalX: v.x,
        normalZ: v.z,
        rotY: v.ry,
        source,
        fromSpaceId,
        toSpaceId,
        ...(metadata || {}),
    };
}

export function createPortalConnector({
    id,
    portal,
    kind = 'door',
    source = portal?.source ?? 'portal',
    visualRole = 'doorway',
    approachDepth = null,
    metadata = null,
} = {}) {
    if (!id || !portal) throw new Error('portal connector requires id and portal');
    const depth = positive('portal.depth', portal.depth);
    const width = positive('portal.width', portal.width);
    const height = positive('portal.height', portal.height);
    const approach = Math.max(depth, Number(approachDepth) || depth, 0.85);
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
    exitHeadroom = 2.1,
    rampAxis,
    rampFrom,
    rampTo,
    rampHalfWidth,
    source = 'compound-stair',
    visualRole = 'stair',
    fromSpaceId = null,
    toSpaceId = null,
    metadata = null,
} = {}) {
    const shaft = createStairShaftReservation({
        id: `${id}:shaft`,
        x, z, openingWidth, openingDepth, baseY, roofY, exitHeadroom,
        rampAxis, rampFrom, rampTo, rampHalfWidth, source,
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
            { id: `${id}:bottom`, kind: 'portal-endpoint', x, y: baseY, z, width: openingWidth, height: 2.0, depth: openingDepth, side: null },
            { id: `${id}:top`, kind: 'portal-endpoint', x, y: roofY, z, width: openingWidth, height: exitHeadroom, depth: openingDepth, side: null },
        ],
        aperture: { width: openingWidth, height: roofY - baseY + exitHeadroom, depth: openingDepth },
        sweep: {
            type: 'stair', axis: rampAxis, from: rampFrom, to: rampTo,
            fixedCoord: rampAxis === 'x' ? z : x,
            halfWidth: rampHalfWidth, y0: baseY, y1: roofY,
        },
        reservations: [shaft],
        primaryReservation: shaft,
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
    headroom = 1.95,
    source = null,
    visualRole = 'ramp',
    fromSpaceId = null,
    toSpaceId = null,
    metadata = null,
} = {}) {
    const reservation = createRampCirculationReservation({
        id: `${id}:sweep`, kind: reservationKind || `${kind}-sweep`, axis, from, to, fixedCoord, halfWidth,
        y0, y1, capsuleRadius, headroom, source,
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind, source, visualRole,
        fromSpaceId, toSpaceId,
        endpoints: [
            axis === 'x' ? { id: `${id}:a`, x: from, y: y0, z: fixedCoord } : { id: `${id}:a`, x: fixedCoord, y: y0, z: from },
            axis === 'x' ? { id: `${id}:b`, x: to, y: y1, z: fixedCoord } : { id: `${id}:b`, x: fixedCoord, y: y1, z: to },
        ],
        sweep: { type: kind, axis, from, to, fixedCoord, halfWidth, y0, y1 },
        reservations: [reservation],
        primaryReservation: reservation,
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
    headroom = 1.96,
    source = null,
    visualRole = 'landing',
    reservationKind = 'landing-sweep',
    fromSpaceId = null,
    toSpaceId = null,
    metadata = null,
} = {}) {
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`, kind: reservationKind, x, z, halfX, halfZ,
        yMin: y + 0.01, yMax: y + headroom, source,
        metadata: { connectorId: id, ...(metadata || {}) },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'landing', source, visualRole,
        fromSpaceId, toSpaceId,
        endpoints: [{ id: `${id}:surface`, x, y, z }],
        sweep: { type: 'landing', x, z, halfX, halfZ, y0: y, y1: y + headroom },
        reservations: [reservation],
        primaryReservation: reservation,
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
    metadata = null,
} = {}) {
    return createRampConnector({
        id, kind: 'bridge', axis, from, to, fixedCoord, halfWidth,
        y0: y, y1: y, capsuleRadius: 0.18, headroom: 1.95,
        source, visualRole, fromSpaceId, toSpaceId, metadata,
    });
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
    metadata = null,
} = {}) {
    const reservation = createBoxCirculationReservation({
        id: `${id}:sweep`, kind: 'fire-escape-sweep', x, z, halfX, halfZ,
        yMin: baseY, yMax: topY + 1.95, source,
        metadata: { connectorId: id, ...(metadata || {}) },
    });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'fire-escape', source, visualRole: 'fire-escape',
        fromSpaceId, toSpaceId,
        endpoints: [{ id: `${id}:bottom`, x, y: baseY, z }, { id: `${id}:top`, x, y: topY, z }],
        sweep: { type: 'fire-escape', x, z, halfX, halfZ, y0: baseY, y1: topY },
        reservations: [reservation],
        metadata: metadata || null,
    };
}

export function registerSemanticConnector(physics, connector, { publishReservations = true } = {}) {
    if (!connector?.id || connector.schema !== SEMANTIC_CONNECTOR_SCHEMA) throw new Error('invalid semantic connector');
    const connectors = connectorList(physics);
    if (connectors.some(existing => existing.id === connector.id)) return connector;
    connectors.push(connector);
    if (publishReservations) {
        const reservations = reservationList(physics);
        for (const reservation of connector.reservations ?? []) {
            if (!reservations.some(existing => existing.id === reservation.id)) reservations.push(reservation);
        }
    }
    return connector;
}

export function connectorOpeningWidth(connector, fallback = 0) {
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
        if (ownedReservationIds.has(reservation.id)) continue;
        const connector = wrapOrphanReservation(reservation);
        connectors.push(connector);
        ownedReservationIds.add(reservation.id);
        synthesized++;
    }

    let resolvedEdges = 0;
    for (const connector of connectors) {
        const spaceIds = connectorSpaceIds(connector, spacePlans);
        connector.spaceIds = spaceIds;
        if (!connector.fromSpaceId && spaceIds[0]) connector.fromSpaceId = spaceIds[0];
        if (!connector.toSpaceId && spaceIds[1]) connector.toSpaceId = spaceIds[1];
        for (const reservation of connector.reservations ?? []) {
            reservation.connectorId = connector.id;
        }
        if (connector.fromSpaceId && connector.toSpaceId) resolvedEdges++;
    }

    return {
        connectors: connectors.length,
        reservations: reservations.length,
        synthesized,
        resolvedEdges,
        orphanReservations: reservations.filter(reservation => !reservation.connectorId).length,
    };
}
