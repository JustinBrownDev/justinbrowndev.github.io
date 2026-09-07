const SCHEMA = 'jweb.spawn-progression-layout.v2';

const SPECS = Object.freeze({
    'big-tv-roof': Object.freeze({ workstations: 1, racks: 0, carts: 0 }),
    'super-big-tv-roof': Object.freeze({ workstations: 1, racks: 1, carts: 0 }),
    'super-big-shelter': Object.freeze({ workstations: 2, racks: 1, carts: 0 }),
    'mega-big-shelter': Object.freeze({ workstations: 2, racks: 2, carts: 1 }),
    'giga-shopfront': Object.freeze({ workstations: 3, racks: 2, carts: 1 }),
    'terra-backroom': Object.freeze({ workstations: 5, racks: 5, carts: 2 }),
});

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }

function bounds(input) {
    if (!input) return null;
    const x = finite(input.x, finite(input.cx));
    const z = finite(input.z, finite(input.cz));
    const halfX = Math.max(0, finite(input.halfX, finite(input.hx, finite(input.sx) * 0.5)));
    const halfZ = Math.max(0, finite(input.halfZ, finite(input.hz, finite(input.sz) * 0.5)));
    return {
        x, z, halfX, halfZ,
        minX: finite(input.minX, x - halfX), maxX: finite(input.maxX, x + halfX),
        minZ: finite(input.minZ, z - halfZ), maxZ: finite(input.maxZ, z + halfZ),
        yMin: finite(input.yMin, -Infinity), yMax: finite(input.yMax, Infinity),
    };
}

function overlap(a, b, pad = 0.04) {
    const aa = bounds(a), bb = bounds(b);
    if (!aa || !bb) return false;
    if (aa.yMin >= bb.yMax || aa.yMax <= bb.yMin) return false;
    return aa.minX < bb.maxX + pad && aa.maxX > bb.minX - pad
        && aa.minZ < bb.maxZ + pad && aa.maxZ > bb.minZ - pad;
}

function wallBox(wall) {
    const x1 = finite(Number(wall?.x1)), x2 = finite(Number(wall?.x2));
    const z1 = finite(Number(wall?.z1)), z2 = finite(Number(wall?.z2));
    const t = Math.max(0.08, finite(Number(wall?.thickness), 0.14));
    return bounds({
        x: (x1 + x2) * 0.5,
        z: (z1 + z2) * 0.5,
        halfX: Math.abs(x2 - x1) * 0.5 + t * 0.5,
        halfZ: Math.abs(z2 - z1) * 0.5 + t * 0.5,
        yMin: finite(Number(wall?.yMin), -Infinity),
        yMax: finite(Number(wall?.yMax), Infinity),
    });
}

function orientedHalfExtents(dims, rotY = 0, pad = 0.08) {
    const w = Math.max(0.01, finite(Number(dims?.[0]), 0.5));
    const d = Math.max(0.01, finite(Number(dims?.[2]), 0.5));
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    return {
        halfX: c * w * 0.5 + s * d * 0.5 + pad,
        halfZ: s * w * 0.5 + c * d * 0.5 + pad,
    };
}

function fixtureBox({ x, z, dims, rotY = 0, surfaceY, pad = 0.08 }) {
    const ext = orientedHalfExtents(dims, rotY, pad);
    return bounds({
        x, z,
        halfX: ext.halfX,
        halfZ: ext.halfZ,
        yMin: surfaceY,
        yMax: surfaceY + Math.max(0.08, finite(Number(dims?.[1]), 0.5)),
    });
}

function placementBox(placement, surfaceY) {
    return fixtureBox({
        x: placement.transform.x,
        z: placement.transform.z,
        dims: placement?.dimensionsM ?? [0.5, 0.5, 0.5],
        rotY: finite(Number(placement?.transform?.rotY)),
        surfaceY,
    });
}

function insidePatch(box, patch, inset = 0.05) {
    const b = bounds(box), p = bounds(patch);
    return !!b && !!p
        && b.minX >= p.minX + inset && b.maxX <= p.maxX - inset
        && b.minZ >= p.minZ + inset && b.maxZ <= p.maxZ - inset;
}

function insideHostSupport(hostSpace, box) {
    return (hostSpace?.supportPatches ?? []).some(patch => insidePatch(box, patch));
}

function candidateGrid(hostSpace, dims, step = 0.92, rotY = 0) {
    const out = [];
    const ext = orientedHalfExtents(dims, rotY, 0.08);
    for (const rawPatch of hostSpace?.supportPatches ?? []) {
        const p = bounds(rawPatch);
        if (!p) continue;
        const minX = p.minX + ext.halfX + 0.04, maxX = p.maxX - ext.halfX - 0.04;
        const minZ = p.minZ + ext.halfZ + 0.04, maxZ = p.maxZ - ext.halfZ - 0.04;
        if (minX > maxX || minZ > maxZ) continue;
        const cols = Math.max(1, Math.floor((maxX - minX) / step));
        const rows = Math.max(1, Math.floor((maxZ - minZ) / step));
        for (let ix = 0; ix <= cols; ix++) {
            const x = cols ? minX + (maxX - minX) * (ix / cols) : (minX + maxX) * 0.5;
            for (let iz = 0; iz <= rows; iz++) {
                const z = rows ? minZ + (maxZ - minZ) * (iz / rows) : (minZ + maxZ) * 0.5;
                out.push({ x, z, rotY });
            }
        }
    }
    return out;
}

function makeSyntheticPlacement({
    locationId, slot, index, x, z, surfaceY, dims, rotY = 0,
    relationTo = null, label, familyId, tags = [], spatialRelation = null,
}) {
    return {
        schema: 'jweb.spawn-placement.v1',
        instanceId: `${locationId}:${slot}:${index}`,
        slot,
        familyId,
        variantId: `${familyId}.${index}`,
        label,
        constructionRecipe: familyId,
        tags: [...tags],
        dimensionsM: [...dims],
        placement: { mount: 'ground', canSupportProps: false },
        mount: 'ground',
        relationTo,
        spatialRelation,
        transform: { x, y: surfaceY + dims[1] * 0.5, z, rotY },
        phase: 'identity',
    };
}

function facing(from, target) { return Math.atan2(target.x - from.x, target.z - from.z); }

function reserveFor(placement, kind = 'spawn-progression-fixture-envelope') {
    const b = placementBox(placement, placement.transform.y - placement.dimensionsM[1] * 0.5);
    return {
        id: `${placement.instanceId}:envelope`, kind, ownerId: placement.instanceId,
        x: b.x, z: b.z, halfX: b.halfX, halfZ: b.halfZ,
        minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ,
        yMin: b.yMin, yMax: b.yMax, source: SCHEMA,
    };
}

function clearBox(box, hostSpace, blockers) {
    if (!insideHostSupport(hostSpace, box)) return false;
    return !blockers.some(other => overlap(box, other));
}

function clearCandidate(candidate, dims, hostSpace, blockers, rotY = candidate?.rotY ?? 0) {
    return clearBox(fixtureBox({
        x: candidate.x, z: candidate.z, dims, rotY,
        surfaceY: hostSpace.surfaceY,
    }), hostSpace, blockers);
}

function chooseCandidate(hostSpace, dims, blockers, score, rotY = 0) {
    const candidates = candidateGrid(hostSpace, dims, 0.92, rotY)
        .filter(point => clearCandidate(point, dims, hostSpace, blockers, rotY));
    candidates.sort((a, b) => score(b) - score(a) || a.x - b.x || a.z - b.z);
    return candidates[0] ?? null;
}

function usableWalls(hostSpace, dims) {
    const minimumLength = Math.max(0.8, dims[0] + 0.22);
    const surfaceY = finite(Number(hostSpace?.surfaceY));
    return (hostSpace?.nearbyWalls ?? []).map((wall, wallIndex) => {
        const x1 = Number(wall?.x1), z1 = Number(wall?.z1), x2 = Number(wall?.x2), z2 = Number(wall?.z2);
        if (![x1, z1, x2, z2].every(Number.isFinite)) return null;
        const dx = x2 - x1, dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < minimumLength) return null;
        const yMin = finite(Number(wall?.yMin), surfaceY);
        const yMax = finite(Number(wall?.yMax), surfaceY + 3.15);
        if (yMin > surfaceY + 0.22 || yMax < surfaceY + dims[1] + 0.08) return null;
        return {
            wall, wallIndex, length,
            x1, z1, x2, z2,
            tx: dx / length,
            tz: dz / length,
            thickness: Math.max(0.08, finite(Number(wall?.thickness), 0.14)),
        };
    }).filter(Boolean);
}

function wallPositions(wall, width, step = 1.10) {
    const margin = width * 0.5 + 0.16;
    const usable = wall.length - margin * 2;
    if (usable < -1e-6) return [];
    if (usable <= 0.01) return [0.5];
    const count = Math.max(1, Math.floor(usable / Math.max(step, width * 0.72)));
    return Array.from({ length: count + 1 }, (_, index) => {
        const along = margin + usable * (count ? index / count : 0.5);
        return along / wall.length;
    });
}

function wallAnchoredCandidates(hostSpace, dims, blockers, { wallGap = 0.11 } = {}) {
    const out = [];
    for (const wall of usableWalls(hostSpace, dims)) {
        const ownWallBox = wallBox(wall.wall);
        for (const t of wallPositions(wall, dims[0])) {
            const wx = wall.x1 + (wall.x2 - wall.x1) * t;
            const wz = wall.z1 + (wall.z2 - wall.z1) * t;
            for (const side of [-1, 1]) {
                // +Z local is the fixture's public/operator/front face. The
                // chosen normal therefore points from the wall into the room.
                const nx = -wall.tz * side;
                const nz = wall.tx * side;
                const depthOffset = wall.thickness * 0.5 + dims[2] * 0.5 + wallGap;
                const x = wx + nx * depthOffset;
                const z = wz + nz * depthOffset;
                const rotY = Math.atan2(nx, nz);
                const supportBox = fixtureBox({
                    x, z, dims, rotY, surfaceY: hostSpace.surfaceY, pad: 0,
                });
                const box = fixtureBox({ x, z, dims, rotY, surfaceY: hostSpace.surfaceY });
                // Floor/support patches are intentionally inset from many wall
                // centerlines. Test the real fixture footprint here, not the
                // padded circulation envelope, so wall-backed furniture can use
                // the strip of floor that physically reaches the partition.
                if (!(hostSpace?.supportPatches ?? []).some(patch => insidePatch(supportBox, patch, 0.015))) continue;
                // Preserve all structural walls. The owned wall should already
                // sit just behind the fixture rather than intersect it; this
                // test catches corners, crossing partitions and too-thin bays.
                if (ownWallBox && overlap(box, ownWallBox, 0.01)) continue;
                if (blockers.some(other => other?.hostWallIndex !== wall.wallIndex && overlap(box, other))) continue;
                out.push({
                    x, z, rotY, box,
                    wallIndex: wall.wallIndex,
                    wallId: wall.wall?.buildingPlanWallId ?? wall.wall?.id ?? `wall:${wall.wallIndex}`,
                    wallLength: wall.length,
                    wallKind: wall.wall?.supportKind ?? (wall.wall?.side ? 'exterior-shell' : 'wall'),
                    nx, nz, tx: wall.tx, tz: wall.tz,
                });
            }
        }
    }
    return out;
}

function chooseWallCandidate(hostSpace, dims, blockers, score, accept = null) {
    const candidates = wallAnchoredCandidates(hostSpace, dims, blockers)
        .filter(candidate => !accept || accept(candidate));
    candidates.sort((a, b) => score(b) - score(a)
        || a.wallIndex - b.wallIndex || a.x - b.x || a.z - b.z);
    return candidates[0] ?? null;
}

function operatorChairPose(anchor, workstationDims, hostSpace, blockers) {
    const chairDims = [0.62, 0.94, 0.66];
    const rotY = finite(Number(anchor.rotY));
    const frontX = Math.sin(rotY), frontZ = Math.cos(rotY);
    const tangentX = Math.cos(rotY), tangentZ = -Math.sin(rotY);
    const baseDistance = workstationDims[2] * 0.5 + chairDims[2] * 0.5;
    const workstationBox = fixtureBox({
        x: anchor.x, z: anchor.z, dims: workstationDims, rotY,
        surfaceY: hostSpace.surfaceY,
    });
    const localBlockers = [...blockers, workstationBox];
    for (const gap of [0.30, 0.46, 0.62]) {
        for (const side of [0, 0.32, -0.32]) {
            const x = anchor.x + frontX * (baseDistance + gap) + tangentX * side;
            const z = anchor.z + frontZ * (baseDistance + gap) + tangentZ * side;
            const chairRotY = rotY + Math.PI;
            if (clearCandidate({ x, z }, chairDims, hostSpace, localBlockers, chairRotY)) {
                return { x, z, rotY: chairRotY, dims: chairDims };
            }
        }
    }
    return null;
}

function chairForWorkstation({ locationId, index, workstation, hostSpace, blockers }) {
    const pose = operatorChairPose({
        x: workstation.transform.x,
        z: workstation.transform.z,
        rotY: workstation.transform.rotY,
    }, workstation.dimensionsM, hostSpace, blockers.filter(item => item?.ownerId !== workstation.instanceId));
    if (!pose) return null;
    return makeSyntheticPlacement({
        locationId, slot: 'progression-operator-chair', index,
        x: pose.x, z: pose.z, surfaceY: hostSpace.surfaceY, dims: pose.dims,
        rotY: pose.rotY, relationTo: workstation.instanceId,
        label: 'Operator chair', familyId: 'spawn.progression.operator-chair',
        tags: ['chair', 'rolling', 'office', 'operator'],
        spatialRelation: { kind: 'operator-side-of', targetId: workstation.instanceId },
    });
}

export function augmentSpawnProgressionLayout({
    locationId,
    pose,
    hostSpace,
    composition,
    placements,
    reservations,
} = {}) {
    const profileId = composition?.startProfile?.id ?? '';
    const spec = SPECS[profileId];
    if (!spec || !locationId || !hostSpace || !Array.isArray(placements) || !Array.isArray(reservations)) {
        return {
            schema: SCHEMA, applied: false, profileId,
            workstations: 0, racks: 0, chairs: 0, carts: 0,
            wallAnchoredWorkstations: 0, wallAnchoredRacks: 0,
        };
    }
    const media = placements.find(item => item.slot === 'primary-tv');
    if (!media) {
        return {
            schema: SCHEMA, applied: false, profileId,
            workstations: 0, racks: 0, chairs: 0, carts: 0,
            wallAnchoredWorkstations: 0, wallAnchoredRacks: 0,
        };
    }

    const wallBlockers = (hostSpace.nearbyWalls ?? []).map((wall, hostWallIndex) => {
        const box = wallBox(wall);
        return box ? { ...box, hostWallIndex } : null;
    }).filter(Boolean);
    const blockers = [
        ...reservations.map(bounds).filter(Boolean),
        ...wallBlockers,
    ];
    const summary = {
        schema: SCHEMA, applied: true, profileId,
        workstations: 0, racks: 0, chairs: 0, carts: 0,
        wallAnchoredWorkstations: 0, wallAnchoredRacks: 0,
    };
    const mediaPoint = media.transform;
    const spawnPoint = pose ?? mediaPoint;

    for (let index = 0; index < spec.workstations; index++) {
        const dims = [1.55, 1.42, 0.78];
        const point = chooseWallCandidate(hostSpace, dims, blockers, candidate => {
            const dm = Math.hypot(candidate.x - mediaPoint.x, candidate.z - mediaPoint.z);
            const ds = Math.hypot(candidate.x - spawnPoint.x, candidate.z - spawnPoint.z);
            const frontage = Math.min(4, candidate.wallLength - dims[0]) * 0.18;
            const semantic = candidate.wallKind === 'building-plan-partition' ? 0.30 : 0.10;
            return -Math.abs(dm - (3.0 + index * 0.34)) * 0.42 + Math.min(6, ds) * 0.12 + frontage + semantic;
        }, candidate => !!operatorChairPose(candidate, dims, hostSpace, blockers));
        if (!point) break;
        const workstation = makeSyntheticPlacement({
            locationId, slot: 'progression-workstation', index,
            x: point.x, z: point.z, surfaceY: hostSpace.surfaceY, dims,
            rotY: point.rotY, relationTo: media.instanceId,
            label: 'Wall-backed operator workstation', familyId: 'spawn.progression.workstation',
            tags: ['desk', 'computer', 'monitor', 'keyboard', 'wall-backed'],
            spatialRelation: {
                kind: 'backed-against-wall', wallId: point.wallId, wallIndex: point.wallIndex,
                frontNormal: [point.nx, point.nz],
            },
        });
        placements.push(workstation);
        const reservation = reserveFor(workstation);
        reservations.push(reservation); blockers.push(bounds(reservation));
        summary.workstations++; summary.wallAnchoredWorkstations++;

        const chair = chairForWorkstation({ locationId, index, workstation, hostSpace, blockers });
        if (chair) {
            placements.push(chair);
            const chairReservation = reserveFor(chair);
            reservations.push(chairReservation); blockers.push(bounds(chairReservation));
            summary.chairs++;
        }
    }

    for (let index = 0; index < spec.racks; index++) {
        const dims = [0.72, 2.05, 0.86];
        const point = chooseWallCandidate(hostSpace, dims, blockers, candidate => {
            const ds = Math.hypot(candidate.x - spawnPoint.x, candidate.z - spawnPoint.z);
            const dm = Math.hypot(candidate.x - mediaPoint.x, candidate.z - mediaPoint.z);
            const serviceWall = candidate.wallKind === 'building-plan-partition' ? 0.18 : 0.35;
            return ds * 0.34 + dm * 0.08 + Math.min(5, candidate.wallLength) * 0.08 + serviceWall;
        });
        if (!point) break;
        const rack = makeSyntheticPlacement({
            locationId, slot: 'progression-server-rack', index,
            x: point.x, z: point.z, surfaceY: hostSpace.surfaceY, dims,
            rotY: point.rotY, relationTo: media.instanceId,
            label: 'Wall-backed open server rack', familyId: 'spawn.progression.server-rack',
            tags: ['server', 'rack', 'network', 'computer', 'wall-backed'],
            spatialRelation: {
                kind: 'backed-against-wall', wallId: point.wallId, wallIndex: point.wallIndex,
                frontNormal: [point.nx, point.nz],
            },
        });
        placements.push(rack);
        const reservation = reserveFor(rack);
        reservations.push(reservation); blockers.push(bounds(reservation));
        summary.racks++; summary.wallAnchoredRacks++;
    }

    // Carts remain movable floor equipment. They use rotation-aware envelopes,
    // but unlike fixed desks/racks they are deliberately not wall authority.
    for (let index = 0; index < spec.carts; index++) {
        const dims = [0.92, 1.02, 0.58];
        const point = chooseCandidate(hostSpace, dims, blockers, candidate => {
            const dm = Math.hypot(candidate.x - mediaPoint.x, candidate.z - mediaPoint.z);
            return -Math.abs(dm - 3.0) + Math.hypot(candidate.x - spawnPoint.x, candidate.z - spawnPoint.z) * 0.08;
        });
        if (!point) break;
        const cart = makeSyntheticPlacement({
            locationId, slot: 'progression-equipment-cart', index,
            x: point.x, z: point.z, surfaceY: hostSpace.surfaceY, dims,
            rotY: facing(point, mediaPoint), relationTo: media.instanceId,
            label: 'Equipment cart', familyId: 'spawn.progression.equipment-cart',
            tags: ['equipment', 'cart', 'computer', 'repair'],
        });
        // Re-check with the actual facing rotation; the old planner only
        // validated the unrotated rectangle, a direct source of visual overlap.
        const cartBox = placementBox(cart, hostSpace.surfaceY);
        if (!clearBox(cartBox, hostSpace, blockers)) continue;
        placements.push(cart);
        const reservation = reserveFor(cart);
        reservations.push(reservation); blockers.push(bounds(reservation));
        summary.carts++;
    }

    return summary;
}
