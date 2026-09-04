import { buildRouteOwnedPlaceScene, summarizeRouteOwnedPlaceParts } from './route-owned-place-scenes.js';

export const ROUTE_OWNED_ROOFTOP_PLACE_SCHEMA = 'jweb.route-owned-rooftop-place.v1';
export const ROUTE_OWNED_ROOFTOP_PLACE_PLAN_SCHEMA = 'jweb.route-owned-rooftop-place-plan.v1';

export const ROUTE_OWNED_ROOFTOP_PLACE_TYPES = Object.freeze([
  'roof-bodega',
  'thrift-stall',
  'gallery-terrace',
  'repair-bay',
  'refuge',
  'utility-yard',
  'fuel-kiosk',
]);

const DEFAULT_MARGIN = 0.48;
const DEFAULT_CORRIDOR_HALF = 0.86;
const DEFAULT_DENSITY = 0.16;
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

function reservationVerticalRange(reservation) {
  const yMin = Number.isFinite(Number(reservation?.yMin)) ? Number(reservation.yMin)
    : Number.isFinite(Number(reservation?.y0)) ? Math.min(Number(reservation.y0), Number(reservation.y1 ?? reservation.y0))
      : Number.isFinite(Number(reservation?.y)) ? Number(reservation.y) - 0.15 : -Infinity;
  const yMax = Number.isFinite(Number(reservation?.yMax)) ? Number(reservation.yMax)
    : Number.isFinite(Number(reservation?.y1)) ? Math.max(Number(reservation.y0 ?? reservation.y1), Number(reservation.y1))
      : Number.isFinite(Number(reservation?.y)) ? Number(reservation.y) + 0.15 : Infinity;
  return { yMin, yMax };
}

function reservationRect(reservation) {
  if (!reservation) return null;
  if ([reservation.x, reservation.z, reservation.halfX, reservation.halfZ].every(v => Number.isFinite(Number(v)))) {
    return { x: Number(reservation.x), z: Number(reservation.z), halfX: Number(reservation.halfX), halfZ: Number(reservation.halfZ) };
  }
  if ([reservation.x, reservation.z, reservation.hx, reservation.hz].every(v => Number.isFinite(Number(v)))) {
    return { x: Number(reservation.x), z: Number(reservation.z), halfX: Number(reservation.hx), halfZ: Number(reservation.hz) };
  }
  if (reservation.axis && [reservation.from, reservation.to, reservation.fixedCoord, reservation.halfWidth].every(v => Number.isFinite(Number(v)))) {
    const from = Number(reservation.from), to = Number(reservation.to), fixed = Number(reservation.fixedCoord), halfWidth = Number(reservation.halfWidth);
    return reservation.axis === 'x'
      ? { x: (from + to) * 0.5, z: fixed, halfX: Math.abs(to - from) * 0.5, halfZ: halfWidth }
      : { x: fixed, z: (from + to) * 0.5, halfX: halfWidth, halfZ: Math.abs(to - from) * 0.5 };
  }
  return null;
}

export function placeFootprintIntersectsReservation(place, reservation, clearance = 0.16) {
  const rect = reservationRect(reservation);
  if (!rect) return false;
  const vertical = reservationVerticalRange(reservation);
  const y = finite(place?.y);
  if (y < vertical.yMin - 0.28 || y > vertical.yMax + 0.28) return false;
  return rectsOverlap(place, rect, clearance);
}

function centralRouteCrossConflict(candidate, surface, corridorHalf) {
  const dx = Math.abs(candidate.x - surface.x);
  const dz = Math.abs(candidate.z - surface.z);
  // Preserve an always-clear cross through the middle of every host roof even
  // when the exact chosen network junctions are at the perimeter.
  return dx < corridorHalf + candidate.halfX || dz < corridorHalf + candidate.halfZ;
}

export function routeSpokeRectanglesForSurface(surface, reservations = [], corridorHalf = DEFAULT_CORRIDOR_HALF) {
  const spokes = [];
  for (const reservation of reservations) {
    if (String(reservation?.surfaceId ?? '') !== String(surface?.id ?? '')) continue;
    const rect = reservationRect(reservation);
    if (!rect) continue;
    const vertical = reservationVerticalRange(reservation);
    if (finite(surface.y) < vertical.yMin - 0.28 || finite(surface.y) > vertical.yMax + 0.28) continue;
    const dx = rect.x - finite(surface.x), dz = rect.z - finite(surface.z);
    const xEdgeWeight = Math.abs(dx) / Math.max(EPS, finite(surface.hx));
    const zEdgeWeight = Math.abs(dz) / Math.max(EPS, finite(surface.hz));
    if (xEdgeWeight >= zEdgeWeight) {
      spokes.push(Object.freeze({
        x: (rect.x + finite(surface.x)) * 0.5,
        z: rect.z,
        halfX: Math.abs(rect.x - finite(surface.x)) * 0.5 + corridorHalf,
        halfZ: corridorHalf,
        sourceReservationId: reservation.id ?? null,
      }));
    } else {
      spokes.push(Object.freeze({
        x: rect.x,
        z: (rect.z + finite(surface.z)) * 0.5,
        halfX: corridorHalf,
        halfZ: Math.abs(rect.z - finite(surface.z)) * 0.5 + corridorHalf,
        sourceReservationId: reservation.id ?? null,
      }));
    }
  }
  return Object.freeze(spokes);
}

function candidatePads(surface, { halfX, halfZ, margin, stableKey }) {
  const xOffset = Math.max(0, surface.hx - halfX - margin);
  const zOffset = Math.max(0, surface.hz - halfZ - margin);
  const raw = [
    { x: surface.x - xOffset, z: surface.z - zOffset, corner: 'nw' },
    { x: surface.x + xOffset, z: surface.z - zOffset, corner: 'ne' },
    { x: surface.x + xOffset, z: surface.z + zOffset, corner: 'se' },
    { x: surface.x - xOffset, z: surface.z + zOffset, corner: 'sw' },
  ];
  const shift = stableHash(`${stableKey}:${surface.id}:corner`) % raw.length;
  return raw.slice(shift).concat(raw.slice(0, shift));
}

export function planRouteOwnedRooftopPlaces({
  surfaces = [],
  transportNetwork = null,
  reservations = [],
  blockers = [],
  stableKey = 'route-owned-rooftop-places',
  field = 'ground',
  density = DEFAULT_DENSITY,
  maxPlaces = 8,
  minPlaces = 2,
  maxPerSite = 2,
  corridorHalf = DEFAULT_CORRIDOR_HALF,
  margin = DEFAULT_MARGIN,
} = {}) {
  const reachable = new Set(transportNetwork?.reachableSurfaceIds ?? []);
  const required = new Set(transportNetwork?.requiredSurfaceIds ?? []);
  const hosts = surfaces
    .filter(surface => surface?.kind === 'clear-roof-street-layer'
      && required.has(surface.id)
      && reachable.has(surface.id)
      && finite(surface.hx) >= 2.45
      && finite(surface.hz) >= 2.45)
    .map(surface => ({ ...surface, x: finite(surface.x), z: finite(surface.z), y: finite(surface.y), hx: finite(surface.hx), hz: finite(surface.hz) }))
    .sort((a, b) => {
      const ah = stableHash(`${stableKey}:${a.id}`), bh = stableHash(`${stableKey}:${b.id}`);
      return ah - bh || String(a.id).localeCompare(String(b.id));
    });

  const target = hosts.length
    ? Math.min(Math.max(0, Math.floor(maxPlaces)), Math.max(Math.min(Math.floor(minPlaces), hosts.length), Math.round(hosts.length * clamp(density, 0, 1))))
    : 0;
  const typeOffset = stableHash(`${stableKey}:${field}:type-offset`) % ROUTE_OWNED_ROOFTOP_PLACE_TYPES.length;
  const occupied = [];
  const siteCounts = new Map();
  const places = [];
  let rejectedReservations = 0;
  let rejectedCorridor = 0;
  let rejectedSpokes = 0;
  let rejectedOverlap = 0;

  for (const surface of hosts) {
    if (places.length >= target) break;
    const siteKey = String(surface.siteId ?? surface.networkKey ?? surface.id);
    if ((siteCounts.get(siteKey) ?? 0) >= maxPerSite) continue;
    // Cycle the authored vocabulary across accepted sites, with a stable per-field
    // offset. This gives each populated chunk a real mix instead of letting hash
    // collisions accidentally turn every rooftop into the same shop type.
    const placeType = ROUTE_OWNED_ROOFTOP_PLACE_TYPES[(typeOffset + places.length) % ROUTE_OWNED_ROOFTOP_PLACE_TYPES.length];
    const quarterTurns = stableHash(`${stableKey}:${field}:${surface.id}:orientation`) & 3;
    const swapped = (quarterTurns & 1) === 1;
    const baseHalfX = 0.96, baseHalfZ = 0.78;
    const halfX = swapped ? baseHalfZ : baseHalfX;
    const halfZ = swapped ? baseHalfX : baseHalfZ;
    const pads = candidatePads(surface, { halfX, halfZ, margin, stableKey });
    const routeSpokes = routeSpokeRectanglesForSurface(surface, reservations, corridorHalf);
    let accepted = null;
    for (const pad of pads) {
      const candidate = {
        x: pad.x, z: pad.z, y: surface.y,
        halfX, halfZ,
        surfaceId: surface.id,
      };
      if (centralRouteCrossConflict(candidate, surface, corridorHalf)) { rejectedCorridor++; continue; }
      if (routeSpokes.some(spoke => rectsOverlap(candidate, spoke, 0.12))) { rejectedSpokes++; continue; }
      if ([...reservations, ...blockers].some(reservation => placeFootprintIntersectsReservation(candidate, reservation))) {
        rejectedReservations++;
        continue;
      }
      if (occupied.some(other => rectsOverlap(candidate, other, 0.22) && Math.abs(candidate.y - other.y) < 0.40)) {
        rejectedOverlap++;
        continue;
      }
      accepted = { ...candidate, corner: pad.corner };
      break;
    }
    if (!accepted) continue;
    const id = `${field}:${surface.id}:authored-place:${placeType}`;
    const place = {
      schema: ROUTE_OWNED_ROOFTOP_PLACE_SCHEMA,
      id,
      kind: 'route-owned-rooftop-place',
      field,
      placeType,
      surfaceId: surface.id,
      siteId: surface.siteId ?? null,
      moduleKey: surface.moduleKey ?? null,
      x: accepted.x, z: accepted.z, y: accepted.y,
      halfX: accepted.halfX, halfZ: accepted.halfZ,
      corner: accepted.corner,
      quarterTurns,
      routeOwnership: 'authoritative-exterior-transport-network',
      traversalContract: 'reachable-host + central-cross-clear + reservation-clear',
    };
    const scene = buildRouteOwnedPlaceScene(place, {
      stableKey: `${stableKey}:${field}:${surface.id}:scene`,
    });
    place.sceneSchema = scene.schema;
    place.sceneVersion = scene.version;
    place.sceneVariant = scene.variant;
    place.sceneTags = scene.tags;
    place.sceneMetrics = scene.metrics;
    place.parts = scene.parts;
    Object.freeze(place);
    places.push(place);
    occupied.push(accepted);
    siteCounts.set(siteKey, (siteCounts.get(siteKey) ?? 0) + 1);
  }

  const byType = Object.fromEntries(ROUTE_OWNED_ROOFTOP_PLACE_TYPES.map(type => [type, places.filter(place => place.placeType === type).length]));
  const sceneMetrics = summarizeRouteOwnedPlaceParts(places.flatMap(place => place.parts ?? []));
  return Object.freeze({
    schema: ROUTE_OWNED_ROOFTOP_PLACE_PLAN_SCHEMA,
    field,
    places: Object.freeze(places),
    stats: Object.freeze({
      hosts: hosts.length,
      target,
      realized: places.length,
      distinctSites: new Set(places.map(place => String(place.siteId))).size,
      distinctTypes: new Set(places.map(place => place.placeType)).size,
      byType: Object.freeze(byType),
      rejectedReservations,
      rejectedCorridor,
      rejectedSpokes,
      rejectedOverlap,
      requiredSurfaces: required.size,
      reachableSurfaces: reachable.size,
      sceneParts: sceneMetrics.parts,
      sceneCollisionParts: sceneMetrics.collisionParts,
      sceneEmissiveParts: sceneMetrics.emissiveParts,
      scenePaintParts: sceneMetrics.paintParts,
      sceneMicroParts: sceneMetrics.microParts,
      sceneIdentityParts: sceneMetrics.identityParts,
      invariant: 'authored rooftop places consume only reachable required roof surfaces; dense scene identity stays footprint-bound while the central route cross, junction spokes, and circulation reservations remain clear',
    }),
  });
}
