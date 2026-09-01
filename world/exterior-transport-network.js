import { deriveStairFlight } from './physical-truth.js';

export const EXTERIOR_TRANSPORT_NETWORK_SCHEMA = 'jweb.exterior-transport-network.v1';
const EPS = 1e-6;

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
  if (!a || !b || Math.abs(Number(a.y) - Number(b.y)) > 0.12) return null;
  const A = bounds(a), B = bounds(b);
  const minX = Math.max(A.minX, B.minX), maxX = Math.min(A.maxX, B.maxX);
  const minZ = Math.max(A.minZ, B.minZ), maxZ = Math.min(A.maxZ, B.maxZ);
  if (!(maxX > minX + epsilon) || !(maxZ > minZ + epsilon)) return null;
  return Object.freeze({ x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, hx: (maxX - minX) * 0.5, hz: (maxZ - minZ) * 0.5 });
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

export function classifyTransportConnection(aRaw, bRaw, { maxHorizontalSpan = 8.5, maxRise = 4.8 } = {}) {
  const a = normalizeTransportSurface(aRaw), b = normalizeTransportSurface(bRaw);
  if (!distinctAuthority(a, b)) return null;
  const intersection = transportSurfaceIntersection(a, b);
  const rise = Math.abs(a.y - b.y);
  if (intersection && rise <= 0.12) {
    return Object.freeze({ kind: 'surface-union', aId: a.id, bId: b.id, intersection, rise: 0, cost: 0 });
  }
  const relation = separatedRelation(a, b);
  if (!relation || relation.gap > maxHorizontalSpan) return null;
  const crossWidth = relation.crossHi - relation.crossLo;
  if (!(crossWidth > 0.68)) return null;
  const fixedCoord = (relation.crossLo + relation.crossHi) * 0.5;
  const clearWidth = Math.min(1.20, Math.max(0.72, crossWidth - 0.12));
  if (rise <= 0.12) {
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
  surfaces = [], maxLinks = 8, maxStairLinks = 5, stableKey = 'transport-network',
} = {}) {
  const normalized = surfaces.map(normalizeTransportSurface);
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
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const relation = classifyTransportConnection(normalized[i], normalized[j]);
      if (!relation) continue;
      candidates.push({
        ...relation,
        tie: stableHash(`${stableKey}:${normalized[i].id}:${normalized[j].id}:${relation.kind}`),
      });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.tie - b.tie || `${a.aId}:${a.bId}`.localeCompare(`${b.aId}:${b.bId}`));
  const links = [];
  let stairLinks = 0;
  for (const candidate of candidates) {
    if (links.length >= maxLinks) break;
    if (find(candidate.aId) === find(candidate.bId)) continue;
    if (candidate.kind === 'stair-link' && stairLinks >= maxStairLinks) continue;
    const a = byId.get(candidate.aId), b = byId.get(candidate.bId);
    // At least one side must already be reachable. This promotes clear roofs into
    // the transport graph only by actually connecting them to a live street layer.
    const aReachable = reachable.has(a.id);
    const bReachable = reachable.has(b.id);
    if (!aReachable && !bReachable) continue;
    links.push(Object.freeze({ ...candidate, id: `transport-link:${links.length}:${candidate.aId}:${candidate.bId}` }));
    union(candidate.aId, candidate.bId);
    if (candidate.kind === 'stair-link') stairLinks++;
    // Propagate reachability to a roof/candidate that just became connected.
    if (!aReachable) reachable.add(a.id);
    if (!bReachable) reachable.add(b.id);
  }
  return Object.freeze({
    schema: EXTERIOR_TRANSPORT_NETWORK_SCHEMA,
    surfaces: Object.freeze(normalized),
    links: Object.freeze(links),
    linkCounts: Object.freeze({
      union: links.filter(link => link.kind === 'surface-union').length,
      walkway: links.filter(link => link.kind === 'walkway-link').length,
      stair: links.filter(link => link.kind === 'stair-link').length,
    }),
  });
}
