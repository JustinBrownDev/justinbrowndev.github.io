import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlayerPhysics } from '../player-physics.js';
import { createFiniteCylinderSupportColliders } from '../world/collision-shapes.js';

function billboardSupports(rotationY = 0) {
  return createFiniteCylinderSupportColliders({
    originX: 0,
    originZ: 0,
    rotationY,
    localXOffsets: [-1.3, 1.3],
    localZ: 0,
    topRadius: 0.12,
    bottomRadius: 0.14,
    cylinderHeight: 7,
    centerY: 3.5,
  });
}

const supports = billboardSupports();
assert.equal(supports.length, 2, 'mega billboard must publish exactly two support colliders');
assert.deepEqual(supports.map(c => c.x), [-1.3, 1.3]);
assert.deepEqual(supports.map(c => c.z), [0, 0]);
for (const collider of supports) {
  assert.equal(collider.radius, 0.14, 'collider radius must match the wider rendered cylinder radius');
  assert.equal(collider.yMin, 0, 'support must begin at ground level');
  assert.equal(collider.height, 7, 'support collider must end at the rendered cylinder top');
  assert.ok(Number.isFinite(collider.height), 'billboard support height must be finite');
}

const rotated = billboardSupports(Math.PI / 2);
assert.ok(Math.abs(rotated[0].x) < 1e-12 && Math.abs(rotated[1].x) < 1e-12, 'rotation must move support pair off local X');
assert.ok(Math.abs(rotated[0].z - 1.3) < 1e-12 && Math.abs(rotated[1].z + 1.3) < 1e-12, 'rotation must preserve separated world support locations');

function makePhysics(x, z) {
  const position = { x, y: 1.65, z };
  const physics = createPlayerPhysics({
    position,
    eyeHeight: 1.65,
    playerRadius: 0.22,
    wallThickness: 0.12,
    worldToCell: () => ({ col: 0, row: 0 }),
    grid: [[true]],
    buildingWallSegments: new Map(),
    mazeSealWalls: [],
    propColliders: supports.map(c => ({ ...c })),
    elevatedPlatforms: [],
    rampRuns: [],
    overheadCeilings: [],
    boundsHalf: 100,
    maxStepHeight: 0.65,
    stepDownTolerance: 0.5,
    jumpSpeed: 5.5,
    gravity: -16,
    maxSubstepSeconds: 1 / 90,
    maxHorizontalSubstep: 0.09,
    maxVerticalSubstep: 0.1,
    maxSubsteps: 32,
  });
  return { physics, position };
}

const throughGap = makePhysics(0, -1.5);
for (let i = 0; i < 120; i++) throughGap.physics.step(1 / 60, 0, 2);
assert.ok(throughGap.position.z > 1.25, 'open space between billboard legs must remain traversable, z=' + throughGap.position.z);

const intoLeg = makePhysics(-1.3, -1.5);
for (let i = 0; i < 120; i++) intoLeg.physics.step(1 / 60, 0, 2);
assert.ok(intoLeg.position.z < -0.3, 'visible support leg must still block traversal, z=' + intoLeg.position.z);
assert.ok(intoLeg.physics.getState().feetY >= 0, 'finite support collision must not eject player below ground');

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.match(mainSource, /createFiniteCylinderSupportColliders/, 'main runtime must use the tested finite-support helper');
assert.match(mainSource, /propColliders\.push\(\.\.\.supportColliders\)/, 'mega billboard must publish multipart supports');
assert.doesNotMatch(
  mainSource,
  /const r = addMegaBillboard\(x, z\);\s*propColliders\.push\(\{ x, z, radius: r, height: Infinity \}\);/,
  'mega billboard must not regress to one centered infinite-height proxy'
);

console.log('[mega-billboard-collision-selftest] PASS', {
  supports,
  gapExitZ: throughGap.position.z,
  legBlockedZ: intoLeg.position.z,
});
