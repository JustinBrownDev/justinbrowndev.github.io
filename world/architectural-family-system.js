export const ARCHITECTURAL_FAMILY_SYSTEM_SCHEMA = 'jweb.architectural-family-system.v1';
export const STAIR_ARCHITECTURE_SCHEMA = 'jweb.stair-architecture-expression.v1';
export const PROGRAM_MACRO_ARCHITECTURE_SCHEMA = 'jweb.program-macro-architecture.v1';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function hash32(text) { let h = 2166136261 >>> 0; for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function sideOutward(side) { return side === 'north' || side === 'west' ? -1 : 1; }
function normalAxisForSide(side) { return side === 'north' || side === 'south' ? 'z' : 'x'; }
function tangentAxisForSide(side) { return side === 'north' || side === 'south' ? 'x' : 'z'; }

export const STAIR_ARCHITECTURE_FAMILIES = Object.freeze([
  'industrial-fire-escape',
  'residential-enclosed',
  'civic-monumental',
  'scaffold-service',
  'utility-rack',
  'brutalist-mass',
]);

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
  ['office', 'civic-core-frame'],
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

export function stairArchitectureFamilyFor({ programArchitectureId = null, field = 'ground', routeWidthScale = 1, stableKey = '' } = {}) {
  const program = String(programArchitectureId ?? '');
  if (program === 'fire-station' || program === 'auto-shop' || program === 'warehouse') return 'industrial-fire-escape';
  if (program === 'apartment' || program === 'motel-room-building') return 'residential-enclosed';
  if (program === 'clinic' || program === 'courthouse' || program === 'office') return 'civic-monumental';
  if (program === 'laboratory' || program === 'server-facility' || program === 'utility-plant') return 'utility-rack';
  if (field === 'ceiling') return 'scaffold-service';
  if (finite(routeWidthScale, 1) >= 1.42) return 'brutalist-mass';
  return unit(hash32(`${stableKey}:${program}:${field}`), 5) < 0.52 ? 'scaffold-service' : 'industrial-fire-escape';
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

export function planStairArchitectureExpression({
  id = 'stair-expression', route = null, family = null, programArchitectureId = null,
  field = 'ground', routeWidthScale = 1, stableKey = id,
} = {}) {
  if (!route?.flights?.length || !route?.landings?.length) return null;
  const resolvedFamily = family ?? stairArchitectureFamilyFor({ programArchitectureId, field, routeWidthScale, stableKey });
  const width = Math.max(0.72, finite(route.stairWidth, finite(route.clearWidth, finite(route.flights[0]?.clearWidth, 0.9))));
  const halfWidth = width * 0.5;
  const hash = hash32(`${stableKey}:${resolvedFamily}`);
  const metal = [], concrete = [];
  const common = { stairArchitecture: true, stairArchitectureId: id, architectureFamily: resolvedFamily, visualOnly: true, traversalAuthority: 'canonical-stair-kernel-unchanged' };
  const metalT = clamp(width * 0.10, 0.08, 0.22);
  const structuralDepth = resolvedFamily === 'civic-monumental' || resolvedFamily === 'brutalist-mass' ? clamp(width * 0.30, 0.25, 0.58) : clamp(width * 0.16, 0.12, 0.32);
  const sideOffset = halfWidth + metalT * 0.78;

  for (const flight of route.flights) {
    for (const sign of [-1, 1]) {
      const part = flightStringer(flight, sign * sideOffset, metalT, structuralDepth, { ...common, architectureRole: 'side-stringer' });
      if (part) (resolvedFamily === 'civic-monumental' || resolvedFamily === 'brutalist-mass' ? concrete : metal).push(part);
    }
  }

  const landingRects = route.landings.map(normalizedLandingRect).filter(Boolean);
  const totalHeight = Math.max(...landingRects.map(item => item.y), 0) - Math.min(...landingRects.map(item => item.y), 0);
  const minY = Math.min(...landingRects.map(item => item.y), 0);
  const maxY = Math.max(...landingRects.map(item => item.y), 0);
  for (let i = 0; i < landingRects.length; i++) {
    const landing = landingRects[i];
    const slabT = resolvedFamily === 'civic-monumental' || resolvedFamily === 'brutalist-mass' ? clamp(width * 0.24, 0.24, 0.46) : clamp(width * 0.12, 0.10, 0.22);
    if (resolvedFamily !== 'scaffold-service') concrete.push({ x: landing.x, y: landing.y - slabT * 0.5, z: landing.z, sx: landing.hx * 2 + 0.18, sy: slabT, sz: landing.hz * 2 + 0.18, ...common, architectureRole: 'landing-support-slab' });
  }

  // Put vertical load paths outside the walkable landing rectangles, never in the
  // center of a stair or turn.  Ceiling routes visually hang; ground routes prop.
  const supportMode = field === 'ceiling' || resolvedFamily === 'utility-rack' ? 'hung-from-above' : 'braced-from-below';
  const representative = landingRects[Math.floor(landingRects.length * 0.5)] ?? landingRects[0];
  if (representative && totalHeight > 0.5) {
    const pad = Math.max(0.16, metalT * 1.8);
    const corners = [
      [representative.x - representative.hx - pad, representative.z - representative.hz - pad],
      [representative.x + representative.hx + pad, representative.z - representative.hz - pad],
      [representative.x - representative.hx - pad, representative.z + representative.hz + pad],
      [representative.x + representative.hx + pad, representative.z + representative.hz + pad],
    ];
    const count = resolvedFamily === 'residential-enclosed' || resolvedFamily === 'civic-monumental' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const [x,z] = corners[(i + (hash & 1)) % corners.length];
      const thick = resolvedFamily === 'civic-monumental' || resolvedFamily === 'brutalist-mass' ? clamp(width * 0.28, 0.28, 0.55) : metalT * 1.25;
      const target = resolvedFamily === 'civic-monumental' || resolvedFamily === 'brutalist-mass' ? concrete : metal;
      target.push({ x, y: (minY + maxY) * 0.5, z, sx: thick, sy: totalHeight + 0.6, sz: thick, ...common, architectureRole: supportMode === 'hung-from-above' ? 'hanger-post' : 'support-post', supportMode });
    }
  }

  if (resolvedFamily === 'industrial-fire-escape' || resolvedFamily === 'scaffold-service' || resolvedFamily === 'utility-rack') {
    for (let i = 1; i < landingRects.length; i++) {
      const a = landingRects[i - 1], b = landingRects[i];
      const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
      const horizontal = Math.hypot(dx, dz);
      if (!(horizontal > 0.05 || Math.abs(dy) > 0.05)) continue;
      const length = Math.hypot(horizontal, dy);
      const angleY = Math.atan2(dz, dx || 1e-9);
      const brace = { x: (a.x+b.x)*0.5, y: (a.y+b.y)*0.5 + (supportMode === 'hung-from-above' ? 0.55 : -0.45), z: (a.z+b.z)*0.5, sx: length, sy: metalT, sz: metalT, ry: -angleY, ...common, architectureRole: 'cross-brace', supportMode };
      metal.push(brace);
    }
  }

  if (resolvedFamily === 'residential-enclosed') {
    for (const landing of landingRects.filter((_, i) => i === 0 || i === landingRects.length - 1 || i % 2 === 0)) {
      metal.push({ x: landing.x, y: landing.y + 2.25, z: landing.z, sx: landing.hx * 2 + 0.42, sy: 0.12, sz: landing.hz * 2 + 0.42, ...common, architectureRole: 'weather-canopy' });
    }
  }

  return Object.freeze({
    schema: STAIR_ARCHITECTURE_SCHEMA,
    id, family: resolvedFamily, supportMode, programArchitectureId: programArchitectureId ?? null,
    metal: Object.freeze(metal), concrete: Object.freeze(concrete), parts: metal.length + concrete.length,
    clearWidth: width, traversalAuthority: 'canonical-stair-kernel-unchanged',
  });
}

export function programMacroArchitectureFamilyFor(programArchitectureId) {
  return PROGRAM_FAMILY.get(String(programArchitectureId ?? '')) ?? 'workshop-service-frame';
}

function moduleForKey(modules, key) { return modules.find(module => String(module.key) === String(key)) ?? null; }
function faceSpec(module, side) {
  if (!module || !side) return null;
  const cx = finite(module.cx, NaN), cz = finite(module.cz, NaN), hx = finite(module.halfX, NaN), hz = finite(module.halfZ, NaN);
  if (![cx,cz,hx,hz].every(Number.isFinite)) return null;
  if (side === 'north' || side === 'south') return { tangentAxis:'x', normalAxis:'z', tangentCenter:cx, tangentHalf:hx, faceCoord:cz + (side === 'north' ? -hz : hz), outward:sideOutward(side) };
  if (side === 'west' || side === 'east') return { tangentAxis:'z', normalAxis:'x', tangentCenter:cz, tangentHalf:hz, faceCoord:cx + (side === 'west' ? -hx : hx), outward:sideOutward(side) };
  return null;
}

function pushFacadeBeam(target, face, tangent, y, normalOffset, tangentSize, sy, normalSize, metadata) {
  const normal = face.faceCoord + face.outward * normalOffset;
  if (face.tangentAxis === 'x') target.push({ x:tangent, y, z:normal, sx:tangentSize, sy, sz:normalSize, ...metadata });
  else target.push({ x:normal, y, z:tangent, sx:normalSize, sy, sz:tangentSize, ...metadata });
}

function routeFrontageDescriptors(buildingPlan, modules) {
  const out = [];
  for (const space of buildingPlan?.topologySpaces ?? []) {
    if (!space?.circulationFrontage?.eligible) continue;
    if (!['public','shared','work'].includes(String(space.role))) continue;
    const sides = space.circulationFrontage.facadeSides ?? [];
    const keys = space.moduleKeys ?? (space.moduleKey ? [space.moduleKey] : []);
    for (const key of keys) {
      const module = moduleForKey(modules, key);
      if (!module) continue;
      for (const side of sides) {
        const face = faceSpec(module, side);
        if (!face) continue;
        out.push({ space, module, side, face, floor: Math.max(0, Math.floor(finite(space.floor))) });
      }
    }
  }
  return out;
}

export function planProgramMacroArchitecture({
  id = 'program-macro', buildingPlan = null, footprintModules = [], compoundBounds = null,
  floorH = 3.15, floors = 1, field = 'ground', stableKey = id,
} = {}) {
  const programArchitectureId = buildingPlan?.programArchitecture?.id ?? null;
  if (!programArchitectureId || !footprintModules.length) return null;
  const family = programMacroArchitectureFamilyFor(programArchitectureId);
  const hash = hash32(`${stableKey}:${programArchitectureId}:${family}`);
  const h = Math.max(2.6, finite(floorH, 3.15) * Math.max(1, finite(floors, 1)));
  const metal = [], concrete = [], features = [];
  const common = { programMacroArchitecture:true, programArchitectureId, architectureFamily:family, visualOnly:true, traversalAuthority:'building-plan-and-circulation-authority-unchanged' };
  const bounds = compoundBounds ?? footprintModules.reduce((acc,m) => ({ minX:Math.min(acc.minX, finite(m.cx)-finite(m.halfX)), maxX:Math.max(acc.maxX, finite(m.cx)+finite(m.halfX)), minZ:Math.min(acc.minZ, finite(m.cz)-finite(m.halfZ)), maxZ:Math.max(acc.maxZ, finite(m.cz)+finite(m.halfZ)) }), {minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
  const spanX = bounds.maxX - bounds.minX, spanZ = bounds.maxZ - bounds.minZ;
  const side = spanX >= spanZ ? (unit(hash,2)<0.5?'north':'south') : (unit(hash,4)<0.5?'west':'east');
  const anchor = footprintModules.reduce((best,m) => {
    const face = faceSpec(m, side); if (!face) return best;
    const score = face.tangentHalf; return !best || score > best.score ? {module:m,face,score} : best;
  }, null);
  if (!anchor) return null;
  const face = anchor.face;
  const metalT = clamp(Math.min(spanX,spanZ) * 0.025, 0.12, 0.32);
  const concreteT = clamp(Math.min(spanX,spanZ) * 0.055, 0.28, 0.70);

  const addVerticalRiserPair = (target, role, offset = 0.42, thick = metalT) => {
    for (const sign of [-1,1]) {
      const tangent = face.tangentCenter + sign * Math.max(0.4, face.tangentHalf - thick * 0.8);
      pushFacadeBeam(target, face, tangent, h*0.5, offset, thick, h, thick, { ...common, architectureRole:role });
    }
    features.push(role);
  };
  const addCanopy = (role, y, depth, thickness, target = metal) => {
    const tangentSize = Math.max(2.6, face.tangentHalf * 1.75);
    pushFacadeBeam(target, face, face.tangentCenter, y, depth*0.5, tangentSize, thickness, depth, { ...common, architectureRole:role, junctionYield:true });
    features.push(role);
  };

  if (family === 'domestic-access-stack') {
    addVerticalRiserPair(concrete, 'domestic-service-piers', 0.34, concreteT * 0.72);
    for (let floor=1; floor<Math.min(6, Math.max(2, Math.floor(finite(floors,1)))); floor+=2) addCanopy('domestic-weather-band', floor*floorH + floorH*0.72, 0.72, 0.10, metal);
  } else if (family === 'market-frontage-frame' || family === 'food-service-exhaust-frame' || family === 'workshop-service-frame') {
    addCanopy('market-service-canopy', floorH * 0.84, 1.45 + unit(hash,6)*0.55, 0.14, metal);
    addVerticalRiserPair(metal, 'market-frame-posts', 0.32, metalT*1.15);
    if (family === 'food-service-exhaust-frame') {
      const tangent = face.tangentCenter + face.tangentHalf*0.72;
      pushFacadeBeam(metal, face, tangent, h*0.62, 0.38, 0.42, h*0.78, 0.42, { ...common, architectureRole:'exhaust-riser' }); features.push('exhaust-riser');
    }
  } else if (family === 'industrial-bay-megastructure' || family === 'warehouse-loading-frame') {
    addVerticalRiserPair(concrete, 'industrial-bay-piers', 0.26, concreteT);
    addCanopy(family === 'warehouse-loading-frame' ? 'loading-canopy' : 'apparatus-bay-header', floorH*0.92, 2.1, 0.22, metal);
    const bays = Math.max(2, Math.min(6, Math.floor(face.tangentHalf * 2 / 3.4)));
    for (let i=0;i<=bays;i++) {
      const tangent = face.tangentCenter - face.tangentHalf + (face.tangentHalf*2)*(i/bays);
      pushFacadeBeam(metal, face, tangent, floorH*0.52, 0.18, metalT, floorH*1.04, metalT, { ...common, architectureRole:'bay-frame-post' });
    }
    features.push('bay-frame-post');
  } else if (family === 'civic-core-frame' || family === 'secure-institutional-frame') {
    addVerticalRiserPair(concrete, family === 'civic-core-frame' ? 'civic-buttress' : 'secure-core-buttress', 0.30, concreteT);
    addCanopy('deep-entry-canopy', floorH*0.86, 1.75, 0.22, concrete);
    if (finite(floors,1) >= 3) addCanopy('upper-public-terrace-frame', floorH*2.05, 0.95, 0.14, metal);
  } else if (family === 'laboratory-utility-frame' || family === 'data-utility-megastructure') {
    addVerticalRiserPair(metal, 'utility-riser-bank', 0.48, metalT*1.25);
    const rackY = field === 'ceiling' ? Math.max(floorH, h*0.32) : Math.min(h-floorH*0.4, floorH*1.45);
    addCanopy('utility-pipe-rack', rackY, 1.35, 0.16, metal);
    const stackCount = family === 'data-utility-megastructure' ? 3 : 2;
    for (let i=0;i<stackCount;i++) {
      const t = face.tangentCenter + (i-(stackCount-1)/2)*Math.max(0.6, face.tangentHalf*0.45);
      pushFacadeBeam(metal, face, t, h*0.67, 0.62, 0.32, h*0.54, 0.32, { ...common, architectureRole:'major-service-stack' });
    }
    features.push('major-service-stack');
  }

  // Route-served frontage gets an overhead architectural threshold but never a
  // fake deck.  The actual street/gallery/portal remains the only traversal.
  const routeFrontages = routeFrontageDescriptors(buildingPlan, footprintModules).slice(0, 4);
  for (const item of routeFrontages) {
    const y = item.floor * finite(floorH,3.15) + Math.min(2.55, finite(floorH,3.15)*0.78);
    const depth = 0.85 + unit(hash32(`${stableKey}:${item.space.id}:${item.side}`),3)*0.45;
    pushFacadeBeam(metal, item.face, item.face.tangentCenter, y, depth*0.5, Math.max(2.4, item.face.tangentHalf*1.6), 0.12, depth, { ...common, architectureRole:'route-frontage-canopy', routeFrontage:true, spaceId:item.space.id, floor:item.floor, side:item.side, junctionYield:true });
    features.push('route-frontage-canopy');
  }

  return Object.freeze({
    schema: PROGRAM_MACRO_ARCHITECTURE_SCHEMA, id, family, programArchitectureId,
    metal:Object.freeze(metal), concrete:Object.freeze(concrete), parts:metal.length+concrete.length,
    features:Object.freeze([...new Set(features)]), routeFrontageFeatureCount:routeFrontages.length,
    traversalAuthority:'building-plan-and-circulation-authority-unchanged',
  });
}
