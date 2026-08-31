export const SEMANTIC_PLAN_RUNTIME_SCHEMA = 'jweb.semantic-plan-runtime.v1';

function defaultClone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function semanticPlanCacheKey({
    worldSeed = 0,
    chunkKey = '0,0',
    entityId = 'building',
    planKind = 'semantic-plan',
} = {}) {
    return `${planKind}:${Number(worldSeed) >>> 0}:${String(chunkKey)}:${String(entityId)}`;
}

export function createSemanticPlanCache({ maxEntries = 2048, clone = defaultClone } = {}) {
    const capacity = Math.max(1, Math.floor(Number(maxEntries) || 1));
    const entries = new Map();
    let hits = 0;
    let misses = 0;
    let writes = 0;
    let evictions = 0;

    const touch = key => {
        if (!entries.has(key)) return;
        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
    };

    const trim = () => {
        while (entries.size > capacity) {
            const oldest = entries.keys().next().value;
            entries.delete(oldest);
            evictions++;
        }
    };

    const read = key => {
        const stableKey = String(key);
        if (!entries.has(stableKey)) {
            misses++;
            return null;
        }
        hits++;
        touch(stableKey);
        return clone(entries.get(stableKey));
    };

    const write = (key, descriptor) => {
        const stableKey = String(key);
        entries.delete(stableKey);
        // Store an isolated semantic snapshot, but let the first realization keep
        // the descriptor it just compiled. Revisits clone from semantic memory.
        entries.set(stableKey, clone(descriptor));
        writes++;
        trim();
        return descriptor;
    };

    const getOrCreate = (key, compile) => {
        const cached = read(key);
        if (cached != null) return cached;
        if (typeof compile !== 'function') throw new Error('semantic plan cache miss requires compile()');
        return write(key, compile());
    };

    return {
        schema: SEMANTIC_PLAN_RUNTIME_SCHEMA,
        has: key => entries.has(String(key)),
        get: read,
        set: write,
        getOrCreate,
        delete: key => entries.delete(String(key)),
        clear() { entries.clear(); },
        stats() {
            return {
                schema: SEMANTIC_PLAN_RUNTIME_SCHEMA,
                entries: entries.size,
                maxEntries: capacity,
                hits,
                misses,
                writes,
                evictions,
            };
        },
    };
}

export async function runCooperativeCompiler(compiler, {
    yieldControl = null,
    maxUnitsPerSlice = 1,
    label = 'semantic-plan',
} = {}) {
    if (!compiler || typeof compiler.step !== 'function') {
        throw new Error('runCooperativeCompiler requires a compiler with step()');
    }
    const sliceCap = Math.max(1, Math.floor(Number(maxUnitsPerSlice) || 1));
    let slices = 0;
    let units = 0;
    let maxUnits = 0;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    while (!compiler.done) {
        const result = compiler.step({ maxUnits: sliceCap }) ?? {};
        const completed = Math.max(0, Number(result.units) || 0);
        slices++;
        units += completed;
        maxUnits = Math.max(maxUnits, completed);
        if (!compiler.done && typeof yieldControl === 'function') {
            await yieldControl(
                `${label}:${String(result.phase ?? compiler.phase ?? 'planning')}`,
                Number(result.unitsCompleted ?? units) || units,
                Number(result.totalUnits ?? compiler.totalUnits) || undefined,
            );
        }
        if (!compiler.done && completed === 0) {
            throw new Error(`cooperative compiler stalled during ${String(result.phase ?? compiler.phase ?? 'unknown')}`);
        }
    }

    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
        result: compiler.result,
        metrics: {
            schema: SEMANTIC_PLAN_RUNTIME_SCHEMA,
            slices,
            units,
            maxUnitsPerSlice: maxUnits,
            requestedUnitsPerSlice: sliceCap,
            elapsedMs: Math.max(0, finishedAt - startedAt),
        },
    };
}
