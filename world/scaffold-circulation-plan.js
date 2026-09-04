import { FACADE_STAIR_AUTHORITY_SCHEMA, planAlternatingFacadeStair } from './facade-stair-authority.js';
import { STAIR_WALKABILITY_DESIGN_INTENT, STAIR_WALKABILITY_INTENT, assertCanonicalFacadeZigzag } from './stair-volume-contract.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1

export const SCAFFOLD_CIRCULATION_PLAN_SCHEMA = 'jweb.scaffold-circulation-plan.v4';

function finitePositive(value, fallback = 0) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
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

function graphIsContinuous(plan) {
  const adjacency = new Map(plan.nodes.map(node => [node.id, new Set()]));
  for (const flight of plan.flights) {
    adjacency.get(flight.fromNodeId)?.add(flight.toNodeId);
    adjacency.get(flight.toNodeId)?.add(flight.fromNodeId);
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

function makeOpening({ routeId, moduleKey, side, axis, faceCoord, landing, width, height }) {
  const face = pointFor(axis, landing.tangentCenter, faceCoord, landing.y);
  return Object.freeze({
    id: `${routeId}:opening:floor:${landing.level}`,
    moduleKey: moduleKey ?? null,
    side,
    level: landing.level,
    x: face.x,
    y: landing.y,
    z: face.z,
    tangent: landing.tangentCenter,
    width,
    height,
    landingId: landing.id,
    nodeIds: landing.nodeIds,
  });
}

export function scaffoldRouteIsContinuous(plan) {
  return !!plan && graphIsContinuous(plan);
}

export function planExteriorScaffoldRoute({
  fp,
  siteId = null,
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
  const id = routeId ?? `scaffold:${siteId ?? 'site'}:${moduleKey ?? 'module'}:${side}:${seed}`;
  const clearWidth = finitePositive(physicalTruth.stair.widthSI, 0.9);
  const doorWidth = finitePositive(physicalTruth?.door?.clearWidth?.realizedSI, 0.9);
  const doorHeight = finitePositive(physicalTruth?.door?.clearHeight?.realizedSI, 2.0);
  const landingTangentSize = Math.max(
    clearWidth * 1.30,
    finitePositive(physicalTruth.stair.landingDepthSI, clearWidth),
    doorWidth + 0.30,
  );

  const geometry = planAlternatingFacadeStair({
    routeId: `${id}:geometry`,
    fp,
    side,
    floors: count,
    floorH: rise,
    physicalTruth,
    stableKey: `${id}:${seed}`,
    maxRun: Infinity,
    facadeMargin: Math.max(0.10, Number(facadeMargin) || 0),
    wallGap: Math.max(0.08, Number(wallGap) || 0),
    landingTangentSize,
  });
  if (!geometry) return null;

  const exteriorDepth = geometry.orientation.outward * (
    geometry.landingNormalCenter + geometry.orientation.outward * geometry.landingNormalSize * 0.5
    - geometry.orientation.faceCoord
  );
  if (exteriorDepth > Number(maxExteriorDepth) + 1e-7) return null;

  const nodes = [];
  const landings = geometry.landings.map((source, level) => {
    const nodePoint = pointFor(
      geometry.orientation.tangentAxis,
      source.tangentCenter,
      geometry.landingNormalCenter,
      source.y,
    );
    const landingId = `${id}:landing:floor:${level}`;
    const node = Object.freeze({
      id: `${id}:node:floor:${level}`,
      landingId,
      ...nodePoint,
      kind: level === 0 ? 'ground' : level === count ? 'top' : 'floor',
      level,
      laneRole: 'horizontal-landing-circulation',
    });
    nodes.push(node);
    return Object.freeze({
      id: landingId,
      x: source.geometry.x,
      z: source.geometry.z,
      sx: source.geometry.hx * 2,
      sz: source.geometry.hz * 2,
      tangentCenter: source.tangentCenter,
      normalCenter: source.normalCenter,
      tangentSize: source.tangentSize,
      normalSize: source.normalSize,
      y: source.y,
      nodeIds: Object.freeze([node.id]),
      kind: level === 0 ? 'ground-landing' : level === count ? 'top-landing' : 'floor-landing',
      level,
      landingPosition: source.sideRole === 'run-low' ? 'run-low-beyond' : 'run-high-beyond',
      stairEndpointTangent: source.stairMouthTangent,
      incomingMouth: source.incomingMouth,
      outgoingMouth: source.outgoingMouth,
      targetPoint: source.targetPoint,
      geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
      circulationRole: 'horizontal-access-space',
      stairCarveAllowed: false,
    });
  });

  const flights = geometry.flights.map((flight, level) => Object.freeze({
    ...flight,
    id: `${id}:flight:${level}`,
    level,
    segment: 0,
    laneRole: `stair-lane-${flight.laneIndex}`,
    fromNodeId: nodes[level].id,
    toNodeId: nodes[level + 1].id,
    fromLandingId: landings[level].id,
    toLandingId: landings[level + 1].id,
    fromMouth: landings[level].outgoingMouth,
    toMouth: landings[level + 1].incomingMouth,
  }));

  const openings = landings
    .filter(landing => landing.level < count)
    .map(landing => makeOpening({
      routeId: id,
      moduleKey,
      side,
      axis: geometry.orientation.tangentAxis,
      faceCoord: geometry.orientation.faceCoord,
      landing,
      width: doorWidth,
      height: doorHeight,
    }));

  const scaffoldEnvelope = Object.freeze({
    schema: 'jweb.scaffold-envelope.v3',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    faceNormal: geometry.orientation.faceCoord,
    outward: geometry.orientation.outward,
    normalCenter: geometry.landingNormalCenter,
    normalDepth: geometry.landingNormalSize,
    exteriorDepth,
    clearWidth: geometry.clearWidth,
    laneGap: geometry.laneGap,
    laneCoords: geometry.laneCoords,
    runLow: geometry.runLow,
    runHigh: geometry.runHigh,
    run: geometry.run,
    landingTangentSize: geometry.landingTangentSize,
    tangentSpan: geometry.totalTangentNeed,
  });

  const plan = Object.freeze({
    schema: SCAFFOLD_CIRCULATION_PLAN_SCHEMA,
    designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
    intentTag: STAIR_WALKABILITY_INTENT,
    id,
    siteId,
    moduleKey,
    face: Object.freeze({ moduleKey: moduleKey ?? null, side, rect: Object.freeze({ ...fp }) }),
    topology: 'canonical-facade-zigzag',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    side,
    axis: geometry.orientation.tangentAxis,
    floors: count,
    floorH: rise,
    clearWidth: geometry.clearWidth,
    landingDepth: geometry.landingTangentSize,
    landingTangentSize: geometry.landingTangentSize,
    landingNormalSize: geometry.landingNormalSize,
    laneGap: geometry.laneGap,
    laneCoords: geometry.laneCoords,
    exteriorDepth,
    tangentSpan: geometry.totalTangentNeed,
    facadeTangentAvailable: geometry.tangentAvailable,
    scaffoldEnvelope,
    physicalTruth,
    physicalTruthProvenance: truthProvenance(physicalTruth),
    groundNodeId: nodes[0].id,
    topNodeId: nodes[nodes.length - 1].id,
    nodes: Object.freeze(nodes),
    landings: Object.freeze(landings),
    flights: Object.freeze(flights),
    openings: Object.freeze(openings),
    fitStatus: 'fits-resolved-truth',
  });
  if (openings.length !== count || !graphIsContinuous(plan)) return null;
  assertCanonicalFacadeZigzag(plan);
  return plan;
}
