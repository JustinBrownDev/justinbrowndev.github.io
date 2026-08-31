function finite(value, fallback = 0) {
    if (value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function axis(vector, index, key, fallback = 0) {
    if (Array.isArray(vector)) return finite(vector[index], fallback);
    if (vector && typeof vector === 'object') return finite(vector[key], fallback);
    return fallback;
}

function expectedDimensions(def = {}) {
    const raw = def.dimensionsXYZ ?? [0.6, 0.8, 0.6];
    return [
        Math.max(0.04, finite(raw[0], 0.6)),
        Math.max(0.04, finite(raw[1], 0.8)),
        Math.max(0.04, finite(raw[2], 0.6)),
    ];
}

function measuredBounds(bounds) {
    const min = bounds?.min;
    const max = bounds?.max;
    if (!min || !max) return null;
    const minV = [axis(min, 0, 'x'), axis(min, 1, 'y'), axis(min, 2, 'z')];
    const maxV = [axis(max, 0, 'x'), axis(max, 1, 'y'), axis(max, 2, 'z')];
    const size = [maxV[0] - minV[0], maxV[1] - minV[1], maxV[2] - minV[2]];
    if (size.some(value => !Number.isFinite(value) || value <= 1e-6)) return null;
    return {
        min: minV,
        max: maxV,
        size,
        center: [(minV[0] + maxV[0]) * 0.5, (minV[1] + maxV[1]) * 0.5, (minV[2] + maxV[2]) * 0.5],
    };
}

export function semanticAssetFitScale(def, rawBounds) {
    const expected = expectedDimensions(def);
    const measured = measuredBounds(rawBounds);
    if (!measured) return 1;
    const ratios = measured.size.map((size, index) => expected[index] / size)
        .filter(value => Number.isFinite(value) && value > 0);
    return Math.max(0.001, Math.min(1, ...ratios));
}

export function semanticAssetAlignment(def, fittedBounds) {
    const measured = measuredBounds(fittedBounds);
    if (!measured) return { x: 0, y: 0, z: 0 };
    const boundsMinY = axis(def?.boundsMin, 1, 'y', 0);
    return {
        x: -measured.center[0] || 0,
        y: boundsMinY - measured.min[1],
        z: -measured.center[2] || 0,
    };
}
