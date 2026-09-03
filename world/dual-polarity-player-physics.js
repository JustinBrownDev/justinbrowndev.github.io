import { createPlayerPhysics } from '../player-physics.js';
import { HANGING_CITY_CEILING_Y } from './hanging-city-topology.js';

function containsPortal(portal, x, z, margin = 0.12) {
  return Math.abs(x - portal.x) <= portal.hx + margin && Math.abs(z - portal.z) <= portal.hz + margin;
}

export function createDualPolarityPlayerPhysics(options = {}) {
  if (!options.position) throw new Error('createDualPolarityPlayerPhysics requires position');
  const worldPosition = options.position;
  const eyeHeight = options.eyeHeight ?? 1.65;
  const ground = createPlayerPhysics(options);
  const invertedPosition = { x: 1e9, y: eyeHeight, z: 1e9 };
  const inverted = createPlayerPhysics({
    ...options,
    position: invertedPosition,
    buildingWallSegments: new Map(),
    propColliders: [],
    elevatedPlatforms: [],
    rampRuns: [],
    overheadCeilings: [],
  });

  const ownerFrame = new Map();
  const polarityPortals = new Map();
  let verticalPolarity = 1;
  let activeAnchorY = HANGING_CITY_CEILING_Y;
  let transitionCooldown = 0;

  function activeController() { return verticalPolarity < 0 ? inverted : ground; }
  function syncWorldFromInverted() {
    worldPosition.x = invertedPosition.x;
    worldPosition.z = invertedPosition.z;
    worldPosition.y = activeAnchorY - invertedPosition.y;
  }
  function syncInvertedFromWorld(anchorY = activeAnchorY) {
    activeAnchorY = anchorY;
    invertedPosition.x = worldPosition.x;
    invertedPosition.z = worldPosition.z;
    invertedPosition.y = activeAnchorY - worldPosition.y;
  }
  function nearestPortal(mode) {
    let best = null;
    let bestD2 = Infinity;
    const state = mode < 0 ? inverted.getState() : ground.getState();
    for (const portal of polarityPortals.values()) {
      if (!containsPortal(portal, worldPosition.x, worldPosition.z)) continue;
      const target = mode < 0 ? portal.hangingLocalFeetY : portal.hangingWorldFeetY;
      if (state.feetY < target - 0.10 || state.feetY > target + 0.35) continue;
      const dx = worldPosition.x - portal.x;
      const dz = worldPosition.z - portal.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = portal; bestD2 = d2; }
    }
    return best;
  }
  function enterHanging(portal) {
    verticalPolarity = -1;
    activeAnchorY = portal.anchorY;
    invertedPosition.x = worldPosition.x;
    invertedPosition.z = worldPosition.z;
    invertedPosition.y = portal.hangingLocalFeetY + eyeHeight;
    inverted.syncFromPosition({ forceAirborne: false, resetVelocity: true, allowLastSafeFallback: false });
    syncWorldFromInverted();
    transitionCooldown = 0.75;
  }
  function enterGround(portal) {
    verticalPolarity = 1;
    worldPosition.x = invertedPosition.x;
    worldPosition.z = invertedPosition.z;
    worldPosition.y = portal.hangingWorldFeetY + eyeHeight;
    ground.syncFromPosition({ forceAirborne: false, resetVelocity: true, allowLastSafeFallback: false });
    invertedPosition.x = 1e9;
    invertedPosition.z = 1e9;
    invertedPosition.y = eyeHeight;
    transitionCooldown = 0.75;
  }

  function registerOwnedWorld(ownerId, data = {}, lifecycle = {}) {
    const frame = data?.verticalFrame;
    if (frame?.verticalPolarity === -1) {
      if (Number.isFinite(frame.anchorY) && Math.abs(frame.anchorY - HANGING_CITY_CEILING_Y) > 1e-6) {
        throw new Error(`hanging physics owner ${ownerId} uses unsupported anchor ${frame.anchorY}`);
      }
      ownerFrame.set(ownerId, -1);
      for (const portal of data.polarityPortals ?? []) polarityPortals.set(portal.id, portal);
      return inverted.registerOwnedWorld(ownerId, data, lifecycle);
    }
    ownerFrame.set(ownerId, 1);
    for (const portal of data.polarityPortals ?? []) polarityPortals.set(portal.id, portal);
    return ground.registerOwnedWorld(ownerId, data, lifecycle);
  }
  function unregisterOwnedWorld(ownerId) {
    const polarity = ownerFrame.get(ownerId) ?? 1;
    ownerFrame.delete(ownerId);
    for (const [id, portal] of polarityPortals) {
      if (portal.ownerId === ownerId) polarityPortals.delete(id);
    }
    return (polarity < 0 ? inverted : ground).unregisterOwnedWorld(ownerId);
  }
  function appendOwnedWorldItem(ownerId, kind, item) {
    return (ownerFrame.get(ownerId) < 0 ? inverted : ground).appendOwnedWorldItem(ownerId, kind, item);
  }
  function step(deltaSeconds, wishVelocityX = 0, wishVelocityZ = 0) {
    transitionCooldown = Math.max(0, transitionCooldown - Math.max(0, Number(deltaSeconds) || 0));
    if (verticalPolarity < 0) {
      inverted.step(deltaSeconds, wishVelocityX, wishVelocityZ);
      syncWorldFromInverted();
      if (transitionCooldown <= 0) {
        const portal = nearestPortal(-1);
        if (portal) enterGround(portal);
      }
    } else {
      ground.step(deltaSeconds, wishVelocityX, wishVelocityZ);
      if (transitionCooldown <= 0) {
        const portal = nearestPortal(1);
        if (portal) enterHanging(portal);
      }
    }
    return getState();
  }
  function bufferJump() { return activeController().bufferJump(); }
  function syncFromPosition(opts = {}) {
    if (verticalPolarity < 0) {
      syncInvertedFromWorld();
      const state = inverted.syncFromPosition(opts);
      syncWorldFromInverted();
      return { ...state, verticalPolarity, frameAnchorY: activeAnchorY };
    }
    return ground.syncFromPosition(opts);
  }
  function syncDynamicWorld() {
    const a = ground.syncDynamicWorld();
    const b = inverted.syncDynamicWorld();
    return { ground: a, hanging: b };
  }
  function retryDeferredOwnedWorld(opts) {
    return { ground: ground.retryDeferredOwnedWorld(opts), hanging: inverted.retryDeferredOwnedWorld(opts) };
  }
  function compactOwnedWorld() {
    return { ground: ground.compactOwnedWorld(), hanging: inverted.compactOwnedWorld() };
  }
  function ownedWorldStats() {
    const a = ground.ownedWorldStats();
    const b = inverted.ownedWorldStats();
    return {
      owners: a.owners + b.owners,
      activeOwners: a.activeOwners + b.activeOwners,
      inactiveOwners: a.inactiveOwners + b.inactiveOwners,
      activeItems: a.activeItems + b.activeItems,
      totalItems: a.totalItems + b.totalItems,
      deferredItems: a.deferredItems + b.deferredItems,
      deferredOwners: a.deferredOwners + b.deferredOwners,
      frames: { ground: a, hanging: b },
    };
  }
  function getState() {
    const state = activeController().getState();
    return { ...state, verticalPolarity, frameAnchorY: verticalPolarity < 0 ? activeAnchorY : null };
  }
  function supportHeightAt(x, z, atFeetY) {
    if (verticalPolarity < 0) return inverted.supportHeightAt(x, z, atFeetY);
    return ground.supportHeightAt(x, z, atFeetY);
  }
  function poseIsValid(x, z, atFeetY) {
    return activeController().poseIsValid(x, z, atFeetY);
  }
  function probeControllerPath(args) { return activeController().probeControllerPath(args); }

  return {
    step, bufferJump, syncFromPosition, syncDynamicWorld,
    registerOwnedWorld, appendOwnedWorldItem, unregisterOwnedWorld,
    retryDeferredOwnedWorld, compactOwnedWorld, ownedWorldStats,
    getState, supportHeightAt, poseIsValid, probeControllerPath,
  };
}
