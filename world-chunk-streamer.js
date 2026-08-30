 
 
 
 
 
 

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
    getPlayerHeading = null,
    renderRadiusChunks = 2,
    prefetchRadiusChunks = Math.max(3, renderRadiusChunks + 1),
    retentionRadiusChunks = Math.max(5, prefetchRadiusChunks + 2),
    buildChunk,
    commitChunk = null,
    setChunkVisibility = null,
    verifyChunkReady = null,
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
    let buildCount = 0;
    let totalBuildMs = 0;
    let totalCommitMs = 0;
    let lastPumpBuilt = 0;
    let lastPumpMs = 0;
    let visibleReadyCount = 0;
    let visibilityUpdates = 0;
    let commitToVisibleCount = 0;
    let totalCommitToVisibleMs = 0;
    let lastVisibilityCenterX = Number.NaN;
    let lastVisibilityCenterZ = Number.NaN;

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
            committedAt: 0,
            visibleAt: 0,
            visible: false,
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

    function chunkPriorityScore(chunk) {
        const p = getPlayerPosition();
        const dx = chunk.centerX - p.x;
        const dz = chunk.centerZ - p.z;
        const distance = Math.hypot(dx, dz);
        if (!distance || typeof getPlayerHeading !== 'function') return distance;
        const h = getPlayerHeading();
        const hx = Number(h?.x) || 0;
        const hz = Number(h?.z) || 0;
        const hLen = Math.hypot(hx, hz);
        if (!hLen) return distance;
        const forwardDot = (dx * hx + dz * hz) / (distance * hLen);
         
         
         
        return distance - Math.max(0, forwardDot) * chunkSize * 0.72;
    }

    function ringDistance(chunk, center) {
        return Math.max(Math.abs(chunk.x - center.x), Math.abs(chunk.z - center.z));
    }

    function shouldBeVisible(chunk, center = playerChunkCoords()) {
        return ringDistance(chunk, center) <= renderRadiusChunks;
    }

    function applyChunkVisibility(chunk, center = playerChunkCoords()) {
        if (!chunk || !chunk.payload) return false;
        const next = shouldBeVisible(chunk, center);
        const previous = !!chunk.visible;
        if (previous === next && chunk.visibilityInitialized) return next;
        if (setChunkVisibility) setChunkVisibility(chunk, chunk.payload, next);
        chunk.visible = next;
        chunk.visibilityInitialized = true;
        visibilityUpdates++;
        if (chunk.state === CHUNK_STATE.READY) {
            if (!previous && next) visibleReadyCount++;
            else if (previous && !next) visibleReadyCount = Math.max(0, visibleReadyCount - 1);
        }
        if (next && !chunk.visibleAt) {
            chunk.visibleAt = performance.now();
            if (chunk.committedAt) {
                commitToVisibleCount++;
                totalCommitToVisibleMs += Math.max(0, chunk.visibleAt - chunk.committedAt);
            }
        }
        return next;
    }

    function updateVisibility(center = playerChunkCoords(), force = false) {
        if (!force && center.x === lastVisibilityCenterX && center.z === lastVisibilityCenterZ) return visibleReadyCount;
        lastVisibilityCenterX = center.x;
        lastVisibilityCenterZ = center.z;
        for (const chunk of chunks.values()) {
            if (chunk.state !== CHUNK_STATE.READY || !chunk.payload) continue;
            applyChunkVisibility(chunk, center);
        }
        return visibleReadyCount;
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
        let bestScore = Infinity;
        let bestDistance = Infinity;
        for (const chunk of chunks.values()) {
            if (chunk.state !== CHUNK_STATE.QUEUED && chunk.state !== CHUNK_STATE.PLANNED) continue;
            const score = chunkPriorityScore(chunk);
            const d = chunkDistanceSq(chunk);
            if (score < bestScore || (score === bestScore && (d < bestDistance || (d === bestDistance && chunk.key < best?.key)))) {
                best = chunk;
                bestScore = score;
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
             
             
             
             
             
            const buildStarted = performance.now();
            const payload = await buildChunk(chunk);
            totalBuildMs += performance.now() - buildStarted;
            buildCount++;
            chunk.payload = payload ?? null;
            state(chunk, CHUNK_STATE.COMMITTING);
            const commitStarted = performance.now();
            if (commitChunk) await commitChunk(chunk, chunk.payload);
            totalCommitMs += performance.now() - commitStarted;
            chunk.committedAt = performance.now();
            const expectedVisible = applyChunkVisibility(chunk);
            if (verifyChunkReady) await verifyChunkReady(chunk, chunk.payload, expectedVisible);
            chunk.readyAt = performance.now();
            state(chunk, CHUNK_STATE.READY);
            if (chunk.visible) visibleReadyCount++;
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

         
        pending.sort((a, b) => ringDistance(b, center) - ringDistance(a, center));
        for (const chunk of pending) {
            state(chunk, CHUNK_STATE.UNLOADING);
            if (chunk.visible) {
                visibleReadyCount = Math.max(0, visibleReadyCount - 1);
                chunk.visible = false;
            }
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
        }
    }

    async function pump({ maxChunks = 1, maxMillis = Infinity } = {}) {
        if (busy || disposed) return false;
        busy = true;
        const pumpStarted = performance.now();
        try {
            const center = ensureNeighborhood();
            await unloadFarChunks(center);
            updateVisibility(center);
            let built = 0;
            const chunkCap = Number.isFinite(maxChunks) ? Math.max(0, Math.floor(maxChunks)) : Infinity;
            const timeCap = Number.isFinite(maxMillis) ? Math.max(0, maxMillis) : Infinity;
            while (built < chunkCap && !disposed) {
                 
                 
                 
                 
                ensureNeighborhood();
                const next = nearestQueuedChunk();
                if (!next) break;
                await buildOne(next, 'streaming');
                built++;
                 
                 
                 
                if (built > 0 && performance.now() - pumpStarted >= timeCap) break;
            }
            lastPumpBuilt = built;
            lastPumpMs = performance.now() - pumpStarted;
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

     
     
     
    function markChunkReady(x, z, payload = null) {
        const chunk = ensureChunk(x, z);
        chunk.payload = payload;
        chunk.readyAt = performance.now();
        chunk.committedAt = chunk.readyAt;
        chunk.visible = shouldBeVisible(chunk);
        chunk.visibilityInitialized = true;
        state(chunk, CHUNK_STATE.READY);
        if (chunk.visible) visibleReadyCount++;
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

    function readyWithinRadius(radius = renderRadiusChunks) {
        const center = playerChunkCoords();
        let ready = 0;
        let total = 0;
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) continue;
                total++;
                if (isChunkReady(center.x + dx, center.z + dz)) ready++;
            }
        }
        return { ready, total, complete: ready === total };
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
            visibleReady: visibleReadyCount,
            visibilityUpdates,
            unloads: unloadCount,
            pruned: pruneCount,
            failures: failureCount,
            busy,
            throughput: {
                builds: buildCount,
                totalBuildMs,
                totalCommitMs,
                avgBuildMs: buildCount ? totalBuildMs / buildCount : 0,
                avgCommitMs: buildCount ? totalCommitMs / buildCount : 0,
                avgCommitToVisibleMs: commitToVisibleCount ? totalCommitToVisibleMs / commitToVisibleCount : 0,
                lastPumpBuilt,
                lastPumpMs,
            },
            localRenderRing: readyWithinRadius(renderRadiusChunks),
            localPrefetchRing: readyWithinRadius(prefetchRadiusChunks),
            states: counts,
        };
    }

    async function dispose() {
        disposed = true;
        const all = [...chunks.values()].filter(c => c.state === CHUNK_STATE.READY);
        for (const chunk of all) {
            state(chunk, CHUNK_STATE.UNLOADING);
            if (chunk.visible) {
                visibleReadyCount = Math.max(0, visibleReadyCount - 1);
                chunk.visible = false;
            }
            try { await unloadChunk?.(chunk, chunk.payload); }
            finally { chunk.payload = null; state(chunk, CHUNK_STATE.UNLOADED); }
        }
        chunks.clear();
        readyCount = 0;
        visibleReadyCount = 0;
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
        updateVisibility,
        isChunkReady,
        isChunkVisible: (x, z) => !!chunks.get(keyOf(x, z))?.visible,
        isWorldPositionAvailable,
        getChunkAtWorld,
        readyWithinRadius,
        stats,
        dispose,
    };
}
