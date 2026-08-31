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

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

// Distant prefetch is surplus work. A frame hitch or meaningful player motion
// closes this gate for a cooldown window; visible structure and first-pass work
// are unaffected because callers only consult it in PREFETCH_STRUCTURE gear.
export function createPrefetchPressureGate({
    frameBudgetMs = 22,
    motionDistance = 0.035,
    cooldownMs = 1800,
} = {}) {
    const healthyFrameBudgetMs = Math.max(1, finite(frameBudgetMs, 22));
    const movementThreshold = Math.max(0, finite(motionDistance, 0.035));
    const pressureCooldownMs = Math.max(0, finite(cooldownMs, 1800));
    let lastAt = null;
    let lastX = Number.NaN;
    let lastZ = Number.NaN;
    let pressureUntil = 0;

    function observe({ now = performance.now(), position = null } = {}) {
        const at = finite(now, performance.now());
        const x = Number(position?.x);
        const z = Number(position?.z);
        const hasPosition = Number.isFinite(x) && Number.isFinite(z);
        let frameGapMs = 0;
        let movedMeters = 0;
        let framePressured = false;
        let motionPressured = false;

        if (lastAt !== null) {
            frameGapMs = Math.max(0, at - lastAt);
            framePressured = frameGapMs > healthyFrameBudgetMs;
            if (hasPosition && Number.isFinite(lastX) && Number.isFinite(lastZ)) {
                movedMeters = Math.hypot(x - lastX, z - lastZ);
                motionPressured = movedMeters > movementThreshold;
            }
            if (framePressured || motionPressured) {
                pressureUntil = Math.max(pressureUntil, at + pressureCooldownMs);
            }
        }

        lastAt = at;
        if (hasPosition) {
            lastX = x;
            lastZ = z;
        }

        return Object.freeze({
            pressured: at < pressureUntil,
            pressureUntil,
            frameGapMs,
            movedMeters,
            framePressured,
            motionPressured,
        });
    }

    function snapshot(now = performance.now()) {
        const at = finite(now, performance.now());
        return Object.freeze({
            pressured: at < pressureUntil,
            pressureUntil,
            lastAt,
            lastX,
            lastZ,
            frameBudgetMs: healthyFrameBudgetMs,
            motionDistance: movementThreshold,
            cooldownMs: pressureCooldownMs,
        });
    }

    function reset() {
        lastAt = null;
        lastX = Number.NaN;
        lastZ = Number.NaN;
        pressureUntil = 0;
    }

    return Object.freeze({ observe, snapshot, reset });
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

// Finite authored/spawn work is eligible whenever it is physically local.
// Streaming gear controls its tiny per-frame budget in main.js; priority must
// never mean that every lower-priority subsystem is forbidden from progressing.
export function shouldRunAuthoredLocalWork({ gear, playerNearAuthoredRegion = false } = {}) {
    void gear; // retained in the API because callers use gear to choose the budget.
    return !!playerNearAuthoredRegion;
}
