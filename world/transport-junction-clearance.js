export const TRANSPORT_JUNCTION_CLEARANCE_SCHEMA = 'jweb.transport-junction-clearance.v1';

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function bounds2D(part) {
  const x = finite(part?.x, NaN), z = finite(part?.z, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // Rotated braces are deliberately conservative: using the larger horizontal
  // dimension as a radius is preferable to leaving a diagonal bar through a
  // public junction opening.
  const radiusX = Math.max(0.02, Math.max(Math.abs(finite(part?.sx, 0)), Math.abs(finite(part?.sz, 0))) * 0.5);
  const radiusZ = radiusX;
  return { minX: x - radiusX, maxX: x + radiusX, minZ: z - radiusZ, maxZ: z + radiusZ };
}
function intersects(a, b) {
  return !!a && !!b && Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX)
    && Math.min(a.maxZ, b.maxZ) > Math.max(a.minZ, b.minZ);
}

export function junctionClearanceRect(intersection, padding = 0.28) {
  if (!intersection) return null;
  const x = finite(intersection.x, NaN), z = finite(intersection.z, NaN);
  const hx = Math.max(0.20, finite(intersection.hx, 0) + Math.max(0, finite(padding, 0)));
  const hz = Math.max(0.20, finite(intersection.hz, 0) + Math.max(0, finite(padding, 0)));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

export function carveJunctionYieldingParts(parts = [], { intersection = null, y = 0, padding = 0.28 } = {}) {
  const rect = junctionClearanceRect(intersection, padding);
  if (!rect) return Object.freeze({ schema: TRANSPORT_JUNCTION_CLEARANCE_SCHEMA, parts: Object.freeze([...(parts ?? [])]), removed: 0 });
  const deckY = finite(y, 0);
  let removed = 0;
  const kept = [];
  for (const part of parts ?? []) {
    const yields = part?.junctionYield === true || part?.bridgeDecorativeRail === true || part?.bridgeSupport === true;
    if (!yields) { kept.push(part); continue; }
    const py = finite(part?.y, deckY);
    // Keep architecture far below/above the walking junction. Anything near the
    // deck that is explicitly marked yieldable gives way to the circulation.
    const nearDeck = py >= deckY - 2.6 && py <= deckY + 3.6;
    if (nearDeck && intersects(bounds2D(part), rect)) { removed++; continue; }
    kept.push(part);
  }
  return Object.freeze({ schema: TRANSPORT_JUNCTION_CLEARANCE_SCHEMA, parts: Object.freeze(kept), removed });
}
