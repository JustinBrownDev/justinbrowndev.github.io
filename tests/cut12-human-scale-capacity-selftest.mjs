import assert from 'node:assert/strict';
import {
  chooseHumanScaleProgramDrop,
  minimumEligibleCellsReservedForRemaining,
} from '../world/architecture/human-scale-capacity.js';

const ordinary = { key: 'room-now', role: 'private' };
const laterCirculation = { key: 'circulation', role: 'circulation' };
const laterRoom = { key: 'room-later', role: 'private' };
const minimums = new Map([
  [laterCirculation.key, 6],
  [laterRoom.key, 5],
]);
const reservedCells = count => Array.from({ length: count }, (_, i) => ({
  key: `r${i}`, structuralReservationId: `stair:${i}`, spaceId: null,
}));
const ordinaryCells = count => Array.from({ length: count }, (_, i) => ({
  key: `o${i}`, structuralReservationId: null, spaceId: null,
}));

assert.equal(minimumEligibleCellsReservedForRemaining({
  currentSpace: ordinary,
  remainingSpaces: [laterCirculation],
  grid: { cells: [...reservedCells(6), ...ordinaryCells(20)] },
  minimumCellsByKey: minimums,
}), 0, 'later circulation fully backed by stair/apron cells must not starve an ordinary room');

assert.equal(minimumEligibleCellsReservedForRemaining({
  currentSpace: ordinary,
  remainingSpaces: [laterRoom, laterCirculation],
  grid: { cells: [...reservedCells(3), ...ordinaryCells(20)] },
  minimumCellsByKey: minimums,
}), 8, 'ordinary room must preserve ordinary demand plus circulation overflow beyond reserved substrate');

assert.equal(minimumEligibleCellsReservedForRemaining({
  currentSpace: { key: 'entry', role: 'entry' },
  remainingSpaces: [laterRoom, laterCirculation],
  grid: { cells: [...reservedCells(6), ...ordinaryCells(20)] },
  minimumCellsByKey: minimums,
}), 11, 'circulation-capable current space competes for both reserved and ordinary substrate, so it preserves all later minima');

const program = [
  { key: 'entry', templateKey: 'entry', role: 'entry', areaWeight: 0.06 },
  { key: 'circulation', templateKey: 'circulation', role: 'circulation', areaWeight: 0.20 },
  ...Array.from({ length: 5 }, (_, i) => ({
    key: `lodging-room:${i + 1}`,
    templateKey: 'lodging-room',
    role: 'private',
    areaWeight: 0.46 / 5,
    repeat: { min: 2, max: 7 },
    source: 'grammar',
  })),
  { key: 'service', templateKey: 'service', role: 'service', areaWeight: 0.10 },
];
const drop = chooseHumanScaleProgramDrop({
  spaces: program,
  shortfalls: [{ key: 'lodging-room:3', shortfallCells: 6 }, { key: 'service', shortfallCells: 6 }],
  protectedKeys: ['entry'],
});
assert.equal(drop?.key, 'lodging-room:3',
  'geometric starvation must first reduce a surplus repeated offending program instance');
assert.notEqual(drop?.role, 'entry');
assert.notEqual(drop?.role, 'circulation');

console.log('[cut12-human-scale-capacity-selftest] PASS', {
  invariant: 'minimum eligibility uses reserved substrate correctly and geometry starvation drops program count before human scale',
});
