// JWEB_INTENT: STAIR_WALKABILITY_V1
import assert from 'node:assert/strict';
import { planInteriorStairCoreWithArchitectureReplan, planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';

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
  stableKey: 'cut14-floor-join',
});
assert.ok(core);
assert.equal(core.floorLandingIntegrated, true);
assert.ok(core.slabOpening, 'stair core must publish the actual slab cut separately from the full clearance envelope');

const interval = rect => core.axis === 'x'
  ? [rect.x - rect.hx, rect.x + rect.hx]
  : [rect.z - rect.hz, rect.z + rect.hz];
const [landing0, landing1] = interval(core.floorLanding);
const [slab0, slab1] = interval(core.slabOpening);
assert.ok(Math.abs(landing1 - slab0) < 1e-7,
  `integrated floor landing must terminate exactly at shaft throat: landing=${landing1}, throat=${slab0}`);
assert.ok(slab1 > slab0);
assert.ok(core.metrics.slabOpeningAlong < core.metrics.openingAlong,
  'slab cut must be smaller than full stair clearance because floor landing stays in the floor');
const openingCross = core.axis === 'x' ? core.opening.sz : core.opening.sx;
const slabCross = core.axis === 'x' ? core.slabOpening.sz : core.slabOpening.sx;
assert.equal(slabCross, openingCross, 'shaft cut keeps full capsule-safe cross clearance');

const severeTruth = {
  stair: {
    widthSI: 1.36, landingDepthSI: 1.70, headroomSI: 2.10,
    riser: { realizedSI: 0.15 }, tread: { realizedSI: 0.34, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const severe = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 2.70, halfZ: 2.70 },
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut14-floor-join-severe',
});
assert.equal(severe, null, 'severe bay must not recover by exceeding four flights per story');

const modules = [
  { key: '0,0', cell: { col: 0, row: 0 }, rect: { cx: -2.70, cz: 0, halfX: 2.70, halfZ: 2.70 }, floors: 4 },
  { key: '1,0', cell: { col: 1, row: 0 }, rect: { cx: 2.70, cz: 0, halfX: 2.70, halfZ: 2.70 }, floors: 2 },
];
const severeArchitecture = planInteriorStairCoreWithArchitectureReplan({
  modulePlans: modules,
  primaryModule: modules[0],
  floorH: 5.8,
  physicalTruth: severeTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut14-floor-join-severe-replanned',
});
assert.ok(severeArchitecture, 'architecture must enlarge the core when the host bay cannot fit a legal stair');
assert.equal(severeArchitecture.replanned, true);
const severeCore = severeArchitecture.core;
assert.ok(severeCore.flightCount <= 4);
const severeInterval = rect => severeCore.axis === 'x'
  ? [rect.x - rect.hx, rect.x + rect.hx]
  : [rect.z - rect.hz, rect.z + rect.hz];
const [, severeLanding1] = severeInterval(severeCore.floorLanding);
const [severeSlab0] = severeInterval(severeCore.slabOpening);
assert.ok(Math.abs(severeLanding1 - severeSlab0) < 1e-7,
  'architecturally enlarged core must preserve the same floor-to-throat seam contract');

console.log('[cut14-stair-floor-join-selftest] PASS', {
  topology: core.topology,
  fullOpeningAlong: core.metrics.openingAlong,
  slabOpeningAlong: core.metrics.slabOpeningAlong,
  invariant: 'story floor owns landing; slab cut begins at stair throat with zero gap/overlap',
});
