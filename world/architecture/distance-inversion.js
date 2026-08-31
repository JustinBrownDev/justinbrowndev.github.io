function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function ramp(value, from, to) {
  if (to <= from) return value > from ? 1 : 0;
  return smoothstep01((value - from) / (to - from));
}

/**
 * Sidecar-only architectural field.
 *
 * This deliberately rides on top of jweb's existing worldWeirdnessAt() result
 * instead of replacing it.  Geometry/collision truth remains authoritative;
 * this field only controls how conventionally or anti-conventionally the
 * building plan graph is organized.
 */
export function architecturalFieldProfile({
  distanceChunks = 0,
  weirdnessSampled = 0,
  isSpawn = false,
} = {}) {
  const d = Math.max(0, Number(distanceChunks) || 0);
  const weird = clamp01(weirdnessSampled);

  if (isSpawn || d < 0.001) {
    return Object.freeze({
      schema: 'jweb.architectural-field.v1',
      distanceChunks: d,
      fidelity: 1,
      inversion: 0,
      entropy: 0.015,
      uncannyCoherence: 1,
      phase: 'forensic-spawn',
      rules: Object.freeze({
        preserveConventionalHierarchy: true,
        invertExteriorPreference: false,
        serviceThresholdFirst: false,
        echoDominantSpaces: false,
        driftVerticalStacks: false,
        facadeCausality: 'space-outward',
      }),
    });
  }

  // Fidelity falls much faster than jweb's global weirdness rises.  This lets a
  // few rings around spawn feel meticulously organized before the reversal is
  // obvious.  Inversion then grows slowly and reaches full strength around the
  // same far radius as worldWeirdnessAt().
  const fidelity = clamp01(1 - ramp(d, 1.5, 10));
  const inversion = clamp01(ramp(d, 6, 40) * (0.84 + weird * 0.16));

  // Entropy is intentionally capped.  The far city should feel designed by a
  // different logic, not damaged by a random number generator.
  const entropy = clamp01(0.025 + weird * 0.085 + inversion * 0.075);
  const uncannyCoherence = clamp01(1 - entropy * 0.75);

  let phase = 'near-conventional';
  if (inversion >= 0.82) phase = 'full-reversal';
  else if (inversion >= 0.52) phase = 'architectural-inversion';
  else if (inversion >= 0.18) phase = 'latent-reversal';

  return Object.freeze({
    schema: 'jweb.architectural-field.v1',
    distanceChunks: d,
    fidelity,
    inversion,
    entropy,
    uncannyCoherence,
    phase,
    rules: Object.freeze({
      preserveConventionalHierarchy: inversion < 0.36,
      invertExteriorPreference: inversion >= 0.48,
      serviceThresholdFirst: inversion >= 0.62,
      echoDominantSpaces: inversion >= 0.70,
      driftVerticalStacks: inversion >= 0.42,
      facadeCausality: inversion >= 0.58 ? 'facade-inward' : 'space-outward',
    }),
  });
}

export function inversionStrength(profile, threshold = 0.5) {
  const value = clamp01(profile?.inversion);
  if (value <= threshold) return 0;
  return clamp01((value - threshold) / Math.max(1e-9, 1 - threshold));
}

export { clamp01, smoothstep01 };
