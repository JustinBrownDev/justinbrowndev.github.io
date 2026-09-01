import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveGenerationProfile } from '../config/performance-isolation.js';

const skeleton = resolveGenerationProfile({ browser: true, search: '' });
assert.equal(skeleton.lanes.microEnrichment, false, 'full micro lane must stay off');
assert.equal(skeleton.lanes.authoredDecoration, false, 'authored decoration must stay off');
assert.equal(skeleton.lanes.moderateProps, true, 'cheap/moderate admission lane must remain on');
assert.equal(skeleton.lanes.plazaClutter, true, 'previous cheap plaza restoration must remain on');

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const mapMatch = source.match(/const MODERATE_PROP_PERCENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(mapMatch, 'moderate prop admission map must exist');
const mapBody = mapMatch[1];
assert.match(mapBody, /'spray-cans': 40/, 'spray cans should be admitted conservatively in skeleton');
assert.doesNotMatch(mapBody, /flyer\s*:/, 'flyers stay behind the full micro cut');
assert.doesNotMatch(mapBody, /'interior-prop'\s*:/, 'interior props stay behind the full micro cut');

const sprayMatch = source.match(/function createSprayCans\([\s\S]*?\n    }\n\n/);
assert.ok(sprayMatch, 'spray-can primitive realizer must exist');
assert.match(sprayMatch[0], /new THREE\.Mesh\(pipeGeo/);
assert.match(sprayMatch[0], /2 \+ Math\.floor\(rng\(\) \* 3\)/);
assert.doesNotMatch(sprayMatch[0], /CanvasTexture|placeRealModel|loadAsync|GLTF|fetch\(/, 'restored family must stay primitive-only');

const cutMatch = source.match(/function keepTaskUnderCommonDiagnosticCut\([\s\S]*?\n}\n\n/);
assert.ok(cutMatch, 'common diagnostic cut must exist');
assert.match(cutMatch[0], /GENERATION_LANES\.moderateProps/);
assert.match(cutMatch[0], /MODERATE_PROP_PERCENT/);

console.log('cheap-spray-detail-selftest: ok');
