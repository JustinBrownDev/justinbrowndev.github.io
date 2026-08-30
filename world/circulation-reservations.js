const EPS = 1e-5;

function finite(name, value) {
    if (!Number.isFinite(value)) throw new Error(`circulation reservation requires finite ${name}`);
    return value;
}

function ordered(a, b) {
    return a <= b ? [a, b] : [b, a];
}

function verticalOverlap(a0, a1, b0, b1) {
    return a0 < b1 - EPS && a1 > b0 + EPS;
}

export function createBoxCirculationReservation({
    id,
    kind,
    x,
    z,
    halfX,
    halfZ,
    yMin,
    yMax,
    source = null,
    metadata = null,
}) {
    if (!id || !kind) throw new Error('circulation reservation requires id and kind');
    finite('x', x); finite('z', z); finite('halfX', halfX); finite('halfZ', halfZ);
    finite('yMin', yMin); finite('yMax', yMax);
    if (!(halfX > 0) || !(halfZ > 0) || !(yMax > yMin)) throw new Error('circulation reservation requires positive volume');
    return {
        id, kind, x, z, halfX, halfZ, yMin, yMax,
        minX: x - halfX, maxX: x + halfX,
        minZ: z - halfZ, maxZ: z + halfZ,
        source,
        ...(metadata || {}),
    };
}

export function createStairShaftReservation({
    id,
    x,
    z,
    openingWidth,
    openingDepth,
    baseY = 0,
    roofY,
    exitHeadroom = 2.1,
    rampAxis = null,
    rampFrom = null,
    rampTo = null,
    rampHalfWidth = null,
    source = 'compound-stair',
}) {
    finite('openingWidth', openingWidth); finite('openingDepth', openingDepth);
    finite('baseY', baseY); finite('roofY', roofY); finite('exitHeadroom', exitHeadroom);
    if (!(openingWidth > 0) || !(openingDepth > 0) || !(roofY > baseY) || exitHeadroom < 0) {
        throw new Error('stair shaft reservation requires positive opening and height');
    }
    return createBoxCirculationReservation({
        id,
        kind: 'stair-shaft',
        x, z,
        halfX: openingWidth * 0.5,
        halfZ: openingDepth * 0.5,
        yMin: baseY,
        yMax: roofY + exitHeadroom,
        source,
        metadata: {
            openingWidth,
            openingDepth,
            roofY,
            exitHeadroom,
            rampAxis,
            rampFrom,
            rampTo,
            rampHalfWidth,
        },
    });
}

export function createRampCirculationReservation({
    id,
    kind = 'ramp-corridor',
    axis,
    from,
    to,
    fixedCoord,
    halfWidth,
    y0,
    y1,
    capsuleRadius = 0.28,
    headroom = 1.95,
    source = null,
}) {
    if (axis !== 'x' && axis !== 'z') throw new Error('ramp reservation axis must be x or z');
    for (const [name, value] of Object.entries({ from, to, fixedCoord, halfWidth, y0, y1, capsuleRadius, headroom })) finite(name, value);
    if (!(halfWidth > 0) || capsuleRadius < 0 || headroom < 0) throw new Error('ramp reservation requires positive width and non-negative clearances');
    const [lo, hi] = ordered(from, to);
    const center = (lo + hi) * 0.5;
    const alongHalf = (hi - lo) * 0.5 + capsuleRadius;
    const crossHalf = halfWidth + capsuleRadius;
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1) + headroom;
    return createBoxCirculationReservation({
        id,
        kind,
        x: axis === 'x' ? center : fixedCoord,
        z: axis === 'z' ? center : fixedCoord,
        halfX: axis === 'x' ? alongHalf : crossHalf,
        halfZ: axis === 'z' ? alongHalf : crossHalf,
        yMin: minY,
        yMax: maxY,
        source,
        metadata: { axis, from, to, fixedCoord, halfWidth, y0, y1, capsuleRadius, headroom },
    });
}

export function reservationIntersectsBox(reservation, { x, z, sx, sz, hx, hz, halfX: suppliedHalfX, halfZ: suppliedHalfZ, yMin = -Infinity, yMax = Infinity }, padding = 0) {
    const halfX = Number.isFinite(hx) ? hx : Number.isFinite(suppliedHalfX) ? suppliedHalfX : sx * 0.5;
    const halfZ = Number.isFinite(hz) ? hz : Number.isFinite(suppliedHalfZ) ? suppliedHalfZ : sz * 0.5;
    if (![x, z, halfX, halfZ].every(Number.isFinite)) throw new Error('box intersection requires finite center and half extents');
    if (!verticalOverlap(yMin, yMax, reservation.yMin, reservation.yMax)) return false;
    return x + halfX > reservation.minX - padding + EPS
        && x - halfX < reservation.maxX + padding - EPS
        && z + halfZ > reservation.minZ - padding + EPS
        && z - halfZ < reservation.maxZ + padding - EPS;
}

export function reservationIntersectsCylinder(reservation, { x, z, radius, yMin = -Infinity, yMax = Infinity }, padding = 0) {
    if (![x, z, radius].every(Number.isFinite)) throw new Error('cylinder intersection requires finite center and radius');
    if (!verticalOverlap(yMin, yMax, reservation.yMin, reservation.yMax)) return false;
    const nearestX = Math.max(reservation.minX - padding, Math.min(x, reservation.maxX + padding));
    const nearestZ = Math.max(reservation.minZ - padding, Math.min(z, reservation.maxZ + padding));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    return dx * dx + dz * dz < (radius + padding) * (radius + padding) - EPS;
}

export function reservationCutForAxisSegment(reservation, { axis, fixedCoord, from, to, yMin, yMax }, padding = 0) {
    if (axis !== 'x' && axis !== 'z') throw new Error('segment axis must be x or z');
    if (!verticalOverlap(yMin, yMax, reservation.yMin, reservation.yMax)) return null;
    const [lo, hi] = ordered(from, to);
    const crossMin = axis === 'x' ? reservation.minZ : reservation.minX;
    const crossMax = axis === 'x' ? reservation.maxZ : reservation.maxX;
    if (fixedCoord < crossMin - padding + EPS || fixedCoord > crossMax + padding - EPS) return null;
    const alongMin = axis === 'x' ? reservation.minX : reservation.minZ;
    const alongMax = axis === 'x' ? reservation.maxX : reservation.maxZ;
    const cut0 = Math.max(lo, alongMin - padding);
    const cut1 = Math.min(hi, alongMax + padding);
    if (cut1 <= cut0 + EPS) return null;
    return { from: cut0, to: cut1 };
}

export function reservationContainsRamp(reservation, ramp, tolerance = 1e-6) {
    if (!ramp || (ramp.axis !== 'x' && ramp.axis !== 'z')) return false;
    const [lo, hi] = ordered(ramp.from, ramp.to);
    const crossMin = ramp.fixedCoord - ramp.halfWidth;
    const crossMax = ramp.fixedCoord + ramp.halfWidth;
    const rampMinX = ramp.axis === 'x' ? lo : crossMin;
    const rampMaxX = ramp.axis === 'x' ? hi : crossMax;
    const rampMinZ = ramp.axis === 'z' ? lo : crossMin;
    const rampMaxZ = ramp.axis === 'z' ? hi : crossMax;
    return rampMinX >= reservation.minX - tolerance
        && rampMaxX <= reservation.maxX + tolerance
        && rampMinZ >= reservation.minZ - tolerance
        && rampMaxZ <= reservation.maxZ + tolerance
        && Math.min(ramp.y0, ramp.y1) >= reservation.yMin - tolerance
        && Math.max(ramp.y0, ramp.y1) <= reservation.yMax + tolerance;
}

export function anyReservationIntersectsBox(reservations, box, padding = 0) {
    return reservations.some(reservation => reservationIntersectsBox(reservation, box, padding));
}

export function anyReservationIntersectsCylinder(reservations, cylinder, padding = 0) {
    return reservations.some(reservation => reservationIntersectsCylinder(reservation, cylinder, padding));
}
