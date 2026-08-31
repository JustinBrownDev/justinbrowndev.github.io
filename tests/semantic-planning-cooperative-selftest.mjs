import assert from 'node:assert/strict';
import {
    compileExteriorCompositionAuthority,
    createExteriorCompositionCompiler,
} from '../world/exterior-composition-authority.js';
import { createWorldChunkStreamer } from '../world-chunk-streamer.js';
import {
    createSemanticPlanCache,
    runCooperativeCompiler,
    semanticPlanCacheKey,
} from '../world/architecture/semantic-plan-runtime.js';

function exteriorFixture(chunkKey = '0,0') {
    const entities = Array.from({ length: 4 }, (_, index) => ({
        id: `building:${index}`,
        kind: 'building',
        physicalUse: { family: index % 2 ? 'mercantile-public' : 'industrial-service' },
        program: index % 2 ? 'commercial' : 'industrial',
    }));
    const payload = {
        entities,
        semanticContext: { entities: [], spaces: [], opportunities: [], spatialTopology: { reservations: [] } },
    };
    const authoredTasks = entities.flatMap((entity, index) => [
        {
            kind: 'sign', entityId: entity.id, seed: index,
            semanticPlacement: { x: index * 10, y: 3, z: 0, rotY: 0 },
            semanticOpportunityId: `${entity.id}:sign`, surfaceId: `${entity.id}:north`,
            firstPassBundle: true, firstPassClass: 'facade',
        },
        {
            kind: 'pipe', entityId: entity.id, seed: 100 + index,
            semanticPlacement: { x: index * 10 + 1, y: 3, z: 0, rotY: 0 },
            semanticOpportunityId: `${entity.id}:service`, surfaceId: `${entity.id}:north`,
            exteriorVisualTier: 'macro', exteriorVisualImpact: 5,
        },
        {
            kind: 'awning', entityId: entity.id, seed: 200 + index,
            semanticPlacement: { x: index * 10 - 1, y: 2, z: 0, rotY: 0 },
            semanticOpportunityId: `${entity.id}:awning`, surfaceId: `${entity.id}:north`,
        },
    ]);
    return { chunk: { key: chunkKey, seed: 0x12345678 }, payload, authoredTasks };
}

function compileSync(fixture) {
    return compileExteriorCompositionAuthority(structuredClone(fixture));
}

function normalize(result) {
    return {
        plans: result.plans,
        tasks: result.tasks.map(task => ({
            kind: task.kind,
            entityId: task.entityId,
            seed: task.seed,
            firstPassBundle: !!task.firstPassBundle,
            exteriorPlanId: task.exteriorPlanId ?? null,
            exteriorRequestId: task.exteriorRequestId ?? null,
            exteriorReservationIds: task.exteriorReservationIds ?? [],
            exteriorComposition: task.exteriorComposition ?? null,
        })),
        stats: result.stats,
    };
}

const fixture = exteriorFixture();
const expected = normalize(compileSync(fixture));

const oneUnit = createExteriorCompositionCompiler(structuredClone(fixture));
assert.equal(oneUnit.done, false);
assert.equal(oneUnit.unitsCompleted, 0, 'compiler construction must not eagerly compile the whole exterior plan');
const firstSlice = oneUnit.step({ maxUnits: 1 });
assert.equal(firstSlice.units, 1, 'one planning slice must respect the requested unit cap');
assert.equal(oneUnit.done, false, 'representative exterior planning must be resumable');

let yielded = 0;
const cooperative = createExteriorCompositionCompiler(structuredClone(fixture));
const cooperativeRun = await runCooperativeCompiler(cooperative, {
    maxUnitsPerSlice: 1,
    yieldControl: async () => { yielded++; },
    label: 'selftest-exterior',
});
assert.ok(yielded > 0, 'cooperative exterior compilation must yield between bounded slices');
assert.ok(cooperativeRun.metrics.maxUnitsPerSlice <= 1, 'no cooperative slice may exceed one planner unit in this test');
assert.deepEqual(normalize(cooperativeRun.result), expected, 'cooperative compilation must preserve synchronous semantic output exactly');

// Interleave two identical compilers in intentionally different scheduling slices.
// Their semantic result must be a function of planner inputs, never queue order.
const orderA = createExteriorCompositionCompiler(structuredClone(fixture));
const orderB = createExteriorCompositionCompiler(structuredClone(fixture));
while (!orderA.done || !orderB.done) {
    if (!orderB.done) orderB.step({ maxUnits: 3 });
    if (!orderA.done) orderA.step({ maxUnits: 1 });
    if (!orderA.done) orderA.step({ maxUnits: 2 });
}
assert.deepEqual(normalize(orderA.result), expected);
assert.deepEqual(normalize(orderB.result), expected);

// A revisited building intellectually reuses the same stable descriptor. The cache
// returns clones so realization-side mutation cannot corrupt semantic memory.
const cache = createSemanticPlanCache({ maxEntries: 8 });
const key = semanticPlanCacheKey({ worldSeed: 7, chunkKey: '1,-2', entityId: 'building:stable', planKind: 'building-plan-authority' });
let compileCount = 0;
const firstVisit = cache.getOrCreate(key, () => {
    compileCount++;
    return { deterministicKey: '7:1,-2:building:stable', fingerprint: 'abc123', rooms: ['entry', 'work'] };
});
firstVisit.rooms.push('realization-only-mutation');
const revisit = cache.getOrCreate(key, () => {
    compileCount++;
    return { deterministicKey: 'rerolled', fingerprint: 'wrong' };
});
assert.equal(compileCount, 1, 'unload/revisit must hit stable semantic memory instead of rerolling');
assert.deepEqual(revisit, { deterministicKey: '7:1,-2:building:stable', fingerprint: 'abc123', rooms: ['entry', 'work'] });
assert.equal(cache.stats().hits, 1);

// Reuse the existing streamer priority lane instead of inventing a second queue.
// For equal refinement coverage state, center/near visible work must beat farther refinement.
const streamer = createWorldChunkStreamer({
    chunkSize: 10,
    worldSeed: 1,
    getPlayerPosition: () => ({ x: 0, y: 0, z: 0 }),
    renderRadiusChunks: 2,
    prefetchRadiusChunks: 2,
    retentionRadiusChunks: 4,
    refineAfterPrefetchReady: false,
    buildChunk: async () => ({}),
    refineChunk: async (_chunk, payload) => { payload.pending = false; return { progressed: true, steps: 1 }; },
    hasPendingRefinement: (_chunk, payload) => !!payload?.pending,
});
streamer.markChunkReady(1, 0, { pending: true });
streamer.markChunkReady(0, 0, { pending: true });
assert.equal(streamer.nearestRefinableChunk()?.key, '0,0', 'near visible semantic work must outrank farther refinement');
await streamer.dispose();

console.log('[semantic-planning-cooperative-selftest] PASS', {
    exteriorUnits: cooperativeRun.metrics.units,
    exteriorSlices: cooperativeRun.metrics.slices,
    maxUnitsPerSlice: cooperativeRun.metrics.maxUnitsPerSlice,
    cache: cache.stats(),
});
