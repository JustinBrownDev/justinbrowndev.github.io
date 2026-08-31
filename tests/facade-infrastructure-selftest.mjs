import assert from 'node:assert/strict';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const surfaces = [
  { id:'b:a:n', kind:'facade', entityId:'b:a', side:'north', x:0,z:-4,normalX:0,normalZ:-1,rotY:0,half:5,yMin:0,yMax:12.6,exposure:'street' },
  { id:'b:a:e', kind:'facade', entityId:'b:a', side:'east', x:5,z:0,normalX:1,normalZ:0,rotY:-Math.PI/2,half:4,yMin:0,yMax:12.6,exposure:'exterior' },
];
const payload = {
  ownerId:'fixture:facade',
  entities:[{ id:'b:a', kind:'building', x:0,z:0,halfX:5,halfZ:4, footprintModules:[{key:'m',cx:0,cz:0,halfX:5,halfZ:4,floors:4}] }],
  physics:{ props:[] }, detailReservations:[],
  semanticContext:{
    entities:[{ id:'ctx:a', entityId:'b:a', program:'mixed' }], surfaces,
    apertures:[{ id:'door', surfaceId:'b:a:n', traversable:true, uMin:-0.9,uMax:0.9,vMin:0,vMax:2.4 }],
    opportunities:[], spatialTopology:{ reservations:[] },
  },
};
const chunk={ key:'3,-2', seed:0x13572468 };
const a=planExteriorPropField({chunk,payload});
const b=planExteriorPropField({chunk,payload});
assert.deepEqual(a,b,'facade infrastructure must be deterministic');
const infra=a.placements.filter(p=>p.domain==='facade-infrastructure');
assert.ok(infra.length >= 10, `expected obvious facade occupation, got ${infra.length}`);
assert.ok(a.stats.facadeInfrastructure === infra.length);
assert.ok(a.stats.facadeCategoryCount >= 4, `expected category diversity, got ${a.stats.facadeCategoryCount}`);
assert.ok(a.stats.facadeInfrastructure > a.stats.groundEdge, 'wall-visible infrastructure should dominate loose ground-edge junk');
const north=infra.filter(p=>p.surfaceId==='b:a:n');
assert.ok(north.every(p=>Math.abs(p.x) > 1.2),'door aperture must remain a hard horizontal hole');
const bands=new Set(infra.map(p=>Math.floor(p.y/2.2)));
assert.ok(bands.size >= 3, `expected multi-band vertical occupation, got ${[...bands]}`);
assert.ok(a.stats.drawBuckets <= 4,'instant facade richness must remain inside shared instanced draw buckets');
assert.ok(a.stats.visibleFacadePerFacadeMeter > 0.15,'facade-area law should produce a visibly meaningful density');
console.log('PASS facade infrastructure', a.stats);
