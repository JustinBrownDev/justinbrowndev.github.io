// Visual-only material tint policy for 21W architectural wrapper geometry.
//
// This module does not create geometry, traversal, collision, apertures, rooms,
// materials, or draw-call buckets. It only supplies restrained per-instance RGB
// values to transforms that the architecture planners already emit.

export const ARCHITECTURE_MATERIAL_HANDWRITING_SCHEMA = 'jweb.architecture-material-handwriting.v1';

const DEFAULT_PALETTE = Object.freeze({ metal: 0x62635e, concrete: 0x737169 });

export const ARCHITECTURE_MATERIAL_PALETTES = Object.freeze({
  // Stair / circulation expression families.
  'industrial-fire-escape': Object.freeze({ metal: 0x5f5448, concrete: 0x747069 }),
  'residential-enclosed': Object.freeze({ metal: 0x6d6961, concrete: 0x766d61 }),
  'civic-monumental': Object.freeze({ metal: 0x687172, concrete: 0x747979 }),
  'scaffold-service': Object.freeze({ metal: 0x565c58, concrete: 0x696a64 }),
  'utility-rack': Object.freeze({ metal: 0x4f605b, concrete: 0x686d68 }),
  'brutalist-mass': Object.freeze({ metal: 0x625d57, concrete: 0x66615a }),

  // Program-scale macro families.
  'domestic-access-stack': Object.freeze({ metal: 0x6c6760, concrete: 0x766e63 }),
  'market-frontage-frame': Object.freeze({ metal: 0x625c50, concrete: 0x777166 }),
  'food-service-exhaust-frame': Object.freeze({ metal: 0x59605d, concrete: 0x706e68 }),
  'workshop-service-frame': Object.freeze({ metal: 0x575a55, concrete: 0x6c6961 }),
  'industrial-bay-megastructure': Object.freeze({ metal: 0x565955, concrete: 0x676861 }),
  'civic-core-frame': Object.freeze({ metal: 0x697071, concrete: 0x777a78 }),
  'secure-institutional-frame': Object.freeze({ metal: 0x5a6060, concrete: 0x686c6b }),
  'laboratory-utility-frame': Object.freeze({ metal: 0x53615f, concrete: 0x6d7270 }),
  'warehouse-loading-frame': Object.freeze({ metal: 0x5c574f, concrete: 0x6e6960 }),
  'data-utility-megastructure': Object.freeze({ metal: 0x4f5e5b, concrete: 0x686d6a }),
});

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mixRgb(a, b, t) {
  const amount = clamp01(t);
  const ar = (a >>> 16) & 0xff, ag = (a >>> 8) & 0xff, ab = a & 0xff;
  const br = (b >>> 16) & 0xff, bg = (b >>> 8) & 0xff, bb = b & 0xff;
  const mix = (x, y) => Math.max(0, Math.min(255, Math.round(x + (y - x) * amount)));
  return ((mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb)) >>> 0;
}

export function architectureMaterialColor({
  family = '',
  materialKind = 'metal',
  field = 'ground',
  weightScale = 1,
} = {}) {
  const palette = ARCHITECTURE_MATERIAL_PALETTES[String(family)] ?? DEFAULT_PALETTE;
  let color = materialKind === 'concrete' ? palette.concrete : palette.metal;

  // Hanging architecture gets a small cool/desaturated shift. This is material
  // atmosphere, not navigation coding; the family remains recognizable in both fields.
  if (field === 'ceiling') color = mixRgb(color, 0x596267, 0.14);

  // Real structural bulk may darken very slightly. The range is intentionally
  // narrow so path width cannot turn into a bright game-state color language.
  const bulk = Math.max(1, Number(weightScale) || 1);
  const darken = Math.min(0.11, Math.max(0, bulk - 1) * 0.075);
  if (darken > 0) color = mixRgb(color, 0x3f4140, darken);

  return color >>> 0;
}

export function applyArchitectureMaterialHandwriting({
  family = '',
  metal = [],
  concrete = [],
  field = 'ground',
  weightScale = 1,
} = {}) {
  const metalColor = architectureMaterialColor({ family, materialKind: 'metal', field, weightScale });
  const concreteColor = architectureMaterialColor({ family, materialKind: 'concrete', field, weightScale });
  const tint = (parts, color) => Object.freeze((parts ?? []).map(part => ({
    ...part,
    // Explicit upstream color remains authoritative if a future family needs it.
    color: part?.color ?? color,
  })));
  return Object.freeze({
    schema: ARCHITECTURE_MATERIAL_HANDWRITING_SCHEMA,
    family: String(family),
    metalColor,
    concreteColor,
    metal: tint(metal, metalColor),
    concrete: tint(concrete, concreteColor),
  });
}
