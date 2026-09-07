import { LIVE_SPAWN_LOCATION_RUNTIME, bindSpawnLocationRuntime, hashString32, forcedHostArchetypeForSpawnFlavor } from './spawn-location-runtime.js';

const TAU = Math.PI * 2;


export const SPAWN_HOST_ARCHETYPES = Object.freeze({
    'deep-backroom': Object.freeze({ id: 'deep-backroom', probability: 0.01 }),
    'hanging-storefront': Object.freeze({ id: 'hanging-storefront', probability: 0.09 }),
    'sheltered-roof': Object.freeze({ id: 'sheltered-roof', probability: 0.30 }),
    'exposed-roof': Object.freeze({ id: 'exposed-roof', probability: 0.60 }),
});

export function chooseSpawnHostArchetype(selectionKey) {
    const roll = hashString32(`spawn-host-archetype:${String(selectionKey ?? 'spawn')}`) / 4294967296;
    if (roll < 0.010) return 'deep-backroom';
    if (roll < 0.100) return 'hanging-storefront';
    if (roll < 0.400) return 'sheltered-roof';
    return 'exposed-roof';
}

function patchArea(patch) {
    const p = patchBounds(patch);
    return p ? p.halfX * 2 * p.halfZ * 2 : 0;
}

// A support patch is only "this room's floor" where it actually overlaps the
// room's own module bounds. Neighboring bays/modules routinely publish their
// own full-size floor slab, and that slab can graze this module's bounds by
// a sliver without belonging to it at all — counting the slab's whole area
// (or its whole span) would silently borrow floor from the room next door.
function clipPatchToBounds(patch, bounds) {
    const minX = Math.max(patch.minX, bounds.minX);
    const maxX = Math.min(patch.maxX, bounds.maxX);
    const minZ = Math.max(patch.minZ, bounds.minZ);
    const maxZ = Math.min(patch.maxZ, bounds.maxZ);
    if (!(maxX > minX) || !(maxZ > minZ)) return null;
    return {
        ...patch,
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        halfX: (maxX - minX) / 2,
        halfZ: (maxZ - minZ) / 2,
        minX, maxX, minZ, maxZ,
    };
}

// Sum of each clipped patch's own area double-counts wherever two patches
// (e.g. a floor slab and a mezzanine lip) legitimately overlap each other.
// Coordinate-compress the small per-module patch set and sum only covered
// cells so overlapping patches contribute their union, not their sum.
function unionAreaOfRects(rects) {
    if (!rects.length) return 0;
    if (rects.length === 1) return Math.max(0, rects[0].maxX - rects[0].minX) * Math.max(0, rects[0].maxZ - rects[0].minZ);
    const xs = [...new Set(rects.flatMap(r => [r.minX, r.maxX]))].sort((a, b) => a - b);
    const zs = [...new Set(rects.flatMap(r => [r.minZ, r.maxZ]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
        const x0 = xs[i], x1 = xs[i + 1];
        const dx = x1 - x0;
        if (dx <= 1e-9) continue;
        const midX = (x0 + x1) / 2;
        for (let j = 0; j < zs.length - 1; j++) {
            const z0 = zs[j], z1 = zs[j + 1];
            const dz = z1 - z0;
            if (dz <= 1e-9) continue;
            const midZ = (z0 + z1) / 2;
            const covered = rects.some(r => midX > r.minX && midX < r.maxX && midZ > r.minZ && midZ < r.maxZ);
            if (covered) area += dx * dz;
        }
    }
    return area;
}

function rectContainsPoint(rect, x, z, inset = 0) {
    const r = patchBounds(rect) ?? reservationBounds(rect);
    if (!r) return false;
    return x >= r.minX + inset && x <= r.maxX - inset && z >= r.minZ + inset && z <= r.maxZ - inset;
}

function segmentLength(wall) {
    return Math.hypot(finite(wall?.x2) - finite(wall?.x1), finite(wall?.z2) - finite(wall?.z1));
}

function pointSegmentDistanceAndVector(x, z, wall) {
    const x1 = finite(wall?.x1), z1 = finite(wall?.z1), x2 = finite(wall?.x2), z2 = finite(wall?.z2);
    const dx = x2 - x1, dz = z2 - z1;
    const denom = dx * dx + dz * dz;
    const t = denom > 1e-9 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / denom)) : 0;
    const px = x1 + dx * t, pz = z1 + dz * t;
    return { distance: Math.hypot(px - x, pz - z), dx: px - x, dz: pz - z };
}

function wallDirectionCountAt(space, x, z, radius = 4.8) {
    const bins = new Set();
    for (const wall of space?.nearbyWalls ?? []) {
        const hit = pointSegmentDistanceAndVector(x, z, wall);
        if (!(hit.distance <= radius) || hit.distance < 0.05) continue;
        let angle = Math.atan2(hit.dz, hit.dx);
        if (angle < 0) angle += TAU;
        bins.add(Math.floor((angle / TAU) * 8) % 8);
    }
    return bins.size;
}

function programArchitectureId(entity) {
    return entity?.buildingPlan?.programArchitecture?.id
        ?? entity?.programMacroArchitecture?.programArchitectureId
        ?? entity?.buildingConstructionEngine?.programArchitectureId
        ?? null;
}

function retailLikeEntity(entity) {
    const family = String(entity?.physicalUse?.family ?? entity?.physicalUse ?? '');
    const program = String(programArchitectureId(entity) ?? '');
    return family === 'mercantile-public'
        || ['retail-service', 'workshop-retail', 'bar-restaurant', 'food-service'].includes(program)
        || /retail|shop|bar|convenience|market|diner/.test(program);
}

function frontageLikeEntity(entity) {
    if (retailLikeEntity(entity)) return true;
    const family = String(entity?.physicalUse?.family ?? entity?.physicalUse ?? '').toLowerCase();
    const program = String(programArchitectureId(entity) ?? '').toLowerCase();
    // When a seed has no literal retail building, a business/workshop/service
    // frontage is still the right visual host for the GIGA vape-shop flavor.
    return /business|industrial-service|workshop|service/.test(`${family} ${program}`);
}

let sessionRandomSpawnRoll = null;

export function readSpawnRollSalt(search = null) {
    let raw = null;
    try {
        const query = search == null ? (globalThis.location?.search ?? '') : String(search);
        raw = new URLSearchParams(query).get('spawnRoll');
    } catch (_) {
        raw = null;
    }
    if (!raw) return '0';
    const normalized = String(raw).trim();
    if (!normalized) return '0';
    if (normalized.toLowerCase() !== 'random') return normalized.slice(0, 64);
    if (sessionRandomSpawnRoll == null) {
        const values = new Uint32Array(1);
        try { globalThis.crypto?.getRandomValues?.(values); }
        catch (_) { values[0] = 0; }
        sessionRandomSpawnRoll = values[0] || Math.floor(Math.random() * 0x100000000) >>> 0;
    }
    return `random:${sessionRandomSpawnRoll}`;
}

function spaceSelectionKey(locationRuntime, spaces) {
    const seed = spaces.map(space => Number(space?.chunkSeed)).find(Number.isFinite);
    const identity = locationRuntime?.location?.id ?? 'spawn';
    const rollSalt = readSpawnRollSalt();
    return `${identity}:${Number.isFinite(seed) ? seed : (spaces[0]?.payloadKey ?? 'local')}:roll=${rollSalt}`;
}

function candidateVarietyJitter(selectionKey, candidate, hostArchetype) {
    const spaceId = candidate?.space?.spaceId ?? candidate?.space?.payloadKey ?? 'space';
    const x = finite(Number(candidate?.x), 0).toFixed(2);
    const z = finite(Number(candidate?.z), 0).toFixed(2);
    const y = finite(Number(candidate?.feetY), 0).toFixed(2);
    const unit = hashString32(`spawn-candidate:${selectionKey}:${hostArchetype}:${spaceId}:${x}:${z}:${y}`) / 4294967296;
    // Small enough that safety/host quality still dominate, large enough to stop
    // near-equivalent valid spots from always collapsing to the same champion.
    return (unit - 0.5) * 5.0;
}

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
    for (const [payloadKey, rootPayload] of iterablePayloadEntries(fabricPayloads)) {
        const layers = [{ payload: rootPayload, payloadLayer: 'ground' }];
        const hangingPayload = rootPayload?.hangingLayer?.payload ?? null;
        if (hangingPayload?.physics) layers.push({ payload: hangingPayload, payloadLayer: 'hanging' });
        for (const { payload, payloadLayer } of layers) {
        const physics = payload.physics ?? {};
        const platforms = physics.platforms ?? [];
        const ceilings = physics.ceilings ?? [];
        const connectors = physics.semanticConnectors ?? [];
        const circulationReservations = physics.circulationReservations ?? [];
        const detailReservations = payload.detailReservations ?? [];
        const entities = payload?.entity
            ? [payload.entity]
            : (payload?.entities ?? []).filter(entity => entity?.kind === 'building');
        for (const entity of entities) {
            const floorH = Number(entity?.floorH);
            if (!entity || !Number.isFinite(floorH) || !(floorH > 0)) continue;
            const retailLike = retailLikeEntity(entity);
            const programId = programArchitectureId(entity);
            const ceilingRooted = entity.ceilingRooted === true || entity.floorAlignment === 'ceiling';
            for (const module of entity.footprintModules ?? []) {
                const rect = moduleRect(module);
                const floors = Math.floor(Number(module?.floors) || 0);
                if (!rect || floors < 1) continue;
                const moduleBaseY = finite(Number(module?.baseY), finite(Number(entity?.baseY), 0));
                const roofY = finite(Number(module?.roofY), moduleBaseY + floors * floorH);
                const boundsForY = surfaceY => moduleBounds(rect, surfaceY);

                const surfaces = [{ surfaceClass: 'roof', floorIndex: floors, surfaceY: roofY }];
                // Interior sampling is intentionally sparse: enough to target real
                // backrooms/storefronts without turning boot into a full building
                // survey. Hanging towers include their bottom occupied plate; upright
                // towers begin at floor 1 because ground-level spawn is not the goal.
                const floorIndices = new Set();
                // Retail frontage is a legitimate spawn destination. Sampling its
                // entry floor gives GIGA an actual storefront instead of making the
                // requested class categorically unreachable on upright buildings.
                if (retailLike) floorIndices.add(0);
                if (ceilingRooted) floorIndices.add(0);
                if (floors > 1) floorIndices.add(1);
                if (floors > 2) floorIndices.add(Math.floor((floors - 1) * 0.5));
                if (floors > 2) floorIndices.add(floors - 1);
                for (const floorIndex of floorIndices) {
                    if (floorIndex < 0 || floorIndex >= floors) continue;
                    surfaces.push({ surfaceClass: 'interior-floor', floorIndex, surfaceY: moduleBaseY + floorIndex * floorH });
                }

                for (const surface of surfaces) {
                    const surfaceY = surface.surfaceY;
                    const bounds = boundsForY(surfaceY);
                    const supportKinds = surface.surfaceClass === 'roof'
                        ? new Set(['roof'])
                        : new Set(['floor', 'mezzanine', 'ceiling-building-tip']);
                    const supportPatches = platforms
                        .filter(platform => supportKinds.has(platform?.supportKind) && Math.abs(finite(platform.y) - surfaceY) <= 0.16)
                        .map(patchBounds)
                        .filter(Boolean)
                        .filter(patch => boundsOverlap(patch, bounds, 0.08))
                        .map(patch => clipPatchToBounds(patch, bounds))
                        .filter(Boolean);
                    if (!supportPatches.length) continue;

                    const overheadPatches = [
                        ...platforms.map(patchBounds).filter(Boolean),
                        ...ceilings.map(patchBounds).filter(Boolean),
                    ].filter(patch => patch.yMin >= surfaceY + 2.05 && patch.yMin <= surfaceY + 6.8 && boundsOverlap(patch, bounds, 0.15));

                    const attachedConnectors = connectors.filter(connector =>
                        (connector.endpoints ?? []).some(endpoint =>
                            pointNearModule(endpoint, rect) && Math.abs(finite(endpoint.y) - surfaceY) <= 0.48));
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
                        if (yMin > surfaceY + 2.15 || yMax < surfaceY + 0.05) return false;
                        const wallBounds = {
                            minX: Math.min(finite(wall?.x1), finite(wall?.x2)),
                            maxX: Math.max(finite(wall?.x1), finite(wall?.x2)),
                            minZ: Math.min(finite(wall?.z1), finite(wall?.z2)),
                            maxZ: Math.max(finite(wall?.z1), finite(wall?.z2)),
                        };
                        return boundsOverlap(wallBounds, bounds, 0.45);
                    });
                    const relevantFacades = (entity.facades ?? []).filter(facade =>
                        String(facade?.moduleKey) === String(module.key)
                        && finite(facade?.yMin, -Infinity) <= surfaceY + 1.4
                        && finite(facade?.yMax, Infinity) >= surfaceY + 0.2);
                    const siteId = entity.semanticSiteKey ?? entity.siteId ?? String(payloadKey);
                    const entityId = entity.id ?? payload.ownerId ?? String(payloadKey);
                    const supportAreaM2 = unionAreaOfRects(supportPatches);
                    const largestSupportPatchAreaM2 = supportPatches.reduce((best, patch) => Math.max(best, patchArea(patch)), 0);
                    const storefrontLike = relevantFacades.length > 0 && frontageLikeEntity(entity);
                    const maxSupportSpanM = supportPatches.reduce((best, patch) => Math.max(best, patch.halfX * 2, patch.halfZ * 2), 0);
                    const maxWallSpanM = nearbyWalls.reduce((best, wall) => Math.max(best, segmentLength(wall)), 0);
                    spaces.push({
                        schema: 'jweb.fabric-habitable-space.v2',
                        spaceId: surface.surfaceClass === 'roof' ? `${entityId}:${module.key}:roof` : `${entityId}:${module.key}:floor:${surface.floorIndex}`,
                        payloadKey: String(payloadKey),
                        payloadLayer,
                        siteId,
                        entityId,
                        moduleKey: module.key,
                        floorIndex: surface.floorIndex,
                        surfaceClass: surface.surfaceClass,
                        exposure: surface.surfaceClass === 'roof' ? 'exterior' : 'interior',
                        surfaceY,
                        bounds,
                        supportPatches,
                        overheadPatches,
                        connectorIds,
                        reservations,
                        existingDetailReservations,
                        nearbyWalls,
                        facadeCount: relevantFacades.length,
                        supportAreaM2,
                        largestSupportPatchAreaM2,
                        maxSupportSpanM,
                        maxWallSpanM,
                        ceilingRooted,
                        physicalUseFamily: String(entity?.physicalUse?.family ?? entity?.physicalUse ?? ''),
                        programArchitectureId: programId,
                        retailLike,
                        storefrontLike,
                        chunkSeed: payload?.chunk?.seed ?? rootPayload?.chunk?.seed ?? null,
                    });
                }
            }
        }
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
                // Probe from the intended floor, not from above the whole tower.
                // This is what makes real interior-floor hosts selectable instead
                // of always snapping to the roof above them.
                const feetY = playerPhysics.supportHeightAt(x, z, space.surfaceY + 0.08);
                if (!Number.isFinite(feetY) || Math.abs(feetY - space.surfaceY) > tolerance) continue;
                if (!playerPhysics.poseIsValid(x, z, space.surfaceY)) continue;

                let edgeSupportedDirections = 0;
                for (let i = 0; i < policy.edgeProbeDirections; i++) {
                    const angle = (i / policy.edgeProbeDirections) * TAU;
                    const sx = x + Math.cos(angle) * policy.edgeProbeRadiusM;
                    const sz = z + Math.sin(angle) * policy.edgeProbeRadiusM;
                    const sy = playerPhysics.supportHeightAt(sx, sz, space.surfaceY + 0.12);
                    if (Number.isFinite(sy) && sy >= space.surfaceY - policy.edgeDropToleranceM) edgeSupportedDirections++;
                }
                if (edgeSupportedDirections < policy.minEdgeSupportedDirections) continue;

                let higherContextDirections = 0;
                let sameOrHigherContextDirections = 0;
                let deepDropDirections = 0;
                const contextHeights = [];
                const contextProbeY = space.surfaceClass === 'roof' ? highProbe : space.surfaceY + 0.4;
                for (let i = 0; i < policy.contextProbeDirections; i++) {
                    const angle = (i / policy.contextProbeDirections) * TAU;
                    const sx = x + Math.cos(angle) * policy.contextProbeRadiusM;
                    const sz = z + Math.sin(angle) * policy.contextProbeRadiusM;
                    const sy = playerPhysics.supportHeightAt(sx, sz, contextProbeY);
                    contextHeights.push(sy);
                    if (!Number.isFinite(sy)) continue;
                    if (sy >= space.surfaceY + policy.higherContextDeltaM) higherContextDirections++;
                    if (sy >= space.surfaceY - policy.sameLevelToleranceM) sameOrHigherContextDirections++;
                    if (sy <= space.surfaceY - policy.higherContextDeltaM) deepDropDirections++;
                }

                const overhead = (space.overheadPatches ?? [])
                    .filter(overheadPatch => rectContainsPoint(overheadPatch, x, z, 0.16))
                    .sort((a, b) => a.yMin - b.yMin)[0] ?? null;
                const overheadClearanceM = overhead ? overhead.yMin - space.surfaceY : null;
                const overheadCovered = Number.isFinite(overheadClearanceM) && overheadClearanceM >= 2.05 && overheadClearanceM <= 6.8;
                const edgeDepthM = Math.max(0, Math.min(
                    x - space.bounds.minX, space.bounds.maxX - x,
                    z - space.bounds.minZ, space.bounds.maxZ - z,
                ));
                const wallProbeRadius = Math.max(4.8, Math.min(8.0, finite(space?.maxSupportSpanM, 0) * 0.65));
                const wallDirectionCount = wallDirectionCountAt(space, x, z, wallProbeRadius);
                const elevation = space.surfaceY - origin.feetY;
                const distance = Math.hypot(x - origin.x, z - origin.z);
                const nearbyWallCount = Math.min(12, space.nearbyWalls?.length ?? 0);
                const connectorCount = space.connectorIds?.length ?? 0;
                const peakLike = space.surfaceClass === 'roof' && higherContextDirections === 0
                    && deepDropDirections >= Math.ceil(policy.contextProbeDirections * 0.55);
                const shelterScore = wallDirectionCount * 1.6 + (overheadCovered ? 5 : 0) + Math.min(4, higherContextDirections) * 0.8;
                const enclaveConnectorScore = connectorCount === 1 ? 3.5 : connectorCount === 2 ? 2 : connectorCount > 2 ? -Math.min(3, connectorCount - 2) : 0;
                let score = edgeSupportedDirections * 1.25
                    + higherContextDirections * 2.5
                    + sameOrHigherContextDirections * 0.55
                    + shelterScore
                    + enclaveConnectorScore
                    + (space.surfaceClass === 'roof' ? 5 : -1.5)
                    - Math.abs(elevation - policy.preferredElevationAboveOriginM) * 0.18
                    - distance * 0.035;
                if (peakLike) score -= policy.localPeakPenalty;
                if (space.surfaceClass === 'roof' && higherContextDirections >= policy.preferredHigherContextDirections) score += 4;
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
                    nearbyWallCount,
                    wallDirectionCount,
                    connectorCount,
                    shelterScore,
                    overheadCovered,
                    overheadClearanceM,
                    edgeDepthM,
                    peakLike,
                    contextHeights,
                    space,
                });
            }
        }
    }
    return candidates.sort((a, b) => b.score - a.score || a.radius - b.radius || a.space.spaceId.localeCompare(b.space.spaceId));
}

function terraOperationalAffinity(space) {
    const text = `${space?.physicalUseFamily ?? ''} ${space?.programArchitectureId ?? ''}`.toLowerCase();
    if (/warehouse|storage|utility|server|data|industrial|workshop|archive|service|laboratory/.test(text)) return 64;
    if (/courthouse|institution|civic|office|assembly/.test(text)) return -10;
    return 0;
}

function archetypeFitScore(candidate, archetype) {
    const space = candidate.space;
    const area = finite(space?.supportAreaM2, 0);
    const maxSpan = finite(space?.maxSupportSpanM, 0);
    const wallSpan = finite(space?.maxWallSpanM, 0);
    const contiguousArea = finite(space?.largestSupportPatchAreaM2, 0);
    const interior = space?.surfaceClass === 'interior-floor';
    const roof = space?.surfaceClass === 'roof';
    if (archetype === 'deep-backroom') {
        // Current JWEB large buildings are bay/compound structures: a genuinely
        // huge hall is usually several ~50-65m2 support bays, not one 96m2 slab.
        // TERRA therefore keys on total hall area + a real 9m TV wall, then strongly
        // prefers warehouse/utility/storage/service architecture.
        if (!interior || space?.retailLike || !candidate.overheadCovered
            || area < 90 || contiguousArea < 42 || maxSpan < 6.2 || wallSpan < 9.0) return -Infinity;
        return candidate.score
            + area * 0.055
            + contiguousArea * 0.045
            + wallSpan * 0.9
            + candidate.wallDirectionCount * 1.2
            + terraOperationalAffinity(space)
            + (space.payloadLayer === 'hanging' ? 2 : 0);
    }
    if (archetype === 'hanging-storefront') {
        // "Hanging" is a strong visual preference, not an existence requirement.
        // The actual semantic requirement is a mercantile/workshop frontage with
        // a ceiling and enough wall/floor to host the GIGA screen + hangout.
        if (!interior || !candidate.overheadCovered || !space?.storefrontLike
            || area < 30 || contiguousArea < 24 || maxSpan < 4.2 || wallSpan < 3.8) return -Infinity;
        return candidate.score
            + area * 0.05
            + candidate.wallDirectionCount * 1.4
            + (space.ceilingRooted || space.payloadLayer === 'hanging' ? 18 : 0)
            + (space.retailLike ? 10 : 0)
            + Math.min(4, space.facadeCount ?? 0) * 2.4;
    }
    if (archetype === 'sheltered-roof') {
        // Mega means "sheltered from above generally". A broad upper/service
        // interior is visually and structurally a better host than requiring the
        // rare special case of a roof with another slab hovering over it.
        const shelteredInterior = interior && candidate.overheadCovered;
        const coveredRoof = roof && candidate.overheadCovered;
        if ((!shelteredInterior && !coveredRoof) || area < 20 || contiguousArea < 18 || maxSpan < 3.5) return -Infinity;
        return candidate.score
            + area * 0.04
            + candidate.wallDirectionCount * 1.2
            + (shelteredInterior ? 12 : 8)
            + (space.payloadLayer === 'hanging' ? 2 : 0);
    }
    if (archetype === 'exposed-roof') {
        if (!roof || candidate.overheadCovered || area < 7) return -Infinity;
        return candidate.score + area * 0.025 + Math.max(0, 3 - candidate.wallDirectionCount) * 1.2;
    }
    return candidate.score;
}

const HOST_FALLBACK_ORDER = Object.freeze({
    'deep-backroom': ['deep-backroom', 'hanging-storefront', 'sheltered-roof', 'exposed-roof'],
    'hanging-storefront': ['hanging-storefront', 'sheltered-roof', 'exposed-roof'],
    'sheltered-roof': ['sheltered-roof', 'exposed-roof'],
    'exposed-roof': ['exposed-roof', 'sheltered-roof'],
});

function navigationAudit(playerPhysics, candidate, policy, { moveSpeed, stepSeconds }) {
    const successful = [];
    let verticalRoutes = 0;
    let upRoutes = 0;
    let downRoutes = 0;
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
        if (Math.abs(deltaY) >= policy.verticalRouteDeltaM) {
            verticalRoutes++;
            if (deltaY > 0) upRoutes++;
            else downRoutes++;
        }
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
    return { successful, verticalRoutes, upRoutes, downRoutes, bestDistance };
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
    const selectionKey = spaceSelectionKey(locationRuntime, fabricSpaces);
    const desiredHostArchetype = forcedHostArchetypeForSpawnFlavor()
        ?? chooseSpawnHostArchetype(selectionKey);
    const structural = fabricSpaceSamples(playerPhysics, origin, policy, fabricSpaces);
    const order = HOST_FALLBACK_ORDER[desiredHostArchetype] ?? ['exposed-roof'];

    for (const hostArchetype of order) {
        const pool = structural
            .map(candidate => ({ candidate, fit: archetypeFitScore(candidate, hostArchetype) }))
            .filter(item => Number.isFinite(item.fit))
            .sort((a, b) => b.fit - a.fit || a.candidate.radius - b.candidate.radius)
            .slice(0, Math.max(1, policy.maxNavigationCandidates));
        let best = null;
        for (const item of pool) {
            const candidate = item.candidate;
            const nav = navigationAudit(playerPhysics, candidate, policy, { moveSpeed, stepSeconds });
            if (nav.successful.length < policy.minNavigableHeadings) continue;
            const branchingBonus = nav.successful.length >= 3 && nav.successful.length <= 6 ? 4 : 0;
            const verticalChoiceBonus = nav.upRoutes > 0 && nav.downRoutes > 0 ? 9 : 0;
            const seclusionBonus = hostArchetype === 'deep-backroom'
                ? (nav.successful.length <= 5 ? 7 : -Math.max(0, nav.successful.length - 5) * 3)
                : 0;
            const finalScore = item.fit
                + nav.successful.length * 2.2
                + nav.verticalRoutes * 3.0
                + verticalChoiceBonus
                + branchingBonus
                + seclusionBonus
                + candidateVarietyJitter(selectionKey, candidate, hostArchetype);
            const result = { ...candidate, navigation: nav, finalScore, desiredHostArchetype, hostArchetype };
            if (!best || result.finalScore > best.finalScore) best = result;
        }
        if (best) return best;
    }

    // Last-resort fabric candidate: preserve the old safety contract rather than
    // failing the page because this particular chunk lacked the rolled archetype.
    for (const candidate of structural.slice(0, Math.max(1, policy.maxNavigationCandidates))) {
        const nav = navigationAudit(playerPhysics, candidate, policy, { moveSpeed, stepSeconds });
        if (nav.successful.length < policy.minNavigableHeadings) continue;
        return {
            ...candidate,
            navigation: nav,
            finalScore: candidate.score + nav.successful.length * 2.2 + nav.verticalRoutes * 3
                + candidateVarietyJitter(selectionKey, candidate, 'last-resort'),
            desiredHostArchetype,
            hostArchetype: candidate.space?.surfaceClass === 'roof' ? 'exposed-roof' : 'interior-fallback',
        };
    }
    return null;
}

function relaxedFabricRuntime(locationRuntime) {
    if (!locationRuntime?.selectionPolicy) return locationRuntime;
    const policy = locationRuntime.selectionPolicy;
    return {
        ...locationRuntime,
        selectionPolicy: {
            ...policy,
            // The hangout identity is optional; the old authored district's
            // very specific rooftop fingerprint is not. Prefer the full policy,
            // then accept any ordinary streamed roof that is safely navigable.
            requireFabricConnector: false,
            minElevationAboveOriginM: 0,
            minEdgeSupportedDirections: Math.min(4, policy.minEdgeSupportedDirections ?? 4),
            preferredHigherContextDirections: 0,
            localPeakPenalty: 0,
            minNavigableHeadings: Math.min(2, policy.minNavigableHeadings ?? 2),
        },
    };
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
// a nearby pose that the real controller can actually move away from. Fabric-space
// selection is stricter: the pose must first belong to a roof surface published by
// the committed chunk payload, so a physically walkable interior floor can never
// masquerade as a rooftop merely because physics sampling liked it.
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
        const preferredEnclave = selectSpawnEnclaveCandidate({
            playerPhysics, origin, locationRuntime, fabricSpaces, moveSpeed, stepSeconds,
        });
        const enclave = preferredEnclave ?? selectSpawnEnclaveCandidate({
            playerPhysics,
            origin,
            locationRuntime: relaxedFabricRuntime(locationRuntime),
            fabricSpaces,
            moveSpeed,
            stepSeconds,
        });
        if (enclave) {
            const hostSpace = {
                spaceId: enclave.space.spaceId,
                payloadKey: enclave.space.payloadKey,
                payloadLayer: enclave.space.payloadLayer ?? 'ground',
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
                nearbyWalls: enclave.space.nearbyWalls,
                overheadPatches: enclave.space.overheadPatches,
                supportAreaM2: enclave.space.supportAreaM2,
                largestSupportPatchAreaM2: enclave.space.largestSupportPatchAreaM2,
                maxSupportSpanM: enclave.space.maxSupportSpanM,
                maxWallSpanM: enclave.space.maxWallSpanM,
                overheadCovered: enclave.overheadCovered,
                overheadClearanceM: enclave.overheadClearanceM,
                wallDirectionCount: enclave.wallDirectionCount,
                edgeDepthM: enclave.edgeDepthM,
                ceilingRooted: enclave.space.ceilingRooted,
                retailLike: enclave.space.retailLike,
                storefrontLike: enclave.space.storefrontLike,
                physicalUseFamily: enclave.space.physicalUseFamily,
                programArchitectureId: enclave.space.programArchitectureId,
                hostArchetype: enclave.hostArchetype,
                desiredHostArchetype: enclave.desiredHostArchetype,
            };
            const routeFan = enclave.navigation.successful;
            const proof = {
                ok: true,
                pose: { x: enclave.x, z: enclave.z, feetY: enclave.feetY },
                routeKind: preferredEnclave ? 'streamed-elevated-enclave' : 'streamed-roof-fallback',
                escapeDistance: enclave.navigation.bestDistance,
                candidateIndex: 0,
                candidateRing: enclave.ring,
                probes: routeFan.length,
                searchedCandidates: Math.min(locationRuntime.selectionPolicy.maxNavigationCandidates, fabricSpaces.length * 9),
                fabricSpace: hostSpace,
                routeFan,
                locationSelection: {
                    mode: preferredEnclave ? 'fabric-space:elevated-roof-enclave' : 'fabric-space:ordinary-roof-fallback',
                    score: enclave.finalScore,
                    desiredHostArchetype: enclave.desiredHostArchetype,
                    hostArchetype: enclave.hostArchetype,
                    surfaceClass: enclave.space.surfaceClass,
                    supportAreaM2: enclave.space.supportAreaM2,
                    largestSupportPatchAreaM2: enclave.space.largestSupportPatchAreaM2,
                    overheadCovered: enclave.overheadCovered,
                    overheadClearanceM: enclave.overheadClearanceM,
                    wallDirectionCount: enclave.wallDirectionCount,
                    edgeDepthM: enclave.edgeDepthM,
                    elevationAboveRequestedM: enclave.elevation,
                    edgeSupportedDirections: enclave.edgeSupportedDirections,
                    higherContextDirections: enclave.higherContextDirections,
                    sameOrHigherContextDirections: enclave.sameOrHigherContextDirections,
                    deepDropDirections: enclave.deepDropDirections,
                    nearbyWallCount: enclave.nearbyWallCount,
                    shelterScore: enclave.shelterScore,
                    peakLike: enclave.peakLike,
                    navigableHeadings: routeFan.length,
                    verticalRoutes: enclave.navigation.verticalRoutes,
                    upRoutes: enclave.navigation.upRoutes,
                    downRoutes: enclave.navigation.downRoutes,
                    hostSpace: {
                        spaceId: hostSpace.spaceId,
                        payloadLayer: hostSpace.payloadLayer,
                        siteId: hostSpace.siteId,
                        entityId: hostSpace.entityId,
                        moduleKey: hostSpace.moduleKey,
                        surfaceClass: hostSpace.surfaceClass,
                        exposure: hostSpace.exposure,
                        hostArchetype: hostSpace.hostArchetype,
                        desiredHostArchetype: hostSpace.desiredHostArchetype,
                        connectorIds: [...hostSpace.connectorIds],
                    },
                },
            };
            proof.location = publishBoundLocation(locationRuntime, proof);
            console.log?.('[spawn-location] bound streamed fabric roof', proof.locationSelection);
            return proof;
        }
        console.warn?.('[spawn-location] no streamed fabric roof passed spawn selection; using conservative local spawn proof');
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
