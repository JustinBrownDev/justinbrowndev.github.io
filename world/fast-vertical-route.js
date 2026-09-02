import { FACADE_STAIR_AUTHORITY_SCHEMA, planAlternatingFacadeStair } from './facade-stair-authority.js';

export const FAST_VERTICAL_ROUTE_SCHEMA = 'jweb.fast-vertical-route.v3';
const EPS = 1e-7;

function faceGeometry(fp, side) {
  if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
  const cx = Number(fp.cx), cz = Number(fp.cz), halfX = Number(fp.halfX), halfZ = Number(fp.halfZ);
  if (![cx, cz, halfX, halfZ].every(Number.isFinite) || halfX <= 0 || halfZ <= 0) return null;
  const horizontal = side === 'north' || side === 'south';
  const tangentAxis = horizontal ? 'x' : 'z';
  const normalAxis = horizontal ? 'z' : 'x';
  const tangentCenter = horizontal ? cx : cz;
  const tangentHalf = horizontal ? halfX : halfZ;
  const faceCoord = horizontal
    ? cz + (side === 'north' ? -halfZ : halfZ)
    : cx + (side === 'west' ? -halfX : halfX);
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  return Object.freeze({ horizontal, tangentAxis, normalAxis, tangentCenter, tangentHalf, faceCoord, outward });
}

function supportRecord(raw, fallback) {
  return Object.freeze({ ...(raw ?? fallback) });
}

function endpointLanding(id, role, y, support, generated, geometry = null, extra = null) {
  return Object.freeze({
    id, role, y, generated: generated === true, support,
    geometry: geometry ? Object.freeze({ ...geometry }) : null,
    ...(extra || {}),
  });
}

function flightNode(id, point, landingId, support) {
  return Object.freeze({ id, landingId, ...point, support });
}

function portalTangent(portal, side) {
  if (!portal) return null;
  const value = side === 'north' || side === 'south' ? Number(portal.x) : Number(portal.z);
  return Number.isFinite(value) ? value : null;
}

function accessDemandTangent(demand, side, { legacyExplicitPortal = false } = {}) {
  const rawPreferred = demand?.preferredTangent;
  const preferred = rawPreferred === null || rawPreferred === undefined ? NaN : Number(rawPreferred);
  if (Number.isFinite(preferred)) return preferred;
  if (demand?.placementAuthority === 'external-anchor' || legacyExplicitPortal) return portalTangent(demand?.portal, side);
  return null;
}

function facePointForTangent(geometry, tangent, y) {
  return Object.freeze(geometry.horizontal
    ? { x: tangent, y, z: geometry.faceCoord }
    : { x: geometry.faceCoord, y, z: tangent });
}

function rectPositiveOverlap(a, b) {
  return Math.abs(Number(a.x) - Number(b.x)) < Number(a.hx) + Number(b.hx) - EPS
    && Math.abs(Number(a.z) - Number(b.z)) < Number(a.hz) + Number(b.hz) - EPS;
}

function flightRect(flight) {
  const center = (Number(flight.from) + Number(flight.to)) * 0.5;
  const halfRun = Math.abs(Number(flight.to) - Number(flight.from)) * 0.5;
  return flight.axis === 'x'
    ? { x: center, z: flight.fixedCoord, hx: halfRun, hz: flight.halfWidth }
    : { x: flight.fixedCoord, z: center, hx: flight.halfWidth, hz: halfRun };
}

export function assertFastVerticalRoute(route) {
  if (!route || route.schema !== FAST_VERTICAL_ROUTE_SCHEMA) throw new Error('fast vertical route schema missing');
  if (route.geometryAuthority !== FACADE_STAIR_AUTHORITY_SCHEMA) throw new Error(`${route.id}: shared facade stair authority missing`);
  if (!Array.isArray(route.flights) || route.flights.length < 1) throw new Error(`${route.id}: every stair route requires at least one flight`);
  if (!Array.isArray(route.endpointLandings) || route.endpointLandings.length !== 2) throw new Error(`${route.id}: lower and upper endpoint landing semantics are required`);
  if (route.requiresLandingThroats !== false) throw new Error(`${route.id}: landing-routed stairs must never carve landings`);
  if (route.flightHeadroomClearances?.length !== route.flights.length) throw new Error(`${route.id}: every flight requires an independent headroom reservation`);

  const allLandings = route.landings ?? [];
  const nodeIds = new Set((route.nodes ?? []).map(node => node.id));
  const landingIds = new Set(allLandings.map(landing => landing.id));
  for (const landing of allLandings) {
    if (!landing.support) throw new Error(`${route.id}: landing support binding missing`);
    if (landing.generated && !landing.geometry) throw new Error(`${route.id}: generated landing requires real geometry`);
    if (landing.stairThroat) throw new Error(`${route.id}:${landing.id}: stair carved a landing`);
    if (landing.stairCarveAllowed !== false) throw new Error(`${route.id}:${landing.id}: landing must explicitly forbid stair carving`);
  }

  for (let i = 0; i < route.flights.length; i++) {
    const flight = route.flights[i];
    const lower = allLandings.find(landing => landing.id === flight.fromLandingId);
    const upper = allLandings.find(landing => landing.id === flight.toLandingId);
    if (!nodeIds.has(flight.fromNodeId) || !nodeIds.has(flight.toNodeId)) throw new Error(`${route.id}: flight endpoint node missing`);
    if (!landingIds.has(flight.fromLandingId) || !landingIds.has(flight.toLandingId)) throw new Error(`${route.id}: flight must connect landings`);
    if (!(flight.run > EPS) || !(flight.rise > EPS)) throw new Error(`${route.id}: flight must have positive run and rise`);
    if (flight.fitClassification !== 'fits-resolved-truth') throw new Error(`${route.id}: flight escaped physical truth fit`);
    if (!(flight.stairFlight?.stepCount >= 1)) throw new Error(`${route.id}: flight requires at least one realized step`);
    if (lower?.generated && rectPositiveOverlap(flightRect(flight), lower.geometry)) throw new Error(`${route.id}:${lower.id}: lower landing intersects stair`);
    if (upper?.generated && rectPositiveOverlap(flightRect(flight), upper.geometry)) throw new Error(`${route.id}:${upper.id}: upper landing intersects stair`);
    if (i > 0) {
      const previous = route.flights[i - 1];
      if (Math.sign(previous.to - previous.from) === Math.sign(flight.to - flight.from)) throw new Error(`${route.id}: stacked flights must reverse direction`);
      if (rectPositiveOverlap(flightRect(previous), flightRect(flight))) throw new Error(`${route.id}: stacked flights overlap and violate player headroom`);
      if (Math.abs(previous.fixedCoord - flight.fixedCoord) < previous.halfWidth + flight.halfWidth - EPS) {
        throw new Error(`${route.id}: return flights require separate normal lanes`);
      }
    }
  }
  return true;
}

export function planExteriorStreetLayerTrunk({
  routeId,
  family = 'exterior-street-layer-trunk',
  fp,
  siteId = null,
  moduleKey = null,
  dirKey = null,
  side,
  floorH,
  physicalTruth,
  layerStops = [],
  stableKey = routeId,
  maxRun = Infinity,
} = {}) {
  if (!routeId || !physicalTruth?.stair || !fp || !(Number(floorH) > 0)) return null;
  const geometry = faceGeometry(fp, side);
  if (!geometry) return null;
  const layers = [...layerStops]
    .filter(stop => Number.isInteger(Number(stop?.floor)) && Number(stop.floor) > 0)
    .sort((a, b) => Number(a.floor) - Number(b.floor));
  if (!layers.length || Number(layers[0].floor) !== 1) return null;
  for (let i = 1; i < layers.length; i++) {
    if (Number(layers[i].floor) !== Number(layers[i - 1].floor) + 1) return null;
  }

  const preferredLandingTangents = {};
  for (const layer of layers) {
    const usingAccessDemands = Array.isArray(layer.accessDemands);
    const demands = [...(usingAccessDemands ? layer.accessDemands : (layer.portals ?? []))];
    const values = demands
      .map(item => accessDemandTangent(item, side, { legacyExplicitPortal: !usingAccessDemands }))
      .filter(Number.isFinite);
    if (values.length) preferredLandingTangents[Number(layer.floor)] = values;
  }
  const topFloor = Number(layers[layers.length - 1].floor);
  const stair = planAlternatingFacadeStair({
    routeId: `${routeId}:geometry`, fp, side, floors: topFloor, floorH, physicalTruth,
    stableKey, maxRun, preferredLandingTangents,
  });
  if (!stair) return null;

  const lowerSupport = supportRecord(null, { kind: 'existing-ground', id: `${routeId}:support:ground`, y: 0, existing: true });
  const lowerSource = stair.landings[0];
  const lowerLanding = endpointLanding(
    `${routeId}:landing:ground`, 'lower', 0, lowerSupport, false, null,
    {
      floor: 0,
      stairThroat: null,
      stairCarveAllowed: false,
      incomingMouth: null,
      outgoingMouth: lowerSource.outgoingMouth,
      stairEndpointTangent: lowerSource.stairMouthTangent,
      targetPoint: lowerSource.targetPoint,
      geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    },
  );

  const landings = [lowerLanding];
  const nodes = [flightNode(`${routeId}:node:ground`, lowerSource.targetPoint, lowerLanding.id, lowerSupport)];
  const flights = [];
  const generatedLandings = [];
  const portalStops = [];
  const streetLayers = [];
  const graphNodes = [Object.freeze({ id: `${routeId}:graph:street-layer:0`, kind: 'street-layer', floor: 0, transportKind: 'ground-street', y: 0 })];
  const graphEdges = [];

  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const floor = Number(layer.floor);
    const sourceLanding = stair.landings[floor];
    const flightGeometry = stair.flights[floor - 1];
    if (!sourceLanding || !flightGeometry) return null;
    const y = floor * Number(floorH);

    // The destination surface is a target. The stair still receives its own
    // horizontal landing; transport can union that landing to the target later.
    const targetSupport = layer.support?.existing === true ? supportRecord(layer.support, null) : null;
    const support = supportRecord(null, {
      kind: 'generated-exterior-street-layer-landing',
      id: `${routeId}:support:landing:${floor}`,
      existing: false,
      moduleKey,
      floor,
      y,
      targetSupportId: targetSupport?.id ?? null,
    });
    const landingGeometry = sourceLanding.geometry;
    const role = index === layers.length - 1 ? 'upper' : 'intermediate';
    const landing = endpointLanding(
      `${routeId}:landing:layer:${floor}`, role, y, support, true, landingGeometry,
      {
        floor,
        targetSupport,
        streetLayer: true,
        transportKind: layer.transportKind ?? 'balcony-street-layer',
        stairThroat: null,
        stairCarveAllowed: false,
        incomingMouth: sourceLanding.incomingMouth,
        outgoingMouth: sourceLanding.outgoingMouth,
        stairEndpointTangent: sourceLanding.stairMouthTangent,
        targetPoint: sourceLanding.targetPoint,
        geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
        circulationRole: 'horizontal-access-space',
      },
    );
    landings.push(landing);
    generatedLandings.push(landing);

    const targetNode = flightNode(`${routeId}:node:layer:${floor}`, sourceLanding.targetPoint, landing.id, support);
    nodes.push(targetNode);
    const previousLanding = landings[landings.length - 2];
    const previousNode = nodes[nodes.length - 2];
    const flight = Object.freeze({
      ...flightGeometry,
      id: `${routeId}:flight:${index}`,
      fromNodeId: previousNode.id,
      toNodeId: targetNode.id,
      fromLandingId: previousLanding.id,
      toLandingId: landing.id,
      fromMouth: previousLanding.outgoingMouth,
      toMouth: landing.incomingMouth,
    });
    flights.push(flight);

    const layerNodeId = `${routeId}:graph:street-layer:${floor}`;
    graphNodes.push(Object.freeze({
      id: layerNodeId, kind: 'street-layer', floor, y, landingId: landing.id,
      transportKind: landing.transportKind, generated: true, targetSupportId: targetSupport?.id ?? null,
    }));
    graphEdges.push(Object.freeze({
      from: `${routeId}:graph:street-layer:${floor - 1}`,
      to: layerNodeId,
      kind: 'vertical-layer-neighbor',
      flightId: flight.id,
    }));

    const usingAccessDemands = Array.isArray(layer.accessDemands);
    const layerDemands = [...(usingAccessDemands ? layer.accessDemands : (layer.portals ?? []))]
      .filter(stop => stop?.roomSpaceId && (stop?.portalId || stop?.portal?.id));
    const placedPortalIds = [];
    for (let portalIndex = 0; portalIndex < layerDemands.length; portalIndex++) {
      const demand = layerDemands[portalIndex];
      const preferredTangent = accessDemandTangent(demand, side, { legacyExplicitPortal: !usingAccessDemands });
      const tangent = Number.isFinite(preferredTangent) ? preferredTangent : sourceLanding.tangentCenter;
      const portalId = String(demand.portalId ?? demand.portal?.id);
      const point = facePointForTangent(geometry, tangent, y);
      const portal = Object.freeze({
        id: portalId,
        kind: 'circulation-placed-portal',
        ...point,
        tangent,
        side,
        width: Number(demand.width ?? demand.portal?.width) || Number(physicalTruth?.door?.clearWidth?.realizedSI) || stair.clearWidth,
        height: Number(demand.height ?? demand.portal?.height) || Number(physicalTruth?.door?.clearHeight?.realizedSI) || 2.20,
        depth: Number(demand.depth ?? demand.portal?.depth) || Number(physicalTruth?.door?.approachDepthSI) || 1.20,
        landingId: landing.id,
        placementAuthority: Number.isFinite(preferredTangent) ? 'explicit-anchor' : 'circulation-landing',
      });
      const stop = Object.freeze({ ...demand, floor, portalId, portal, portalPlacement: portal });
      portalStops.push(stop);
      placedPortalIds.push(portalId);
      const roomNodeId = `${routeId}:graph:room:${floor}:${portalIndex}`;
      const portalNodeId = `${routeId}:graph:portal:${floor}:${portalIndex}`;
      graphNodes.push(
        Object.freeze({ id: roomNodeId, kind: 'occupancy', spaceId: stop.roomSpaceId, floor }),
        Object.freeze({ id: portalNodeId, kind: 'portal', portalId, floor, source: stop.source ?? 'room-door', placementAuthority: portal.placementAuthority }),
      );
      graphEdges.push(
        Object.freeze({ from: roomNodeId, to: portalNodeId, kind: 'occupancy-threshold' }),
        Object.freeze({ from: portalNodeId, to: layerNodeId, kind: 'portal-to-landing-street-layer' }),
      );
    }
    streetLayers.push(Object.freeze({
      floor, y, landingId: landing.id, generated: true, transportKind: landing.transportKind,
      targetSupportId: targetSupport?.id ?? null,
      portalIds: Object.freeze(placedPortalIds),
    }));
  }

  const upperLanding = landings[landings.length - 1];
  const route = Object.freeze({
    schema: FAST_VERTICAL_ROUTE_SCHEMA,
    id: routeId,
    family,
    shape: 'landing-routed-street-layer-trunk',
    graphAuthority: 'landing-before-flight',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    requiresLandingThroats: false,
    siteId,
    moduleKey,
    dirKey,
    side,
    targetFloor: topFloor,
    floorH: Number(floorH),
    physicalTruth,
    lowerSupport,
    upperSupport: upperLanding.support,
    hostRect: Object.freeze({ cx: Number(fp.cx), cz: Number(fp.cz), halfX: Number(fp.halfX), halfZ: Number(fp.halfZ) }),
    orientation: Object.freeze({
      faceSide: side,
      tangentAxis: stair.orientation.tangentAxis,
      normalAxis: stair.orientation.normalAxis,
      outward: stair.orientation.outward,
      tangentDirection: stair.orientation.initialDirection,
      ascent: 'full-story-alternating-two-lane',
      faceCoord: stair.orientation.faceCoord,
      laneCoords: stair.laneCoords,
      runLow: stair.runLow,
      runHigh: stair.runHigh,
    }),
    portalStops: Object.freeze(portalStops),
    streetLayers: Object.freeze(streetLayers),
    nodes: Object.freeze(nodes),
    landings: Object.freeze(landings),
    endpointLandings: Object.freeze([lowerLanding, upperLanding]),
    generatedLandings: Object.freeze(generatedLandings),
    flights: Object.freeze(flights),
    flightHeadroomClearances: Object.freeze(flights.map(flight => flight.headroomClearance)),
    graph: Object.freeze({
      schema: 'jweb.exterior-street-layer-graph.v2',
      authority: 'landing-before-flight',
      nodes: Object.freeze(graphNodes),
      edges: Object.freeze(graphEdges),
    }),
  });
  assertFastVerticalRoute(route);
  return route;
}
