import { assertLandingThroatClearsFlight } from './stair-volume-contract.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA, planAlternatingFacadeStair } from './facade-stair-authority.js';

export const FAST_VERTICAL_ROUTE_SCHEMA = 'jweb.fast-vertical-route.v2';
const EPS = 1e-7;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function faceGeometry(fp, side) {
  if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
  const cx = Number(fp.cx);
  const cz = Number(fp.cz);
  const halfX = Number(fp.halfX);
  const halfZ = Number(fp.halfZ);
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

function pointFor(axis, along, fixed, y) {
  return axis === 'x' ? { x: along, y, z: fixed } : { x: fixed, y, z: along };
}

function supportRecord(raw, fallback) {
  const source = raw ?? fallback;
  return Object.freeze({ ...source });
}

function endpointLanding(id, role, y, support, generated, geometry = null) {
  return Object.freeze({
    id,
    role,
    y,
    generated: generated === true,
    support,
    geometry: geometry ? Object.freeze({ ...geometry }) : null,
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

function portalTangentForGeometry(portal, geometry) {
  if (!portal) return null;
  const value = geometry.horizontal ? Number(portal.x) : Number(portal.z);
  return Number.isFinite(value) ? value : null;
}

function landingGeometryForLayer({ geometry, stair, flight, layer, clearWidth }) {
  const facadeMargin = Math.max(0.22, clearWidth * 0.20);
  const min = geometry.tangentCenter - geometry.tangentHalf + facadeMargin;
  const max = geometry.tangentCenter + geometry.tangentHalf - facadeMargin;
  const arrival = Number(flight.to);
  const portalTangents = [...(layer.portals ?? [])]
    .map(item => portalTangentForGeometry(item?.portal, geometry))
    .filter(Number.isFinite);

  const doorWidth = Number(stair.physicalTruth?.door?.clearWidth?.realizedSI) || 1.0;
  const margin = Math.max(clearWidth * 0.72, doorWidth * 0.58 + 0.14);
  let lo = Math.min(arrival, ...(portalTangents.length ? portalTangents : [arrival])) - margin;
  let hi = Math.max(arrival, ...(portalTangents.length ? portalTangents : [arrival])) + margin;
  lo = clamp(lo, min, max);
  hi = clamp(hi, min, max);

  const minSpan = Math.max(clearWidth * 1.45, doorWidth + 0.30);
  if (hi - lo < minSpan) {
    const center = clamp(arrival, min + minSpan * 0.5, max - minSpan * 0.5);
    lo = Math.max(min, center - minSpan * 0.5);
    hi = Math.min(max, center + minSpan * 0.5);
  }
  if (!(hi > lo + clearWidth * 0.7)) return null;

  const halfWidth = clearWidth * 0.5;
  const outerCoord = stair.orientation.fixedCoord + stair.orientation.outward * (halfWidth + 0.20);
  const roofEdgeLayer = layer.transportKind === 'clear-roof-edge-layer';
  const innerCoord = stair.orientation.faceCoord + stair.orientation.outward * (roofEdgeLayer ? -0.18 : 0.03);
  const normalCenter = (innerCoord + outerCoord) * 0.5;
  const normalHalf = Math.abs(outerCoord - innerCoord) * 0.5;
  const tangentCenter = (lo + hi) * 0.5;
  const tangentHalf = (hi - lo) * 0.5;
  return geometry.tangentAxis === 'x'
    ? { x: tangentCenter, z: normalCenter, hx: tangentHalf, hz: normalHalf }
    : { x: normalCenter, z: tangentCenter, hx: normalHalf, hz: tangentHalf };
}

export function assertFastVerticalRoute(route) {
  if (!route || route.schema !== FAST_VERTICAL_ROUTE_SCHEMA) throw new Error('fast vertical route schema missing');
  if (route.geometryAuthority !== FACADE_STAIR_AUTHORITY_SCHEMA) throw new Error(`${route.id}: shared facade stair authority missing`);
  if (!Array.isArray(route.flights) || route.flights.length < 1) throw new Error(`${route.id}: every stair route requires at least one flight`);
  if (!Array.isArray(route.endpointLandings) || route.endpointLandings.length !== 2) throw new Error(`${route.id}: lower and upper endpoint landing semantics are required`);
  const [lower, upper] = route.endpointLandings;
  if (lower.role !== 'lower' || upper.role !== 'upper') throw new Error(`${route.id}: endpoint landing order is invalid`);
  if (!lower.support || !upper.support) throw new Error(`${route.id}: every endpoint landing requires a support binding`);
  if (lower.generated) throw new Error(`${route.id}: ground support must replace lower landing geometry`);
  if (upper.generated && !upper.geometry) throw new Error(`${route.id}: generated upper landing requires real geometry`);
  if (!upper.generated && upper.geometry) throw new Error(`${route.id}: existing support must replace duplicate landing geometry`);
  const allLandings = Array.isArray(route.landings) && route.landings.length ? route.landings : route.endpointLandings;
  for (const landing of allLandings) {
    if (!landing.support) throw new Error(`${route.id}: landing support binding missing`);
    if (landing.generated && !landing.geometry) throw new Error(`${route.id}: generated landing requires real geometry`);
    if (!landing.generated && landing.geometry) throw new Error(`${route.id}: existing support must replace duplicate landing geometry`);
  }
  const generated = allLandings.filter(landing => landing.generated);
  if (route.generatedLandings.length !== generated.length) throw new Error(`${route.id}: generated landing registry drift`);
  const nodeIds = new Set((route.nodes ?? []).map(node => node.id));
  const landingIds = new Set(allLandings.map(landing => landing.id));
  for (let i = 0; i < route.flights.length; i++) {
    const flight = route.flights[i];
    if (!nodeIds.has(flight.fromNodeId) || !nodeIds.has(flight.toNodeId)) throw new Error(`${route.id}: flight endpoint node missing`);
    if (!landingIds.has(flight.fromLandingId) || !landingIds.has(flight.toLandingId)) throw new Error(`${route.id}: flight must connect endpoint landings`);
    if (!(flight.run > EPS) || !(flight.rise > EPS)) throw new Error(`${route.id}: flight must have positive run and rise`);
    if (flight.fitClassification !== 'fits-resolved-truth') throw new Error(`${route.id}: flight escaped physical truth fit`);
    if (!(flight.stairFlight?.stepCount >= 1)) throw new Error(`${route.id}: flight requires at least one realized step`);
    if (i > 0 && Math.sign(route.flights[i - 1].to - route.flights[i - 1].from) === Math.sign(flight.to - flight.from)) {
      throw new Error(`${route.id}: stacked wall flights must alternate direction`);
    }
  }
  if (route.requiresLandingThroats === true) {
    for (const landing of generated) {
      const incoming = route.flights.find(flight => flight.toLandingId === landing.id);
      assertLandingThroatClearsFlight({ id: `${route.id}:${landing.id}`, landing, flight: incoming });
    }
  }
  return true;
}

// Occupancy portals are emitted first. This wrapper does not invent a second stair
// layout: it asks facade-stair-authority for one full-story, wall-hugging zigzag
// and then wraps the accepted geometry with street-layer supports and graph nodes.
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
    const values = [...(layer.portals ?? [])].map(item => portalTangent(item?.portal, side)).filter(Number.isFinite);
    if (values.length) preferredLandingTangents[Number(layer.floor)] = values;
  }
  const topFloor = Number(layers[layers.length - 1].floor);
  const stair = planAlternatingFacadeStair({
    routeId: `${routeId}:geometry`,
    fp,
    side,
    floors: topFloor,
    floorH,
    physicalTruth,
    stableKey,
    maxRun,
    preferredLandingTangents,
  });
  if (!stair) return null;

  const clearWidth = stair.clearWidth;
  const lowerSupport = supportRecord(null, { kind: 'existing-ground', id: `${routeId}:support:ground`, y: 0, existing: true });
  const lowerLanding = endpointLanding(`${routeId}:landing:ground`, 'lower', 0, lowerSupport, false, null);
  const landings = [lowerLanding];
  const nodes = [];
  const flights = [];
  const generatedLandings = [];
  const portalStops = [];
  const streetLayers = [];
  const graphNodes = [Object.freeze({ id: `${routeId}:graph:street-layer:0`, kind: 'street-layer', floor: 0, transportKind: 'ground-street', y: 0 })];
  const graphEdges = [];

  let previousLanding = lowerLanding;
  let previousNode = flightNode(`${routeId}:node:ground`, stair.landingAnchors[0].point, lowerLanding.id, lowerSupport);
  nodes.push(previousNode);

  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const floor = Number(layer.floor);
    const flightGeometry = stair.flights[floor - 1];
    if (!flightGeometry) return null;
    const y = floor * Number(floorH);
    const support = layer.support?.existing === true
      ? supportRecord(layer.support, null)
      : supportRecord(null, {
        kind: 'generated-exterior-street-layer', id: `${routeId}:support:layer:${floor}`,
        existing: false, moduleKey, floor, y,
      });
    const existingSupport = support.existing === true;
    const landingGeometry = existingSupport ? null : landingGeometryForLayer({ geometry, stair, flight: flightGeometry, layer, clearWidth });
    if (!existingSupport && !landingGeometry) return null;
    const role = index === layers.length - 1 ? 'upper' : 'intermediate';
    const landingBase = endpointLanding(`${routeId}:landing:layer:${floor}`, role, y, support, !existingSupport, landingGeometry);
    const landing = Object.freeze({
      ...landingBase,
      floor,
      streetLayer: true,
      transportKind: layer.transportKind ?? (existingSupport ? 'existing-walkway-layer' : 'balcony-street-layer'),
      stairThroat: !existingSupport ? flightGeometry.arrivalThroat : null,
      stairEndpointTangent: flightGeometry.to,
      geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    });
    landings.push(landing);
    if (landing.generated) generatedLandings.push(landing);

    const targetNode = flightNode(`${routeId}:node:layer:${floor}`, stair.landingAnchors[floor].point, landing.id, support);
    nodes.push(targetNode);
    const flight = Object.freeze({
      ...flightGeometry,
      id: `${routeId}:flight:${index}`,
      fromNodeId: previousNode.id,
      toNodeId: targetNode.id,
      fromLandingId: previousLanding.id,
      toLandingId: landing.id,
    });
    flights.push(flight);

    const layerNodeId = `${routeId}:graph:street-layer:${floor}`;
    graphNodes.push(Object.freeze({
      id: layerNodeId,
      kind: 'street-layer',
      floor,
      y,
      landingId: landing.id,
      transportKind: landing.transportKind,
      generated: landing.generated,
    }));
    graphEdges.push(Object.freeze({
      from: `${routeId}:graph:street-layer:${floor - 1}`,
      to: layerNodeId,
      kind: 'vertical-layer-neighbor',
      flightId: flight.id,
    }));

    const layerPortals = [...(layer.portals ?? [])].filter(stop => stop?.portal && stop?.roomSpaceId);
    for (let portalIndex = 0; portalIndex < layerPortals.length; portalIndex++) {
      const stop = Object.freeze({ ...layerPortals[portalIndex], floor });
      portalStops.push(stop);
      const roomNodeId = `${routeId}:graph:room:${floor}:${portalIndex}`;
      const portalNodeId = `${routeId}:graph:portal:${floor}:${portalIndex}`;
      graphNodes.push(
        Object.freeze({ id: roomNodeId, kind: 'occupancy', spaceId: stop.roomSpaceId, floor }),
        Object.freeze({ id: portalNodeId, kind: 'portal', portalId: stop.portal.id, floor, source: stop.source ?? 'room-door' }),
      );
      graphEdges.push(
        Object.freeze({ from: roomNodeId, to: portalNodeId, kind: 'occupancy-threshold' }),
        Object.freeze({ from: portalNodeId, to: layerNodeId, kind: 'portal-to-street-layer' }),
      );
    }
    streetLayers.push(Object.freeze({
      floor,
      y,
      landingId: landing.id,
      generated: landing.generated,
      transportKind: landing.transportKind,
      portalIds: Object.freeze(layerPortals.map(stop => stop.portal.id)),
    }));

    previousLanding = landing;
    previousNode = targetNode;
  }

  const upperLanding = landings[landings.length - 1];
  const route = Object.freeze({
    schema: FAST_VERTICAL_ROUTE_SCHEMA,
    id: routeId,
    family,
    shape: 'street-layer-trunk',
    graphAuthority: 'exterior-street-layer-first',
    geometryAuthority: FACADE_STAIR_AUTHORITY_SCHEMA,
    requiresLandingThroats: true,
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
      ascent: 'full-story-alternating-wall-trunk',
      faceCoord: stair.orientation.faceCoord,
      fixedCoord: stair.orientation.fixedCoord,
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
    graph: Object.freeze({
      schema: 'jweb.exterior-street-layer-graph.v1',
      authority: 'exterior-street-layer-first',
      nodes: Object.freeze(graphNodes),
      edges: Object.freeze(graphEdges),
    }),
  });
  assertFastVerticalRoute(route);
  return route;
}
