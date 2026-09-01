export const FAST_FACADE_ARCHITECTURE_SCHEMA = 'jweb.fast-facade-architecture.v1';

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function finite(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function faceGeometry(face) {
  const rect = face?.rect ?? {};
  const side = face?.side;
  const horizontal = side === 'north' || side === 'south';
  const vertical = side === 'west' || side === 'east';
  if (!horizontal && !vertical) return null;
  const cx = finite(rect.cx), cz = finite(rect.cz), halfX = finite(rect.halfX), halfZ = finite(rect.halfZ);
  if (!(halfX > 0) || !(halfZ > 0)) return null;
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  const tangentCenter = horizontal ? cx : cz;
  const tangentHalf = horizontal ? halfX : halfZ;
  const faceCoord = horizontal ? cz + outward * halfZ : cx + outward * halfX;
  return { horizontal, outward, tangentCenter, tangentHalf, faceCoord };
}
function orientedBox(face, tangent, normal, y, tangentSize, normalSize, height, metadata = null) {
  const horizontal = face.side === 'north' || face.side === 'south';
  return horizontal
    ? { x: tangent, y, z: normal, sx: tangentSize, sy: height, sz: normalSize, ...(metadata || {}) }
    : { x: normal, y, z: tangent, sx: normalSize, sy: height, sz: tangentSize, ...(metadata || {}) };
}
function facadePlane(face, tangent, normal, y, width, height, metadata = null) {
  const horizontal = face.side === 'north' || face.side === 'south';
  return horizontal
    ? { x: tangent, y, z: normal, sx: width, sy: height, sz: 0.04, ...(metadata || {}) }
    : { x: normal, y, z: tangent, sx: 0.04, sy: height, sz: width, ...(metadata || {}) };
}
function freezeRecord(value) { return Object.freeze({ ...value }); }

export function planFastFacadeArchitecture({
  stableKey = 'fast-facade',
  faces = [],
  floorH = 3.15,
  defaultDoorWidth = 1.35,
  defaultDoorHeight = 2.2,
} = {}) {
  const props = [];
  const windows = [];
  const treatments = [];
  const metrics = {
    faces: 0,
    portalFrames: 0,
    groundPortalFrames: 0,
    upperPortalFrames: 0,
    storefronts: 0,
    serviceShutters: 0,
    canopies: 0,
    stoops: 0,
    windows: 0,
    protectedOpeningFloors: 0,
    newPortalCount: 0,
  };

  const sortedFaces = [...faces].sort((a, b) =>
    `${a.moduleKey}:${a.dirKey}`.localeCompare(`${b.moduleKey}:${b.dirKey}`));

  for (const face of sortedFaces) {
    const geometry = faceGeometry(face);
    if (!geometry) continue;
    metrics.faces++;
    const floors = Math.max(1, Math.floor(finite(face.floors, 1)));
    const tangentSpan = geometry.tangentHalf * 2;
    const openingByFloor = new Map();
    for (const raw of face.openings ?? []) {
      const floor = Math.max(0, Math.floor(finite(raw.floor, 0)));
      if (floor >= floors || openingByFloor.has(floor)) continue;
      const width = clamp(finite(raw.width, defaultDoorWidth), 0.78, Math.max(0.82, tangentSpan - 0.28));
      const height = clamp(finite(raw.height, defaultDoorHeight), 1.82, Math.max(1.90, floorH - 0.14));
      const center = clamp(finite(raw.center, geometry.tangentCenter),
        geometry.tangentCenter - geometry.tangentHalf + width * 0.5 + 0.08,
        geometry.tangentCenter + geometry.tangentHalf - width * 0.5 - 0.08);
      const opening = { ...raw, floor, width, height, center };
      openingByFloor.set(floor, opening);
      metrics.protectedOpeningFloors++;

      const frameDepth = 0.22;
      const frameT = Math.min(0.14, Math.max(0.08, width * 0.07));
      const innerNormal = geometry.faceCoord - geometry.outward * frameDepth * 0.42;
      const baseY = floor * floorH;
      const frameMeta = { facadeRole: 'portal-frame', openingId: raw.openingId ?? null, openingKey: raw.openingKey ?? null, moduleKey: face.moduleKey, dirKey: face.dirKey, floor, portalKind: raw.kind ?? 'portal' };
      props.push(orientedBox(face, center - width * 0.5 - frameT * 0.5, innerNormal, baseY + height * 0.5, frameT, frameDepth, height, frameMeta));
      props.push(orientedBox(face, center + width * 0.5 + frameT * 0.5, innerNormal, baseY + height * 0.5, frameT, frameDepth, height, frameMeta));
      props.push(orientedBox(face, center, innerNormal, baseY + height + frameT * 0.5, width + frameT * 2, frameDepth, frameT, frameMeta));
      treatments.push(freezeRecord({
        id: `${stableKey}:${face.moduleKey}:${face.dirKey}:portal-frame:${floor}`,
        kind: 'portal-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
        floor, openingKey: raw.openingKey ?? null, openingId: raw.openingId ?? null,
        portalKind: raw.kind ?? 'portal', width, height, center,
      }));
      metrics.portalFrames++;
      if (floor === 0) metrics.groundPortalFrames++; else metrics.upperPortalFrames++;

      if (floor === 0) {
        const canopyDepth = 0.70;
        const canopyWidth = Math.min(tangentSpan - 0.12, width + 0.70);
        const canopyNormal = geometry.faceCoord + geometry.outward * canopyDepth * 0.5;
        props.push(orientedBox(face, center, canopyNormal, baseY + height + 0.24, canopyWidth, canopyDepth, 0.12,
          { facadeRole: 'entry-canopy', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        metrics.canopies++;

        const stoopDepth = 0.52;
        const stoopNormal = geometry.faceCoord + geometry.outward * stoopDepth * 0.5;
        props.push(orientedBox(face, center, stoopNormal, 0.055, Math.min(tangentSpan - 0.12, width + 0.34), stoopDepth, 0.11,
          { facadeRole: 'entry-stoop', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        metrics.stoops++;
      }
    }

    const groundOccupied = openingByFloor.has(0);
    let groundBay = null;
    if (!groundOccupied && tangentSpan >= 2.0) {
      const roll = stableHash(`${stableKey}:${face.moduleKey}:${face.dirKey}:ground-bay`) % 100;
      const bayKind = roll < 64 ? 'storefront' : 'service-shutter';
      const bayWidth = clamp(tangentSpan * (bayKind === 'storefront' ? 0.58 : 0.48), 1.55, Math.min(3.4, tangentSpan - 0.30));
      const bayHeight = bayKind === 'storefront' ? Math.min(1.55, floorH * 0.48) : Math.min(2.25, floorH * 0.72);
      const center = geometry.tangentCenter;
      const panelNormal = geometry.faceCoord + geometry.outward * 0.035;
      const baseY = 0;
      if (bayKind === 'storefront') {
        windows.push(facadePlane(face, center, panelNormal, baseY + 1.22, bayWidth, bayHeight,
          { facadeRole: 'storefront-glazing', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0 }));
        const frameT = 0.10;
        const frameNormal = geometry.faceCoord + geometry.outward * 0.055;
        const frameY = baseY + 1.22;
        props.push(orientedBox(face, center - bayWidth * 0.5 - frameT * 0.5, frameNormal, frameY, frameT, 0.11, bayHeight + 0.18,
          { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey }));
        props.push(orientedBox(face, center + bayWidth * 0.5 + frameT * 0.5, frameNormal, frameY, frameT, 0.11, bayHeight + 0.18,
          { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey }));
        props.push(orientedBox(face, center, frameNormal, frameY + bayHeight * 0.5 + 0.09, bayWidth + frameT * 2, 0.11, 0.12,
          { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey }));
        const canopyDepth = 0.66;
        props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * canopyDepth * 0.5, Math.min(floorH - 0.38, 2.38), bayWidth + 0.42, canopyDepth, 0.10,
          { facadeRole: 'shop-awning', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0 }));
        metrics.storefronts++;
        metrics.canopies++;
      } else {
        props.push(orientedBox(face, center, panelNormal, bayHeight * 0.5 + 0.10, bayWidth, 0.08, bayHeight,
          { facadeRole: 'closed-service-shutter', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0 }));
        props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * 0.07, bayHeight + 0.19, bayWidth + 0.24, 0.14, 0.18,
          { facadeRole: 'service-shutter-hood', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0 }));
        metrics.serviceShutters++;
      }
      groundBay = bayKind;
      treatments.push(freezeRecord({
        id: `${stableKey}:${face.moduleKey}:${face.dirKey}:ground-bay`, kind: bayKind,
        moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side, floor: 0,
        width: bayWidth, height: bayHeight, center,
      }));
    }

    for (let floor = 0; floor < floors; floor++) {
      if (openingByFloor.has(floor)) continue;
      if (floor === 0 && groundBay) continue;
      const y = floor * floorH + floorH * 0.56;
      const windowCount = tangentSpan >= 5.6 ? 2 : 1;
      const width = clamp(tangentSpan * (windowCount === 2 ? 0.22 : 0.32), 0.82, 1.28);
      const height = clamp(floorH * 0.25, 0.68, 0.90);
      for (let i = 0; i < windowCount; i++) {
        const u = windowCount === 1 ? 0 : (i === 0 ? -0.30 : 0.30);
        const tangent = geometry.tangentCenter + u * geometry.tangentHalf;
        const normal = geometry.faceCoord + geometry.outward * 0.027;
        const meta = { facadeRole: 'inhabited-window', moduleKey: face.moduleKey, dirKey: face.dirKey, floor, windowIndex: i };
        windows.push(facadePlane(face, tangent, normal, y, width, height, meta));
        props.push(orientedBox(face, tangent, geometry.faceCoord + geometry.outward * 0.055, y - height * 0.5 - 0.055, width + 0.16, 0.12, 0.10,
          { facadeRole: 'window-sill', moduleKey: face.moduleKey, dirKey: face.dirKey, floor, windowIndex: i }));
        treatments.push(freezeRecord({
          id: `${stableKey}:${face.moduleKey}:${face.dirKey}:window:${floor}:${i}`,
          kind: 'window', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
          floor, center: tangent, width, height,
        }));
        metrics.windows++;
      }
    }
  }

  return Object.freeze({
    schema: FAST_FACADE_ARCHITECTURE_SCHEMA,
    stableKey: String(stableKey),
    treatments: Object.freeze(treatments),
    render: Object.freeze({ props: Object.freeze(props), windows: Object.freeze(windows) }),
    metrics: Object.freeze(metrics),
  });
}
