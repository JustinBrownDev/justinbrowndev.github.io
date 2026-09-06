import { DISTRICT_MACROCELL_SIZE } from './district-block-composition.js';

export const DISTRICT_ROUTE_CONTINUITY_SCHEMA = 'jweb.district-route-continuity.v1';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function integer(value) { return Math.trunc(finite(value)); }
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function floorDiv(value, divisor) { return Math.floor(finite(value) / divisor); }

/**
 * Deterministic district arterial intent. This does not create geometry. It gives
 * local route composition a shared multi-chunk direction, centerline and vertical
 * band so independently generated chunks can participate in the same long route.
 *
 * One row/column of each district macrocell carries the principal route. The
 * route therefore spans several chunks while leaving the rest of the district
 * free to retain local/branch circulation character.
 */
export function planDistrictRouteIntent({
  worldSeed = 0,
  chunk = null,
  field = 'ceiling',
  chunkSize = 64,
} = {}) {
  if (!chunk) return null;
  const x = integer(chunk.x), z = integer(chunk.z);
  const size = Math.max(16, finite(chunkSize, finite(chunk.chunkSize, 64)));
  const macro = Math.max(1, integer(DISTRICT_MACROCELL_SIZE));
  const districtX = floorDiv(x, macro), districtZ = floorDiv(z, macro);
  const localX = x - districtX * macro, localZ = z - districtZ * macro;
  const seed = stableHash(`${worldSeed}:district-route:${districtX}:${districtZ}:${field}`);
  const axis = (seed & 1) === 0 ? 'x' : 'z';
  const crossLane = stableHash(`${worldSeed}:district-route:${districtX}:${districtZ}:${field}:lane`) % macro;
  const alongIndex = axis === 'x' ? localX : localZ;
  const crossIndex = axis === 'x' ? localZ : localX;
  const active = crossIndex === crossLane;
  const withinLaneOffset = (unit(seed ^ 0x9e3779b9, 7) - 0.5) * size * 0.30;
  const districtCrossBase = (axis === 'x' ? districtZ : districtX) * macro;
  const centerline = (districtCrossBase + crossLane) * size + withinLaneOffset;
  const chunkCenterCross = (axis === 'x' ? z : x) * size;
  const preferredBandNorm = field === 'ceiling'
    ? 0.43 + unit(seed ^ 0x85ebca6b, 5) * 0.16
    : 0.42 + unit(seed ^ 0xc2b2ae35, 4) * 0.20;
  const strength = Math.min(0.98, (field === 'ceiling' ? 0.82 : 0.70) + unit(seed ^ 0x27d4eb2f, 9) * 0.14);
  const routeId = `district-route:${worldSeed}:${districtX}:${districtZ}:${field}:${axis}:${crossLane}`;
  const centerX = x * size, centerZ = z * size, half = size * 0.5;
  const entrySide = axis === 'x' ? 'west' : 'north';
  const exitSide = axis === 'x' ? 'east' : 'south';
  const position = macro > 1 ? alongIndex / (macro - 1) : 0.5;
  const routeRole = alongIndex <= 0 ? 'district-entry'
    : alongIndex >= macro - 1 ? 'district-exit'
      : 'district-interior';
  return Object.freeze({
    schema: DISTRICT_ROUTE_CONTINUITY_SCHEMA,
    routeId,
    field,
    districtX,
    districtZ,
    districtKey: `${districtX},${districtZ}`,
    macrocellSize: macro,
    axis,
    crossLane,
    active,
    localX,
    localZ,
    alongIndex,
    crossIndex,
    routeRole,
    entrySide,
    exitSide,
    continuationSides: Object.freeze([entrySide, exitSide]),
    centerline,
    localCenterlineOffset: centerline - chunkCenterCross,
    corridorHalfWidth: size * 0.34,
    preferredBandNorm,
    strength,
    position,
    districtSpanMeters: size * macro,
    chunkSize: size,
    chunkBounds: Object.freeze({
      minX: centerX - half,
      maxX: centerX + half,
      minZ: centerZ - half,
      maxZ: centerZ + half,
    }),
    invariant: 'one deterministic row or column carries the district arterial; local geometry may vary but direction, route identity and band remain shared across participating chunks',
  });
}
