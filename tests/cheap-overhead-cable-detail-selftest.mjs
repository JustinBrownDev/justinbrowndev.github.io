import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveGenerationProfile } from '../config/performance-isolation.js';

const skeleton = resolveGenerationProfile({ browser: true, search: '' });
assert.equal(skeleton.lanes.microEnrichment, false, 'full micro lane must stay off');
assert.equal(skeleton.lanes.authoredDecoration, false, 'authored decoration must stay off');

const optIn = resolveGenerationProfile({ browser: true, search: '?generationProfile=skeleton&laneProps=1' });
assert.equal(optIn.lanes.moderateProps, true, 'the cheap primitive lane remains available as an explicit override');
assert.equal(skeleton.lanes.moderateProps, false, 'optional moderate props must stay out of baseline first paint');
assert.equal(skeleton.lanes.plazaClutter, false, 'optional plaza clutter must stay out of baseline first paint');

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const mapMatch = source.match(/const MODERATE_PROP_PERCENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(mapMatch, 'moderate prop admission map must exist');
const mapBody = mapMatch[1];
assert.match(mapBody, /'spray-cans': 40/, 'spray-can capability remains available outside baseline');
assert.match(mapBody, /'overhead-cable': 30/, 'overhead cables remains available sparsely when moderate detail is enabled');
assert.doesNotMatch(mapBody, /flyer\s*:/, 'flyers stay behind the full micro cut');
assert.doesNotMatch(mapBody, /'interior-prop'\s*:/, 'interior props stay behind the full micro cut');

const cableMatch = source.match(/function createOverheadCable\([\s\S]*?\n    \}\n\n/);
assert.ok(cableMatch, 'overhead-cable primitive realizer must exist');
assert.match(cableMatch[0], /const segments = 5/);
assert.match(cableMatch[0], /new THREE\.Mesh\(pipeGeo, securityMat\)/);
assert.match(cableMatch[0], /setFromUnitVectors\(up, delta\.normalize\(\)\)/);
assert.doesNotMatch(cableMatch[0], /CanvasTexture|placeRealModel|loadAsync|GLTF|fetch\(/, 'restored family must stay primitive-only');

assert.match(source, /if \(cableRng\(\) > 0\.34\) continue;/, 'cable planning itself must remain sparse before the 30% admission gate');

assert.doesNotMatch(source, /PROGRESSIVE_EXTERIOR_DETAIL_KINDS[\s\S]{0,400}'overhead-cable'/,
    'overhead cables stay opt-in only; progressive deepening should not retry coordinate-fragile cosmetic spans');

const cutMatch = source.match(/function keepTaskUnderCommonDiagnosticCut\([\s\S]*?\n\}\n\n/);
assert.ok(cutMatch, 'common diagnostic cut must exist');
assert.match(cutMatch[0], /GENERATION_LANES\.moderateProps/);
assert.match(cutMatch[0], /MODERATE_PROP_PERCENT/);

console.log('cheap-overhead-cable-detail-selftest: ok');
