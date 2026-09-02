export const CIRCULATION_COLLISION_AUTHORITY_SCHEMA = 'jweb.circulation-collision-authority.v1';

const EPS = 1e-6;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boxRecord({ id, kind, x, z, halfX, halfZ, yMin, yMax, metadata = null }) {
  const hx = Math.max(EPS, finite(halfX));
  const hz = Math.max(EPS, finite(halfZ));
  const loY = finite(yMin);
  const hiY = finite(yMax);
  if (!(hiY > loY + EPS)) throw new Error(`${id}: circulation collision volume requires positive height`);
  return Object.freeze({
    schema: CIRCULATION_COLLISION_AUTHORITY_SCHEMA,
    id: String(id),
    kind: String(kind),
    x: finite(x),
    z: finite(z),
    halfX: hx,
    halfZ: hz,
    minX: finite(x) - hx,
    maxX: finite(x) + hx,
    minZ: finite(z) - hz,
    maxZ: finite(z) + hz,
    yMin: loY,
    yMax: hiY,
    ...(metadata || {}),
  });
}

export function publishedCirculationReservation(reservation) {
  if (!reservation?.id) throw new Error('circulation collision publication requires reservation id');
  // Collision authority records stay immutable. Shared legacy circulation state is
  // intentionally mutable because semantic/access systems annotate reservations.
  // This projection remains clearance-only and must never synthesize an access connector.
  return {
    ...reservation,
    source: reservation.source ?? 'circulation-collision-authority',
    collisionAuthorityId: reservation.id,
    semanticConnectorEligible: false,
  };
}

function landingGeometry(landing) {
  const raw = landing?.geometry ?? landing;
  if (!raw) return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  const halfX = Number.isFinite(Number(raw.hx)) ? Number(raw.hx) : Number(raw.sx) * 0.5;
  const halfZ = Number.isFinite(Number(raw.hz)) ? Number(raw.hz) : Number(raw.sz) * 0.5;
  if (![x, z, halfX, halfZ].every(Number.isFinite) || !(halfX > 0) || !(halfZ > 0)) return null;
  return { x, z, halfX, halfZ };
}

export function exteriorRouteClearanceReservations(plan, { guardMargin = 0.05 } = {}) {
  if (!plan?.id) return [];
  const headroom = Math.max(1.80,
    finite(plan?.physicalTruth?.stair?.headroomSI,
      finite(plan?.physicalTruth?.route?.headroomSI, 1.95)));
  const margin = Math.max(0, finite(guardMargin));
  const result = [];

  for (const flight of plan.flights ?? []) {
    if (flight.axis !== 'x' && flight.axis !== 'z') continue;
    const from = finite(flight.from);
    const to = finite(flight.to);
    const center = (from + to) * 0.5;
    const halfRun = Math.abs(to - from) * 0.5;
    const halfWidth = Math.max(EPS, finite(flight.halfWidth)) + margin;
    const y0 = Math.min(finite(flight.y0), finite(flight.y1));
    const y1 = Math.max(finite(flight.y0), finite(flight.y1));
    result.push(boxRecord({
      id: `${plan.id}:collision:${flight.id ?? `flight-${result.length}`}`,
      kind: 'exterior-flight-clearance',
      x: flight.axis === 'x' ? center : finite(flight.fixedCoord),
      z: flight.axis === 'z' ? center : finite(flight.fixedCoord),
      halfX: flight.axis === 'x' ? halfRun + margin : halfWidth,
      halfZ: flight.axis === 'z' ? halfRun + margin : halfWidth,
      yMin: y0,
      yMax: y1 + Math.max(headroom, finite(flight.headroom, headroom)),
      metadata: { routeId: plan.id, sourceId: flight.id ?? null, sourceKind: 'flight' },
    }));
  }

  const landings = plan.generatedLandings?.length ? plan.generatedLandings : (plan.landings ?? []);
  for (const landing of landings) {
    const geometry = landingGeometry(landing);
    if (!geometry) continue;
    const y = finite(landing.y);
    result.push(boxRecord({
      id: `${plan.id}:collision:${landing.id ?? `landing-${result.length}`}`,
      kind: 'exterior-landing-clearance',
      x: geometry.x,
      z: geometry.z,
      halfX: geometry.halfX + margin,
      halfZ: geometry.halfZ + margin,
      yMin: y - 0.10,
      yMax: y + headroom,
      metadata: { routeId: plan.id, sourceId: landing.id ?? null, sourceKind: 'landing' },
    }));
  }

  return Object.freeze(result);
}

export function buildConservativeBuildingObstacles({
  currentSiteId = null,
  modulePlans = [],
  floorH = 3.15,
  siteIdOf = [],
  openSiteIds = new Set(),
  cx0 = 0,
  cz0 = 0,
  half = 32,
  cellSize = 7,
  foreignEncroachmentFraction = 0.16,
  maxForeignHeight = 72,
} = {}) {
  const obstacles = [];
  for (const module of modulePlans ?? []) {
    const rect = module?.rect;
    if (!rect) continue;
    obstacles.push(boxRecord({
      id: `building:${currentSiteId ?? 'site'}:module:${module.key ?? obstacles.length}`,
      kind: 'building-envelope',
      x: rect.cx,
      z: rect.cz,
      halfX: rect.halfX,
      halfZ: rect.halfZ,
      yMin: 0,
      yMax: Math.max(0.5, finite(module.floors, 1) * Math.max(2.4, finite(floorH, 3.15))),
      metadata: { siteId: currentSiteId, moduleKey: module.key ?? null, obstacleSource: 'resolved-local-module' },
    }));
  }

  const openIds = openSiteIds instanceof Set ? openSiteIds : new Set(openSiteIds ?? []);
  const size = Math.max(EPS, finite(cellSize, 7));
  const extra = size * Math.max(0, finite(foreignEncroachmentFraction, 0.16));
  for (let row = 0; row < (siteIdOf?.length ?? 0); row++) {
    const rowData = siteIdOf[row] ?? [];
    for (let col = 0; col < rowData.length; col++) {
      const siteId = rowData[col];
      if (!(siteId >= 0) || siteId === currentSiteId || openIds.has(siteId)) continue;
      const x = finite(cx0) - finite(half) + (col + 0.5) * size;
      const z = finite(cz0) - finite(half) + (row + 0.5) * size;
      obstacles.push(boxRecord({
        id: `building:${siteId}:cell:${col},${row}`,
        kind: 'conservative-building-envelope',
        x,
        z,
        halfX: size * 0.5 + extra,
        halfZ: size * 0.5 + extra,
        yMin: 0,
        yMax: Math.max(4, finite(maxForeignHeight, 72)),
        metadata: { siteId, cell: `${col},${row}`, obstacleSource: 'pre-massing-site-cell' },
      }));
    }
  }
  return Object.freeze(obstacles);
}


export function wallSegmentBuildingObstacles(walls = [], { wallThickness = 0.16 } = {}) {
  const thickness = Math.max(0.02, finite(wallThickness, 0.16));
  const result = [];
  for (let index = 0; index < (walls?.length ?? 0); index++) {
    const wall = walls[index];
    const x1 = Number(wall?.x1), x2 = Number(wall?.x2);
    const z1 = Number(wall?.z1), z2 = Number(wall?.z2);
    const yMin = Number(wall?.yMin), yMax = Number(wall?.yMax);
    if (![x1, x2, z1, z2, yMin, yMax].every(Number.isFinite) || !(yMax > yMin + EPS)) continue;
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    result.push(boxRecord({
      id: `wall:${wall?.id ?? index}`,
      kind: 'published-wall-obstacle',
      x: (x1 + x2) * 0.5,
      z: (z1 + z2) * 0.5,
      halfX: Math.max(thickness * 0.5, dx * 0.5 + (dz > EPS ? thickness * 0.5 : 0)),
      halfZ: Math.max(thickness * 0.5, dz * 0.5 + (dx > EPS ? thickness * 0.5 : 0)),
      yMin,
      yMax,
      metadata: {
        obstacleSource: 'published-wall-segment',
        wallSupportKind: wall?.supportKind ?? null,
        routeId: wall?.routeId ?? null,
      },
    }));
  }
  return Object.freeze(result);
}

export function circulationVolumesIntersect(a, b, padding = 0) {
  const pad = Math.max(0, finite(padding));
  return a.yMin < b.yMax - EPS && a.yMax > b.yMin + EPS
    && a.minX - pad < b.maxX - EPS && a.maxX + pad > b.minX + EPS
    && a.minZ - pad < b.maxZ - EPS && a.maxZ + pad > b.minZ + EPS;
}

export function firstCirculationVolumeConflict(left = [], right = [], padding = 0) {
  for (const a of left ?? []) {
    for (const b of right ?? []) {
      if (circulationVolumesIntersect(a, b, padding)) return { reservation: a, blocker: b };
    }
  }
  return null;
}

export function reservationStaysOutsideFacade(reservation, hostRect, side, tolerance = 0.015) {
  if (!reservation || !hostRect) return false;
  const tol = Math.max(0, finite(tolerance));
  if (side === 'north') return reservation.maxZ <= finite(hostRect.cz) - finite(hostRect.halfZ) + tol;
  if (side === 'south') return reservation.minZ >= finite(hostRect.cz) + finite(hostRect.halfZ) - tol;
  if (side === 'west') return reservation.maxX <= finite(hostRect.cx) - finite(hostRect.halfX) + tol;
  if (side === 'east') return reservation.minX >= finite(hostRect.cx) + finite(hostRect.halfX) - tol;
  return false;
}

export function evaluateExteriorRouteCollision({ plan, obstacles = [], hostRect = null, side = plan?.side, padding = 0.02 } = {}) {
  const reservations = exteriorRouteClearanceReservations(plan);
  const resolvedHost = hostRect ?? plan?.hostRect ?? plan?.face?.rect ?? null;
  const hostBoundaryViolations = resolvedHost
    ? reservations.filter(reservation => !reservationStaysOutsideFacade(reservation, resolvedHost, side))
    : [...reservations];
  const blockers = [];
  for (const reservation of reservations) {
    for (const obstacle of obstacles ?? []) {
      if (!circulationVolumesIntersect(reservation, obstacle, padding)) continue;
      blockers.push({ reservation, obstacle });
      break;
    }
  }
  return Object.freeze({
    schema: CIRCULATION_COLLISION_AUTHORITY_SCHEMA,
    routeId: plan?.id ?? null,
    accepted: hostBoundaryViolations.length === 0 && blockers.length === 0,
    reservations,
    hostBoundaryViolations: Object.freeze(hostBoundaryViolations),
    blockers: Object.freeze(blockers),
    apertureExceptionAllowed: false,
    handoffRule: 'exterior-solids-stop-before-facade-plane',
  });
}
