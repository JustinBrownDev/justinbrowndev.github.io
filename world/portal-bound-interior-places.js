import { compileSpacePlans, spacePlanAcceptsBox, spacePlanCandidateCells } from './space-plan.js';
import { programCompatibleWithPhysicalUse } from './physical-use.js';

export const PORTAL_BOUND_INTERIOR_PLACE_SCHEMA = 'jweb.portal-bound-interior-place.v1';
export const PORTAL_BOUND_INTERIOR_MAX_BINDINGS = 3;
export const PORTAL_BOUND_INTERIOR_MAX_PORTAL_DISTANCE = 30;

const TARGET_SPACE_ROLE_RANK = Object.freeze({ public: 0, program: 1, work: 2, shared: 3, service: 4 });

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

function publicGroundPortals(payload, groundBuildings) {
  return (payload?.spatialTopology?.portals ?? []).filter(portal =>
    portal?.connectorType === 'door'
    && Number(portal.floor) === 0
    && portal?.traversal?.traversable === true
    && portal?.traversal?.role === 'public-access'
    && portal?.provenance?.source === 'compound-entrance'
    && portal?.outsideEndpoint
    && portal?.insideEndpoint
    && groundBuildings.has(portal.buildingId));
}

function reachableGroundSpaces(payload, portal, groundBuildings) {
  const entity = groundBuildings.get(portal.buildingId);
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

function choosePaintPlacement(plan, portal, seed) {
  if (!plan) return null;
  const target = portal?.insideEndpoint ?? portal?.facadeEndpoint ?? plan.module;
  const candidates = [...spacePlanCandidateCells(plan, seed)].sort((a, b) => {
    const ad = distance2d(a, target);
    const bd = distance2d(b, target);
    return ad - bd || a.row - b.row || a.col - b.col;
  });
  for (const cell of candidates) {
    const halfX = Math.min(0.42, Math.max(0.16, plan.grid.cellW * 0.42));
    const halfZ = Math.min(0.26, Math.max(0.14, plan.grid.cellD * 0.42));
    const reservation = {
      x: cell.x, z: cell.z, halfX, halfZ,
      minX: cell.x - halfX, maxX: cell.x + halfX,
      minZ: cell.z - halfZ, maxZ: cell.z + halfZ,
      yMin: plan.yBase + 0.012,
      yMax: plan.yBase + 0.070,
    };
    if (!spacePlanAcceptsBox(plan, reservation, { allowCirculation: false, requireSameRegion: true })) continue;
    return {
      x: cell.x,
      y: plan.yBase + 0.036,
      z: cell.z,
      rotY: portal?.facadeEndpoint?.side === 'east' || portal?.facadeEndpoint?.side === 'west' ? Math.PI * 0.5 : 0,
      reservation,
      regionId: cell.regionId ?? null,
      placementMode: 'space-plan-egress-clear-floor-paint',
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
  const places = [...(payload?.physics?.routeOwnedPlazaPlaces ?? [])]
    .filter(place => place?.routeOwnership === 'world-street-plaza-circulation')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const groundBuildings = new Map((payload.entities ?? [])
    .filter(entity => entity?.kind === 'building' && entity.ceilingRooted !== true)
    .map(entity => [entity.id, entity]));
  const portals = publicGroundPortals(payload, groundBuildings);
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
      for (const space of reachableGroundSpaces(payload, portal, groundBuildings)) {
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
    const placement = choosePaintPlacement(planById.get(space.id), portal, seed);
    if (!placement) continue;
    const colors = accentColors(place);
    const binding = Object.freeze({
      schema: PORTAL_BOUND_INTERIOR_PLACE_SCHEMA,
      id: `${place.id}:portal-bound:${portal.id}`,
      placeId: place.id,
      placeType: place.placeType ?? null,
      sceneType: place.sceneType ?? null,
      plazaId: place.plazaId ?? null,
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
      egressPolicy: 'existing public portal + reachable non-egress room + SpacePlan allowCirculation=false + zero collision',
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
    candidates: places.length,
    eligiblePortals: portals.length,
    bindings: Object.freeze(bindings),
    tasks: Object.freeze(tasks),
    invariant: 'existing reachable public portal + non-egress ground room + egress-clear zero-collision place paint only',
  });
}
