// JWEB_INTENT: STAIR_WALKABILITY_V1
import assert from 'node:assert/strict';
import { deriveStairFlight, gameplayTraversalEnvelope, resolvePhysicalTruth } from '../world/physical-truth.js';
import { planInteriorStairCoreWithArchitectureReplan, planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';

// Deterministic fixture where weirdness resolves the tread just below the source
// minimum. That provenance is valid data; geometry that exactly realizes the
// resolved tread must still classify as fitting the resolved architectural truth.
const truth = resolvePhysicalTruth({
  physicalUse: 'residential-lodging',
  role: 'primary-circulation',
  weirdness: 0.05,
  stableKey: 'probe:residential-lodging:5',
});
const sourceMinimum = Number(truth.stair.tread.sourceMinimum?.canonicalSI);
assert.ok(Number.isFinite(sourceMinimum));
assert.ok(truth.stair.tread.realizedSI < sourceMinimum,
  'fixture must retain a deliberately weird resolved tread below the modern/source minimum');

const nominal = deriveStairFlight({ rise: 0.42, truth, stableKey: 'cut14-r2:nominal' });
assert.equal(nominal.fitClassification, 'fits-resolved-truth',
  'geometry that exactly realizes resolved tread truth must fit even when that truth is outside source baseline');
assert.equal(nominal.baselineClassification, 'resolved-truth-outside-source-minimum');
assert.equal(nominal.fitThresholdBasis, 'resolved-truth');
assert.ok(Math.abs(nominal.fitThresholdTreadDepth - truth.stair.tread.realizedSI) < 1e-12);
assert.ok(Math.abs(nominal.realizedTreadDepth - truth.stair.tread.realizedSI) < 1e-12);

// Normal (non-weird-below-baseline) truth keeps the preexisting behavior: a
// selected/common tread may compress to the source minimum without becoming an
// architectural geometry failure.
const normalTruth = resolvePhysicalTruth({
  physicalUse: 'business', role: 'primary-circulation', weirdness: 0, stableKey: 'cut14-r2:normal-business',
});
const normalNominal = deriveStairFlight({ rise: 1.2, truth: normalTruth, stableKey: 'cut14-r2:normal-nominal' });
const normalSourceMinimum = Number(normalTruth.stair.tread.sourceMinimum?.canonicalSI);
assert.ok(normalTruth.stair.tread.realizedSI >= normalSourceMinimum - 1e-9);
const sourceMinimumRun = (normalNominal.riserCount - 1) * normalSourceMinimum;
const sourceMinimumFit = deriveStairFlight({
  rise: 1.2, truth: normalTruth, stableKey: 'cut14-r2:normal-source-min', availableRun: sourceMinimumRun,
});
assert.equal(sourceMinimumFit.fitClassification, 'fits-resolved-truth');
assert.equal(sourceMinimumFit.fitThresholdBasis, 'source-minimum');
const belowSourceMinimum = deriveStairFlight({
  rise: 1.2, truth: normalTruth, stableKey: 'cut14-r2:normal-below-source-min', availableRun: sourceMinimumRun * 0.96,
});
assert.equal(belowSourceMinimum.fitClassification, 'geometry-fit-outside-truth');

const pinched = deriveStairFlight({
  rise: 0.42,
  truth,
  stableKey: 'cut14-r2:pinched',
  availableRun: nominal.requiredRun * 0.72,
});
assert.equal(pinched.fitClassification, 'geometry-fit-outside-truth',
  'shortening the actual run below resolved tread truth must still be rejected');

const envelope = gameplayTraversalEnvelope();
const rect = { cx: 0, cz: 0, halfX: 2.99, halfZ: 2.99 };
const families = [
  'residential-lodging', 'mercantile-public', 'business', 'assembly-institutional',
  'industrial-service', 'storage', 'maintenance-utility',
];
let samples = 0;
let outsideBaselineSamples = 0;
for (const family of families) {
  for (let i = 0; i < 100; i++) {
    const sampleTruth = resolvePhysicalTruth({
      physicalUse: family,
      role: 'primary-circulation',
      weirdness: (i % 101) / 100,
      stableKey: `cut14-r2:${family}:${i}`,
    });
    if (sampleTruth.stair.tread.classification === 'deliberate-weirdness-outside-modern-baseline') {
      outsideBaselineSamples++;
    }
    const core = planInteriorSwitchbackStairCore({
      rect,
      floorH: sampleTruth.floorHeight.realizedSI,
      physicalTruth: sampleTruth,
      traversalEnvelope: envelope,
      stableKey: `cut14-r2:${family}:${i}:core`,
    });
    const modules = [
      { key: '0,0', cell: { col: 0, row: 0 }, rect: { ...rect, cx: 0 }, floors: 4 },
      { key: '1,0', cell: { col: 1, row: 0 }, rect: { ...rect, cx: 5.98 }, floors: 3 },
      { key: '2,0', cell: { col: 2, row: 0 }, rect: { ...rect, cx: 11.96 }, floors: 2 },
    ];
    const architecture = core ? { core, replanned: false } : planInteriorStairCoreWithArchitectureReplan({
      modulePlans: modules,
      primaryModule: modules[0],
      floorH: sampleTruth.floorHeight.realizedSI,
      physicalTruth: sampleTruth,
      traversalEnvelope: envelope,
      stableKey: `cut14-r2:${family}:${i}:architectural-core`,
    });
    assert.ok(architecture, `${family}:${i}: resolved truth must either fit the bay or trigger a legal architectural replan`);
    assert.ok(architecture.core.flightCount <= 4, `${family}:${i}: architectural recovery may not exceed four flights per story`);
    assert.equal(architecture.core.segmentFlight.fitClassification, 'fits-resolved-truth');
    samples++;
  }
}
assert.ok(outsideBaselineSamples > 0, 'family sweep must include deliberate weirdness outside source baseline');

console.log('[cut14-resolved-stair-truth-selftest] PASS', {
  samples,
  outsideBaselineSamples,
  nominalTread: truth.stair.tread.realizedSI,
  sourceMinimum,
  invariant: 'geometry fit is resolved-truth-relative; non-fitting bays replan architecture instead of compressing stair truth',
});
