import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  attachDistrictBlockComposition,
  compileDistrictBlockComposition,
  districtBuildingPolicyForEntity,
} from '../world/district-block-composition.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jweb-district-adapter-'));
const world = path.join(tmp, 'world');
const architecture = path.join(world, 'architecture');
fs.mkdirSync(architecture, { recursive: true });
fs.copyFileSync(new URL('../world/district-block-composition.js', import.meta.url), path.join(world, 'district-block-composition.js'));
fs.copyFileSync(new URL('../world/access-portals.js', import.meta.url), path.join(world, 'access-portals.js'));
fs.copyFileSync(new URL('../world/architecture/jweb-adapter.js', import.meta.url), path.join(architecture, 'jweb-adapter.js'));
fs.writeFileSync(path.join(architecture, 'building-plan-sidecar.js'), `export function planBuildingSidecar(input) { return { received: input }; }\n`);

const chunk = { worldId: 'jweb.dev/world:v1:seed-abc', key: '3,4', x: 3, z: 4, chunkSize: 64, seed: 123, weirdness: { sampled: 0.3, distanceChunks: 5 } };
const payload = {
  entities: [
    { id: 'a', kind: 'building', x: -2, z: -2, physicalUse: { family: 'mercantile-public' }, footprintModules: [{ key: 'a0', cx: -2, cz: -2, halfX: 1, halfZ: 1, floors: 2 }], floorH: 3.15 },
    { id: 'b', kind: 'building', x: 2, z: -2, physicalUse: { family: 'industrial-service' }, footprintModules: [{ key: 'b0', cx: 2, cz: -2, halfX: 1, halfZ: 1, floors: 2 }], floorH: 3.15 },
    { id: 'c', kind: 'district-landmark', x: 2, z: 2, physicalUse: { family: 'business' }, footprintModules: [{ key: 'c0', cx: 2, cz: 2, halfX: 1, halfZ: 1, floors: 4 }], floorH: 3.15 },
    { id: 'd', kind: 'building', x: -2, z: 2, physicalUse: { family: 'residential-lodging' }, footprintModules: [{ key: 'd0', cx: -2, cz: 2, halfX: 1, halfZ: 1, floors: 3 }], floorH: 3.15 },
    { id: 'e', kind: 'building', x: 0, z: 0, physicalUse: { family: 'maintenance-utility' }, footprintModules: [{ key: 'e0', cx: 0, cz: 0, halfX: 1, halfZ: 1, floors: 2 }], floorH: 3.15 },
    { id: 'f', kind: 'building', x: 0, z: 2, physicalUse: { family: 'assembly-institutional' }, footprintModules: [{ key: 'f0', cx: 0, cz: 2, halfX: 1, halfZ: 1, floors: 2 }], floorH: 3.15 },
  ],
  physics: { semanticConnectors: [] },
};
const composition = compileDistrictBlockComposition({ chunk, payload });
attachDistrictBlockComposition(payload, composition);
const chosen = payload.entities.find(entity => entity.districtComposition?.blockRole === 'service-edge')
  ?? payload.entities.find(entity => !entity.districtComposition?.anchor);
assert.ok(chosen, 'no district-context building available');
const expected = districtBuildingPolicyForEntity(chosen);
assert.ok(expected.programHint, 'test building has no district program hint');

const adapter = await import(pathToFileURL(path.join(architecture, 'jweb-adapter.js')).href + `?t=${Date.now()}`);
const input = adapter.sidecarInputFromKowloon({ worldSeed: 9, chunk, entity: chosen, physics: payload.physics });
assert.equal(input.programHint, expected.programHint, 'Building Plan adapter ignored district program hint');
assert.equal(input.districtCompositionId, composition.id, 'Building Plan adapter lost district provenance');
assert.equal(input.districtComposition.blockRole, chosen.districtComposition.blockRole, 'Building Plan adapter lost block role');
assert.equal(input.districtComposition.districtFamily, chosen.districtComposition.districtFamily, 'Building Plan adapter must pass full district identity into Building Semantic Truth');
assert.equal(input.districtComposition.exteriorHints.facadeSemanticFamily, chosen.districtComposition.exteriorHints.facadeSemanticFamily, 'Building Plan adapter flattened district exterior intent before shared identity');

const explicit = adapter.sidecarInputFromKowloon({ worldSeed: 9, chunk, entity: chosen, physics: payload.physics, programHint: 'explicit_override' });
assert.equal(explicit.programHint, 'explicit_override', 'explicit upstream Building Semantic Truth hint must remain authoritative over district fallback');

const planned = adapter.planKowloonEntitySidecar({ worldSeed: 9, chunk, entity: chosen, physics: payload.physics });
assert.equal(planned.received.programHint, expected.programHint, 'sidecar planner did not receive district-aware input');

console.log(JSON.stringify({ ok: true, entityId: chosen.id, blockRole: expected.blockRole, programHint: expected.programHint, compositionId: composition.id }));
