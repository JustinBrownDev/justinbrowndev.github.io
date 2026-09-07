import assert from 'node:assert/strict';
import { realizeSpawnLocation } from '../world/spawn-location-realizer.js';

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Node {
    constructor() {
        this.children = [];
        this.position = new Vec3();
        this.scale = new Vec3(1, 1, 1);
        this.rotation = { y: 0 };
        this.userData = {};
        this.matrixAutoUpdate = true;
        this.matrixWorldAutoUpdate = true;
    }
    add(child) { this.children.push(child); child.parent = this; }
    traverse(fn) { fn(this); for (const child of this.children) child.traverse ? child.traverse(fn) : fn(child); }
    updateMatrix() {}
    updateMatrixWorld() {}
}
class Group extends Node {}
class Mesh extends Node { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
class BoxGeometry { constructor() { this.kind = 'box'; } }
class PlaneGeometry { constructor() { this.kind = 'plane'; } }
class MeshStandardMaterial { constructor(values) { Object.assign(this, values); } }
const THREE = { Group, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial };

const plan = {
    schema: 'jweb.spawn-spatial-plan.v1', ready: true,
    reservations: [
        { id: 'arrival', kind: 'spawn-arrival-keep-clear', x: 0, z: 0, halfX: 0.7, halfZ: 0.7, minX: -0.7, maxX: 0.7, minZ: -0.7, maxZ: 0.7, yMin: 6, yMax: 8 },
        { id: 'tv-envelope', kind: 'spawn-furniture-envelope', x: -2, z: 0, halfX: 0.6, halfZ: 0.45, minX: -2.6, maxX: -1.4, minZ: -0.45, maxZ: 0.45, yMin: 6, yMax: 7.5 },
    ],
    placements: [
        { instanceId: 'loc:tv-support:0', slot: 'tv-support', variantId: 'support', dimensionsM: [1.0, 0.7, 0.5], transform: { x: -2, y: 6.35, z: 0, rotY: 0 } },
        { instanceId: 'loc:primary-tv:0', slot: 'primary-tv', variantId: 'tv', dimensionsM: [0.9, 0.65, 0.4], transform: { x: -2, y: 7.025, z: 0, rotY: 0 } },
        { instanceId: 'loc:seating:0', slot: 'seating', variantId: 'seat-a', dimensionsM: [0.55, 0.85, 0.55], transform: { x: -0.5, y: 6.425, z: -1.5, rotY: 0.4 } },
        { instanceId: 'loc:seating:1', slot: 'seating', variantId: 'seat-b', dimensionsM: [0.55, 0.85, 0.55], transform: { x: -0.5, y: 6.425, z: 1.5, rotY: -0.4 } },
        { instanceId: 'loc:warm-practical:0', slot: 'warm-practical', variantId: 'lamp', dimensionsM: [0.3, 0.55, 0.3], transform: { x: -2.8, y: 6.275, z: 0.8, rotY: 0 } },
    ],
};
const boundLocation = {
    locationId: 'spawn.rooftop-reality-leak',
    hostSpace: { spaceId: 'entity:test:roof', payloadKey: 'site-test', entityId: 'entity-test', surfaceY: 6 },
    spatialPlan: plan,
};
const payload = {
    entity: { id: 'entity-test' },
    physics: { circulationReservations: [{ id: 'existing', kind: 'stair-shaft' }] },
};
const fabricPayloads = new Map([['site-test', payload]]);
const scene = { children: [], add(node) { this.children.push(node); } };
const propColliders = [];
const result = realizeSpawnLocation({ THREE, scene, boundLocation, fabricPayloads, propColliders });
assert.ok(result);
assert.equal(scene.children.length, 1);
assert.equal(result.screenSockets.length, 1, 'physical TV must expose exactly one generic screen socket');
assert.equal(result.screenSockets[0].role, 'television-screen');
assert.equal(result.colliderCount, 3, 'support + two seats own finite collision');
assert.equal(propColliders.length, 3);
assert.ok(propColliders.every(collider => Number.isFinite(collider.yMin) && Number.isFinite(collider.height) && collider.height > collider.yMin));
assert.equal(payload.physics.circulationReservations.length, 3, 'existing reservation + two spawn reservations installed');
assert.ok(payload.physics.circulationReservations.some(item => item.id === 'arrival'));
assert.ok(payload.physics.circulationReservations.some(item => item.id === 'tv-envelope'));
console.log('[spawn-location-realizer-selftest] PASS', {
    sockets: result.screenSockets.length,
    colliders: result.colliderCount,
    reservationsInstalled: result.reservationsInstalled,
});

const radioPlan = structuredClone(plan);
radioPlan.schema = 'jweb.spawn-spatial-plan.v2';
radioPlan.mediaKind = 'radio';
radioPlan.startProfile = { id: 'radio-night' };
const radioPlacement = radioPlan.placements.find(item => item.slot === 'primary-tv');
radioPlacement.familyId = 'spawn.media.radio';
radioPlacement.variantId = 'radio.vhf-workshop';
radioPlacement.tags = ['radio', 'communications', 'old'];
radioPlacement.dimensionsM = [0.42, 0.2, 0.28];
const radioBoundLocation = {
    ...boundLocation,
    spatialPlan: radioPlan,
    composition: { media: { sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'proximity' } },
};
const radioPayload = { entity: { id: 'entity-test' }, physics: { circulationReservations: [] } };
const radioFabricPayloads = new Map([['site-test', radioPayload]]);
const radioScene = { children: [], add(node) { this.children.push(node); }, remove(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); } };
const radioColliders = [];
const radioResult = realizeSpawnLocation({ THREE, scene: radioScene, boundLocation: radioBoundLocation, fabricPayloads: radioFabricPayloads, propColliders: radioColliders });
assert.ok(radioResult);
assert.equal(radioResult.mediaKind, 'radio');
assert.equal(radioResult.startProfile, 'radio-night');
assert.equal(radioResult.screenSockets.length, 0, 'radio-only start must not fabricate a television screen socket');
assert.equal(radioResult.audioSockets.length, 1, 'radio-only start must publish one positional audio socket');
assert.equal(radioResult.audioSockets[0].role, 'radio-audio');
assert.ok(radioResult.mediaController, 'radio-only start must own a live audio controller');
assert.equal(radioResult.mediaController.mode, 'audio-only', 'radio controller must not create video output');
assert.equal(radioScene.children.length, 1);
assert.ok(radioResult.root.children.length >= 5, 'radio hangout should still contain support, seats, lamp, and media geometry');
radioResult.dispose();
assert.equal(radioScene.children.length, 0, 'dispose must remove optional hangout geometry');
assert.equal(radioColliders.length, 0, 'dispose must remove optional hangout colliders');
console.log('[spawn-location-realizer-selftest] RADIO PASS', { mediaKind: radioResult.mediaKind });

const hangingBoundLocation = {
    ...boundLocation,
    hostSpace: { ...boundLocation.hostSpace, payloadLayer: 'hanging', entityId: 'hanging-entity' },
};
const hangingPayload = { entity: { id: 'hanging-entity' }, physics: { circulationReservations: [] } };
const rootWithHanging = {
    entity: { id: 'ground-entity' }, physics: { circulationReservations: [] },
    hangingLayer: { payload: hangingPayload },
};
const hangingScene = { children: [], add(node) { this.children.push(node); } };
const hangingResult = realizeSpawnLocation({
    THREE,
    scene: hangingScene,
    boundLocation: hangingBoundLocation,
    fabricPayloads: new Map([['site-test', rootWithHanging]]),
    propColliders: [],
});
assert.ok(hangingResult, 'hanging-city host must realize through the nested payload');
assert.equal(hangingPayload.physics.circulationReservations.length, 2, 'spawn reservations must install on hanging physics ownership');
assert.equal(rootWithHanging.physics.circulationReservations.length, 0, 'hanging spawn must not mutate the upright payload reservations');
console.log('[spawn-location-realizer-selftest] HANGING HOST PASS', { reservationsInstalled: hangingResult.reservationsInstalled });
