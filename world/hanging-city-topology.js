export const HANGING_CITY_SCHEMA = 'jweb.hanging-city.v2';
export const HANGING_CITY_FRAME_SCHEMA = 'jweb.vertical-traversal-frame.v2';
export const HANGING_CITY_VERTICAL_POLARITY = -1;
export const HANGING_CITY_FLOOR_HEIGHT = 3.15;
export const HANGING_CITY_ANCHOR_FLOORS = 18;
export const HANGING_CITY_CEILING_Y = HANGING_CITY_FLOOR_HEIGHT * HANGING_CITY_ANCHOR_FLOORS;

function hashString32(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(value).length; i++) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function hangingFrame(anchorY = HANGING_CITY_CEILING_Y) {
  return Object.freeze({
    schema: HANGING_CITY_FRAME_SCHEMA,
    id: `hanging-city-frame:${Number(anchorY).toFixed(3)}`,
    anchorY,
    verticalPolarity: HANGING_CITY_VERTICAL_POLARITY,
    localZeroRole: 'ceiling-street-plane',
    positiveLocalYDirection: 'world-down',
  });
}

export function planHangingCityCounterparts({
  worldSeed = 0,
  chunkKey = '0,0',
  sitePlans = [],
  groundEntities = [],
  weirdness = 0,
  floorHeight = HANGING_CITY_FLOOR_HEIGHT,
  anchorFloors = HANGING_CITY_ANCHOR_FLOORS,
} = {}) {
  const groundBySite = new Map(
    groundEntities
      .filter(entity => entity?.kind === 'building' && Number.isInteger(entity.siteId))
      .map(entity => [entity.siteId, entity]),
  );
  const w = clamp(Number(weirdness) || 0, 0, 1);
  const ceilingY = floorHeight * anchorFloors;
  const frame = hangingFrame(ceilingY);
  const counterparts = [];

  for (const plan of sitePlans) {
    if (!plan || plan.isPlaza) continue;
    const ground = groundBySite.get(plan.site?.id);
    if (!ground) continue;
    const groundFloors = Math.max(1, Math.floor(Number(ground.floors) || 1));
    const rng = mulberry32(hashString32(`${worldSeed}:hanging-city:${chunkKey}:${plan.signature ?? plan.site.id}`));
    const desiredFloors = clamp(4 + Math.floor(rng() * (5 + Math.round(w * 2))), 4, 10);
    const floorsUntilGroundRoof = Math.max(1, anchorFloors - groundFloors);

    // Collision authority is resolved before the second frame is generated.
    // If the natural hanging claim reaches the ground claim, there are not two
    // buildings to trim later. The site is promoted to one dual-polarity building.
    const dualPolarity = desiredFloors >= floorsUntilGroundRoof;
    const hangingFloors = dualPolarity ? floorsUntilGroundRoof : desiredFloors;
    const groundRoofY = groundFloors * floorHeight;
    const hangingTipY = ceilingY - hangingFloors * floorHeight;
    const gapFloors = anchorFloors - groundFloors - hangingFloors;
    if (hangingTipY < groundRoofY - 1e-8) {
      throw new Error(`${chunkKey}:${plan.site.id}: hanging claim overlaps ground claim after ownership resolution`);
    }

    const entityId = dualPolarity ? ground.id : `${ground.id}:hanging`;
    counterparts.push(Object.freeze({
      schema: HANGING_CITY_SCHEMA,
      siteId: plan.site.id,
      sourceSignature: plan.signature ?? String(plan.site.id),
      groundEntityId: ground.id,
      entityId,
      planEntityId: `${entityId}:frame-plan`,
      groundFloors,
      desiredFloors,
      hangingFloors,
      floorHeight,
      anchorFloors,
      ceilingY,
      groundRoofY,
      hangingTipY,
      gapFloors,
      dualPolarity,
      sharedSeamY: dualPolarity ? groundRoofY : null,
      collisionDecision: dualPolarity
        ? 'promote-single-dual-polarity-building'
        : 'independent-non-overlapping-building',
      frame,
    }));
  }

  return Object.freeze({
    schema: HANGING_CITY_SCHEMA,
    frame,
    ceilingY,
    floorHeight,
    anchorFloors,
    counterparts: Object.freeze(counterparts),
    dualPolarityCount: counterparts.filter(item => item.dualPolarity).length,
    independentCount: counterparts.filter(item => !item.dualPolarity).length,
  });
}

export function cloneBridgePlansForHangingFrame(bridgePlans = []) {
  return bridgePlans.map(plan => {
    const id = `${plan.id}:hanging`;
    const aEndpoint = { ...plan.aEndpoint, id: `${id}:endpoint:a`, bridgeId: id, resolved: false };
    const bEndpoint = { ...plan.bEndpoint, id: `${id}:endpoint:b`, bridgeId: id, resolved: false };
    delete aEndpoint.x; delete aEndpoint.y; delete aEndpoint.z;
    delete bEndpoint.x; delete bEndpoint.y; delete bEndpoint.z;
    return { ...plan, id, aEndpoint, bEndpoint, framePolarity: -1 };
  });
}

export function bridgePortalMapForPlans(bridgePlans = []) {
  const map = new Map();
  const add = (siteId, endpoint) => {
    if (!map.has(siteId)) map.set(siteId, []);
    map.get(siteId).push(endpoint);
  };
  for (const plan of bridgePlans) {
    add(plan.aSiteId, plan.aEndpoint);
    add(plan.bSiteId, plan.bEndpoint);
  }
  return map;
}

export function polarityPortalForCounterpart(counterpart, groundEntity) {
  if (!counterpart || !groundEntity) return null;
  const core = groundEntity.buildingPlan?.verticalCore?.reservation ?? null;
  const x = Number(core?.x ?? groundEntity.x);
  const z = Number(core?.z ?? groundEntity.z);
  const hx = Math.max(0.45, Number(core?.halfX) || 0.55);
  const hz = Math.max(0.45, Number(core?.halfZ) || 0.55);
  if (![x, z, counterpart.ceilingY, counterpart.hangingTipY].every(Number.isFinite)) return null;
  return Object.freeze({
    id: `${counterpart.entityId}:polarity-portal`,
    schema: 'jweb.polarity-portal.v1',
    x, z, hx, hz,
    anchorY: counterpart.ceilingY,
    groundFeetY: counterpart.groundRoofY,
    hangingWorldFeetY: counterpart.hangingTipY,
    hangingLocalFeetY: counterpart.hangingFloors * counterpart.floorHeight,
    dualPolarity: counterpart.dualPolarity,
    sharedSeamY: counterpart.sharedSeamY,
    sourceBuildingId: groundEntity.id,
    destinationBuildingId: counterpart.entityId,
    transitionKind: counterpart.dualPolarity ? 'shared-double-sided-floor' : 'vertical-service-shaft',
  });
}
