import assert from 'node:assert/strict';
import {
  STAIR_ARCHITECTURE_SPECIES,
  deriveStairArchitectureBrief,
  stairInteriorProfileFor,
} from '../world/stair-architecture-doctrine.js';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';

const residentialGround = deriveStairArchitectureBrief({
  programArchitectureId: 'apartment', physicalUse: 'residential-lodging',
  routeFamily: 'building-primary-core', field: 'ground', stableKey: 'res-ground',
});
const residentialHanging = deriveStairArchitectureBrief({
  programArchitectureId: 'apartment', physicalUse: 'residential-lodging',
  routeFamily: 'building-primary-core', field: 'ceiling', stableKey: 'res-hanging',
});
assert.equal(residentialGround.species, 'domestic-enclosed-dogleg');
assert.equal(residentialHanging.species, residentialGround.species, 'hanging polarity must not select a different social species');
assert.equal(residentialGround.supportPolarity, 'load-down');
assert.equal(residentialHanging.supportPolarity, 'load-up');
assert.notEqual(residentialGround.loadPath, residentialHanging.loadPath, 'polarity must still change the visible load path');
assert.equal(residentialGround.guardFamily, 'residential-half-wall');

const industrial = deriveStairArchitectureBrief({
  programArchitectureId: 'fire-station', physicalUse: 'industrial-service', routeFamily: 'building-primary-core',
});
const fireEscape = deriveStairArchitectureBrief({
  programArchitectureId: 'fire-station', physicalUse: 'industrial-service', routeFamily: 'retrofit-fire-escape', emergencyOnly: true,
});
assert.equal(industrial.species, 'industrial-work-stair');
assert.equal(fireEscape.species, 'retrofit-facade-fire-escape');
assert.notEqual(industrial.hostStructure, fireEscape.hostStructure, 'industrial platform frame and facade retrofit must remain different construction histories');
assert.notEqual(industrial.loadPath, fireEscape.loadPath);

const ordinaryUtility = deriveStairArchitectureBrief({
  programArchitectureId: 'server-facility', physicalUse: 'maintenance-utility', routeFamily: 'building-primary-core',
});
const serviceUtility = deriveStairArchitectureBrief({
  programArchitectureId: 'server-facility', physicalUse: 'maintenance-utility', routeFamily: 'machinery-access', specialPurpose: true,
});
assert.equal(ordinaryUtility.species, 'industrial-work-stair', 'maintenance/utility identity alone may not turn ordinary circulation into a ship stair');
assert.equal(serviceUtility.species, 'utility-ship-stair', 'ship stair is opt-in special-purpose maintenance geometry');

const institutional = deriveStairArchitectureBrief({ programArchitectureId: 'clinic', physicalUse: 'assembly-institutional', routeFamily: 'building-primary-core' });
const scaffold = deriveStairArchitectureBrief({ physicalUse: 'industrial-service', routeFamily: 'exterior-scaffold' });
const thoroughfare = deriveStairArchitectureBrief({ physicalUse: 'business', routeClass: 'thoroughfare', routeFamily: 'district-thoroughfare-core', routeWidthScale: 1.9 });
const civic = deriveStairArchitectureBrief({ physicalUse: 'assembly-institutional', purpose: 'ceremonial-entry', ceremonial: true });
assert.equal(institutional.species, 'institutional-egress');
assert.equal(scaffold.species, 'scaffold-access-tower');
assert.equal(thoroughfare.species, 'district-thoroughfare');
assert.equal(civic.species, 'civic-monumental');

const wideApartment = deriveStairArchitectureBrief({ programArchitectureId: 'apartment', physicalUse: 'residential-lodging', routeWidthScale: 2.1 });
assert.equal(wideApartment.species, 'domestic-enclosed-dogleg', 'width is throughput, never a brutalist/style selector');
assert.equal(wideApartment.requestedWidthClass, 'broad');
assert.ok(!STAIR_ARCHITECTURE_SPECIES.includes('brutalist-mass'));

const truth = {
  stair: {
    widthSI: 0.91,
    landingDepthSI: 0.96,
    headroomSI: 2.03,
    riser: { realizedSI: 0.175 },
    tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const rect = { cx: 0, cz: 0, halfX: 7.5, halfZ: 7.5 };
const coreFor = (brief, stableKey) => planInteriorSwitchbackStairCore({
  rect, floorH: 3.15, physicalTruth: truth, traversalEnvelope: { playerRadius: 0.22 }, architectureBrief: brief, stableKey,
});
const domesticCore = coreFor(residentialGround, 'domestic-core');
const institutionalCore = coreFor(institutional, 'institutional-core');
const thoroughfareCore = coreFor(thoroughfare, 'district-core');
assert.ok(domesticCore && institutionalCore && thoroughfareCore);
assert.ok(domesticCore.clearWidth >= stairInteriorProfileFor(residentialGround).minClearWidth);
assert.ok(institutionalCore.clearWidth >= 1.30);
assert.ok(thoroughfareCore.clearWidth >= 1.80);
assert.match(domesticCore.topology, /^domestic-dogleg:/);
assert.match(institutionalCore.topology, /^institutional-egress-core:/);
assert.match(thoroughfareCore.topology, /^district-journey-switchback:/);
assert.notEqual(domesticCore.topology, institutionalCore.topology, 'species must be visible in topology identity before detail/materials');
assert.ok(thoroughfareCore.floorLandingDepth > domesticCore.floorLandingDepth, 'district landing must behave more like public space than a residential turn pad');
assert.equal(domesticCore.guardFamily, 'residential-half-wall');
assert.equal(thoroughfareCore.guardFamily, 'municipal-concrete');

console.log('[stair-architecture-doctrine-selftest] PASS', {
  species: STAIR_ARCHITECTURE_SPECIES,
  domestic: { width: domesticCore.clearWidth, landing: domesticCore.floorLandingDepth, topology: domesticCore.topology },
  institutional: { width: institutionalCore.clearWidth, landing: institutionalCore.floorLandingDepth, topology: institutionalCore.topology },
  thoroughfare: { width: thoroughfareCore.clearWidth, landing: thoroughfareCore.floorLandingDepth, topology: thoroughfareCore.topology },
});
