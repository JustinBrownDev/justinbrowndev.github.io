import assert from 'node:assert/strict';
import { parseSpawnTodoText } from '../world/spawn-todo-runtime.js';
import { planSpawnTodoDisplay, spawnTodoDisplayMode } from '../world/spawn-todo-display.js';

const parsed = parseSpawnTodoText(`# JWEB TODO\n\n- Alpha\n- [ ] Beta item\n- [x] already done\n  - nested is intentionally ignored by flat v1\n- Alpha\n`);
assert.equal(parsed.schema, 'jweb.todo-list.v1');
assert.deepEqual(parsed.items.map(item => item.text), ['Alpha', 'Beta item', 'Alpha']);
assert.equal(parsed.items[0].schema, 'jweb.todo-item.v1');
assert.notEqual(parsed.items[0].id, parsed.items[2].id, 'duplicate text gets occurrence identity');
const reordered = parseSpawnTodoText('- Zed\n- Alpha\n- Beta item\n');
assert.equal(reordered.items[1].id, parsed.items[0].id, 'distinct task identity survives reordering');
assert.ok(parsed.items.every(item => item.state === 'open'));
assert.equal(parsed.items[0].source.file, 'TODO.md');

const hostSpace = {
    surfaceY: 6,
    bounds: { x: 0, z: 0 },
    supportPatches: [{ x: 0, z: 0, halfX: 6, halfZ: 5, yMin: 6, yMax: 6.1 }],
    nearbyWalls: [
        { x1: -6, z1: -5, x2: 6, z2: -5, yMin: 6, yMax: 9.3, thickness: 0.14 },
        { x1: 6, z1: -5, x2: 6, z2: 5, yMin: 6, yMax: 9.3, thickness: 0.14 },
        { x1: 6, z1: 5, x2: -6, z2: 5, yMin: 6, yMax: 9.3, thickness: 0.14 },
        { x1: -6, z1: 5, x2: -6, z2: -5, yMin: 6, yMax: 9.3, thickness: 0.14 },
    ],
};
const items = Array.from({ length: 25 }, (_, i) => ({ id: `todo:test:${i + 1}`, text: `Task number ${i + 1}` }));
function basePlan(profile) {
    return {
        startProfile: { id: profile },
        placements: [
            { instanceId: 'support', slot: 'tv-support', dimensionsM: [1.8, 0.76, 1.0], transform: { x: 0, y: 6.38, z: 0, rotY: Math.PI / 2 } },
            { instanceId: 'media', slot: 'primary-tv', dimensionsM: [0.52, 0.32, 0.18], transform: { x: 0, y: 6.84, z: 0, rotY: Math.PI / 2 }, relationTo: 'support' },
        ],
        reservations: [{ id: 'arrival', kind: 'spawn-arrival-keep-clear', x: 0, z: 3.5, halfX: 0.72, halfZ: 0.72, yMin: 6, yMax: 8.05 }],
    };
}

const radioPlan = basePlan('radio-roof');
assert.equal(spawnTodoDisplayMode(radioPlan), 'post-its');
const radio = planSpawnTodoDisplay({ plan: radioPlan, hostSpace, items });
assert.equal(radio.elements.length, items.length, 'one physical post-it per TODO, with no clipping');
assert.ok(radio.elements.every(n => Number.isFinite(n.x) && Number.isFinite(n.z) && n.width > 0.08));

const laptopPlan = basePlan('small-tv-roof');
const laptop = planSpawnTodoDisplay({ plan: laptopPlan, hostSpace, items });
assert.equal(laptop.mode, 'clipboard');
assert.equal(laptop.elements.length, Math.ceil(items.length / 7));
assert.equal(laptop.elements.flatMap(p => p.items).length, items.length, 'every TODO is written onto a clipboard page');

const whitePlan = basePlan('normal-tv-roof');
const white = planSpawnTodoDisplay({ plan: whitePlan, hostSpace, items });
assert.equal(white.mode, 'whiteboard');
assert.equal(white.elements.flatMap(p => p.items).length, items.length);
assert.ok(white.elements.some(p => Number.isInteger(p.frame?.wallIndex)), 'whiteboard consumes real wall authority when available');

const terraPlan = basePlan('terra-backroom');
terraPlan.placements.push(
    { instanceId: 'rack0', slot: 'progression-server-rack', dimensionsM: [0.72, 2.05, 0.86], transform: { x: -3.5, y: 7.025, z: -4.5, rotY: 0 }, spatialRelation: { kind: 'backed-against-wall', wallIndex: 0 } },
    { instanceId: 'ws0', slot: 'progression-workstation', dimensionsM: [1.55, 1.42, 0.78], transform: { x: 3.2, y: 6.71, z: -4.55, rotY: 0 }, spatialRelation: { kind: 'backed-against-wall', wallIndex: 0 } },
);
const terra = planSpawnTodoDisplay({ plan: terraPlan, hostSpace, items });
assert.equal(terra.mode, 'terra-display');
assert.equal(terra.elements.flatMap(p => p.items).length, items.length);
assert.ok(terra.elements.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
assert.ok(terra.elements.some(p => Number.isInteger(p.frame?.wallIndex)), 'TERRA display participates in wall geometry instead of arbitrary maxX placement');

console.log('[spawn-todo-selftest] PASS', {
    parsed: parsed.items.length,
    postIts: radio.elements.length,
    clipboards: laptop.elements.length,
    whiteboards: white.elements.length,
    terraPanels: terra.elements.length,
});
