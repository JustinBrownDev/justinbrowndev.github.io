const EPS = 1e-6;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function dimsOf(pick, fallback) {
    const raw = pick?.dimensionsM;
    if (!Array.isArray(raw) || raw.length < 3) return [...fallback];
    return [
        Math.max(0.08, finite(Number(raw[0]), fallback[0])),
        Math.max(0.08, finite(Number(raw[1]), fallback[1])),
        Math.max(0.08, finite(Number(raw[2]), fallback[2])),
    ];
}

function normalizedBox(input) {
    if (!input) return null;
    const x = finite(input.x);
    const z = finite(input.z);
    const halfX = Math.max(0, finite(input.halfX, finite(input.hx, finite(input.sx) * 0.5)));
    const halfZ = Math.max(0, finite(input.halfZ, finite(input.hz, finite(input.sz) * 0.5)));
    const yMin = finite(input.yMin, -Infinity);
    const yMax = finite(input.yMax, Infinity);
    return {
        ...input,
        x, z, halfX, halfZ, yMin, yMax,
        minX: finite(input.minX, x - halfX),
        maxX: finite(input.maxX, x + halfX),
        minZ: finite(input.minZ, z - halfZ),
        maxZ: finite(input.maxZ, z + halfZ),
    };
}

function boxesOverlap(a, b, pad = 0) {
    const aa = normalizedBox(a), bb = normalizedBox(b);
    if (!aa || !bb) return false;
    if (aa.yMin >= bb.yMax - EPS || aa.yMax <= bb.yMin + EPS) return false;
    return aa.minX < bb.maxX + pad && aa.maxX > bb.minX - pad
        && aa.minZ < bb.maxZ + pad && aa.maxZ > bb.minZ - pad;
}

function boxInsidePatch(box, patch, pad = 0.06) {
    const b = normalizedBox(box), p = normalizedBox(patch);
    if (!b || !p) return false;
    return b.minX >= p.minX + pad && b.maxX <= p.maxX - pad
        && b.minZ >= p.minZ + pad && b.maxZ <= p.maxZ - pad;
}

function supportedByHost(hostSpace, box) {
    return (hostSpace?.supportPatches ?? []).some(patch => boxInsidePatch(box, patch));
}

function slotPick(composition, slot, index = 0) {
    return composition?.slots?.find(item => item.slot === slot)?.picks?.[index] ?? null;
}

function placementEnvelope(id, placement, kind = 'spawn-furniture-envelope') {
    const [w, h, d] = placement.dimensionsM;
    return normalizedBox({
        id,
        kind,
        ownerId: placement.instanceId,
        x: placement.transform.x,
        z: placement.transform.z,
        halfX: w * 0.5 + 0.10,
        halfZ: d * 0.5 + 0.10,
        yMin: placement.transform.y - h * 0.5,
        yMax: placement.transform.y + h * 0.5,
        source: 'spawn-spatial-plan',
    });
}

function routeReservations(idBase, start, end, width = 0.42, segments = 3) {
    const reservations = [];
    for (let index = 0; index < segments; index++) {
        const t0 = index / segments;
        const t1 = (index + 1) / segments;
        const a = {
            x: start.x + (end.x - start.x) * t0,
            z: start.z + (end.z - start.z) * t0,
            feetY: start.feetY + ((end.feetY ?? start.feetY) - start.feetY) * t0,
        };
        const b = {
            x: start.x + (end.x - start.x) * t1,
            z: start.z + (end.z - start.z) * t1,
            feetY: start.feetY + ((end.feetY ?? start.feetY) - start.feetY) * t1,
        };
        const minX = Math.min(a.x, b.x) - width;
        const maxX = Math.max(a.x, b.x) + width;
        const minZ = Math.min(a.z, b.z) - width;
        const maxZ = Math.max(a.z, b.z) + width;
        reservations.push(normalizedBox({
            id: `${idBase}:${index}`,
            kind: 'spawn-route-fan-keep-clear',
            x: (minX + maxX) * 0.5,
            z: (minZ + maxZ) * 0.5,
            halfX: (maxX - minX) * 0.5,
            halfZ: (maxZ - minZ) * 0.5,
            yMin: Math.min(a.feetY, b.feetY),
            yMax: Math.max(a.feetY, b.feetY) + 2.05,
            source: 'spawn-route-fan',
        }));
    }
    return reservations;
}

function candidateCenters(hostSpace, halfX, halfZ) {
    const candidates = [];
    for (const patch of hostSpace?.supportPatches ?? []) {
        const p = normalizedBox(patch);
        if (!p) continue;
        const marginX = halfX + 0.12;
        const marginZ = halfZ + 0.12;
        const minX = p.minX + marginX, maxX = p.maxX - marginX;
        const minZ = p.minZ + marginZ, maxZ = p.maxZ - marginZ;
        if (minX > maxX || minZ > maxZ) continue;
        const xs = [...new Set([minX, (minX + maxX) * 0.5, maxX].map(v => Number(v.toFixed(4))))];
        const zs = [...new Set([minZ, (minZ + maxZ) * 0.5, maxZ].map(v => Number(v.toFixed(4))))];
        for (const x of xs) for (const z of zs) candidates.push({ x, z });
    }
    return candidates;
}

function candidateClear(box, blockers, hostSpace) {
    return supportedByHost(hostSpace, box) && !blockers.some(other => boxesOverlap(box, other, 0.04));
}

function facingRotation(from, target) {
    return Math.atan2(target.x - from.x, target.z - from.z);
}

function makePlacement({ locationId, slot, pick, index, x, y, z, rotY = 0, relationTo = null, fallbackDims }) {
    const dimensionsM = dimsOf(pick, fallbackDims);
    return {
        schema: 'jweb.spawn-placement.v1',
        instanceId: `${locationId}:${slot}:${index}`,
        slot,
        familyId: pick?.familyId ?? null,
        variantId: pick?.variantId ?? null,
        label: pick?.label ?? slot,
        constructionRecipe: pick?.constructionRecipe ?? null,
        dimensionsM,
        placement: pick?.placement ?? null,
        mount: pick?.placement?.mount ?? null,
        relationTo,
        transform: { x, y, z, rotY },
        phase: 'memory-silhouette',
    };
}

function wallMountedPose(hostSpace, pose, pick, dims, blockers) {
    const candidates = [];
    const width = dims[0], height = dims[1], depth = dims[2];
    const wallOffset = Math.max(0.01, finite(Number(pick?.placement?.wallOffsetM), 0.03));
    const centerHeight = Math.max(height * 0.5 + 0.25, finite(Number(pick?.placement?.centerHeightAboveSurfaceM), 1.35));
    const hostCenter = { x: finite(hostSpace?.bounds?.x, pose.x), z: finite(hostSpace?.bounds?.z, pose.z) };
    for (const wall of hostSpace?.nearbyWalls ?? []) {
        const x1 = Number(wall?.x1), z1 = Number(wall?.z1), x2 = Number(wall?.x2), z2 = Number(wall?.z2);
        if (![x1, z1, x2, z2].every(Number.isFinite)) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < width + 0.18) continue;
        const tx = dx / length, tz = dz / length;
        let nx = -tz, nz = tx;
        const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
        if ((hostCenter.x - mx) * nx + (hostCenter.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
        const x = mx + nx * (depth * 0.5 + wallOffset);
        const z = mz + nz * (depth * 0.5 + wallOffset);
        const y = hostSpace.surfaceY + centerHeight;
        const box = normalizedBox({
            x, z,
            halfX: Math.abs(tx) * width * 0.5 + Math.abs(nx) * depth * 0.5,
            halfZ: Math.abs(tz) * width * 0.5 + Math.abs(nz) * depth * 0.5,
            yMin: y - height * 0.5,
            yMax: y + height * 0.5,
        });
        if (blockers.some(other => boxesOverlap(box, other, 0.04))) continue;
        candidates.push({ x, y, z, rotY: facingRotation({ x, z }, { x: x + nx, z: z + nz }), box, score: Math.hypot(x - pose.x, z - pose.z) });
    }
    return candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z)[0] ?? null;
}

function chooseSupportPlacement({ locationId, pose, hostSpace, blockers, composition }) {
    const supportPick = slotPick(composition, 'tv-support');
    const tvPick = slotPick(composition, 'primary-tv');
    if (!supportPick || !tvPick) return null;
    const supportDims = dimsOf(supportPick, [0.92, 0.72, 0.48]);
    const tvDims = dimsOf(tvPick, [0.82, 0.62, 0.38]);
    const wallMounted = tvPick?.placement?.mount === 'wall';
    const halfX = (wallMounted ? supportDims[0] : Math.max(supportDims[0], tvDims[0])) * 0.5;
    const halfZ = (wallMounted ? supportDims[2] : Math.max(supportDims[2], tvDims[2])) * 0.5;
    const candidates = candidateCenters(hostSpace, halfX, halfZ)
        .map(point => {
            const box = normalizedBox({
                x: point.x, z: point.z, halfX, halfZ,
                yMin: hostSpace.surfaceY,
                yMax: hostSpace.surfaceY + supportDims[1] + (wallMounted ? 0 : tvDims[1]),
            });
            const distanceFromSpawn = Math.hypot(point.x - pose.x, point.z - pose.z);
            return { ...point, box, score: distanceFromSpawn };
        })
        .filter(candidate => candidateClear(candidate.box, blockers, hostSpace))
        .sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
    const chosen = candidates[0];
    if (!chosen) return null;
    const rotY = facingRotation(chosen, pose);
    const support = makePlacement({
        locationId, slot: 'tv-support', pick: supportPick, index: 0,
        x: chosen.x, y: hostSpace.surfaceY + supportDims[1] * 0.5, z: chosen.z, rotY,
        fallbackDims: supportDims,
    });

    if (wallMounted) {
        const wallPose = wallMountedPose(hostSpace, pose, tvPick, tvDims, blockers);
        if (!wallPose) return null;
        const tv = makePlacement({
            locationId, slot: 'primary-tv', pick: tvPick, index: 0,
            x: wallPose.x, y: wallPose.y, z: wallPose.z, rotY: wallPose.rotY,
            fallbackDims: tvDims,
        });
        return { support, tv, footprint: chosen.box, tvFootprint: wallPose.box };
    }

    const tv = makePlacement({
        locationId, slot: 'primary-tv', pick: tvPick, index: 0,
        x: chosen.x,
        y: hostSpace.surfaceY + supportDims[1] + tvDims[1] * 0.5,
        z: chosen.z,
        rotY,
        relationTo: support.instanceId,
        fallbackDims: tvDims,
    });
    return { support, tv, footprint: chosen.box };
}

function chooseSeats({ locationId, pose, hostSpace, blockers, composition, tvPlacement }) {
    const slot = composition?.slots?.find(item => item.slot === 'seating');
    const picks = slot?.picks ?? [];
    if (!picks.length || !tvPlacement) return [];
    const seats = [];
    const radii = [1.25, 1.55, 1.85];
    const angles = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
    for (let index = 0; index < Math.min(2, picks.length); index++) {
        const pick = picks[index];
        const dims = dimsOf(pick, [0.56, 0.86, 0.58]);
        const candidates = [];
        for (const radius of radii) {
            for (const angle of angles) {
                const x = tvPlacement.transform.x + Math.cos(angle) * radius;
                const z = tvPlacement.transform.z + Math.sin(angle) * radius;
                const box = normalizedBox({
                    x, z, halfX: dims[0] * 0.5 + 0.08, halfZ: dims[2] * 0.5 + 0.08,
                    yMin: hostSpace.surfaceY, yMax: hostSpace.surfaceY + dims[1],
                });
                if (!candidateClear(box, [...blockers, ...seats.map(item => placementEnvelope(`${item.instanceId}:test`, item))], hostSpace)) continue;
                const spawnDistance = Math.hypot(x - pose.x, z - pose.z);
                const tvDistance = Math.hypot(x - tvPlacement.transform.x, z - tvPlacement.transform.z);
                candidates.push({ x, z, box, score: spawnDistance * 0.2 - Math.abs(tvDistance - 1.55) });
            }
        }
        candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
        const chosen = candidates[0];
        if (!chosen) continue;
        seats.push(makePlacement({
            locationId, slot: 'seating', pick, index,
            x: chosen.x, y: hostSpace.surfaceY + dims[1] * 0.5, z: chosen.z,
            rotY: facingRotation(chosen, tvPlacement.transform),
            relationTo: tvPlacement.instanceId,
            fallbackDims: dims,
        }));
    }
    return seats;
}

function chooseLight({ locationId, hostSpace, blockers, composition, tvPlacement }) {
    const pick = slotPick(composition, 'warm-practical');
    if (!pick || !tvPlacement) return null;
    const dims = dimsOf(pick, [0.28, 0.56, 0.28]);
    const candidates = [];
    for (const radius of [0.62, 0.82, 1.02]) {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = tvPlacement.transform.x + Math.cos(angle) * radius;
            const z = tvPlacement.transform.z + Math.sin(angle) * radius;
            const box = normalizedBox({
                x, z, halfX: dims[0] * 0.5 + 0.06, halfZ: dims[2] * 0.5 + 0.06,
                yMin: hostSpace.surfaceY, yMax: hostSpace.surfaceY + dims[1],
            });
            if (candidateClear(box, blockers, hostSpace)) candidates.push({ x, z, box });
        }
    }
    const chosen = candidates[0];
    if (!chosen) return null;
    return makePlacement({
        locationId, slot: 'warm-practical', pick, index: 0,
        x: chosen.x, y: hostSpace.surfaceY + dims[1] * 0.5, z: chosen.z,
        rotY: facingRotation(chosen, tvPlacement.transform),
        relationTo: tvPlacement.instanceId,
        fallbackDims: dims,
    });
}

export function compileSpawnSpatialPlan({
    locationId,
    pose,
    hostSpace,
    routeFan = [],
    composition,
} = {}) {
    if (!locationId || !pose || !hostSpace || !composition) return null;
    const reservations = [];
    reservations.push(normalizedBox({
        id: `${locationId}:arrival-keep-clear`,
        kind: 'spawn-arrival-keep-clear',
        x: pose.x, z: pose.z,
        halfX: 0.72, halfZ: 0.72,
        yMin: pose.feetY, yMax: pose.feetY + 2.05,
        source: 'spawn-spatial-plan',
    }));
    routeFan.slice(0, 6).forEach((route, index) => {
        if (!route?.end || !Number.isFinite(route.end.x) || !Number.isFinite(route.end.z)) return;
        reservations.push(...routeReservations(`${locationId}:route:${index}`, pose, route.end));
    });

    const structuralBlockers = [
        ...(hostSpace.reservations ?? []).map(normalizedBox).filter(Boolean),
        ...(hostSpace.existingDetailReservations ?? []).map(normalizedBox).filter(Boolean),
        ...reservations,
    ];
    const placements = [];
    const unresolved = [];

    const tvCluster = chooseSupportPlacement({ locationId, pose, hostSpace, blockers: structuralBlockers, composition });
    if (tvCluster) {
        placements.push(tvCluster.support, tvCluster.tv);
        const clusterReservation = normalizedBox({
            ...tvCluster.footprint,
            id: `${locationId}:tv-cluster-envelope`,
            kind: 'spawn-furniture-envelope',
            ownerId: tvCluster.support.instanceId,
            source: 'spawn-spatial-plan',
        });
        reservations.push(clusterReservation);
        structuralBlockers.push(clusterReservation);
        if (tvCluster.tvFootprint) {
            const tvReservation = normalizedBox({
                ...tvCluster.tvFootprint,
                id: `${locationId}:wall-tv-envelope`,
                kind: 'spawn-wall-mounted-envelope',
                ownerId: tvCluster.tv.instanceId,
                source: 'spawn-spatial-plan',
            });
            reservations.push(tvReservation);
            structuralBlockers.push(tvReservation);
        }
    } else {
        unresolved.push('primary-tv', 'tv-support');
    }

    const tvPlacement = placements.find(item => item.slot === 'primary-tv') ?? null;
    const seats = chooseSeats({ locationId, pose, hostSpace, blockers: structuralBlockers, composition, tvPlacement });
    for (const seat of seats) {
        placements.push(seat);
        const envelope = placementEnvelope(`${seat.instanceId}:envelope`, seat);
        reservations.push(envelope);
        structuralBlockers.push(envelope);
    }
    if (seats.length < 2) unresolved.push('seating');

    const light = chooseLight({ locationId, hostSpace, blockers: structuralBlockers, composition, tvPlacement });
    if (light) {
        placements.push(light);
        const envelope = placementEnvelope(`${light.instanceId}:envelope`, light);
        reservations.push(envelope);
    } else unresolved.push('warm-practical');

    return Object.freeze({
        schema: 'jweb.spawn-spatial-plan.v1',
        locationId,
        hostSpaceId: hostSpace.spaceId,
        ready: unresolved.length === 0,
        unresolved: [...new Set(unresolved)],
        reservations,
        placements,
        realizedSlots: [...new Set(placements.map(item => item.slot))],
    });
}

export function spawnSpatialPlanOverlaps(a, b, pad = 0) {
    return boxesOverlap(a, b, pad);
}
