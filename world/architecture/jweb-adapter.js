import { planBuildingSidecar } from './building-plan-sidecar.js';

function entranceAnchorsForEntity(entity, physics) {
  const connectors = physics?.semanticConnectors ?? [];
  const siteKey = entity?.semanticSiteKey;
  const result = [];
  for (const connector of connectors) {
    if (connector?.kind !== 'door') continue;
    const metadata = connector.metadata ?? {};
    const belongsByModule = entity?.footprintModules?.some(module => module.key === metadata.moduleKey);
    const belongsById = siteKey && String(connector.id ?? '').includes(String(siteKey));
    if (!belongsByModule && !belongsById) continue;
    const endpoint = connector.endpoints?.[0];
    if (!endpoint) continue;
    result.push({
      id: connector.id,
      kind: result.length ? 'secondary-entry' : 'main-entry',
      x: endpoint.x,
      z: endpoint.z,
      side: endpoint.side ?? metadata.side ?? null,
      floor: metadata.floor ?? Math.max(0, Math.round((endpoint.y || 0) / Math.max(0.01, entity.floorH || 3.15))),
      connectorId: connector.id,
    });
  }
  return result;
}

function signatureAnchors(signatureInstance) {
  if (!signatureInstance) return [];
  const anchors = [];
  if (signatureInstance.mainEntrance) anchors.push({
    id: `${signatureInstance.entityId ?? signatureInstance.type}:main-entry`,
    kind: 'main-entry',
    ...signatureInstance.mainEntrance,
    x: signatureInstance.mainEntrance.doorX,
    z: signatureInstance.mainEntrance.doorZ,
    floor: 0,
  });
  if (signatureInstance.secondaryEntrance) anchors.push({
    id: `${signatureInstance.entityId ?? signatureInstance.type}:secondary-entry`,
    kind: 'secondary-entry',
    ...signatureInstance.secondaryEntrance,
    x: signatureInstance.secondaryEntrance.doorX,
    z: signatureInstance.secondaryEntrance.doorZ,
    floor: 0,
  });
  return anchors;
}

/**
 * Build the pure sidecar input from a currently planned Kowloon entity.
 *
 * The adapter deliberately reads existing envelope/physical/connector truth.
 * It does not manufacture a second footprint, stair, or entrance authority.
 */
export function sidecarInputFromKowloon({
  worldSeed = 0,
  chunk,
  entity,
  physics,
  signatureInstance = null,
  programHint = null,
} = {}) {
  if (!chunk || !entity) throw new Error('sidecarInputFromKowloon requires chunk and entity');
  const connectorAnchors = entranceAnchorsForEntity(entity, physics);
  const authoredAnchors = signatureAnchors(signatureInstance);
  return {
    worldSeed,
    chunkKey: chunk.key,
    chunkX: chunk.x,
    chunkZ: chunk.z,
    distanceChunks: chunk.weirdness?.distanceChunks ?? Math.hypot(chunk.x || 0, chunk.z || 0),
    weirdnessSampled: chunk.weirdness?.sampled ?? 0,
    isSpawn: !!chunk.isSpawn,
    entityId: entity.id ?? `${chunk.key}:${entity.semanticSiteKey ?? 'building'}`,
    signatureType: signatureInstance?.type ?? entity.signatureType ?? null,
    programHint,
    physicalUse: entity.physicalUse,
    physicalTruth: entity.physicalTruth,
    floorHeight: entity.floorH,
    modules: entity.footprintModules ?? [],
    accessAnchors: authoredAnchors.length ? authoredAnchors : connectorAnchors,
    circulationReservations: physics?.circulationReservations ?? [],
  };
}

export function planKowloonEntitySidecar(context) {
  return planBuildingSidecar(sidecarInputFromKowloon(context));
}

/**
 * Integration seam for the eventual fabric cutover.
 *
 * Call after footprintModules + physical truth + connector reservations exist,
 * but before partition walls, slabs, generic windows, or semantic destinations
 * are emitted.  The returned floor spaces become the source of truth for those
 * downstream emitters.
 */
export function integrationPhase() {
  return Object.freeze({
    after: Object.freeze([
      'compound envelope/module planning',
      'physical-use classification',
      'resolved physical truth',
      'entrance/stair/bridge connector reservation',
    ]),
    before: Object.freeze([
      'partition-wall emission',
      'room/floor slab subdivision',
      'generic facade window emission',
      'semantic destination selection',
      'semantic prop placement',
    ]),
  });
}
