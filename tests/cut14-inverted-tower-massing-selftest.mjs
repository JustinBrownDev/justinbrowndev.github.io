import assert from 'node:assert/strict';
import {
  BASELINE_COMPOUND_TARGETS,
  BUILDING_VOLUME_SCALE_TARGET,
  SCALED_COMPOUND_TARGETS,
  chooseVolumetricCompoundTargetSize,
  weightedCompoundTargetMean,
} from '../world/building-scale-policy.js';
import {
  INVERTED_TOWER_FIELD_SCHEMA,
  INVERTED_TOWER_MIN_TIP_Y,
  planInvertedTowerField,
} from '../world/inverted-tower-field.js';

assert.equal(BUILDING_VOLUME_SCALE_TARGET, 4);
const baselineMean = weightedCompoundTargetMean(BASELINE_COMPOUND_TARGETS);
const scaledMean = weightedCompoundTargetMean(SCALED_COMPOUND_TARGETS);
assert.ok(Math.abs(scaledMean - baselineMean * 4) < 1e-10,
  `scaled connected floorplate mean must be exactly 4x baseline: ${baselineMean} -> ${scaledMean}`);
for (const bonus of [1, 2, 3]) {
  for (const roll of [0, 0.01, 0.2, 0.5, 0.8, 0.999999]) {
    const target = chooseVolumetricCompoundTargetSize(() => roll, { siteTargetBonus: bonus });
    assert.ok(target >= 20 && target <= 48 && target % 4 === 0, `bad 4x target ${target}`);
  }
}

const sites = [
  { id: 0, cells: Array.from({ length: 24 }, (_, i) => ({ col: i % 6, row: Math.floor(i / 6) })) },
  { id: 1, cells: Array.from({ length: 12 }, (_, i) => ({ col: 6 + (i % 3), row: Math.floor(i / 3) })) },
];
const args = {
  worldSeed: 0x14c17a,
  chunkKey: '2,-3', chunkCenterX: 128, chunkCenterZ: -192,
  chunkSize: 64, microCells: 9, sites, weirdness: 0.7,
};
const a = planInvertedTowerField(args);
const b = planInvertedTowerField(args);
assert.deepEqual(a, b, 'inverted tower field must be deterministic');
assert.equal(a.schema, INVERTED_TOWER_FIELD_SCHEMA);
assert.ok(a.towers.length >= 1 && a.towers.length <= 2, 'field stays sparse and bounded');
assert.equal(a.instanceCount, a.towers.length * 3, 'first-paint tower cost is exactly three box instances per tower');
for (const tower of a.towers) {
  assert.equal(tower.verticalPolarity, -1);
  assert.equal(tower.verticalFrame?.schema, 'jweb.vertical-massing-frame.v1');
  assert.equal(tower.verticalFrame?.verticalPolarity, -1);
  assert.equal(tower.verticalFrame?.anchorY, tower.anchorY);
  assert.equal(tower.sourceSiteCellCount, tower.sourceCells.length);
  assert.ok(tower.sourceSignature.length > 0, 'tower must retain the source compound topology for later upside-down systems');
  assert.ok(tower.tipY >= INVERTED_TOWER_MIN_TIP_Y - 1e-9, 'inverted mass may not descend into street/player volume');
  assert.equal(tower.masses.length, 3);
  for (let i = 1; i < tower.masses.length; i++) {
    assert.ok(tower.masses[i].sx < tower.masses[i - 1].sx);
    assert.ok(tower.masses[i].sz < tower.masses[i - 1].sz);
    assert.ok(tower.masses[i].y < tower.masses[i - 1].y, 'tiers descend from the overhead datum');
  }
  assert.ok(tower.masses.every(m => m.structuralAuthority === 'kowloon-compound'));
}

console.log('[cut14-inverted-tower-massing-selftest] PASS', {
  baselineMean,
  scaledMean,
  volumeScale: BUILDING_VOLUME_SCALE_TARGET,
  towers: a.towers.length,
  instances: a.instanceCount,
  invariant: '4x floorplate-scale authority + deterministic downward macro city with bounded first-paint cost',
});
