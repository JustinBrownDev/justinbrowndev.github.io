export const WORLD_STREAMING_GEAR = Object.freeze({
    VISIBLE_STRUCTURE: 'visible-structure-sprint',
    VISIBLE_FIRST_PASS: 'visible-first-pass-sprint',
    PREFETCH_STRUCTURE: 'prefetch-structure-sprint',
    LOCAL_DEEPEN: 'local-deepen',
});

// PLAYER-CENTERED WORLD CONTRACT:
// There is intentionally no "finish the world" state. Every transition is about
// the moving player neighborhood. When the player crosses a chunk boundary these
// predicates are recomputed around the new center and urgent work preempts depth.
export function choosePlayerCenteredStreamingGear({
    renderComplete = false,
    visibleFirstPassComplete = false,
    prefetchComplete = false,
} = {}) {
    if (!renderComplete) return WORLD_STREAMING_GEAR.VISIBLE_STRUCTURE;
    if (!visibleFirstPassComplete) return WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS;
    if (!prefetchComplete) return WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE;
    return WORLD_STREAMING_GEAR.LOCAL_DEEPEN;
}

export function pointNearRegion({ x = 0, z = 0 } = {}, {
    centerX = 0,
    centerZ = 0,
    halfX = 0,
    halfZ = 0,
    margin = 0,
} = {}) {
    const dx = Math.max(0, Math.abs(x - centerX) - Math.max(0, halfX));
    const dz = Math.max(0, Math.abs(z - centerZ) - Math.max(0, halfZ));
    return dx * dx + dz * dz <= Math.max(0, margin) ** 2;
}

// Finite authored/spawn work is allowed only when it is itself local to the
// player, and never while the streamed neighborhood still owes structure,
// first-pass population, or structural prefetch.
export function shouldRunAuthoredLocalWork({ gear, playerNearAuthoredRegion = false } = {}) {
    return gear === WORLD_STREAMING_GEAR.LOCAL_DEEPEN && !!playerNearAuthoredRegion;
}
