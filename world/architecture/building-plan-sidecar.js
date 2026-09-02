import { architecturalFieldProfile, clamp01 } from './distance-inversion.js';
import { ensureBuildingSemanticTruth } from '../building-semantic-truth.js';
import {
  ARCHITECTURAL_NORTH_STAR,
  FAMILY_GRAMMAR_POOLS,
  PLAN_GRAMMARS,
  PROGRAM_GRAMMAR,
  SPAWN_AUTHORED_INTENTS,
} from './plan-grammar-catalog.js';

const SCHEMA = 'jweb.building-plan-sidecar.v1';
const EPS = 1e-9;

function hashString32(value) {
  let h = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(value) || 0));
}

function stableIndex(key, length) {
  return length ? hashString32(key) % length : 0;
}

function chooseGrammar({ stableKey, family, programHint, authoredIntent }) {
  if (authoredIntent?.grammar && PLAN_GRAMMARS[authoredIntent.grammar]) return PLAN_GRAMMARS[authoredIntent.grammar];
  if (programHint && PROGRAM_GRAMMAR[programHint] && PLAN_GRAMMARS[PROGRAM_GRAMMAR[programHint]]) {
    return PLAN_GRAMMARS[PROGRAM_GRAMMAR[programHint]];
  }
  const pool = FAMILY_GRAMMAR_POOLS[family] ?? Object.keys(PLAN_GRAMMARS);
  return PLAN_GRAMMARS[pool[stableIndex(`grammar:${stableKey}:${family}`, pool.length)]];
}

function normalizeModules(modules = []) {
  return modules
    .map((module, index) => ({
      key: String(module?.key ?? `module-${index}`),
      cx: Number(module?.cx) || 0,
      cz: Number(module?.cz) || 0,
      halfX: Math.max(0.3, Number(module?.halfX) || 0.3),
      halfZ: Math.max(0.3, Number(module?.halfZ) || 0.3),
      floors: Math.max(1, Math.floor(Number(module?.floors) || 1)),
    }))
    .filter(module => Number.isFinite(module.cx) && Number.isFinite(module.cz));
}

function moduleArea(module) {
  return module.halfX * 2 * module.halfZ * 2;
}

function floorArea(modules, floor) {
  return modules.filter(module => module.floors > floor).reduce((sum, module) => sum + moduleArea(module), 0);
}

function normalizeAccessAnchors(accessAnchors = []) {
  return accessAnchors.map((anchor, index) => ({
    id: String(anchor?.id ?? `access-${index}`),
    kind: anchor?.kind ?? (index ? 'secondary-entry' : 'main-entry'),
    x: Number(anchor?.x ?? anchor?.doorX) || 0,
    z: Number(anchor?.z ?? anchor?.doorZ) || 0,
    side: anchor?.side ?? null,
    dc: Number(anchor?.dc) || 0,
    dr: Number(anchor?.dr) || 0,
    floor: Math.max(0, Math.floor(Number(anchor?.floor) || 0)),
    connectorId: anchor?.connectorId ?? null,
  }));
}

function normalizeReservations(reservations = []) {
  return reservations.map((r, index) => {
    const halfX = Math.max(0, Number(r?.halfX ?? (r?.openingWidth ? r.openingWidth * 0.5 : 0)) || 0);
    const halfZ = Math.max(0, Number(r?.halfZ ?? (r?.openingDepth ? r.openingDepth * 0.5 : 0)) || 0);
    return {
      id: String(r?.id ?? `reservation-${index}`),
      kind: r?.kind ?? r?.reservationKind ?? 'circulation',
      x: Number(r?.x) || 0,
      z: Number(r?.z) || 0,
      halfX,
      halfZ,
      yMin: Number.isFinite(Number(r?.yMin)) ? Number(r.yMin) : 0,
      yMax: Number.isFinite(Number(r?.yMax)) ? Number(r.yMax) : Infinity,
    };
  });
}

function reservationHitsFloor(reservation, y0, y1) {
  return reservation.yMin < y1 - EPS && reservation.yMax > y0 + EPS;
}

function cellIntersectsReservation(cell, reservation, cellHalfExtent = 0) {
  const half = Math.max(0, Number(cellHalfExtent) || 0);
  return Math.abs(cell.x - reservation.x) <= reservation.halfX + half + EPS
    && Math.abs(cell.z - reservation.z) <= reservation.halfZ + half + EPS;
}

function invertExteriorPreference(preference, profile) {
  if (!profile.rules.invertExteriorPreference) return preference;
  if (preference === 'street' || preference === 'perimeter' || preference === 'courtyard') return 'deep';
  if (preference === 'deep') return 'perimeter';
  return profile.inversion >= 0.75 ? 'perimeter' : preference;
}

function roleMultiplier(role, profile) {
  const inv = profile.inversion;
  if (role === 'entry') return 0.72 + (1 - inv) * 0.28;
  if (['service', 'storage', 'circulation'].includes(role)) return 1 + inv * 1.65;
  if (['public', 'program', 'work', 'private', 'shared'].includes(role)) return 1 - inv * 0.44;
  return 1;
}

function expandedTemplates({ grammar, floor, area, profile, authoredIntent, stableKey, semanticProgram }) {
  const templates = floor === 0 ? grammar.ground : grammar.upper;
  const result = [];

  for (const template of templates) {
    let count = 1;
    if (template.repeat) {
      const natural = Math.round((area * template.areaWeight) / Math.max(2, template.repeat.desiredArea));
      count = clamp(natural, template.repeat.min, template.repeat.max);
      if (profile.inversion >= 0.58) {
        // Reversal deliberately coalesces normally repetitive cellular programs.
        count = Math.max(1, Math.round(count * (1 - profile.inversion * 0.48)));
      }
    }

    for (let i = 0; i < count; i++) {
      const instanceKey = count === 1 ? template.key : `${template.key}:${i + 1}`;
      const authoredType = floor === 0 ? authoredIntent?.groundOverrides?.[template.key] : null;
      result.push({
        key: instanceKey,
        templateKey: template.key,
        role: template.role,
        areaWeight: (template.areaWeight / count) * roleMultiplier(template.role, profile),
        minArea: template.minArea,
        maxArea: template.maxArea,
        exteriorPreference: invertExteriorPreference(template.exteriorPreference, profile),
        conventionalExteriorPreference: template.exteriorPreference,
        privacy: template.privacy,
        daylight: template.daylight,
        facadePattern: template.facadePattern,
        requiredAdjacency: [...template.requiredAdjacency],
        preferredAdjacency: [...template.preferredAdjacency],
        semanticProgram,
        spaceType: authoredType ?? template.program ?? `${semanticProgram}:${template.role}`,
        source: authoredType ? 'spawn-authored-intent' : 'grammar',
      });
    }
  }

  if (profile.rules.echoDominantSpaces && result.length >= 3) {
    const candidates = result
      .filter(item => !['entry', 'circulation', 'service', 'storage'].includes(item.role))
      .sort((a, b) => b.areaWeight - a.areaWeight || a.key.localeCompare(b.key));
    const dominant = candidates[0];
    if (dominant) {
      const echoCount = profile.inversion >= 0.9 ? 2 : 1;
      for (let i = 0; i < echoCount; i++) {
        result.push({
          ...dominant,
          key: `${dominant.key}:echo-${i + 1}`,
          areaWeight: dominant.areaWeight * (0.34 + i * 0.08),
          spaceType: `${dominant.spaceType}:echo`,
          source: 'far-field-echo',
          requiredAdjacency: [],
          preferredAdjacency: [dominant.templateKey],
        });
      }
    }
  }

  // Stable tie perturbation prevents perfectly repeated allocation without
  // allowing entropy to become the architectural authority.
  for (const item of result) {
    const raw = hashString32(`${stableKey}:${floor}:${item.key}:weight-grain`) / 0xffffffff;
    const grain = (raw * 2 - 1) * profile.entropy * 0.12;
    item.areaWeight *= 1 + grain;
  }

  return result;
}

function matchesTemplate(space, templateKey) {
  return space.templateKey === templateKey || space.key === templateKey;
}

function conventionalEdges(spaces) {
  const byTemplate = new Map();
  for (const s of spaces) {
    const list = byTemplate.get(s.templateKey) ?? [];
    list.push(s);
    byTemplate.set(s.templateKey, list);
  }
  const seen = new Set();
  const edges = [];
  const add = (a, b, strength) => {
    if (!a || !b || a.key === b.key) return;
    const pair = [a.key, b.key].sort();
    const id = pair.join('|');
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ a: a.key, b: b.key, strength, source: 'grammar' });
  };

  for (const s of spaces) {
    for (const targetKey of s.requiredAdjacency) {
      const targets = byTemplate.get(targetKey) ?? [];
      if (!targets.length) continue;
      if (targets.length === 1) add(s, targets[0], 'required');
      else if ((byTemplate.get(s.templateKey) ?? []).length > 1) {
        const siblings = byTemplate.get(s.templateKey);
        const index = Math.max(0, siblings.indexOf(s));
        add(s, targets[index % targets.length], 'required');
      } else {
        for (const target of targets) add(s, target, 'required');
      }
    }
    for (const targetKey of s.preferredAdjacency) {
      const targets = byTemplate.get(targetKey) ?? [];
      if (targets[0]) add(s, targets[stableIndex(`${s.key}:${targetKey}`, targets.length)], 'preferred');
    }
  }
  return edges;
}

function chooseRootSpace(spaces, floor) {
  if (floor === 0) return spaces.find(s => s.role === 'entry')
    ?? spaces.find(s => s.role === 'public')
    ?? spaces.find(s => s.role === 'circulation')
    ?? spaces[0];
  return spaces.find(s => s.role === 'circulation')
    ?? spaces.find(s => s.role === 'service')
    ?? spaces[0];
}

function graphReachable(spaces, edges, rootKey) {
  const neighbors = new Map(spaces.map(s => [s.key, []]));
  for (const edge of edges) {
    neighbors.get(edge.a)?.push(edge.b);
    neighbors.get(edge.b)?.push(edge.a);
  }
  const seen = new Set(rootKey ? [rootKey] : []);
  const queue = rootKey ? [rootKey] : [];
  while (queue.length) {
    const next = queue.shift();
    for (const n of neighbors.get(next) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

function buildTopology({ spaces, floor, profile, stableKey }) {
  if (!spaces.length) return { rootKey: null, edges: [], inversionOperations: [] };
  const root = chooseRootSpace(spaces, floor);
  const conventional = conventionalEdges(spaces);
  const operations = [];
  let edges = [];

  if (profile.rules.serviceThresholdFirst) {
    const roleOrder = role => {
      if (role === 'entry') return 0;
      if (role === 'service' || role === 'storage') return 1;
      if (role === 'circulation') return 2;
      if (role === 'private' || role === 'work' || role === 'program' || role === 'shared') return 3;
      if (role === 'public') return 4;
      return 3;
    };
    const ordered = [...spaces].sort((a, b) => roleOrder(a.role) - roleOrder(b.role)
      || stableIndex(`${stableKey}:far-order:${a.key}`, 1000000) - stableIndex(`${stableKey}:far-order:${b.key}`, 1000000));
    const rootIndex = ordered.findIndex(s => s.key === root.key);
    if (rootIndex > 0) {
      const [r] = ordered.splice(rootIndex, 1);
      ordered.unshift(r);
    }
    for (let i = 1; i < ordered.length; i++) {
      edges.push({ a: ordered[i - 1].key, b: ordered[i].key, strength: 'required', source: 'reversal-backbone' });
    }
    // Keep a few conventional relationships as an architectural afterimage,
    // but suppress threshold shortcuts that would undo the inversion.
    for (const edge of conventional) {
      const a = spaces.find(s => s.key === edge.a);
      const b = spaces.find(s => s.key === edge.b);
      const rootPublicShortcut = (a?.key === root.key && b?.role === 'public') || (b?.key === root.key && a?.role === 'public');
      if (rootPublicShortcut) continue;
      const retain = (hashString32(`${stableKey}:memory:${edge.a}:${edge.b}`) / 0xffffffff) > (0.72 + profile.inversion * 0.16);
      if (retain) edges.push({ ...edge, strength: 'memory', source: 'conventional-afterimage' });
    }
    operations.push('service-threshold-first', 'hierarchy-reversal', 'deep-public-destination');
  } else {
    edges = conventional.map(edge => ({ ...edge }));
    if (profile.inversion >= 0.38) {
      const service = spaces.find(s => s.role === 'service' || s.role === 'storage');
      if (service && root && service.key !== root.key) {
        edges.push({ a: root.key, b: service.key, strength: 'required', source: 'latent-reversal' });
        operations.push('latent-service-threshold');
      }
    }
  }

  // De-duplicate and then guarantee connectedness.  Connectivity is a hard
  // invariant even when conventional adjacency is intentionally inverted.
  const unique = new Map();
  for (const edge of edges) {
    const id = [edge.a, edge.b].sort().join('|');
    if (!unique.has(id)) unique.set(id, edge);
  }
  edges = [...unique.values()];
  let reachable = graphReachable(spaces, edges, root.key);
  const fallbackHub = spaces.find(s => s.role === 'circulation') ?? root;
  for (const s of spaces) {
    if (reachable.has(s.key)) continue;
    edges.push({ a: fallbackHub.key, b: s.key, strength: 'required', source: 'connectivity-repair' });
    reachable = graphReachable(spaces, edges, root.key);
  }

  if (profile.rules.invertExteriorPreference) operations.push('inside-out-perimeter-preference');
  if (profile.rules.echoDominantSpaces) operations.push('singular-space-echo');
  if (profile.rules.driftVerticalStacks) operations.push('nonstructural-stack-drift');
  if (profile.rules.facadeCausality === 'facade-inward') operations.push('facade-causality-reversal');

  return { rootKey: root.key, edges, inversionOperations: [...new Set(operations)] };
}
function floorBounds(modules) {
  return modules.reduce((acc, module) => ({
    minX: Math.min(acc.minX, module.cx - module.halfX),
    maxX: Math.max(acc.maxX, module.cx + module.halfX),
    minZ: Math.min(acc.minZ, module.cz - module.halfZ),
    maxZ: Math.max(acc.maxZ, module.cz + module.halfZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function pointInsideAnyModule(x, z, modules) {
  return modules.some(module => x > module.cx - module.halfX - EPS && x < module.cx + module.halfX + EPS
    && z > module.cz - module.halfZ - EPS && z < module.cz + module.halfZ + EPS);
}

function chooseCellSize(modules, minimumClearWidth = 0.72) {
  const minSpan = Math.min(...modules.map(module => Math.min(module.halfX * 2, module.halfZ * 2)));
  const natural = clamp(minSpan / 7.5, 0.52, 1.08);
  // A one-cell circulation band is allowed to be a real route, so the planning
  // lattice itself must never be narrower than the resolved player-scale route.
  // Tiny envelopes clamp to their own span rather than disappearing entirely.
  return Math.min(minSpan, Math.max(natural, Math.min(minSpan, Math.max(0.72, minimumClearWidth))));
}

function buildFloorGrid({ modules, floor, floorH, reservations, minimumClearWidth = 0.72 }) {
  const activeModules = modules.filter(module => module.floors > floor);
  if (!activeModules.length) return null;
  const bounds = floorBounds(activeModules);
  const cellSize = chooseCellSize(activeModules, minimumClearWidth);
  const minIx = Math.floor(bounds.minX / cellSize);
  const maxIx = Math.ceil(bounds.maxX / cellSize);
  const minIz = Math.floor(bounds.minZ / cellSize);
  const maxIz = Math.ceil(bounds.maxZ / cellSize);
  const y0 = floor * floorH;
  const y1 = y0 + floorH;
  const floorReservations = reservations.filter(r => reservationHitsFloor(r, y0, y1));
  const cells = [];
  const byKey = new Map();
  for (let iz = minIz; iz < maxIz; iz++) {
    for (let ix = minIx; ix < maxIx; ix++) {
      const x = (ix + 0.5) * cellSize;
      const z = (iz + 0.5) * cellSize;
      if (!pointInsideAnyModule(x, z, activeModules)) continue;
      const reservation = floorReservations.find(r =>
        cellIntersectsReservation({ x, z }, r, cellSize * 0.5));
      const cell = {
        key: `${ix},${iz}`,
        ix, iz, x, z,
        exposure: 0,
        exposedSides: [],
        structuralReservationId: reservation?.id ?? null,
        structuralReservationKind: reservation?.kind ?? null,
        spaceId: null,
      };
      cells.push(cell);
      byKey.set(cell.key, cell);
    }
  }
  const dirs = [
    [0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west'],
  ];
  for (const cell of cells) {
    for (const [dx, dz, side] of dirs) {
      if (!byKey.has(`${cell.ix + dx},${cell.iz + dz}`)) cell.exposedSides.push(side);
    }
    cell.exposure = cell.exposedSides.length;
  }
  return { activeModules, bounds, cellSize, cells, byKey, y0, y1 };
}

function neighborsOf(cell, grid) {
  return [
    grid.byKey.get(`${cell.ix + 1},${cell.iz}`),
    grid.byKey.get(`${cell.ix - 1},${cell.iz}`),
    grid.byKey.get(`${cell.ix},${cell.iz + 1}`),
    grid.byKey.get(`${cell.ix},${cell.iz - 1}`),
  ].filter(Boolean);
}

function cellEligibleForSpace(cell, space) {
  if (!cell.structuralReservationId) return true;
  return space.role === 'circulation' || space.role === 'entry';
}

function preferenceScore(cell, space, profile, stableKey) {
  const preference = space.exteriorPreference;
  let score = 0;
  if (preference === 'perimeter' || preference === 'street' || preference === 'courtyard') score += cell.exposure * 2.2;
  else if (preference === 'deep') score += (4 - cell.exposure) * 2.0;
  else score += cell.exposure * 0.2;
  if (space.daylight === 'high') score += cell.exposure * (profile.rules.invertExteriorPreference ? 0.2 : 0.75);
  if (space.daylight === 'low') score += (4 - cell.exposure) * 0.45;
  if (space.role === 'circulation' && cell.structuralReservationId) score += 9;
  const grain = (hashString32(`${stableKey}:${space.key}:${cell.key}`) / 0xffffffff) - 0.5;
  return score + grain * (0.25 + profile.entropy * 1.5);
}

function nearestCell(cells, point, predicate = () => true) {
  let best = null;
  let bestDistance = Infinity;
  for (const cell of cells) {
    if (!predicate(cell)) continue;
    const dx = cell.x - point.x;
    const dz = cell.z - point.z;
    const d = dx * dx + dz * dz;
    if (d < bestDistance) {
      bestDistance = d;
      best = cell;
    }
  }
  return best;
}

function rootAnchor({ floor, rootSpace, grid, accessAnchors, reservations }) {
  if (floor === 0) {
    const anchor = accessAnchors.find(a => a.floor === 0 && a.kind === 'main-entry')
      ?? accessAnchors.find(a => a.floor === 0);
    if (anchor) return { x: anchor.x, z: anchor.z, source: anchor.id };
  }
  if (rootSpace?.role === 'circulation') {
    const active = reservations.find(r => reservationHitsFloor(r, grid.y0, grid.y1));
    if (active) return { x: active.x, z: active.z, source: active.id };
  }
  return { x: (grid.bounds.minX + grid.bounds.maxX) * 0.5, z: (grid.bounds.minZ + grid.bounds.maxZ) * 0.5, source: 'floor-center' };
}

function graphBfsOrder(spaces, edges, rootKey) {
  const byKey = new Map(spaces.map(s => [s.key, s]));
  // In full reversal the backbone is not merely a semantic wish: it is the
  // placement authority.  Conventional-afterimage loops are allowed to appear
  // only after the chain has acquired real shared boundaries.
  const backbone = edges.filter(edge => edge.source === 'reversal-backbone');
  const placementEdges = backbone.length ? backbone : edges.filter(edge => edge.strength !== 'preferred');
  const neighbors = new Map(spaces.map(s => [s.key, []]));
  for (const edge of placementEdges) {
    neighbors.get(edge.a)?.push(edge.b);
    neighbors.get(edge.b)?.push(edge.a);
  }
  for (const values of neighbors.values()) values.sort();
  const parent = new Map([[rootKey, null]]);
  const order = [];
  const queue = [rootKey];
  while (queue.length) {
    const key = queue.shift();
    order.push(byKey.get(key));
    for (const n of neighbors.get(key) ?? []) {
      if (parent.has(n)) continue;
      parent.set(n, key);
      queue.push(n);
    }
  }
  for (const s of spaces) {
    if (!parent.has(s.key)) {
      parent.set(s.key, rootKey);
      order.push(s);
    }
  }
  return { order: order.filter(Boolean), parent };
}

function targetCellCounts(spaces, grid) {
  const nonReserved = grid.cells.filter(c => !c.structuralReservationId).length;
  const reserved = grid.cells.length - nonReserved;
  const circulationCount = spaces.filter(s => s.role === 'circulation' || s.role === 'entry').length;
  const allocatable = nonReserved + (circulationCount ? reserved : 0);
  const sumWeight = spaces.reduce((sum, s) => sum + Math.max(0.001, s.areaWeight), 0);
  const targets = new Map();
  let total = 0;
  for (const s of spaces) {
    const raw = Math.max(1, Math.round(allocatable * Math.max(0.001, s.areaWeight) / sumWeight));
    targets.set(s.key, raw);
    total += raw;
  }
  while (total > allocatable && total > spaces.length) {
    const candidates = [...spaces].sort((a, b) => (targets.get(b.key) ?? 0) - (targets.get(a.key) ?? 0) || a.key.localeCompare(b.key));
    const candidate = candidates.find(s => (targets.get(s.key) ?? 0) > 1);
    if (!candidate) break;
    targets.set(candidate.key, targets.get(candidate.key) - 1);
    total--;
  }
  while (total < allocatable && spaces.length) {
    const candidate = spaces[total % spaces.length];
    targets.set(candidate.key, targets.get(candidate.key) + 1);
    total++;
  }
  return targets;
}

function growSpace({ space, seed, target, grid, stableKey, profile, reserveForRemaining }) {
  if (!seed) return [];
  const assigned = [seed];
  seed.spaceId = space.key;
  const frontier = new Map();
  const considerNeighbors = cell => {
    for (const neighbor of neighborsOf(cell, grid)) {
      if (neighbor.spaceId || !cellEligibleForSpace(neighbor, space)) continue;
      frontier.set(neighbor.key, neighbor);
    }
  };
  considerNeighbors(seed);

  while (assigned.length < target && frontier.size) {
    const unassignedEligible = grid.cells.filter(c => !c.spaceId && cellEligibleForSpace(c, space)).length;
    if (unassignedEligible <= reserveForRemaining) break;
    const candidates = [...frontier.values()];
    candidates.sort((a, b) => preferenceScore(b, space, profile, stableKey) - preferenceScore(a, space, profile, stableKey)
      || a.key.localeCompare(b.key));
    const next = candidates[0];
    frontier.delete(next.key);
    if (!next || next.spaceId) continue;
    next.spaceId = space.key;
    assigned.push(next);
    considerNeighbors(next);
  }
  return assigned;
}

function chooseChildSeed({ space, parentKey, grid, profile, stableKey }) {
  const boundary = [];
  if (parentKey) {
    for (const cell of grid.cells) {
      if (cell.spaceId) continue;
      if (!cellEligibleForSpace(cell, space)) continue;
      if (neighborsOf(cell, grid).some(n => n.spaceId === parentKey)) boundary.push(cell);
    }
  }
  const candidates = boundary.length ? boundary : grid.cells.filter(cell => !cell.spaceId && cellEligibleForSpace(cell, space));
  candidates.sort((a, b) => preferenceScore(b, space, profile, stableKey) - preferenceScore(a, space, profile, stableKey)
    || a.key.localeCompare(b.key));
  return { seed: candidates[0] ?? null, parentBoundaryRealized: boundary.length > 0 };
}

function assignLeftovers({ grid, spaces, profile, stableKey }) {
  const spaceByKey = new Map(spaces.map(s => [s.key, s]));
  let pending = grid.cells.filter(cell => !cell.spaceId);
  let guard = 0;
  while (pending.length && guard++ < grid.cells.length + 4) {
    let progress = 0;
    for (const cell of pending) {
      const neighbors = neighborsOf(cell, grid).filter(n => n.spaceId);
      if (!neighbors.length) continue;
      const eligible = neighbors.filter(n => cellEligibleForSpace(cell, spaceByKey.get(n.spaceId)));
      if (!eligible.length) continue;
      eligible.sort((a, b) => preferenceScore(cell, spaceByKey.get(b.spaceId), profile, `${stableKey}:leftover`) - preferenceScore(cell, spaceByKey.get(a.spaceId), profile, `${stableKey}:leftover`)
        || a.spaceId.localeCompare(b.spaceId));
      cell.spaceId = eligible[0].spaceId;
      progress++;
    }
    if (!progress) break;
    pending = grid.cells.filter(cell => !cell.spaceId);
  }

  // Any isolated structural-reservation island belongs to circulation if one
  // exists; otherwise it remains intentionally unclaimed and is reported.
  const circulation = spaces.find(s => s.role === 'circulation') ?? spaces.find(s => s.role === 'entry') ?? null;
  if (circulation) {
    for (const cell of grid.cells) {
      if (!cell.spaceId && cell.structuralReservationId) cell.spaceId = circulation.key;
    }
  }
}

function spaceCentroid(cells) {
  if (!cells.length) return { x: 0, z: 0 };
  return {
    x: cells.reduce((sum, c) => sum + c.x, 0) / cells.length,
    z: cells.reduce((sum, c) => sum + c.z, 0) / cells.length,
  };
}

function compactSpaceCells(cells, cellSize) {
  if (!cells.length) return [];
  const byRow = new Map();
  for (const cell of cells) {
    const row = byRow.get(cell.iz) ?? [];
    row.push(cell);
    byRow.set(cell.iz, row);
  }
  const runs = [];
  for (const [iz, row] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    row.sort((a, b) => a.ix - b.ix);
    let start = row[0].ix;
    let end = row[0].ix;
    for (let i = 1; i <= row.length; i++) {
      const ix = row[i]?.ix;
      if (ix === end + 1) {
        end = ix;
        continue;
      }
      runs.push({ iz0: iz, iz1: iz, ix0: start, ix1: end });
      if (i < row.length) start = end = ix;
    }
  }
  // Merge vertically adjacent identical x-runs.
  const merged = [];
  for (const run of runs) {
    const prior = merged.find(item => item.ix0 === run.ix0 && item.ix1 === run.ix1 && item.iz1 + 1 === run.iz0);
    if (prior) prior.iz1 = run.iz1;
    else merged.push({ ...run });
  }
  return merged.map(run => ({
    minX: run.ix0 * cellSize,
    maxX: (run.ix1 + 1) * cellSize,
    minZ: run.iz0 * cellSize,
    maxZ: (run.iz1 + 1) * cellSize,
    cx: (run.ix0 + run.ix1 + 1) * cellSize * 0.5,
    cz: (run.iz0 + run.iz1 + 1) * cellSize * 0.5,
    halfX: (run.ix1 - run.ix0 + 1) * cellSize * 0.5,
    halfZ: (run.iz1 - run.iz0 + 1) * cellSize * 0.5,
  }));
}

function boundaryCandidates(grid) {
  const map = new Map();
  const add = (a, b, boundary) => {
    if (!a?.spaceId || !b?.spaceId || a.spaceId === b.spaceId) return;
    const id = [a.spaceId, b.spaceId].sort().join('|');
    const list = map.get(id) ?? [];
    list.push(boundary);
    map.set(id, list);
  };
  for (const cell of grid.cells) {
    const east = grid.byKey.get(`${cell.ix + 1},${cell.iz}`);
    const south = grid.byKey.get(`${cell.ix},${cell.iz + 1}`);
    if (east) add(cell, east, {
      axis: 'z', fixedCoord: (cell.x + east.x) * 0.5, centerCoord: (cell.z + east.z) * 0.5,
      x: (cell.x + east.x) * 0.5, z: (cell.z + east.z) * 0.5,
    });
    if (south) add(cell, south, {
      axis: 'x', fixedCoord: (cell.z + south.z) * 0.5, centerCoord: (cell.x + south.x) * 0.5,
      x: (cell.x + south.x) * 0.5, z: (cell.z + south.z) * 0.5,
    });
  }
  return map;
}

function realizeTopology({ spaces, desiredEdges, grid, rootKey, stableKey }) {
  const boundaries = boundaryCandidates(grid);
  const pairEntries = [...boundaries.entries()].map(([pair, candidates]) => {
    const [a, b] = pair.split('|');
    return { pair, a, b, candidates };
  });
  const desiredByPair = new Map();
  for (const edge of desiredEdges) desiredByPair.set([edge.a, edge.b].sort().join('|'), edge);

  const edges = [];
  const unrealizedDesiredEdges = [];
  const usedPairs = new Set();
  for (const edge of desiredEdges) {
    const pair = [edge.a, edge.b].sort().join('|');
    if (!boundaries.has(pair)) {
      unrealizedDesiredEdges.push({ ...edge, reason: 'desired-adjacency-not-shared-wall' });
      continue;
    }
    usedPairs.add(pair);
    edges.push({ ...edge, geometryStatus: 'direct-shared-boundary' });
  }

  // Actual door topology is never allowed to lie about geometry. If a desired
  // graph edge cannot own a shared wall, add the smallest deterministic set of
  // real boundary edges needed to make every space reachable. The unfulfilled
  // desire remains diagnostic data for future solver improvement.
  let reachable = graphReachable(spaces, edges, rootKey);
  let repairOrdinal = 0;
  while (reachable.size < spaces.length) {
    const candidates = pairEntries.filter(item => {
      if (usedPairs.has(item.pair)) return false;
      const ar = reachable.has(item.a);
      const br = reachable.has(item.b);
      return ar !== br;
    });
    if (!candidates.length) break;
    candidates.sort((a, b) => {
      const aDesired = desiredByPair.has(a.pair) ? 1 : 0;
      const bDesired = desiredByPair.has(b.pair) ? 1 : 0;
      if (aDesired !== bDesired) return bDesired - aDesired;
      return stableIndex(`${stableKey}:geometry-repair:${a.pair}`, 1000000)
        - stableIndex(`${stableKey}:geometry-repair:${b.pair}`, 1000000);
    });
    const next = candidates[0];
    usedPairs.add(next.pair);
    edges.push({
      a: next.a,
      b: next.b,
      strength: 'required',
      source: 'geometry-connectivity-repair',
      geometryStatus: 'direct-shared-boundary',
      repairOrdinal: repairOrdinal++,
    });
    reachable = graphReachable(spaces, edges, rootKey);
  }

  return {
    edges,
    unrealizedDesiredEdges,
    geometryRepairEdgeCount: edges.filter(edge => edge.source === 'geometry-connectivity-repair').length,
    reachable,
    geometricAdjacencyPairCount: pairEntries.length,
  };
}

function resolvedDoorWidth(physicalTruth) {
  return Math.max(0.72,
    Number(physicalTruth?.door?.clearWidth?.realizedSI)
      || Number(physicalTruth?.door?.clearWidthSI)
      || Number(physicalTruth?.route?.clearWidthSI)
      || 0.86);
}

function openingsFromTopology({ grid, edges, rootKey, accessAnchors, physicalTruth, stableKey, floor }) {
  const boundaries = boundaryCandidates(grid);
  const width = resolvedDoorWidth(physicalTruth);
  const openings = [];
  const unresolved = [];
  for (const edge of edges) {
    const id = [edge.a, edge.b].sort().join('|');
    const candidates = boundaries.get(id) ?? [];
    if (!candidates.length) {
      unresolved.push({ ...edge, reason: 'graph-edge-not-yet-geometrically-adjacent' });
      continue;
    }
    const candidate = candidates[stableIndex(`${stableKey}:opening:${floor}:${id}`, candidates.length)];
    openings.push({
      id: `${stableKey}:floor:${floor}:door:${openings.length}`,
      kind: 'interior-door',
      fromSpaceKey: edge.a,
      toSpaceKey: edge.b,
      width,
      height: Math.max(1.95, Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.03),
      ...candidate,
      topologySource: edge.source,
    });
  }
  if (floor === 0 && rootKey) {
    for (const anchor of accessAnchors.filter(a => a.floor === 0)) {
      openings.push({
        id: `${stableKey}:entrance:${anchor.id}`,
        kind: anchor.kind,
        fromSpaceKey: 'street',
        toSpaceKey: rootKey,
        width,
        height: Math.max(1.95, Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.03),
        x: anchor.x,
        z: anchor.z,
        side: anchor.side,
        dc: anchor.dc,
        dr: anchor.dr,
        connectorId: anchor.connectorId,
        topologySource: 'authoritative-access-anchor',
      });
    }
  }
  return { openings, unresolved };
}

function facadeParameters(space, profile) {
  let openingRatio = 0.26;
  let bayWidth = 1.55;
  if (space.role === 'public') { openingRatio = 0.58; bayWidth = 2.2; }
  else if (space.role === 'work' || space.role === 'program') { openingRatio = 0.42; bayWidth = 1.75; }
  else if (space.role === 'private') { openingRatio = 0.31; bayWidth = 1.35; }
  else if (space.role === 'shared') { openingRatio = 0.38; bayWidth = 1.7; }
  else if (space.role === 'service' || space.role === 'storage') { openingRatio = 0.10; bayWidth = 2.6; }
  else if (space.role === 'circulation') { openingRatio = 0.15; bayWidth = 1.05; }

  if (profile.rules.facadeCausality === 'facade-inward') {
    // Far away the facade becomes the dominant ordering system. Service bands
    // become oddly articulate while public destinations are generally buried.
    if (space.role === 'service' || space.role === 'storage') openingRatio = 0.40 + profile.inversion * 0.16;
    else openingRatio *= 0.74;
    bayWidth *= 0.82 + profile.inversion * 0.12;
  }
  return { openingRatio: clamp(openingRatio, 0.04, 0.72), bayWidth: clamp(bayWidth, 0.8, 3.2) };
}

function facadeIntents({ spaces, grid, profile }) {
  const bySpace = new Map(spaces.map(s => [s.key, s]));
  const groups = new Map();
  for (const cell of grid.cells) {
    if (!cell.spaceId) continue;
    for (const side of cell.exposedSides) {
      const key = `${cell.spaceId}:${side}`;
      const group = groups.get(key) ?? { spaceKey: cell.spaceId, side, cells: [] };
      group.cells.push(cell);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(group => {
    const s = bySpace.get(group.spaceKey);
    const params = facadeParameters(s, profile);
    const span = group.cells.length * grid.cellSize;
    return {
      spaceKey: group.spaceKey,
      semanticProgram: s?.semanticProgram ?? null,
      spaceType: s?.spaceType ?? null,
      role: s?.role ?? null,
      side: group.side,
      exposedCellCount: group.cells.length,
      approximateSpan: span,
      facadePattern: s?.facadePattern ?? 'ordinary',
      causality: profile.rules.facadeCausality,
      openingRatio: params.openingRatio,
      bayWidth: params.bayWidth,
      desiredBayCount: Math.max(1, Math.round(span / params.bayWidth)),
    };
  }).sort((a, b) => a.side.localeCompare(b.side) || a.spaceKey.localeCompare(b.spaceKey));
}

function planFloor({
  floor, modules, floorH, reservations, accessAnchors, grammar, profile, authoredIntent,
  semanticProgram, physicalTruth, stableKey,
}) {
  const area = floorArea(modules, floor);
  const minimumClearWidth = Math.max(0.72,
    Number(physicalTruth?.route?.clearWidthSI)
      || Number(physicalTruth?.door?.clearWidth?.realizedSI)
      || Number(physicalTruth?.door?.clearWidthSI)
      || 0.86);
  const grid = buildFloorGrid({ modules, floor, floorH, reservations, minimumClearWidth });
  if (!grid || !grid.cells.length) return null;
  let spaces = expandedTemplates({ grammar, floor, area, profile, authoredIntent, stableKey, semanticProgram });

  // A plan with more named spaces than geometric substrate is a bad abstraction.
  // Collapse lowest-weight cells before geometry instead of emitting impossible
  // paper architecture.
  const maxSpaces = Math.max(1, Math.floor(grid.cells.length / 3));
  if (spaces.length > maxSpaces) {
    const protectedKeys = new Set([chooseRootSpace(spaces, floor)?.key]);
    spaces = [...spaces]
      .sort((a, b) => Number(protectedKeys.has(b.key)) - Number(protectedKeys.has(a.key)) || b.areaWeight - a.areaWeight || a.key.localeCompare(b.key))
      .slice(0, maxSpaces);
  }

  const topology = buildTopology({ spaces, floor, profile, stableKey: `${stableKey}:floor:${floor}` });
  const rootSpace = spaces.find(s => s.key === topology.rootKey) ?? spaces[0];
  const { order, parent } = graphBfsOrder(spaces, topology.edges, rootSpace.key);
  const targets = targetCellCounts(spaces, grid);
  const rootPoint = rootAnchor({ floor, rootSpace, grid, accessAnchors, reservations });
  const rootSeed = nearestCell(grid.cells, rootPoint, cell => !cell.spaceId && cellEligibleForSpace(cell, rootSpace));
  const geometryNotes = [];

  for (let ordinal = 0; ordinal < order.length; ordinal++) {
    const s = order[ordinal];
    let seedInfo;
    if (ordinal === 0) {
      seedInfo = { seed: rootSeed, parentBoundaryRealized: true };
    } else {
      seedInfo = chooseChildSeed({
        space: s,
        parentKey: parent.get(s.key),
        grid,
        profile,
        stableKey: `${stableKey}:floor:${floor}:seed`,
      });
    }
    if (!seedInfo.seed) {
      geometryNotes.push({ spaceKey: s.key, kind: 'no-geometric-seed' });
      continue;
    }
    if (!seedInfo.parentBoundaryRealized && ordinal > 0) {
      geometryNotes.push({ spaceKey: s.key, kind: 'parent-adjacency-fallback' });
    }
    const remaining = order.length - ordinal - 1;
    growSpace({
      space: s,
      seed: seedInfo.seed,
      target: targets.get(s.key) ?? 1,
      grid,
      stableKey: `${stableKey}:floor:${floor}:grow`,
      profile,
      reserveForRemaining: remaining,
    });
  }
  assignLeftovers({ grid, spaces, profile, stableKey: `${stableKey}:floor:${floor}` });

  const cellArea = grid.cellSize * grid.cellSize;
  const realizedSpaces = spaces.map(s => {
    const cells = grid.cells.filter(cell => cell.spaceId === s.key);
    const centroid = spaceCentroid(cells);
    return {
      id: `${stableKey}:floor:${floor}:space:${s.key}`,
      key: s.key,
      templateKey: s.templateKey,
      floor,
      yBase: floor * floorH,
      role: s.role,
      semanticProgram: s.semanticProgram,
      spaceType: s.spaceType,
      source: s.source,
      privacy: s.privacy,
      daylight: s.daylight,
      exteriorPreference: s.exteriorPreference,
      conventionalExteriorPreference: s.conventionalExteriorPreference,
      targetArea: (targets.get(s.key) ?? 0) * cellArea,
      realizedArea: cells.length * cellArea,
      cellCount: cells.length,
      centroid,
      regions: compactSpaceCells(cells, grid.cellSize),
      facadePattern: s.facadePattern,
      structuralReservationIds: [...new Set(cells.map(c => c.structuralReservationId).filter(Boolean))],
    };
  }).filter(s => s.cellCount > 0);

  const realizedKeys = new Set(realizedSpaces.map(s => s.key));
  const desiredEdges = topology.edges.filter(edge => realizedKeys.has(edge.a) && realizedKeys.has(edge.b));
  const realizedTopology = realizeTopology({
    spaces: realizedSpaces, desiredEdges, grid, rootKey: rootSpace.key, stableKey: `${stableKey}:floor:${floor}`,
  });
  const realizedEdges = realizedTopology.edges;
  const openingPlan = openingsFromTopology({
    grid,
    edges: realizedEdges,
    rootKey: rootSpace.key,
    accessAnchors,
    physicalTruth,
    stableKey,
    floor,
  });
  const reachable = realizedTopology.reachable;
  const unclaimedCells = grid.cells.filter(cell => !cell.spaceId);

  return {
    floor,
    yBase: floor * floorH,
    floorHeight: floorH,
    approximateArea: area,
    rasterCellSize: grid.cellSize,
    minimumClearWidth,
    rootSpaceKey: rootSpace.key,
    spaces: realizedSpaces,
    desiredEdges,
    edges: realizedEdges,
    openings: openingPlan.openings,
    facadeIntents: facadeIntents({ spaces, grid, profile }),
    inversionOperations: topology.inversionOperations,
    diagnostics: {
      reachable: reachable.size === realizedSpaces.length,
      reachableSpaceCount: reachable.size,
      realizedSpaceCount: realizedSpaces.length,
      unresolvedGraphEdges: openingPlan.unresolved,
      unrealizedDesiredEdges: realizedTopology.unrealizedDesiredEdges,
      geometryRepairEdgeCount: realizedTopology.geometryRepairEdgeCount,
      geometricAdjacencyPairCount: realizedTopology.geometricAdjacencyPairCount,
      unclaimedCellCount: unclaimedCells.length,
      geometryNotes,
      structuralReservationCellCount: grid.cells.filter(cell => cell.structuralReservationId).length,
      minimumClearWidth,
      circulationWidthHealthy: realizedSpaces
        .filter(space => space.role === 'circulation' || space.role === 'entry')
        .every(space => space.regions.some(region => Math.min(region.halfX * 2, region.halfZ * 2) + EPS >= minimumClearWidth)),
    },
  };
}

function verticalEdgesForFloors(floors, stableKey, profile) {
  const result = [];
  for (let i = 0; i + 1 < floors.length; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];
    const lowerCore = lower.spaces.find(s => s.role === 'circulation') ?? lower.spaces.find(s => s.role === 'entry');
    const upperCore = upper.spaces.find(s => s.role === 'circulation') ?? upper.spaces.find(s => s.role === 'service');
    if (!lowerCore || !upperCore) continue;
    result.push({
      id: `${stableKey}:vertical:${i}-${i + 1}`,
      fromSpaceId: lowerCore.id,
      toSpaceId: upperCore.id,
      kind: 'authoritative-circulation-handoff',
      physicalGeometrySource: 'existing-semantic-connector/reservation',
      reversalMayMoveConnector: false,
      nonStructuralStackDrift: profile.rules.driftVerticalStacks
        ? {
            enabled: true,
            amplitudeMeters: 0.35 + profile.inversion * 0.85,
            note: 'May drift service/program organization around the fixed physical core; never drifts the authoritative stair/shaft itself.',
          }
        : { enabled: false, amplitudeMeters: 0 },
    });
  }
  return result;
}

function planSignature({ signatureType, authoredIntent }) {
  if (!signatureType) return null;
  return {
    signatureType,
    authoredIntentApplied: !!authoredIntent,
    accuracyNote: authoredIntent?.accuracyNote ?? null,
  };
}

export function planBuildingSidecar({
  worldSeed = 0,
  chunkKey = '0,0',
  chunkX = 0,
  chunkZ = 0,
  distanceChunks = Math.hypot(Number(chunkX) || 0, Number(chunkZ) || 0),
  weirdnessSampled = 0,
  isSpawn = chunkKey === '0,0' || (Number(chunkX) === 0 && Number(chunkZ) === 0),
  entityId = 'building',
  signatureType = null,
  programHint = null,
  districtComposition = null,
  exteriorMacroPreference = null,
  physicalUse = null,
  physicalTruth = null,
  floorHeight = null,
  modules = [],
  accessAnchors = [],
  circulationReservations = [],
  authoredIntent: explicitAuthoredIntent = null,
} = {}) {
  const normalized = normalizeModules(modules);
  if (!normalized.length) throw new Error('planBuildingSidecar requires at least one footprint module');
  const authoredIntent = explicitAuthoredIntent ?? (isSpawn && signatureType ? SPAWN_AUTHORED_INTENTS[signatureType] ?? null : null);
  const buildingSemanticTruth = ensureBuildingSemanticTruth({
    worldSeed,
    chunkKey,
    entityId,
    physicalUse,
    archetype: typeof physicalUse === 'object' ? physicalUse?.morphology ?? null : null,
    signatureType,
    programHint,
    authoredIntent,
    districtContext: districtComposition ?? (typeof physicalUse === 'object' ? physicalUse?.districtContext ?? null : null),
    exteriorMacroPreference,
  });
  const family = buildingSemanticTruth.physicalUseFamily;
  const semanticProgram = buildingSemanticTruth.program;
  const stableKey = buildingSemanticTruth.stableKey;
  const profile = architecturalFieldProfile({ distanceChunks, weirdnessSampled, isSpawn });
  const grammar = chooseGrammar({ stableKey, family, programHint: semanticProgram, authoredIntent });
  const floorH = clamp(floorHeight ?? physicalTruth?.floorHeight?.realizedSI ?? 3.15, 2.4, 5.8);
  const anchors = normalizeAccessAnchors(accessAnchors);
  const reservations = normalizeReservations(circulationReservations);
  const maxFloorCount = Math.max(...normalized.map(module => module.floors));
  const floors = [];
  for (let floor = 0; floor < maxFloorCount; floor++) {
    const planned = planFloor({
      floor,
      modules: normalized,
      floorH,
      reservations,
      accessAnchors: anchors,
      grammar,
      profile,
      authoredIntent,
      semanticProgram,
      physicalTruth,
      stableKey,
    });
    if (planned) floors.push(planned);
  }

  const allSpaces = floors.flatMap(f => f.spaces);
  const allOpenings = floors.flatMap(f => f.openings);
  const inversionOperations = [...new Set(floors.flatMap(f => f.inversionOperations))];
  const verticalEdges = verticalEdgesForFloors(floors, stableKey, profile);
  const topologyHealthy = floors.every(f => f.diagnostics.reachable);
  const unresolvedEdges = floors.reduce((sum, f) => sum + f.diagnostics.unresolvedGraphEdges.length, 0);
  const unrealizedDesiredEdges = floors.reduce((sum, f) => sum + f.diagnostics.unrealizedDesiredEdges.length, 0);
  const geometryRepairEdges = floors.reduce((sum, f) => sum + f.diagnostics.geometryRepairEdgeCount, 0);
  const unclaimedCells = floors.reduce((sum, f) => sum + f.diagnostics.unclaimedCellCount, 0);

  const result = {
    schema: SCHEMA,
    deterministicKey: stableKey,
    worldSeed: worldSeed >>> 0,
    chunkKey,
    entityId,
    buildingSemanticTruth,
    buildingSemanticTruthId: buildingSemanticTruth.id,
    buildingSemanticTruthFingerprint: buildingSemanticTruth.fingerprint,
    signature: planSignature({ signatureType, authoredIntent }),
    architecturalField: profile,
    northStar: ARCHITECTURAL_NORTH_STAR,
    grammar: {
      id: grammar.id,
      source: 'building-semantic-truth',
      buildingSemanticTruthId: buildingSemanticTruth.id,
      programDecision: buildingSemanticTruth.programDecision,
      physicalUseFamily: family,
      semanticProgram,
      notes: grammar.notes,
    },
    envelope: {
      moduleCount: normalized.length,
      floorCount: maxFloorCount,
      modules: normalized,
      authority: 'existing-kowloon-envelope',
    },
    accessAuthority: {
      anchors,
      circulationReservationIds: reservations.map(r => r.id),
      rule: 'sidecar may organize around physical truth but never weaken or relocate authoritative circulation',
    },
    floors,
    verticalEdges,
    spaces: allSpaces,
    openings: allOpenings,
    diagnostics: {
      topologyHealthy,
      unresolvedGeometricAdjacencyCount: unresolvedEdges,
      unrealizedDesiredAdjacencyCount: unrealizedDesiredEdges,
      geometryRepairEdgeCount: geometryRepairEdges,
      unclaimedRasterCellCount: unclaimedCells,
      inversionOperations,
      totalSpaces: allSpaces.length,
      totalOpenings: allOpenings.length,
      physicalTruthPreserved: true,
      readyForFabricEmission: topologyHealthy && unclaimedCells === 0,
    },
  };
  result.fingerprint = hashString32(JSON.stringify({
    buildingSemanticTruth: { id: buildingSemanticTruth.id, fingerprint: buildingSemanticTruth.fingerprint },
    grammar: result.grammar,
    field: result.architecturalField,
    floors: result.floors.map(f => ({
      floor: f.floor,
      spaces: f.spaces.map(s => ({ key: s.key, role: s.role, type: s.spaceType, regions: s.regions })),
      edges: f.edges,
      openings: f.openings.map(o => ({ kind: o.kind, from: o.fromSpaceKey, to: o.toSpaceKey, x: o.x, z: o.z })),
    })),
  })).toString(16).padStart(8, '0');
  return result;
}

export function summarizeBuildingPlan(plan) {
  return {
    schema: plan?.schema,
    fingerprint: plan?.fingerprint,
    phase: plan?.architecturalField?.phase,
    fidelity: plan?.architecturalField?.fidelity,
    inversion: plan?.architecturalField?.inversion,
    grammar: plan?.grammar?.id,
    buildingSemanticTruthId: plan?.buildingSemanticTruthId ?? null,
    semanticProgram: plan?.grammar?.semanticProgram,
    floorCount: plan?.floors?.length ?? 0,
    totalSpaces: plan?.diagnostics?.totalSpaces ?? 0,
    totalOpenings: plan?.diagnostics?.totalOpenings ?? 0,
    topologyHealthy: plan?.diagnostics?.topologyHealthy ?? false,
    inversionOperations: plan?.diagnostics?.inversionOperations ?? [],
  };
}

export { SCHEMA as BUILDING_PLAN_SIDECAR_SCHEMA, hashString32 };
