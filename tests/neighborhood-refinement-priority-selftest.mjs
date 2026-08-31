import assert from 'node:assert/strict';
import { REFINEMENT_COVERAGE_WAVE, refinementCoverageFloorRank } from '../world/neighborhood-refinement-priority.js';

const firstPassPending = {
    firstPassEntityTarget: 4, firstPassEntitiesComplete: 2, firstPassComplete: false,
    exteriorCoverage: { coverageFloorEntityTarget: 4, coverageFloorEntitiesSettled: 0, coverageFloorComplete: false },
};
const coarsePending = {
    firstPassEntityTarget: 4, firstPassEntitiesComplete: 4, firstPassComplete: true,
    exteriorCoverage: { coverageFloorEntityTarget: 4, coverageFloorEntitiesSettled: 2, coverageFloorComplete: false },
};
const deep = {
    firstPassEntityTarget: 4, firstPassEntitiesComplete: 4, firstPassComplete: true,
    exteriorCoverage: { coverageFloorEntityTarget: 4, coverageFloorEntitiesSettled: 4, coverageFloorComplete: true },
};

assert.equal(refinementCoverageFloorRank(firstPassPending), REFINEMENT_COVERAGE_WAVE.FIRST_PASS);
assert.equal(refinementCoverageFloorRank(coarsePending), REFINEMENT_COVERAGE_WAVE.COARSE_FLOOR);
assert.equal(refinementCoverageFloorRank(deep), REFINEMENT_COVERAGE_WAVE.DEEP);
assert.equal(refinementCoverageFloorRank(firstPassPending, { visible: false }), REFINEMENT_COVERAGE_WAVE.DEEP, 'prefetch detail stays behind visible neighborhood work');

// Mirror the streamer's lexicographic law: visibility -> coverage wave -> focus.
const rank = ({ visible = true, focus = 0, refinement }) => [
    visible ? 0 : 1,
    refinementCoverageFloorRank(refinement, { visible }),
    visible ? focus : 3,
];
const compare = (a, b) => {
    const ak = rank(a), bk = rank(b);
    for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) return ak[i] - bk[i];
    return 0;
};

assert.ok(compare({ focus: 1, refinement: firstPassPending }, { focus: 0, refinement: coarsePending }) < 0,
    'adjacent visible first-pass identity must beat center-chunk coarse refinement');
assert.ok(compare({ focus: 1, refinement: coarsePending }, { focus: 0, refinement: deep }) < 0,
    'adjacent visible coarse floor must beat center-chunk deep refinement');
assert.ok(compare({ focus: 0, refinement: firstPassPending }, { focus: 1, refinement: firstPassPending }) < 0,
    'within the same coverage wave, center/near focus still wins');
assert.ok(compare({ visible: true, focus: 0, refinement: deep }, { visible: false, refinement: firstPassPending }) < 0,
    'prefetch/far work must not outrank visible nearby work even if its own first pass is incomplete');

console.log('[neighborhood-refinement-priority-selftest] PASS');
