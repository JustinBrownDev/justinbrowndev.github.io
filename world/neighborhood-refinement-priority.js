export const REFINEMENT_COVERAGE_WAVE = Object.freeze({
    FIRST_PASS: 0,
    COARSE_FLOOR: 1,
    DEEP: 2,
});

function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function firstPassComplete(refinement) {
    const entityTarget = finite(refinement?.firstPassEntityTarget);
    if (entityTarget !== null && entityTarget >= 0) {
        const complete = finite(refinement?.firstPassEntitiesComplete, 0) ?? 0;
        return !!refinement?.firstPassComplete || complete >= entityTarget;
    }
    const legacyTarget = finite(refinement?.firstPassTaskCount);
    if (legacyTarget !== null && legacyTarget >= 0) {
        const published = finite(refinement?.published);
        if (published !== null) return published >= legacyTarget;
        return (finite(refinement?.cursor, 0) ?? 0) >= legacyTarget;
    }
    return true;
}

function compositionFloorComplete(refinement) {
    const runtime = refinement?.exteriorCoverage;
    const target = finite(runtime?.coverageFloorEntityTarget);
    if (target === null) return true;
    if (target <= 0) return true;
    const settled = finite(runtime?.coverageFloorEntitiesSettled, 0) ?? 0;
    return !!runtime?.coverageFloorComplete || settled >= target;
}

// This is intentionally only a rank. The streamer remains cooperative and still
// chooses one chunk/task at a time. The rank makes visible neighborhood breadth
// authoritative before center-chunk depth: first-pass identity -> coarse floor -> deep.
export function refinementCoverageFloorRank(refinement, { visible = true } = {}) {
    if (!visible) return REFINEMENT_COVERAGE_WAVE.DEEP;
    if (!firstPassComplete(refinement)) return REFINEMENT_COVERAGE_WAVE.FIRST_PASS;
    if (!compositionFloorComplete(refinement)) return REFINEMENT_COVERAGE_WAVE.COARSE_FLOOR;
    return REFINEMENT_COVERAGE_WAVE.DEEP;
}
