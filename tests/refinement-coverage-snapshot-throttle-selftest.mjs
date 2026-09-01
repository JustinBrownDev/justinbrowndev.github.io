import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const pumpStart = source.indexOf('function pump(');
const pumpEnd = source.indexOf('function preparePayloadPlanningState(', pumpStart);
assert.ok(pumpStart >= 0 && pumpEnd > pumpStart, 'refinement pump must exist');
const pump = source.slice(pumpStart, pumpEnd);

assert.match(pump, /function pump\(chunk, payload, \{ maxSteps = 1, maxMillis = 2, playerPosition = null \} = \{\}\)/,
    'inner detail pump must remain explicitly cooperative');
assert.match(pump, /const complete = state\.cursor >= state\.tasks\.length;/,
    'completion state must still be computed after the bounded turn');
assert.match(pump,
    /exteriorCoverage: complete \? exteriorCoverageSnapshot\(state, payload, playerPosition\) : null/,
    'intermediate turns must not build a full coverage snapshot');
assert.match(pump,
    /complete: true, pending: 0, elapsedMs: 0, exteriorCoverage: exteriorCoverageSnapshot\(state, payload, playerPosition\)/,
    'an already-complete payload must still expose its final diagnostic snapshot');

const snapshotCalls = [...pump.matchAll(/exteriorCoverageSnapshot\(state, payload, playerPosition\)/g)].length;
assert.equal(snapshotCalls, 2, 'pump should retain only completion-path snapshot calls');
assert.doesNotMatch(pump,
    /firstPassEntityTarget: state\.firstPassEntityTarget,\s*exteriorCoverage: exteriorCoverageSnapshot/,
    'normal in-progress return must never unconditionally rebuild coverage telemetry');

// The performance cut must not buy time by removing the detail restored in Cuts 7-9.
assert.match(source, /pipe: 65/);
assert.match(source, /'spray-cans': 40/);
assert.match(source, /'overhead-cable': 30/);
assert.doesNotMatch(source, /payload\.detailRoot\.updateMatrixWorld\(true\)/,
    'Cut 10 accumulated-tree optimization must remain intact');

console.log('refinement-coverage-snapshot-throttle-selftest: ok');
