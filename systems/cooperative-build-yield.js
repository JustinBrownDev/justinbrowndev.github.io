// Small cooperative scheduler used by world construction.  A caller invokes the
// returned function at semantic boundaries (topology, landmark, compound/site,
// enrichment stage).  It yields to the next frame only after the configured CPU
// slice has been consumed, so cheap steps stay cheap while long build streams stop
// monopolizing the main thread.

function defaultNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

function defaultSchedule() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
    });
}

export function createCooperativeBuildYield({
    budgetMs = 5.5,
    warnUnitMs = 12,
    label = 'world-build',
    now = defaultNow,
    schedule = defaultSchedule,
    onSlowUnit = null,
    onYield = null,
} = {}) {
    const safeBudget = Math.max(1, Number(budgetMs) || 5.5);
    const safeWarn = Math.max(safeBudget, Number(warnUnitMs) || 12);
    let sliceStartedAt = now();
    let lastBoundaryAt = sliceStartedAt;
    let yieldCount = 0;
    let boundaryCount = 0;
    let worstUnitMs = 0;
    let worstSliceMs = 0;
    let lastStage = null;

    const checkpoint = async (stage = 'checkpoint', current = 0, total = 0) => {
        const at = now();
        const unitMs = Math.max(0, at - lastBoundaryAt);
        const sliceMs = Math.max(0, at - sliceStartedAt);
        lastBoundaryAt = at;
        boundaryCount++;
        lastStage = stage;
        worstUnitMs = Math.max(worstUnitMs, unitMs);
        worstSliceMs = Math.max(worstSliceMs, sliceMs);

        if (unitMs >= safeWarn) {
            const detail = { label, stage, current, total, unitMs, sliceMs, budgetMs: safeBudget };
            if (typeof onSlowUnit === 'function') onSlowUnit(detail);
            else if (typeof console !== 'undefined') {
                console.warn(`[world-build-stage] ${label} ${stage} ${unitMs.toFixed(1)}ms · ${current}/${total} · slice=${sliceMs.toFixed(1)}ms`);
            }
        }

        if (sliceMs < safeBudget) return false;
        await schedule();
        const resumedAt = now();
        yieldCount++;
        sliceStartedAt = resumedAt;
        lastBoundaryAt = resumedAt;
        onYield?.({ label, stage, current, total, unitMs, sliceMs, yieldCount });
        return true;
    };

    checkpoint.snapshot = () => Object.freeze({
        label,
        budgetMs: safeBudget,
        warnUnitMs: safeWarn,
        boundaryCount,
        yieldCount,
        worstUnitMs,
        worstSliceMs,
        lastStage,
    });
    checkpoint.resetSlice = () => {
        const at = now();
        sliceStartedAt = at;
        lastBoundaryAt = at;
    };
    return checkpoint;
}
