import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';

const families = [
  'residential-lodging', 'mercantile-public', 'business', 'assembly-institutional',
  'industrial-service', 'storage', 'maintenance-utility',
];
const distances = [0, 3, 9, 20, 40];
const modules = [
  { key: 'A', cx: -3.2, cz: -2.8, halfX: 3.2, halfZ: 2.8, floors: 4 },
  { key: 'B', cx: 3.1, cz: -2.8, halfX: 3.1, halfZ: 2.8, floors: 4 },
  { key: 'C', cx: -3.2, cz: 2.7, halfX: 3.2, halfZ: 2.7, floors: 3 },
  { key: 'D', cx: 3.1, cz: 2.7, halfX: 3.1, halfZ: 2.7, floors: 2 },
];
const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.12 },
  door: { clearWidth: { realizedSI: 0.9 }, clearHeight: { realizedSI: 2.06 } },
};
const reservations = [
  { id: 'shaft', kind: 'stair-shaft', x: 0.1, z: -0.1, halfX: 0.72, halfZ: 1.18, yMin: 0, yMax: 16 },
];

let cases = 0;
let plansWithDesiredRepairs = 0;
let maxSpaces = 0;
let maxDesiredMisses = 0;
for (let seedIndex = 0; seedIndex < 8; seedIndex++) {
  for (const family of families) {
    for (const distance of distances) {
      const isSpawn = distance === 0;
      const x = isSpawn ? 0 : Math.max(1, Math.round(distance * 0.72));
      const z = isSpawn ? 0 : Math.max(1, Math.round(Math.sqrt(Math.max(0, distance * distance - x * x))));
      const plan = planBuildingSidecar({
        worldSeed: 1000 + seedIndex,
        chunkKey: `${x},${z}`,
        chunkX: x,
        chunkZ: z,
        distanceChunks: distance,
        weirdnessSampled: Math.min(1, distance / 40),
        isSpawn,
        entityId: `${family}:${seedIndex}`,
        physicalUse: { family },
        physicalTruth,
        modules,
        accessAnchors: [{ id: 'entry', kind: 'main-entry', x: 0, z: -5.6, side: 'north', floor: 0 }],
        circulationReservations: reservations,
      });
      assert.equal(plan.diagnostics.topologyHealthy, true, `${family} d=${distance} must remain reachable`);
      assert.equal(plan.diagnostics.unresolvedGeometricAdjacencyCount, 0, `${family} d=${distance} cannot emit fictitious door edges`);
      assert.equal(plan.diagnostics.unclaimedRasterCellCount, 0, `${family} d=${distance} must partition its usable substrate`);
      assert.equal(plan.diagnostics.physicalTruthPreserved, true);
      assert.ok(plan.floors.every(f => f.diagnostics.reachable));
      assert.ok(plan.openings.filter(o => o.kind === 'interior-door').every(o => o.width >= 0.9 - 1e-9));
      if (isSpawn) assert.equal(plan.architecturalField.inversion, 0);
      if (distance === 40) assert.ok(plan.architecturalField.inversion > 0.85);
      if (plan.diagnostics.geometryRepairEdgeCount) plansWithDesiredRepairs++;
      maxDesiredMisses = Math.max(maxDesiredMisses, plan.diagnostics.unrealizedDesiredAdjacencyCount);
      maxSpaces = Math.max(maxSpaces, plan.diagnostics.totalSpaces);
      cases++;
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  cases,
  families: families.length,
  distances,
  seeds: 8,
  plansWithDesiredRepairs,
  maxDesiredMisses,
  maxSpaces,
}, null, 2));
