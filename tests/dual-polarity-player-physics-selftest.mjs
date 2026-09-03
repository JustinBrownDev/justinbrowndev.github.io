import assert from 'node:assert/strict';
import { createDualPolarityPlayerPhysics } from '../world/dual-polarity-player-physics.js';
import { HANGING_CITY_CEILING_Y } from '../world/hanging-city-topology.js';

const position = { x: 0, y: 1.65, z: 0 };
const physics = createDualPolarityPlayerPhysics({
  position,
  eyeHeight: 1.65,
  playerRadius: 0.22,
  wallThickness: 0.12,
  maxStepHeight: 0.65,
  stepDownTolerance: 0.5,
  jumpSpeed: 5.5,
  gravity: -16,
  maxSubstepSeconds: 1 / 90,
  maxHorizontalSubstep: 0.09,
  maxVerticalSubstep: 0.1,
  maxSubsteps: 32,
  worldToCell: () => ({ col: 0, row: 0 }),
  grid: [[true]],
  buildingWallSegments: new Map(),
  propColliders: [],
  elevatedPlatforms: [],
  rampRuns: [],
  overheadCeilings: [],
  boundsHalf: Infinity,
});
const portal = {
  id: 'p', x: 0, z: 0, hx: 0.5, hz: 0.5,
  anchorY: HANGING_CITY_CEILING_Y,
  groundFeetY: 0,
  hangingWorldFeetY: 0,
  hangingLocalFeetY: HANGING_CITY_CEILING_Y,
  ownerId: 'hanging',
};
physics.registerOwnedWorld('ground', { platforms: [], ceilings: [], ramps: [], props: [], mazeWalls: [], polarityPortals: [portal] });
physics.registerOwnedWorld('hanging', {
  platforms: [], ceilings: [], ramps: [], props: [], mazeWalls: [], polarityPortals: [portal],
  verticalFrame: { anchorY: HANGING_CITY_CEILING_Y, verticalPolarity: -1 },
});
const state = physics.step(1 / 60, 0, 0);
assert.equal(state.verticalPolarity, -1, 'portal should switch controller into hanging traversal frame');
assert.ok(position.y < 0, 'inverted eye must be on the opposite face of the seam');
assert.equal(physics.ownedWorldStats().owners, 2);
console.log('[dual-polarity-player-physics-selftest] PASS', {
  verticalPolarity: state.verticalPolarity,
  worldEyeY: position.y,
  invariant: 'same horizontal controls + mirrored vertical coordinate frame through semantic portal',
});
