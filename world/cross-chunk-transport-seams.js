export const CROSS_CHUNK_TRANSPORT_SEAM_SCHEMA = 'jweb.cross-chunk-transport-seam.v1';
export const CROSS_CHUNK_TRANSPORT_PAIR_SCHEMA = 'jweb.cross-chunk-transport-pair.v1';

const EPS = 1e-6;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value) { return Math.trunc(finite(value)); }

function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function chunkDescriptor(chunk) {
  if (!chunk) return null;
  const x = integer(chunk.x);
  const z = integer(chunk.z);
  return Object.freeze({ key: String(chunk.key ?? `${x},${z}`), x, z });
}

/**
 * Canonical cardinal adjacency authority.  The same unordered chunk pair always
 * resolves to the same edge key and first/second orientation, regardless of build
 * or commit order.
 */
export function canonicalChunkAdjacency(aChunk, bChunk) {
  const a = chunkDescriptor(aChunk);
  const b = chunkDescriptor(bChunk);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) + Math.abs(dz) !== 1) return null;

  if (dx !== 0) {
    const west = a.x < b.x ? a : b;
    const east = a.x < b.x ? b : a;
    if (west.z !== east.z) return null;
    return Object.freeze({
      schema: CROSS_CHUNK_TRANSPORT_PAIR_SCHEMA,
      axis: 'x',
      edgeKey: `V:${east.x}:${west.z}`,
      first: west,
      second: east,
      firstSide: 'east',
      secondSide: 'west',
      direction: 'west-east',
    });
  }

  const north = a.z < b.z ? a : b;
  const south = a.z < b.z ? b : a;
  if (north.x !== south.x) return null;
  return Object.freeze({
    schema: CROSS_CHUNK_TRANSPORT_PAIR_SCHEMA,
    axis: 'z',
    edgeKey: `H:${north.x}:${south.z}`,
    first: north,
    second: south,
    firstSide: 'south',
    secondSide: 'north',
    direction: 'north-south',
  });
}

function payloadForDescriptor(pair, aChunk, aValue, bChunk, bValue, which) {
  const target = pair[which];
  const a = chunkDescriptor(aChunk);
  if (a?.x === target.x && a?.z === target.z) return aValue;
  const b = chunkDescriptor(bChunk);
  if (b?.x === target.x && b?.z === target.z) return bValue;
  return null;
}

/**
 * The ground road grid already reaches every chunk edge.  This records the shared
 * deterministic lane as an explicit cross-chunk handoff rather than fabricating a
 * second physical bridge over an existing street connection.
 */
export function planCrossChunkGroundRoadHandoff({
  aChunk,
  aPortals,
  bChunk,
  bPortals,
} = {}) {
  const adjacency = canonicalChunkAdjacency(aChunk, bChunk);
  if (!adjacency) return null;
  const firstPortals = payloadForDescriptor(adjacency, aChunk, aPortals, bChunk, bPortals, 'first') ?? {};
  const secondPortals = payloadForDescriptor(adjacency, aChunk, aPortals, bChunk, bPortals, 'second') ?? {};
  const firstLane = Number(firstPortals?.[adjacency.firstSide]);
  const secondLane = Number(secondPortals?.[adjacency.secondSide]);
  if (!Number.isInteger(firstLane) || !Number.isInteger(secondLane) || firstLane !== secondLane) return null;

  const id = `cross-chunk-ground-road:${adjacency.edgeKey}:lane:${firstLane}`;
  return Object.freeze({
    schema: CROSS_CHUNK_TRANSPORT_SEAM_SCHEMA,
    id,
    kind: 'ground-road-handoff',
    field: 'ground',
    edgeKey: adjacency.edgeKey,
    axis: adjacency.axis,
    lane: firstLane,
    firstChunkKey: adjacency.first.key,
    secondChunkKey: adjacency.second.key,
    firstSide: adjacency.firstSide,
    secondSide: adjacency.secondSide,
    physicalGeometry: 'existing-road-edge',
    ownerAuthority: 'paired-chunk-road-surfaces',
    invariant: 'cardinal neighbors publish the same deterministic edge lane; no duplicate cross-chunk ground catwalk is fabricated',
  });
}

function transportSurfaces(physics) {
  return Array.isArray(physics?.exteriorTransportSurfaces) ? physics.exteriorTransportSurfaces : [];
}

function isSkyStreetSurface(surface) {
  return surface?.kind === 'clear-roof-street-layer'
    && Number.isFinite(Number(surface.x))
    && Number.isFinite(Number(surface.z))
    && Number.isFinite(Number(surface.y))
    && Number(surface.hx) > 0
    && Number(surface.hz) > 0;
}

function overlap1d(a0, a1, b0, b1) {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo + EPS ? { lo, hi, size: hi - lo, center: (lo + hi) * 0.5 } : null;
}

function pointOnWallSegment(point, wall, tolerance) {
  const x1 = finite(wall?.x1, NaN), z1 = finite(wall?.z1, NaN);
  const x2 = finite(wall?.x2, NaN), z2 = finite(wall?.z2, NaN);
  if (![x1, z1, x2, z2].every(Number.isFinite)) return false;
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 <= EPS) return Math.hypot(point.x - x1, point.z - z1) <= tolerance;
  let t = ((point.x - x1) * dx + (point.z - z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + dx * t, z = z1 + dz * t;
  return Math.hypot(point.x - x, point.z - z) <= tolerance;
}

function mouthBlocked(physics, surface, point, axis, tolerance = 0.28) {
  for (const wall of physics?.mazeWalls ?? []) {
    if (!wall?.transportRailId || wall.surfaceId !== surface.id) continue;
    const dx = Math.abs(finite(wall.x2) - finite(wall.x1));
    const dz = Math.abs(finite(wall.z2) - finite(wall.z1));
    // A blocking end guard crosses the direction of travel.  Longitudinal side
    // rails are intentionally ignored so a safe bridge can meet the roof mouth.
    const crossesTravel = axis === 'x' ? dz > dx * 1.5 : dx > dz * 1.5;
    if (!crossesTravel) continue;
    if (pointOnWallSegment(point, wall, tolerance + Math.max(0, finite(wall.thickness) * 0.5))) return true;
  }
  return false;
}

function skyCandidate({ adjacency, firstPhysics, secondPhysics, chunkSize, maxGap, levelTolerance, minCrossWidth, boundaryReach, firstSurface, secondSurface }) {
  if (!isSkyStreetSurface(firstSurface) || !isSkyStreetSurface(secondSurface)) return null;
  const rise = Math.abs(Number(firstSurface.y) - Number(secondSurface.y));
  if (rise > levelTolerance + EPS) return null;

  const halfChunk = chunkSize * 0.5;
  let boundaryCoordinate, firstEdge, secondEdge, overlap, firstPoint, secondPoint;
  if (adjacency.axis === 'x') {
    boundaryCoordinate = adjacency.first.x * chunkSize + halfChunk;
    firstEdge = Number(firstSurface.x) + Number(firstSurface.hx);
    secondEdge = Number(secondSurface.x) - Number(secondSurface.hx);
    if (Math.abs(firstEdge - boundaryCoordinate) > boundaryReach || Math.abs(secondEdge - boundaryCoordinate) > boundaryReach) return null;
    overlap = overlap1d(
      Number(firstSurface.z) - Number(firstSurface.hz), Number(firstSurface.z) + Number(firstSurface.hz),
      Number(secondSurface.z) - Number(secondSurface.hz), Number(secondSurface.z) + Number(secondSurface.hz),
    );
    if (!overlap || overlap.size < minCrossWidth) return null;
    firstPoint = { x: firstEdge, z: overlap.center };
    secondPoint = { x: secondEdge, z: overlap.center };
  } else {
    boundaryCoordinate = adjacency.first.z * chunkSize + halfChunk;
    firstEdge = Number(firstSurface.z) + Number(firstSurface.hz);
    secondEdge = Number(secondSurface.z) - Number(secondSurface.hz);
    if (Math.abs(firstEdge - boundaryCoordinate) > boundaryReach || Math.abs(secondEdge - boundaryCoordinate) > boundaryReach) return null;
    overlap = overlap1d(
      Number(firstSurface.x) - Number(firstSurface.hx), Number(firstSurface.x) + Number(firstSurface.hx),
      Number(secondSurface.x) - Number(secondSurface.hx), Number(secondSurface.x) + Number(secondSurface.hx),
    );
    if (!overlap || overlap.size < minCrossWidth) return null;
    firstPoint = { x: overlap.center, z: firstEdge };
    secondPoint = { x: overlap.center, z: secondEdge };
  }

  const gap = secondEdge - firstEdge;
  if (gap < 0.04 - EPS || gap > maxGap + EPS) return null;
  if (mouthBlocked(firstPhysics, firstSurface, firstPoint, adjacency.axis)) return null;
  if (mouthBlocked(secondPhysics, secondSurface, secondPoint, adjacency.axis)) return null;

  const tie = stableHash(`${adjacency.edgeKey}:${firstSurface.id}:${secondSurface.id}`) / 0xffffffff;
  return {
    firstSurface,
    secondSurface,
    gap,
    rise,
    overlap,
    firstPoint,
    secondPoint,
    boundaryCoordinate,
    // Gap dominates; then prefer the broadest shared roof mouth; stable hash is
    // only a final deterministic tie-breaker.
    score: gap * 1000 + rise * 100 - overlap.size * 10 + tie * 0.001,
  };
}

/**
 * Plan one short, level hanging-city seam across a committed cardinal boundary.
 * This deliberately refuses long or stepped ground-style fallback links: 21L's
 * local-ground catwalk envelope remains authoritative.
 */
export function planCrossChunkSkyStreetSeam({
  aChunk,
  aPhysics,
  bChunk,
  bPhysics,
  chunkSize = 64,
  maxGap = 2.0,
  levelTolerance = 0.08,
  minCrossWidth = 1.2,
  maxDeckWidth = 2.4,
  boundaryReach = null,
  worldSeed = 0,
} = {}) {
  const adjacency = canonicalChunkAdjacency(aChunk, bChunk);
  if (!adjacency) return null;
  const size = Math.max(8, finite(chunkSize, 64));
  const resolvedMaxGap = Math.max(0.08, finite(maxGap, 2));
  const resolvedBoundaryReach = Math.max(resolvedMaxGap, finite(boundaryReach, resolvedMaxGap + 0.75));
  const firstPhysics = payloadForDescriptor(adjacency, aChunk, aPhysics, bChunk, bPhysics, 'first');
  const secondPhysics = payloadForDescriptor(adjacency, aChunk, aPhysics, bChunk, bPhysics, 'second');
  if (!firstPhysics || !secondPhysics) return null;

  const candidates = [];
  for (const firstSurface of transportSurfaces(firstPhysics)) {
    for (const secondSurface of transportSurfaces(secondPhysics)) {
      const candidate = skyCandidate({
        adjacency,
        firstPhysics,
        secondPhysics,
        chunkSize: size,
        maxGap: resolvedMaxGap,
        levelTolerance: Math.max(0, finite(levelTolerance, 0.08)),
        minCrossWidth: Math.max(0.6, finite(minCrossWidth, 1.2)),
        boundaryReach: resolvedBoundaryReach,
        firstSurface,
        secondSurface,
      });
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => a.score - b.score
    || String(a.firstSurface.id).localeCompare(String(b.firstSurface.id))
    || String(a.secondSurface.id).localeCompare(String(b.secondSurface.id)));
  const best = candidates[0];
  if (!best) return null;

  const clearWidth = best.overlap.size;
  const deckWidth = Math.min(Math.max(1.2, finite(maxDeckWidth, 2.4)), clearWidth - 0.20);
  if (!(deckWidth >= 1.0)) return null;
  const halfWidth = deckWidth * 0.5;
  const from = adjacency.axis === 'x' ? best.firstPoint.x : best.firstPoint.z;
  const to = adjacency.axis === 'x' ? best.secondPoint.x : best.secondPoint.z;
  const fixedCoord = adjacency.axis === 'x' ? best.firstPoint.z : best.firstPoint.x;
  const y = (Number(best.firstSurface.y) + Number(best.secondSurface.y)) * 0.5;
  const id = `cross-chunk-sky-street:${adjacency.edgeKey}`;
  const ownerId = `cross-chunk-seam:${worldSeed}:${adjacency.edgeKey}:hanging`;

  return Object.freeze({
    schema: CROSS_CHUNK_TRANSPORT_SEAM_SCHEMA,
    id,
    ownerId,
    kind: 'hanging-sky-street-seam',
    field: 'hanging',
    edgeKey: adjacency.edgeKey,
    axis: adjacency.axis,
    direction: adjacency.direction,
    firstChunkKey: adjacency.first.key,
    secondChunkKey: adjacency.second.key,
    firstSurfaceId: best.firstSurface.id,
    secondSurfaceId: best.secondSurface.id,
    from,
    to,
    fixedCoord,
    halfWidth,
    clearWidth,
    gap: best.gap,
    rise: best.rise,
    y,
    boundaryCoordinate: best.boundaryCoordinate,
    firstPoint: Object.freeze({ ...best.firstPoint, y: Number(best.firstSurface.y) }),
    secondPoint: Object.freeze({ ...best.secondPoint, y: Number(best.secondSurface.y) }),
    ownerAuthority: 'canonical-cardinal-pair',
    physicalGeometry: 'short-level-seam-deck',
    invariant: 'one canonical owner stitches compatible hanging roof streets across a loaded cardinal boundary; long ground catwalk fallback is forbidden',
  });
}


function skyPhysicsForPayload(payload) {
  if (payload?.hangingLayer?.payload?.physics) return payload.hangingLayer.payload.physics;
  if (payload?.ceilingCity && payload?.physics) return payload.physics;
  return null;
}

export function planCrossChunkTransportPair({
  aChunk,
  aPayload,
  bChunk,
  bPayload,
  chunkSize = 64,
  worldSeed = 0,
} = {}) {
  const adjacency = canonicalChunkAdjacency(aChunk, bChunk);
  if (!adjacency) return null;
  const groundRoad = planCrossChunkGroundRoadHandoff({
    aChunk, aPortals: aPayload?.portals,
    bChunk, bPortals: bPayload?.portals,
  });
  const skyStreet = planCrossChunkSkyStreetSeam({
    aChunk, aPhysics: skyPhysicsForPayload(aPayload),
    bChunk, bPhysics: skyPhysicsForPayload(bPayload),
    chunkSize, worldSeed,
  });
  if (!groundRoad && !skyStreet) return null;
  return Object.freeze({
    schema: CROSS_CHUNK_TRANSPORT_PAIR_SCHEMA,
    edgeKey: adjacency.edgeKey,
    axis: adjacency.axis,
    firstChunkKey: adjacency.first.key,
    secondChunkKey: adjacency.second.key,
    groundRoad,
    skyStreet,
    invariant: 'existing ground road lanes hand off semantically while only short compatible hanging roof mouths receive new physical seam geometry',
  });
}
