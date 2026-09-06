import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync(new URL('../config/game-config.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

assert.match(config, /renderRadiusChunks:\s*7,/);
assert.match(config, /prefetchRadiusChunks:\s*9,/);
assert.match(config, /retentionRadiusChunks:\s*11,/);
assert.match(config, /desktop:[\s\S]*?drawDistance:\s*700,/);
assert.match(config, /fogDensity:\s*0\.0011,/);
assert.ok(!main.includes('verticalBandT('), 'height fog banding must remain removed');
assert.ok(!main.includes('CAVE_FOG') && !main.includes('HEAVEN_FOG'), 'height-specific fog colors must remain removed');
assert.ok(!main.includes('createMusicPlayer') && !main.includes('#musicPlayer'), 'music player must remain removed');
assert.ok(!fs.existsSync(new URL('../systems/music-player.js', import.meta.url)), 'music-player module must remain deleted');
assert.match(main, /updateWebGradient\(worldZ\)/);
assert.match(main, /cylindricalFarPlaneDistance\(QUALITY\.drawDistance\)/);
console.log('distance-atmosphere-selftest: ok · render=7 prefetch=9 retention=11 neutral long-range fog music=retired');
