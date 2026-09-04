import assert from 'node:assert/strict';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import { planStructuralFeasibility } from '../world/architecture/structural-feasibility.js';

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const truth = { stair: {
  widthSI: 1.10, landingDepthSI: 1.35, headroomSI: 2.05,
  riser: { realizedSI: 0.17 }, tread: { realizedSI: 0.29, sourceMinimum: { canonicalSI: 0.25 } },
} };
let accepted = 0, rejected = 0, replanned = 0;
for (let seed = 1; seed <= 250; seed++) {
  const rand = rng32(seed * 0x9e3779b1);
  const cell = 4.2 + rand() * 2.4;
  const cols = 1 + Math.floor(rand() * 3);
  const rows = 1 + Math.floor(rand() * 2);
  const modules = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    if (col + row > 0 && rand() < 0.18) continue;
    modules.push({
      key: `${col},${row}`, cell: { col, row }, floors: 2 + Math.floor(rand() * 5),
      rect: { cx: col * cell, cz: row * cell, halfX: cell * 0.5, halfZ: cell * 0.5 },
    });
  }
  if (!modules.length) continue;
  const primary = modules.reduce((best, item) => item.floors > best.floors ? item : best, modules[0]);
  const result = planStructuralFeasibility({
    modulePlans: modules, primaryModule: primary, floorH: 2.8 + rand() * 3.2,
    physicalTruth: truth, traversalEnvelope: { playerRadius: 0.22 }, stableKey: `property:${seed}`,
    planStairCore: planInteriorSwitchbackStairCore,
  });
  if (!result.accepted) { rejected++; continue; }
  accepted++;
  if (result.replanned) replanned++;
  assert.ok(result.core.flightCount === 2 || result.core.flightCount === 4, `${seed}: no >4-flight workaround`);
  assert.equal(result.claims.structural.reservedBeforeCommit, true);
  assert.ok(result.circulation.floorOpenings.length > 0);
  assert.ok(result.circulation.headroomVolumes.length > 0);
  assert.ok(result.consumedModuleKeys.length >= 1);
}
assert.ok(accepted > 0, 'property corpus must contain legal structural proposals');
assert.ok(replanned > 0, 'property corpus must exercise architecture replanning');
console.log('[structural-feasibility-property-selftest] PASS', { accepted, rejected, replanned, seeds: 250 });
