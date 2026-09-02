export const BUILDING_SLAB_THICKNESS = 0.12;

export function storyCeilingLocalY(floorHeight, slabThickness = BUILDING_SLAB_THICKNESS) {
  const height = Math.max(0, Number(floorHeight) || 0);
  const slab = Math.max(0, Number(slabThickness) || 0);
  return Math.max(0.04, height - slab);
}

export function stairWalkAroundClearance(clearWidth) {
  const width = Math.max(0, Number(clearWidth) || 0);
  return Math.max(1.75, Math.min(2.25, width * 1.85));
}

export function centeredStairCorePosition({ axis, rect } = {}) {
  if (!rect || !Number.isFinite(Number(rect.cx)) || !Number.isFinite(Number(rect.cz))) {
    throw new Error('centeredStairCorePosition requires a finite rect center');
  }
  if (axis !== 'x' && axis !== 'z') throw new Error(`unsupported stair axis: ${axis}`);
  // Internal cores are circulation infrastructure, not facade decoration. Keep
  // them centered in both axes so the available envelope becomes approach/landing
  // room instead of random dead space on one side and a wall pinch on the other.
  return { x: Number(rect.cx), z: Number(rect.cz) };
}
