import assert from 'node:assert/strict';
import { planExteriorTextDensity, listExteriorTextMedia } from '../world/exterior-text-density.js';

function hashString32(value) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < String(value).length; i++) {
        h ^= String(value).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pickMassiveNoisePair(rng) {
    return [`ROW ${Math.floor(rng() * 9999)}`, `ETAG ${Math.floor(rng() * 999999)}`];
}

const textExciter = {
    pairFor(chunk, entityId, channel, fallback) {
        // Deliberately include weirdness in text only. Geometry must remain the same.
        return [`${fallback[0]} / ${channel}`, `${fallback[1]} / W=${chunk.weirdness.sampled}`];
    },
};

const entity = {
    id: 'building:test',
    x: 0,
    z: 0,
    halfX: 3,
    halfZ: 2.5,
    floors: 4,
    floorH: 3.15,
    doorSide: 'north',
    facades: [
        { side: 'north', x: 0, z: 0, halfX: 3, halfZ: 2.5 },
        { side: 'east', x: 0, z: 0, halfX: 3, halfZ: 2.5 },
        { side: 'south', x: 0, z: 0, halfX: 3, halfZ: 2.5 },
        { side: 'west', x: 0, z: 0, halfX: 3, halfZ: 2.5 },
    ],
};

const common = { entity, worldSeed: 0x4a574542, textExciter, pickMassiveNoisePair, hashString32 };
const near = planExteriorTextDensity({ ...common, chunk: { key: '2,3', weirdness: { sampled: 0.02 } } });
const nearAgain = planExteriorTextDensity({ ...common, chunk: { key: '2,3', weirdness: { sampled: 0.02 } } });
const weird = planExteriorTextDensity({ ...common, chunk: { key: '2,3', weirdness: { sampled: 0.98 } } });

assert.deepEqual(near, nearAgain, 'same inputs must remain deterministic');
assert.ok(near.length >= 14 && near.length <= 22, 'density layer must be materially dense but bounded');
assert.equal(new Set(near.map(task => task.medium)).size, listExteriorTextMedia().length, 'every text medium should appear in a normal dense building pass');
assert.ok(near.every(task => task.kind === 'surface-text' && task.nonBlocking === true));
assert.ok(near.every(task => task.width > 0 && task.height > 0));
assert.ok(near.every(task => task.y > 0.4 && task.y < entity.floors * entity.floorH + 0.01));
assert.ok(near.filter(task => task.side === entity.doorSide && task.y < 2.34).every(task => Math.abs(task.along) >= 0.34), 'low front-face text must avoid the doorway center band');

const stripText = tasks => tasks.map(({ title, subtitle, ...geometry }) => geometry);
assert.deepEqual(stripText(near), stripText(weird), 'density geometry/count must not be modulated by weirdness');
assert.notDeepEqual(near.map(task => task.subtitle), weird.map(task => task.subtitle), 'existing text voice may still respond to weirdness');

console.log('[exterior-text-density-selftest] PASS', {
    placements: near.length,
    media: [...new Set(near.map(task => task.medium))],
    frontLowPlacements: near.filter(task => task.side === entity.doorSide && task.y < 2.34).length,
});
