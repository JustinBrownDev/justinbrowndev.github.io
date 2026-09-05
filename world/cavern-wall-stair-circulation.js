import { FACADE_STAIR_AUTHORITY_SCHEMA, planAlternatingFacadeStair } from './facade-stair-authority.js';
import {
  STAIR_WALKABILITY_DESIGN_INTENT,
  STAIR_WALKABILITY_INTENT,
  assertCavernWallStairWalkability,
} from './stair-volume-contract.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1
export const CAVERN_WALL_STAIR_SCHEMA = 'jweb.cavern-wall-stair-route.v2';
export const CAVERN_WALL_STAIR_MAX_PER_FIELD = 2;
export const CAVERN_WALL_STAIR_MAX_FLOORS = 4;
export const CAVERN_WALL_STAIR_MIN_RUN = 2.7;
export const CAVERN_WALL_STAIR_OFFSET = 0.92;

const SIDES = Object.freeze(['north', 'south', 'west', 'east']);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function primaryKey(entity) {
  const cell = entity?.primaryCell;
  return Number.isFinite(Number(cell?.col)) && Number.isFinite(Number(cell?.row))
    ? `${cell.col},${cell.row}` : null;
}

export function cavernNodePopularity(entity) {
  if (entity?.kind !== 'building') return -Infinity;
  const bridge = Math.max(0, finite(entity.bridgePortalCount));
  const scaffold = Math.max(0, finite(entity.scaffoldLandings));
  const streetRoutes = Math.max(0, finite(entity.fastVerticalRouteCount));
  const streetLayers = Math.max(0, finite(entity.fastExteriorStreetLayerCount));
  const reservations = Math.max(0, finite(entity.circulationReservationCount));
  const modules = Math.max(1, finite(entity.moduleCount, entity.footprintModules?.length ?? 1));
  const floors = Math.max(1, finite(entity.floors, 1));
  return bridge * 8 + scaffold * 5 + streetRoutes * 5 + streetLayers * 2
    + Math.min(18, reservations) * 0.45 + Math.min(8, modules) * 0.35 + Math.min(6, floors) * 0.3;
}

function hasUsefulNetworkDemand(entity) {
  return finite(entity?.bridgePortalCount) > 0
    || finite(entity?.scaffoldLandings) > 0
    || finite(entity?.fastVerticalRouteCount) > 0
    || finite(entity?.fastExteriorStreetLayerCount) > 0;
}

function moduleBaseY(entity, module) {
  if (Number.isFinite(Number(module?.baseY))) return Number(module.baseY);
  const floorH = finite(entity?.floorH, 3.15);
  return finite(entity?.baseY, 0) + Math.max(0, Math.floor(finite(module?.floorBase, 0))) * floorH;
}

function moduleRoofY(entity, module) {
  if (Number.isFinite(Number(module?.roofY))) return Number(module.roofY);
  return moduleBaseY(entity, module) + Math.max(1, Math.floor(finite(module?.floors, 1))) * finite(entity?.floorH, 3.15);
}

function moduleRank(entity, module) {
  return (String(module?.key) === String(primaryKey(entity)) ? 100 : 0)
    + Math.max(0, finite(module?.floors)) * 10
    + Math.max(0, finite(module?.halfX)) + Math.max(0, finite(module?.halfZ));
}

function rebasePoint(point, yOffset) {
  if (!point) return point;
  return Object.freeze({ ...point, y: Number(point.y) + yOffset });
}

function rebaseMouth(mouth, yOffset) {
  if (!mouth) return mouth;
  return Object.freeze({ ...mouth, point: rebasePoint(mouth.point, yOffset) });
}

function boundsForStair(stair, headroom) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const include = rect => {
    minX = Math.min(minX, Number(rect.x) - Number(rect.hx));
    maxX = Math.max(maxX, Number(rect.x) + Number(rect.hx));
    minZ = Math.min(minZ, Number(rect.z) - Number(rect.hz));
    maxZ = Math.max(maxZ, Number(rect.z) + Number(rect.hz));
  };
  for (const landing of stair.landings) include(landing.geometry);
  for (const flight of stair.flights) {
    const center = (Number(flight.from) + Number(flight.to)) * 0.5;
    const halfRun = Math.abs(Number(flight.to) - Number(flight.from)) * 0.5;
    include(flight.axis === 'x'
      ? { x: center, z: flight.fixedCoord, hx: halfRun, hz: flight.halfWidth }
      : { x: flight.fixedCoord, z: center, hx: flight.halfWidth, hz: halfRun });
  }
  const pad = 0.12;
  return {
    x: (minX + maxX) * 0.5,
    z: (minZ + maxZ) * 0.5,
    halfX: (maxX - minX) * 0.5 + pad,
    halfZ: (maxZ - minZ) * 0.5 + pad,
    headroom,
  };
}

function routeForModuleSide({ entity, module, side, field, popularity, truth }) {
  const floorH = Math.max(2.4, finite(entity.floorH, 3.15));
  const availableFloors = Math.max(1, Math.floor(finite(module.floors, entity.floors ?? 1)));

  // Major wall stairs terminate on actual network surfaces. The four-flight P0
  // ceiling is per story; this authority uses one ordinary full-story flight per
  // level, so a tall trunk may span many stories as long as it reaches the roof.
  const y0 = moduleBaseY(entity, module);
  const y1 = moduleRoofY(entity, module);
  if (!(y1 - y0 >= 2.25)) return null;
  const fp = {
    cx: finite(module.cx, NaN), cz: finite(module.cz, NaN),
    halfX: finite(module.halfX, NaN), halfZ: finite(module.halfZ, NaN),
  };
  if (![fp.cx, fp.cz, fp.halfX, fp.halfZ].every(Number.isFinite) || fp.halfX <= 0 || fp.halfZ <= 0) return null;

  const routeId = `${entity.id}:cavern-wall-stair:${module.key}:${side}`;
  const baseStairWidth = Math.max(0.72, finite(truth?.stair?.widthSI, 0.90));
  const networkBulk = Math.min(1, Math.max(0, (popularity - 4) / 24));
  const transferBulk = Math.min(1, Math.max(0, finite(entity?.bridgePortalCount) / 4));
  const routeWidthScale = 1 + networkBulk * 0.42 + transferBulk * 0.30;
  const requestedClearWidth = Math.min(2.15, baseStairWidth * routeWidthScale);
  const planAtWidth = clearWidth => planAlternatingFacadeStair({
    routeId: `${routeId}:geometry`,
    fp,
    side,
    floors: availableFloors,
    floorH,
    physicalTruth: truth,
    stableKey: routeId,
    facadeMargin: 0.18,
    wallGap: 0.16,
    landingTangentSize: Math.max(
      finite(truth?.stair?.landingDepthSI, 1.10),
      clearWidth * 1.45,
    ),
    clearWidthOverride: clearWidth,
  });
  let stair = planAtWidth(requestedClearWidth);
  // Width is a scaling preference, not permission to delete a proven route. If a
  // narrow facade cannot fit the bulkier version, fall back to physical-truth
  // width while keeping the canonical tread/riser geometry untouched.
  if (!stair && requestedClearWidth > baseStairWidth * 1.04) stair = planAtWidth(baseStairWidth);
  if (!stair) return null;

  const landings = stair.landings.map((landing, index) => Object.freeze({
    ...landing,
    id: `${routeId}:landing:${index}`,
    y: y0 + landing.y,
    incomingMouth: rebaseMouth(landing.incomingMouth, y0),
    outgoingMouth: rebaseMouth(landing.outgoingMouth, y0),
    targetPoint: rebasePoint(landing.targetPoint, y0),
    networkStop: index === 0 || index === stair.landings.length - 1,
    networkRole: index === 0 ? 'building-base' : index === stair.landings.length - 1 ? 'roof' : 'turn-only',
  }));

  const flights = stair.flights.map((flight, index) => Object.freeze({
    ...flight,
    id: `${routeId}:flight:${index}`,
    y0: y0 + flight.y0,
    y1: y0 + flight.y1,
    fromLandingId: landings[index].id,
    toLandingId: landings[index + 1].id,
    fromMouth: landings[index].outgoingMouth,
    toMouth: landings[index + 1].incomingMouth,
  }));

  const envelope2d = boundsForStair(stair, finite(truth?.stair?.headroomSI, 2.05));
  const structuralMass = Object.freeze({
    family: 'municipal-concrete',
    waistThickness: Math.max(0.24, stair.clearWidth * 0.20),
    landingSlabThickness: Math.max(0.26, stair.clearWidth * 0.22),
    pierSize: Math.max(0.30, stair.clearWidth * 0.30),
    sideMassThickness: Math.max(0.16, stair.clearWidth * 0.14),
  });
  const networkNodes = Object.freeze([
    Object.freeze({ id: `${routeId}:network:base`, role: 'building-base', y: y0, landingId: landings[0].id, entityId: entity.id, moduleKey: module.key }),
    Object.freeze({ id: `${routeId}:network:roof`, role: 'roof', y: y1, landingId: landings.at(-1).id, entityId: entity.id, moduleKey: module.key }),
  ]);

  const route = Object.freeze({
    schema: CAVERN_WALL_STAIR_SCHEMA,
    designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
    intentTag: STAIR_WALKABILITY_INTENT,
    id: routeId,
    field,
    entityId: entity.id,
    siteId: entity.siteId ?? null,
    moduleKey: module.key,
    side,
    popularity,
    y0,
    y1,
    servedFloors: availableFloors,
    floorH,
    stairWidth: stair.clearWidth,
    routeWidthScale: stair.clearWidth / baseStairWidth,
    landingDepth: stair.landingTangentSize,
    topology: 'landing-routed-cavern-wall-zigzag',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    laneGap: stair.laneGap,
    laneCoords: stair.laneCoords,
    face: Object.freeze({
      tangentAxis: stair.orientation.tangentAxis,
      normalAxis: stair.orientation.normalAxis,
      sign: stair.orientation.outward,
      wallCoord: stair.orientation.faceCoord,
      tangentCenter: stair.tangentCenter,
      min: stair.runLow,
      max: stair.runHigh,
      runLow: stair.runLow,
      runHigh: stair.runHigh,
      landingNormalCenter: stair.landingNormalCenter,
    }),
    flights: Object.freeze(flights),
    landings: Object.freeze(landings),
    networkNodes,
    networkEdges: Object.freeze([Object.freeze({ from: networkNodes[0].id, to: networkNodes[1].id, kind: 'major-stair-trunk', routeId })]),
    structuralMass,
    envelope: Object.freeze({
      x: envelope2d.x,
      z: envelope2d.z,
      halfX: envelope2d.halfX,
      halfZ: envelope2d.halfZ,
      yMin: y0,
      yMax: y1 + envelope2d.headroom,
    }),
    physicalTruth: truth ?? null,
  });
  assertCavernWallStairWalkability(route);
  return route;
}

export function planCavernWallStairCandidates({ entities = [], field = 'ground', maxRoutes = CAVERN_WALL_STAIR_MAX_PER_FIELD } = {}) {
  const candidates = [];
  for (const entity of entities) {
    if (entity?.kind !== 'building' || !entity?.footprintModules?.length) continue;
    const popularity = cavernNodePopularity(entity);
    if (!Number.isFinite(popularity) || popularity < 2.5 || !hasUsefulNetworkDemand(entity)) continue;
    const truth = entity.servicePhysicalTruth ?? entity.physicalTruth;
    if (!truth?.stair) continue;
    const modules = [...entity.footprintModules]
      .sort((a, b) => moduleRank(entity, b) - moduleRank(entity, a) || String(a.key).localeCompare(String(b.key)));
    for (const module of modules) {
      for (const side of SIDES) {
        const route = routeForModuleSide({ entity, module, side, field, popularity, truth });
        if (route) candidates.push(route);
      }
    }
  }

  const sorted = candidates.sort((a, b) =>
    b.popularity - a.popularity
    || (b.y1 - b.y0) - (a.y1 - a.y0)
    || String(a.entityId).localeCompare(String(b.entityId))
    || String(a.moduleKey).localeCompare(String(b.moduleKey))
    || a.side.localeCompare(b.side)
  );
  return sorted.slice(0, Math.max(0, Math.floor(maxRoutes)));
}
