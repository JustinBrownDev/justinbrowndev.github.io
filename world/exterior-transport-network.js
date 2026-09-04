import { deriveStairFlight, gameplayTraversalEnvelope } from './physical-truth.js';

export const EXTERIOR_TRANSPORT_NETWORK_SCHEMA = 'jweb.exterior-transport-network.v3';
const EPS = 1e-6;
const LEVEL_TOLERANCE = 0.12;
const MIN_UNION_DEPTH = 0.22;
const MIN_UNION_WIDTH = 0.72;
const BLOCKED_CLEARANCE = 0.08;

function finite(value) { return Number.isFinite(Number(value)); }
function bounds(surface) {
  return {
    minX: Number(surface.x) - Number(surface.hx), maxX: Number(surface.x) + Number(surface.hx),
    minZ: Number(surface.z) - Number(surface.hz), maxZ: Number(surface.z) + Number(surface.hz),
  };
}
function overlapAmount(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function networkKey(surface) {
  return String(surface.networkKey ?? surface.routeId ?? surface.bridgeId ?? `${surface.siteId ?? 'site'}:${surface.moduleKey ?? surface.id}`);
}
function distinctAuthority(a, b) {
  if (a.id === b.id) return false;
  if (networkKey(a) === networkKey(b)) return false;
  return a.siteId !== b.siteId || a.moduleKey !== b.moduleKey || a.kind === 'clear-roof-street-layer' || b.kind === 'clear-roof-street-layer';
}
function rectOverlap(a, b, epsilon = 0.02) {
  return Math.abs(Number(a.x) - Number(b.x)) < Number(a.hx) + Number(b.hx) - epsilon
    && Math.abs(Number(a.z) - Number(b.z)) < Number(a.hz) + Number(b.hz) - epsilon;
}
function verticalRangesOverlap(a0, a1, b0, b1, epsilon = 0.08) {
  return Math.min(Math.max(a0, a1), Math.max(b0, b1)) > Math.max(Math.min(a0, a1), Math.min(b0, b1)) - epsilon;
}

export function normalizeTransportSurface(surface) {
  if (!surface?.id || !finite(surface.x) || !finite(surface.z) || !finite(surface.hx) || !finite(surface.hz) || !finite(surface.y)) {
    throw new Error('exterior transport surface requires id/x/z/hx/hz/y');
  }
  if (!(Number(surface.hx) > 0) || !(Number(surface.hz) > 0)) throw new Error(`${surface.id}: exterior transport surface needs positive extents`);
  return Object.freeze({
    schema: 'jweb.exterior-transport-surface.v1',
    kind: 'exterior-street-layer',
    reachable: surface.reachable !== false,
    priority: surface.priority ?? 'circulation-owned',
    ...surface,
    x: Number(surface.x), z: Number(surface.z), hx: Number(surface.hx), hz: Number(surface.hz), y: Number(surface.y),
  });
}

export function transportSurfaceIntersection(a, b, epsilon = EPS) {
  if (!a || !b || Math.abs(Number(a.y) - Number(b.y)) > LEVEL_TOLERANCE) return null;
  const A = bounds(a), B = bounds(b);
  const minX = Math.max(A.minX, B.minX), maxX = Math.min(A.maxX, B.maxX);
  const minZ = Math.max(A.minZ, B.minZ), maxZ = Math.min(A.maxZ, B.maxZ);
  if (!(maxX > minX + epsilon) || !(maxZ > minZ + epsilon)) return null;
  return Object.freeze({ x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, hx: (maxX - minX) * 0.5, hz: (maxZ - minZ) * 0.5 });
}

function usableSurfaceUnion(intersection) {
  if (!intersection) return false;
  const sx = Number(intersection.hx) * 2;
  const sz = Number(intersection.hz) * 2;
  return Math.min(sx, sz) >= MIN_UNION_DEPTH - EPS && Math.max(sx, sz) >= MIN_UNION_WIDTH - EPS;
}

function separatedRelation(a, b) {
  const A = bounds(a), B = bounds(b);
  const zOverlap = overlapAmount(A.minZ, A.maxZ, B.minZ, B.maxZ);
  const xOverlap = overlapAmount(A.minX, A.maxX, B.minX, B.maxX);
  const candidates = [];
  if (zOverlap > 0.68) {
    if (A.maxX <= B.minX + EPS) candidates.push({ axis: 'x', gap: Math.max(0, B.minX - A.maxX), aEdge: A.maxX, bEdge: B.minX, crossLo: Math.max(A.minZ, B.minZ), crossHi: Math.min(A.maxZ, B.maxZ) });
    else if (B.maxX <= A.minX + EPS) candidates.push({ axis: 'x', gap: Math.max(0, A.minX - B.maxX), aEdge: A.minX, bEdge: B.maxX, crossLo: Math.max(A.minZ, B.minZ), crossHi: Math.min(A.maxZ, B.maxZ) });
  }
  if (xOverlap > 0.68) {
    if (A.maxZ <= B.minZ + EPS) candidates.push({ axis: 'z', gap: Math.max(0, B.minZ - A.maxZ), aEdge: A.maxZ, bEdge: B.minZ, crossLo: Math.max(A.minX, B.minX), crossHi: Math.min(A.maxX, B.maxX) });
    else if (B.maxZ <= A.minZ + EPS) candidates.push({ axis: 'z', gap: Math.max(0, A.minZ - B.maxZ), aEdge: A.minZ, bEdge: B.maxZ, crossLo: Math.max(A.minX, B.minX), crossHi: Math.min(A.maxX, B.maxX) });
  }
  candidates.sort((x, y) => x.gap - y.gap || x.axis.localeCompare(y.axis));
  return candidates[0] ?? null;
}

function surfaceApproachDepth(surface, axis) {
  return axis === 'x' ? Number(surface.hx) * 2 : Number(surface.hz) * 2;
}

function jumpRangeForRise(traversalEnvelope, rise) {
  const jump = traversalEnvelope?.jump;
  if (!jump) return 0;
  const upwardRise = Math.max(0, Number(rise) || 0);
  if (upwardRise > Number(jump.maxBidirectionalRise) + EPS) return 0;
  const v = Math.max(0, Number(jump.jumpSpeed) || 0);
  const g = Math.max(0.001, Number(jump.gravityMagnitude) || 0);
  const discriminant = v * v - 2 * g * upwardRise;
  if (discriminant < 0) return 0;
  const time = (v + Math.sqrt(discriminant)) / g;
  return Math.max(0, Number(jump.horizontalSpeed) || 0) * time * Math.max(0, Number(jump.safetyFactor) || 0);
}

export function classifyRoofCrossoverConnection(a, b, relation, { traversalEnvelope = gameplayTraversalEnvelope() } = {}) {
  if (!a || !b || !relation) return null;
  if (a.kind !== 'clear-roof-street-layer' || b.kind !== 'clear-roof-street-layer') return null;
  if (relation.gap > 0.08 + EPS) return null;
  const rise = Math.abs(Number(a.y) - Number(b.y));
  if (rise > Math.max(0, Number(traversalEnvelope.maxStep) || 0) + EPS) return null;
  const crossWidth = relation.crossHi - relation.crossLo;
  const minCrossoverWidth = Math.max(0.96, (Number(traversalEnvelope.playerRadius) || 0.22) * 2 + 0.42);
  if (crossWidth < minCrossoverWidth) return null;
  const fixedCoord = (relation.crossLo + relation.crossHi) * 0.5;
  const clearWidth = Math.min(1.45, Math.max(minCrossoverWidth, crossWidth - 0.16));
  const aPoint = Object.freeze(relation.axis === 'x' ? { x: relation.aEdge, z: fixedCoord } : { x: fixedCoord, z: relation.aEdge });
  const bPoint = Object.freeze(relation.axis === 'x' ? { x: relation.bEdge, z: fixedCoord } : { x: fixedCoord, z: relation.bEdge });
  return Object.freeze({
    kind: 'roof-crossover-link', aId: a.id, bId: b.id, axis: relation.axis,
    aEdge: relation.aEdge, bEdge: relation.bEdge, fixedCoord, gap: relation.gap, rise,
    clearWidth, halfWidth: clearWidth * 0.5, y0: a.y, y1: b.y, aPoint, bPoint,
    maxStep: Number(traversalEnvelope.maxStep) || 0, traversalAuthority: 'gameplay-controller-step-envelope',
    cost: relation.gap * 0.25 + rise * 0.5 + 0.04,
  });
}

export function classifyRoofJumpConnection(a, b, relation, { traversalEnvelope = gameplayTraversalEnvelope() } = {}) {
  if (!a || !b || !relation) return null;
  if (a.kind !== 'clear-roof-street-layer' || b.kind !== 'clear-roof-street-layer') return null;
  if (relation.gap <= 0.08 + EPS) return null;
  const rise = Math.abs(Number(a.y) - Number(b.y));
  const maxRange = jumpRangeForRise(traversalEnvelope, rise);
  if (!(maxRange > 0) || relation.gap > maxRange + EPS) return null;
  const jump = traversalEnvelope.jump;
  const minLandingDepth = Math.max(0.55, Number(jump.minLandingDepth) || 0.85);
  if (surfaceApproachDepth(a, relation.axis) < minLandingDepth || surfaceApproachDepth(b, relation.axis) < minLandingDepth) return null;
  const crossWidth = relation.crossHi - relation.crossLo;
  const minCrossoverWidth = Math.max(0.96, (Number(traversalEnvelope.playerRadius) || 0.22) * 2 + 0.42);
  if (crossWidth < minCrossoverWidth) return null;
  const fixedCoord = (relation.crossLo + relation.crossHi) * 0.5;
  const clearWidth = Math.min(1.45, Math.max(minCrossoverWidth, crossWidth - 0.16));
  const aPoint = Object.freeze(relation.axis === 'x' ? { x: relation.aEdge, z: fixedCoord } : { x: fixedCoord, z: relation.aEdge });
  const bPoint = Object.freeze(relation.axis === 'x' ? { x: relation.bEdge, z: fixedCoord } : { x: fixedCoord, z: relation.bEdge });
  return Object.freeze({
    kind: 'jump-link', aId: a.id, bId: b.id, axis: relation.axis,
    aEdge: relation.aEdge, bEdge: relation.bEdge, fixedCoord, gap: relation.gap, rise,
    clearWidth, halfWidth: clearWidth * 0.5, y0: a.y, y1: b.y, aPoint, bPoint,
    maxRange, apexHeight: Number(jump.apexHeight) || 0,
    minLandingDepth, traversalAuthority: jump.authority ?? 'gameplay-controller-ballistic-envelope',
    cost: relation.gap * 0.72 + rise * 0.55 + 0.10,
  });
}

function pathRect(axis, from, to, fixedCoord, halfWidth) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return axis === 'x'
    ? { x: (lo + hi) * 0.5, z: fixedCoord, hx: (hi - lo) * 0.5, hz: halfWidth }
    : { x: fixedCoord, z: (lo + hi) * 0.5, hx: halfWidth, hz: (hi - lo) * 0.5 };
}

function pointRect(point, half) {
  return { x: Number(point.x), z: Number(point.z), hx: half, hz: half };
}

function normalizedBlockedRects(blockedRects) {
  return [...(blockedRects ?? [])]
    .map((block, index) => ({
      id: block?.id ?? block?.landingId ?? `blocked:${index}`,
      x: Number(block?.x), z: Number(block?.z),
      hx: Number(block?.hx) + BLOCKED_CLEARANCE, hz: Number(block?.hz) + BLOCKED_CLEARANCE,
      y: Number(block?.y),
    }))
    .filter(block => [block.x, block.z, block.hx, block.hz, block.y].every(Number.isFinite)
      && block.hx > BLOCKED_CLEARANCE && block.hz > BLOCKED_CLEARANCE);
}

function candidateBlocked(candidate, blocked) {
  if (!blocked.length) return false;
  if (candidate.kind === 'surface-union') {
    const footprint = candidate.intersection;
    return blocked.some(block => Math.abs(block.y - candidate.y0) <= LEVEL_TOLERANCE && rectOverlap(block, footprint));
  }
  if (candidate.kind === 'walkway-link' || candidate.kind === 'jump-link' || candidate.kind === 'roof-crossover-link') {
    const footprint = pathRect(candidate.axis, candidate.aEdge, candidate.bEdge, candidate.fixedCoord, candidate.halfWidth);
    return blocked.some(block =>
      (Math.abs(block.y - candidate.y0) <= LEVEL_TOLERANCE || Math.abs(block.y - candidate.y1) <= LEVEL_TOLERANCE)
      && rectOverlap(block, footprint));
  }
  if (candidate.kind === 'stair-link') {
    const half = Math.max(candidate.halfWidth, 0.38);
    const lower = pointRect(candidate.lowerPoint, half);
    const upper = pointRect(candidate.upperPoint, half);
    return blocked.some(block =>
      (Math.abs(block.y - candidate.y0) <= LEVEL_TOLERANCE && rectOverlap(block, lower))
      || (Math.abs(block.y - candidate.y1) <= LEVEL_TOLERANCE && rectOverlap(block, upper)));
  }
  return false;
}

function candidateEnvelope(candidate) {
  if (candidate.kind === 'surface-union') {
    return { rect: candidate.intersection, y0: candidate.y0, y1: candidate.y1 };
  }
  if (candidate.kind === 'walkway-link' || candidate.kind === 'jump-link' || candidate.kind === 'roof-crossover-link') {
    return {
      rect: pathRect(candidate.axis, candidate.aEdge, candidate.bEdge, candidate.fixedCoord, candidate.halfWidth),
      y0: Math.min(candidate.y0, candidate.y1),
      y1: Math.max(candidate.y0, candidate.y1) + (candidate.kind === 'jump-link' ? Number(candidate.apexHeight) || 0 : 0),
    };
  }
  if (candidate.kind === 'stair-link') {
    return { rect: pathRect(candidate.axis, candidate.from, candidate.to, candidate.fixedCoord, candidate.halfWidth), y0: candidate.y0, y1: candidate.y1 };
  }
  return null;
}

function sharesSurface(a, b) {
  return a.aId === b.aId || a.aId === b.bId || a.bId === b.aId || a.bId === b.bId;
}

function linksConflict(a, b) {
  if (a.kind === 'surface-union' || b.kind === 'surface-union') return false;
  const A = candidateEnvelope(a), B = candidateEnvelope(b);
  if (!A || !B || !verticalRangesOverlap(A.y0, A.y1, B.y0, B.y1)) return false;
  if (!rectOverlap(A.rect, B.rect, 0.08)) return false;
  if (!sharesSurface(a, b)) return true;

  // Branches from one landing are allowed only when their actual junctions are
  // spatially distinct. This prevents two chosen links from occupying the same
  // rail opening/stair mouth and producing the overlapping spaghetti seen in 06B.
  const pointsFor = link => link.kind === 'walkway-link' || link.kind === 'jump-link' || link.kind === 'roof-crossover-link'
    ? [link.aPoint, link.bPoint]
    : [link.lowerPoint, link.upperPoint];
  const minGap = Math.max(0.72, Math.min(Number(a.clearWidth) || 0.72, Number(b.clearWidth) || 0.72));
  for (const pa of pointsFor(a)) for (const pb of pointsFor(b)) {
    const dx = Number(pa.x) - Number(pb.x), dz = Number(pa.z) - Number(pb.z);
    if (dx * dx + dz * dz < minGap * minGap) return true;
  }
  return false;
}

export function classifyTransportConnection(aRaw, bRaw, { maxHorizontalSpan = 8.5, maxRise = 4.8, traversalEnvelope = gameplayTraversalEnvelope() } = {}) {
  const a = normalizeTransportSurface(aRaw), b = normalizeTransportSurface(bRaw);
  if (!distinctAuthority(a, b)) return null;
  const intersection = transportSurfaceIntersection(a, b);
  const rise = Math.abs(a.y - b.y);
  if (intersection && rise <= LEVEL_TOLERANCE && usableSurfaceUnion(intersection)) {
    return Object.freeze({ kind: 'surface-union', aId: a.id, bId: b.id, intersection, y0: a.y, y1: b.y, rise: 0, cost: 0 });
  }
  const relation = separatedRelation(a, b);
  if (!relation || relation.gap > maxHorizontalSpan) return null;
  const crossWidth = relation.crossHi - relation.crossLo;
  if (!(crossWidth > 0.68)) return null;
  const roofCrossover = classifyRoofCrossoverConnection(a, b, relation, { traversalEnvelope });
  if (roofCrossover) return roofCrossover;
  const roofJump = classifyRoofJumpConnection(a, b, relation, { traversalEnvelope });
  if (roofJump) return roofJump;
  const fixedCoord = (relation.crossLo + relation.crossHi) * 0.5;
  const clearWidth = Math.min(1.20, Math.max(0.72, crossWidth - 0.12));
  if (rise <= LEVEL_TOLERANCE) {
    return Object.freeze({
      kind: 'walkway-link', aId: a.id, bId: b.id, axis: relation.axis,
      aEdge: relation.aEdge, bEdge: relation.bEdge, fixedCoord, gap: relation.gap,
      clearWidth, halfWidth: clearWidth * 0.5, y0: a.y, y1: b.y,
      aPoint: Object.freeze(relation.axis === 'x' ? { x: relation.aEdge, z: fixedCoord } : { x: fixedCoord, z: relation.aEdge }),
      bPoint: Object.freeze(relation.axis === 'x' ? { x: relation.bEdge, z: fixedCoord } : { x: fixedCoord, z: relation.bEdge }),
      cost: relation.gap + 0.35,
    });
  }
  if (rise > maxRise) return null;
  const lower = a.y <= b.y ? a : b;
  const upper = lower === a ? b : a;
  const truth = lower.physicalTruth ?? upper.physicalTruth;
  if (!truth?.stair) return null;
  const lowerEdge = lower === a ? relation.aEdge : relation.bEdge;
  const upperEdge = upper === a ? relation.aEdge : relation.bEdge;
  const stairFlight = deriveStairFlight({
    rise,
    truth,
    stableKey: `transport:${lower.id}->${upper.id}`,
    availableRun: Math.abs(upperEdge - lowerEdge),
  });
  if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
  return Object.freeze({
    kind: 'stair-link', aId: a.id, bId: b.id,
    lowerId: lower.id, upperId: upper.id,
    axis: relation.axis,
    from: lowerEdge, to: upperEdge, fixedCoord,
    gap: Math.abs(upperEdge - lowerEdge), clearWidth,
    halfWidth: clearWidth * 0.5,
    y0: lower.y, y1: upper.y, rise,
    lowerPoint: Object.freeze(relation.axis === 'x' ? { x: lowerEdge, z: fixedCoord } : { x: fixedCoord, z: lowerEdge }),
    upperPoint: Object.freeze(relation.axis === 'x' ? { x: upperEdge, z: fixedCoord } : { x: fixedCoord, z: upperEdge }),
    stairFlight, physicalTruth: truth,
    cost: Math.abs(upperEdge - lowerEdge) + rise * 0.72,
  });
}

export function planExteriorTransportNetwork({
  surfaces = [],
  blockedRects = [],
  maxLinks = 8,
  maxStairLinks = 5,
  maxJumpLinks = 6,
  stableKey = 'transport-network',
  traversalEnvelope = gameplayTraversalEnvelope(),
} = {}) {
  const normalized = surfaces.map(normalizeTransportSurface);
  const blocked = normalizedBlockedRects(blockedRects);
  const byId = new Map(normalized.map(surface => [surface.id, surface]));
  const parent = new Map(normalized.map(surface => [surface.id, surface.id]));
  const reachable = new Set(normalized.filter(surface => surface.reachable !== false).map(surface => surface.id));
  const find = id => {
    let root = parent.get(id);
    while (root && root !== parent.get(root)) root = parent.get(root);
    let cursor = id;
    while (parent.get(cursor) && parent.get(cursor) !== root) {
      const next = parent.get(cursor); parent.set(cursor, root); cursor = next;
    }
    return root ?? id;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (networkKey(normalized[i]) === networkKey(normalized[j])) union(normalized[i].id, normalized[j].id);
    }
  }

  const candidates = [];
  let blockedCandidateCount = 0;
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const relation = classifyTransportConnection(normalized[i], normalized[j], { traversalEnvelope });
      if (!relation) continue;
      if (candidateBlocked(relation, blocked)) {
        blockedCandidateCount++;
        continue;
      }
      candidates.push({
        ...relation,
        tie: stableHash(`${stableKey}:${normalized[i].id}:${normalized[j].id}:${relation.kind}`),
      });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.tie - b.tie || `${a.aId}:${a.bId}`.localeCompare(`${b.aId}:${b.bId}`));

  const links = [];
  let stairLinks = 0;
  let jumpLinks = 0;
  let overlapRejectedCount = 0;
  for (const candidate of candidates) {
    if (links.length >= maxLinks) break;
    if (find(candidate.aId) === find(candidate.bId)) continue;
    if (candidate.kind === 'stair-link' && stairLinks >= maxStairLinks) continue;
    if (candidate.kind === 'jump-link' && jumpLinks >= maxJumpLinks) continue;
    if (links.some(link => linksConflict(candidate, link))) {
      overlapRejectedCount++;
      continue;
    }
    const a = byId.get(candidate.aId), b = byId.get(candidate.bId);
    const aReachable = reachable.has(a.id);
    const bReachable = reachable.has(b.id);
    if (!aReachable && !bReachable) continue;
    links.push(Object.freeze({ ...candidate, id: `transport-link:${links.length}:${candidate.aId}:${candidate.bId}` }));
    union(candidate.aId, candidate.bId);
    if (candidate.kind === 'stair-link') stairLinks++;
    if (candidate.kind === 'jump-link') jumpLinks++;
    if (!aReachable) reachable.add(a.id);
    if (!bReachable) reachable.add(b.id);
  }
  return Object.freeze({
    schema: EXTERIOR_TRANSPORT_NETWORK_SCHEMA,
    surfaces: Object.freeze(normalized),
    links: Object.freeze(links),
    reachableSurfaceIds: Object.freeze([...reachable].sort((a, b) => a.localeCompare(b))),
    rejectionCounts: Object.freeze({ blocked: blockedCandidateCount, overlapping: overlapRejectedCount }),
    linkCounts: Object.freeze({
      union: links.filter(link => link.kind === 'surface-union').length,
      walkway: links.filter(link => link.kind === 'walkway-link').length,
      stair: links.filter(link => link.kind === 'stair-link').length,
      crossover: links.filter(link => link.kind === 'roof-crossover-link').length,
      jump: links.filter(link => link.kind === 'jump-link').length,
    }),
  });
}
