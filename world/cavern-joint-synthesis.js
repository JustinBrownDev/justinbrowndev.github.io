export const CAVERN_JOINT_SYNTHESIS_SCHEMA = 'jweb.cavern-joint-synthesis.v3';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function normalizedBounds(raw, margin = 0) {
  if (!raw) return null;
  const m = Math.max(0, finite(margin));
  const minX = finite(raw.minX, finite(raw.x) - finite(raw.halfX));
  const maxX = finite(raw.maxX, finite(raw.x) + finite(raw.halfX));
  const minZ = finite(raw.minZ, finite(raw.z) - finite(raw.halfZ));
  const maxZ = finite(raw.maxZ, finite(raw.z) + finite(raw.halfZ));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  return Object.freeze({ minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m });
}

function overlaps(a, b, epsilon = 1e-7) {
  if (!a || !b) return false;
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > epsilon
    && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > epsilon;
}

function freezeDecision(plan, floors, blockers, horizontal, sectionArchetypes = []) {
  const fh = Math.max(0.1, finite(plan.floorHeight, 3.15));
  const desired = Math.max(1, Math.floor(finite(plan.desiredFloors, 1)));
  const minimum = Math.max(1, Math.min(desired, Math.floor(finite(plan.minimumFloors, 1))));
  const acceptedFloors = Math.max(minimum, Math.min(desired, Math.floor(finite(floors, desired))));
  return Object.freeze({
    id: String(plan.id),
    desiredFloors: desired,
    minimumFloors: minimum,
    floors: acceptedFloors,
    floorHeight: fh,
    desiredHeight: desired * fh,
    occupiedHeight: acceptedFloors * fh,
    blockers: Object.freeze([...blockers].sort()),
    sectionArchetypes: Object.freeze([...sectionArchetypes].sort()),
    routeDemandScore: Math.max(0, Math.min(1, finite(plan.routeDemandScore, 0))),
    routeRole: plan.routeRole ?? null,
    routeId: plan.routeId ?? null,
    routePreferredBandNorm: Number.isFinite(Number(plan.routePreferredBandNorm)) ? Number(plan.routePreferredBandNorm) : null,
    absorbedInterveningTower: plan.absorbedInterveningTower === true,
    routeDrivenHeightTarget: Number.isFinite(Number(plan.routeDrivenHeightTarget)) ? Number(plan.routeDrivenHeightTarget) : null,
    baseDesiredFloors: Number.isFinite(Number(plan.baseDesiredFloors)) ? Number(plan.baseDesiredFloors) : null,
    horizontal,
  });
}

function balancedPairFloorCaps(ground, ceiling, availableHeight) {
  const gf = Math.max(0.1, finite(ground.floorHeight, 3.15));
  const cf = Math.max(0.1, finite(ceiling.floorHeight, 3.15));
  const gd = Math.max(1, Math.floor(finite(ground.desiredFloors, 1)));
  const cd = Math.max(1, Math.floor(finite(ceiling.desiredFloors, 1)));
  const gmin = Math.max(1, Math.min(gd, Math.floor(finite(ground.minimumFloors, 1))));
  const cmin = Math.max(1, Math.min(cd, Math.floor(finite(ceiling.minimumFloors, 1))));
  if (gd * gf + cd * cf <= availableHeight + 1e-8) return { ground: gd, ceiling: cd };

  let g = gmin;
  let c = cmin;
  let remaining = Math.max(0, availableHeight - gmin * gf - cmin * cf);
  const gExtraHeight = Math.max(0, (gd - gmin) * gf);
  const cExtraHeight = Math.max(0, (cd - cmin) * cf);
  const requestedExtra = gExtraHeight + cExtraHeight;
  const scale = requestedExtra > 0 ? Math.min(1, remaining / requestedExtra) : 0;
  g += Math.min(gd - gmin, Math.floor((gExtraHeight * scale + 1e-8) / gf));
  c += Math.min(cd - cmin, Math.floor((cExtraHeight * scale + 1e-8) / cf));

  remaining = availableHeight - g * gf - c * cf;
  while (remaining + 1e-8 >= Math.min(gf, cf) && (g < gd || c < cd)) {
    const gCan = g < gd && remaining + 1e-8 >= gf;
    const cCan = c < cd && remaining + 1e-8 >= cf;
    if (!gCan && !cCan) break;
    const gRatio = g / gd;
    const cRatio = c / cd;
    const chooseGround = gCan && (!cCan || gRatio < cRatio || (gRatio === cRatio && String(ground.id) <= String(ceiling.id)));
    if (chooseGround) { g++; remaining -= gf; }
    else { c++; remaining -= cf; }
  }
  return { ground: Math.min(gd, g), ceiling: Math.min(cd, c) };
}

function collectorPairFloorCaps(ground, ceiling, availableHeight, dominant = 'ground') {
  const gf = Math.max(0.1, finite(ground.floorHeight, 3.15));
  const cf = Math.max(0.1, finite(ceiling.floorHeight, 3.15));
  const gd = Math.max(1, Math.floor(finite(ground.desiredFloors, 1)));
  const cd = Math.max(1, Math.floor(finite(ceiling.desiredFloors, 1)));
  const gmin = Math.max(1, Math.min(gd, Math.floor(finite(ground.minimumFloors, 1))));
  const cmin = Math.max(1, Math.min(cd, Math.floor(finite(ceiling.minimumFloors, 1))));
  let g = gmin, c = cmin;
  let remaining = Math.max(0, availableHeight - g * gf - c * cf);
  const spend = side => {
    const isGround = side === 'ground';
    const step = isGround ? gf : cf;
    const desired = isGround ? gd : cd;
    while (remaining + 1e-8 >= step && (isGround ? g : c) < desired) {
      if (isGround) g++; else c++;
      remaining -= step;
    }
  };
  spend(dominant);
  spend(dominant === 'ground' ? 'ceiling' : 'ground');
  return { ground: Math.min(gd, g), ceiling: Math.min(cd, c) };
}

function routeDemandScore(plan) {
  let score = Math.max(0, Math.min(1, finite(plan?.routeDemandScore, 0)));
  if (plan?.routeRole === 'transfer') score += 0.14;
  if (plan?.absorbedInterveningTower === true) score += 0.12;
  return Math.max(0, Math.min(1, score));
}

function sectionDecisionForPair(ground, ceiling, stableKey = null) {
  const h = stableHash(`${stableKey ?? 'section'}:${ground.id}:${ceiling.id}`);
  const u = h / 0xffffffff;
  const groundRouteScore = routeDemandScore(ground);
  const ceilingRouteScore = routeDemandScore(ceiling);
  const maxRoute = Math.max(groundRouteScore, ceilingRouteScore);
  const minRoute = Math.min(groundRouteScore, ceilingRouteScore);
  let archetype;
  let routeDriven = false;

  if (maxRoute >= 0.34) {
    routeDriven = true;
    if (groundRouteScore >= 0.60 && groundRouteScore > ceilingRouteScore + 0.13) archetype = 'upright-collector';
    else if (ceilingRouteScore >= 0.60 && ceilingRouteScore > groundRouteScore + 0.13) archetype = 'hanging-collector';
    else if (minRoute >= 0.36 || Math.abs(groundRouteScore - ceilingRouteScore) <= 0.12) archetype = 'midsection-braid';
    else archetype = groundRouteScore > ceilingRouteScore ? 'upright-collector' : 'hanging-collector';
  } else {
    if (!stableKey) archetype = 'midsection-braid';
    else if (u < 0.24) archetype = 'upright-collector';
    else if (u < 0.48) archetype = 'hanging-collector';
    else if (u < 0.82) archetype = 'midsection-braid';
    else archetype = 'central-void';
  }
  return Object.freeze({ archetype, routeDriven, groundRouteScore, ceilingRouteScore });
}

function pairFloorCaps(ground, ceiling, availableHeight, archetype) {
  if (archetype === 'upright-collector') return collectorPairFloorCaps(ground, ceiling, availableHeight, 'ground');
  if (archetype === 'hanging-collector') return collectorPairFloorCaps(ground, ceiling, availableHeight, 'ceiling');
  if (archetype === 'central-void') {
    const gf = Math.max(0.1, finite(ground.floorHeight, 3.15));
    const cf = Math.max(0.1, finite(ceiling.floorHeight, 3.15));
    const gmin = Math.max(1, Math.floor(finite(ground.minimumFloors, 1)));
    const cmin = Math.max(1, Math.floor(finite(ceiling.minimumFloors, 1)));
    const minimumHeight = gmin * gf + cmin * cf;
    const voidBiasedHeight = Math.max(minimumHeight, availableHeight * 0.78);
    return balancedPairFloorCaps(ground, ceiling, voidBiasedHeight);
  }
  return balancedPairFloorCaps(ground, ceiling, availableHeight);
}

export function reconcileCavernFloorBudgets({
  groundPlans = [],
  ceilingPlans = [],
  ceilingY = 34.02,
  verticalClearance = 0.72,
  sharedReserve = 1.35,
  claimMargin = 2.40,
  stableKey = null,
} = {}) {
  const usableHeight = Math.max(0.2, finite(ceilingY, 34.02) - Math.max(0, finite(verticalClearance)) - Math.max(0, finite(sharedReserve)));
  const ground = groundPlans.map(plan => ({ ...plan, horizontal: normalizedBounds(plan.bounds, claimMargin) }));
  const ceiling = ceilingPlans.map(plan => ({ ...plan, horizontal: normalizedBounds(plan.bounds, claimMargin) }));
  const gFloors = new Map(ground.map(plan => [String(plan.id), Math.max(1, Math.floor(finite(plan.desiredFloors, 1)))]));
  const cFloors = new Map(ceiling.map(plan => [String(plan.id), Math.max(1, Math.floor(finite(plan.desiredFloors, 1)))]));
  const gBlockers = new Map(ground.map(plan => [String(plan.id), new Set()]));
  const cBlockers = new Map(ceiling.map(plan => [String(plan.id), new Set()]));
  const gArchetypes = new Map(ground.map(plan => [String(plan.id), new Set()]));
  const cArchetypes = new Map(ceiling.map(plan => [String(plan.id), new Set()]));
  const overlapsResolved = [];
  const archetypeCounts = new Map();
  let routeDrivenPairs = 0;
  let absorbedRoutePairs = 0;

  for (const g of ground) {
    if (!g.horizontal) continue;
    for (const c of ceiling) {
      if (!c.horizontal || !overlaps(g.horizontal, c.horizontal)) continue;
      const sectionDecision = sectionDecisionForPair(g, c, stableKey);
      const sectionArchetype = sectionDecision.archetype;
      const caps = pairFloorCaps(g, c, usableHeight, sectionArchetype);
      gFloors.set(String(g.id), Math.min(gFloors.get(String(g.id)), caps.ground));
      cFloors.set(String(c.id), Math.min(cFloors.get(String(c.id)), caps.ceiling));
      gBlockers.get(String(g.id)).add(String(c.id));
      cBlockers.get(String(c.id)).add(String(g.id));
      gArchetypes.get(String(g.id)).add(sectionArchetype);
      cArchetypes.get(String(c.id)).add(sectionArchetype);
      archetypeCounts.set(sectionArchetype, (archetypeCounts.get(sectionArchetype) ?? 0) + 1);
      if (sectionDecision.routeDriven) routeDrivenPairs++;
      if (g.absorbedInterveningTower === true || c.absorbedInterveningTower === true) absorbedRoutePairs++;
      overlapsResolved.push(Object.freeze({
        groundId: String(g.id), ceilingId: String(c.id),
        groundCap: caps.ground, ceilingCap: caps.ceiling,
        sectionArchetype,
        routeDriven: sectionDecision.routeDriven,
        groundRouteScore: sectionDecision.groundRouteScore,
        ceilingRouteScore: sectionDecision.ceilingRouteScore,
        absorbedInterveningTower: g.absorbedInterveningTower === true || c.absorbedInterveningTower === true,
      }));
    }
  }

  const groundDecisions = new Map(ground.map(plan => [String(plan.id), freezeDecision(
    plan, gFloors.get(String(plan.id)), gBlockers.get(String(plan.id)), plan.horizontal, gArchetypes.get(String(plan.id)),
  )]));
  const ceilingDecisions = new Map(ceiling.map(plan => [String(plan.id), freezeDecision(
    plan, cFloors.get(String(plan.id)), cBlockers.get(String(plan.id)), plan.horizontal, cArchetypes.get(String(plan.id)),
  )]));
  return Object.freeze({
    schema: CAVERN_JOINT_SYNTHESIS_SCHEMA,
    usableHeight,
    ground: groundDecisions,
    ceiling: ceilingDecisions,
    overlaps: Object.freeze(overlapsResolved),
    metrics: Object.freeze({
      groundPlans: ground.length,
      ceilingPlans: ceiling.length,
      overlaps: overlapsResolved.length,
      routeDrivenPairs,
      absorbedRoutePairs,
      groundRetained: groundDecisions.size,
      ceilingRetained: ceilingDecisions.size,
      sectionArchetypes: Object.freeze([...archetypeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([archetype, count]) => Object.freeze({ archetype, count }))),
    }),
  });
}
