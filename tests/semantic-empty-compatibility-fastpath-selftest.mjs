import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../world/semantic-layout.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

const start = source.indexOf('function compileDestinationCompatibility(');
const end = source.indexOf('function publishSpace(', start);
assert.ok(start >= 0 && end > start, 'destination compatibility compiler must exist');
const block = source.slice(start, end);

assert.match(block, /const raw = tasks\.filter\(semanticTask\);/,
    'semantic task corpus must still be derived exactly once');
const fast = block.indexOf('if (!raw.length) return { tasks: [], remappedSpaces: 0, remappedTasks: 0, rejectedTasks: 0 };');
const catalog = block.indexOf('const allAssets = assetValues(assetById).filter(def => def?.id);');
assert.ok(fast >= 0, 'empty semantic corpus must have an explicit fast return');
assert.ok(catalog > fast, 'empty return must happen before semantic asset catalog materialization');
assert.match(block, /const groups = new Map\(\);/, 'non-empty semantic path must retain destination grouping');
assert.match(block, /const poolCache = new Map\(\);/, 'non-empty semantic path must retain compatibility pool cache');
assert.match(block, /return \{ tasks: compiled, remappedSpaces, remappedTasks, rejectedTasks \};/,
    'normal destination-compatibility result contract must remain intact');

const solveStart = source.indexOf('export function solveSemanticLayout(');
assert.ok(solveStart >= 0, 'semantic layout solver must remain exported');
const solve = source.slice(solveStart);
assert.match(solve, /const destinationCompatibility = compileDestinationCompatibility\(/,
    'normal semantic solver must still invoke destination compatibility');
assert.match(solve, /const semanticContext = compileSemanticContext\(\{ chunk, payload, tasks \}\);/,
    'exterior/semantic context compilation must remain intact even when interior corpus is empty');

console.log('semantic-empty-compatibility-fastpath-selftest: ok');
