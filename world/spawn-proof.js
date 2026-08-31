import { LIVE_SPAWN_LOCATION_RUNTIME, bindSpawnLocationRuntime } from './spawn-location-runtime.js';

const TAU = Math.PI * 2;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

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

function iterablePayloadEntries(input) {
    if (!input) return [];
    if (input instanceof Map) return [...input.entries()];
    if (Array.isArray(input)) return input.map((value, index) => [String(index), value]);
    if (typeof input[Symbol.iterator] === 'function') return [...input];
    return Object.entries(input);
}

function moduleRect(module) {
    const rect = module?.rect ?? module;
    const cx = finite(rect?.cx, finite(rect?.x));
    const cz = finite(rect?.cz, finite(rect?.z));
    const halfX = Math.max(0, finite(rect?.halfX, finite(rect?.hwx, finite(rect?.hx))));
    const halfZ = Math.max(0, finite(rect?.halfZ, finite(rect?.hwz, finite(rect?.hz))));
    if (!(halfX > 0) || !(halfZ > 0)) return null;
    return { cx, cz, halfX, halfZ };
}

function patchBounds(platform) {
    if (!platform || !Number.isFinite(platform.x) || !Number.isFinite(platform.z)) return null;
    const halfX = Math.max(0, finite(platform.hx, finite(platform.halfX, finite(platform.sx) * 0.5)));
    const halfZ = Math.max(0, finite(platform.hz, finite(platform.halfZ, finite(platform.sz) * 0.5)));
    if (!(halfX > 0) || !(halfZ > 0)) return null;
    return {
        x: platform.x,
        z: platform.z,
        halfX,
        halfZ,
        minX: platform.x - halfX,
        maxX: platform.x + halfX,
        minZ: platform.z - halfZ,
        maxZ: platform.z + halfZ,
        yMin: finite(platform.y),
        yMax: finite(platform.y) + 0.12,
        supportKind: platform.supportKind ?? null,
    };
}

function boundsOverlap(a, b, pad = 0) {
    return a.minX < b.maxX + pad && a.maxX > b.minX - pad
        && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
}

function pointNearModule(point, rect, margin = 0.9) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.z)
        && point.x >= rect.cx - rect.halfX - margin && point.x <= rect.cx + rect.halfX + margin
        && point.z >= rect.cz - rect.halfZ - margin && point.z <= rect.cz + rect.halfZ + margin;
}

function reservationBounds(reservation) {
    if (!reservation) return null;
    const halfX = Math.max(0, finite(reservation.halfX, finite(reservation.hx, finite(reservation.sx) * 0.5)));
    const halfZ = Math.max(0, finite(reservation.halfZ, finite(reservation.hz, finite(reservation.sz) * 0.5)));
    const x = finite(reservation.x);
    const z = finite(reservation.z);
    return {
        ...reservation,
        x, z, halfX, halfZ,
        minX: finite(reservation.minX, x - halfX),
        maxX: finite(reservation.maxX, x + halfX),
        minZ: finite(reservation.minZ, z - halfZ),
        maxZ: finite(reservation.maxZ, z + halfZ),
        yMin: finite(reservation.yMin, -Infinity),
        yMax: finite(reservation.yMax, Infinity),
    };
}

function moduleBounds(rect, surfaceY) {
    return {
        x: rect.cx,
        z: rect.cz,
        halfX: rect.halfX,
        halfZ: rect.halfZ,
        minX: rect.cx - rect.halfX,
        maxX: rect.cx + rect.halfX,
        minZ: rect.cz - rect.halfZ,
        maxZ: rect.cz + rect.halfZ,
        yMin: surfaceY,
        yMax: surfaceY + 2.2,
    };
}

function relevantReservation(reservation, bounds, surfaceY) {
    const r = reservationBounds(reservation);
    if (!r) return false;
    if (r.yMin > surfaceY + 2.2 || r.yMax < surfaceY - 0.12) return false;
    return boundsOverlap(r, bounds, 0.2);
}

export function collectSpawnFabricSpaces(fabricPayloads) {
    const spaces = [];
    for (const [payloadKey, payload] of iterablePayloadEntries(fabricPayloads)) {
        const entity = payload?.entity;
        const floorH = Number(entity?.floorH);
        if (!entity || !Number.isFinite(floorH) || !(floorH > 0)) continue;
        const physics = payload.physics ?? {};
        const platforms = physics.platforms ?? [];
        const connectors = physics.semanticConnectors ?? [];
        const circulationReservations = physics.circulationReservations ?? [];
        const detailReservations = payload.detailReservations ?? [];
        for (const module of entity.footprintModules ?? []) {
            const rect = moduleRect(module);
            const floors = Math.floor(Number(module?.floors) || 0);
            if (!rect || floors < 1) continue;
            const surfaceY = floors * floorH;
            const bounds = moduleBounds(rect, surfaceY);
            const supportPatches = platforms
                .filter(platform => platform?.supportKind === 'roof' && Math.abs(finite(platform.y) - surfaceY) <= 0.16)
                .map(patchBounds)
                .filter(Boolean)
                .filter(patch => patch.x >= bounds.minX - 0.05 && patch.x <= bounds.maxX + 0.05
                    && patch.z >= bounds.minZ - 0.05 && patch.z <= bounds.maxZ + 0.05);
            if (!supportPatches.length) continue;

            const attachedConnectors = connectors.filter(connector =>
                (connector.endpoints ?? []).some(endpoint =>
                    pointNearModule(endpoint, rect) && Math.abs(finite(endpoint.y) - surfaceY) <= 0.35));
            const connectorIds = attachedConnectors.map(connector => connector.id).filter(Boolean);
            const connectorReservationIds = new Set(attachedConnectors.flatMap(connector =>
                (connector.reservations ?? []).map(reservation => reservation?.id).filter(Boolean)));
            const reservations = circulationReservations
                .filter(reservation => connectorReservationIds.has(reservation?.id) || relevantReservation(reservation, bounds, surfaceY))
                .map(reservationBounds)
                .filter(Boolean);
            const existingDetailReservations = detailReservations
                .filter(reservation => relevantReservation(reservation, bounds, surfaceY))
                .map(reservationBounds)
                .filter(Boolean);
            const nearbyWalls = (physics.mazeWalls ?? []).filter(wall => {
                const yMin = finite(wall?.yMin, 0), yMax = finite(wall?.yMax, surfaceY + 2.2);
                if (yMin > surfaceY + 1.5 || yMax < surfaceY - 0.05) return false;
                const wallBounds = {
                    minX: Math.min(finite(wall?.x1), finite(wall?.x2)),
                    maxX: Math.max(finite(wall?.x1), finite(wall?.x2)),
                    minZ: Math.min(finite(wall?.z1), finite(wall?.z2)),
                    maxZ: Math.max(finite(wall?.z1), finite(wall?.z2)),
                };
                return boundsOverlap(wallBounds, bounds, 0.35);
            });
            const siteId = entity.semanticSiteKey ?? entity.siteId ?? String(payloadKey);
            const entityId = entity.id ?? payload.ownerId ?? String(payloadKey);
            spaces.push({
                schema: 'jweb.fabric-roof-space.v1',
                spaceId: `${entityId}:${module.key}:roof`,
                payloadKey: String(payloadKey),
                siteId,
                entityId,
                moduleKey: module.key,
                surfaceClass: 'roof',
                exposure: 'exterior',
                surfaceY,
                bounds,
                supportPatches,
                connectorIds,
                reservations,
                existingDetailReservations,
                nearbyWalls,
            });
        }
    }
    return spaces.sort((a, b) => a.spaceId.localeCompare(b.spaceId));
}

function fabricSpaceSamples(playerPhysics, origin, policy, spaces) {
    const candidates = [];
    const highProbe = origin.feetY + policy.verticalProbeAboveOriginM;
    const tolerance = Math.max(0.05, finite(policy.fabricSurfaceToleranceM, 0.18));
    const seen = new Set();
    for (const space of spaces ?? []) {
        if (policy.requireFabricConnector && !(space.connectorIds?.length > 0)) continue;
        if (space.surfaceY < origin.feetY + policy.minElevationAboveOriginM) continue;
        const distanceToSpace = Math.hypot(space.bounds.x - origin.x, space.bounds.z - origin.z);
        if (distanceToSpace > policy.searchRadiusM + Math.hypot(space.bounds.halfX, space.bounds.halfZ)) continue;
        for (const patch of space.supportPatches ?? []) {
            const edgeX = Math.max(0, patch.halfX - 0.72);
            const edgeZ = Math.max(0, patch.halfZ - 0.72);
            const points = [
                [patch.x, patch.z],
                [patch.x - edgeX * 0.58, patch.z], [patch.x + edgeX * 0.58, patch.z],
                [patch.x, patch.z - edgeZ * 0.58], [patch.x, patch.z + edgeZ * 0.58],
                [patch.x - edgeX * 0.45, patch.z - edgeZ * 0.45],
                [patch.x + edgeX * 0.45, patch.z - edgeZ * 0.45],
                [patch.x - edgeX * 0.45, patch.z + edgeZ * 0.45],
                [patch.x + edgeX * 0.45, patch.z + edgeZ * 0.45],
            ];
            for (const [x, z] of points) {
                const key = `${space.spaceId}:${Math.round(x * 20)},${Math.round(z * 20)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (Math.hypot(x - origin.x, z - origin.z) > policy.searchRadiusM + 1e-9) continue;
                const feetY = playerPhysics.supportHeightAt(x, z, highProbe);
                if (!Number.isFinite(feetY) || Math.abs(feetY - space.surfaceY) > tolerance) continue;
                if (!playerPhysics.poseIsValid(x, z, space.surfaceY)) continue;

                let edgeSupportedDirections = 0;
                for (let i = 0; i < policy.edgeProbeDirections; i++) {
                    const angle = (i / policy.edgeProbeDirections) * TAU;
                    const sx = x + Math.cos(angle) * policy.edgeProbeRadiusM;
                    const sz = z + Math.sin(angle) * policy.edgeProbeRadiusM;
                    const sy = playerPhysics.supportHeightAt(sx, sz, highProbe);
                    if (Number.isFinite(sy) && sy >= space.surfaceY - policy.edgeDropToleranceM) edgeSupportedDirections++;
                }
                if (edgeSupportedDirections < policy.minEdgeSupportedDirections) continue;

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
                    if (sy >= space.surfaceY + policy.higherContextDeltaM) higherContextDirections++;
                    if (sy >= space.surfaceY - policy.sameLevelToleranceM) sameOrHigherContextDirections++;
                    if (sy <= space.surfaceY - policy.higherContextDeltaM) deepDropDirections++;
                }

                const elevation = space.surfaceY - origin.feetY;
                const distance = Math.hypot(x - origin.x, z - origin.z);
                const peakLike = higherContextDirections === 0
                    && deepDropDirections >= Math.ceil(policy.contextProbeDirections * 0.55);
                let score = edgeSupportedDirections * 1.5
                    + higherContextDirections * 4
                    + sameOrHigherContextDirections * 0.7
                    - Math.abs(elevation - policy.preferredElevationAboveOriginM) * 0.22
                    - distance * 0.035;
                if (peakLike) score -= policy.localPeakPenalty;
                if (higherContextDirections >= policy.preferredHigherContextDirections) score += 6;
                candidates.push({
                    x, z, feetY: space.surfaceY,
                    ring: Math.max(0, Math.round(distance / Math.max(0.1, policy.radialStepM))),
                    radius: distance,
                    score,
                    elevation,
                    edgeSupportedDirections,
                    higherContextDirections,
                    sameOrHigherContextDirections,
                    deepDropDirections,
                    peakLike,
                    contextHeights,
                    space,
                });
            }
        }
    }
    return candidates.sort((a, b) => b.score - a.score || a.radius - b.radius || a.space.spaceId.localeCompare(b.space.spaceId));
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
        successful.push({
            heading,
            distance: result.distance,
            deltaY,
            end: result.end ? {
                x: result.end.x,
                z: result.end.z,
                feetY: result.end.feetY,
                grounded: result.end.grounded,
            } : null,
        });
    }
    return { successful, verticalRoutes, bestDistance };
}

export function selectSpawnEnclaveCandidate({
    playerPhysics,
    origin,
    locationRuntime,
    fabricSpaces = [],
    moveSpeed = 2.4,
    stepSeconds = 1 / 60,
} = {}) {
    if (!playerPhysics || !origin || !locationRuntime?.selectionPolicy || !fabricSpaces?.length) return null;
    const policy = locationRuntime.selectionPolicy;
    const structural = fabricSpaceSamples(playerPhysics, origin, policy, fabricSpaces)
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
// a nearby pose that the real controller can actually move away from. Authored
// selection is stricter: the pose must first belong to a roof surface published by
// the committed fabric payload, so a physically walkable interior floor can never
// masquerade as a "fabric-space" rooftop merely because physics sampling liked it.
export function provePlayableSpawn({
    playerPhysics,
    origin,
    fabricPayloads = null,
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
        const fabricSpaces = collectSpawnFabricSpaces(fabricPayloads);
        const enclave = selectSpawnEnclaveCandidate({
            playerPhysics, origin, locationRuntime, fabricSpaces, moveSpeed, stepSeconds,
        });
        if (enclave) {
            const hostSpace = {
                spaceId: enclave.space.spaceId,
                payloadKey: enclave.space.payloadKey,
                siteId: enclave.space.siteId,
                entityId: enclave.space.entityId,
                moduleKey: enclave.space.moduleKey,
                surfaceClass: enclave.space.surfaceClass,
                exposure: enclave.space.exposure,
                surfaceY: enclave.space.surfaceY,
                bounds: enclave.space.bounds,
                supportPatches: enclave.space.supportPatches,
                connectorIds: enclave.space.connectorIds,
                reservations: enclave.space.reservations,
                existingDetailReservations: enclave.space.existingDetailReservations,
            };
            const routeFan = enclave.navigation.successful;
            const proof = {
                ok: true,
                pose: { x: enclave.x, z: enclave.z, feetY: enclave.feetY },
                routeKind: 'authored-elevated-enclave',
                escapeDistance: enclave.navigation.bestDistance,
                candidateIndex: 0,
                candidateRing: enclave.ring,
                probes: routeFan.length,
                searchedCandidates: Math.min(locationRuntime.selectionPolicy.maxNavigationCandidates, fabricSpaces.length * 9),
                fabricSpace: hostSpace,
                routeFan,
                locationSelection: {
                    mode: 'fabric-space:elevated-roof-enclave',
                    score: enclave.finalScore,
                    elevationAboveRequestedM: enclave.elevation,
                    edgeSupportedDirections: enclave.edgeSupportedDirections,
                    higherContextDirections: enclave.higherContextDirections,
                    sameOrHigherContextDirections: enclave.sameOrHigherContextDirections,
                    deepDropDirections: enclave.deepDropDirections,
                    peakLike: enclave.peakLike,
                    navigableHeadings: routeFan.length,
                    verticalRoutes: enclave.navigation.verticalRoutes,
                    hostSpace: {
                        spaceId: hostSpace.spaceId,
                        siteId: hostSpace.siteId,
                        entityId: hostSpace.entityId,
                        moduleKey: hostSpace.moduleKey,
                        surfaceClass: hostSpace.surfaceClass,
                        exposure: hostSpace.exposure,
                        connectorIds: [...hostSpace.connectorIds],
                    },
                },
            };
            proof.location = publishBoundLocation(locationRuntime, proof);
            console.log?.('[spawn-location] bound authored elevated enclave', proof.locationSelection);
            return proof;
        }
        console.warn?.('[spawn-location] no authoritative fabric roof enclave passed the runtime policy; using conservative local spawn proof');
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
