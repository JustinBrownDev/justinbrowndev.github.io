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
function floorBaseOf(face) { return Math.max(0, Math.floor(finite(face?.floorBase, 0))); }

export function planFastFacadeArchitecture({
  stableKey = 'fast-facade',
  faces = [],
  floorH = 3.15,
  defaultDoorWidth = 1.35,
  defaultDoorHeight = 2.2,
  programFrontages = [],
  constructionProfile = null,
  constructionDirectives = [],
} = {}) {
  const props = [];
  const windows = [];
  const apertures = [];
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
    programFrontages: 0,
    elevatedProgramFrontages: 0,
    programPortalFrontages: 0,
    constructionDirectedFloors: 0,
    semanticWindows: 0,
    opaqueProgramFloors: 0,
    operationalPanels: 0,
    suppressedGenericGroundBays: 0,
  };

  const constructionDirectiveByFaceFloor = new Map();
  for (const directive of constructionDirectives ?? []) {
    const localFloor = Number.isFinite(Number(directive?.localFloor))
      ? Math.max(0, Math.floor(Number(directive.localFloor)))
      : null;
    if (localFloor == null || !directive?.moduleKey || !directive?.side) continue;
    const key = `${directive.moduleKey}:${directive.side}:${localFloor}`;
    if (!constructionDirectiveByFaceFloor.has(key)) constructionDirectiveByFaceFloor.set(key, directive);
  }
  const constructionMeta = directive => directive ? {
    buildingConstructionId: directive.buildingConstructionId ?? constructionProfile?.id ?? null,
    architectureFamily: directive.architectureFamily ?? constructionProfile?.architectureFamily ?? null,
    constructionFlavor: directive.constructionFlavor ?? constructionProfile?.constructionFlavor ?? null,
    facadeLanguage: directive.facadeLanguage ?? null,
    semanticSpaceId: directive.semanticSpaceId ?? null,
    semanticRole: directive.semanticRole ?? null,
  } : {};
  const constructionDirectiveFor = (face, floor) => constructionDirectiveByFaceFloor.get(`${face.moduleKey}:${face.side}:${floor}`) ?? null;

  const programFrontageByFaceFloor = new Map();
  for (const frontage of [...programFrontages].sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))) {
    const floor = Math.max(0, Math.floor(finite(frontage?.floor, 0)));
    const key = `${frontage?.moduleKey ?? ''}:${frontage?.side ?? ''}:${floor}`;
    if (!programFrontageByFaceFloor.has(key)) programFrontageByFaceFloor.set(key, { ...frontage, floor });
  }

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
      const baseY = (floorBaseOf(face) + floor) * floorH;
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
        props.push(orientedBox(face, center, stoopNormal, baseY + 0.055, Math.min(tangentSpan - 0.12, width + 0.34), stoopDepth, 0.11,
          { facadeRole: 'entry-stoop', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        metrics.stoops++;
      }
    }

    // Program frontage follows the real public route floor rather than a
    // universal "ground floor = commercial" rule. A protected transport portal
    // remains the walk-through entrance; adjacent route-facing glazing is a
    // broad architectural opening with a real sill, so an elevated shopfront
    // cannot accidentally become an unguarded fall-through hole.
    const programFrontageFloors = new Set();
    for (let floor = 0; floor < floors; floor++) {
      const directive = programFrontageByFaceFloor.get(`${face.moduleKey}:${face.side}:${floor}`);
      if (!directive) continue;
      const protectedOpening = openingByFloor.get(floor) ?? null;
      const faceMin = geometry.tangentCenter - geometry.tangentHalf + 0.12;
      const faceMax = geometry.tangentCenter + geometry.tangentHalf - 0.12;
      const desiredWidth = clamp(tangentSpan * 0.46, 1.55, Math.min(4.4, tangentSpan - 0.24));
      const margin = 0.18;
      let intervals = [{ lo: faceMin, hi: faceMax }];
      if (protectedOpening) {
        const openingLo = protectedOpening.center - protectedOpening.width * 0.5 - margin;
        const openingHi = protectedOpening.center + protectedOpening.width * 0.5 + margin;
        intervals = [
          { lo: faceMin, hi: Math.min(faceMax, openingLo) },
          { lo: Math.max(faceMin, openingHi), hi: faceMax },
        ];
      }
      intervals = intervals
        .map(interval => ({ ...interval, span: interval.hi - interval.lo }))
        .filter(interval => interval.span >= 1.28)
        .sort((a, b) => b.span - a.span || a.lo - b.lo);
      const interval = intervals[0] ?? null;
      const baseY = (floorBaseOf(face) + floor) * floorH;
      if (interval) {
        const width = Math.min(desiredWidth, interval.span - 0.08);
        const center = (interval.lo + interval.hi) * 0.5;
        const bottom = floor === 0 ? 0.58 : 0.82;
        const height = clamp(floorH - bottom - 0.42, 1.15, 1.72);
        const paneNormal = geometry.faceCoord + geometry.outward * 0.045;
        const apertureId = `${stableKey}:${face.moduleKey}:${face.dirKey}:program-frontage:${floor}`;
        apertures.push(freezeRecord({
          id: `${apertureId}:aperture`,
          kind: 'program-frontage-window', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
          floor, floorBase: floorBaseOf(face), center, width, height, bottom,
          semanticProgram: directive.semanticProgram ?? null,
          programArchitectureId: directive.programArchitectureId ?? null,
          sourceSpaceId: directive.spaceId ?? null,
          routeAligned: directive.routeAligned === true,
        }));
        windows.push(facadePlane(face, center, paneNormal, baseY + bottom + height * 0.5, width, height, {
          facadeRole: 'program-frontage-glazing', moduleKey: face.moduleKey, dirKey: face.dirKey, floor,
          semanticProgram: directive.semanticProgram ?? null, programArchitectureId: directive.programArchitectureId ?? null,
          sourceSpaceId: directive.spaceId ?? null, routeAligned: directive.routeAligned === true,
        }));
        const frameT = 0.10;
        const frameNormal = geometry.faceCoord + geometry.outward * 0.065;
        const frameY = baseY + bottom + height * 0.5;
        props.push(orientedBox(face, center - width * 0.5 - frameT * 0.5, frameNormal, frameY, frameT, 0.12, height + 0.16,
          { facadeRole: 'program-frontage-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        props.push(orientedBox(face, center + width * 0.5 + frameT * 0.5, frameNormal, frameY, frameT, 0.12, height + 0.16,
          { facadeRole: 'program-frontage-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        props.push(orientedBox(face, center, frameNormal, baseY + bottom - frameT * 0.5, width + frameT * 2, 0.12, frameT,
          { facadeRole: 'program-frontage-sill', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        props.push(orientedBox(face, center, frameNormal, baseY + bottom + height + frameT * 0.5, width + frameT * 2, 0.12, frameT,
          { facadeRole: 'program-frontage-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, floor }));
        if (['storefront', 'food-frontage', 'workshop-frontage'].includes(String(directive.frontageKind))) {
          const canopyDepth = 0.66;
          const canopyY = Math.min(baseY + floorH - 0.22, baseY + bottom + height + 0.22);
          props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * canopyDepth * 0.5, canopyY,
            Math.min(tangentSpan - 0.10, width + 0.46), canopyDepth, 0.10,
            { facadeRole: 'route-frontage-awning', moduleKey: face.moduleKey, dirKey: face.dirKey, floor,
              semanticProgram: directive.semanticProgram ?? null }));
          metrics.canopies++;
        }
        treatments.push(freezeRecord({
          id: apertureId,
          kind: 'program-frontage', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side, floor,
          center, width, height, bottom, semanticProgram: directive.semanticProgram ?? null,
          programArchitectureId: directive.programArchitectureId ?? null,
          frontageKind: directive.frontageKind ?? 'public-frontage', sourceSpaceId: directive.spaceId ?? null,
          routeAligned: directive.routeAligned === true, functionalFixture: directive.functionalFixture ?? null,
        }));
        metrics.programFrontages++;
        if (floorBaseOf(face) + floor > 0) metrics.elevatedProgramFrontages++;
        metrics.windows++;
        programFrontageFloors.add(floor);
      } else if (protectedOpening) {
        // Narrow facade: let the already-authoritative route portal itself read
        // as the public frontage rather than forcing an overlapping second hole.
        const canopyDepth = 0.70;
        const canopyWidth = Math.min(tangentSpan - 0.10, protectedOpening.width + 0.90);
        props.push(orientedBox(face, protectedOpening.center,
          geometry.faceCoord + geometry.outward * canopyDepth * 0.5,
          Math.min(baseY + floorH - 0.22, baseY + protectedOpening.height + 0.24),
          canopyWidth, canopyDepth, 0.11,
          { facadeRole: 'route-portal-frontage-canopy', moduleKey: face.moduleKey, dirKey: face.dirKey, floor,
            semanticProgram: directive.semanticProgram ?? null }));
        treatments.push(freezeRecord({
          id: `${stableKey}:${face.moduleKey}:${face.dirKey}:program-portal-frontage:${floor}`,
          kind: 'program-portal-frontage', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side, floor,
          openingKey: protectedOpening.openingKey ?? null, semanticProgram: directive.semanticProgram ?? null,
          programArchitectureId: directive.programArchitectureId ?? null,
          frontageKind: directive.frontageKind ?? 'public-frontage', sourceSpaceId: directive.spaceId ?? null,
          routeAligned: directive.routeAligned === true, functionalFixture: directive.functionalFixture ?? null,
        }));
        metrics.programFrontages++;
        metrics.programPortalFrontages++;
        if (floorBaseOf(face) + floor > 0) metrics.elevatedProgramFrontages++;
        metrics.canopies++;
        programFrontageFloors.add(floor);
      }
    }

    const groundOccupied = openingByFloor.has(0) || programFrontageFloors.has(0);
    const groundBaseY = floorBaseOf(face) * floorH;
    const groundConstruction = constructionDirectiveFor(face, 0);
    let groundBay = null;
    if (!groundOccupied && tangentSpan >= 2.0) {
      const language = String(groundConstruction?.facadeLanguage ?? '');
      const family = String(groundConstruction?.architectureFamily ?? constructionProfile?.architectureFamily ?? '');
      let bayKind = null;
      if (!groundConstruction) {
        const roll = stableHash(`${stableKey}:${face.moduleKey}:${face.dirKey}:ground-bay`) % 100;
        bayKind = roll < 64 ? 'storefront' : 'service-shutter';
      } else if (language === 'large-operational-bay') {
        bayKind = 'service-shutter';
      } else if (language === 'technical-service' || (language === 'service-opaque' && /data|laboratory|utility/.test(family))) {
        bayKind = 'technical-panel';
      } else if (language === 'service-opaque' && /warehouse|workshop|industrial/.test(family)) {
        bayKind = 'service-shutter';
      } else {
        // A domestic, civic, office, or ordinary work facade no longer receives
        // a random shopfront merely because its ground wall had spare space.
        metrics.suppressedGenericGroundBays++;
      }

      if (bayKind) {
        const bayWidth = clamp(tangentSpan * (bayKind === 'storefront' ? 0.58 : bayKind === 'technical-panel' ? 0.40 : 0.54),
          1.55, Math.min(bayKind === 'service-shutter' ? 4.8 : 3.4, tangentSpan - 0.30));
        const bayHeight = bayKind === 'storefront' ? Math.min(2.45, floorH - 0.18)
          : bayKind === 'technical-panel' ? Math.min(1.85, floorH * 0.60)
          : Math.min(2.55, floorH * 0.80);
        const center = geometry.tangentCenter;
        const panelNormal = geometry.faceCoord + geometry.outward * 0.035;
        const baseY = groundBaseY;
        const cMeta = constructionMeta(groundConstruction);
        if (bayKind === 'storefront') {
          // Legacy/no-program fallback only. Program-aware commercial frontages are
          // supplied by programFrontages above and therefore remain route-aligned.
          apertures.push(freezeRecord({
            id: `${stableKey}:${face.moduleKey}:${face.dirKey}:storefront-aperture`,
            kind: 'storefront', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
            floor: 0, floorBase: floorBaseOf(face), center, width: bayWidth, height: bayHeight, bottom: 0,
          }));
          const frameT = 0.10;
          const frameNormal = geometry.faceCoord + geometry.outward * 0.055;
          const frameY = baseY + bayHeight * 0.5;
          props.push(orientedBox(face, center - bayWidth * 0.5 - frameT * 0.5, frameNormal, frameY, frameT, 0.11, bayHeight + 0.18,
            { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, ...cMeta }));
          props.push(orientedBox(face, center + bayWidth * 0.5 + frameT * 0.5, frameNormal, frameY, frameT, 0.11, bayHeight + 0.18,
            { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, ...cMeta }));
          props.push(orientedBox(face, center, frameNormal, frameY + bayHeight * 0.5 + 0.09, bayWidth + frameT * 2, 0.11, 0.12,
            { facadeRole: 'storefront-frame', moduleKey: face.moduleKey, dirKey: face.dirKey, ...cMeta }));
          const canopyDepth = 0.66;
          props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * canopyDepth * 0.5, Math.min(floorH - 0.38, 2.38), bayWidth + 0.42, canopyDepth, 0.10,
            { facadeRole: 'shop-awning', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0, ...cMeta }));
          metrics.storefronts++;
          metrics.canopies++;
        } else if (bayKind === 'technical-panel') {
          props.push(orientedBox(face, center, panelNormal, baseY + floorH * 0.52, bayWidth, 0.09, bayHeight,
            { facadeRole: 'technical-service-panel', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0, ...cMeta }));
          const rails = 4;
          for (let i = 0; i < rails; i++) {
            props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * 0.085,
              baseY + floorH * 0.52 - bayHeight * 0.34 + (bayHeight * 0.68) * (i / (rails - 1)),
              bayWidth * 0.88, 0.08, 0.055,
              { facadeRole: 'technical-panel-louver', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0, ...cMeta }));
          }
          metrics.operationalPanels++;
        } else {
          // Closed operational bay: visually reads as a real door/shutter but does
          // not punch an unowned traversable hole through the collision shell.
          props.push(orientedBox(face, center, panelNormal, baseY + bayHeight * 0.5 + 0.10, bayWidth, 0.08, bayHeight,
            { facadeRole: 'closed-service-shutter', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0, ...cMeta }));
          props.push(orientedBox(face, center, geometry.faceCoord + geometry.outward * 0.07, baseY + bayHeight + 0.19, bayWidth + 0.24, 0.14, 0.18,
            { facadeRole: 'service-shutter-hood', moduleKey: face.moduleKey, dirKey: face.dirKey, floor: 0, ...cMeta }));
          metrics.serviceShutters++;
          metrics.operationalPanels++;
        }
        groundBay = bayKind;
        treatments.push(freezeRecord({
          id: `${stableKey}:${face.moduleKey}:${face.dirKey}:ground-bay`, kind: bayKind,
          moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side, floor: 0,
          width: bayWidth, height: bayHeight, center, ...cMeta,
        }));
      }
    }

    for (let floor = 0; floor < floors; floor++) {
      if (openingByFloor.has(floor)) continue;
      if (programFrontageFloors.has(floor)) continue;
      if (floor === 0 && groundBay) continue;
      const directive = constructionDirectiveFor(face, floor);
      const cMeta = constructionMeta(directive);
      const language = String(directive?.facadeLanguage ?? '');
      let windowCount;
      let width;
      let height;
      let centerHeight;

      if (!directive) {
        windowCount = tangentSpan >= 5.6 ? 2 : 1;
        width = clamp(tangentSpan * (windowCount === 2 ? 0.22 : 0.32), 0.82, 1.28);
        height = clamp(floorH * 0.25, 0.68, 0.90);
        centerHeight = floorH * 0.56;
      } else {
        metrics.constructionDirectedFloors++;
        if (language === 'technical-service') {
          windowCount = 0;
        } else if (language === 'service-opaque') {
          const roll = stableHash(`${stableKey}:${face.moduleKey}:${face.side}:${floor}:service-window`) % 100;
          windowCount = roll < 28 ? 1 : 0;
          width = clamp(tangentSpan * 0.17, 0.58, 0.88);
          height = clamp(floorH * 0.19, 0.50, 0.68);
          centerHeight = floorH * 0.68;
        } else if (language === 'domestic-cellular') {
          windowCount = tangentSpan >= 7.2 ? 3 : tangentSpan >= 4.6 ? 2 : 1;
          width = clamp(tangentSpan / (windowCount + 2.6) * 0.58, 0.72, 1.08);
          height = clamp(floorH * 0.34, 0.92, 1.24);
          centerHeight = floorH * 0.57;
        } else if (language === 'public-open' || language === 'public-service-threshold') {
          windowCount = tangentSpan >= 5.2 ? 2 : 1;
          width = clamp(tangentSpan * (windowCount === 2 ? 0.29 : 0.46), 1.05, 1.72);
          height = clamp(floorH * 0.42, 1.05, 1.42);
          centerHeight = floorH * 0.54;
        } else if (language === 'work-regular') {
          windowCount = tangentSpan >= 5.0 ? 2 : 1;
          width = clamp(tangentSpan * (windowCount === 2 ? 0.27 : 0.40), 0.95, 1.55);
          height = clamp(floorH * 0.30, 0.78, 1.04);
          centerHeight = floorH * 0.62;
        } else if (language === 'large-operational-bay') {
          // Ground operational faces are occupied by the closed bay panel above.
          // Upper floors get a restrained high strip rather than apartment windows.
          windowCount = floor === 0 ? 0 : 1;
          width = clamp(tangentSpan * 0.34, 1.10, 1.85);
          height = clamp(floorH * 0.20, 0.55, 0.72);
          centerHeight = floorH * 0.69;
        } else {
          windowCount = tangentSpan >= 5.6 ? 2 : 1;
          width = clamp(tangentSpan * (windowCount === 2 ? 0.22 : 0.32), 0.82, 1.28);
          height = clamp(floorH * 0.25, 0.68, 0.90);
          centerHeight = floorH * 0.56;
        }
      }

      if (!(windowCount > 0)) {
        if (directive) metrics.opaqueProgramFloors++;
        continue;
      }
      const y = (floorBaseOf(face) + floor) * floorH + centerHeight;
      for (let i = 0; i < windowCount; i++) {
        const u = windowCount === 1 ? 0 : windowCount === 2 ? (i === 0 ? -0.30 : 0.30) : (i - 1) * 0.30;
        const tangent = geometry.tangentCenter + u * geometry.tangentHalf;
        const bottom = centerHeight - height * 0.5;
        apertures.push(freezeRecord({
          id: `${stableKey}:${face.moduleKey}:${face.dirKey}:window-aperture:${floor}:${i}`,
          kind: 'window', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
          floor, floorBase: floorBaseOf(face), center: tangent, width, height, bottom, ...cMeta,
        }));
        props.push(orientedBox(face, tangent, geometry.faceCoord + geometry.outward * 0.055, y - height * 0.5 - 0.055, width + 0.16, 0.12, 0.10,
          { facadeRole: 'window-sill', moduleKey: face.moduleKey, dirKey: face.dirKey, floor, windowIndex: i, ...cMeta }));
        if (directive) {
          windows.push(facadePlane(face, tangent, geometry.faceCoord + geometry.outward * 0.02, y, width, height,
            { facadeRole: 'construction-window-glazing', moduleKey: face.moduleKey, dirKey: face.dirKey, floor, windowIndex: i, ...cMeta }));
          metrics.semanticWindows++;
        }
        treatments.push(freezeRecord({
          id: `${stableKey}:${face.moduleKey}:${face.dirKey}:window:${floor}:${i}`,
          kind: 'window', moduleKey: face.moduleKey, dirKey: face.dirKey, side: face.side,
          floor, center: tangent, width, height, ...cMeta,
        }));
        metrics.windows++;
      }
    }
  }

  return Object.freeze({
    schema: FAST_FACADE_ARCHITECTURE_SCHEMA,
    stableKey: String(stableKey),
    treatments: Object.freeze(treatments),
    apertures: Object.freeze(apertures),
    render: Object.freeze({ props: Object.freeze(props), windows: Object.freeze(windows) }),
    metrics: Object.freeze(metrics),
  });
}
