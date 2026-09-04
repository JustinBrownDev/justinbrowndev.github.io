export const STRUCTURAL_FEASIBILITY_SCHEMA = 'jweb.structural-feasibility.v1';
export const STRUCTURAL_FEASIBILITY_INTENT = 'STRUCTURAL_FEASIBILITY_V1';

function moduleKey(module, index = 0) {
  return String(module?.key ?? `module-${index}`);
}

function moduleCell(module) {
  const col = Number(module?.cell?.col);
  const row = Number(module?.cell?.row);
  return Number.isInteger(col) && Number.isInteger(row) ? { col, row } : null;
}

function unionRect(modules) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const module of modules) {
    const rect = module?.rect;
    if (!rect) return null;
    minX = Math.min(minX, Number(rect.cx) - Number(rect.halfX));
    maxX = Math.max(maxX, Number(rect.cx) + Number(rect.halfX));
    minZ = Math.min(minZ, Number(rect.cz) - Number(rect.halfZ));
    maxZ = Math.max(maxZ, Number(rect.cz) + Number(rect.halfZ));
  }
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || !(maxX > minX) || !(maxZ > minZ)) return null;
  return Object.freeze({
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    halfX: (maxX - minX) * 0.5,
    halfZ: (maxZ - minZ) * 0.5,
  });
}

function filledRectangularSets(modulePlans, maxModules = Infinity) {
  const byCell = new Map();
  for (const module of modulePlans) {
    const cell = moduleCell(module);
    if (cell) byCell.set(`${cell.col},${cell.row}`, module);
  }
  if (!byCell.size) return modulePlans.map(module => [module]);
  const cells = [...byCell.values()].map(moduleCell);
  const cols = [...new Set(cells.map(cell => cell.col))].sort((a, b) => a - b);
  const rows = [...new Set(cells.map(cell => cell.row))].sort((a, b) => a - b);
  const results = [];
  const seen = new Set();
  for (let ci = 0; ci < cols.length; ci++) for (let cj = ci; cj < cols.length; cj++) {
    const minCol = cols[ci], maxCol = cols[cj];
    for (let ri = 0; ri < rows.length; ri++) for (let rj = ri; rj < rows.length; rj++) {
      const minRow = rows[ri], maxRow = rows[rj];
      const expected = (maxCol - minCol + 1) * (maxRow - minRow + 1);
      if (expected < 1 || expected > maxModules) continue;
      const set = [];
      let filled = true;
      for (let col = minCol; col <= maxCol && filled; col++) for (let row = minRow; row <= maxRow; row++) {
        const module = byCell.get(`${col},${row}`);
        if (!module) { filled = false; break; }
        set.push(module);
      }
      if (!filled) continue;
      const key = set.map(moduleKey).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(set);
    }
  }
  return results.length ? results : modulePlans.map(module => [module]);
}

function landingEnvelope(core, landing, yFraction = null) {
  const geometry = landing?.geometry ?? landing;
  if (!geometry) return null;
  return Object.freeze({
    x: Number(geometry.x), z: Number(geometry.z),
    halfX: Number(geometry.hx), halfZ: Number(geometry.hz),
    yFraction: Number.isFinite(Number(yFraction)) ? Number(yFraction) : null,
  });
}

function circulationClaims({ core, hostKeys }) {
  const floorOpenings = core?.slabOpening ? [Object.freeze({ ...core.slabOpening })] : [];
  const landingEnvelopes = [
    landingEnvelope(core, core?.floorLanding, 0),
    ...(core?.intermediateLandings ?? []).map(item => landingEnvelope(core, item, item.yFraction)),
    landingEnvelope(core, core?.floorLanding, 1),
  ].filter(Boolean);
  const headroomVolumes = core?.opening ? [Object.freeze({
    x: core.opening.x, z: core.opening.z,
    halfX: core.opening.hx, halfZ: core.opening.hz,
    yMinFraction: 0, yMaxFraction: 1,
    headroom: core.segmentFlight?.headroom ?? null,
  })] : [];
  const exteriorMouths = core ? Object.freeze([
    Object.freeze({ side: 'low', axis: core.axis, along: core.lowMouth, laneCoords: Object.freeze([...core.laneCoords]) }),
    Object.freeze({ side: 'high', axis: core.axis, along: core.highMouth, laneCoords: Object.freeze([...core.laneCoords]) }),
  ]) : Object.freeze([]);
  return Object.freeze({
    required: true,
    class: core?.flightCount === 4 ? 'TALL_STORY_SWITCHBACK_4' : 'NORMAL_SWITCHBACK_2',
    hostModules: Object.freeze([...hostKeys]),
    footprint: core?.opening ? Object.freeze({ ...core.opening }) : null,
    floorOpenings: Object.freeze(floorOpenings),
    landingEnvelopes: Object.freeze(landingEnvelopes),
    headroomVolumes: Object.freeze(headroomVolumes),
    exteriorMouths,
  });
}

export function planStructuralFeasibility({
  modulePlans = [],
  primaryModule = null,
  floorH,
  physicalTruth,
  traversalEnvelope = null,
  stableKey = 'structural-feasibility',
  maxConsumedModules = Infinity,
  planStairCore,
} = {}) {
  if (typeof planStairCore !== 'function') throw new Error('StructuralFeasibility requires planStairCore callback');
  if (!primaryModule?.rect) return Object.freeze({
    schema: STRUCTURAL_FEASIBILITY_SCHEMA,
    intentTag: STRUCTURAL_FEASIBILITY_INTENT,
    accepted: false,
    rejectionReason: 'missing-primary-module',
    circulation: null,
    claims: null,
    replanHistory: Object.freeze([]),
  });
  const modules = Array.isArray(modulePlans) && modulePlans.length ? modulePlans : [primaryModule];
  const maxModules = Number.isFinite(Number(maxConsumedModules))
    ? Math.max(1, Math.floor(Number(maxConsumedModules))) : modules.length;
  const primaryKey = moduleKey(primaryModule);
  const candidates = [];
  for (const set of filledRectangularSets(modules, maxModules)) {
    const rect = unionRect(set);
    if (!rect) continue;
    const hostKeys = set.map(moduleKey);
    const core = planStairCore({
      rect, floorH, physicalTruth, traversalEnvelope,
      stableKey: `${stableKey}:feasibility:${hostKeys.join('+')}`,
    });
    if (!core) continue;
    const containsPrimary = hostKeys.includes(primaryKey);
    candidates.push({
      core, rect, hostKeys, modules: set, containsPrimary,
      area: rect.halfX * rect.halfZ * 4,
      distance: set.reduce((sum, module) => {
        const a = moduleCell(primaryModule), b = moduleCell(module);
        return sum + (a && b ? Math.abs(a.col - b.col) + Math.abs(a.row - b.row) : 0);
      }, 0),
    });
  }
  candidates.sort((a, b) =>
    Number(b.containsPrimary) - Number(a.containsPrimary)
    || a.modules.length - b.modules.length
    || a.distance - b.distance
    || a.area - b.area
    || a.hostKeys.join('|').localeCompare(b.hostKeys.join('|')));
  const chosen = candidates[0] ?? null;
  if (!chosen) return Object.freeze({
    schema: STRUCTURAL_FEASIBILITY_SCHEMA,
    intentTag: STRUCTURAL_FEASIBILITY_INTENT,
    accepted: false,
    rejectionReason: 'no-legal-circulation-envelope',
    circulation: null,
    claims: Object.freeze({ structural: false, traversal: false, collision: false, aperture: false }),
    replanHistory: Object.freeze([
      Object.freeze({ action: 'primary-module-fit', result: 'rejected' }),
      Object.freeze({ action: 'compound-rectangular-reallocation', result: 'rejected' }),
    ]),
  });
  const replanned = chosen.hostKeys.length > 1 || !chosen.containsPrimary;
  const replanMode = !replanned ? 'none' : chosen.containsPrimary ? 'consume-adjacent-module' : 'relocate-core-within-compound';
  const history = [Object.freeze({ action: 'primary-module-fit', result: chosen.hostKeys.length === 1 && chosen.containsPrimary ? 'accepted' : 'rejected' })];
  if (replanned) history.push(Object.freeze({ action: replanMode, result: 'accepted', hostModules: Object.freeze([...chosen.hostKeys]) }));
  return Object.freeze({
    schema: STRUCTURAL_FEASIBILITY_SCHEMA,
    intentTag: STRUCTURAL_FEASIBILITY_INTENT,
    accepted: true,
    rejectionReason: null,
    core: chosen.core,
    rect: chosen.rect,
    consumedModuleKeys: Object.freeze([...chosen.hostKeys]),
    replanned,
    replanMode,
    circulation: circulationClaims({ core: chosen.core, hostKeys: chosen.hostKeys }),
    claims: Object.freeze({
      structural: Object.freeze({ reservedBeforeCommit: true, owner: 'StructuralFeasibility' }),
      traversal: Object.freeze({ geometryProven: true, controllerProofRequired: true }),
      collision: Object.freeze({ source: 'structural-circulation', immutableAfterCommit: true }),
      aperture: Object.freeze({ floorOpeningsPlanned: true, mouthsPlanned: true }),
    }),
    replanHistory: Object.freeze(history),
  });
}
