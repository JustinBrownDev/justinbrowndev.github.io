import { deriveStairFlight } from './physical-truth.js';
import { STAIR_WALKABILITY_DESIGN_INTENT, STAIR_WALKABILITY_INTENT, assertFacadeStairWalkability } from './stair-volume-contract.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1

export const FACADE_STAIR_AUTHORITY_SCHEMA = 'jweb.facade-stair-authority.v2';
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

function faceGeometry(fp, side) {
  if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
  const cx = Number(fp.cx);
  const cz = Number(fp.cz);
  const halfX = Number(fp.halfX);
  const halfZ = Number(fp.halfZ);
  if (![cx, cz, halfX, halfZ].every(Number.isFinite) || !(halfX > 0) || !(halfZ > 0)) return null;
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

function pointFor(axis, along, fixed, y) {
  return axis === 'x' ? { x: along, y, z: fixed } : { x: fixed, y, z: along };
}

function landingSide(floor, initialDirection) {
  // A + initial direction begins on run-low and lands on run-high.
  const sign = (floor % 2 === 0 ? -1 : 1) * initialDirection;
  return sign < 0 ? 'run-low' : 'run-high';
}

function landingCenterFor({ center, run, landingTangentSize, side }) {
  const offset = run * 0.5 + landingTangentSize * 0.5;
  return center + (side === 'run-low' ? -offset : offset);
}

function preferredCenter({ floors, run, landingTangentSize, initialDirection, preferredLandingTangents, centerMin, centerMax, fallbackCenter }) {
  const centers = [];
  for (let floor = 0; floor <= floors; floor++) {
    const values = preferredLandingTangents?.[floor] ?? [];
    if (!values.length) continue;
    const side = landingSide(floor, initialDirection);
    const offset = run * 0.5 + landingTangentSize * 0.5;
    for (const raw of values) {
      const tangent = Number(raw);
      if (!Number.isFinite(tangent)) continue;
      centers.push(tangent - (side === 'run-low' ? -offset : offset));
    }
  }
  if (!centers.length) return clamp(fallbackCenter, centerMin, centerMax);
  return clamp(centers.reduce((sum, value) => sum + value, 0) / centers.length, centerMin, centerMax);
}

function centerScore({ floors, run, landingTangentSize, center, initialDirection, preferredLandingTangents }) {
  let score = 0;
  let count = 0;
  for (let floor = 0; floor <= floors; floor++) {
    const values = preferredLandingTangents?.[floor] ?? [];
    if (!values.length) continue;
    const predicted = landingCenterFor({
      center,
      run,
      landingTangentSize,
      side: landingSide(floor, initialDirection),
    });
    for (const raw of values) {
      const tangent = Number(raw);
      if (!Number.isFinite(tangent)) continue;
      const delta = tangent - predicted;
      score += delta * delta;
      count++;
    }
  }
  return count ? score / count : 0;
}

function rectForLanding({ geometry, tangentCenter, tangentSize, normalCenter, normalSize }) {
  return Object.freeze(geometry.tangentAxis === 'x'
    ? { x: tangentCenter, z: normalCenter, hx: tangentSize * 0.5, hz: normalSize * 0.5 }
    : { x: normalCenter, z: tangentCenter, hx: normalSize * 0.5, hz: tangentSize * 0.5 });
}

function flightClearance({ axis, from, to, fixedCoord, halfWidth, y, routeId, flightId, landingId, headroom }) {
  const center = (Number(from) + Number(to)) * 0.5;
  const halfRun = Math.abs(Number(to) - Number(from)) * 0.5;
  const crossMargin = 0.10;
  return Object.freeze(axis === 'x'
    ? { x: center, z: fixedCoord, hx: halfRun, hz: halfWidth + crossMargin, y, routeId, flightId, landingId, requiredHeadroom: headroom }
    : { x: fixedCoord, z: center, hx: halfWidth + crossMargin, hz: halfRun, y, routeId, flightId, landingId, requiredHeadroom: headroom });
}

function positiveRectOverlap(a, b) {
  return Math.abs(Number(a.x) - Number(b.x)) < Number(a.hx) + Number(b.hx) - EPS
    && Math.abs(Number(a.z) - Number(b.z)) < Number(a.hz) + Number(b.hz) - EPS;
}

function flightPlanRect(flight) {
  const center = (Number(flight.from) + Number(flight.to)) * 0.5;
  const halfRun = Math.abs(Number(flight.to) - Number(flight.from)) * 0.5;
  return flight.axis === 'x'
    ? { x: center, z: flight.fixedCoord, hx: halfRun, hz: flight.halfWidth }
    : { x: flight.fixedCoord, z: center, hx: flight.halfWidth, hz: halfRun };
}

export function assertFacadeStairAuthority(plan) {
  assertFacadeStairWalkability(plan);
  if (!plan || plan.schema !== FACADE_STAIR_AUTHORITY_SCHEMA) throw new Error('facade stair authority schema missing');
  if (plan.topology !== 'landing-routed-facade-zigzag') throw new Error(`${plan.id}: facade stair topology drift`);
  if (!(plan.floors >= 1) || plan.flights.length !== plan.floors) throw new Error(`${plan.id}: one full-story flight is required per floor rise`);
  if (plan.landings.length !== plan.floors + 1) throw new Error(`${plan.id}: every floor elevation needs one landing`);
  if (!(plan.landingNormalSize > plan.clearWidth + EPS)) throw new Error(`${plan.id}: landing must be wider than a stair flight`);
  if (plan.laneCoords.length !== 2 || Math.abs(plan.laneCoords[0] - plan.laneCoords[1]) < plan.clearWidth + plan.laneGap - EPS) {
    throw new Error(`${plan.id}: two separated stair lanes are required`);
  }

  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i];
    const lower = plan.landings[i];
    const upper = plan.landings[i + 1];
    if (flight.fitClassification !== 'fits-resolved-truth') throw new Error(`${plan.id}: flight ${i} escaped resolved stair truth`);
    if (Math.abs(flight.rise - plan.floorH) > EPS) throw new Error(`${plan.id}: flight ${i} is not a full-story rise`);
    if (flight.laneIndex !== i % 2) throw new Error(`${plan.id}: flight ${i} did not alternate normal lane`);
    if (Math.abs(flight.fixedCoord - plan.laneCoords[flight.laneIndex]) > EPS) throw new Error(`${plan.id}: flight ${i} left its assigned lane`);
    if (lower.outgoingMouth?.laneIndex !== flight.laneIndex || upper.incomingMouth?.laneIndex !== flight.laneIndex) {
      throw new Error(`${plan.id}: flight ${i} must hook onto landing mouths, not target centers`);
    }
    const flightRect = flightPlanRect(flight);
    if (positiveRectOverlap(flightRect, lower.geometry) || positiveRectOverlap(flightRect, upper.geometry)) {
      throw new Error(`${plan.id}: flight ${i} intersects a landing instead of touching its edge`);
    }
    if (i > 0) {
      const previous = plan.flights[i - 1];
      if (Math.sign(previous.to - previous.from) === Math.sign(flight.to - flight.from)) {
        throw new Error(`${plan.id}: adjacent full-story flights must reverse direction`);
      }
      if (positiveRectOverlap(flightPlanRect(previous), flightRect)) {
        throw new Error(`${plan.id}: adjacent flights overlap in plan and will violate player headroom`);
      }
      const turnLanding = plan.landings[i];
      if (turnLanding.incomingMouth?.laneIndex === turnLanding.outgoingMouth?.laneIndex) {
        throw new Error(`${plan.id}: turn landing must transfer between the two stair lanes`);
      }
    }
  }
  return true;
}

export function planAlternatingFacadeStair({
  routeId,
  fp,
  side,
  floors,
  floorH,
  physicalTruth,
  stableKey = routeId,
  maxRun = Infinity,
  facadeMargin = 0.22,
  wallGap = 0.18,
  laneGap = null,
  landingTangentSize = null,
  preferredLandingTangents = null,
} = {}) {
  const count = Math.max(0, Math.floor(Number(floors) || 0));
  const rise = Number(floorH);
  if (!routeId || count < 1 || !(rise > 0) || !physicalTruth?.stair) return null;
  const geometry = faceGeometry(fp, side);
  if (!geometry) return null;

  const clearWidth = clamp(Number(physicalTruth.stair.widthSI) || 0.9, 0.72, 1.45);
  const halfWidth = clearWidth * 0.5;
  const doorWidth = Number(physicalTruth?.door?.clearWidth?.realizedSI) || clearWidth;
  // Preserve the proven zig-zag topology, but size its horizontal circulation
  // like a place a person can turn and approach a door, not a minimum-width node.
  const landingSize = Math.max(
    clearWidth * 1.55,
    Number(landingTangentSize) || 0,
    Number(physicalTruth.stair.landingDepthSI) || 0,
    doorWidth + 0.48,
  );
  const resolvedLaneGap = Math.max(0.20, Number(laneGap) || clearWidth * 0.24);
  const landingNormalSize = clearWidth * 2 + resolvedLaneGap;
  const margin = Math.max(0.10, Number(facadeMargin) || 0);
  const tangentMin = geometry.tangentCenter - geometry.tangentHalf + margin;
  const tangentMax = geometry.tangentCenter + geometry.tangentHalf - margin;
  const tangentAvailable = tangentMax - tangentMin;

  const nominal = [];
  for (let level = 0; level < count; level++) {
    const flight = deriveStairFlight({ rise, truth: physicalTruth, stableKey: `${stableKey}:story:${level}` });
    if (flight.fitClassification !== 'fits-resolved-truth') return null;
    nominal.push(flight);
  }
  const run = Math.max(...nominal.map(flight => Number(flight.requiredRun)));
  const totalTangentNeed = run + landingSize * 2;
  if (!(run > EPS) || run > Number(maxRun) || totalTangentNeed > tangentAvailable + EPS) return null;

  const centerMin = tangentMin + landingSize + run * 0.5;
  const centerMax = tangentMax - landingSize - run * 0.5;
  if (centerMax < centerMin - EPS) return null;
  const tieDirection = (hash32(`${stableKey}:initial-direction`) & 1) ? 1 : -1;
  const candidates = [tieDirection, -tieDirection].map(initialDirection => {
    const center = preferredCenter({
      floors: count, run, landingTangentSize: landingSize, initialDirection, preferredLandingTangents,
      centerMin, centerMax, fallbackCenter: geometry.tangentCenter,
    });
    return {
      initialDirection,
      center,
      score: centerScore({ floors: count, run, landingTangentSize: landingSize, center, initialDirection, preferredLandingTangents }),
    };
  }).sort((a, b) => a.score - b.score || (a.initialDirection === tieDirection ? -1 : 1));
  const chosen = candidates[0];
  const runLow = chosen.center - run * 0.5;
  const runHigh = chosen.center + run * 0.5;

  const resolvedWallGap = Math.max(0.08, Number(wallGap) || 0);
  const innerLane = geometry.faceCoord + geometry.outward * (resolvedWallGap + halfWidth);
  const outerLane = innerLane + geometry.outward * (clearWidth + resolvedLaneGap);
  const laneCoords = Object.freeze([innerLane, outerLane]);
  const normalInnerEdge = geometry.faceCoord + geometry.outward * resolvedWallGap;
  const normalOuterEdge = outerLane + geometry.outward * halfWidth;
  const landingNormalCenter = (normalInnerEdge + normalOuterEdge) * 0.5;
  const headroom = Number(physicalTruth.stair.headroomSI) || Number(physicalTruth.route?.headroomSI) || 2.03;

  const landings = [];
  for (let floor = 0; floor <= count; floor++) {
    const sideRole = landingSide(floor, chosen.initialDirection);
    const stairMouthTangent = sideRole === 'run-low' ? runLow : runHigh;
    const tangentCenter = sideRole === 'run-low'
      ? runLow - landingSize * 0.5
      : runHigh + landingSize * 0.5;
    const incomingLaneIndex = floor > 0 ? (floor - 1) % 2 : null;
    const outgoingLaneIndex = floor < count ? floor % 2 : null;
    const incomingMouth = incomingLaneIndex === null ? null : Object.freeze({
      laneIndex: incomingLaneIndex,
      tangent: stairMouthTangent,
      fixedCoord: laneCoords[incomingLaneIndex],
      point: Object.freeze(pointFor(geometry.tangentAxis, stairMouthTangent, laneCoords[incomingLaneIndex], floor * rise)),
    });
    const outgoingMouth = outgoingLaneIndex === null ? null : Object.freeze({
      laneIndex: outgoingLaneIndex,
      tangent: stairMouthTangent,
      fixedCoord: laneCoords[outgoingLaneIndex],
      point: Object.freeze(pointFor(geometry.tangentAxis, stairMouthTangent, laneCoords[outgoingLaneIndex], floor * rise)),
    });
    landings.push(Object.freeze({
      id: `${routeId}:landing:${floor}`,
      floor,
      y: floor * rise,
      sideRole,
      tangentCenter,
      tangentSize: landingSize,
      normalCenter: landingNormalCenter,
      normalSize: landingNormalSize,
      stairMouthTangent,
      incomingMouth,
      outgoingMouth,
      geometry: rectForLanding({
        geometry,
        tangentCenter,
        tangentSize: landingSize,
        normalCenter: landingNormalCenter,
        normalSize: landingNormalSize,
      }),
      targetPoint: Object.freeze(pointFor(geometry.tangentAxis, tangentCenter, geometry.faceCoord, floor * rise)),
    }));
  }

  const flights = [];
  for (let level = 0; level < count; level++) {
    const lower = landings[level];
    const upper = landings[level + 1];
    const laneIndex = level % 2;
    const from = lower.stairMouthTangent;
    const to = upper.stairMouthTangent;
    const fixedCoord = laneCoords[laneIndex];
    const stairFlight = deriveStairFlight({
      rise,
      truth: physicalTruth,
      stableKey: `${stableKey}:story:${level}`,
      availableRun: run,
    });
    if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
    const id = `${routeId}:flight:${level}`;
    flights.push(Object.freeze({
      id,
      level,
      segment: 0,
      axis: geometry.tangentAxis,
      from,
      to,
      fixedCoord,
      laneIndex,
      halfWidth,
      y0: level * rise,
      y1: (level + 1) * rise,
      run,
      rise,
      clearWidth,
      headroom,
      stairFlight,
      fitClassification: stairFlight.fitClassification,
      fromLandingId: lower.id,
      toLandingId: upper.id,
      fromMouth: lower.outgoingMouth,
      toMouth: upper.incomingMouth,
      headroomClearance: flightClearance({
        axis: geometry.tangentAxis,
        from,
        to,
        fixedCoord,
        halfWidth,
        y: (level + 1) * rise,
        routeId,
        flightId: id,
        landingId: upper.id,
        headroom,
      }),
    }));
  }

  const plan = Object.freeze({
    schema: FACADE_STAIR_AUTHORITY_SCHEMA,
    designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
    intentTag: STAIR_WALKABILITY_INTENT,
    id: routeId,
    topology: 'landing-routed-facade-zigzag',
    floors: count,
    floorH: rise,
    clearWidth,
    halfWidth,
    laneGap: resolvedLaneGap,
    laneCoords,
    landingTangentSize: landingSize,
    landingNormalSize,
    landingNormalCenter,
    run,
    runLow,
    runHigh,
    tangentCenter: chosen.center,
    tangentMin,
    tangentMax,
    tangentAvailable,
    totalTangentNeed,
    physicalTruth,
    orientation: Object.freeze({
      faceSide: side,
      tangentAxis: geometry.tangentAxis,
      normalAxis: geometry.normalAxis,
      faceCoord: geometry.faceCoord,
      outward: geometry.outward,
      initialDirection: chosen.initialDirection,
      laneCoords,
    }),
    placement: Object.freeze({
      preferredLandingCount: Object.values(preferredLandingTangents ?? {}).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0),
      demandScore: chosen.score,
      alternateDemandScore: candidates[1]?.score ?? chosen.score,
      portalBiased: Object.keys(preferredLandingTangents ?? {}).length > 0,
    }),
    landings: Object.freeze(landings),
    // Compatibility alias: these are now real landing plans, not points on a shared flight line.
    landingAnchors: Object.freeze(landings),
    flights: Object.freeze(flights),
  });
  assertFacadeStairAuthority(plan);
  return plan;
}
