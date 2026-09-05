export const FACADE_ROUTE_GALLERY_SCHEMA = 'jweb.facade-route-gallery.v2';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }

function mergeIntervals(intervals) {
  const sorted = intervals.filter(i => i && i.hi > i.lo).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const out = [];
  for (const interval of sorted) {
    const last = out.at(-1);
    if (!last || interval.lo > last.hi + 0.08) out.push({ ...interval });
    else last.hi = Math.max(last.hi, interval.hi);
  }
  return out;
}
function intervalCoverage(intervals, lo, hi) {
  return mergeIntervals(intervals.map(interval => ({ lo: Math.max(lo, interval.lo), hi: Math.min(hi, interval.hi) })))
    .filter(interval => interval.hi > interval.lo);
}
function inIntervals(value, intervals, pad = 0) {
  return intervals.some(interval => value >= interval.lo - pad && value <= interval.hi + pad);
}
function inClearance(value, clearances) {
  return clearances.some(clearance => Math.abs(value - clearance.center) <= clearance.half);
}

function diagonalNormalBrace({ side, tangent, outerCoord, faceCoord, y, anchorY, thickness, metadata }) {
  const horizontalFace = side === 'north' || side === 'south';
  const dn = faceCoord - outerCoord;
  const dy = anchorY - y;
  const length = Math.hypot(dn, dy);
  const angle = Math.atan2(dy, dn || 1e-9);
  const midN = (outerCoord + faceCoord) * 0.5;
  const midY = (y + anchorY) * 0.5;
  if (horizontalFace) {
    return { x: tangent, y: midY, z: midN, sx: thickness, sy: thickness, sz: length, rx: -angle, ...metadata };
  }
  return { x: midN, y: midY, z: tangent, sx: length, sy: thickness, sz: thickness, rz: angle, ...metadata };
}

function resolvedHostFace({ side, module, hostBounds }) {
  const cx = finite(module.cx, NaN), cz = finite(module.cz, NaN);
  const halfX = finite(module.halfX, NaN), halfZ = finite(module.halfZ, NaN);
  if (![cx, cz, halfX, halfZ].every(Number.isFinite)) return null;
  const horizontalFace = side === 'north' || side === 'south';
  const moduleFace = horizontalFace
    ? cz + (side === 'north' ? -halfZ : halfZ)
    : cx + (side === 'west' ? -halfX : halfX);
  const fallback = horizontalFace
    ? { tangentLo: cx - halfX, tangentHi: cx + halfX, faceCoord: moduleFace, compound: false }
    : { tangentLo: cz - halfZ, tangentHi: cz + halfZ, faceCoord: moduleFace, compound: false };
  if (!hostBounds) return fallback;
  const minX = finite(hostBounds.minX, NaN), maxX = finite(hostBounds.maxX, NaN);
  const minZ = finite(hostBounds.minZ, NaN), maxZ = finite(hostBounds.maxZ, NaN);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return fallback;
  const hostFace = side === 'north' ? minZ : side === 'south' ? maxZ : side === 'west' ? minX : maxX;
  // Only promote to the full compound face when this endpoint really sits on that
  // outer boundary. An indented courtyard face should remain a local gallery.
  if (Math.abs(hostFace - moduleFace) > 0.55) return fallback;
  return horizontalFace
    ? { tangentLo: minX, tangentHi: maxX, faceCoord: hostFace, compound: true }
    : { tangentLo: minZ, tangentHi: maxZ, faceCoord: hostFace, compound: true };
}

function hugIntervalsForFace({ side, faceCoord, footprintModules, tangentLo, tangentHi }) {
  const horizontalFace = side === 'north' || side === 'south';
  const out = [];
  for (const module of footprintModules ?? []) {
    const cx = finite(module.cx, NaN), cz = finite(module.cz, NaN), halfX = finite(module.halfX, NaN), halfZ = finite(module.halfZ, NaN);
    if (![cx, cz, halfX, halfZ].every(Number.isFinite)) continue;
    const moduleFace = horizontalFace
      ? cz + (side === 'north' ? -halfZ : halfZ)
      : cx + (side === 'west' ? -halfX : halfX);
    if (Math.abs(moduleFace - faceCoord) > 0.62) continue;
    const lo = horizontalFace ? cx - halfX : cz - halfZ;
    const hi = horizontalFace ? cx + halfX : cz + halfZ;
    out.push({ lo: Math.max(tangentLo, lo), hi: Math.min(tangentHi, hi) });
  }
  return intervalCoverage(out, tangentLo, tangentHi);
}

/**
 * Plans one segment of a district-scale exterior thoroughfare. Strong routes use
 * the whole available compound face, slightly overlapping corners so adjacent
 * face segments can union into a wrap. Unsupported gaps are allowed but are kept
 * explicit and braces attach only where real building mass exists.
 */
export function planFacadeRouteGallery({
  id = 'gallery', routeId = null, endpoint = null, module = null, field = 'ceiling',
  width = 3.0, widthClass = 'sky-street', floorHeight = 3.15, stableKey = id,
  hostBounds = null, footprintModules = null, routeStrength = 0.7, routeSpan = 0,
  crossingWidth = null, junctionTangents = [],
} = {}) {
  if (!endpoint?.resolved || !module || !['north', 'south', 'west', 'east'].includes(endpoint.side)) return null;
  const y = finite(endpoint.y, NaN);
  if (!Number.isFinite(y)) return null;

  const side = endpoint.side;
  const horizontalFace = side === 'north' || side === 'south';
  const face = resolvedHostFace({ side, module, hostBounds });
  if (!face) return null;
  const faceCenter = (face.tangentLo + face.tangentHi) * 0.5;
  const faceLength = face.tangentHi - face.tangentLo;
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  const w = clamp(width, 1.65, 4.8);
  const strength = clamp(routeStrength, 0, 1);
  const portalTangent = finite(endpoint.tangent, faceCenter);
  const minLength = Math.max(finite(endpoint.width, 1.35) + 2.2, w * 1.7);
  const cornerOverlap = face.compound && strength >= 0.48 ? Math.min(1.35, 0.34 * w + strength * 0.35) : 0.12;
  const maximumLength = Math.max(minLength, 24 + Math.min(12, finite(routeSpan, 0) * 0.08));
  const desiredLength = Math.min(maximumLength, Math.max(minLength, faceLength + cornerOverlap * 2));
  const usableLo = face.tangentLo - cornerOverlap;
  const usableHi = face.tangentHi + cornerOverlap;
  const centerMin = usableLo + desiredLength * 0.5;
  const centerMax = usableHi - desiredLength * 0.5;
  const galleryTangent = centerMax >= centerMin ? clamp(portalTangent, centerMin, centerMax) : faceCenter;
  const length = Math.min(usableHi - usableLo, desiredLength);
  if (!(length > finite(endpoint.width, 1.35) + 0.5)) return null;
  const lo = galleryTangent - length * 0.5;
  const hi = galleryTangent + length * 0.5;

  const normalGap = 0.07;
  const normalCenter = face.faceCoord + outward * (normalGap + w * 0.5);
  const outerCoord = face.faceCoord + outward * (normalGap + w);
  const innerCoord = face.faceCoord + outward * normalGap;
  const hash = stableHash(`${stableKey}:${routeId ?? ''}:${id}:${side}`);
  const supportMode = field === 'ceiling' || unit(hash, 3) < 0.64 ? 'hung-from-above' : 'braced-from-below';
  const supportRise = supportMode === 'hung-from-above'
    ? Math.max(2.2, Math.min(4.4, finite(floorHeight, 3.15) * (0.82 + unit(hash, 9) * 0.30)))
    : -Math.max(1.7, Math.min(3.4, finite(floorHeight, 3.15) * (0.58 + unit(hash, 11) * 0.24)));
  const anchorY = y + supportRise;
  const beamT = widthClass === 'sky-street' ? 0.22 : 0.16;
  const girderH = widthClass === 'sky-street' ? 0.54 : 0.38;
  const metadata = {
    facadeRouteGallery: true, galleryId: id, cityRouteId: routeId, widthClass,
    supportMode, architectureRole: 'facade-lateral-throughput', traversalAuthority: 'canonical-transport-slab',
  };

  const actualFootprints = (footprintModules?.length ? footprintModules : [module]);
  const hugged = hugIntervalsForFace({ side, faceCoord: face.faceCoord, footprintModules: actualFootprints, tangentLo: lo, tangentHi: hi });
  const huggedLength = hugged.reduce((sum, interval) => sum + Math.max(0, interval.hi - interval.lo), 0);
  const unsupportedLength = Math.max(0, length - huggedLength);
  const hugCoverage = length > 0 ? huggedLength / length : 0;
  const crossingHalf = Math.max(0.78, finite(crossingWidth, finite(endpoint.width, 1.35)) * 0.62);
  const clearanceCenters = [portalTangent, ...(junctionTangents ?? []).map(Number).filter(Number.isFinite)];
  const clearances = clearanceCenters.map(center => ({ center, half: crossingHalf + 0.35 }));

  const metal = [];
  const supports = [];
  const addLongBeam = normal => {
    if (horizontalFace) metal.push({ x: galleryTangent, y: y - 0.30, z: normal, sx: length, sy: girderH, sz: beamT, ...metadata, architectureRole: 'gallery-longitudinal-girder', junctionYield: false });
    else metal.push({ x: normal, y: y - 0.30, z: galleryTangent, sx: beamT, sy: girderH, sz: length, ...metadata, architectureRole: 'gallery-longitudinal-girder', junctionYield: false });
  };
  addLongBeam(innerCoord + outward * beamT * 0.5);
  addLongBeam(outerCoord - outward * beamT * 0.5);

  const bays = Math.max(2, Math.ceil(length / (widthClass === 'sky-street' ? 3.35 : 4.0)));
  for (let i = 0; i <= bays; i++) {
    const tangent = lo + length * (i / bays);
    if (horizontalFace) metal.push({ x: tangent, y: y - 0.22, z: normalCenter, sx: beamT, sy: beamT, sz: w + 0.12, ...metadata, architectureRole: 'gallery-crossbeam', junctionYield: false });
    else metal.push({ x: normalCenter, y: y - 0.22, z: tangent, sx: w + 0.12, sy: beamT, sz: beamT, ...metadata, architectureRole: 'gallery-crossbeam', junctionYield: false });
    // Structure attaches only where the route actually hugs building mass, and
    // never through a bridge/gallery intersection or doorway approach.
    if ((i === 0 || i === bays || i % 2 === 0) && inIntervals(tangent, hugged, 0.16) && !inClearance(tangent, clearances)) {
      supports.push(diagonalNormalBrace({
        side, tangent, outerCoord: outerCoord - outward * 0.05, faceCoord: face.faceCoord + outward * 0.03,
        y: y - 0.28, anchorY, thickness: beamT * 0.84,
        metadata: { ...metadata, architectureRole: supportMode === 'hung-from-above' ? 'upper-suspension-brace' : 'lower-knee-brace', junctionYield: true },
      }));
      if (horizontalFace) supports.push({ x: tangent, y: anchorY, z: face.faceCoord + outward * 0.04, sx: beamT * 1.35, sy: beamT * 1.35, sz: beamT * 1.9, ...metadata, architectureRole: 'wall-anchor', junctionYield: true });
      else supports.push({ x: face.faceCoord + outward * 0.04, y: anchorY, z: tangent, sx: beamT * 1.9, sy: beamT * 1.35, sz: beamT * 1.35, ...metadata, architectureRole: 'wall-anchor', junctionYield: true });
    }
  }

  const surface = horizontalFace
    ? { x: galleryTangent, z: normalCenter, hx: length * 0.5, hz: w * 0.5, y }
    : { x: normalCenter, z: galleryTangent, hx: w * 0.5, hz: length * 0.5, y };
  return Object.freeze({
    schema: FACADE_ROUTE_GALLERY_SCHEMA,
    id, routeId, field, side, widthClass, width: w, length, supportMode,
    routeStrength: strength, routeSpan: finite(routeSpan, 0),
    compoundFace: face.compound,
    cornerOverlap,
    huggedLength,
    unsupportedLength,
    hugCoverage,
    surface: Object.freeze(surface),
    outerEdge: Object.freeze(horizontalFace
      ? { x1: galleryTangent - length * 0.5, z1: outerCoord, x2: galleryTangent + length * 0.5, z2: outerCoord }
      : { x1: outerCoord, z1: galleryTangent - length * 0.5, x2: outerCoord, z2: galleryTangent + length * 0.5 }),
    endEdges: Object.freeze(horizontalFace
      ? [
          Object.freeze({ x1: galleryTangent - length * 0.5, z1: innerCoord, x2: galleryTangent - length * 0.5, z2: outerCoord }),
          Object.freeze({ x1: galleryTangent + length * 0.5, z1: innerCoord, x2: galleryTangent + length * 0.5, z2: outerCoord }),
        ]
      : [
          Object.freeze({ x1: innerCoord, z1: galleryTangent - length * 0.5, x2: outerCoord, z2: galleryTangent - length * 0.5 }),
          Object.freeze({ x1: innerCoord, z1: galleryTangent + length * 0.5, x2: outerCoord, z2: galleryTangent + length * 0.5 }),
        ]),
    junctionClearances: Object.freeze(clearances.map(item => Object.freeze(item))),
    metal: Object.freeze(metal), supports: Object.freeze(supports),
    invariant: 'major gallery is a long compound-scale thoroughfare; it hugs real mass where possible, permits short exposed continuation, and keeps intersections free of decorative structure',
  });
}
