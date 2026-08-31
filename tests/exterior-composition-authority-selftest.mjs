import assert from 'node:assert/strict';
import { attachSpectacleMedia, compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';
import { selectSemanticContextAsset } from '../world/semantic-context-multiplier.js';
import { planExteriorPropFieldRequest } from '../world/exterior-prop-field.js';

const entities = Array.from({ length: 10 }, (_, index) => ({
    id: `building:${index}`,
    kind: index === 0 ? 'district-landmark' : 'building',
    program: index % 2 ? 'commercial' : 'industrial',
}));
const opportunities = [];
for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].id;
    const contextId = `${entityId}:ctx`;
    const surfaceId = `${entityId}:north`;
    const frame = { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: -1 };
    opportunities.push(
        { id:`${entityId}:sign`, role:'facade-sign-zone', entityId, hostId:entityId, surfaceId, contextId, transform:{x:i*12,y:4,z:-4,rotY:0}, clearanceBudget:{width:5.2,height:2.8}, decorationMayIntrude:true, surfaceFrame:frame },
        { id:`${entityId}:service`, role:'facade-service-band', entityId, hostId:entityId, surfaceId, contextId, transform:{x:i*12+2.2,y:5,z:-4,rotY:0}, clearanceBudget:{width:2.8,height:7}, decorationMayIntrude:true, surfaceFrame:frame },
        { id:`${entityId}:roof`, role:'roof-utility-zone', entityId, hostId:entityId, contextId, transform:{x:i*12,y:11,z:0,rotY:0}, bounds:{x:i*12,y:11,z:0,halfX:3.6,halfZ:2.8}, clearanceBudget:{width:6.4,depth:4.8,height:3.2}, decorationMayIntrude:true },
    );
    for (let slot = 0; slot < 28; slot++) opportunities.push({
        id:`${entityId}:hardware:${slot}`, role:'wall-mounted-prop-zone', entityId, hostId:entityId, surfaceId, contextId,
        transform:{x:i*12-3+(slot%7),y:2+Math.floor(slot/7)*2.3,z:-4,rotY:0}, clearanceBudget:{width:0.9,height:1.2}, decorationMayIntrude:true, surfaceFrame:frame,
    });
    if (i < 8) opportunities.push({
        id:`${entityId}:spectacle`, role:'facade-spectacle-span', entityId, hostId:entityId, contextId,
        transform:{x:i*12,y:6,z:-4,rotY:0}, clearanceBudget:{width:7.2,height:4.8}, decorationMayIntrude:true,
        segments:[{ surfaceId, side:'north', surfaceFrame:frame, transform:{x:i*12,y:8.4,z:-4,rotY:0}, width:7.2,height:4.8 }],
    });
}
const payload = {
    entities,
    semanticContext: {
        entities: entities.map(entity => ({ id:`${entity.id}:ctx`, entityId:entity.id, program:entity.program })),
        spaces: [], opportunities, spatialTopology:{reservations:[]},
    },
};
const chunk = { key: '0,0', seed: 0x12345678 };

const authoredTasks = [];
for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].id;
    authoredTasks.push({ kind: 'sign', entityId, seed: i, width: 3.4, height: 1.1, title:`BUILDING ${i}`, firstPassBundle: true, firstPassClass: 'facade' });
    authoredTasks.push({ kind: 'awning', entityId, seed: 100 + i, width: 2.4, depth: 1.0 });
    authoredTasks.push({ kind: 'pipe', entityId, seed: 200 + i, height: 4.5 });
}
const unrelated = { kind: 'semantic-life', entityId: 'building:0', seed: 9999, semanticPlacement:{x:0,y:0,z:0} };
authoredTasks.push(unrelated);

const assets = [
    { id:'large-duct-riser',file:'duct.glb',kind:'vertical_service_duct_riser',semanticClass:'mechanical.duct_riser',mount:'wall',collision:'none',dimensionsXYZ:[1.7,5.5,0.4],programs:['industrial','commercial'],semanticGraph:{roles:['semantic-prop']} },
    { id:'large-hvac-bank',file:'hvac.glb',kind:'hvac_condenser_bank',semanticClass:'mechanical.hvac',mount:'roof',collision:'none',dimensionsXYZ:[3.0,1.5,2.3],programs:['industrial','commercial'],semanticGraph:{roles:['semantic-prop']} },
    { id:'security-camera',file:'cam.glb',kind:'security_camera',semanticClass:'security.camera',mount:'wall',collision:'none',dimensionsXYZ:[0.42,0.34,0.24],programs:['industrial','commercial'],semanticGraph:{roles:['semantic-prop']} },
];

const selectContextAsset = ({ opportunity, request, usedAssetIds }) => selectSemanticContextAsset({ chunk, payload, assets, opportunity, request, usedAssetIds });
const planFieldRequest = ({ opportunity, request }) => {
    const plan = planExteriorPropFieldRequest({ chunk, payload, opportunity, request });
    if (!plan) return null;
    return {
        kind:'exterior-prop-field', entityId:opportunity.entityId, seed:0,
        exteriorVisualTier:request.priorityTier,
        exteriorVisualImpact:Math.max(...plan.placements.map(item=>item.visualImpact||0)),
        fieldPlan:{schema:plan.schema,placements:plan.placements,stats:plan.stats,aggregateStats:plan.stats},
        topologySolved:true,topologyAccepted:true,topologyDescriptors:[],contextualCosmetic:true,exteriorPropField:true,semanticExteriorAuthority:true,
    };
};

const result = compileExteriorCompositionAuthority({ chunk, payload, authoredTasks, selectContextAsset, planFieldRequest });
assert.equal(result.stats.singleAuthority, true);
assert.equal(result.stats.plannerOwnsQuantity, true);
assert.equal(result.stats.opportunityGridIsCandidateOnly, true);
assert.equal(result.stats.buildingsManaged, 10);
assert.equal(result.stats.buildingsWithComposition, 10);
assert.equal(result.stats.spectacleEligible, 8);
assert.ok(result.stats.spectacleSelected >= 2 && result.stats.spectacleSelected <= 4);
assert.ok(result.tasks.includes(unrelated), 'non-exterior semantic work must remain untouched');
assert.ok(result.stats.largeMacroAccepted >= 10, 'nearby buildings should deliberately receive large/macro requests');
assert.ok(result.stats.plannerRequests < 10 * 8, '28 hardware slots per building must not amplify planner quantity');
assert.ok(result.stats.maxAcceptedPerEntity <= 7, 'no building may receive an unbounded facade lattice');

for (const entity of entities) {
    const accepted = result.acceptedExteriorTasks.filter(task => task.entityId === entity.id);
    assert.ok(accepted.length >= 1, `${entity.id} needs a visible composition anchor`);
    assert.equal(accepted.filter(task => task.firstPassBundle).length, 1, `${entity.id} must have exactly one exterior first-pass anchor`);
    assert.ok(accepted.every(task => task.exteriorPlanOwner && task.exteriorReservationOwner), 'every admitted building exterior must explain plan/reservation ownership');
    assert.ok(accepted.filter(task => task.semanticOpportunityRole === 'wall-mounted-prop-zone').length <= 1, 'hardware lattice must be sampled, never consumed as density');
    assert.ok(accepted.some(task => ['large','macro','spectacle'].includes(task.exteriorRequest?.desiredScaleClass)), 'each building should contain deliberate coarse-scale exterior composition');
    const spectacle = accepted.find(task => task.exteriorVisualTier === 'spectacle');
    if (spectacle) assert.equal(spectacle.firstPassBundle, true, 'selected spectacle should become the building coverage anchor');
}

assert.ok(result.acceptedExteriorTasks.some(task => task.kind === 'sign'), 'real authored readable signage must survive composition');
assert.ok(result.acceptedExteriorTasks.some(task => task.assetId === 'large-duct-riser'), 'deliberate macro facade requests must reach existing large corpus assets');
assert.ok(result.acceptedExteriorTasks.some(task => task.assetId === 'large-hvac-bank'), 'deliberate roof macro requests must reach existing HVAC assets');

const mediaTarget = result.acceptedExteriorTasks.find(task => task.exteriorVisualTier === 'spectacle');
assert.ok(mediaTarget, 'fixture should retain at least one spectacle task');
const media = attachSpectacleMedia({ chunk, tasks: result.acceptedExteriorTasks, pairFor: () => ['FERROUS MEMORY', 'AUTHORIZED EXCHANGE'] });
assert.ok(media.assemblies >= 1 && media.surfaces >= 1);
const screenPanels = result.acceptedExteriorTasks.flatMap(task => task.fieldPlan?.placements ?? []).filter(item => item.shape === 'box' && /megascreen/i.test(String(item.assemblyKind ?? '')));
assert.ok(screenPanels.every(item => item.media?.title === 'FERROUS MEMORY'));
console.log('[exterior-composition-authority-selftest] PASS', result.stats);
