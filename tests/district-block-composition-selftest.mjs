import assert from 'node:assert/strict';
import {
  DISTRICT_BLOCK_COMPOSITION_SCHEMA,
  attachDistrictBlockComposition,
  compileDistrictBlockComposition,
  districtBuildingPolicyForEntity,
  districtContextForEntity,
  districtExteriorPolicyForEntity,
} from '../world/district-block-composition.js';

const chunk = Object.freeze({
  worldId: 'jweb.dev/world:v1:seed-12345678',
  key: '7,-4',
  x: 7,
  z: -4,
  centerX: 448,
  centerZ: -256,
  chunkSize: 64,
  seed: 0x56aa19ef,
  weirdness: Object.freeze({ distanceChunks: 8.06, sampled: 0.47 }),
});

const familyCycle = [
  'mercantile-public', 'industrial-service', 'business', 'residential-lodging',
  'maintenance-utility', 'assembly-institutional', 'storage', 'mercantile-public',
];
const coords = [
  [-3, -3], [0, -3], [3, -3], [3, 0], [3, 3], [0, 3], [-3, 3], [-3, 0],
];
const entities = coords.map(([x, z], index) => ({
  id: `building-${index}`,
  kind: index === 2 ? 'district-landmark' : 'building',
  x,
  z,
  halfX: index === 5 ? 2.2 : 1.4,
  halfZ: index === 5 ? 2.0 : 1.4,
  floors: 2 + (index % 4),
  physicalUse: { family: familyCycle[index] },
}));
const connectors = [
  { kind: 'bridge', metadata: { entityId: 'building-1' } },
  { kind: 'fire-escape', metadata: { entityId: 'building-1' } },
  { kind: 'stair', metadata: { entityId: 'building-6' } },
  { kind: 'door', metadata: { entityId: 'building-0' } },
];

function payloadWith(entityList = entities, connectorList = connectors) {
  return {
    entities: entityList.map(entity => ({ ...entity, physicalUse: { ...entity.physicalUse } })),
    physics: { semanticConnectors: connectorList.map(item => ({ ...item, metadata: { ...item.metadata } })) },
  };
}

const first = compileDistrictBlockComposition({ chunk, payload: payloadWith() });
const second = compileDistrictBlockComposition({ chunk, payload: payloadWith() });
assert.equal(first.schema, DISTRICT_BLOCK_COMPOSITION_SCHEMA);
assert.deepEqual(second, first, 'same stable seed/input must produce byte-equivalent semantic composition');

// Input/queue order cannot perturb district intent.
const shuffled = compileDistrictBlockComposition({
  chunk,
  payload: payloadWith([...entities].reverse(), [connectors[2], connectors[0], connectors[3], connectors[1]]),
});
assert.deepEqual(shuffled, first, 'entity/connector queue order changed deterministic composition');
for (let i = 0; i < 100; i++) Math.random();
assert.deepEqual(compileDistrictBlockComposition({ chunk, payload: payloadWith() }), first, 'ambient RNG changed district intent');

assert.equal(first.hierarchy.anchorBuildingId, 'building-2', 'district landmark must dominate anchor hierarchy');
assert.ok(first.hierarchy.secondaryLandmarkIds.length >= 1, 'secondary landmark hierarchy missing');
assert.ok(first.hierarchy.spectacleBuildingIds.includes('building-2'), 'anchor absent from spectacle hierarchy');
assert.ok(first.block.commercialEdge && first.block.serviceEdge && first.block.quietEdge, 'block edge composition incomplete');
assert.notEqual(first.block.commercialEdge, first.block.serviceEdge, 'commercial and service edges collapsed');
assert.notEqual(first.block.commercialEdge, first.block.quietEdge, 'commercial and quiet edges collapsed');

const roleSet = new Set(Object.values(first.buildings).map(context => context.blockRole));
assert.ok(roleSet.has('commercial-frontage'), 'no coordinated commercial frontage role');
assert.ok(roleSet.has('service-edge'), 'no coordinated service role');
assert.ok(roleSet.has('quiet-edge'), 'no coordinated quiet role');
assert.ok(roleSet.has('anchor'), 'no anchor role');

const bridgeHost = first.buildings['building-1'];
assert.ok(bridgeHost.connectorPressure > 0.9, 'connector topology did not increase building connector pressure');
assert.ok(bridgeHost.bridgePressure > first.district.bridgePressure * 0.5, 'bridge pressure did not survive district/building composition');

const payload = payloadWith();
attachDistrictBlockComposition(payload, first);
for (const entity of payload.entities) {
  assert.equal(entity.districtCompositionId, first.id, 'entity missing attached district authority id');
  assert.equal(entity.districtComposition, districtContextForEntity(first, entity.id), 'entity context does not point at authoritative composition');
}

const byRole = role => payload.entities.find(entity => entity.districtComposition?.blockRole === role);
const commercial = byRole('commercial-frontage');
const service = byRole('service-edge');
const quiet = byRole('quiet-edge');
assert.ok(commercial && service && quiet, 'representative downstream roles missing');

// Building-plan contract measurably changes program hints while respecting physical use.
const commercialPolicy = districtBuildingPolicyForEntity(commercial);
const servicePolicy = districtBuildingPolicyForEntity(service);
const quietPolicy = districtBuildingPolicyForEntity(quiet);
assert.ok(commercialPolicy.programHint, 'commercial building policy did not produce a planning program hint');
assert.ok(servicePolicy.programHint, 'service building policy did not produce a planning program hint');
assert.ok(quietPolicy.programHint, 'quiet building policy did not produce a planning program hint');
assert.notDeepEqual(
  [commercialPolicy.blockRole, commercialPolicy.frontageCharacter],
  [servicePolicy.blockRole, servicePolicy.frontageCharacter],
  'district building policies collapsed distinct roles',
);

// Exterior contract changes style/family intent without prescribing count/density.
const commercialExterior = districtExteriorPolicyForEntity(commercial);
const serviceExterior = districtExteriorPolicyForEntity(service);
const quietExterior = districtExteriorPolicyForEntity(quiet);
assert.ok(commercialExterior.styleBiases.includes('signage-bazaar'), 'commercial frontage failed to bias signage composition');
assert.ok(serviceExterior.styleBiases.some(style => style === 'pipe-nightmare' || style === 'service-bunker'), 'service edge failed to bias service/mechanical composition');
assert.ok(quietExterior.styleBiases.includes('institutional-monolith'), 'quiet edge failed to preserve restrained composition option');
assert.equal('densityCeiling' in commercialExterior, false, 'district exterior policy must not own density');
assert.equal(first.stats.ownsGeometry, false);
assert.equal(first.stats.ownsPropCounts, false);
assert.equal(first.stats.ownsPublication, false);

// Live generator composes site descriptors before physical-use classification.
// The resolved physical family can therefore supply the compatible program later
// without changing the already-stable block role/composition identity.
const preplan = compileDistrictBlockComposition({
  chunk,
  entities: entities.map(({ physicalUse, ...entity }) => entity),
});
const preplanService = Object.values(preplan.buildings).find(context => context.blockRole === 'service-edge');
assert.ok(preplanService, 'pre-plan descriptors lost service role');
assert.equal(preplanService.buildingProgramHint, null, 'pre-plan descriptor should not invent a physical-family program');
const resolvedProgramPolicy = districtBuildingPolicyForEntity({
  physicalUse: { family: 'industrial-service' },
  districtComposition: preplanService,
});
assert.equal(resolvedProgramPolicy.programHint, 'electronics_repair', 'resolved physical family did not complete district building policy');

// District character must remain heterogeneous rather than hardcoding one aesthetic.
const sampledFamilies = new Map();
for (let x = -18; x <= 18; x += 3) {
  for (let z = -18; z <= 18; z += 3) {
    const sample = compileDistrictBlockComposition({
      chunk: { ...chunk, key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64 },
      entities: [],
    });
    sampledFamilies.set(sample.district.family, sample.district);
  }
}
assert.equal(sampledFamilies.size, 8, 'district hashing failed to expose the full heterogeneous character catalog');
assert.ok(sampledFamilies.get('residential').quietBias > sampledFamilies.get('residential').spectacleBias, 'residential district should support quiet stretches');
assert.ok(sampledFamilies.get('market').spectacleBias > sampledFamilies.get('market').quietBias, 'market district should support intense spectacle');
assert.ok(sampledFamilies.get('mechanical').mechanicalEmphasis > 0.9, 'mechanical district should support infrastructure-heavy blocks');

console.log(JSON.stringify({
  ok: true,
  schema: first.schema,
  compositionId: first.id,
  district: first.district,
  block: {
    commercialEdge: first.block.commercialEdge,
    serviceEdge: first.block.serviceEdge,
    quietEdge: first.block.quietEdge,
    spectacleCorridor: first.block.spectacleCorridor,
    rooflineRhythm: first.block.rooflineRhythm,
  },
  hierarchy: first.hierarchy,
  roles: Object.fromEntries(Object.entries(first.buildings).map(([id, context]) => [id, context.blockRole])),
}, null, 2));
