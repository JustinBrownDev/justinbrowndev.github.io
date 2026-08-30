const TAU = Math.PI * 2;
const QUARTER = Math.PI * 0.5;

function normalizeAngle(value) {
    let v = value % TAU;
    if (v > Math.PI) v -= TAU;
    if (v < -Math.PI) v += TAU;
    return v;
}

function dimsOf(def) {
    const dims = def?.dimensionsXYZ ?? [0.6, 0.8, 0.6];
    return [
        Math.max(0.04, Number(dims[0]) || 0.6),
        Math.max(0.04, Number(dims[1]) || 0.8),
        Math.max(0.04, Number(dims[2]) || 0.6),
    ];
}

function minOf(def, dims = dimsOf(def)) {
    const min = def?.boundsMin ?? [-dims[0] * 0.5, 0, -dims[2] * 0.5];
    return [Number(min[0]) || 0, Number(min[1]) || 0, Number(min[2]) || 0];
}

function graphList(graph, key) {
    return Array.isArray(graph?.[key]) ? graph[key] : [];
}

function hasGraphValue(graph, key, value) {
    return graphList(graph, key).includes(value);
}

function frontVector(rotY) {
    return { x: Math.sin(rotY), z: Math.cos(rotY) };
}

function rightVector(rotY) {
    return { x: Math.cos(rotY), z: -Math.sin(rotY) };
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function sameSemanticRoom(placement, context) {
    return placement
        && placement.entityId === context.entityId
        && placement.moduleKey === context.moduleKey
        && placement.floor === context.floor;
}

function physicalBottom(placement) {
    return placement.y + minOf(placement.def)[1];
}

function physicalTop(placement) {
    return physicalBottom(placement) + dimsOf(placement.def)[1];
}

function supportsWorkSurface(placement) {
    if (!placement) return false;
    if (placement.def?.sockets?.topSurface === true) return true;
    const graph = placement.graph;
    if (!hasGraphValue(graph, 'capabilities', 'support-surface-provider')) return false;
    return /(desk|table|counter|bench|workbench|cabinet)/i.test(String(placement.def?.kind ?? placement.def?.semanticClass ?? ''));
}

function rowCompatible(placement) {
    return placement && hasGraphValue(placement.graph, 'relationships', 'row-alignable');
}

function candidateEnvelope(def, graph, candidate) {
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const front = frontVector(candidate.rotY);
    const right = rightVector(candidate.rotY);
    const clearance = def?.clearance ?? {};
    const keepClear = graph?.circulation?.keepClear ?? [];
    let frontClear = Math.max(0, Number(clearance.front) || 0);
    let rearClear = Math.max(0, Number(clearance.rear) || 0);
    let sideClear = Math.max(0, Number(clearance.sides) || 0);
    for (const item of keepClear) {
        const depthValue = Math.max(0, Number(item?.depth) || 0);
        if (item?.side === 'front') frontClear = Math.max(frontClear, depthValue);
        else if (item?.side === 'rear') rearClear = Math.max(rearClear, depthValue);
        else if (item?.side === 'side' || item?.side === 'sides') sideClear = Math.max(sideClear, depthValue);
    }
    const localHalfX = width * 0.5 + sideClear;
    const localFront = depth * 0.5 + frontClear;
    const localRear = depth * 0.5 + rearClear;
    const localCenterShift = (localFront - localRear) * 0.5;
    const localHalfZ = (localFront + localRear) * 0.5;
    const centerX = candidate.x + front.x * localCenterShift;
    const centerZ = candidate.z + front.z * localCenterShift;
    const halfX = Math.abs(right.x) * localHalfX + Math.abs(front.x) * localHalfZ;
    const halfZ = Math.abs(right.z) * localHalfX + Math.abs(front.z) * localHalfZ;
    const yMin = candidate.y + min[1];
    return { x: centerX, z: centerZ, halfX, halfZ, yMin, yMax: yMin + height };
}

function candidateFitsModule(def, candidate, module) {
    if (!module) return true;
    const [width, , depth] = dimsOf(def);
    const front = frontVector(candidate.rotY);
    const right = rightVector(candidate.rotY);
    const halfX = Math.abs(right.x) * width * 0.5 + Math.abs(front.x) * depth * 0.5;
    const halfZ = Math.abs(right.z) * width * 0.5 + Math.abs(front.z) * depth * 0.5;
    return candidate.x - halfX >= module.cx - module.halfX + 0.03
        && candidate.x + halfX <= module.cx + module.halfX - 0.03
        && candidate.z - halfZ >= module.cz - module.halfZ + 0.03
        && candidate.z + halfZ <= module.cz + module.halfZ - 0.03;
}

function tryCandidate(def, graph, candidate, tryReserve, module) {
    if (!candidateFitsModule(def, candidate, module)) return null;
    const reservation = candidateEnvelope(def, graph, candidate);
    if (typeof tryReserve === 'function' && !tryReserve(reservation)) return null;
    return { ...candidate, reservation };
}

function wallCandidates(def, module, yBase, floorH, seed) {
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const rng = mulberry32(seed ^ 0x4d9f3b21);
    const sides = ['north', 'east', 'south', 'west'];
    const start = seed % sides.length;
    const result = [];
    for (let i = 0; i < sides.length; i++) {
        const side = sides[(start + i) % sides.length];
        const horizontal = side === 'north' || side === 'south';
        const halfAlong = horizontal ? width * 0.5 : width * 0.5;
        const avail = (horizontal ? module.halfX : module.halfZ) - halfAlong - 0.18;
        if (avail <= 0.04) continue;
        const along = (rng() - 0.5) * 2 * avail;
        let x = module.cx;
        let z = module.cz;
        let rotY = 0;
        if (side === 'north') { x += along; z -= module.halfZ - depth * 0.5 - 0.07; rotY = 0; }
        else if (side === 'south') { x -= along; z += module.halfZ - depth * 0.5 - 0.07; rotY = Math.PI; }
        else if (side === 'west') { z += along; x -= module.halfX - depth * 0.5 - 0.07; rotY = QUARTER; }
        else { z -= along; x += module.halfX - depth * 0.5 - 0.07; rotY = -QUARTER; }
        const bottom = def.mount === 'wall'
            ? yBase + Math.min(Math.max(0, floorH - height - 0.24), Math.max(1.10, floorH * 0.42))
            : yBase;
        result.push({ x, y: bottom - min[1], z, rotY, mode: 'wall-context' });
    }
    return result;
}

function genericCandidates(def, module, yBase, seed) {
    const [width, , depth] = dimsOf(def);
    const min = minOf(def);
    const clearance = def?.clearance ?? {};
    const marginX = width * 0.5 + Math.max(0.10, Number(clearance.sides) || 0);
    const marginZ = depth * 0.5 + Math.max(0.10, Number(clearance.front) || 0, Number(clearance.rear) || 0);
    const availX = module.halfX - marginX;
    const availZ = module.halfZ - marginZ;
    if (availX <= 0.04 || availZ <= 0.04) return [];
    const rng = mulberry32(seed ^ 0x8ca5b713);
    const result = [];
    for (let attempt = 0; attempt < 9; attempt++) {
        result.push({
            x: module.cx + (rng() - 0.5) * 2 * availX,
            y: yBase - min[1],
            z: module.cz + (rng() - 0.5) * 2 * availZ,
            rotY: Math.floor(rng() * 4) * QUARTER,
            mode: 'context-free-fallback',
        });
    }
    return result;
}

export function resolveSemanticPlacement({
    def,
    graph = def?.semanticGraph ?? null,
    module,
    yBase = 0,
    floorH = 3.15,
    seed = 0,
    placements = [],
    entityId = null,
    moduleKey = module?.key ?? null,
    floor = 0,
    tryReserve = null,
} = {}) {
    if (!def || !module) return null;
    const context = { entityId, moduleKey, floor };
    const roomPlacements = placements.filter(item => sameSemanticRoom(item, context));
    const requirements = graphList(graph, 'requirements');
    const relationships = graphList(graph, 'relationships');
    const [width, , depth] = dimsOf(def);
    const min = minOf(def);

    // Hard dependency: objects that require a work/support surface do not silently
    // become floor props. They attach to an already established provider.
    if (requirements.includes('support-surface') || relationships.includes('sits-on-work-surface')) {
        const providers = roomPlacements.filter(supportsWorkSurface).reverse();
        for (const provider of providers) {
            const [pw, , pd] = dimsOf(provider.def);
            if (pw + 0.08 < width || pd + 0.08 < depth) continue;
            const candidate = {
                x: provider.x,
                y: physicalTop(provider) - min[1],
                z: provider.z,
                rotY: provider.rotY,
                mode: 'support-surface',
                relationTo: provider.assetId,
            };
            const placed = tryCandidate(def, graph, candidate, tryReserve, module);
            if (placed) return placed;
        }
        return null;
    }

    // Chairs and similar actors face a previously established work/social surface.
    if (relationships.includes('faces-work-or-social-surface')) {
        const targets = roomPlacements.filter(supportsWorkSurface).reverse();
        for (const target of targets) {
            const front = frontVector(target.rotY);
            const [, , targetDepth] = dimsOf(target.def);
            const gap = targetDepth * 0.5 + depth * 0.5 + 0.18;
            const candidate = {
                x: target.x + front.x * gap,
                y: yBase - min[1],
                z: target.z + front.z * gap,
                rotY: normalizeAngle(target.rotY + Math.PI),
                mode: 'faces-surface',
                relationTo: target.assetId,
            };
            const placed = tryCandidate(def, graph, candidate, tryReserve, module);
            if (placed) return placed;
        }
    }

    // Row-capable assets reuse the orientation and side axis of an established row.
    if (relationships.includes('row-alignable')) {
        const anchors = roomPlacements.filter(rowCompatible).reverse();
        for (const anchor of anchors) {
            const right = rightVector(anchor.rotY);
            const [anchorWidth] = dimsOf(anchor.def);
            const spacing = anchorWidth * 0.5 + width * 0.5
                + Math.max(0.04, Number(anchor.def?.clearance?.sides) || 0)
                + Math.max(0.04, Number(def?.clearance?.sides) || 0)
                + 0.04;
            const firstSign = ((seed ^ placements.length) & 1) ? 1 : -1;
            for (const sign of [firstSign, -firstSign]) {
                const candidate = {
                    x: anchor.x + right.x * spacing * sign,
                    y: yBase - min[1],
                    z: anchor.z + right.z * spacing * sign,
                    rotY: anchor.rotY,
                    mode: 'row-aligned',
                    relationTo: anchor.assetId,
                };
                const placed = tryCandidate(def, graph, candidate, tryReserve, module);
                if (placed) return placed;
            }
        }
    }

    const supportMode = graph?.support?.mode;
    const wallBiased = def.mount === 'wall'
        || supportMode === 'wall'
        || relationships.includes('wall-anchored')
        || relationships.includes('utility-zone-compatible');
    if (wallBiased) {
        for (const candidate of wallCandidates(def, module, yBase, floorH, seed)) {
            const placed = tryCandidate(def, graph, candidate, tryReserve, module);
            if (placed) return placed;
        }
        if (graph?.support?.required && supportMode === 'wall') return null;
    }

    for (const candidate of genericCandidates(def, module, yBase, seed)) {
        const placed = tryCandidate(def, graph, candidate, tryReserve, module);
        if (placed) return placed;
    }
    return null;
}

export function createSemanticPlacementRecord({ def, graph, placement, entityId, moduleKey, floor, program }) {
    return {
        assetId: def?.id ?? null,
        def,
        graph,
        entityId,
        moduleKey,
        floor,
        program,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        rotY: placement.rotY,
        mode: placement.mode,
        relationTo: placement.relationTo ?? null,
        reservation: placement.reservation ?? null,
    };
}

function facadeFrame(facade) {
    const side = facade?.side;
    if (!['north', 'south', 'west', 'east'].includes(side)) return null;
    const cx = Number(facade.x) || 0;
    const cz = Number(facade.z) || 0;
    const halfX = Math.max(0, Number(facade.halfX) || 0);
    const halfZ = Math.max(0, Number(facade.halfZ) || 0);
    if (side === 'north') return { nx: 0, nz: -1, tx: 1, tz: 0, rotY: 0, span: halfX * 2, faceX: cx, faceZ: cz - halfZ };
    if (side === 'south') return { nx: 0, nz: 1, tx: -1, tz: 0, rotY: Math.PI, span: halfX * 2, faceX: cx, faceZ: cz + halfZ };
    if (side === 'west') return { nx: -1, nz: 0, tx: 0, tz: 1, rotY: QUARTER, span: halfZ * 2, faceX: cx - halfX, faceZ: cz };
    return { nx: 1, nz: 0, tx: 0, tz: -1, rotY: -QUARTER, span: halfZ * 2, faceX: cx + halfX, faceZ: cz };
}

export function resolveSemanticExteriorPlacement({
    def,
    graph = def?.semanticGraph ?? null,
    facade,
    seed = 0,
    groundY = 0,
    tryReserve = null,
} = {}) {
    if (!def || !facade) return null;
    const frame = facadeFrame(facade);
    if (!frame) return null;
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const rng = mulberry32(seed ^ 0x6f3c2a91);
    const wallMount = def.mount === 'wall' || graph?.support?.mode === 'wall';
    const tangentHalf = Math.max(0.08, width * 0.5);
    const available = frame.span * 0.5 - tangentHalf - 0.14;
    if (!(available > 0.02)) return null;

    const preferredOffsets = [
        (rng() - 0.5) * 2 * available,
        available * 0.58,
        -available * 0.58,
        0,
        available * 0.88,
        -available * 0.88,
    ];
    const baseX = frame.faceX + frame.nx * (wallMount ? 0.045 : depth * 0.5 + 0.24);
    const baseZ = frame.faceZ + frame.nz * (wallMount ? 0.045 : depth * 0.5 + 0.24);
    const floorMin = Number.isFinite(facade.yMin) ? facade.yMin : groundY;
    const floorMax = Number.isFinite(facade.yMax) ? facade.yMax : floorMin + 3.15;
    const wallBottom = floorMin + Math.min(Math.max(0.55, (floorMax - floorMin) * 0.34), Math.max(0.55, floorMax - floorMin - height - 0.18));

    for (const offset of preferredOffsets) {
        const candidate = {
            x: baseX + frame.tx * offset,
            y: (wallMount ? wallBottom : groundY) - min[1],
            z: baseZ + frame.tz * offset,
            rotY: frame.rotY,
            mode: wallMount ? 'semantic-facade' : 'semantic-street-edge',
        };
        const reservation = candidateEnvelope(def, graph, candidate);
        if (typeof tryReserve === 'function' && !tryReserve(reservation)) continue;
        return { ...candidate, reservation };
    }
    return null;
}

export function resolveSemanticRoofPlacement({
    def,
    graph = def?.semanticGraph ?? null,
    roof,
    seed = 0,
    tryReserve = null,
} = {}) {
    if (!def || !roof) return null;
    const [width, , depth] = dimsOf(def);
    const min = minOf(def);
    const clearance = def?.clearance ?? {};
    const marginX = width * 0.5 + Math.max(0.10, Number(clearance.sides) || 0);
    const marginZ = depth * 0.5 + Math.max(0.10, Number(clearance.front) || 0, Number(clearance.rear) || 0);
    const availX = roof.halfX - marginX;
    const availZ = roof.halfZ - marginZ;
    if (!(availX > 0.05) || !(availZ > 0.05)) return null;
    const rng = mulberry32(seed ^ 0x23d51a7b);
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = {
            x: roof.x + (rng() - 0.5) * 2 * availX,
            y: roof.y - min[1],
            z: roof.z + (rng() - 0.5) * 2 * availZ,
            rotY: Math.floor(rng() * 4) * QUARTER,
            mode: 'semantic-roof',
        };
        const reservation = candidateEnvelope(def, graph, candidate);
        if (typeof tryReserve === 'function' && !tryReserve(reservation)) continue;
        return { ...candidate, reservation };
    }
    return null;
}
