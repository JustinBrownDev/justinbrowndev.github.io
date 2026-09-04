import assert from 'node:assert/strict';
import {
    SUPERSTRUCTURE_FALLBACK_SCHEMA,
    collapseSolidComponentsIntoSuperstructureSites,
    superstructureFallbackDecision,
} from '../world/superstructure-fallback.js';

const collapsed = collapseSolidComponentsIntoSuperstructureSites({
    cols: 7,
    rows: 7,
    solidKeys: ['5,4', '5,3', '4,3', '1,1', '1,2'],
});
assert.equal(collapsed.schema, SUPERSTRUCTURE_FALLBACK_SCHEMA);
assert.equal(collapsed.sites.length, 2);
assert.deepEqual(collapsed.sites[0].cells, [{ col: 1, row: 1 }, { col: 1, row: 2 }]);
assert.deepEqual(collapsed.sites[1].cells, [{ col: 4, row: 3 }, { col: 5, row: 3 }, { col: 5, row: 4 }]);
assert.equal(collapsed.siteIdOf[4][5], 1);
assert.equal(collapsed.siteIdOf[0][0], -1);

// Fresh-browser REBASE4 regression fixture: chunk 2,0 / site 5,4 exhausted its
// full legal 5.666m cell and still rejected. The next policy is a component-wide
// superstructure, never another retry inside that parcel.
const traceFailure = {
    chunkKey: '2,0', siteSignature: '5,4', moduleKey: '5,4',
    rejectionReason: 'no-legal-circulation-envelope',
    recoveredCellSize: 5.666666666666667,
};
const decision = superstructureFallbackDecision({
    ordinarySiteCount: 7,
    failures: [traceFailure],
    superstructureSites: collapsed.sites,
    serviceVoids: [],
});
assert.equal(decision.triggered, true);
assert.equal(decision.mode, 'connected-solid-superstructure');
assert.equal(decision.failureCount, 1);
assert.equal(decision.triggeredBy[0].chunkKey, '2,0');
assert.equal(decision.triggeredBy[0].siteSignature, '5,4');
assert.equal(decision.triggeredBy[0].rejectionReason, 'no-legal-circulation-envelope');
assert.ok(!decision.mode.includes('retry'));

const repeat = collapseSolidComponentsIntoSuperstructureSites({
    cols: 7, rows: 7, solidKeys: ['1,2', '5,4', '4,3', '1,1', '5,3'],
});
assert.deepEqual(repeat, collapsed, 'component collapse must not depend on input Set order');
console.log('superstructure-fallback-selftest: ok', decision);
