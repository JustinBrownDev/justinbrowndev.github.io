import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { physicalUseFamiliesForProgram } from '../world/physical-use.js';
import { programArchitectureFor } from '../world/architecture/program-architecture.js';

const programs = [
  'apartment', 'motel_room',
  'diner', 'convenience', 'grocery', 'pharmacy', 'florist', 'butcher',
  'hardware_store', 'electronics_repair', 'print_shop', 'photo_lab',
  'fire_station', 'auto_shop', 'clinic', 'courtroom', 'police_booking', 'laboratory',
  'warehouse', 'server_room', 'mainframe_room',
  'office', '1980s_office', 'bank', 'post_office',
  'archive', 'boiler_room', 'factory_control',
];
const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: 'cut21v-population:core', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.7, halfZ: 1.7,
  yMin: 0, yMax: 40,
  openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6,
  integratedFloorLanding: true,
};
const observedArchitectures = new Set();
const observedMorphologies = new Set();
let routeFrontagePlans = 0;
let nestedUnits = 0;
let serviceSpineSpaces = 0;
let samples = 0;

for (let seedOrdinal = 0; seedOrdinal < 2; seedOrdinal++) {
  for (const program of programs) {
    const architecture = programArchitectureFor(program);
    assert.ok(architecture, `${program} should have specific 21V program architecture`);
    const family = physicalUseFamiliesForProgram(program)[0];
    assert.ok(family, `${program} needs a compatible physical-use family`);
    const routeServed = seedOrdinal === 1;
    const accessAnchors = [{
      id: `${program}:main`, kind: 'main-entry', x: 0, z: 8, side: 'south', floor: 0,
    }];
    if (routeServed) accessAnchors.push({
      id: `${program}:sky`, kind: 'city-exchange', endpointId: `${program}:endpoint`, bridgeId: `${program}:bridge`,
      x: -9, z: 0, side: 'west', floor: 1,
      traversalPermission: 'PUBLIC_THROUGH', routeCharacter: 'VERTICAL_COLLECTOR',
    });
    const plan = planBuildingSidecar({
      worldSeed: 0x21_16_00_00 + seedOrdinal,
      chunkKey: `${seedOrdinal},0`, chunkX: seedOrdinal, chunkZ: 0,
      entityId: `cut21v-population:${program}:${seedOrdinal}`,
      programHint: program,
      physicalUse: { family },
      physicalTruth,
      floorHeight: floorH,
      modules: [{ key: 'main', cx: 0, cz: 0, halfX: 9, halfZ: 8, floors: 3 }],
      accessAnchors,
      circulationReservations: [core],
    });
    samples++;
    assert.equal(plan.programArchitectureEvidence.specific, true, `${program} should stay specific`);
    assert.equal(plan.programArchitectureEvidence.flowHealthy, true, `${program} operational flow should remain healthy`);
    assert.ok(plan.programArchitectureEvidence.directTransitionRatio >= 0.75, `${program} direct transition ratio too low`);
    assert.equal(plan.diagnostics.topologyHealthy, true, `${program} topology must remain reachable`);
    assert.equal(plan.diagnostics.humanScaleHealthy, true, `${program} must retain 21U human-scale guarantees`);
    observedArchitectures.add(plan.programArchitecture.id);
    observedMorphologies.add(plan.grammar.id);
    if (plan.programArchitectureEvidence.requiredRouteFrontageSpaceCount > 0) routeFrontagePlans++;
    nestedUnits += plan.programArchitectureEvidence.nestedDwellingUnitCount;
    serviceSpineSpaces += plan.programArchitectureEvidence.serviceSpineSpaceCount;
  }
}

assert.ok(observedArchitectures.size >= 12, 'population should exercise a broad program-architecture vocabulary');
assert.ok(observedMorphologies.size >= 7, 'program architecture should reuse several morphology families rather than one-program-one-shape');
assert.ok(routeFrontagePlans >= 8, 'route-served population should create several real upper public-frontage plans');
assert.ok(nestedUnits >= 8, 'apartment population should produce nested dwelling units');
assert.ok(serviceSpineSpaces >= 80, 'service architecture should be widespread rather than decorative metadata');

console.log('[cut21v-program-population-selftest] PASS', {
  samples,
  programArchitectures: observedArchitectures.size,
  morphologyFamilies: observedMorphologies.size,
  routeFrontagePlans,
  nestedUnits,
  serviceSpineSpaces,
});
