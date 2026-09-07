import { applyArchitectureMaterialHandwriting } from './architecture/material-handwriting.js';

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
  family = 'simple-guarded', widthClass = 'local', variant = 'skybridge', stableKey = null, supportModeHint = null,
  field = 'ground', materialFamilyHint = null, materialWeightScale = null,
  surfaceId = null, endpointClearance = null,
} = {}) {
  const start = finite(from), end = finite(to);
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const span = hi - lo;
  const w = Math.max(0.75, finite(width, 1));
  if (!(span > 0.25)) return Object.freeze({ schema: SKYBRIDGE_ARCHITECTURE_SCHEMA, family, metal: Object.freeze([]), concrete: Object.freeze([]), parts: 0 });
  const bridgeVariant = String(variant || 'skybridge');
  const hangingVariant = bridgeVariant === 'hanging-bridge';
  const hash = stableHash(`${stableKey ?? id}:${family}:${axis}${bridgeVariant === 'hanging-bridge' ? ':hanging-bridge' : ''}`);
  const metal = [], concrete = [];
  const metadata = { bridgeId: id, surfaceId, bridgeArchitecture: true, architectureFamily: family, bridgeVariant, widthClass };
  const edgeA = fixedCoord - w * 0.5;
  const edgeB = fixedCoord + w * 0.5;
  const center = (lo + hi) * 0.5;
  const beamT = widthClass === 'sky-street' ? 0.18 : widthClass === 'collector' ? 0.14 : 0.10;
  const girderH = widthClass === 'sky-street' ? 0.46 : widthClass === 'collector' ? 0.34 : 0.24;
  // Cross-members, posts and diagonals have thickness along the bridge axis. If
  // authored exactly on a facade plane they extend half their own thickness into
  // the receiving wall even when the mathematical endpoint is correct. Keep all
  // endpoint-sensitive structure bridge-side of an explicit attachment seat.
  const requestedEndpointClearance = endpointClearance == null
    ? Math.max(0.10, beamT * 0.95)
    : Math.max(0.04, finite(endpointClearance, 0.10));
  const endpointInset = Math.min(requestedEndpointClearance, Math.max(0.04, span * 0.18));
  const structureLo = lo + endpointInset;
  const structureHi = hi - endpointInset;
  const structureSpan = Math.max(0, structureHi - structureLo);
  const hasStructureSpan = structureSpan > Math.max(0.18, beamT * 2.2);
  const stationLo = hasStructureSpan ? structureLo : lo;
  const stationHi = hasStructureSpan ? structureHi : hi;
  const stationSpan = Math.max(0, stationHi - stationLo);

  const sideBeam = (fixed, yy, thickness = beamT, height = girderH, extra = null) => {
    const meta = extra ? { ...metadata, ...extra } : metadata;
    if (axis === 'x') pushBox(metal, { x: center, y: yy, z: fixed, sx: span, sy: height, sz: thickness }, meta);
    else pushBox(metal, { x: fixed, y: yy, z: center, sx: thickness, sy: height, sz: span }, meta);
  };
  const crossBeam = (along, yy, thickness = beamT, depth = w + 0.18, extra = null) => {
    const meta = extra ? { ...metadata, ...extra } : metadata;
    if (axis === 'x') pushBox(metal, { x: along, y: yy, z: fixedCoord, sx: thickness, sy: thickness, sz: depth }, meta);
    else pushBox(metal, { x: fixedCoord, y: yy, z: along, sx: depth, sy: thickness, sz: thickness }, meta);
  };
  const attachmentSeat = (facadeAlong, supportAlong, yy, thickness = beamT * 1.18, depth = w + 0.28, extra = null) => {
    const length = Math.abs(supportAlong - facadeAlong);
    if (!(length > 0.02)) return;
    const along = (facadeAlong + supportAlong) * 0.5;
    const meta = {
      ...metadata,
      bridgeSupport: true,
      structuralRole: 'facade-attachment-seat',
      attachmentAuthority: 'exterior-seat-v1',
      facadePlaneAlong: facadeAlong,
      supportAlong,
      ...(extra || {}),
    };
    if (axis === 'x') pushBox(metal, { x: along, y: yy, z: fixedCoord, sx: length, sy: thickness, sz: depth }, meta);
    else pushBox(metal, { x: fixedCoord, y: yy, z: along, sx: depth, sy: thickness, sz: length }, meta);
  };

  if (family === 'simple-guarded') {
    sideBeam(edgeA, y - 0.18);
    sideBeam(edgeB, y - 0.18);
  } else if (family === 'heavy-beam') {
    sideBeam(edgeA + beamT * 0.5, y - 0.34, beamT * 1.35, girderH * 1.55);
    sideBeam(edgeB - beamT * 0.5, y - 0.34, beamT * 1.35, girderH * 1.55);
    const bays = Math.max(2, Math.ceil(Math.max(stationSpan, span) / 3.8));
    for (let i = 0; i <= bays; i++) crossBeam(stationLo + stationSpan * (i / bays), y - 0.28, beamT * 1.05);
  } else if (family === 'utility-frame' || family === 'covered-gallery') {
    const bays = Math.max(2, Math.ceil(Math.max(stationSpan, span) / (family === 'covered-gallery' ? 3.2 : 4.0)));
    const topY = y + (widthClass === 'sky-street' ? 2.75 : 2.35);
    for (let i = 0; i <= bays; i++) {
      const along = stationLo + stationSpan * (i / bays);
      for (const fixed of [edgeA, edgeB]) {
        if (axis === 'x') pushBox(metal, { x: along, y: (y + topY) * 0.5, z: fixed, sx: beamT, sy: topY - y, sz: beamT }, { ...metadata, architectureRole: 'upper-frame-post', junctionYield: true });
        else pushBox(metal, { x: fixed, y: (y + topY) * 0.5, z: along, sx: beamT, sy: topY - y, sz: beamT }, { ...metadata, architectureRole: 'upper-frame-post', junctionYield: true });
      }
      crossBeam(along, topY, beamT, w + 0.24, { architectureRole: 'upper-frame-crossbeam', junctionYield: true });
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
    const bays = Math.max(3, Math.ceil(Math.max(stationSpan, span) / 3.1));
    const bay = stationSpan / bays;
    for (const fixed of [edgeA, edgeB]) {
      sideBeam(fixed, y - 0.18);
      sideBeam(fixed, trussTop, beamT, beamT, { architectureRole: 'upper-truss-chord', junctionYield: true });
      for (let i = 0; i <= bays; i++) {
        const along = stationLo + bay * i;
        if (axis === 'x') pushBox(metal, { x: along, y: (y + trussTop) * 0.5, z: fixed, sx: beamT, sy: trussTop - y, sz: beamT }, { ...metadata, architectureRole: 'truss-post', junctionYield: true });
        else pushBox(metal, { x: fixed, y: (y + trussTop) * 0.5, z: along, sx: beamT, sy: trussTop - y, sz: beamT }, { ...metadata, architectureRole: 'truss-post', junctionYield: true });
        if (i < bays) {
          const a = { along, y: i % 2 === 0 ? y + 0.08 : trussTop - 0.08 };
          const b = { along: along + bay, y: i % 2 === 0 ? trussTop - 0.08 : y + 0.08 };
          pushBox(metal, diagonalBetween(axis, a, b, fixed, beamT * 0.78, { ...metadata, architectureRole: 'truss-diagonal', junctionYield: true }), {});
        }
      }
    }
    if (family === 'through-truss') {
      for (let i = 0; i <= bays; i += 2) crossBeam(stationLo + bay * i, trussTop, beamT, w + 0.16, { architectureRole: 'upper-truss-crossbeam', junctionYield: true });
    }
  } else if (family === 'box-girder') {
    const boxH = widthClass === 'sky-street' ? 0.78 : 0.58;
    const boxW = Math.max(0.24, beamT * 2.0);
    sideBeam(edgeA + boxW * 0.5, y - boxH * 0.62, boxW, boxH, { architectureRole: 'box-girder-side' });
    sideBeam(edgeB - boxW * 0.5, y - boxH * 0.62, boxW, boxH, { architectureRole: 'box-girder-side' });
    const bays = Math.max(2, Math.ceil(Math.max(stationSpan, span) / 4.4));
    for (let i = 0; i <= bays; i++) crossBeam(stationLo + stationSpan * (i / bays), y - boxH * 0.55, beamT * 1.3, w + 0.12, { architectureRole: 'box-diaphragm' });
  } else if (family === 'suspension-hanger') {
    // When the semantic variant is itself a hanging bridge, the variant-owned
    // catenary below is the one suspension system. Do not also build the old
    // family-level tower/hanger kit underneath it. That duplicated hangers and
    // produced two different structural stories on the same span.
    sideBeam(edgeA, y - 0.16);
    sideBeam(edgeB, y - 0.16);
    if (!hangingVariant) {
      const towerInset = Math.min(1.35, Math.max(stationSpan, span) * 0.12);
      const towerY = y + (widthClass === 'sky-street' ? 3.4 : 2.8);
      for (const along of [stationLo + towerInset, stationHi - towerInset]) {
        for (const fixed of [edgeA, edgeB]) {
          if (axis === 'x') pushBox(metal, { x: along, y: (y + towerY) * 0.5, z: fixed, sx: beamT * 1.5, sy: towerY - y, sz: beamT * 1.5 }, { ...metadata, architectureRole: 'hanger-tower', junctionYield: true });
          else pushBox(metal, { x: fixed, y: (y + towerY) * 0.5, z: along, sx: beamT * 1.5, sy: towerY - y, sz: beamT * 1.5 }, { ...metadata, architectureRole: 'hanger-tower', junctionYield: true });
        }
      }
      const bays = Math.max(4, Math.ceil(Math.max(stationSpan, span) / 3.2));
      for (let i = 1; i < bays; i++) {
        const along = stationLo + stationSpan * (i / bays);
        const t = i / bays;
        const cableY = towerY - Math.sin(Math.PI * t) * (towerY - y) * 0.58;
        const h = Math.max(0.18, cableY - y);
        for (const fixed of [edgeA, edgeB]) {
          if (axis === 'x') pushBox(metal, { x: along, y: y + h * 0.5, z: fixed, sx: beamT * 0.55, sy: h, sz: beamT * 0.55 }, { ...metadata, architectureRole: 'vertical-hanger', junctionYield: true });
          else pushBox(metal, { x: fixed, y: y + h * 0.5, z: along, sx: beamT * 0.55, sy: h, sz: beamT * 0.55 }, { ...metadata, architectureRole: 'vertical-hanger', junctionYield: true });
        }
      }
    }
  } else if (family === 'ramshackle-brace') {
    sideBeam(edgeA, y - 0.18, beamT * 0.92, girderH * 0.88, { architectureRole: 'patched-side-beam' });
    sideBeam(edgeB, y - 0.18, beamT * 1.18, girderH * 1.08, { architectureRole: 'patched-side-beam' });
    const bays = Math.max(3, Math.ceil(Math.max(stationSpan, span) / 3.6));
    for (let i = 0; i < bays; i++) {
      const a = stationLo + stationSpan * (i / bays), b = stationLo + stationSpan * ((i + 1) / bays);
      const fixed = i % 2 ? edgeA : edgeB;
      pushBox(metal, diagonalBetween(axis, { along:a, y:y-0.18 }, { along:b, y:y-1.15-(i%3)*0.22 }, fixed, beamT * 0.82, { ...metadata, architectureRole: 'patched-underslung-brace' }), {});
      if (i % 2 === 0) crossBeam((a+b)*0.5, y - 0.34, beamT * 0.88, w + 0.18, { architectureRole: 'patched-crossbeam' });
    }
  } else if (family === 'underslung-arch') {
    sideBeam(edgeA, y - 0.14);
    sideBeam(edgeB, y - 0.14);
    const segments = Math.max(8, Math.ceil(Math.max(stationSpan, span) / 2.5));
    const archDepth = clamp(span * 0.14, 1.2, widthClass === 'sky-street' ? 3.4 : 2.6);
    for (const fixed of [edgeA, edgeB]) {
      let prev = null;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const along = stationLo + stationSpan * t;
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

  let variantParts = 0;
  let structuralGrammar = 'family-native-v1';
  if (hangingVariant && stationSpan > Math.max(0.8, w * 0.45)) {
    // Hanging bridges are not a generic guarded deck with decorative posts. The
    // semantic variant owns a real visual tension system: high exterior seats,
    // sagging side cables, and hangers that terminate at the deck-side edge beam.
    structuralGrammar = 'suspended-catenary-v1';
    const cableT = Math.max(0.055, beamT * 0.58);
    const highY = y + (widthClass === 'sky-street' ? 3.45 : widthClass === 'collector' ? 3.05 : 2.62);
    const lowY = y + (widthClass === 'sky-street' ? 1.78 : widthClass === 'collector' ? 1.58 : 1.42);
    const segments = Math.max(6, Math.ceil(stationSpan / 1.85));
    for (const fixed of [edgeA, edgeB]) {
      let previous = null;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const along = stationLo + stationSpan * t;
        // A catenary-like U profile: highest at anchored ends, lowest at midspan.
        const shape = Math.pow(Math.abs(2 * t - 1), 1.55);
        const cableY = lowY + (highY - lowY) * shape;
        const point = { along, y: cableY };
        if (previous) {
          metal.push(diagonalBetween(axis, previous, point, fixed, cableT, {
            ...metadata, architectureRole: 'hanging-suspension-cable', structuralRole: 'tension-cable', junctionYield: true,
          }));
          variantParts++;
        }
        if (i > 0 && i < segments && i % 2 === 0) {
          const deckY = y + 0.10;
          const h = Math.max(0.18, cableY - deckY);
          const hangerMeta = { ...metadata, architectureRole: 'hanging-vertical-hanger', structuralRole: 'tension-hanger', junctionYield: true };
          if (axis === 'x') pushBox(metal, { x: along, y: deckY + h * 0.5, z: fixed, sx: cableT * 0.78, sy: h, sz: cableT * 0.78 }, hangerMeta);
          else pushBox(metal, { x: fixed, y: deckY + h * 0.5, z: along, sx: cableT * 0.78, sy: h, sz: cableT * 0.78 }, hangerMeta);
          variantParts++;
        }
        previous = point;
      }
    }
    for (const [facadeAlong, seatAlong] of [[lo, stationLo], [hi, stationHi]]) {
      attachmentSeat(facadeAlong, seatAlong, highY, cableT * 1.6, w + 0.22, {
        architectureRole: 'hanging-anchor-seat', structuralRole: 'tension-anchor', junctionYield: true,
      });
      variantParts++;
    }
  }

  let supportMode = null;
  let supportParts = 0;
  // The catenary/hanger system already resolves a hanging bridge back to its
  // facade seats. A second generic pair of diagonal facade braces is redundant
  // and was the third large grammar layer on wide hanging spans. Keep those
  // braces for rigid catwalk/sky-street families only.
  if (!hangingVariant && (widthClass === 'collector' || widthClass === 'sky-street') && span > 2.6) {
    supportMode = supportModeHint === 'hung-from-above' || supportModeHint === 'braced-from-below'
      ? supportModeHint
      : (unit(hash ^ 0xa24baed4, 5) < 0.48 ? 'hung-from-above' : 'braced-from-below');
    const direction = supportMode === 'hung-from-above' ? 1 : -1;
    const anchorRise = direction * (widthClass === 'sky-street' ? 2.9 : 2.15);
    const reach = Math.min(Math.max(stationSpan, span) * 0.24, Math.max(1.35, w * 0.82));
    for (const [facadeAlong, wallAlong, deckAlong] of [[lo, stationLo, Math.min(stationHi, stationLo + reach)], [hi, stationHi, Math.max(stationLo, stationHi - reach)]]) {
      for (const fixed of [edgeA, edgeB]) {
        const brace = diagonalBetween(
          axis,
          { along: deckAlong, y: y - 0.26 },
          { along: wallAlong, y: y + anchorRise },
          fixed,
          beamT * (widthClass === 'sky-street' ? 1.18 : 1.02),
          {
            ...metadata,
            bridgeSupport: true,
            supportMode,
            structuralRole: supportMode === 'hung-from-above' ? 'upper-facade-brace' : 'lower-facade-brace',
            attachmentAuthority: 'exterior-seat-v1',
            fromAttachment: 'deck-side-seat',
            toAttachment: 'facade-seat',
            facadePlaneAlong: facadeAlong,
            supportAlong: wallAlong,
          },
        );
        metal.push(brace); supportParts++;
      }
      crossBeam(wallAlong, y + anchorRise, beamT * 1.18, w + 0.28);
      attachmentSeat(facadeAlong, wallAlong, y + anchorRise, beamT * 1.18, w + 0.28, { supportMode });
      supportParts += 2;
    }
  }

  if (widthClass === 'sky-street') {
    const portalFrameInset = Math.min(1.0, span * 0.10);
    const frameY = y + 1.45;
    for (const along of [lo + portalFrameInset, hi - portalFrameInset]) {
      for (const fixed of [edgeA, edgeB]) {
        if (axis === 'x') pushBox(concrete, { x: along, y: frameY, z: fixed, sx: 0.28, sy: 2.9, sz: 0.28 }, { ...metadata, architectureRole: 'portal-frame-post', junctionYield: true });
        else pushBox(concrete, { x: fixed, y: frameY, z: along, sx: 0.28, sy: 2.9, sz: 0.28 }, { ...metadata, architectureRole: 'portal-frame-post', junctionYield: true });
      }
      crossBeam(along, y + 2.85, 0.22, w + 0.28, { architectureRole: 'portal-frame-crossbeam', junctionYield: true });
    }
  }

  // A little deterministic asymmetry keeps repeated families from reading as one
  // prefab asset without turning the structure into random noise.
  if (unit(hash, 12) < 0.45 && span > 6) {
    const along = lo + span * (0.28 + unit(hash ^ 0x9e3779b9, 2) * 0.44);
    crossBeam(along, y - 0.48, beamT * 1.15, w + 0.50);
  }

  const materialFamily = String(materialFamilyHint || family);
  const materialHandwriting = applyArchitectureMaterialHandwriting({
    family: materialFamily,
    metal,
    concrete,
    field,
    weightScale: materialWeightScale ?? (1 + Math.max(0, w - 1.2) * 0.18),
  });
  return Object.freeze({
    schema: SKYBRIDGE_ARCHITECTURE_SCHEMA,
    family,
    materialFamily,
    bridgeVariant,
    structuralGrammar,
    variantParts,
    widthClass,
    span,
    width: w,
    metal: materialHandwriting.metal,
    concrete: materialHandwriting.concrete,
    parts: metal.length + concrete.length,
    supportMode,
    supportParts,
    endpointClearance: endpointInset,
    attachmentAuthority: 'exterior-seat-v1',
    traversalAuthority: 'canonical-transport-slab-unchanged',
  });
}
