import assert from 'node:assert/strict';
import { architectureMaterialColor } from '../world/architecture/material-handwriting.js';
import { planFacadeRouteGallery } from '../world/facade-route-gallery.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';

const materialFamily = 'market-frontage-frame';
const module = { key:'main', cx:0, cz:0, halfX:12, halfZ:5, floors:5 };
const gallery = planFacadeRouteGallery({
  id:'21z:gallery', routeId:'local-route', districtRouteId:'district-route:test',
  endpoint:{ id:'ep', resolved:true, side:'south', y:12.6, tangent:0, width:1.4 },
  module, field:'ceiling', width:3.5, widthClass:'sky-street', floorHeight:3.15,
  hostBounds:{minX:-12,maxX:12,minZ:-5,maxZ:5}, footprintModules:[module],
  routeStrength:0.94, routeSpan:150, crossingWidth:1.8, materialFamilyHint:materialFamily,
  stableKey:'21z:gallery',
});
assert.ok(gallery && gallery.length > 20);
assert.equal(gallery.materialFamily, materialFamily);
const galleryExpected = architectureMaterialColor({
  family:materialFamily, materialKind:'metal', field:'ceiling',
  weightScale:1 + Math.max(0, gallery.width - 1.4) * 0.18,
});
assert.ok(gallery.metal.length > 0);
assert.ok([...gallery.metal, ...gallery.supports].every(part => part.color === galleryExpected), 'gallery structure should consume 21Y material handwriting');

const bridge = planSkybridgeArchitecture({
  id:'21z:bridge', axis:'x', from:0, to:8, fixedCoord:0, y:12.6, width:2.1,
  family:'heavy-beam', widthClass:'collector', field:'ceiling', materialFamilyHint:materialFamily,
  stableKey:'21z:bridge', supportModeHint:'hung-from-above',
});
assert.ok(bridge.parts > 0);
assert.equal(bridge.materialFamily, materialFamily);
const bridgeExpected = architectureMaterialColor({
  family:materialFamily, materialKind:'metal', field:'ceiling',
  weightScale:1 + Math.max(0, bridge.width - 1.2) * 0.18,
});
assert.ok(bridge.metal.every(part => part.color === bridgeExpected), 'bridge structure should consume 21Y material handwriting');
assert.equal(bridge.traversalAuthority, 'canonical-transport-slab-unchanged');
console.log('[cut21z-art-route-integration-selftest] PASS', {
  galleryFamily:gallery.architectureFamily,
  materialFamily:gallery.materialFamily,
  galleryLength:gallery.length,
  galleryParts:gallery.metal.length + gallery.supports.length,
  bridgeFamily:bridge.family,
  bridgeParts:bridge.parts,
});
