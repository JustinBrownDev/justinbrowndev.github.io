export const HANGING_CITY_SCHEMA = 'jweb.ceiling-city.v3';
export const HANGING_CITY_FLOOR_HEIGHT = 3.15;
// Cut 16: the two macro surfaces remain exact parallel planes.  The ceiling is
// deliberately 60% of Cut 15's 56.7m separation to compress the vertical search
// space and force the two independently sampled city fields to interlock.
export const HANGING_CITY_CEILING_Y = 56.7 * 0.60;
export const HANGING_CITY_PHASE_X = 8192;
export const HANGING_CITY_PHASE_Z = -12289;
export const HANGING_CITY_CLAIM_MARGIN = 2.40;
export const HANGING_CITY_VERTICAL_CLEARANCE = 0.72;
export const HANGING_CITY_UNDERSIDE_RESERVE = 1.35;
export const HANGING_CITY_GROUND_HEADROOM_RESERVE = 5.50;

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

export function ceilingSourceCoordinates(chunkX = 0, chunkZ = 0) {
  const x = Math.trunc(Number(chunkX) || 0) + HANGING_CITY_PHASE_X;
  const z = Math.trunc(Number(chunkZ) || 0) + HANGING_CITY_PHASE_Z;
  return Object.freeze({ x, z, key: `${x},${z}` });
}

export function ceilingFrame(anchorY = HANGING_CITY_CEILING_Y) {
  return Object.freeze({
    schema: 'jweb.ceiling-growth-frame.v1',
    id: `ceiling-city-frame:${Number(anchorY).toFixed(3)}`,
    anchorY,
    growthDirection: 'world-down',
    gravityDirection: 'world-down',
    cameraUpDirection: 'world-up',
    playerTraversal: 'ordinary',
    macroSurface: 'flat-white-ceiling-plane',
  });
}

export function expandedHorizontalClaim(bounds, margin = HANGING_CITY_CLAIM_MARGIN) {
  if (!bounds) return null;
  const m = Math.max(0, Number(margin) || 0);
  const minX = Number(bounds.minX ?? (Number(bounds.x) - Number(bounds.halfX)));
  const maxX = Number(bounds.maxX ?? (Number(bounds.x) + Number(bounds.halfX)));
  const minZ = Number(bounds.minZ ?? (Number(bounds.z) - Number(bounds.halfZ)));
  const maxZ = Number(bounds.maxZ ?? (Number(bounds.z) + Number(bounds.halfZ)));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  return Object.freeze({ minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m });
}

export function horizontalClaimsOverlap(a, b, epsilon = 1e-6) {
  if (!a || !b) return false;
  const e = Math.max(0, Number(epsilon) || 0);
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > e
    && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > e;
}

export function groundBuildingClaim(entity, {
  margin = HANGING_CITY_CLAIM_MARGIN,
  roofReserve = HANGING_CITY_GROUND_HEADROOM_RESERVE,
} = {}) {
  if (!entity || entity.kind !== 'building') return null;
  const horizontal = expandedHorizontalClaim(entity.compoundBounds ?? entity, margin);
  if (!horizontal) return null;
  const floorHeight = Math.max(0.1, Number(entity.floorH) || HANGING_CITY_FLOOR_HEIGHT);
  const occupiedTopY = Math.max(0, Number(entity.baseY) || 0) + Math.max(1, Number(entity.floors) || 1) * floorHeight;
  return Object.freeze({
    entityId: entity.id ?? null,
    ...horizontal,
    topY: Math.min(HANGING_CITY_CEILING_Y, occupiedTopY + Math.max(0, Number(roofReserve) || 0)),
  });
}

export function planCeilingBuildingHeight({
  siteBounds,
  groundEntities = [],
  desiredFloors = 6,
  floorHeight = HANGING_CITY_FLOOR_HEIGHT,
  ceilingY = HANGING_CITY_CEILING_Y,
  margin = HANGING_CITY_CLAIM_MARGIN,
  verticalClearance = HANGING_CITY_VERTICAL_CLEARANCE,
  undersideReserve = HANGING_CITY_UNDERSIDE_RESERVE,
  minimumFloors = 1,
} = {}) {
  const horizontal = expandedHorizontalClaim(siteBounds, margin);
  const fh = Math.max(0.1, Number(floorHeight) || HANGING_CITY_FLOOR_HEIGHT);
  const desired = Math.max(1, Math.floor(Number(desiredFloors) || 1));
  let blockingTopY = 0;
  const blockers = [];
  for (const entity of groundEntities) {
    const claim = groundBuildingClaim(entity, { margin });
    if (!claim || !horizontalClaimsOverlap(horizontal, claim)) continue;
    blockingTopY = Math.max(blockingTopY, claim.topY);
    blockers.push(claim.entityId);
  }
  const availableHeight = Math.max(0, ceilingY - blockingTopY - verticalClearance - undersideReserve);
  const maxFloors = Math.max(0, Math.floor((availableHeight + 1e-8) / fh));
  const floors = Math.min(desired, maxFloors);
  const accepted = floors >= Math.max(1, Math.floor(minimumFloors));
  const occupiedHeight = accepted ? floors * fh : 0;
  const baseY = accepted ? ceilingY - occupiedHeight : ceilingY;
  return Object.freeze({
    schema: 'jweb.ceiling-building-height-budget.v1',
    accepted,
    desiredFloors: desired,
    floors: accepted ? floors : 0,
    maxFloors,
    floorHeight: fh,
    ceilingY,
    baseY,
    occupiedHeight,
    blockingTopY,
    verticalClearance,
    undersideReserve,
    blockers: Object.freeze(blockers.filter(Boolean).sort()),
    horizontal,
  });
}

export function maximumCavernFloors(floorHeight, {
  ceilingY = HANGING_CITY_CEILING_Y,
  reserve = HANGING_CITY_GROUND_HEADROOM_RESERVE,
  hardCap = 12,
} = {}) {
  const fh = Math.max(0.1, Number(floorHeight) || HANGING_CITY_FLOOR_HEIGHT);
  return clamp(Math.floor(Math.max(fh, ceilingY - reserve) / fh), 1, Math.max(1, Math.floor(hardCap)));
}

export function cloneBridgePlansForCeilingCity(bridgePlans = [], sourceKey = 'ceiling') {
  return bridgePlans.map(plan => {
    const id = `${plan.id}:ceiling:${sourceKey}`;
    const aEndpoint = { ...plan.aEndpoint, id: `${id}:endpoint:a`, bridgeId: id, resolved: false };
    const bEndpoint = { ...plan.bEndpoint, id: `${id}:endpoint:b`, bridgeId: id, resolved: false };
    delete aEndpoint.x; delete aEndpoint.y; delete aEndpoint.z;
    delete bEndpoint.x; delete bEndpoint.y; delete bEndpoint.z;
    return { ...plan, id, aEndpoint, bEndpoint, growthDirection: 'world-down', gravityDirection: 'world-down' };
  });
}

export function bridgePortalMapForPlans(bridgePlans = []) {
  const map = new Map();
  const add = (siteId, endpoint) => {
    if (!map.has(siteId)) map.set(siteId, []);
    map.get(siteId).push(endpoint);
  };
  for (const plan of bridgePlans) {
    add(plan.aSiteId, plan.aEndpoint);
    add(plan.bSiteId, plan.bEndpoint);
  }
  return map;
}
