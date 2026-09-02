export const EXTERIOR_STREET_LAYER_POLICY_SCHEMA = 'jweb.exterior-street-layer-policy.v2';

export const EXTERIOR_CIRCULATION_DEBT = Object.freeze([
  Object.freeze({
    tag: 'CIRC_DEBT_CROSS_CHUNK_STREETS',
    meaning: 'street-layer v2 stitches transport surfaces inside one generated chunk; cross-chunk elevated street continuity remains future work',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_INTERIOR_EGRESS',
    meaning: 'exterior connectivity does not yet prove realistic interior-room-to-door routes in skeleton',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_GLOBAL_ROUTE_OPTIMIZATION',
    meaning: 'transport v2 uses deterministic greedy component stitching rather than globally minimizing the whole district connector graph',
  }),
  Object.freeze({
    tag: 'CIRC_DEBT_FULL_BUILDER_PARITY',
    meaning: 'browser skeleton owns the stacked exterior street graph; richer full-builder balcony composition still has independent feature authoring',
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
 * A clear roof may be promoted to the top street layer when it fits the local trunk.
 */
export function planExteriorStreetLayerPolicy({
  floors,
  existingPortalFloors = [],
  maxLayers = 5,
  maxExteriorConnections = 2,
  includeRoof = false,
} = {}) {
  const floorCount = Math.max(1, Math.floor(Number(floors) || 1));
  const highestOccupancyFloor = Math.max(0, floorCount - 1);
  const layerCap = Math.max(1, Math.floor(Number(maxLayers) || 5));
  const roofFitsLocalTrunk = includeRoof === true && floorCount <= layerCap;
  const requestedTop = roofFitsLocalTrunk ? floorCount : highestOccupancyFloor;
  const layerTop = Math.min(requestedTop, layerCap);
  if (layerTop < 1) {
    return Object.freeze({
      schema: EXTERIOR_STREET_LAYER_POLICY_SCHEMA,
      layerFloors: Object.freeze([]),
      existingPortalFloors: Object.freeze([]),
      occupancyPortalFloors: Object.freeze([]),
      roofFloor: null,
      maxExteriorConnections: Math.max(1, Math.floor(Number(maxExteriorConnections) || 2)),
      debtTags: Object.freeze(EXTERIOR_CIRCULATION_DEBT.map(item => item.tag)),
    });
  }

  const layerFloors = Array.from({ length: layerTop }, (_, index) => index + 1);
  const roofFloor = roofFitsLocalTrunk && layerTop === floorCount ? floorCount : null;
  const existing = sortedUniqueFloors(existingPortalFloors, 1, Math.min(highestOccupancyFloor, layerTop));
  const connectionBudget = Math.max(1, Math.floor(Number(maxExteriorConnections) || 2));
  const remainingDoorBudget = Math.max(0, connectionBudget - existing.length);

  const eligibleDoorFloors = layerFloors.filter(floor => floor <= highestOccupancyFloor && floor !== roofFloor);
  const candidateDoors = [];
  if (eligibleDoorFloors.includes(1) && !existing.includes(1)) candidateDoors.push(1);
  const highestDoorFloor = eligibleDoorFloors[eligibleDoorFloors.length - 1];
  if (highestDoorFloor > 1 && !existing.includes(highestDoorFloor)) candidateDoors.push(highestDoorFloor);
  for (const floor of eligibleDoorFloors) {
    if (floor !== 1 && floor !== highestDoorFloor && !existing.includes(floor)) candidateDoors.push(floor);
  }
  const occupancyPortalFloors = candidateDoors.slice(0, remainingDoorBudget);

  return Object.freeze({
    schema: EXTERIOR_STREET_LAYER_POLICY_SCHEMA,
    layerFloors: Object.freeze(layerFloors),
    existingPortalFloors: Object.freeze(existing),
    occupancyPortalFloors: Object.freeze(occupancyPortalFloors),
    roofFloor,
    maxExteriorConnections: connectionBudget,
    debtTags: Object.freeze(EXTERIOR_CIRCULATION_DEBT.map(item => item.tag)),
  });
}
