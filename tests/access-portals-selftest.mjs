import assert from 'node:assert/strict';
import {
    ACCESS_PORTAL_SCHEMA,
    accessAnchorsForBuildingPortals,
    assertAccessPortal,
    compileAccessPortals,
    portalNoClutterRegions,
} from '../world/access-portals.js';
import {
    SEMANTIC_CONNECTOR_SCHEMA,
    connectorOpeningWidth,
    registerSemanticConnector,
} from '../world/semantic-connectors.js';
import {
    assertSpatialTopologyGraph,
    compileSpatialTopologyGraph,
} from '../world/spatial-topology.js';
import { sidecarInputFromKowloon } from '../world/architecture/jweb-adapter.js';

function boxReservation(id, connectorId, { x, z, halfX, halfZ, yMin = 0, yMax = 2.2, kind = 'portal-sweep' }) {
    return {
        id, kind, connectorId, x, z, halfX, halfZ,
        minX: x - halfX, maxX: x + halfX,
        minZ: z - halfZ, maxZ: z + halfZ,
        yMin, yMax, source: 'selftest',
    };
}

function doorConnector({ id, x, source = 'entrance', fromSpaceId, role = null }) {
    const reservation = boxReservation(`${id}:sweep`, id, { x, z: -2.5, halfX: 0.65, halfZ: 0.8 });
    return {
        schema: SEMANTIC_CONNECTOR_SCHEMA,
        id, kind: 'door', source, visualRole: role ?? 'doorway',
        fromSpaceId, toSpaceId: null, spaceIds: [fromSpaceId],
        endpoints: [{
            id: `${id}:threshold`, kind: 'portal-endpoint', x, y: 0, z: -2.5,
            width: 1.3, height: 2.2, depth: 1.2, side: 'north', moduleKey: 'm0', entityId: 'building:a',
        }],
        aperture: { width: 1.3, height: 2.2, depth: 1.2 },
        sweep: { type: 'portal', x, z: -2.5, y0: 0, y1: 2.2, width: 1.3, depth: 1.2, side: 'north' },
        reservations: [reservation],
        metadata: { entityId: 'building:a', moduleKey: 'm0' },
    };
}

const chunk = { key: '0,0', x: 0, z: 0, seed: 99 };
const entityA = {
    id: 'building:a', kind: 'building', semanticSiteKey: 'site:a', doorSide: 'north', floorH: 3.15,
    footprintModules: [{ key: 'm0', cx: 0, cz: 0, halfX: 3, halfZ: 2.5, floors: 2 }],
    facades: [{ side: 'north', moduleKey: 'm0', x: 0, z: -2.5, halfX: 3, halfZ: 2.5, yMin: 0, yMax: 6.3 }],
    entranceFaces: [{ moduleKey: 'm0', side: 'north' }],
};
const entityB = {
    id: 'building:b', kind: 'building', semanticSiteKey: 'site:b', doorSide: 'south', floorH: 3.15,
    footprintModules: [{ key: 'm1', cx: 10, cz: 0, halfX: 3, halfZ: 2.5, floors: 2 }],
};

const entrySpace = {
    schema: 'jweb.space-plan-topology.v2', id: 'space:a:entry', entityId: 'building:a', moduleKey: 'm0', moduleKeys: ['m0'],
    floor: 0, floorH: 3.15, yBase: 0, buildingPlanId: 'building-plan:a', role: 'entry', spaceType: 'lobby',
    bounds: { minX: -1.4, maxX: 1.4, minZ: -2.4, maxZ: 0.3, yMin: 0, yMax: 3.15 },
};
const serviceSpace = {
    schema: 'jweb.space-plan-topology.v2', id: 'space:a:service', entityId: 'building:a', moduleKey: 'm0', moduleKeys: ['m0'],
    floor: 0, floorH: 3.15, yBase: 0, buildingPlanId: 'building-plan:a', role: 'service', spaceType: 'loading-service',
    bounds: { minX: 1.2, maxX: 2.8, minZ: -2.4, maxZ: 0.5, yMin: 0, yMax: 3.15 },
};
const secondarySpace = {
    schema: 'jweb.space-plan-topology.v2', id: 'space:a:secondary', entityId: 'building:a', moduleKey: 'm0', moduleKeys: ['m0'],
    floor: 0, floorH: 3.15, yBase: 0, buildingPlanId: 'building-plan:a', role: 'entry', spaceType: 'side-entry',
    bounds: { minX: -2.8, maxX: -1.0, minZ: -2.4, maxZ: 0.5, yMin: 0, yMax: 3.15 },
};
const bridgeASpace = {
    schema: 'jweb.space-plan-topology.v2', id: 'space:a:bridge', entityId: 'building:a', moduleKey: 'm0', moduleKeys: ['m0'],
    floor: 1, floorH: 3.15, yBase: 3.15, buildingPlanId: 'building-plan:a', role: 'circulation',
    bounds: { minX: -1, maxX: 3, minZ: -1, maxZ: 1, yMin: 3.15, yMax: 6.3 },
};
const bridgeBSpace = {
    schema: 'jweb.space-plan-topology.v2', id: 'space:b:bridge', entityId: 'building:b', moduleKey: 'm1', moduleKeys: ['m1'],
    floor: 1, floorH: 3.15, yBase: 3.15, buildingPlanId: 'building-plan:b', role: 'circulation',
    bounds: { minX: 7, maxX: 11, minZ: -1, maxZ: 1, yMin: 3.15, yMax: 6.3 },
};
const spaces = [entrySpace, serviceSpace, secondarySpace, bridgeASpace, bridgeBSpace];

const mainDoor = doorConnector({ id: 'door:a:00-main', x: 0, fromSpaceId: entrySpace.id });
const secondaryDoor = doorConnector({ id: 'door:a:20-side', x: -2, fromSpaceId: secondarySpace.id });
const serviceDoor = doorConnector({ id: 'door:a:10-service', x: 2, source: 'service-entrance', role: 'service-door', fromSpaceId: serviceSpace.id });
const bridgeReservation = boxReservation('bridge:a-b:sweep', 'bridge:a-b', {
    x: 5, z: 0, halfX: 4.2, halfZ: 0.7, yMin: 3.15, yMax: 5.3, kind: 'bridge-sweep',
});
const bridge = {
    schema: SEMANTIC_CONNECTOR_SCHEMA,
    id: 'bridge:a-b', kind: 'bridge', source: 'skybridge', visualRole: 'bridge',
    fromSpaceId: bridgeASpace.id, toSpaceId: bridgeBSpace.id, spaceIds: [bridgeASpace.id, bridgeBSpace.id],
    endpoints: [
        { id: 'bridge:a-b:a', x: 2.8, y: 3.15, z: 0 },
        { id: 'bridge:a-b:b', x: 7.2, y: 3.15, z: 0 },
    ],
    sweep: { type: 'bridge', axis: 'x', from: 2.8, to: 7.2, fixedCoord: 0, halfWidth: 0.5, y0: 3.15, y1: 3.15, headroom: 1.95 },
    reservations: [bridgeReservation],
    metadata: null,
};

// Registration publishes Portal identity immediately without changing the
// connector/reservation ownership model.
const registrationPhysics = { circulationReservations: [], semanticConnectors: [] };
registerSemanticConnector(registrationPhysics, secondaryDoor);
registerSemanticConnector(registrationPhysics, serviceDoor);
registerSemanticConnector(registrationPhysics, mainDoor);
assert.equal(registrationPhysics.accessPortals.length, 3);
assert.equal(mainDoor.accessPortal.id, mainDoor.id);
assert.equal(mainDoor.accessPortal.schema, ACCESS_PORTAL_SCHEMA);
assertAccessPortal(mainDoor.accessPortal);
assert.equal(secondaryDoor.accessPortal.family, 'secondary-entrance', 'incremental publication refreshes earlier connector Portal mirrors');
assert.equal(mainDoor.accessPortal.family, 'main-entrance');

// Final compilation with semantic spaces resolves the real inside destination
// and Building Plan identity while preserving the exact structural connector ID.
const connectors = [secondaryDoor, serviceDoor, mainDoor, bridge];
const portals = compileAccessPortals({ connectors, spaces, entities: [entityA, entityB] });
const byId = new Map(portals.map(portal => [portal.id, portal]));
const main = byId.get(mainDoor.id);
const secondary = byId.get(secondaryDoor.id);
const service = byId.get(serviceDoor.id);
const bridgePortal = byId.get(bridge.id);
assert.equal(main.family, 'main-entrance');
assert.equal(secondary.family, 'secondary-entrance');
assert.equal(service.family, 'service-entrance');
assert.equal(service.traversal.role, 'service');
assert.notEqual(service.semanticRole, main.semanticRole);
assert.equal(main.insideEndpoint.spaceId, entrySpace.id);
assert.equal(main.insideEndpoint.buildingPlanId, 'building-plan:a');
assert.equal(main.buildingPlanId, 'building-plan:a');
assert.equal(main.structuralConnectorId, main.id);
assert.equal(bridgePortal.family, 'bridge-portal');
assert.equal(bridgePortal.traversal.traversable, true);
assert.deepEqual(bridgePortal.linkedSpaceIds, [bridgeASpace.id, bridgeBSpace.id]);
assert.deepEqual(bridgePortal.buildingIds, ['building:a', 'building:b']);
assert.equal(bridgePortal.traversal.accessible, true);

// Deterministic identity and main/secondary classification do not depend on
// connector publication order.
const reversed = compileAccessPortals({ connectors: [...connectors].reverse(), spaces, entities: [entityA, entityB] });
assert.deepEqual(
    reversed.map(portal => [portal.id, portal.family]),
    portals.map(portal => [portal.id, portal.family]),
);

// Building Plan Authority consumes Portal-derived anchors. It no longer needs
// to reinterpret the raw connector array to decide which door is primary.
const anchors = accessAnchorsForBuildingPortals(portals, entityA.id);
assert.equal(anchors.find(anchor => anchor.kind === 'main-entry')?.portalId, main.id);
assert.equal(anchors.find(anchor => anchor.kind === 'service-entry')?.portalId, service.id);
assert.equal(anchors.find(anchor => anchor.kind === 'main-entry')?.insideSpaceId, entrySpace.id);

const sidecarInput = sidecarInputFromKowloon({
    worldSeed: 7, chunk, entity: entityA,
    physics: registrationPhysics,
    signatureInstance: {
        type: 'authored-test', entityId: entityA.id,
        mainEntrance: { doorX: 99, doorZ: 99, side: 'south' },
    },
});
assert.equal(sidecarInput.accessAnchors.find(anchor => anchor.kind === 'main-entry')?.portalId, mainDoor.id);
assert.notEqual(sidecarInput.accessAnchors.find(anchor => anchor.kind === 'main-entry')?.x, 99, 'authored signature entrance must not override a physical Portal');

// Portal aperture + protected clearance become downstream topology views.
const payload = {
    ownerId: 'chunk:0,0', entities: [entityA, entityB],
    semanticTopologySpaces: spaces,
    semanticSpaces: spaces,
    semanticPlacements: [],
    physics: {
        semanticConnectors: connectors,
        circulationReservations: connectors.flatMap(connector => connector.reservations ?? []),
    },
};
const graph = compileSpatialTopologyGraph({ chunk, payload });
assertSpatialTopologyGraph(graph);
const graphMain = graph.portals.find(portal => portal.id === main.id);
const graphAperture = graph.apertures.find(aperture => aperture.portalId === main.id);
assert.ok(graphMain);
assert.ok(graphAperture);
assert.equal(graphAperture.authority, 'access-portal');
assert.equal(graphAperture.connectorId, main.id);
assert.equal(graphMain.facadeBinding.apertureId, graphAperture.id);
assert.equal(graphMain.provenance.authority, 'access-portal');
assert.equal(graphMain.provenance.structuralAuthority, 'semantic-connector');
assert.equal(graphAperture.uMax - graphAperture.uMin, main.apertureGeometry.width);
assert.ok(graph.edges.some(item => item.kind === 'owns-access-aperture' && item.fromId === main.id && item.toId === graphAperture.id));
assert.ok(graph.edges.some(item => item.kind === 'terminates-in-space' && item.toId === entrySpace.id));
assert.ok(graph.edges.some(item => item.kind === 'connects-access-space' && item.fromId === bridge.id && item.toId === bridgeBSpace.id));

const protectedMain = graph.noClutterRegions.filter(region => region.portalId === main.id);
assert.ok(protectedMain.length > 0);
assert.ok(protectedMain.every(region => region.decorationMayIntrude === false));
assert.ok(protectedMain.some(region => region.minX <= main.facadeEndpoint.x && region.maxX >= main.facadeEndpoint.x
    && region.minZ <= main.facadeEndpoint.z && region.maxZ >= main.facadeEndpoint.z));
assert.deepEqual(portalNoClutterRegions(main).map(region => region.reservationId), main.clearanceGeometry.reservationIds);

// Collision/opening geometry consumes the published Portal before the legacy
// raw connector aperture mirror. Deliberately disagree the compatibility field.
mainDoor.accessPortal = { ...mainDoor.accessPortal, apertureGeometry: { ...mainDoor.accessPortal.apertureGeometry, width: 1.07 } };
mainDoor.aperture = { ...mainDoor.aperture, width: 9.0 };
assert.equal(connectorOpeningWidth(mainDoor), 1.07);

console.log('PASS access portal authority', {
    portals: graph.stats.portals,
    apertures: graph.stats.apertures,
    noClutterRegions: graph.stats.noClutterRegions,
    mainPortal: main.id,
    servicePortal: service.id,
    bridgePortal: bridgePortal.id,
});
