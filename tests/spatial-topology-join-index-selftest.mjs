import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../world/spatial-topology.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

assert.match(source, /function indexSurfacesForPortalJoin\(surfaces\)/,
    'spatial topology must index portal-facing surfaces once');
assert.match(source, /function nearestSurface\(candidates, endpoint\)/,
    'indexed portal lookup must retain nearest-surface ranking');
assert.match(source, /distance === bestDistance && \(!best \|\| surface\.id\.localeCompare\(best\.id\) < 0\)/,
    'distance ties must retain stable surface-id ordering');
assert.match(source, /const surfaceJoinIndex = indexSurfacesForPortalJoin\(surfaces\);/,
    'surface index must be built once per topology compilation');
assert.match(source, /bestSurface\(surfaceJoinIndex, \{/,
    'portal binding must consume the surface index');

const bestStart = source.indexOf('function bestSurface(');
const bestEnd = source.indexOf('function normalizeSpace(', bestStart);
assert.ok(bestStart >= 0 && bestEnd > bestStart, 'bestSurface block must exist');
const bestBlock = source.slice(bestStart, bestEnd);
assert.doesNotMatch(bestBlock, /\.filter\(/, 'portal surface lookup must not filter the full surface corpus per portal');
assert.doesNotMatch(bestBlock, /\.sort\(/, 'portal surface lookup must not allocate/sort a candidate array per portal');

assert.match(source, /function indexSpacesForSurfaceJoin\(spaces\)/,
    'spatial topology must index semantic spaces by entity/module once');
assert.match(source, /const spaceJoinIndex = indexSpacesForSurfaceJoin\(spaces\);/,
    'space join index must be built once per topology compilation');
assert.match(source, /for \(const space of spacesForSurface\(spaceJoinIndex, surface\)\) pushUnique\(surface\.spaceIds, space\.id\);/,
    'surface-space binding must use the indexed join');

const surfaceLoopStart = source.indexOf('for (const surface of surfaces) {', source.indexOf('const plannedAdjacencyPairs'));
const apertureLoopStart = source.indexOf('for (const aperture of apertures)', surfaceLoopStart);
assert.ok(surfaceLoopStart >= 0 && apertureLoopStart > surfaceLoopStart, 'surface edge publication block must exist');
const surfaceLoop = source.slice(surfaceLoopStart, apertureLoopStart);
assert.doesNotMatch(surfaceLoop, /for \(const space of spaces\)/,
    'surface publication must not rescan every semantic space for every facade');

console.log('spatial-topology-join-index-selftest: ok');
