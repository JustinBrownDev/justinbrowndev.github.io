export const FACADE_ROUTE_GALLERY_SCHEMA = 'jweb.facade-route-gallery.v1';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }

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

/**
 * Plans an exterior, facade-running circulation gallery around an already-resolved
 * city exchange. This is deliberately not a point-to-point bridge: its long axis
 * is tangent to the host building face and the bridge/catwalk joins it normally.
 */
export function planFacadeRouteGallery({
  id = 'gallery', routeId = null, endpoint = null, module = null, field = 'ceiling',
  width = 3.0, widthClass = 'sky-street', floorHeight = 3.15, stableKey = id,
} = {}) {
  if (!endpoint?.resolved || !module || !['north', 'south', 'west', 'east'].includes(endpoint.side)) return null;
  const cx = finite(module.cx, NaN), cz = finite(module.cz, NaN);
  const halfX = finite(module.halfX, NaN), halfZ = finite(module.halfZ, NaN);
  const y = finite(endpoint.y, NaN);
  if (![cx, cz, halfX, halfZ, y].every(Number.isFinite) || halfX <= 0 || halfZ <= 0) return null;

  const side = endpoint.side;
  const horizontalFace = side === 'north' || side === 'south';
  const tangentCenter = horizontalFace ? cx : cz;
  const tangentHalf = horizontalFace ? halfX : halfZ;
  const faceCoord = horizontalFace
    ? cz + (side === 'north' ? -halfZ : halfZ)
    : cx + (side === 'west' ? -halfX : halfX);
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  const w = clamp(width, 1.8, 4.8);
  const portalTangent = finite(endpoint.tangent, tangentCenter);
  const faceLength = tangentHalf * 2;
  const minLength = Math.max(finite(endpoint.width, 1.35) + 2.2, w * 1.7);
  const desiredLength = Math.min(Math.max(minLength, faceLength * 0.86), Math.max(minLength, 15.5));
  const length = Math.min(faceLength - 0.22, desiredLength);
  if (!(length > finite(endpoint.width, 1.35) + 0.5)) return null;
  const centerMin = tangentCenter - tangentHalf + length * 0.5 + 0.11;
  const centerMax = tangentCenter + tangentHalf - length * 0.5 - 0.11;
  const galleryTangent = centerMax >= centerMin
    ? clamp(portalTangent, centerMin, centerMax)
    : tangentCenter;
  const normalGap = 0.07;
  const normalCenter = faceCoord + outward * (normalGap + w * 0.5);
  const outerCoord = faceCoord + outward * (normalGap + w);
  const innerCoord = faceCoord + outward * normalGap;
  const hash = stableHash(`${stableKey}:${routeId ?? ''}:${id}:${side}`);
  const supportMode = field === 'ceiling' || unit(hash, 3) < 0.64 ? 'hung-from-above' : 'braced-from-below';
  const supportRise = supportMode === 'hung-from-above'
    ? Math.max(2.2, Math.min(4.2, finite(floorHeight, 3.15) * (0.82 + unit(hash, 9) * 0.28)))
    : -Math.max(1.7, Math.min(3.2, finite(floorHeight, 3.15) * (0.58 + unit(hash, 11) * 0.22)));
  const anchorY = y + supportRise;
  const beamT = widthClass === 'sky-street' ? 0.22 : 0.16;
  const girderH = widthClass === 'sky-street' ? 0.54 : 0.38;
  const metadata = {
    facadeRouteGallery: true, galleryId: id, cityRouteId: routeId, widthClass,
    supportMode, architectureRole: 'facade-lateral-throughput', traversalAuthority: 'canonical-transport-slab',
  };
  const metal = [];
  const supports = [];
  const addLongBeam = normal => {
    if (horizontalFace) metal.push({ x: galleryTangent, y: y - 0.30, z: normal, sx: length, sy: girderH, sz: beamT, ...metadata });
    else metal.push({ x: normal, y: y - 0.30, z: galleryTangent, sx: beamT, sy: girderH, sz: length, ...metadata });
  };
  addLongBeam(innerCoord + outward * beamT * 0.5);
  addLongBeam(outerCoord - outward * beamT * 0.5);

  const bays = Math.max(2, Math.ceil(length / (widthClass === 'sky-street' ? 3.4 : 4.1)));
  const lo = galleryTangent - length * 0.5;
  for (let i = 0; i <= bays; i++) {
    const tangent = lo + length * (i / bays);
    if (horizontalFace) metal.push({ x: tangent, y: y - 0.22, z: normalCenter, sx: beamT, sy: beamT, sz: w + 0.12, ...metadata, architectureRole: 'gallery-crossbeam' });
    else metal.push({ x: normalCenter, y: y - 0.22, z: tangent, sx: w + 0.12, sy: beamT, sz: beamT, ...metadata, architectureRole: 'gallery-crossbeam' });
    if (i === 0 || i === bays || i % 2 === 0) {
      supports.push(diagonalNormalBrace({
        side, tangent, outerCoord: outerCoord - outward * 0.05, faceCoord: faceCoord + outward * 0.03,
        y: y - 0.28, anchorY, thickness: beamT * 0.84,
        metadata: { ...metadata, architectureRole: supportMode === 'hung-from-above' ? 'upper-suspension-brace' : 'lower-knee-brace' },
      }));
      // A short wall anchor makes the brace visibly terminate in building structure.
      if (horizontalFace) supports.push({ x: tangent, y: anchorY, z: faceCoord + outward * 0.04, sx: beamT * 1.35, sy: beamT * 1.35, sz: beamT * 1.9, ...metadata, architectureRole: 'wall-anchor' });
      else supports.push({ x: faceCoord + outward * 0.04, y: anchorY, z: tangent, sx: beamT * 1.9, sy: beamT * 1.35, sz: beamT * 1.35, ...metadata, architectureRole: 'wall-anchor' });
    }
  }

  const surface = horizontalFace
    ? { x: galleryTangent, z: normalCenter, hx: length * 0.5, hz: w * 0.5, y }
    : { x: normalCenter, z: galleryTangent, hx: w * 0.5, hz: length * 0.5, y };
  return Object.freeze({
    schema: FACADE_ROUTE_GALLERY_SCHEMA,
    id, routeId, field, side, widthClass, width: w, length, supportMode,
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
    metal: Object.freeze(metal), supports: Object.freeze(supports),
    invariant: 'fat hanging route runs laterally along the facade; cross-gap bridge joins it as a separate exterior connector',
  });
}
