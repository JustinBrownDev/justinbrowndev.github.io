import { augmentSpawnProgressionLayout } from './spawn-progression-layout.js';
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

function fitsHostHeadroom(hostSpace, box, margin = 0.08) {
    if (!hostSpace?.overheadCovered || !Number.isFinite(hostSpace?.overheadClearanceM)) return true;
    const b = normalizedBox(box);
    return !!b && b.yMax <= hostSpace.surfaceY + hostSpace.overheadClearanceM - margin;
}

function candidateClear(box, blockers, hostSpace) {
    return supportedByHost(hostSpace, box)
        && fitsHostHeadroom(hostSpace, box)
        && !blockers.some(other => boxesOverlap(box, other, 0.04));
}

function wallBlockers(hostSpace) {
    return (hostSpace?.nearbyWalls ?? []).map((wall, index) => {
        const thickness = Math.max(0.08, finite(Number(wall?.thickness), 0.14));
        const x1 = finite(Number(wall?.x1)), x2 = finite(Number(wall?.x2));
        const z1 = finite(Number(wall?.z1)), z2 = finite(Number(wall?.z2));
        const minX = Math.min(x1, x2) - thickness * 0.5;
        const maxX = Math.max(x1, x2) + thickness * 0.5;
        const minZ = Math.min(z1, z2) - thickness * 0.5;
        const maxZ = Math.max(z1, z2) + thickness * 0.5;
        return normalizedBox({
            id: `host-wall:${index}`,
            kind: 'host-structural-wall',
            x: (minX + maxX) * 0.5,
            z: (minZ + maxZ) * 0.5,
            halfX: (maxX - minX) * 0.5,
            halfZ: (maxZ - minZ) * 0.5,
            yMin: finite(Number(wall?.yMin), hostSpace.surfaceY),
            yMax: finite(Number(wall?.yMax), hostSpace.surfaceY + 3),
        });
    }).filter(Boolean);
}

function facingRotation(from, target) {
    return Math.atan2(target.x - from.x, target.z - from.z);
}

function orientedHalfExtents(dimensionsM, rotY = 0, pad = 0) {
    const width = Math.max(0.01, finite(Number(dimensionsM?.[0]), 0.5));
    const depth = Math.max(0.01, finite(Number(dimensionsM?.[2]), 0.5));
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    return {
        halfX: cos * width * 0.5 + sin * depth * 0.5 + pad,
        halfZ: sin * width * 0.5 + cos * depth * 0.5 + pad,
    };
}

function wrappedAngleDistance(a, b) {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function chooseGroundMediaPlacement({ locationId, pose, hostSpace, blockers, composition }) {
    const tvPick = slotPick(composition, 'primary-tv');
    if (!tvPick) return null;
    const tvDims = dimsOf(tvPick, [0.82, 0.62, 0.38]);
    const rotations = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    const candidates = [];
    for (const rotY of rotations) {
        const extents = orientedHalfExtents(tvDims, rotY, 0.10);
        for (const point of candidateCenters(hostSpace, extents.halfX, extents.halfZ)) {
            const box = normalizedBox({
                x: point.x, z: point.z,
                halfX: extents.halfX, halfZ: extents.halfZ,
                yMin: hostSpace.surfaceY,
                yMax: hostSpace.surfaceY + tvDims[1],
            });
            if (!candidateClear(box, blockers, hostSpace)) continue;
            const desiredRotY = facingRotation(point, pose);
            const distanceFromSpawn = Math.hypot(point.x - pose.x, point.z - pose.z);
            const facingPenalty = wrappedAngleDistance(rotY, desiredRotY);
            candidates.push({ ...point, rotY, box, score: distanceFromSpawn - facingPenalty * 1.8 });
        }
    }
    candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z || a.rotY - b.rotY);
    const chosen = candidates[0];
    if (!chosen) return null;
    const tv = makePlacement({
        locationId, slot: 'primary-tv', pick: tvPick, index: 0,
        x: chosen.x,
        y: hostSpace.surfaceY + tvDims[1] * 0.5,
        z: chosen.z,
        rotY: chosen.rotY,
        fallbackDims: tvDims,
    });
    return { support: null, tv, footprint: chosen.box, groundMedia: true };
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
        tags: [...(pick?.tags ?? [])],
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
    const centerHeight = Math.max(height * 0.5 + 0.18, finite(Number(pick?.placement?.centerHeightAboveSurfaceM), 1.35));
    const hostCenter = { x: finite(hostSpace?.bounds?.x, pose.x), z: finite(hostSpace?.bounds?.z, pose.z) };
    for (const wall of hostSpace?.nearbyWalls ?? []) {
        const x1 = Number(wall?.x1), z1 = Number(wall?.z1), x2 = Number(wall?.x2), z2 = Number(wall?.z2);
        if (![x1, z1, x2, z2].every(Number.isFinite)) continue;
        const wallYMin = finite(Number(wall?.yMin), hostSpace.surfaceY);
        const wallYMax = finite(Number(wall?.yMax), hostSpace.surfaceY + 3.15);
        if (wallYMin > hostSpace.surfaceY + 0.2 || wallYMax < hostSpace.surfaceY + Math.min(height + 0.15, 2.2)) continue;
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
        if (!fitsHostHeadroom(hostSpace, box, 0.10)) continue;
        if (box.yMax > wallYMax + 0.08) continue;
        if (blockers.some(other => boxesOverlap(box, other, 0.04))) continue;
        const centerBias = -Math.hypot(x - hostCenter.x, z - hostCenter.z) * 0.08;
        const spanBonus = Math.min(8, length - width);
        candidates.push({
            x, y, z,
            rotY: facingRotation({ x, z }, { x: x + nx, z: z + nz }),
            box,
            score: Math.hypot(x - pose.x, z - pose.z) + centerBias + spanBonus,
        });
    }
    return candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z)[0] ?? null;
}

function chooseSupportPlacement({ locationId, pose, hostSpace, blockers, wallMountBlockers = blockers, composition }) {
    const profile = composition?.startProfile ?? {};
    if (profile.groundMedia === true) {
        return chooseGroundMediaPlacement({ locationId, pose, hostSpace, blockers, composition });
    }
    const supportPick = slotPick(composition, 'tv-support');
    const tvPick = slotPick(composition, 'primary-tv');
    if (!supportPick || !tvPick) return null;
    const supportDims = dimsOf(supportPick, [0.92, 0.72, 0.48]);
    const tvDims = dimsOf(tvPick, [0.82, 0.62, 0.38]);
    const largeCrt = Number(profile.progressionRank ?? 0) >= 3 && profile.mediaRecipes?.includes?.('crt-box');
    if (largeCrt) {
        supportDims[0] = Math.max(supportDims[0], tvDims[0] * 0.78);
        supportDims[1] = Number(profile.progressionRank ?? 0) >= 5
            ? Math.min(supportDims[1], 0.34)
            : Math.max(supportDims[1], Math.min(0.82, tvDims[1] * 0.24));
        supportDims[2] = Math.max(supportDims[2], tvDims[2] * 0.76);
    }
    const wallMounted = tvPick?.placement?.mount === 'wall';
    let candidates = [];
    if (largeCrt && !wallMounted) {
        // Big physical cabinets belong to the room/building axes. The old pass
        // picked an unrotated footprint and only then turned the TV toward the
        // player, which made the realized cabinet cross walls and floor-bay
        // boundaries. Evaluate the actual rotated cabinet before accepting it.
        for (const rotY of [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]) {
            const supportExt = orientedHalfExtents(supportDims, rotY, 0.10);
            const tvExt = orientedHalfExtents(tvDims, rotY, 0.10);
            const halfX = Math.max(supportExt.halfX, tvExt.halfX);
            const halfZ = Math.max(supportExt.halfZ, tvExt.halfZ);
            for (const point of candidateCenters(hostSpace, halfX, halfZ)) {
                const box = normalizedBox({
                    x: point.x, z: point.z, halfX, halfZ,
                    yMin: hostSpace.surfaceY,
                    yMax: hostSpace.surfaceY + supportDims[1] + tvDims[1],
                });
                if (!candidateClear(box, blockers, hostSpace)) continue;
                const desiredRotY = facingRotation(point, pose);
                const distanceFromSpawn = Math.hypot(point.x - pose.x, point.z - pose.z);
                candidates.push({
                    ...point, rotY, box,
                    score: distanceFromSpawn - wrappedAngleDistance(rotY, desiredRotY) * 1.5,
                });
            }
        }
    } else {
        const halfX = (wallMounted ? supportDims[0] : Math.max(supportDims[0], tvDims[0])) * 0.5;
        const halfZ = (wallMounted ? supportDims[2] : Math.max(supportDims[2], tvDims[2])) * 0.5;
        candidates = candidateCenters(hostSpace, halfX, halfZ)
            .map(point => {
                const rotY = facingRotation(point, pose);
                const ext = orientedHalfExtents(
                    [wallMounted ? supportDims[0] : Math.max(supportDims[0], tvDims[0]), 1,
                        wallMounted ? supportDims[2] : Math.max(supportDims[2], tvDims[2])],
                    rotY,
                );
                const box = normalizedBox({
                    x: point.x, z: point.z, halfX: ext.halfX, halfZ: ext.halfZ,
                    yMin: hostSpace.surfaceY,
                    yMax: hostSpace.surfaceY + supportDims[1] + (wallMounted ? 0 : tvDims[1]),
                });
                const distanceFromSpawn = Math.hypot(point.x - pose.x, point.z - pose.z);
                return { ...point, rotY, box, score: wallMounted ? -distanceFromSpawn : distanceFromSpawn };
            })
            .filter(candidate => candidateClear(candidate.box, blockers, hostSpace));
    }
    candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z || a.rotY - b.rotY);
    const chosen = candidates[0];
    if (!chosen) return null;
    const rotY = chosen.rotY ?? facingRotation(chosen, pose);
    const support = makePlacement({
        locationId, slot: 'tv-support', pick: { ...supportPick, dimensionsM: supportDims }, index: 0,
        x: chosen.x, y: hostSpace.surfaceY + supportDims[1] * 0.5, z: chosen.z, rotY,
        fallbackDims: supportDims,
    });

    if (wallMounted) {
        const supportEnvelope = normalizedBox({ ...chosen.box, id: `${locationId}:support-temp-envelope` });
        const wallPose = wallMountedPose(hostSpace, pose, tvPick, tvDims, [...wallMountBlockers, supportEnvelope]);
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

// The viewing-side coordinate frame a focal object (the TV) defines: origin at
// its position, forward pointing into the room it faces, right perpendicular
// to that. Every seating decision below is made in this frame so "on the
// viewing side" and "how far back / how far to the side" are simple
// dot-product checks instead of raw world-space angle math.
function focalFrame(tvPlacement) {
    const rotY = finite(tvPlacement?.transform?.rotY, 0);
    return {
        x: finite(tvPlacement?.transform?.x),
        z: finite(tvPlacement?.transform?.z),
        forward: { x: Math.sin(rotY), z: Math.cos(rotY) },
        right: { x: Math.cos(rotY), z: -Math.sin(rotY) },
    };
}

function framePoint(frame, forwardM, lateralM) {
    return {
        x: frame.x + frame.forward.x * forwardM + frame.right.x * lateralM,
        z: frame.z + frame.forward.z * forwardM + frame.right.z * lateralM,
    };
}

// dot((seat - focal), forward): positive means the seat is on the focal
// object's front/viewing side, not behind its screen.
function forwardOffset(frame, x, z) {
    return (x - frame.x) * frame.forward.x + (z - frame.z) * frame.forward.z;
}

function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1x = bx - ax, d1z = bz - az;
    const d2x = dx - cx, d2z = dz - cz;
    const denom = d1x * d2z - d1z * d2x;
    if (Math.abs(denom) < 1e-9) return false;
    const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
    const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// A viewer whose straight line to the focal object passes through a solid
// wall isn't really "watching" it, no matter how the angle math works out.
function sightlineCrossesWall(from, to, hostSpace) {
    const eyeY = hostSpace.surfaceY + 1.1;
    for (const wall of hostSpace?.nearbyWalls ?? []) {
        const x1 = finite(Number(wall?.x1)), z1 = finite(Number(wall?.z1));
        const x2 = finite(Number(wall?.x2)), z2 = finite(Number(wall?.z2));
        if (![x1, z1, x2, z2].every(Number.isFinite)) continue;
        const wallYMin = finite(Number(wall?.yMin), hostSpace.surfaceY);
        const wallYMax = finite(Number(wall?.yMax), hostSpace.surfaceY + 3);
        if (wallYMin > eyeY || wallYMax < eyeY) continue;
        if (segmentsIntersect(from.x, from.z, to.x, to.z, x1, z1, x2, z2)) return true;
    }
    return false;
}

function hashUnit(key) {
    let h = 2166136261;
    const text = String(key);
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
}

// A small set of relational seating compositions instead of independently
// optimizing every chair around a ring. Each entry is {forwardRatio,
// lateralRatio} per seat slot, scaled by the profile's own radius sense so
// small-TV and Terra-scale rooms both get a proportioned layout. Picking
// among a handful of recognizable arrangements (not a dense angle grid) is
// what keeps a 4-chair hangout reading as "people sat down together" instead
// of "chairs were placed by a satellite around a dish".
const SEAT_COMPOSITIONS = [
    // loose asymmetric hangout
    [{ forwardRatio: 0.85, lateralRatio: -0.95 }, { forwardRatio: 1.05, lateralRatio: 0.55 },
        { forwardRatio: 1.55, lateralRatio: -0.15 }, { forwardRatio: 1.5, lateralRatio: 1.15 }],
    // symmetric front row with a staggered second rank
    [{ forwardRatio: 1.0, lateralRatio: -0.8 }, { forwardRatio: 1.0, lateralRatio: 0.8 },
        { forwardRatio: 1.5, lateralRatio: -0.35 }, { forwardRatio: 1.5, lateralRatio: 0.35 }],
    // tight huddle with one spare chair further out
    [{ forwardRatio: 0.85, lateralRatio: -0.5 }, { forwardRatio: 0.85, lateralRatio: 0.5 },
        { forwardRatio: 1.35, lateralRatio: 0.0 }, { forwardRatio: 1.7, lateralRatio: 1.3 }],
];

function chooseSeats({ locationId, pose, hostSpace, blockers, composition, tvPlacement }) {
    const slot = composition?.slots?.find(item => item.slot === 'seating');
    const picks = slot?.picks ?? [];
    if (!picks.length || !tvPlacement) return [];
    const radii = Array.isArray(composition?.startProfile?.seatRadiiM)
        ? composition.startProfile.seatRadiiM.map(value => Math.max(0.9, finite(Number(value), 1.55)))
        : [1.25, 1.55, 1.85];
    const baseRadius = radii[Math.floor(radii.length / 2)] ?? 1.55;
    const frame = focalFrame(tvPlacement);
    const minForwardM = Math.max(0.3, baseRadius * 0.28);
    const arrangement = SEAT_COMPOSITIONS[Math.floor(hashUnit(`${locationId}:seat-arrangement`) * SEAT_COMPOSITIONS.length)];
    const jitter = index => (hashUnit(`${locationId}:seat-jitter:${index}`) - 0.5);

    const seats = [];
    const seatEnvelopes = () => seats.map(item => placementEnvelope(`${item.instanceId}:test`, item));

    const tryCandidate = (pick, dims, x, z) => {
        const forward = forwardOffset(frame, x, z);
        if (forward < minForwardM) return null; // behind (or basically on top of) the screen
        const box = normalizedBox({
            x, z, halfX: dims[0] * 0.5 + 0.08, halfZ: dims[2] * 0.5 + 0.08,
            yMin: hostSpace.surfaceY, yMax: hostSpace.surfaceY + dims[1],
        });
        if (!candidateClear(box, [...blockers, ...seatEnvelopes()], hostSpace)) return null;
        if (sightlineCrossesWall({ x, z }, { x: frame.x, z: frame.z }, hostSpace)) return null;
        return { x, z, box, forward };
    };

    for (let index = 0; index < Math.min(4, picks.length); index++) {
        const pick = picks[index];
        const dims = dimsOf(pick, [0.56, 0.86, 0.58]);
        const slotArrangement = arrangement[Math.min(index, arrangement.length - 1)];
        const candidates = [];

        // Primary attempt: the chosen composition's seat, with a small amount
        // of organic per-seat jitter so a room doesn't look mathematically
        // identical every time it rolls the same arrangement.
        for (const jForward of [0, jitter(index) * 0.18]) {
            for (const jLateral of [0, jitter(index + 7) * 0.22]) {
                const point = framePoint(
                    frame,
                    baseRadius * slotArrangement.forwardRatio + jForward,
                    baseRadius * slotArrangement.lateralRatio + jLateral,
                );
                const candidate = tryCandidate(pick, dims, point.x, point.z);
                if (candidate) candidates.push({ ...candidate, tier: 0 });
            }
        }

        // Fallback: the composition's slot didn't fit this particular room
        // (an odd module shape, a tight platform, a wall in the way). Rather
        // than dropping the chair, fan out world-space radii/angles around the
        // TV exactly as densely as before - the only new restriction is
        // discarding whatever lands behind the screen or across a wall, so a
        // tight room still gets every viewing-side spot the old ring search
        // would have found, just never the ones that put a chair at the TV's
        // back.
        if (!candidates.length) {
            for (const radius of radii) {
                for (let i = 0; i < 16; i++) {
                    const angle = (i / 16) * Math.PI * 2;
                    const x = frame.x + Math.cos(angle) * radius;
                    const z = frame.z + Math.sin(angle) * radius;
                    const candidate = tryCandidate(pick, dims, x, z);
                    if (candidate) candidates.push({ ...candidate, tier: 1 });
                }
            }
        }

        candidates.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            const desiredForward = baseRadius * slotArrangement.forwardRatio;
            const aScore = -Math.abs(a.forward - desiredForward) + Math.hypot(a.x - pose.x, a.z - pose.z) * 0.05;
            const bScore = -Math.abs(b.forward - desiredForward) + Math.hypot(b.x - pose.x, b.z - pose.z) * 0.05;
            return bScore - aScore || a.x - b.x || a.z - b.z;
        });
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


function slotPicks(composition, slot) {
    return composition?.slots?.find(item => item.slot === slot)?.picks ?? [];
}

function rotateOffset(rotY, x, z) {
    const sin = Math.sin(rotY || 0), cos = Math.cos(rotY || 0);
    return { x: x * cos + z * sin, z: z * cos - x * sin };
}

function chooseTabletopDetails({ locationId, composition, supportPlacement, budget = 3 }) {
    if (!supportPlacement || budget <= 0) return [];
    const [supportW, supportH, supportD] = supportPlacement.dimensionsM;
    const topY = supportPlacement.transform.y + supportH * 0.5;
    const offsets = [
        [-0.24, -0.14], [0.22, 0.12], [0.0, 0.2], [0.28, -0.16], [-0.3, 0.17],
    ];
    const queue = [
        ...slotPicks(composition, 'drink-evidence').slice(0, 2),
        ...slotPicks(composition, 'personal-evidence').slice(0, 2),
        ...slotPicks(composition, 'power-explanation').slice(0, 1),
    ];
    const placements = [];
    for (const pick of queue) {
        if (placements.length >= budget) break;
        const dims = dimsOf(pick, [0.12, 0.12, 0.12]);
        if (dims[0] > supportW * 0.5 || dims[2] > supportD * 0.6 || dims[1] > 0.55) continue;
        const [oxN, ozN] = offsets[placements.length % offsets.length];
        const localX = oxN * Math.max(0.25, supportW);
        const localZ = ozN * Math.max(0.22, supportD);
        const offset = rotateOffset(supportPlacement.transform.rotY, localX, localZ);
        placements.push(makePlacement({
            locationId,
            slot: pick.familyId === 'spawn.power-and-cables' ? 'power-explanation' :
                (pick.familyId === 'spawn.drink-and-table-clutter' ? 'drink-evidence' : 'personal-evidence'),
            pick,
            index: placements.length,
            x: supportPlacement.transform.x + offset.x,
            y: topY + dims[1] * 0.5 + 0.012,
            z: supportPlacement.transform.z + offset.z,
            rotY: supportPlacement.transform.rotY + ((placements.length % 2) ? 0.16 : -0.12),
            relationTo: supportPlacement.instanceId,
            fallbackDims: dims,
        }));
    }
    return placements;
}

function chooseFloorDetails({ locationId, pose, hostSpace, blockers, composition, mediaPlacement, budget = 2 }) {
    if (!mediaPlacement || budget <= 0) return [];
    const source = [
        ['softening', slotPicks(composition, 'softening')],
        ['plant-softener', slotPicks(composition, 'plant-softener')],
        ['roof-credibility', slotPicks(composition, 'roof-credibility')],
    ];
    const placements = [];
    const localBlockers = [...blockers];
    for (const [slot, picks] of source) {
        for (const pick of picks) {
            if (placements.length >= budget) return placements;
            const dims = dimsOf(pick, [0.3, 0.3, 0.3]);
            if (dims[0] > 1.15 || dims[2] > 1.15 || dims[1] > 1.45) continue;
            const halfX = dims[0] * 0.5 + 0.07, halfZ = dims[2] * 0.5 + 0.07;
            const candidates = candidateCenters(hostSpace, halfX, halfZ)
                .map(point => {
                    const box = normalizedBox({
                        x: point.x, z: point.z, halfX, halfZ,
                        yMin: hostSpace.surfaceY, yMax: hostSpace.surfaceY + dims[1],
                    });
                    const mediaDistance = Math.hypot(point.x - mediaPlacement.transform.x, point.z - mediaPlacement.transform.z);
                    const spawnDistance = Math.hypot(point.x - pose.x, point.z - pose.z);
                    return { ...point, box, score: -Math.abs(mediaDistance - 2.1) + spawnDistance * 0.05 };
                })
                .filter(candidate => candidateClear(candidate.box, localBlockers, hostSpace))
                .sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
            const chosen = candidates[0];
            if (!chosen) continue;
            const placement = makePlacement({
                locationId, slot, pick, index: placements.length,
                x: chosen.x, y: hostSpace.surfaceY + dims[1] * 0.5, z: chosen.z,
                rotY: facingRotation(chosen, mediaPlacement.transform),
                relationTo: mediaPlacement.instanceId,
                fallbackDims: dims,
            });
            placements.push(placement);
            localBlockers.push(normalizedBox({ ...chosen.box, id: `${placement.instanceId}:detail-envelope` }));
            break;
        }
    }
    return placements;
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
    const hostWallBlockers = wallBlockers(hostSpace);
    const furnitureBlockers = [...structuralBlockers, ...hostWallBlockers];
    const placements = [];
    const unresolved = [];

    const tvCluster = chooseSupportPlacement({
        locationId, pose, hostSpace,
        blockers: furnitureBlockers,
        wallMountBlockers: structuralBlockers,
        composition,
    });
    if (tvCluster) {
        if (tvCluster.support) placements.push(tvCluster.support);
        placements.push(tvCluster.tv);
        const clusterReservation = normalizedBox({
            ...tvCluster.footprint,
            id: `${locationId}:tv-cluster-envelope`,
            kind: 'spawn-furniture-envelope',
            ownerId: tvCluster.support?.instanceId ?? tvCluster.tv.instanceId,
            source: 'spawn-spatial-plan',
        });
        reservations.push(clusterReservation);
        structuralBlockers.push(clusterReservation);
        furnitureBlockers.push(clusterReservation);
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
            furnitureBlockers.push(tvReservation);
        }
    } else {
        unresolved.push('primary-tv');
        if (composition?.startProfile?.groundMedia !== true) unresolved.push('tv-support');
    }

    const tvPlacement = placements.find(item => item.slot === 'primary-tv') ?? null;
    const supportPlacement = placements.find(item => item.slot === 'tv-support') ?? null;
    const seats = chooseSeats({ locationId, pose, hostSpace, blockers: furnitureBlockers, composition, tvPlacement });
    for (const seat of seats) {
        placements.push(seat);
        const envelope = placementEnvelope(`${seat.instanceId}:envelope`, seat);
        reservations.push(envelope);
        structuralBlockers.push(envelope);
        furnitureBlockers.push(envelope);
    }
    if (seats.length < 2) unresolved.push('seating');

    const light = chooseLight({ locationId, hostSpace, blockers: furnitureBlockers, composition, tvPlacement });
    if (light) {
        placements.push(light);
        const envelope = placementEnvelope(`${light.instanceId}:envelope`, light);
        reservations.push(envelope);
        structuralBlockers.push(envelope);
        furnitureBlockers.push(envelope);
    } else unresolved.push('warm-practical');

    // Keep boot detail deliberately bounded. The corpus can select many authored
    // props; the first stable look only realizes a small deterministic sample.
    const detailBudget = Math.max(0, Math.min(6, Math.floor(composition?.startProfile?.detailBudget ?? 4)));
    const tabletop = chooseTabletopDetails({
        locationId, composition, supportPlacement, budget: Math.min(3, detailBudget),
    });
    placements.push(...tabletop);
    const floorDetails = chooseFloorDetails({
        locationId,
        pose,
        hostSpace,
        blockers: furnitureBlockers,
        composition,
        mediaPlacement: tvPlacement,
        budget: Math.max(0, detailBudget - tabletop.length),
    });
    for (const detail of floorDetails) {
        placements.push(detail);
        const envelope = placementEnvelope(`${detail.instanceId}:detail-envelope`, detail, 'spawn-detail-envelope');
        reservations.push(envelope);
        structuralBlockers.push(envelope);
        furnitureBlockers.push(envelope);
    }

    const progressionLayout = augmentSpawnProgressionLayout({
        locationId, pose, hostSpace, composition, placements, reservations,
    });

    const realizedSlots = [...new Set(placements.map(item => item.slot))];
    const mediaKind = tvPlacement?.familyId === 'spawn.media.radio' ? 'radio' : (tvPlacement ? 'television' : 'none');

    // Hangout realization is useful, but never spawn authority. `ready` says the
    // selected media arrangement fits; profiles that place a giant cabinet on the
    // floor do not invent a support plinth merely to satisfy this optional scene.
    const profileId = composition?.startProfile?.id ?? '';
    const minimumReadySeats = profileId === 'terra-backroom' ? 4 : (profileId === 'giga-shopfront' ? 3 : 0);
    if (minimumReadySeats && seats.length < minimumReadySeats) unresolved.push('large-hangout-floor-area');
    const mediaSupportRequired = composition?.startProfile?.groundMedia !== true;
    const mediaReady =
        realizedSlots.includes('primary-tv') &&
        (!mediaSupportRequired || realizedSlots.includes('tv-support')) &&
        seats.length >= minimumReadySeats;

    return Object.freeze({
        schema: 'jweb.spawn-spatial-plan.v2',
        locationId,
        hostSpaceId: hostSpace.spaceId,
        hostArchetype: hostSpace.hostArchetype ?? composition?.hostArchetype ?? null,
        startProfile: composition?.startProfile ? { ...composition.startProfile } : null,
        mediaKind,
        progressionLayout,
        ready: mediaReady,
        complete: unresolved.length === 0,
        unresolved: [...new Set(unresolved)],
        reservations,
        placements,
        realizedSlots,
    });

}

export function spawnSpatialPlanOverlaps(a, b, pad = 0) {
    return boxesOverlap(a, b, pad);
}
