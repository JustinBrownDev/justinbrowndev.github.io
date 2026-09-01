import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');

assert.match(source, /function indexAperturesBySurface\(apertures\)/,
    'semantic context must build a reusable surface aperture index');
assert.match(source, /const aperturesBySurfaceId = indexAperturesBySurface\(apertures\);/,
    'semantic context must index the spatial topology aperture corpus once');
assert.match(source, /surface\.apertureIds = \(aperturesBySurfaceId\.get\(surface\.id\) \?\? \[\]\)\.map\(item => item\.id\)/,
    'surface aperture ids must come from the shared index');
assert.match(source, /function facadeOpportunities\(surfaces, aperturesBySurfaceId, contextByEntity\)/,
    'facade discovery must consume the shared index');
assert.match(source, /const surfaceApertures = aperturesBySurfaceId\.get\(surface\.id\) \?\? \[\];/,
    'facade discovery must resolve one scoped aperture list per surface');
assert.match(source, /for \(const aperture of surfaceApertures\.filter\(item => item\.traversable\)\)/,
    'portal flank discovery must scan only the current surface apertures');
assert.match(source, /function spectacleOpportunities\(chunk, payload, surfaces, aperturesBySurfaceId, contextByEntity\)/,
    'spectacle discovery must consume the shared index');
assert.match(source, /freeIntervals\(surface, aperturesBySurfaceId\.get\(surface\.id\) \?\? \[\], 0\.34\)/,
    'spectacle interval discovery must use the current surface aperture list');
assert.doesNotMatch(source, /surface\.apertureIds = apertures\.filter\(item => item\.surfaceId === surface\.id\)/,
    'compileSemanticContext must not rescan the global aperture list per surface');
assert.doesNotMatch(source, /for \(const aperture of apertures\.filter\(item => item\.surfaceId === surface\.id && item\.traversable\)\)/,
    'facade portal discovery must not rescan the global aperture list');

console.log('semantic-context-aperture-index-selftest: ok');
