import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA } from '../world/facade-stair-authority.js';
import { planExteriorScaffoldRoute, scaffoldRouteIsContinuous } from '../world/scaffold-circulation-plan.js';
import { assertCanonicalFacadeZigzag } from '../world/stair-volume-contract.js';

const truth = resolvePhysicalTruth({ physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.42, stableKey: 'scaffold-landing-route-selftest' });
for (const side of ['north', 'south', 'west', 'east']) {
  const plan = planExteriorScaffoldRoute({ fp: { cx: 0, cz: 0, halfX: 10, halfZ: 10 }, siteId: 4, moduleKey: `module:${side}`, floors: 4, floorH: 3.2, side, seed: 808, physicalTruth: truth, maxExteriorDepth: 4.0, routeId: `canonical:${side}` });
  assert.ok(plan, `${side}: landing-routed scaffold must fit`);
  assert.equal(plan.topology, 'canonical-facade-zigzag');
  assert.equal(plan.geometryAuthority, FACADE_STAIR_AUTHORITY_SCHEMA);
  assert.equal(plan.flights.length, 4);
  assert.equal(plan.landings.length, 5);
  assert.ok(plan.landingNormalSize > plan.clearWidth * 2);
  assert.equal(scaffoldRouteIsContinuous(plan), true);
  assert.equal(assertCanonicalFacadeZigzag(plan), true);
  for (let i = 0; i < plan.flights.length; i++) {
    const f = plan.flights[i];
    assert.equal(f.laneIndex, i % 2);
    assert.equal(f.fixedCoord, plan.scaffoldEnvelope.laneCoords[i % 2]);
    assert.equal(plan.landings[i].stairCarveAllowed, false);
    assert.equal(plan.landings[i + 1].stairCarveAllowed, false);
    if (i > 0) assert.notEqual(plan.landings[i].incomingMouth.laneIndex, plan.landings[i].outgoingMouth.laneIndex);
  }
  assert.deepEqual(planExteriorScaffoldRoute({ fp: { cx: 0, cz: 0, halfX: 10, halfZ: 10 }, siteId: 4, moduleKey: `module:${side}`, floors: 4, floorH: 3.2, side, seed: 808, physicalTruth: truth, maxExteriorDepth: 4.0, routeId: `canonical:${side}` }), plan);
}

const source = fs.readFileSync(new URL('../world/scaffold-circulation-plan.js', import.meta.url), 'utf8');
assert.match(source, /stairCarveAllowed:\s*false/);
assert.match(source, /incomingMouth/);
assert.match(source, /outgoingMouth/);
console.log('[scaffold-circulation-plan-selftest] PASS', { concept: 'target -> horizontal landing -> stair mouth -> narrow flight -> stair mouth -> horizontal landing' });
