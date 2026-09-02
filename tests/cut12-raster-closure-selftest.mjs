import assert from 'node:assert/strict';
import { claimUnassignedRasterToEligibleSpaces } from '../world/architecture/human-scale-capacity.js';

const cells = [
  { key: '0,0', ix: 0, iz: 0, spaceId: 'room', structuralReservationId: null },
  { key: '1,0', ix: 1, iz: 0, spaceId: null, structuralReservationId: 'stair-apron' },
  { key: '2,0', ix: 2, iz: 0, spaceId: null, structuralReservationId: null },
  { key: '3,0', ix: 3, iz: 0, spaceId: null, structuralReservationId: null },
];
const byKey = new Map(cells.map(cell => [cell.key, cell]));
const neighborsOfCell = cell => [
  byKey.get(`${cell.ix - 1},${cell.iz}`),
  byKey.get(`${cell.ix + 1},${cell.iz}`),
].filter(Boolean);
const spaces = [
  { key: 'room', role: 'private' },
  { key: 'core', role: 'circulation' },
];
const eligible = (cell, space) => !cell.structuralReservationId
  || space.role === 'circulation'
  || space.role === 'entry';

const result = claimUnassignedRasterToEligibleSpaces({
  cells,
  spaces,
  neighborsOfCell,
  cellEligibleForSpace: eligible,
});

assert.equal(cells[1].spaceId, 'core', 'stair/apron cell must be claimed by circulation before flood');
assert.equal(cells[2].spaceId, 'core', 'ordinary pocket behind stair/apron must become reachable after circulation claims the bridge');
assert.equal(cells[3].spaceId, 'core', 'closure must continue through the full pocket');
assert.equal(result.unclaimedCount, 0, 'structural-first raster closure must leave no bridged pocket unclaimed');
assert.equal(result.structuralClaims, 1);
assert.equal(result.floodClaims, 2);

console.log('[cut12-raster-closure-selftest] PASS', {
  invariant: 'circulation claims reserved substrate before leftover flood, so stair/apron bands cannot strand ordinary raster pockets',
  structuralClaims: result.structuralClaims,
  floodClaims: result.floodClaims,
});
