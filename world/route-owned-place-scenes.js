export const ROUTE_OWNED_PLACE_SCENE_SCHEMA = 'jweb.route-owned-place-scene.v3';
export const ROUTE_OWNED_PLACE_SCENE_VERSION = 3;
export const ROUTE_OWNED_PLACE_SCENE_VARIANTS = 3;

const EPS = 1e-6;

function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function localToWorld(place, lx, lz) {
  const quarter = Number(place?.quarterTurns ?? 0) & 3;
  if (quarter === 0) return { x: Number(place.x) + lx, z: Number(place.z) + lz };
  if (quarter === 1) return { x: Number(place.x) - lz, z: Number(place.z) + lx };
  if (quarter === 2) return { x: Number(place.x) - lx, z: Number(place.z) - lz };
  return { x: Number(place.x) + lz, z: Number(place.z) - lx };
}

function localSize(place, sx, sz) {
  return (Number(place?.quarterTurns ?? 0) & 1) ? { sx: sz, sz: sx } : { sx, sz };
}

function part(place, role, {
  x = 0, z = 0, y = 0,
  sx = 0.3, sy = 0.3, sz = 0.3,
  color = 0x777777,
  collision = false,
  emissive = false,
  renderClass = 'prop',
  detailTier = 'structure',
  ry = 0,
} = {}) {
  const p = localToWorld(place, x, z);
  const size = localSize(place, sx, sz);
  return Object.freeze({
    role,
    x: p.x, z: p.z, y: Number(place.y) + y,
    sx: size.sx, sy, sz: size.sz,
    ry: ry + (Number(place?.quarterTurns ?? 0) & 3) * Math.PI * 0.5,
    color,
    collision,
    emissive,
    renderClass: emissive ? 'emissive' : renderClass,
    detailTier,
  });
}

const PALETTES = Object.freeze({
  'roof-bodega': Object.freeze([0xc75d3b, 0xe0ba69, 0x3f6167, 0xd6d2c4, 0x8a432d]),
  'thrift-stall': Object.freeze([0x805d8c, 0xca8a8b, 0x7e9a78, 0xe1c07a, 0x4d3b56]),
  'gallery-terrace': Object.freeze([0xd6d5cf, 0x30343a, 0x9b3d47, 0x7893a8, 0xede9dc]),
  'repair-bay': Object.freeze([0x5f6d72, 0xc98b46, 0x3f4246, 0x9d6d4d, 0xd9c86a]),
  refuge: Object.freeze([0x617b69, 0xd9c888, 0x7d8d91, 0xb15448, 0xe7e0c1]),
  'utility-yard': Object.freeze([0x66706d, 0x9c9b83, 0xd0a64e, 0x4d5556, 0x81908a]),
  'fuel-kiosk': Object.freeze([0x527ea3, 0xd84a42, 0xe8dfc6, 0x42464d, 0xf0b84c]),
});

const TAGS = Object.freeze({
  'roof-bodega': Object.freeze(['retail', 'food', 'awning', 'night-sign']),
  'thrift-stall': Object.freeze(['retail', 'reuse', 'fabric', 'rack']),
  'gallery-terrace': Object.freeze(['culture', 'display', 'terrace', 'light']),
  'repair-bay': Object.freeze(['workshop', 'tools', 'parts', 'hoist']),
  refuge: Object.freeze(['rest', 'water', 'shelter', 'marker']),
  'utility-yard': Object.freeze(['infrastructure', 'power', 'pipe', 'service']),
  'fuel-kiosk': Object.freeze(['service', 'fuel', 'pump', 'price-band']),
});

function basePaint(place, c, add, variant) {
  add('paint-pad', { y: 0.025, sx: 1.80, sy: 0.05, sz: 1.40, color: c[3], renderClass: 'paint', detailTier: 'surface' });
  add('paint-stripe-a', { x: variant === 1 ? -0.38 : 0.38, y: 0.055, sx: 0.10, sy: 0.025, sz: 1.28, color: c[0], renderClass: 'paint', detailTier: 'surface' });
  add('paint-stripe-b', { z: variant === 2 ? 0.32 : -0.32, y: 0.058, sx: 1.64, sy: 0.026, sz: 0.08, color: c[1], renderClass: 'paint', detailTier: 'surface' });
}

function streetApproachIdentity(place, sceneType, c, add, variant) {
  if (place?.routeOwnership !== 'world-street-plaza-circulation') return;

  // Cut 21J: street places need an identity that reads before the player is
  // standing inside the 2m pad. Keep it wholly inside the already-owned plaza
  // footprint and non-colliding: circulation owns the ground, this layer only
  // adds cheap instanced paint + emissive silhouette above it.
  const mastX = variant === 1 ? -0.66 : 0.66;
  const bandZ = variant === 2 ? 0.42 : -0.42;
  add('street-approach-band', {
    z: bandZ, y: 0.066, sx: 1.46, sy: 0.022, sz: 0.14,
    color: c[0], renderClass: 'paint', detailTier: 'approach',
  });
  add('street-identity-mast', {
    x: mastX, z: 0.20, y: 1.42, sx: 0.09, sy: 2.72, sz: 0.09,
    color: c[4], detailTier: 'approach',
  });
  add('street-identity-lightbox', {
    x: mastX, z: 0.20, y: 2.46, sx: 0.46, sy: 0.54, sz: 0.10,
    color: c[2], emissive: true, detailTier: 'approach',
  });

  if (sceneType === 'roof-bodega') {
    add('street-glyph-retail', { x: mastX, z: 0.14, y: 2.46, sx: 0.26, sy: 0.08, sz: 0.03, color: c[1], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'thrift-stall') {
    add('street-glyph-thrift-a', { x: mastX - 0.10, z: 0.14, y: 2.52, sx: 0.10, sy: 0.22, sz: 0.03, color: c[1], emissive: true, detailTier: 'approach' });
    add('street-glyph-thrift-b', { x: mastX + 0.10, z: 0.14, y: 2.40, sx: 0.10, sy: 0.22, sz: 0.03, color: c[3], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'gallery-terrace') {
    add('street-glyph-gallery', { x: mastX, z: 0.14, y: 2.46, sx: 0.22, sy: 0.22, sz: 0.03, color: c[4], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'repair-bay') {
    add('street-glyph-repair', { x: mastX, z: 0.14, y: 2.46, sx: 0.28, sy: 0.07, sz: 0.03, color: c[1], emissive: true, detailTier: 'approach' });
    add('street-glyph-repair-stem', { x: mastX, z: 0.14, y: 2.46, sx: 0.07, sy: 0.28, sz: 0.03, color: c[1], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'refuge') {
    add('street-glyph-refuge', { x: mastX, z: 0.14, y: 2.46, sx: 0.20, sy: 0.20, sz: 0.03, color: c[3], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'utility-yard') {
    add('street-glyph-utility-a', { x: mastX - 0.09, z: 0.14, y: 2.46, sx: 0.07, sy: 0.28, sz: 0.03, color: c[2], emissive: true, detailTier: 'approach' });
    add('street-glyph-utility-b', { x: mastX + 0.09, z: 0.14, y: 2.46, sx: 0.07, sy: 0.28, sz: 0.03, color: c[2], emissive: true, detailTier: 'approach' });
  } else if (sceneType === 'fuel-kiosk') {
    add('street-glyph-fuel-top', { x: mastX, z: 0.14, y: 2.54, sx: 0.28, sy: 0.08, sz: 0.03, color: c[1], emissive: true, detailTier: 'approach' });
    add('street-glyph-fuel-bottom', { x: mastX, z: 0.14, y: 2.36, sx: 0.28, sy: 0.08, sz: 0.03, color: c[4], emissive: true, detailTier: 'approach' });
  }
}

function bodega(place, c, add, variant) {
  add('kiosk-body', { z: 0.27, y: 0.78, sx: 1.18, sy: 1.50, sz: 0.68, color: c[0], collision: true });
  add('counter', { z: -0.28, y: 0.50, sx: 1.40, sy: 0.70, sz: 0.28, color: c[3], collision: true });
  add('awning', { z: -0.12, y: 1.72, sx: 1.76, sy: 0.08, sz: 0.92, color: c[1] });
  add('sign-bar', { z: 0.63, y: 1.62, sx: 1.18, sy: 0.26, sz: 0.07, color: c[2], emissive: true, detailTier: 'identity' });
  add('shelf-rail', { z: 0.58, y: 1.04, sx: 1.02, sy: 0.08, sz: 0.09, color: c[4], detailTier: 'micro' });
  add('crate-a', { x: -0.60, z: -0.53, y: 0.19, sx: 0.36, sy: 0.38, sz: 0.34, color: c[1], collision: true, detailTier: 'micro' });
  add('crate-b', { x: -0.20, z: -0.57, y: 0.15, sx: 0.30, sy: 0.30, sz: 0.30, color: c[0], detailTier: 'micro' });
  add('cooler', { x: 0.59, z: 0.45, y: 0.47, sx: 0.34, sy: 0.90, sz: 0.30, color: c[2], collision: true, detailTier: 'micro' });
  add('cooler-light', { x: 0.59, z: 0.28, y: 0.72, sx: 0.24, sy: 0.38, sz: 0.03, color: c[1], emissive: true, detailTier: 'micro' });
  add('roof-vent', { x: variant === 0 ? -0.36 : 0.34, z: 0.31, y: 1.66, sx: 0.24, sy: 0.18, sz: 0.24, color: c[4], detailTier: 'micro' });
  if (variant === 2) add('side-flag', { x: -0.72, z: 0.13, y: 1.22, sx: 0.05, sy: 0.62, sz: 0.42, color: c[1], emissive: true, detailTier: 'identity' });
}

function thrift(place, c, add, variant) {
  add('canopy', { y: 1.84, sx: 1.82, sy: 0.09, sz: 1.28, color: c[1] });
  add('rack-a', { x: -0.45, y: 0.78, sx: 0.10, sy: 1.32, sz: 1.04, color: c[0], collision: true });
  add('rack-b', { x: 0.45, y: 0.78, sx: 0.10, sy: 1.32, sz: 1.04, color: c[2], collision: true });
  add('hanger-bar-a', { x: -0.45, y: 1.30, sx: 0.55, sy: 0.06, sz: 0.06, color: c[4], detailTier: 'micro' });
  add('hanger-bar-b', { x: 0.45, y: 1.30, sx: 0.55, sy: 0.06, sz: 0.06, color: c[4], detailTier: 'micro' });
  add('bin-a', { x: -0.23, z: -0.44, y: 0.22, sx: 0.46, sy: 0.44, sz: 0.34, color: c[3], detailTier: 'micro' });
  add('bin-b', { x: 0.34, z: -0.44, y: 0.18, sx: 0.36, sy: 0.36, sz: 0.38, color: c[1], detailTier: 'micro' });
  add('price-flag', { x: variant === 0 ? 0.70 : -0.70, z: 0.28, y: 1.28, sx: 0.05, sy: 0.70, sz: 0.44, color: c[3], emissive: true, detailTier: 'identity' });
  add('table', { z: 0.32, y: 0.37, sx: 0.82, sy: 0.16, sz: 0.42, color: c[4], collision: true });
  add('table-stack-a', { x: -0.20, z: 0.31, y: 0.52, sx: 0.30, sy: 0.12, sz: 0.26, color: c[0], detailTier: 'micro' });
  add('table-stack-b', { x: 0.20, z: 0.31, y: 0.55, sx: 0.28, sy: 0.18, sz: 0.24, color: c[2], detailTier: 'micro' });
  if (variant === 1) add('mirror-panel', { z: 0.59, y: 0.92, sx: 0.38, sy: 0.78, sz: 0.04, color: c[3], emissive: true, detailTier: 'micro' });
}

function gallery(place, c, add, variant) {
  add('gallery-wall', { z: 0.53, y: 1.00, sx: 1.64, sy: 1.92, sz: 0.08, color: c[0], collision: true });
  add('art-panel-a', { x: -0.48, z: 0.48, y: 1.10, sx: 0.44, sy: 0.72, sz: 0.03, color: c[2], emissive: true, detailTier: 'identity' });
  add('art-panel-b', { x: 0.00, z: 0.48, y: 1.12, sx: 0.34, sy: 0.82, sz: 0.03, color: c[3], emissive: true, detailTier: 'identity' });
  add('art-panel-c', { x: 0.48, z: 0.48, y: 1.06, sx: 0.40, sy: 0.66, sz: 0.03, color: c[1], emissive: true, detailTier: 'identity' });
  add('light-rail', { z: 0.39, y: 1.78, sx: 1.50, sy: 0.06, sz: 0.06, color: c[4], emissive: true, detailTier: 'micro' });
  add('plinth-a', { x: -0.42, z: -0.30, y: 0.28, sx: 0.30, sy: 0.56, sz: 0.30, color: c[1], collision: true });
  add('plinth-b', { x: 0.38, z: -0.26, y: 0.22, sx: 0.34, sy: 0.44, sz: 0.34, color: c[1] });
  add('sculpture-a', { x: -0.42, z: -0.30, y: 0.67, sx: 0.12, sy: 0.24, sz: 0.12, color: c[2], detailTier: 'micro' });
  add('sculpture-b', { x: 0.38, z: -0.26, y: 0.55, sx: 0.18, sy: 0.22, sz: 0.10, color: c[3], detailTier: 'micro' });
  add('visitor-bench', { z: -0.57, y: 0.25, sx: 0.88, sy: 0.28, sz: 0.24, color: c[1], collision: true });
  if (variant === 2) add('projection-bar', { z: 0.24, y: 1.52, sx: 0.44, sy: 0.10, sz: 0.08, color: c[2], emissive: true, detailTier: 'micro' });
}

function repair(place, c, add, variant) {
  add('workbench', { z: 0.20, y: 0.46, sx: 1.46, sy: 0.68, sz: 0.56, color: c[1], collision: true });
  add('tool-cabinet', { x: 0.58, z: 0.48, y: 0.78, sx: 0.42, sy: 1.52, sz: 0.36, color: c[0], collision: true });
  add('tool-board', { z: 0.54, y: 1.16, sx: 0.86, sy: 0.58, sz: 0.04, color: c[4], detailTier: 'identity' });
  add('tool-strip-a', { x: -0.22, z: 0.50, y: 1.18, sx: 0.06, sy: 0.34, sz: 0.03, color: c[2], emissive: true, detailTier: 'micro' });
  add('tool-strip-b', { x: 0.02, z: 0.50, y: 1.18, sx: 0.06, sy: 0.34, sz: 0.03, color: c[1], detailTier: 'micro' });
  add('parts-bin', { x: -0.58, z: -0.38, y: 0.28, sx: 0.44, sy: 0.56, sz: 0.46, color: c[3], collision: true });
  add('hoist-top', { y: 1.78, sx: 1.56, sy: 0.09, sz: 0.10, color: c[2] });
  add('hoist-post-a', { x: -0.68, y: 0.91, sx: 0.09, sy: 1.72, sz: 0.09, color: c[2] });
  add('hoist-post-b', { x: 0.68, y: 0.91, sx: 0.09, sy: 1.72, sz: 0.09, color: c[2] });
  add('battery-rack', { x: 0.34, z: -0.48, y: 0.25, sx: 0.52, sy: 0.50, sz: 0.28, color: c[0], detailTier: 'micro' });
  add('task-light', { x: variant === 0 ? -0.30 : 0.30, z: 0.05, y: 1.48, sx: 0.24, sy: 0.08, sz: 0.10, color: c[4], emissive: true, detailTier: 'micro' });
}

function refuge(place, c, add, variant) {
  add('shelter-canopy', { y: 1.80, sx: 1.82, sy: 0.10, sz: 1.28, color: c[1] });
  add('bench-a', { x: -0.40, y: 0.29, sx: 0.62, sy: 0.36, sz: 0.30, color: c[0], collision: true });
  add('bench-b', { x: 0.40, y: 0.29, sx: 0.62, sy: 0.36, sz: 0.30, color: c[0], collision: true });
  add('water-cabinet', { z: 0.48, y: 0.60, sx: 0.48, sy: 1.18, sz: 0.36, color: c[2], collision: true });
  add('water-light', { z: 0.27, y: 0.88, sx: 0.28, sy: 0.22, sz: 0.03, color: c[4], emissive: true, detailTier: 'micro' });
  add('marker', { z: 0.62, y: 1.42, sx: 0.54, sy: 0.24, sz: 0.06, color: c[3], emissive: true, detailTier: 'identity' });
  add('supply-locker', { x: -0.64, z: 0.42, y: 0.50, sx: 0.30, sy: 0.98, sz: 0.30, color: c[4], collision: true, detailTier: 'micro' });
  add('planter-a', { x: -0.62, z: -0.48, y: 0.18, sx: 0.30, sy: 0.34, sz: 0.30, color: c[2], detailTier: 'micro' });
  add('planter-b', { x: 0.62, z: -0.48, y: 0.18, sx: 0.30, sy: 0.34, sz: 0.30, color: c[2], detailTier: 'micro' });
  add('beacon', { x: variant === 1 ? -0.63 : 0.63, z: 0.28, y: 1.25, sx: 0.10, sy: 0.52, sz: 0.10, color: c[3], emissive: true, detailTier: 'micro' });
}

function utility(place, c, add, variant) {
  add('utility-cabinet-a', { x: -0.44, y: 0.66, sx: 0.56, sy: 1.30, sz: 0.54, color: c[0], collision: true });
  add('utility-cabinet-b', { x: 0.36, z: 0.15, y: 0.51, sx: 0.50, sy: 1.00, sz: 0.62, color: c[1], collision: true });
  add('service-plinth', { z: -0.48, y: 0.20, sx: 1.08, sy: 0.38, sz: 0.36, color: c[2], collision: true });
  add('pipe-header', { y: 1.50, sx: 1.42, sy: 0.10, sz: 0.10, color: c[3] });
  add('pipe-post-a', { x: -0.62, y: 0.82, sx: 0.09, sy: 1.38, sz: 0.09, color: c[3] });
  add('pipe-post-b', { x: 0.62, y: 0.82, sx: 0.09, sy: 1.38, sz: 0.09, color: c[3] });
  add('meter-a', { x: -0.44, z: -0.30, y: 0.96, sx: 0.18, sy: 0.18, sz: 0.08, color: c[2], emissive: true, detailTier: 'micro' });
  add('meter-b', { x: -0.14, z: -0.30, y: 0.96, sx: 0.18, sy: 0.18, sz: 0.08, color: c[2], emissive: true, detailTier: 'micro' });
  add('transformer', { x: 0.56, z: -0.42, y: 0.26, sx: 0.34, sy: 0.52, sz: 0.38, color: c[4], collision: true, detailTier: 'micro' });
  add('conduit-low', { z: variant === 2 ? -0.32 : 0.35, y: 0.18, sx: 1.26, sy: 0.08, sz: 0.08, color: c[4], detailTier: 'micro' });
  add('hazard-band', { z: -0.60, y: 0.08, sx: 1.42, sy: 0.03, sz: 0.10, color: c[2], renderClass: 'paint', detailTier: 'identity' });
}

function fuel(place, c, add, variant) {
  add('fuel-canopy', { y: 1.92, sx: 1.78, sy: 0.10, sz: 1.22, color: c[2] });
  add('pump-a', { x: -0.40, y: 0.58, sx: 0.36, sy: 1.14, sz: 0.40, color: c[0], collision: true });
  add('pump-b', { x: 0.40, y: 0.58, sx: 0.36, sy: 1.14, sz: 0.40, color: c[1], collision: true });
  add('pump-screen-a', { x: -0.40, z: -0.22, y: 0.76, sx: 0.20, sy: 0.22, sz: 0.03, color: c[4], emissive: true, detailTier: 'micro' });
  add('pump-screen-b', { x: 0.40, z: -0.22, y: 0.76, sx: 0.20, sy: 0.22, sz: 0.03, color: c[4], emissive: true, detailTier: 'micro' });
  add('service-box', { z: 0.50, y: 0.44, sx: 0.76, sy: 0.86, sz: 0.32, color: c[3], collision: true });
  add('price-band', { z: 0.68, y: 1.46, sx: 1.08, sy: 0.24, sz: 0.06, color: c[1], emissive: true, detailTier: 'identity' });
  add('bollard-a', { x: -0.67, z: -0.48, y: 0.27, sx: 0.11, sy: 0.54, sz: 0.11, color: c[4], collision: true, detailTier: 'micro' });
  add('bollard-b', { x: 0.67, z: -0.48, y: 0.27, sx: 0.11, sy: 0.54, sz: 0.11, color: c[4], collision: true, detailTier: 'micro' });
  add('hose-rail', { z: -0.44, y: 0.88, sx: 1.12, sy: 0.07, sz: 0.07, color: c[3], detailTier: 'micro' });
  add('roof-beacon', { x: variant === 0 ? -0.60 : 0.60, z: 0.42, y: 1.72, sx: 0.12, sy: 0.20, sz: 0.12, color: c[0], emissive: true, detailTier: 'micro' });
}

const BUILDERS = Object.freeze({
  'roof-bodega': bodega,
  'thrift-stall': thrift,
  'gallery-terrace': gallery,
  'repair-bay': repair,
  refuge,
  'utility-yard': utility,
  'fuel-kiosk': fuel,
});

export function summarizeRouteOwnedPlaceParts(parts = []) {
  const roles = new Set(parts.map(item => item.role));
  return Object.freeze({
    parts: parts.length,
    roles: roles.size,
    collisionParts: parts.filter(item => item.collision === true).length,
    emissiveParts: parts.filter(item => item.emissive === true).length,
    paintParts: parts.filter(item => item.renderClass === 'paint').length,
    microParts: parts.filter(item => item.detailTier === 'micro').length,
    identityParts: parts.filter(item => item.detailTier === 'identity').length,
    approachParts: parts.filter(item => item.detailTier === 'approach').length,
  });
}

export function routeOwnedScenePartWithinFootprint(place, item, clearance = EPS) {
  return Math.abs(Number(item.x) - Number(place.x)) + Number(item.sx) * 0.5 <= Number(place.halfX) + clearance
    && Math.abs(Number(item.z) - Number(place.z)) + Number(item.sz) * 0.5 <= Number(place.halfZ) + clearance;
}

export function buildRouteOwnedPlaceScene(place, { stableKey = 'route-owned-place-scene', variant = null } = {}) {
  const placeType = String(place?.placeType ?? 'utility-yard');
  // Location systems may name the same visual grammar differently (for example
  // street-bodega vs roof-bodega). sceneType is the canonical visual vocabulary;
  // placeType remains the semantic identity published by the host system.
  const sceneType = String(place?.sceneType ?? placeType);
  const c = PALETTES[sceneType] ?? PALETTES['utility-yard'];
  const variantKey = sceneType === placeType
    ? `${stableKey}:${place?.id ?? placeType}:variant`
    : `${stableKey}:${place?.id ?? placeType}:${sceneType}:variant`;
  const resolvedVariant = Number.isInteger(variant)
    ? ((variant % ROUTE_OWNED_PLACE_SCENE_VARIANTS) + ROUTE_OWNED_PLACE_SCENE_VARIANTS) % ROUTE_OWNED_PLACE_SCENE_VARIANTS
    : stableHash(variantKey) % ROUTE_OWNED_PLACE_SCENE_VARIANTS;
  const parts = [];
  const add = (role, spec) => parts.push(part(place, role, spec));
  basePaint(place, c, add, resolvedVariant);
  (BUILDERS[sceneType] ?? utility)(place, c, add, resolvedVariant);
  streetApproachIdentity(place, sceneType, c, add, resolvedVariant);
  for (const item of parts) {
    if (!routeOwnedScenePartWithinFootprint(place, item, 0.025)) {
      throw new Error(`${place?.id ?? placeType}:${item.role}: scene part escapes route-owned footprint`);
    }
  }
  const frozenParts = Object.freeze(parts);
  return Object.freeze({
    schema: ROUTE_OWNED_PLACE_SCENE_SCHEMA,
    version: ROUTE_OWNED_PLACE_SCENE_VERSION,
    placeType,
    sceneType,
    variant: resolvedVariant,
    tags: TAGS[sceneType] ?? TAGS['utility-yard'],
    parts: frozenParts,
    metrics: summarizeRouteOwnedPlaceParts(frozenParts),
    invariant: 'dense authored identity stays inside the route-owned footprint; street approach identity is non-colliding paint/emissive silhouette and render detail stays instanced',
  });
}
