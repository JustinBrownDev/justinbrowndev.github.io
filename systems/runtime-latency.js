function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
}

function summarize(samples, count, total, max, maxMeta) {
    const sorted = samples.slice().sort((a, b) => a - b);
    return Object.freeze({
        count,
        totalMs: total,
        avgMs: count ? total / count : 0,
        p50Ms: percentile(sorted, 0.50),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        maxMs: max,
        maxMeta,
    });
}

export function createRuntimeLatencyTelemetry({ maxSamplesPerCategory = 4096 } = {}) {
    const categories = new Map();
    let rafLast = 0;
    let rafCount = 0;
    let rafTotalGap = 0;
    let rafMaxGap = 0;
    let rafMaxMeta = null;
    let rafOver16 = 0;
    let rafOver33 = 0;
    let rafOver50 = 0;
    const rafSamples = [];

    function bucket(name) {
        let value = categories.get(name);
        if (!value) {
            value = { count: 0, total: 0, max: 0, maxMeta: null, samples: [] };
            categories.set(name, value);
        }
        return value;
    }

    function record(name, durationMs, meta = null) {
        if (!Number.isFinite(durationMs) || durationMs < 0) return durationMs;
        const value = bucket(name);
        value.count++;
        value.total += durationMs;
        if (durationMs >= value.max) {
            value.max = durationMs;
            value.maxMeta = meta;
        }
        if (value.samples.length < maxSamplesPerCategory) value.samples.push(durationMs);
        else value.samples[value.count % maxSamplesPerCategory] = durationMs;
        return durationMs;
    }

    function raf(now, meta = null) {
        if (rafLast > 0) {
            const gap = Math.max(0, now - rafLast);
            rafCount++;
            rafTotalGap += gap;
            if (gap >= rafMaxGap) {
                rafMaxGap = gap;
                rafMaxMeta = meta;
            }
            if (gap > 16.7) rafOver16++;
            if (gap > 33) rafOver33++;
            if (gap > 50) rafOver50++;
            if (rafSamples.length < maxSamplesPerCategory) rafSamples.push(gap);
            else rafSamples[rafCount % maxSamplesPerCategory] = gap;
        }
        rafLast = now;
    }

    function snapshot() {
        const out = {};
        for (const [name, value] of categories) {
            out[name] = summarize(value.samples, value.count, value.total, value.max, value.maxMeta);
        }
        const rafSummary = summarize(rafSamples, rafCount, rafTotalGap, rafMaxGap, rafMaxMeta);
        return Object.freeze({
            categories: Object.freeze(out),
            raf: Object.freeze({
                ...rafSummary,
                over16_7ms: rafOver16,
                over33ms: rafOver33,
                over50ms: rafOver50,
            }),
        });
    }

    function resetRafClock(now = performance.now()) {
        rafLast = now;
    }

    return Object.freeze({ record, raf, snapshot, resetRafClock });
}
