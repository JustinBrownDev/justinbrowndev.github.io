import assert from 'node:assert/strict';
import { reconcileCavernFloorBudgets } from '../world/cavern-joint-synthesis.js';

const groundPlans = [];
const ceilingPlans = [];
for (let i = 0; i < 72; i++) {
  const x = i * 20;
  const bounds = { minX: x, maxX: x + 8, minZ: 0, maxZ: 8 };
  groundPlans.push({ id: `g:${i}`, desiredFloors: 10, minimumFloors: 1, floorHeight: 3.15, bounds });
  ceilingPlans.push({ id: `c:${i}`, desiredFloors: 10, minimumFloors: 1, floorHeight: 3.15, bounds });
}
const result = reconcileCavernFloorBudgets({
  groundPlans, ceilingPlans,
  ceilingY: 34.02,
  verticalClearance: 0.72,
  sharedReserve: 1.35,
  claimMargin: 0,
  stableKey: 'cut21q:section-population',
});
const archetypes = new Set(result.overlaps.map(pair => pair.sectionArchetype));
for (const expected of ['upright-collector', 'hanging-collector', 'midsection-braid', 'central-void']) {
  assert.ok(archetypes.has(expected), `population must exercise ${expected}`);
}
const byType = type => result.overlaps.filter(pair => pair.sectionArchetype === type);
assert.ok(byType('upright-collector').some(pair => pair.groundCap > pair.ceilingCap), 'upright collector must preferentially spend section on upright mass');
assert.ok(byType('hanging-collector').some(pair => pair.ceilingCap > pair.groundCap), 'hanging collector must preferentially spend section on hanging mass');
const gapFor = pair => {
  const g = groundPlans.find(plan => plan.id === pair.groundId);
  const c = ceilingPlans.find(plan => plan.id === pair.ceilingId);
  return 34.02 - 0.72 - 1.35 - pair.groundCap * g.floorHeight - pair.ceilingCap * c.floorHeight;
};
const voidGaps = byType('central-void').map(gapFor);
const braidGaps = byType('midsection-braid').map(gapFor);
assert.ok(Math.max(...voidGaps) > Math.max(...braidGaps), 'central void must deliberately preserve more vertical air than balanced braid');
for (const pair of result.overlaps) {
  assert.ok(pair.groundCap >= 1 && pair.ceilingCap >= 1, 'joint synthesis may not erase either polarity');
  assert.ok(pair.groundCap * 3.15 + pair.ceilingCap * 3.15 <= result.usableHeight + 1e-8, 'pair must remain physically inside negotiated cavern budget');
}
console.log('[cut21q-section-archetypes-selftest] PASS', {
  archetypes: Object.fromEntries([...archetypes].map(type => [type, byType(type).length])),
  invariant: 'mixed-polarity massing is sectional and deterministic, not symmetric collision trimming only',
});
