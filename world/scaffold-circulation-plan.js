import { deriveStairFlight } from './physical-truth.js';
import { assertCanonicalScaffoldSwitchback } from './stair-volume-contract.js';

export const SCAFFOLD_CIRCULATION_PLAN_SCHEMA = 'jweb.scaffold-circulation-plan.v2';
const EPSILON = 1e-9;

function finitePositive(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pointFor(axis, along, fixed, y) {
  return axis === 'x' ? { x: along, y, z: fixed } : { x: fixed, y, z: along };
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
  return { horizontal, axis, tangentCenter, tangentHalf, faceNormal, outward, rect, side };
}

function makeNode(routeId, suffix, point, landingId, extra = {}) {
  return Object.freeze({ id: `${routeId}:node:${suffix}`, landingId, ...point, ...extra });
}

function makeLanding(routeId, suffix, axis, tangentCenter, normalCenter, tangentSize, normalSize, y, nodeIds, extra = {}) {
  const center = pointFor(axis, tangentCenter, normalCenter, y);
  return Object.freeze({
    id: `${routeId}:landing:${suffix}`,
    ...center,
    sx: axis === 'x' ? tangentSize : normalSize,
    sz: axis === 'x' ? normalSize : tangentSize,
    tangentCenter,
    normalCenter,
    tangentSize,
    normalSize,
    y,
    nodeIds: Object.freeze([...nodeIds]),
    ...extra,
  });
}

function makeFlight({ routeId, suffix, level, segment, laneRole, axis, fromNode, toNode, truth, stableKey }) {
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
    level, segment, laneRole,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    fromLandingId: fromNode.landingId,
    toLandingId: toNode.landingId,
    axis, from, to, fixedCoord,
    halfWidth: truth.stair.widthSI * 0.5,
    y0: fromNode.y, y1: toNode.y,
    run, rise,
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
    for (const a of landing.nodeIds) for (const b of landing.nodeIds) if (a !== b) adjacency.get(a)?.add(b);
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
  return landings
    .filter(landing => landing.kind === 'floor-landing' && landing.level < floors)
    .map(landing => {
      const tangent = landing.tangentCenter;
      const face = pointFor(geometry.axis, tangent, geometry.faceNormal, landing.y);
      return Object.freeze({
        id: `${routeId}:opening:floor:${landing.level}`,
        moduleKey: moduleKey ?? null,
        side: geometry.side,
        level: landing.level,
        x: face.x, y: landing.y, z: face.z,
        tangent, width, height,
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
  for (const landing of plan.landings) if (!landing.nodeIds.length || landing.nodeIds.some(id => !nodeById.has(id))) return null;
  for (const opening of plan.openings ?? []) {
    if (!opening.id || opening.side !== plan.side || !(opening.width > 0) || !(opening.height > 0)) return null;
    if (!landingById.has(opening.landingId) || opening.nodeIds.some(id => !nodeById.has(id))) return null;
  }
  for (const flight of plan.flights) {
    const from = nodeById.get(flight.fromNodeId), to = nodeById.get(flight.toNodeId);
    if (!from || !to || flight.fitClassification !== 'fits-resolved-truth') return null;
  }
  if (!graphIsContinuous(plan)) return null;
  const frozen = Object.freeze({
    ...plan,
    nodes: Object.freeze(plan.nodes),
    landings: Object.freeze(plan.landings),
    flights: Object.freeze(plan.flights),
    openings: Object.freeze(plan.openings ?? []),
    fitStatus: 'fits-resolved-truth',
  });
  assertCanonicalScaffoldSwitchback(frozen);
  return frozen;
}

function planCanonicalSwitchback({ routeId, siteId, moduleKey, geometry, floors, floorH, truth, maxExteriorDepth, facadeMargin, wallGap, stableKey }) {
  const clearWidth = finitePositive(truth.stair.widthSI);
  const landingDepth = Math.max(clearWidth, finitePositive(truth.stair.landingDepthSI, clearWidth));
  const landingTangentSize = Math.max(landingDepth, finitePositive(truth?.door?.clearWidth?.realizedSI));
  const laneGap = Math.max(0.12, clearWidth * 0.14);
  const normalDepth = clearWidth * 2 + laneGap;
  const exteriorDepth = wallGap + normalDepth;
  if (exteriorDepth > maxExteriorDepth + EPSILON) return null;

  const splitRiseA = floorH * 0.5;
  const splitRiseB = floorH - splitRiseA;
  const nominalA = deriveStairFlight({ rise: splitRiseA, truth, stableKey: `${stableKey}:switchback:a` });
  const nominalB = deriveStairFlight({ rise: splitRiseB, truth, stableKey: `${stableKey}:switchback:b` });
  if (nominalA.fitClassification !== 'fits-resolved-truth' || nominalB.fitClassification !== 'fits-resolved-truth') return null;
  const run = Math.max(nominalA.requiredRun, nominalB.requiredRun);
  const tangentNeed = run + landingTangentSize * 2;
  const tangentAvailable = geometry.tangentHalf * 2 - facadeMargin * 2;
  if (tangentNeed > tangentAvailable + EPSILON) return null;

  // The two flights live in one rectangular prism. The run occupies the center;
  // full-width landings live beyond either end, never centered over a flight.
  const runLow = geometry.tangentCenter - run * 0.5;
  const runHigh = geometry.tangentCenter + run * 0.5;
  const floorLandingCenter = runLow - landingTangentSize * 0.5;
  const turnLandingCenter = runHigh + landingTangentSize * 0.5;
  const normalCenter = geometry.faceNormal + geometry.outward * (wallGap + normalDepth * 0.5);
  const laneOffset = (clearWidth + laneGap) * 0.5;
  const streetLaneCoord = normalCenter + geometry.outward * laneOffset;
  const buildingLaneCoord = normalCenter - geometry.outward * laneOffset;
  const nodes = [];
  const landings = [];
  const flights = [];

  const floorNodes = [];
  for (let level = 0; level <= floors; level++) {
    const landingId = `${routeId}:landing:floor:${level}`;
    const streetNode = makeNode(routeId, `floor:${level}:street`, pointFor(geometry.axis, runLow, streetLaneCoord, level * floorH), landingId, {
      kind: level === 0 ? 'ground' : level === floors ? 'top' : 'floor', level, laneRole: 'street-half',
    });
    const buildingNode = makeNode(routeId, `floor:${level}:building`, pointFor(geometry.axis, runLow, buildingLaneCoord, level * floorH), landingId, {
      kind: level === 0 ? 'ground' : level === floors ? 'top' : 'floor', level, laneRole: 'building-half',
    });
    nodes.push(streetNode, buildingNode);
    floorNodes.push({ streetNode, buildingNode });
    landings.push(makeLanding(routeId, `floor:${level}`, geometry.axis, floorLandingCenter, normalCenter,
      landingTangentSize, normalDepth, level * floorH, [streetNode.id, buildingNode.id], {
        kind: 'floor-landing', level, landingPosition: 'run-low-beyond',
      }));
  }

  for (let level = 0; level < floors; level++) {
    const y0 = level * floorH, ym = y0 + splitRiseA, y1 = y0 + floorH;
    const midLandingId = `${routeId}:landing:mid:${level}`;
    const midStreet = makeNode(routeId, `mid:${level}:street`, pointFor(geometry.axis, runHigh, streetLaneCoord, ym), midLandingId, {
      kind: 'intermediate', level, laneRole: 'street-half',
    });
    const midBuilding = makeNode(routeId, `mid:${level}:building`, pointFor(geometry.axis, runHigh, buildingLaneCoord, ym), midLandingId, {
      kind: 'intermediate', level, laneRole: 'building-half',
    });
    nodes.push(midStreet, midBuilding);
    landings.push(makeLanding(routeId, `mid:${level}`, geometry.axis, turnLandingCenter, normalCenter,
      landingTangentSize, normalDepth, ym, [midStreet.id, midBuilding.id], {
        kind: 'switchback-landing', level, landingPosition: 'run-high-beyond',
      }));

    const a = makeFlight({
      routeId, suffix: `${level}:a`, level, segment: 0, laneRole: 'street-half', axis: geometry.axis,
      fromNode: floorNodes[level].streetNode, toNode: midStreet, truth, stableKey: `${stableKey}:switchback:${level}:a`,
    });
    const b = makeFlight({
      routeId, suffix: `${level}:b`, level, segment: 1, laneRole: 'building-half', axis: geometry.axis,
      fromNode: midBuilding, toNode: floorNodes[level + 1].buildingNode, truth, stableKey: `${stableKey}:switchback:${level}:b`,
    });
    if (!a || !b) return null;
    flights.push(a, b);
  }

  const openings = makeFacadeOpenings({ routeId, moduleKey, geometry, floors, truth, landings });
  const scaffoldEnvelope = Object.freeze({
    schema: 'jweb.scaffold-envelope.v1',
    faceNormal: geometry.faceNormal,
    outward: geometry.outward,
    normalCenter,
    normalDepth,
    exteriorDepth,
    laneWidth: clearWidth,
    laneGap,
    laneOffset,
    streetLaneCoord,
    buildingLaneCoord,
    runLow,
    runHigh,
    run,
    landingTangentSize,
    floorLandingCenter,
    turnLandingCenter,
    tangentSpan: tangentNeed,
  });
  return finalizePlan({
    schema: SCAFFOLD_CIRCULATION_PLAN_SCHEMA,
    id: routeId,
    siteId: siteId ?? null,
    moduleKey: moduleKey ?? null,
    face: Object.freeze({ moduleKey: moduleKey ?? null, side: geometry.side, rect: geometry.rect }),
    topology: 'canonical-scaffold-switchback',
    side: geometry.side,
    axis: geometry.axis,
    floors, floorH,
    clearWidth, landingDepth, landingTangentSize,
    exteriorDepth, tangentSpan: tangentNeed,
    facadeTangentAvailable: tangentAvailable,
    scaffoldEnvelope,
    physicalTruth: truth,
    physicalTruthProvenance: truthProvenance(truth),
    groundNodeId: floorNodes[0]?.streetNode.id,
    topNodeId: floorNodes[floors]?.buildingNode.id,
    nodes, landings, flights, openings,
  });
}

export function planExteriorScaffoldRoute({
  fp, siteId = null, moduleKey = null, floors, floorH, side, seed = 0, physicalTruth,
  maxExteriorDepth = Infinity, facadeMargin = 0.18, wallGap = 0.10, routeId = null,
} = {}) {
  const count = Math.max(0, Math.floor(Number(floors) || 0));
  const rise = Number(floorH);
  if (count < 2 || !(rise > 0) || !physicalTruth?.stair) return null;
  const geometry = faceGeometry(fp, side);
  if (!geometry) return null;
  const exteriorDepth = Number.isFinite(maxExteriorDepth) ? Math.max(0, maxExteriorDepth) : Infinity;
  const id = routeId || `scaffold:${seed}:${side}`;
  return planCanonicalSwitchback({
    routeId: id, siteId, moduleKey, geometry, floors: count, floorH: rise, truth: physicalTruth,
    maxExteriorDepth: exteriorDepth, facadeMargin, wallGap, stableKey: `${id}:${seed}`,
  });
}

export function scaffoldRouteIsContinuous(plan) {
  if (!plan || plan.fitStatus !== 'fits-resolved-truth' || !graphIsContinuous(plan)) return false;
  try { return assertCanonicalScaffoldSwitchback(plan); } catch { return false; }
}
