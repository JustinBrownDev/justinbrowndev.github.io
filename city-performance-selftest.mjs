import * as THREE from './vendor/three/three.module.js';
import { SpatialHash2D, createProgressiveStaticWorldOptimizer } from './city-performance.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const hash = new SpatialHash2D(4);
const items = [];
let seed = 0x12345678;
const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
for (let i = 0; i < 2500; i++) {
    const x = rnd() * 300 - 150;
    const z = rnd() * 300 - 150;
    const hx = 0.1 + rnd() * 5;
    const hz = 0.1 + rnd() * 5;
    const item = { id: i, x, z, hx, hz };
    items.push(item);
    hash.insert(item, { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
}

const out = [];
for (let q = 0; q < 500; q++) {
    const x = rnd() * 320 - 160;
    const z = rnd() * 320 - 160;
    const r = 0.2 + rnd() * 12;
    hash.queryRadius(x, z, r, out);
    const ids = new Set(out.map(o => o.id));
    assert(ids.size === out.length, `query ${q}: duplicate candidate returned`);

    // Broadphase may return false positives from a shared bucket, but it must
    // never miss an item whose rectangle actually touches the query square.
    for (const item of items) {
        const overlaps = item.x + item.hx >= x - r && item.x - item.hx <= x + r
            && item.z + item.hz >= z - r && item.z - item.hz <= z + r;
        if (overlaps) assert(ids.has(item.id), `query ${q}: missed item ${item.id}`);
    }
}

console.log(`[perf-selftest] PASS: ${items.length} indexed boxes, 500 randomized broadphase queries, no misses/duplicates`);

// A future accidental registerLateObject(worldChunkRoot) must be a no-op.
// The old optimizer is allowed to own authored spawn detail, never infinite
// streamed roots.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const rawSceneAdd = scene.add.bind(scene);
const optimizer = createProgressiveStaticWorldOptimizer({
    THREE, scene, camera, rawSceneAdd, drawDistance: 100, chunkSize: 24,
});
optimizer.beginIncremental();
const streamedRoot = new THREE.Group();
streamedRoot.name = 'world-chunk:4,2';
streamedRoot.userData.worldChunkRoot = true;
streamedRoot.userData.renderAuthority = 'WorldChunkStreamer';
streamedRoot.visible = true;
rawSceneAdd(streamedRoot);
optimizer.registerLateObject(streamedRoot);
optimizer.updateVisibility(true);
assert(streamedRoot.parent === scene, 'legacy optimizer must not re-parent streamed world roots');
assert(streamedRoot.visible === true, 'legacy optimizer must not hide streamed world roots');
assert(optimizer.getStats().lateObjects === 0, 'streamed world roots must not count as optimizer late objects');
console.log('[perf-world-ownership-selftest] PASS');
