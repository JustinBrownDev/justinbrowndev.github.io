import { deriveStairFlight } from './physical-truth.js';

export const INTERIOR_STAIR_CORE_SCHEMA = 'jweb.interior-stair-core.v1';

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
  const wallMargin = 0.24;
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

  const run = segmentFlight.requiredRun;
  const laneCenterOffset = (clearWidth + laneGap) * 0.5;
  const flightCrossSpan = clearWidth * 2 + laneGap;
  const landingCross = flightCrossSpan + 0.28;
  const openingCross = landingCross + sideCapsuleClearance * 2;
  // Every switchback reuses the same two landing footprints at alternating
  // elevations, so adding turn pairs reduces per-flight run without lengthening
  // the core footprint or weakening tread/landing truth.
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
  // The story floor itself owns the low-side landing. Only the vertical throat
  // beyond that landing is cut out of the slab. This makes stair arrival a
  // continuous floor surface instead of a floating landing slab touching the
  // floor at one mathematical edge.
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
      y0Fraction: i / flightCount,
      y1Fraction: (i + 1) / flightCount,
    }));
    if (i < flightCount - 1) {
      const highSide = outbound;
      intermediateLandings.push(Object.freeze({
        id: `turn-${i + 1}`,
        sideRole: highSide ? 'run-high' : 'run-low',
        yFraction: (i + 1) / flightCount,
        geometry: highSide ? turnLanding : floorLanding,
        backGuard: highSide ? highBackGuard : lowBackGuard,
      }));
    }
  }

  return Object.freeze({
    schema: INTERIOR_STAIR_CORE_SCHEMA,
    topology: flightCount === 2 ? 'two-flight-switchback'
      : flightCount === 4 ? 'four-flight-switchback'
        : flightCount === 6 ? 'six-flight-switchback'
          : flightCount === 8 ? 'eight-flight-switchback' : `${flightCount}-flight-switchback`,
    fitTier: tier,
    flightCount,
    axis,
    clearWidth,
    halfWidth: clearWidth * 0.5,
    laneGap,
    laneCoords: Object.freeze([lane0, lane1]),
    flightCrossSpan,
    sideCapsuleClearance,
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
    // Compatibility alias for the original two-flight cut. Runtime realization
    // consumes segmentFlight; this remains only for older diagnostics.
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

  // Normal stories use the simpler two-flight dogleg. If the resolved floor
  // height, tread, or landing truth makes that run too long for the actual module,
  // add switchback pairs before considering the building invalid. All candidates
  // use an even flight count, so every story finishes on the same floor-landing
  // side and the stairwell stacks continuously story to story.
  for (const flightCount of [2, 4, 6, 8, 10, 12, 14, 16]) {
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
