 
 
 
 
 
 

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

export const WORLD_SPACE_STATE = Object.freeze({
    AUTHORITATIVE: 'authoritative',
    UNKNOWN: 'unknown',
    FORBIDDEN: 'forbidden',
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
    refineChunk = null,
    hasPendingRefinement = null,
    refineAfterPrefetchReady = true,
    minimumVisibleRefinementTurns = 0,
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
    let worstBuildMs = 0;
    let worstCommitMs = 0;
    let lastPumpBuilt = 0;
    let lastPumpMs = 0;
    let visibleReadyCount = 0;
    let visibilityUpdates = 0;
    let commitToVisibleCount = 0;
    let totalCommitToVisibleMs = 0;
    let worstCommitToVisibleMs = 0;
    let lastVisibilityCenterX = Number.NaN;
    let lastVisibilityCenterZ = Number.NaN;
    let refinementSerial = 0;
    let refinementStepCount = 0;
    let refinementPumpCount = 0;
    let refinementFailureCount = 0;
    let totalRefinementMs = 0;
    let worstRefinementStepMs = 0;
    let lastPumpRefined = 0;
    let lastRefinementKind = null;

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
            lastRefinedSerial: 0,
            refinementTurns: 0,
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
                const commitToVisibleMs = Math.max(0, chunk.visibleAt - chunk.committedAt);
                totalCommitToVisibleMs += commitToVisibleMs;
                worstCommitToVisibleMs = Math.max(worstCommitToVisibleMs, commitToVisibleMs);
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
        let bestDemandPriority = -Infinity;
        let bestScore = Infinity;
        let bestDistance = Infinity;
        for (const chunk of chunks.values()) {
            if (chunk.state !== CHUNK_STATE.QUEUED && chunk.state !== CHUNK_STATE.PLANNED) continue;
            const demandPriority = Number(chunk.demandPriority) || 0;
            const score = chunkPriorityScore(chunk);
            const d = chunkDistanceSq(chunk);
            if (
                demandPriority > bestDemandPriority ||
                (demandPriority === bestDemandPriority && (
                    score < bestScore ||
                    (score === bestScore && (d < bestDistance || (d === bestDistance && chunk.key < best?.key)))
                ))
            ) {
                best = chunk;
                bestDemandPriority = demandPriority;
                bestScore = score;
                bestDistance = d;
            }
        }
        return best;
    }

    function chunkNeedsRefinement(chunk) {
        if (!chunk || chunk.state !== CHUNK_STATE.READY || !chunk.payload) return false;
        if (typeof refineChunk !== 'function') return false;
        if (typeof hasPendingRefinement === 'function') return !!hasPendingRefinement(chunk, chunk.payload);
        return false;
    }

    function nearestRefinableChunk(center = playerChunkCoords()) {
        if (refineAfterPrefetchReady && !readyWithinRadius(prefetchRadiusChunks).complete) return null;
        let best = null;
        let bestVisibilityRank = Infinity;
        let bestFloorRank = Infinity;
        let bestSerial = Infinity;
        let bestPriority = Infinity;
        for (const chunk of chunks.values()) {
            if (!chunkNeedsRefinement(chunk)) continue;
            if (ringDistance(chunk, center) > prefetchRadiusChunks) continue;
            const visibilityRank = shouldBeVisible(chunk, center) ? 0 : 1;
            // Before deep convergence, give every visible chunk a small first layer
            // of detail. Within that layer distance/heading still wins, so the world
            // grows outward rather than round-robin smearing across the horizon.
            const floorRank = visibilityRank === 0
                && minimumVisibleRefinementTurns > 0
                && chunk.refinementTurns < minimumVisibleRefinementTurns ? 0 : 1;
            const serial = chunk.lastRefinedSerial || 0;
            const priority = chunkPriorityScore(chunk);
            if (
                visibilityRank < bestVisibilityRank ||
                (visibilityRank === bestVisibilityRank && (
                    floorRank < bestFloorRank ||
                    (floorRank === bestFloorRank && (
                        priority < bestPriority ||
                        (priority === bestPriority && (serial < bestSerial || (serial === bestSerial && chunk.key < best?.key)))
                    ))
                ))
            ) {
                best = chunk;
                bestVisibilityRank = visibilityRank;
                bestFloorRank = floorRank;
                bestSerial = serial;
                bestPriority = priority;
            }
        }
        return best;
    }

    async function refineOne(chunk, { maxMillis = 2 } = {}) {
        if (!chunkNeedsRefinement(chunk) || disposed) return { progressed: false, steps: 0, complete: true };
        const started = performance.now();
        try {
            const result = await refineChunk(chunk, chunk.payload, { maxSteps: 1, maxMillis });
            const elapsed = performance.now() - started;
            totalRefinementMs += elapsed;
            refinementPumpCount++;
            worstRefinementStepMs = Math.max(worstRefinementStepMs, elapsed);
            const steps = Math.max(0, Number(result?.steps) || (result?.progressed ? 1 : 0));
            refinementStepCount += steps;
            if (steps > 0) {
                chunk.lastRefinedSerial = ++refinementSerial;
                chunk.refinementTurns++;
                lastRefinementKind = result?.lastKind ?? lastRefinementKind;
            }
            return { ...(result || {}), elapsedMs: elapsed, steps };
        } catch (error) {
            refinementFailureCount++;
            console.warn?.(`[world] chunk ${chunk.key} refinement failed`, error);
            return { progressed: false, steps: 0, complete: false, error };
        }
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
            const buildMs = performance.now() - buildStarted;
            totalBuildMs += buildMs;
            worstBuildMs = Math.max(worstBuildMs, buildMs);
            buildCount++;
            chunk.payload = payload ?? null;
            state(chunk, CHUNK_STATE.COMMITTING);
            const commitStarted = performance.now();
            if (commitChunk) await commitChunk(chunk, chunk.payload);
            const commitMs = performance.now() - commitStarted;
            totalCommitMs += commitMs;
            worstCommitMs = Math.max(worstCommitMs, commitMs);
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

    async function pump({
        maxChunks = 1,
        maxMillis = Infinity,
        maxRefinements = maxChunks,
        refineFirst = false,
        refinementBudgetMs = Infinity,
    } = {}) {
        if (busy || disposed) return false;
        busy = true;
        const pumpStarted = performance.now();
        try {
            const center = ensureNeighborhood();
            await unloadFarChunks(center);
            updateVisibility(center);
            let built = 0;
            let refined = 0;
            const chunkCap = Number.isFinite(maxChunks) ? Math.max(0, Math.floor(maxChunks)) : Infinity;
            const refinementCap = Number.isFinite(maxRefinements) ? Math.max(0, Math.floor(maxRefinements)) : Infinity;
            const timeCap = Number.isFinite(maxMillis) ? Math.max(0, maxMillis) : Infinity;
            const refinementTimeCap = Number.isFinite(refinementBudgetMs)
                ? Math.max(0, Math.min(timeCap, refinementBudgetMs))
                : timeCap;
            const renderReadyAtPumpStart = readyWithinRadius(renderRadiusChunks).complete;
            const prefetchReadyAtPumpStart = readyWithinRadius(prefetchRadiusChunks).complete;
            const canRefineBeforePrefetch = !refineAfterPrefetchReady && renderReadyAtPumpStart && !prefetchReadyAtPumpStart;

            const runRefinementTurns = async ({ visibleOnly = false, deadlineMs = timeCap } = {}) => {
                while (refined < refinementCap && performance.now() - pumpStarted < deadlineMs) {
                    const next = nearestRefinableChunk(center);
                    if (!next) break;
                    if (visibleOnly && !shouldBeVisible(next, center)) break;
                    const remaining = Number.isFinite(deadlineMs)
                        ? Math.max(0.1, deadlineMs - (performance.now() - pumpStarted))
                        : 2;
                    const result = await refineOne(next, { maxMillis: Math.min(2, remaining) });
                    if (!result?.progressed && !result?.steps) break;
                    refined += Math.max(1, result.steps || 0);
                }
            };

            // During the visible-detail sprint, spend a bounded slice on what the
            // player can actually see before constructing farther prefetch shells.
            if (!disposed && refineFirst && renderReadyAtPumpStart && refinementCap > 0) {
                await runRefinementTurns({ visibleOnly: true, deadlineMs: refinementTimeCap });
            } else if (!disposed && canRefineBeforePrefetch && refinementCap > 0) {
                // Legacy early-refinement behavior reserves one visible turn.
                const next = nearestRefinableChunk(center);
                if (next && shouldBeVisible(next, center)) {
                    const remaining = Number.isFinite(timeCap) ? Math.max(0.1, timeCap - (performance.now() - pumpStarted)) : 2;
                    const result = await refineOne(next, { maxMillis: Math.min(2, remaining) });
                    if (result?.progressed || result?.steps) refined += Math.max(1, result.steps || 0);
                }
            }

            while (built < chunkCap && !disposed && performance.now() - pumpStarted < timeCap) {
                ensureNeighborhood();
                const next = nearestQueuedChunk();
                if (!next) break;
                await buildOne(next, 'streaming');
                built++;
            }

            const prefetchReadyForRefinement = readyWithinRadius(prefetchRadiusChunks).complete;
            if (!disposed && refined < refinementCap && (!refineAfterPrefetchReady || prefetchReadyForRefinement)) {
                await runRefinementTurns({
                    visibleOnly: !prefetchReadyForRefinement,
                    deadlineMs: timeCap,
                });
            }
            lastPumpBuilt = built;
            lastPumpRefined = refined;
            lastPumpMs = performance.now() - pumpStarted;
            return built > 0 || refined > 0;
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

    // STREAMING / SANITY HANDOFF:
    // Unknown procedural space is not a wall. Readiness and physical prohibition
    // are different authority states. The player is allowed onto provisional
    // baseline support while the destination chunk is pulled to the front of work.
    // Keep the broader scheduling order from the player-centered write-up in mind:
    // survival -> next movement -> near field -> predictive corridor -> horizon -> everything else.
    function classifyWorldPosition(x, z) {
        const c = coordsForWorld(x, z);
        const chunk = chunks.get(keyOf(c.x, c.z));
        if (chunk?.state === CHUNK_STATE.READY) {
            return {
                state: WORLD_SPACE_STATE.AUTHORITATIVE,
                chunkKey: chunk.key,
                provisionalSupportY: null,
            };
        }
        return {
            state: WORLD_SPACE_STATE.UNKNOWN,
            chunkKey: keyOf(c.x, c.z),
            provisionalSupportY: 0,
        };
    }

    function requestWorldPosition(x, z, {
        headingX = null,
        headingZ = null,
        reason = 'player-frontier',
        neighborhood = 1,
    } = {}) {
        const c = coordsForWorld(x, z);
        const radius = Math.max(0, Math.floor(Number(neighborhood) || 0));
        const requested = [];
        const mark = (cx, cz, priority) => {
            const chunk = ensureChunk(cx, cz);
            if (chunk.state === CHUNK_STATE.PLANNED || chunk.state === CHUNK_STATE.UNLOADED) {
                state(chunk, CHUNK_STATE.QUEUED);
            }
            if (chunk.state === CHUNK_STATE.QUEUED || chunk.state === CHUNK_STATE.PLANNED) {
                chunk.demandPriority = Math.max(Number(chunk.demandPriority) || 0, priority);
                chunk.demandReason = reason;
                requested.push(chunk.key);
            }
            return chunk;
        };

        // Destination occupancy is the hard deadline. Nearby cells are insurance
        // against turning; one forward cell is predictive travel-corridor work.
        mark(c.x, c.z, 3);
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (!dx && !dz) continue;
                mark(c.x + dx, c.z + dz, 1);
            }
        }

        let hx = Number(headingX);
        let hz = Number(headingZ);
        if (!Number.isFinite(hx) || !Number.isFinite(hz)) {
            const h = typeof getPlayerHeading === 'function' ? getPlayerHeading() : null;
            hx = Number(h?.x) || 0;
            hz = Number(h?.z) || 0;
        }
        if (Math.abs(hx) > Math.abs(hz) && hx) mark(c.x + Math.sign(hx), c.z, 2);
        else if (hz) mark(c.x, c.z + Math.sign(hz), 2);

        return { chunkKey: keyOf(c.x, c.z), requested };
    }

    // Compatibility shim for the existing physics caller. Historically false meant
    // "solid". It now means only truly forbidden space; procedural unknown is
    // traversable and simultaneously demands its chunk.
    function isWorldPositionAvailable(x, z) {
        const classification = classifyWorldPosition(x, z);
        if (classification.state === WORLD_SPACE_STATE.UNKNOWN) {
            requestWorldPosition(x, z, { reason: 'player-frontier', neighborhood: 1 });
        }
        return classification.state !== WORLD_SPACE_STATE.FORBIDDEN;
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

    function refinementWithinRadius(radius = renderRadiusChunks) {
        const center = playerChunkCoords();
        let ready = 0;
        let total = 0;
        let pendingChunks = 0;
        let floorPendingChunks = 0;
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) continue;
                total++;
                const chunk = chunks.get(keyOf(center.x + dx, center.z + dz));
                if (!chunk || chunk.state !== CHUNK_STATE.READY || !chunk.payload) continue;
                ready++;
                const pending = chunkNeedsRefinement(chunk);
                if (pending) pendingChunks++;
                if (pending && chunk.refinementTurns < minimumVisibleRefinementTurns) floorPendingChunks++;
            }
        }
        return {
            ready, total, pendingChunks, floorPendingChunks,
            floorComplete: ready === total && floorPendingChunks === 0,
            complete: ready === total && pendingChunks === 0,
        };
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
                worstBuildMs,
                worstCommitMs,
                worstCommitToVisibleMs,
                lastPumpBuilt,
                lastPumpRefined,
                lastPumpMs,
            },
            refinement: {
                steps: refinementStepCount,
                pumps: refinementPumpCount,
                failures: refinementFailureCount,
                totalMs: totalRefinementMs,
                avgStepMs: refinementStepCount ? totalRefinementMs / refinementStepCount : 0,
                worstStepMs: worstRefinementStepMs,
                lastKind: lastRefinementKind,
                pendingChunks: [...chunks.values()].filter(chunkNeedsRefinement).length,
            },
            localRenderRing: readyWithinRadius(renderRadiusChunks),
            localRenderRefinement: refinementWithinRadius(renderRadiusChunks),
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
        nearestRefinableChunk,
        refineOne,
        buildSpawnChunk,
        markChunkReady,
        buildOne,
        pump,
        unloadFarChunks,
        updateVisibility,
        isChunkReady,
        isChunkVisible: (x, z) => !!chunks.get(keyOf(x, z))?.visible,
        classifyWorldPosition,
        requestWorldPosition,
        isWorldPositionAvailable,
        getChunkAtWorld,
        readyWithinRadius,
        refinementWithinRadius,
        stats,
        dispose,
    };
}
