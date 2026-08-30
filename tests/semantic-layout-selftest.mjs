import assert from 'node:assert/strict';
import { semanticSpaceId, solveSemanticLayout } from '../world/semantic-layout.js';

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
        props: [],
        circulationReservations: [{ id: 'connector-sweep', kind: 'portal-sweep', x: 0, z: 0, halfX: 2.45, halfZ: 2.45, minX: -2.45, maxX: 2.45, minZ: -2.45, maxZ: 2.45, yMin: 0, yMax: 2.5 }],
    },
    detailReservations: [],
    semanticPlacements: [],
};
const tasks = [
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'A', floor: 0, program: 'office', assetId: table.id, seed: 0 },
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'B', floor: 0, program: 'office', assetId: terminal.id, seed: 1 },
    { kind: 'semantic-functional', entityId: entity.id, moduleKey: 'B', floor: 0, program: 'office', assetId: table.id, seed: 2 },
    { kind: 'semantic-identity', entityId: entity.id, moduleKey: 'B', floor: 1, program: 'archive', assetId: table.id, seed: 4 },
];
const summary = solveSemanticLayout({ chunk, payload, tasks, assetById });
assert.equal(summary.planned, 4);
assert.equal(summary.solved, 3, 'connector-owned room must reject semantic occupancy while reachable rooms solve');
assert.equal(summary.unresolved, 1);
assert.ok(summary.passes >= 2, 'dependency solver must retry unresolved hard relationships');
assert.equal(payload.semanticSpaces.length, 3, 'module/floor destinations are distinct spaces even when occupancy is vetoed');
assert.notEqual(semanticSpaceId(chunk.key, entity.semanticSiteKey, 'B', 0), semanticSpaceId(chunk.key, entity.semanticSiteKey, 'B', 1));
assert.ok(payload.semanticSpaces.some(space => space.id === '4,9:site-A:B:floor:0'), 'destination ID matches fabric connector namespace');
const dependent = tasks.find(task => task.assetId === terminal.id);
assert.ok(dependent.semanticPlacement, 'hard dependent retries after its provider exists');
assert.match(dependent.semanticPlacement.relationTo, /semantic:/, 'relationship binds to stable instance identity');
assert.ok(payload.physics.props.length >= 2, 'semantic collision exists before visual realization');
assert.ok(payload.detailReservations.every(r => r.kind === 'semantic-envelope'));
console.log('PASS semantic layout hinge', summary);
