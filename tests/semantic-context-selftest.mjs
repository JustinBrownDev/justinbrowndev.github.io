import assert from 'node:assert/strict';
import { compileSemanticContext } from '../world/semantic-context.js';

function fixture() {
    const chunk = { key: '2,-3', x: 2, z: -3, seed: 0x12345678 };
    const entity = {
        id: 'building:test', kind: 'building', semanticChunkKey: chunk.key, semanticSiteKey: 'site:7',
        doorSide: 'north', floorH: 3.2, archetype: 'dense-tenement', physicalUse: { family: 'mercantile-public' },
        physicalTruth: { door: { clearWidth: { realizedSI: 1.2 }, clearHeight: { realizedSI: 2.2 } } },
        footprintModules: [{ key: 'm0', cx: 0, cz: 0, halfX: 3, halfZ: 2.5, floors: 4 }],
        facades: [
            { side: 'north', moduleKey: 'm0', x: 0, z: -2.5, halfX: 3, halfZ: 2.5, yMin: 0, yMax: 12.8 },
            { side: 'east', moduleKey: 'm0', x: 3, z: 0, halfX: 3, halfZ: 2.5, yMin: 0, yMax: 12.8 },
        ],
        entranceFaces: [{ moduleKey: 'm0', side: 'north' }],
    };
    const payload = {
        ownerId: 'chunk:2,-3', entities: [entity],
        semanticSpaces: [{ id: '2,-3:site:7:m0:floor:0', entityId: entity.id, moduleKey: 'm0', floor: 0, yBase: 0, program: 'pharmacy', requestedProgram: 'pharmacy', connectorIds: ['door:1'], bounds: { minX: -3, maxX: 3, minZ: -2.5, maxZ: 2.5 } }],
        semanticPlacements: [{ instanceId: 'chair:1', assetId: 'chair', entityId: entity.id, spaceId: '2,-3:site:7:m0:floor:0', x: 1, y: 0, z: 1, rotY: 0, mode: 'space-plan-region', reservation: { ownerId: 'chair:1' } }],
        physics: {
            circulationReservations: [{ id: 'door:1:sweep', kind: 'portal-sweep', x: 0, z: -2.5, halfX: 0.6, halfZ: 0.8, yMin: 0, yMax: 2.2, connectorId: 'door:1' }],
            semanticConnectors: [
                { id: 'door:1', kind: 'door', fromSpaceId: '2,-3:site:7:m0:floor:0', toSpaceId: null, endpoints: [{ id: 'door:1:a', x: 0, y: 0, z: -2.5, side: 'north', width: 1.2, height: 2.2, rotY: 0 }], reservations: [{ id: 'door:1:sweep' }], metadata: { entityId: entity.id } },
                { id: 'bridge:upper', kind: 'bridge', fromSpaceId: null, toSpaceId: null, endpoints: [{ id: 'bridge:upper:a', x: 0, y: 21, z: 0 }, { id: 'bridge:upper:b', x: 8, y: 21, z: 0 }], reservations: [{ id: 'bridge:upper:sweep' }], metadata: { entityId: entity.id } },
            ],
        },
    };
    const tasks = [
        { kind: 'sign', entityId: entity.id, seed: 11, side: 'north', along: 0, y: 2.5, title: 'OLD', subtitle: 'OLD' },
        { kind: 'flyer', entityId: entity.id, seed: 12, side: 'north', along: 0 },
        { kind: 'security', entityId: entity.id, seed: 13, side: 'north', along: 0 },
        { kind: 'pipe', entityId: entity.id, seed: 14, side: 'north', along: 0 },
        { kind: 'street-fixture', entityId: entity.id, seed: 15, side: 'north', along: 0 },
        { kind: 'roof-clutter', entityId: entity.id, seed: 16 },
        { kind: 'semantic-functional', entityId: entity.id, spaceId: '2,-3:site:7:m0:floor:0', seed: 17 },
    ];
    return { chunk, payload, tasks };
}

const first = fixture();
const compiled = compileSemanticContext({ ...first, debugWeight: 1 });
assert.equal(compiled.schema, 'jweb.semantic-context.v1');
assert.ok(compiled.surfaces.length >= 2);
assert.ok(compiled.apertures.some(item => item.kind === 'entrance'));
assert.ok(compiled.connectors.some(item => item.id === 'door:1'));
assert.ok(compiled.destinations.some(item => item.program === 'pharmacy'));
assert.ok(compiled.opportunities.some(item => item.role === 'roof-utility-zone' && item.layer === 'mid'));
assert.ok(compiled.opportunities.some(item => item.role === 'beside-door-zone'));
const wallMounts = compiled.opportunities.filter(item => item.role === 'wall-mounted-prop-zone');
assert.ok(wallMounts.length >= 12, `tall facades should expose a real 2D wall-mount field, got ${wallMounts.length}`);
assert.ok(wallMounts.some(item => item.transform.y >= 7 && item.layer === 'mid'), 'wall opportunities must climb into the mid facade instead of living only at eye level');
assert.ok(wallMounts.some(item => item.shellPriority === 'first-pass') && wallMounts.some(item => item.shellPriority === 'deepen'), 'facade slots must distinguish shell coverage from later deepening');
assert.ok(new Set(wallMounts.map(item => item.transform.y.toFixed(2))).size >= 3, 'wall mounting must occupy several vertical bands');
assert.ok(compiled.opportunities.some(item => item.role === 'connector-adjacent-zone' && item.connectorId === 'bridge:upper' && item.layer === 'upper'), 'upper connectors must use the same context machinery');
const exteriorTasks = first.tasks.filter(task => task.kind !== 'semantic-functional');
assert.equal(exteriorTasks.length, 6);
assert.ok(exteriorTasks.every(task => task.exteriorPlacementDeferred === true), 'building exterior tasks must defer placement to composition authority');
assert.ok(exteriorTasks.every(task => task.semanticOpportunityId == null), 'semantic context must not pre-claim building exterior opportunities');
assert.equal(compiled.stats.exteriorPlacementDeferred, 6);
assert.equal(first.tasks[0].semanticDebug, true);
assert.match(first.tasks[0].title, /DISTRICT:/);
assert.match(first.tasks[0].subtitle, /PROGRAM:/);
assert.equal(first.tasks[0].along, 0, 'semantic content may change before composition, but placement may not');
assert.equal(first.payload.semanticPlacements[0].semanticContextId, first.payload.semanticSpaces[0].semanticContextId);

const second = fixture();
const compiledAgain = compileSemanticContext({ ...second, debugWeight: 1 });
assert.deepEqual(
    compiled.opportunities.map(item => item.id),
    compiledAgain.opportunities.map(item => item.id),
    'opportunity identity/order must be deterministic',
);
assert.deepEqual(
    first.tasks.map(task => [task.kind, task.semanticOpportunityId, task.along, task.y]),
    second.tasks.map(task => [task.kind, task.semanticOpportunityId, task.along, task.y]),
    'representative task integration must be deterministic',
);
console.log('[semantic-context-selftest] PASS', compiled.stats);
