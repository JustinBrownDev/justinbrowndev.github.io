import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS,
  cylindricalFarPlaneDistance,
} from '../world/cylindrical-render-distance.js';
import {
  BUILDING_SLAB_THICKNESS,
  centeredStairCorePosition,
  stairWalkAroundClearance,
  storyCeilingLocalY,
} from '../world/interior-geometry-policy.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = fs.readFileSync(path.join(repo, 'main.js'), 'utf8');
const perfSource = fs.readFileSync(path.join(repo, 'city-performance.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
const sidecarSource = fs.readFileSync(path.join(repo, 'world/architecture/building-plan-sidecar.js'), 'utf8');

assert.equal(CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS, 96);
const far50 = cylindricalFarPlaneDistance(50);
assert.ok(far50 > 50, 'camera far plane must leave vertical headroom beyond horizontal draw distance');
assert.ok(Math.abs(far50 - Math.hypot(50, 96)) < 1e-9);
assert.equal(cylindricalFarPlaneDistance(50, 0), 50);
assert.match(mainSource, /cylindricalFarPlaneDistance\(QUALITY\.drawDistance\)/,
  'initial camera far plane must use cylindrical vertical-section authority');
assert.match(mainSource, /const horizontalDrawDistance =[\s\S]*const nextFar = cylindricalFarPlaneDistance\(horizontalDrawDistance\);/,
  'runtime vertical-band updates must preserve cylindrical far-plane headroom');
assert.match(perfSource, /const dx = centerX - camera\.position\.x;[\s\S]*const dz = centerZ - camera\.position\.z;[\s\S]*dx \* dx \+ dz \* dz <= maxDist \* maxDist/,
  'static-world draw-distance visibility must remain XZ/cylindrical');
assert.match(perfSource, /function roughDistanceSq\(obj\)[\s\S]*const dx = x - camera\.position\.x, dz = z - camera\.position\.z;[\s\S]*return dx \* dx \+ dz \* dz;/,
  'detail distance must remain independent of camera/object Y');

assert.equal(BUILDING_SLAB_THICKNESS, 0.12);
assert.ok(Math.abs(storyCeilingLocalY(3.15) - 3.03) < 1e-9,
  'wall top must equal the underside of the 12cm roof/floor slab');
assert.ok(Math.abs(3.15 - storyCeilingLocalY(3.15) - BUILDING_SLAB_THICKNESS) < 1e-9);
assert.match(engineSource, /const slabT = BUILDING_SLAB_THICKNESS;/,
  'rendered notched slabs and wall ceiling policy must share slab thickness authority');
assert.match(engineSource, /const ceilingY = run\.yBase \+ storyCeilingLocalY\(run\.height\);[\s\S]*yMax = Math\.min\(yMax, ceilingY\);/,
  'Building Plan partitions must terminate at the slab underside');
assert.match(engineSource, /const ceilingLocalY = storyCeilingLocalY\(floorH\);[\s\S]*localY1 = Math\.min\(localY1, ceilingLocalY\);/,
  'compound exterior walls must terminate at the ceiling instead of entering the roof slab');

assert.ok(stairWalkAroundClearance(0.91) >= 1.75,
  'ordinary stair should reserve at least 1.75m of walk-around/landing approach');
assert.equal(stairWalkAroundClearance(2), 2.25,
  'landing approach growth must remain bounded');
const rect = { cx: 10, cz: 20 };
assert.deepEqual(centeredStairCorePosition({ axis: 'z', rect, offsetX: 0.5, offsetZ: 0.75 }), { x: 10, z: 20 },
  'z-running stair must stay centered instead of pinching either wall');
assert.deepEqual(centeredStairCorePosition({ axis: 'x', rect, offsetX: 0.5, offsetZ: 0.75 }), { x: 10, z: 20 },
  'x-running stair must stay centered instead of pinching either wall');
assert.match(engineSource, /const primaryStairCenter = centeredStairCorePosition\(\{[\s\S]*axis: primaryStairAxis, rect: primaryModule\.rect/,
  'internal stair placement must center the flight along its run axis');
assert.match(sidecarSource, /const walkAround = stairWalkAroundClearance\(stairClearWidth\);/,
  'Building Plan must reserve the stronger stair landing/approach apron');

console.log('[cut13-vertical-geometry-selftest] PASS', {
  render: 'horizontal cylinder with 96m vertical far-plane allowance',
  stair: 'fully centered core + >=1.75m planning apron',
  walls: 'terminate at ceiling / slab underside',
});
