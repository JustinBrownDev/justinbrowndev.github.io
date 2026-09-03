export const CAVERN_LADDER_SCHEMA = 'jweb.cavern-ladder-route.v1';
export const CAVERN_LADDER_APERTURE_WIDTH = 1.12;
export const CAVERN_LADDER_APERTURE_DEPTH = 1.00;
export const CAVERN_LADDER_MIN_SPAN = 1.15;
export const CAVERN_LADDER_MAX_SPAN = 19.5;
export const CAVERN_LADDER_EDGE_MARGIN = 0.22;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function moduleRect(module) {
  const cx = finite(module?.cx);
  const cz = finite(module?.cz);
  const halfX = Math.max(0, finite(module?.halfX));
  const halfZ = Math.max(0, finite(module?.halfZ));
  return { minX: cx - halfX, maxX: cx + halfX, minZ: cz - halfZ, maxZ: cz + halfZ };
}

function overlapRect(a, b) {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  if (!(maxX > minX && maxZ > minZ)) return null;
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function groundModuleRoofY(entity, module) {
  const floorH = finite(entity?.floorH, 3.15);
  const baseY = finite(entity?.baseY, 0);
  const floorBase = Math.max(0, Math.floor(finite(module?.floorBase, 0)));
  const floors = Math.max(1, Math.floor(finite(module?.floors, 1)));
  return baseY + (floorBase + floors) * floorH;
}

function ceilingModuleTipY(entity, module) {
  if (Number.isFinite(Number(module?.baseY))) return Number(module.baseY);
  const floorH = finite(entity?.floorH, 3.15);
  const baseY = finite(entity?.baseY, 0);
  return baseY + Math.max(0, Math.floor(finite(module?.floorBase, 0))) * floorH;
}

function primaryModuleKey(entity) {
  const cell = entity?.primaryCell;
  return Number.isFinite(cell?.col) && Number.isFinite(cell?.row) ? `${cell.col},${cell.row}` : null;
}

function lowerSurfaceAccessibility(entity) {
  if ((finite(entity?.circulationReservationCount) || 0) > 0) return 3;
  if ((finite(entity?.scaffoldLandings) || 0) > 0) return 2;
  if ((finite(entity?.fastVerticalRouteCount) || 0) > 0) return 2;
  return 1;
}

function candidatePositions(overlap, apertureWidth, apertureDepth) {
  const insetX = apertureWidth * 0.5 + CAVERN_LADDER_EDGE_MARGIN;
  const insetZ = apertureDepth * 0.5 + CAVERN_LADDER_EDGE_MARGIN;
  const x0 = overlap.minX + insetX;
  const x1 = overlap.maxX - insetX;
  const z0 = overlap.minZ + insetZ;
  const z1 = overlap.maxZ - insetZ;
  if (x1 < x0 || z1 < z0) return [];
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const positions = [
    [cx, cz],
    [x0, z0], [x1, z1], [x0, z1], [x1, z0],
  ];
  const seen = new Set();
  return positions.filter(([x, z]) => {
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planCavernLadderCandidates({
  ceilingEntity,
  groundEntities = [],
  apertureWidth = CAVERN_LADDER_APERTURE_WIDTH,
  apertureDepth = CAVERN_LADDER_APERTURE_DEPTH,
  minSpan = CAVERN_LADDER_MIN_SPAN,
  maxSpan = CAVERN_LADDER_MAX_SPAN,
} = {}) {
  if (!ceilingEntity?.footprintModules?.length) return [];
  const primaryKey = primaryModuleKey(ceilingEntity);
  const candidates = [];

  for (const ceilingModule of ceilingEntity.footprintModules) {
    const upperY = ceilingModuleTipY(ceilingEntity, ceilingModule);
    const ceilingRect = moduleRect(ceilingModule);
    for (const groundEntity of groundEntities) {
      if (groundEntity?.kind !== 'building' || !groundEntity?.footprintModules?.length) continue;
      for (const groundModule of groundEntity.footprintModules) {
        const lowerY = groundModuleRoofY(groundEntity, groundModule);
        const span = upperY - lowerY;
        if (!(span >= minSpan && span <= maxSpan)) continue;
        const overlap = overlapRect(ceilingRect, moduleRect(groundModule));
        if (!overlap) continue;
        if (overlap.width < apertureWidth + CAVERN_LADDER_EDGE_MARGIN * 2) continue;
        if (overlap.depth < apertureDepth + CAVERN_LADDER_EDGE_MARGIN * 2) continue;
        const accessRank = lowerSurfaceAccessibility(groundEntity);
        const primaryRank = String(ceilingModule.key) === String(primaryKey) ? 1 : 0;
        const area = overlap.width * overlap.depth;
        for (const [x, z] of candidatePositions(overlap, apertureWidth, apertureDepth)) {
          candidates.push(Object.freeze({
            schema: CAVERN_LADDER_SCHEMA,
            x, z, y0: lowerY, y1: upperY, span,
            apertureWidth, apertureDepth,
            ceilingEntityId: ceilingEntity.id,
            ceilingModuleKey: ceilingModule.key,
            groundEntityId: groundEntity.id,
            groundModuleKey: groundModule.key,
            accessRank, primaryRank, overlapArea: area,
          }));
        }
      }
    }
  }

  return candidates.sort((a, b) =>
    b.accessRank - a.accessRank
    || b.primaryRank - a.primaryRank
    || a.span - b.span
    || b.overlapArea - a.overlapArea
    || String(a.ceilingModuleKey).localeCompare(String(b.ceilingModuleKey))
    || String(a.groundEntityId).localeCompare(String(b.groundEntityId))
    || a.x - b.x || a.z - b.z
  );
}

export function splitRectAroundAperture({ x, z, halfX, halfZ }, { x: gapX, z: gapZ, width, depth }) {
  const x0 = x - halfX, x1 = x + halfX;
  const z0 = z - halfZ, z1 = z + halfZ;
  const gx0 = Math.max(x0, gapX - width * 0.5), gx1 = Math.min(x1, gapX + width * 0.5);
  const gz0 = Math.max(z0, gapZ - depth * 0.5), gz1 = Math.min(z1, gapZ + depth * 0.5);
  if (!(gx1 > gx0 && gz1 > gz0)) return null;
  const pieces = [];
  const push = (minX, maxX, minZ, maxZ) => {
    if (maxX - minX <= 0.05 || maxZ - minZ <= 0.05) return;
    pieces.push({
      x: (minX + maxX) * 0.5,
      z: (minZ + maxZ) * 0.5,
      halfX: (maxX - minX) * 0.5,
      halfZ: (maxZ - minZ) * 0.5,
    });
  };
  push(x0, gx0, z0, z1);
  push(gx1, x1, z0, z1);
  push(gx0, gx1, z0, gz0);
  push(gx0, gx1, gz1, z1);
  return pieces;
}
