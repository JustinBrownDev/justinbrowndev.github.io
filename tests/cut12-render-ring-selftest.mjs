import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../config/game-config.js', import.meta.url), 'utf8');
assert.match(source, /renderRadiusChunks:\s*1,/, 'Cut 12 live visible ring must be radius 1 = 3x3 = 9 chunks');
assert.match(source, /prefetchRadiusChunks:\s*3,/, 'Cut 12 must retain radius-3 structural prefetch = 7x7');
assert.match(source, /retentionRadiusChunks:\s*4,/, 'Cut 12 must retain radius-4 retention');
console.log('cut12-render-ring-selftest: ok · visible=3x3=9 prefetch=7x7=49 retention-radius=4');
