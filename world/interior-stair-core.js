import { deriveStairFlight } from './physical-truth.js';
import {
  STAIR_ENDPOINT_SUPPORT_OVERLAP,
  STAIR_WALKABILITY_DESIGN_INTENT,
  STAIR_WALKABILITY_INTENT,
  assertInteriorStairCoreWalkability,
} from './stair-volume-contract.js';
import { planStructuralFeasibility } from './architecture/structural-feasibility.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1
export const INTERIOR_STAIR_CORE_SCHEMA = 'jweb.interior-stair-core.v2';

const EPS = 1e-7;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function orientedRect(axis, alongCenter, crossCenter, alongSize, crossSize) {
  return axis === 'x'
    ? Object.freeze({ x: alongCenter, z: crossCenter, sx: alongSize, sz: crossSize, hx: alongSize * 0.5, hz: crossSize * 0.5 })
    : Object.freeze({ x: crossCenter, z: alongCenter, sx: crossSize, sz: alongSize, hx: crossSize * 0.5, hz: alongSize * 0.5 });
}

function point(axis, along, cross, y = 0) {
  return axis === 'x' ? Object.freeze({ x: along, y, z: cross }) : Object.freeze({ x: cross, y, z: along });
}

function backGuardForLanding({ axis, outerAlong, crossCenter, crossSize }) {
  const a = point(axis === 'x' ? 'z' : 'x', crossCenter - crossSize * 0.5, outerAlong, 0);
  const b = point(axis === 'x' ? 'z' : 'x', crossCenter + crossSize * 0.5, outerAlong, 0);
  return Object.freeze({ x1: a.x, z1: a.z, x2: b.x, z2: b.z });
}

function candidateForAxis({ axis, rect, floorH, truth, playerRadius, stableKey, tier, flightCount }) {
  const alongHalf = axis === 'x' ? finite(rect.halfX) : finite(rect.halfZ);
  const crossHalf = axis === 'x' ? finite(rect.halfZ) : finite(rect.halfX);
  const alongCenter = axis === 'x' ? finite(rect.cx) : finite(rect.cz);
  const crossCenter = axis === 'x' ? finite(rect.cz) : finite(rect.cx);
  // The compact tier spends dead wall-offset before it ever shrinks a stair.
  // Landing depth, flight width, tread/riser truth and capsule clearances remain
  // unchanged; 8cm is only the non-walkable shell gap outside that authority.
  const wallMargin = tier === 'generous' ? 0.24 : 0.08;
  const clearWidth = Math.max(0.78, finite(truth?.stair?.widthSI, 0.91));
  const sourceLanding = Math.max(0.90, finite(truth?.stair?.landingDepthSI, clearWidth));
  const laneGap = Math.max(0.30, playerRadius * 1.35);

  const generous = tier === 'generous';
  const floorLandingDepth = Math.max(
    generous ? 1.65 : 1.35,
    sourceLanding,
    clearWidth * (generous ? 1.50 : 1.25),
  );
  const turnLandingDepth = Math.max(
    generous ? 1.35 : 1.15,
    sourceLanding,
    clearWidth * (generous ? 1.25 : 1.10),
  );
  const sideCapsuleClearance = playerRadius + (generous ? 0.10 : 0.06);
  const segmentFlight = deriveStairFlight({
    rise: floorH / flightCount,
    truth,
    stableKey: `${stableKey}:${axis}:${tier}:${flightCount}-flight-segment`,
  });
  if (segmentFlight.fitClassification !== 'fits-resolved-truth') return null;

  // Four-flight tall-story stairs reuse each lane once above itself. They are
  // admissible only when the vertical separation itself preserves full stair
  // headroom. A short story is never allowed to become a stacked accordion.
  if (flightCount === 4 && floorH * 0.5 + EPS < segmentFlight.headroom) return null;

  const run = segmentFlight.requiredRun;
  const laneCenterOffset = (clearWidth + laneGap) * 0.5;
  const flightCrossSpan = clearWidth * 2 + laneGap;
  const landingCross = flightCrossSpan + 0.28;
  const openingCross = landingCross + sideCapsuleClearance * 2;
  const openingAlong = floorLandingDepth + run + turnLandingDepth;
  const availableAlong = alongHalf * 2 - wallMargin * 2;
  const availableCross = crossHalf * 2 - wallMargin * 2;
  if (openingAlong > availableAlong + EPS || openingCross > availableCross + EPS) return null;

  const openingLow = alongCenter - openingAlong * 0.5;
  const openingHigh = alongCenter + openingAlong * 0.5;
  const lowMouth = openingLow + floorLandingDepth;
  const highMouth = lowMouth + run;
  const lane0 = crossCenter - laneCenterOffset;
  const lane1 = crossCenter + laneCenterOffset;
  const floorLanding = orientedRect(axis, openingLow + floorLandingDepth * 0.5, crossCenter, floorLandingDepth, landingCross);
  const turnLanding = orientedRect(axis, highMouth + turnLandingDepth * 0.5, crossCenter, turnLandingDepth, landingCross);
  const opening = orientedRect(axis, alongCenter, crossCenter, openingAlong, openingCross);
  // The floor owns the usable floor-level landing. The slab opening starts at
  // the stair mouth, so the landing is not deleted merely to make room for the
  // stair. Player-physics ramp support extends beneath the receiving edge.
  const slabOpeningAlong = openingHigh - lowMouth;
  const slabOpening = orientedRect(axis, (lowMouth + openingHigh) * 0.5, crossCenter, slabOpeningAlong, openingCross);
  const guardMouthClearance = Math.min(0.34, Math.max(0.22, playerRadius + 0.05));
  const lowBackGuard = backGuardForLanding({ axis, outerAlong: openingLow, crossCenter, crossSize: landingCross });
  const highBackGuard = backGuardForLanding({ axis, outerAlong: openingHigh, crossCenter, crossSize: landingCross });

  const flights = [];
  const intermediateLandings = [];
  for (let i = 0; i < flightCount; i++) {
    const outbound = i % 2 === 0;
    const laneIndex = i % 2;
    flights.push(Object.freeze({
      id: `flight-${i + 1}`,
      laneIndex,
      axis,
      from: outbound ? lowMouth : highMouth,
      to: outbound ? highMouth : lowMouth,
      fixedCoord: laneIndex === 0 ? lane0 : lane1,
      halfWidth: clearWidth * 0.5,
      y0Fraction: i / flightCount,
      y1Fraction: (i + 1) / flightCount,
      endpointSupportOverlap: STAIR_ENDPOINT_SUPPORT_OVERLAP,
    }));
    if (i < flightCount - 1) {
      const highSide = outbound;
      intermediateLandings.push(Object.freeze({
        id: `turn-${i + 1}`,
        sideRole: highSide ? 'run-high' : 'run-low',
        yFraction: (i + 1) / flightCount,
        geometry: highSide ? turnLanding : floorLanding,
        backGuard: highSide ? highBackGuard : lowBackGuard,
        walkElevationAuthority: STAIR_WALKABILITY_DESIGN_INTENT,
      }));
    }
  }

  const plan = Object.freeze({
    schema: INTERIOR_STAIR_CORE_SCHEMA,
    designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
    intentTag: STAIR_WALKABILITY_INTENT,
    stableKey,
    id: `${stableKey}:${axis}:${tier}:${flightCount}`,
    topology: flightCount === 2 ? 'two-flight-switchback' : 'four-flight-switchback',
    fitTier: tier,
    flightCount,
    storyHeight: floorH,
    axis,
    clearWidth,
    halfWidth: clearWidth * 0.5,
    laneGap,
    laneCoords: Object.freeze([lane0, lane1]),
    flightCrossSpan,
    sideCapsuleClearance,
    endpointSupportOverlap: Math.max(STAIR_ENDPOINT_SUPPORT_OVERLAP, Math.min(playerRadius, 0.22)),
    floorLandingDepth,
    midLandingDepth: turnLandingDepth,
    turnLandingDepth,
    opening,
    slabOpening,
    floorLanding,
    floorLandingIntegrated: true,
    midLanding: turnLanding,
    turnLanding,
    lowMouth,
    highMouth,
    guardMouthClearance,
    segmentFlight,
    halfFlight: segmentFlight,
    flights: Object.freeze(flights),
    intermediateLandings: Object.freeze(intermediateLandings),
    midLandingBackGuard: highBackGuard,
    metrics: Object.freeze({
      availableAlong,
      availableCross,
      openingAlong,
      openingCross,
      slabOpeningAlong,
      run,
      playerRadius,
    }),
  });
  assertInteriorStairCoreWalkability(plan);
  return plan;
}

export function planInteriorSwitchbackStairCore({
  rect,
  floorH,
  physicalTruth,
  traversalEnvelope = null,
  stableKey = 'interior-switchback',
} = {}) {
  if (!rect || !physicalTruth?.stair || !(finite(floorH) > 0)) return null;
  if (![rect.cx, rect.cz, rect.halfX, rect.halfZ].every(value => Number.isFinite(Number(value)))) return null;
  if (!(Number(rect.halfX) > 0) || !(Number(rect.halfZ) > 0)) return null;
  const playerRadius = Math.max(0.18, finite(traversalEnvelope?.playerRadius, 0.22));
  const preferred = Number(rect.halfZ) >= Number(rect.halfX) ? 'z' : 'x';
  const axes = preferred === 'z' ? ['z', 'x'] : ['x', 'z'];

  // JWEB_INTENT: STAIR_WALKABILITY_V1
  // Ordinary stories are allowed a two-flight switchback. A genuinely tall
  // story may use four flights when it still preserves full stacked headroom.
  // Anything that needs more room returns null so architecture can enlarge or
  // replan the core instead of compressing the stair.
  for (const flightCount of [2, 4]) {
    for (const tier of ['generous', 'compact']) {
      const candidates = axes
        .map(axis => candidateForAxis({
          axis, rect, floorH: Number(floorH), truth: physicalTruth, playerRadius,
          stableKey, tier, flightCount,
        }))
        .filter(Boolean)
        .sort((a, b) => {
          const aSlack = Math.min(a.metrics.availableAlong - a.metrics.openingAlong, a.metrics.availableCross - a.metrics.openingCross);
          const bSlack = Math.min(b.metrics.availableAlong - b.metrics.openingAlong, b.metrics.availableCross - b.metrics.openingCross);
          if (Math.abs(aSlack - bSlack) > EPS) return bSlack - aSlack;
          return axes.indexOf(a.axis) - axes.indexOf(b.axis);
        });
      if (candidates[0]) return candidates[0];
    }
  }
  return null;
}


export function planInteriorStairCoreStructuralFeasibility({
  modulePlans = [],
  primaryModule = null,
  floorH,
  physicalTruth,
  traversalEnvelope = null,
  stableKey = 'interior-switchback',
  maxConsumedModules = Infinity,
} = {}) {
  return planStructuralFeasibility({
    modulePlans,
    primaryModule,
    floorH,
    physicalTruth,
    traversalEnvelope,
    stableKey,
    maxConsumedModules,
    planStairCore: planInteriorSwitchbackStairCore,
  });
}

export function planInteriorStairCoreWithArchitectureReplan(args = {}) {
  const result = planInteriorStairCoreStructuralFeasibility(args);
  return result.accepted ? result : null;
}
