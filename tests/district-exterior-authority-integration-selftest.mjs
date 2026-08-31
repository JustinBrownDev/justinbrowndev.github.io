import assert from 'node:assert/strict';
import { compileDistrictBlockComposition, attachDistrictBlockComposition, districtExteriorPolicyForEntity } from '../world/district-block-composition.js';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';

const chunk = {
  worldId: 'jweb.dev/world:v1:seed-d157b10c', key: '6,6', x: 6, z: 6, seed: 0x44aa22cc,
  chunkSize: 64, centerX: 384, centerZ: 384, weirdness: { sampled: 0.55, distanceChunks: 8.48 },
};
const positions = [[-4,-4],[0,-4],[4,-4],[4,0],[4,4],[0,4],[-4,4],[-4,0]];
const families = ['mercantile-public','industrial-service','business','residential-lodging','maintenance-utility','assembly-institutional','storage','mercantile-public'];
const entities = positions.map(([x,z], i) => ({
  id: `district-building:${i}`,
  kind: i === 0 ? 'district-landmark' : 'building',
  x, z, halfX: 1.8, halfZ: 1.6, floors: 3 + (i % 3), floorH: 3.15,
  physicalUse: { family: families[i] },
}));
const payload = { entities, physics: { semanticConnectors: [] } };
const composition = compileDistrictBlockComposition({ chunk, payload });
attachDistrictBlockComposition(payload, composition);

const opportunities = [];
for (let i = 0; i < entities.length; i++) {
  const entityId = entities[i].id;
  const surfaceId = `${entityId}:north`;
  const frame = { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: -1 };
  opportunities.push(
    { id:`${entityId}:spectacle`, role:'facade-spectacle-span', entityId, hostId:entityId, surfaceId, contextId:`${entityId}:ctx`, transform:{x:i*10,y:6,z:-4,rotY:0}, clearanceBudget:{width:7,height:5}, decorationMayIntrude:true, segments:[{surfaceId,side:'north',surfaceFrame:frame,transform:{x:i*10,y:6,z:-4,rotY:0},width:7,height:5}] },
    { id:`${entityId}:sign`, role:'facade-sign-zone', entityId, hostId:entityId, surfaceId, contextId:`${entityId}:ctx`, transform:{x:i*10,y:3,z:-4,rotY:0}, clearanceBudget:{width:4,height:2}, decorationMayIntrude:true, surfaceFrame:frame },
    { id:`${entityId}:service`, role:'facade-service-band', entityId, hostId:entityId, surfaceId:`${surfaceId}:service`, contextId:`${entityId}:ctx`, transform:{x:i*10+2,y:5,z:-4,rotY:0}, clearanceBudget:{width:2.5,height:6}, decorationMayIntrude:true, surfaceFrame:frame },
    { id:`${entityId}:roof`, role:'roof-utility-zone', entityId, hostId:entityId, contextId:`${entityId}:ctx`, transform:{x:i*10,y:10,z:0,rotY:0}, bounds:{x:i*10,y:10,z:0,halfX:3,halfZ:2.5}, clearanceBudget:{width:5.5,depth:4.5,height:3}, decorationMayIntrude:true },
  );
}
payload.semanticContext = {
  districtComposition: composition,
  entities: entities.map(entity => ({ id:`${entity.id}:ctx`, entityId:entity.id })),
  spaces: [], opportunities, spatialTopology:{reservations:[]},
};

const requests = [];
const selectContextAsset = ({ entity, opportunity, request }) => {
  requests.push({ entityId:entity.id, role:opportunity.role, request:{...request} });
  return {
    kind:'semantic-context-prop', entityId:entity.id, assetId:`fixture:${request.semanticFamily}`,
    seed: request.planRequestId.length, exteriorVisualTier:request.priorityTier,
    exteriorVisualImpact: request.desiredScaleClass === 'large' ? 50 : 12,
    topologySolved:true, topologyAccepted:true, topologyDescriptors:[], contextualCosmetic:true,
  };
};
const planFieldRequest = ({ entity, opportunity, request }) => {
  requests.push({ entityId:entity.id, role:opportunity.role, request:{...request} });
  return {
    kind:'exterior-prop-field', entityId:entity.id, seed:request.planRequestId.length,
    exteriorVisualTier:request.priorityTier,
    exteriorVisualImpact:request.priorityTier === 'spectacle' ? 100 : 30,
    fieldPlan:{schema:'fixture',placements:[],stats:{},aggregateStats:{}},
    topologySolved:true,topologyAccepted:true,topologyDescriptors:[],contextualCosmetic:true,exteriorPropField:true,semanticExteriorAuthority:true,
  };
};

const result = compileExteriorCompositionAuthority({ chunk, payload, selectContextAsset, planFieldRequest });
assert.equal(result.stats.singleAuthority, true, 'Exterior Composition Authority must remain the sole population authority');
assert.equal(result.stats.plannerOwnsQuantity, true, 'district layer must not take count ownership');
assert.ok(result.plans.every(plan => plan.districtCompositionId === composition.id), 'exterior plans lost district provenance');

const anchorId = composition.hierarchy.anchorBuildingId;
assert.ok(result.stats.perEntity[anchorId]?.spectacle, 'district anchor did not survive spectacle hierarchy');

const serviceEntity = entities.find(entity => entity.districtComposition?.blockRole === 'service-edge');
assert.ok(serviceEntity, 'fixture lacks a service-edge building');
const servicePolicy = districtExteriorPolicyForEntity(serviceEntity);
const serviceMacroRequest = requests.find(item => item.entityId === serviceEntity.id && item.role === 'facade-service-band' && item.request.priorityTier === 'macro');
assert.ok(serviceMacroRequest, 'service-edge building produced no facade macro request');
assert.equal(serviceMacroRequest.request.semanticFamily, servicePolicy.facadeSemanticFamily, 'Exterior Composition Authority ignored district service/mechanical family hint');

const commercialEntity = entities.find(entity => entity.districtComposition?.blockRole === 'commercial-frontage');
const quietEntity = entities.find(entity => entity.districtComposition?.blockRole === 'quiet-edge');
assert.ok(commercialEntity && quietEntity, 'fixture must contain commercial and quiet contexts');
const commercialPlan = result.plans.find(plan => plan.entityId === commercialEntity.id);
const quietPlan = result.plans.find(plan => plan.entityId === quietEntity.id);
assert.equal(commercialPlan.districtBlockRole, 'commercial-frontage');
assert.equal(quietPlan.districtBlockRole, 'quiet-edge');
assert.notEqual(commercialPlan.districtFrontageCharacter, quietPlan.districtFrontageCharacter, 'frontage character did not reach exterior plan records');

console.log('[district-exterior-authority-integration-selftest] PASS', {
  compositionId: composition.id,
  anchorId,
  serviceEntity: serviceEntity.id,
  serviceMacroFamily: serviceMacroRequest.request.semanticFamily,
  spectacleSelected: result.stats.spectacleSelected,
});
