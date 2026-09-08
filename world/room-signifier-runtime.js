// world/room-signifier-runtime.js
//
// The only place in the guaranteed room-signifier layer that touches
// THREE.js. Consumes room-signifier-planner.js output (many spaces, each
// with a handful of accepted cues, each cue a handful of box "parts") and
// batches every part into a small, fixed number of InstancedMesh objects --
// one shared unit-cube BoxGeometry, one MeshStandardMaterial per palette key
// (world/room-signifier-primitives.js's MATERIAL_PALETTE_KEYS, six total).
//
// This mirrors world/exterior-prop-field.js's existing InstancedMesh-per-
// shape pattern. Regardless of how many rooms/cues are furnished, the scene
// graph only ever gains a handful of new nodes (one per material key that
// actually has instances) -- section 37's performance doctrine.

import { MATERIAL_PALETTE_KEYS, MATERIAL_PALETTE_COLORS } from './room-signifier-primitives.js';

export const ROOM_SIGNIFIER_RUNTIME_SCHEMA = 'jweb.room-signifier-runtime.v1';

export function createRoomSignifierRuntime({ THREE, materialOverrides = null } = {}) {
  if (!THREE) throw new Error('createRoomSignifierRuntime requires THREE');
  const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map(MATERIAL_PALETTE_KEYS.map(key => [key, new THREE.MeshStandardMaterial({
    color: materialOverrides?.[key] ?? MATERIAL_PALETTE_COLORS[key],
    roughness: 0.86,
    metalness: key === 'darkEquipment' || key === 'paintedMetal' ? 0.18 : 0.04,
  })]));

  // Flatten every accepted cue instance, across every furnished space, into
  // per-material buckets of {position, rotationY, scale}.
  function bucketPartsByMaterial(spaceRecords) {
    const buckets = new Map(MATERIAL_PALETTE_KEYS.map(key => [key, []]));
    let totalParts = 0;
    for (const space of spaceRecords ?? []) {
      for (const cue of space.cues ?? []) {
        for (const instance of cue.instances ?? []) {
          for (const part of instance.parts ?? []) {
            const bucket = buckets.get(part.materialKey);
            if (!bucket) continue; // unknown material key: skip rather than crash a whole room
            bucket.push(part);
            totalParts++;
          }
        }
      }
    }
    return { buckets, totalParts };
  }

  /**
   * Realize a room-signifier plan report (world/room-signifier-planner.js
   * output) into a THREE.Group of InstancedMesh objects, one per material
   * key that has at least one instance.
   */
  function realize(report) {
    const { buckets, totalParts } = bucketPartsByMaterial(report?.spaces);
    const group = new THREE.Group();
    group.name = 'room-signifier-runtime';
    group.userData.schema = ROOM_SIGNIFIER_RUNTIME_SCHEMA;
    group.userData.entityId = report?.entityId ?? null;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);
    let meshCount = 0;

    for (const [materialKey, parts] of buckets) {
      if (!parts.length) continue;
      const mesh = new THREE.InstancedMesh(unitBoxGeometry, materials.get(materialKey), parts.length);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.name = `room-signifier:${materialKey}`;
      mesh.userData.materialKey = materialKey;
      parts.forEach((part, index) => {
        quaternion.setFromAxisAngle(upAxis, part.rotationY ?? 0);
        matrix.compose(
          new THREE.Vector3(part.position.x, part.position.y, part.position.z),
          quaternion,
          new THREE.Vector3(Math.max(1e-3, part.scale.x), Math.max(1e-3, part.scale.y), Math.max(1e-3, part.scale.z)),
        );
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = true;
      group.add(mesh);
      meshCount++;
    }

    return {
      group,
      stats: Object.freeze({
        schema: ROOM_SIGNIFIER_RUNTIME_SCHEMA,
        renderBatchCount: meshCount,
        primitiveInstanceCount: totalParts,
        uniqueGeometries: 1,
        uniqueMaterials: materials.size,
      }),
    };
  }

  function dispose() {
    unitBoxGeometry.dispose();
    for (const material of materials.values()) material.dispose();
  }

  return Object.freeze({ realize, dispose, unitBoxGeometry, materials });
}
