import assert from 'node:assert/strict';
import {
    SEMANTIC_RUNTIME_PROP_ASSETS,
    SEMANTIC_RUNTIME_PROP_ASSET_BY_ID,
} from '../vendor/city-pack/semantic-megapack/runtime-props-v6.js';
import {
    SEMANTIC_RUNTIME_EVIDENCE_ASSETS,
    SEMANTIC_RUNTIME_EVIDENCE_ASSET_BY_ID,
} from '../vendor/city-pack/semantic-megapack/runtime-evidence-v6.js';
import {
    SEMANTIC_RUNTIME_CONNECTOR_ASSETS,
    SEMANTIC_RUNTIME_CONNECTOR_ASSET_BY_ID,
} from '../vendor/city-pack/semantic-megapack/runtime-connectors-v6.js';
import {
    SEMANTIC_CONNECTOR_SCHEMA,
    connectorOpeningWidth,
    createBridgeConnector,
    createPortalConnector,
    createRampConnector,
    createStairConnector,
    registerSemanticConnector,
    semanticPortalForRect,
} from '../world/semantic-connectors.js';
import {
    resolveSemanticExteriorPlacement,
    resolveSemanticRoofPlacement,
} from '../world/semantic-placement.js';

assert.equal(SEMANTIC_RUNTIME_PROP_ASSETS.length, 4444, 'full semantic-prop runtime index must ship');
assert.equal(SEMANTIC_RUNTIME_EVIDENCE_ASSETS.length, 1461, 'all incoming urban-evidence assets must be indexed');
assert.equal(SEMANTIC_RUNTIME_CONNECTOR_ASSETS.length, 4934, 'full connector/topology runtime index must ship');
assert.equal(SEMANTIC_RUNTIME_PROP_ASSET_BY_ID.size, 4444);
assert.equal(SEMANTIC_RUNTIME_EVIDENCE_ASSET_BY_ID.size, 1461);
assert.equal(SEMANTIC_RUNTIME_CONNECTOR_ASSET_BY_ID.size, 4934);

for (const [label, assets] of [
    ['props', SEMANTIC_RUNTIME_PROP_ASSETS],
    ['evidence', SEMANTIC_RUNTIME_EVIDENCE_ASSETS],
    ['connectors', SEMANTIC_RUNTIME_CONNECTOR_ASSETS],
]) {
    const ids = new Set(assets.map(asset => asset.id));
    assert.equal(ids.size, assets.length, `${label} runtime IDs must be unique`);
    for (const asset of assets) {
        const rel = asset.semanticGraph?.relationships;
        assert.ok(!(Array.isArray(rel) && rel.length >= 4 && rel.every(value => typeof value === 'string' && value.length === 1)),
            `${label} runtime must not expose malformed character-split relationships: ${asset.id}`);
    }
}

const physics = { circulationReservations: [], semanticConnectors: [] };
const rect = { cx: 10, cz: 20, halfX: 3, halfZ: 2 };
const endpoint = semanticPortalForRect({
    id: 'door:endpoint', rect, side: 'north', floor: 0, floorH: 3.15,
    width: 1.55, height: 2.2, depth: 1.2,
    fromSpaceId: 'street', toSpaceId: 'room-a',
});
assert.equal(endpoint.x, 10);
assert.equal(endpoint.z, 18);
const door = createPortalConnector({ id: 'door', portal: endpoint });
assert.equal(door.schema, SEMANTIC_CONNECTOR_SCHEMA);
assert.equal(door.kind, 'door');
assert.equal(connectorOpeningWidth(door), 1.55);
registerSemanticConnector(physics, door);
assert.equal(physics.semanticConnectors.length, 1);
assert.equal(physics.circulationReservations.length, 1);
assert.equal(physics.circulationReservations[0].kind, 'portal-sweep');

// Registration is idempotent: connector graph identity is stable.
registerSemanticConnector(physics, door);
assert.equal(physics.semanticConnectors.length, 1);
assert.equal(physics.circulationReservations.length, 1);

const stair = createStairConnector({
    id: 'stair-system', x: 0, z: 0,
    openingWidth: 2.2, openingDepth: 4.0,
    baseY: 0, roofY: 9.45, exitHeadroom: 2.1,
    rampAxis: 'z', rampFrom: -1.4, rampTo: 1.4, rampHalfWidth: 0.7,
    visualRole: null,
});
assert.equal(stair.kind, 'stair');
assert.equal(stair.visualRole, null, 'multi-story stair system is topology, not one stretched visual asset');
assert.equal(stair.primaryReservation.kind, 'stair-shaft');
registerSemanticConnector(physics, stair);

const flight = createRampConnector({
    id: 'stair-flight:0', kind: 'stair-flight', axis: 'z',
    from: -1.4, to: 1.4, fixedCoord: 0, halfWidth: 0.7,
    y0: 0, y1: 3.15, source: 'compound-stair', visualRole: 'stair',
});
registerSemanticConnector(physics, flight);
assert.equal(flight.visualRole, 'stair');
assert.equal(flight.reservations[0].kind, 'stair-flight-sweep');

const bridge = createBridgeConnector({
    id: 'bridge', axis: 'x', from: 1, to: 6, fixedCoord: 4,
    halfWidth: 0.55, y: 6.3,
});
assert.equal(bridge.kind, 'bridge');
assert.equal(bridge.visualRole, 'bridge');
assert.equal(bridge.endpoints.length, 2);

const exteriorDef = {
    id: 'test/wall-evidence', mount: 'wall',
    dimensionsXYZ: [0.8, 0.9, 0.16], boundsMin: [-0.4, 0, -0.08],
    clearance: { front: 0.05, rear: 0.02, sides: 0.05 },
};
const northFacade = { x: 10, z: 20, halfX: 3, halfZ: 2, side: 'north', yMin: 0, yMax: 3.15 };
let exteriorReservations = 0;
const exterior = resolveSemanticExteriorPlacement({
    def: exteriorDef, facade: northFacade, seed: 123,
    tryReserve: reservation => { exteriorReservations++; return true; },
});
assert.ok(exterior);
assert.ok(exterior.z < 18, 'north-wall evidence must mount at the actual facade, outside the shell center');
assert.ok(Math.abs(exterior.x - 10) <= 3, 'facade placement stays within facade span');
assert.equal(exterior.mode, 'semantic-facade');
assert.ok(exteriorReservations >= 1);

const groundDef = {
    id: 'test/street-evidence', mount: 'ground',
    dimensionsXYZ: [0.6, 1.0, 0.4], boundsMin: [-0.3, 0, -0.2],
    clearance: { front: 0.2, rear: 0.08, sides: 0.08 },
};
const street = resolveSemanticExteriorPlacement({ def: groundDef, facade: northFacade, seed: 456, tryReserve: () => true });
assert.ok(street);
assert.ok(street.z < 17.8, 'ground evidence sits beyond the facade instead of inside the building');
assert.equal(street.mode, 'semantic-street-edge');

let roofRejects = 0;
const roof = resolveSemanticRoofPlacement({
    def: groundDef,
    roof: { x: 2, z: 3, halfX: 2.4, halfZ: 2.1, y: 9.45 },
    seed: 789,
    tryReserve: () => { roofRejects++; return roofRejects > 1; },
});
assert.ok(roof, 'roof placement retries after a connector/clearance veto');
assert.equal(roof.y, 9.45);
assert.ok(roofRejects >= 2);

console.log('semantic-cutover-selftest: PASS', {
    props: SEMANTIC_RUNTIME_PROP_ASSETS.length,
    evidence: SEMANTIC_RUNTIME_EVIDENCE_ASSETS.length,
    connectors: SEMANTIC_RUNTIME_CONNECTOR_ASSETS.length,
});
