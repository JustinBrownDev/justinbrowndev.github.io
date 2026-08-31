import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';
import { planExteriorPropFieldRequest } from '../world/exterior-prop-field.js';
import { selectSemanticContextAsset, semanticContextCatalogStats } from '../world/semantic-context-multiplier.js';
import { SEMANTIC_RUNTIME_PROP_ASSETS } from '../vendor/city-pack/semantic-megapack/runtime-props-v6.js';

const chunk = { key: 'corpus-cutover:0,0', seed: 0x45ab91ef };
const entity = {
    id: 'building:corpus-audit', kind: 'building', program: 'industrial',
    exteriorMacroPreference: { roofSemanticFamily: 'roof-antenna', facadeSemanticFamily: 'vertical-mechanical' },
};
const frame = { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: -1 };
const contextId = `${entity.id}:ctx`;
const opportunities = [
    { id:'sign', role:'facade-sign-zone', entityId:entity.id, hostId:entity.id, surfaceId:'north', contextId, transform:{x:0,y:4,z:-4,rotY:0}, clearanceBudget:{width:5.5,height:2.5,depth:0.7}, decorationMayIntrude:true, surfaceFrame:frame },
    { id:'service', role:'facade-service-band', entityId:entity.id, hostId:entity.id, surfaceId:'north', contextId, transform:{x:2.2,y:5,z:-4,rotY:0}, clearanceBudget:{width:3.2,height:8.5,depth:0.9}, decorationMayIntrude:true, surfaceFrame:frame },
    { id:'roof', role:'roof-utility-zone', entityId:entity.id, hostId:entity.id, contextId, transform:{x:0,y:12,z:0,rotY:0}, bounds:{x:0,y:12,z:0,halfX:4.2,halfZ:3.2}, clearanceBudget:{width:7.2,height:4.5,depth:5.5}, decorationMayIntrude:true },
];
for (let i = 0; i < 28; i++) opportunities.push({
    id:`hardware:${i}`, role:'wall-mounted-prop-zone', entityId:entity.id, hostId:entity.id, surfaceId:'north', contextId,
    transform:{x:-3+(i%7),y:1.8+Math.floor(i/7)*2,z:-4,rotY:0}, clearanceBudget:{width:0.8,height:1.1,depth:0.5}, decorationMayIntrude:true, surfaceFrame:frame,
});
const payload = {
    entities:[entity],
    semanticContext:{ entities:[{id:contextId, entityId:entity.id, program:'industrial'}], spaces:[], opportunities, spatialTopology:{reservations:[]} },
};

const selectContextAsset = ({ opportunity, request, usedAssetIds }) => selectSemanticContextAsset({
    chunk, payload, assets: SEMANTIC_RUNTIME_PROP_ASSETS, opportunity, request, usedAssetIds,
});
const planFieldRequest = ({ opportunity, request }) => {
    const plan = planExteriorPropFieldRequest({ chunk, payload, opportunity, request });
    if (!plan) return null;
    return {
        kind:'exterior-prop-field', entityId:opportunity.entityId, seed:0,
        exteriorVisualTier:request.priorityTier,
        exteriorVisualImpact:Math.max(...plan.placements.map(item => item.visualImpact || 0)),
        fieldPlan:{schema:plan.schema, placements:plan.placements, stats:plan.stats, aggregateStats:plan.stats},
        topologySolved:true, topologyAccepted:true, topologyDescriptors:[], contextualCosmetic:true,
        exteriorPropField:true, semanticExteriorAuthority:true,
    };
};

const result = compileExteriorCompositionAuthority({ chunk, payload, authoredTasks:[], selectContextAsset, planFieldRequest });
const catalog = semanticContextCatalogStats(SEMANTIC_RUNTIME_PROP_ASSETS);
assert.equal(catalog.manifestAssets, 4444, 'audit must exercise the shipped runtime corpus, not a synthetic fixture');
assert.ok(catalog.contextualEligible > 2500, 'substantial existing corpus should remain selectable');
assert.equal(result.stats.plannerOwnsQuantity, true);
assert.ok(result.stats.plannerRequests <= 4, '28 hardware anchors must not become a quantity multiplier');
assert.ok(result.stats.largeMacroAccepted >= 2, 'facade and roof should both receive deliberate coarse-scale features');
const facadeGlb = result.acceptedExteriorTasks.find(task => task.semanticOpportunityRole === 'facade-service-band' && task.assetId);
assert.ok(facadeGlb, 'real corpus must satisfy a deliberate vertical mechanical facade request');
assert.match(facadeGlb.assetId, /(pipe|duct|conduit|riser|vent|exhaust|stack)/i, 'vertical mechanical request must not drift to unrelated wall content');
const roofAntenna = result.acceptedExteriorTasks.find(task => (task.fieldPlan?.placements ?? []).some(item => item.assemblyKind === 'roof-antenna-mast'));
assert.ok(roofAntenna, 'when the real corpus lacks a true antenna, the planner must use its macro antenna fallback');
assert.ok(!result.acceptedExteriorTasks.some(task => /radio_console/i.test(String(task.assetId ?? ''))), 'radio console must never masquerade as a roof antenna');
assert.ok(result.acceptedExteriorTasks.filter(task => task.semanticOpportunityRole === 'wall-mounted-prop-zone').length <= 1, 'hardware grid is an opportunity lattice only');

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const signatureSource = fs.readFileSync(new URL('../world/signature-buildings.js', import.meta.url), 'utf8');
assert.match(mainSource, /exteriorCompositionOwned: true/);
assert.match(mainSource, /roofSemanticFamily: 'roof-antenna'/);
assert.match(engineSource, /exteriorIdentity: structureProfile\?\.exteriorIdentity/);
assert.match(engineSource, /exteriorMacroPreference: structureProfile\?\.exteriorMacroPreference/);
assert.match(signatureSource, /plannerOwnsBuildingExterior/);
assert.equal((signatureSource.match(/\baddSign\(/g) ?? []).length, 2, 'only the helper fallback and the empty future-parcel marker may call raw signage');
assert.match(signatureSource, /if \(!plannerOwnsBuildingExterior\) \{/);
assert.match(signatureSource, /exteriorAuthority: plannerOwnsBuildingExterior \? 'ExteriorCompositionAuthority'/);

console.log('[exterior-real-corpus-cutover-selftest] PASS', {
    assets: catalog.manifestAssets,
    selectable: catalog.contextualEligible,
    plannerRequests: result.stats.plannerRequests,
    accepted: result.stats.accepted,
    facadeAsset: facadeGlb.assetId,
    antennaFallback: true,
});
