 
 
 
 
 

export function createPriorityLoadQueue({ concurrency = 4, paused = false, onState = null } = {}) {
    let maxConcurrency = Math.max(1, Math.floor(Number(concurrency) || 1));
    let isPaused = !!paused;
    let active = 0;
    let serial = 0;
    let completed = 0;
    let failed = 0;
    let scheduled = false;
    const pending = [];
    const idleWaiters = new Set();

    function emit() { onState?.(stats()); }

    function priorityOf(task) {
        try {
            const value = typeof task.priority === 'function' ? task.priority() : task.priority;
            return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
        } catch {
            return Number.POSITIVE_INFINITY;
        }
    }

    function bestPendingIndex() {
        let best = -1;
        let bestPriority = Number.POSITIVE_INFINITY;
        let bestSerial = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pending.length; i++) {
            const task = pending[i];
            const p = priorityOf(task);
            if (p < bestPriority || (p === bestPriority && task.serial < bestSerial)) {
                best = i;
                bestPriority = p;
                bestSerial = task.serial;
            }
        }
        return best;
    }

    function resolveIdleIfNeeded() {
        if (active || pending.length) return;
        for (const resolve of idleWaiters) resolve();
        idleWaiters.clear();
    }

    function schedulePump() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            pump();
        });
    }

    function start(task) {
        active++;
        emit();
        Promise.resolve()
            .then(task.run)
            .then(value => {
                completed++;
                task.resolve(value);
            }, error => {
                failed++;
                task.reject(error);
            })
            .finally(() => {
                active--;
                emit();
                schedulePump();
                resolveIdleIfNeeded();
            });
    }

    function pump() {
        if (isPaused) {
            emit();
            return;
        }
        while (active < maxConcurrency && pending.length) {
            const index = bestPendingIndex();
            if (index < 0) break;
            const [task] = pending.splice(index, 1);
            start(task);
        }
        resolveIdleIfNeeded();
    }

    function enqueue({ key = null, priority = 0, run } = {}) {
        if (typeof run !== 'function') throw new Error('priority load queue task requires run()');
        return new Promise((resolve, reject) => {
            pending.push({ key, priority, run, resolve, reject, serial: ++serial, queuedAt: performance.now?.() ?? Date.now() });
            emit();
            schedulePump();
        });
    }

    function pause() {
        isPaused = true;
        emit();
    }

    function resume() {
        if (!isPaused) return;
        isPaused = false;
        emit();
        schedulePump();
    }

    function setConcurrency(value) {
        const next = Math.max(1, Math.floor(Number(value) || 1));
        if (next === maxConcurrency) return;
        maxConcurrency = next;
        emit();
        schedulePump();
    }

    function whenIdle() {
        if (!active && !pending.length) return Promise.resolve();
        return new Promise(resolve => idleWaiters.add(resolve));
    }

    function stats() {
        return {
            concurrency: maxConcurrency,
            paused: isPaused,
            pending: pending.length,
            active,
            completed,
            failed,
        };
    }

    return { enqueue, pause, resume, setConcurrency, whenIdle, stats };
}
