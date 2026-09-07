// Phase A hostile fixture set from the 2026-09-07 skyway-junction report:
// pure geometry, no engine integration, no rendering - proving the exposed-
// boundary primitive gets the topology right before anything is allowed to
// wire it into real rail emission.
import assert from 'node:assert/strict';
import {
    clusterTransportJunctions,
    exposedBoundarySegments,
    internalBoundarySegments,
    planTransportJunctions,
} from '../world/transport-junction-authority.js';

function rect(id, x, z, hx, hz, y = 6) {
    return { id, x, z, hx, hz, y };
}

// A segment is "internal" (bad) if it lies exactly on the shared boundary
// between two touching/overlapping members and both sides are walkable -
// exposedBoundarySegments should never emit one of these.
function segmentLiesOnSharedInterior(seg, rects) {
    const onVertical = Math.abs(seg.x1 - seg.x2) < 1e-9;
    const at = onVertical ? seg.x1 : seg.z1;
    const from = onVertical ? Math.min(seg.z1, seg.z2) : Math.min(seg.x1, seg.x2);
    const to = onVertical ? Math.max(seg.z1, seg.z2) : Math.max(seg.x1, seg.x2);
    const mid = (from + to) / 2;
    const eps = 1e-4;
    const sampleWalkable = (dx, dz) => rects.some(r => (onVertical ? at + dx : mid + dx) > r.minX - eps
        && (onVertical ? at + dx : mid + dx) < r.maxX + eps
        && (onVertical ? mid + dz : at + dz) > r.minZ - eps
        && (onVertical ? mid + dz : at + dz) < r.maxZ + eps);
    const side1 = onVertical ? sampleWalkable(-eps * 4, 0) : sampleWalkable(0, -eps * 4);
    const side2 = onVertical ? sampleWalkable(eps * 4, 0) : sampleWalkable(0, eps * 4);
    return side1 && side2;
}

function boundsOf(members) {
    return members.map(m => ({ id: m.id, minX: m.x - m.hx, maxX: m.x + m.hx, minZ: m.z - m.hz, maxZ: m.z + m.hz }));
}

// 01 - straight overlap: two collinear decks overlapping end-to-end.
{
    const surfaces = [rect('a', 0, 0, 3, 1), rect('b', 5, 0, 3, 1)]; // touch at x=3
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '01: two touching decks form one junction');
    const j = plan.junctions[0];
    const rects = boundsOf(surfaces);
    for (const seg of j.exposedBoundary) {
        assert.equal(segmentLiesOnSharedInterior(seg, rects), false, '01: no exposed segment on the shared seam');
    }
    // continuous 2m-wide, 8m-long corridor -> exactly 2 long side runs + 2 end caps
    const northRun = j.exposedBoundary.find(seg => seg.side === 'north');
    assert.ok(northRun, '01: must have one merged north run');
    assert.ok(Math.abs((northRun.x2 - northRun.x1)) >= 7.9, '01: north run must span the full merged length, not per-piece fragments');

    // a:[-3,3] and b:[2,8] genuinely overlap by 1m (x:[2,3]), not merely touch -
    // that 1m zone is covered by BOTH members, so its two boundaries (x=2,
    // entering dual coverage; x=3, leaving it) are each real internal edges.
    // The union of their spans is the full carve extent either surface needs.
    const internal = internalBoundarySegments(rects);
    assert.equal(internal.length, 2, '01b: a real 1m double-covered overlap has two internal boundary edges');
    const zSpan = { from: Math.min(...internal.map(s => Math.min(s.z1, s.z2))), to: Math.max(...internal.map(s => Math.max(s.z1, s.z2))) };
    assert.ok(Math.abs((zSpan.to - zSpan.from) - 2) < 1e-9, '01b: merged carve span must equal the real 2m shared width');
}

// 02 - 90deg corner: an L-shaped union.
{
    const surfaces = [rect('a', 0, 0, 2, 1), rect('b', 2, -2, 1, 3)]; // a: x[-2,2] z[-1,1]; b: x[1,3] z[-5,1] -> touching/overlapping
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '02: corner pieces must form one junction');
    const rects = boundsOf(surfaces);
    for (const seg of plan.junctions[0].exposedBoundary) {
        assert.equal(segmentLiesOnSharedInterior(seg, rects), false, '02: no exposed segment through the inner elbow');
    }
}

// 03 - T junction: a trunk with a branch joining midway.
{
    const surfaces = [rect('trunk', 0, 0, 5, 1), rect('branch', 0, 3, 1, 2)]; // trunk x[-5,5] z[-1,1]; branch x[-1,1] z[1,5]
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '03: T must be one junction');
    const j = plan.junctions[0];
    const rects = boundsOf(surfaces);
    for (const seg of j.exposedBoundary) {
        assert.equal(segmentLiesOnSharedInterior(seg, rects), false, '03: no exposed segment across the branch mouth');
    }
    // the trunk's north edge either side of the branch mouth must still be exposed
    const northSegs = j.exposedBoundary.filter(seg => seg.side === 'north');
    assert.ok(northSegs.length >= 2, '03: trunk north edge must remain guarded on both sides of the open branch mouth');
}

// 04 - X junction: two perpendicular corridors crossing.
{
    const surfaces = [rect('ns', 0, 0, 1, 4), rect('ew', 0, 0, 4, 1)];
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '04: X must be one junction');
    const j = plan.junctions[0];
    const rects = boundsOf(surfaces);
    for (const seg of j.exposedBoundary) {
        assert.equal(segmentLiesOnSharedInterior(seg, rects), false, '04: no exposed segment inside the crossing');
    }
    // A plus/cross-shaped union is a rectilinear polygon with 12 edges (each
    // of the 4 arms contributes 3 exposed sides; the 4 concave notches where
    // an arm meets the crossbar each turn the outline through two edges).
    assert.equal(j.exposedBoundary.length, 12, '04: an X union has exactly 12 exposed edges');
}

// 05 - different widths: a narrow branch into a wide collector.
{
    const surfaces = [rect('collector', 0, 0, 6, 2), rect('branch', 0, 3, 0.6, 1)]; // branch x[-0.6,0.6] z[1,5]... wait ensure touch
    const plan = planTransportJunctions([rect('collector', 0, 0, 6, 2), rect('branch', 0, 2.8, 0.6, 0.8)]);
    assert.equal(plan.junctionCount, 1, '05: mismatched widths still merge into one junction');
}

// 06 - offset T: branch lands near the trunk's end, not its middle.
{
    const surfaces = [rect('trunk', 0, 0, 5, 1), rect('branch', 4, 3, 1, 2)]; // branch near trunk's east end
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '06: offset T is still one junction');
    const rects = boundsOf(surfaces);
    let orphanFragments = 0;
    for (const seg of plan.junctions[0].exposedBoundary) {
        if (segmentLiesOnSharedInterior(seg, rects)) orphanFragments++;
    }
    assert.equal(orphanFragments, 0, '06: offset T must not produce tiny orphan interior fragments - the classic pairwise-cut failure mode');

    // This is exactly the case where the OLD guessed-width carve is wrong:
    // trunk and branch only *touch* at z=1 (zero-height intersection rect),
    // so the old Math.max(0.90, Math.min(cut.hx*2, cut.hz*2, 1.65)) formula
    // degenerates to the 0.90m floor - even though the real shared mouth
    // (branch's x-span, 3 to 5) is a full 2m wide. A 0.90m carve would leave
    // 1.1m of spurious rail sitting across the real opening.
    const internal = internalBoundarySegments(rects);
    assert.equal(internal.length, 1, '06b: exactly one internal seam at the branch mouth');
    const seg = internal[0];
    assert.ok(Math.abs(Math.abs(seg.x2 - seg.x1) - 2) < 1e-9,
        `06b: true shared mouth is 2m wide, not the old formula's clamped 0.9m guess (got ${Math.abs(seg.x2 - seg.x1)})`);
}

// 07 - two almost-overlapping cuts: three surfaces whose openings interleave.
{
    const surfaces = [rect('a', 0, 0, 3, 1), rect('b', 5.9, 0, 3, 1), rect('c', 2.95, 2, 1, 3)];
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 1, '07: near-overlapping members must merge into a single junction, not fragment');
}

// 08 - same plan-view geometry, different levels: must NOT be a junction.
{
    const surfaces = [rect('low', 0, 0, 3, 3, 6), rect('high', 0, 0, 3, 3, 14)];
    const plan = planTransportJunctions(surfaces);
    assert.equal(plan.junctionCount, 0, '08: vertically separated surfaces must never form a junction');
    assert.equal(plan.singleSurfaceCount, 2);
}

// 09 - level epsilon: just inside vs just outside the tolerance.
{
    const inside = planTransportJunctions([rect('a', 0, 0, 3, 3, 6.00), rect('b', 0, 0, 3, 3, 6.10)], { levelToleranceM: 0.12 });
    assert.equal(inside.junctionCount, 1, '09: within tolerance must join');
    const outside = planTransportJunctions([rect('a', 0, 0, 3, 3, 6.00), rect('b', 0, 0, 3, 3, 6.20)], { levelToleranceM: 0.12 });
    assert.equal(outside.junctionCount, 0, '09: beyond tolerance must not join');
}

// 10 - property test: random axis-aligned clusters, assert the universal
// invariants report 3 asked for rather than hand-picked cases only.
{
    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let trial = 0; trial < 60; trial++) {
        const count = 2 + Math.floor(rng() * 4);
        const surfaces = [];
        let cx = 0, cz = 0;
        for (let i = 0; i < count; i++) {
            const hx = 0.6 + rng() * 2.4;
            const hz = 0.6 + rng() * 2.4;
            surfaces.push(rect(`s${i}`, cx, cz, hx, hz));
            // Walk to a new touching/overlapping neighbor in a random cardinal direction.
            const dir = Math.floor(rng() * 4);
            const step = (rng() - 0.3) * Math.min(hx, hz) * 1.8;
            if (dir === 0) cx += hx + step; else if (dir === 1) cx -= hx + step;
            else if (dir === 2) cz += hz + step; else cz -= hz + step;
        }
        const plan = planTransportJunctions(surfaces);
        const rects = boundsOf(surfaces);
        for (const junction of plan.junctions) {
            for (const seg of junction.exposedBoundary) {
                assert.equal(segmentLiesOnSharedInterior(seg, rects), false,
                    `10 (trial ${trial}): no exposed segment may lie on a shared interior boundary`);
            }
        }
        // every member accounted for exactly once across all junctions + singles
        const clustered = new Set(plan.junctions.flatMap(j => j.memberIds));
        assert.equal(clustered.size + plan.singleSurfaceCount, surfaces.length,
            `10 (trial ${trial}): every surface must appear in exactly one cluster`);
    }
}

console.log('[transport-junction-authority-selftest] PASS', {
    fixtures: 10,
    propertyTrials: 60,
});
