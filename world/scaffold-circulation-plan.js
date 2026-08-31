import { deriveStairFlight } from './physical-truth.js';

export const SCAFFOLD_CIRCULATION_PLAN_SCHEMA = 'jweb.scaffold-circulation-plan.v1';

const EPSILON = 1e-9;

function finitePositive(value, fallback = 0) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pointFor(axis, along, fixed, y) {
    return axis === 'x'
        ? { x: along, y, z: fixed }
        : { x: fixed, y, z: along };
}

function truthProvenance(truth) {
    return Object.freeze({
        schema: truth?.schema ?? null,
        truthDataVersion: truth?.truthDataVersion ?? null,
        doorWidth: truth?.door?.clearWidth?.provenance ?? null,
        stairRiser: truth?.stair?.riser?.provenance ?? null,
        stairTread: truth?.stair?.tread?.provenance ?? null,
        stairWidth: truth?.stair?.widthProvenance ?? null,
        landingDepth: truth?.stair?.landingDepthProvenance ?? null,
        headroom: truth?.stair?.headroom?.provenance ?? null,
    });
}

function faceGeometry(fp, side) {
    if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
    const cx = Number(fp.cx), cz = Number(fp.cz), halfX = Number(fp.halfX), halfZ = Number(fp.halfZ);
    if (![cx, cz, halfX, halfZ].every(Number.isFinite) || !(halfX > 0) || !(halfZ > 0)) return null;
    const rect = Object.freeze({ cx, cz, halfX, halfZ });
    const horizontal = side === 'north' || side === 'south';
    const axis = horizontal ? 'x' : 'z';
    const tangentCenter = horizontal ? cx : cz;
    const tangentHalf = horizontal ? halfX : halfZ;
    const normalCenter = horizontal ? cz : cx;
    const normalHalf = horizontal ? halfZ : halfX;
    const outward = side === 'north' || side === 'west' ? -1 : 1;
    const faceNormal = normalCenter + outward * normalHalf;
    return { horizontal, axis, tangentCenter, tangentHalf, faceNormal, outward, rect };
}

function makeNode(routeId, suffix, point, landingId, extra = {}) {
    return Object.freeze({ id: `${routeId}:node:${suffix}`, landingId, ...point, ...extra });
}

function makeLanding(routeId, suffix, axis, along, normal, tangentSize, normalSize, y, nodeIds, extra = {}) {
    const center = pointFor(axis, along, normal, y);
    return Object.freeze({
        id: `${routeId}:landing:${suffix}`,
        ...center,
        sx: axis === 'x' ? tangentSize : normalSize,
        sz: axis === 'x' ? normalSize : tangentSize,
        tangentSize,
        normalSize,
        y,
        nodeIds: Object.freeze([...nodeIds]),
        ...extra,
    });
}

function makeFlight({ routeId, suffix, level, segment, axis, fromNode, toNode, truth, stableKey }) {
    const run = Math.abs((axis === 'x' ? toNode.x - fromNode.x : toNode.z - fromNode.z));
    const rise = toNode.y - fromNode.y;
    if (!(run > 0) || !(rise > 0)) return null;
    const stairFlight = deriveStairFlight({ rise, truth, stableKey, availableRun: run });
    if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
    const from = axis === 'x' ? fromNode.x : fromNode.z;
    const to = axis === 'x' ? toNode.x : toNode.z;
    const fixedCoord = axis === 'x' ? fromNode.z : fromNode.x;
    const targetFixed = axis === 'x' ? toNode.z : toNode.x;
    if (Math.abs(fixedCoord - targetFixed) > EPSILON) return null;
    return Object.freeze({
        id: `${routeId}:flight:${suffix}`,
        level,
        segment,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        fromLandingId: fromNode.landingId,
        toLandingId: toNode.landingId,
        axis,
        from,
        to,
        fixedCoord,
        halfWidth: truth.stair.widthSI * 0.5,
        y0: fromNode.y,
        y1: toNode.y,
        run,
        rise,
        clearWidth: truth.stair.widthSI,
        headroom: truth.stair.headroomSI,
        stairFlight,
        fitClassification: stairFlight.fitClassification,
    });
}

function graphIsContinuous(plan) {
    const adjacency = new Map(plan.nodes.map(node => [node.id, new Set()]));
    for (const flight of plan.flights) {
        adjacency.get(flight.fromNodeId)?.add(flight.toNodeId);
        adjacency.get(flight.toNodeId)?.add(flight.fromNodeId);
    }
    for (const landing of plan.landings) {
        for (const a of landing.nodeIds) {
            for (const b of landing.nodeIds) {
                if (a !== b) adjacency.get(a)?.add(b);
            }
        }
    }
    const seen = new Set([plan.groundNodeId]);
    const queue = [plan.groundNodeId];
    while (queue.length) {
        const id = queue.shift();
        if (id === plan.topNodeId) return true;
        for (const next of adjacency.get(id) ?? []) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
        }
    }
    return false;
}

function makeFacadeOpenings({ routeId, moduleKey, geometry, floors, truth, landings }) {
    const width = finitePositive(truth?.door?.clearWidth?.realizedSI);
    const height = finitePositive(truth?.door?.clearHeight?.realizedSI);
    if (!(width > 0) || !(height > 0)) return [];
    const floorLandings = landings.filter(landing => landing.kind === 'floor-landing' && landing.level < floors);
    return floorLandings.map(landing => {
        const tangent = geometry.axis === 'x' ? landing.x : landing.z;
        const face = pointFor(geometry.axis, tangent, geometry.faceNormal, landing.y);
        return Object.freeze({
            id: `${routeId}:opening:floor:${landing.level}`,
            moduleKey: moduleKey ?? null,
            side: geometry.side,
            level: landing.level,
            x: face.x, y: landing.y, z: face.z,
            tangent,
            width, height,
            landingId: landing.id,
            nodeIds: landing.nodeIds,
        });
    });
}

function finalizePlan(plan) {
    if (!plan.nodes.length || !plan.landings.length || !plan.flights.length) return null;
    if ((plan.openings ?? []).length !== plan.floors) return null;
    const nodeById = new Map(plan.nodes.map(node => [node.id, node]));
    const landingById = new Map(plan.landings.map(landing => [landing.id, landing]));
    if (!nodeById.has(plan.groundNodeId) || !nodeById.has(plan.topNodeId)) return null;
    for (const node of plan.nodes) if (!landingById.has(node.landingId)) return null;
    for (const landing of plan.landings) {
        if (!landing.nodeIds.length || landing.nodeIds.some(id => !nodeById.has(id))) return null;
    }
    for (const opening of plan.openings ?? []) {
        if (!opening.id || opening.side !== plan.side || !(opening.width > 0) || !(opening.height > 0)) return null;
        if (!landingById.has(opening.landingId)) return null;
        if (opening.nodeIds.some(id => !nodeById.has(id))) return null;
    }
    for (const flight of plan.flights) {
        const from = nodeById.get(flight.fromNodeId);
        const to = nodeById.get(flight.toNodeId);
        if (!from || !to) return null;
        const fromAlong = flight.axis === 'x' ? from.x : from.z;
        const toAlong = flight.axis === 'x' ? to.x : to.z;
        const fromFixed = flight.axis === 'x' ? from.z : from.x;
        const toFixed = flight.axis === 'x' ? to.z : to.x;
        if (Math.abs(fromAlong - flight.from) > EPSILON || Math.abs(toAlong - flight.to) > EPSILON) return null;
        if (Math.abs(fromFixed - flight.fixedCoord) > EPSILON || Math.abs(toFixed - flight.fixedCoord) > EPSILON) return null;
        if (Math.abs(from.y - flight.y0) > EPSILON || Math.abs(to.y - flight.y1) > EPSILON) return null;
        if (flight.fitClassification !== 'fits-resolved-truth') return null;
    }
    if (!graphIsContinuous(plan)) return null;
    return Object.freeze({
        ...plan,
        nodes: Object.freeze(plan.nodes),
        landings: Object.freeze(plan.landings),
        flights: Object.freeze(plan.flights),
        openings: Object.freeze(plan.openings ?? []),
        fitStatus: 'fits-resolved-truth',
    });
}

function planStraight({ routeId, moduleKey, geometry, floors, floorH, truth, maxExteriorDepth, facadeMargin, wallGap, stableKey }) {
    const nominal = deriveStairFlight({ rise: floorH, truth, stableKey: `${stableKey}:straight:nominal` });
    if (nominal.fitClassification !== 'fits-resolved-truth') return null;
    const clearWidth = finitePositive(truth.stair.widthSI);
    const landingDepth = Math.max(clearWidth, finitePositive(truth.stair.landingDepthSI, clearWidth));
    const landingTangentSize = Math.max(landingDepth, finitePositive(truth?.door?.clearWidth?.realizedSI));
    const tangentNeed = nominal.requiredRun + landingTangentSize;
    const tangentAvailable = geometry.tangentHalf * 2 - facadeMargin * 2;
    const normalDepth = Math.max(clearWidth + 0.16, landingDepth);
    const exteriorDepth = wallGap + normalDepth;
    if (tangentNeed > tangentAvailable + EPSILON || exteriorDepth > maxExteriorDepth + EPSILON) return null;

    const run = nominal.requiredRun;
    const low = geometry.tangentCenter - run * 0.5;
    const high = geometry.tangentCenter + run * 0.5;
    const normal = geometry.faceNormal + geometry.outward * (wallGap + normalDepth * 0.5);
    const nodes = [];
    const landings = [];
    const flights = [];

    for (let level = 0; level <= floors; level++) {
        const along = level % 2 === 0 ? low : high;
        const landingId = `${routeId}:landing:floor:${level}`;
        const node = makeNode(routeId, `floor:${level}`, pointFor(geometry.axis, along, normal, level * floorH), landingId, {
            kind: level === 0 ? 'ground' : level === floors ? 'top' : 'floor', level,
        });
        nodes.push(node);
        landings.push(makeLanding(routeId, `floor:${level}`, geometry.axis, along, normal, landingTangentSize, normalDepth, level * floorH, [node.id], {
            kind: 'floor-landing', level,
        }));
        if (level === 0) continue;
        const flight = makeFlight({
            routeId,
            suffix: `floor:${level - 1}`,
            level: level - 1,
            segment: 0,
            axis: geometry.axis,
            fromNode: nodes[level - 1],
            toNode: node,
            truth,
            stableKey: `${stableKey}:straight:flight:${level - 1}`,
        });
        if (!flight) return null;
        flights.push(flight);
    }

    const openings = makeFacadeOpenings({ routeId, moduleKey, geometry, floors, truth, landings });
    return finalizePlan({
        schema: SCAFFOLD_CIRCULATION_PLAN_SCHEMA,
        id: routeId,
        moduleKey: moduleKey ?? null,
        face: Object.freeze({ moduleKey: moduleKey ?? null, side: geometry.side, rect: geometry.rect }),
        topology: 'alternating-straight',
        side: geometry.side,
        axis: geometry.axis,
        floors,
        floorH,
        clearWidth,
        landingDepth,
        landingTangentSize,
        exteriorDepth,
        tangentSpan: tangentNeed,
        facadeTangentAvailable: tangentAvailable,
        physicalTruth: truth,
        physicalTruthProvenance: truthProvenance(truth),
        groundNodeId: nodes[0]?.id,
        topNodeId: nodes[nodes.length - 1]?.id,
        nodes,
        landings,
        flights,
        openings,
    });
}

function planSwitchback({ routeId, moduleKey, geometry, floors, floorH, truth, maxExteriorDepth, facadeMargin, wallGap, stableKey }) {
    const clearWidth = finitePositive(truth.stair.widthSI);
    const landingDepth = Math.max(clearWidth, finitePositive(truth.stair.landingDepthSI, clearWidth));
    const landingTangentSize = Math.max(landingDepth, finitePositive(truth?.door?.clearWidth?.realizedSI));
    const laneGap = Math.max(0.12, clearWidth * 0.14);
    const normalDepth = clearWidth * 2 + laneGap;
    const exteriorDepth = wallGap + normalDepth;
    if (exteriorDepth > maxExteriorDepth + EPSILON) return null;

    const splitRiseA = floorH * 0.5;
    const splitRiseB = floorH - splitRiseA;
    const flightA = deriveStairFlight({ rise: splitRiseA, truth, stableKey: `${stableKey}:switchback:a` });
    const flightB = deriveStairFlight({ rise: splitRiseB, truth, stableKey: `${stableKey}:switchback:b` });
    const run = Math.max(flightA.requiredRun, flightB.requiredRun);
    const tangentNeed = run + landingTangentSize;
    const tangentAvailable = geometry.tangentHalf * 2 - facadeMargin * 2;
    if (tangentNeed > tangentAvailable + EPSILON) return null;

    const low = geometry.tangentCenter - run * 0.5;
    const high = geometry.tangentCenter + run * 0.5;
    const normalCenter = geometry.faceNormal + geometry.outward * (wallGap + normalDepth * 0.5);
    const laneOffset = (clearWidth + laneGap) * 0.5;
    const laneA = normalCenter - geometry.outward * laneOffset;
    const laneB = normalCenter + geometry.outward * laneOffset;
    const nodes = [];
    const landings = [];
    const flights = [];
    let current = null;

    for (let level = 0; level < floors; level++) {
        const y0 = level * floorH;
        const ym = y0 + splitRiseA;
        const y1 = y0 + floorH;
        const startLane = level % 2 === 0 ? laneA : laneB;
        const returnLane = level % 2 === 0 ? laneB : laneA;
        const floorLandingId = `${routeId}:landing:floor:${level}`;
        if (!current) {
            current = makeNode(routeId, `floor:${level}`, pointFor(geometry.axis, low, startLane, y0), floorLandingId, { kind: 'ground', level });
            nodes.push(current);
            landings.push(makeLanding(routeId, `floor:${level}`, geometry.axis, low, normalCenter, landingTangentSize, normalDepth, y0, [current.id], {
                kind: 'floor-landing', level,
            }));
        }

        const midLandingId = `${routeId}:landing:mid:${level}`;
        const midIn = makeNode(routeId, `mid:${level}:in`, pointFor(geometry.axis, high, startLane, ym), midLandingId, { kind: 'intermediate', level });
        const midOut = makeNode(routeId, `mid:${level}:out`, pointFor(geometry.axis, high, returnLane, ym), midLandingId, { kind: 'intermediate', level });
        const nextLandingId = `${routeId}:landing:floor:${level + 1}`;
        const next = makeNode(routeId, `floor:${level + 1}`, pointFor(geometry.axis, low, returnLane, y1), nextLandingId, {
            kind: level + 1 === floors ? 'top' : 'floor', level: level + 1,
        });
        nodes.push(midIn, midOut, next);
        landings.push(makeLanding(routeId, `mid:${level}`, geometry.axis, high, normalCenter, landingTangentSize, normalDepth, ym, [midIn.id, midOut.id], {
            kind: 'switchback-landing', level,
        }));
        landings.push(makeLanding(routeId, `floor:${level + 1}`, geometry.axis, low, normalCenter, landingTangentSize, normalDepth, y1, [next.id], {
            kind: 'floor-landing', level: level + 1,
        }));

        const a = makeFlight({
            routeId, suffix: `${level}:a`, level, segment: 0, axis: geometry.axis,
            fromNode: current, toNode: midIn, truth, stableKey: `${stableKey}:switchback:${level}:a`,
        });
        const b = makeFlight({
            routeId, suffix: `${level}:b`, level, segment: 1, axis: geometry.axis,
            fromNode: midOut, toNode: next, truth, stableKey: `${stableKey}:switchback:${level}:b`,
        });
        if (!a || !b) return null;
        flights.push(a, b);
        current = next;
    }

    const openings = makeFacadeOpenings({ routeId, moduleKey, geometry, floors, truth, landings });
    return finalizePlan({
        schema: SCAFFOLD_CIRCULATION_PLAN_SCHEMA,
        id: routeId,
        moduleKey: moduleKey ?? null,
        face: Object.freeze({ moduleKey: moduleKey ?? null, side: geometry.side, rect: geometry.rect }),
        topology: 'two-flight-switchback',
        side: geometry.side,
        axis: geometry.axis,
        floors,
        floorH,
        clearWidth,
        landingDepth,
        landingTangentSize,
        exteriorDepth,
        tangentSpan: tangentNeed,
        facadeTangentAvailable: tangentAvailable,
        physicalTruth: truth,
        physicalTruthProvenance: truthProvenance(truth),
        groundNodeId: nodes[0]?.id,
        topNodeId: current?.id,
        nodes,
        landings,
        flights,
        openings,
    });
}

export function planExteriorScaffoldRoute({
    fp,
    moduleKey = null,
    floors,
    floorH,
    side,
    seed = 0,
    physicalTruth,
    maxExteriorDepth = Infinity,
    facadeMargin = 0.18,
    wallGap = 0.10,
    routeId = null,
} = {}) {
    const count = Math.max(0, Math.floor(Number(floors) || 0));
    const rise = Number(floorH);
    if (count < 2 || !(rise > 0) || !physicalTruth?.stair) return null;
    const geometry = faceGeometry(fp, side);
    if (!geometry) return null;
    geometry.side = side;
    const exteriorDepth = Number.isFinite(maxExteriorDepth) ? Math.max(0, maxExteriorDepth) : Infinity;
    const id = routeId || `scaffold:${seed}:${side}`;
    const stableKey = `${id}:${seed}`;

    const straight = planStraight({
        routeId: id, moduleKey, geometry, floors: count, floorH: rise, truth: physicalTruth,
        maxExteriorDepth: exteriorDepth, facadeMargin, wallGap, stableKey,
    });
    if (straight) return straight;

    return planSwitchback({
        routeId: id, moduleKey, geometry, floors: count, floorH: rise, truth: physicalTruth,
        maxExteriorDepth: exteriorDepth, facadeMargin, wallGap, stableKey,
    });
}

export function scaffoldRouteIsContinuous(plan) {
    return !!plan && plan.fitStatus === 'fits-resolved-truth' && graphIsContinuous(plan);
}
