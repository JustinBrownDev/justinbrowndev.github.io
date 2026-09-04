// JWEB_INTENT: STAIR_WALKABILITY_V1
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTERIOR_STAIR_CORE_SCHEMA, planInteriorStairCoreWithArchitectureReplan, planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import { planFastFacadeArchitecture } from '../world/fast-facade-architecture.js';
import { kowloonIntensity } from '../world/kowloon-structure.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const truth = {
  stair: {
    widthSI: 0.96,
    landingDepthSI: 1.00,
    headroomSI: 2.03,
    riser: { realizedSI: 0.18 },
    tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const core = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 3.5, halfZ: 3.5 },
  floorH: 3.2,
  physicalTruth: truth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut13-06-core',
});
assert.ok(core, 'ordinary 7m building module must fit a real switchback stair core');
assert.equal(core.schema, INTERIOR_STAIR_CORE_SCHEMA);
assert.equal(core.topology, 'two-flight-switchback');
assert.equal(core.flightCount, 2, 'ordinary story should keep the simpler two-flight switchback');
assert.equal(core.flights.length, 2);
assert.equal(core.intermediateLandings.length, 1);
assert.equal(core.flights[0].y1Fraction, 0.5);
assert.equal(core.flights[1].y0Fraction, 0.5);
assert.equal(core.flights.at(-1).to, core.lowMouth, 'even flight count must return to the stacked floor-landing side');
assert.ok(core.floorLandingDepth >= 1.35, 'floor landing must be a real place to stand and turn');
assert.ok(core.midLandingDepth >= 1.15, 'switchback must own a real turn landing');
assert.ok(core.sideCapsuleClearance > 0.22, 'visible slab hole must exceed the player capsule outside the stair/rail envelope');
assert.ok(core.opening.sx <= 7 && core.opening.sz <= 7, 'stair core must fit inside the module');
assert.equal(core.segmentFlight.fitClassification, 'fits-resolved-truth', 'stair geometry may not squeeze tread truth to fit');
assert.ok(core.guardMouthClearance >= 0.22, 'rail collision must terminate before the landing mouth');
const openingCross = core.axis === 'x' ? core.opening.sz : core.opening.sx;
assert.ok(openingCross + 1e-9 >= core.flightCrossSpan + core.sideCapsuleClearance * 2,
  'visible slab opening must contain both flights plus capsule clearance outside their rails');
assert.equal(core.floorLandingIntegrated, true, 'story floor must own the low-side landing');
assert.ok(core.slabOpening, 'core must publish shaft-only slab opening separately from full clearance');
assert.ok(core.metrics.slabOpeningAlong < core.metrics.openingAlong,
  'floor landing remains solid floor, so slab hole must be shorter than full clearance envelope');

const highStoryCore = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 3.435, halfZ: 3.435 },
  floorH: 5.8,
  physicalTruth: {
    stair: {
      widthSI: 1.12, landingDepthSI: 1.12, headroomSI: 2.03,
      riser: { realizedSI: 0.19 }, tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
    },
  },
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut13-06-high-story-core',
});
assert.ok(highStoryCore, '5.8m industrial story must fit without shrinking treads or rejecting the building');
assert.equal(highStoryCore.topology, 'four-flight-switchback', 'tall story should gain another switchback pair when two flights do not fit');
assert.equal(highStoryCore.flightCount, 4);
assert.equal(highStoryCore.flights.length, 4);
assert.equal(highStoryCore.intermediateLandings.length, 3, 'four flights require three real intermediate turn landings');
assert.equal(highStoryCore.flights.at(-1).to, highStoryCore.lowMouth,
  'four-flight fallback must finish on the same floor-landing side so stories stack continuously');
assert.equal(highStoryCore.segmentFlight.fitClassification, 'fits-resolved-truth');
assert.ok(highStoryCore.floorLandingDepth >= 1.35);
assert.ok(highStoryCore.midLandingDepth >= 1.15);



const severeTruth = {
  stair: {
    widthSI: 1.36, landingDepthSI: 1.70, headroomSI: 2.10,
    riser: { realizedSI: 0.15 }, tread: { realizedSI: 0.34, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const runtimeEnvelopeCore = planInteriorSwitchbackStairCore({
  // P0 reversal: this bay previously manufactured an eight-flight accordion
  // stair. It must now fail as geometry so architecture can consume more room.
  rect: { cx: 0, cz: 0, halfX: 2.70, halfZ: 2.70 },
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut13-06-runtime-envelope-core',
});
assert.equal(runtimeEnvelopeCore, null,
  'a severe story may not preserve truth by compressing itself into eight flights');

const severeModules = [
  { key: '0,0', cell: { col: 0, row: 0 }, rect: { cx: -2.70, cz: 0, halfX: 2.70, halfZ: 2.70 }, floors: 5 },
  { key: '1,0', cell: { col: 1, row: 0 }, rect: { cx: 2.70, cz: 0, halfX: 2.70, halfZ: 2.70 }, floors: 3 },
];
const replannedRuntime = planInteriorStairCoreWithArchitectureReplan({
  modulePlans: severeModules,
  primaryModule: severeModules[0],
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut13-06-runtime-envelope-replanned',
});
assert.ok(replannedRuntime, 'severe case must replan architecture instead of weakening the stair invariant');
assert.equal(replannedRuntime.replanned, true);
assert.equal(replannedRuntime.replanMode, 'consume-adjacent-module');
assert.equal(replannedRuntime.consumedModuleKeys.length, 2);
assert.ok(replannedRuntime.core.flightCount <= 4, 'architectural replan must retain the four-flight-per-story ceiling');
assert.equal(replannedRuntime.core.segmentFlight.fitClassification, 'fits-resolved-truth');

const narrowRuntimeCore = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 2.30, halfZ: 2.30 },
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut14-narrow-runtime-envelope-core',
});
assert.equal(narrowRuntimeCore, null,
  'narrow bay must reject rather than adding switchback pairs past the P0 limit');

const narrowModules = [
  { key: '0,0', cell: { col: 0, row: 0 }, rect: { cx: -2.30, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 5 },
  { key: '1,0', cell: { col: 1, row: 0 }, rect: { cx: 2.30, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 3 },
  { key: '2,0', cell: { col: 2, row: 0 }, rect: { cx: 6.90, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 2 },
];
const narrowReplan = planInteriorStairCoreWithArchitectureReplan({
  modulePlans: narrowModules,
  primaryModule: narrowModules[0],
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut14-narrow-runtime-envelope-replanned',
});
assert.ok(narrowReplan, 'narrow case must find more architectural space when connected modules exist');
assert.ok(narrowReplan.consumedModuleKeys.length >= 2);
assert.ok(narrowReplan.core.flightCount <= 4);

const facadePlan = planFastFacadeArchitecture({
  stableKey: 'facade-unit', floorH: 3.2,
  faces: [{ moduleKey: 'm1', dirKey: 'E', side: 'east', floors: 3,
    rect: { cx: 8, cz: 0, halfX: 2.8, halfZ: 3.2 }, openings: [] }],
});
const storefront = facadePlan.treatments.find(item => item.kind === 'storefront');
assert.ok(storefront, 'fixture must deterministically own a storefront');
assert.ok(facadePlan.apertures.some(item => item.kind === 'storefront'), 'storefront must remain a literal wall cut');
assert.equal(facadePlan.render.windows.some(item => item.facadeRole === 'storefront-glazing'), false,
  'storefront aperture must be an actual empty hole, not glazing filling the cut');
assert.equal(facadePlan.metrics.newPortalCount, 0, 'empty storefront hole still does not fabricate circulation semantics');

const engine = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
assert.match(engine, /planInteriorStairCoreWithArchitectureReplan/);
assert.match(engine, /blocksFromBelow:\s*false/, 'stair landings must support feet without becoming invisible ceilings from below');
assert.match(engine, /core\.intermediateLandings/, 'physical stair emission must realize every intermediate turn landing');
assert.match(engine, /core\.segmentFlight/, 'physical stair emission must use the selected ordinary segment truth');
assert.match(engine, /guardMouthClearance/, 'flight rails must leave capsule-sized landing mouths');
assert.match(engine, /primaryStairCore\.slabOpening/, 'floor/roof cuts must use the shaft-only slab opening');
assert.doesNotMatch(engine, /addLanding\(core\.floorLanding, y0/,
  'story landing may not be re-added as a floating slab after the floor is cut');
assert.match(engine, /treadVisualBudget:\s*GENERATION_LANES\.broadStrokesOnly \? 3 : Infinity/,
  'skeleton first paint must cap eager interior stair tread visuals while preserving ramp physics');
assert.doesNotMatch(engine, /consumeScaffoldForModule\(face\);/,
  'generic exterior street trunk may not delete an independently valid fire escape');
assert.match(engine, /scaffoldOwnsFace/, 'fire escape keeps its facade while generic transport chooses elsewhere');
assert.match(engine, /publishExteriorRouteClearances\(scaffoldCollisionEvaluation\.reservations\)/,
  'fire escape clearance must publish before generic exterior trunk selection');

const broadVertical = fs.readFileSync(path.join(repo, 'tests/broad-vertical-movement-selftest.mjs'), 'utf8');
assert.doesNotMatch(broadVertical, /consume redundant fire escape/,
  'legacy test may not require generic transport to delete a valid independent egress route');
assert.match(broadVertical, /sameFaceScaffold/,
  'generic route may coexist on the building but must respect the fire escape exact-facade reservation');

const sidecar = fs.readFileSync(path.join(repo, 'world/architecture/building-plan-sidecar.js'), 'utf8');
assert.match(sidecar, /const flightClearWidth = Math\.max\(/,
  'integrated switchback apron must measure the actual flight, not the much wider slab opening');
assert.match(sidecar, /Math\.max\(0\.85, flightClearWidth \* 0\.95\)/,
  'real physical landings get a targeted external approach apron instead of a second giant invisible landing');

const lowIntensity = kowloonIntensity(0).scaffoldChance;
const highIntensity = kowloonIntensity(1).scaffoldChance;
assert.ok(lowIntensity >= 0.60 && highIntensity < 1,
  `fire escapes should remain common but non-universal: ${lowIntensity}..${highIntensity}`);

console.log('[cut13-stairwell-fireescape-selftest] PASS', {
  ordinaryTopology: core.topology,
  ordinaryFitTier: core.fitTier,
  tallTopology: highStoryCore.topology,
  tallFlightCount: highStoryCore.flightCount,
  runtimeEnvelopeRejected: runtimeEnvelopeCore === null,
  replannedTopology: replannedRuntime.core.topology,
  replannedFlightCount: replannedRuntime.core.flightCount,
  narrowRuntimeRejected: narrowRuntimeCore === null,
  narrowReplanModules: narrowReplan.consumedModuleKeys.length,
  floorLandingDepth: core.floorLandingDepth,
  turnLandingDepth: core.midLandingDepth,
  capsuleSideClearance: core.sideCapsuleClearance,
  invariant: '2/4-flight stories + architectural replan + floor-integrated landings + bounded skeleton tread visuals + independent fire escape authority',
});
