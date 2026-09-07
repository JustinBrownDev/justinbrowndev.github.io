import { architecturalFieldProfile, clamp01 } from './distance-inversion.js';
import { ensureBuildingSemanticTruth } from '../building-semantic-truth.js';
import {
  ARCHITECTURAL_NORTH_STAR,
  FAMILY_GRAMMAR_POOLS,
  PLAN_GRAMMARS,
  PROGRAM_GRAMMAR,
  SPAWN_AUTHORED_INTENTS,
} from './plan-grammar-catalog.js';
import { claimUnassignedRasterToEligibleSpaces, chooseHumanScaleProgramDrop, minimumEligibleCellsReservedForRemaining } from './human-scale-capacity.js';
import { stairWalkAroundClearance } from '../interior-geometry-policy.js';
import { TRAVERSAL_PERMISSION } from '../sectional-circulation.js';
import { programArchitectureFor, programMorphologyPool, programTemplatesForFloor } from './program-architecture.js';
import { buildingSpeciesGrammar } from './building-species.js';

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

function chooseGrammar({ stableKey, family, programHint, authoredIntent, buildingSpecies = null }) {
  if (authoredIntent?.grammar && PLAN_GRAMMARS[authoredIntent.grammar]) return PLAN_GRAMMARS[authoredIntent.grammar];
  const speciesGrammar = buildingSpeciesGrammar(buildingSpecies);
  if (speciesGrammar && PLAN_GRAMMARS[speciesGrammar]) return PLAN_GRAMMARS[speciesGrammar];
  const programMorphologies = programMorphologyPool(programHint).filter(id => PLAN_GRAMMARS[id]);
  if (programMorphologies.length) {
    return PLAN_GRAMMARS[programMorphologies[stableIndex(`program-morphology:${stableKey}:${programHint}`, programMorphologies.length)]];
  }
  if (programHint && PROGRAM_GRAMMAR[programHint] && PLAN_GRAMMARS[PROGRAM_GRAMMAR[programHint]]) {
    return PLAN_GRAMMARS[PROGRAM_GRAMMAR[programHint]];
  }
  const pool = FAMILY_GRAMMAR_POOLS[family] ?? Object.keys(PLAN_GRAMMARS);
  return PLAN_GRAMMARS[pool[stableIndex(`grammar:${stableKey}:${family}`, pool.length)]];
}

function normalizeModules(modules = []) {
  return modules
    .map((module, index) => {
      const floors = Math.max(1, Math.floor(Number(module?.floors) || 1));
      const floorBase = Math.max(0, Math.floor(Number(module?.floorBase) || 0));
      const floorTop = floorBase + floors;
      return {
        key: String(module?.key ?? `module-${index}`),
        cx: Number(module?.cx) || 0,
        cz: Number(module?.cz) || 0,
        halfX: Math.max(0.3, Number(module?.halfX) || 0.3),
        halfZ: Math.max(0.3, Number(module?.halfZ) || 0.3),
        floors,
        floorBase,
        floorTop,
      };
    })
    .filter(module => Number.isFinite(module.cx) && Number.isFinite(module.cz));
}

function moduleArea(module) {
  return module.halfX * 2 * module.halfZ * 2;
}

function moduleOccupiesGlobalFloor(module, floor) {
  return floor >= module.floorBase && floor < module.floorTop;
}

function activeModulesForFloor(modules, floor) {
  return modules.filter(module => moduleOccupiesGlobalFloor(module, floor));
}

function moduleTouchesOrOverlaps(a, b) {
  const ax0 = a.cx - a.halfX, ax1 = a.cx + a.halfX;
  const az0 = a.cz - a.halfZ, az1 = a.cz + a.halfZ;
  const bx0 = b.cx - b.halfX, bx1 = b.cx + b.halfX;
  const bz0 = b.cz - b.halfZ, bz1 = b.cz + b.halfZ;
  const xOverlap = Math.min(ax1, bx1) - Math.max(ax0, bx0);
  const zOverlap = Math.min(az1, bz1) - Math.max(az0, bz0);
  const xTouches = Math.abs(ax1 - bx0) <= EPS || Math.abs(bx1 - ax0) <= EPS;
  const zTouches = Math.abs(az1 - bz0) <= EPS || Math.abs(bz1 - az0) <= EPS;
  return (xOverlap > EPS && zOverlap > EPS)
    || (xOverlap > EPS && zTouches)
    || (zOverlap > EPS && xTouches);
}

function moduleComponents(modules) {
  const remaining = new Set(modules.map(module => module.key));
  const byKey = new Map(modules.map(module => [module.key, module]));
  const result = [];
  while (remaining.size) {
    const startKey = [...remaining].sort()[0];
    remaining.delete(startKey);
    const queue = [byKey.get(startKey)];
    const component = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const current = queue[qi];
      component.push(current);
      for (const key of [...remaining]) {
        const candidate = byKey.get(key);
        if (!moduleTouchesOrOverlaps(current, candidate)) continue;
        remaining.delete(key);
        queue.push(candidate);
      }
    }
    result.push(component.sort((a, b) => a.key.localeCompare(b.key)));
  }
  return result;
}

function reservationHitsModule(reservation, module) {
  return Math.abs(reservation.x - module.cx) <= reservation.halfX + module.halfX + EPS
    && Math.abs(reservation.z - module.cz) <= reservation.halfZ + module.halfZ + EPS;
}

function anchorHitsModule(anchor, module, floor) {
  if (anchor.floor !== floor) return false;
  return anchor.x >= module.cx - module.halfX - EPS && anchor.x <= module.cx + module.halfX + EPS
    && anchor.z >= module.cz - module.halfZ - EPS && anchor.z <= module.cz + module.halfZ + EPS;
}

function circulationConnectedFloorModules({ allModules, activeModules, floorReservations, accessAnchors, floor }) {
  const staggered = allModules.some(module => module.floorBase > 0);
  if (!staggered || activeModules.length <= 1) {
    return { plannedModules: activeModules, deferredModules: [], componentCount: activeModules.length ? 1 : 0 };
  }
  const components = moduleComponents(activeModules);
  if (components.length <= 1) return { plannedModules: activeModules, deferredModules: [], componentCount: components.length };

  const coreReservations = floorReservations.filter(reservation => /stair|shaft|core/i.test(String(reservation.kind)));
  const scored = components.map(component => {
    const coreHits = component.reduce((sum, module) => sum + coreReservations.filter(reservation => reservationHitsModule(reservation, module)).length, 0);
    const anchorHits = component.reduce((sum, module) => sum + accessAnchors.filter(anchor => anchorHitsModule(anchor, module, floor)).length, 0);
    const area = component.reduce((sum, module) => sum + moduleArea(module), 0);
    return { component, coreHits, anchorHits, area };
  }).sort((a, b) => b.coreHits - a.coreHits || b.anchorHits - a.anchorHits || b.area - a.area
    || a.component[0].key.localeCompare(b.component[0].key));
  const plannedModules = scored[0].component;
  const plannedKeys = new Set(plannedModules.map(module => module.key));
  return {
    plannedModules,
    deferredModules: activeModules.filter(module => !plannedKeys.has(module.key)),
    componentCount: components.length,
  };
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
    endpointId: anchor?.endpointId ?? null,
    bridgeId: anchor?.bridgeId ?? null,
    routeCharacter: anchor?.routeCharacter ?? null,
    traversalPermission: anchor?.traversalPermission ?? null,
    circulationClass: anchor?.circulationClass ?? null,
    authority: anchor?.authority ?? null,
  }));
}

function normalizeReservations(reservations = []) {
  return reservations.flatMap((r, index) => {
    const halfX = Math.max(0, Number(r?.halfX ?? (r?.openingWidth ? r.openingWidth * 0.5 : 0)) || 0);
    const halfZ = Math.max(0, Number(r?.halfZ ?? (r?.openingDepth ? r.openingDepth * 0.5 : 0)) || 0);
    const base = {
      id: String(r?.id ?? `reservation-${index}`),
      kind: r?.kind ?? r?.reservationKind ?? 'circulation',
      x: Number(r?.x) || 0,
      z: Number(r?.z) || 0,
      halfX,
      halfZ,
      yMin: Number.isFinite(Number(r?.yMin)) ? Number(r.yMin) : 0,
      yMax: Number.isFinite(Number(r?.yMax)) ? Number(r.yMax) : Infinity,
    };
    if (String(base.kind).toLowerCase() !== 'stair-shaft') return [base];

    // A shaft reservation protects the hole, not the human route around it.
    // Give every persistent core a separate circulation apron so doors may be
    // reached around the stair instead of sharing the stair's own swept volume.
    const openingCrossCandidates = [Number(r?.openingWidth), Number(r?.openingDepth)]
      .filter(value => Number.isFinite(value) && value > 0);
    const openingCross = openingCrossCandidates.length ? Math.min(...openingCrossCandidates) : 0;
    const flightClearWidth = Math.max(
      0.86,
      Number(r?.rampHalfWidth) > 0 ? Number(r.rampHalfWidth) * 2 : 0,
    );
    const stairClearWidth = r?.integratedFloorLanding === true
      ? flightClearWidth
      : Math.max(flightClearWidth, openingCross);
    // A switchback core already owns real floor and mid landings inside the
    // shaft. Reserve only the approach outside that physical landing; using
    // the whole capsule-safe shaft width here would double-count circulation
    // and turn half the floor into an invisible semantic apron.
    const walkAround = r?.integratedFloorLanding === true
      ? Math.max(0.85, flightClearWidth * 0.95)
      : stairWalkAroundClearance(stairClearWidth);
    const apron = {
      ...base,
      id: `${base.id}:walk-around-apron`,
      kind: 'stair-circulation-apron',
      halfX: base.halfX + walkAround,
      halfZ: base.halfZ + walkAround,
      sourceReservationId: base.id,
      clearWalkAroundWidth: walkAround,
    };
    return [base, apron];
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

const MINIMUM_ENCLOSED_VOLUME_BY_ROLE = Object.freeze({
  entry: 15,
  circulation: 28,
  service: 18,
  storage: 18,
  private: 28,
  shared: 30,
  public: 34,
  work: 36,
  program: 34,
});

// Floor area by itself is not enough to describe a believable room. A 10 m2
// pencil strip is still a bad room. These metre-scale dimensions are deliberately
// conservative defaults; specific programs may request more. They constrain the
// plan authority before walls are realized, so visual geometry cannot hide a
// pathologically narrow semantic space.
const MINIMUM_SHORT_DIMENSION_BY_ROLE = Object.freeze({
  // Deliberately conservative fallbacks only - a specific template's own
  // minShortDimension/unitEnvelope always wins (see minimumShortDimensionForSpace).
  // This purely feeds the informational shortDimensionHealthy/crampedDestination
  // diagnostics, not the hard assertBuildingPlanAuthority gate, so it can never
  // newly break a floor that previously generated fine - it only makes a
  // pathologically narrow sliver visible as unhealthy instead of silently passing.
  entry: 1.1,
  circulation: 0.9,
  service: 1.0,
  storage: 0.9,
  private: 1.7,
  shared: 1.8,
  public: 2.0,
  work: 1.8,
  program: 1.8,
});

function minimumVolumeForSpace(space) {
  return Number(MINIMUM_ENCLOSED_VOLUME_BY_ROLE[space?.role] ?? 24);
}

function minimumAreaForSpace(space, floorH) {
  const height = Math.max(2.4, Number(floorH) || 3.15);
  return Math.max(Number(space?.minArea) || 0, minimumVolumeForSpace(space) / height);
}

// Explicit-only: a template that actually asserts its own narrowness contract
// (minShortDimension / unitEnvelope) affects real rectangle geometry - the
// candidate rectangle's shape (placeRectangleFirstSpace) and whether it must
// hold a strict rectangle or may fall back to organic growth. Role-level
// defaults deliberately do NOT flow into that geometry: they only exist to
// make a pathologically narrow *result* visible (see minimumShortDimensionForDiagnostic
// below), not to newly demand a wider rectangle than a program ever asked for
// and risk failing placement on a floor that used to fit fine.
function minimumShortDimensionForSpace(space) {
  const explicit = Number(space?.minShortDimension);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const envelope = Number(space?.unitEnvelope?.minimumShortDimension);
  if (Number.isFinite(envelope) && envelope > 0) return envelope;
  return 0;
}

// Same as above, but also falls back to the conservative role-level default -
// used only by the informational shortDimensionHealthy/crampedDestinationSpaceCount
// diagnostic, never by placement/geometry decisions.
function minimumShortDimensionForDiagnostic(space) {
  const explicit = minimumShortDimensionForSpace(space);
  if (explicit > 0) return explicit;
  return Number(MINIMUM_SHORT_DIMENSION_BY_ROLE[space?.role] ?? 0);
}

function traversalPermissionForSpace(space) {
  if (!space) return TRAVERSAL_PERMISSION.NO_THROUGH;
  if (space.traversalPermission) return space.traversalPermission;
  if (space.role === 'entry' || space.role === 'circulation' || space.role === 'public') {
    return TRAVERSAL_PERMISSION.PUBLIC_THROUGH;
  }
  if (space.role === 'shared') return TRAVERSAL_PERMISSION.SEMI_PUBLIC_THROUGH;
  if (space.role === 'work' || space.role === 'program') return TRAVERSAL_PERMISSION.STAFF_THROUGH;
  if (space.role === 'service') return TRAVERSAL_PERMISSION.SERVICE_THROUGH;
  if (space.role === 'private') return TRAVERSAL_PERMISSION.PRIVATE_DESTINATION_ONLY;
  if (space.role === 'storage') return TRAVERSAL_PERMISSION.NO_THROUGH;
  if (space.privacy === 'private') return TRAVERSAL_PERMISSION.PRIVATE_DESTINATION_ONLY;
  if (space.privacy === 'service') return TRAVERSAL_PERMISSION.SERVICE_THROUGH;
  if (space.privacy === 'public') return TRAVERSAL_PERMISSION.PUBLIC_THROUGH;
  return TRAVERSAL_PERMISSION.SEMI_PUBLIC_THROUGH;
}

function expandedTemplates({ grammar, floor, baseFloor = 0, area, profile, authoredIntent, stableKey, semanticProgram, programArchitecture = null, routeServed = false }) {
  const isBaseFloor = floor === baseFloor;
  const templates = (!authoredIntent ? programTemplatesForFloor(programArchitecture, { isBaseFloor, routeServed, morphologyId: grammar.id }) : null)
    ?? (isBaseFloor ? grammar.ground : grammar.upper);
  const result = [];
  const operationalFlowOrder = new Map();
  if (programArchitecture) {
    for (const flow of programArchitecture.flows ?? []) {
      for (let index = 0; index < (flow.sequence ?? []).length; index++) {
        const key = flow.sequence[index];
        const current = operationalFlowOrder.get(key);
        if (current == null || index < current) operationalFlowOrder.set(key, index);
      }
    }
  }

  for (const template of templates) {
    const minimumPlateArea = Number(template.minPlateArea);
    if (Number.isFinite(minimumPlateArea) && area + EPS < minimumPlateArea) continue;
    const floorInterval = Math.max(1, Math.floor(Number(template.floorInterval) || 1));
    if (floorInterval > 1) {
      const offset = stableIndex(`${stableKey}:${template.key}:floor-interval`, floorInterval);
      if (((floor - baseFloor + offset) % floorInterval + floorInterval) % floorInterval !== 0) continue;
    }
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
      const authoredType = isBaseFloor ? authoredIntent?.groundOverrides?.[template.key] : null;
      result.push({
        key: instanceKey,
        templateKey: template.key,
        role: template.role,
        areaWeight: (template.areaWeight / count) * roleMultiplier(template.role, profile),
        minArea: template.minArea,
        maxArea: template.maxArea,
        repeat: template.repeat ? { ...template.repeat } : null,
        exteriorPreference: invertExteriorPreference(template.exteriorPreference, profile),
        conventionalExteriorPreference: template.exteriorPreference,
        privacy: template.privacy,
        daylight: template.daylight,
        facadePattern: template.facadePattern,
        requiredAdjacency: [...template.requiredAdjacency],
        preferredAdjacency: [...template.preferredAdjacency],
        semanticProgram,
        operationalRole: template.operationalRole ?? template.key,
        operationalFlowOrder: operationalFlowOrder.has(template.key) ? operationalFlowOrder.get(template.key) : null,
        frontagePriority: template.frontagePriority ?? 'neutral',
        serviceSpine: template.serviceSpine === true,
        functionalFixture: template.functionalFixture ?? null,
        unitEnvelope: template.unitEnvelope ?? null,
        minShortDimension: template.minShortDimension ?? null,
        residualSink: template.residualSink === true,
        minPlateArea: template.minPlateArea ?? null,
        floorInterval: template.floorInterval ?? null,
        spaceType: authoredType ?? template.program ?? `${semanticProgram}:${template.role}`,
        source: authoredType ? 'spawn-authored-intent' : 'grammar',
        traversalPermission: traversalPermissionForSpace(template),
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
          traversalPermission: traversalPermissionForSpace(dominant),
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

function configureUpperOccupancyHallway(spaces, grid, floor, baseFloor = 0) {
  if (!grid?.cells?.length) return null;
  const occupancyRoles = new Set(['private', 'program', 'work']);
  const occupancies = spaces.filter(space => space.repeat && occupancyRoles.has(space.role));
  const requiredRouteTemplates = new Set(occupancies.flatMap(space => space.requiredAdjacency ?? []));
  const hallway = spaces.find(space => space.role === 'circulation' && requiredRouteTemplates.has(space.templateKey))
    ?? spaces.find(space => space.role === 'circulation');
  if (!hallway || occupancies.length < 3) return null;

  const cellArea = grid.cellSize * grid.cellSize;
  const reserved = grid.cells.filter(cell => cell.structuralReservationId);
  const centerX = reserved.length
    ? reserved.reduce((sum, cell) => sum + cell.x, 0) / reserved.length
    : (grid.bounds.minX + grid.bounds.maxX) * 0.5;
  const centerZ = reserved.length
    ? reserved.reduce((sum, cell) => sum + cell.z, 0) / reserved.length
    : (grid.bounds.minZ + grid.bounds.maxZ) * 0.5;
  const spanX = grid.bounds.maxX - grid.bounds.minX;
  const spanZ = grid.bounds.maxZ - grid.bounds.minZ;
  const axis = spanX >= spanZ ? 'x' : 'z';
  const wantedCross = axis === 'x' ? centerZ : centerX;
  const crossCoords = [...new Set(grid.cells.map(cell => axis === 'x' ? cell.z : cell.x))]
    .sort((a, b) => Math.abs(a - wantedCross) - Math.abs(b - wantedCross) || a - b);
  const corridorCross = crossCoords[0] ?? wantedCross;
  const corridorCellKeys = grid.cells
    .filter(cell => Math.abs((axis === 'x' ? cell.z : cell.x) - corridorCross) <= EPS)
    .map(cell => cell.key);
  const hallwayCells = Math.max(6, corridorCellKeys.length);

  hallway.minArea = Math.max(Number(hallway.minArea) || 0, hallwayCells * cellArea);
  hallway.maxArea = Math.max(hallway.minArea, (hallwayCells + 2) * cellArea);
  hallway.circulationShape = 'occupancy-hallway';
  hallway.corridorAxis = axis;
  hallway.corridorCenterX = centerX;
  hallway.corridorCenterZ = centerZ;
  hallway.corridorCross = corridorCross;
  hallway.corridorCellSize = grid.cellSize;
  hallway.corridorCellKeys = corridorCellKeys;
  hallway.hallwayOccupancyCount = occupancies.length;

  // Full occupancies yield in count before they yield in size. A lodging room
  // should be a room, not a broom closet left over after circulation is solved.
  for (const occupancy of occupancies) {
    const desiredArea = Math.max(0, Number(occupancy.repeat?.desiredArea) || 0);
    occupancy.minArea = Math.max(Number(occupancy.minArea) || 0, Math.min(14, desiredArea * 0.72));
  }

  return { hallway, occupancies, axis, hallwayCells, corridorCellKeys };
}

function preclaimOccupancyHallway(spaces, grid) {
  const hallway = spaces.find(space => space.circulationShape === 'occupancy-hallway');
  if (!hallway?.corridorCellKeys?.length) return { hallway, claimed: 0 };
  const keys = new Set(hallway.corridorCellKeys);
  let claimed = 0;
  for (const cell of grid.cells) {
    if (!keys.has(cell.key) || !cellEligibleForSpace(cell, hallway)) continue;
    cell.spaceId = hallway.key;
    claimed++;
  }
  return { hallway, claimed };
}

function occupancyHallwayFrontageShortfalls(spaces, grid, floor, baseFloor = 0) {
  if (!grid?.cells?.length) return [];
  const hallway = spaces.find(space => space.circulationShape === 'occupancy-hallway');
  if (!hallway) return [];
  const occupancies = spaces.filter(space => space.repeat && ['private', 'program', 'work'].includes(space.role));
  if (occupancies.length < 3) return [];
  const boundaries = boundaryCandidates(grid);
  return occupancies
    .filter(space => !boundaries.has([hallway.key, space.key].sort().join('|')))
    .map(space => ({
      key: space.key,
      role: space.role,
      assignedCount: grid.cells.filter(cell => cell.spaceId === space.key).length,
      minimumCount: 0,
      shortfallCells: 1,
      reason: 'missing-direct-hallway-frontage',
    }));
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

function chooseRootSpace(spaces, floor, baseFloor = 0) {
  if (floor === baseFloor) return spaces.find(s => s.role === 'entry')
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

function buildTopology({ spaces, floor, baseFloor = 0, profile, stableKey }) {
  if (!spaces.length) return { rootKey: null, edges: [], inversionOperations: [] };
  const root = chooseRootSpace(spaces, floor, baseFloor);
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

function buildFloorGrid({ modules, floor, floorH, reservations, accessAnchors, minimumClearWidth = 0.72 }) {
  const activeModules = activeModulesForFloor(modules, floor);
  if (!activeModules.length) return null;
  const y0 = floor * floorH;
  const y1 = y0 + floorH;
  const floorReservations = reservations.filter(r => reservationHitsFloor(r, y0, y1));
  const occupancy = circulationConnectedFloorModules({
    allModules: modules, activeModules, floorReservations, accessAnchors, floor,
  });
  const plannedModules = occupancy.plannedModules;
  if (!plannedModules.length) return null;
  const bounds = floorBounds(plannedModules);
  const cellSize = chooseCellSize(plannedModules, minimumClearWidth);
  const minIx = Math.floor(bounds.minX / cellSize);
  const maxIx = Math.ceil(bounds.maxX / cellSize);
  const minIz = Math.floor(bounds.minZ / cellSize);
  const maxIz = Math.ceil(bounds.maxZ / cellSize);
  const cells = [];
  const byKey = new Map();
  const lookupWidth = maxIx - minIx;
  const lookupHeight = maxIz - minIz;
  const denseCells = new Array(lookupWidth * lookupHeight).fill(null);
  for (let iz = minIz; iz < maxIz; iz++) {
    for (let ix = minIx; ix < maxIx; ix++) {
      const x = (ix + 0.5) * cellSize;
      const z = (iz + 0.5) * cellSize;
      if (!pointInsideAnyModule(x, z, plannedModules)) continue;
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
      denseCells[(iz - minIz) * lookupWidth + (ix - minIx)] = cell;
    }
  }
  const dirs = [
    [0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west'],
  ];
  const coreCells = cells.filter(cell => /stair|core|shaft/i.test(String(cell.structuralReservationKind ?? '')));
  for (const cell of cells) {
    for (const [dx, dz, side] of dirs) {
      if (!byKey.has(`${cell.ix + dx},${cell.iz + dz}`)) cell.exposedSides.push(side);
    }
    cell.exposure = cell.exposedSides.length;
    cell.coreDistance = coreCells.length
      ? Math.min(...coreCells.map(core => Math.hypot(cell.x - core.x, cell.z - core.z)))
      : Infinity;
  }
  return {
    activeModules, plannedModules, deferredModules: occupancy.deferredModules,
    floorComponentCount: occupancy.componentCount,
    bounds, cellSize, cells, byKey,
    minIx, maxIx, minIz, maxIz, lookupWidth, lookupHeight, denseCells,
    y0, y1,
  };
}

function cellAt(grid, ix, iz) {
  if (ix < grid.minIx || ix >= grid.maxIx || iz < grid.minIz || iz >= grid.maxIz) return null;
  return grid.denseCells[(iz - grid.minIz) * grid.lookupWidth + (ix - grid.minIx)] ?? null;
}

function neighborsOf(cell, grid) {
  return [
    cellAt(grid, cell.ix + 1, cell.iz),
    cellAt(grid, cell.ix - 1, cell.iz),
    cellAt(grid, cell.ix, cell.iz + 1),
    cellAt(grid, cell.ix, cell.iz - 1),
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
  if (space.serviceSpine && Number.isFinite(cell.coreDistance)) {
    score += Math.max(0, 7.5 - cell.coreDistance * 0.82);
    score += (4 - cell.exposure) * 0.55;
  }
  if (space.circulationShape === 'occupancy-hallway') {
    const crossDistance = space.corridorAxis === 'x'
      ? Math.abs(cell.z - Number(space.corridorCenterZ || 0))
      : Math.abs(cell.x - Number(space.corridorCenterX || 0));
    const cellScale = Math.max(0.25, Number(space.corridorCellSize) || 1);
    score -= (crossDistance / cellScale) * 6.5;
    if (cell.structuralReservationId) score += 4;
  }
  const grain = (hashString32(`${stableKey}:${space.key}:${cell.key}`) / 0xffffffff) - 0.5;
  return score + grain * (0.25 + profile.entropy * 1.5);
}

function rectangleFirstPreferred(profile) {
  return Number(profile?.inversion) < 0.58;
}

function routeFrontageWeight(space) {
  if (!space || ['avoid', 'none'].includes(space.frontagePriority)) return 0;
  if (space.traversalPermission === TRAVERSAL_PERMISSION.PRIVATE_DESTINATION_ONLY
    || space.traversalPermission === TRAVERSAL_PERMISSION.NO_THROUGH
    || space.traversalPermission === TRAVERSAL_PERMISSION.SECURE) return 0;
  if (space.frontagePriority === 'required') return 3.2;
  if (space.frontagePriority === 'preferred') return 2.1;
  if (['public', 'shared'].includes(space.role)) return 1.25;
  if (['work', 'program'].includes(space.role)) return 0.7;
  return 0;
}

function routeFrontageEligible(space) {
  return routeFrontageWeight(space) > 0;
}

function rectangleDimensionsForCells(target, minimumShortCells = 1) {
  const needed = Math.max(1, Math.floor(Number(target) || 1));
  const maxArea = needed + Math.max(2, Math.ceil(needed * 0.28));
  const result = [];
  const maxSide = Math.min(18, Math.max(2, needed));
  for (let width = 1; width <= maxSide; width++) {
    const depth = Math.ceil(needed / width);
    const area = width * depth;
    if (area < needed || area > maxArea || depth > 18) continue;
    const shortSide = Math.min(width, depth);
    if (shortSide < Math.max(1, Math.floor(Number(minimumShortCells) || 1))) continue;
    const longSide = Math.max(width, depth);
    const aspect = longSide / Math.max(1, shortSide);
    result.push({ width, depth, area, aspect });
  }
  return result.sort((a, b) => {
    const aSliver = needed >= 4 && Math.min(a.width, a.depth) < 2 ? 1 : 0;
    const bSliver = needed >= 4 && Math.min(b.width, b.depth) < 2 ? 1 : 0;
    return aSliver - bSliver || a.area - b.area || a.aspect - b.aspect
      || a.width - b.width || a.depth - b.depth;
  });
}

function rectangleCells(grid, minIx, minIz, width, depth) {
  const cells = [];
  for (let dz = 0; dz < depth; dz++) {
    for (let dx = 0; dx < width; dx++) {
      const cell = cellAt(grid, minIx + dx, minIz + dz);
      if (!cell) return null;
      cells.push(cell);
    }
  }
  return cells;
}

function rectangleBoundaryCountAgainstSpace(grid, minIx, minIz, width, depth, spaceKey) {
  if (!spaceKey) return 0;
  let count = 0;
  const maxIx = minIx + width - 1;
  const maxIz = minIz + depth - 1;
  for (let ix = minIx; ix <= maxIx; ix++) {
    if (cellAt(grid, ix, minIz - 1)?.spaceId === spaceKey) count++;
    if (cellAt(grid, ix, maxIz + 1)?.spaceId === spaceKey) count++;
  }
  for (let iz = minIz; iz <= maxIz; iz++) {
    if (cellAt(grid, minIx - 1, iz)?.spaceId === spaceKey) count++;
    if (cellAt(grid, maxIx + 1, iz)?.spaceId === spaceKey) count++;
  }
  return count;
}

function reachableEligibleCapacity(anchor, space, grid) {
  if (!anchor || anchor.spaceId || !cellEligibleForSpace(anchor, space)) return 0;
  const seen = new Set([anchor.key]);
  const queue = [anchor];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const neighbor of neighborsOf(queue[qi], grid)) {
      if (seen.has(neighbor.key) || neighbor.spaceId || !cellEligibleForSpace(neighbor, space)) continue;
      seen.add(neighbor.key);
      queue.push(neighbor);
    }
  }
  return seen.size;
}

function candidateRectangleAnchors({ space, spaces, parentKey, routeSpaceKey, grid, profile, stableKey, desiredTarget = 1 }) {
  const available = grid.cells.filter(cell => !cell.spaceId && cellEligibleForSpace(cell, space));
  const parentAdjacent = parentKey
    ? available.filter(cell => neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === parentKey))
    : [];
  const routeAdjacent = routeSpaceKey && routeFrontageEligible(space)
    ? available.filter(cell => neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === routeSpaceKey))
    : [];
  // Preserve 21U's proven packing hierarchy: an actual city-route frontage wins,
  // otherwise the topology parent owns placement. Operational flow order decides
  // which rooms get first claim on those edges; it does not force every required
  // semantic neighbor into the geometric anchor search, which can overconstrain
  // repeated rectangular rooms.
  const source = routeAdjacent.length ? routeAdjacent : (parentAdjacent.length ? parentAdjacent : available);
  const frontageWeight = routeFrontageWeight(space);
  const scoreKey = `${stableKey}:rectangle-anchor`;
  const requiredCapacity = Math.max(1, Math.floor(Number(desiredTarget) || 1));
  const ranked = source.map(cell => {
    const capacity = reachableEligibleCapacity(cell, space, grid);
    return {
      cell,
      capacity,
      capacityRatio: Math.min(1, capacity / requiredCapacity),
      exposure: cell.exposure + cell.exposedSides.length,
      preference: preferenceScore(cell, space, profile, scoreKey),
    };
  });
  ranked.sort((a, b) => {
    // Capacity is a gate, not a cosmetic preference: a huge defining room must
    // not accept a locally attractive cul-de-sac while a target-capable anchor exists.
    const viable = Number(b.capacity >= requiredCapacity) - Number(a.capacity >= requiredCapacity);
    if (viable) return viable;
    const capacityBias = b.capacityRatio - a.capacityRatio;
    if (Math.abs(capacityBias) > 0.05) return capacityBias;
    const frontageBias = frontageWeight > 0 ? (b.exposure - a.exposure) * frontageWeight : 0;
    if (frontageBias) return frontageBias;
    return b.preference - a.preference || b.capacity - a.capacity || a.cell.key.localeCompare(b.cell.key);
  });
  return ranked.slice(0, 32).map(item => item.cell);
}

function placeRectangleFirstSpace({
  space, spaces, target, parentKey, routeSpaceKey, requiredBoundaryKeys = [], requiredBoundaryCells = 1, grid, profile, stableKey,
}) {
  if (!rectangleFirstPreferred(profile)) return null;
  if (!space || ['circulation', 'entry'].includes(space.role)) return null;
  const sumWeight = spaces.reduce((sum, candidate) => sum + Math.max(0.001, Number(candidate.areaWeight) || 0), 0);
  const weightedTarget = Math.max(target, Math.round(grid.cells.length * Math.max(0.001, Number(space.areaWeight) || 0) / Math.max(0.001, sumWeight)));
  const anchors = candidateRectangleAnchors({ space, spaces, parentKey, routeSpaceKey, grid, profile, stableKey, desiredTarget: weightedTarget });
  if (!anchors.length) return null;
  const minimumShortMetres = minimumShortDimensionForSpace(space);
  const minimumShortCells = Math.max(1, Math.ceil((minimumShortMetres - EPS) / Math.max(EPS, grid.cellSize)));
  const dimensions = rectangleDimensionsForCells(target, minimumShortCells);
  const preferenceKey = `${stableKey}:rectangle`;
  const preferenceByCell = new Map(grid.cells.map(cell => [cell, preferenceScore(cell, space, profile, preferenceKey)]));
  let best = null;
  for (const anchor of anchors) {
    for (const dim of dimensions) {
      for (let offZ = 0; offZ < dim.depth; offZ++) {
        for (let offX = 0; offX < dim.width; offX++) {
          const minIx = anchor.ix - offX;
          const minIz = anchor.iz - offZ;
          const cells = rectangleCells(grid, minIx, minIz, dim.width, dim.depth);
          if (!cells || cells.some(cell => cell.spaceId || !cellEligibleForSpace(cell, space))) continue;
          const parentBoundary = rectangleBoundaryCountAgainstSpace(grid, minIx, minIz, dim.width, dim.depth, parentKey);
          if (parentKey && !parentBoundary) continue;
          const requiredBoundaryCounts = requiredBoundaryKeys.map(key => rectangleBoundaryCountAgainstSpace(
            grid, minIx, minIz, dim.width, dim.depth, key,
          ));
          if (requiredBoundaryCounts.some(count => count < Math.max(1, requiredBoundaryCells))) continue;
          const routeBoundary = rectangleBoundaryCountAgainstSpace(grid, minIx, minIz, dim.width, dim.depth, routeSpaceKey);
          const exposure = cells.reduce((sum, cell) => sum + cell.exposure, 0);
          const preference = cells.reduce((sum, cell) => sum + preferenceByCell.get(cell), 0)
            / Math.max(1, cells.length);
          const sliverPenalty = target >= 4 && Math.min(dim.width, dim.depth) < 2 ? 18 : 0;
          const excessPenalty = Math.max(0, dim.area - target) * 1.35;
          const frontageWeight = routeFrontageWeight(space);
          const routeBonus = frontageWeight > 0 ? (routeBoundary * 12 + exposure * 1.4) * frontageWeight : routeBoundary * 0.5;
          const score = preference + parentBoundary * 8 + routeBonus
            - Math.max(0, dim.aspect - 2.4) * 3.5 - sliverPenalty - excessPenalty;
          const tie = hashString32(`${stableKey}:${space.key}:${minIx}:${minIz}:${dim.width}:${dim.depth}`) / 0xffffffff;
          const candidate = { cells, minIx, minIz, ...dim, parentBoundary, routeBoundary, score: score + tie * 0.001 };
          if (!best || candidate.score > best.score) best = candidate;
        }
      }
    }
  }
  if (!best) return null;
  for (const cell of best.cells) cell.spaceId = space.key;
  space.rectangleFirst = true;
  space.circulationFrontageReserved = best.routeBoundary > 0 && routeFrontageEligible(space);
  space.rectangleStrict = space.role === 'private'
    || space.circulationFrontageReserved
    || minimumShortMetres > grid.cellSize * 1.25;
  return best;
}

function assignedRectangleBounds(space, grid) {
  const cells = grid.cells.filter(cell => cell.spaceId === space.key);
  if (!cells.length) return null;
  const minIx = Math.min(...cells.map(cell => cell.ix));
  const maxIx = Math.max(...cells.map(cell => cell.ix));
  const minIz = Math.min(...cells.map(cell => cell.iz));
  const maxIz = Math.max(...cells.map(cell => cell.iz));
  const width = maxIx - minIx + 1;
  const depth = maxIz - minIz + 1;
  if (width * depth !== cells.length) return null;
  for (let iz = minIz; iz <= maxIz; iz++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      if (grid.byKey.get(`${ix},${iz}`)?.spaceId !== space.key) return null;
    }
  }
  return { minIx, maxIx, minIz, maxIz, width, depth, cells };
}

function rectangularGrowthState(space, grid) {
  const bounds = assignedRectangleBounds(space, grid);
  if (!bounds) return null;
  return {
    count: bounds.cells.length,
    bounds: {
      minIx: bounds.minIx, maxIx: bounds.maxIx,
      minIz: bounds.minIz, maxIz: bounds.maxIz,
      width: bounds.width, depth: bounds.depth,
    },
  };
}

function rectangularExpansionOptions(space, grid, profile, stableKey, bounds = null) {
  const rectangle = bounds ?? assignedRectangleBounds(space, grid);
  if (!rectangle) return [];
  const specs = [
    { side: 'west', minIx: rectangle.minIx - 1, minIz: rectangle.minIz, width: 1, depth: rectangle.depth },
    { side: 'east', minIx: rectangle.maxIx + 1, minIz: rectangle.minIz, width: 1, depth: rectangle.depth },
    { side: 'north', minIx: rectangle.minIx, minIz: rectangle.minIz - 1, width: rectangle.width, depth: 1 },
    { side: 'south', minIx: rectangle.minIx, minIz: rectangle.maxIz + 1, width: rectangle.width, depth: 1 },
  ];
  return specs.flatMap(spec => {
    const cells = rectangleCells(grid, spec.minIx, spec.minIz, spec.width, spec.depth);
    if (!cells || cells.some(cell => cell.spaceId || !cellEligibleForSpace(cell, space))) return [];
    const score = cells.reduce((sum, cell) => sum + preferenceScore(cell, space, profile, `${stableKey}:rectangle-grow`), 0)
      / Math.max(1, cells.length);
    return [{ ...spec, cells, score }];
  }).sort((a, b) => b.score - a.score || a.cells.length - b.cells.length || a.side.localeCompare(b.side));
}

function applyRectangularGrowth(state, option) {
  state.count += option.cells.length;
  if (option.side === 'west') state.bounds.minIx -= 1;
  else if (option.side === 'east') state.bounds.maxIx += 1;
  else if (option.side === 'north') state.bounds.minIz -= 1;
  else if (option.side === 'south') state.bounds.maxIz += 1;
  state.bounds.width = state.bounds.maxIx - state.bounds.minIx + 1;
  state.bounds.depth = state.bounds.maxIz - state.bounds.minIz + 1;
  return state;
}

function growExistingSpaceRectangular({
  space, target, grid, stableKey, profile, allowOvershoot = false, oneStep = false, growthState = null,
}) {
  if (!rectangleFirstPreferred(profile) || ['circulation', 'entry'].includes(space.role)) return null;
  const state = growthState ?? rectangularGrowthState(space, grid);
  if (!state) return null;
  let steps = 0;
  while ((allowOvershoot || state.count < target) && steps++ < grid.cells.length) {
    const options = rectangularExpansionOptions(space, grid, profile, stableKey, state.bounds)
      .filter(option => allowOvershoot || state.count + option.cells.length <= target);
    if (!options.length) break;
    const selected = options[0];
    for (const cell of selected.cells) cell.spaceId = space.key;
    applyRectangularGrowth(state, selected);
    if (oneStep) break;
  }
  return state;
}

function absorbRegularSurplus({ grid, spaces, profile, stableKey, targets = null }) {
  if (!rectangleFirstPreferred(profile) || !targets?.get) return 0;
  const ordinary = spaces.filter(space => !['circulation', 'entry'].includes(space.role));
  const growthStateByKey = new Map(ordinary.map(space => [space.key, rectangularGrowthState(space, grid)]));
  let claimed = 0;
  let rounds = 0;
  while (rounds++ < grid.cells.length) {
    let progress = 0;
    const needy = ordinary
      .filter(space => {
        const state = growthStateByKey.get(space.key);
        const target = Number(targets.get(space.key));
        return state && Number.isFinite(target) && state.count < target;
      })
      .sort((a, b) => {
        const sa = growthStateByKey.get(a.key), sb = growthStateByKey.get(b.key);
        const da = (targets.get(a.key) ?? sa.count) - sa.count;
        const db = (targets.get(b.key) ?? sb.count) - sb.count;
        return db - da || a.key.localeCompare(b.key);
      });
    for (const space of needy) {
      const state = growthStateByKey.get(space.key);
      const before = state.count;
      const grown = growExistingSpaceRectangular({
        space, target: targets.get(space.key), grid, stableKey: `${stableKey}:target-surplus:${rounds}`, profile,
        allowOvershoot: false, oneStep: true, growthState: state,
      });
      const after = grown?.count ?? before;
      if (after > before) {
        claimed += after - before;
        progress += after - before;
      }
    }
    if (!progress) break;
  }
  return claimed;
}

function unclaimedGridComponents(grid) {
  const remaining = new Set(grid.cells.filter(cell => !cell.spaceId).map(cell => cell.key));
  const components = [];
  while (remaining.size) {
    const startKey = [...remaining][0];
    remaining.delete(startKey);
    const queue = [grid.byKey.get(startKey)];
    const component = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const cell = queue[qi];
      if (!cell) continue;
      component.push(cell);
      for (const neighbor of neighborsOf(cell, grid)) {
        if (!remaining.has(neighbor.key)) continue;
        remaining.delete(neighbor.key);
        queue.push(neighbor);
      }
    }
    if (component.length) components.push(component);
  }
  return components;
}

function seedResidualComponents({ grid, spaces, flexibleResidualKeys }) {
  const spaceByKey = new Map(spaces.map(space => [space.key, space]));
  const residualSpaces = [...flexibleResidualKeys]
    .map(key => spaceByKey.get(key))
    .filter(Boolean);
  const fallback = spaces.find(space => space.role === 'circulation')
    ?? spaces.find(space => space.role === 'entry')
    ?? null;
  if (!residualSpaces.length && fallback) residualSpaces.push(fallback);
  if (!residualSpaces.length) return 0;

  const centroids = new Map(residualSpaces.map(space => {
    const assigned = grid.cells.filter(cell => cell.spaceId === space.key);
    return [space.key, spaceCentroid(assigned)];
  }));
  let seeded = 0;
  for (const component of unclaimedGridComponents(grid)) {
    let best = null;
    for (const space of residualSpaces) {
      const center = centroids.get(space.key) ?? { x: 0, z: 0 };
      for (const cell of component) {
        if (!cellEligibleForSpace(cell, space)) continue;
        const distance = (cell.x - center.x) ** 2 + (cell.z - center.z) ** 2;
        if (!best || distance < best.distance) best = { space, cell, distance };
      }
    }
    if (!best) continue;
    best.cell.spaceId = best.space.key;
    seeded++;
  }
  return seeded;
}

function connectedComponentsForSpace(grid, spaceKey) {
  const remaining = new Set(grid.cells.filter(cell => cell.spaceId === spaceKey).map(cell => cell.key));
  const components = [];
  while (remaining.size) {
    const startKey = [...remaining][0];
    remaining.delete(startKey);
    const queue = [grid.byKey.get(startKey)];
    const component = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const cell = queue[qi];
      if (!cell) continue;
      component.push(cell);
      for (const neighbor of neighborsOf(cell, grid)) {
        if (neighbor.spaceId !== spaceKey || !remaining.has(neighbor.key)) continue;
        remaining.delete(neighbor.key);
        queue.push(neighbor);
      }
    }
    if (component.length) components.push(component);
  }
  return components.sort((a, b) => b.length - a.length || a[0].key.localeCompare(b[0].key));
}

function repairDisconnectedSpaceIslands({ grid, spaces, targets }) {
  const byKey = new Map(spaces.map(space => [space.key, space]));
  let reassignedCells = 0;
  let repairedIslands = 0;
  for (let pass = 0; pass < 4; pass++) {
    let progress = 0;
    for (const space of spaces) {
      const components = connectedComponentsForSpace(grid, space.key);
      for (const island of components.slice(1)) {
        const candidates = new Map();
        for (const cell of island) {
          for (const neighbor of neighborsOf(cell, grid)) {
            if (!neighbor.spaceId || neighbor.spaceId === space.key) continue;
            const candidate = byKey.get(neighbor.spaceId);
            if (!candidate) continue;
            const item = candidates.get(candidate.key) ?? { space: candidate, boundary: 0 };
            item.boundary++;
            candidates.set(candidate.key, item);
          }
        }
        const eligible = [...candidates.values()].filter(item => island.every(cell => cellEligibleForSpace(cell, item.space)));
        eligible.sort((a, b) => {
          const countA = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === a.space.key ? 1 : 0), 0);
          const countB = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === b.space.key ? 1 : 0), 0);
          const targetA = Math.max(1, Number(targets?.get?.(a.space.key)) || 1);
          const targetB = Math.max(1, Number(targets?.get?.(b.space.key)) || 1);
          return (countA / targetA) - (countB / targetB) || b.boundary - a.boundary || a.space.key.localeCompare(b.space.key);
        });
        const selected = eligible[0];
        if (!selected) continue;
        for (const cell of island) cell.spaceId = selected.space.key;
        reassignedCells += island.length;
        repairedIslands++;
        progress += island.length;
      }
    }
    if (!progress) break;
  }
  return { reassignedCells, repairedIslands };
}

function rebalanceWeightedTargets({
  grid, spaces, targets, minimumCellsByKey, desiredEdges = [], profile, stableKey, doorWidth = 0.86,
}) {
  if (!targets?.get || !spaces.length) return { movedCells: 0, remainingDeficitCells: 0, notes: [] };
  const byKey = new Map(spaces.map(space => [space.key, space]));
  const counts = new Map(spaces.map(space => [
    space.key,
    grid.cells.reduce((sum, cell) => sum + (cell.spaceId === space.key ? 1 : 0), 0),
  ]));
  const targetFor = key => Math.max(1, Number(targets.get(key)) || 1);
  const minimumFor = key => Math.max(1, Number(minimumCellsByKey?.get?.(key)) || 1);
  const desiredNeighbors = new Map(spaces.map(space => [space.key, new Set()]));
  for (const edge of desiredEdges ?? []) {
    if (!byKey.has(edge.a) || !byKey.has(edge.b)) continue;
    desiredNeighbors.get(edge.a)?.add(edge.b);
    desiredNeighbors.get(edge.b)?.add(edge.a);
  }
  const adjacencyFromBoundaries = boundaries => {
    const adjacency = new Map(spaces.map(space => [space.key, new Set()]));
    const directionHasEligibleBoundary = (fromKey, toKey, candidates) => {
      const recipient = byKey.get(toKey);
      if (!recipient) return false;
      for (const segment of candidates ?? []) {
        for (const cellKey of [segment.aCellKey, segment.bCellKey]) {
          const cell = grid.byKey.get(cellKey);
          if (!cell || cell.spaceId !== fromKey || cell.structuralReservationId) continue;
          if (cellEligibleForSpace(cell, recipient)) return true;
        }
      }
      return false;
    };
    for (const [pair, candidates] of boundaries.entries()) {
      const [a, b] = pair.split('|');
      if (!byKey.has(a) || !byKey.has(b)) continue;
      if (directionHasEligibleBoundary(a, b, candidates)) adjacency.get(a)?.add(b);
      if (directionHasEligibleBoundary(b, a, candidates)) adjacency.get(b)?.add(a);
    }
    return adjacency;
  };
  const shortestPath = (adjacency, fromKey, toKey) => {
    if (fromKey === toKey) return [fromKey];
    const queue = [fromKey];
    const parent = new Map([[fromKey, null]]);
    for (let qi = 0; qi < queue.length; qi++) {
      const key = queue[qi];
      const next = [...(adjacency.get(key) ?? [])].sort();
      for (const neighborKey of next) {
        if (parent.has(neighborKey)) continue;
        parent.set(neighborKey, key);
        if (neighborKey === toKey) {
          const path = [toKey];
          for (let cursor = key; cursor != null; cursor = parent.get(cursor)) path.push(cursor);
          return path.reverse();
        }
        queue.push(neighborKey);
      }
    }
    return null;
  };
  const canDonateCell = (cell, donor, recipient, boundaries) => {
    if (!cell || cell.spaceId !== donor.key || !cellEligibleForSpace(cell, recipient)) return false;
    if (cell.structuralReservationId) return false;
    if ((counts.get(donor.key) ?? 0) - 1 < minimumFor(donor.key)) return false;
    const donorNeighbors = neighborsOf(cell, grid).filter(neighbor => neighbor.spaceId === donor.key).length;
    if (donorNeighbors >= 4) return false;
    if (!spaceConnectedAfterRemovingCell(grid, donor.key, cell.key)) return false;
    for (const neighborKey of desiredNeighbors.get(donor.key) ?? []) {
      if (!neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === neighborKey)) continue;
      const pair = [donor.key, neighborKey].sort().join('|');
      const candidates = boundaries.get(pair) ?? [];
      const before = boundaryPairDoorCapacity(candidates, grid, doorWidth);
      if (!before.capable) continue;
      const remaining = candidates.filter(candidate => candidate.aCellKey !== cell.key && candidate.bCellKey !== cell.key);
      if (!boundaryPairDoorCapacity(remaining, grid, doorWidth).capable) return false;
    }
    return true;
  };
  const transferOneAcrossBoundary = (donorKey, recipientKey, moveOrdinal) => {
    const donor = byKey.get(donorKey), recipient = byKey.get(recipientKey);
    if (!donor || !recipient) return null;
    const boundaries = boundaryCandidates(grid);
    const pair = [donorKey, recipientKey].sort().join('|');
    const segments = boundaries.get(pair) ?? [];
    const candidates = [];
    const seen = new Set();
    for (const segment of segments) {
      for (const key of [segment.aCellKey, segment.bCellKey]) {
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = grid.byKey.get(key);
        if (!cell || cell.spaceId !== donorKey) continue;
        const recipientNeighbors = neighborsOf(cell, grid).filter(neighbor => neighbor.spaceId === recipientKey).length;
        const donorNeighbors = neighborsOf(cell, grid).filter(neighbor => neighbor.spaceId === donorKey).length;
        const preferenceDelta = preferenceScore(cell, recipient, profile, `${stableKey}:conveyor:recipient`)
          - preferenceScore(cell, donor, profile, `${stableKey}:conveyor:donor`);
        const score = recipientNeighbors * 12 - donorNeighbors * 3
          + Math.max(-5, Math.min(5, preferenceDelta * 0.2))
          - stableIndex(`${stableKey}:conveyor:${moveOrdinal}:${donorKey}:${recipientKey}:${cell.key}`, 1000000) / 1000000;
        candidates.push({ cell, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.cell.key.localeCompare(b.cell.key));
    for (const candidate of candidates.slice(0, 16)) {
      if (!canDonateCell(candidate.cell, donor, recipient, boundaries)) continue;
      candidate.cell.spaceId = recipientKey;
      counts.set(donorKey, (counts.get(donorKey) ?? 0) - 1);
      counts.set(recipientKey, (counts.get(recipientKey) ?? 0) + 1);
      return candidate.cell.key;
    }
    return null;
  };

  const notes = [];
  let movedCells = 0;
  const maxNetMoves = Math.max(24, grid.cells.length);
  for (let netMove = 0; netMove < maxNetMoves; netMove++) {
    const recipients = spaces.filter(space => (counts.get(space.key) ?? 0) < targetFor(space.key))
      .sort((a, b) => {
        const ar = (targetFor(a.key) - (counts.get(a.key) ?? 0)) / targetFor(a.key);
        const br = (targetFor(b.key) - (counts.get(b.key) ?? 0)) / targetFor(b.key);
        return br - ar || a.key.localeCompare(b.key);
      });
    const donors = spaces.filter(space => (counts.get(space.key) ?? 0) > targetFor(space.key))
      .sort((a, b) => {
        const ae = ((counts.get(a.key) ?? 0) - targetFor(a.key)) / targetFor(a.key);
        const be = ((counts.get(b.key) ?? 0) - targetFor(b.key)) / targetFor(b.key);
        return be - ae || a.key.localeCompare(b.key);
      });
    if (!recipients.length || !donors.length) break;

    const boundaries = boundaryCandidates(grid);
    const adjacency = adjacencyFromBoundaries(boundaries);
    let applied = null;
    for (const recipient of recipients) {
      const donorPaths = donors.map(donor => ({ donor, path: shortestPath(adjacency, donor.key, recipient.key) }))
        .filter(item => item.path?.length >= 2)
        .sort((a, b) => a.path.length - b.path.length
          || (((counts.get(b.donor.key) ?? 0) - targetFor(b.donor.key)) / targetFor(b.donor.key))
            - (((counts.get(a.donor.key) ?? 0) - targetFor(a.donor.key)) / targetFor(a.donor.key))
          || a.donor.key.localeCompare(b.donor.key));
      for (const { donor, path } of donorPaths) {
        const ownershipBefore = grid.cells.map(cell => cell.spaceId);
        const countsBefore = new Map(counts);
        const moved = [];
        let ok = true;
        // Push one unit of area forward along the ownership-adjacency path.
        // Every intermediate receives before it donates, so it never has to dip
        // below its minimum just to relay capacity toward a starved neighbor.
        for (let hop = 0; hop + 1 < path.length; hop++) {
          const cellKey = transferOneAcrossBoundary(path[hop], path[hop + 1], `${netMove}:${hop}`);
          if (!cellKey) { ok = false; break; }
          moved.push({ fromSpaceKey: path[hop], toSpaceKey: path[hop + 1], cellKey });
        }
        if (!ok) {
          for (let i = 0; i < grid.cells.length; i++) grid.cells[i].spaceId = ownershipBefore[i];
          counts.clear(); for (const [key, value] of countsBefore) counts.set(key, value);
          continue;
        }
        movedCells += moved.length;
        applied = { source: donor.key, recipient: recipient.key, path, moved };
        if (notes.length < 64) notes.push({
          kind: 'weighted-target-boundary-conveyor',
          sourceSpaceKey: donor.key,
          recipientSpaceKey: recipient.key,
          path,
          hops: moved,
        });
        break;
      }
      if (applied) break;
    }
    if (!applied) break;
  }
  const remainingDeficitCells = spaces.reduce((sum, space) =>
    sum + Math.max(0, targetFor(space.key) - (counts.get(space.key) ?? 0)), 0);
  return { movedCells, remainingDeficitCells, notes };
}

function regularityMetricsForCells(cells) {
  if (!cells.length) return { rectangularity: 0, concaveCornerEstimate: 0, neckCellCount: 0 };
  const minIx = Math.min(...cells.map(cell => cell.ix));
  const maxIx = Math.max(...cells.map(cell => cell.ix));
  const minIz = Math.min(...cells.map(cell => cell.iz));
  const maxIz = Math.max(...cells.map(cell => cell.iz));
  const boundingCells = Math.max(1, (maxIx - minIx + 1) * (maxIz - minIz + 1));
  const set = new Set(cells.map(cell => cell.key));
  let neckCellCount = 0;
  let concaveCornerEstimate = 0;
  for (const cell of cells) {
    const neighbors = [
      set.has(`${cell.ix + 1},${cell.iz}`), set.has(`${cell.ix - 1},${cell.iz}`),
      set.has(`${cell.ix},${cell.iz + 1}`), set.has(`${cell.ix},${cell.iz - 1}`),
    ].filter(Boolean).length;
    if (cells.length > 3 && neighbors <= 1) neckCellCount++;
    const diagonals = [
      [`${cell.ix + 1},${cell.iz}`, `${cell.ix},${cell.iz + 1}`, `${cell.ix + 1},${cell.iz + 1}`],
      [`${cell.ix - 1},${cell.iz}`, `${cell.ix},${cell.iz + 1}`, `${cell.ix - 1},${cell.iz + 1}`],
      [`${cell.ix + 1},${cell.iz}`, `${cell.ix},${cell.iz - 1}`, `${cell.ix + 1},${cell.iz - 1}`],
      [`${cell.ix - 1},${cell.iz}`, `${cell.ix},${cell.iz - 1}`, `${cell.ix - 1},${cell.iz - 1}`],
    ];
    concaveCornerEstimate += diagonals.filter(([a, b, diagonal]) => set.has(a) && set.has(b) && !set.has(diagonal)).length;
  }
  return {
    rectangularity: cells.length / boundingCells,
    concaveCornerEstimate,
    neckCellCount,
  };
}

function circulationFrontageForSpace(space, cells, grid, routeSpaceKey) {
  if (!routeSpaceKey || !routeFrontageEligible(space) || !cells.length) return null;
  let routeBoundaryEdges = 0;
  let exposedFacadeEdges = 0;
  const sides = new Set();
  for (const cell of cells) {
    exposedFacadeEdges += cell.exposedSides.length;
    for (const side of cell.exposedSides) sides.add(side);
    for (const neighbor of neighborsOf(cell, grid)) {
      if (neighbor.spaceId === routeSpaceKey) routeBoundaryEdges++;
    }
  }
  if (!routeBoundaryEdges || !exposedFacadeEdges) return null;
  return {
    eligible: true,
    routeSpaceKey,
    routeBoundaryEdges,
    exposedFacadeEdges,
    facadeSides: [...sides].sort(),
    priority: routeBoundaryEdges >= 2 ? 'major-public-circulation-frontage' : 'public-circulation-frontage',
    programAuthority: 'program-architecture-authority-v1',
    placementAuthority: 'program-aware-circulation-frontage-v1',
  };
}

function nestedDwellingUnitPlan(space, cells, grid, routeSpaceKey) {
  if (!space?.unitEnvelope || !cells.length || !rectangleFirstPreferred({ inversion: 0 })) return null;
  const minIx = Math.min(...cells.map(cell => cell.ix));
  const maxIx = Math.max(...cells.map(cell => cell.ix));
  const minIz = Math.min(...cells.map(cell => cell.iz));
  const maxIz = Math.max(...cells.map(cell => cell.iz));
  const width = maxIx - minIx + 1;
  const depth = maxIz - minIz + 1;
  if (width * depth !== cells.length || width < 2 || depth < 2) return null;
  const cellSize = grid.cellSize;
  const bounds = {
    minX: minIx * cellSize, maxX: (maxIx + 1) * cellSize,
    minZ: minIz * cellSize, maxZ: (maxIz + 1) * cellSize,
  };
  const routeSideCounts = { north: 0, east: 0, south: 0, west: 0 };
  const set = new Set(cells.map(cell => cell.key));
  const dirs = [
    [0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west'],
  ];
  for (const cell of cells) {
    for (const [dx, dz, side] of dirs) {
      const neighbor = grid.byKey.get(`${cell.ix + dx},${cell.iz + dz}`);
      if (neighbor && !set.has(neighbor.key) && neighbor.spaceId === routeSpaceKey) routeSideCounts[side]++;
    }
  }
  const rankedSides = Object.entries(routeSideCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const corridorSide = rankedSides[0]?.[1] > 0
    ? rankedSides[0][0]
    : (width >= depth ? 'north' : 'west');
  const horizontalEntry = corridorSide === 'north' || corridorSide === 'south';
  const tangentSpan = horizontalEntry ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ;
  const normalSpan = horizontalEntry ? bounds.maxZ - bounds.minZ : bounds.maxX - bounds.minX;
  const minimumNormalDepth = Math.max(6.4, Number(space.unitEnvelope.nestedMinimumNormalDepth) || 0);
  const minimumTangentWidth = Math.max(5.0, Number(space.unitEnvelope.nestedMinimumTangentWidth) || 0);

  // A semantic room list is not a license to manufacture five closets. If the
  // envelope cannot support a real domestic section, leave it as one large,
  // adaptable dwelling territory. The parent space still owns the unit; it just
  // has no fake internal walls until there is enough physical depth to deserve them.
  if (normalSpan + EPS < minimumNormalDepth || tangentSpan + EPS < minimumTangentWidth) return null;

  const roomMinimumShortDimension = Object.freeze({
    entry: 1.35,
    work: 2.0,
    service: 1.8,
    shared: 2.7,
    private: 2.3,
  });
  const rooms = [];
  let invalidRoom = false;
  const addRoom = (key, role, minX, maxX, minZ, maxZ) => {
    const roomWidth = maxX - minX;
    const roomDepth = maxZ - minZ;
    const shortDimension = Math.min(roomWidth, roomDepth);
    const requiredShortDimension = roomMinimumShortDimension[role] ?? 2.0;
    if (roomWidth <= EPS || roomDepth <= EPS || shortDimension + EPS < requiredShortDimension) {
      invalidRoom = true;
      return;
    }
    rooms.push({
      id: `${space.key}:unit-room:${key}`,
      key, role,
      minX, maxX, minZ, maxZ,
      cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5,
      halfX: roomWidth * 0.5, halfZ: roomDepth * 0.5,
      area: roomWidth * roomDepth,
      shortDimension,
      minimumShortDimension: requiredShortDimension,
    });
  };

  // Organize from common circulation inward using metre-scale bands rather than
  // percentages. This makes a deeper unit become a deeper room instead of making
  // every room proportionally skinnier when the parent happens to be awkward.
  const entryDepth = clamp(normalSpan * 0.19, 1.40, 1.80);
  const serviceDepth = clamp(normalSpan * 0.29, 2.00, 2.55);
  const deepDepth = normalSpan - entryDepth - serviceDepth;
  if (deepDepth + EPS < 3.0) return null;

  if (horizontalEntry) {
    const first = corridorSide === 'north' ? bounds.minZ : bounds.maxZ;
    const direction = corridorSide === 'north' ? 1 : -1;
    const entryEdge = first + direction * entryDepth;
    const serviceEdge = entryEdge + direction * serviceDepth;
    const entryZ0 = Math.min(first, entryEdge), entryZ1 = Math.max(first, entryEdge);
    const serviceZ0 = Math.min(entryEdge, serviceEdge), serviceZ1 = Math.max(entryEdge, serviceEdge);
    const deepEnd = corridorSide === 'north' ? bounds.maxZ : bounds.minZ;
    const deepZ0 = Math.min(serviceEdge, deepEnd), deepZ1 = Math.max(serviceEdge, deepEnd);
    const serviceSplitX = bounds.minX + tangentSpan * 0.58;
    const deepSplitX = bounds.minX + tangentSpan * 0.55;
    addRoom('entry', 'entry', bounds.minX, bounds.maxX, entryZ0, entryZ1);
    addRoom('kitchen', 'work', bounds.minX, serviceSplitX, serviceZ0, serviceZ1);
    addRoom('bathroom', 'service', serviceSplitX, bounds.maxX, serviceZ0, serviceZ1);
    addRoom('living-dining', 'shared', bounds.minX, deepSplitX, deepZ0, deepZ1);
    addRoom('bedroom', 'private', deepSplitX, bounds.maxX, deepZ0, deepZ1);
  } else {
    const first = corridorSide === 'west' ? bounds.minX : bounds.maxX;
    const direction = corridorSide === 'west' ? 1 : -1;
    const entryEdge = first + direction * entryDepth;
    const serviceEdge = entryEdge + direction * serviceDepth;
    const entryX0 = Math.min(first, entryEdge), entryX1 = Math.max(first, entryEdge);
    const serviceX0 = Math.min(entryEdge, serviceEdge), serviceX1 = Math.max(entryEdge, serviceEdge);
    const deepEnd = corridorSide === 'west' ? bounds.maxX : bounds.minX;
    const deepX0 = Math.min(serviceEdge, deepEnd), deepX1 = Math.max(serviceEdge, deepEnd);
    const serviceSplitZ = bounds.minZ + tangentSpan * 0.58;
    const deepSplitZ = bounds.minZ + tangentSpan * 0.55;
    addRoom('entry', 'entry', entryX0, entryX1, bounds.minZ, bounds.maxZ);
    addRoom('kitchen', 'work', serviceX0, serviceX1, bounds.minZ, serviceSplitZ);
    addRoom('bathroom', 'service', serviceX0, serviceX1, serviceSplitZ, bounds.maxZ);
    addRoom('living-dining', 'shared', deepX0, deepX1, bounds.minZ, deepSplitZ);
    addRoom('bedroom', 'private', deepX0, deepX1, deepSplitZ, bounds.maxZ);
  }
  if (invalidRoom || rooms.length !== 5) return null;
  return {
    schema: space.unitEnvelope.schema ?? 'jweb.dwelling-unit-program.v1',
    parentSpaceKey: space.key,
    corridorSide,
    entryRoomKey: 'entry',
    roomCount: rooms.length,
    rooms,
    adjacency: (space.unitEnvelope.adjacency ?? []).map(pair => [...pair]),
    envelopeWidth: tangentSpan,
    envelopeDepth: normalSpan,
    rule: 'common route -> real-width entry band -> wet/service band -> deep living/sleeping territory; no subdivision below metre-scale thresholds',
  };
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

function rootAnchor({ floor, baseFloor = 0, rootSpace, grid, accessAnchors, reservations }) {
  if (floor === baseFloor) {
    const anchor = accessAnchors.find(a => a.floor === floor && a.kind === 'main-entry')
      ?? accessAnchors.find(a => a.floor === floor);
    if (anchor) return { x: anchor.x, z: anchor.z, source: anchor.id };
  }
  if (rootSpace?.role === 'circulation') {
    const active = reservations.find(r => reservationHitsFloor(r, grid.y0, grid.y1));
    if (active) return { x: active.x, z: active.z, source: active.id };
  }
  return { x: (grid.bounds.minX + grid.bounds.maxX) * 0.5, z: (grid.bounds.minZ + grid.bounds.maxZ) * 0.5, source: 'floor-center' };
}

function transferRouteSpace(spaces) {
  return spaces.find(space => space.role === 'circulation' && space.circulationShape === 'occupancy-hallway')
    ?? spaces.find(space => space.role === 'circulation')
    ?? spaces.find(space => space.role === 'entry')
    ?? null;
}

function pathCellKey(ix, iz) { return `${ix},${iz}`; }

function directOrthogonalGridPath(grid, start, end, horizontalFirst, routeSpaceKey) {
  const result = [];
  let ix = start.ix, iz = start.iz;
  const visit = (x, z) => {
    const cell = grid.byKey.get(pathCellKey(x, z));
    if (!cell || (cell.spaceId && cell.spaceId !== routeSpaceKey)) return false;
    if (!result.includes(cell)) result.push(cell);
    return true;
  };
  if (!visit(ix, iz)) return null;
  const moveX = () => {
    while (ix !== end.ix) {
      ix += ix < end.ix ? 1 : -1;
      if (!visit(ix, iz)) return false;
    }
    return true;
  };
  const moveZ = () => {
    while (iz !== end.iz) {
      iz += iz < end.iz ? 1 : -1;
      if (!visit(ix, iz)) return false;
    }
    return true;
  };
  const ok = horizontalFirst ? (moveX() && moveZ()) : (moveZ() && moveX());
  return ok ? result : null;
}

function shortestGridPath(grid, start, end, routeSpaceKey) {
  const directA = directOrthogonalGridPath(grid, start, end, true, routeSpaceKey);
  const directB = directOrthogonalGridPath(grid, start, end, false, routeSpaceKey);
  if (directA && directB) return directA.length <= directB.length ? directA : directB;
  if (directA) return directA;
  if (directB) return directB;

  const queue = [start];
  const parent = new Map([[start.key, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current.key === end.key) break;
    const next = neighborsOf(current, grid)
      .filter(cell => (!cell.spaceId || cell.spaceId === routeSpaceKey) && !parent.has(cell.key))
      .sort((a, b) => {
        const ad = Math.abs(a.ix - end.ix) + Math.abs(a.iz - end.iz);
        const bd = Math.abs(b.ix - end.ix) + Math.abs(b.iz - end.iz);
        return ad - bd || a.key.localeCompare(b.key);
      });
    for (const cell of next) {
      parent.set(cell.key, current.key);
      queue.push(cell);
    }
  }
  if (!parent.has(end.key)) return null;
  const path = [];
  let cursor = end.key;
  while (cursor) {
    const cell = grid.byKey.get(cursor);
    if (cell) path.push(cell);
    cursor = parent.get(cursor);
  }
  path.reverse();
  return path;
}

function preclaimCityExchangeRoutes({ spaces, floor, grid, reservations, accessAnchors }) {
  const exchangeAnchors = accessAnchors
    .filter(anchor => anchor.floor === floor && anchor.kind === 'city-exchange')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!exchangeAnchors.length) return { claimed: 0, transferSpace: null, bindings: [], routes: [] };

  const routeSpace = transferRouteSpace(spaces);
  if (!routeSpace) throw new Error(`building plan floor ${floor}: city exchange requires an entry/circulation space`);
  const activeReservations = reservations.filter(reservation => reservationHitsFloor(reservation, grid.y0, grid.y1));
  const coreReservation = activeReservations.find(reservation => String(reservation.kind).toLowerCase() === 'stair-shaft')
    ?? activeReservations.find(reservation => /stair|core|shaft/i.test(String(reservation.kind)))
    ?? null;
  if (!coreReservation) throw new Error(`building plan floor ${floor}: city exchange cannot reach a persistent stair/core reservation`);

  const coreCell = nearestCell(grid.cells, { x: coreReservation.x, z: coreReservation.z }, cell =>
    (!cell.spaceId || cell.spaceId === routeSpace.key) && cellEligibleForSpace(cell, routeSpace));
  if (!coreCell) throw new Error(`building plan floor ${floor}: persistent stair/core has no traversable plan cell`);

  const bindings = [];
  const routes = [];
  const claimedKeys = new Set();
  for (const anchor of exchangeAnchors) {
    const anchorCell = nearestCell(grid.cells, { x: anchor.x, z: anchor.z }, cell =>
      (!cell.spaceId || cell.spaceId === routeSpace.key) && cellEligibleForSpace(cell, routeSpace));
    if (!anchorCell) throw new Error(`building plan floor ${floor}: city exchange ${anchor.id} has no interior landing cell`);
    const path = shortestGridPath(grid, anchorCell, coreCell, routeSpace.key);
    if (!path?.length) throw new Error(`building plan floor ${floor}: city exchange ${anchor.id} cannot route to persistent core`);
    for (const cell of path) {
      if (cell.spaceId && cell.spaceId !== routeSpace.key) throw new Error(`building plan floor ${floor}: city exchange route collided with ${cell.spaceId}`);
      cell.spaceId = routeSpace.key;
      claimedKeys.add(cell.key);
    }
    bindings.push({
      anchorId: anchor.id,
      endpointId: anchor.endpointId,
      bridgeId: anchor.bridgeId,
      floor,
      spaceKey: routeSpace.key,
      traversalPermission: anchor.traversalPermission ?? 'PUBLIC_THROUGH',
      routeCharacter: anchor.routeCharacter ?? 'TOWER_TRANSFER',
      circulationClass: 'boundary-exchange',
      authority: anchor.authority ?? 'jweb.tower-transfer-authority.v1',
    });
    routes.push({
      anchorId: anchor.id,
      endpointId: anchor.endpointId,
      coreReservationId: coreReservation.id,
      spaceKey: routeSpace.key,
      cellKeys: path.map(cell => cell.key),
      directness: path.length <= Math.abs(anchorCell.ix - coreCell.ix) + Math.abs(anchorCell.iz - coreCell.iz) + 1
        ? 'orthogonal-direct' : 'grid-detour',
    });
  }
  return { claimed: claimedKeys.size, transferSpace: routeSpace, bindings, routes };
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
  const placementOrder = key => {
    const space = byKey.get(key);
    const rawFlowOrder = space?.operationalFlowOrder;
    const flowOrder = rawFlowOrder == null ? NaN : Number(rawFlowOrder);
    const flowRank = Number.isFinite(flowOrder) ? flowOrder : 1000;
    const frontageRank = space?.frontagePriority === 'required' ? -30
      : space?.frontagePriority === 'preferred' ? -15 : 0;
    return flowRank * 100 + frontageRank;
  };
  for (const values of neighbors.values()) values.sort((a, b) => placementOrder(a) - placementOrder(b) || a.localeCompare(b));
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

function minimumCellCountForSpace(space, grid, floorH) {
  const cellArea = grid.cellSize * grid.cellSize;
  return Math.max(1, Math.ceil((minimumAreaForSpace(space, floorH) - EPS) / Math.max(EPS, cellArea)));
}

function fitSpacesToFloorCapacity(spaces, grid, floorH, floor, baseFloor = 0) {
  const selected = [...spaces];
  const droppedSpaceKeys = [];
  const capacity = grid.cells.length;
  const nonReservedCapacity = grid.cells.filter(cell => !cell.structuralReservationId).length;
  const rootKey = chooseRootSpace(selected, floor, baseFloor)?.key ?? null;
  const requiredCells = () => selected.reduce((sum, s) => sum + minimumCellCountForSpace(s, grid, floorH), 0);
  const requiredNonCirculationCells = () => selected
    .filter(s => s.role !== 'circulation' && s.role !== 'entry')
    .reduce((sum, s) => sum + minimumCellCountForSpace(s, grid, floorH), 0);
  const roleDropRank = role => {
    if (role === 'shared') return 0;
    if (role === 'storage') return 1;
    if (role === 'service') return 2;
    if (role === 'private' || role === 'program' || role === 'work') return 3;
    if (role === 'public') return 4;
    return 10;
  };

  while ((requiredCells() > capacity || requiredNonCirculationCells() > nonReservedCapacity) && selected.length > 1) {
    const countsByTemplate = new Map();
    for (const s of selected) countsByTemplate.set(s.templateKey, (countsByTemplate.get(s.templateKey) ?? 0) + 1);
    let candidates = selected.filter(s => s.key !== rootKey
      && s.role !== 'entry' && s.role !== 'circulation'
      && (countsByTemplate.get(s.templateKey) ?? 0) > Math.max(1, Number(s.repeat?.min) || 1));
    if (!candidates.length) {
      candidates = selected.filter(s => s.key !== rootKey
        && s.role !== 'entry' && s.role !== 'circulation'
        && (countsByTemplate.get(s.templateKey) ?? 0) > 1);
    }
    if (!candidates.length) {
      candidates = selected.filter(s => s.key !== rootKey && s.role !== 'entry' && s.role !== 'circulation');
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => {
      const aEcho = String(a.source).includes('echo') ? 0 : 1;
      const bEcho = String(b.source).includes('echo') ? 0 : 1;
      if (aEcho !== bEcho) return aEcho - bEcho;
      // Keep one flexible shared/service territory alive as the pressure valve
      // for leftover floor area. Repeated private rooms should yield in count
      // before the only believable residual sink disappears and circulation
      // is forced to become an enormous catch-all blob.
      const aSink = a.residualSink ? 1 : 0;
      const bSink = b.residualSink ? 1 : 0;
      if (aSink !== bSink) return aSink - bSink;
      const role = roleDropRank(a.role) - roleDropRank(b.role);
      if (role) return role;
      return a.areaWeight - b.areaWeight || a.key.localeCompare(b.key);
    });
    const drop = candidates[0];
    selected.splice(selected.indexOf(drop), 1);
    droppedSpaceKeys.push(drop.key);
  }

  return {
    spaces: selected,
    droppedSpaceKeys,
    minimumProgramCells: requiredCells(),
    minimumNonCirculationCells: requiredNonCirculationCells(),
    capacityCells: capacity,
    nonReservedCapacityCells: nonReservedCapacity,
    shortfallCells: Math.max(
      0,
      requiredCells() - capacity,
      requiredNonCirculationCells() - nonReservedCapacity,
    ),
  };
}

function targetCellCounts(spaces, grid, floorH) {
  const nonReserved = grid.cells.filter(c => !c.structuralReservationId).length;
  const reserved = grid.cells.length - nonReserved;
  const circulationCount = spaces.filter(s => s.role === 'circulation' || s.role === 'entry').length;
  const allocatable = nonReserved + (circulationCount ? reserved : 0);
  const sumWeight = spaces.reduce((sum, s) => sum + Math.max(0.001, s.areaWeight), 0);
  const cellArea = grid.cellSize * grid.cellSize;
  const minimums = new Map();
  const maximums = new Map();
  const targets = new Map();
  let total = 0;

  for (const s of spaces) {
    const minimum = minimumCellCountForSpace(s, grid, floorH);
    const maximum = Number.isFinite(Number(s.maxArea))
      ? Math.max(minimum, Math.floor(Number(s.maxArea) / Math.max(EPS, cellArea)))
      : Infinity;
    const weighted = Math.round(allocatable * Math.max(0.001, s.areaWeight) / sumWeight);
    const raw = Math.max(minimum, Math.min(maximum, Math.max(1, weighted)));
    minimums.set(s.key, minimum);
    maximums.set(s.key, maximum);
    targets.set(s.key, raw);
    total += raw;
  }

  while (total > allocatable) {
    const candidates = [...spaces]
      .filter(s => (targets.get(s.key) ?? 0) > (minimums.get(s.key) ?? 1))
      .sort((a, b) => (targets.get(b.key) ?? 0) - (targets.get(a.key) ?? 0) || a.key.localeCompare(b.key));
    if (!candidates.length) break;
    const candidate = candidates[0];
    targets.set(candidate.key, targets.get(candidate.key) - 1);
    total--;
  }
  while (total < allocatable && spaces.length) {
    const candidates = [...spaces]
      .filter(s => (targets.get(s.key) ?? 0) < (maximums.get(s.key) ?? Infinity))
      .sort((a, b) => {
        const aNeed = allocatable * Math.max(0.001, a.areaWeight) / sumWeight - (targets.get(a.key) ?? 0);
        const bNeed = allocatable * Math.max(0.001, b.areaWeight) / sumWeight - (targets.get(b.key) ?? 0);
        return bNeed - aNeed || a.key.localeCompare(b.key);
      });
    if (!candidates.length) break;
    const candidate = candidates[0];
    targets.set(candidate.key, targets.get(candidate.key) + 1);
    total++;
  }
  return targets;
}

function preferredFrontierCell(frontier, space, profile, stableKey, scoreCache = null, grid = null) {
  let best = null;
  let bestScore = -Infinity;
  for (const cell of frontier.values()) {
    let score = scoreCache?.get(cell.key);
    if (score == null) {
      score = preferenceScore(cell, space, profile, stableKey);
      if (grid) {
        const same = neighborsOf(cell, grid).filter(neighbor => neighbor.spaceId === space.key).length;
        // Broad-front growth fills bays and corners before extending tendrils.
        score += same * 5;
        if (same <= 1) score -= 7;
        const diagonals = [
          [cell.ix + 1, cell.iz + 1], [cell.ix - 1, cell.iz + 1],
          [cell.ix + 1, cell.iz - 1], [cell.ix - 1, cell.iz - 1],
        ];
        score += diagonals.reduce((sum, [ix, iz]) => sum + (grid.byKey.get(`${ix},${iz}`)?.spaceId === space.key ? 1.5 : 0), 0);
      }
      scoreCache?.set(cell.key, score);
    }
    if (score > bestScore || (score === bestScore && best && cell.key.localeCompare(best.key) < 0)) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
}

function preferredCell(cells, space, profile, stableKey) {
  let best = null;
  let bestScore = -Infinity;
  for (const cell of cells) {
    const score = preferenceScore(cell, space, profile, stableKey);
    if (score > bestScore || (score === bestScore && best && cell.key.localeCompare(best.key) < 0)) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
}

function growSpace({ space, seed, target, grid, stableKey, profile, reserveForRemaining }) {
  if (!seed) return [];
  const assigned = [seed];
  seed.spaceId = space.key;
  let unassignedEligible = grid.cells.reduce((count, cell) => count + (!cell.spaceId && cellEligibleForSpace(cell, space) ? 1 : 0), 0);
  const frontier = new Map();
  const scoreCache = new Map();
  const considerNeighbors = cell => {
    for (const neighbor of neighborsOf(cell, grid)) {
      if (neighbor.spaceId || !cellEligibleForSpace(neighbor, space)) continue;
      frontier.set(neighbor.key, neighbor);
    }
  };
  considerNeighbors(seed);

  while (assigned.length < target && frontier.size) {
    if (unassignedEligible <= reserveForRemaining) break;
    const next = preferredFrontierCell(frontier, space, profile, stableKey, scoreCache, grid);
    if (!next) break;
    frontier.delete(next.key);
    if (next.spaceId) continue;
    next.spaceId = space.key;
    unassignedEligible--;
    assigned.push(next);
    considerNeighbors(next);
  }
  return assigned;
}

function growExistingSpace({ space, target, grid, stableKey, profile }) {
  let assigned = grid.cells.filter(cell => cell.spaceId === space.key);
  if (assigned.length >= target) return assigned;

  if (!assigned.length) {
    const seeds = grid.cells.filter(cell => !cell.spaceId && cellEligibleForSpace(cell, space));
    const seed = preferredCell(seeds, space, profile, `${stableKey}:repair-seed`);
    if (!seed) return assigned;
    seed.spaceId = space.key;
    assigned = [seed];
  }

  const frontier = new Map();
  const scoreCache = new Map();
  const considerNeighbors = cell => {
    for (const neighbor of neighborsOf(cell, grid)) {
      if (neighbor.spaceId || !cellEligibleForSpace(neighbor, space)) continue;
      frontier.set(neighbor.key, neighbor);
    }
  };
  for (const cell of assigned) considerNeighbors(cell);

  while (assigned.length < target && frontier.size) {
    const next = preferredFrontierCell(frontier, space, profile, stableKey, scoreCache);
    if (!next) break;
    frontier.delete(next.key);
    if (next.spaceId) continue;
    next.spaceId = space.key;
    assigned.push(next);
    considerNeighbors(next);
  }
  return assigned;
}

function chooseMinimumGeometryDropCandidate(spaces, shortfalls, floor, baseFloor = 0) {
  const rootKey = chooseRootSpace(spaces, floor, baseFloor)?.key ?? null;
  const ordinary = chooseHumanScaleProgramDrop({
    spaces,
    shortfalls,
    protectedKeys: rootKey ? [rootKey] : [],
  });
  if (ordinary) return ordinary;

  // Ground floors can legitimately contain both an entry room and a separate
  // circulation room. On a constrained plate those are two semantic labels for
  // one physical threshold/core. If every ordinary room has already yielded,
  // coalesce one non-root route role rather than squeeze either route below its
  // human-scale minimum. Never remove the last entry/circulation role.
  const routeSpaces = spaces.filter(space => space.role === 'entry' || space.role === 'circulation');
  if (routeSpaces.length <= 1) return null;
  const shortfallKeys = new Set(shortfalls.map(item => String(item?.key ?? item)).filter(Boolean));
  const redundant = routeSpaces.filter(space => space.key !== rootKey);
  redundant.sort((a, b) => {
    const aShort = shortfallKeys.has(String(a.key)) ? 0 : 1;
    const bShort = shortfallKeys.has(String(b.key)) ? 0 : 1;
    return aShort - bShort || String(a.key).localeCompare(String(b.key));
  });
  return redundant[0] ?? null;
}

function attemptMinimumProgramPlacement({
  spaces, floor, baseFloor = 0, grid, reservations, accessAnchors, profile, stableKey, floorH,
  weightedPlacementPriority = true,
}) {
  for (const cell of grid.cells) cell.spaceId = null;

  const topology = buildTopology({ spaces, floor, baseFloor, profile, stableKey: `${stableKey}:floor:${floor}` });
  const rootSpace = spaces.find(space => space.key === topology.rootKey) ?? spaces[0];
  const { order, parent } = graphBfsOrder(spaces, topology.edges, rootSpace.key);
  const preliminaryTargets = targetCellCounts(spaces, grid, floorH);
  // Preserve topology dependency, but among rooms whose parent is already placed,
  // give the largest weighted targets first choice of viable territory. This keeps
  // small siblings from sealing a defining room into a minimum-sized pocket.
  const placementOrder = [];
  if (!weightedPlacementPriority) {
    placementOrder.push(...order);
  } else {
    const pending = new Map(order.map(space => [space.key, space]));
    while (pending.size) {
      const ready = [...pending.values()].filter(space => {
        if (space.key === rootSpace.key) return placementOrder.length === 0;
        const parentKey = parent.get(space.key);
        return !parentKey || placementOrder.some(placed => placed.key === parentKey);
      });
      const candidates = ready.length ? ready : [...pending.values()];
      candidates.sort((a, b) => {
        if (a.key === rootSpace.key) return -1;
        if (b.key === rootSpace.key) return 1;
        const targetDiff = (preliminaryTargets.get(b.key) ?? 0) - (preliminaryTargets.get(a.key) ?? 0);
        return targetDiff || a.key.localeCompare(b.key);
      });
      const selected = candidates[0];
      placementOrder.push(selected);
      pending.delete(selected.key);
    }
  }
  const minimumCellsByKey = new Map(spaces.map(space => [
    space.key,
    minimumCellCountForSpace(space, grid, floorH),
  ]));
  const hallwayClaim = preclaimOccupancyHallway(spaces, grid);
  const cityExchangeClaim = preclaimCityExchangeRoutes({ spaces, floor, grid, reservations, accessAnchors });
  const rootPoint = rootAnchor({ floor, baseFloor, rootSpace, grid, accessAnchors, reservations });
  const rootSeed = grid.cells.some(cell => cell.spaceId === rootSpace.key)
    ? null
    : nearestCell(grid.cells, rootPoint, cell => !cell.spaceId && cellEligibleForSpace(cell, rootSpace));
  const geometryNotes = [];
  if (hallwayClaim.claimed) geometryNotes.push({
    spaceKey: hallwayClaim.hallway.key,
    kind: 'preclaimed-occupancy-hallway',
    cellCount: hallwayClaim.claimed,
  });
  if (cityExchangeClaim.claimed) geometryNotes.push({
    spaceKey: cityExchangeClaim.transferSpace?.key ?? null,
    kind: 'preclaimed-city-transfer-spine',
    cellCount: cityExchangeClaim.claimed,
    endpointIds: cityExchangeClaim.bindings.map(binding => binding.endpointId),
  });

  for (let ordinal = 0; ordinal < placementOrder.length; ordinal++) {
    const space = placementOrder[ordinal];
    const existingCount = grid.cells.filter(cell => cell.spaceId === space.key).length;
    if (existingCount) {
      growExistingSpace({
        space,
        target: minimumCellsByKey.get(space.key) ?? 1,
        grid,
        stableKey: `${stableKey}:floor:${floor}:minimum-preclaimed`,
        profile,
      });
      continue;
    }
    const rectangle = placeRectangleFirstSpace({
      space,
      spaces,
      target: minimumCellsByKey.get(space.key) ?? 1,
      parentKey: parent.get(space.key),
      routeSpaceKey: cityExchangeClaim.transferSpace?.key ?? null,
      grid,
      profile,
      stableKey: `${stableKey}:floor:${floor}:minimum-rectangle`,
    });
    if (rectangle) {
      geometryNotes.push({
        spaceKey: space.key,
        kind: 'rectangle-first-minimum',
        cellCount: rectangle.cells.length,
        widthCells: rectangle.width,
        depthCells: rectangle.depth,
        parentBoundaryCells: rectangle.parentBoundary,
        routeBoundaryCells: rectangle.routeBoundary,
      });
      continue;
    }
    const strictRectangleRequired = rectangleFirstPreferred(profile)
      && (space.role === 'private'
        || minimumShortDimensionForSpace(space) > grid.cellSize * 1.25
        || (!!cityExchangeClaim.transferSpace?.key && routeFrontageEligible(space)));
    if (strictRectangleRequired) {
      // Do not fall back to greedy cell growth for the room classes that define
      // 21U's believable-plan contract. Mark the contract before the repair pass
      // as well, so an unplaced strict room cannot be resurrected as a raster blob.
      // The visible shortfall makes the outer fit loop yield a lower-priority room
      // and replan the floor from scratch.
      space.rectangleStrict = true;
      geometryNotes.push({ spaceKey: space.key, kind: 'strict-rectangle-fit-unavailable' });
      continue;
    }
    const seedInfo = ordinal === 0
      ? { seed: rootSeed, parentBoundaryRealized: true }
      : chooseChildSeed({
          space,
          parentKey: parent.get(space.key),
          grid,
          profile,
          stableKey: `${stableKey}:floor:${floor}:seed`,
        });
    if (!seedInfo.seed) {
      geometryNotes.push({ spaceKey: space.key, kind: 'no-geometric-seed' });
      continue;
    }
    if (!seedInfo.parentBoundaryRealized && ordinal > 0) {
      geometryNotes.push({ spaceKey: space.key, kind: 'parent-adjacency-fallback' });
    }
    const reserveForRemaining = minimumEligibleCellsReservedForRemaining({
      currentSpace: space,
      remainingSpaces: placementOrder.slice(ordinal + 1),
      grid,
      minimumCellsByKey,
    });
    growSpace({
      space,
      seed: seedInfo.seed,
      target: minimumCellsByKey.get(space.key) ?? 1,
      grid,
      stableKey: `${stableKey}:floor:${floor}:minimum-grow`,
      profile,
      reserveForRemaining,
    });
  }

  // A second pass may use free cells that were not reachable at the first seed.
  // It never steals another room's minimum and never permits a room to shrink.
  for (const space of order) {
    const minimumTarget = minimumCellsByKey.get(space.key) ?? 1;
    const assignedCount = grid.cells.filter(cell => cell.spaceId === space.key).length;
    if (assignedCount >= minimumTarget) continue;
    const rectangularRepair = growExistingSpaceRectangular({
      space,
      target: minimumTarget,
      grid,
      stableKey: `${stableKey}:floor:${floor}:minimum-rectangle-repair`,
      profile,
    });
    if ((rectangularRepair?.count ?? 0) >= minimumTarget) continue;
    // Near-city strict rectangles are a hard planning contract. If a private or
    // route-frontage room cannot reach its physical minimum without breaking its
    // rectangle, leave the shortfall visible so the outer program-fit loop drops
    // a lower-priority room and replans the floor. Never silently turn the room
    // back into a greedy raster blob just to satisfy area.
    if (rectangleFirstPreferred(profile) && space.rectangleStrict) continue;
    growExistingSpace({
      space,
      target: minimumTarget,
      grid,
      stableKey: `${stableKey}:floor:${floor}:minimum-repair`,
      profile,
    });
  }

  const shortfalls = spaces.map(space => {
    const assignedCount = grid.cells.filter(cell => cell.spaceId === space.key).length;
    const minimumCount = minimumCellsByKey.get(space.key) ?? 1;
    return {
      key: space.key,
      role: space.role,
      assignedCount,
      minimumCount,
      shortfallCells: Math.max(0, minimumCount - assignedCount),
    };
  }).filter(item => item.shortfallCells > 0);

  return {
    topology, rootSpace, order, parent, minimumCellsByKey, geometryNotes, shortfalls,
    cityExchangeBindings: cityExchangeClaim.bindings,
    cityTransferRoutes: cityExchangeClaim.routes,
    cityTransferSpaceKey: cityExchangeClaim.transferSpace?.key ?? null,
  };
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

function assignLeftovers({ grid, spaces, profile, stableKey, targets = null }) {
  const regularSurplusClaims = absorbRegularSurplus({ grid, spaces, profile, stableKey, targets });
  const flexibleResidualKeys = new Set(spaces
    .filter(space => ['service', 'storage', 'shared'].includes(space.role) && !space.circulationFrontageReserved)
    .map(space => space.key));
  if (!flexibleResidualKeys.size) {
    const fallbackResidual = [...spaces]
      .filter(space => !space.rectangleStrict && !['entry', 'circulation'].includes(space.role))
      .sort((a, b) => Number(b.areaWeight || 0) - Number(a.areaWeight || 0) || a.key.localeCompare(b.key))[0];
    if (fallbackResidual) flexibleResidualKeys.add(fallbackResidual.key);
  }
  // A space that has already reached (or passed) its own weighted fair share
  // should stop winning contested leftover cells against a space that hasn't.
  // Without this, whichever space wins the first shell of a contested unclaimed
  // region keeps a permanent adjacency advantage and can snowball into claiming
  // nearly all of it - regardless of areaWeight - while a defining program room
  // that got boxed in early (e.g. a strict-rectangle industrial bay with no
  // remaining cardinal expansion) stays pinned at its bare minimum forever.
  const overTargetRatio = space => {
    const target = Number(targets?.get?.(space.key));
    if (!Number.isFinite(target) || target <= 0) return 0;
    const current = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === space.key ? 1 : 0), 0);
    return Math.max(0, current / target - 1);
  };
  const closureArgs = {
    cells: grid.cells,
    spaces,
    neighborsOfCell: cell => neighborsOf(cell, grid),
    cellEligibleForSpace: (cell, space) => {
      if (!cellEligibleForSpace(cell, space)) return false;
      if (!rectangleFirstPreferred(profile) || !space.rectangleStrict) return true;
      return flexibleResidualKeys.has(space.key);
    },
    preferenceScoreForSpace: (cell, space) => {
      const circulationPenalty = rectangleFirstPreferred(profile)
        && (space.role === 'circulation' || space.role === 'entry')
        && !cell.structuralReservationId ? 8 : 0;
      const overTargetPenalty = overTargetRatio(space) * 6;
      return preferenceScore(cell, space, profile, `${stableKey}:leftover`) - circulationPenalty - overTargetPenalty;
    },
  };
  const targetGatedArgs = {
    ...closureArgs,
    cellEligibleForSpace: (cell, space) => {
      if (!closureArgs.cellEligibleForSpace(cell, space)) return false;
      const target = Number(targets?.get?.(space.key));
      if (!Number.isFinite(target) || target <= 0) return true;
      const current = grid.cells.reduce((sum, candidate) => sum + (candidate.spaceId === space.key ? 1 : 0), 0);
      return current < target;
    },
  };
  let closure = claimUnassignedRasterToEligibleSpaces(targetGatedArgs);
  // Only after every reachable under-target claim has stalled may genuine surplus
  // cross a weighted target. This prevents an already-large wrapper room from
  // winning the floor before required rooms get their fair share.
  if (closure.unclaimedCount > 0) closure = claimUnassignedRasterToEligibleSpaces(closureArgs);
  let residualComponentSeeds = 0;
  if (closure.unclaimedCount > 0 && rectangleFirstPreferred(profile)) {
    residualComponentSeeds = seedResidualComponents({ grid, spaces, flexibleResidualKeys });
    if (residualComponentSeeds > 0) closure = claimUnassignedRasterToEligibleSpaces(closureArgs);
  }
  return { ...closure, regularSurplusClaims, residualComponentSeeds };
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

const MINIMUM_INTERIOR_WALL_RETURN = 0.22;

function boundaryCandidates(grid) {
  const map = new Map();
  const add = (a, b, boundary) => {
    if (!a?.spaceId || !b?.spaceId || a.spaceId === b.spaceId) return;
    const id = [a.spaceId, b.spaceId].sort().join('|');
    const list = map.get(id) ?? [];
    list.push({ ...boundary, aCellKey: a.key, bCellKey: b.key });
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

function contiguousBoundaryRuns(candidates, cellSize) {
  const byLine = new Map();
  for (const candidate of candidates ?? []) {
    const key = `${candidate.axis}:${Number(candidate.fixedCoord).toFixed(6)}`;
    const list = byLine.get(key) ?? [];
    list.push(candidate);
    byLine.set(key, list);
  }
  const runs = [];
  for (const list of byLine.values()) {
    list.sort((a, b) => a.centerCoord - b.centerCoord || a.aCellKey.localeCompare(b.aCellKey));
    let current = [];
    for (const candidate of list) {
      if (!current.length || Math.abs(candidate.centerCoord - current[current.length - 1].centerCoord - cellSize) <= Math.max(EPS, cellSize * 0.08)) {
        current.push(candidate);
      } else {
        runs.push(current);
        current = [candidate];
      }
    }
    if (current.length) runs.push(current);
  }
  return runs;
}

function boundaryPairDoorCapacity(candidates, grid, doorWidth) {
  const required = Math.max(0.72, Number(doorWidth) || 0.86) + 2 * MINIMUM_INTERIOR_WALL_RETURN;
  const runs = contiguousBoundaryRuns(candidates, grid.cellSize);
  const maxLength = runs.reduce((max, run) => Math.max(max, run.length * grid.cellSize), 0);
  return { capable: maxLength + EPS >= required, maxLength, required, runs };
}

function claimUnassignedFlowSeamPath({ grid, space, neighborKey, doorWidth, stableKey, maxPathCells = 18 }) {
  const pair = [space.key, neighborKey].sort().join('|');
  const capacityNow = () => {
    const boundary = boundaryCandidates(grid).get(pair);
    return boundary ? boundaryPairDoorCapacity(boundary, grid, doorWidth) : { capable: false, maxLength: 0, required: Math.max(0.72, Number(doorWidth) || 0.86) + 2 * MINIMUM_INTERIOR_WALL_RETURN };
  };
  if (capacityNow().capable) return { ok: true, claimedCellKeys: [], pathLength: 0 };

  const eligible = cell => !cell.spaceId && cellEligibleForSpace(cell, space) && !cell.structuralReservationId;
  const starts = grid.cells
    .filter(cell => eligible(cell) && neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === space.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  const parent = new Map();
  const distance = new Map();
  const queue = [];
  for (const cell of starts) {
    parent.set(cell.key, null);
    distance.set(cell.key, 1);
    queue.push(cell);
  }
  let goal = null;
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    const d = distance.get(cell.key) ?? 1;
    if (neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === neighborKey)) {
      goal = cell;
      break;
    }
    if (d >= maxPathCells) continue;
    const next = neighborsOf(cell, grid)
      .filter(neighbor => eligible(neighbor) && !parent.has(neighbor.key))
      .sort((a, b) => a.key.localeCompare(b.key));
    for (const neighbor of next) {
      parent.set(neighbor.key, cell.key);
      distance.set(neighbor.key, d + 1);
      queue.push(neighbor);
    }
  }
  if (!goal) return { ok: false, claimedCellKeys: [], pathLength: 0, reason: 'no-free-flow-seam-path' };

  const path = [];
  for (let key = goal.key; key != null; key = parent.get(key)) path.push(grid.byKey.get(key));
  path.reverse();
  for (const cell of path) cell.spaceId = space.key;
  const claimed = [...path];

  // Widen the terminal contact along the neighbor boundary until the accepted
  // partition rule can place a door with both wall returns. Only unclaimed,
  // recipient-eligible cells are consumed here; no already-realized room is cut.
  for (let pass = 0; pass < 6 && !capacityNow().capable; pass++) {
    const candidates = grid.cells.filter(cell => eligible(cell)
      && neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === space.key)
      && neighborsOf(cell, grid).some(neighbor => neighbor.spaceId === neighborKey));
    if (!candidates.length) break;
    candidates.sort((a, b) => stableIndex(`${stableKey}:flow-seam-widen:${pair}:${a.key}`, 1000000)
      - stableIndex(`${stableKey}:flow-seam-widen:${pair}:${b.key}`, 1000000) || a.key.localeCompare(b.key));
    candidates[0].spaceId = space.key;
    claimed.push(candidates[0]);
  }
  const capacity = capacityNow();
  return {
    ok: capacity.capable,
    claimedCellKeys: claimed.map(cell => cell.key),
    pathLength: path.length,
    boundaryLength: capacity.maxLength,
    requiredBoundaryLength: capacity.required,
    reason: capacity.capable ? null : 'flow-seam-door-capacity-unavailable',
  };
}

function spaceConnectedAfterRemovingCell(grid, spaceKey, removeKey) {
  const owned = grid.cells.filter(cell => cell.spaceId === spaceKey && cell.key !== removeKey);
  if (owned.length <= 1) return owned.length === 1;
  const remaining = new Set(owned.map(cell => cell.key));
  const start = owned[0];
  remaining.delete(start.key);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const neighbor of neighborsOf(queue[qi], grid)) {
      if (neighbor.spaceId !== spaceKey || neighbor.key === removeKey || !remaining.has(neighbor.key)) continue;
      remaining.delete(neighbor.key);
      queue.push(neighbor);
    }
  }
  return remaining.size === 0;
}

function boundaryExtensionMoves({ grid, pair, candidates, spacesByKey, targets, minimumCellsByKey, stableKey }) {
  const [pairA, pairB] = pair.split('|');
  const counts = new Map([pairA, pairB].map(key => [key, grid.cells.reduce((sum, cell) => sum + (cell.spaceId === key ? 1 : 0), 0)]));
  const moves = [];
  const consider = (donorCell, recipientKey, anchorRecipientCell, segment, directionTag) => {
    if (!donorCell || !anchorRecipientCell) return;
    const donorKey = donorCell.spaceId;
    if (!donorKey || donorKey === recipientKey || ![pairA, pairB].includes(donorKey) || ![pairA, pairB].includes(recipientKey)) return;
    const recipientSpace = spacesByKey.get(recipientKey);
    if (!recipientSpace || !cellEligibleForSpace(donorCell, recipientSpace)) return;
    const donorCount = counts.get(donorKey) ?? 0;
    const donorMinimum = Math.max(1, Number(minimumCellsByKey?.get?.(donorKey)) || 1);
    if (donorCount - 1 < donorMinimum) return;
    if (!spaceConnectedAfterRemovingCell(grid, donorKey, donorCell.key)) return;
    const recipientCount = counts.get(recipientKey) ?? 0;
    const donorTarget = Math.max(1, Number(targets?.get?.(donorKey)) || donorCount);
    const recipientTarget = Math.max(1, Number(targets?.get?.(recipientKey)) || recipientCount);
    const beforeError = Math.abs(donorCount - donorTarget) + Math.abs(recipientCount - recipientTarget);
    const afterError = Math.abs(donorCount - 1 - donorTarget) + Math.abs(recipientCount + 1 - recipientTarget);
    const donorRole = spacesByKey.get(donorKey)?.role;
    const routePenalty = ['circulation', 'entry'].includes(donorRole) ? 12 : 0;
    const score = (afterError - beforeError) * 8 + routePenalty
      + stableIndex(`${stableKey}:door-capacity:${pair}:${segment.axis}:${segment.fixedCoord}:${segment.centerCoord}:${directionTag}:${donorCell.key}:${recipientKey}`, 1000000) / 1000000;
    moves.push({ donorCell, donorKey, recipientKey, score, pair, segment });
  };

  for (const segment of candidates ?? []) {
    const a = grid.byKey.get(segment.aCellKey);
    const b = grid.byKey.get(segment.bCellKey);
    if (!a || !b || a.spaceId === b.spaceId) continue;
    if (![pairA, pairB].includes(a.spaceId) || ![pairA, pairB].includes(b.spaceId)) continue;
    for (const delta of [-1, 1]) {
      const aNext = segment.axis === 'z' ? cellAt(grid, a.ix, a.iz + delta) : cellAt(grid, a.ix + delta, a.iz);
      const bNext = segment.axis === 'z' ? cellAt(grid, b.ix, b.iz + delta) : cellAt(grid, b.ix + delta, b.iz);
      if (!aNext || !bNext) continue;
      if (aNext.spaceId === a.spaceId && bNext.spaceId === a.spaceId) {
        consider(bNext, b.spaceId, b, segment, delta);
      }
      if (aNext.spaceId === b.spaceId && bNext.spaceId === b.spaceId) {
        consider(aNext, a.spaceId, a, segment, delta);
      }
    }
  }
  return moves.sort((a, b) => a.score - b.score || a.donorCell.key.localeCompare(b.donorCell.key) || a.recipientKey.localeCompare(b.recipientKey));
}

function repairDoorCapableConnectivity({ grid, spaces, rootKey, doorWidth, targets, minimumCellsByKey, stableKey }) {
  const spacesByKey = new Map(spaces.map(space => [space.key, space]));
  const notes = [];
  const maxRepairs = Math.max(4, spaces.length * 4);
  for (let pass = 0; pass < maxRepairs; pass++) {
    const boundaries = boundaryCandidates(grid);
    const capableEdges = [];
    const capacityByPair = new Map();
    for (const [pair, candidates] of boundaries.entries()) {
      const capacity = boundaryPairDoorCapacity(candidates, grid, doorWidth);
      capacityByPair.set(pair, capacity);
      if (!capacity.capable) continue;
      const [a, b] = pair.split('|');
      capableEdges.push({ a, b });
    }
    const reachable = graphReachable(spaces, capableEdges, rootKey);
    if (reachable.size === spaces.length) {
      return { repaired: notes.length, notes, reachableSpaceCount: reachable.size, complete: true };
    }

    const crossing = [...boundaries.entries()].filter(([pair]) => {
      const [a, b] = pair.split('|');
      return reachable.has(a) !== reachable.has(b);
    }).sort((a, b) => {
      const ca = capacityByPair.get(a[0]), cb = capacityByPair.get(b[0]);
      const deficitA = (ca?.required ?? Infinity) - (ca?.maxLength ?? 0);
      const deficitB = (cb?.required ?? Infinity) - (cb?.maxLength ?? 0);
      return deficitA - deficitB || stableIndex(`${stableKey}:door-crossing:${a[0]}`, 1000000) - stableIndex(`${stableKey}:door-crossing:${b[0]}`, 1000000);
    });

    let applied = null;
    for (const [pair, candidates] of crossing) {
      const moves = boundaryExtensionMoves({ grid, pair, candidates, spacesByKey, targets, minimumCellsByKey, stableKey: `${stableKey}:pass:${pass}` });
      if (!moves.length) continue;
      applied = moves[0];
      break;
    }
    if (!applied) {
      return { repaired: notes.length, notes, reachableSpaceCount: reachable.size, complete: false };
    }
    const before = applied.donorCell.spaceId;
    applied.donorCell.spaceId = applied.recipientKey;
    notes.push({ kind: 'door-capacity-boundary-repair', pair: applied.pair, cellKey: applied.donorCell.key, fromSpaceKey: before, toSpaceKey: applied.recipientKey });
  }
  const finalBoundaries = boundaryCandidates(grid);
  const finalEdges = [];
  for (const [pair, candidates] of finalBoundaries.entries()) {
    if (!boundaryPairDoorCapacity(candidates, grid, doorWidth).capable) continue;
    const [a, b] = pair.split('|'); finalEdges.push({ a, b });
  }
  const reachable = graphReachable(spaces, finalEdges, rootKey);
  return { repaired: notes.length, notes, reachableSpaceCount: reachable.size, complete: reachable.size === spaces.length };
}

function realizeTopology({ spaces, desiredEdges, grid, rootKey, stableKey, doorWidth = 0.86 }) {
  const boundaries = boundaryCandidates(grid);
  const pairEntries = [...boundaries.entries()].map(([pair, candidates]) => {
    const [a, b] = pair.split('|');
    const doorCapacity = boundaryPairDoorCapacity(candidates, grid, doorWidth);
    return { pair, a, b, candidates, doorCapacity };
  });
  const doorCapablePairs = new Set(pairEntries.filter(item => item.doorCapacity.capable).map(item => item.pair));
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
    if (!doorCapablePairs.has(pair)) {
      unrealizedDesiredEdges.push({ ...edge, reason: 'desired-adjacency-shared-wall-too-short-for-door' });
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
      if (usedPairs.has(item.pair) || !item.doorCapacity.capable) return false;
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

function chooseArchitecturalDoorCandidate({ candidates, edge, grid, stableKey, floor }) {
  if (!candidates.length) return null;
  const aCells = grid.cells.filter(cell => cell.spaceId === edge.a);
  const bCells = grid.cells.filter(cell => cell.spaceId === edge.b);
  const aCenter = spaceCentroid(aCells);
  const bCenter = spaceCentroid(bCells);
  const desiredX = (aCenter.x + bCenter.x) * 0.5;
  const desiredZ = (aCenter.z + bCenter.z) * 0.5;
  const byRun = new Map();
  for (const candidate of candidates) {
    const runKey = `${candidate.axis}:${Number(candidate.fixedCoord).toFixed(5)}`;
    const run = byRun.get(runKey) ?? [];
    run.push(candidate);
    byRun.set(runKey, run);
  }
  let best = null;
  for (const candidate of candidates) {
    const run = byRun.get(`${candidate.axis}:${Number(candidate.fixedCoord).toFixed(5)}`) ?? [candidate];
    const coords = run.map(item => item.centerCoord).sort((a, b) => a - b);
    const minCoord = coords[0];
    const maxCoord = coords[coords.length - 1];
    const wallReturn = Math.min(
      Math.abs(candidate.centerCoord - minCoord),
      Math.abs(maxCoord - candidate.centerCoord),
    );
    const directDistance = Math.hypot(candidate.x - desiredX, candidate.z - desiredZ);
    const centerBias = wallReturn / Math.max(0.25, grid.cellSize) * 5.2;
    const directness = -directDistance * 0.85;
    const endPenalty = run.length >= 3 && wallReturn < grid.cellSize * 0.75 ? 7.5 : 0;
    const grain = (hashString32(`${stableKey}:door-score:${floor}:${edge.a}:${edge.b}:${candidate.x}:${candidate.z}`) / 0xffffffff) * 0.01;
    const score = centerBias + directness - endPenalty + grain;
    if (!best || score > best.score) best = { candidate, score, wallReturn, directDistance, runLength: run.length };
  }
  return best;
}

function openingsFromTopology({ grid, spaces, edges, rootKey, accessAnchors, cityExchangeBindings = [], physicalTruth, stableKey, floor, baseFloor = 0 }) {
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
    const selected = chooseArchitecturalDoorCandidate({ candidates, edge, grid, stableKey, floor });
    const candidate = selected?.candidate ?? candidates[stableIndex(`${stableKey}:opening:${floor}:${id}`, candidates.length)];
    openings.push({
      id: `${stableKey}:floor:${floor}:door:${openings.length}`,
      kind: 'interior-door',
      fromSpaceKey: edge.a,
      toSpaceKey: edge.b,
      width,
      height: Math.max(1.95, Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.03),
      ...candidate,
      topologySource: edge.source,
      doorPlacementAuthority: 'architectural-wall-return-and-directness',
      wallReturn: selected?.wallReturn ?? 0,
      directDistance: selected?.directDistance ?? null,
    });
  }
  if (rootKey) {
    for (const anchor of accessAnchors.filter(a => a.floor === floor
      && (floor === baseFloor || a.kind === 'city-exchange'))) {
      const binding = cityExchangeBindings.find(item => item.anchorId === anchor.id) ?? null;
      const cityExchange = anchor.kind === 'city-exchange';
      openings.push({
        id: `${stableKey}:entrance:${anchor.id}`,
        kind: anchor.kind,
        fromSpaceKey: cityExchange ? `exterior:${anchor.endpointId ?? anchor.id}` : 'street',
        toSpaceKey: cityExchange ? (binding?.spaceKey ?? rootKey) : rootKey,
        width,
        height: Math.max(1.95, Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.03),
        x: anchor.x,
        z: anchor.z,
        side: anchor.side,
        dc: anchor.dc,
        dr: anchor.dr,
        connectorId: anchor.connectorId,
        endpointId: anchor.endpointId ?? null,
        bridgeId: anchor.bridgeId ?? null,
        traversalPermission: anchor.traversalPermission ?? null,
        topologySource: cityExchange ? 'authoritative-city-exchange-anchor' : 'authoritative-access-anchor',
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

function* planFloorSteps({
  floor, baseFloor = 0, modules, floorH, reservations, accessAnchors, grammar, profile, authoredIntent,
  semanticProgram, programArchitecture = null, physicalTruth, stableKey,
}) {
  const minimumClearWidth = Math.max(0.72,
    Number(physicalTruth?.route?.clearWidthSI)
      || Number(physicalTruth?.door?.clearWidth?.realizedSI)
      || Number(physicalTruth?.door?.clearWidthSI)
      || 0.86);
  const grid = buildFloorGrid({ modules, floor, floorH, reservations, accessAnchors, minimumClearWidth });
  if (!grid || !grid.cells.length) return null;
  yield { phase: 'building-plan-floor-grid', floor, cellCount: grid.cells.length };
  const area = grid.plannedModules.reduce((sum, module) => sum + moduleArea(module), 0);
  const routeServed = accessAnchors.some(anchor => anchor.floor === floor && anchor.kind === 'city-exchange');
  let spaces = expandedTemplates({ grammar, floor, baseFloor, area, profile, authoredIntent, stableKey, semanticProgram, programArchitecture, routeServed });
  configureUpperOccupancyHallway(spaces, grid, floor, baseFloor);

  // Do not subdivide a small floor plate into implausible slivers. Room count
  // yields before human-scale volume does. The city massing is biased larger, and
  // this is the final fallback for constrained leftover sites.
  const programFit = fitSpacesToFloorCapacity(spaces, grid, floorH, floor, baseFloor);
  spaces = programFit.spaces;
  yield { phase: 'building-plan-floor-program-fit', floor, spaceCount: spaces.length, dropped: programFit.droppedSpaceKeys.length };

  // Capacity is necessary but not sufficient: a greedy region can geometrically
  // wall off a later room even when total cell counts fit. Retry from a clean
  // raster and reduce program instances deterministically until every selected
  // room can own its real minimum. Room count yields before human scale.
  const geometryDroppedSpaceKeys = [];
  let minimumPlacement = null;
  let minimumPlacementAttempts = 0;
  while (true) {
    minimumPlacementAttempts++;
    minimumPlacement = attemptMinimumProgramPlacement({
      spaces,
      floor,
      baseFloor,
      grid,
      reservations,
      accessAnchors,
      profile,
      stableKey,
      floorH,
    });
    const hallwayFrontageShortfalls = minimumPlacement.shortfalls.length
      ? []
      : occupancyHallwayFrontageShortfalls(spaces, grid, floor, baseFloor);
    const placementShortfalls = [...minimumPlacement.shortfalls, ...hallwayFrontageShortfalls];
    yield {
      phase: 'building-plan-floor-minimum-placement',
      floor,
      attempt: minimumPlacementAttempts,
      shortfallCount: placementShortfalls.length,
      spaceCount: spaces.length,
    };
    if (!placementShortfalls.length) break;
    let drop = chooseMinimumGeometryDropCandidate(spaces, placementShortfalls, floor, baseFloor);
    // Weighted placement is an optimization, never authority to delete an
    // operational-flow node. If that heuristic would force a program-flow room
    // to yield, retry the same selected program in topology/BFS order first.
    if (drop?.operationalFlowOrder != null) {
      const topologyOrderPlacement = attemptMinimumProgramPlacement({
        spaces, floor, baseFloor, grid, reservations, accessAnchors, profile, stableKey, floorH,
        weightedPlacementPriority: false,
      });
      const topologyHallwayShortfalls = topologyOrderPlacement.shortfalls.length
        ? []
        : occupancyHallwayFrontageShortfalls(spaces, grid, floor, baseFloor);
      const topologyShortfalls = [...topologyOrderPlacement.shortfalls, ...topologyHallwayShortfalls];
      yield {
        phase: 'building-plan-floor-minimum-placement-flow-preserving-retry',
        floor,
        attempt: minimumPlacementAttempts,
        shortfallCount: topologyShortfalls.length,
        spaceCount: spaces.length,
      };
      if (topologyShortfalls.length <= placementShortfalls.length) {
        minimumPlacement = topologyOrderPlacement;
        if (!topologyShortfalls.length) break;
        drop = chooseMinimumGeometryDropCandidate(spaces, topologyShortfalls, floor, baseFloor);
      }
    }
    if (!drop) break;
    geometryDroppedSpaceKeys.push(drop.key);
    spaces = spaces.filter(space => space.key !== drop.key);
    // The next pass always replans the raster from scratch for the reduced
    // program. There is no bounded-loop edge where a just-dropped room can
    // leave stale minimum-placement diagnostics behind.
  }
  if (!minimumPlacement) throw new Error(`building plan floor ${floor}: minimum placement was not attempted`);

  const { topology, rootSpace, order, minimumCellsByKey } = minimumPlacement;
  const geometryNotes = [...minimumPlacement.geometryNotes];
  if (minimumPlacement.shortfalls.length) {
    geometryNotes.push({
      kind: 'minimum-placement-shortfall-after-program-yield',
      spaces: minimumPlacement.shortfalls.map(item => ({ ...item })),
    });
  }

  // Weighted area is surplus. It may only be spent after the whole selected
  // program has acquired its physical minimum.
  const targets = targetCellCounts(spaces, grid, floorH);
  // Surplus growth spends weighted area, so the space that most defines the
  // floor (the largest weighted target - the room the whole program exists
  // for) must get first pick of whatever's still open, not whichever space
  // happens to sit earliest in the topology-graph traversal order. Growing in
  // graph order let a small, easily-satisfied room (e.g. an entry/circulation
  // room a few cells from its own tiny target) claim and wall off the
  // surrounding floor before a genuinely defining room - stalled at its
  // minimum rectangle with nowhere left to expand - ever got a turn.
  const surplusOrder = [...order].sort((a, b) => {
    const targetDiff = (targets.get(b.key) ?? 0) - (targets.get(a.key) ?? 0);
    if (targetDiff) return targetDiff;
    return a.key.localeCompare(b.key);
  });
  if (!minimumPlacement.shortfalls.length) {
    // One bounded re-anchor pass for rooms that are demonstrably stranded at a
    // tiny fraction of their weighted target. Existing minimum cells are released,
    // a new capacity-aware rectangle seed is chosen from the remaining free plate,
    // and the room gets first chance to grow toward its target before surplus closure.
    for (const space of surplusOrder) {
      if (['circulation', 'entry'].includes(space.role)) continue;
      const target = targets.get(space.key) ?? 0;
      const assigned = grid.cells.filter(cell => cell.spaceId === space.key);
      if (target < 4 || assigned.length >= target * 0.6) continue;
      const currentState = rectangularGrowthState(space, grid);
      const canExpand = currentState && rectangularExpansionOptions(
        space, grid, profile, `${stableKey}:floor:${floor}:reanchor-probe`, currentState.bounds,
      ).length > 0;
      if (canExpand) continue;

      // Capacity rescue may move a room, but it may not erase the concrete
      // predecessor/successor seams that make the selected program operational.
      // Resolve those seams against realized siblings before releasing the old
      // footprint, then require the new rectangle to own enough shared boundary
      // for the partition authority's door + two minimum wall returns.
      const flowNeighborTemplates = new Set();
      for (const flow of programArchitecture?.flows ?? []) {
        const sequence = flow.sequence ?? [];
        for (let flowIndex = 0; flowIndex < sequence.length; flowIndex++) {
          if (sequence[flowIndex] !== space.templateKey && sequence[flowIndex] !== space.operationalRole) continue;
          if (flowIndex > 0) flowNeighborTemplates.add(sequence[flowIndex - 1]);
          if (flowIndex + 1 < sequence.length) flowNeighborTemplates.add(sequence[flowIndex + 1]);
        }
      }
      const boundaryBeforeReanchor = boundaryCandidates(grid);
      const flowNeighborSeams = spaces
        .filter(other => other.key !== space.key
          && flowNeighborTemplates.has(other.templateKey)
          && boundaryBeforeReanchor.has([space.key, other.key].sort().join('|')))
        .map(other => other.key);
      const ownershipBeforeReanchor = grid.cells.map(cell => cell.spaceId);
      const oldCells = [...assigned];
      for (const cell of oldCells) cell.spaceId = null;
      const requiredDoorBoundaryCells = Math.max(1, Math.ceil((minimumClearWidth + 2 * 0.22 - EPS) / Math.max(EPS, grid.cellSize)));
      const rescueSeedTarget = Math.max(1, minimumCellsByKey.get(space.key) ?? 1);
      const replacement = placeRectangleFirstSpace({
        space,
        spaces,
        target: rescueSeedTarget,
        parentKey: null,
        routeSpaceKey: minimumPlacement.cityTransferSpaceKey ?? null,
        requiredBoundaryKeys: flowNeighborSeams,
        requiredBoundaryCells: requiredDoorBoundaryCells,
        grid,
        profile,
        stableKey: `${stableKey}:floor:${floor}:capacity-reanchor`,
      });
      if (!replacement) {
        // A single-room move can be impossible even though a short operational
        // chain can be laid out coherently as a unit (entry -> control -> major
        // program -> service).  Retry as one bounded local transaction using
        // only unambiguous flow nodes.  Fixed entry/circulation nodes stay put;
        // movable nodes are released and re-seeded outward from those anchors.
        // This preserves concrete predecessor/successor seams without globally
        // changing placement order or teaching the allocator any program names.
        for (let cellIndex = 0; cellIndex < grid.cells.length; cellIndex++) grid.cells[cellIndex].spaceId = ownershipBeforeReanchor[cellIndex];
        const realizedByTemplate = new Map();
        for (const candidateSpace of spaces) {
          const templateKey = candidateSpace.templateKey ?? candidateSpace.operationalRole;
          const list = realizedByTemplate.get(templateKey) ?? [];
          list.push(candidateSpace);
          realizedByTemplate.set(templateKey, list);
        }
        const uniqueFlowEdges = [];
        for (const flow of programArchitecture?.flows ?? []) {
          const sequence = flow.sequence ?? [];
          for (let flowIndex = 0; flowIndex + 1 < sequence.length; flowIndex++) {
            const left = realizedByTemplate.get(sequence[flowIndex]) ?? [];
            const right = realizedByTemplate.get(sequence[flowIndex + 1]) ?? [];
            if (left.length !== 1 || right.length !== 1 || left[0].key === right[0].key) continue;
            const pair = [left[0].key, right[0].key].sort().join('|');
            if (!uniqueFlowEdges.some(edge => edge.pair === pair)) uniqueFlowEdges.push({ a: left[0].key, b: right[0].key, pair });
          }
        }
        const preRelayoutBoundaries = boundaryCandidates(grid);
        const protectedFlowEdges = uniqueFlowEdges.filter(edge => preRelayoutBoundaries.has(edge.pair));
        const flowAdjacency = new Map(spaces.map(candidateSpace => [candidateSpace.key, new Set()]));
        for (const edge of protectedFlowEdges) {
          flowAdjacency.get(edge.a)?.add(edge.b);
          flowAdjacency.get(edge.b)?.add(edge.a);
        }
        const componentKeys = new Set([space.key]);
        const componentQueue = [space.key];
        for (let queueIndex = 0; queueIndex < componentQueue.length; queueIndex++) {
          for (const neighborKey of flowAdjacency.get(componentQueue[queueIndex]) ?? []) {
            if (componentKeys.has(neighborKey)) continue;
            componentKeys.add(neighborKey);
            componentQueue.push(neighborKey);
          }
        }
        const componentSpaces = spaces.filter(candidateSpace => componentKeys.has(candidateSpace.key));
        const fixedKeys = new Set(componentSpaces
          .filter(candidateSpace => ['entry', 'circulation'].includes(candidateSpace.role)
            || candidateSpace.key === minimumPlacement.cityTransferSpaceKey)
          .map(candidateSpace => candidateSpace.key));
        // Keep already-realized threshold relays in place when they connect a
        // fixed route/entry anchor toward the rescued room.  The server control
        // room is the canonical shape of this case: it is undersized, but its
        // position is valuable because it already owns the entry seam.  Moving
        // it together with the rack field throws away useful topology for no
        // capacity gain.  Expand the fixed frontier only through existing real
        // boundaries and never absorb the room whose capacity triggered rescue.
        let fixedFrontierChanged = true;
        while (fixedFrontierChanged) {
          fixedFrontierChanged = false;
          for (const candidateSpace of componentSpaces) {
            if (candidateSpace.key === space.key || fixedKeys.has(candidateSpace.key)) continue;
            const touchesFixed = [...(flowAdjacency.get(candidateSpace.key) ?? [])].some(neighborKey =>
              fixedKeys.has(neighborKey)
              && preRelayoutBoundaries.has([candidateSpace.key, neighborKey].sort().join('|')));
            if (!touchesFixed) continue;
            fixedKeys.add(candidateSpace.key);
            fixedFrontierChanged = true;
          }
        }
        const movableSpaces = componentSpaces.filter(candidateSpace => !fixedKeys.has(candidateSpace.key));
        let flowRelayoutAccepted = movableSpaces.some(candidateSpace => candidateSpace.key === space.key) && componentSpaces.length > 1;
        let flowRelayoutFailure = flowRelayoutAccepted ? null : 'no-movable-flow-component';
        const relayoutBefore = grid.cells.map(cell => cell.spaceId);
        if (flowRelayoutAccepted) {
          const movableKeys = new Set(movableSpaces.map(candidateSpace => candidateSpace.key));
          for (const cell of grid.cells) if (movableKeys.has(cell.spaceId)) cell.spaceId = null;
          const placedKeys = new Set(fixedKeys);
          const pending = new Map(movableSpaces.map(candidateSpace => [candidateSpace.key, candidateSpace]));
          while (pending.size && flowRelayoutAccepted) {
            const ready = [...pending.values()].filter(candidateSpace => {
              const neighbors = [...(flowAdjacency.get(candidateSpace.key) ?? [])];
              return neighbors.some(neighborKey => placedKeys.has(neighborKey)) || (!placedKeys.size && candidateSpace.key === space.key);
            });
            if (!ready.length) { flowRelayoutAccepted = false; flowRelayoutFailure = 'no-ready-flow-node'; break; }
            ready.sort((a, b) => {
              const aRescue = a.key === space.key ? 0 : 1;
              const bRescue = b.key === space.key ? 0 : 1;
              // When a fixed anchor exists, topology order wins.  With no fixed
              // anchor, start from the room whose rescue triggered the relayout.
              if (!fixedKeys.size && aRescue !== bRescue) return aRescue - bRescue;
              const aPlaced = [...(flowAdjacency.get(a.key) ?? [])].filter(key => placedKeys.has(key)).length;
              const bPlaced = [...(flowAdjacency.get(b.key) ?? [])].filter(key => placedKeys.has(key)).length;
              return bPlaced - aPlaced || a.key.localeCompare(b.key);
            });
            const relayoutSpace = ready[0];
            const requiredPlacedNeighbors = [...(flowAdjacency.get(relayoutSpace.key) ?? [])].filter(key => placedKeys.has(key));
            const relayoutTarget = targets.get(relayoutSpace.key) ?? (minimumCellsByKey.get(relayoutSpace.key) ?? 1);
            const relayoutMinimum = Math.max(1, minimumCellsByKey.get(relayoutSpace.key) ?? 1);
            const relayoutSeedTarget = relayoutSpace.key === space.key
              ? (relayoutTarget <= 96 ? relayoutTarget : Math.max(relayoutMinimum, Math.min(144, Math.round(relayoutTarget * 0.35))))
              : relayoutMinimum;
            const relayoutRectangle = placeRectangleFirstSpace({
              space: relayoutSpace,
              spaces,
              target: relayoutSeedTarget,
              parentKey: null,
              routeSpaceKey: minimumPlacement.cityTransferSpaceKey ?? null,
              requiredBoundaryKeys: requiredPlacedNeighbors,
              requiredBoundaryCells: 1,
              grid,
              profile,
              stableKey: `${stableKey}:floor:${floor}:flow-component-relayout:${space.key}:${relayoutSpace.key}`,
            });
            if (!relayoutRectangle) { flowRelayoutAccepted = false; flowRelayoutFailure = `rectangle:${relayoutSpace.key}:needs:${requiredPlacedNeighbors.join(',')}`; break; }
            placedKeys.add(relayoutSpace.key);
            pending.delete(relayoutSpace.key);
          }
          if (flowRelayoutAccepted) {
            const relayoutBoundaries = boundaryCandidates(grid);
            flowRelayoutAccepted = protectedFlowEdges
              .filter(edge => componentKeys.has(edge.a) && componentKeys.has(edge.b))
              .every(edge => {
                const boundary = relayoutBoundaries.get(edge.pair);
                return !!boundary && boundary.length > 0;
              });
          }
        }
        if (!flowRelayoutAccepted && !flowRelayoutFailure) flowRelayoutFailure = 'post-layout-door-capacity';
        if (flowRelayoutAccepted) {
          geometryNotes.push({
            spaceKey: space.key,
            kind: 'capacity-flow-component-relayout',
            priorCellCount: oldCells.length,
            targetCellCount: target,
            componentKeys: [...componentKeys],
            fixedKeys: [...fixedKeys],
          });
          continue;
        }
        for (let cellIndex = 0; cellIndex < grid.cells.length; cellIndex++) grid.cells[cellIndex].spaceId = relayoutBefore[cellIndex];
        geometryNotes.push({
          spaceKey: space.key,
          kind: 'capacity-reanchor-rejected-flow-placement',
          priorCellCount: oldCells.length,
          targetCellCount: target,
          rescueSeedTarget,
          protectedFlowNeighbors: flowNeighborSeams,
          flowRelayoutFailure,
          flowRelayoutComponentKeys: [...componentKeys],
          flowRelayoutFixedKeys: [...fixedKeys],
          flowRelayoutEdges: protectedFlowEdges,
          flowRelayoutPreBoundaryPairs: [...preRelayoutBoundaries.keys()].filter(pair => componentKeys.has(pair.split('|')[0]) && componentKeys.has(pair.split('|')[1])),
        });
        continue;
      }
      const seamClaims = [];
      const rectangular = growExistingSpaceRectangular({
        space,
        target,
        grid,
        stableKey: `${stableKey}:floor:${floor}:capacity-reanchor-grow`,
        profile,
      });
      if (!space.rectangleStrict && (rectangular?.count ?? 0) < target) {
        growExistingSpace({
          space,
          target,
          grid,
          stableKey: `${stableKey}:floor:${floor}:capacity-reanchor-organic`,
          profile,
        });
      }
      const boundaryAfterReanchor = boundaryCandidates(grid);
      const preservesFlowSeams = flowNeighborSeams.every(neighborKey => {
        const pair = [space.key, neighborKey].sort().join('|');
        const boundary = boundaryAfterReanchor.get(pair);
        return !!boundary && boundaryPairDoorCapacity(boundary, grid, minimumClearWidth).capable;
      });
      if (!preservesFlowSeams) {
        for (let cellIndex = 0; cellIndex < grid.cells.length; cellIndex++) grid.cells[cellIndex].spaceId = ownershipBeforeReanchor[cellIndex];
        geometryNotes.push({
          spaceKey: space.key,
          kind: 'capacity-reanchor-rejected-flow-capacity',
          priorCellCount: oldCells.length,
          targetCellCount: target,
          protectedFlowNeighbors: flowNeighborSeams,
        });
        continue;
      }
      geometryNotes.push({
        spaceKey: space.key,
        kind: 'capacity-reanchor',
        priorCellCount: oldCells.length,
        replacementCellCount: grid.cells.filter(cell => cell.spaceId === space.key).length,
        targetCellCount: target,
        protectedFlowNeighbors: flowNeighborSeams,
        seamClaims,
      });
    }

    // Spend weighted surplus progressively by normalized deficit instead of
    // letting one large room run all the way to target before its siblings get
    // a turn.  Greedy completion can wrap a rack field/lab/office around still-
    // minimum support rooms and make their target area unreachable even though
    // the plate had enough capacity when growth began.  Small bounded turns keep
    // useful ownership fronts alive and also give repeated equal-target peers a
    // generic fairness objective without naming any program.
    const stalledSurplusKeys = new Set();
    const maxSurplusTurns = Math.max(grid.cells.length, spaces.length * 16);
    let surplusTurnCount = 0;
    for (; surplusTurnCount < maxSurplusTurns; surplusTurnCount++) {
      const candidates = spaces.filter(candidateSpace => {
        if (stalledSurplusKeys.has(candidateSpace.key)) return false;
        const target = targets.get(candidateSpace.key) ?? (minimumCellsByKey.get(candidateSpace.key) ?? 1);
        const current = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === candidateSpace.key ? 1 : 0), 0);
        return current + EPS < target;
      }).sort((a, b) => {
        const targetA = Math.max(1, targets.get(a.key) ?? 1);
        const targetB = Math.max(1, targets.get(b.key) ?? 1);
        const countA = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === a.key ? 1 : 0), 0);
        const countB = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === b.key ? 1 : 0), 0);
        const ratioA = countA / targetA;
        const ratioB = countB / targetB;
        if (Math.abs(ratioA - ratioB) > EPS) return ratioA - ratioB;
        const sameTemplate = a.templateKey === b.templateKey;
        if (sameTemplate && countA !== countB) return countA - countB;
        return (targetB - countB) - (targetA - countA) || a.key.localeCompare(b.key);
      });
      if (!candidates.length) break;
      const candidateSpace = candidates[0];
      const target = targets.get(candidateSpace.key) ?? (minimumCellsByKey.get(candidateSpace.key) ?? 1);
      const before = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === candidateSpace.key ? 1 : 0), 0);
      const turnTarget = Math.min(target, before + 1);
      const regular = growExistingSpaceRectangular({
        space: candidateSpace,
        target: turnTarget,
        grid,
        stableKey: `${stableKey}:floor:${floor}:balanced-rectangle-grow:${surplusTurnCount}`,
        profile,
      });
      let after = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === candidateSpace.key ? 1 : 0), 0);
      if (!candidateSpace.rectangleStrict && (regular === null || after < turnTarget)) {
        growExistingSpace({
          space: candidateSpace,
          target: turnTarget,
          grid,
          stableKey: `${stableKey}:floor:${floor}:balanced-grow:${surplusTurnCount}`,
          profile,
        });
        after = grid.cells.reduce((sum, cell) => sum + (cell.spaceId === candidateSpace.key ? 1 : 0), 0);
      }
      if (after <= before) {
        stalledSurplusKeys.add(candidateSpace.key);
        continue;
      }
      yield {
        phase: 'building-plan-floor-surplus-growth',
        floor,
        current: surplusTurnCount + 1,
        total: maxSurplusTurns,
        spaceKey: candidateSpace.key,
        normalizedTargetRatio: after / Math.max(1, target),
      };
    }
  }
  const leftoverClosure = assignLeftovers({ grid, spaces, profile, stableKey: `${stableKey}:floor:${floor}`, targets });
  const connectivityRepair = repairDisconnectedSpaceIslands({ grid, spaces, targets });
  if (connectivityRepair.repairedIslands) geometryNotes.push({ kind: 'disconnected-island-repair', ...connectivityRepair });
  const doorCapacityRepair = repairDoorCapableConnectivity({
    grid,
    spaces,
    rootKey: rootSpace.key,
    doorWidth: resolvedDoorWidth(physicalTruth),
    targets,
    minimumCellsByKey,
    stableKey: `${stableKey}:floor:${floor}:door-capacity`,
  });
  if (doorCapacityRepair.repaired) geometryNotes.push(...doorCapacityRepair.notes);
  if (!doorCapacityRepair.complete) geometryNotes.push({
    kind: 'door-capacity-connectivity-shortfall',
    reachableSpaceCount: doorCapacityRepair.reachableSpaceCount,
    realizedSpaceCount: spaces.length,
  });
  yield { phase: 'building-plan-floor-leftover-closure', floor, unclaimed: grid.cells.filter(cell => !cell.spaceId).length };

  const cellArea = grid.cellSize * grid.cellSize;
  const realizedSpaces = spaces.map(s => {
    const cells = grid.cells.filter(cell => cell.spaceId === s.key);
    const centroid = spaceCentroid(cells);
    const regularity = regularityMetricsForCells(cells);
    const realizedWidth = cells.length ? (Math.max(...cells.map(cell => cell.ix)) - Math.min(...cells.map(cell => cell.ix)) + 1) * grid.cellSize : 0;
    const realizedDepth = cells.length ? (Math.max(...cells.map(cell => cell.iz)) - Math.min(...cells.map(cell => cell.iz)) + 1) * grid.cellSize : 0;
    const realizedShortDimension = Math.min(realizedWidth, realizedDepth);
    const minimumShortDimension = minimumShortDimensionForDiagnostic(s);
    const circulationFrontage = circulationFrontageForSpace(
      s, cells, grid, minimumPlacement.cityTransferSpaceKey ?? null,
    );
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
      traversalPermission: s.traversalPermission ?? traversalPermissionForSpace(s),
      throughRoutingEligible: [
        TRAVERSAL_PERMISSION.PUBLIC_THROUGH,
        TRAVERSAL_PERMISSION.SEMI_PUBLIC_THROUGH,
        TRAVERSAL_PERMISSION.STAFF_THROUGH,
        TRAVERSAL_PERMISSION.SERVICE_THROUGH,
      ].includes(s.traversalPermission ?? traversalPermissionForSpace(s)),
      daylight: s.daylight,
      exteriorPreference: s.exteriorPreference,
      conventionalExteriorPreference: s.conventionalExteriorPreference,
      repeat: s.repeat ? { ...s.repeat } : null,
      circulationShape: s.circulationShape ?? null,
      corridorAxis: s.corridorAxis ?? null,
      hallwayOccupancyCount: Number(s.hallwayOccupancyCount) || 0,
      targetArea: (targets.get(s.key) ?? 0) * cellArea,
      minimumArea: minimumAreaForSpace(s, floorH),
      minimumVolume: minimumVolumeForSpace(s),
      minimumShortDimension,
      realizedWidth,
      realizedDepth,
      realizedShortDimension,
      shortDimensionHealthy: realizedShortDimension + EPS >= minimumShortDimension,
      realizedArea: cells.length * cellArea,
      realizedVolume: cells.length * cellArea * floorH,
      cellCount: cells.length,
      centroid,
      regions: compactSpaceCells(cells, grid.cellSize),
      regularity,
      connectedComponentCount: connectedComponentsForSpace(grid, s.key).length,
      circulationFrontage,
      frontagePriority: s.frontagePriority ?? 'neutral',
      operationalRole: s.operationalRole ?? s.templateKey,
      operationalFlowOrder: s.operationalFlowOrder == null ? null
        : (Number.isFinite(Number(s.operationalFlowOrder)) ? Number(s.operationalFlowOrder) : null),
      serviceSpine: s.serviceSpine === true,
      functionalFixture: s.functionalFixture ?? null,
      unitPlan: nestedDwellingUnitPlan(s, cells, grid, minimumPlacement.cityTransferSpaceKey
        ?? spaces.find(candidate => candidate.circulationShape === 'occupancy-hallway')?.key
        ?? spaces.find(candidate => candidate.role === 'circulation')?.key
        ?? null),
      facadePattern: s.facadePattern,
      structuralReservationIds: [...new Set(cells.map(c => c.structuralReservationId).filter(Boolean))],
      ...(s.key === minimumPlacement.cityTransferSpaceKey ? {
        circulationClass: 'interior',
        traversalPermission: 'PUBLIC_THROUGH',
        throughRoutingEligible: true,
        cityTransferSpine: true,
      } : {}),
    };
  }).filter(s => s.cellCount > 0);
  yield { phase: 'building-plan-floor-realized-spaces', floor, realizedSpaceCount: realizedSpaces.length };

  const minimumPlacementShortfallCells = spaces.reduce((sum, space) => {
    const assignedCount = grid.cells.filter(cell => cell.spaceId === space.key).length;
    return sum + Math.max(0, (minimumCellsByKey.get(space.key) ?? 1) - assignedCount);
  }, 0);
  const minimumProgramCells = spaces.reduce((sum, space) => sum + (minimumCellsByKey.get(space.key) ?? 1), 0);
  const minimumNonCirculationCells = spaces
    .filter(space => space.role !== 'circulation' && space.role !== 'entry')
    .reduce((sum, space) => sum + (minimumCellsByKey.get(space.key) ?? 1), 0);
  const nonReservedCapacityCells = grid.cells.filter(cell => !cell.structuralReservationId).length;
  const minimumProgramShortfallCells = Math.max(
    0,
    minimumProgramCells - grid.cells.length,
    minimumNonCirculationCells - nonReservedCapacityCells,
  );
  const realizedKeys = new Set(realizedSpaces.map(s => s.key));
  const desiredEdges = topology.edges.filter(edge => realizedKeys.has(edge.a) && realizedKeys.has(edge.b));
  const realizedTopology = realizeTopology({
    spaces: realizedSpaces,
    desiredEdges,
    grid,
    rootKey: rootSpace.key,
    stableKey: `${stableKey}:floor:${floor}`,
    doorWidth: resolvedDoorWidth(physicalTruth),
  });
  const realizedEdges = realizedTopology.edges;
  yield { phase: 'building-plan-floor-topology', floor, realizedEdgeCount: realizedEdges.length };
  const cityExchangeBindings = (minimumPlacement.cityExchangeBindings ?? []).map(binding => {
    const space = realizedSpaces.find(candidate => candidate.key === binding.spaceKey);
    if (!space) throw new Error(`building plan floor ${floor}: city exchange ${binding.endpointId ?? binding.anchorId} lost its transfer space`);
    return { ...binding, spaceId: space.id };
  });
  const openingPlan = openingsFromTopology({
    grid,
    spaces: realizedSpaces,
    edges: realizedEdges,
    rootKey: rootSpace.key,
    accessAnchors,
    cityExchangeBindings,
    physicalTruth,
    stableKey,
    floor,
    baseFloor,
  });
  yield { phase: 'building-plan-floor-openings', floor, openingCount: openingPlan.openings.length, unresolved: openingPlan.unresolved.length };
  const reachable = realizedTopology.reachable;
  const unclaimedCells = grid.cells.filter(cell => !cell.spaceId);
  const occupancyHallway = realizedSpaces.find(space => space.circulationShape === 'occupancy-hallway') ?? null;
  const hallwayOccupancies = realizedSpaces.filter(space => space.repeat && ['private', 'program', 'work'].includes(space.role));
  const hallwayNeighborKeys = new Set();
  if (occupancyHallway) {
    for (const edge of realizedEdges) {
      if (edge.a === occupancyHallway.key) hallwayNeighborKeys.add(edge.b);
      else if (edge.b === occupancyHallway.key) hallwayNeighborKeys.add(edge.a);
    }
  }
  const directlyHallwayServedOccupancies = hallwayOccupancies.filter(space => hallwayNeighborKeys.has(space.key));

  return {
    floor,
    globalFloor: floor,
    yBase: floor * floorH,
    floorHeight: floorH,
    activeModuleKeys: grid.activeModules.map(module => module.key),
    plannedModuleKeys: grid.plannedModules.map(module => module.key),
    circulationDeferredModuleKeys: grid.deferredModules.map(module => module.key),
    approximateArea: area,
    rasterCellSize: grid.cellSize,
    partitionOwnership: {
      schema: 'jweb.floor-space-ownership.v1',
      cellSize: grid.cellSize,
      cells: grid.cells.filter(cell => cell.spaceId).map(cell => ({
        ix: cell.ix,
        iz: cell.iz,
        spaceKey: cell.spaceId,
      })),
    },
    minimumClearWidth,
    rootSpaceKey: rootSpace.key,
    spaces: realizedSpaces,
    desiredEdges,
    edges: realizedEdges,
    openings: openingPlan.openings,
    cityExchangeBindings,
    cityTransferRoutes: minimumPlacement.cityTransferRoutes ?? [],
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
      droppedSpaceKeysForPhysicalArea: [...programFit.droppedSpaceKeys, ...geometryDroppedSpaceKeys],
      droppedSpaceKeysForMinimumGeometry: geometryDroppedSpaceKeys,
      minimumProgramCells,
      minimumNonCirculationCells,
      programCapacityCells: grid.cells.length,
      nonReservedCapacityCells,
      minimumProgramShortfallCells,
      minimumPlacementShortfallCells,
      minimumPlacementAttempts,
      minimumAreaHealthy: minimumPlacementShortfallCells === 0
        && realizedSpaces.every(space => space.realizedArea + EPS >= space.minimumArea),
      minimumVolumeHealthy: minimumPlacementShortfallCells === 0
        && realizedSpaces.every(space => space.realizedVolume + EPS >= space.minimumVolume),
      stairCirculationApronCellCount: grid.cells.filter(cell => cell.structuralReservationKind === 'stair-circulation-apron').length,
      structuralReservationCellCount: grid.cells.filter(cell => cell.structuralReservationId).length,
      floorModuleComponentCount: grid.floorComponentCount,
      circulationDeferredModuleCount: grid.deferredModules.length,
      circulationDeferredModuleKeys: grid.deferredModules.map(module => module.key),
      minimumClearWidth,
      circulationWidthHealthy: realizedSpaces
        .filter(space => space.role === 'circulation' || space.role === 'entry')
        .every(space => space.regions.some(region => Math.min(region.halfX * 2, region.halfZ * 2) + EPS >= minimumClearWidth)),
      cityExchangeBindingCount: cityExchangeBindings.length,
      cityTransferRouteCount: minimumPlacement.cityTransferRoutes?.length ?? 0,
      cityTransferSpineCellCount: minimumPlacement.cityTransferRoutes
        ? new Set(minimumPlacement.cityTransferRoutes.flatMap(route => route.cellKeys ?? [])).size : 0,
      occupancyHallway: occupancyHallway ? {
        spaceKey: occupancyHallway.key,
        axis: occupancyHallway.corridorAxis,
        occupancyCount: hallwayOccupancies.length,
        directlyServedOccupancyCount: directlyHallwayServedOccupancies.length,
      } : null,
      rectangleFirstPreferred: rectangleFirstPreferred(profile),
      rectangleFirstSpaceCount: spaces.filter(space => space.rectangleFirst).length,
      strictRectangleSpaceCount: spaces.filter(space => space.rectangleStrict).length,
      crampedDestinationSpaceCount: realizedSpaces
        .filter(space => !['circulation', 'entry'].includes(space.role) && !space.shortDimensionHealthy)
        .length,
      adaptableUnsubdividedDwellingCount: realizedSpaces
        .filter(space => space.templateKey === 'dwelling-unit' && !space.unitPlan)
        .length,
      subdividedDwellingCount: realizedSpaces
        .filter(space => space.templateKey === 'dwelling-unit' && space.unitPlan)
        .length,
      privateNeckCellCount: realizedSpaces
        .filter(space => space.role === 'private')
        .reduce((sum, space) => sum + (space.regularity?.neckCellCount ?? 0), 0),
      privateRectangularSpaceCount: realizedSpaces
        .filter(space => space.role === 'private' && (space.regularity?.rectangularity ?? 0) >= 0.999)
        .length,
      circulationFrontageSpaceCount: realizedSpaces.filter(space => space.circulationFrontage?.eligible).length,
      regularSurplusClaimCount: leftoverClosure.regularSurplusClaims ?? 0,
      residualComponentSeedCount: leftoverClosure.residualComponentSeeds ?? 0,
    },
  };
}


function planFloor({
  floor, baseFloor = 0, modules, floorH, reservations, accessAnchors, grammar, profile, authoredIntent,
  semanticProgram, programArchitecture = null, physicalTruth, stableKey,
}) {
  const iterator = planFloorSteps({
    floor, baseFloor, modules, floorH, reservations, accessAnchors, grammar, profile, authoredIntent,
    semanticProgram, programArchitecture, physicalTruth, stableKey,
  });
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

function verticalEdgesForFloors(floors, stableKey, profile) {
  const result = [];
  for (let i = 0; i + 1 < floors.length; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];
    if (upper.floor !== lower.floor + 1) continue;
    const lowerCore = lower.spaces.find(s => s.role === 'circulation') ?? lower.spaces.find(s => s.role === 'entry');
    const upperCore = upper.spaces.find(s => s.role === 'circulation') ?? upper.spaces.find(s => s.role === 'service');
    if (!lowerCore || !upperCore) continue;
    result.push({
      id: `${stableKey}:vertical:${lower.floor}-${upper.floor}`,
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

function programArchitectureEvidenceForFloors(floors, programArchitecture) {
  if (!programArchitecture) return {
    schema: 'jweb.program-architecture-evidence.v1',
    specific: false,
    flowTransitions: [],
    directTransitionRatio: 1,
    flowHealthy: true,
    serviceSpineSpaceCount: 0,
    routeFrontageSpaceCount: 0,
    nestedDwellingUnitCount: 0,
  };
  const transitions = [];
  const matches = (space, key) => space?.templateKey === key || space?.operationalRole === key || space?.key === key;
  for (const flow of programArchitecture.flows ?? []) {
    for (let index = 0; index < flow.sequence.length - 1; index++) {
      const fromKey = flow.sequence[index];
      const toKey = flow.sequence[index + 1];
      const candidates = [];
      for (const floor of floors) {
        const fromSpaces = (floor.spaces ?? []).filter(space => matches(space, fromKey));
        const toSpaces = (floor.spaces ?? []).filter(space => matches(space, toKey));
        if (!fromSpaces.length || !toSpaces.length) continue;
        const direct = (floor.edges ?? []).some(edge => fromSpaces.some(space => edge.a === space.key || edge.b === space.key)
          && toSpaces.some(space => edge.a === space.key || edge.b === space.key));
        candidates.push({ floor: floor.floor, direct, fromSpaceKeys: fromSpaces.map(space => space.key), toSpaceKeys: toSpaces.map(space => space.key) });
      }
      const best = candidates.sort((a, b) => Number(b.direct) - Number(a.direct) || a.floor - b.floor)[0] ?? null;
      transitions.push({
        flowId: flow.id,
        routeClass: flow.routeClass,
        permission: flow.permission,
        from: fromKey,
        to: toKey,
        applicable: !!best,
        direct: !!best?.direct,
        floor: best?.floor ?? null,
        fromSpaceKeys: best?.fromSpaceKeys ?? [],
        toSpaceKeys: best?.toSpaceKeys ?? [],
      });
    }
  }
  const applicable = transitions.filter(item => item.applicable);
  const direct = applicable.filter(item => item.direct).length;
  const directTransitionRatio = applicable.length ? direct / applicable.length : 1;
  const allSpaces = floors.flatMap(floor => floor.spaces ?? []);
  const routeFrontageSpaces = allSpaces.filter(space => space.circulationFrontage?.eligible);
  return {
    schema: 'jweb.program-architecture-evidence.v1',
    specific: true,
    programArchitectureId: programArchitecture.id,
    flowTransitions: transitions,
    directTransitionRatio,
    flowHealthy: applicable.length === 0 || directTransitionRatio >= 0.75,
    serviceSpineSpaceCount: allSpaces.filter(space => space.serviceSpine).length,
    routeFrontageSpaceCount: routeFrontageSpaces.length,
    requiredRouteFrontageSpaceCount: routeFrontageSpaces.filter(space => space.frontagePriority === 'required').length,
    nestedDwellingUnitCount: allSpaces.filter(space => space.unitPlan?.roomCount >= 3).length,
    identityFixtures: [...new Set(allSpaces.map(space => space.functionalFixture).filter(Boolean))].sort(),
  };
}

function planSignature({ signatureType, authoredIntent }) {
  if (!signatureType) return null;
  return {
    signatureType,
    authoredIntentApplied: !!authoredIntent,
    accuracyNote: authoredIntent?.accuracyNote ?? null,
  };
}

export function* planBuildingSidecarSteps({
  worldSeed = 0,
  chunkKey = '0,0',
  chunkX = 0,
  chunkZ = 0,
  distanceChunks = Math.hypot(Number(chunkX) || 0, Number(chunkZ) || 0),
  weirdnessSampled = 0,
  isSpawn = false,
  entityId = 'building',
  signatureType = null,
  programHint = null,
  buildingSpecies = null,
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
  const programArchitecture = programArchitectureFor(semanticProgram);
  const stableKey = buildingSemanticTruth.stableKey;
  const profile = architecturalFieldProfile({ distanceChunks, weirdnessSampled, isSpawn });
  const grammar = chooseGrammar({ stableKey, family, programHint: semanticProgram, authoredIntent, buildingSpecies });
  const floorH = clamp(floorHeight ?? physicalTruth?.floorHeight?.realizedSI ?? 3.15, 2.4, 5.8);
  const anchors = normalizeAccessAnchors(accessAnchors);
  const reservations = normalizeReservations(circulationReservations);
  const minGlobalFloor = Math.min(...normalized.map(module => module.floorBase));
  const maxGlobalFloorExclusive = Math.max(...normalized.map(module => module.floorTop));
  const floors = [];
  for (let floor = minGlobalFloor; floor < maxGlobalFloorExclusive; floor++) {
    const planned = yield* planFloorSteps({
      floor,
      baseFloor: minGlobalFloor,
      modules: normalized,
      floorH,
      reservations,
      accessAnchors: anchors,
      grammar,
      profile,
      authoredIntent,
      semanticProgram,
      programArchitecture,
      physicalTruth,
      stableKey,
    });
    if (planned) floors.push(planned);
    yield {
      phase: 'building-plan-floor',
      current: floor - minGlobalFloor + 1,
      total: maxGlobalFloorExclusive - minGlobalFloor,
      floor,
      planned: !!planned,
    };
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
  const humanScaleHealthy = floors.every(f => f.diagnostics.minimumAreaHealthy
    && f.diagnostics.minimumVolumeHealthy
    && (f.diagnostics.minimumProgramShortfallCells ?? 0) === 0);
  const droppedSpacesForPhysicalArea = floors.reduce((sum, f) => sum + (f.diagnostics.droppedSpaceKeysForPhysicalArea?.length ?? 0), 0);
  const circulationDeferredModuleBands = floors.reduce((sum, f) => sum + (f.diagnostics.circulationDeferredModuleCount ?? 0), 0);
  const cityExchangeBindingCount = floors.reduce((sum, f) => sum + (f.cityExchangeBindings?.length ?? 0), 0);
  const cityTransferRouteCount = floors.reduce((sum, f) => sum + (f.cityTransferRoutes?.length ?? 0), 0);
  const programArchitectureEvidence = programArchitectureEvidenceForFloors(floors, programArchitecture);

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
      source: programArchitecture ? 'program-morphology-selection' : 'building-semantic-truth',
      buildingSemanticTruthId: buildingSemanticTruth.id,
      programDecision: buildingSemanticTruth.programDecision,
      physicalUseFamily: family,
      semanticProgram,
      buildingSpecies: buildingSpecies ?? null,
      notes: grammar.notes,
    },
    programArchitecture: programArchitecture ? {
      schema: programArchitecture.schema,
      id: programArchitecture.id,
      morphologies: [...programArchitecture.morphologies],
      serviceCharacter: programArchitecture.serviceCharacter,
      serviceSpineKeys: [...programArchitecture.serviceSpineKeys],
      frontageKeys: [...programArchitecture.frontageKeys],
      identityFixtures: [...programArchitecture.identityFixtures],
      flows: programArchitecture.flows.map(flow => ({
        id: flow.id,
        sequence: [...flow.sequence],
        routeClass: flow.routeClass,
        permission: flow.permission,
        mustRemainDistinctFrom: [...flow.mustRemainDistinctFrom],
      })),
      notes: programArchitecture.notes,
    } : buildingSemanticTruth.programArchitecture,
    programArchitectureEvidence,
    envelope: {
      moduleCount: normalized.length,
      floorCount: floors.length,
      buildingSpecies: buildingSpecies ?? null,
      minGlobalFloor,
      maxGlobalFloorExclusive,
      modules: normalized,
      authority: 'existing-kowloon-envelope',
      verticalAuthority: 'global-floor-bands',
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
      humanScaleHealthy,
      droppedSpacesForPhysicalArea,
      circulationDeferredModuleBands,
      cityExchangeBindingCount,
      cityTransferRouteCount,
      programFlowHealthy: programArchitectureEvidence.flowHealthy,
      programDirectTransitionRatio: programArchitectureEvidence.directTransitionRatio,
      programServiceSpineSpaceCount: programArchitectureEvidence.serviceSpineSpaceCount,
      programRouteFrontageSpaceCount: programArchitectureEvidence.routeFrontageSpaceCount,
      nestedDwellingUnitCount: programArchitectureEvidence.nestedDwellingUnitCount,
      readyForFabricEmission: topologyHealthy && unclaimedCells === 0 && humanScaleHealthy,
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

export function planBuildingSidecar(options = {}) {
  const iterator = planBuildingSidecarSteps(options);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
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
