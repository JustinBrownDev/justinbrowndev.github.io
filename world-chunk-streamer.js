// Coordinate-addressed world streaming core.
//
// The world is not a boot phase. A chunk is the atomic unit of reality:
// planned -> queued -> building -> committing -> ready -> unloading -> unloaded.
// The spawn chunk is the only startup gate. Everything else is selected by
// player distance and can be discarded/rebuilt deterministically.

import {
    createChunkDescriptor,
    deterministicChunkSeed,
    hashString32,
    worldChunkKey,
    worldWeirdnessAt,
} from './world-contract.js';

export { deterministicChunkSeed, hashString32, worldWeirdnessAt } from './world-contract.js';

export const CHUNK_STATE = Object.freeze({
    PLANNED: 'planned',
    QUEUED: 'queued',
    BUILDING: 'building',
    COMMITTING: 'committing',
    READY: 'ready',
    UNLOADING: 'unloading',
    UNLOADED: 'unloaded',
    FAILED: 'failed',
});

export function createWorldChunkStreamer({
    chunkSize,
    worldSeed = 0,
    getPlayerPosition,
    renderRadiusChunks = 2,
    prefetchRadiusChunks = Math.max(3, renderRadiusChunks + 1),
    retentionRadiusChunks = Math.max(5, prefetchRadiusChunks + 2),
    buildChunk,
    commitChunk = null,
    unloadChunk = null,
    yieldControl = null,
    onChunkState = null,
    weirdness = {},
    pinnedChunkKeys = [],
} = {}) {
    if (!(chunkSize > 0)) throw new Error('createWorldChunkStreamer requires chunkSize > 0');
    if (typeof getPlayerPosition !== 'function') throw new Error('createWorldChunkStreamer requires getPlayerPosition()');
    if (typeof buildChunk !== 'function') throw new Error('createWorldChunkStreamer requires buildChunk()');

    const chunks = new Map();
    const pinned = new Set(pinnedChunkKeys.map(String));
    let busy = false;
    let disposed = false;
    let buildSerial = 0;
    let readyCount = 0;
    let unloadCount = 0;
    let pruneCount = 0;
    let failureCount = 0;

    const keyOf = worldChunkKey;
    const coordsForWorld = (x, z) => ({ x: Math.floor((x + chunkSize * 0.5) / chunkSize), z: Math.floor((z + chunkSize * 0.5) / chunkSize) });

    function state(chunk, next) {
        if (!chunk || chunk.state === next) return;
        if (chunk.state === CHUNK_STATE.READY) readyCount--;
        chunk.state = next;
        if (next === CHUNK_STATE.READY) readyCount++;
        chunk.updatedAt = performance.now();
        onChunkState?.(chunk, next);
    }

    function ensureChunk(x, z) {
        const key = keyOf(x, z);
        let chunk = chunks.get(key);
        if (chunk && chunk.state !== CHUNK_STATE.UNLOADED) return chunk;
        const descriptor = createChunkDescriptor({
            worldSeed, chunkX: x, chunkZ: z, chunkSize, weirdness,
        });
        chunk = {
            ...descriptor,
            descriptor,
            state: CHUNK_STATE.PLANNED,
            buildOrder: 0,
            createdAt: performance.now(),
            updatedAt: performance.now(),
            readyAt: 0,
            payload: null,
            error: null,
        };
        chunks.set(key, chunk);
        onChunkState?.(chunk, CHUNK_STATE.PLANNED);
        return chunk;
    }

    function playerChunkCoords() {
        const p = getPlayerPosition();
        return coordsForWorld(p.x, p.z);
    }

    function chunkDistanceSq(chunk) {
        const p = getPlayerPosition();
        const dx = chunk.centerX - p.x;
        const dz = chunk.centerZ - p.z;
        return dx * dx + dz * dz;
    }

    function ringDistance(chunk, center) {
        return Math.max(Math.abs(chunk.x - center.x), Math.abs(chunk.z - center.z));
    }

    function ensureNeighborhood() {
        const center = playerChunkCoords();
        for (let dz = -prefetchRadiusChunks; dz <= prefetchRadiusChunks; dz++) {
            for (let dx = -prefetchRadiusChunks; dx <= prefetchRadiusChunks; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) > prefetchRadiusChunks) continue;
                const chunk = ensureChunk(center.x + dx, center.z + dz);
                if (chunk.state === CHUNK_STATE.PLANNED || chunk.state === CHUNK_STATE.UNLOADED) {
                    state(chunk, CHUNK_STATE.QUEUED);
                }
            }
        }
        return center;
    }

    function nearestQueuedChunk() {
        let best = null;
        let bestDistance = Infinity;
        for (const chunk of chunks.values()) {
            if (chunk.state !== CHUNK_STATE.QUEUED && chunk.state !== CHUNK_STATE.PLANNED) continue;
            const d = chunkDistanceSq(chunk);
            if (d < bestDistance || (d === bestDistance && chunk.key < best?.key)) {
                best = chunk;
                bestDistance = d;
            }
        }
        return best;
    }

    async function buildOne(chunk, label = 'world chunk') {
        if (!chunk || disposed) return null;
        if (chunk.state === CHUNK_STATE.READY) return chunk;
        if (chunk.state === CHUNK_STATE.BUILDING || chunk.state === CHUNK_STATE.COMMITTING) return chunk;

        state(chunk, CHUNK_STATE.BUILDING);
        chunk.buildOrder = ++buildSerial;
        try {
            const payload = await buildChunk(chunk);
            chunk.payload = payload ?? null;
            state(chunk, CHUNK_STATE.COMMITTING);
            if (commitChunk) await commitChunk(chunk, chunk.payload);
            chunk.readyAt = performance.now();
            state(chunk, CHUNK_STATE.READY);
            if (yieldControl) await yieldControl(`${label} ${chunk.key} ready`, 1, 1);
            return chunk;
        } catch (error) {
            chunk.error = error;
            failureCount++;
            state(chunk, CHUNK_STATE.FAILED);
            throw error;
        }
    }

    async function unloadFarChunks(center = playerChunkCoords()) {
        const pending = [];
        const disposable = [];
        for (const chunk of chunks.values()) {
            if (pinned.has(chunk.key)) continue;
            if (ringDistance(chunk, center) <= retentionRadiusChunks) continue;

            if (chunk.state === CHUNK_STATE.READY) {
                pending.push(chunk);
                continue;
            }

            // These states own no committed scene/physics resources. Dropping
            // them is both safe and important: otherwise a long walk leaves an
            // ever-growing history of stale queue records behind the player.
            if (
                chunk.state === CHUNK_STATE.PLANNED ||
                chunk.state === CHUNK_STATE.QUEUED ||
                chunk.state === CHUNK_STATE.UNLOADED ||
                chunk.state === CHUNK_STATE.FAILED
            ) {
                disposable.push(chunk);
            }
        }

        for (const chunk of disposable) {
            chunks.delete(chunk.key);
            pruneCount++;
        }

        // Farthest first gets memory back fastest if the player teleported.
        pending.sort((a, b) => ringDistance(b, center) - ringDistance(a, center));
        for (const chunk of pending) {
            state(chunk, CHUNK_STATE.UNLOADING);
            try {
                await unloadChunk?.(chunk, chunk.payload);
            } finally {
                chunk.payload = null;
                chunk.error = null;
                unloadCount++;
                state(chunk, CHUNK_STATE.UNLOADED);
            }
            chunks.delete(chunk.key);
            pruneCount++;
            if (yieldControl) await yieldControl(`unloading world chunk ${chunk.key}`, 1, pending.length);
        }
    }

    async function pump({ maxChunks = 1 } = {}) {
        if (busy || disposed) return false;
        busy = true;
        try {
            const center = ensureNeighborhood();
            await unloadFarChunks(center);
            let built = 0;
            while (built < maxChunks && !disposed) {
                const next = nearestQueuedChunk();
                if (!next) break;
                await buildOne(next, 'streaming');
                built++;
            }
            return built > 0;
        } finally {
            busy = false;
        }
    }

    async function buildSpawnChunk() {
        const center = playerChunkCoords();
        const chunk = ensureChunk(center.x, center.z);
        if (chunk.state === CHUNK_STATE.PLANNED) state(chunk, CHUNK_STATE.QUEUED);
        return buildOne(chunk, 'spawn chunk');
    }

    // Adopt geometry that was authored by a specialized bootstrap generator.
    // This is how the rich hand-authored spawn district becomes logical chunk
    // (0,0) without rebuilding it through the generic infinite generator.
    function markChunkReady(x, z, payload = null) {
        const chunk = ensureChunk(x, z);
        chunk.payload = payload;
        chunk.readyAt = performance.now();
        state(chunk, CHUNK_STATE.READY);
        return chunk;
    }

    function isChunkReady(x, z) {
        return chunks.get(keyOf(x, z))?.state === CHUNK_STATE.READY;
    }

    function isWorldPositionAvailable(x, z) {
        const c = coordsForWorld(x, z);
        return isChunkReady(c.x, c.z);
    }

    function getChunkAtWorld(x, z) {
        const c = coordsForWorld(x, z);
        return chunks.get(keyOf(c.x, c.z)) ?? null;
    }

    function stats() {
        const counts = {};
        for (const name of Object.values(CHUNK_STATE)) counts[name] = 0;
        for (const chunk of chunks.values()) counts[chunk.state] = (counts[chunk.state] ?? 0) + 1;
        return {
            chunkSize,
            renderRadiusChunks,
            prefetchRadiusChunks,
            retentionRadiusChunks,
            pinned: pinned.size,
            chunks: chunks.size,
            ready: readyCount,
            unloads: unloadCount,
            pruned: pruneCount,
            failures: failureCount,
            busy,
            states: counts,
        };
    }

    async function dispose() {
        disposed = true;
        const all = [...chunks.values()].filter(c => c.state === CHUNK_STATE.READY);
        for (const chunk of all) {
            state(chunk, CHUNK_STATE.UNLOADING);
            try { await unloadChunk?.(chunk, chunk.payload); }
            finally { chunk.payload = null; state(chunk, CHUNK_STATE.UNLOADED); }
        }
        chunks.clear();
        readyCount = 0;
    }

    return {
        chunkSize,
        chunks,
        ensureChunk,
        ensureNeighborhood,
        playerChunkCoords,
        nearestQueuedChunk,
        buildSpawnChunk,
        markChunkReady,
        buildOne,
        pump,
        unloadFarChunks,
        isChunkReady,
        isWorldPositionAvailable,
        getChunkAtWorld,
        stats,
        dispose,
    };
}

// Compatibility wrapper for the earlier finite scheduler API. Existing tools
// can keep using it while new code moves to createWorldChunkStreamer().
export function createWorldChunkScheduler(options = {}) {
    const jobsByChunk = new Map();
    const streamer = createWorldChunkStreamer({
        ...options,
        buildChunk: async chunk => {
            const jobs = jobsByChunk.get(chunk.key) ?? [];
            for (let i = 0; i < jobs.length; i++) {
                await jobs[i].run({ chunk, job: jobs[i] });
                if (options.yieldControl) await options.yieldControl(`world chunk ${chunk.key}`, i + 1, jobs.length);
            }
            return null;
        },
        commitChunk: options.onChunkCommit,
    });
    let nextJobId = 1;
    function registerJob({ id = null, points = [], run, phase = 'structure', metadata = null } = {}) {
        if (typeof run !== 'function') throw new Error('world chunk job requires run()');
        const job = { id: id ?? `job:${nextJobId++}`, points, run, phase, metadata, status: 'pending' };
        const seen = new Set();
        for (const point of points) {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
            const chunk = streamer.ensureChunk(Math.floor((point.x + streamer.chunkSize * 0.5) / streamer.chunkSize), Math.floor((point.z + streamer.chunkSize * 0.5) / streamer.chunkSize));
            if (seen.has(chunk.key)) continue;
            seen.add(chunk.key);
            if (!jobsByChunk.has(chunk.key)) jobsByChunk.set(chunk.key, []);
            jobsByChunk.get(chunk.key).push(job);
        }
        if (!seen.size) throw new Error('world chunk job requires at least one finite point');
        return job;
    }
    return {
        ...streamer,
        registerJob,
        buildChunk: streamer.buildOne,
        buildNearestChunk: async options => {
            streamer.ensureNeighborhood();
            const next = streamer.nearestQueuedChunk();
            return next ? streamer.buildOne(next, options?.label) : null;
        },
        hasUnreadyChunks: () => [...streamer.chunks.values()].some(c => c.state !== CHUNK_STATE.READY),
        chunkForWorld: streamer.getChunkAtWorld,
        stats: streamer.stats,
        jobs: jobsByChunk,
    };
}
