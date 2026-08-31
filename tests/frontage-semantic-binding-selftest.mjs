import assert from 'node:assert/strict';
import {
    FRONTAGE_BINDING_SCHEMA,
    FRONTAGE_CONTENT_CONTEXT_SCHEMA,
    bindFrontageSemanticTruth,
    frontageContentContextFromBinding,
} from '../world/frontage-semantic-binding.js';

function fixture() {
    const entity = {
        id: 'building:A',
        kind: 'district-landmark',
        archetype: 'market-institution',
        physicalUse: { family: 'mercantile-public' },
        buildingPlan: {
            deterministicKey: 'plan:building:A',
            fingerprint: 'fp-A',
            topologySpaces: [
                {
                    id: 'space:retail', entityId: 'building:A', floor: 0, yBase: 0, floorH: 3.2,
                    role: 'public', spaceType: 'shop-floor', semanticProgram: 'retail', privacy: 'public',
                    moduleKeys: ['main'], connectorIds: [],
                    bounds: { minX: -6, maxX: -1, minZ: -4, maxZ: 4, yMin: 0, yMax: 3.2 },
                    regions: [{ minX: -6, maxX: -1, minZ: -4, maxZ: 4 }],
                },
                {
                    id: 'space:lobby', entityId: 'building:A', floor: 0, yBase: 0, floorH: 3.2,
                    role: 'entry', spaceType: 'lobby', semanticProgram: 'institutional', privacy: 'public',
                    moduleKeys: ['main'], connectorIds: ['door:lobby'],
                    bounds: { minX: -1, maxX: 2, minZ: -4, maxZ: 0, yMin: 0, yMax: 3.2 },
                    regions: [{ minX: -1, maxX: 2, minZ: -4, maxZ: 0 }],
                },
                {
                    id: 'space:mechanical', entityId: 'building:A', floor: 0, yBase: 0, floorH: 3.2,
                    role: 'service', spaceType: 'mechanical-room', semanticProgram: 'mechanical', privacy: 'service',
                    moduleKeys: ['main'], connectorIds: [],
                    bounds: { minX: 2, maxX: 6, minZ: -4, maxZ: 4, yMin: 0, yMax: 3.2 },
                    regions: [{ minX: 2, maxX: 6, minZ: -4, maxZ: 4 }],
                },
            ],
        },
    };
    const surfaces = [
        { id: 'surface:west', entityId: entity.id, moduleKey: 'main', side: 'west', x: -6, z: 0, normalX: -1, normalZ: 0, yMin: 0, yMax: 9, half: 4, exposure: 'street' },
        { id: 'surface:north', entityId: entity.id, moduleKey: 'main', side: 'north', x: 0, z: -4, normalX: 0, normalZ: -1, yMin: 0, yMax: 9, half: 6, exposure: 'street' },
        { id: 'surface:east', entityId: entity.id, moduleKey: 'main', side: 'east', x: 6, z: 0, normalX: 1, normalZ: 0, yMin: 0, yMax: 9, half: 4, exposure: 'service' },
    ];
    const apertures = [
        { id: 'aperture:lobby', surfaceId: 'surface:north', connectorId: 'door:lobby', traversable: true, uMin: -0.7, uMax: 0.7 },
    ];
    const opportunities = [
        { id: 'opp:shop', role: 'facade-sign-zone', entityId: entity.id, surfaceId: 'surface:west', u: 0, transform: { x: -6.035, y: 2.3, z: 0 } },
        { id: 'opp:lobby', role: 'portal-lintel-zone', entityId: entity.id, surfaceId: 'surface:north', u: 0, transform: { x: 0, y: 2.45, z: -4.035 } },
        { id: 'opp:service', role: 'facade-service-band', entityId: entity.id, surfaceId: 'surface:east', u: 0, transform: { x: 6.035, y: 2.2, z: 0 } },
        {
            id: 'opp:corner-wrap', role: 'corner-media-band', entityId: entity.id,
            transform: { x: -5.8, y: 2.6, z: -3.8 },
            segments: [
                { surfaceId: 'surface:west', transform: { x: -6.065, y: 2.6, z: -3.4 } },
                { surfaceId: 'surface:north', transform: { x: -5.4, y: 2.6, z: -4.065 } },
            ],
        },
    ];
    const destinations = entity.buildingPlan.topologySpaces.map(space => ({
        id: `${space.id}:destination`, spaceId: space.id, entityId: entity.id,
        program: space.semanticProgram,
    }));
    return {
        payload: { entities: [entity], semanticSpaces: [] },
        district: { id: 'district:42', family: 'market', chunkKey: '42:9' },
        surfaces,
        apertures,
        opportunities,
        destinations,
    };
}

function run(input) {
    const beforeIds = input.opportunities.map(item => item.id);
    const result = bindFrontageSemanticTruth(input);
    assert.deepEqual(input.opportunities.map(item => item.id), beforeIds, 'binding may not add, remove, or reorder exterior opportunities');
    assert.equal(result.stats.ownsQuantity, false);
    assert.equal(result.stats.ownsReservations, false);
    assert.equal(result.stats.ownsTopology, false);
    return result;
}

const a = fixture();
const result = run(a);
assert.equal(result.schema, FRONTAGE_BINDING_SCHEMA);

const byId = new Map(a.opportunities.map(opportunity => [opportunity.id, opportunity.frontageBinding]));
assert.equal(byId.get('opp:shop').space.id, 'space:retail');
assert.equal(byId.get('opp:shop').frontageRole, 'storefront');
assert.equal(byId.get('opp:shop').publicRole, 'public');

assert.equal(byId.get('opp:lobby').space.id, 'space:lobby');
assert.equal(byId.get('opp:lobby').frontageRole, 'public-entry');
assert.equal(byId.get('opp:lobby').entrance.relation, 'adjacent');
assert.equal(byId.get('opp:lobby').entrance.apertureId, 'aperture:lobby');

assert.equal(byId.get('opp:service').space.id, 'space:mechanical');
assert.equal(byId.get('opp:service').frontageRole, 'mechanical-service');
assert.equal(byId.get('opp:service').publicRole, 'service');

const shopContext = frontageContentContextFromBinding(byId.get('opp:shop'));
assert.equal(shopContext.schema, FRONTAGE_CONTENT_CONTEXT_SCHEMA);
assert.equal(shopContext.buildingId, 'building:A');
assert.equal(shopContext.buildingPlanId, 'plan:building:A');
assert.equal(shopContext.program, 'retail');
assert.equal(shopContext.destinationId, 'space:retail:destination');
assert.equal(shopContext.districtFamily, 'market');
assert.equal(shopContext.frontageRole, 'storefront');
assert.equal(shopContext.landmark, true);

const wrap = byId.get('opp:corner-wrap');
assert.equal(wrap.multiSurface, true);
assert.equal(wrap.surfaceBindings.length, 2);
assert.deepEqual(wrap.surfaceIds, ['surface:north', 'surface:west']);
assert.equal(new Set(wrap.surfaceBindings.map(binding => binding.campaignKey)).size, 1, 'all faces in one wrap must inherit one building campaign');

const baseline = new Map(a.opportunities.map(opportunity => [opportunity.id, {
    bindingKey: opportunity.frontageBinding.bindingKey,
    campaignKey: opportunity.frontageBinding.campaignKey,
    spaceIds: opportunity.frontageBinding.spaceIds,
} ]));
const b = fixture();
b.opportunities.reverse();
run(b);
for (const opportunity of b.opportunities) {
    const expected = baseline.get(opportunity.id);
    assert.equal(opportunity.frontageBinding.bindingKey, expected.bindingKey, `binding key must ignore queue order for ${opportunity.id}`);
    assert.equal(opportunity.frontageBinding.campaignKey, expected.campaignKey, `campaign must ignore queue order for ${opportunity.id}`);
    assert.deepEqual(opportunity.frontageBinding.spaceIds, expected.spaceIds, `space relation must ignore queue order for ${opportunity.id}`);
}

console.log('frontage semantic binding selftest: ok');
console.log(JSON.stringify({
    bindings: result.stats.bindings,
    surfaces: result.stats.boundSurfaces,
    opportunities: result.stats.boundOpportunities,
    multiSurface: result.stats.multiSurfaceOpportunities,
    quantityOwned: result.stats.ownsQuantity,
}, null, 2));
