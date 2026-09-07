import {
  attachSpatialClaimToReservation,
  spatialClaimFromCirculationReservation,
} from '../spatial-claims.js';

export const BUILDING_PLAN_AUTHORITY_SCHEMA = 'jweb.building-plan-authority.v1';
export const BUILDING_PLAN_SPACE_SCHEMA = 'jweb.building-plan-space.v1';

const EPS = 1e-7;
export const MINIMUM_PARTITION_WALL_RETURN = 0.22;

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

function nestedUnitWallRunsForFloor(plan, floor, startOrdinal = 0) {
  const runs = [];
  let ordinal = startOrdinal;
  for (const parent of floor.spaces ?? []) {
    const unit = parent.unitPlan;
    if (!unit?.rooms?.length) continue;
    const desiredPairs = new Set((unit.adjacency ?? []).map(pair => pairKey(pair[0], pair[1])));
    for (let ai = 0; ai < unit.rooms.length; ai++) {
      for (let bi = ai + 1; bi < unit.rooms.length; bi++) {
        const a = unit.rooms[ai];
        const b = unit.rooms[bi];
        const boundary = touchingBoundary(a, b);
        if (!boundary || boundary.spanB - boundary.spanA <= EPS) continue;
        const pair = pairKey(a.key, b.key);
        const boundaryLength = boundary.spanB - boundary.spanA;
        const desiredGapWidth = Math.min(0.86, Math.max(0.68, boundaryLength * 0.42));
        const gapWidth = boundaryLength + EPS >= desiredGapWidth + 2 * MINIMUM_PARTITION_WALL_RETURN ? desiredGapWidth : 0;
        const mid = (boundary.spanA + boundary.spanB) * 0.5;
        const doorId = `${plan.deterministicKey}:floor:${floor.floor}:unit:${parent.key}:door:${a.key}:${b.key}`;
        runs.push({
          id: `${plan.deterministicKey}:floor:${floor.floor}:unit-wall:${ordinal++}`,
          kind: 'planned-dwelling-unit-wall',
          floor: floor.floor,
          yBase: floor.yBase,
          height: floor.floorHeight,
          axis: boundary.axis,
          fixedCoord: boundary.fixedCoord,
          spanA: boundary.spanA,
          spanB: boundary.spanB,
          spaceAKey: `${parent.key}/${a.key}`,
          spaceBKey: `${parent.key}/${b.key}`,
          fromSpaceId: `${parent.id}:unit-room:${a.key}`,
          toSpaceId: `${parent.id}:unit-room:${b.key}`,
          spaceKeyPair: pairKey(`${parent.key}/${a.key}`, `${parent.key}/${b.key}`),
          gaps: desiredPairs.has(pair) && gapWidth > EPS ? [{
            lo: mid - gapWidth * 0.5,
            hi: mid + gapWidth * 0.5,
            height: 2.03,
            openingIds: [doorId],
          }] : [],
          parentSpaceId: parent.id,
          unitPlan: true,
          authority: BUILDING_PLAN_AUTHORITY_SCHEMA,
        });
      }
    }
  }
  return runs;
}

function inferredRasterCellSize(floor) {
  const explicit = finite(floor?.rasterCellSize, 0);
  if (explicit > EPS) return explicit;
  const spans = [];
  for (const space of floor?.spaces ?? []) {
    for (const raw of space.regions ?? []) {
      const region = regionBounds(raw);
      if (region.maxX - region.minX > EPS) spans.push(region.maxX - region.minX);
      if (region.maxZ - region.minZ > EPS) spans.push(region.maxZ - region.minZ);
    }
  }
  return spans.length ? Math.min(...spans) : 0;
}

function floorOwnershipCells(floor) {
  const cellSize = inferredRasterCellSize(floor);
  if (!(cellSize > EPS)) return { cellSize: 0, cells: new Map(), source: 'unavailable' };
  const cells = new Map();
  const spacesById = new Map((floor.spaces ?? []).map(space => [String(space.id), space.key]));
  const supplied = floor.partitionOwnership?.cells ?? floor.ownershipCells ?? null;
  if (Array.isArray(supplied) && supplied.length) {
    for (const raw of supplied) {
      const ix = Number(raw.ix), iz = Number(raw.iz);
      const spaceKey = raw.spaceKey ?? spacesById.get(String(raw.spaceId ?? '')) ?? raw.spaceId;
      if (!Number.isInteger(ix) || !Number.isInteger(iz) || !spaceKey) continue;
      cells.set(`${ix},${iz}`, { ix, iz, spaceKey: String(spaceKey) });
    }
    if (cells.size) return { cellSize, cells, source: 'floor-partition-ownership' };
  }

  // Integration fallback: the sidecar currently publishes compacted regions but not its
  // final cell ownership array. Those regions are exact unions of raster cells, so recover
  // the ownership field first, then derive topology from cell-neighbor ownership. Canonical
  // walls are never reconstructed by comparing rectangle pairs.
  for (const space of floor.spaces ?? []) {
    for (const raw of space.regions ?? []) {
      const region = regionBounds(raw);
      const ix0 = Math.round(region.minX / cellSize);
      const ix1 = Math.round(region.maxX / cellSize);
      const iz0 = Math.round(region.minZ / cellSize);
      const iz1 = Math.round(region.maxZ / cellSize);
      for (let iz = iz0; iz < iz1; iz++) {
        for (let ix = ix0; ix < ix1; ix++) {
          const key = `${ix},${iz}`;
          const prior = cells.get(key);
          if (prior && prior.spaceKey !== space.key) {
            throw new Error(`building plan floor ${floor.floor}: overlapping ownership at cell ${key}`);
          }
          cells.set(key, { ix, iz, spaceKey: space.key });
        }
      }
    }
  }
  return { cellSize, cells, source: 'recovered-from-compacted-cell-regions' };
}

function vertexTypeForDirections(directions) {
  const dirs = [...directions];
  if (dirs.length <= 1) return 'endpoint';
  if (dirs.length === 2) {
    const horizontal = dirs.every(dir => dir === 'east' || dir === 'west');
    const vertical = dirs.every(dir => dir === 'north' || dir === 'south');
    return horizontal || vertical ? 'straight' : 'L';
  }
  if (dirs.length === 3) return 'T';
  if (dirs.length === 4) return 'X';
  return 'complex';
}

function compileFloorPartitionGraph(plan, floor) {
  const ownership = floorOwnershipCells(floor);
  const { cellSize, cells } = ownership;
  if (!(cellSize > EPS) || !cells.size) {
    return { schema: 'jweb.partition-graph.v1', floor: floor.floor, ownershipSource: ownership.source, cellSize, vertices: [], edges: [], diagnostics: { unavailable: true } };
  }
  const unitSegments = [];
  const pushBoundary = (a, b, axis, fixedCoord, spanA, spanB, negativeSpaceKey, positiveSpaceKey) => {
    if (!a || !b || a.spaceKey === b.spaceKey) return;
    unitSegments.push({
      axis, fixedCoord: coordKey(fixedCoord), spanA: coordKey(spanA), spanB: coordKey(spanB),
      negativeSpaceKey, positiveSpaceKey,
      spaceKeyPair: pairKey(a.spaceKey, b.spaceKey),
    });
  };
  for (const cell of cells.values()) {
    const east = cells.get(`${cell.ix + 1},${cell.iz}`);
    pushBoundary(cell, east, 'z', (cell.ix + 1) * cellSize, cell.iz * cellSize, (cell.iz + 1) * cellSize, cell.spaceKey, east?.spaceKey);
    const south = cells.get(`${cell.ix},${cell.iz + 1}`);
    pushBoundary(cell, south, 'x', (cell.iz + 1) * cellSize, cell.ix * cellSize, (cell.ix + 1) * cellSize, cell.spaceKey, south?.spaceKey);
  }

  const vertexMap = new Map();
  const ensureVertex = (x, z) => {
    const key = `${coordKey(x)},${coordKey(z)}`;
    if (!vertexMap.has(key)) vertexMap.set(key, { key, x: coordKey(x), z: coordKey(z), directions: new Set() });
    return vertexMap.get(key);
  };
  const direction = (x0, z0, x1, z1) => x1 > x0 + EPS ? 'east' : x1 < x0 - EPS ? 'west' : z1 > z0 + EPS ? 'south' : 'north';
  for (const segment of unitSegments) {
    const a = segment.axis === 'x' ? [segment.spanA, segment.fixedCoord] : [segment.fixedCoord, segment.spanA];
    const b = segment.axis === 'x' ? [segment.spanB, segment.fixedCoord] : [segment.fixedCoord, segment.spanB];
    ensureVertex(...a).directions.add(direction(...a, ...b));
    ensureVertex(...b).directions.add(direction(...b, ...a));
  }
  const shellAttachment = (vertex) => {
    const ix = Math.round(vertex.x / cellSize), iz = Math.round(vertex.z / cellSize);
    const surrounding = [cells.get(`${ix - 1},${iz - 1}`), cells.get(`${ix},${iz - 1}`), cells.get(`${ix - 1},${iz}`), cells.get(`${ix},${iz}`)];
    return surrounding.some(Boolean) && surrounding.some(cell => !cell);
  };
  for (const vertex of vertexMap.values()) {
    vertex.degree = vertex.directions.size;
    vertex.type = vertexTypeForDirections(vertex.directions);
    vertex.shellAttachment = shellAttachment(vertex);
  }

  const groups = new Map();
  for (const segment of unitSegments) {
    const key = `${segment.axis}:${segment.fixedCoord}:${segment.negativeSpaceKey}:${segment.positiveSpaceKey}`;
    const list = groups.get(key) ?? [];
    list.push(segment);
    groups.set(key, list);
  }
  const edges = [];
  let ordinal = 0;
  for (const list of groups.values()) {
    list.sort((a, b) => a.spanA - b.spanA || a.spanB - b.spanB);
    let current = null;
    for (const segment of list) {
      if (!current) { current = { ...segment }; continue; }
      const joinCoord = current.spanB;
      const joinVertexKey = current.axis === 'x' ? `${coordKey(joinCoord)},${current.fixedCoord}` : `${current.fixedCoord},${coordKey(joinCoord)}`;
      const joinVertex = vertexMap.get(joinVertexKey);
      if (Math.abs(segment.spanA - current.spanB) <= EPS && joinVertex?.type === 'straight') {
        current.spanB = segment.spanB;
      } else {
        edges.push(current); current = { ...segment };
      }
    }
    if (current) edges.push(current);
  }

  const spaceIdByKey = new Map((floor.spaces ?? []).map(space => [space.key, space.id]));
  const vertexIdByKey = new Map();
  const vertices = [...vertexMap.values()].sort((a, b) => a.x - b.x || a.z - b.z).map((vertex, index) => {
    const id = `${plan.deterministicKey}:floor:${floor.floor}:partition-vertex:${index}`;
    vertexIdByKey.set(vertex.key, id);
    return { id, x: vertex.x, z: vertex.z, degree: vertex.degree, type: vertex.type, shellAttachment: vertex.shellAttachment, incidentEdgeIds: [] };
  });
  const vertexById = new Map(vertices.map(vertex => [vertex.id, vertex]));
  const canonicalEdges = edges.map(edge => {
    const startKey = edge.axis === 'x' ? `${edge.spanA},${edge.fixedCoord}` : `${edge.fixedCoord},${edge.spanA}`;
    const endKey = edge.axis === 'x' ? `${edge.spanB},${edge.fixedCoord}` : `${edge.fixedCoord},${edge.spanB}`;
    const id = `${plan.deterministicKey}:floor:${floor.floor}:partition-edge:${ordinal++}`;
    const negativeSpaceId = spaceIdByKey.get(edge.negativeSpaceKey) ?? null;
    const positiveSpaceId = spaceIdByKey.get(edge.positiveSpaceKey) ?? null;
    const canonical = {
      id, kind: 'planned-interior-wall', floor: floor.floor, yBase: floor.yBase, height: floor.floorHeight,
      axis: edge.axis, fixedCoord: edge.fixedCoord, spanA: edge.spanA, spanB: edge.spanB,
      negativeSpaceKey: edge.negativeSpaceKey, positiveSpaceKey: edge.positiveSpaceKey,
      spaceAKey: edge.negativeSpaceKey, spaceBKey: edge.positiveSpaceKey,
      fromSpaceId: negativeSpaceId, toSpaceId: positiveSpaceId, spaceKeyPair: edge.spaceKeyPair,
      startVertexId: vertexIdByKey.get(startKey), endVertexId: vertexIdByKey.get(endKey), gaps: [],
      authority: BUILDING_PLAN_AUTHORITY_SCHEMA,
    };
    vertexById.get(canonical.startVertexId)?.incidentEdgeIds.push(id);
    vertexById.get(canonical.endVertexId)?.incidentEdgeIds.push(id);
    return canonical;
  });

  let relocatedOpenings = 0;
  let rejectedOpenings = 0;
  const rejectedOpeningRecords = [];
  let minimumSurvivingReturn = Infinity;
  for (const opening of floor.openings ?? []) {
    if (opening.kind !== 'interior-door') continue;
    const width = Math.max(0.72, finite(opening.width, 0.9));
    const half = width * 0.5;
    const candidates = canonicalEdges.filter(edge => edge.spaceKeyPair === pairKey(opening.fromSpaceKey, opening.toSpaceKey)
      && edge.spanB - edge.spanA + EPS >= width + 2 * MINIMUM_PARTITION_WALL_RETURN);
    const originalFixed = opening.axis === 'x' ? finite(opening.z) : finite(opening.x);
    const originalAlong = opening.axis === 'x' ? finite(opening.x) : finite(opening.z);
    candidates.sort((a, b) => {
      const aAxisPenalty = a.axis === opening.axis ? 0 : 1000;
      const bAxisPenalty = b.axis === opening.axis ? 0 : 1000;
      const aFixed = Math.abs(a.fixedCoord - originalFixed);
      const bFixed = Math.abs(b.fixedCoord - originalFixed);
      const aAlong = originalAlong < a.spanA ? a.spanA - originalAlong : originalAlong > a.spanB ? originalAlong - a.spanB : 0;
      const bAlong = originalAlong < b.spanA ? b.spanA - originalAlong : originalAlong > b.spanB ? originalAlong - b.spanB : 0;
      return (aAxisPenalty + aFixed + aAlong) - (bAxisPenalty + bFixed + bAlong) || (b.spanB - b.spanA) - (a.spanB - a.spanA) || a.id.localeCompare(b.id);
    });
    const edge = candidates[0];
    if (!edge) {
      opening.partitionDisposition = 'rejected-insufficient-wall-return';
      opening.partitionEdgeId = null;
      opening.minimumWallReturn = MINIMUM_PARTITION_WALL_RETURN;
      rejectedOpenings++;
      rejectedOpeningRecords.push(opening);
      continue;
    }
    const safeLo = edge.spanA + MINIMUM_PARTITION_WALL_RETURN + half;
    const safeHi = edge.spanB - MINIMUM_PARTITION_WALL_RETURN - half;
    const originalOnEdge = opening.axis === edge.axis && Math.abs(originalFixed - edge.fixedCoord) <= Math.max(EPS, width * 0.12);
    const desiredAlong = originalOnEdge ? originalAlong : (edge.spanA + edge.spanB) * 0.5;
    const center = Math.max(safeLo, Math.min(safeHi, desiredAlong));
    const gap = { lo: center - half, hi: center + half, height: Math.max(1.9, finite(opening.height, 2.03)), openingIds: [opening.id] };
    edge.gaps.push(gap);
    const priorAxis = opening.axis, priorX = opening.x, priorZ = opening.z;
    opening.axis = edge.axis;
    if (edge.axis === 'x') { opening.x = center; opening.z = edge.fixedCoord; }
    else { opening.x = edge.fixedCoord; opening.z = center; }
    opening.fixedCoord = edge.fixedCoord;
    opening.partitionEdgeId = edge.id;
    opening.minimumWallReturn = MINIMUM_PARTITION_WALL_RETURN;
    opening.partitionDisposition = (priorAxis === opening.axis && Math.abs(finite(priorX) - finite(opening.x)) <= EPS && Math.abs(finite(priorZ) - finite(opening.z)) <= EPS)
      ? 'accepted' : 'relocated-for-wall-return';
    if (opening.partitionDisposition !== 'accepted') relocatedOpenings++;
    minimumSurvivingReturn = Math.min(minimumSurvivingReturn, gap.lo - edge.spanA, edge.spanB - gap.hi);
  }
  // A hard jamb rule must never silently turn a semantically connected floor into
  // a physically sealed one. Remove rejected semantic adjacencies from the realized
  // topology, then add the smallest deterministic set of door-capable canonical
  // partition adjacencies needed to reconnect every room. This is an authority-level
  // geometry repair: the raw ownership field remains unchanged.
  const rejectedPairs = new Set(rejectedOpeningRecords.map(opening => pairKey(opening.fromSpaceKey, opening.toSpaceKey)));
  if (rejectedPairs.size) {
    floor.edges = (floor.edges ?? []).filter(edge => !rejectedPairs.has(pairKey(edge.a, edge.b)));
  }
  const spaceByKey = new Map((floor.spaces ?? []).map(space => [space.key, space]));
  const allSpaceKeys = [...spaceByKey.keys()];
  const rootSpaceKey = floor.rootSpaceKey && spaceByKey.has(floor.rootSpaceKey) ? floor.rootSpaceKey : allSpaceKeys[0] ?? null;
  const repairWidth = 0.72; // narrowest permitted clear opening, used only for authority-level connectivity repair
  const repairHeight = Math.max(1.9, finite((floor.openings ?? []).find(opening => opening.kind === 'interior-door')?.height, 2.03));
  const physicalReachable = () => {
    if (!rootSpaceKey) return new Set();
    const neighbors = new Map(allSpaceKeys.map(key => [key, new Set()]));
    for (const edge of canonicalEdges) {
      if (!(edge.gaps ?? []).length) continue;
      if (!neighbors.has(edge.negativeSpaceKey) || !neighbors.has(edge.positiveSpaceKey)) continue;
      neighbors.get(edge.negativeSpaceKey).add(edge.positiveSpaceKey);
      neighbors.get(edge.positiveSpaceKey).add(edge.negativeSpaceKey);
    }
    const seen = new Set([rootSpaceKey]);
    const queue = [rootSpaceKey];
    while (queue.length) {
      const key = queue.shift();
      for (const next of neighbors.get(key) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return seen;
  };
  let physicallyReachable = physicalReachable();
  let partitionConnectivityRepairOpenings = 0;
  while (physicallyReachable.size < allSpaceKeys.length) {
    const candidates = canonicalEdges.filter(edge => {
      if ((edge.gaps ?? []).length) return false;
      if (edge.spanB - edge.spanA + EPS < repairWidth + 2 * MINIMUM_PARTITION_WALL_RETURN) return false;
      return physicallyReachable.has(edge.negativeSpaceKey) !== physicallyReachable.has(edge.positiveSpaceKey);
    }).sort((a, b) => {
      // Prefer the most frameable shared wall; stable edge id is the deterministic tie-break.
      return (b.spanB - b.spanA) - (a.spanB - a.spanA) || a.id.localeCompare(b.id);
    });
    const edge = candidates[0];
    if (!edge) break;
    const half = repairWidth * 0.5;
    const safeLo = edge.spanA + MINIMUM_PARTITION_WALL_RETURN + half;
    const safeHi = edge.spanB - MINIMUM_PARTITION_WALL_RETURN - half;
    const center = Math.max(safeLo, Math.min(safeHi, (edge.spanA + edge.spanB) * 0.5));
    const id = `${plan.deterministicKey}:floor:${floor.floor}:partition-connectivity-door:${partitionConnectivityRepairOpenings}`;
    edge.gaps.push({ lo: center - half, hi: center + half, height: repairHeight, openingIds: [id] });
    const opening = {
      id, kind: 'interior-door', fromSpaceKey: edge.negativeSpaceKey, toSpaceKey: edge.positiveSpaceKey,
      width: repairWidth, height: repairHeight, axis: edge.axis, fixedCoord: edge.fixedCoord,
      x: edge.axis === 'x' ? center : edge.fixedCoord,
      z: edge.axis === 'x' ? edge.fixedCoord : center,
      topologySource: 'partition-connectivity-repair',
      doorPlacementAuthority: 'canonical-partition-connectivity-repair',
      partitionEdgeId: edge.id,
      minimumWallReturn: MINIMUM_PARTITION_WALL_RETURN,
      partitionDisposition: 'added-for-partition-connectivity',
      wallReturn: Math.min(center - half - edge.spanA, edge.spanB - center - half),
    };
    floor.openings.push(opening);
    const repairPair = pairKey(opening.fromSpaceKey, opening.toSpaceKey);
    if (!(floor.edges ?? []).some(candidate => pairKey(candidate.a, candidate.b) === repairPair)) {
      floor.edges = [...(floor.edges ?? []), {
        a: opening.fromSpaceKey, b: opening.toSpaceKey, strength: 'required',
        source: 'partition-connectivity-repair', geometryStatus: 'door-capable-canonical-partition',
      }];
    }
    partitionConnectivityRepairOpenings++;
    minimumSurvivingReturn = Math.min(minimumSurvivingReturn, opening.wallReturn);
    physicallyReachable = physicalReachable();
  }

  for (const edge of canonicalEdges) edge.gaps = mergeGaps(edge.gaps, edge.spanA, edge.spanB);

  const unexplainedInteriorEndpoints = vertices.filter(vertex => vertex.degree === 1 && !vertex.shellAttachment).length;
  const countsByType = Object.fromEntries(['endpoint', 'straight', 'L', 'T', 'X', 'complex'].map(type => [type, vertices.filter(vertex => vertex.type === type).length]));
  return {
    schema: 'jweb.partition-graph.v1', floor: floor.floor, ownershipSource: ownership.source, cellSize,
    vertices, edges: canonicalEdges,
    diagnostics: {
      unitBoundaryCount: unitSegments.length,
      partitionEdgeCount: canonicalEdges.length,
      veryShortEdgeCount: canonicalEdges.filter(edge => edge.spanB - edge.spanA <= cellSize + EPS).length,
      vertexCountByType: countsByType,
      unexplainedInteriorDegree1Endpoints: unexplainedInteriorEndpoints,
      shellAttachmentEndpoints: vertices.filter(vertex => vertex.degree === 1 && vertex.shellAttachment).length,
      relocatedOpenings,
      rejectedOpenings,
      partitionConnectivityRepairOpenings,
      physicallyReachableSpaceCount: physicallyReachable.size,
      physicallyConnected: physicallyReachable.size === allSpaceKeys.length,
      minimumSurvivingWallReturn: Number.isFinite(minimumSurvivingReturn) ? minimumSurvivingReturn : null,
    },
  };
}

export function compileBuildingPlanWallRuns(plan) {
  if (!plan?.floors) return [];
  const result = [];
  for (const floor of plan.floors) {
    const graph = compileFloorPartitionGraph(plan, floor);
    floor.partitionGraph = graph;
    floor.partitionEdges = graph.edges;
    floor.partitionVertices = graph.vertices;
    result.push(...graph.edges);
  }
  for (const floor of plan.floors ?? []) {
    result.push(...nestedUnitWallRunsForFloor(plan, floor, result.length));
  }
  return result.sort((a, b) => a.floor - b.floor || a.axis.localeCompare(b.axis)
    || a.fixedCoord - b.fixedCoord || a.spanA - b.spanA || a.id.localeCompare(b.id));
}

function moduleKeysForSpace(space, modules = [], floor = 0, allowedModuleKeys = null) {
  const result = [];
  const allowed = allowedModuleKeys ? new Set(allowedModuleKeys.map(String)) : null;
  for (const module of modules) {
    if (allowed && !allowed.has(String(module.key))) continue;
    const floorBase = Math.max(0, Math.floor(finite(module?.floorBase, 0)));
    const floorTop = Number.isFinite(Number(module?.floorTop))
      ? Math.max(floorBase + 1, Math.floor(Number(module.floorTop)))
      : floorBase + Math.max(1, Math.floor(finite(module?.floors, 1)));
    if (floor < floorBase || floor >= floorTop) continue;
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
      const moduleKeys = moduleKeysForSpace(space, modules, floor.floor, floor.plannedModuleKeys ?? floor.activeModuleKeys ?? null);
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
        circulationClass: space.circulationClass ?? null,
        traversalPermission: space.traversalPermission ?? null,
        throughRoutingEligible: space.throughRoutingEligible === true,
        cityTransferSpine: space.cityTransferSpine === true,
        operationalRole: space.operationalRole ?? null,
        operationalFlowOrder: space.operationalFlowOrder == null ? null
          : (Number.isFinite(Number(space.operationalFlowOrder)) ? Number(space.operationalFlowOrder) : null),
        frontagePriority: space.frontagePriority ?? 'neutral',
        serviceSpine: space.serviceSpine === true,
        functionalFixture: space.functionalFixture ?? null,
        unitPlan: space.unitPlan ? {
          ...space.unitPlan,
          rooms: (space.unitPlan.rooms ?? []).map(room => ({ ...room })),
          adjacency: (space.unitPlan.adjacency ?? []).map(pair => [...pair]),
        } : null,
        regularity: space.regularity ? { ...space.regularity } : null,
        circulationFrontage: space.circulationFrontage ? { ...space.circulationFrontage } : null,
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
      // A city exchange branch is preclaimed all the way to this same persistent
      // stair/core reservation. When more than one circulation space touches the
      // reservation on a floor, the public transfer spine must be the canonical
      // representative. Otherwise the vertical graph can select an unrelated hall,
      // making a physically valid facade->core branch appear disconnected and
      // causing JWEB_TOWER_TRANSFER_UNREALIZED to abort the whole chunk.
      const rank = space => {
        if (space.cityTransferSpine === true) return 0;
        if (space.role === 'circulation' && space.traversalPermission === 'PUBLIC_THROUGH') return 1;
        if (space.role === 'circulation' && space.throughRoutingEligible === true) return 2;
        if (space.role === 'circulation') return 3;
        if (space.role === 'entry') return 4;
        return 5;
      };
      return rank(a) - rank(b) || a.id.localeCompare(b.id);
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
    cityTransfers: plan?.cityTransferAuthority ? {
      requested: plan.cityTransferAuthority.requested,
      realized: plan.cityTransferAuthority.realized,
      routeIds: (plan.cityTransferAuthority.routes ?? []).map(route => route.id),
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
      partitionGraph: floor.partitionGraph ? {
        edgeCount: floor.partitionGraph.edges?.length ?? 0,
        vertexCount: floor.partitionGraph.vertices?.length ?? 0,
        diagnostics: floor.partitionGraph.diagnostics ?? null,
      } : null,
    })),
  };
}

export function assertBuildingPlanAuthority(plan, { requirePersistentCore = true } = {}) {
  if (!plan || plan.authoritySchema !== BUILDING_PLAN_AUTHORITY_SCHEMA) throw new Error('building plan authority schema missing');
  if (!plan.diagnostics?.topologyHealthy) throw new Error('building plan topology is not connected');
  if ((plan.diagnostics?.unclaimedRasterCellCount ?? 0) !== 0) {
    const floorCounts = (plan.floors ?? [])
      .filter(floor => (floor.diagnostics?.unclaimedCellCount ?? 0) > 0)
      .map(floor => `${floor.floor}:${floor.diagnostics.unclaimedCellCount}`)
      .join(',');
    throw new Error(`building plan ${plan.entityId ?? plan.deterministicKey ?? 'unknown'} left unclaimed plan cells (${plan.diagnostics.unclaimedRasterCellCount}; floors ${floorCounts || 'unknown'}; grammar ${plan.grammar?.id ?? 'unknown'})`);
  }
  for (const floor of plan.floors ?? []) {
    if (floor.diagnostics?.circulationWidthHealthy === false) {
      throw new Error(`building plan floor ${floor.floor} violates resolved circulation clear width`);
    }
    if (floor.diagnostics?.minimumAreaHealthy === false || floor.diagnostics?.minimumVolumeHealthy === false) {
      throw new Error(`building plan floor ${floor.floor} squeezed a space below human-scale area/volume`);
    }
    if ((floor.diagnostics?.minimumProgramShortfallCells ?? 0) > 0) {
      throw new Error(`building plan floor ${floor.floor} cannot fit its minimum physical program`);
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
  const topologyById = new Map(plan.topologySpaces.map(space => [space.id, space]));
  for (const floor of plan.floors ?? []) {
    for (const binding of floor.cityExchangeBindings ?? []) {
      const space = topologyById.get(binding.spaceId);
      if (!space) throw new Error(`building plan city exchange ${binding.endpointId ?? binding.anchorId} lacks semantic space`);
      if (space.role !== 'circulation' && space.role !== 'entry') {
        throw new Error(`building plan city exchange ${binding.endpointId ?? binding.anchorId} landed in ${space.role} instead of circulation`);
      }
      if (space.traversalPermission !== 'PUBLIC_THROUGH') {
        throw new Error(`building plan city exchange ${binding.endpointId ?? binding.anchorId} is not PUBLIC_THROUGH`);
      }
      const persistentCoreReservationId = plan.verticalCore?.reservationId ?? null;
      if (!persistentCoreReservationId || !space.structuralReservationIds.includes(persistentCoreReservationId)) {
        throw new Error(`building plan city exchange ${binding.endpointId ?? binding.anchorId} does not reach persistent core ${persistentCoreReservationId ?? 'missing'} on floor ${floor.floor}`);
      }
    }
  }

  for (const floor of plan.floors ?? []) {
    const reachable = reachableFloorSpaceIds(floor);
    if (reachable.size !== (floor.spaces?.length ?? 0)) throw new Error(`building plan floor ${floor.floor} has sealed required spaces in ${plan.grammar?.id ?? plan.programArchitecture?.id ?? plan.deterministicKey}; physical=${JSON.stringify(floor.partitionGraph?.diagnostics ?? {})}; edges=${JSON.stringify(floor.edges ?? [])}`);
    if (floor.partitionGraph?.diagnostics?.physicallyConnected === false) {
      throw new Error(`building plan floor ${floor.floor} has no door-capable connected partition topology`);
    }
    for (const opening of floor.openings ?? []) {
      if (opening.kind !== 'interior-door') continue;
      const pair = pairKey(opening.fromSpaceKey, opening.toSpaceKey);
      if (opening.partitionDisposition === 'rejected-insufficient-wall-return') continue;
      const matchedRun = plan.wallRuns.find(run => run.floor === floor.floor && run.spaceKeyPair === pair
        && run.gaps.some(gap => gap.openingIds.includes(opening.id)));
      if (!matchedRun) throw new Error(`building plan opening ${opening.id} has no realized wall gap`);
      const gap = matchedRun.gaps.find(candidate => candidate.openingIds.includes(opening.id));
      if (!gap || gap.lo - matchedRun.spanA + EPS < MINIMUM_PARTITION_WALL_RETURN
        || matchedRun.spanB - gap.hi + EPS < MINIMUM_PARTITION_WALL_RETURN) {
        throw new Error(`building plan opening ${opening.id} violates minimum partition wall return`);
      }
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
  // Compile canonical partitions first because hard wall-return constraints may
  // replace an impossible semantic adjacency with a real door-capable repair edge.
  // Topology-space adjacency must describe that physically realizable result.
  plan.wallRuns = compileBuildingPlanWallRuns(plan);
  plan.topologySpaces = compileBuildingPlanTopologySpaces(plan, {
    chunkKey: chunkKey ?? plan.chunkKey,
    entityId: entityId ?? plan.entityId,
  });
  plan.circulationClearances = compileBuildingPlanCirculationClearances(plan);
  plan.verticalCore = verticalCoreForPlan(plan, plan.topologySpaces, coreReservationId, coreReservation);
  plan.inspection = inspectBuildingPlan(plan);
  plan.diagnostics = {
    ...plan.diagnostics,
    plannedWallRunCount: plan.wallRuns.length,
    partitionEdgeCount: (plan.floors ?? []).reduce((sum, floor) => sum + (floor.partitionGraph?.edges?.length ?? 0), 0),
    partitionVertexCount: (plan.floors ?? []).reduce((sum, floor) => sum + (floor.partitionGraph?.vertices?.length ?? 0), 0),
    partitionRejectedOpeningCount: (plan.floors ?? []).reduce((sum, floor) => sum + (floor.partitionGraph?.diagnostics?.rejectedOpenings ?? 0), 0),
    partitionRelocatedOpeningCount: (plan.floors ?? []).reduce((sum, floor) => sum + (floor.partitionGraph?.diagnostics?.relocatedOpenings ?? 0), 0),
    partitionConnectivityRepairOpeningCount: (plan.floors ?? []).reduce((sum, floor) => sum + (floor.partitionGraph?.diagnostics?.partitionConnectivityRepairOpenings ?? 0), 0),
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
