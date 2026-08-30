import * as THREE from '../vendor/three/three.module.js';
import { createProgressiveStaticWorldOptimizer } from '../city-performance.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 2, 0);
const rawSceneAdd = scene.add.bind(scene);
const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

for (let i = 0; i < 120; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMaterial.clone());
    mesh.position.set((i % 12) * 3 - 18, 0, Math.floor(i / 12) * 3 - 15);
    scene.add(mesh);
}

const optimizer = createProgressiveStaticWorldOptimizer({
    THREE,
    scene,
    camera,
    rawSceneAdd,
    drawDistance: 60,
    chunkSize: 12,
    mergeMinMeshes: 3,
    mergeMaxVertices: 120000,
});

let calls = 0;
let lateInserted = false;
await optimizer.optimize({
    yieldControl: async () => {
        calls++;
        if (!lateInserted && calls > 2) {
            lateInserted = true;
            const late = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMaterial);
            late.position.set(2, 0, 2);
            rawSceneAdd(late);
            optimizer.registerLateObject(late);
        }
        return calls % 5 === 0;
    },
});

const readyStats = optimizer.getStats();
assert(readyStats.phase === 'ready', 'optimizer did not reach ready state');

let ownedLeaf = null;
scene.traverse(obj => {
    if (!ownedLeaf && obj.isMesh && obj.parent?.userData?.__perfChunkGroup) ownedLeaf = obj;
});
assert(ownedLeaf, 'optimizer did not leave a chunk-owned mesh available for dirty marking');
assert(typeof optimizer.markDirtyObject === 'function', 'progressive optimizer must expose markDirtyObject for shader-family staging');
assert(optimizer.markDirtyObject(ownedLeaf) === true, 'chunk-owned leaf was not marked dirty');
assert(optimizer.getStats().dirtyChunks > 0, 'dirty chunk count did not reflect markDirtyObject');
await optimizer.flushDirtyChunks();
assert(optimizer.getStats().dirtyChunks === 0, 'dirty chunk created by markDirtyObject was not flushable');
const streamedRoot = new THREE.Group();
streamedRoot.userData.worldChunkRoot = true;
assert(optimizer.markDirtyObject(streamedRoot) === false, 'generic streamed roots must never be captured by authored optimizer dirty marking');

const stats = optimizer.getStats();
assert(calls > 10, 'optimizer did not expose cooperative work boundaries');
assert(stats.chunks > 0, 'optimizer did not create spatial chunks');
assert(stats.lateObjects === 1, 'late object queued during optimization was not recovered');
assert(stats.drawCallsSaved > 0, 'mesh batching did not run');
assert(stats.materialReplacements > 0, 'material dedupe did not run');
console.log('[progressive-optimizer-selftest] PASS', stats);
