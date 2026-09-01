export const EXTERIOR_STREET_LAYER_POLICY_SCHEMA = 'jweb.exterior-street-layer-policy.v1';

export const EXTERIOR_CIRCULATION_DEBT = Object.freeze([
  Object.freeze({
    tag: 'CIRC_DEBT_REAL_ROOM_AUTHORITY',
    meaning: 'skeleton still models module-floor pseudo-occupancies instead of full room ownership',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_CROSS_COMPOUND_STREETS',
    meaning: 'street-layer v1 shares transport inside one compound facade; cross-compound balcony streets remain future work',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_SWITCHBACK_REALIZER',
    meaning: 'switchback fire-escape composition remains parked; v1 uses straight alternating wall trunks',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_INTERIOR_EGRESS',
    meaning: 'exterior connectivity does not yet prove realistic interior-room-to-door routes in skeleton',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_GLOBAL_ROUTE_OPTIMIZATION',
    meaning: 'street-layer v1 makes deterministic local choices rather than globally minimizing block connector count',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_STANDALONE_FIRE_ESCAPE_HEADROOM',
    meaning: 'street-layer trunks carve headroom throats; standalone legacy fire escapes still need the same landing-void migration',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_FULL_BUILDER_PARITY',
    meaning: 'browser skeleton is the restored path; the richer full builder still has independent circulation composition',
  }),
]);

function sortedUniqueFloors(values, minFloor, maxFloor) {
  return [...new Set((values ?? [])
    .map(Number)
    .filter(value => Number.isInteger(value) && value >= minFloor && value <= maxFloor))]
    .sort((a, b) => a - b);
}

/**
 * Exterior circulation is planned as stacked street layers, not one staircase per door.
 * Existing bridge/catwalk portals consume the exterior-connection budget first.
 * Remaining occupancy doors are sparse attachments to the transport layers.
 */
export function planExteriorStreetLayerPolicy({
  floors,
  existingPortalFloors = [],
  maxLayers = 4,
  maxExteriorConnections = 2,
} = {}) {
  const floorCount = Math.max(1, Math.floor(Number(floors) || 1));
  const upperFloor = Math.max(0, floorCount - 1);
  if (upperFloor < 1) {
    return Object.freeze({
      schema: EXTERIOR_STREET_LAYER_POLICY_SCHEMA,
      layerFloors: Object.freeze([]),
      existingPortalFloors: Object.freeze([]),
      occupancyPortalFloors: Object.freeze([]),
      maxExteriorConnections: Math.max(1, Math.floor(Number(maxExteriorConnections) || 2)),
      debtTags: Object.freeze(EXTERIOR_CIRCULATION_DEBT.map(item => item.tag)),
    });
  }

  const layerTop = Math.min(upperFloor, Math.max(1, Math.floor(Number(maxLayers) || 4)));
  // v1 intentionally keeps neighboring layers contiguous. Vertical edges connect
  // street layer N only to N-1 / N+1 rather than jumping directly to occupancies.
  const layerFloors = Array.from({ length: layerTop }, (_, index) => index + 1);
  const existing = sortedUniqueFloors(existingPortalFloors, 1, layerTop);
  const connectionBudget = Math.max(1, Math.floor(Number(maxExteriorConnections) || 2));
  const remainingDoorBudget = Math.max(0, connectionBudget - existing.length);

  const candidateDoors = [];
  if (!existing.includes(1)) candidateDoors.push(1);
  if (layerTop > 1 && !existing.includes(layerTop)) candidateDoors.push(layerTop);
  for (let floor = 2; floor < layerTop; floor++) {
    if (!existing.includes(floor)) candidateDoors.push(floor);
  }
  const occupancyPortalFloors = candidateDoors.slice(0, remainingDoorBudget);

  return Object.freeze({
    schema: EXTERIOR_STREET_LAYER_POLICY_SCHEMA,
    layerFloors: Object.freeze(layerFloors),
    existingPortalFloors: Object.freeze(existing),
    occupancyPortalFloors: Object.freeze(occupancyPortalFloors),
    maxExteriorConnections: connectionBudget,
    debtTags: Object.freeze(EXTERIOR_CIRCULATION_DEBT.map(item => item.tag)),
  });
}
