import assert from 'node:assert/strict';
import {
    createExteriorCoverageRuntime,
    exteriorCoverageSnapshot,
    noteMicroAheadCoverageViolation,
    recordExteriorCoverageResult,
} from '../world/exterior-composition-runtime.js';

const composition = {
    stats: {
        runtimeSchema: 'jweb.exterior-composition-runtime.v1',
        perEntity: {
            A: { style: 'signage-bazaar', densityCeiling: 6, coverageFloor: { planned: 2 } },
            B: { style: 'pipe-nightmare', densityCeiling: 5, coverageFloor: { planned: 2 } },
            FAR: { style: 'mixed', densityCeiling: 7, coverageFloor: { planned: 2 } },
        },
    },
};
const anchorA = {
    entityId: 'A', kind: 'sign', firstPassBundle: true, semanticPlacement: { x: 2, z: 0 },
    exteriorComposition: { tier: 'identity', wave: 0, coverageRequired: true },
};
const macroA = {
    entityId: 'A', kind: 'awning', semanticPlacement: { x: 3, z: 0 },
    exteriorComposition: { tier: 'macro', wave: 1, coverageRequired: true },
};
const macroB = {
    entityId: 'B', kind: 'pipe', semanticPlacement: { x: 14, z: 0 },
    exteriorComposition: { tier: 'macro', wave: 1, coverageRequired: true },
};
const microA = {
    entityId: 'A', kind: 'flyer', semanticPlacement: { x: 1, z: 0 },
    exteriorComposition: { tier: 'micro', wave: 4, coverageRequired: false },
};
const farMacro = {
    entityId: 'FAR', kind: 'pipe', semanticPlacement: { x: 40, z: 0 },
    exteriorComposition: { tier: 'macro', wave: 1, coverageRequired: true },
};
const state = {
    cursor: 0,
    firstPassComplete: true,
    tasks: [macroB, microA, farMacro],
    exteriorCoverage: createExteriorCoverageRuntime(composition),
};
const payload = { entities: [{ id: 'A', x: 2, z: 0 }, { id: 'B', x: 14, z: 0 }, { id: 'FAR', x: 40, z: 0 }] };

recordExteriorCoverageResult(state, anchorA, true);
recordExteriorCoverageResult(state, macroA, true);
recordExteriorCoverageResult(state, macroB, true);
recordExteriorCoverageResult(state, microA, true);
assert.equal(state.exteriorCoverage.perEntity.A.published, 3);
assert.equal(state.exteriorCoverage.perEntity.B.published, 1);
assert.equal(state.exteriorCoverage.publishedByTier.macro, 2);
assert.equal(state.exteriorCoverage.lastPublishedTier, 'micro');

let snapshot = exteriorCoverageSnapshot(state, payload, { x: 0, z: 0 });
assert.equal(snapshot.nearbyBuildings, 2, '40m building should not pollute active-neighborhood coverage metrics');
assert.equal(snapshot.firstPassIdentity, 1);
assert.equal(snapshot.macroCoverage, 2);
assert.equal(snapshot.spectacle, 0);
assert.equal(snapshot.topConsumers[0].entityId, 'A');
assert.equal(snapshot.topConsumers[0].published, 3);
assert.equal(snapshot.currentTier, 'micro');

const violated = noteMicroAheadCoverageViolation({
    state,
    payload,
    playerPosition: { x: 0, z: 0 },
    chosen: microA,
    remainingTasks: [microA, macroB, farMacro],
});
assert.equal(violated, true, 'canary should detect micro selected while same-neighborhood coverage is waiting');
assert.equal(state.exteriorCoverage.microAheadOfCoverageViolations, 1);

const onlyFar = noteMicroAheadCoverageViolation({
    state,
    payload,
    playerPosition: { x: 0, z: 0 },
    chosen: microA,
    remainingTasks: [microA, farMacro],
});
assert.equal(onlyFar, false, 'far coverage should not count as starvation of the nearby neighborhood');
assert.equal(state.exteriorCoverage.microAheadOfCoverageViolations, 1);

recordExteriorCoverageResult(state, farMacro, false);
assert.equal(state.exteriorCoverage.coverageRequiredMisses, 1);
snapshot = exteriorCoverageSnapshot(state, payload, { x: 0, z: 0 });
assert.equal(snapshot.coverageRequiredMisses, 1);
assert.equal(snapshot.microAheadOfCoverageViolations, 1);

console.log('[exterior-composition-runtime-selftest] PASS', snapshot);
