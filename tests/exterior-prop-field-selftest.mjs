import assert from 'node:assert/strict';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const northSurface = {
  id: 'building:a:surface:north', kind: 'facade', entityId: 'building:a', side: 'north',
  x: 0, z: -3, normalX: 0, normalZ: -1, rotY: 0, half: 4, yMin: 0, yMax: 9.45, exposure: 'street',
};
const southSurface = {
  id: 'building:a:surface:south', kind: 'facade', entityId: 'building:a', side: 'south',
  x: 0, z: 3, normalX: 0, normalZ: 1, rotY: Math.PI, half: 4, yMin: 0, yMax: 9.45, exposure: 'exterior',
};
const westSurface = {
  id: 'building:b:surface:west', kind: 'facade', entityId: 'building:b', side: 'west',
  x: 8, z: 0, normalX: -1, normalZ: 0, rotY: Math.PI * 0.5, half: 3, yMin: 0, yMax: 6.3, exposure: 'exterior',
};
const circulation = {
  id: 'stairs:a:approach', kind: 'stair-approach', x: 2.25, z: -3.6,
  halfX: 0.62, halfZ: 0.72, minX: 1.63, maxX: 2.87, minZ: -4.32, maxZ: -2.88,
  yMin: 0, yMax: 2.4,
};
const entities = [
  { id: 'building:a', kind: 'building', x: 0, z: 0, halfX: 4, halfZ: 3,
    footprintModules: [{ key: 'a0', cx: 0, cz: 0, halfX: 4, halfZ: 3, floors: 3 }] },
  { id: 'building:b', kind: 'building', x: 10, z: 0, halfX: 2, halfZ: 3,
    footprintModules: [{ key: 'b0', cx: 10, cz: 0, halfX: 2, halfZ: 3, floors: 2 }] },
];
const contexts = [
  { id: 'ctx:a', entityId: 'building:a', program: 'commercial', physicalUseFamily: 'mercantile-public' },
  { id: 'ctx:b', entityId: 'building:b', program: 'industrial', physicalUseFamily: 'industrial-service' },
];
const roofs = [
  { id: 'roof:a', role: 'roof-utility-zone', entityId: 'building:a', bounds: { x: 0, z: 0, halfX: 3.65, halfZ: 2.65, y: 9.45 } },
  { id: 'roof:b', role: 'roof-utility-zone', entityId: 'building:b', bounds: { x: 10, z: 0, halfX: 1.65, halfZ: 2.65, y: 6.3 } },
];
const chunk = { key: '0,0', seed: 0x1234abcd };

function payloadFor(ids, withReservation = false) {
  const wanted = new Set(ids);
  return {
    ownerId: `fixture:${ids.join('+')}`,
    entities: entities.filter(e => wanted.has(e.id)),
    physics: { props: [
      ...(wanted.has('building:a') ? [{ x: -1.4, z: 0.7, radius: 0.82, yMin: 9.45, height: 10.55, supportKind: 'rooftop-mechanical' }] : []),
      ...(wanted.has('building:b') ? [{ x: 10.3, z: 0.6, radius: 0.68, yMin: 6.3, height: 7.25, supportKind: 'rooftop-mechanical' }] : []),
    ] },
    detailReservations: [],
    semanticContext: {
      entities: contexts.filter(c => wanted.has(c.entityId)),
      surfaces: [northSurface, southSurface, westSurface].filter(s => wanted.has(s.entityId)),
      apertures: wanted.has('building:a') ? [{ id: 'door:a', surfaceId: northSurface.id, traversable: true, uMin: -0.78, uMax: 0.78 }] : [],
      opportunities: roofs.filter(r => wanted.has(r.entityId)),
      spatialTopology: { reservations: withReservation ? [circulation] : [] },
    },
  };
}

const first = planExteriorPropField({ chunk, payload: payloadFor(['building:a','building:b'], true) });
const second = planExteriorPropField({ chunk, payload: payloadFor(['building:a','building:b'], true) });
assert.deepEqual(second, first, 'micro-clutter planning must remain deterministic');
assert.equal(first.stats.physicalDensityNormalized, true);
assert.ok(first.stats.generated > 0, 'micro-clutter should still exist');
assert.ok(first.stats.microClutter < 30, `micro-clutter must be seasoning, not an avalanche: ${first.stats.microClutter}`);
assert.ok(first.stats.macroAssemblies >= 2, `large facade assemblies plus structural-roof detailing should now be present: ${first.stats.macroAssemblies}`);
assert.ok(first.stats.macroPrimitives > first.stats.microClutter, 'macro infrastructure should carry more visual mass than loose micro clutter');
assert.ok(first.stats.roofMechanicalAssemblies >= 1, 'existing collidable rooftop mechanical hosts should receive recognizable mechanical detailing');
assert.ok(first.placements.filter(p => p.domain === 'roof-mechanical-detail').every(p => p.hostSupportKind === 'rooftop-mechanical'), 'large roof detailing must derive from structural rooftop-mechanical hosts');
assert.ok(first.stats.groundPerFacadeMeter <= 0.35, `ground clutter is too dense per facade meter: ${first.stats.groundPerFacadeMeter}`);
assert.ok(first.stats.drawBuckets <= 4, 'cheap micro-clutter must stay in the four shared draw buckets');
assert.ok(first.placements.filter(p => p.domain === 'ground-edge-micro').every(p => p.y <= 0.35), 'the junk field must not pretend to be wall mounting');
const north = first.placements.filter(p => p.surfaceId === northSurface.id);
assert.ok(north.every(p => Math.abs(p.x) > 1.38), 'traversable entrance must remain a generous hard hole');

// Ownership-parity regression: representing the same physical facades as one
// chunk payload or two authored site payloads must not multiply density.
const combined = planExteriorPropField({ chunk, payload: payloadFor(['building:a','building:b']) });
const splitA = planExteriorPropField({ chunk, payload: payloadFor(['building:a']) });
const splitB = planExteriorPropField({ chunk, payload: payloadFor(['building:b']) });
assert.equal(splitA.stats.groundEdge + splitB.stats.groundEdge, combined.stats.groundEdge, 'ground density must be additive by facade meters, not payload count');
assert.equal(splitA.stats.roofEdge + splitB.stats.roofEdge, combined.stats.roofEdge, 'roof micro-clutter must be additive by roof perimeter, not payload count');
assert.equal(splitA.stats.macroAssemblies + splitB.stats.macroAssemblies, combined.stats.macroAssemblies, 'macro assembly density must be owned by physical surfaces/opportunities, not payload count');
assert.equal(splitA.stats.macroPrimitives + splitB.stats.macroPrimitives, combined.stats.macroPrimitives, 'macro primitive count must remain additive across ownership splits');

console.log('PASS exterior prop micro-field', first.stats);
