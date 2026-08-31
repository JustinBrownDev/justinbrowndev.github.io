import assert from 'node:assert/strict';
import { compileSemanticContext } from '../world/semantic-context.js';

const chunk = { key: '0,0', x: 0, z: 0, seed: 0x51a7c1e };
const entity = {
    id: 'landmark:test', kind: 'district-landmark', semanticChunkKey: chunk.key,
    doorSide: 'south', floorH: 3.15, floors: 5, archetype: 'commercial',
    x: 0, z: 0, halfX: 4, halfZ: 4,
    footprintModules: [{ key: 'm0', cx: 0, cz: 0, halfX: 4, halfZ: 4, floors: 5 }],
    facades: [
        { side: 'north', moduleKey: 'm0', x: 0, z: -4, halfX: 4, halfZ: 4, yMin: 0, yMax: 15.75 },
        { side: 'east', moduleKey: 'm0', x: 4, z: 0, halfX: 4, halfZ: 4, yMin: 0, yMax: 15.75 },
    ],
};
const payload = {
    ownerId: 'chunk:0,0', entities: [entity], semanticSpaces: [], semanticPlacements: [],
    physics: { circulationReservations: [], semanticConnectors: [] },
};

const compiled = compileSemanticContext({ chunk, payload, tasks: [], debugWeight: 0 });
const spectacle = compiled.opportunities.filter(item => ['corner-media-band', 'facade-spectacle-span', 'roof-spectacle-envelope'].includes(item.role));
assert.equal(spectacle.length, 1, 'one building should publish at most one best spectacle candidate');
assert.equal(spectacle[0].role, 'corner-media-band', 'meeting large facades should prefer one true wraparound media candidate');
assert.equal(spectacle[0].segments.length, 2, 'corner media candidate must span both adjacent facade segments');
assert.equal(new Set(spectacle[0].segments.map(segment => segment.surfaceId)).size, 2);
assert.ok(spectacle[0].spectacleImpact > 100, 'landmark wraparound host should carry building-scale visual mass');

const candidateSurfaceIds = new Set(spectacle[0].segments.map(segment => segment.surfaceId));
const ordinaryOnCandidateSurfaces = compiled.opportunities.filter(item => candidateSurfaceIds.has(item.surfaceId)
    && ['facade-sign-zone', 'facade-poster-zone', 'facade-service-band', 'wall-mounted-prop-zone'].includes(item.role));
assert.ok(ordinaryOnCandidateSurfaces.length > 0, 'discovery should retain ordinary child opportunities as candidates');
assert.ok(ordinaryOnCandidateSurfaces.every(item => item.spectacleReserved !== true), 'discovery must not claim a candidate surface before building composition authority chooses it');

const again = compileSemanticContext({
    chunk,
    payload: {
        ownerId: 'chunk:0,0', entities: [structuredClone(entity)], semanticSpaces: [], semanticPlacements: [],
        physics: { circulationReservations: [], semanticConnectors: [] },
    },
    tasks: [], debugWeight: 0,
});
assert.deepEqual(
    spectacle.map(item => [item.id, item.role, item.segments.map(segment => segment.surfaceId)]),
    again.opportunities.filter(item => ['corner-media-band', 'facade-spectacle-span', 'roof-spectacle-envelope'].includes(item.role))
        .map(item => [item.id, item.role, item.segments?.map(segment => segment.surfaceId) ?? []]),
    'spectacle candidate generation must remain deterministic for a seed',
);

console.log('[semantic-spectacle-opportunity-selftest] PASS', {
    role: spectacle[0].role,
    impact: spectacle[0].spectacleImpact,
    ordinaryCandidateOpportunities: ordinaryOnCandidateSurfaces.length,
});
