import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  attachDistrictBlockComposition,
  compileDistrictBlockComposition,
  districtBuildingPolicyForEntity,
} from '../world/district-block-composition.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';

const chunk = { worldId: 'jweb.dev/world:v1:seed-abc', key: '3,4', x: 3, z: 4, chunkSize: 64, seed: 123, weirdness: { sampled: 0.3, distanceChunks: 5 } };
const payload = {
  entities: [
    { id: 'a', kind: 'building', x: -2, z: -2, physicalUse: { family: 'mercantile-public' }, footprintModules: [{ key: 'a0', cx: -2, cz: -2, halfX: 3, halfZ: 3, floors: 2 }], floorH: 3.15 },
    { id: 'b', kind: 'building', x: 2, z: -2, physicalUse: { family: 'industrial-service' }, footprintModules: [{ key: 'b0', cx: 2, cz: -2, halfX: 3, halfZ: 3, floors: 2 }], floorH: 3.15 },
    { id: 'c', kind: 'district-landmark', x: 2, z: 2, physicalUse: { family: 'business' }, footprintModules: [{ key: 'c0', cx: 2, cz: 2, halfX: 3, halfZ: 3, floors: 4 }], floorH: 3.15 },
  ],
  physics: { semanticConnectors: [] },
};
const composition = compileDistrictBlockComposition({ chunk, payload });
attachDistrictBlockComposition(payload, composition);
const chosen = payload.entities.find(entity => !entity.districtComposition?.anchor) ?? payload.entities[0];
const policy = districtBuildingPolicyForEntity(chosen);
assert.ok(policy.programHint);

const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.15 },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const plan = planBuildingSidecar({
  worldSeed: 9, chunkKey: chunk.key, chunkX: chunk.x, chunkZ: chunk.z,
  distanceChunks: chunk.weirdness.distanceChunks, weirdnessSampled: chunk.weirdness.sampled,
  entityId: chosen.id, programHint: policy.programHint, districtComposition: chosen.districtComposition ?? policy,
  physicalUse: chosen.physicalUse, physicalTruth, floorHeight: chosen.floorH, modules: chosen.footprintModules,
});
assert.equal(plan.buildingSemanticTruth.districtComposition.blockRole, chosen.districtComposition.blockRole);
assert.equal(plan.buildingSemanticTruth.districtComposition.districtFamily, chosen.districtComposition.districtFamily);
assert.equal(plan.grammar.semanticProgram, plan.buildingSemanticTruth.program);

const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
assert.match(engine, /programHint:\s*structureProfile\?\.semanticProgram[\s\S]*districtBuildingPolicy\.programHint/);
assert.match(engine, /districtComposition:\s*districtBuildingContext\s*\?\?\s*districtBuildingPolicy/);
assert.match(engine, /accessAnchorsForBuildingPortals\(accessPortals\)/);
assert.equal(fs.existsSync(new URL('../world/architecture/jweb-adapter.js', import.meta.url)), false);

console.log(JSON.stringify({ ok: true, entityId: chosen.id, blockRole: policy.blockRole, programHint: policy.programHint, compositionId: composition.id }));
