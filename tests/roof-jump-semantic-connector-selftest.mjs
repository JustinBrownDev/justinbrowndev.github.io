import assert from 'node:assert/strict';
import { createJumpConnector, ensureSemanticConnectorAuthority, registerSemanticConnector } from '../world/semantic-connectors.js';
import { gameplayTraversalEnvelope } from '../world/physical-truth.js';

const traversalEnvelope = gameplayTraversalEnvelope();
const physics = { circulationReservations: [], semanticConnectors: [] };
const jump = createJumpConnector({
  id: 'jump:test', axis: 'x', from: -1, to: 1, fixedCoord: 0, halfWidth: 0.6,
  y0: 6.4, y1: 6.4, apexHeight: traversalEnvelope.jump.apexHeight, traversalEnvelope,
});
registerSemanticConnector(physics, jump);
const overlappingSpaces = [
  { id: 'room:a', yBase: 6.0, floorH: 3.15, bounds: { minX: -2, maxX: 0, minZ: -1, maxZ: 1, yMin: 6.0, yMax: 9.15 } },
  { id: 'room:b', yBase: 6.0, floorH: 3.15, bounds: { minX: 0, maxX: 2, minZ: -1, maxZ: 1, yMin: 6.0, yMax: 9.15 } },
];
const stats = ensureSemanticConnectorAuthority(physics, overlappingSpaces);
assert.equal(jump.metadata.spaceBindingMode, 'transport-surface-only');
assert.deepEqual(jump.spaceIds, [], 'airborne jump sweep must not infer room bindings; transport surfaces own the endpoints');
assert.equal(jump.fromSpaceId, null);
assert.equal(jump.toSpaceId, null);
assert.equal(jump.reservations.length, 1);
assert.equal(jump.reservations[0].kind, 'jump-sweep');
assert.equal(stats.inferredBindings, 0);
console.log('[roof-jump-semantic-connector-selftest] PASS', {
  reservation: jump.reservations[0].kind,
  spaceBindingMode: jump.metadata.spaceBindingMode,
  easyRange: traversalEnvelope.jump.easySameLevelRange,
});
