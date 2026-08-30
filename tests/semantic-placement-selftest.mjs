import assert from 'node:assert/strict';
import { resolveSemanticPlacement, createSemanticPlacementRecord } from '../world/semantic-placement.js';
import { semanticGraphForAsset } from '../vendor/city-pack/semantic-interiors/semantic-links.js';

const module = { key: 'room-a', cx: 0, cz: 0, halfX: 3.2, halfZ: 3.2 };
const reservations = [];
const overlaps = (a, b) => a.yMin < b.yMax && a.yMax > b.yMin
    && a.x - a.halfX < b.x + b.halfX && a.x + a.halfX > b.x - b.halfX
    && a.z - a.halfZ < b.z + b.halfZ && a.z + a.halfZ > b.z - b.halfZ;
const tryReserve = next => {
    if (reservations.some(other => overlaps(next, other))) return false;
    reservations.push(next);
    return true;
};
const placements = [];
const place = (def, seed, program = 'office') => {
    const graph = semanticGraphForAsset(def);
    const placement = resolveSemanticPlacement({
        def, graph, module, yBase: 0, floorH: 3.15, seed,
        placements, entityId: 'building-1', moduleKey: module.key, floor: 0, tryReserve,
    });
    if (!placement) return null;
    const record = createSemanticPlacementRecord({
        def, graph, placement, entityId: 'building-1', moduleKey: module.key, floor: 0, program,
    });
    placements.push(record);
    return record;
};

const desk = {
    id: 'semantic/interior/office_desk', kind: 'office_desk', dimensionsXYZ: [1.45, 0.755, 0.72],
    boundsMin: [-0.725, 0, -0.36], clearance: { front: 0.75, sides: 0.174, rear: 0.18 },
    sockets: { topSurface: true },
};
const monitor = {
    id: 'semantic/interior/crt_monitor', kind: 'crt_monitor', dimensionsXYZ: [0.58, 0.52, 0.5535],
    boundsMin: [-0.29, 0, -0.2767], clearance: { front: 0.36, sides: 0.07, rear: 0.138 }, sockets: {},
};
const rack = {
    id: 'semantic/interior/server_rack', kind: 'server_rack', dimensionsXYZ: [0.68, 1.9, 0.905],
    boundsMin: [-0.34, 0, -0.4525], clearance: { front: 0.588, sides: 0.082, rear: 0.226 },
    sockets: { rowLeft: true, rowRight: true },
};
const mainframe = {
    id: 'semantic/interior/mainframe_cabinet', kind: 'mainframe_cabinet', dimensionsXYZ: [1, 1.9, 0.805],
    boundsMin: [-0.5, 0, -0.4025], clearance: { front: 0.523, sides: 0.12, rear: 0.201 },
    sockets: { topSurface: true, rowLeft: true, rowRight: true },
};

const deskPlacement = place(desk, 101);
assert.ok(deskPlacement, 'desk should establish a floor work surface');
assert.equal(deskPlacement.graph.schema, 'jweb.semantic-links.v1');

const monitorPlacement = place(monitor, 102);
assert.ok(monitorPlacement, 'monitor should resolve once a support surface exists');
assert.equal(monitorPlacement.mode, 'support-surface');
assert.equal(monitorPlacement.relationTo, desk.id);
assert.ok(Math.abs(monitorPlacement.x - deskPlacement.x) < 1e-9);
assert.ok(Math.abs(monitorPlacement.z - deskPlacement.z) < 1e-9);
assert.ok(Math.abs(monitorPlacement.y - 0.755) < 1e-9, 'monitor bottom should sit on desk top');

// New room: first rack establishes a wall/service row, second rack consumes it.
reservations.length = 0;
placements.length = 0;
const rackPlacement = place(rack, 201, 'server_room');
assert.ok(rackPlacement, 'server rack should resolve against a wall context');
assert.equal(rackPlacement.mode, 'wall-context');

const mainframePlacement = place(mainframe, 202, 'server_room');
assert.ok(mainframePlacement, 'mainframe should extend the established rack row');
assert.equal(mainframePlacement.mode, 'row-aligned');
assert.equal(mainframePlacement.relationTo, rack.id);
assert.ok(Math.abs(mainframePlacement.rotY - rackPlacement.rotY) < 1e-9, 'rack fronts must align');

// A hard support dependency must not silently fall back to the floor.
reservations.length = 0;
placements.length = 0;
const orphanMonitor = place(monitor, 303);
assert.equal(orphanMonitor, null);

console.log('[semantic-placement-selftest] PASS', {
    deskMonitor: monitorPlacement.mode,
    rackPair: mainframePlacement.mode,
    hardDependency: 'enforced',
});
