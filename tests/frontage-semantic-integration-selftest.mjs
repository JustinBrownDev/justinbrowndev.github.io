import assert from 'node:assert/strict';
import { bindFrontageSemanticTruth } from '../world/frontage-semantic-binding.js';
import {
    attachSpectacleMedia,
    compileExteriorCompositionAuthority,
} from '../world/exterior-composition-authority.js';

const entity = {
    id: 'building:integration',
    kind: 'district-landmark',
    archetype: 'market-hall',
    physicalUse: { family: 'mercantile-public' },
    buildingPlan: {
        deterministicKey: 'plan:integration',
        fingerprint: 'fp-integration',
        topologySpaces: [{
            id: 'space:shop', entityId: 'building:integration', floor: 0, yBase: 0, floorH: 3.2,
            role: 'public', spaceType: 'shop-floor', semanticProgram: 'retail', privacy: 'public',
            moduleKeys: ['main'], connectorIds: [],
            bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4, yMin: 0, yMax: 3.2 },
            regions: [{ minX: -5, maxX: 5, minZ: -4, maxZ: 4 }],
        }],
    },
};
const surfaces = [
    { id: 'surface:north', entityId: entity.id, moduleKey: 'main', side: 'north', x: 0, z: -4, normalX: 0, normalZ: -1, yMin: 0, yMax: 8, half: 5, exposure: 'street' },
    { id: 'surface:west', entityId: entity.id, moduleKey: 'main', side: 'west', x: -5, z: 0, normalX: -1, normalZ: 0, yMin: 0, yMax: 8, half: 4, exposure: 'street' },
];
const opportunities = [
    {
        id: 'opp:corner', role: 'corner-media-band', entityId: entity.id,
        transform: { x: -4.8, y: 2.6, z: -3.8 }, clearanceBudget: { width: 8, height: 3, depth: 0.4 },
        segments: [
            { surfaceId: 'surface:north', side: 'north', width: 4, height: 3, transform: { x: -3, y: 2.6, z: -4.05 }, surfaceFrame: { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: -1 } },
            { surfaceId: 'surface:west', side: 'west', width: 4, height: 3, transform: { x: -5.05, y: 2.6, z: -2.5 }, surfaceFrame: { tangentX: 0, tangentZ: 1, normalX: -1, normalZ: 0 } },
        ],
        spectacleImpact: 100,
        decorationMayIntrude: true,
    },
    { id: 'opp:sign', role: 'facade-sign-zone', entityId: entity.id, surfaceId: 'surface:north', u: 1.2, transform: { x: 1.2, y: 2.3, z: -4.04 }, clearanceBudget: { width: 3.2, height: 1.5 }, decorationMayIntrude: true },
    { id: 'opp:service', role: 'facade-service-band', entityId: entity.id, surfaceId: 'surface:west', u: 1.0, transform: { x: -5.04, y: 2.2, z: 1.0 }, clearanceBudget: { width: 2.5, height: 2.0 }, decorationMayIntrude: true },
];
const payload = {
    entities: [entity],
    semanticSpaces: [],
    semanticContext: { surfaces, apertures: [], opportunities },
};
const district = { id: 'district:integration', family: 'market', chunkKey: 'integration' };
bindFrontageSemanticTruth({ payload, district, surfaces, apertures: [], opportunities, destinations: [{ id: 'space:shop:destination', spaceId: 'space:shop', program: 'retail' }] });

const makeFieldTask = ({ opportunity, request }) => {
    if (request.priorityTier === 'identity') {
        return { kind: 'sign', entityId: entity.id, seed: 77, title: 'GENERIC', subtitle: 'GENERIC', exteriorVisualTier: 'identity' };
    }
    const placements = request.priorityTier === 'spectacle'
        ? opportunity.segments.map((segment, index) => ({
            shape: 'box', sx: 4, sy: 2.4, sz: 0.16,
            x: segment.transform.x, y: segment.transform.y, z: segment.transform.z, rotY: 0,
            assemblyId: 'integration:corner:megascreen', assemblyKind: 'corner-megascreen',
            surfaceId: segment.surfaceId, semanticOpportunityId: opportunity.id,
            visualTier: 'spectacle', visualImpact: 100 - index,
        }))
        : [{
            shape: 'box', sx: 2, sy: 1, sz: 0.2,
            x: opportunity.transform.x, y: opportunity.transform.y, z: opportunity.transform.z, rotY: 0,
            assemblyId: null, assemblyKind: null, surfaceId: opportunity.surfaceId ?? null,
            semanticOpportunityId: opportunity.id, visualTier: request.priorityTier, visualImpact: 10,
        }];
    return {
        kind: 'exterior-prop-field', entityId: entity.id, seed: 88,
        exteriorVisualTier: request.priorityTier,
        fieldPlan: { placements, stats: { drawBuckets: 1 } },
    };
};

const chunk = { key: 'integration', seed: 123, districtId: district.id };
const composition = compileExteriorCompositionAuthority({
    chunk,
    payload,
    authoredTasks: [],
    contextualTasks: [],
    fieldTasks: [],
    planFieldRequest: makeFieldTask,
});

assert.equal(composition.stats.plannerOwnsQuantity, true);
assert.equal(composition.stats.singleAuthority, true);
assert.ok(composition.stats.maxAcceptedPerEntity <= composition.stats.maxDensityCeiling, 'accepted quantity must stay inside authority density ceiling');
assert.ok(composition.acceptedExteriorTasks.every(task => task.exteriorPlanOwner), 'accepted tasks must remain authority-owned');

const boundAccepted = composition.acceptedExteriorTasks.find(task => task.semanticContentContext?.program === 'retail');
assert.ok(boundAccepted, 'accepted exterior task should inherit planned room program');
assert.equal(boundAccepted.semanticContentContext.buildingPlanId, 'plan:integration');
assert.equal(boundAccepted.semanticContentContext.districtFamily, 'market');

const spectacle = composition.acceptedExteriorTasks.find(task => task.exteriorVisualTier === 'spectacle');
assert.ok(spectacle, 'landmark fixture should admit its single spectacle task');
const mediaResult = attachSpectacleMedia({
    chunk,
    tasks: [spectacle],
    pairFor: ({ semanticContentContext }) => ({
        0: 'MARKET SIGNAL',
        1: `${semanticContentContext.program} / ${semanticContentContext.frontageRole}`,
        family: 'commercial-ad',
    }),
});
assert.equal(mediaResult.assemblies, 1, 'corner wrap must remain one media assembly');
assert.equal(mediaResult.coordinatedAssemblies, 1);
assert.equal(spectacle.mediaAssemblies.length, 1);
assert.equal(spectacle.mediaAssemblies[0].layout.segmentCount, 2);
assert.equal(spectacle.mediaAssemblies[0].semanticProgram, 'retail');
assert.equal(spectacle.mediaAssemblies[0].buildingPlanId, 'plan:integration');
assert.equal(spectacle.mediaAssemblies[0].districtFamily, 'market');
assert.ok(spectacle.fieldPlan.placements.every(item => item.media?.id === spectacle.mediaAssemblies[0].id), 'all wrap faces must share one coordinated descriptor');

const seedA = spectacle.mediaAssemblies[0].campaignSeed;
const reversedTask = structuredClone(spectacle);
for (const item of reversedTask.fieldPlan.placements) {
    delete item.media;
    delete item.mediaSegment;
}
delete reversedTask.mediaAssemblies;
reversedTask.fieldPlan.placements.reverse();
attachSpectacleMedia({
    chunk,
    tasks: [{ kind: 'sign', entityId: 'ignored' }, reversedTask].reverse(),
    pairFor: ({ semanticContentContext }) => ({
        0: 'MARKET SIGNAL',
        1: `${semanticContentContext.program} / ${semanticContentContext.frontageRole}`,
        family: 'commercial-ad',
    }),
});
assert.equal(reversedTask.mediaAssemblies[0].campaignSeed, seedA, 'queue/member order may not alter semantic campaign');
assert.equal(reversedTask.mediaAssemblies[0].campaignKey, spectacle.mediaAssemblies[0].campaignKey);

console.log('frontage semantic integration selftest: ok');
