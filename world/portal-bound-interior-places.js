import { compileSpacePlans, spacePlanAcceptsBox, spacePlanCandidateCells } from './space-plan.js';
import { programCompatibleWithPhysicalUse } from './physical-use.js';

export const PORTAL_BOUND_INTERIOR_PLACE_SCHEMA = 'jweb.portal-bound-interior-place.v2';
export const PORTAL_BOUND_INTERIOR_MAX_BINDINGS = 3;
export const PORTAL_BOUND_INTERIOR_MAX_PORTAL_DISTANCE = 30;

const TARGET_SPACE_ROLE_RANK = Object.freeze({ public: 0, program: 1, work: 2, shared: 3, service: 4 });
const GROUND_PLACE_ROUTE_OWNERSHIP = 'world-street-plaza-circulation';
const HANGING_PLACE_ROUTE_OWNERSHIP = 'authoritative-exterior-transport-network';

const FIXTURE_FAMILY_BY_SCENE = Object.freeze({
  'roof-bodega': 'bodega-counter',
  'thrift-stall': 'thrift-rack',
  'gallery-terrace': 'gallery-plinth',
  'repair-bay': 'repair-bench',
  refuge: 'refuge-supplies',
  'utility-yard': 'utility-cabinet',
  'fuel-kiosk': 'service-console',
});

function hash32(value) {
  let h = 2166136261 >>> 0;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function distance2d(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function payloadLayer(payload) {
  return payload?.ceilingCity === true ? 'hanging' : 'ground';
}

function placeSources(payload) {
  const layer = payloadLayer(payload);
  const source = layer === 'hanging'
    ? payload?.physics?.routeOwnedRooftopPlaces
    : payload?.physics?.routeOwnedPlazaPlaces;
  const routeOwnership = layer === 'hanging'
    ? HANGING_PLACE_ROUTE_OWNERSHIP
    : GROUND_PLACE_ROUTE_OWNERSHIP;
  return [...(source ?? [])]
    .filter(place => place?.routeOwnership === routeOwnership)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function hasPortalBoundInteriorPlaceSources(payload) {
  return placeSources(payload).length > 0;
}

function layerBuildings(payload, layer) {
  return new Map((payload.entities ?? [])
    .filter(entity => entity?.kind === 'building')
    .filter(entity => layer === 'hanging' ? entity.ceilingRooted === true : entity.ceilingRooted !== true)
    .map(entity => [entity.id, entity]));
}

function publicFloorZeroPortals(payload, buildings) {
  return (payload?.spatialTopology?.portals ?? []).filter(portal =>
    portal?.connectorType === 'door'
    && Number(portal.floor) === 0
    && portal?.traversal?.traversable === true
    && portal?.traversal?.role === 'public-access'
    && portal?.provenance?.source === 'compound-entrance'
    && portal?.outsideEndpoint
    && portal?.insideEndpoint
    && buildings.has(portal.buildingId));
}

function reachableFloorZeroSpaces(payload, portal, buildings) {
  const entity = buildings.get(portal.buildingId);
  if (!entity) return [];
  const routes = payload?.worldCirculation?.routes ?? {};
  return (payload?.spatialTopology?.spaces ?? []).filter(space =>
    space?.entityId === portal.buildingId
    && Number(space.floor) === 0
    && Object.hasOwn(TARGET_SPACE_ROLE_RANK, String(space.role ?? ''))
    && !!routes[space.id]
    && Array.isArray(space.regions)
    && space.regions.length > 0
    && !!space.moduleKey
    && !!space.semanticProgram
    && programCompatibleWithPhysicalUse(space.semanticProgram, entity.physicalUse));
}

function accentColors(place) {
  const parts = place?.parts ?? [];
  const emissive = parts.find(part => part?.emissive === true)?.color;
  const paint = parts.find(part => part?.renderClass === 'paint')?.color;
  const prop = parts.find(part => Number.isFinite(Number(part?.color)))?.color;
  return {
    accent: finite(emissive, finite(prop, 0x66aacc)),
    secondary: finite(paint, finite(prop, 0xd6d2c4)),
  };
}

function fixtureFamily(place) {
  const sceneType = String(place?.sceneType ?? place?.placeType ?? 'utility-yard');
  return FIXTURE_FAMILY_BY_SCENE[sceneType] ?? FIXTURE_FAMILY_BY_SCENE['utility-yard'];
}

function chooseFixturePlacement(plan, portal, seed) {
  if (!plan) return null;
  const target = portal?.insideEndpoint ?? portal?.facadeEndpoint ?? plan.module;
  const candidates = [...spacePlanCandidateCells(plan, seed)].sort((a, b) => {
    const ad = distance2d(a, target);
    const bd = distance2d(b, target);
    return ad - bd || a.row - b.row || a.col - b.col;
  });
  for (const cell of candidates) {
    const halfX = Math.min(0.46, Math.max(0.18, plan.grid.cellW * 0.46));
    const halfZ = Math.min(0.30, Math.max(0.16, plan.grid.cellD * 0.46));
    const reservation = {
      x: cell.x, z: cell.z, halfX, halfZ,
      minX: cell.x - halfX, maxX: cell.x + halfX,
      minZ: cell.z - halfZ, maxZ: cell.z + halfZ,
      yMin: plan.yBase + 0.012,
      yMax: plan.yBase + 1.24,
    };
    if (!spacePlanAcceptsBox(plan, reservation, { allowCirculation: false, requireSameRegion: true })) continue;
    return {
      x: cell.x,
      y: plan.yBase + 0.024,
      z: cell.z,
      rotY: portal?.facadeEndpoint?.side === 'east' || portal?.facadeEndpoint?.side === 'west' ? Math.PI * 0.5 : 0,
      reservation,
      regionId: cell.regionId ?? null,
      placementMode: 'space-plan-egress-clear-interior-fixture',
    };
  }
  return null;
}

export function planPortalBoundInteriorPlaces({
  chunk,
  payload,
  maxBindings = PORTAL_BOUND_INTERIOR_MAX_BINDINGS,
  maxPortalDistance = PORTAL_BOUND_INTERIOR_MAX_PORTAL_DISTANCE,
} = {}) {
  if (!chunk || !payload) throw new Error('planPortalBoundInteriorPlaces requires chunk and payload');
  const layer = payloadLayer(payload);
  const places = placeSources(payload);
  const buildings = layerBuildings(payload, layer);
  const portals = publicFloorZeroPortals(payload, buildings);
  const limit = Math.max(0, Math.floor(Number(maxBindings) || 0));
  const claimedPortals = new Set();
  const claimedSpaces = new Set();
  const provisional = [];

  for (const place of places) {
    if (provisional.length >= limit) break;
    const ranked = [];
    for (const portal of portals) {
      if (claimedPortals.has(portal.id)) continue;
      const portalDistance = distance2d(place, portal.outsideEndpoint);
      if (portalDistance > maxPortalDistance) continue;
      for (const space of reachableFloorZeroSpaces(payload, portal, buildings)) {
        if (claimedSpaces.has(space.id)) continue;
        const interiorDistance = distance2d(portal.insideEndpoint, space.centroid ?? space.module);
        ranked.push({
          portal, space, portalDistance, interiorDistance,
          roleRank: TARGET_SPACE_ROLE_RANK[String(space.role ?? '')] ?? 9,
        });
      }
    }
    ranked.sort((a, b) =>
      (a.portalDistance + a.roleRank * 4) - (b.portalDistance + b.roleRank * 4)
      || a.interiorDistance - b.interiorDistance
      || String(a.portal.id).localeCompare(String(b.portal.id))
      || String(a.space.id).localeCompare(String(b.space.id)));
    const chosen = ranked[0];
    if (!chosen) continue;
    provisional.push({ place, ...chosen });
    claimedPortals.add(chosen.portal.id);
    claimedSpaces.add(chosen.space.id);
  }

  const activeSpaceIds = new Set(provisional.map(item => item.space.id));
  const spacePlans = activeSpaceIds.size ? compileSpacePlans({ chunk, payload, activeSpaceIds }) : [];
  const planById = new Map(spacePlans.map(plan => [plan.id, plan]));
  const bindings = [];
  const tasks = [];

  for (const item of provisional) {
    const { place, portal, space, portalDistance, interiorDistance } = item;
    const seed = hash32(`${chunk.key}:${place.id}:${portal.id}:${space.id}:portal-bound-interior`);
    const placement = chooseFixturePlacement(planById.get(space.id), portal, seed);
    if (!placement) continue;
    const colors = accentColors(place);
    const binding = Object.freeze({
      schema: PORTAL_BOUND_INTERIOR_PLACE_SCHEMA,
      id: `${place.id}:portal-bound:${portal.id}`,
      layer,
      placeSource: layer === 'hanging' ? 'route-owned-rooftop-place' : 'route-owned-plaza-place',
      placeRouteOwnership: place.routeOwnership ?? null,
      placeId: place.id,
      placeType: place.placeType ?? null,
      sceneType: place.sceneType ?? null,
      fixtureFamily: fixtureFamily(place),
      plazaId: place.plazaId ?? null,
      surfaceId: place.surfaceId ?? null,
      districtKey: place.districtKey ?? null,
      districtTheme: place.districtTheme ?? null,
      neighborhoodRole: place.neighborhoodRole ?? null,
      portalId: portal.id,
      buildingId: portal.buildingId,
      spaceId: space.id,
      spaceRole: space.role ?? null,
      spaceType: space.spaceType ?? null,
      semanticProgram: space.semanticProgram ?? null,
      moduleKey: space.moduleKey,
      floor: 0,
      portalDistance,
      interiorDistance,
      routeVerified: true,
      accentColor: colors.accent,
      secondaryColor: colors.secondary,
      egressPolicy: 'existing public portal + reachable non-egress room + SpacePlan allowCirculation=false + zero-collision cosmetic fixture',
    });
    bindings.push(binding);
    tasks.push({
      kind: 'portal-bound-interior-place',
      entityId: portal.buildingId,
      seed,
      portalBoundInteriorPlace: binding,
      semanticPlacement: placement,
      topologySolved: true,
      topologyDescriptors: [],
      topologyAccepted: true,
    });
  }

  return Object.freeze({
    schema: PORTAL_BOUND_INTERIOR_PLACE_SCHEMA,
    chunkKey: chunk.key,
    layer,
    candidates: places.length,
    eligiblePortals: portals.length,
    bindings: Object.freeze(bindings),
    tasks: Object.freeze(tasks),
    invariant: 'existing reachable public portal + non-egress floor-0 room + egress-clear zero-collision family fixture only',
  });
}
