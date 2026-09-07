// Phase A of the skyway-junction correction (2026-09-07 report): observability
// only, no geometry changes. Today's pipeline (kowloon-fabric-engine.js's
// emitSkybridge/smoothTransportUnion/carveTransportRailGap) publishes each
// transport surface's full slab + full rails on both edges, THEN detects
// overlaps with already-published surfaces and carves/deletes into them - a
// retroactive correction. Two or more surfaces meeting at a point therefore
// never derive one shared junction topology; they each start from "I am a
// rectangle, my every edge needs a rail" and only get walked back afterward.
//
// This module is the missing piece report 3 asked for FIRST, deliberately
// built and tested standalone before anything wires it into real rail
// emission: given a same-level cluster of transport surfaces, derive the
// exposed (outside) boundary of their walkable union - the set of edges that
// should actually receive a guard - as opposed to internal edges where two
// members of the same junction meet, which must never be guarded no matter
// which surface "owns" that edge.
//
// The current skyway network is axis-aligned (world/guardrail-authority.js
// requires this for its own horizontal spans), so this can stay a cheap,
// deterministic coordinate-compressed grid algorithm - no general polygon
// clipping library needed.

const EPS = 1e-6;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function rectBounds(surface) {
    const x = finite(surface?.x);
    const z = finite(surface?.z);
    const hx = Math.max(0, finite(surface?.hx));
    const hz = Math.max(0, finite(surface?.hz));
    if (!(hx > 0) || !(hz > 0)) return null;
    return {
        id: surface?.id ?? null,
        minX: x - hx, maxX: x + hx,
        minZ: z - hz, maxZ: z + hz,
        y: finite(surface?.y),
    };
}

function rectsTouchOrOverlap(a, b, tolerance = EPS) {
    const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const zOverlap = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    const xTouches = Math.abs(a.maxX - b.minX) <= tolerance || Math.abs(b.maxX - a.minX) <= tolerance;
    const zTouches = Math.abs(a.maxZ - b.minZ) <= tolerance || Math.abs(b.maxZ - a.minZ) <= tolerance;
    return (xOverlap > tolerance && zOverlap > tolerance)
        || (xOverlap > tolerance && zTouches)
        || (zOverlap > tolerance && xTouches);
}

// Connected components of same-level (within levelToleranceM), touching-or-
// overlapping surfaces. Two surfaces at genuinely different elevations never
// join a junction even if their plan-view footprints coincide - a skywalk
// crossing 3m below another one is not an intersection.
export function clusterTransportJunctions(surfaces = [], { levelToleranceM = 0.12 } = {}) {
    const rects = surfaces.map(rectBounds).filter(Boolean);
    const remaining = new Set(rects.map(r => r.id));
    const byId = new Map(rects.map(r => [r.id, r]));
    const clusters = [];
    const sortedIds = [...remaining].sort();
    for (const startId of sortedIds) {
        if (!remaining.has(startId)) continue;
        remaining.delete(startId);
        const queue = [byId.get(startId)];
        const component = [];
        for (let i = 0; i < queue.length; i++) {
            const current = queue[i];
            component.push(current);
            for (const otherId of [...remaining]) {
                const other = byId.get(otherId);
                if (Math.abs(other.y - current.y) > levelToleranceM) continue;
                if (!rectsTouchOrOverlap(current, other)) continue;
                remaining.delete(otherId);
                queue.push(other);
            }
        }
        component.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        clusters.push(component);
    }
    return clusters.filter(component => component.length >= 1);
}

// The core geometry primitive: coordinate-compress the cluster's rectangles,
// classify every cell as walkable (inside at least one member) or not, and
// keep only the cell edges that separate walkable from non-walkable - i.e.
// the exposed exterior boundary. An edge between two walkable cells is
// internal (two members sharing a party wall) and is discarded outright,
// which is what makes overlapping-rail duplication structurally impossible
// here rather than something a later carve has to notice and fix.
export function exposedBoundarySegments(rects) {
    if (!rects.length) return [];
    if (rects.length === 1) {
        const r = rects[0];
        return [
            { x1: r.minX, z1: r.minZ, x2: r.maxX, z2: r.minZ, side: 'south', ownerIds: [r.id] },
            { x1: r.maxX, z1: r.minZ, x2: r.maxX, z2: r.maxZ, side: 'east', ownerIds: [r.id] },
            { x1: r.maxX, z1: r.maxZ, x2: r.minX, z2: r.maxZ, side: 'north', ownerIds: [r.id] },
            { x1: r.minX, z1: r.maxZ, x2: r.minX, z2: r.minZ, side: 'west', ownerIds: [r.id] },
        ];
    }
    const xs = [...new Set(rects.flatMap(r => [r.minX, r.maxX]))].sort((a, b) => a - b);
    const zs = [...new Set(rects.flatMap(r => [r.minZ, r.maxZ]))].sort((a, b) => a - b);
    const cols = xs.length - 1, rows = zs.length - 1;
    if (cols <= 0 || rows <= 0) return [];
    const owners = new Array(cols * rows).fill(null);
    const cellIndex = (ix, iz) => iz * cols + ix;
    for (let ix = 0; ix < cols; ix++) {
        const midX = (xs[ix] + xs[ix + 1]) / 2;
        if (xs[ix + 1] - xs[ix] <= EPS) continue;
        for (let iz = 0; iz < rows; iz++) {
            if (zs[iz + 1] - zs[iz] <= EPS) continue;
            const midZ = (zs[iz] + zs[iz + 1]) / 2;
            const covering = rects.filter(r => midX > r.minX - EPS && midX < r.maxX + EPS
                && midZ > r.minZ - EPS && midZ < r.maxZ + EPS);
            if (covering.length) owners[cellIndex(ix, iz)] = covering.map(r => r.id);
        }
    }
    const rawSegments = [];
    // Vertical edges (between horizontally adjacent cells, or the outer x bound).
    for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix <= cols; ix++) {
            const left = ix > 0 ? owners[cellIndex(ix - 1, iz)] : null;
            const right = ix < cols ? owners[cellIndex(ix, iz)] : null;
            const leftWalkable = !!left, rightWalkable = !!right;
            if (leftWalkable === rightWalkable) continue; // both walkable (internal) or both empty
            const ownerIds = leftWalkable ? left : right;
            rawSegments.push({
                x1: xs[ix], z1: zs[iz], x2: xs[ix], z2: zs[iz + 1],
                axis: 'z', at: xs[ix], from: zs[iz], to: zs[iz + 1],
                side: leftWalkable ? 'east' : 'west', ownerIds,
            });
        }
    }
    // Horizontal edges (between vertically adjacent cells, or the outer z bound).
    for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz <= rows; iz++) {
            const below = iz > 0 ? owners[cellIndex(ix, iz - 1)] : null;
            const above = iz < rows ? owners[cellIndex(ix, iz)] : null;
            const belowWalkable = !!below, aboveWalkable = !!above;
            if (belowWalkable === aboveWalkable) continue;
            const ownerIds = belowWalkable ? below : above;
            rawSegments.push({
                x1: xs[ix], z1: zs[iz], x2: xs[ix + 1], z2: zs[iz],
                axis: 'x', at: zs[iz], from: xs[ix], to: xs[ix + 1],
                side: belowWalkable ? 'north' : 'south', ownerIds,
            });
        }
    }
    return mergeCollinearSegments(rawSegments);
}

// Merge adjacent same-axis, same-"at"-coordinate, same-side segments into
// maximal runs, so a junction sends guardrail authority one clean long span
// per exposed edge instead of one tiny fragment per raster cell.
function mergeCollinearSegments(segments) {
    const byKey = new Map();
    for (const seg of segments) {
        const key = `${seg.axis}:${seg.at.toFixed(6)}:${seg.side}`;
        const list = byKey.get(key) ?? [];
        list.push(seg);
        byKey.set(key, list);
    }
    const merged = [];
    for (const list of byKey.values()) {
        list.sort((a, b) => a.from - b.from);
        let current = null;
        for (const seg of list) {
            if (current && Math.abs(seg.from - current.to) <= EPS) {
                current.to = seg.to;
                current.ownerIds = [...new Set([...current.ownerIds, ...seg.ownerIds])];
            } else {
                if (current) merged.push(current);
                current = { ...seg };
            }
        }
        if (current) merged.push(current);
    }
    return merged.map(seg => ({
        x1: seg.axis === 'z' ? seg.at : seg.from,
        z1: seg.axis === 'z' ? seg.from : seg.at,
        x2: seg.axis === 'z' ? seg.at : seg.to,
        z2: seg.axis === 'z' ? seg.to : seg.at,
        side: seg.side,
        ownerIds: seg.ownerIds,
    }));
}

// Rough junction-type classification from arm/member count alone. This is
// deliberately coarse (report 3's full THROUGH/CORNER/T/X/MERGE/etc taxonomy
// is a Phase C concern once structure planning is in scope) - Phase A only
// needs enough of a label to report a useful breakdown.
function classifyJunction(members) {
    if (members.length <= 1) return 'single';
    if (members.length === 2) return 'through-or-corner';
    if (members.length === 3) return 'branch';
    return 'complex';
}

// The full Phase A plan for one field (ground/hanging): cluster same-level
// transport surfaces, and for every real junction (2+ members) derive its
// exposed boundary. Single-member "clusters" are not junctions at all and are
// dropped - an isolated surface's own 4 sides are already exactly what the
// existing per-surface rail emission does.
export function planTransportJunctions(surfaces = [], options = {}) {
    const clusters = clusterTransportJunctions(surfaces, options);
    const junctions = clusters
        .filter(members => members.length >= 2)
        .map((members, index) => {
            const exposedBoundary = exposedBoundarySegments(members);
            const internalEdgeCount = members.length >= 2
                ? countInternalEdges(members)
                : 0;
            return {
                id: `junction:${members.map(m => m.id).join('+')}`,
                index,
                memberIds: members.map(m => m.id),
                armCount: members.length,
                type: classifyJunction(members),
                exposedBoundary,
                internalEdgeCount,
            };
        });
    return {
        schema: 'jweb.transport-junction-plan.v1',
        junctionCount: junctions.length,
        junctions,
        singleSurfaceCount: clusters.filter(members => members.length === 1).length,
    };
}

// How many of a junction's members share a boundary with at least one other
// member - i.e. how many "would have gotten a rail today but shouldn't".
function countInternalEdges(members) {
    let count = 0;
    for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
            if (rectsTouchOrOverlap(members[i], members[j])) count++;
        }
    }
    return count;
}
