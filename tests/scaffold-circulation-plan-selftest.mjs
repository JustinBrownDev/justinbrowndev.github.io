import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { planExteriorScaffoldRoute, scaffoldRouteIsContinuous } from '../world/scaffold-circulation-plan.js';

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service',
  role: 'maintenance-access',
  weirdness: 0.72,
  stableKey: 'scaffold-circulation-selftest',
});

function assertPlan(plan, topology, floors) {
  assert.ok(plan, `${topology} route must exist`);
  assert.equal(plan.topology, topology);
  assert.equal(plan.fitStatus, 'fits-resolved-truth');
  assert.equal(plan.side, plan.face.side);
  assert.equal(plan.moduleKey, plan.face.moduleKey);
  assert.equal(plan.openings.length, floors, 'each occupied floor must get one route-derived facade opening');
  assert.equal(scaffoldRouteIsContinuous(plan), true);
  assert.equal(plan.flights.length, topology === 'two-flight-switchback' ? floors * 2 : floors);
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const landings = new Map(plan.landings.map(landing => [landing.id, landing]));
  assert.ok(nodes.has(plan.groundNodeId));
  assert.ok(nodes.has(plan.topNodeId));
  assert.equal(nodes.get(plan.groundNodeId).y, 0);
  assert.equal(nodes.get(plan.topNodeId).y, floors * plan.floorH);

  for (const node of plan.nodes) {
    assert.ok(landings.has(node.landingId), `node ${node.id} must belong to a real landing`);
    assert.ok(landings.get(node.landingId).nodeIds.includes(node.id), `landing must claim node ${node.id}`);
  }
  for (const opening of plan.openings) {
    assert.equal(opening.moduleKey, plan.moduleKey);
    assert.equal(opening.side, plan.side);
    assert.ok(landings.has(opening.landingId));
    assert.ok(opening.nodeIds.every(id => nodes.has(id)));
    assert.ok(opening.width + 1e-9 >= truth.door.clearWidth.realizedSI);
    assert.ok(opening.height + 1e-9 >= truth.door.clearHeight.realizedSI);
  }
  for (const flight of plan.flights) {
    assert.equal(flight.fitClassification, 'fits-resolved-truth');
    assert.ok(flight.stairFlight.realizedTreadDepth + 1e-9 >= truth.stair.tread.sourceMinimum.canonicalSI,
      `flight ${flight.id} must preserve source-minimum tread depth`);
    assert.ok(flight.stairFlight.riserHeight <= truth.stair.riser.realizedSI + 1e-9,
      `flight ${flight.id} must preserve resolved maximum riser height`);
    assert.equal(flight.clearWidth, truth.stair.widthSI);
    assert.equal(flight.headroom, truth.stair.headroomSI);
    const from = nodes.get(flight.fromNodeId);
    const to = nodes.get(flight.toNodeId);
    assert.ok(from && to);
    assert.equal(from.y, flight.y0);
    assert.equal(to.y, flight.y1);
    if (flight.axis === 'x') {
      assert.equal(from.x, flight.from); assert.equal(to.x, flight.to);
      assert.equal(from.z, flight.fixedCoord); assert.equal(to.z, flight.fixedCoord);
    } else {
      assert.equal(from.z, flight.from); assert.equal(to.z, flight.to);
      assert.equal(from.x, flight.fixedCoord); assert.equal(to.x, flight.fixedCoord);
    }
  }
}

const nominal = planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 4.2, halfZ: 2.4 }, moduleKey: 'straight-module', floors: 4, floorH: 3.2,
  side: 'north', seed: 101, physicalTruth: truth, maxExteriorDepth: 2.8,
});
assertPlan(nominal, 'alternating-straight', 4);
assert.deepEqual(planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 4.2, halfZ: 2.4 }, moduleKey: 'straight-module', floors: 4, floorH: 3.2,
  side: 'north', seed: 101, physicalTruth: truth, maxExteriorDepth: 2.8,
}), nominal, 'planner output must be deterministic');

let switchback = null;
for (let half = 1.45; half <= 3.4 && !switchback; half += 0.05) {
  const candidate = planExteriorScaffoldRoute({
    fp: { cx: 12, cz: -4, halfX: half, halfZ: 2.2 }, moduleKey: 'switch-module', floors: 3, floorH: 3.2,
    side: 'south', seed: 202, physicalTruth: truth, maxExteriorDepth: 2.8,
  });
  if (candidate?.topology === 'two-flight-switchback') switchback = candidate;
}
assertPlan(switchback, 'two-flight-switchback', 3);
assert.ok(switchback.landings.some(landing => landing.nodeIds.length === 2), 'switchback must expose a real intermediate turn landing');

assert.equal(planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 0.85, halfZ: 2.2 }, floors: 5, floorH: 3.2,
  side: 'north', seed: 303, physicalTruth: truth, maxExteriorDepth: 2.8,
}), null, 'narrow facade must be omitted instead of compressing tread depth');

assert.equal(planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: switchback.facadeTangentAvailable * 0.5 + 0.18, halfZ: 2.2 }, floors: 3, floorH: 3.2,
  side: 'north', seed: 404, physicalTruth: truth, maxExteriorDepth: Math.max(0.1, switchback.exteriorDepth - 0.25),
}), null, 'switchback must not exceed the exterior depth envelope');

console.log('[scaffold-circulation-plan-selftest] PASS', {
  straightFlights: nominal.flights.length,
  switchbackFlights: switchback.flights.length,
  impossible: 'omitted',
});
