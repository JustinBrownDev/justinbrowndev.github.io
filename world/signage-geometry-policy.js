export const SIGNAGE_GEOMETRY_POLICY = Object.freeze({
  bladeMinAspect: 0.34,
  bladeMaxAspect: 0.72,
  facadeMediaMinAspect: 0.24,
  facadeMediaMaxAspect: 0.62,
  roofMediaMinAspect: 0.26,
  roofMediaMaxAspect: 0.50,
  altitudeScaleStartY: 4.5,
  altitudeScaleFullY: 30.0,
  altitudeScaleMax: 2.20,
});

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

export function boundedDisplayHeight(width, requestedHeight, {
  minAspect = 0.24,
  maxAspect = 0.62,
  minHeight = 0,
  maxHeight = Infinity,
} = {}) {
  const w = Math.max(0.01, Number(width) || 0.01);
  const raw = Math.max(0, Number(requestedHeight) || 0);
  const lo = Math.max(0, Number(minHeight) || 0, w * Math.max(0, Number(minAspect) || 0));
  const hi = Math.max(lo, Math.min(
    Number.isFinite(Number(maxHeight)) ? Math.max(0, Number(maxHeight)) : Infinity,
    w * Math.max(Number(minAspect) || 0, Number(maxAspect) || 0),
  ));
  return clamp(raw || lo, lo, hi);
}

export function boundedBladePanelHeight(width, rawAspect = 0.5) {
  const w = Math.max(0.01, Number(width) || 0.01);
  return boundedDisplayHeight(w, w * Math.max(0, Number(rawAspect) || 0), {
    minAspect: SIGNAGE_GEOMETRY_POLICY.bladeMinAspect,
    maxAspect: SIGNAGE_GEOMETRY_POLICY.bladeMaxAspect,
    minHeight: 0.52,
  });
}

export function signAltitudeScale(centerY, facadeBaseY = 0) {
  const altitude = Math.max(0, (Number(centerY) || 0) - (Number(facadeBaseY) || 0));
  const start = SIGNAGE_GEOMETRY_POLICY.altitudeScaleStartY;
  const span = Math.max(0.01, SIGNAGE_GEOMETRY_POLICY.altitudeScaleFullY - start);
  const t = clamp((altitude - start) / span, 0, 1);
  return 1 + t * (SIGNAGE_GEOMETRY_POLICY.altitudeScaleMax - 1);
}

export function boundedFacadeMediaPanel(width, requestedHeight, maxHeight = 10) {
  return {
    width,
    height: boundedDisplayHeight(width, requestedHeight, {
      minAspect: SIGNAGE_GEOMETRY_POLICY.facadeMediaMinAspect,
      maxAspect: SIGNAGE_GEOMETRY_POLICY.facadeMediaMaxAspect,
      minHeight: 1.55,
      maxHeight,
    }),
  };
}

export function boundedRoofMediaPanel(width, requestedHeight, maxHeight = 4.8) {
  return {
    width,
    height: boundedDisplayHeight(width, requestedHeight, {
      minAspect: SIGNAGE_GEOMETRY_POLICY.roofMediaMinAspect,
      maxAspect: SIGNAGE_GEOMETRY_POLICY.roofMediaMaxAspect,
      minHeight: 1.7,
      maxHeight,
    }),
  };
}
