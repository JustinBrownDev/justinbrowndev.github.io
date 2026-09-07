import { applyArchitectureMaterialHandwriting } from './architecture/material-handwriting.js';
import { planBuildingConstruction } from './architecture/building-construction-engine.js';
import { deriveStairArchitectureBrief, STAIR_ARCHITECTURE_SPECIES } from './stair-architecture-doctrine.js';

export const ARCHITECTURAL_FAMILY_SYSTEM_SCHEMA = 'jweb.architectural-family-system.v2';
export const STAIR_ARCHITECTURE_SCHEMA = 'jweb.stair-architecture-expression.v2';
export const PROGRAM_MACRO_ARCHITECTURE_SCHEMA = 'jweb.program-macro-architecture.v1';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function hash32(text) { let h = 2166136261 >>> 0; for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }

export const STAIR_ARCHITECTURE_FAMILIES = STAIR_ARCHITECTURE_SPECIES;

export const PROGRAM_MACRO_FAMILIES = Object.freeze([
  'domestic-access-stack',
  'market-frontage-frame',
  'food-service-exhaust-frame',
  'workshop-service-frame',
  'industrial-bay-megastructure',
  'civic-core-frame',
  'secure-institutional-frame',
  'laboratory-utility-frame',
  'warehouse-loading-frame',
  'data-utility-megastructure',
]);

const PROGRAM_FAMILY = new Map([
  ['apartment', 'domestic-access-stack'],
  ['motel-room-building', 'domestic-access-stack'],
  ['retail-service', 'market-frontage-frame'],
  ['food-service', 'food-service-exhaust-frame'],
  ['workshop-retail', 'workshop-service-frame'],
  ['fire-station', 'industrial-bay-megastructure'],
  ['auto-shop', 'industrial-bay-megastructure'],
  ['clinic', 'civic-core-frame'],
  ['courthouse', 'civic-core-frame'],
  ['police-booking', 'secure-institutional-frame'],
  ['laboratory', 'laboratory-utility-frame'],
  ['warehouse', 'warehouse-loading-frame'],
  ['server-facility', 'data-utility-megastructure'],
  ['office-public', 'civic-core-frame'],
  ['archive', 'secure-institutional-frame'],
  ['utility-plant', 'data-utility-megastructure'],
  // Generic physical-use truth must remain generic: choose the nearest broad
  // structural language without inventing a specific tenant/program.
  ['generic:residential-lodging', 'domestic-access-stack'],
  ['generic:mercantile-public', 'market-frontage-frame'],
  ['generic:business', 'civic-core-frame'],
  ['generic:assembly-institutional', 'civic-core-frame'],
  ['generic:industrial-service', 'workshop-service-frame'],
  ['generic:storage', 'workshop-service-frame'],
  ['generic:maintenance-utility', 'laboratory-utility-frame'],
]);

export function stairArchitectureFamilyFor({
  programArchitectureId = null, field = 'ground', routeWidthScale = 1, stableKey = '',
  routeClass = 'local', routeFamily = null, physicalUse = null, purpose = null,
  emergencyOnly = false, ceremonial = false, specialPurpose = false,
} = {}) {
  return deriveStairArchitectureBrief({
    programArchitectureId, field, routeWidthScale, stableKey,
    routeClass, routeFamily, physicalUse, purpose, emergencyOnly, ceremonial, specialPurpose,
  }).species;
}

function normalizedLandingRect(landing) {
  if (landing?.geometry && ['x','z','hx','hz'].every(key => Number.isFinite(Number(landing.geometry[key])))) {
    return { x: Number(landing.geometry.x), z: Number(landing.geometry.z), hx: Number(landing.geometry.hx), hz: Number(landing.geometry.hz), y: finite(landing.y) };
  }
  if (['x','z','sx','sz'].every(key => Number.isFinite(Number(landing?.[key])))) {
    return { x: Number(landing.x), z: Number(landing.z), hx: Number(landing.sx) * 0.5, hz: Number(landing.sz) * 0.5, y: finite(landing.y) };
  }
  return null;
}

function flightStringer(flight, lateralOffset, thickness, depth, metadata) {
  const from = finite(flight.from), to = finite(flight.to);
  const y0 = finite(flight.y0), y1 = finite(flight.y1);
  const da = to - from, dy = y1 - y0;
  const length = Math.hypot(da, dy);
  if (!(length > 0.05)) return null;
  const along = (from + to) * 0.5;
  const y = (y0 + y1) * 0.5 - depth * 0.38;
  const angle = Math.atan2(dy, da || 1e-9);
  if (flight.axis === 'x') return { x: along, y, z: finite(flight.fixedCoord) + lateralOffset, sx: length, sy: depth, sz: thickness, rz: angle, ...metadata };
  return { x: finite(flight.fixedCoord) + lateralOffset, y, z: along, sx: thickness, sy: depth, sz: length, rx: -angle, ...metadata };
}

function landingBounds(landingRects) {
  if (!landingRects.length) return null;
  return landingRects.reduce((acc, item) => ({
    minX: Math.min(acc.minX, item.x - item.hx), maxX: Math.max(acc.maxX, item.x + item.hx),
    minZ: Math.min(acc.minZ, item.z - item.hz), maxZ: Math.max(acc.maxZ, item.z + item.hz),
    minY: Math.min(acc.minY, item.y), maxY: Math.max(acc.maxY, item.y),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity });
}

function pushVertical(target, x, z, minY, maxY, thickness, metadata) {
  const height = Math.max(0.1, maxY - minY);
  target.push({ x, y: minY + height * 0.5, z, sx: thickness, sy: height, sz: thickness, ...metadata });
}

function pushFacadeTieback(target, landing, route, thickness, metadata) {
  const faceCoord = finite(route?.orientation?.faceCoord, NaN);
  // facade-stair-authority names this orientation field faceSide. Accept the
  // older aliases too so imported/fixture routes still express the same load
  // path instead of silently losing their wall brackets.
  const side = String(route?.side ?? route?.orientation?.faceSide ?? route?.orientation?.side ?? '');
  if (!Number.isFinite(faceCoord) || !['north','south','east','west'].includes(side)) return false;
  if (side === 'north' || side === 'south') {
    const length = Math.abs(landing.z - faceCoord);
    if (length <= 0.06) return false;
    target.push({ x: landing.x, y: landing.y - thickness * 0.25, z: (landing.z + faceCoord) * 0.5, sx: thickness * 2.0, sy: thickness, sz: length, ...metadata });
  } else {
    const length = Math.abs(landing.x - faceCoord);
    if (length <= 0.06) return false;
    target.push({ x: (landing.x + faceCoord) * 0.5, y: landing.y - thickness * 0.25, z: landing.z, sx: length, sy: thickness, sz: thickness * 2.0, ...metadata });
  }
  return true;
}

function pushShaftSideWalls(target, bounds, flightAxis, wallThickness, wallHeight, metadata) {
  if (!bounds) return;
  const y = bounds.minY + wallHeight * 0.5;
  if (flightAxis === 'x') {
    const length = Math.max(0.2, bounds.maxX - bounds.minX);
    const x = (bounds.minX + bounds.maxX) * 0.5;
    target.push({ x, y, z: bounds.minZ - wallThickness * 0.5, sx: length, sy: wallHeight, sz: wallThickness, ...metadata, architectureRole: 'enclosure-side-wall' });
    target.push({ x, y, z: bounds.maxZ + wallThickness * 0.5, sx: length, sy: wallHeight, sz: wallThickness, ...metadata, architectureRole: 'enclosure-side-wall' });
  } else {
    const length = Math.max(0.2, bounds.maxZ - bounds.minZ);
    const z = (bounds.minZ + bounds.maxZ) * 0.5;
    target.push({ x: bounds.minX - wallThickness * 0.5, y, z, sx: wallThickness, sy: wallHeight, sz: length, ...metadata, architectureRole: 'enclosure-side-wall' });
    target.push({ x: bounds.maxX + wallThickness * 0.5, y, z, sx: wallThickness, sy: wallHeight, sz: length, ...metadata, architectureRole: 'enclosure-side-wall' });
  }
}

export function planStairArchitectureExpression({
  id = 'stair-expression', route = null, family = null, architectureBrief = null,
  programArchitectureId = null, field = 'ground', routeWidthScale = 1, stableKey = id,
  purpose = null, emergencyOnly = false, ceremonial = false, specialPurpose = false,
} = {}) {
  if (!route?.flights?.length || !route?.landings?.length) return null;
  const brief = architectureBrief ?? deriveStairArchitectureBrief({
    programArchitectureId,
    physicalUse: route?.physicalTruth?.physicalUse ?? route?.physicalUse ?? null,
    routeClass: route?.routeClass ?? 'local',
    routeFamily: route?.family ?? route?.routeFamily ?? null,
    purpose, field, routeWidthScale, stableKey, emergencyOnly, ceremonial, specialPurpose,
  });
  const resolvedFamily = family ?? brief.species;
  const resolvedBrief = resolvedFamily === brief.species ? brief : deriveStairArchitectureBrief({
    programArchitectureId, physicalUse: brief.physicalUse, routeClass: brief.routeClass,
    routeFamily: brief.routeFamily, purpose, field, routeWidthScale, stableKey,
    emergencyOnly: resolvedFamily === 'retrofit-facade-fire-escape',
    ceremonial: resolvedFamily === 'civic-monumental',
    specialPurpose: resolvedFamily === 'utility-ship-stair',
    species: resolvedFamily,
  });
  const species = resolvedFamily;
  const width = Math.max(0.65, finite(route.stairWidth, finite(route.clearWidth, finite(route.flights[0]?.clearWidth, 0.9))));
  const halfWidth = width * 0.5;
  const metal = [], concrete = [];
  const common = {
    stairArchitecture: true, stairArchitectureId: id, architectureFamily: species, stairSpecies: species,
    builder: resolvedBrief.builder, budget: resolvedBrief.budget, permanence: resolvedBrief.permanence,
    throughput: resolvedBrief.throughput, landingGrammar: resolvedBrief.landingGrammar,
    endpointGrammar: resolvedBrief.endpointGrammar, loadPath: resolvedBrief.loadPath,
    visualOnly: true, traversalAuthority: 'species-selected-before-visual-expression',
  };
  const landingRects = route.landings.map(normalizedLandingRect).filter(Boolean);
  if (!landingRects.length) return null;
  const bounds = landingBounds(landingRects);
  const minY = bounds.minY, maxY = bounds.maxY;
  const totalHeight = Math.max(0, maxY - minY);
  const flightAxis = route.flights[0]?.axis === 'z' ? 'z' : 'x';
  const metalT = clamp(width * 0.085, 0.055, 0.19);
  const sideOffset = halfWidth + metalT * 0.78;
  const isMass = species === 'civic-monumental' || species === 'district-thoroughfare';
  const isShaft = species === 'domestic-enclosed-dogleg' || species === 'institutional-egress';

  // Species own the load-bearing silhouette. These are deliberately not a shared
  // switchback decorated with different rails: each construction history emits a
  // different primary support/enclosure system before material handwriting.
  for (const flight of route.flights) {
    if (species === 'retrofit-facade-fire-escape') {
      for (const sign of [-1, 1]) {
        const part = flightStringer(flight, sign * sideOffset, clamp(width * 0.065, 0.05, 0.09), clamp(width * 0.10, 0.08, 0.15), { ...common, architectureRole: 'retrofit-angle-stringer' });
        if (part) metal.push(part);
      }
    } else if (species === 'industrial-work-stair') {
      for (const sign of [-1, 1]) {
        const part = flightStringer(flight, sign * sideOffset, clamp(width * 0.10, 0.09, 0.16), clamp(width * 0.18, 0.15, 0.28), { ...common, architectureRole: 'channel-stringer' });
        if (part) metal.push(part);
      }
    } else if (species === 'scaffold-access-tower') {
      const part = flightStringer(flight, 0, clamp(width * 0.07, 0.055, 0.10), clamp(width * 0.10, 0.08, 0.14), { ...common, architectureRole: 'stair-inside-scaffold-bay' });
      if (part) metal.push(part);
    } else if (species === 'utility-ship-stair') {
      for (const sign of [-1, 1]) {
        const part = flightStringer(flight, sign * (halfWidth + metalT * 0.55), clamp(width * 0.11, 0.075, 0.13), clamp(width * 0.14, 0.10, 0.19), { ...common, architectureRole: 'service-channel-stringer' });
        if (part) metal.push(part);
      }
    } else {
      const depth = isMass ? clamp(width * 0.34, 0.34, 0.72) : clamp(width * 0.19, 0.18, 0.38);
      const thickness = isMass ? clamp(width * 0.20, 0.20, 0.48) : clamp(width * 0.14, 0.13, 0.26);
      for (const sign of [-1, 1]) {
        const part = flightStringer(flight, sign * sideOffset, thickness, depth, { ...common, architectureRole: isMass ? 'massive-flight-cheek' : 'integrated-flight-cheek' });
        if (part) concrete.push(part);
      }
    }
  }

  for (const landing of landingRects) {
    if (species === 'scaffold-access-tower') continue;
    const slabT = isMass ? clamp(width * 0.20, 0.24, 0.54)
      : species === 'retrofit-facade-fire-escape' ? clamp(width * 0.075, 0.065, 0.10)
      : species === 'industrial-work-stair' || species === 'utility-ship-stair' ? clamp(width * 0.09, 0.08, 0.14)
      : clamp(width * 0.12, 0.13, 0.24);
    const target = ['retrofit-facade-fire-escape','industrial-work-stair','utility-ship-stair'].includes(species) ? metal : concrete;
    target.push({
      x: landing.x, y: landing.y - slabT * 0.5, z: landing.z,
      sx: landing.hx * 2 + (isMass ? 0.32 : 0.12), sy: slabT, sz: landing.hz * 2 + (isMass ? 0.32 : 0.12),
      ...common,
      architectureRole: species === 'district-thoroughfare' ? 'street-landing-plinth'
        : species === 'industrial-work-stair' ? 'work-platform'
        : species === 'retrofit-facade-fire-escape' ? 'door-landing-grate'
        : 'landing-support-slab',
    });
  }

  if (isShaft) {
    const wallT = species === 'domestic-enclosed-dogleg' ? clamp(width * 0.13, 0.13, 0.20) : clamp(width * 0.16, 0.16, 0.24);
    const wallH = Math.max(2.35, totalHeight + 2.20);
    pushShaftSideWalls(concrete, bounds, flightAxis, wallT, wallH, common);
  }

  if (species === 'retrofit-facade-fire-escape') {
    for (const landing of landingRects) pushFacadeTieback(metal, landing, route, clamp(width * 0.075, 0.055, 0.09), { ...common, architectureRole: 'facade-tieback-bracket' });
  }

  if (species === 'industrial-work-stair') {
    const pad = Math.max(0.12, metalT * 1.5);
    for (const [x,z] of [[bounds.minX-pad,bounds.minZ-pad],[bounds.maxX+pad,bounds.minZ-pad],[bounds.minX-pad,bounds.maxZ+pad],[bounds.maxX+pad,bounds.maxZ+pad]]) {
      pushVertical(metal, x, z, minY - 0.18, maxY + 0.45, clamp(width * 0.11, 0.10, 0.18), { ...common, architectureRole: resolvedBrief.supportPolarity === 'load-up' ? 'hung-platform-frame-post' : 'platform-frame-column' });
    }
  }

  if (species === 'scaffold-access-tower') {
    const pad = Math.max(0.12, metalT * 1.6);
    const x0 = bounds.minX-pad, x1 = bounds.maxX+pad, z0 = bounds.minZ-pad, z1 = bounds.maxZ+pad;
    for (const [x,z] of [[x0,z0],[x1,z0],[x0,z1],[x1,z1]]) {
      pushVertical(metal, x, z, minY - 0.12, maxY + 0.72, clamp(width * 0.075, 0.065, 0.10), { ...common, architectureRole: 'scaffold-bay-post' });
    }
    for (const z of [z0,z1]) {
      const braceA = flightStringer({ axis:'x', from:x0, to:x1, fixedCoord:z, y0:minY, y1:maxY }, 0, metalT, metalT, { ...common, architectureRole:'scaffold-x-brace' });
      const braceB = flightStringer({ axis:'x', from:x0, to:x1, fixedCoord:z, y0:maxY, y1:minY }, 0, metalT, metalT, { ...common, architectureRole:'scaffold-x-brace' });
      if (braceA) metal.push(braceA); if (braceB) metal.push(braceB);
    }
  }

  if (species === 'district-thoroughfare') {
    const pierT = clamp(width * 0.18, 0.30, 0.62);
    const pad = pierT * 0.65;
    const corners = [[bounds.minX-pad,bounds.minZ-pad],[bounds.maxX+pad,bounds.maxZ+pad]];
    for (const [x,z] of corners) pushVertical(concrete, x, z, minY - 0.35, maxY + 0.55, pierT, { ...common, architectureRole: resolvedBrief.supportPolarity === 'load-up' ? 'public-hanger-pier' : 'public-infrastructure-pier' });
  }

  if (species === 'civic-monumental') {
    const baseT = clamp(width * 0.22, 0.40, 0.85);
    concrete.push({ x:(bounds.minX+bounds.maxX)*0.5, y:minY-baseT*0.5, z:(bounds.minZ+bounds.maxZ)*0.5, sx:(bounds.maxX-bounds.minX)+0.55, sy:baseT, sz:(bounds.maxZ-bounds.minZ)+0.55, ...common, architectureRole:'monumental-base-mass' });
  }

  const supportMode = resolvedBrief.supportPolarity === 'load-up' ? 'hung-from-above'
    : species === 'retrofit-facade-fire-escape' ? 'tied-to-facade'
    : isShaft ? 'integrated-building-structure'
    : isMass ? 'mass-bearing-public-structure'
    : 'frame-supported';
  const materialHandwriting = applyArchitectureMaterialHandwriting({
    family: species, metal, concrete, field, weightScale: routeWidthScale,
  });
  return Object.freeze({
    schema: STAIR_ARCHITECTURE_SCHEMA,
    id, family: species, species, supportMode, programArchitectureId: programArchitectureId ?? resolvedBrief.programArchitectureId ?? null,
    brief: resolvedBrief,
    builder: resolvedBrief.builder, budget: resolvedBrief.budget, permanence: resolvedBrief.permanence,
    throughput: resolvedBrief.throughput, carriedObjects: resolvedBrief.carriedObjects,
    loadPath: resolvedBrief.loadPath, landingGrammar: resolvedBrief.landingGrammar,
    endpointGrammar: resolvedBrief.endpointGrammar, guardFamily: resolvedBrief.guardFamily,
    metal: materialHandwriting.metal, concrete: materialHandwriting.concrete, parts: metal.length + concrete.length,
    clearWidth: width, traversalAuthority: 'species-selected-before-visual-expression',
  });
}

export function programMacroArchitectureFamilyFor(programArchitectureId) {
  return PROGRAM_FAMILY.get(String(programArchitectureId ?? '')) ?? 'workshop-service-frame';
}

export function planProgramMacroArchitecture({
  id = 'program-macro', buildingPlan = null, footprintModules = [], compoundBounds = null,
  floorH = 3.15, floors = 1, field = 'ground', stableKey = id,
} = {}) {
  const programArchitectureId = buildingPlan?.programArchitecture?.id ?? null;
  if (!programArchitectureId || !footprintModules.length) return null;
  const family = programMacroArchitectureFamilyFor(programArchitectureId);

  // 21X: this legacy-named surface is now a compatibility view over the real
  // construction engine.  The old implementation decorated one arbitrary facade
  // after the building was already generic.  Construction now reads Building Plan
  // topology across every exposed facade and emits a bay/section/service language
  // whose dimensions and density come from the actual use.
  const construction = planBuildingConstruction({
    id: `${id}:construction`,
    buildingPlan,
    footprintModules,
    compoundBounds,
    architectureFamily: family,
    floorH,
    floors,
    field,
    stableKey,
  });
  if (!construction) return null;

  return Object.freeze({
    schema: PROGRAM_MACRO_ARCHITECTURE_SCHEMA,
    id,
    family,
    programArchitectureId,
    metal: construction.metal,
    concrete: construction.concrete,
    parts: construction.parts,
    features: construction.features,
    routeFrontageFeatureCount: construction.routeFrontageFeatureCount,
    constructionEngine: Object.freeze({
      schema: construction.schema,
      id: construction.id,
      programArchitectureId,
      architectureFamily: construction.architectureFamily,
      constructionFlavor: construction.constructionFlavor,
      structuralSystem: construction.structuralSystem,
      budgetClass: construction.budgetClass,
      throughputClass: construction.throughputClass,
      roofEdgeCharacter: construction.roofEdgeCharacter,
      serviceIntensity: construction.serviceIntensity,
      allowedBehaviors: construction.allowedBehaviors,
      baySystem: construction.baySystem,
      semanticFaceFloorCount: construction.semanticFaceFloorCount,
      faceCount: construction.faces.length,
      facadeDirectives: construction.facadeDirectives,
    }),
    traversalAuthority: 'building-plan-and-circulation-authority-unchanged',
  });
}
