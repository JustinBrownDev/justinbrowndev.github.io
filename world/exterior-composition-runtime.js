import { exteriorTaskPriorityKey, exteriorTaskVisualTier } from './exterior-spectacle-priority.js';

export const EXTERIOR_COMPOSITION_RUNTIME_SCHEMA = 'jweb.exterior-composition-runtime.v1';
export const EXTERIOR_COVERAGE_DEBUG_RADIUS = 24;

function tierCounts() {
    return { spectacle: 0, identity: 0, macro: 0, medium: 0, micro: 0 };
}

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function entityFor(payload, entityId) {
    return payload?.entities?.find(entity => String(entity?.id ?? '') === String(entityId ?? '')) ?? null;
}

function defaultTaskPosition(payload, task) {
    if ([task?.semanticPlacement?.x, task?.semanticPlacement?.z].every(Number.isFinite)) return task.semanticPlacement;
    const entity = entityFor(payload, task?.entityId);
    if ([entity?.x, entity?.z].every(Number.isFinite)) return entity;
    if ([task?.x, task?.z].every(Number.isFinite)) return task;
    return null;
}

function updateCoverageFloorCompletion(runtime) {
    if (!runtime) return;
    const entries = Object.values(runtime.perEntity ?? {}).filter(item => item.coverageFloorTarget > 0);
    runtime.coverageFloorEntityTarget = entries.length;
    runtime.coverageFloorEntitiesSettled = entries.filter(item =>
        item.coverageRequiredPublished + item.coverageRequiredMissed >= item.coverageFloorTarget).length;
    runtime.coverageFloorComplete = runtime.coverageFloorEntitiesSettled >= runtime.coverageFloorEntityTarget;
}

export function createExteriorCoverageRuntime(exteriorComposition) {
    const perEntity = {};
    for (const [entityId, plan] of Object.entries(exteriorComposition?.stats?.perEntity ?? {})) {
        perEntity[entityId] = {
            style: plan.style ?? 'mixed',
            densityCeiling: finite(plan.densityCeiling, finite(plan.accepted)),
            coverageFloorTarget: finite(plan.coverageFloor?.planned),
            attempted: 0,
            published: 0,
            firstPassPublished: 0,
            coverageRequiredPublished: 0,
            coverageRequiredMissed: 0,
            plannedByTier: { ...tierCounts(), ...(plan.tierCounts ?? {}) },
            attemptedByTier: tierCounts(),
            publishedByTier: tierCounts(),
            missedByTier: tierCounts(),
            missedByReason: {},
            plannedLargeMacro: finite(plan.plannedLargeMacro),
            attemptedLargeMacro: 0,
            publishedLargeMacro: 0,
            missedLargeMacro: 0,
        };
    }
    const runtime = {
        schema: exteriorComposition?.stats?.runtimeSchema ?? EXTERIOR_COMPOSITION_RUNTIME_SCHEMA,
        perEntity,
        attemptedByTier: tierCounts(),
        publishedByTier: tierCounts(),
        missedByTier: tierCounts(),
        missedByReason: {},
        attemptedLargeMacro: 0,
        publishedLargeMacro: 0,
        missedLargeMacro: 0,
        lastPublishedTier: null,
        lastPublishedWave: null,
        lastPublishedEntityId: null,
        coverageRequiredMisses: 0,
        microAheadOfCoverageViolations: 0,
        coverageFloorEntityTarget: 0,
        coverageFloorEntitiesSettled: 0,
        coverageFloorComplete: false,
    };
    updateCoverageFloorCompletion(runtime);
    return runtime;
}

export function recordExteriorCoverageResult(state, task, didPublish, missReason = null) {
    const composition = task?.exteriorComposition;
    const runtime = state?.exteriorCoverage;
    if (!composition || !runtime) return;
    const entityId = String(task.entityId ?? composition.entityId ?? '');
    const entity = runtime.perEntity?.[entityId];
    if (!entity) return;
    const tier = composition.tier ?? exteriorTaskVisualTier(task);
    const largeMacro = ['large', 'macro'].includes(String(task?.exteriorRequest?.desiredScaleClass ?? ''));
    entity.attempted++;
    entity.attemptedByTier[tier] = (entity.attemptedByTier[tier] ?? 0) + 1;
    runtime.attemptedByTier[tier] = (runtime.attemptedByTier[tier] ?? 0) + 1;
    if (largeMacro) { entity.attemptedLargeMacro++; runtime.attemptedLargeMacro++; }
    if (didPublish) {
        entity.published++;
        entity.publishedByTier[tier] = (entity.publishedByTier[tier] ?? 0) + 1;
        runtime.publishedByTier[tier] = (runtime.publishedByTier[tier] ?? 0) + 1;
        if (task.firstPassBundle) entity.firstPassPublished++;
        if (composition.coverageRequired) entity.coverageRequiredPublished++;
        if (largeMacro) { entity.publishedLargeMacro++; runtime.publishedLargeMacro++; }
        runtime.lastPublishedTier = tier;
        runtime.lastPublishedWave = Number.isFinite(composition.wave) ? composition.wave : null;
        runtime.lastPublishedEntityId = entityId;
    } else {
        entity.missedByTier[tier] = (entity.missedByTier[tier] ?? 0) + 1;
        runtime.missedByTier[tier] = (runtime.missedByTier[tier] ?? 0) + 1;
        const reason = String(missReason ?? 'unclassified');
        entity.missedByReason[reason] = (entity.missedByReason[reason] ?? 0) + 1;
        runtime.missedByReason[reason] = (runtime.missedByReason[reason] ?? 0) + 1;
        if (largeMacro) { entity.missedLargeMacro++; runtime.missedLargeMacro++; }
        if (composition.coverageRequired) {
            entity.coverageRequiredMissed++;
            runtime.coverageRequiredMisses++;
        }
    }
    updateCoverageFloorCompletion(runtime);
}

// This counter is deliberately a canary, not another scheduling policy. The
// actual breadth-before-depth behavior lives in exteriorTaskPriorityKey. If a
// future scheduler regression ever selects micro while an equal-or-nearer
// neighborhood still has a required coarse-floor task, this becomes non-zero.
export function noteMicroAheadCoverageViolation({
    state,
    payload,
    playerPosition,
    chosen,
    chosenPriorityKey = null,
    remainingTasks = null,
    taskPositionFor = null,
} = {}) {
    if (chosen?.exteriorComposition?.tier !== 'micro' || !state?.exteriorCoverage) return false;
    const positionFor = typeof taskPositionFor === 'function'
        ? taskPositionFor
        : task => defaultTaskPosition(payload, task);
    const chosenKey = chosenPriorityKey ?? exteriorTaskPriorityKey(chosen, {
        playerPosition,
        taskPosition: positionFor(chosen),
        firstPassIncomplete: !state.firstPassComplete,
    });
    const chosenNeighborhoodBand = chosenKey?.[1];
    if (!Number.isFinite(chosenNeighborhoodBand)) return false;
    const tasks = remainingTasks ?? state.tasks?.slice(state.cursor) ?? [];
    const coverageWasWaiting = tasks.some(task => {
        if (task === chosen || !task?.exteriorComposition?.coverageRequired) return false;
        const key = exteriorTaskPriorityKey(task, {
            playerPosition,
            taskPosition: positionFor(task),
            firstPassIncomplete: !state.firstPassComplete,
        });
        return key[1] <= chosenNeighborhoodBand;
    });
    if (coverageWasWaiting) state.exteriorCoverage.microAheadOfCoverageViolations++;
    return coverageWasWaiting;
}

export function exteriorCoverageSnapshot(state, payload, playerPosition) {
    const runtime = state?.exteriorCoverage;
    if (!runtime) return null;
    const hasPlayer = Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.z);
    const nearbyIds = Object.keys(runtime.perEntity).filter(entityId => {
        if (!hasPlayer) return true;
        const entity = entityFor(payload, entityId);
        if (![entity?.x, entity?.z].every(Number.isFinite)) return false;
        return Math.hypot(entity.x - playerPosition.x, entity.z - playerPosition.z) <= EXTERIOR_COVERAGE_DEBUG_RADIUS;
    });
    const nearby = nearbyIds.map(entityId => runtime.perEntity[entityId]);
    const nearbySet = new Set(nearbyIds);
    const pendingCoverageEntities = new Set();
    const pendingByTier = tierCounts();
    let pendingLargeMacro = 0;
    for (let index = finite(state.cursor); index < (state.tasks?.length ?? 0); index++) {
        const task = state.tasks[index];
        const composition = task?.exteriorComposition;
        if (!composition) continue;
        const entityId = String(task.entityId ?? '');
        if (!nearbySet.has(entityId)) continue;
        const tier = composition.tier ?? exteriorTaskVisualTier(task);
        pendingByTier[tier] = (pendingByTier[tier] ?? 0) + 1;
        if (['large', 'macro'].includes(String(task?.exteriorRequest?.desiredScaleClass ?? ''))) pendingLargeMacro++;
        if (composition.coverageRequired) pendingCoverageEntities.add(entityId);
    }
    const topConsumers = Object.entries(runtime.perEntity)
        .map(([entityId, value]) => ({ entityId, style: value.style, published: value.published }))
        .sort((a, b) => b.published - a.published || a.entityId.localeCompare(b.entityId))
        .slice(0, 5);
    const acceptedLargeMacro = nearby.reduce((sum, item) => sum + item.plannedLargeMacro, 0);
    const attemptedLargeMacro = nearby.reduce((sum, item) => sum + item.attemptedLargeMacro, 0);
    const publishedLargeMacro = nearby.reduce((sum, item) => sum + item.publishedLargeMacro, 0);
    const missedLargeMacro = nearby.reduce((sum, item) => sum + item.missedLargeMacro, 0);
    const missedByReason = {};
    for (const item of nearby) for (const [reason, count] of Object.entries(item.missedByReason)) missedByReason[reason] = (missedByReason[reason] ?? 0) + count;
    const upgrades = payload?.semanticContextUpgradeTelemetry ?? null;
    const semanticContextUpgrades = upgrades ? {
        queued: finite(upgrades.queued), pending: finite(upgrades.pending), loaded: finite(upgrades.loaded), realized: finite(upgrades.realized),
        loadFailed: finite(upgrades.loadFailed), fitRejected: finite(upgrades.fitRejected), structuralRejected: finite(upgrades.structuralRejected),
        invalidBounds: finite(upgrades.invalidBounds), cancelled: finite(upgrades.cancelled), cache: { ...(upgrades.cache ?? {}) },
        byTier: { ...(upgrades.byTier ?? {}) }, lastLatencyMs: finite(upgrades.lastLatencyMs), maxLatencyMs: finite(upgrades.maxLatencyMs),
        averageLatencyMs: finite(upgrades.settledCount) > 0 ? finite(upgrades.settledLatencyMsTotal) / finite(upgrades.settledCount) : 0,
    } : null;
    return {
        radius: EXTERIOR_COVERAGE_DEBUG_RADIUS,
        nearbyBuildings: nearby.length,
        firstPassIdentity: nearby.filter(item => item.firstPassPublished > 0).length,
        coverageFloorComplete: nearby.filter(item => item.coverageRequiredPublished >= item.coverageFloorTarget).length,
        coverageFloorSettled: nearby.filter(item => item.coverageRequiredPublished + item.coverageRequiredMissed >= item.coverageFloorTarget).length,
        macroCoverage: nearby.filter(item => item.publishedByTier.macro > 0).length,
        spectacle: nearby.filter(item => item.publishedByTier.spectacle > 0).length,
        pendingCoverageFloorBuildings: pendingCoverageEntities.size,
        pendingByTier,
        acceptedLargeMacro,
        pendingLargeMacro,
        attemptedLargeMacro,
        publishedLargeMacro,
        missedLargeMacro,
        missedByReason,
        semanticContextUpgrades,
        currentTier: runtime.lastPublishedTier,
        currentWave: runtime.lastPublishedWave,
        topConsumers,
        publishedByTier: { ...runtime.publishedByTier },
        coverageRequiredMisses: runtime.coverageRequiredMisses,
        microAheadOfCoverageViolations: runtime.microAheadOfCoverageViolations,
    };
}
