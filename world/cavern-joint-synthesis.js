import { HANGING_CITY_CEILING_Y } from './hanging-city-topology.js';

export const CAVERN_JOINT_SYNTHESIS_SCHEMA = 'jweb.cavern-joint-synthesis.v5';

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

function normalizedClaims(plan, margin = 0) {
  const source = Array.isArray(plan?.claimBounds) && plan.claimBounds.length
    ? plan.claimBounds
    : [plan?.bounds];
  return Object.freeze(source.map(raw => normalizedBounds(raw, margin)).filter(Boolean));
}

function claimsOverlap(a, b) {
  if (!a?.length || !b?.length) return false;
  for (const left of a) for (const right of b) if (overlaps(left, right)) return true;
  return false;
}

function planFloors(plan) {
  const floorHeight = Math.max(0.1, finite(plan?.floorHeight, 3.15));
  const rawMinimumFloors = Math.max(1, Math.floor(finite(plan?.minimumFloors, 1)));
  const rawMaximumFloors = Number.isFinite(Number(plan?.maximumFloors))
    ? Math.max(rawMinimumFloors, Math.floor(Number(plan.maximumFloors)))
    : Number.MAX_SAFE_INTEGER;
  const desiredFloors = Math.min(
    rawMaximumFloors,
    Math.max(rawMinimumFloors, Math.floor(finite(plan?.desiredFloors, rawMinimumFloors))),
  );
  const minimumFloors = Math.min(desiredFloors, rawMinimumFloors);
  return { floorHeight, desiredFloors, minimumFloors, maximumFloors: rawMaximumFloors };
}

function freezeDecision(plan, floors, blockers, horizontal, sectionArchetypes = []) {
  const { floorHeight, desiredFloors, minimumFloors, maximumFloors } = planFloors(plan);
  // Section archetypes may promote a viable building above its ordinary request,
  // but never above the floor-count capacity supplied by architectural massing.
  // This keeps collectors and braids while preventing a one-cell leftover site
  // from being stretched into a cavern-height circulation stick.
  const acceptedFloors = Math.min(
    maximumFloors,
    Math.max(minimumFloors, Math.floor(finite(floors, desiredFloors))),
  );
  return Object.freeze({
    id: String(plan.id),
    desiredFloors,
    minimumFloors,
    maximumFloors: Number.isSafeInteger(maximumFloors) ? maximumFloors : null,
    floors: acceptedFloors,
    capacityLimitedPromotion: Number.isFinite(Number(plan?.maximumFloors)) && acceptedFloors >= maximumFloors,
    promotedFloors: Math.max(0, acceptedFloors - desiredFloors),
    floorHeight,
    desiredHeight: desiredFloors * floorHeight,
    occupiedHeight: acceptedFloors * floorHeight,
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
  const g = planFloors(ground);
  const c = planFloors(ceiling);
  if (g.desiredFloors * g.floorHeight + c.desiredFloors * c.floorHeight <= availableHeight + 1e-8) {
    return { ground: g.desiredFloors, ceiling: c.desiredFloors };
  }

  let gfloors = g.minimumFloors;
  let cfloors = c.minimumFloors;
  let remaining = Math.max(0, availableHeight - gfloors * g.floorHeight - cfloors * c.floorHeight);
  const gExtraHeight = Math.max(0, (g.desiredFloors - gfloors) * g.floorHeight);
  const cExtraHeight = Math.max(0, (c.desiredFloors - cfloors) * c.floorHeight);
  const requestedExtra = gExtraHeight + cExtraHeight;
  const scale = requestedExtra > 0 ? Math.min(1, remaining / requestedExtra) : 0;
  gfloors += Math.min(g.desiredFloors - gfloors, Math.floor((gExtraHeight * scale + 1e-8) / g.floorHeight));
  cfloors += Math.min(c.desiredFloors - cfloors, Math.floor((cExtraHeight * scale + 1e-8) / c.floorHeight));

  remaining = availableHeight - gfloors * g.floorHeight - cfloors * c.floorHeight;
  while (remaining + 1e-8 >= Math.min(g.floorHeight, c.floorHeight)
      && (gfloors < g.desiredFloors || cfloors < c.desiredFloors)) {
    const gCan = gfloors < g.desiredFloors && remaining + 1e-8 >= g.floorHeight;
    const cCan = cfloors < c.desiredFloors && remaining + 1e-8 >= c.floorHeight;
    if (!gCan && !cCan) break;
    const gRatio = gfloors / g.desiredFloors;
    const cRatio = cfloors / c.desiredFloors;
    const chooseGround = gCan && (!cCan || gRatio < cRatio || (gRatio === cRatio && String(ground.id) <= String(ceiling.id)));
    if (chooseGround) { gfloors++; remaining -= g.floorHeight; }
    else { cfloors++; remaining -= c.floorHeight; }
  }
  return { ground: Math.min(g.desiredFloors, gfloors), ceiling: Math.min(c.desiredFloors, cfloors) };
}

function collectorPairFloorTargets(ground, ceiling, availableHeight, dominant = 'ground') {
  const g = planFloors(ground);
  const c = planFloors(ceiling);
  const dominantStats = dominant === 'ground' ? g : c;
  const minorStats = dominant === 'ground' ? c : g;
  // A collector is one long architectural reach opposed by a normal shorter
  // building, not two randomly short towers carrying a collector label. Keep the
  // minor side close to its ordinary desire (capped to ~28% of the section), then
  // spend the remaining safe section on the dominant tower.
  const minorHeightBudget = Math.max(
    minorStats.minimumFloors * minorStats.floorHeight,
    Math.min(minorStats.desiredFloors * minorStats.floorHeight, availableHeight * 0.28),
  );
  let minorFloors = Math.max(
    minorStats.minimumFloors,
    Math.floor((minorHeightBudget + 1e-8) / minorStats.floorHeight),
  );
  minorFloors = Math.min(minorStats.maximumFloors, minorFloors);
  let dominantFloors = Math.min(
    dominantStats.maximumFloors,
    Math.max(
      dominantStats.minimumFloors,
      Math.floor((availableHeight - minorFloors * minorStats.floorHeight + 1e-8) / dominantStats.floorHeight),
    ),
  );
  while (dominantFloors * dominantStats.floorHeight + minorFloors * minorStats.floorHeight > availableHeight + 1e-8
      && minorFloors > minorStats.minimumFloors) minorFloors--;
  while (dominantFloors * dominantStats.floorHeight + minorFloors * minorStats.floorHeight > availableHeight + 1e-8
      && dominantFloors > dominantStats.minimumFloors) dominantFloors--;
  return dominant === 'ground'
    ? { ground: dominantFloors, ceiling: minorFloors }
    : { ground: minorFloors, ceiling: dominantFloors };
}

function braidPairFloorTargets(ground, ceiling, availableHeight, stableKey = null) {
  const g = planFloors(ground);
  const c = planFloors(ceiling);
  const h = stableHash(`${stableKey ?? 'section'}:${ground.id}:${ceiling.id}:braid-balance`);
  const ratio = 0.46 + (h / 0xffffffff) * 0.08;
  let gfloors = Math.min(g.maximumFloors, Math.max(g.minimumFloors, Math.floor((availableHeight * ratio + 1e-8) / g.floorHeight)));
  let cfloors = Math.min(c.maximumFloors, Math.max(c.minimumFloors, Math.floor((availableHeight - gfloors * g.floorHeight + 1e-8) / c.floorHeight)));
  while (gfloors * g.floorHeight + cfloors * c.floorHeight > availableHeight + 1e-8) {
    const gFlex = gfloors - g.minimumFloors;
    const cFlex = cfloors - c.minimumFloors;
    if (gFlex <= 0 && cFlex <= 0) break;
    if (gFlex * g.floorHeight >= cFlex * c.floorHeight && gFlex > 0) gfloors--;
    else if (cFlex > 0) cfloors--;
    else gfloors--;
  }
  return { ground: gfloors, ceiling: cfloors };
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

function pairFloorTargets(ground, ceiling, availableHeight, archetype, stableKey = null) {
  if (archetype === 'upright-collector') return collectorPairFloorTargets(ground, ceiling, availableHeight, 'ground');
  if (archetype === 'hanging-collector') return collectorPairFloorTargets(ground, ceiling, availableHeight, 'ceiling');
  if (archetype === 'central-void') {
    const g = planFloors(ground);
    const c = planFloors(ceiling);
    const minimumHeight = g.minimumFloors * g.floorHeight + c.minimumFloors * c.floorHeight;
    const voidBiasedHeight = Math.max(minimumHeight, availableHeight * 0.78);
    return balancedPairFloorCaps(ground, ceiling, voidBiasedHeight);
  }
  return braidPairFloorTargets(ground, ceiling, availableHeight, stableKey);
}

function trimPairToHeight(ground, ceiling, groundFloors, ceilingFloors, heightLimit, archetype) {
  const g = planFloors(ground);
  const c = planFloors(ceiling);
  let gfloors = Math.min(g.maximumFloors, Math.max(g.minimumFloors, Math.floor(finite(groundFloors, g.desiredFloors))));
  let cfloors = Math.min(c.maximumFloors, Math.max(c.minimumFloors, Math.floor(finite(ceilingFloors, c.desiredFloors))));
  const occupied = () => gfloors * g.floorHeight + cfloors * c.floorHeight;
  const trimSide = side => {
    if (side === 'ground' && gfloors > g.minimumFloors) { gfloors--; return true; }
    if (side === 'ceiling' && cfloors > c.minimumFloors) { cfloors--; return true; }
    return false;
  };
  while (occupied() > heightLimit + 1e-8) {
    let changed = false;
    if (archetype === 'upright-collector') changed = trimSide('ceiling') || trimSide('ground');
    else if (archetype === 'hanging-collector') changed = trimSide('ground') || trimSide('ceiling');
    else {
      const gFlexibleHeight = Math.max(0, gfloors - g.minimumFloors) * g.floorHeight;
      const cFlexibleHeight = Math.max(0, cfloors - c.minimumFloors) * c.floorHeight;
      changed = gFlexibleHeight >= cFlexibleHeight
        ? (trimSide('ground') || trimSide('ceiling'))
        : (trimSide('ceiling') || trimSide('ground'));
    }
    if (!changed) break;
  }
  return { ground: gfloors, ceiling: cfloors };
}

export function reconcileCavernFloorBudgets({
  groundPlans = [],
  ceilingPlans = [],
  ceilingY = HANGING_CITY_CEILING_Y,
  verticalClearance = 0.72,
  sharedReserve = 1.35,
  claimMargin = 2.40,
  stableKey = null,
} = {}) {
  const usableHeight = Math.max(0.2, finite(ceilingY, HANGING_CITY_CEILING_Y) - Math.max(0, finite(verticalClearance)) - Math.max(0, finite(sharedReserve)));
  const ground = groundPlans.map(plan => ({
    ...plan,
    horizontal: normalizedBounds(plan.bounds, claimMargin),
    claims: normalizedClaims(plan, claimMargin),
  }));
  const ceiling = ceilingPlans.map(plan => ({
    ...plan,
    horizontal: normalizedBounds(plan.bounds, claimMargin),
    claims: normalizedClaims(plan, claimMargin),
  }));
  const gFloors = new Map(ground.map(plan => [String(plan.id), planFloors(plan).desiredFloors]));
  const cFloors = new Map(ceiling.map(plan => [String(plan.id), planFloors(plan).desiredFloors]));
  const gBlockers = new Map(ground.map(plan => [String(plan.id), new Set()]));
  const cBlockers = new Map(ceiling.map(plan => [String(plan.id), new Set()]));
  const gArchetypes = new Map(ground.map(plan => [String(plan.id), new Set()]));
  const cArchetypes = new Map(ceiling.map(plan => [String(plan.id), new Set()]));
  const pairRecords = [];
  const archetypeCounts = new Map();
  let routeDrivenPairs = 0;
  let absorbedRoutePairs = 0;

  // First author a real sectional target. Non-void archetypes may promote mass
  // above ordinary random desires; central-void can only trim. This is the step
  // v3 lacked, which is why a 4x taller cavern still read as two short cities.
  for (const g of ground) {
    if (!g.horizontal) continue;
    for (const c of ceiling) {
      if (!c.horizontal || !claimsOverlap(g.claims, c.claims)) continue;
      const sectionDecision = sectionDecisionForPair(g, c, stableKey);
      const sectionArchetype = sectionDecision.archetype;
      const targets = pairFloorTargets(g, c, usableHeight, sectionArchetype, stableKey);
      const gId = String(g.id), cId = String(c.id);
      if (sectionArchetype === 'central-void') {
        gFloors.set(gId, Math.min(gFloors.get(gId), targets.ground));
        cFloors.set(cId, Math.min(cFloors.get(cId), targets.ceiling));
      } else {
        const gMaximum = planFloors(g).maximumFloors;
        const cMaximum = planFloors(c).maximumFloors;
        gFloors.set(gId, Math.min(gMaximum, Math.max(gFloors.get(gId), targets.ground)));
        cFloors.set(cId, Math.min(cMaximum, Math.max(cFloors.get(cId), targets.ceiling)));
      }
      gBlockers.get(gId).add(cId);
      cBlockers.get(cId).add(gId);
      gArchetypes.get(gId).add(sectionArchetype);
      cArchetypes.get(cId).add(sectionArchetype);
      archetypeCounts.set(sectionArchetype, (archetypeCounts.get(sectionArchetype) ?? 0) + 1);
      if (sectionDecision.routeDriven) routeDrivenPairs++;
      if (g.absorbedInterveningTower === true || c.absorbedInterveningTower === true) absorbedRoutePairs++;
      pairRecords.push({ g, c, sectionDecision, sectionArchetype, targets });
    }
  }

  // A building can overlap several opposing compounds. Combining their preferred
  // section targets can overbook the same vertical volume, so repair the shared
  // floor counts until every pair obeys the clearance budget. Floors only move
  // downward in this phase, making it deterministic and convergent.
  const maxPasses = Math.max(1, pairRecords.length * 3 + 6);
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const pair of pairRecords) {
      const gId = String(pair.g.id), cId = String(pair.c.id);
      const gBefore = gFloors.get(gId), cBefore = cFloors.get(cId);
      const gStats = planFloors(pair.g), cStats = planFloors(pair.c);
      const minimumHeight = gStats.minimumFloors * gStats.floorHeight + cStats.minimumFloors * cStats.floorHeight;
      const pairLimit = pair.sectionArchetype === 'central-void'
        ? Math.max(minimumHeight, usableHeight * 0.78)
        : usableHeight;
      const trimmed = trimPairToHeight(pair.g, pair.c, gBefore, cBefore, pairLimit, pair.sectionArchetype);
      if (trimmed.ground < gBefore) { gFloors.set(gId, trimmed.ground); changed = true; }
      if (trimmed.ceiling < cBefore) { cFloors.set(cId, trimmed.ceiling); changed = true; }
    }
    if (!changed) break;
  }

  const overlapsResolved = pairRecords.map(pair => {
    const gId = String(pair.g.id), cId = String(pair.c.id);
    const gRealized = gFloors.get(gId), cRealized = cFloors.get(cId);
    const gStats = planFloors(pair.g), cStats = planFloors(pair.c);
    const occupiedHeight = gRealized * gStats.floorHeight + cRealized * cStats.floorHeight;
    return Object.freeze({
      groundId: gId,
      ceilingId: cId,
      // Legacy names retained for existing diagnostics; these are now authored
      // pair targets rather than merely downward caps.
      groundCap: pair.targets.ground,
      ceilingCap: pair.targets.ceiling,
      groundTarget: pair.targets.ground,
      ceilingTarget: pair.targets.ceiling,
      groundRealized: gRealized,
      ceilingRealized: cRealized,
      occupiedHeight,
      residualGap: Math.max(0, finite(ceilingY, HANGING_CITY_CEILING_Y) - occupiedHeight),
      sectionFillRatio: usableHeight > 0 ? Math.min(1, occupiedHeight / usableHeight) : 0,
      sectionArchetype: pair.sectionArchetype,
      routeDriven: pair.sectionDecision.routeDriven,
      groundRouteScore: pair.sectionDecision.groundRouteScore,
      ceilingRouteScore: pair.sectionDecision.ceilingRouteScore,
      absorbedInterveningTower: pair.g.absorbedInterveningTower === true || pair.c.absorbedInterveningTower === true,
    });
  });

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
      promotedGroundPlans: [...groundDecisions.values()].filter(item => item.promotedFloors > 0).length,
      promotedCeilingPlans: [...ceilingDecisions.values()].filter(item => item.promotedFloors > 0).length,
      nearMeshPairs: overlapsResolved.filter(item => item.sectionArchetype !== 'central-void' && item.residualGap <= 5.5).length,
      groundRetained: groundDecisions.size,
      ceilingRetained: ceilingDecisions.size,
      sectionArchetypes: Object.freeze([...archetypeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([archetype, count]) => Object.freeze({ archetype, count }))),
    }),
  });
}
