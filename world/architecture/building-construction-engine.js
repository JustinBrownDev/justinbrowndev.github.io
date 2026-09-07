import { applyArchitectureMaterialHandwriting } from './material-handwriting.js';

// BUILDING CONSTRUCTION ENGINE
//
// The Building Plan already owns rooms, circulation, permissions and semantic use.
// This engine turns that truth into a restrained, deterministic construction
// language: structural bay rhythm, facade depth, service expression, thresholds
// and roof-edge silhouette. It deliberately does NOT create circulation, doors,
// floor plates or collision. Those remain owned by Building Plan / shell / route
// authorities. Every emitted part hugs the exterior skin so a semantic identity
// can become visible without inventing a second traversable building.

export const BUILDING_CONSTRUCTION_ENGINE_SCHEMA = 'jweb.building-construction-engine.v1';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function hash32(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

const RECIPE = Object.freeze({
  'domestic-access-stack': Object.freeze({
    structuralSystem: 'load-bearing-infill-with-concrete-bands',
    budgetClass: 'economy-standard', throughputClass: 'resident-daily',
    bayTarget: 2.75, bayMin: 2.2, bayMax: 3.5, maxBays: 7,
    pier: 0.18, band: 0.12, depth: 0.15, structureMaterial: 'concrete',
    detailStride: 1, serviceIntensity: 0.28, roofEdge: 'domestic-service-crown',
    flavors: ['incremental-masonry-walkup', 'postwar-concrete-infill', 'painted-tenement-frame'],
    allowedBehaviors: { mezzanine: false, interiorClutter: 'domestic-sparse', rooftopMechanical: 'small-service', crown: 'rare' },
  }),
  'market-frontage-frame': Object.freeze({
    structuralSystem: 'masonry-party-wall-with-shopfront-frame',
    budgetClass: 'economy-variable', throughputClass: 'high-public-turnover',
    bayTarget: 3.05, bayMin: 2.4, bayMax: 4.0, maxBays: 7,
    pier: 0.16, band: 0.11, depth: 0.18, structureMaterial: 'metal',
    detailStride: 1, serviceIntensity: 0.38, roofEdge: 'sign-and-service-band',
    flavors: ['shopfront-masonry', 'steel-awning-infill', 'arcade-retrofit'],
    allowedBehaviors: { mezzanine: 'selective', interiorClutter: 'retail-display', rooftopMechanical: 'small-service', crown: 'signage-only' },
  }),
  'food-service-exhaust-frame': Object.freeze({
    structuralSystem: 'masonry-shop-with-heavy-back-service',
    budgetClass: 'economy-standard', throughputClass: 'high-public-plus-service',
    bayTarget: 3.0, bayMin: 2.35, bayMax: 3.9, maxBays: 7,
    pier: 0.17, band: 0.11, depth: 0.19, structureMaterial: 'metal',
    detailStride: 1, serviceIntensity: 0.82, roofEdge: 'exhaust-service-crown',
    flavors: ['corner-cafe-frame', 'stainless-backhouse-retrofit', 'masonry-diner-service'],
    allowedBehaviors: { mezzanine: false, interiorClutter: 'dining-and-counter', rooftopMechanical: 'exhaust-heavy', crown: 'service-only' },
  }),
  'workshop-service-frame': Object.freeze({
    structuralSystem: 'steel-or-masonry-workshop-frame',
    budgetClass: 'economy-industrial', throughputClass: 'customer-plus-work-bay',
    bayTarget: 3.65, bayMin: 2.8, bayMax: 4.8, maxBays: 6,
    pier: 0.20, band: 0.13, depth: 0.22, structureMaterial: 'metal',
    detailStride: 1, serviceIntensity: 0.72, roofEdge: 'workshop-service-rail',
    flavors: ['masonry-repair-shop', 'light-steel-workshop', 'incremental-service-frame'],
    allowedBehaviors: { mezzanine: 'work-bay-only', interiorClutter: 'workshop-equipment', rooftopMechanical: 'service-moderate', crown: 'none' },
  }),
  'industrial-bay-megastructure': Object.freeze({
    structuralSystem: 'wide-bay-reinforced-frame',
    budgetClass: 'heavy-duty', throughputClass: 'vehicle-and-response',
    bayTarget: 4.6, bayMin: 3.4, bayMax: 6.2, maxBays: 5,
    pier: 0.34, band: 0.20, depth: 0.28, structureMaterial: 'concrete',
    detailStride: 1, serviceIntensity: 0.66, roofEdge: 'industrial-parapet-frame',
    flavors: ['concrete-apparatus-frame', 'steel-clear-span-retrofit', 'heavy-service-bay'],
    allowedBehaviors: { mezzanine: 'service-edge-only', interiorClutter: 'operational-equipment', rooftopMechanical: 'service-moderate', crown: 'none' },
  }),
  'civic-core-frame': Object.freeze({
    structuralSystem: 'reinforced-concrete-column-grid',
    budgetClass: 'institutional', throughputClass: 'public-controlled',
    bayTarget: 3.6, bayMin: 2.9, bayMax: 4.5, maxBays: 7,
    pier: 0.30, band: 0.18, depth: 0.23, structureMaterial: 'concrete',
    detailStride: 1, serviceIntensity: 0.42, roofEdge: 'institutional-cornice-band',
    flavors: ['postwar-civic-grid', 'heavy-institutional-frame', 'formal-concrete-infill'],
    allowedBehaviors: { mezzanine: 'public-hall-only', interiorClutter: 'institutional-sparse', rooftopMechanical: 'screened', crown: 'formal-rare' },
  }),
  'secure-institutional-frame': Object.freeze({
    structuralSystem: 'reinforced-secure-envelope',
    budgetClass: 'institutional-secure', throughputClass: 'controlled-low-public',
    bayTarget: 3.3, bayMin: 2.6, bayMax: 4.0, maxBays: 6,
    pier: 0.36, band: 0.22, depth: 0.25, structureMaterial: 'concrete',
    detailStride: 2, serviceIntensity: 0.48, roofEdge: 'secure-parapet-band',
    flavors: ['controlled-concrete-grid', 'fortified-service-infill', 'secure-masonry-frame'],
    allowedBehaviors: { mezzanine: false, interiorClutter: 'secure-sparse', rooftopMechanical: 'screened', crown: 'none' },
  }),
  'laboratory-utility-frame': Object.freeze({
    structuralSystem: 'regular-lab-frame-with-service-risers',
    budgetClass: 'technical', throughputClass: 'staff-and-service',
    bayTarget: 3.25, bayMin: 2.65, bayMax: 4.0, maxBays: 7,
    pier: 0.19, band: 0.14, depth: 0.22, structureMaterial: 'metal',
    detailStride: 1, serviceIntensity: 0.92, roofEdge: 'technical-service-screen',
    flavors: ['technical-panel-frame', 'utility-rack-laboratory', 'clean-service-retrofit'],
    allowedBehaviors: { mezzanine: 'technical-only', interiorClutter: 'lab-equipment', rooftopMechanical: 'heavy-screened', crown: 'service-only' },
  }),
  'warehouse-loading-frame': Object.freeze({
    structuralSystem: 'wide-bay-steel-or-tilt-up-frame',
    budgetClass: 'industrial-economy', throughputClass: 'freight-high-throughput',
    bayTarget: 5.1, bayMin: 3.8, bayMax: 6.8, maxBays: 5,
    pier: 0.27, band: 0.17, depth: 0.25, structureMaterial: 'concrete',
    detailStride: 2, serviceIntensity: 0.56, roofEdge: 'warehouse-eave-band',
    flavors: ['tilt-up-loading-bay', 'brick-loading-house', 'steel-shed-infill'],
    allowedBehaviors: { mezzanine: 'pick-pack-only', interiorClutter: 'rack-and-staging', rooftopMechanical: 'minimal', crown: 'none' },
  }),
  'data-utility-megastructure': Object.freeze({
    structuralSystem: 'heavy-technical-envelope-with-external-services',
    budgetClass: 'technical-heavy', throughputClass: 'low-public-high-service',
    bayTarget: 3.75, bayMin: 2.9, bayMax: 4.9, maxBays: 6,
    pier: 0.25, band: 0.17, depth: 0.27, structureMaterial: 'metal',
    detailStride: 1, serviceIntensity: 1.0, roofEdge: 'dense-cooling-service-screen',
    flavors: ['service-megastructure', 'screened-utility-block', 'dense-cooling-frame'],
    allowedBehaviors: { mezzanine: 'service-only', interiorClutter: 'technical-racks', rooftopMechanical: 'very-heavy-screened', crown: 'service-only' },
  }),
});

const GENERIC_RECIPE = Object.freeze({
  structuralSystem: 'ordinary-mixed-frame',
  budgetClass: 'unknown-standard', throughputClass: 'ordinary',
  bayTarget: 3.35, bayMin: 2.6, bayMax: 4.5, maxBays: 6,
  pier: 0.18, band: 0.12, depth: 0.18, structureMaterial: 'concrete',
  detailStride: 2, serviceIntensity: 0.35, roofEdge: 'ordinary-parapet-band',
  flavors: ['ordinary-masonry-frame', 'ordinary-concrete-infill', 'ordinary-service-retrofit'],
  allowedBehaviors: { mezzanine: 'rare', interiorClutter: 'sparse', rooftopMechanical: 'small-service', crown: 'rare' },
});

function recipeForFamily(family) { return RECIPE[String(family)] ?? GENERIC_RECIPE; }

function moduleFloorBase(module) { return Math.max(0, Math.floor(finite(module?.floorBase, 0))); }
function moduleFloorTop(module) {
  return Number.isFinite(Number(module?.floorTop))
    ? Math.max(moduleFloorBase(module) + 1, Math.floor(Number(module.floorTop)))
    : moduleFloorBase(module) + Math.max(1, Math.floor(finite(module?.floors, 1)));
}
function moduleActiveOnFloor(module, floor) { return floor >= moduleFloorBase(module) && floor < moduleFloorTop(module); }
function overlap(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }

function face(module, side) {
  if (!module) return null;
  const cx = finite(module.cx, NaN), cz = finite(module.cz, NaN);
  const hx = finite(module.halfX, NaN), hz = finite(module.halfZ, NaN);
  if (![cx, cz, hx, hz].every(Number.isFinite)) return null;
  if (side === 'north') return { side, tangentAxis: 'x', normalAxis: 'z', tangentCenter: cx, tangentHalf: hx, faceCoord: cz - hz, outward: -1 };
  if (side === 'south') return { side, tangentAxis: 'x', normalAxis: 'z', tangentCenter: cx, tangentHalf: hx, faceCoord: cz + hz, outward: 1 };
  if (side === 'west') return { side, tangentAxis: 'z', normalAxis: 'x', tangentCenter: cz, tangentHalf: hz, faceCoord: cx - hx, outward: -1 };
  if (side === 'east') return { side, tangentAxis: 'z', normalAxis: 'x', tangentCenter: cz, tangentHalf: hz, faceCoord: cx + hx, outward: 1 };
  return null;
}


function edgeKindForSide(module, side) {
  const edgeKinds = module?.edgeKinds ?? {};
  const key = side === 'north' ? 'N' : side === 'south' ? 'S' : side === 'west' ? 'W' : side === 'east' ? 'E' : null;
  return key ? edgeKinds[key] ?? edgeKinds[side] ?? null : null;
}

function adjacentModuleCoversFace(module, side, floor, modules) {
  const f = face(module, side);
  if (!f) return false;
  const epsilon = 0.08;
  for (const other of modules) {
    if (other === module || !moduleActiveOnFloor(other, floor)) continue;
    if (side === 'north' || side === 'south') {
      const otherEdge = finite(other.cz) + (side === 'north' ? finite(other.halfZ) : -finite(other.halfZ));
      if (Math.abs(otherEdge - f.faceCoord) > epsilon) continue;
      const tangentOverlap = overlap(f.tangentCenter - f.tangentHalf, f.tangentCenter + f.tangentHalf,
        finite(other.cx) - finite(other.halfX), finite(other.cx) + finite(other.halfX));
      if (tangentOverlap > Math.min(0.35, f.tangentHalf * 0.5)) return true;
    } else {
      const otherEdge = finite(other.cx) + (side === 'west' ? finite(other.halfX) : -finite(other.halfX));
      if (Math.abs(otherEdge - f.faceCoord) > epsilon) continue;
      const tangentOverlap = overlap(f.tangentCenter - f.tangentHalf, f.tangentCenter + f.tangentHalf,
        finite(other.cz) - finite(other.halfZ), finite(other.cz) + finite(other.halfZ));
      if (tangentOverlap > Math.min(0.35, f.tangentHalf * 0.5)) return true;
    }
  }
  return false;
}

function exposedFloorRuns(module, side, modules) {
  const floors = [];
  for (let floor = moduleFloorBase(module); floor < moduleFloorTop(module); floor++) {
    if (!adjacentModuleCoversFace(module, side, floor, modules)) floors.push(floor);
  }
  if (!floors.length) return [];
  const runs = [];
  let start = floors[0], previous = floors[0];
  for (let i = 1; i < floors.length; i++) {
    if (floors[i] === previous + 1) previous = floors[i];
    else { runs.push({ start, endExclusive: previous + 1 }); start = previous = floors[i]; }
  }
  runs.push({ start, endExclusive: previous + 1 });
  return runs;
}

function distanceToFace(region, f) {
  if (f.side === 'north') return Math.abs(f.faceCoord - finite(region.minZ, f.faceCoord));
  if (f.side === 'south') return Math.abs(f.faceCoord - finite(region.maxZ, f.faceCoord));
  if (f.side === 'west') return Math.abs(f.faceCoord - finite(region.minX, f.faceCoord));
  return Math.abs(f.faceCoord - finite(region.maxX, f.faceCoord));
}

function semanticSpaceForFaceFloor(buildingPlan, module, f, globalFloor) {
  const key = String(module.key);
  const candidates = (buildingPlan?.topologySpaces ?? []).filter(space => Number(space.floor) === globalFloor
    && ((space.moduleKeys ?? []).map(String).includes(key) || String(space.moduleKey ?? '') === key));
  if (!candidates.length) return null;
  const rank = space => {
    const nearest = Math.min(...(space.regions ?? []).map(region => distanceToFace(region, f)), Infinity);
    const frontage = space.frontagePriority === 'required' ? -1.0 : space.frontagePriority === 'preferred' ? -0.55 : 0;
    const daylight = space.daylight === 'high' ? -0.18 : 0;
    const role = space.role === 'public' ? -0.22 : space.role === 'entry' ? -0.20 : space.role === 'private' ? -0.10 : space.serviceSpine ? 0.06 : 0;
    return nearest + frontage + daylight + role;
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function pushFaceBox(target, f, tangent, y, normalOffset, tangentSize, sy, normalSize, metadata) {
  const normal = f.faceCoord + f.outward * normalOffset;
  if (f.tangentAxis === 'x') target.push({ x: tangent, y, z: normal, sx: tangentSize, sy, sz: normalSize, ...metadata });
  else target.push({ x: normal, y, z: tangent, sx: normalSize, sy, sz: tangentSize, ...metadata });
}

function roleLanguage(space) {
  const role = String(space?.role ?? 'unknown');
  const pattern = String(space?.facadePattern ?? 'ordinary');
  const fixture = String(space?.functionalFixture ?? '');
  if (/apparatus|loading-dock|shipping-dock/.test(fixture) || /industrial/.test(pattern)) return 'large-operational-bay';
  if (/power-cooling|utility-riser|major-plant|hot-cold/.test(fixture)) return 'technical-service';
  if (/cook-line|service-counter/.test(fixture)) return 'public-service-threshold';
  if (/domestic|lodging/.test(pattern) || role === 'private') return 'domestic-cellular';
  if (space?.serviceSpine || role === 'service' || role === 'storage') return 'service-opaque';
  if (role === 'public' || role === 'entry' || space?.frontagePriority === 'required') return 'public-open';
  if (role === 'work' || role === 'program') return 'work-regular';
  return 'ordinary';
}

function flavorFor({ stableKey, recipe, buildingPlan, architectureFamily }) {
  const truth = buildingPlan?.buildingSemanticTruth;
  const blockRole = String(truth?.exteriorTendencies?.blockRole ?? 'ordinary');
  const style = (truth?.exteriorTendencies?.compositionStyles ?? []).join('|');
  const seed = hash32(`${stableKey}:${architectureFamily}:${blockRole}:${style}`);
  const offset = blockRole === 'anchor' || blockRole === 'secondary-landmark' ? 1 : blockRole === 'service-edge' ? 2 : 0;
  return recipe.flavors[(seed + offset) % recipe.flavors.length];
}

function bayCountFor(length, recipe, stableKey, faceKey) {
  const jitter = 0.90 + unit(hash32(`${stableKey}:${faceKey}:bay-jitter`), 5) * 0.20;
  const target = clamp(recipe.bayTarget * jitter, recipe.bayMin, recipe.bayMax);
  return Math.max(1, Math.min(recipe.maxBays, Math.round(length / target)));
}

function semanticDetail({ metal, concrete, features, recipe, f, space, floorH, globalFloor, bayWidth, bayCount, metadata, stableKey }) {
  const language = roleLanguage(space);
  const baseY = globalFloor * floorH;
  const floorTop = baseY + floorH;
  const normalOffset = recipe.depth + 0.025;
  const tangentStart = f.tangentCenter - f.tangentHalf;
  const hash = hash32(`${stableKey}:${metadata.moduleKey}:${f.side}:${globalFloor}:${space?.id ?? 'none'}`);
  const structure = recipe.structureMaterial === 'metal' ? metal : concrete;
  const secondary = recipe.structureMaterial === 'metal' ? concrete : metal;
  const common = { ...metadata, semanticSpaceId: space?.id ?? null, semanticRole: space?.role ?? null, facadeLanguage: language };

  if (language === 'domestic-cellular') {
    // Shallow sill / lintel rhythm reads as repeated domestic occupancy without
    // creating fake balconies or walkable exterior decks.
    const count = Math.max(1, Math.min(3, bayCount));
    for (let i = 0; i < count; i++) {
      if ((i + (hash & 1)) % 2 !== 0 && bayCount > 2) continue;
      const t = tangentStart + bayWidth * (i + 0.5);
      pushFaceBox(secondary, f, t, baseY + floorH * 0.38, normalOffset, Math.min(bayWidth * 0.72, 1.55), 0.09, 0.22, { ...common, architectureRole: 'domestic-sill-band' });
    }
    features.push('domestic-weather-band');
  } else if (language === 'public-open') {
    pushFaceBox(secondary, f, f.tangentCenter, baseY + floorH * 0.79, normalOffset + 0.18,
      Math.max(2.4, f.tangentHalf * 1.35), 0.13, Math.min(1.25, 0.62 + bayWidth * 0.15),
      { ...common, architectureRole: 'public-threshold-canopy', junctionYield: true });
    features.push(space?.circulationFrontage?.eligible ? 'route-frontage-canopy' : 'public-threshold-canopy');
  } else if (language === 'large-operational-bay') {
    // Broad bay jambs/header communicate vehicle/freight scale, while the actual
    // shell aperture remains owned by the facade/portal authority.
    const broad = Math.max(1, Math.min(3, Math.floor(f.tangentHalf * 2 / Math.max(3.2, recipe.bayTarget))));
    for (let i = 0; i <= broad; i++) {
      const t = tangentStart + (f.tangentHalf * 2) * (i / broad);
      pushFaceBox(structure, f, t, baseY + floorH * 0.50, normalOffset, recipe.pier * 1.25, floorH * 0.94, recipe.depth * 1.10,
        { ...common, architectureRole: 'bay-frame-post' });
    }
    pushFaceBox(structure, f, f.tangentCenter, baseY + floorH * 0.88, normalOffset, f.tangentHalf * 1.82, recipe.band * 1.25, recipe.depth * 1.15,
      { ...common, architectureRole: /loading|shipping/.test(String(space?.functionalFixture ?? '')) ? 'loading-canopy' : 'apparatus-bay-header' });
    features.push('bay-frame-post');
    if (/loading|shipping/.test(String(space?.functionalFixture ?? ''))) features.push('loading-canopy');
  } else if (language === 'technical-service') {
    const count = Math.max(2, Math.min(4, Math.ceil(recipe.serviceIntensity * 4)));
    for (let i = 0; i < count; i++) {
      const t = f.tangentCenter + (i - (count - 1) * 0.5) * Math.min(bayWidth * 0.42, 0.95);
      pushFaceBox(metal, f, t, baseY + floorH * 0.56, normalOffset + 0.12, 0.16, floorH * 0.78, 0.16,
        { ...common, architectureRole: 'major-service-stack' });
    }
    features.push('major-service-stack');
  } else if (language === 'service-opaque') {
    const railWidth = Math.min(f.tangentHalf * 1.35, Math.max(1.8, bayWidth * 1.2));
    for (let i = 0; i < 3; i++) {
      pushFaceBox(metal, f, f.tangentCenter, baseY + floorH * (0.35 + i * 0.13), normalOffset + 0.05, railWidth, 0.07, 0.12,
        { ...common, architectureRole: 'service-louver-rail' });
    }
    features.push('service-louver-rail');
  } else if (language === 'work-regular') {
    pushFaceBox(secondary, f, f.tangentCenter, floorTop - floorH * 0.23, normalOffset, Math.max(2.2, f.tangentHalf * 1.15), 0.10, 0.20,
      { ...common, architectureRole: 'workshop-daylight-header' });
    features.push('workshop-daylight-header');
  }
}

function routeFrontageCount(buildingPlan) {
  return (buildingPlan?.topologySpaces ?? []).filter(space => space?.circulationFrontage?.eligible
    && ['public', 'shared', 'work'].includes(String(space.role))).length;
}

export function planBuildingConstruction({
  id = 'building-construction',
  buildingPlan = null,
  footprintModules = [],
  compoundBounds = null,
  architectureFamily = 'ordinary-mixed-frame',
  floorH = 3.15,
  floors = 1,
  field = 'ground',
  stableKey = id,
} = {}) {
  if (!buildingPlan || !footprintModules?.length) return null;
  const programArchitectureId = buildingPlan?.programArchitecture?.id ?? buildingPlan?.buildingSemanticTruth?.programArchitecture?.id ?? null;
  const recipe = recipeForFamily(architectureFamily);
  const flavor = flavorFor({ stableKey, recipe, buildingPlan, architectureFamily });
  const metal = [], concrete = [], features = [], faceRecords = [], facadeDirectives = [];
  const common = {
    buildingConstruction: true,
    buildingConstructionId: id,
    programArchitectureId,
    architectureFamily,
    constructionFlavor: flavor,
    visualOnly: true,
    traversalAuthority: 'building-plan-and-shell-authority-unchanged',
  };
  const normalizedFloorH = Math.max(2.4, finite(floorH, 3.15));

  for (const module of footprintModules) {
    for (const side of ['north', 'south', 'west', 'east']) {
      // Party walls are real shell/collision faces but not exterior architecture.
      // Internal edges are allowed here because a setback can expose upper stories
      // after the neighboring module ends.
      if (edgeKindForSide(module, side) === 'party') continue;
      const f = face(module, side);
      if (!f) continue;
      const length = f.tangentHalf * 2;
      if (!(length > 1.2)) continue;
      const runs = exposedFloorRuns(module, side, footprintModules);
      if (!runs.length) continue;
      const bays = bayCountFor(length, recipe, stableKey, `${module.key}:${side}`);
      const bayWidth = length / bays;
      const target = recipe.structureMaterial === 'metal' ? metal : concrete;
      const secondary = recipe.structureMaterial === 'metal' ? concrete : metal;
      let semanticFloors = 0;
      const languageCounts = {};

      for (const run of runs) {
        const y0 = run.start * normalizedFloorH;
        const y1 = run.endExclusive * normalizedFloorH;
        const height = y1 - y0;
        const y = (y0 + y1) * 0.5;
        const normalOffset = recipe.depth * 0.58 + 0.025;
        const tangentStart = f.tangentCenter - f.tangentHalf;
        for (let i = 0; i <= bays; i++) {
          const tangent = tangentStart + bayWidth * i;
          pushFaceBox(target, f, tangent, y, normalOffset, recipe.pier, Math.max(0.2, height - 0.06), recipe.depth,
            { ...common, moduleKey: module.key, side, architectureRole: 'construction-bay-pier', bayIndex: i, bayCount: bays, runStartFloor: run.start, runEndFloor: run.endExclusive - 1 });
        }
        for (let floor = run.start; floor <= run.endExclusive; floor++) {
          const bandY = floor * normalizedFloorH + (floor === run.endExclusive ? -recipe.band * 0.45 : recipe.band * 0.45);
          pushFaceBox(secondary, f, f.tangentCenter, bandY, normalOffset, length, recipe.band, Math.max(0.10, recipe.depth * 0.78),
            { ...common, moduleKey: module.key, side, architectureRole: floor === run.start ? 'construction-base-band' : floor === run.endExclusive ? 'construction-roof-edge-band' : 'construction-spandrel-band', globalFloor: floor });
        }
      }

      // Space-driven expression is sampled rather than sprayed onto every story.
      // Tall buildings still read by program, but bounded transform counts preserve
      // JWEB's streaming budget.
      const allExposedFloors = [];
      for (const run of runs) for (let floor = run.start; floor < run.endExclusive; floor++) allExposedFloors.push(floor);
      for (const globalFloor of allExposedFloors) {
        const space = semanticSpaceForFaceFloor(buildingPlan, module, f, globalFloor);
        facadeDirectives.push(Object.freeze({
          schema: 'jweb.building-construction-facade-directive.v1',
          id: `${id}:${module.key}:${side}:floor:${globalFloor}`,
          buildingConstructionId: id,
          architectureFamily,
          constructionFlavor: flavor,
          moduleKey: String(module.key),
          side,
          globalFloor,
          localFloor: globalFloor - moduleFloorBase(module),
          semanticSpaceId: space?.id ?? null,
          semanticRole: space?.role ?? null,
          functionalFixture: space?.functionalFixture ?? null,
          facadeLanguage: roleLanguage(space),
          frontagePriority: space?.frontagePriority ?? null,
          traversalPermission: space?.traversalPermission ?? null,
        }));
      }
      const stride = Math.max(recipe.detailStride, Math.ceil(allExposedFloors.length / 7));
      for (let index = 0; index < allExposedFloors.length; index += stride) {
        const globalFloor = allExposedFloors[index];
        const space = semanticSpaceForFaceFloor(buildingPlan, module, f, globalFloor);
        if (!space) continue;
        semanticFloors++;
        const language = roleLanguage(space);
        languageCounts[language] = (languageCounts[language] ?? 0) + 1;
        semanticDetail({
          metal, concrete, features, recipe, f, space, floorH: normalizedFloorH, globalFloor,
          bayWidth, bayCount: bays,
          metadata: { ...common, moduleKey: module.key, side, globalFloor },
          stableKey,
        });
      }

      // Program-specific facade crown stays on the wall plane rather than occupying
      // the roof deck. Technical/service families get service uprights; domestic
      // and civic families get a quiet perimeter datum.
      const roofFloor = moduleFloorTop(module);
      const roofY = roofFloor * normalizedFloorH;
      if (recipe.serviceIntensity >= 0.75) {
        const stacks = Math.min(3, Math.max(1, Math.ceil(recipe.serviceIntensity * 2)));
        for (let i = 0; i < stacks; i++) {
          const tangent = f.tangentCenter + (i - (stacks - 1) * 0.5) * Math.min(1.2, bayWidth * 0.45);
          pushFaceBox(metal, f, tangent, roofY + 0.38, recipe.depth + 0.08, 0.15, 0.76, 0.15,
            { ...common, moduleKey: module.key, side, architectureRole: 'roof-edge-service-riser' });
        }
        features.push('major-service-stack');
      } else {
        pushFaceBox(secondary, f, f.tangentCenter, roofY + 0.11, recipe.depth * 0.64, Math.max(1.8, length * 0.72), 0.12, Math.max(0.10, recipe.depth * 0.7),
          { ...common, moduleKey: module.key, side, architectureRole: recipe.roofEdge });
      }

      faceRecords.push(Object.freeze({
        moduleKey: String(module.key), side, exposedRuns: runs.length,
        exposedFloorCount: allExposedFloors.length, bayCount: bays, bayWidth,
        semanticFloors, languageCounts: Object.freeze({ ...languageCounts }),
      }));
    }
  }

  // Compatibility feature names used by the previous macro wrapper remain, but
  // they now describe construction that spans the whole relevant facade instead
  // of one decorative anchor face.
  if (architectureFamily === 'domestic-access-stack') features.push('domestic-service-piers');
  if (architectureFamily === 'market-frontage-frame') features.push('market-frame-posts');
  if (architectureFamily === 'food-service-exhaust-frame') features.push('exhaust-riser');
  if (architectureFamily === 'industrial-bay-megastructure') features.push('bay-frame-post');
  if (architectureFamily === 'warehouse-loading-frame') features.push('loading-canopy');
  if (architectureFamily === 'civic-core-frame') features.push('civic-buttress');
  if (architectureFamily === 'secure-institutional-frame') features.push('secure-core-buttress');
  if (architectureFamily === 'laboratory-utility-frame') features.push('utility-riser-bank');
  if (architectureFamily === 'data-utility-megastructure') features.push('major-service-stack');

  const routeCount = routeFrontageCount(buildingPlan);
  if (routeCount > 0 && !features.includes('route-frontage-canopy')) features.push('route-frontage-canopy');
  const handwriting = applyArchitectureMaterialHandwriting({ family: architectureFamily, metal, concrete, field });
  const bounds = compoundBounds ?? footprintModules.reduce((acc, module) => ({
    minX: Math.min(acc.minX, finite(module.cx) - finite(module.halfX)),
    maxX: Math.max(acc.maxX, finite(module.cx) + finite(module.halfX)),
    minZ: Math.min(acc.minZ, finite(module.cz) - finite(module.halfZ)),
    maxZ: Math.max(acc.maxZ, finite(module.cz) + finite(module.halfZ)),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  return Object.freeze({
    schema: BUILDING_CONSTRUCTION_ENGINE_SCHEMA,
    id,
    programArchitectureId,
    architectureFamily,
    constructionFlavor: flavor,
    structuralSystem: recipe.structuralSystem,
    budgetClass: recipe.budgetClass,
    throughputClass: recipe.throughputClass,
    roofEdgeCharacter: recipe.roofEdge,
    serviceIntensity: recipe.serviceIntensity,
    allowedBehaviors: Object.freeze({ ...recipe.allowedBehaviors }),
    baySystem: Object.freeze({ target: recipe.bayTarget, minimum: recipe.bayMin, maximum: recipe.bayMax, maxBaysPerFace: recipe.maxBays }),
    envelopeBounds: Object.freeze({ ...bounds }),
    nominalFloors: Math.max(1, Math.floor(finite(floors, 1))),
    field,
    metal: handwriting.metal,
    concrete: handwriting.concrete,
    parts: metal.length + concrete.length,
    features: Object.freeze(unique(features)),
    routeFrontageFeatureCount: routeCount,
    faces: Object.freeze(faceRecords),
    facadeDirectives: Object.freeze(facadeDirectives),
    semanticFaceFloorCount: faceRecords.reduce((sum, item) => sum + item.semanticFloors, 0),
    traversalAuthority: 'building-plan-and-shell-authority-unchanged',
    sourceAuthority: buildingPlan?.authoritySchema ?? buildingPlan?.schema ?? null,
  });
}
