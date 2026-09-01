import { deriveStairFlight } from './physical-truth.js';

export const FAST_VERTICAL_ROUTE_SCHEMA = 'jweb.fast-vertical-route.v2';

const EPS = 1e-7;

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

function hash32(value) {
    let h = 2166136261 >>> 0;
    for (const ch of String(value ?? '')) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function pointFor(axis, along, fixed, y) {
    return axis === 'x'
        ? { x: along, y, z: fixed }
        : { x: fixed, y, z: along };
}

function faceGeometry(fp, side) {
    if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
    const cx = Number(fp.cx);
    const cz = Number(fp.cz);
    const halfX = Number(fp.halfX);
    const halfZ = Number(fp.halfZ);
    if (![cx, cz, halfX, halfZ].every(Number.isFinite) || halfX <= 0 || halfZ <= 0) return null;
    const horizontal = side === 'north' || side === 'south';
    const tangentAxis = horizontal ? 'x' : 'z';
    const normalAxis = horizontal ? 'z' : 'x';
    const tangentCenter = horizontal ? cx : cz;
    const tangentHalf = horizontal ? halfX : halfZ;
    const faceCoord = horizontal
        ? cz + (side === 'north' ? -halfZ : halfZ)
        : cx + (side === 'west' ? -halfX : halfX);
    const outward = side === 'north' || side === 'west' ? -1 : 1;
    return Object.freeze({ horizontal, tangentAxis, normalAxis, tangentCenter, tangentHalf, faceCoord, outward });
}

function supportRecord(raw, fallback) {
    const source = raw ?? fallback;
    return Object.freeze({ ...source });
}

function endpointLanding(id, role, y, support, generated, geometry = null) {
    return Object.freeze({
        id,
        role,
        y,
        generated: generated === true,
        support,
        geometry: geometry ? Object.freeze({ ...geometry }) : null,
    });
}

function flightNode(id, point, landingId, support) {
    return Object.freeze({ id, landingId, ...point, support });
}

export function assertFastVerticalRoute(route) {
    if (!route || route.schema !== FAST_VERTICAL_ROUTE_SCHEMA) throw new Error('fast vertical route schema missing');
    if (!Array.isArray(route.flights) || route.flights.length < 1) throw new Error(`${route.id}: every stair route requires at least one flight`);
    if (!Array.isArray(route.endpointLandings) || route.endpointLandings.length !== 2) throw new Error(`${route.id}: lower and upper endpoint landing semantics are required`);
    const [lower, upper] = route.endpointLandings;
    if (lower.role !== 'lower' || upper.role !== 'upper') throw new Error(`${route.id}: endpoint landing order is invalid`);
    if (!lower.support || !upper.support) throw new Error(`${route.id}: every endpoint landing requires a support binding`);
    if (lower.generated) throw new Error(`${route.id}: ground support must replace lower landing geometry`);
    if (upper.generated && !upper.geometry) throw new Error(`${route.id}: generated upper landing requires real geometry`);
    if (!upper.generated && upper.geometry) throw new Error(`${route.id}: existing support must replace duplicate landing geometry`);
    const generated = route.endpointLandings.filter(landing => landing.generated);
    if (route.generatedLandings.length !== generated.length) throw new Error(`${route.id}: generated landing registry drift`);

    const nodeIds = new Set((route.nodes ?? []).map(node => node.id));
    const landingIds = new Set(route.endpointLandings.map(landing => landing.id));
    for (const flight of route.flights) {
        if (!nodeIds.has(flight.fromNodeId) || !nodeIds.has(flight.toNodeId)) throw new Error(`${route.id}: flight endpoint node missing`);
        if (!landingIds.has(flight.fromLandingId) || !landingIds.has(flight.toLandingId)) throw new Error(`${route.id}: flight must connect endpoint landings`);
        if (!(flight.run > EPS) || !(flight.rise > EPS)) throw new Error(`${route.id}: flight must have positive run and rise`);
        if (flight.fitClassification !== 'fits-resolved-truth') throw new Error(`${route.id}: flight escaped physical truth fit`);
        if (!(flight.stairFlight?.stepCount >= 1)) throw new Error(`${route.id}: flight requires at least one realized step`);
    }
    return true;
}

export function planFastVerticalRoute({
    routeId,
    family = 'broad-facade-stair',
    shape = 'direct',
    fp,
    moduleKey = null,
    dirKey = null,
    side,
    floorH,
    targetFloor = 1,
    physicalTruth,
    stableKey = routeId,
    maxRun = Infinity,
    upperSupport = null,
} = {}) {
    if (!routeId || !physicalTruth?.stair) return null;
    if (!['direct', 'side-run'].includes(shape)) return null;
    const geometry = faceGeometry(fp, side);
    const level = Math.floor(Number(targetFloor));
    const rise = Number(floorH) * level;
    if (!geometry || level !== 1 || !(rise > 0)) return null;

    const stairFlight = deriveStairFlight({ rise, truth: physicalTruth, stableKey: stableKey ?? routeId });
    if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
    const run = Number(stairFlight.requiredRun);
    if (!(run > EPS) || run > Number(maxRun)) return null;

    const clearWidth = clamp(Number(physicalTruth.stair.widthSI) || 0.9, 0.72, 1.55);
    const lowerSupport = supportRecord(null, {
        kind: 'existing-ground', id: `${routeId}:support:ground`, y: 0,
    });

    const explicitUpper = upperSupport ? supportRecord(upperSupport, null) : null;
    const upperIsExisting = explicitUpper?.existing === true;
    const tangentDirection = (hash32(`${stableKey}:side-direction`) & 1) ? 1 : -1;
    let axis;
    let from;
    let to;
    let fixedCoord;
    let lowerPoint;
    let upperPoint;
    let upperGeometry = null;

    if (shape === 'direct') {
        axis = geometry.normalAxis;
        const topNormal = upperIsExisting && Number.isFinite(explicitUpper.normalCoord)
            ? explicitUpper.normalCoord
            : geometry.faceCoord + geometry.outward * Math.max(0.62, clearWidth * 0.58);
        const topTangent = upperIsExisting && Number.isFinite(explicitUpper.tangent)
            ? explicitUpper.tangent
            : geometry.tangentCenter;
        from = topNormal + geometry.outward * run;
        to = topNormal;
        fixedCoord = topTangent;
        lowerPoint = pointFor(axis, from, fixedCoord, 0);
        upperPoint = pointFor(axis, to, fixedCoord, rise);
        if (!upperIsExisting) {
            const normalCenter = (topNormal + geometry.faceCoord) * 0.5;
            const normalHalf = Math.abs(topNormal - geometry.faceCoord) * 0.5 + 0.16;
            const tangentHalf = Math.max(1.15, clearWidth * 0.88);
            upperGeometry = geometry.horizontal
                ? { x: topTangent, z: normalCenter, hx: tangentHalf, hz: normalHalf }
                : { x: normalCenter, z: topTangent, hx: normalHalf, hz: tangentHalf };
        }
    } else {
        axis = geometry.tangentAxis;
        const topTangent = upperIsExisting && Number.isFinite(explicitUpper.tangent)
            ? explicitUpper.tangent
            : geometry.tangentCenter + tangentDirection * Math.min(run * 0.5, geometry.tangentHalf * 0.34);
        const topNormal = upperIsExisting && Number.isFinite(explicitUpper.normalCoord)
            ? explicitUpper.normalCoord
            : geometry.faceCoord + geometry.outward * Math.max(0.82, clearWidth * 0.72 + 0.24);
        const bottomTangent = topTangent - tangentDirection * run;
        const facadeMargin = Math.max(0.24, clearWidth * 0.22);
        const minTangent = geometry.tangentCenter - geometry.tangentHalf + facadeMargin;
        const maxTangent = geometry.tangentCenter + geometry.tangentHalf - facadeMargin;
        if (bottomTangent < minTangent - EPS || bottomTangent > maxTangent + EPS
            || topTangent < minTangent - EPS || topTangent > maxTangent + EPS) return null;
        from = bottomTangent;
        to = topTangent;
        fixedCoord = topNormal;
        lowerPoint = pointFor(axis, from, fixedCoord, 0);
        upperPoint = pointFor(axis, to, fixedCoord, rise);
        if (!upperIsExisting) {
            const normalCenter = (topNormal + geometry.faceCoord) * 0.5;
            const normalHalf = Math.abs(topNormal - geometry.faceCoord) * 0.5 + 0.14;
            const tangentHalf = Math.max(1.0, clearWidth * 0.82);
            upperGeometry = geometry.horizontal
                ? { x: topTangent, z: normalCenter, hx: tangentHalf, hz: normalHalf }
                : { x: normalCenter, z: topTangent, hx: normalHalf, hz: tangentHalf };
        }
    }

    const upperSupportRecord = upperIsExisting
        ? explicitUpper
        : supportRecord(null, {
            kind: 'generated-facade-landing', id: `${routeId}:support:upper-landing`,
            existing: false, moduleKey, floor: level, y: rise,
        });
    const lowerLanding = endpointLanding(`${routeId}:landing:lower`, 'lower', 0, lowerSupport, false, null);
    const upperLanding = endpointLanding(`${routeId}:landing:upper`, 'upper', rise, upperSupportRecord, !upperIsExisting, upperGeometry);
    const lowerNode = flightNode(`${routeId}:node:lower`, lowerPoint, lowerLanding.id, lowerSupport);
    const upperNode = flightNode(`${routeId}:node:upper`, upperPoint, upperLanding.id, upperSupportRecord);
    const flight = Object.freeze({
        id: `${routeId}:flight:0`, level: 0, segment: 0,
        axis, from, to, fixedCoord,
        halfWidth: clearWidth * 0.5,
        y0: 0, y1: rise,
        run: Math.abs(to - from), rise, clearWidth,
        headroom: Number(physicalTruth.stair.headroomSI) || Number(physicalTruth.route?.headroomSI) || 2.03,
        fromNodeId: lowerNode.id, toNodeId: upperNode.id,
        fromLandingId: lowerLanding.id, toLandingId: upperLanding.id,
        stairFlight, fitClassification: stairFlight.fitClassification,
    });

    const route = Object.freeze({
        schema: FAST_VERTICAL_ROUTE_SCHEMA,
        id: routeId,
        family,
        shape,
        moduleKey,
        dirKey,
        side,
        targetFloor: level,
        floorH: Number(floorH),
        physicalTruth,
        lowerSupport,
        upperSupport: upperSupportRecord,
        orientation: Object.freeze({
            faceSide: side,
            tangentAxis: geometry.tangentAxis,
            normalAxis: geometry.normalAxis,
            outward: geometry.outward,
            tangentDirection: shape === 'side-run' ? tangentDirection : 0,
            ascent: shape === 'direct' ? 'toward-facade-landing' : 'along-facade',
        }),
        nodes: Object.freeze([lowerNode, upperNode]),
        endpointLandings: Object.freeze([lowerLanding, upperLanding]),
        generatedLandings: Object.freeze(upperLanding.generated ? [upperLanding] : []),
        flights: Object.freeze([flight]),
    });
    assertFastVerticalRoute(route);
    return route;
}
