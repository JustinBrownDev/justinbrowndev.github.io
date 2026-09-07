import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SPAWN_HOST_ARCHETYPES,
  chooseSpawnHostArchetype,
  readSpawnRollSalt,
} from '../world/spawn-proof.js';

assert.equal(SPAWN_HOST_ARCHETYPES['deep-backroom'].probability, 0.01);
assert.equal(SPAWN_HOST_ARCHETYPES['hanging-storefront'].probability, 0.09);
assert.equal(SPAWN_HOST_ARCHETYPES['sheltered-roof'].probability, 0.30);
assert.equal(SPAWN_HOST_ARCHETYPES['exposed-roof'].probability, 0.60);
assert.equal(readSpawnRollSalt('?spawnRoll=7'), '7');
assert.match(readSpawnRollSalt('?spawnRoll=random'), /^random:\d+$/);

const seen = new Set();
for (let i = 0; i < 2000; i++) seen.add(chooseSpawnHostArchetype(`distribution:${i}`));
assert.deepEqual([...seen].sort(), ['deep-backroom', 'exposed-roof', 'hanging-storefront', 'sheltered-roof']);

const proofSource = fs.readFileSync(new URL('../world/spawn-proof.js', import.meta.url), 'utf8');
assert.match(proofSource, /roll=\$\{rollSalt\}/);
assert.match(proofSource, /candidateVarietyJitter\(selectionKey, candidate, hostArchetype\)/);

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /spawnHostAuditionBudget/, 'spawn flavor selection must never synchronously audition extra chunks before control');
assert.doesNotMatch(mainSource, /auditioning nearby ordinary chunks/, 'retired blocking spawn audition must stay retired');
assert.match(mainSource, /Spawn proof is intentionally single-chunk/);

console.log('[spawn-place-variety-selftest] PASS', { archetypes: [...seen].sort() });
