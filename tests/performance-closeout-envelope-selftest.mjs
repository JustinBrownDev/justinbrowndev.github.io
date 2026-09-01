import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveGenerationProfile } from '../config/performance-isolation.js';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const skeleton = resolveGenerationProfile({ browser: true, search: '' });
assert.equal(skeleton.name, 'skeleton');
assert.deepEqual({ ...skeleton.lanes }, {
    broadStrokesOnly: true,
    macroSignage: true,
    spectacle: true,
    signatureContent: false,
    microEnrichment: false,
    authoredDecoration: false,
    plazaClutter: true,
    moderateProps: true,
    signageStress: true,
}, 'browser default must stay on the closed-out skeleton performance envelope');

const kill = resolveGenerationProfile({
    browser: true,
    search: '?generationProfile=skeleton&laneProps=0&lanePlaza=0&laneMacro=0&laneSpectacle=0',
});
assert.equal(kill.lanes.moderateProps, false, 'moderate detail kill switch must remain available');
assert.equal(kill.lanes.plazaClutter, false, 'plaza kill switch must remain available');
assert.equal(kill.lanes.macroSignage, false, 'macro-signage kill switch must remain available');
assert.equal(kill.lanes.spectacle, false, 'spectacle kill switch must remain available');

const full = resolveGenerationProfile({ browser: true, search: '?generationProfile=full' });
assert.equal(full.name, 'full');
assert.equal(full.lanes.broadStrokesOnly, false, 'explicit full mode must retain the complete structural path');
assert.equal(full.lanes.signatureContent, true, 'explicit full mode must retain signature content');
assert.equal(full.lanes.microEnrichment, true, 'explicit full mode must retain full micro enrichment');
assert.equal(full.lanes.authoredDecoration, true, 'explicit full mode must retain authored decoration');

const enrichment = read('../world/kowloon-fabric-enrichment.js');
const mapMatch = enrichment.match(/const MODERATE_PROP_PERCENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(mapMatch, 'moderate detail admission map must remain explicit');
const map = mapMatch[1];
assert.match(map, /pipe: 65,/, 'primitive pipe admission must stay at the measured 65 percent closeout level');
assert.match(map, /'spray-cans': 40,/, 'spray-can admission must stay at 40 percent');
assert.match(map, /'overhead-cable': 30,/, 'overhead-cable admission must stay at 30 percent');
assert.match(map, /security: 40,/, 'security-camera admission must stay at 40 percent');
assert.doesNotMatch(map, /flyer\s*:/, 'per-item flyer textures must not silently enter the moderate lane');
assert.doesNotMatch(map, /interior-prop\s*:/, 'interior props must not silently enter the moderate lane');
assert.doesNotMatch(map, /semantic-context-prop\s*:/, 'semantic-context GLB work must not silently enter the moderate lane');
assert.match(enrichment, /const DETAIL_PRIORITY_SCAN_MAX = 32;/,
    'detail priority lookahead must remain hard-bounded to 32 candidates');
assert.doesNotMatch(enrichment, /payload\.detailRoot\.updateMatrixWorld\(true\)/,
    'detail publication must not rewalk the accumulated detail tree');
assert.match(enrichment, /exteriorCoverage: complete \? exteriorCoverageSnapshot\(state, payload, playerPosition\) : null/,
    'expensive exterior coverage snapshot must remain completion-only');

const semanticLayout = read('../world/semantic-layout.js');
const compatibilityStart = semanticLayout.indexOf('function compileDestinationCompatibility(');
const compatibilityEnd = semanticLayout.indexOf('function publishSpace(', compatibilityStart);
assert.ok(compatibilityStart >= 0 && compatibilityEnd > compatibilityStart,
    'destination compatibility compiler must remain present');
const compatibility = semanticLayout.slice(compatibilityStart, compatibilityEnd);
const emptyFastPath = compatibility.indexOf('if (!raw.length) return { tasks: [], remappedSpaces: 0, remappedTasks: 0, rejectedTasks: 0 };');
const assetCatalog = compatibility.indexOf('const allAssets = assetValues(assetById).filter(def => def?.id);');
assert.ok(emptyFastPath >= 0 && assetCatalog > emptyFastPath,
    'empty semantic-interior work must return before semantic asset catalog materialization');

const semanticContext = read('../world/semantic-context.js');
assert.match(semanticContext, /function indexAperturesBySurface\(apertures\)/,
    'semantic context must keep the one-time facade aperture index');
assert.match(semanticContext, /const aperturesBySurfaceId = indexAperturesBySurface\(apertures\);/,
    'semantic context must build its aperture index once per compilation');
assert.doesNotMatch(semanticContext, /surface\.apertureIds = apertures\.filter\(item => item\.surfaceId === surface\.id\)/,
    'semantic context must not regress to per-surface global aperture rescans');

const spatialTopology = read('../world/spatial-topology.js');
assert.match(spatialTopology, /function indexSurfacesForPortalJoin\(surfaces\)/,
    'spatial topology must retain indexed portal-to-surface joins');
assert.match(spatialTopology, /function indexSpacesForSurfaceJoin\(spaces\)/,
    'spatial topology must retain indexed surface-to-space joins');
assert.match(spatialTopology, /const surfaceJoinIndex = indexSurfacesForPortalJoin\(surfaces\);/,
    'surface join index must be built once');
assert.match(spatialTopology, /const spaceJoinIndex = indexSpacesForSurfaceJoin\(spaces\);/,
    'space join index must be built once');

console.log('performance-closeout-envelope-selftest: ok');
