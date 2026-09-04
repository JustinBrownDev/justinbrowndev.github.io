import { buildRouteOwnedPlaceScene, summarizeRouteOwnedPlaceParts } from './route-owned-place-scenes.js';

export const ROUTE_OWNED_PLAZA_PLACE_SCHEMA = 'jweb.route-owned-plaza-place.v1';
export const ROUTE_OWNED_PLAZA_PLACE_PLAN_SCHEMA = 'jweb.route-owned-plaza-place-plan.v1';

export const ROUTE_OWNED_PLAZA_PLACE_TYPES = Object.freeze([
  Object.freeze({ placeType: 'street-bodega', sceneType: 'roof-bodega' }),
  Object.freeze({ placeType: 'thrift-stall', sceneType: 'thrift-stall' }),
  Object.freeze({ placeType: 'gallery-pocket', sceneType: 'gallery-terrace' }),
  Object.freeze({ placeType: 'repair-bay', sceneType: 'repair-bay' }),
  Object.freeze({ placeType: 'refuge', sceneType: 'refuge' }),
  Object.freeze({ placeType: 'utility-yard', sceneType: 'utility-yard' }),
  Object.freeze({ placeType: 'fuel-kiosk', sceneType: 'fuel-kiosk' }),
]);

const DEFAULT_MARGIN = 0.52;
const DEFAULT_CORRIDOR_HALF = 1.02;
const DEFAULT_DENSITY = 0.72;
const EPS = 1e-6;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rectsOverlap(a, b, clearance = 0) {
  return Math.abs(finite(a.x) - finite(b.x)) < finite(a.halfX ?? a.hx) + finite(b.halfX ?? b.hx) + clearance
    && Math.abs(finite(a.z) - finite(b.z)) < finite(a.halfZ ?? a.hz) + finite(b.halfZ ?? b.hz) + clearance;
}
function blockerRect(blocker) {
  if (!blocker || !Number.isFinite(Number(blocker.x)) || !Number.isFinite(Number(blocker.z))) return null;
  if (Number.isFinite(Number(blocker.halfX ?? blocker.hx)) && Number.isFinite(Number(blocker.halfZ ?? blocker.hz))) {
    return {
      x: Number(blocker.x), z: Number(blocker.z),
      halfX: Number(blocker.halfX ?? blocker.hx), halfZ: Number(blocker.halfZ ?? blocker.hz),
    };
  }
  if (Number.isFinite(Number(blocker.radius))) {
    const radius = Math.max(0.08, Number(blocker.radius));
    return { x: Number(blocker.x), z: Number(blocker.z), halfX: radius, halfZ: radius };
  }
  return null;
}
function blockerTouchesGround(blocker, y = 0) {
  const yMin = Number.isFinite(Number(blocker?.yMin)) ? Number(blocker.yMin) : 0;
  const yMax = Number.isFinite(Number(blocker?.height)) ? Number(blocker.height)
    : Number.isFinite(Number(blocker?.yMax)) ? Number(blocker.yMax)
      : Number.isFinite(Number(blocker?.y)) ? Number(blocker.y) + 0.25 : Infinity;
  return y >= yMin - 0.25 && y <= yMax + 0.25;
}
function centralCrossConflict(candidate, cell, corridorHalf) {
  const dx = Math.abs(candidate.x - cell.x);
  const dz = Math.abs(candidate.z - cell.z);
  return dx < corridorHalf + candidate.halfX || dz < corridorHalf + candidate.halfZ;
}
function candidatePads(cell, { halfX, halfZ, margin, stableKey }) {
  const xOffset = Math.max(0, finite(cell.halfX) - halfX - margin);
  const zOffset = Math.max(0, finite(cell.halfZ) - halfZ - margin);
  const raw = [
    { x: finite(cell.x) - xOffset, z: finite(cell.z) - zOffset, corner: 'nw' },
    { x: finite(cell.x) + xOffset, z: finite(cell.z) - zOffset, corner: 'ne' },
    { x: finite(cell.x) + xOffset, z: finite(cell.z) + zOffset, corner: 'se' },
    { x: finite(cell.x) - xOffset, z: finite(cell.z) + zOffset, corner: 'sw' },
  ];
  const shift = stableHash(`${stableKey}:${cell.id ?? `${cell.x}:${cell.z}`}:corner`) % raw.length;
  return raw.slice(shift).concat(raw.slice(0, shift));
}

export function plazaPlaceFootprintIntersectsBlocker(place, blocker, clearance = 0.18) {
  const rect = blockerRect(blocker);
  if (!rect || !blockerTouchesGround(blocker, finite(place?.y))) return false;
  return rectsOverlap(place, rect, clearance);
}

export function planRouteOwnedPlazaPlaces({
  plazas = [],
  blockers = [],
  stableKey = 'route-owned-plaza-places',
  field = 'ground',
  density = DEFAULT_DENSITY,
  maxPlaces = 6,
  minPlaces = 1,
  corridorHalf = DEFAULT_CORRIDOR_HALF,
  margin = DEFAULT_MARGIN,
} = {}) {
  const hosts = plazas
    .filter(plaza => plaza?.kind === 'plaza'
      && plaza.kowloonServiceVoid !== true
      && plaza.roadAdjacent !== false
      && Array.isArray(plaza.footprintCells)
      && plaza.footprintCells.some(cell => finite(cell.halfX) >= 2.35 && finite(cell.halfZ) >= 2.35))
    .map(plaza => ({ ...plaza }))
    .sort((a, b) => {
      const ah = stableHash(`${stableKey}:${a.id}`), bh = stableHash(`${stableKey}:${b.id}`);
      return ah - bh || String(a.id).localeCompare(String(b.id));
    });

  const target = hosts.length
    ? Math.min(Math.max(0, Math.floor(maxPlaces)), Math.max(Math.min(Math.floor(minPlaces), hosts.length), Math.round(hosts.length * clamp(density, 0, 1))))
    : 0;
  const typeOffset = stableHash(`${stableKey}:${field}:type-offset`) % ROUTE_OWNED_PLAZA_PLACE_TYPES.length;
  const places = [];
  const occupied = [];
  let rejectedBlockers = 0;
  let rejectedCorridor = 0;
  let rejectedOverlap = 0;

  for (const plaza of hosts) {
    if (places.length >= target) break;
    const type = ROUTE_OWNED_PLAZA_PLACE_TYPES[(typeOffset + places.length) % ROUTE_OWNED_PLAZA_PLACE_TYPES.length];
    const quarterTurns = stableHash(`${stableKey}:${field}:${plaza.id}:orientation`) & 3;
    const swapped = (quarterTurns & 1) === 1;
    const baseHalfX = 0.96, baseHalfZ = 0.78;
    const halfX = swapped ? baseHalfZ : baseHalfX;
    const halfZ = swapped ? baseHalfX : baseHalfZ;
    const cells = plaza.footprintCells
      .filter(cell => finite(cell.halfX) >= 2.35 && finite(cell.halfZ) >= 2.35)
      .map((cell, index) => ({ ...cell, id: cell.id ?? `${plaza.id}:cell:${index}` }))
      .sort((a, b) => {
        const ah = stableHash(`${stableKey}:${plaza.id}:${a.id}`), bh = stableHash(`${stableKey}:${plaza.id}:${b.id}`);
        return ah - bh || String(a.id).localeCompare(String(b.id));
      });
    let accepted = null;
    for (const cell of cells) {
      for (const pad of candidatePads(cell, { halfX, halfZ, margin, stableKey: `${stableKey}:${plaza.id}` })) {
        const candidate = { x: pad.x, z: pad.z, y: 0, halfX, halfZ };
        if (centralCrossConflict(candidate, cell, corridorHalf)) { rejectedCorridor++; continue; }
        if (blockers.some(blocker => plazaPlaceFootprintIntersectsBlocker(candidate, blocker))) { rejectedBlockers++; continue; }
        if (occupied.some(other => rectsOverlap(candidate, other, 0.24))) { rejectedOverlap++; continue; }
        accepted = { ...candidate, corner: pad.corner, cellId: cell.id };
        break;
      }
      if (accepted) break;
    }
    if (!accepted) continue;

    const id = `${field}:${plaza.id}:authored-place:${type.placeType}`;
    const place = {
      schema: ROUTE_OWNED_PLAZA_PLACE_SCHEMA,
      id,
      kind: 'route-owned-plaza-place',
      field,
      placeType: type.placeType,
      sceneType: type.sceneType,
      plazaId: plaza.id,
      siteId: plaza.siteId ?? null,
      cellId: accepted.cellId,
      x: accepted.x, z: accepted.z, y: accepted.y,
      halfX: accepted.halfX, halfZ: accepted.halfZ,
      corner: accepted.corner,
      quarterTurns,
      routeOwnership: 'world-street-plaza-circulation',
      traversalContract: 'road-adjacent-plaza + host-cell-central-cross-clear + blocker-clear',
    };
    const scene = buildRouteOwnedPlaceScene(place, {
      stableKey: `${stableKey}:${field}:${plaza.id}:${type.placeType}`,
    });
    const realized = Object.freeze({
      ...place,
      sceneSchema: scene.schema,
      sceneVersion: scene.version,
      sceneVariant: scene.variant,
      sceneTags: scene.tags,
      sceneMetrics: scene.metrics,
      parts: scene.parts,
    });
    places.push(realized);
    occupied.push(realized);
  }

  const byType = {};
  for (const place of places) byType[place.placeType] = (byType[place.placeType] ?? 0) + 1;
  const allParts = places.flatMap(place => place.parts ?? []);
  const sceneMetrics = summarizeRouteOwnedPlaceParts(allParts);
  return Object.freeze({
    schema: ROUTE_OWNED_PLAZA_PLACE_PLAN_SCHEMA,
    field,
    places: Object.freeze(places),
    stats: Object.freeze({
      hosts: hosts.length,
      target,
      realized: places.length,
      distinctTypes: new Set(places.map(place => place.placeType)).size,
      byType: Object.freeze(byType),
      rejectedBlockers,
      rejectedCorridor,
      rejectedOverlap,
      sceneParts: sceneMetrics.parts,
      sceneCollisionParts: sceneMetrics.collisionParts,
      sceneEmissiveParts: sceneMetrics.emissiveParts,
      scenePaintParts: sceneMetrics.paintParts,
      sceneMicroParts: sceneMetrics.microParts,
      sceneIdentityParts: sceneMetrics.identityParts,
      invariant: 'street-level authored places occupy only real road-adjacent plaza cells; the host-cell traversal cross and pre-existing physical clutter remain clear',
    }),
  });
}
