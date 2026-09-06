export const STAIR_VISUAL_TREAD_SCHEMA = 'jweb.stair-visual-treads.v1';
const EPS = 1e-7;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Convert resolved stair physical truth into visual tread boxes.
 *
 * deriveStairFlight() defines N risers and an (N - 1)-tread horizontal run.
 * The receiving landing/floor is the final top surface; rendering an Nth tread
 * at y1 duplicates that landing and creates a coplanar overlap/Z-fight.
 */
export function planVisualStairTreads({
  axis,
  from,
  to,
  fixedCoord,
  width,
  y0 = 0,
  y1 = null,
  stairFlight,
  thickness = 0.10,
  maxTreads = Infinity,
  metadata = null,
} = {}) {
  if (!['x', 'z'].includes(axis)) throw new Error('visual stair treads require x or z axis');
  const start = finite(from, NaN), end = finite(to, NaN), fixed = finite(fixedCoord, NaN);
  const clearWidth = finite(width, NaN), baseY = finite(y0, NaN);
  const riserCount = Math.max(1, Math.floor(finite(stairFlight?.riserCount ?? stairFlight?.stepCount, 0)));
  const riserHeight = finite(stairFlight?.riserHeight, NaN);
  if (![start, end, fixed, clearWidth, baseY, riserHeight].every(Number.isFinite) || !(clearWidth > 0) || !(riserHeight > 0)) {
    throw new Error('visual stair treads require finite resolved stair geometry');
  }
  const run = Math.abs(end - start);
  const treadCount = Math.max(0, riserCount - 1);
  if (!treadCount || !(run > EPS)) return [];

  const resolvedRun = finite(stairFlight?.realizedRun, run);
  if (Math.abs(resolvedRun - run) > Math.max(0.02, run * 0.015)) {
    throw new Error(`visual stair run ${run.toFixed(3)}m drifted from resolved physical run ${resolvedRun.toFixed(3)}m`);
  }
  const treadDepth = run / treadCount;
  const resolvedTread = finite(stairFlight?.realizedTreadDepth, treadDepth);
  if (Math.abs(resolvedTread - treadDepth) > Math.max(0.02, treadDepth * 0.04)) {
    throw new Error(`visual tread depth ${treadDepth.toFixed(3)}m drifted from resolved physical tread ${resolvedTread.toFixed(3)}m`);
  }

  const budget = Number.isFinite(Number(maxTreads)) ? Math.max(0, Math.floor(Number(maxTreads))) : treadCount;
  const visualCount = Math.min(treadCount, budget);
  if (!visualCount) return [];
  const stepThickness = Math.max(0.025, Math.min(riserHeight * 0.92, finite(thickness, 0.10)));
  const topY = Number.isFinite(Number(y1)) ? Number(y1) : baseY + riserHeight * riserCount;
  const out = [];
  let previousIndex = -1;
  for (let visualIndex = 0; visualIndex < visualCount; visualIndex++) {
    let treadIndex = visualCount === treadCount
      ? visualIndex
      : Math.min(treadCount - 1, Math.floor(((visualIndex + 0.5) * treadCount) / visualCount));
    if (treadIndex <= previousIndex) treadIndex = Math.min(treadCount - 1, previousIndex + 1);
    previousIndex = treadIndex;
    const t = (treadIndex + 0.5) / treadCount;
    const along = start + (end - start) * t;
    const treadTopY = baseY + riserHeight * (treadIndex + 1);
    if (!(treadTopY < topY - EPS)) {
      throw new Error('visual stair tread may not duplicate the receiving landing elevation');
    }
    const common = {
      y: treadTopY - stepThickness * 0.5,
      sy: stepThickness,
      visualOnly: true,
      visualTreadAuthority: STAIR_VISUAL_TREAD_SCHEMA,
      visualTreadIndex: treadIndex,
      visualTreadCount: treadCount,
      riserCount,
      ...(metadata || {}),
    };
    out.push(axis === 'x'
      ? { x: along, z: fixed, sx: treadDepth, sz: clearWidth, ...common }
      : { x: fixed, z: along, sx: clearWidth, sz: treadDepth, ...common });
  }
  return out;
}
