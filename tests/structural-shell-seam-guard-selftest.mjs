import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const enginePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../kowloon-fabric-engine.js');
const contractPath = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(here, '../world/kowloon-geometry-contract.js');
const engine = fs.readFileSync(enginePath, 'utf8').replace(/\r\n/g, '\n');
const contract = await import(pathToFileURL(contractPath).href + `?cut16=${Date.now()}`);
const { computeKowloonSlabRect, KOWLOON_WALL_HALF } = contract;

assert.equal(typeof computeKowloonSlabRect, 'function', 'shared slab geometry contract must remain exported');
assert.ok(Number.isFinite(KOWLOON_WALL_HALF) && KOWLOON_WALL_HALF > 0,
    'wall-half seam clearance must remain a positive shared constant');

const edges = { N: 'street', S: 'street', W: 'street', E: 'internal' };
const reverseEdges = { N: 'street', S: 'street', W: 'internal', E: 'street' };
const left = { key: '0,0', cell: { col: 0, row: 0 }, edgeKinds: edges, floors: 3, rect: { cx: 0, cz: 0, halfX: 1, halfZ: 1 } };
const right = { key: '1,0', cell: { col: 1, row: 0 }, edgeKinds: reverseEdges, floors: 3, rect: { cx: 2, cz: 0, halfX: 1, halfZ: 1 } };
const sameHeight = new Map([[left.key, left], [right.key, right]]);
const leftRoof = computeKowloonSlabRect(left, sameHeight, 3, { roof: true });
const rightRoof = computeKowloonSlabRect(right, sameHeight, 3, { roof: true });
assert.ok(Math.abs(leftRoof.x1 - rightRoof.x0) < 1e-12,
    'same-height neighboring roof plates must meet exactly at the shared seam');
assert.ok(leftRoof.x1 <= rightRoof.x0,
    'same-height neighboring roof plates must never overlap');

const lower = { ...left, floors: 2 };
const taller = { ...right, floors: 4 };
const setback = new Map([[lower.key, lower], [taller.key, taller]]);
const lowerRoof = computeKowloonSlabRect(lower, setback, 2, { roof: true });
const sharedSeamX = lower.rect.cx + lower.rect.halfX;
assert.ok(Math.abs((sharedSeamX - lowerRoof.x1) - KOWLOON_WALL_HALF) < 1e-12,
    'a lower roof beside a taller module must stop one wall-half before the vertical shell');

const broadStart = engine.indexOf('function* buildBroadStrokesCompoundSteps(');
const broadEnd = engine.indexOf('function* buildKowloonCompoundSteps(', broadStart);
assert.ok(broadStart >= 0 && broadEnd > broadStart, 'live broad-strokes shell builder must exist');
const broad = engine.slice(broadStart, broadEnd);
assert.equal((broad.match(/computeKowloonSlabRect\(/g) ?? []).length, 1,
    'broad-strokes shell must emit only the top roof slab, not intermediate floor/ceiling plates');
assert.match(broad, /computeKowloonSlabRect\(module, moduleByKey, module\.floors, \{ roof: true \}\)/,
    'broad-strokes roof must keep using the shared seam-aware slab contract');
assert.doesNotMatch(broad, /addRectPlatform\([^\n]*'floor'\)/,
    'broad-strokes shell must not publish dormant interior floor plates');

const richMarker = engine.indexOf('// Preserve the authored curb/skirt massing universally.');
const richRoofMarker = engine.indexOf('const roofY = moduleRoofY;', richMarker);
assert.ok(richMarker >= 0 && richRoofMarker > richMarker, 'rich structural module shell section must exist');
const rich = engine.slice(richMarker, richRoofMarker);
assert.match(rich, /if \(floor > 0\) \{\s*const slabRect = computeKowloonSlabRect\(module, moduleByKey, floor\);/s,
    'rich path must keep floor-zero slab suppressed so the foundation lip has no coplanar duplicate');

const wallStart = engine.indexOf('function realizeBuildingPlanWallRuns(');
const wallEnd = engine.indexOf('function registerBuildingPlanInteriorDoors(', wallStart);
assert.ok(wallStart >= 0 && wallEnd > wallStart, 'Building Plan wall realization must exist');
const walls = engine.slice(wallStart, wallEnd);
assert.match(walls, /supportKind: 'building-plan-partition'/,
    'Building Plan wall runs must remain explicitly partition-owned rather than a second exterior-shell authority');

console.log('structural-shell-seam-guard-selftest: ok');
