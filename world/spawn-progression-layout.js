const SCHEMA = 'jweb.spawn-progression-layout.v1';

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

function placementBox(placement, surfaceY) {
    const dims = placement?.dimensionsM ?? [0.5, 0.5, 0.5];
    return bounds({
        x: placement.transform.x,
        z: placement.transform.z,
        halfX: dims[0] * 0.5 + 0.08,
        halfZ: dims[2] * 0.5 + 0.08,
        yMin: surfaceY,
        yMax: surfaceY + dims[1],
    });
}

function insidePatch(box, patch, inset = 0.05) {
    const b = bounds(box), p = bounds(patch);
    return !!b && !!p
        && b.minX >= p.minX + inset && b.maxX <= p.maxX - inset
        && b.minZ >= p.minZ + inset && b.maxZ <= p.maxZ - inset;
}

function candidateGrid(hostSpace, dims, step = 0.92) {
    const out = [];
    const [w, , d] = dims;
    for (const rawPatch of hostSpace?.supportPatches ?? []) {
        const p = bounds(rawPatch);
        if (!p) continue;
        const minX = p.minX + w * 0.5 + 0.12, maxX = p.maxX - w * 0.5 - 0.12;
        const minZ = p.minZ + d * 0.5 + 0.12, maxZ = p.maxZ - d * 0.5 - 0.12;
        if (minX > maxX || minZ > maxZ) continue;
        const cols = Math.max(1, Math.floor((maxX - minX) / step));
        const rows = Math.max(1, Math.floor((maxZ - minZ) / step));
        for (let ix = 0; ix <= cols; ix++) {
            const x = cols ? minX + (maxX - minX) * (ix / cols) : (minX + maxX) * 0.5;
            for (let iz = 0; iz <= rows; iz++) {
                const z = rows ? minZ + (maxZ - minZ) * (iz / rows) : (minZ + maxZ) * 0.5;
                out.push({ x, z });
            }
        }
    }
    return out;
}

function makeSyntheticPlacement({ locationId, slot, index, x, z, surfaceY, dims, rotY = 0, relationTo = null, label, familyId, tags = [] }) {
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

function clearCandidate(candidate, dims, hostSpace, blockers) {
    const box = bounds({
        x: candidate.x, z: candidate.z,
        halfX: dims[0] * 0.5 + 0.08, halfZ: dims[2] * 0.5 + 0.08,
        yMin: hostSpace.surfaceY, yMax: hostSpace.surfaceY + dims[1],
    });
    if (!(hostSpace?.supportPatches ?? []).some(patch => insidePatch(box, patch))) return false;
    return !blockers.some(other => overlap(box, other));
}

function chooseCandidate(hostSpace, dims, blockers, score) {
    const candidates = candidateGrid(hostSpace, dims).filter(point => clearCandidate(point, dims, hostSpace, blockers));
    candidates.sort((a, b) => score(b) - score(a) || a.x - b.x || a.z - b.z);
    return candidates[0] ?? null;
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
        return { schema: SCHEMA, applied: false, profileId, workstations: 0, racks: 0, chairs: 0, carts: 0 };
    }
    const media = placements.find(item => item.slot === 'primary-tv');
    if (!media) return { schema: SCHEMA, applied: false, profileId, workstations: 0, racks: 0, chairs: 0, carts: 0 };
    const blockers = [
        ...reservations.map(bounds).filter(Boolean),
        ...(hostSpace.nearbyWalls ?? []).map(wallBox).filter(Boolean),
    ];
    const summary = { schema: SCHEMA, applied: true, profileId, workstations: 0, racks: 0, chairs: 0, carts: 0 };
    const mediaPoint = media.transform;
    const spawnPoint = pose ?? mediaPoint;
    const workstations = [];

    for (let index = 0; index < spec.workstations; index++) {
        const dims = [1.55, 1.42, 0.78];
        const desired = 2.25 + index * 0.48;
        const point = chooseCandidate(hostSpace, dims, blockers, candidate => {
            const dm = Math.hypot(candidate.x - mediaPoint.x, candidate.z - mediaPoint.z);
            const ds = Math.hypot(candidate.x - spawnPoint.x, candidate.z - spawnPoint.z);
            return -Math.abs(dm - desired) * 2.1 + Math.min(4.5, ds) * 0.18;
        });
        if (!point) break;
        const workstation = makeSyntheticPlacement({
            locationId, slot: 'progression-workstation', index,
            x: point.x, z: point.z, surfaceY: hostSpace.surfaceY, dims,
            rotY: facing(point, mediaPoint), relationTo: media.instanceId,
            label: 'Operator workstation', familyId: 'spawn.progression.workstation',
            tags: ['desk', 'computer', 'monitor', 'keyboard'],
        });
        placements.push(workstation);
        const reservation = reserveFor(workstation);
        reservations.push(reservation); blockers.push(bounds(reservation));
        workstations.push(workstation); summary.workstations++;

        const dx = mediaPoint.x - point.x, dz = mediaPoint.z - point.z;
        const len = Math.max(0.001, Math.hypot(dx, dz));
        const chairDims = [0.62, 0.94, 0.66];
        const backX = -(dx / len), backZ = -(dz / len);
        let chairPoint = null;
        for (const radius of [1.18, 1.36, 1.54]) {
            for (const offset of [0, 0.32, -0.32, 0.62, -0.62]) {
                const cos = Math.cos(offset), sin = Math.sin(offset);
                const vx = backX * cos - backZ * sin;
                const vz = backX * sin + backZ * cos;
                const candidate = { x: point.x + vx * radius, z: point.z + vz * radius };
                if (clearCandidate(candidate, chairDims, hostSpace, blockers)) { chairPoint = candidate; break; }
            }
            if (chairPoint) break;
        }
        if (chairPoint) {
            const chair = makeSyntheticPlacement({
                locationId, slot: 'progression-operator-chair', index,
                x: chairPoint.x, z: chairPoint.z, surfaceY: hostSpace.surfaceY, dims: chairDims,
                rotY: facing(chairPoint, mediaPoint), relationTo: workstation.instanceId,
                label: 'Operator chair', familyId: 'spawn.progression.operator-chair',
                tags: ['chair', 'rolling', 'office', 'operator'],
            });
            placements.push(chair);
            const chairReservation = reserveFor(chair);
            reservations.push(chairReservation); blockers.push(bounds(chairReservation));
            summary.chairs++;
        }
    }

    for (let index = 0; index < spec.racks; index++) {
        const dims = [0.72, 2.05, 0.86];
        const point = chooseCandidate(hostSpace, dims, blockers, candidate => {
            const ds = Math.hypot(candidate.x - spawnPoint.x, candidate.z - spawnPoint.z);
            const dm = Math.hypot(candidate.x - mediaPoint.x, candidate.z - mediaPoint.z);
            return ds * 0.58 + dm * 0.16;
        });
        if (!point) break;
        const rack = makeSyntheticPlacement({
            locationId, slot: 'progression-server-rack', index,
            x: point.x, z: point.z, surfaceY: hostSpace.surfaceY, dims,
            rotY: facing(point, mediaPoint), relationTo: media.instanceId,
            label: 'Open server rack', familyId: 'spawn.progression.server-rack',
            tags: ['server', 'rack', 'network', 'computer'],
        });
        placements.push(rack);
        const reservation = reserveFor(rack);
        reservations.push(reservation); blockers.push(bounds(reservation));
        summary.racks++;
    }

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
        placements.push(cart);
        const reservation = reserveFor(cart);
        reservations.push(reservation); blockers.push(bounds(reservation));
        summary.carts++;
    }

    return summary;
}
