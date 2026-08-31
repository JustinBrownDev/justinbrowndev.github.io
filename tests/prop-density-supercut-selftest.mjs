import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';
import { compileSemanticContextMultiplier, selectSemanticContextAsset } from '../world/semantic-context-multiplier.js';

const assets = [
    { id: 'wall-camera', file: 'props/wall-camera.glb', kind: 'security_camera', semanticClass: 'security-camera', mount: 'wall', collision: 'none', dimensionsXYZ: [0.5, 0.6, 0.15], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
    { id: 'wall-panel', file: 'props/wall-panel.glb', kind: 'electrical_panel', semanticClass: 'electrical-panel', mount: 'wall', collision: 'none', dimensionsXYZ: [0.6, 0.7, 0.12], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
    { id: 'wall-duct', file: 'props/wall-duct.glb', kind: 'vertical_service_duct_riser', semanticClass: 'mechanical-duct', mount: 'wall', collision: 'none', dimensionsXYZ: [1.4, 4.4, 0.35], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
];
const opportunities = Array.from({ length: 32 }, (_, i) => ({
    id: `surface:a:hardware:${i}`, role: 'wall-mounted-prop-zone', entityId: 'building:a', hostId: 'building:a', surfaceId: 'surface:a',
    contextId: 'context:a', decorationMayIntrude: true, shellPriority: i < 8 ? 'first-pass' : 'deepen', layer: i >= 16 ? 'mid' : 'street',
    transform: { x: -3.5 + (i % 8), y: 2 + Math.floor(i / 8) * 2.6, z: 0, rotY: 0 }, clearanceBudget: { width: 1.1, height: 1.4 },
}));
opportunities.unshift(
  {id:'surface:a:sign',role:'facade-sign-zone',entityId:'building:a',hostId:'building:a',surfaceId:'surface:a',contextId:'context:a',decorationMayIntrude:true,transform:{x:0,y:4,z:0,rotY:0},clearanceBudget:{width:5,height:2.4}},
  {id:'surface:a:service',role:'facade-service-band',entityId:'building:a',hostId:'building:a',surfaceId:'surface:a',contextId:'context:a',decorationMayIntrude:true,transform:{x:2,y:5,z:0,rotY:0},clearanceBudget:{width:2.4,height:6}},
);
const payload = {
    entities: [{ id: 'building:a', kind: 'building', program:'office' }],
    semanticContext: { entities: [{ id: 'context:a', entityId: 'building:a', program: 'office' }], spaces: [], surfaces: [{ id: 'surface:a', entityId: 'building:a', half: 4, yMin: 0, yMax: 12.5 }], opportunities },
};
const chunk = { key: '0,0' };
const disabled = compileSemanticContextMultiplier({ chunk, payload, assets });
assert.equal(disabled.tasks.length,0,'32 hardware slots must not cause automatic candidate population');
const explicit = compileSemanticContextMultiplier({
  chunk,payload,assets,
  requests: opportunities.filter(o=>o.role==='wall-mounted-prop-zone').slice(0,2).map(opportunity=>({opportunity,semanticFamily:'security-hardware',desiredScaleClass:'medium',priorityTier:'medium'})),
});
assert.ok(explicit.tasks.length<=2,'the selector realizes only the quantity requested by the planner');

const authoredSign = { kind: 'sign', entityId: 'building:a', seed: 1, width: 3.2, height: 1.1, firstPassBundle: true, firstPassClass: 'facade' };
const composition = compileExteriorCompositionAuthority({
    chunk, payload, authoredTasks: [authoredSign],
    selectContextAsset: ({opportunity,request,usedAssetIds})=>selectSemanticContextAsset({chunk,payload,assets,opportunity,request,usedAssetIds}),
});
const acceptedForBuilding = composition.acceptedExteriorTasks.filter(task => task.entityId === 'building:a');
const acceptedHardware = acceptedForBuilding.filter(task => task.semanticOpportunityRole === 'wall-mounted-prop-zone');
assert.ok(acceptedForBuilding.length <= 7);
assert.ok(acceptedHardware.length <= 1,'hardware lattice is sampled once as refinement, never treated as density');
assert.equal(acceptedForBuilding.filter(task => task.firstPassBundle).length, 1);
assert.ok(acceptedForBuilding.some(task=>task.kind==='sign'),'readable authored signage should survive candidate convergence');
assert.ok(acceptedForBuilding.some(task=>task.assetId==='wall-duct'),'large service request should outrank tiny easy hardware');
assert.equal(composition.stats.plannerOwnsQuantity,true);

const semanticSource = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
const exteriorSource = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
const authoritySource = fs.readFileSync(new URL('../world/exterior-composition-authority.js', import.meta.url), 'utf8');
assert.match(semanticSource, /hardware-grid/);
assert.match(semanticSource, /exteriorPlacementDeferred/);
assert.match(authoritySource, /opportunityGridIsCandidateOnly/);
assert.match(authoritySource, /plannerOwnsQuantity/);
assert.match(exteriorSource, /plannerRequestOnly/);
assert.match(exteriorSource, /createMediaTexture/);

const enrichmentPath = new URL('../world/kowloon-fabric-enrichment.js', import.meta.url);
const enrichmentSource = fs.readFileSync(enrichmentPath, 'utf8');
assert.match(enrichmentSource, /compileExteriorCompositionAuthority/);
assert.match(enrichmentSource, /selectSemanticContextAsset/);
assert.match(enrichmentSource, /planRequestTask/);
assert.doesNotMatch(enrichmentSource, /compileSemanticContextMultiplier/,'runtime must not invoke the retired batch population path');
assert.doesNotMatch(enrichmentSource, /exteriorPropField\.planTasks/,'runtime must not sweep the primitive field after planning');
assert.doesNotMatch(enrichmentSource, /earlyWallByEntity/);
assert.doesNotMatch(enrichmentSource, /spectacleFieldTasks/);
assert.doesNotMatch(enrichmentSource, /coveredEntities/);
console.log('PASS facade opportunity/authority cutover', {accepted:acceptedForBuilding.length,hardwareAccepted:acceptedHardware.length,plannerRequests:composition.stats.plannerRequests});
