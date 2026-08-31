import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const kowloon = read('world/kowloon-fabric-enrichment.js');
const semantic = read('world/semantic-context-multiplier.js');
const main = read('main.js');
const config = read('config/game-config.js');

assert.match(kowloon, /kind === 'semantic-context-prop'[\s\S]*macro-exterior/, 'macro contextual props must be visible first-pass candidates');
assert.match(kowloon, /detailPriority\(a\) - detailPriority\(b\)/, 'entity task sort must rank the task, not only its kind');
assert.match(semantic, /function macroVisualRequest\(/, 'collider admission must be explicitly limited to macro visual requests');
assert.match(semantic, /semanticCollisionDeferred: collisionDeferred/, 'selected collider-bearing visuals must preserve deferred collision truth');
assert.match(semantic, /macroRequests/, 'selection telemetry must expose the macro funnel');
assert.match(main, /createPrefetchPressureGate/, 'runtime must install frame\/motion pressure gating for distant prefetch');
assert.match(main, /gear === WORLD_STREAMING_GEAR\.PREFETCH_STRUCTURE && prefetchPressure\.pressured/, 'pressure gate must only suppress distant structural prefetch');
assert.match(config, /prefetchPumpChunks:\s*1\b/, 'prefetch must build at most one distant chunk per pump');
assert.match(config, /prefetchPressureCooldownMs:\s*1800\b/, 'distant prefetch must wait after motion or a hitch');
assert.match(config, /prefetchPostBuildCooldownMs:\s*650\b/, 'prefetch must leave breathing room after an atomic chunk build');

console.log('[macro-exterior-patch-selftest] PASS');
