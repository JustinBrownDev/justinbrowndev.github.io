export const SECTIONAL_CIRCULATION_SCHEMA = 'jweb.sectional-circulation.v1';

export const CIRCULATION_CLASS = Object.freeze({
  INTERIOR: 'interior',
  EXCHANGE: 'boundary-exchange',
  EXTERIOR: 'exterior',
});

export const TRAVERSAL_PERMISSION = Object.freeze({
  PUBLIC_THROUGH: 'PUBLIC_THROUGH',
  SEMI_PUBLIC_THROUGH: 'SEMI_PUBLIC_THROUGH',
  RESIDENT_THROUGH: 'RESIDENT_THROUGH',
  STAFF_THROUGH: 'STAFF_THROUGH',
  SERVICE_THROUGH: 'SERVICE_THROUGH',
  SECURE: 'SECURE',
  PRIVATE_DESTINATION_ONLY: 'PRIVATE_DESTINATION_ONLY',
  EMERGENCY_ONLY: 'EMERGENCY_ONLY',
  NO_THROUGH: 'NO_THROUGH',
});

export const ROUTE_CHARACTER = Object.freeze({
  DIRECT: 'DIRECT',
  EXTERIOR_HEAVY: 'EXTERIOR_HEAVY',
  INTERIOR_HEAVY: 'INTERIOR_HEAVY',
  TOWER_TRANSFER: 'TOWER_TRANSFER',
  VERTICAL_COLLECTOR: 'VERTICAL_COLLECTOR',
  ROOF_ROUTE: 'ROOF_ROUTE',
  SCENIC: 'SCENIC',
  SERVICE: 'SERVICE',
  EMERGENCY: 'EMERGENCY',
  UGLY_FALLBACK: 'UGLY_FALLBACK',
});

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, Number(value) || 0)); }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function capacityFor(map, siteId, fallback) {
  const raw = map instanceof Map ? map.get(siteId) : map?.[siteId];
  const n = Math.floor(finite(raw, fallback));
  return Math.max(1, n);
}
function actualWorldY({ field, floor, depthBand, ceilingY, floorHeight }) {
  return field === 'ceiling'
    ? ceilingY - depthBand * floorHeight
    : floor * floorHeight;
}
function familyFor({ widthClass, hash }) {
  const u = unit(hash, 8);
  if (widthClass === 'sky-street') {
    if (u < 0.28) return 'through-truss';
    if (u < 0.52) return 'covered-gallery';
    if (u < 0.76) return 'underslung-arch';
    return 'heavy-beam';
  }
  if (widthClass === 'collector') {
    if (u < 0.34) return 'pony-truss';
    if (u < 0.66) return 'utility-frame';
    return 'heavy-beam';
  }
  if (u < 0.38) return 'simple-guarded';
  if (u < 0.70) return 'utility-frame';
  return 'pony-truss';
}


export function resolveCeilingDepthBand({ moduleFloors, primaryFloors, depthBand }) {
  const primary = Math.max(1, Math.floor(finite(primaryFloors, 1)));
  const floors = Math.max(1, Math.min(primary, Math.floor(finite(moduleFloors, primary))));
  const depth = Math.max(1, Math.min(primary, Math.floor(finite(depthBand, 1))));
  const occupiedFloors = Math.max(floors, depth);
  const floorBase = primary - occupiedFloors;
  const localFloor = occupiedFloors - depth;
  const worldFloorBand = floorBase + localFloor;
  return Object.freeze({ primaryFloors: primary, occupiedFloors, floorBase, localFloor, depthBand: depth, worldFloorBand });
}

/**
 * Assigns bridge requests to real vertical bands after building height budgets
 * are known.  The midpoint is an attractor, never a clamp: collector routes are
 * pulled toward the overlap-heavy middle while local/scenic routes retain a
 * broad upper/lower distribution.
 *
 * The function mutates the shared bridge endpoint records deliberately.  Those
 * same records later own facade openings, landings and the emitted bridge slab.
 */
export function assignBridgeSectionBands({
  bridgePlans = [],
  bridgePortalsBySite = null,
  field = 'ground',
  siteFloorCapacity = null,
  floorHeight = 3.15,
  ceilingY = 34.02,
  weirdness = 0,
  fallbackFloors = field === 'ceiling' ? 6 : 5,
  stableKey = 'sectional-bridge-bands',
} = {}) {
  const plans = Array.isArray(bridgePlans) ? bridgePlans : [];
  const fh = Math.max(0.25, finite(floorHeight, 3.15));
  const cy = Math.max(fh * 2, finite(ceilingY, 34.02));
  const midY = cy * 0.5;
  const degree = new Map();
  for (const plan of plans) {
    degree.set(plan.aSiteId, (degree.get(plan.aSiteId) ?? 0) + 1);
    degree.set(plan.bSiteId, (degree.get(plan.bSiteId) ?? 0) + 1);
  }

  let disabled = 0;
  let skyStreets = 0;
  let collectors = 0;
  let local = 0;
  let midpointWeightedWidth = 0;
  let widthTotal = 0;
  const bandHistogram = new Map();

  for (const plan of plans) {
    const hash = stableHash(`${stableKey}:${plan.id}:${field}`);
    const aCapacity = capacityFor(siteFloorCapacity, plan.aSiteId, fallbackFloors);
    const bCapacity = capacityFor(siteFloorCapacity, plan.bSiteId, fallbackFloors);
    const commonCapacity = Math.min(aCapacity, bCapacity);
    const degreeScore = clamp((Math.max(degree.get(plan.aSiteId) ?? 1, degree.get(plan.bSiteId) ?? 1) - 1) / 3, 0, 1);
    const branch = unit(hash, 0);
    const jitter = unit(hash, 16) - 0.5;
    const weird = clamp(weirdness, 0, 1);
    let targetNorm;
    if (branch < 0.68) {
      const spread = 0.18 + (1 - degreeScore) * 0.18 + weird * 0.04;
      targetNorm = 0.5 + jitter * spread;
    } else if (branch < 0.84) {
      targetNorm = 0.22 + unit(hash ^ 0x9e3779b9, 4) * 0.20;
    } else {
      targetNorm = 0.60 + unit(hash ^ 0x85ebca6b, 6) * 0.22;
    }
    targetNorm = clamp(targetNorm, 0.12, 0.88);
    const targetY = targetNorm * cy;

    let floor = null;
    let depthBand = null;
    if (field === 'ceiling') {
      const maxDepth = commonCapacity;
      if (maxDepth < 2) {
        plan.disabledReason = 'insufficient-hanging-depth-for-elevated-exchange';
        plan.enabled = false;
        disabled++;
        continue;
      }
      const idealDepth = Math.round((cy - targetY) / fh);
      depthBand = Math.max(2, Math.min(maxDepth, idealDepth));
    } else {
      const maxFloor = commonCapacity - 1;
      if (maxFloor < 1) {
        plan.disabledReason = 'insufficient-upright-height-for-elevated-exchange';
        plan.enabled = false;
        disabled++;
        continue;
      }
      floor = Math.max(1, Math.min(maxFloor, Math.round(targetY / fh)));
    }

    const worldY = actualWorldY({ field, floor, depthBand, ceilingY: cy, floorHeight: fh });
    const midpointScore = clamp(1 - Math.abs(worldY - midY) / Math.max(fh, midY), 0, 1);
    const importance = clamp(midpointScore * 0.52 + degreeScore * 0.34 + unit(hash ^ 0xc2b2ae35, 2) * 0.14, 0, 1);
    let widthClass;
    if (importance >= 0.70) widthClass = 'sky-street';
    else if (importance >= 0.54) widthClass = 'collector';
    else widthClass = 'local';
    const width = widthClass === 'sky-street'
      ? 2.75 + unit(hash ^ 0x27d4eb2f, 1) * 1.35
      : widthClass === 'collector'
        ? 1.55 + unit(hash ^ 0x165667b1, 3) * 0.85
        : 0.94 + unit(hash ^ 0xd3a2646c, 5) * 0.46;
    const routeCharacter = degreeScore > 0.82
      ? ROUTE_CHARACTER.VERTICAL_COLLECTOR
      : degreeScore > 0.30
        ? ROUTE_CHARACTER.TOWER_TRANSFER
        : midpointScore > 0.70
          ? ROUTE_CHARACTER.EXTERIOR_HEAVY
          : (unit(hash ^ 0x7feb352d, 7) < 0.20 ? ROUTE_CHARACTER.SCENIC : ROUTE_CHARACTER.DIRECT);
    const architectureFamily = familyFor({ widthClass, hash });

    Object.assign(plan, {
      enabled: true,
      floor,
      ceilingDepthBand: depthBand,
      worldBandY: worldY,
      targetWorldY: targetY,
      midpointScore,
      importance,
      width,
      widthClass,
      routeCharacter,
      architectureFamily,
      circulationClass: CIRCULATION_CLASS.EXTERIOR,
      exchangeClass: CIRCULATION_CLASS.EXCHANGE,
      traversalPermission: TRAVERSAL_PERMISSION.PUBLIC_THROUGH,
      sectionBandAuthority: SECTIONAL_CIRCULATION_SCHEMA,
    });
    for (const endpoint of [plan.aEndpoint, plan.bEndpoint]) {
      if (!endpoint) continue;
      endpoint.floor = field === 'ceiling' ? null : floor;
      endpoint.ceilingDepthBand = depthBand;
      endpoint.worldBandY = worldY;
      endpoint.routeCharacter = routeCharacter;
      endpoint.widthClass = widthClass;
      endpoint.sectionBandAuthority = SECTIONAL_CIRCULATION_SCHEMA;
      endpoint.traversalPermission = TRAVERSAL_PERMISSION.PUBLIC_THROUGH;
    }
    const bandKey = field === 'ceiling' ? `depth:${depthBand}` : `floor:${floor}`;
    bandHistogram.set(bandKey, (bandHistogram.get(bandKey) ?? 0) + 1);
    midpointWeightedWidth += width * midpointScore;
    widthTotal += width;
    if (widthClass === 'sky-street') skyStreets++;
    else if (widthClass === 'collector') collectors++;
    else local++;
  }

  const active = plans.filter(plan => plan.enabled !== false);
  if (active.length !== plans.length) {
    plans.splice(0, plans.length, ...active);
  }
  if (bridgePortalsBySite instanceof Map) {
    bridgePortalsBySite.clear();
    const add = (siteId, endpoint) => {
      if (!bridgePortalsBySite.has(siteId)) bridgePortalsBySite.set(siteId, []);
      bridgePortalsBySite.get(siteId).push(endpoint);
    };
    for (const plan of plans) {
      add(plan.aSiteId, plan.aEndpoint);
      add(plan.bSiteId, plan.bEndpoint);
    }
  }

  return Object.freeze({
    schema: SECTIONAL_CIRCULATION_SCHEMA,
    field,
    planned: plans.length + disabled,
    active: plans.length,
    disabled,
    skyStreets,
    collectors,
    local,
    midpointY: midY,
    averageWidth: plans.length ? widthTotal / plans.length : 0,
    midpointWeightedAverageWidth: plans.length ? midpointWeightedWidth / plans.length : 0,
    bands: Object.freeze([...bandHistogram.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([band, count]) => Object.freeze({ band, count }))),
    invariant: 'midpoint is a weighted attractor; exterior bridge slabs remain exterior and endpoint-owned',
  });
}

export function towerTransferDemandsForPortals(portals = [], { siteId = null, field = 'ground', stableKey = 'tower-transfer' } = {}) {
  const usable = [...(portals ?? [])]
    .filter(portal => portal && portal.enabled !== false && (Number.isFinite(Number(portal.floor)) || Number.isFinite(Number(portal.ceilingDepthBand))))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (usable.length < 2) return Object.freeze([]);
  const pairs = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j];
      const aBand = field === 'ceiling' ? Number(a.ceilingDepthBand) : Number(a.floor);
      const bBand = field === 'ceiling' ? Number(b.ceilingDepthBand) : Number(b.floor);
      const faceChange = a.dirKey !== b.dirKey;
      const vertical = aBand !== bBand;
      if (!faceChange && !vertical) continue;
      const score = (vertical ? 3 : 0) + (faceChange ? 2 : 0) + ((a.routeCharacter === ROUTE_CHARACTER.VERTICAL_COLLECTOR || b.routeCharacter === ROUTE_CHARACTER.VERTICAL_COLLECTOR) ? 2 : 0);
      pairs.push({ a, b, score, tie: stableHash(`${stableKey}:${a.id}:${b.id}`), vertical, faceChange });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.tie - b.tie);
  const selected = pairs.slice(0, Math.min(2, Math.max(1, Math.floor(usable.length / 2))));
  return Object.freeze(selected.map((pair, index) => Object.freeze({
    schema: 'jweb.circulation-demand.v1',
    id: `${stableKey}:${siteId ?? 'site'}:${index}`,
    siteId,
    field,
    fromEndpointId: pair.a.id,
    toEndpointId: pair.b.id,
    fromBand: field === 'ceiling' ? pair.a.ceilingDepthBand : pair.a.floor,
    toBand: field === 'ceiling' ? pair.b.ceilingDepthBand : pair.b.floor,
    requiresVerticalTransfer: pair.vertical,
    requiresFacadeChange: pair.faceChange,
    routeCharacter: pair.vertical ? ROUTE_CHARACTER.TOWER_TRANSFER : ROUTE_CHARACTER.INTERIOR_HEAVY,
    traversalPermission: TRAVERSAL_PERMISSION.PUBLIC_THROUGH,
    requestedCirculation: Object.freeze([CIRCULATION_CLASS.EXCHANGE, CIRCULATION_CLASS.INTERIOR, CIRCULATION_CLASS.EXCHANGE]),
    verificationAuthority: 'compileWorldCirculationGraph',
  })));
}
