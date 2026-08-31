import assert from 'node:assert/strict';
import {
    compareExteriorPriorityKeys,
    exteriorTaskPriorityKey,
    exteriorTaskCompositionWave,
    EXTERIOR_COVERAGE_NEIGHBORHOOD_METERS,
} from '../world/exterior-spectacle-priority.js';

const player = { x: 0, z: 0 };
function task({ entityId, kind, tier, wave, x, impact = 1, firstPassBundle = false, coverageRequired = false }) {
    return {
        entityId, kind, exteriorVisualTier: tier, exteriorVisualImpact: impact,
        semanticPlacement: { x, z: 0 }, firstPassBundle,
        exteriorComposition: {
            schema: 'jweb.exterior-composition-authority.v2',
            entityId, style: 'mixed', tier, wave, coverageRequired,
            coverageRole: wave === 0 ? 'first-pass-anchor' : coverageRequired ? 'coarse-floor' : 'refinement',
            densityOrdinal: 0, densityCeiling: 7,
        },
    };
}
function key(t, firstPassIncomplete = false) {
    return exteriorTaskPriorityKey(t, { playerPosition: player, taskPosition: t.semanticPlacement, firstPassIncomplete });
}
function before(a, b, firstPassIncomplete = false) {
    return compareExteriorPriorityKeys(key(a, firstPassIncomplete), key(b, firstPassIncomplete)) < 0;
}

assert.equal(EXTERIOR_COVERAGE_NEIGHBORHOOD_METERS, 18);
const aMicro = task({ entityId: 'A', kind: 'flyer', tier: 'micro', wave: 4, x: 2, impact: 0.2 });
const bCoarse = task({ entityId: 'B', kind: 'pipe', tier: 'macro', wave: 1, x: 14, impact: 5, coverageRequired: true });
assert.ok(before(bCoarse, aMicro), 'within one active street pocket, an uncovered building coarse floor must beat neighbor micro clutter');

const bOptionalMacro = task({ entityId: 'B', kind: 'awning', tier: 'macro', wave: 2, x: 14, impact: 3 });
assert.ok(before(bOptionalMacro, aMicro), 'optional major structure should still precede micro clutter within the same nearby neighborhood wave');

const cMedium = task({ entityId: 'C', kind: 'security', tier: 'medium', wave: 3, x: 11, impact: 2 });
assert.ok(before(cMedium, aMicro), 'medium refinement remains a distinct wave before micro');
assert.ok(before(bCoarse, cMedium), 'coverage floors precede medium refinement');

const farCoverage = task({ entityId: 'FAR', kind: 'pipe', tier: 'macro', wave: 1, x: 25, impact: 100, coverageRequired: true });
assert.ok(before(aMicro, farCoverage), 'far high-value work must not outrank genuinely nearby work in an earlier neighborhood band');

const aAnchor = task({ entityId: 'A', kind: 'sign', tier: 'identity', wave: 0, x: 16, impact: 2, firstPassBundle: true, coverageRequired: true });
const nearDeep = task({ entityId: 'B', kind: 'pipe', tier: 'macro', wave: 1, x: 1, impact: 20, coverageRequired: true });
assert.ok(before(aAnchor, nearDeep, true), 'while first pass is incomplete, every building anchor still beats all deep work regardless of local distance');

assert.equal(exteriorTaskCompositionWave(aAnchor), 0);
assert.equal(exteriorTaskCompositionWave(bCoarse), 1);
assert.equal(exteriorTaskCompositionWave(bOptionalMacro), 2);
assert.equal(exteriorTaskCompositionWave(cMedium), 3);
assert.equal(exteriorTaskCompositionWave(aMicro), 4);

const shuffled = [aMicro, cMedium, bOptionalMacro, bCoarse];
shuffled.sort((a, b) => compareExteriorPriorityKeys(key(a), key(b)));
assert.deepEqual(shuffled.map(item => item.exteriorComposition.wave), [1, 2, 3, 4], 'same-neighborhood realization must be coarse-to-fine by explicit composition wave');

console.log('[exterior-neighborhood-coverage-selftest] PASS', {
    neighborhoodMeters: EXTERIOR_COVERAGE_NEIGHBORHOOD_METERS,
    orderedWaves: shuffled.map(item => item.exteriorComposition.wave),
});
