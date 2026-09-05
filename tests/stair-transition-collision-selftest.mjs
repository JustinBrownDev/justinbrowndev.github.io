import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';

function world(extra = {}) {
  return {
    worldToCell: () => ({ col: 0, row: 0 }),
    grid: [[true]],
    buildingWallSegments: new Map(),
    propColliders: [],
    elevatedPlatforms: [],
    rampRuns: [],
    overheadCeilings: [],
    boundsHalf: 100,
    ...extra,
  };
}

function controller({ x, feetY, z = 0 }, extra) {
  const position = { x, y: feetY + 1.65, z };
  const physics = createPlayerPhysics({
    position,
    eyeHeight: 1.65,
    playerRadius: 0.22,
    maxStepHeight: 0.65,
    stepDownTolerance: 0.5,
    maxSubstepSeconds: 1 / 90,
    maxHorizontalSubstep: 0.07,
    maxVerticalSubstep: 0.08,
    maxSubsteps: 32,
    ...world(extra),
  });
  return { position, physics };
}

const seamRamp = {
  axis: 'x', from: 0, to: 3, fixedCoord: 0, halfWidth: 0.55,
  y0: 0, y1: 2.4, supportMargin: 0.06,
  supportKind: 'regression-stair', collisionAuthority: 'physics-ramp',
};
const topFloor = {
  x: 3.55, z: 0, hx: 0.55, hz: 1.0, y: 2.4,
  supportMargin: 0, blocksFromBelow: false,
};

// The stair's endpoint overlap is authoritative.  The player's full radius must
// not silently turn the top endpoint into a 22cm phantom plateau.
{
  const { physics } = controller({ x: -1, feetY: 0 }, { rampRuns: [seamRamp] });
  assert.equal(physics.supportHeightAt(3.061, 0, 2.4), 0,
    'ramp support must end after its declared 6cm endpoint overlap');
  assert.ok(physics.supportHeightAt(3.059, 0, 2.4) > 2.39,
    'declared endpoint overlap must still bridge the receiving edge');
}

// Exact top seam: walk off the flight onto the regular floor, then reverse and
// descend onto the same top flight.  Neither direction may freeze at the mouth.
for (const direction of ['up', 'down']) {
  const start = direction === 'up'
    ? { x: 2.72, feetY: 2.176 }
    : { x: 3.36, feetY: 2.4 };
  const { position, physics } = controller(start, { rampRuns: [seamRamp], elevatedPlatforms: [topFloor] });
  const vx = direction === 'up' ? 1.2 : -1.2;
  for (let i = 0; i < 42; i++) physics.step(1 / 60, vx, 0);
  const state = physics.getState();
  if (direction === 'up') {
    assert.ok(position.x > 3.28, `top exit must cross onto floor; x=${position.x}`);
    assert.ok(Math.abs(state.feetY - 2.4) < 0.04, `top exit feetY=${state.feetY}`);
  } else {
    assert.ok(position.x < 2.82, `top descent must enter flight; x=${position.x}`);
    assert.ok(state.feetY < 2.32, `top descent must move down the ramp; feetY=${state.feetY}`);
  }
  assert.equal(state.grounded, true, `${direction}: seam traversal must remain grounded`);
}

// Airborne side-entry below the local stair surface used to pass straight through
// because ramps participated in landing support but not horizontal airborne collision.
{
  const { position, physics } = controller({ x: 1.5, z: 0.82, feetY: 0.42 }, { rampRuns: [seamRamp] });
  physics.syncFromPosition({ forceAirborne: true, resetVelocity: true });
  for (let i = 0; i < 5; i++) physics.step(1 / 60, 0, -5.0);
  assert.ok(position.z > 0.54,
    `airborne capsule must not tunnel sideways below stair surface; z=${position.z}`);
}

console.log('[stair-transition-collision-selftest] PASS', {
  invariants: [
    'declared ramp endpoint overlap is authoritative',
    'top stair/floor seam traverses both directions',
    'airborne side-entry cannot tunnel below a stair surface',
  ],
});
