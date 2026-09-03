export const BUILDING_VOLUME_SCALE_TARGET = 4;
export const BASELINE_COMPOUND_TARGETS = Object.freeze([
  Object.freeze([5, 8]), Object.freeze([6, 18]), Object.freeze([7, 24]), Object.freeze([8, 22]),
  Object.freeze([9, 16]), Object.freeze([10, 8]), Object.freeze([11, 3]), Object.freeze([12, 1]),
]);
export const SCALED_COMPOUND_TARGETS = Object.freeze(
  BASELINE_COMPOUND_TARGETS.map(([size, weight]) => Object.freeze([size * BUILDING_VOLUME_SCALE_TARGET, weight])),
);

export function weightedCompoundTargetMean(targets = SCALED_COMPOUND_TARGETS) {
  const totalWeight = targets.reduce((sum, [, weight]) => sum + weight, 0);
  return targets.reduce((sum, [size, weight]) => sum + size * weight, 0) / totalWeight;
}

export function chooseVolumetricCompoundTargetSize(rng, { siteTargetBonus = 1 } = {}) {
  if (typeof rng !== 'function') throw new Error('chooseVolumetricCompoundTargetSize requires rng');
  const bonusScale = Math.max(0, Number(siteTargetBonus) || 0);
  const adjusted = SCALED_COMPOUND_TARGETS.map(([size, weight]) => {
    // Preserve the old weirdness weighting in baseline-size units so the 4x
    // volume target changes scale without silently changing distribution shape.
    const baselineSize = size / BUILDING_VOLUME_SCALE_TARGET;
    const bonus = baselineSize >= 7 ? bonusScale * (baselineSize - 5) * 3.0 : 0;
    return [size, weight + bonus];
  });
  const total = adjusted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.max(0, Math.min(0.999999999999, Number(rng()) || 0)) * total;
  for (const [size, weight] of adjusted) {
    roll -= weight;
    if (roll <= 0) return size;
  }
  return adjusted[adjusted.length - 1][0];
}
