import { LIVE_SPAWN_LOCATION_RUNTIME, bindSpawnLocationRuntime } from './spawn-location-runtime.js';

const TAU = Math.PI * 2;

function routeSteps(headings, {
    moveSpeed,
    straightSeconds,
    turnSegmentSeconds,
    stepSeconds,
}) {
    const segmentSeconds = headings.length === 1 ? straightSeconds : turnSegmentSeconds;
    const frames = Math.max(1, Math.ceil(segmentSeconds / stepSeconds));
    const steps = [];
    for (const heading of headings) {
        const vx = Math.cos(heading) * moveSpeed;
        const vz = Math.sin(heading) * moveSpeed;
        for (let frame = 0; frame < frames; frame++) {
            steps.push({ dt: stepSeconds, wishVelocityX: vx, wishVelocityZ: vz });
        }
    }
    return steps;
}

function escapeRoutes(directionCount) {
    const routes = [];
    for (let i = 0; i < directionCount; i++) {
        const heading = (i / directionCount) * TAU;
        routes.push({ kind: 'straight', headings: [heading] });
    }
    for (let i = 0; i < directionCount; i++) {
        const heading = (i / directionCount) * TAU;
        routes.push({ kind: 'left-turn', headings: [heading, heading + Math.PI / 2] });
        routes.push({ kind: 'right-turn', headings: [heading, heading - Math.PI / 2] });
    }
    return routes;
}

function candidatePoses(playerPhysics, origin, {
    searchRadius,
    radialStep,
    spokes,
}) {
    const candidates = [];
    const add = (x, z, ring) => {
        const feetY = playerPhysics.supportHeightAt(x, z, origin.feetY);
        if (!Number.isFinite(feetY) || !playerPhysics.poseIsValid(x, z, feetY)) return;
        candidates.push({ x, z, feetY, ring });
    };

    add(origin.x, origin.z, 0);
    for (let radius = radialStep, ring = 1; radius <= searchRadius + 1e-9; radius += radialStep, ring++) {
        for (let i = 0; i < spokes; i++) {
            const angle = (i / spokes) * TAU;
            add(origin.x + Math.cos(angle) * radius, origin.z + Math.sin(angle) * radius, ring);
        }
    }
    return candidates;
}

function elevatedSamples(playerPhysics, origin, policy) {
    const candidates = [];
    const seen = new Set();
    const highProbe = origin.feetY + policy.verticalProbeAboveOriginM;
    const add = (x, z, ring, radius) => {
        const key = `${Math.round(x * 20)},${Math.round(z * 20)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const feetY = playerPhysics.supportHeightAt(x, z, highProbe);
        if (!Number.isFinite(feetY) || feetY < origin.feetY + policy.minElevationAboveOriginM) return;
        if (!playerPhysics.poseIsValid(x, z, feetY)) return;

        let edgeSupportedDirections = 0;
        for (let i = 0; i < policy.edgeProbeDirections; i++) {
            const angle = (i / policy.edgeProbeDirections) * TAU;
            const sx = x + Math.cos(angle) * policy.edgeProbeRadiusM;
            const sz = z + Math.sin(angle) * policy.edgeProbeRadiusM;
            const sy = playerPhysics.supportHeightAt(sx, sz, highProbe);
            if (Number.isFinite(sy) && sy >= feetY - policy.edgeDropToleranceM) edgeSupportedDirections++;
        }
        if (edgeSupportedDirections < policy.minEdgeSupportedDirections) return;

        let higherContextDirections = 0;
        let sameOrHigherContextDirections = 0;
        let deepDropDirections = 0;
        const contextHeights = [];
        for (let i = 0; i < policy.contextProbeDirections; i++) {
            const angle = (i / policy.contextProbeDirections) * TAU;
            const sx = x + Math.cos(angle) * policy.contextProbeRadiusM;
            const sz = z + Math.sin(angle) * policy.contextProbeRadiusM;
            const sy = playerPhysics.supportHeightAt(sx, sz, highProbe);
            contextHeights.push(sy);
            if (!Number.isFinite(sy)) continue;
            if (sy >= feetY + policy.higherContextDeltaM) higherContextDirections++;
            if (sy >= feetY - policy.sameLevelToleranceM) sameOrHigherContextDirections++;
            if (sy <= feetY - policy.higherContextDeltaM) deepDropDirections++;
        }

        const elevation = feetY - origin.feetY;
        const distance = Math.hypot(x - origin.x, z - origin.z);
        const peakLike = higherContextDirections === 0 && deepDropDirections >= Math.ceil(policy.contextProbeDirections * 0.55);
        let score = edgeSupportedDirections * 1.5
            + higherContextDirections * 4
            + sameOrHigherContextDirections * 0.7
            - Math.abs(elevation - policy.preferredElevationAboveOriginM) * 0.22
            - distance * 0.035;
        if (peakLike) score -= policy.localPeakPenalty;
        if (higherContextDirections >= policy.preferredHigherContextDirections) score += 6;
        candidates.push({
            x, z, feetY, ring, radius, score,
            elevation,
            edgeSupportedDirections,
            higherContextDirections,
            sameOrHigherContextDirections,
            deepDropDirections,
            peakLike,
            contextHeights,
        });
    };

    add(origin.x, origin.z, 0, 0);
    let ring = 0;
    for (let radius = policy.radialStepM; radius <= policy.searchRadiusM + 1e-9; radius += policy.radialStepM) {
        ring++;
        for (let i = 0; i < policy.spokes; i++) {
            const angle = (i / policy.spokes) * TAU;
            add(origin.x + Math.cos(angle) * radius, origin.z + Math.sin(angle) * radius, ring, radius);
        }
    }
    return candidates.sort((a, b) => b.score - a.score || a.radius - b.radius);
}

function navigationAudit(playerPhysics, candidate, policy, { moveSpeed, stepSeconds }) {
    const successful = [];
    let verticalRoutes = 0;
    let bestDistance = 0;
    for (let i = 0; i < policy.navigationDirections; i++) {
        const heading = (i / policy.navigationDirections) * TAU;
        const result = playerPhysics.probeControllerPath({
            start: candidate,
            steps: routeSteps([heading], {
                moveSpeed,
                straightSeconds: policy.navigationSeconds,
                turnSegmentSeconds: policy.navigationSeconds,
                stepSeconds,
            }),
        });
        bestDistance = Math.max(bestDistance, result.maxDistance || 0);
        if (!result.validStart || !result.validEnd || result.distance < policy.navigationDistanceM) continue;
        if (result.end?.grounded === false) continue;
        const deltaY = (result.end?.feetY ?? candidate.feetY) - candidate.feetY;
        if (Math.abs(deltaY) >= policy.verticalRouteDeltaM) verticalRoutes++;
        successful.push({ heading, distance: result.distance, deltaY, end: result.end ?? null });
    }
    return { successful, verticalRoutes, bestDistance };
}

export function selectSpawnEnclaveCandidate({
    playerPhysics,
    origin,
    locationRuntime,
    moveSpeed = 2.4,
    stepSeconds = 1 / 60,
} = {}) {
    if (!playerPhysics || !origin || !locationRuntime?.selectionPolicy) return null;
    const policy = locationRuntime.selectionPolicy;
    const structural = elevatedSamples(playerPhysics, origin, policy)
        .slice(0, Math.max(1, policy.maxNavigationCandidates));
    let best = null;
    for (const candidate of structural) {
        const nav = navigationAudit(playerPhysics, candidate, policy, { moveSpeed, stepSeconds });
        if (nav.successful.length < policy.minNavigableHeadings) continue;
        const finalScore = candidate.score + nav.successful.length * 3 + nav.verticalRoutes * 2.5;
        const result = { ...candidate, navigation: nav, finalScore };
        if (!best || result.finalScore > best.finalScore) best = result;
    }
    return best;
}

function publishBoundLocation(locationRuntime, proof) {
    const bound = bindSpawnLocationRuntime(locationRuntime, proof);
    if (!bound || typeof window === 'undefined') return bound;
    window.__spawnLocationRuntime = bound;
    try { window.dispatchEvent(new CustomEvent('jweb:spawn-location-bound', { detail: bound })); }
    catch (_) { /* CustomEvent is diagnostic sugar, never spawn authority. */ }
    return bound;
}

// A spawn is not "playable" merely because one capsule sample is empty. We require
// a nearby pose that the real controller can actually move away from. The probe API
// is non-destructive, so proving routes cannot consume the player's real lastSafe or
// accidentally activate late streamed owners.
export function provePlayableSpawn({
    playerPhysics,
    origin,
    searchRadius = 2.4,
    radialStep = 0.6,
    spokes = 8,
    directionCount = 8,
    escapeDistance = 2.2,
    moveSpeed = 2.4,
    straightSeconds = 1.15,
    turnSegmentSeconds = 0.72,
    stepSeconds = 1 / 60,
    locationRuntime = LIVE_SPAWN_LOCATION_RUNTIME,
} = {}) {
    if (!playerPhysics?.poseIsValid || !playerPhysics?.supportHeightAt || !playerPhysics?.probeControllerPath) {
        throw new Error('provePlayableSpawn requires player physics with pose/support/probe APIs');
    }
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z) || !Number.isFinite(origin.feetY)) {
        throw new Error('provePlayableSpawn requires a finite origin pose');
    }

    if (locationRuntime) {
        const enclave = selectSpawnEnclaveCandidate({ playerPhysics, origin, locationRuntime, moveSpeed, stepSeconds });
        if (enclave) {
            const proof = {
                ok: true,
                pose: { x: enclave.x, z: enclave.z, feetY: enclave.feetY },
                routeKind: 'authored-elevated-enclave',
                escapeDistance: enclave.navigation.bestDistance,
                candidateIndex: 0,
                candidateRing: enclave.ring,
                probes: enclave.navigation.successful.length,
                searchedCandidates: Math.min(locationRuntime.selectionPolicy.maxNavigationCandidates, enclave.ring * locationRuntime.selectionPolicy.spokes + 1),
                locationSelection: {
                    mode: 'fabric-space:elevated-roof-enclave',
                    score: enclave.finalScore,
                    elevationAboveRequestedM: enclave.elevation,
                    edgeSupportedDirections: enclave.edgeSupportedDirections,
                    higherContextDirections: enclave.higherContextDirections,
                    sameOrHigherContextDirections: enclave.sameOrHigherContextDirections,
                    deepDropDirections: enclave.deepDropDirections,
                    peakLike: enclave.peakLike,
                    navigableHeadings: enclave.navigation.successful.length,
                    verticalRoutes: enclave.navigation.verticalRoutes,
                },
            };
            proof.location = publishBoundLocation(locationRuntime, proof);
            console.log?.('[spawn-location] bound authored elevated enclave', proof.locationSelection);
            return proof;
        }
        console.warn?.('[spawn-location] no preferred elevated enclave passed the runtime policy; using conservative local spawn proof');
    }

    const candidates = candidatePoses(playerPhysics, origin, { searchRadius, radialStep, spokes });
    const routes = escapeRoutes(directionCount);
    let bestDistance = 0;
    let probes = 0;

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        const pose = candidates[candidateIndex];
        for (const route of routes) {
            probes++;
            const result = playerPhysics.probeControllerPath({
                start: pose,
                steps: routeSteps(route.headings, { moveSpeed, straightSeconds, turnSegmentSeconds, stepSeconds }),
            });
            bestDistance = Math.max(bestDistance, result.maxDistance || 0);
            if (!result.validStart || !result.validEnd || result.distance < escapeDistance) continue;
            const proof = {
                ok: true,
                pose: { x: pose.x, z: pose.z, feetY: pose.feetY },
                routeKind: route.kind,
                escapeDistance: result.distance,
                candidateIndex,
                candidateRing: pose.ring,
                probes,
                searchedCandidates: candidates.length,
            };
            proof.location = publishBoundLocation(locationRuntime, proof);
            return proof;
        }
    }

    return {
        ok: false,
        reason: candidates.length ? 'no-controller-escape-route' : 'no-valid-capsule-pose',
        probes,
        searchedCandidates: candidates.length,
        bestDistance,
    };
}
