import assert from 'node:assert/strict';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';

const families = ['simple-guarded', 'heavy-beam', 'utility-frame', 'covered-gallery', 'pony-truss', 'through-truss', 'underslung-arch'];
const counts = new Map();
for (const family of families) {
  const plan = planSkybridgeArchitecture({
    id: `bridge:${family}`, axis: 'x', from: -9, to: 11, fixedCoord: 2, y: 16.2,
    width: family === 'through-truss' ? 3.6 : 1.9,
    widthClass: family === 'through-truss' ? 'sky-street' : 'collector',
    family, stableKey: 'cut21q',
  });
  assert.equal(plan.traversalAuthority, 'canonical-transport-slab-unchanged', `${family}: visuals may not replace walking authority`);
  assert.ok(plan.parts >= 2, `${family}: family must emit visible structure`);
  assert.ok(plan.metal.length + plan.concrete.length === plan.parts);
  assert.ok([...plan.metal, ...plan.concrete].every(part => part.bridgeArchitecture === true && part.architectureFamily === family));
  counts.set(family, plan.parts);
}
assert.ok(counts.get('through-truss') > counts.get('simple-guarded'), 'major sky street should be materially more architecturally legible than a local bridge');
assert.ok(counts.get('underslung-arch') >= 10, 'arch family should be a real large-form structure, not a label');
console.log('[cut21q-skybridge-architecture-selftest] PASS', Object.fromEntries(counts));
