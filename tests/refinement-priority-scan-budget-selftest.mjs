import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');

assert.match(source, /const DETAIL_PRIORITY_SCAN_MAX = 32;/,
    'runtime selector must have a hard candidate scan ceiling');

const layerStart = source.indexOf('function layerTasksAcrossEntities(');
const layerEnd = source.indexOf('function planOverheadCableTasks(', layerStart);
assert.ok(layerStart >= 0 && layerEnd > layerStart, 'layered planner must exist');
const layerBlock = source.slice(layerStart, layerEnd);
assert.match(layerBlock, /for \(const queue of queues\) \{\s*if \(queue\.firstPass\[0\]\) layered\.push\(queue\.firstPass\[0\]\);\s*\}/,
    'all first-pass anchors must remain a contiguous prefix before deep layering');
assert.match(layerBlock, /for \(let layer = 0; ; layer\+\+\)/,
    'deep work must remain round-robin layered across entities');

const getStart = source.indexOf('function getEntity(');
const getEnd = source.indexOf('function createPanel(', getStart);
assert.ok(getStart >= 0 && getEnd > getStart, 'entity lookup helper must exist');
const getBlock = source.slice(getStart, getEnd);
assert.match(getBlock, /payload\.entityById\?\.get\(id\)/,
    'priority scan must use O(1) payload entity index first');
assert.match(getBlock, /payload\.entities\?\.find/,
    'legacy fallback lookup must remain for compatibility');

const nextStart = source.indexOf('function nextTaskIndex(');
const nextEnd = source.indexOf('function settleFirstPassMiss(', nextStart);
assert.ok(nextStart >= 0 && nextEnd > nextStart, 'runtime selector must exist');
const next = source.slice(nextStart, nextEnd);
assert.match(next, /const scanEnd = Math\.min\(state\.tasks\.length, state\.cursor \+ DETAIL_PRIORITY_SCAN_MAX\);/,
    'selector must cap its look-ahead');
assert.match(next, /for \(let index = state\.cursor; index < scanEnd; index\+\+\)/,
    'selector loop must stop at bounded scan end');
assert.doesNotMatch(next, /for \(let index = state\.cursor; index < state\.tasks\.length; index\+\+\)/,
    'full remaining-tail selector scan must stay removed');
assert.match(next, /exteriorTaskPriorityKey\(task/,
    'existing semantic/exterior priority law must remain authoritative inside the window');
assert.match(next, /compareExteriorPriorityKeys\(key, bestKey\)/,
    'existing deterministic priority comparison must remain intact');
assert.match(next, /remainingTasks: state\.tasks\.slice\(state\.cursor, scanEnd\)/,
    'coverage canary allocation must be bounded to the same candidate domain');

const prepStart = source.indexOf('function preparePayloadPlanningState(');
const prepEnd = source.indexOf('function exteriorCompositionInput(', prepStart);
assert.ok(prepStart >= 0 && prepEnd > prepStart, 'payload planning state must exist');
const prep = source.slice(prepStart, prepEnd);
assert.match(prep, /payload\.entityById = new Map\(\(payload\.entities \?\? \[\]\)\.map\(entity => \[entity\.id, entity\]\)\);/,
    'entity lookup index must be built once per detail payload');

// Do not buy selector time by backing out the detail/telemetry improvements already shipped.
assert.match(source, /pipe: 65/);
assert.match(source, /'spray-cans': 40/);
assert.match(source, /'overhead-cable': 30/);
assert.doesNotMatch(source, /payload\.detailRoot\.updateMatrixWorld\(true\)/,
    'Cut 10 accumulated-tree optimization must remain intact');
assert.match(source, /exteriorCoverage: complete \? exteriorCoverageSnapshot\(state, payload, playerPosition\) : null/,
    'Cut 11 completion-only snapshot optimization must remain intact');

console.log('refinement-priority-scan-budget-selftest: ok');
