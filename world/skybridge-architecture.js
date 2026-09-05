export const SKYBRIDGE_ARCHITECTURE_SCHEMA = 'jweb.skybridge-architecture.v1';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function pushBox(list, raw, metadata) { list.push({ ...raw, ...metadata }); }
function spanTransform(axis, along, y, fixed, length, thickness, vertical, metadata, rotation = 0) {
  if (axis === 'x') return { x: along, y, z: fixed, sx: length, sy: thickness, sz: vertical, rz: rotation, ...metadata };
  return { x: fixed, y, z: along, sx: vertical, sy: thickness, sz: length, rx: -rotation, ...metadata };
}
function diagonalBetween(axis, a, b, fixed, thickness, metadata) {
  const da = b.along - a.along;
  const dy = b.y - a.y;
  const length = Math.hypot(da, dy);
  const angle = Math.atan2(dy, da || 1e-9);
  const along = (a.along + b.along) * 0.5;
  const y = (a.y + b.y) * 0.5;
  return spanTransform(axis, along, y, fixed, length, thickness, thickness, metadata, angle);
}

/**
 * Visual-only bridge superstructure.  Nothing returned here is walkable or
 * collidable: the canonical transport slab, guardrails and semantic connector
 * remain the sole traversal authority.
 */
export function planSkybridgeArchitecture({
  id = 'bridge', axis = 'x', from = 0, to = 1, fixedCoord = 0, y = 0, width = 1,
  family = 'simple-guarded', widthClass = 'local', stableKey = null,
} = {}) {
  const start = finite(from), end = finite(to);
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const span = hi - lo;
  const w = Math.max(0.75, finite(width, 1));
  if (!(span > 0.25)) return Object.freeze({ schema: SKYBRIDGE_ARCHITECTURE_SCHEMA, family, metal: Object.freeze([]), concrete: Object.freeze([]), parts: 0 });
  const hash = stableHash(`${stableKey ?? id}:${family}:${axis}`);
  const metal = [], concrete = [];
  const metadata = { bridgeId: id, bridgeArchitecture: true, architectureFamily: family, widthClass };
  const edgeA = fixedCoord - w * 0.5;
  const edgeB = fixedCoord + w * 0.5;
  const center = (lo + hi) * 0.5;
  const beamT = widthClass === 'sky-street' ? 0.18 : widthClass === 'collector' ? 0.14 : 0.10;
  const girderH = widthClass === 'sky-street' ? 0.46 : widthClass === 'collector' ? 0.34 : 0.24;

  const sideBeam = (fixed, yy, thickness = beamT, height = girderH) => {
    if (axis === 'x') pushBox(metal, { x: center, y: yy, z: fixed, sx: span, sy: height, sz: thickness }, metadata);
    else pushBox(metal, { x: fixed, y: yy, z: center, sx: thickness, sy: height, sz: span }, metadata);
  };
  const crossBeam = (along, yy, thickness = beamT, depth = w + 0.18) => {
    if (axis === 'x') pushBox(metal, { x: along, y: yy, z: fixedCoord, sx: thickness, sy: thickness, sz: depth }, metadata);
    else pushBox(metal, { x: fixedCoord, y: yy, z: along, sx: depth, sy: thickness, sz: thickness }, metadata);
  };

  if (family === 'simple-guarded') {
    sideBeam(edgeA, y - 0.18);
    sideBeam(edgeB, y - 0.18);
  } else if (family === 'heavy-beam') {
    sideBeam(edgeA + beamT * 0.5, y - 0.34, beamT * 1.35, girderH * 1.55);
    sideBeam(edgeB - beamT * 0.5, y - 0.34, beamT * 1.35, girderH * 1.55);
    const bays = Math.max(2, Math.ceil(span / 3.8));
    for (let i = 0; i <= bays; i++) crossBeam(lo + span * (i / bays), y - 0.28, beamT * 1.05);
  } else if (family === 'utility-frame' || family === 'covered-gallery') {
    const bays = Math.max(2, Math.ceil(span / (family === 'covered-gallery' ? 3.2 : 4.0)));
    const topY = y + (widthClass === 'sky-street' ? 2.75 : 2.35);
    for (let i = 0; i <= bays; i++) {
      const along = lo + span * (i / bays);
      for (const fixed of [edgeA, edgeB]) {
        if (axis === 'x') pushBox(metal, { x: along, y: (y + topY) * 0.5, z: fixed, sx: beamT, sy: topY - y, sz: beamT }, metadata);
        else pushBox(metal, { x: fixed, y: (y + topY) * 0.5, z: along, sx: beamT, sy: topY - y, sz: beamT }, metadata);
      }
      crossBeam(along, topY, beamT, w + 0.24);
    }
    sideBeam(edgeA, y - 0.18);
    sideBeam(edgeB, y - 0.18);
    if (family === 'covered-gallery') {
      const roofT = 0.10;
      if (axis === 'x') pushBox(metal, { x: center, y: topY + roofT * 0.5, z: fixedCoord, sx: span, sy: roofT, sz: w + 0.46 }, metadata);
      else pushBox(metal, { x: fixedCoord, y: topY + roofT * 0.5, z: center, sx: w + 0.46, sy: roofT, sz: span }, metadata);
    }
  } else if (family === 'pony-truss' || family === 'through-truss') {
    const trussTop = y + (family === 'through-truss' ? 2.65 : 1.48);
    const bays = Math.max(3, Math.ceil(span / 3.1));
    const bay = span / bays;
    for (const fixed of [edgeA, edgeB]) {
      sideBeam(fixed, y - 0.18);
      sideBeam(fixed, trussTop, beamT, beamT);
      for (let i = 0; i <= bays; i++) {
        const along = lo + bay * i;
        if (axis === 'x') pushBox(metal, { x: along, y: (y + trussTop) * 0.5, z: fixed, sx: beamT, sy: trussTop - y, sz: beamT }, metadata);
        else pushBox(metal, { x: fixed, y: (y + trussTop) * 0.5, z: along, sx: beamT, sy: trussTop - y, sz: beamT }, metadata);
        if (i < bays) {
          const a = { along, y: i % 2 === 0 ? y + 0.08 : trussTop - 0.08 };
          const b = { along: along + bay, y: i % 2 === 0 ? trussTop - 0.08 : y + 0.08 };
          pushBox(metal, diagonalBetween(axis, a, b, fixed, beamT * 0.78, metadata), {});
        }
      }
    }
    if (family === 'through-truss') {
      for (let i = 0; i <= bays; i += 2) crossBeam(lo + bay * i, trussTop, beamT, w + 0.16);
    }
  } else if (family === 'underslung-arch') {
    sideBeam(edgeA, y - 0.14);
    sideBeam(edgeB, y - 0.14);
    const segments = Math.max(8, Math.ceil(span / 2.5));
    const archDepth = clamp(span * 0.14, 1.2, widthClass === 'sky-street' ? 3.4 : 2.6);
    for (const fixed of [edgeA, edgeB]) {
      let prev = null;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const along = lo + span * t;
        const yy = y - 0.32 - Math.sin(Math.PI * t) * archDepth;
        const point = { along, y: yy };
        if (prev) pushBox(metal, diagonalBetween(axis, prev, point, fixed, beamT * 1.05, metadata), {});
        if (i > 0 && i < segments && i % 2 === 0) {
          const hangerTop = y - 0.08;
          const h = hangerTop - yy;
          if (axis === 'x') pushBox(metal, { x: along, y: yy + h * 0.5, z: fixed, sx: beamT * 0.72, sy: h, sz: beamT * 0.72 }, metadata);
          else pushBox(metal, { x: fixed, y: yy + h * 0.5, z: along, sx: beamT * 0.72, sy: h, sz: beamT * 0.72 }, metadata);
        }
        prev = point;
      }
    }
  } else {
    sideBeam(edgeA, y - 0.18);
    sideBeam(edgeB, y - 0.18);
  }

  if (widthClass === 'sky-street') {
    const portalFrameInset = Math.min(1.0, span * 0.10);
    const frameY = y + 1.45;
    for (const along of [lo + portalFrameInset, hi - portalFrameInset]) {
      for (const fixed of [edgeA, edgeB]) {
        if (axis === 'x') pushBox(concrete, { x: along, y: frameY, z: fixed, sx: 0.28, sy: 2.9, sz: 0.28 }, metadata);
        else pushBox(concrete, { x: fixed, y: frameY, z: along, sx: 0.28, sy: 2.9, sz: 0.28 }, metadata);
      }
      crossBeam(along, y + 2.85, 0.22, w + 0.28);
    }
  }

  // A little deterministic asymmetry keeps repeated families from reading as one
  // prefab asset without turning the structure into random noise.
  if (unit(hash, 12) < 0.45 && span > 6) {
    const along = lo + span * (0.28 + unit(hash ^ 0x9e3779b9, 2) * 0.44);
    crossBeam(along, y - 0.48, beamT * 1.15, w + 0.50);
  }

  return Object.freeze({
    schema: SKYBRIDGE_ARCHITECTURE_SCHEMA,
    family,
    widthClass,
    span,
    width: w,
    metal: Object.freeze(metal),
    concrete: Object.freeze(concrete),
    parts: metal.length + concrete.length,
    traversalAuthority: 'canonical-transport-slab-unchanged',
  });
}
