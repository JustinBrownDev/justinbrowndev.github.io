import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const payload = {
  ownerId: 'chunk:0,0',
  entities: [
    { id: 'building:a', kind: 'building', x: 0, z: 0, halfX: 4, halfZ: 3,
      footprintModules: [{ key: 'a0', cx: 0, cz: 0, halfX: 4, halfZ: 3, floors: 3 }] },
    { id: 'building:b', kind: 'building', x: 10, z: 0, halfX: 2, halfZ: 3,
      footprintModules: [{ key: 'b0', cx: 10, cz: 0, halfX: 2, halfZ: 3, floors: 2 }] },
    { id: 'court:a', kind: 'courtyard', x: 0, z: 11, halfX: 3.5, halfZ: 2.8 },
  ],
  physics: { props: [{ x: -2.4, z: -3.45, radius: 0.5, yMin: 0, height: 1.1 }] },
  detailReservations: [],
  semanticContext: {
    entities: [
      { id: 'ctx:a', entityId: 'building:a', program: 'commercial', physicalUseFamily: 'mercantile-public' },
      { id: 'ctx:b', entityId: 'building:b', program: 'industrial', physicalUseFamily: 'industrial-service' },
    ],
    surfaces: [northSurface, southSurface, westSurface],
    apertures: [
      { id: 'door:a', surfaceId: northSurface.id, traversable: true, uMin: -0.78, uMax: 0.78 },
    ],
    opportunities: [
      { id: 'roof:a', role: 'roof-utility-zone', bounds: { x: 0, z: 0, halfX: 3.65, halfZ: 2.65, y: 9.45 } },
      { id: 'roof:b', role: 'roof-utility-zone', bounds: { x: 10, z: 0, halfX: 1.65, halfZ: 2.65, y: 6.3 } },
    ],
    spatialTopology: { reservations: [circulation] },
  },
};

const chunk = { key: '0,0', seed: 0x1234abcd };
const first = planExteriorPropField({ chunk, payload });
const second = planExteriorPropField({ chunk, payload });
assert.deepEqual(second, first, 'field planning must be deterministic for a chunk');
assert.ok(first.stats.generated >= 45, `expected an aggressive field, got ${first.stats.generated}`);
assert.ok(first.stats.wallBand >= 20, 'wall strips should dominate the field');
assert.ok(first.stats.courtyardEdge >= 8, 'courtyard edges should be populated');
assert.ok(first.stats.roofEdge >= 6, 'roof edges should be populated');
assert.ok(first.stats.drawBuckets > 0 && first.stats.drawBuckets <= 4, 'all mass clutter must collapse into <=4 shape draw buckets');
assert.ok(first.stats.instancesPerDrawBucket >= 10, 'density should greatly exceed draw-call growth');

const north = first.placements.filter(p => p.surfaceId === northSurface.id);
assert.ok(north.length >= 2, 'north facade should retain clutter outside door/circulation holes');
assert.ok(north.every(p => Math.abs(p.x) > 1.38), 'traversable entrance must carve a generous hole in the wall band');

function intersects(reservation, p, padding = 0) {
  const hx = p.sx * 0.5, hz = p.sz * 0.5;
  return p.y < reservation.yMax && p.y + p.sy > reservation.yMin
    && p.x + hx > reservation.minX - padding && p.x - hx < reservation.maxX + padding
    && p.z + hz > reservation.minZ - padding && p.z - hz < reservation.maxZ + padding;
}
assert.ok(first.placements.every(p => !intersects(circulation, p, 0.15)), 'circulation reservations must remain hard holes');

const sourcePath = new URL('../world/kowloon-fabric-enrichment.js', import.meta.url);
if (fs.existsSync(sourcePath)) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /createExteriorPropFieldSystem/);
  assert.match(source, /exteriorPropField\.planTask\(chunk, payload\)/);
  assert.match(source, /task\.kind === 'exterior-prop-field'/);
  assert.match(source, /exteriorPropField\.disposeShared\(\)/);
}

console.log('PASS exterior prop field', first.stats);
