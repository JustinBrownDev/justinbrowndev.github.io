export const SPACE_PLAN_SCHEMA = 'jweb.space-plan.v1';

function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeBox(box) {
    if (!box) return null;
    const halfX = Math.max(0, finiteOr(box.halfX, finiteOr(box.sx, 0) * 0.5));
    const halfZ = Math.max(0, finiteOr(box.halfZ, finiteOr(box.sz, 0) * 0.5));
    const x = finiteOr(box.x, 0);
    const z = finiteOr(box.z, 0);
    return {
        ...box,
        x,
        z,
        halfX,
        halfZ,
        minX: finiteOr(box.minX, x - halfX),
        maxX: finiteOr(box.maxX, x + halfX),
        minZ: finiteOr(box.minZ, z - halfZ),
        maxZ: finiteOr(box.maxZ, z + halfZ),
        yMin: finiteOr(box.yMin, 0),
        yMax: finiteOr(box.yMax, finiteOr(box.height, 2)),
    };
}

function boxesOverlapXZ(a, b, pad = 0) {
    return a.maxX + pad > b.minX && a.minX - pad < b.maxX
        && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
}

function verticalOverlap(aMin, aMax, bMin, bMax) {
    return aMin < bMax && aMax > bMin;
}

function distancePointToSegment(px, pz, wall) {
    const x1 = finiteOr(wall.x1, 0), z1 = finiteOr(wall.z1, 0);
    const x2 = finiteOr(wall.x2, x1), z2 = finiteOr(wall.z2, z1);
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-12) return Math.hypot(px - x1, pz - z1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
    return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

function wallIntersectsBox(wall, box, pad = 0) {
    const thickness = Math.max(0.08, finiteOr(wall.thickness, 0.14));
    const wallBox = {
        minX: Math.min(wall.x1, wall.x2) - thickness * 0.5 - pad,
        maxX: Math.max(wall.x1, wall.x2) + thickness * 0.5 + pad,
        minZ: Math.min(wall.z1, wall.z2) - thickness * 0.5 - pad,
        maxZ: Math.max(wall.z1, wall.z2) + thickness * 0.5 + pad,
    };
    return boxesOverlapXZ(wallBox, box);
}

function propYMax(prop) {
    const yMin = finiteOr(prop?.yMin, 0);
    const raw = finiteOr(prop?.height, yMin + 1);
    return raw > yMin ? raw : yMin + Math.max(0, raw);
}

function propIntersectsBox(prop, box, pad = 0) {
    const radius = Math.max(0, finiteOr(prop?.radius, 0.25)) + pad;
    const cx = Math.max(box.minX, Math.min(prop.x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(prop.z, box.maxZ));
    const dx = prop.x - cx, dz = prop.z - cz;
    return dx * dx + dz * dz < radius * radius;
}

function platformSupports(platform, x, z, yBase, pad = 0.02) {
    if (!Number.isFinite(platform?.y) || Math.abs(platform.y - yBase) > 0.16) return false;
    const hx = Math.max(0, finiteOr(platform.hx, finiteOr(platform.sx, 0) * 0.5));
    const hz = Math.max(0, finiteOr(platform.hz, finiteOr(platform.sz, 0) * 0.5));
    return x >= platform.x - hx + pad && x <= platform.x + hx - pad
        && z >= platform.z - hz + pad && z <= platform.z + hz - pad;
}

function reservationIntersectsBox(reservation, box) {
    const normalized = normalizeBox(reservation);
    if (!normalized) return false;
    if (!verticalOverlap(normalized.yMin, normalized.yMax, box.yMin, box.yMax)) return false;
    return boxesOverlapXZ(normalized, box);
}

function moduleSpaceId(chunkKey, entity, module, floor) {
    const siteKey = entity.semanticSiteKey ?? entity.siteId ?? entity.id;
    return `${chunkKey}:${siteKey}:${module.key}:floor:${floor}`;
}

function cellKey(col, row) { return `${col},${row}`; }

function buildRegions(cells, cols, rows) {
    const byKey = new Map(cells.map(cell => [cellKey(cell.col, cell.row), cell]));
    const regions = [];
    let nextId = 0;
    for (const cell of cells) {
        if (!cell.usable || cell.regionId != null) continue;
        const id = nextId++;
        const queue = [cell];
        cell.regionId = id;
        let count = 0;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        while (queue.length) {
            const current = queue.pop();
            count++;
            minX = Math.min(minX, current.x); maxX = Math.max(maxX, current.x);
            minZ = Math.min(minZ, current.z); maxZ = Math.max(maxZ, current.z);
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = current.col + dc, nr = current.row + dr;
                if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                const next = byKey.get(cellKey(nc, nr));
                if (!next?.usable || next.regionId != null) continue;
                next.regionId = id;
                queue.push(next);
            }
        }
        regions.push({ id, cellCount: count, minX, maxX, minZ, maxZ });
    }
    regions.sort((a, b) => b.cellCount - a.cellCount || a.id - b.id);
    return regions;
}

function relevantWalls(physics, module, yBase, floorH) {
    const bounds = {
        minX: module.cx - module.halfX - 0.2,
        maxX: module.cx + module.halfX + 0.2,
        minZ: module.cz - module.halfZ - 0.2,
        maxZ: module.cz + module.halfZ + 0.2,
    };
    return (physics?.mazeWalls ?? []).filter(wall => {
        if (!verticalOverlap(finiteOr(wall.yMin, 0), finiteOr(wall.yMax, floorH), yBase + 0.04, yBase + Math.min(2.1, floorH - 0.04))) return false;
        const wallBounds = {
            minX: Math.min(wall.x1, wall.x2), maxX: Math.max(wall.x1, wall.x2),
            minZ: Math.min(wall.z1, wall.z2), maxZ: Math.max(wall.z1, wall.z2),
        };
        return boxesOverlapXZ(bounds, wallBounds, 0.25);
    });
}

function relevantProps(physics, module, yBase, floorH) {
    const bounds = {
        minX: module.cx - module.halfX,
        maxX: module.cx + module.halfX,
        minZ: module.cz - module.halfZ,
        maxZ: module.cz + module.halfZ,
    };
    return (physics?.props ?? []).filter(prop => {
        if (prop?.supportKind === 'semantic-prop') return false;
        if (!verticalOverlap(finiteOr(prop?.yMin, 0), propYMax(prop), yBase + 0.04, yBase + Math.min(2.1, floorH - 0.04))) return false;
        const r = Math.max(0, finiteOr(prop?.radius, 0.25));
        return prop.x + r > bounds.minX && prop.x - r < bounds.maxX
            && prop.z + r > bounds.minZ && prop.z - r < bounds.maxZ;
    });
}

function relevantReservations(physics, module, yBase, floorH) {
    const moduleBox = {
        minX: module.cx - module.halfX - 0.85,
        maxX: module.cx + module.halfX + 0.85,
        minZ: module.cz - module.halfZ - 0.85,
        maxZ: module.cz + module.halfZ + 0.85,
        yMin: yBase,
        yMax: yBase + floorH,
    };
    return (physics?.circulationReservations ?? []).filter(item => reservationIntersectsBox(item, moduleBox));
}

function topologySpace({ chunkKey, entity, module, floor }) {
    const floorH = Math.max(2.2, finiteOr(entity.floorH, 3.15));
    const yBase = floor * floorH;
    const inset = 0.12;
    return {
        schema: 'jweb.space-plan-topology.v1',
        id: moduleSpaceId(chunkKey, entity, module, floor),
        chunkKey,
        entityId: entity.id,
        moduleKey: module.key,
        floor,
        floorH,
        yBase,
        module: { key: module.key, cx: module.cx, cz: module.cz, halfX: module.halfX, halfZ: module.halfZ },
        bounds: {
            minX: module.cx - module.halfX + inset,
            maxX: module.cx + module.halfX - inset,
            minZ: module.cz - module.halfZ + inset,
            maxZ: module.cz + module.halfZ - inset,
            yMin: yBase,
            yMax: yBase + floorH,
        },
    };
}

function buildPlan({ topology, physics, targetCellSize = 0.30 }) {
    const { module, floor, floorH, yBase, bounds } = topology;
    const { minX, maxX, minZ, maxZ } = bounds;
    const width = Math.max(0.1, maxX - minX);
    const depth = Math.max(0.1, maxZ - minZ);
    const cols = Math.max(1, Math.min(48, Math.ceil(width / targetCellSize)));
    const rows = Math.max(1, Math.min(48, Math.ceil(depth / targetCellSize)));
    const cellW = width / cols;
    const cellD = depth / rows;
    const walls = relevantWalls(physics, module, yBase, floorH);
    const structuralOccupancy = relevantProps(physics, module, yBase, floorH);
    const circulationReservations = relevantReservations(physics, module, yBase, floorH);
    const platforms = physics?.platforms ?? [];
    const cells = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = minX + (col + 0.5) * cellW;
            const z = minZ + (row + 0.5) * cellD;
            const cellBox = {
                minX: x - cellW * 0.44, maxX: x + cellW * 0.44,
                minZ: z - cellD * 0.44, maxZ: z + cellD * 0.44,
                yMin: yBase + 0.03, yMax: yBase + Math.min(1.9, floorH - 0.04),
            };
            const supported = floor === 0 || platforms.some(platform => platformSupports(platform, x, z, yBase));
            const wallBlocked = walls.some(wall => wallIntersectsBox(wall, cellBox));
            const propBlocked = structuralOccupancy.some(prop => propIntersectsBox(prop, cellBox));
            const circulation = circulationReservations.some(reservation => reservationIntersectsBox(reservation, cellBox));
            cells.push({ col, row, x, z, supported, wallBlocked, propBlocked, circulation, usable: supported && !wallBlocked && !propBlocked, regionId: null });
        }
    }
    const regions = buildRegions(cells, cols, rows);
    const largestRegionId = regions[0]?.id ?? null;
    const usableCells = cells.filter(cell => cell.usable);
    return {
        ...topology,
        schema: SPACE_PLAN_SCHEMA,
        grid: { cols, rows, cellW, cellD },
        cells,
        usableCells,
        regions,
        largestRegionId,
        walls,
        structuralOccupancy,
        circulationReservations,
        connectorIds: [],
    };
}

export function compileSpacePlans({ chunk, payload, targetCellSize = 0.30, activeSpaceIds = null } = {}) {
    if (!chunk || !payload) throw new Error('compileSpacePlans requires chunk and payload');
    const active = activeSpaceIds ? new Set(activeSpaceIds) : null;
    const topologySpaces = [];
    const plans = [];
    for (const entity of payload.entities ?? []) {
        for (const module of entity.footprintModules ?? []) {
            const floors = Math.max(0, Math.floor(finiteOr(module.floors, 0)));
            for (let floor = 0; floor < floors; floor++) {
                const topology = topologySpace({ chunkKey: chunk.key, entity, module, floor });
                topologySpaces.push(topology);
                if (!active || active.has(topology.id)) plans.push(buildPlan({ topology, physics: payload.physics, targetCellSize }));
            }
        }
    }
    payload.semanticTopologySpaces = topologySpaces;
    payload.spacePlans = plans;
    return plans;
}

function planPointCell(plan, x, z) {
    const { minX, maxX, minZ, maxZ } = plan.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
    const col = Math.max(0, Math.min(plan.grid.cols - 1, Math.floor((x - minX) / plan.grid.cellW)));
    const row = Math.max(0, Math.min(plan.grid.rows - 1, Math.floor((z - minZ) / plan.grid.cellD)));
    return plan.cells[row * plan.grid.cols + col] ?? null;
}

function boxSupported(plan, box) {
    if (plan.floor === 0) return true;
    const points = [
        [box.minX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.minZ], [box.maxX, box.maxZ],
        [(box.minX + box.maxX) * 0.5, (box.minZ + box.maxZ) * 0.5],
    ];
    const platforms = plan.__platforms;
    if (platforms) return points.every(([x, z]) => platforms.some(platform => platformSupports(platform, x, z, plan.yBase, 0)));
    return points.every(([x, z]) => planPointCell(plan, x, z)?.supported);
}

export function spacePlanAcceptsBox(plan, input, { allowCirculation = false, requireSameRegion = true } = {}) {
    if (!plan || plan.schema !== SPACE_PLAN_SCHEMA) return true;
    const box = normalizeBox(input);
    if (!box) return false;
    if (box.minX < plan.bounds.minX || box.maxX > plan.bounds.maxX || box.minZ < plan.bounds.minZ || box.maxZ > plan.bounds.maxZ) return false;
    if (plan.walls.some(wall => wallIntersectsBox(wall, box, 0.015))) return false;
    if (plan.structuralOccupancy.some(prop => propIntersectsBox(prop, box, 0.025))) return false;
    if (!boxSupported(plan, box)) return false;
    if (!allowCirculation && plan.circulationReservations.some(reservation => reservationIntersectsBox(reservation, box))) return false;

    const points = [
        [box.minX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.minZ], [box.maxX, box.maxZ],
        [(box.minX + box.maxX) * 0.5, (box.minZ + box.maxZ) * 0.5],
    ];
    const cells = points.map(([x, z]) => planPointCell(plan, x, z));
    if (cells.some(cell => !cell?.usable)) return false;
    if (requireSameRegion) {
        const regions = new Set(cells.map(cell => cell.regionId));
        if (regions.size > 1) return false;
    }
    return true;
}

function gcd(a, b) {
    let x = Math.abs(a), y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
}

export function spacePlanCandidateCells(plan, seed = 0) {
    if (!plan?.usableCells?.length) return [];
    const preferred = plan.largestRegionId == null ? plan.usableCells : plan.usableCells.filter(cell => cell.regionId === plan.largestRegionId);
    const fallback = preferred.length ? preferred : plan.usableCells;
    const count = Math.min(32, fallback.length);
    const hashed = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
    const start = hashed % fallback.length;
    let step = fallback.length <= 1 ? 1 : 1 + (((hashed >>> 7) ^ (hashed >>> 17)) % (fallback.length - 1));
    while (fallback.length > 1 && gcd(step, fallback.length) !== 1) step++;
    const sampled = [];
    for (let i = 0, cursor = start; i < fallback.length && sampled.length < count * 2; i++, cursor = (cursor + step) % fallback.length) {
        const cell = fallback[cursor];
        const edge = Math.min(
            cell.x - plan.bounds.minX,
            plan.bounds.maxX - cell.x,
            cell.z - plan.bounds.minZ,
            plan.bounds.maxZ - cell.z,
        );
        sampled.push({ cell, edge, order: i });
    }
    sampled.sort((a, b) => b.edge - a.edge || a.order - b.order);
    return sampled.slice(0, count).map(item => item.cell);
}

export function spacePlanWallSegments(plan, minLength = 0.7) {
    if (!plan) return [];
    const result = [];
    for (const wall of plan.walls ?? []) {
        const length = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
        if (length >= minLength) result.push(wall);
    }
    const b = plan.bounds;
    result.push(
        { x1: b.minX, z1: b.minZ, x2: b.maxX, z2: b.minZ, yMin: b.yMin, yMax: b.yMax, syntheticBoundary: true },
        { x1: b.minX, z1: b.maxZ, x2: b.maxX, z2: b.maxZ, yMin: b.yMin, yMax: b.yMax, syntheticBoundary: true },
        { x1: b.minX, z1: b.minZ, x2: b.minX, z2: b.maxZ, yMin: b.yMin, yMax: b.yMax, syntheticBoundary: true },
        { x1: b.maxX, z1: b.minZ, x2: b.maxX, z2: b.maxZ, yMin: b.yMin, yMax: b.yMax, syntheticBoundary: true },
    );
    return result;
}

export function spacePlanTouchesPoint(plan, point, pad = 0.75) {
    if (!plan || !point) return false;
    const y = finiteOr(point.y, plan.yBase);
    if (y < plan.yBase - 0.25 || y > plan.yBase + plan.floorH + 0.25) return false;
    return point.x >= plan.bounds.minX - pad && point.x <= plan.bounds.maxX + pad
        && point.z >= plan.bounds.minZ - pad && point.z <= plan.bounds.maxZ + pad;
}

export function spacePlanTouchesReservation(plan, reservation) {
    if (!plan || !reservation) return false;
    return reservationIntersectsBox(reservation, plan.bounds);
}
