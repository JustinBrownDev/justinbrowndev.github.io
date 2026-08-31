import assert from 'node:assert/strict';
import { planBuildingSidecar, summarizeBuildingPlan } from '../world/architecture/building-plan-sidecar.js';
import { architecturalFieldProfile } from '../world/architecture/distance-inversion.js';
import { integrationPhase } from '../world/architecture/jweb-adapter.js';

const modules = [
  { key: '0,0', cx: -3, cz: -3, halfX: 3, halfZ: 3, floors: 3 },
  { key: '1,0', cx: 3, cz: -3, halfX: 3, halfZ: 3, floors: 3 },
  { key: '0,1', cx: -3, cz: 3, halfX: 3, halfZ: 3, floors: 2 },
  { key: '1,1', cx: 3, cz: 3, halfX: 3, halfZ: 3, floors: 2 },
];

const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.15 },
  door: {
    clearWidth: { realizedSI: 0.91 },
    clearHeight: { realizedSI: 2.08 },
  },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};

const circulationReservations = [
  {
    id: 'stair:shaft', kind: 'stair-shaft', x: 0, z: 0,
    halfX: 0.75, halfZ: 1.25, yMin: 0, yMax: 12,
  },
];

const common = {
  worldSeed: 0x4a574542,
  entityId: 'test-building',
  modules,
  physicalTruth,
  circulationReservations,
  accessAnchors: [
    { id: 'main', kind: 'main-entry', x: 0, z: -6, side: 'north', floor: 0 },
    { id: 'secondary', kind: 'secondary-entry', x: 6, z: 2.5, side: 'east', floor: 0 },
  ],
};

const spawn = planBuildingSidecar({
  ...common,
  chunkKey: '0,0', chunkX: 0, chunkZ: 0,
  distanceChunks: 0, weirdnessSampled: 0, isSpawn: true,
  signatureType: 'systemsWorkshop',
  physicalUse: { family: 'industrial-service' },
});
const spawnAgain = planBuildingSidecar({
  ...common,
  chunkKey: '0,0', chunkX: 0, chunkZ: 0,
  distanceChunks: 0, weirdnessSampled: 0, isSpawn: true,
  signatureType: 'systemsWorkshop',
  physicalUse: { family: 'industrial-service' },
});

assert.deepEqual(spawn, spawnAgain, 'same input must produce byte-equivalent deterministic plan data');
assert.equal(spawn.schema, 'jweb.building-plan-sidecar.v1');
assert.equal(spawn.architecturalField.phase, 'forensic-spawn');
assert.equal(spawn.architecturalField.fidelity, 1);
assert.equal(spawn.architecturalField.inversion, 0);
assert.equal(spawn.northStar.organism, 'kowloon-walled-city');
assert.ok(spawn.northStar.streetLayer.includes('japanese-yokocho'));
assert.ok(spawn.northStar.streetLayer.includes('korean-euljiro-service-alley'));
assert.equal(spawn.grammar.id, 'service-band-workshop');
assert.equal(spawn.grammar.semanticProgram, 'electronics_repair');
assert.equal(spawn.signature.signatureType, 'systemsWorkshop');
assert.equal(spawn.signature.authoredIntentApplied, true);
assert.equal(spawn.diagnostics.topologyHealthy, true);
assert.equal(spawn.diagnostics.physicalTruthPreserved, true);
assert.ok(spawn.spaces.some(space => space.spaceType === 'systems-workshop'));
assert.ok(spawn.spaces.some(space => space.spaceType === 'bench-service'));
assert.ok(spawn.spaces.some(space => space.structuralReservationIds.includes('stair:shaft')),
  'a circulation/entry space should absorb authoritative stair reservation cells');
assert.ok(spawn.openings.filter(o => o.kind === 'interior-door').every(o => o.width >= 0.91 - 1e-9));
assert.ok(spawn.openings.some(o => o.kind === 'main-entry' && o.topologySource === 'authoritative-access-anchor'));
assert.equal(spawn.diagnostics.unclaimedRasterCellCount, 0);
assert.equal(spawn.diagnostics.inversionOperations.length, 0);

const far = planBuildingSidecar({
  ...common,
  chunkKey: '28,29', chunkX: 28, chunkZ: 29,
  distanceChunks: Math.hypot(28, 29), weirdnessSampled: 0.98, isSpawn: false,
  programHint: 'electronics_repair',
  physicalUse: { family: 'industrial-service' },
});
const farAgain = planBuildingSidecar({
  ...common,
  chunkKey: '28,29', chunkX: 28, chunkZ: 29,
  distanceChunks: Math.hypot(28, 29), weirdnessSampled: 0.98, isSpawn: false,
  programHint: 'electronics_repair',
  physicalUse: { family: 'industrial-service' },
});

assert.deepEqual(far, farAgain);
assert.equal(far.architecturalField.phase, 'full-reversal');
assert.ok(far.architecturalField.inversion > 0.9);
assert.ok(far.architecturalField.entropy < 0.2, 'uncanny reversal must remain low-entropy/coherent');
assert.equal(far.diagnostics.topologyHealthy, true);
assert.equal(far.diagnostics.physicalTruthPreserved, true);
assert.equal(far.diagnostics.unclaimedRasterCellCount, 0);
assert.notEqual(far.fingerprint, spawn.fingerprint);
for (const op of ['service-threshold-first', 'hierarchy-reversal', 'inside-out-perimeter-preference', 'facade-causality-reversal']) {
  assert.ok(far.diagnostics.inversionOperations.includes(op), `far plan must apply ${op}`);
}
assert.ok(far.floors.flatMap(f => f.facadeIntents).some(intent => intent.causality === 'facade-inward'));
assert.ok(far.verticalEdges.every(edge => edge.reversalMayMoveConnector === false));

const nearProfile = architecturalFieldProfile({ distanceChunks: 4, weirdnessSampled: 0.05 });
const farProfile = architecturalFieldProfile({ distanceChunks: 40, weirdnessSampled: 1 });
assert.ok(nearProfile.inversion < farProfile.inversion);
assert.ok(nearProfile.fidelity > farProfile.fidelity);
assert.ok(farProfile.uncannyCoherence > 0.8);

const seam = integrationPhase();
assert.ok(seam.after.includes('resolved physical truth'));
assert.ok(seam.before.includes('partition-wall emission'));
assert.ok(seam.before.includes('semantic destination selection'));

console.log(JSON.stringify({
  ok: true,
  tests: 32,
  spawn: summarizeBuildingPlan(spawn),
  far: summarizeBuildingPlan(far),
  unresolvedSpawnAdjacencies: spawn.diagnostics.unresolvedGeometricAdjacencyCount,
  unresolvedFarAdjacencies: far.diagnostics.unresolvedGeometricAdjacencyCount,
}, null, 2));
