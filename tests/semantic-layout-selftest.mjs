import assert from 'node:assert/strict';
import { createBridgeConnector, registerSemanticConnector } from '../world/semantic-connectors.js';
import { semanticSpaceId, solveSemanticLayout } from '../world/semantic-layout.js';
import { spacePlanAcceptsBox } from '../world/space-plan.js';

const table = {
    id: 'test/table', kind: 'office_desk', mount: 'ground', dimensionsXYZ: [1.2, 0.75, 0.7], boundsMin: [-0.6, 0, -0.35],
    clearance: { front: 0.2, rear: 0.1, sides: 0.08 }, collision: 'decorative-box-recommended',
    semanticGraph: { roles: ['semantic-prop'], capabilities: ['support-surface-provider'], requirements: [], relationships: [], support: { mode: 'floor', required: true }, circulation: { keepClear: [] } },
};
const terminal = {
    id: 'test/terminal', kind: 'terminal', mount: 'ground', dimensionsXYZ: [0.35, 0.3, 0.25], boundsMin: [-0.175, 0, -0.125],
    clearance: { front: 0.04, rear: 0.02, sides: 0.03 }, collision: 'none',
    semanticGraph: { roles: ['semantic-prop'], capabilities: [], requirements: ['support-surface'], relationships: ['sits-on-work-surface'], support: { mode: 'surface', required: true }, circulation: { keepClear: [] } },
};
const assetById = new Map([[table.id, table], [terminal.id, terminal]]);
const chunk = { key: '4,9' };
const entity = {
    id: 'building-a', semanticSiteKey: 'site-A', floorH: 3.15,
    footprintModules: [
        { key: 'A', cx: 0, cz: 0, halfX: 2.5, halfZ: 2.5, floors: 2 },
        { key: 'B', cx: 8, cz: 0, halfX: 2.5, halfZ: 2.5, floors: 2 },
    ],
};
const payload = {
    entities: [entity],
    physics: {
        props: [{ x: 8.9, z: 1.1, radius: 0.45, yMin: 0, height: 1.2, supportKind: 'interior-clutter' }],
        mazeWalls: [
            { x1: 8, z1: -2.4, x2: 8, z2: -0.55, yMin: 0, yMax: 3.15, supportKind: 'partition' },
            { x1: 8, z1: 0.55, x2: 8, z2: 2.4, yMin: 0, yMax: 3.15, supportKind: 'partition' },
        ],
        platforms: [
            { x: 0, z: 0, hx: 2.45, hz: 2.45, y: 3.15, supportKind: 'floor' },
            { x: 8, z: 0, hx: 2.45, hz: 2.45, y: 3.15, supportKind: 'floor' },
        ],
        circulationReservations: [
            { id: 'legacy-scaffold-landing', kind: 'scaffold-landing', x: 0, z: 0, halfX: 2.45, halfZ: 2.45, minX: -2.45, maxX: 2.45, minZ: -2.45, maxZ: 2.45, yMin: 0, yMax: 2.5, source: 'exterior-scaffold' },
        ],
        semanticConnectors: [],
    },
    detailReservations: [],
    semanticPlacements: [],
};
registerSemanticConnector(payload.physics, createBridgeConnector({
    id: 'bridge-A-B', axis: 'x', from: 2.5, to: 5.5, fixedCoord: 0, halfWidth: 0.5, y: 0,
    metadata: { bridgeId: 'test-bridge' },
}));

const tasks = [
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'A', floor: 0, program: 'office', assetId: table.id, seed: 0 },
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'B', floor: 0, program: 'office', assetId: terminal.id, seed: 1 },
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'B', floor: 0, program: 'office', assetId: table.id, seed: 2 },
    { kind: 'semantic-identity', entityId: entity.id, moduleKey: 'B', floor: 1, program: 'archive', assetId: table.id, seed: 4 },
];
const summary = solveSemanticLayout({ chunk, payload, tasks, assetById });
assert.equal(summary.planned, 4);
assert.equal(summary.solved, 3, 'connector-owned room must reject semantic occupancy while reachable fabric spaces solve');
assert.equal(summary.unresolved, 1);
assert.ok(summary.passes >= 2, 'dependency solver must retry unresolved hard relationships');
assert.equal(payload.semanticSpaces.length, 3, 'only task-targeted real SpacePlans publish as destination spaces');
assert.equal(payload.spacePlans.length, 3, 'only semantic destination spaces materialize full placement grids');
assert.equal(payload.semanticTopologySpaces.length, 4, 'all module/floors remain available to connector topology as lightweight fabric spaces');
assert.notEqual(semanticSpaceId(chunk.key, entity.semanticSiteKey, 'B', 0), semanticSpaceId(chunk.key, entity.semanticSiteKey, 'B', 1));
assert.ok(payload.semanticSpaces.some(space => space.id === '4,9:site-A:B:floor:0' && space.spacePlanSchema === 'jweb.space-plan.v1'));
const b0 = payload.spacePlans.find(plan => plan.id === '4,9:site-A:B:floor:0');
assert.ok(b0.regions.length >= 1 && b0.walls.length >= 2 && b0.structuralOccupancy.length === 1);
assert.equal(spacePlanAcceptsBox(b0, { x: 8, z: 1.2, halfX: 0.4, halfZ: 0.4, yMin: 0, yMax: 0.8 }), false, 'partition wall rejects bodies even inside the old module rectangle');
assert.equal(spacePlanAcceptsBox(b0, { x: 8.9, z: 1.1, halfX: 0.25, halfZ: 0.25, yMin: 0, yMax: 0.8 }), false, 'structural occupancy rejects bodies before semantic placement');
const dependent = tasks.find(task => task.assetId === terminal.id);
assert.ok(dependent.semanticPlacement, 'hard dependent retries after its provider exists');
assert.match(dependent.semanticPlacement.relationTo, /semantic:/, 'relationship binds to stable instance identity');
assert.ok(payload.physics.props.length >= 3, 'semantic collision exists before visual realization');
assert.ok(payload.detailReservations.every(r => r.kind === 'semantic-envelope'));
assert.equal(summary.connectorAuthority.orphanReservations, 0, 'all published circulation reservations are connector-owned before semantic solve');
const synthetic = payload.physics.semanticConnectors.find(connector => connector.metadata?.derivedFromReservation);
assert.ok(synthetic && synthetic.kind === 'fire-escape', 'raw scaffold circulation is promoted to semantic connector authority');
const bridge = payload.physics.semanticConnectors.find(connector => connector.id === 'bridge-A-B');
assert.equal(bridge.fromSpaceId, '4,9:site-A:A:floor:0');
assert.equal(bridge.toSpaceId, '4,9:site-A:B:floor:0');
console.log('PASS fabric SpacePlan semantic hinge', summary);
