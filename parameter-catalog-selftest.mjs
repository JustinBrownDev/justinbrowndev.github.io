import assert from 'node:assert/strict';
import { LITERAL_PARAMETER_CATALOG } from './parameter-catalog.js';

const keys = new Set();
const scopes = new Map();
for (const row of LITERAL_PARAMETER_CATALOG) {
    assert.equal(row.length, 9, `bad catalog row: ${JSON.stringify(row)}`);
    assert(/^n\.(main|physics|perf|assets)\.[0-9a-f]{12}$/.test(row[0]), `unstable/invalid key shape ${row[0]}`);
    assert(!keys.has(row[0]), `duplicate key ${row[0]}`);
    keys.add(row[0]);
    scopes.set(row[1], (scopes.get(row[1]) || 0) + 1);
}
assert(LITERAL_PARAMETER_CATALOG.length > 9000, 'expected exhaustive authored runtime catalog');
assert(scopes.get('main') > 5000);
assert(scopes.get('assets') > 3000);
assert(scopes.get('physics') > 50);
assert(scopes.get('perf') > 50);
console.log('[parameter-catalog-selftest] PASS', {
    total: LITERAL_PARAMETER_CATALOG.length,
    scopes: Object.fromEntries(scopes),
});
