import assert from 'node:assert/strict';
import { planKowloonSingletonShoulders } from '../world/kowloon-structure.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';
import { guardProfile, planHorizontalGuardSpan } from '../world/guardrail-authority.js';

// Keep one-cell parcels in topology/circulation, but give any multi-storey
// survivor real upper occupied mass so it cannot read as a facaded stair chimney.
const singletonSite = { id: 7, cells: [{ col: 0, row: 0 }] };
const rect = { cx: 0, cz: 0, halfX: 2.2, halfZ: 2.0 };
const module = { key: '0,0', floors: 6, rect };
const faces = [
  { module, dir: { key: 'N', side: 'north' } },
  { module, dir: { key: 'S', side: 'south' } },
  { module, dir: { key: 'E', side: 'east' } },
  { module, dir: { key: 'W', side: 'west' } },
];
const reservedSingletonOpenings = new Set(['0,0:N:1']);
const shoulders = planKowloonSingletonShoulders({
  site: singletonSite, faces, floorH: 3.15,
  blockedOpeningKeys: reservedSingletonOpenings,
});
assert.ok(shoulders.length >= 2, 'multi-storey singleton needs several occupied shoulders');
assert.ok(shoulders.every(item => item.singletonShoulder === true && item.level >= 1));
assert.ok(shoulders.every(item => item.width >= 1.5 && item.depth >= 0.82));
assert.ok(!shoulders.some(item => item.openingKey === '0,0:N:1'),
  'forced occupied mass may not steal a reserved bridge/service opening');
assert.deepEqual([...reservedSingletonOpenings], ['0,0:N:1'],
  'singleton shoulder planning must not mutate caller-owned aperture authority');
assert.deepEqual(planKowloonSingletonShoulders({ site: { id: 8, cells: [{}, {}] }, faces, floorH: 3.15 }), [],
  'ordinary multi-cell buildings keep their existing randomized accretion language');

// A hanging bridge is one complete structural idea: quiet edge beams plus its
// own catenary. It must not stack a requested girder/truss and generic facade
// support braces underneath the suspension system.
const hanging = planSkybridgeArchitecture({
  id: 'professor:hanging', axis: 'x', from: -8, to: 10, fixedCoord: 2, y: 12,
  width: 2.2, widthClass: 'collector', family: 'box-girder', variant: 'hanging-bridge',
  stableKey: 'professor-art-pass', supportModeHint: 'hung-from-above',
});
assert.equal(hanging.requestedFamily, 'box-girder');
assert.equal(hanging.family, 'suspension-hanger',
  'hanging variant must own the realized architecture family');
assert.equal(hanging.structuralGrammar, 'suspended-catenary-v1');
assert.equal(hanging.supportParts, 0,
  'hanging catenary must not receive a second generic facade-brace support system');
assert.equal(hanging.supportMode, null);
assert.ok(hanging.variantParts > 0, 'hanging bridge must retain its real catenary/hanger structure');
assert.ok(hanging.metal.some(part => part.architectureRole === 'hanging-suspension-cable'));
assert.ok(hanging.metal.every(part => part.architectureFamily === 'suspension-hanger'));
assert.ok(!hanging.metal.some(part => part.architectureRole === 'box-girder-side'),
  'requested box-girder grammar must not remain underneath the suspension system');

// Visual post rhythm is intentionally coarser while collision remains a solid
// guard span. This is an art-density change, not a safety/collision change.
const fire = guardProfile('fire-escape-pipe');
const civic = guardProfile('residential-civic-bar');
assert.ok(fire.postSpacing >= 1.45, 'fire-escape guard posts should not read as a picket fence');
assert.ok(civic.postSpacing >= 1.30, 'civic/residential guard posts should have a legible macro rhythm');
const civicSpan = planHorizontalGuardSpan({ id: 'professor:civic-span', x1: 0, z1: 0, x2: 4.8, z2: 0, y: 3, family: 'residential-civic-bar' });
assert.ok(civicSpan.visual.filter(part => part.role === 'post').length <= 5,
  'a 4.8m civic guard should no longer become dense toothpick chatter');
assert.ok(civicSpan.collision.thickness > 0 && civicSpan.collision.yMax > civicSpan.collision.yMin,
  'visual simplification must leave continuous collision authority intact');

console.log('[professor-art-pass-selftest] PASS', {
  singletonShoulders: shoulders.length,
  singletonShoulderLevels: shoulders.map(item => item.level),
  hangingFamily: hanging.family,
  hangingParts: hanging.parts,
  hangingVariantParts: hanging.variantParts,
  hangingSupportParts: hanging.supportParts,
  firePostSpacing: fire.postSpacing,
  civicPostSpacing: civic.postSpacing,
  civicSpanPosts: civicSpan.visual.filter(part => part.role === 'post').length,
});
