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
} = {}) {
    if (!playerPhysics?.poseIsValid || !playerPhysics?.supportHeightAt || !playerPhysics?.probeControllerPath) {
        throw new Error('provePlayableSpawn requires player physics with pose/support/probe APIs');
    }
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z) || !Number.isFinite(origin.feetY)) {
        throw new Error('provePlayableSpawn requires a finite origin pose');
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
            return {
                ok: true,
                pose: { x: pose.x, z: pose.z, feetY: pose.feetY },
                routeKind: route.kind,
                escapeDistance: result.distance,
                candidateIndex,
                candidateRing: pose.ring,
                probes,
                searchedCandidates: candidates.length,
            };
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
