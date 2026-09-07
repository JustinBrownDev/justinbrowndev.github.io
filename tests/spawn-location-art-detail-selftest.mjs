import assert from 'node:assert/strict';
import { detailSpawnLocation } from '../world/spawn-location-art-detail.js';

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Node {
    constructor() {
        this.children = [];
        this.position = new Vec3();
        this.scale = new Vec3(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0 };
        this.userData = {};
        this.visible = true;
    }
    add(child) { this.children.push(child); child.parent = this; }
}
class Group extends Node {}
class Mesh extends Node { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
class BoxGeometry { dispose() {} }
class MeshStandardMaterial { constructor(values) { Object.assign(this, values); } dispose() {} }
const THREE = { Group, Mesh, BoxGeometry, MeshStandardMaterial };

function seededGroup(placement) {
    const group = new Group();
    group.name = placement.instanceId;
    group.userData.spawnInstanceId = placement.instanceId;
    group.add(new Mesh({ kind: 'old-box' }, { kind: 'old-material' }));
    return group;
}

const placements = [
    { instanceId: 'support', slot: 'tv-support', variantId: 'support.cinderblock-plank', dimensionsM: [1.25, 0.62, 0.54], transform: {} },
    { instanceId: 'seat', slot: 'seating', variantId: 'seat.folding-metal', tags: ['folding'], dimensionsM: [0.49, 0.8, 0.5], transform: {} },
    { instanceId: 'tv', slot: 'primary-tv', variantId: 'tv.crt-portable', tags: ['crt'], dimensionsM: [0.9, 0.65, 0.4], transform: {} },
    { instanceId: 'drink', slot: 'drink-evidence', familyId: 'spawn.drink-and-table-clutter', variantId: 'drink.wine-bottle', dimensionsM: [0.12, 0.34, 0.12], transform: {} },
    { instanceId: 'power', slot: 'power-explanation', familyId: 'spawn.power-and-cables', variantId: 'power.coax-run', dimensionsM: [0.8, 0.04, 0.3], transform: {} },
    { instanceId: 'hvac', slot: 'roof-credibility', familyId: 'spawn.roof-utilities', variantId: 'roof.hvac-small', dimensionsM: [0.9, 0.72, 0.8], transform: {} },
    { instanceId: 'lamp', slot: 'warm-practical', variantId: 'light.desk-lamp', dimensionsM: [0.3, 0.55, 0.3], transform: {} },
    { instanceId: 'plant', slot: 'plant-softener', variantId: 'plant.pot', dimensionsM: [0.45, 0.7, 0.45], transform: {} },
    { instanceId: 'tube', slot: 'vacuum-landmark', variantId: 'landmark.vacuum-tube', dimensionsM: [2.4, 5.2, 2.4], transform: {} },
];
const root = new Group();
for (const placement of placements) root.add(seededGroup(placement));
const resources = { geometries: [], materials: [] };
const summary = detailSpawnLocation({ THREE, root, plan: { placements }, resources, partBudget: 120 });

assert.equal(summary.applied, true);
assert.equal(summary.detailedInstances, placements.length);
assert.ok(summary.partCount > 30, 'detail pass should materially articulate the spawn set');
assert.ok(summary.partCount <= 120, 'detail pass must honor the explicit part budget');
assert.ok(resources.geometries.length === 1, 'one shared detail box geometry');
assert.ok(resources.materials.length >= 6, 'small shared material palette should be registered for disposal');
assert.equal(root.userData.spawnArtDetail.schema, 'jweb.spawn-location-art-detail.v1');

const baseHidden = id => root.children.find(group => group.name === id).children[0].visible === false;
assert.equal(baseHidden('hvac'), true, 'generic roof proxy should be visually replaced');
assert.equal(baseHidden('tube'), true, 'generic landmark proxy should be visually replaced');
assert.equal(baseHidden('drink'), true, 'generic clutter proxy should be visually replaced');
assert.equal(baseHidden('power'), true, 'generic power proxy should be visually replaced');
assert.equal(baseHidden('lamp'), true, 'generic lamp proxy should be visually replaced');
assert.equal(baseHidden('plant'), true, 'generic plant proxy should be visually replaced');
assert.equal(baseHidden('support'), true, 'generic cinderblock-table proxy should be replaced by a legible block-and-plank assembly');
assert.equal(baseHidden('seat'), false, 'seat proxy remains and is only enriched');
assert.equal(baseHidden('tv'), false, 'TV base/screen geometry must never be hidden by the art pass');

console.log('[spawn-location-art-detail-selftest] PASS', summary);
