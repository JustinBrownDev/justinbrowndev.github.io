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

function localToWorld(place, lx, lz) {
  const quarter = place.quarterTurns & 3;
  if (quarter === 0) return { x: place.x + lx, z: place.z + lz };
  if (quarter === 1) return { x: place.x - lz, z: place.z + lx };
  if (quarter === 2) return { x: place.x - lx, z: place.z - lz };
  return { x: place.x + lz, z: place.z - lx };
}

function localSize(place, sx, sz) {
  return (place.quarterTurns & 1) ? { sx: sz, sz: sx } : { sx, sz };
}

function part(place, role, { x = 0, z = 0, y = 0, sx = 0.3, sy = 0.3, sz = 0.3, color = 0x777777, collision = false, emissive = false } = {}) {
  const p = localToWorld(place, x, z);
  const size = localSize(place, sx, sz);
  return Object.freeze({
    role,
    x: p.x, z: p.z, y: place.y + y,
    sx: size.sx, sy, sz: size.sz,
    color,
    collision,
    emissive,
  });
}

const PALETTES = Object.freeze({
  'roof-bodega': Object.freeze([0xc75d3b, 0xe0ba69, 0x3f6167, 0xd6d2c4]),
  'thrift-stall': Object.freeze([0x805d8c, 0xca8a8b, 0x7e9a78, 0xe1c07a]),
  'gallery-terrace': Object.freeze([0xd6d5cf, 0x30343a, 0x9b3d47, 0x7893a8]),
  'repair-bay': Object.freeze([0x5f6d72, 0xc98b46, 0x3f4246, 0x9d6d4d]),
  refuge: Object.freeze([0x617b69, 0xd9c888, 0x7d8d91, 0xb15448]),
  'utility-yard': Object.freeze([0x66706d, 0x9c9b83, 0xd0a64e, 0x4d5556]),
  'fuel-kiosk': Object.freeze([0x527ea3, 0xd84a42, 0xe8dfc6, 0x42464d]),
});

function realizeScene(place) {
  const c = PALETTES[place.placeType] ?? PALETTES['utility-yard'];
  const parts = [part(place, 'paint-pad', { y: 0.025, sx: place.halfX * 1.85, sy: 0.05, sz: place.halfZ * 1.85, color: c[3] })];
  const add = (role, spec) => parts.push(part(place, role, spec));

  if (place.placeType === 'roof-bodega') {
    add('kiosk-body', { z: 0.22, y: 0.78, sx: 1.25, sy: 1.56, sz: 0.76, color: c[0], collision: true });
    add('counter', { z: -0.30, y: 0.55, sx: 1.45, sy: 0.82, sz: 0.30, color: c[3], collision: true });
    add('awning', { z: -0.20, y: 1.78, sx: 1.85, sy: 0.09, sz: 1.05, color: c[1] });
    add('sign-bar', { z: 0.56, y: 1.78, sx: 1.30, sy: 0.30, sz: 0.08, color: c[2], emissive: true });
    add('crate-a', { x: -0.62, z: -0.56, y: 0.22, sx: 0.42, sy: 0.44, sz: 0.42, color: c[1], collision: true });
    add('crate-b', { x: -0.20, z: -0.62, y: 0.17, sx: 0.32, sy: 0.34, sz: 0.34, color: c[0] });
  } else if (place.placeType === 'thrift-stall') {
    add('canopy', { y: 1.92, sx: 1.95, sy: 0.10, sz: 1.42, color: c[1] });
    add('rack-a', { x: -0.48, y: 0.83, sx: 0.12, sy: 1.42, sz: 1.12, color: c[0], collision: true });
    add('rack-b', { x: 0.48, y: 0.83, sx: 0.12, sy: 1.42, sz: 1.12, color: c[2], collision: true });
    add('bin-a', { x: -0.25, z: -0.43, y: 0.24, sx: 0.52, sy: 0.48, sz: 0.38, color: c[3] });
    add('bin-b', { x: 0.38, z: -0.42, y: 0.20, sx: 0.40, sy: 0.40, sz: 0.42, color: c[1] });
  } else if (place.placeType === 'gallery-terrace') {
    add('gallery-wall', { z: 0.48, y: 1.04, sx: 1.72, sy: 2.02, sz: 0.10, color: c[0], collision: true });
    add('art-panel-a', { x: -0.46, z: 0.41, y: 1.12, sx: 0.52, sy: 0.78, sz: 0.04, color: c[2], emissive: true });
    add('art-panel-b', { x: 0.43, z: 0.41, y: 1.18, sx: 0.48, sy: 0.90, sz: 0.04, color: c[3], emissive: true });
    add('plinth-a', { x: -0.40, z: -0.36, y: 0.32, sx: 0.34, sy: 0.64, sz: 0.34, color: c[1], collision: true });
    add('plinth-b', { x: 0.42, z: -0.30, y: 0.24, sx: 0.38, sy: 0.48, sz: 0.38, color: c[1] });
  } else if (place.placeType === 'repair-bay') {
    add('workbench', { z: 0.18, y: 0.48, sx: 1.55, sy: 0.72, sz: 0.62, color: c[1], collision: true });
    add('tool-cabinet', { x: 0.60, z: 0.50, y: 0.84, sx: 0.46, sy: 1.68, sz: 0.42, color: c[0], collision: true });
    add('parts-bin', { x: -0.58, z: -0.38, y: 0.30, sx: 0.48, sy: 0.60, sz: 0.52, color: c[3], collision: true });
    add('hoist-top', { y: 1.84, sx: 1.70, sy: 0.10, sz: 0.12, color: c[2] });
    add('hoist-post-a', { x: -0.72, y: 0.94, sx: 0.10, sy: 1.80, sz: 0.10, color: c[2] });
    add('hoist-post-b', { x: 0.72, y: 0.94, sx: 0.10, sy: 1.80, sz: 0.10, color: c[2] });
  } else if (place.placeType === 'refuge') {
    add('shelter-canopy', { y: 1.88, sx: 1.95, sy: 0.12, sz: 1.44, color: c[1] });
    add('bench-a', { x: -0.42, y: 0.31, sx: 0.66, sy: 0.40, sz: 0.34, color: c[0], collision: true });
    add('bench-b', { x: 0.42, y: 0.31, sx: 0.66, sy: 0.40, sz: 0.34, color: c[0], collision: true });
    add('water-cabinet', { z: 0.48, y: 0.66, sx: 0.54, sy: 1.30, sz: 0.42, color: c[2], collision: true });
    add('marker', { z: 0.62, y: 1.48, sx: 0.58, sy: 0.26, sz: 0.08, color: c[3], emissive: true });
  } else if (place.placeType === 'fuel-kiosk') {
    add('fuel-canopy', { y: 2.02, sx: 1.90, sy: 0.12, sz: 1.34, color: c[2] });
    add('pump-a', { x: -0.43, y: 0.62, sx: 0.40, sy: 1.24, sz: 0.46, color: c[0], collision: true });
    add('pump-b', { x: 0.43, y: 0.62, sx: 0.40, sy: 1.24, sz: 0.46, color: c[1], collision: true });
    add('service-box', { z: 0.52, y: 0.48, sx: 0.84, sy: 0.94, sz: 0.38, color: c[3], collision: true });
    add('price-band', { z: 0.70, y: 1.55, sx: 1.16, sy: 0.28, sz: 0.08, color: c[1], emissive: true });
  } else {
    add('utility-cabinet-a', { x: -0.46, y: 0.72, sx: 0.62, sy: 1.42, sz: 0.62, color: c[0], collision: true });
    add('utility-cabinet-b', { x: 0.38, z: 0.18, y: 0.55, sx: 0.54, sy: 1.08, sz: 0.70, color: c[1], collision: true });
    add('service-plinth', { z: -0.48, y: 0.22, sx: 1.18, sy: 0.42, sz: 0.42, color: c[2], collision: true });
    add('pipe-header', { y: 1.58, sx: 1.52, sy: 0.12, sz: 0.12, color: c[3] });
    add('pipe-post-a', { x: -0.66, y: 0.85, sx: 0.10, sy: 1.48, sz: 0.10, color: c[3] });
    add('pipe-post-b', { x: 0.66, y: 0.85, sx: 0.10, sy: 1.48, sz: 0.10, color: c[3] });
  }
  return Object.freeze(parts);
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
    place.parts = realizeScene(place);
    Object.freeze(place);
    places.push(place);
    occupied.push(accepted);
    siteCounts.set(siteKey, (siteCounts.get(siteKey) ?? 0) + 1);
  }

  const byType = Object.fromEntries(ROUTE_OWNED_ROOFTOP_PLACE_TYPES.map(type => [type, places.filter(place => place.placeType === type).length]));
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
      invariant: 'authored rooftop places consume only reachable required roof surfaces and keep the central route cross, junction spokes, and circulation reservations clear',
    }),
  });
}
