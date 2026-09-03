import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const compatibility = fs.readFileSync(new URL('../world/dual-polarity-player-physics.js', import.meta.url), 'utf8');

assert.match(main, /import \{ createPlayerPhysics \} from '\.\/player-physics\.js'/);
assert.doesNotMatch(main, /dual-polarity-player-physics/);
assert.match(main, /camera\.up\.set\(0, 1, 0\)/);
assert.match(main, /camera\.rotation\.z = 0/);
assert.doesNotMatch(engine, /verticalPolarity:\s*-1/);
assert.doesNotMatch(engine, /hangingRoot\.scale\.y/);
assert.match(engine, /gravityDirection:\s*'world-down'/);
assert.doesNotMatch(compatibility, /verticalPolarity|invertedPosition|polarityPortals/);
assert.match(compatibility, /return createPlayerPhysics\(options\)/);

console.log('[dual-polarity-player-physics-selftest] PASS', {
  retired: 'dual-polarity traversal',
  invariant: 'architecture may grow downward; player gravity/camera remain ordinary everywhere',
});
