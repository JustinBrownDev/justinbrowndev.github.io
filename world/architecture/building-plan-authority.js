import {
  attachSpatialClaimToReservation,
  spatialClaimFromCirculationReservation,
} from '../spatial-claims.js';

export const BUILDING_PLAN_AUTHORITY_SCHEMA = 'jweb.building-plan-authority.v1';
export const BUILDING_PLAN_SPACE_SCHEMA = 'jweb.building-plan-space.v1';

const EPS = 1e-7;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function regionBounds(region) {
  const minX = finite(region?.minX, finite(region?.cx) - finite(region?.halfX));
  const maxX = finite(region?.maxX, finite(region?.cx) + finite(region?.halfX));
  const minZ = finite(region?.minZ, finite(region?.cz) - finite(region?.halfZ));
  const maxZ = finite(region?.maxZ, finite(region?.cz) + finite(region?.halfZ));
  return { minX, maxX, minZ, maxZ };
}

function boundsUnion(regions = []) {
  const bounds = regions.reduce((acc, raw) => {
    const region = regionBounds(raw);
    acc.minX = Math.min(acc.minX, region.minX);
    acc.maxX = Math.max(acc.maxX, region.maxX);
    acc.minZ = Math.min(acc.minZ, region.minZ);
    acc.maxZ = Math.max(acc.maxZ, region.maxZ);
    return acc;
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  return Number.isFinite(bounds.minX) ? bounds : null;
}

function overlapLength(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function coordKey(value) {
  return Math.round(finite(value) * 1000000) / 1000000;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

function touchingBoundary(aRaw, bRaw) {
  const a = regionBounds(aRaw);
  const b = regionBounds(bRaw);
  const zOverlap = overlapLength(a.minZ, a.maxZ, b.minZ, b.maxZ);
  if (zOverlap > EPS) {
    if (Math.abs(a.maxX - b.minX) <= EPS) {
      return { axis: 'z', fixedCoord: (a.maxX + b.minX) * 0.5, spanA: Math.max(a.minZ, b.minZ), spanB: Math.min(a.maxZ, b.maxZ) };
    }
    if (Math.abs(b.maxX - a.minX) <= EPS) {
      return { axis: 'z', fixedCoord: (b.maxX + a.minX) * 0.5, spanA: Math.max(a.minZ, b.minZ), spanB: Math.min(a.maxZ, b.maxZ) };
    }
  }
  const xOverlap = overlapLength(a.minX, a.maxX, b.minX, b.maxX);
  if (xOverlap > EPS) {
    if (Math.abs(a.maxZ - b.minZ) <= EPS) {
      return { axis: 'x', fixedCoord: (a.maxZ + b.minZ) * 0.5, spanA: Math.max(a.minX, b.minX), spanB: Math.min(a.maxX, b.maxX) };
    }
    if (Math.abs(b.maxZ - a.minZ) <= EPS) {
      return { axis: 'x', fixedCoord: (b.maxZ + a.minZ) * 0.5, spanA: Math.max(a.minX, b.minX), spanB: Math.min(a.maxX, b.maxX) };
    }
  }
  return null;
}

function mergeIntervals(items) {
  if (!items.length) return [];
  const ordered = [...items].sort((a, b) => a.spanA - b.spanA || a.spanB - b.spanB);
  const merged = [];
  for (const item of ordered) {
    const prior = merged[merged.length - 1];
    if (prior && item.spanA <= prior.spanB + EPS) {
      prior.spanB = Math.max(prior.spanB, item.spanB);
      continue;
    }
    merged.push({ ...item });
  }
  return merged;
}

function clampGap(gap, spanA, spanB) {
  const lo = Math.max(spanA, Math.min(gap.lo, gap.hi));
  const hi = Math.min(spanB, Math.max(gap.lo, gap.hi));
  return hi - lo > EPS ? { ...gap, lo, hi } : null;
}

function mergeGaps(gaps, spanA, spanB) {
  const normalized = gaps.map(gap => clampGap(gap, spanA, spanB)).filter(Boolean)
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const merged = [];
  for (const gap of normalized) {
    const prior = merged[merged.length - 1];
    if (prior && gap.lo <= prior.hi + EPS) {
      prior.hi = Math.max(prior.hi, gap.hi);
      prior.openingIds.push(...gap.openingIds.filter(id => !prior.openingIds.includes(id)));
      prior.height = Math.max(finite(prior.height), finite(gap.height));
      continue;
    }
    merged.push({ ...gap, openingIds: [...gap.openingIds] });
  }
  return merged;
}

function fullSpaceId(floor, key) {
  return floor?.spaces?.find(space => space.key === key)?.id ?? null;
}

function openingGapForRun(opening, run) {
  if (!opening || opening.kind !== 'interior-door') return null;
  if (opening.axis !== run.axis) return null;
  const openingPair = pairKey(opening.fromSpaceKey, opening.toSpaceKey);
  if (openingPair !== run.spaceKeyPair) return null;
  const fixed = opening.axis === 'x' ? opening.z : opening.x;
  if (Math.abs(fixed - run.fixedCoord) > Math.max(EPS, finite(opening.width, 0.9) * 0.12)) return null;
  const along = opening.axis === 'x' ? opening.x : opening.z;
  const half = Math.max(0.36, finite(opening.width, 0.9) * 0.5);
  if (along + half <= run.spanA + EPS || along - half >= run.spanB - EPS) return null;
  return {
    lo: along - half,
    hi: along + half,
    height: Math.max(1.9, finite(opening.height, 2.03)),
    openingIds: [opening.id],
  };
}

export function compileBuildingPlanWallRuns(plan) {
  if (!plan?.floors) return [];
  const result = [];
  for (const floor of plan.floors) {
    const fragmentsByKey = new Map();
    const spaces = floor.spaces ?? [];
    for (let ai = 0; ai < spaces.length; ai++) {
      const a = spaces[ai];
      for (let bi = ai + 1; bi < spaces.length; bi++) {
        const b = spaces[bi];
        for (const ar of a.regions ?? []) {
          for (const br of b.regions ?? []) {
            const boundary = touchingBoundary(ar, br);
            if (!boundary || boundary.spanB - boundary.spanA <= EPS) continue;
            const key = `${boundary.axis}:${coordKey(boundary.fixedCoord)}:${pairKey(a.key, b.key)}`;
            const list = fragmentsByKey.get(key) ?? [];
            list.push({ ...boundary, spaceAKey: a.key, spaceBKey: b.key, spaceKeyPair: pairKey(a.key, b.key) });
            fragmentsByKey.set(key, list);
          }
        }
      }
    }

    let ordinal = 0;
    for (const fragments of fragmentsByKey.values()) {
      for (const merged of mergeIntervals(fragments)) {
        const gaps = mergeGaps((floor.openings ?? []).map(opening => openingGapForRun(opening, merged)).filter(Boolean), merged.spanA, merged.spanB);
        const fromSpaceId = fullSpaceId(floor, merged.spaceAKey);
        const toSpaceId = fullSpaceId(floor, merged.spaceBKey);
        result.push({
          id: `${plan.deterministicKey}:floor:${floor.floor}:wall:${ordinal++}`,
          kind: 'planned-interior-wall',
          floor: floor.floor,
          yBase: floor.yBase,
          height: floor.floorHeight,
          axis: merged.axis,
          fixedCoord: merged.fixedCoord,
          spanA: merged.spanA,
          spanB: merged.spanB,
          spaceAKey: merged.spaceAKey,
          spaceBKey: merged.spaceBKey,
          fromSpaceId,
          toSpaceId,
          spaceKeyPair: merged.spaceKeyPair,
          gaps,
          authority: BUILDING_PLAN_AUTHORITY_SCHEMA,
        });
      }
    }
  }
  return result.sort((a, b) => a.floor - b.floor || a.axis.localeCompare(b.axis)
    || a.fixedCoord - b.fixedCoord || a.spanA - b.spanA || a.id.localeCompare(b.id));
}

function moduleKeysForSpace(space, modules = []) {
  const result = [];
  for (const module of modules) {
    const mx0 = finite(module.cx) - finite(module.halfX);
    const mx1 = finite(module.cx) + finite(module.halfX);
    const mz0 = finite(module.cz) - finite(module.halfZ);
    const mz1 = finite(module.cz) + finite(module.halfZ);
    const hits = (space.regions ?? []).some(raw => {
      const region = regionBounds(raw);
      return overlapLength(region.minX, region.maxX, mx0, mx1) > EPS
        && overlapLength(region.minZ, region.maxZ, mz0, mz1) > EPS;
    });
    if (hits) result.push(module.key);
  }
  return result;
}

function adjacencyForSpace(floor, space) {
  const ids = [];
  for (const edge of floor.edges ?? []) {
    let otherKey = null;
    if (edge.a === space.key) otherKey = edge.b;
    else if (edge.b === space.key) otherKey = edge.a;
    if (!otherKey) continue;
    const id = fullSpaceId(floor, otherKey);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function compileBuildingPlanTopologySpaces(plan, { chunkKey = plan?.chunkKey ?? null, entityId = plan?.entityId ?? null } = {}) {
  const modules = plan?.envelope?.modules ?? [];
  const result = [];
  for (const floor of plan?.floors ?? []) {
    for (const space of floor.spaces ?? []) {
      const bounds = boundsUnion(space.regions);
      if (!bounds) continue;
      const moduleKeys = moduleKeysForSpace(space, modules);
      result.push({
        schema: BUILDING_PLAN_SPACE_SCHEMA,
        id: space.id,
        kind: 'space',
        chunkKey,
        entityId,
        buildingPlanId: plan.deterministicKey,
        buildingPlanFingerprint: plan.fingerprint ?? null,
        floor: floor.floor,
        floorH: floor.floorHeight,
        yBase: floor.yBase,
        bounds: {
          ...bounds,
          yMin: floor.yBase,
          yMax: floor.yBase + floor.floorHeight,
        },
        moduleKey: moduleKeys[0] ?? null,
        moduleKeys,
        role: space.role,
        spaceType: space.spaceType,
        semanticProgram: space.semanticProgram,
        privacy: space.privacy,
        daylight: space.daylight,
        centroid: space.centroid ? { ...space.centroid } : null,
        regions: (space.regions ?? []).map(region => ({ ...region })),
        structuralReservationIds: [...(space.structuralReservationIds ?? [])],
        adjacentSpaceIds: adjacencyForSpace(floor, space),
        connectorIds: [],
        instanceIds: [],
        destinationId: null,
        sourceSchema: plan.schema,
        source: space.source,
      });
    }
  }
  return result;
}

export function compileBuildingPlanCirculationClearances(plan) {
  const topologySpaces = Array.isArray(plan?.topologySpaces)
    ? plan.topologySpaces
    : compileBuildingPlanTopologySpaces(plan);
  const result = [];
  for (const space of topologySpaces) {
    if (space.role !== 'circulation' && space.role !== 'entry') continue;
    for (let index = 0; index < (space.regions ?? []).length; index++) {
      const region = regionBounds(space.regions[index]);
      const width = region.maxX - region.minX;
      const depth = region.maxZ - region.minZ;
      if (width <= EPS || depth <= EPS) continue;
      const reservation = {
        id: `${space.id}:circulation-clearance:${index}`,
        kind: 'building-plan-circulation-clearance',
        buildingPlanId: plan?.deterministicKey ?? null,
        spaceId: space.id,
        moduleKeys: [...(space.moduleKeys ?? [])],
        x: (region.minX + region.maxX) * 0.5,
        z: (region.minZ + region.maxZ) * 0.5,
        halfX: width * 0.5,
        halfZ: depth * 0.5,
        yMin: space.yBase,
        yMax: space.yBase + Math.min(2.2, Math.max(1.8, space.floorH)),
        source: 'building-plan-authority',
        architecturalAuthority: BUILDING_PLAN_AUTHORITY_SCHEMA,
      };
      const scopeId = plan?.deterministicKey == null ? null : String(plan.deterministicKey);
      const spatialClaim = spatialClaimFromCirculationReservation(reservation, {
        owner: {
          system: 'building-plan-authority',
          id: scopeId ?? String(space.id),
          ...(scopeId ? { scopeId } : {}),
        },
        lifetime: { kind: 'plan', ...(scopeId ? { scopeId } : {}) },
        provenance: {
          sourceSystem: 'building-plan-authority',
          sourceId: reservation.id,
          sourceSpaceId: space.id,
          sourcePlanId: scopeId,
        },
      });
      result.push(attachSpatialClaimToReservation(reservation, spatialClaim));
    }
  }
  return result;
}

function chooseCoreReservation(plan, explicitId) {
  const ids = new Set();
  for (const floor of plan?.floors ?? []) {
    for (const space of floor.spaces ?? []) for (const id of space.structuralReservationIds ?? []) ids.add(id);
  }
  if (explicitId && ids.has(explicitId)) return explicitId;
  const candidates = [...ids].filter(id => /stair|shaft|core/i.test(String(id)));
  return candidates[0] ?? explicitId ?? null;
}

function verticalCoreForPlan(plan, topologySpaces, explicitReservationId, explicitReservation = null) {
  const reservationId = chooseCoreReservation(plan, explicitReservationId ?? explicitReservation?.id);
  if (!reservationId) return null;
  const occupiedSpaces = topologySpaces
    .filter(space => space.structuralReservationIds.includes(reservationId))
    .sort((a, b) => a.floor - b.floor || a.id.localeCompare(b.id));
  const byFloor = new Map();
  for (const space of occupiedSpaces) {
    const list = byFloor.get(space.floor) ?? [];
    list.push(space);
    byFloor.set(space.floor, list);
  }
  const floorSpaceIds = [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, spaces]) => [...spaces].sort((a, b) => {
      const rank = role => role === 'circulation' ? 0 : role === 'entry' ? 1 : 2;
      return rank(a.role) - rank(b.role) || a.id.localeCompare(b.id);
    })[0]?.id)
    .filter(Boolean);
  const reservation = explicitReservation?.id === reservationId
    ? explicitReservation
    : (plan?.accessAuthority?.reservations ?? []).find(item => item.id === reservationId) ?? null;
  return {
    id: `${plan.deterministicKey}:vertical-core:0`,
    kind: 'persistent-stair-core',
    reservationId,
    floorSpaceIds,
    occupiedSpaceIds: occupiedSpaces.map(space => space.id),
    floorCount: floorSpaceIds.length,
    reservation: reservation ? { ...reservation } : null,
    authority: BUILDING_PLAN_AUTHORITY_SCHEMA,
  };
}

function reachableFloorSpaceIds(floor) {
  const root = fullSpaceId(floor, floor.rootSpaceKey);
  if (!root) return new Set();
  const byKey = new Map((floor.spaces ?? []).map(space => [space.key, space.id]));
  const neighbors = new Map((floor.spaces ?? []).map(space => [space.id, []]));
  for (const edge of floor.edges ?? []) {
    const a = byKey.get(edge.a), b = byKey.get(edge.b);
    if (!a || !b) continue;
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  }
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbors.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function inspectBuildingPlan(plan) {
  return {
    schema: plan?.schema ?? null,
    authoritySchema: plan?.authoritySchema ?? null,
    deterministicKey: plan?.deterministicKey ?? null,
    fingerprint: plan?.fingerprint ?? null,
    grammar: plan?.grammar?.id ?? null,
    semanticProgram: plan?.grammar?.semanticProgram ?? null,
    verticalCore: plan?.verticalCore ? {
      id: plan.verticalCore.id,
      reservationId: plan.verticalCore.reservationId,
      floorSpaceIds: [...plan.verticalCore.floorSpaceIds],
    } : null,
    floors: (plan?.floors ?? []).map(floor => ({
      floor: floor.floor,
      rootSpaceId: fullSpaceId(floor, floor.rootSpaceKey),
      spaces: (floor.spaces ?? []).map(space => ({
        id: space.id,
        key: space.key,
        role: space.role,
        spaceType: space.spaceType,
        semanticProgram: space.semanticProgram,
      })),
      adjacency: (floor.edges ?? []).map(edge => ({
        fromSpaceId: fullSpaceId(floor, edge.a),
        toSpaceId: fullSpaceId(floor, edge.b),
        source: edge.source,
      })),
      openings: (floor.openings ?? []).map(opening => ({
        id: opening.id,
        kind: opening.kind,
        fromSpaceId: fullSpaceId(floor, opening.fromSpaceKey) ?? opening.fromSpaceKey,
        toSpaceId: fullSpaceId(floor, opening.toSpaceKey) ?? opening.toSpaceKey,
      })),
      wallRunCount: (plan?.wallRuns ?? []).filter(run => run.floor === floor.floor).length,
    })),
  };
}

export function assertBuildingPlanAuthority(plan, { requirePersistentCore = true } = {}) {
  if (!plan || plan.authoritySchema !== BUILDING_PLAN_AUTHORITY_SCHEMA) throw new Error('building plan authority schema missing');
  if (!plan.diagnostics?.topologyHealthy) throw new Error('building plan topology is not connected');
  if ((plan.diagnostics?.unclaimedRasterCellCount ?? 0) !== 0) throw new Error('building plan left unclaimed plan cells');
  for (const floor of plan.floors ?? []) {
    if (floor.diagnostics?.circulationWidthHealthy === false) {
      throw new Error(`building plan floor ${floor.floor} violates resolved circulation clear width`);
    }
  }
  if (!Array.isArray(plan.wallRuns)) throw new Error('building plan wall runs missing');
  if (!Array.isArray(plan.topologySpaces) || !plan.topologySpaces.length) throw new Error('building plan semantic spaces missing');
  if (!Array.isArray(plan.circulationClearances)) throw new Error('building plan circulation clearances missing');
  for (const space of plan.topologySpaces.filter(space => space.role === 'circulation' || space.role === 'entry')) {
    if (!plan.circulationClearances.some(clearance => clearance.spaceId === space.id)) {
      throw new Error(`building plan circulation space ${space.id} lacks protected clearance`);
    }
  }

  for (const floor of plan.floors ?? []) {
    const reachable = reachableFloorSpaceIds(floor);
    if (reachable.size !== (floor.spaces?.length ?? 0)) throw new Error(`building plan floor ${floor.floor} has sealed required spaces`);
    for (const opening of floor.openings ?? []) {
      if (opening.kind !== 'interior-door') continue;
      const pair = pairKey(opening.fromSpaceKey, opening.toSpaceKey);
      const matched = plan.wallRuns.some(run => run.floor === floor.floor && run.spaceKeyPair === pair
        && run.gaps.some(gap => gap.openingIds.includes(opening.id)));
      if (!matched) throw new Error(`building plan opening ${opening.id} has no realized wall gap`);
    }
  }

  if (requirePersistentCore && (plan.envelope?.floorCount ?? 0) > 1) {
    if (!plan.verticalCore) throw new Error('multi-floor building plan lacks persistent vertical core');
    const plannedFloors = plan.floors?.length ?? 0;
    if (plan.verticalCore.floorSpaceIds.length < plannedFloors) {
      throw new Error(`persistent vertical core reaches ${plan.verticalCore.floorSpaceIds.length}/${plannedFloors} floors`);
    }
  }
  return true;
}

export function promoteBuildingPlanAuthority(plan, { coreReservationId = null, coreReservation = null, chunkKey = null, entityId = null } = {}) {
  if (!plan || !Array.isArray(plan.floors)) throw new Error('promoteBuildingPlanAuthority requires a building sidecar plan');
  plan.authoritySchema = BUILDING_PLAN_AUTHORITY_SCHEMA;
  plan.authority = 'topology-before-geometry';
  plan.topologySpaces = compileBuildingPlanTopologySpaces(plan, {
    chunkKey: chunkKey ?? plan.chunkKey,
    entityId: entityId ?? plan.entityId,
  });
  plan.wallRuns = compileBuildingPlanWallRuns(plan);
  plan.circulationClearances = compileBuildingPlanCirculationClearances(plan);
  plan.verticalCore = verticalCoreForPlan(plan, plan.topologySpaces, coreReservationId, coreReservation);
  plan.inspection = inspectBuildingPlan(plan);
  plan.diagnostics = {
    ...plan.diagnostics,
    plannedWallRunCount: plan.wallRuns.length,
    semanticTopologySpaceCount: plan.topologySpaces.length,
    circulationClearanceCount: plan.circulationClearances.length,
    persistentVerticalCore: !!plan.verticalCore,
    authorityReady: false,
  };
  assertBuildingPlanAuthority(plan, { requirePersistentCore: (plan.envelope?.floorCount ?? 0) > 1 });
  plan.diagnostics.authorityReady = true;
  return plan;
}

export function plannedSpaceAtPoint(plan, { x, z, floor = 0 } = {}) {
  for (const space of plan?.topologySpaces ?? []) {
    if (space.floor !== floor) continue;
    if ((space.regions ?? []).some(raw => {
      const region = regionBounds(raw);
      return x >= region.minX - EPS && x <= region.maxX + EPS && z >= region.minZ - EPS && z <= region.maxZ + EPS;
    })) return space;
  }
  return null;
}
