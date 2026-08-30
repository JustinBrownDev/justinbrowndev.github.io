import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SEMANTIC_CONNECTOR_SCHEMA,
  connectorOpeningWidth,
  createBridgeConnector,
  createPortalConnector,
  createStairConnector,
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
});
registerSemanticConnector(physics, bridge);
assert.equal(bridge.kind, 'bridge');
assert.equal(physics.semanticConnectors.length, 3);
assert.equal(physics.circulationReservations.length, 3);

const fabricSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
for (const needle of [
  "from './world/semantic-connectors.js'",
  'createStairConnector({',
  'createBridgeConnector({',
  'semanticPortalForRect({',
  'connectorOpeningWidth(',
  'semanticConnectors: []',
  '(module.floors - 1) * floorH + floorH',
]) assert.ok(fabricSource.includes(needle), `fabric cutover missing ${needle}`);
assert.ok(!fabricSource.includes('const stairReservation = isSpine ? createStairShaftReservation({'), 'legacy raw stair authority still active');

console.log('PASS semantic fabric connectors', {
  connectors: physics.semanticConnectors.length,
  reservations: physics.circulationReservations.length,
});
