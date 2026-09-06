import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveGenerationProfile } from '../config/performance-isolation.js';

const skeleton = resolveGenerationProfile({ browser: true, search: '' });
assert.equal(skeleton.lanes.microEnrichment, false, 'full micro lane must stay off');
assert.equal(skeleton.lanes.authoredDecoration, false, 'authored decoration must stay off');

const optIn = resolveGenerationProfile({ browser: true, search: '?generationProfile=skeleton&laneProps=1' });
assert.equal(optIn.lanes.moderateProps, true, 'the cheap primitive lane remains available as an explicit override');
assert.equal(skeleton.lanes.moderateProps, false, 'optional moderate props must stay out of baseline first paint');

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const mapMatch = source.match(/const MODERATE_PROP_PERCENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(mapMatch, 'moderate prop admission map must exist');
const mapBody = mapMatch[1];
assert.match(mapBody, /pipe: 65/, 'explicit moderate-detail mode keeps primitive facade pipes at 65%');
assert.match(mapBody, /'spray-cans': 40/, 'spray-can capability remains available outside baseline');
assert.match(mapBody, /'overhead-cable': 30/, 'overhead-cable capability remains available outside baseline');
assert.doesNotMatch(mapBody, /flyer\s*:/, 'flyers stay behind the full micro cut');
assert.doesNotMatch(mapBody, /'interior-prop'\s*:/, 'interior props stay behind the full micro cut');

const pipeMatch = source.match(/function createPipe\([\s\S]*?\n    \}\n\n/);
assert.ok(pipeMatch, 'primitive pipe realizer must exist');
assert.match(pipeMatch[0], /new THREE\.Mesh\(pipeGeo, mat\)/, 'pipe should use shared cylinder geometry/material');
assert.doesNotMatch(pipeMatch[0], /CanvasTexture|placeRealModel|loadAsync|GLTF|fetch\(/, 'pipe restoration must not cross into texture/GLB work');

assert.match(source, /const pipeCount = 1 \+ \(rng\(\) < 0\.38 \? 1 : 0\);/, 'pipe planning must remain bounded to 1-2 tasks per building');

console.log('primitive-pipe-density-selftest: ok');
