import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../config/game-config.js', import.meta.url), 'utf8');
assert.match(source, /renderRadiusChunks:\s*7,/, 'live visible ring must be radius 7 = 15x15 = 225 chunks');
assert.match(source, /prefetchRadiusChunks:\s*9,/, 'structural prefetch must extend to radius 9 = 19x19');
assert.match(source, /retentionRadiusChunks:\s*11,/, 'retention must extend beyond the radius-9 prefetch ring');
console.log('cut12-render-ring-selftest: ok · visible=15x15=225 prefetch=19x19=361 retention-radius=11');
