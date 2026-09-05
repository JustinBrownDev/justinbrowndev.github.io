import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SEMANTIC_CONNECTOR_SCHEMA,
  connectorOpeningWidth,
  createBridgeConnector,
  createLandingConnector,
  createPortalConnector,
  createRampConnector,
  createStairConnector,
  ensureSemanticConnectorAuthority,
  registerSemanticConnector,
  semanticPortalForRect,
} from '../world/semantic-connectors.js';

const physics = { circulationReservations: [], semanticConnectors: [] };
const rect = { cx: 4, cz: -3, halfX: 2.5, halfZ: 3.0 };
const portal = semanticPortalForRect({
  id: 'test:portal', rect, side: 'north', floor: 0, floorH: 3.15,
  width: 1.55, height: 2.2, depth: 1.2, source: 'selftest',
});
const door = createPortalConnector({ id: 'test:door', portal, source: 'selftest' });
registerSemanticConnector(physics, door);
assert.equal(door.schema, SEMANTIC_CONNECTOR_SCHEMA);
assert.equal(connectorOpeningWidth(door), 1.55);
assert.equal(physics.semanticConnectors.length, 1);
assert.equal(physics.circulationReservations.length, 1);

const stair = createStairConnector({
  id: 'test:stair', x: 0, z: 0,
  openingWidth: 2.2, openingDepth: 4.0,
  baseY: 0, roofY: 9.45, exitHeadroom: 2.1,
  rampAxis: 'z', rampFrom: -1.5, rampTo: 1.5, rampHalfWidth: 0.8,
  source: 'selftest',
});
registerSemanticConnector(physics, stair);
assert.equal(stair.kind, 'stair');
assert.ok(stair.primaryReservation);

const bridge = createBridgeConnector({
  id: 'test:bridge', axis: 'x', from: -3, to: 3,
  fixedCoord: 2, halfWidth: 0.5, y: 3.15, source: 'selftest',
  fromSpaceId: 'chunk:a:floor:1', toSpaceId: 'chunk:b:floor:1',
});
registerSemanticConnector(physics, bridge);
assert.equal(bridge.kind, 'bridge');
assert.equal(bridge.fromSpaceId, 'chunk:a:floor:1');
assert.equal(bridge.toSpaceId, 'chunk:b:floor:1');
assert.equal(physics.semanticConnectors.length, 3);
assert.equal(physics.circulationReservations.length, 3);


const compatibilityPhysics = { circulationReservations: [], semanticConnectors: [] };
const scaffoldLanding = createLandingConnector({
  id: 'test:scaffold:landing', x: 1, z: 2, halfX: 0.9, halfZ: 0.7, y: 3.15,
  source: 'exterior-scaffold', visualRole: 'fire-escape-landing', reservationKind: 'scaffold-landing',
});
const scaffoldFlight = createRampConnector({
  id: 'test:scaffold:ramp', kind: 'fire-escape', reservationKind: 'scaffold-ramp',
  axis: 'x', from: -2, to: 2, fixedCoord: 1, halfWidth: 0.55, y0: 0, y1: 3.15,
  source: 'exterior-scaffold', visualRole: 'fire-escape-flight',
});
const mezzanineFlight = createRampConnector({
  id: 'test:mezzanine:ramp', kind: 'mezzanine-ramp', reservationKind: 'mezzanine-ramp',
  axis: 'z', from: -1.5, to: 1.5, fixedCoord: -1, halfWidth: 0.5, y0: 0, y1: 2.4,
  source: 'mezzanine-stair', visualRole: 'mezzanine-access',
});
for (const connector of [scaffoldLanding, scaffoldFlight, mezzanineFlight]) registerSemanticConnector(compatibilityPhysics, connector);
assert.deepEqual(
  compatibilityPhysics.circulationReservations.map(reservation => reservation.kind),
  ['scaffold-landing', 'scaffold-ramp', 'mezzanine-ramp'],
  'connector-first publication must preserve established physical reservation kinds',
);
assert.equal(scaffoldFlight.kind, 'fire-escape', 'semantic connector kind remains semantic even when its physical reservation keeps the legacy contract');

// Regression: BuildingPlan may explicitly bind a persistent stair to every floor
// even when simplified endpoint geometry only discovers the bottom/top spaces.
// The semantic-authority reconciliation pass may augment that binding, never erase
// an authoritative middle-floor stop.
const coreSpaces = [0, 1, 2].map(floor => ({
  id: `test:core:floor:${floor}`,
  floor, yBase: floor * 3.15, floorH: 3.15,
  bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1, yMin: floor * 3.15, yMax: (floor + 1) * 3.15 },
}));
const authoritativeStair = {
  schema: SEMANTIC_CONNECTOR_SCHEMA,
  id: 'test:authoritative-stair', kind: 'stair', source: 'building-plan-authority', visualRole: 'vertical-spine',
  fromSpaceId: coreSpaces[0].id, toSpaceId: coreSpaces[2].id,
  spaceIds: coreSpaces.map(space => space.id),
  endpoints: [
    { id: 'test:authoritative-stair:bottom', x: 0, y: 0, z: 0 },
    { id: 'test:authoritative-stair:top', x: 0, y: 6.3, z: 0 },
  ],
  reservations: [], metadata: { buildingPlanId: 'test:plan' },
};
const authorityPhysics = { circulationReservations: [], semanticConnectors: [authoritativeStair] };
const authorityStats = ensureSemanticConnectorAuthority(authorityPhysics, coreSpaces);
assert.deepEqual(authoritativeStair.spaceIds, coreSpaces.map(space => space.id),
  'semantic reconciliation must preserve every explicit persistent-core floor binding');
assert.equal(authorityStats.preservedExplicitBindings, 3);

const fabricSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
for (const needle of [
  "from './world/semantic-connectors.js'",
  'createStairConnector({',
  'createBridgeConnector({',
  'createLandingConnector({',
  'createRampConnector({',
  'semanticPortalForRect({',
  'connectorOpeningWidth(',
  'semanticConnectors: []',
  '(module.floors - 1) * floorH + floorH',
  'semanticChunkKey: chunk.key',
  'semanticSpaceIdForEntity(aEntity, bridge.aModuleKey, aFloor, { x: from, z: fixedCoord })',
  'semanticSpaceIdForEntity(bEntity, bridge.bModuleKey, bFloor, { x: to, z: fixedCoord })',
  'entity?.buildingPlan?.topologySpaces',
  "from './world/scaffold-circulation-plan.js'",
  'planExteriorScaffoldRoute({',
  'scaffoldCirculationRoutes',
  'const connector = createLandingConnector({',
  'connector.routeId = plan.id;',
  'registerSemanticConnector(physics, connector);',
  "reservationKind: 'scaffold-landing'",
  "reservationKind: 'scaffold-ramp'",
  "reservationKind: 'mezzanine-ramp'",
  'const mezzanineConnector = createRampConnector({',
]) assert.ok(fabricSource.includes(needle), `fabric cutover missing ${needle}`);
assert.ok(!fabricSource.includes('const stairReservation = isSpine ? createStairShaftReservation({'), 'legacy raw stair authority still active');
assert.ok(!fabricSource.includes('physics.circulationReservations.push(createBoxCirculationReservation({'), 'raw box circulation still bypasses connector authority');
assert.ok(!fabricSource.includes('physics.circulationReservations.push(createRampCirculationReservation({'), 'raw ramp circulation still bypasses connector authority');
assert.ok(!fabricSource.includes('physics.circulationReservations.push(mezzanineReservation);'), 'mezzanine still bypasses connector authority');

console.log('PASS semantic fabric connectors', {
  connectors: physics.semanticConnectors.length,
  reservations: physics.circulationReservations.length,
  scaffoldAuthority: 'connector-first',
  mezzanineAuthority: 'connector-first',
  bridgeEdges: 'space-addressed',
});
