import assert from 'node:assert/strict';
import { reconcileCavernFloorBudgets } from '../world/cavern-joint-synthesis.js';
import { planHorizontalGuardSpan } from '../world/guardrail-authority.js';

const CEILING_Y = 136.08;
const FLOOR_H = 3.15;
const bounds = { minX: 0, maxX: 8, minZ: 0, maxZ: 8 };
const tower = (id, score = 0, role = null) => ({
  id, bounds, desiredFloors: 8, minimumFloors: 1, floorHeight: FLOOR_H,
  routeDemandScore: score, routeRole: role,
});

const upright = reconcileCavernFloorBudgets({
  groundPlans: [tower('g:upright', 0.92, 'transfer')],
  ceilingPlans: [tower('c:upright', 0.08, 'endpoint')],
  ceilingY: CEILING_Y, claimMargin: 0, stableKey: 'art:upright',
});
const ug = upright.ground.get('g:upright');
const uc = upright.ceiling.get('c:upright');
assert.equal(upright.overlaps[0].sectionArchetype, 'upright-collector');
assert.ok(ug.floors > ug.desiredFloors, 'upright collector must be able to become a real long reach');
assert.ok(ug.floors > uc.floors * 2, 'collector silhouette must have a dominant polarity');
assert.ok(upright.overlaps[0].residualGap <= 5.5, 'collector pair should occupy the section up to one quantized story of safe clearance');

const hanging = reconcileCavernFloorBudgets({
  groundPlans: [tower('g:hanging', 0.08, 'endpoint')],
  ceilingPlans: [tower('c:hanging', 0.92, 'transfer')],
  ceilingY: CEILING_Y, claimMargin: 0, stableKey: 'art:hanging',
});
const hg = hanging.ground.get('g:hanging');
const hc = hanging.ceiling.get('c:hanging');
assert.equal(hanging.overlaps[0].sectionArchetype, 'hanging-collector');
assert.ok(hc.floors > hc.desiredFloors, 'hanging collector must be able to become a real long reach');
assert.ok(hc.floors > hg.floors * 2);
assert.ok(hanging.overlaps[0].residualGap <= 5.5);

const braid = reconcileCavernFloorBudgets({
  groundPlans: [tower('g:braid', 0.78, 'transfer')],
  ceilingPlans: [tower('c:braid', 0.75, 'transfer')],
  ceilingY: CEILING_Y, claimMargin: 0, stableKey: 'art:braid',
});
const bg = braid.ground.get('g:braid');
const bc = braid.ceiling.get('c:braid');
assert.equal(braid.overlaps[0].sectionArchetype, 'midsection-braid');
assert.ok(bg.floors > bg.desiredFloors && bc.floors > bc.desiredFloors,
  'midsection braid must pull both ordinary masses into the enlarged cavern');
assert.ok(Math.abs(bg.occupiedHeight - bc.occupiedHeight) <= FLOOR_H * 3,
  'braid should meet near the middle rather than letting one polarity accidentally dominate');
assert.ok(braid.overlaps[0].residualGap <= 5.5);

let central = null;
for (let i = 0; i < 512 && !central; i++) {
  const candidate = reconcileCavernFloorBudgets({
    groundPlans: [tower('g:void')], ceilingPlans: [tower('c:void')],
    ceilingY: CEILING_Y, claimMargin: 0, stableKey: `art:void:${i}`,
  });
  if (candidate.overlaps[0]?.sectionArchetype === 'central-void') central = candidate;
}
assert.ok(central, 'fixture must find a deterministic central-void section');
assert.ok(central.overlaps[0].sectionFillRatio <= 0.79,
  'central-void remains a deliberate exception instead of every overlap being forced closed');

const shortGuard = planHorizontalGuardSpan({
  id: 'art:short-guard', x1: 0, z1: 0, x2: 1.5, z2: 0, y: 0,
  family: 'residential-civic-bar',
});
assert.equal(shortGuard.visual.filter(part => part.role === 'post').length, 2,
  'a slightly-over-target short span should read as one clean bay, not two cramped bays');
const civicGuard = planHorizontalGuardSpan({
  id: 'art:civic-guard', x1: 0, z1: 0, x2: 4.8, z2: 0, y: 0,
  family: 'residential-civic-bar',
});
assert.equal(civicGuard.visual.filter(part => part.role === 'post').length, 4,
  '4.8m civic guard should settle into three architectural bays');
assert.ok(civicGuard.collision.thickness > 0 && civicGuard.collision.yMax > civicGuard.collision.yMin,
  'visual rhythm refinement must leave continuous collision authority intact');

console.log('[cavern-section-massing-art-selftest] PASS', {
  upright: { groundFloors: ug.floors, ceilingFloors: uc.floors, residualGap: upright.overlaps[0].residualGap },
  hanging: { groundFloors: hg.floors, ceilingFloors: hc.floors, residualGap: hanging.overlaps[0].residualGap },
  braid: { groundFloors: bg.floors, ceilingFloors: bc.floors, residualGap: braid.overlaps[0].residualGap },
  centralFill: central.overlaps[0].sectionFillRatio,
  shortGuardPosts: shortGuard.visual.filter(part => part.role === 'post').length,
  civicGuardPosts: civicGuard.visual.filter(part => part.role === 'post').length,
});
