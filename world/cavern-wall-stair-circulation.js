export const CAVERN_WALL_STAIR_SCHEMA = 'jweb.cavern-wall-stair-route.v1';
export const CAVERN_WALL_STAIR_MAX_PER_FIELD = 2;
export const CAVERN_WALL_STAIR_MAX_FLOORS = 4;
export const CAVERN_WALL_STAIR_MIN_RUN = 2.7;
export const CAVERN_WALL_STAIR_OFFSET = 0.92;

const SIDES = Object.freeze([
  Object.freeze({ side: 'north', normalAxis: 'z', tangentAxis: 'x', sign: -1 }),
  Object.freeze({ side: 'south', normalAxis: 'z', tangentAxis: 'x', sign: 1 }),
  Object.freeze({ side: 'west', normalAxis: 'x', tangentAxis: 'z', sign: -1 }),
  Object.freeze({ side: 'east', normalAxis: 'x', tangentAxis: 'z', sign: 1 }),
]);

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

function moduleBaseY(entity, module) {
  if (Number.isFinite(Number(module?.baseY))) return Number(module.baseY);
  const floorH = finite(entity?.floorH, 3.15);
  return finite(entity?.baseY, 0) + Math.max(0, Math.floor(finite(module?.floorBase, 0))) * floorH;
}

function moduleRoofY(entity, module) {
  if (Number.isFinite(Number(module?.roofY))) return Number(module.roofY);
  return moduleBaseY(entity, module) + Math.max(1, Math.floor(finite(module?.floors, 1))) * finite(entity?.floorH, 3.15);
}

function faceGeometry(module, side, stairWidth, landingDepth) {
  const cx = finite(module?.cx, NaN), cz = finite(module?.cz, NaN);
  const halfX = finite(module?.halfX, NaN), halfZ = finite(module?.halfZ, NaN);
  if (![cx, cz, halfX, halfZ].every(Number.isFinite) || halfX <= 0 || halfZ <= 0) return null;
  const def = SIDES.find(item => item.side === side);
  if (!def) return null;
  const tangentCenter = def.tangentAxis === 'x' ? cx : cz;
  const tangentHalf = def.tangentAxis === 'x' ? halfX : halfZ;
  const normalCenter = def.normalAxis === 'x' ? cx : cz;
  const normalHalf = def.normalAxis === 'x' ? halfX : halfZ;
  const runInset = Math.max(stairWidth * 0.65, landingDepth * 0.45);
  const min = tangentCenter - tangentHalf + runInset;
  const max = tangentCenter + tangentHalf - runInset;
  const run = max - min;
  if (!(run >= CAVERN_WALL_STAIR_MIN_RUN)) return null;
  const wallCoord = normalCenter + def.sign * normalHalf;
  const fixedCoord = wallCoord + def.sign * (landingDepth * 0.5 + 0.06);
  return { ...def, tangentCenter, tangentHalf, min, max, run, fixedCoord, wallCoord };
}

function sideOrder(entity, module) {
  const key = `${entity?.id ?? ''}:${module?.key ?? ''}`;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  const offset = hash % SIDES.length;
  return Array.from({ length: SIDES.length }, (_, i) => SIDES[(i + offset) % SIDES.length].side);
}

function moduleRank(entity, module) {
  return (String(module?.key) === String(primaryKey(entity)) ? 100 : 0)
    + Math.max(0, finite(module?.floors)) * 10
    + Math.max(0, finite(module?.halfX)) + Math.max(0, finite(module?.halfZ));
}

export function planCavernWallStairCandidates({ entities = [], field = 'ground', maxRoutes = CAVERN_WALL_STAIR_MAX_PER_FIELD } = {}) {
  const candidates = [];
  for (const entity of entities) {
    if (entity?.kind !== 'building' || !entity?.footprintModules?.length) continue;
    const popularity = cavernNodePopularity(entity);
    if (!Number.isFinite(popularity) || popularity < 2.5) continue;
    const truth = entity.servicePhysicalTruth ?? entity.physicalTruth;
    const stairWidth = Math.max(0.82, Math.min(1.35, finite(truth?.stair?.widthSI, 1.02)));
    const landingDepth = Math.max(0.92, Math.min(1.55, finite(truth?.stair?.landingDepthSI, 1.18)));
    const modules = [...entity.footprintModules].sort((a, b) => moduleRank(entity, b) - moduleRank(entity, a) || String(a.key).localeCompare(String(b.key)));
    for (const module of modules.slice(0, 3)) {
      const y0 = moduleBaseY(entity, module);
      const fullTop = moduleRoofY(entity, module);
      const floorH = Math.max(2.4, finite(entity.floorH, 3.15));
      const availableFloors = Math.max(1, Math.floor(finite(module.floors, entity.floors ?? 1)));
      const servedFloors = Math.min(CAVERN_WALL_STAIR_MAX_FLOORS, availableFloors);
      const y1 = Math.min(fullTop, y0 + servedFloors * floorH);
      if (!(y1 - y0 >= 2.25)) continue;
      for (const side of sideOrder(entity, module)) {
        const face = faceGeometry(module, side, stairWidth, landingDepth);
        if (!face) continue;
        const flightCount = Math.max(1, Math.min(servedFloors, Math.ceil((y1 - y0) / 2.75)));
        const flights = [];
        const landings = [];
        const startAtMin = ((String(entity.id).length + String(module.key).length + side.length) & 1) === 0;
        for (let i = 0; i <= flightCount; i++) {
          const atMin = (i % 2 === 0) ? startAtMin : !startAtMin;
          const tangent = atMin ? face.min : face.max;
          const y = y0 + (y1 - y0) * (i / flightCount);
          const x = face.tangentAxis === 'x' ? tangent : face.fixedCoord;
          const z = face.tangentAxis === 'z' ? tangent : face.fixedCoord;
          landings.push(Object.freeze({ id: `${entity.id}:cavern-wall:${module.key}:${side}:landing:${i}`, x, z, y, tangent }));
          if (i === 0) continue;
          const previous = landings[i - 1];
          flights.push(Object.freeze({
            id: `${entity.id}:cavern-wall:${module.key}:${side}:flight:${i - 1}`,
            axis: face.tangentAxis,
            from: previous.tangent,
            to: tangent,
            fixedCoord: face.fixedCoord,
            y0: previous.y,
            y1: y,
            run: Math.abs(tangent - previous.tangent),
            halfWidth: stairWidth * 0.5,
            clearWidth: stairWidth,
          }));
        }
        const routeId = `${entity.id}:cavern-wall-stair:${module.key}:${side}`;
        const normalHalf = landingDepth * 0.55;
        const tangentHalf = face.run * 0.5 + landingDepth * 0.5;
        candidates.push(Object.freeze({
          schema: CAVERN_WALL_STAIR_SCHEMA,
          id: routeId,
          field,
          entityId: entity.id,
          siteId: entity.siteId ?? null,
          moduleKey: module.key,
          side,
          popularity,
          y0,
          y1,
          servedFloors,
          floorH,
          stairWidth,
          landingDepth,
          face,
          flights: Object.freeze(flights),
          landings: Object.freeze(landings),
          envelope: Object.freeze({
            x: face.normalAxis === 'x' ? face.fixedCoord : face.tangentCenter,
            z: face.normalAxis === 'z' ? face.fixedCoord : face.tangentCenter,
            halfX: face.normalAxis === 'x' ? normalHalf : tangentHalf,
            halfZ: face.normalAxis === 'z' ? normalHalf : tangentHalf,
            yMin: y0,
            yMax: y1 + Math.max(1.9, finite(truth?.stair?.headroomSI, 2.05)),
          }),
          physicalTruth: truth ?? null,
        }));
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
