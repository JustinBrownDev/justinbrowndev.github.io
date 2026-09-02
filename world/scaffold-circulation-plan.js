import { FACADE_STAIR_AUTHORITY_SCHEMA, planAlternatingFacadeStair } from './facade-stair-authority.js';
import { assertCanonicalFacadeZigzag } from './stair-volume-contract.js';

export const SCAFFOLD_CIRCULATION_PLAN_SCHEMA = 'jweb.scaffold-circulation-plan.v3';
const EPS = 1e-7;

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
    clearWidth * 1.20,
    finitePositive(physicalTruth.stair.landingDepthSI, clearWidth),
    doorWidth + 0.28,
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
  });
  if (!geometry) return null;

  // The graph-paper scheme is one full-story flight between alternating end
  // landings. Both end landings live beyond the run, never over the flight below.
  const tangentNeed = geometry.run + landingTangentSize * 2;
  if (tangentNeed > geometry.tangentAvailable + EPS) return null;
  const lowLandingCenter = geometry.runLow - landingTangentSize * 0.5;
  const highLandingCenter = geometry.runHigh + landingTangentSize * 0.5;

  const innerCoord = geometry.orientation.faceCoord + geometry.orientation.outward * 0.03;
  const outerCoord = geometry.orientation.fixedCoord + geometry.orientation.outward * (geometry.halfWidth + 0.16);
  const normalCenter = (innerCoord + outerCoord) * 0.5;
  const normalDepth = Math.abs(outerCoord - innerCoord);
  const exteriorDepth = geometry.orientation.outward * (outerCoord - geometry.orientation.faceCoord);
  if (!(normalDepth > clearWidth * 0.75) || exteriorDepth > Number(maxExteriorDepth) + EPS) return null;

  const nodes = [];
  const landings = [];
  for (let level = 0; level <= count; level++) {
    const anchor = geometry.landingAnchors[level];
    const runLowSide = anchor.sideRole === 'run-low';
    const tangentCenter = runLowSide ? lowLandingCenter : highLandingCenter;
    const landingCenter = pointFor(geometry.orientation.tangentAxis, tangentCenter, normalCenter, level * rise);
    const nodePoint = pointFor(geometry.orientation.tangentAxis, anchor.tangent, geometry.orientation.fixedCoord, level * rise);
    const landingId = `${id}:landing:floor:${level}`;
    const node = Object.freeze({
      id: `${id}:node:floor:${level}`,
      landingId,
      ...nodePoint,
      kind: level === 0 ? 'ground' : level === count ? 'top' : 'floor',
      level,
      laneRole: 'wall-flight',
    });
    nodes.push(node);
    landings.push(Object.freeze({
      id: landingId,
      ...landingCenter,
      sx: geometry.orientation.tangentAxis === 'x' ? landingTangentSize : normalDepth,
      sz: geometry.orientation.tangentAxis === 'x' ? normalDepth : landingTangentSize,
      tangentCenter,
      normalCenter,
      tangentSize: landingTangentSize,
      normalSize: normalDepth,
      y: level * rise,
      nodeIds: Object.freeze([node.id]),
      kind: level === 0 ? 'ground-landing' : level === count ? 'top-landing' : 'floor-landing',
      level,
      landingPosition: runLowSide ? 'run-low-beyond' : 'run-high-beyond',
      stairEndpointTangent: anchor.tangent,
      geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    }));
  }

  const flights = geometry.flights.map((flight, level) => Object.freeze({
    ...flight,
    id: `${id}:flight:${level}`,
    level,
    segment: 0,
    laneRole: 'wall-flight',
    fromNodeId: nodes[level].id,
    toNodeId: nodes[level + 1].id,
    fromLandingId: landings[level].id,
    toLandingId: landings[level + 1].id,
  }));

  // Preserve the existing wall-opening contract: one route-owned opening per
  // served floor, including ground, and no invented extra doorway at the roof top.
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
    schema: 'jweb.scaffold-envelope.v2',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    faceNormal: geometry.orientation.faceCoord,
    outward: geometry.orientation.outward,
    fixedCoord: geometry.orientation.fixedCoord,
    normalCenter,
    normalDepth,
    exteriorDepth,
    clearWidth,
    runLow: geometry.runLow,
    runHigh: geometry.runHigh,
    run: geometry.run,
    landingTangentSize,
    lowLandingCenter,
    highLandingCenter,
    tangentSpan: tangentNeed,
  });

  const plan = Object.freeze({
    schema: SCAFFOLD_CIRCULATION_PLAN_SCHEMA,
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
    clearWidth,
    landingDepth: landingTangentSize,
    landingTangentSize,
    exteriorDepth,
    tangentSpan: tangentNeed,
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
