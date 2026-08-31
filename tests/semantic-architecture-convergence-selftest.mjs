import assert from 'node:assert/strict';
import {
    attachSpectacleMedia,
    compileExteriorCompositionAuthority,
    EXTERIOR_COMPOSITION_SCHEMA,
    EXTERIOR_MEDIA_SCHEMA,
} from '../world/exterior-composition-authority.js';
import { semanticExteriorProvenance } from '../world/semantic-exterior-authority.js';

const entities = Array.from({ length: 10 }, (_, index) => ({
    id: `building:${index}`,
    kind: index === 0 ? 'district-landmark' : 'building',
    physicalUse: { family: ['mercantile-public', 'industrial-service', 'assembly-institutional', 'residential-lodging', 'business'][index % 5] },
}));
const payload = { entities };
const chunk = { key: '0,0', seed: 0x12345678, districtId: 'district:selftest' };
const authoredTasks = [];
const contextualTasks = [];
const fieldTasks = [];

for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].id;
    const west = `${entityId}:surface:west`;
    const north = `${entityId}:surface:north`;
    const east = `${entityId}:surface:east`;

    authoredTasks.push({
        kind: 'sign', entityId, seed: i, width: 3.2, height: 1.2,
        semanticOpportunityId: `${entityId}:sign:west`,
        semanticOpportunityRole: 'facade-sign-zone',
        semanticPlacement: { x: i * 10, y: 2.8, z: 0, rotY: 0, surfaceId: west, opportunityId: `${entityId}:sign:west` },
        firstPassBundle: true, firstPassClass: 'facade',
    });
    authoredTasks.push({
        kind: 'security', entityId, seed: 100 + i,
        semanticHostId: east,
        semanticOpportunityId: `${entityId}:security:east`,
        semanticOpportunityRole: 'wall-mounted-prop-zone',
        semanticPlacement: { x: i * 10, y: 2.0, z: 0, rotY: 0, surfaceId: east, opportunityId: `${entityId}:security:east` },
    });

    for (let slot = 0; slot < 12; slot++) {
        contextualTasks.push({
            kind: 'semantic-context-prop', entityId, seed: i * 1000 + slot,
            semanticContextRole: 'wall', semanticOpportunityRole: 'wall-mounted-prop-zone',
            semanticVisualImpact: 1 + slot * 0.03,
            semanticHostId: north,
            semanticOpportunityId: `${entityId}:hardware:north:${slot}`,
            semanticPlacement: {
                x: i * 10 + slot * 0.01, y: 2, z: 0, rotY: 0,
                surfaceId: north, opportunityId: `${entityId}:hardware:north:${slot}`,
            },
        });
    }

    if (i < 8) {
        fieldTasks.push({
            kind: 'exterior-prop-field', entityId, seed: 900 + i,
            exteriorVisualTier: 'spectacle', exteriorVisualImpact: 30 - i,
            fieldPlan: { placements: [{
                shape: 'box', assemblyKind: 'facade-megascreen', assemblyId: `${entityId}:screen`,
                surfaceId: north, semanticContextId: `${entityId}:context:north`,
                semanticOpportunityId: `${entityId}:spectacle:north`,
                spectacleSurfaceIds: [north], sx: 7.5, sy: 3.8, sz: 0.16,
            }] },
        });
    }

    // No semantic opportunity ID on purpose: this is an assembly-level macro
    // reservation and therefore owns the entire east surface against lower tiers.
    fieldTasks.push({
        kind: 'exterior-prop-field', entityId, seed: 1200 + i,
        exteriorVisualTier: 'macro', exteriorVisualImpact: 9,
        fieldPlan: { placements: [{ shape: 'box', assemblyKind: 'facade-service-bank', surfaceId: east, sx: 3.6, sy: 2.2, sz: 0.2 }] },
    });
}

const unrelated = { kind: 'semantic-life', entityId: 'building:0', seed: 9999 };
authoredTasks.push(unrelated);

const compile = () => compileExteriorCompositionAuthority({
    chunk,
    payload: structuredClone(payload),
    authoredTasks: structuredClone(authoredTasks),
    contextualTasks: structuredClone(contextualTasks),
    fieldTasks: structuredClone(fieldTasks),
});

const result = compile();
assert.equal(result.stats.schema, EXTERIOR_COMPOSITION_SCHEMA);
assert.equal(result.stats.singleAuthority, true);
assert.equal(result.stats.plannerOwnsQuantity, true);
assert.equal(result.stats.traceablePlanOwnership, true);
assert.equal(result.stats.highTierReservationsProtectLowerTier, true);
assert.equal(result.stats.coverageFloorPolicy, true);
assert.equal(result.stats.densityCeilingPolicy, true);
assert.equal(result.stats.neighborhoodWavePolicy, true);
assert.equal(result.plans.length, entities.length);
assert.equal(new Set(result.plans.map(plan => plan.id)).size, entities.length, 'every building owns one stable exterior plan');
assert.ok(result.stats.spectacleSelected >= 3, 'dense evaluation district should visibly expose spectacle anchors');
assert.ok(result.stats.buildingsWithCoarseFloor >= 1, 'non-sparse plans need a coarse coverage wave beyond their anchor');
assert.ok(result.acceptedExteriorTasks.some(task => task.kind === 'sign'), 'semantic readable signage must survive composition');
const untouchedLife = result.tasks.find(task => task.kind === 'semantic-life' && task.entityId === 'building:0');
assert.ok(untouchedLife, 'non-exterior semantic work remains in the merged task stream');
assert.equal(untouchedLife.exteriorPlanId, undefined, 'non-exterior work must remain outside exterior authority');

for (const entity of entities) {
    const accepted = result.acceptedExteriorTasks.filter(task => task.entityId === entity.id);
    const plan = result.plans.find(item => item.entityId === entity.id);
    assert.ok(plan);
    assert.ok(accepted.length >= 1 && accepted.length <= plan.densityCeiling);
    assert.equal(accepted.filter(task => task.firstPassBundle).length, 1, `${entity.id} must have one visible first-pass anchor`);
    assert.ok(accepted.every(task => task.exteriorPlanId === plan.id));
    assert.equal(new Set(accepted.map(task => task.exteriorRequestId)).size, accepted.length);
    assert.ok(accepted.every(task => semanticExteriorProvenance(task)?.exteriorPlanId === plan.id));

    const spectacle = accepted.find(task => task.exteriorVisualTier === 'spectacle');
    if (spectacle) {
        assert.ok(!accepted.some(task => task.kind === 'semantic-context-prop' && task.semanticHostId === `${entity.id}:surface:north`),
            'spectacle whole-surface reservation must suppress north-wall hardware');
    }
    const eastMacro = accepted.find(task => task.exteriorVisualTier === 'macro'
        && task.fieldPlan?.placements?.some(item => item.surfaceId === `${entity.id}:surface:east`));
    if (eastMacro) {
        assert.ok(!accepted.some(task => task.kind === 'security' && task.semanticHostId === `${entity.id}:surface:east`),
            'assembly-level macro reservation must suppress lower-tier east-facade fixture');
    }
}

const again = compile();
assert.deepEqual(
    result.plans.map(plan => [plan.id, plan.requestIds, plan.reservations.map(item => [item.id, item.scope, item.surfaceId, item.opportunityId])]),
    again.plans.map(plan => [plan.id, plan.requestIds, plan.reservations.map(item => [item.id, item.scope, item.surfaceId, item.opportunityId])]),
    'plan/request/reservation identity must not depend on async publication order',
);

const mediaTask = result.acceptedExteriorTasks.find(task => task.exteriorVisualTier === 'spectacle');
assert.ok(mediaTask, 'fixture requires a retained megascreen spectacle');
const firstFace = mediaTask.fieldPlan.placements.find(item => item.shape === 'box' && /megascreen/i.test(String(item.assemblyKind ?? '')));
firstFace.assemblyKind = 'corner-megascreen';
firstFace.spectacleSurfaceIds = [`${mediaTask.entityId}:surface:north`, `${mediaTask.entityId}:surface:east`];
mediaTask.fieldPlan.placements.push({
    shape: 'box', assemblyKind: 'corner-megascreen', assemblyId: firstFace.assemblyId,
    surfaceId: `${mediaTask.entityId}:surface:east`, semanticContextId: `${mediaTask.entityId}:context:east`,
    semanticOpportunityId: `${mediaTask.entityId}:spectacle:east`, spectacleSurfaceIds: [...firstFace.spectacleSurfaceIds],
    sx: 5.5, sy: 3.8, sz: 0.16,
});
mediaTask.fieldPlan.placements.push({ shape: 'cylinder', assemblyKind: 'corner-megascreen', assemblyId: firstFace.assemblyId, sx: 0.1, sy: 3.8, sz: 0.1 });

let pairCalls = 0;
const media = attachSpectacleMedia({
    chunk,
    tasks: result.acceptedExteriorTasks,
    pairFor: ({ assemblyId }) => {
        pairCalls++;
        return { title: 'FERROUS MEMORY', subtitle: 'AUTHORIZED EXCHANGE', family: assemblyId === firstFace.assemblyId ? 'market-value' : 'data-feed' };
    },
});
assert.ok(media.assemblies >= 1 && media.coordinatedAssemblies >= 1 && media.surfaces >= 2);
assert.equal(pairCalls, media.assemblies, 'semantic content must be selected once per logical assembly');
const cornerFaces = mediaTask.fieldPlan.placements.filter(item => item.shape === 'box' && item.assemblyId === firstFace.assemblyId);
assert.equal(cornerFaces.length, 2);
assert.equal(cornerFaces[0].media, cornerFaces[1].media, 'corner/wrap faces share one canonical media object');
const descriptor = cornerFaces[0].media;
assert.equal(descriptor.schema, EXTERIOR_MEDIA_SCHEMA);
assert.equal(descriptor.exteriorPlanId, mediaTask.exteriorPlanId);
assert.equal(descriptor.exteriorRequestId, mediaTask.exteriorRequestId);
assert.deepEqual(descriptor.exteriorReservationIds, mediaTask.exteriorReservationIds);
assert.equal(descriptor.title, 'FERROUS MEMORY');
assert.equal(descriptor.subtitle, 'AUTHORIZED EXCHANGE');
assert.equal(descriptor.family, 'market-value');
assert.match(descriptor.value.label, /^\d+ (?:CREDITS|TOKENS|MARKS|DINAR|YEN|UNITS|GUILDERS|SCRIP)$/);
assert.equal(descriptor.layout.mode, 'continuous-corner');
assert.equal(descriptor.layout.segmentCount, 2);
assert.equal(cornerFaces[0].mediaSegment.index, 0);
assert.equal(cornerFaces[1].mediaSegment.index, 1);
assert.ok(cornerFaces[0].mediaSegment.u0 < cornerFaces[0].mediaSegment.u1);
assert.ok(cornerFaces[0].mediaSegment.u1 <= cornerFaces[1].mediaSegment.u1);
const support = mediaTask.fieldPlan.placements.find(item => item.shape === 'cylinder' && item.assemblyId === firstFace.assemblyId);
assert.equal(support.media, undefined, 'support geometry is not a media surface');

console.log('[semantic-architecture-convergence-selftest] PASS', {
    plans: result.plans.length,
    accepted: result.stats.accepted,
    rejected: result.stats.rejected,
    spectacleSelected: result.stats.spectacleSelected,
    buildingsWithCoarseFloor: result.stats.buildingsWithCoarseFloor,
    reservations: result.stats.reservationCount,
    media,
});
