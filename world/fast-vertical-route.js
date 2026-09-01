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
    const allLandings = Array.isArray(route.landings) && route.landings.length
        ? route.landings
        : route.endpointLandings;
    for (const landing of allLandings) {
        if (!landing.support) throw new Error(`${route.id}: landing support binding missing`);
        if (landing.generated && !landing.geometry) throw new Error(`${route.id}: generated landing requires real geometry`);
        if (!landing.generated && landing.geometry) throw new Error(`${route.id}: existing support must replace duplicate landing geometry`);
    }
    const generated = allLandings.filter(landing => landing.generated);
    if (route.generatedLandings.length !== generated.length) throw new Error(`${route.id}: generated landing registry drift`);

    const nodeIds = new Set((route.nodes ?? []).map(node => node.id));
    const landingIds = new Set(allLandings.map(landing => landing.id));
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


// Shared wall stair: room/floor portal nodes are supplied first. The stair solver
// never invents a doorway; it only realizes graph edges between valid portals.
// One trunk may serve several room doors on successive floors.
export function planSharedVerticalTrunk({
    routeId,
    family = 'shared-wall-stair',
    fp,
    moduleKey = null,
    dirKey = null,
    floorH,
    physicalTruth,
    portalStops = [],
    stableKey = routeId,
    maxRun = Infinity,
} = {}) {
    if (!routeId || !physicalTruth?.stair || !fp || !(Number(floorH) > 0)) return null;
    const stops = [...portalStops]
        .filter(stop => Number.isInteger(Number(stop?.floor)) && Number(stop.floor) > 0 && stop?.portal && stop?.roomSpaceId)
        .sort((a, b) => Number(a.floor) - Number(b.floor));
    if (!stops.length) return null;
    for (let i = 1; i < stops.length; i++) {
        if (Number(stops[i].floor) !== Number(stops[i - 1].floor) + 1) return null;
    }

    const firstPortal = stops[0].portal;
    const nx = Number(firstPortal.normalX) || 0;
    const nz = Number(firstPortal.normalZ) || 0;
    const cardinalX = Math.abs(nx) > 0.5 && Math.abs(nz) < 0.5;
    const cardinalZ = Math.abs(nz) > 0.5 && Math.abs(nx) < 0.5;
    if (!cardinalX && !cardinalZ) return null;

    const tangentAxis = cardinalZ ? 'x' : 'z';
    const normalAxis = cardinalZ ? 'z' : 'x';
    const outward = cardinalZ ? Math.sign(nz) : Math.sign(nx);
    const faceCoord = normalAxis === 'z' ? Number(firstPortal.z) : Number(firstPortal.x);
    const tangentCenter = tangentAxis === 'x' ? Number(firstPortal.x) : Number(firstPortal.z);
    if (![faceCoord, tangentCenter, outward].every(Number.isFinite) || !outward) return null;

    for (const stop of stops) {
        const p = stop.portal;
        const stopNx = Number(p.normalX) || 0;
        const stopNz = Number(p.normalZ) || 0;
        const stopNormal = normalAxis === 'z' ? stopNz : stopNx;
        const stopFaceCoord = normalAxis === 'z' ? Number(p.z) : Number(p.x);
        const stopTangent = tangentAxis === 'x' ? Number(p.x) : Number(p.z);
        if (Math.sign(stopNormal) !== outward || Math.abs(stopFaceCoord - faceCoord) > 0.08 || Math.abs(stopTangent - tangentCenter) > 0.08) return null;
    }

    const clearWidth = clamp(Number(physicalTruth.stair.widthSI) || 0.9, 0.72, 1.55);
    const halfWidth = clearWidth * 0.5;
    const facadeMargin = Math.max(0.20, clearWidth * 0.18);
    const tangentHalf = tangentAxis === 'x' ? Number(fp.halfX) : Number(fp.halfZ);
    const tangentMin = tangentCenter - tangentHalf + facadeMargin;
    const tangentMax = tangentCenter + tangentHalf - facadeMargin;
    const landingDepth = Math.max(1.10, clearWidth + 0.26);
    const fixedCoord = faceCoord + outward * (halfWidth + 0.20);
    const lowerSupport = supportRecord(null, { kind: 'existing-ground', id: `${routeId}:support:ground`, y: 0, existing: true });
    const lowerLanding = endpointLanding(`${routeId}:landing:ground`, 'lower', 0, lowerSupport, false, null);

    const landings = [lowerLanding];
    const nodes = [];
    const flights = [];
    const generatedLandings = [];
    const graphNodes = [Object.freeze({ id: `${routeId}:graph:ground`, kind: 'support', supportKind: 'ground', y: 0 })];
    const graphEdges = [];
    const initialDirection = (hash32(`${stableKey}:wall-trunk-direction`) & 1) ? 1 : -1;
    let direction = initialDirection;
    let previousFloor = 0;
    let previousLanding = lowerLanding;
    let previousTangent = null;
    let previousNode = null;

    for (let index = 0; index < stops.length; index++) {
        const stop = stops[index];
        const floor = Number(stop.floor);
        const rise = (floor - previousFloor) * Number(floorH);
        const stairFlight = deriveStairFlight({ rise, truth: physicalTruth, stableKey: `${stableKey}:floor:${floor}` });
        if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
        const run = Number(stairFlight.requiredRun);
        if (!(run > EPS) || run > Number(maxRun)) return null;

        const portalTangent = tangentAxis === 'x' ? Number(stop.portal.x) : Number(stop.portal.z);
        const support = stop.support?.existing === true
            ? supportRecord(stop.support, null)
            : supportRecord(null, {
                kind: 'generated-shared-landing', id: `${routeId}:support:floor:${floor}`,
                existing: false, moduleKey, floor, y: floor * Number(floorH),
            });
        const existingSupport = support.existing === true;

        let targetTangent;
        if (index === 0 && existingSupport) {
            targetTangent = portalTangent;
            previousTangent = targetTangent - direction * run;
        } else if (index === 0) {
            targetTangent = portalTangent + direction * run * 0.5;
            previousTangent = portalTangent - direction * run * 0.5;
        } else {
            targetTangent = previousTangent + direction * run;
        }
        if (previousTangent < tangentMin - EPS || previousTangent > tangentMax + EPS
            || targetTangent < tangentMin - EPS || targetTangent > tangentMax + EPS) return null;

        const y = floor * Number(floorH);
        const landingGeometry = existingSupport ? null : (() => {
            const landingTangentHalf = Math.min(
                tangentHalf - facadeMargin,
                Math.max(Math.abs(targetTangent - portalTangent) + clearWidth * 0.34, clearWidth),
            );
            const outerCoord = fixedCoord + outward * (halfWidth + 0.16);
            const innerCoord = faceCoord + outward * 0.03;
            const normalCenter = (innerCoord + outerCoord) * 0.5;
            const normalHalf = Math.abs(outerCoord - innerCoord) * 0.5;
            return tangentAxis === 'x'
                ? { x: portalTangent, z: normalCenter, hx: landingTangentHalf, hz: normalHalf }
                : { x: normalCenter, z: portalTangent, hx: normalHalf, hz: landingTangentHalf };
        })();
        const role = index === stops.length - 1 ? 'upper' : 'intermediate';
        const landing = endpointLanding(`${routeId}:landing:floor:${floor}`, role, y, support, !existingSupport, landingGeometry);
        landings.push(landing);
        if (landing.generated) generatedLandings.push(landing);

        const fromPoint = pointFor(tangentAxis, previousTangent, fixedCoord, previousFloor * Number(floorH));
        const toPoint = pointFor(tangentAxis, targetTangent, fixedCoord, y);
        if (!previousNode) {
            previousNode = flightNode(`${routeId}:node:ground`, fromPoint, lowerLanding.id, lowerSupport);
            nodes.push(previousNode);
        }
        const targetNode = flightNode(`${routeId}:node:floor:${floor}`, toPoint, landing.id, support);
        nodes.push(targetNode);
        const flight = Object.freeze({
            id: `${routeId}:flight:${index}`, level: previousFloor, segment: index,
            axis: tangentAxis, from: previousTangent, to: targetTangent, fixedCoord,
            halfWidth, y0: previousFloor * Number(floorH), y1: y,
            run: Math.abs(targetTangent - previousTangent), rise, clearWidth,
            headroom: Number(physicalTruth.stair.headroomSI) || Number(physicalTruth.route?.headroomSI) || 2.03,
            fromNodeId: previousNode.id, toNodeId: targetNode.id,
            fromLandingId: previousLanding.id, toLandingId: landing.id,
            stairFlight, fitClassification: stairFlight.fitClassification,
        });
        flights.push(flight);

        const roomNodeId = `${routeId}:graph:room:${floor}`;
        const portalNodeId = `${routeId}:graph:portal:${floor}`;
        const landingNodeId = `${routeId}:graph:landing:${floor}`;
        graphNodes.push(
            Object.freeze({ id: roomNodeId, kind: 'room', spaceId: stop.roomSpaceId, floor }),
            Object.freeze({ id: portalNodeId, kind: 'portal', portalId: stop.portal.id, floor, source: stop.source ?? 'room-door' }),
            Object.freeze({ id: landingNodeId, kind: 'landing', landingId: landing.id, floor, generated: landing.generated }),
        );
        graphEdges.push(
            Object.freeze({ from: roomNodeId, to: portalNodeId, kind: 'door-threshold' }),
            Object.freeze({ from: portalNodeId, to: landingNodeId, kind: 'portal-to-landing' }),
            Object.freeze({ from: previousFloor === 0 ? `${routeId}:graph:ground` : `${routeId}:graph:landing:${previousFloor}`, to: landingNodeId, kind: 'stair-flight', flightId: flight.id }),
        );

        previousLanding = landing;
        previousNode = targetNode;
        previousTangent = targetTangent;
        previousFloor = floor;
        direction *= -1;
    }

    const upperLanding = landings[landings.length - 1];
    const route = Object.freeze({
        schema: FAST_VERTICAL_ROUTE_SCHEMA,
        id: routeId,
        family,
        shape: 'wall-trunk',
        graphAuthority: 'room-portal-first',
        moduleKey,
        dirKey,
        side: firstPortal.side ?? null,
        targetFloor: Number(stops[stops.length - 1].floor),
        floorH: Number(floorH),
        physicalTruth,
        lowerSupport,
        upperSupport: upperLanding.support,
        hostRect: Object.freeze({ cx: Number(fp.cx), cz: Number(fp.cz), halfX: Number(fp.halfX), halfZ: Number(fp.halfZ) }),
        orientation: Object.freeze({
            faceSide: firstPortal.side ?? null,
            tangentAxis,
            normalAxis,
            outward,
            tangentDirection: initialDirection,
            ascent: 'along-facade-shared-trunk',
            faceCoord,
            fixedCoord,
        }),
        portalStops: Object.freeze(stops.map(stop => Object.freeze({ ...stop }))),
        nodes: Object.freeze(nodes),
        landings: Object.freeze(landings),
        endpointLandings: Object.freeze([lowerLanding, upperLanding]),
        generatedLandings: Object.freeze(generatedLandings),
        flights: Object.freeze(flights),
        graph: Object.freeze({
            schema: 'jweb.fast-circulation-graph.v1',
            authority: 'room-portal-first',
            nodes: Object.freeze(graphNodes),
            edges: Object.freeze(graphEdges),
        }),
    });
    assertFastVerticalRoute(route);
    return route;
}

// Exterior street-layer trunk: transport surfaces exist independently of doors.
// Occupancy portals attach sparsely to those layers; flights connect layer neighbors.
// Generated decks carry an explicit stair throat so their slab can never cap the
// player's headroom at the top of a flight.
export function planExteriorStreetLayerTrunk({
    routeId,
    family = 'exterior-street-layer-trunk',
    fp,
    moduleKey = null,
    dirKey = null,
    side,
    floorH,
    physicalTruth,
    layerStops = [],
    stableKey = routeId,
    maxRun = Infinity,
} = {}) {
    if (!routeId || !physicalTruth?.stair || !fp || !(Number(floorH) > 0)) return null;
    const geometry = faceGeometry(fp, side);
    if (!geometry) return null;

    const layers = [...layerStops]
        .filter(stop => Number.isInteger(Number(stop?.floor)) && Number(stop.floor) > 0)
        .sort((a, b) => Number(a.floor) - Number(b.floor));
    if (!layers.length || Number(layers[0].floor) !== 1) return null;
    for (let i = 1; i < layers.length; i++) {
        if (Number(layers[i].floor) !== Number(layers[i - 1].floor) + 1) return null;
    }

    const clearWidth = clamp(Number(physicalTruth.stair.widthSI) || 0.9, 0.72, 1.55);
    const halfWidth = clearWidth * 0.5;
    const facadeMargin = Math.max(0.22, clearWidth * 0.20);
    const tangentMin = geometry.tangentCenter - geometry.tangentHalf + facadeMargin;
    const tangentMax = geometry.tangentCenter + geometry.tangentHalf - facadeMargin;
    const fixedCoord = geometry.faceCoord + geometry.outward * (halfWidth + 0.22);
    const lowerSupport = supportRecord(null, {
        kind: 'existing-ground', id: `${routeId}:support:ground`, y: 0, existing: true,
    });
    const lowerLanding = endpointLanding(`${routeId}:landing:ground`, 'lower', 0, lowerSupport, false, null);

    const landings = [lowerLanding];
    const nodes = [];
    const flights = [];
    const generatedLandings = [];
    const portalStops = [];
    const streetLayers = [];
    const graphNodes = [Object.freeze({ id: `${routeId}:graph:street-layer:0`, kind: 'street-layer', floor: 0, transportKind: 'ground-street', y: 0 })];
    const graphEdges = [];
    const initialDirection = (hash32(`${stableKey}:street-layer-direction`) & 1) ? 1 : -1;
    let direction = initialDirection;
    let previousFloor = 0;
    let previousLanding = lowerLanding;
    let previousTangent = null;
    let previousNode = null;

    for (let index = 0; index < layers.length; index++) {
        const layer = layers[index];
        const floor = Number(layer.floor);
        const rise = (floor - previousFloor) * Number(floorH);
        const stairFlight = deriveStairFlight({ rise, truth: physicalTruth, stableKey: `${stableKey}:street-layer:${floor}` });
        if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
        const run = Number(stairFlight.requiredRun);
        if (!(run > EPS) || run > Number(maxRun)) return null;

        const bridgeAnchored = String(layer.transportKind ?? '').includes('bridge');
        let targetTangent;
        if (index === 0 && bridgeAnchored) {
            const edgeInset = Math.max(clearWidth * 0.72, facadeMargin + 0.10);
            targetTangent = geometry.tangentCenter + direction * Math.max(run * 0.5, geometry.tangentHalf - edgeInset);
            previousTangent = targetTangent - direction * run;
        } else {
            if (index === 0) previousTangent = geometry.tangentCenter - direction * run * 0.5;
            targetTangent = index === 0
                ? geometry.tangentCenter + direction * run * 0.5
                : previousTangent + direction * run;
        }
        if (previousTangent < tangentMin - EPS || previousTangent > tangentMax + EPS
            || targetTangent < tangentMin - EPS || targetTangent > tangentMax + EPS) return null;

        const y = floor * Number(floorH);
        const support = layer.support?.existing === true
            ? supportRecord(layer.support, null)
            : supportRecord(null, {
                kind: 'generated-exterior-street-layer', id: `${routeId}:support:layer:${floor}`,
                existing: false, moduleKey, floor, y,
            });
        const existingSupport = support.existing === true;
        const headroom = Number(physicalTruth.stair.headroomSI) || Number(physicalTruth.route?.headroomSI) || 2.03;

        let landingGeometry = null;
        let stairThroat = null;
        if (!existingSupport) {
            const deckTangentHalf = Math.min(
                geometry.tangentHalf - facadeMargin,
                Math.max(clearWidth * 1.8, geometry.tangentHalf * 0.78),
            );
            if (!(deckTangentHalf > clearWidth * 0.7)) return null;
            const outerCoord = fixedCoord + geometry.outward * (halfWidth + 0.20);
            const innerCoord = geometry.faceCoord + geometry.outward * 0.03;
            const normalCenter = (innerCoord + outerCoord) * 0.5;
            const normalHalf = Math.abs(outerCoord - innerCoord) * 0.5;
            landingGeometry = geometry.tangentAxis === 'x'
                ? { x: geometry.tangentCenter, z: normalCenter, hx: deckTangentHalf, hz: normalHalf }
                : { x: normalCenter, z: geometry.tangentCenter, hx: normalHalf, hz: deckTangentHalf };

            const ascentDirection = Math.sign(targetTangent - previousTangent) || direction;
            const throatLength = Math.min(
                run,
                Math.max(clearWidth * 1.15, headroom * run / Math.max(rise, EPS) + clearWidth * 0.24),
            );
            const throatCenter = targetTangent - ascentDirection * throatLength * 0.5;
            stairThroat = geometry.tangentAxis === 'x'
                ? { x: throatCenter, z: fixedCoord, hx: throatLength * 0.5 + 0.06, hz: halfWidth + 0.10 }
                : { x: fixedCoord, z: throatCenter, hx: halfWidth + 0.10, hz: throatLength * 0.5 + 0.06 };
        }

        const role = index === layers.length - 1 ? 'upper' : 'intermediate';
        const landingBase = endpointLanding(`${routeId}:landing:layer:${floor}`, role, y, support, !existingSupport, landingGeometry);
        const landing = Object.freeze({
            ...landingBase,
            streetLayer: true,
            transportKind: layer.transportKind ?? (existingSupport ? 'existing-walkway-layer' : 'balcony-street-layer'),
            stairThroat: stairThroat ? Object.freeze({ ...stairThroat }) : null,
        });
        landings.push(landing);
        if (landing.generated) generatedLandings.push(landing);

        const fromPoint = pointFor(geometry.tangentAxis, previousTangent, fixedCoord, previousFloor * Number(floorH));
        const toPoint = pointFor(geometry.tangentAxis, targetTangent, fixedCoord, y);
        if (!previousNode) {
            previousNode = flightNode(`${routeId}:node:ground`, fromPoint, lowerLanding.id, lowerSupport);
            nodes.push(previousNode);
        }
        const targetNode = flightNode(`${routeId}:node:layer:${floor}`, toPoint, landing.id, support);
        nodes.push(targetNode);
        const flight = Object.freeze({
            id: `${routeId}:flight:${index}`,
            level: previousFloor,
            segment: index,
            axis: geometry.tangentAxis,
            from: previousTangent,
            to: targetTangent,
            fixedCoord,
            halfWidth,
            y0: previousFloor * Number(floorH),
            y1: y,
            run: Math.abs(targetTangent - previousTangent),
            rise,
            clearWidth,
            headroom,
            fromNodeId: previousNode.id,
            toNodeId: targetNode.id,
            fromLandingId: previousLanding.id,
            toLandingId: landing.id,
            stairFlight,
            fitClassification: stairFlight.fitClassification,
        });
        flights.push(flight);

        const layerNodeId = `${routeId}:graph:street-layer:${floor}`;
        graphNodes.push(Object.freeze({
            id: layerNodeId,
            kind: 'street-layer',
            floor,
            y,
            landingId: landing.id,
            transportKind: landing.transportKind,
            generated: landing.generated,
        }));
        graphEdges.push(Object.freeze({
            from: `${routeId}:graph:street-layer:${previousFloor}`,
            to: layerNodeId,
            kind: 'vertical-layer-neighbor',
            flightId: flight.id,
        }));

        const layerPortals = [...(layer.portals ?? [])].filter(stop => stop?.portal && stop?.roomSpaceId);
        for (let portalIndex = 0; portalIndex < layerPortals.length; portalIndex++) {
            const stop = Object.freeze({ ...layerPortals[portalIndex], floor });
            portalStops.push(stop);
            const roomNodeId = `${routeId}:graph:room:${floor}:${portalIndex}`;
            const portalNodeId = `${routeId}:graph:portal:${floor}:${portalIndex}`;
            graphNodes.push(
                Object.freeze({ id: roomNodeId, kind: 'occupancy', spaceId: stop.roomSpaceId, floor }),
                Object.freeze({ id: portalNodeId, kind: 'portal', portalId: stop.portal.id, floor, source: stop.source ?? 'room-door' }),
            );
            graphEdges.push(
                Object.freeze({ from: roomNodeId, to: portalNodeId, kind: 'occupancy-threshold' }),
                Object.freeze({ from: portalNodeId, to: layerNodeId, kind: 'portal-to-street-layer' }),
            );
        }
        streetLayers.push(Object.freeze({
            floor,
            y,
            landingId: landing.id,
            generated: landing.generated,
            transportKind: landing.transportKind,
            portalIds: Object.freeze(layerPortals.map(stop => stop.portal.id)),
        }));

        previousLanding = landing;
        previousNode = targetNode;
        previousTangent = targetTangent;
        previousFloor = floor;
        direction *= -1;
    }

    const upperLanding = landings[landings.length - 1];
    const route = Object.freeze({
        schema: FAST_VERTICAL_ROUTE_SCHEMA,
        id: routeId,
        family,
        shape: 'street-layer-trunk',
        graphAuthority: 'exterior-street-layer-first',
        moduleKey,
        dirKey,
        side,
        targetFloor: Number(layers[layers.length - 1].floor),
        floorH: Number(floorH),
        physicalTruth,
        lowerSupport,
        upperSupport: upperLanding.support,
        hostRect: Object.freeze({ cx: Number(fp.cx), cz: Number(fp.cz), halfX: Number(fp.halfX), halfZ: Number(fp.halfZ) }),
        orientation: Object.freeze({
            faceSide: side,
            tangentAxis: geometry.tangentAxis,
            normalAxis: geometry.normalAxis,
            outward: geometry.outward,
            tangentDirection: initialDirection,
            ascent: 'layer-neighbor-wall-trunk',
            faceCoord: geometry.faceCoord,
            fixedCoord,
        }),
        portalStops: Object.freeze(portalStops),
        streetLayers: Object.freeze(streetLayers),
        nodes: Object.freeze(nodes),
        landings: Object.freeze(landings),
        endpointLandings: Object.freeze([lowerLanding, upperLanding]),
        generatedLandings: Object.freeze(generatedLandings),
        flights: Object.freeze(flights),
        graph: Object.freeze({
            schema: 'jweb.exterior-street-layer-graph.v1',
            authority: 'exterior-street-layer-first',
            nodes: Object.freeze(graphNodes),
            edges: Object.freeze(graphEdges),
        }),
    });
    assertFastVerticalRoute(route);
    return route;
}
