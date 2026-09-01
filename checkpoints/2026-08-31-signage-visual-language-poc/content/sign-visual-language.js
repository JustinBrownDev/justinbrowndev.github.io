// JWEB signage visual-language proof of concept.
// Pure deterministic recipe resolver: no THREE, no canvas, no asset loads.

export const DISPLAY_RECIPE_SCHEMA = 'jweb.display-recipe.v1';
export const DISPLAY_VECTOR_SCHEMA = 'jweb.display-vectors.v1';

const VECTOR_KEYS = Object.freeze([
  'authority', 'commerce', 'machine', 'human',
  'urgency', 'locality', 'spectacle', 'informationDensity',
]);

const SURFACE_ALIASES = Object.freeze({
  sign: 'facade-sign',
  signage: 'facade-sign',
  'facade-sign-zone': 'facade-sign',
  'portal-lintel-zone': 'facade-sign',
  poster: 'poster',
  flyer: 'flyer',
  sticker: 'sticker',
  billboard: 'roof-billboard',
  'roof-megascreen': 'roof-billboard',
  'roof-billboard': 'roof-billboard',
  megascreen: 'facade-megascreen',
  'facade-megascreen': 'facade-megascreen',
  'corner-megascreen': 'corner-megascreen',
  'corner-media-band': 'corner-megascreen',
  'facade-spectacle-span': 'facade-megascreen',
  blade: 'blade-sign',
  'blade-sign': 'blade-sign',
});

const SURFACE_DEFAULTS = Object.freeze({
  'blade-sign':        { authority: 0.05, commerce: 0.22, machine: 0.00, human: 0.08, urgency: 0.05, locality: 0.18, spectacle: 0.10, informationDensity: -0.15 },
  'facade-sign':       { authority: 0.05, commerce: 0.15, machine: 0.00, human: 0.05, urgency: 0.03, locality: 0.10, spectacle: 0.08, informationDensity: -0.05 },
  poster:              { authority: 0.00, commerce: 0.02, machine: -0.05, human: 0.22, urgency: 0.03, locality: 0.12, spectacle: -0.05, informationDensity: 0.12 },
  flyer:               { authority: -0.02, commerce: 0.02, machine: -0.08, human: 0.25, urgency: 0.06, locality: 0.18, spectacle: -0.12, informationDensity: 0.18 },
  sticker:             { authority: -0.05, commerce: 0.00, machine: -0.10, human: 0.30, urgency: 0.10, locality: 0.22, spectacle: -0.10, informationDensity: -0.30 },
  'roof-billboard':    { authority: 0.02, commerce: 0.18, machine: 0.00, human: -0.02, urgency: 0.08, locality: -0.06, spectacle: 0.35, informationDensity: -0.18 },
  'facade-megascreen': { authority: 0.03, commerce: 0.12, machine: 0.08, human: -0.02, urgency: 0.10, locality: -0.04, spectacle: 0.40, informationDensity: -0.10 },
  'corner-megascreen': { authority: 0.02, commerce: 0.10, machine: 0.10, human: -0.03, urgency: 0.10, locality: -0.06, spectacle: 0.48, informationDensity: -0.12 },
});

const TOKEN_VECTORS = Object.freeze({
  // District/data families already natural to jweb.
  network:      { machine: 0.34, authority: 0.08, informationDensity: 0.24, locality: -0.08 },
  protocol:     { machine: 0.38, authority: 0.12, informationDensity: 0.30, human: -0.12 },
  encoding:     { machine: 0.30, informationDensity: 0.28, spectacle: 0.04 },
  transport:    { authority: 0.14, machine: 0.18, locality: 0.14, urgency: 0.08, informationDensity: 0.10 },
  transit:      { authority: 0.18, machine: 0.15, locality: 0.16, urgency: 0.10 },
  geographic:   { locality: 0.34, human: 0.12, authority: 0.04, informationDensity: 0.08 },
  scientific:   { authority: 0.12, machine: 0.24, informationDensity: 0.32, human: -0.05 },
  weather:      { scientific: 0.0, machine: 0.14, informationDensity: 0.20, urgency: 0.08 },

  // Building/interior/frontage semantics.
  retail:       { commerce: 0.42, human: 0.14, locality: 0.10, spectacle: 0.10 },
  commercial:   { commerce: 0.36, spectacle: 0.08, authority: 0.03 },
  market:       { commerce: 0.44, human: 0.22, locality: 0.22, urgency: 0.05 },
  restaurant:   { commerce: 0.30, human: 0.30, locality: 0.20 },
  entertainment:{ commerce: 0.22, human: 0.12, spectacle: 0.34, urgency: 0.10 },
  nightlife:    { commerce: 0.24, human: 0.10, spectacle: 0.40, urgency: 0.14 },
  industrial:   { machine: 0.40, urgency: 0.10, human: -0.12, commerce: -0.04 },
  mechanical:   { machine: 0.48, informationDensity: 0.16, human: -0.18 },
  service:      { machine: 0.26, authority: 0.08, informationDensity: 0.16, spectacle: -0.12 },
  utility:      { machine: 0.36, authority: 0.20, urgency: 0.10, spectacle: -0.18 },
  storage:      { machine: 0.14, human: -0.15, spectacle: -0.15, commerce: -0.08 },
  residential:  { human: 0.28, locality: 0.18, commerce: -0.12, spectacle: -0.18 },
  public:       { authority: 0.30, locality: 0.18, human: 0.08 },
  civic:        { authority: 0.48, locality: 0.22, commerce: -0.16 },
  institutional:{ authority: 0.42, informationDensity: 0.12, commerce: -0.12 },
  lobby:        { authority: 0.16, human: 0.10, informationDensity: -0.08 },
  circulation:  { authority: 0.08, locality: 0.12, informationDensity: 0.08 },
  entry:        { locality: 0.14, authority: 0.08, informationDensity: -0.12 },
  storefront:   { commerce: 0.36, human: 0.18, locality: 0.16 },

  // District/block composition vocabulary.
  landmark:     { spectacle: 0.42, authority: 0.10, locality: 0.10 },
  anchor:       { spectacle: 0.25, authority: 0.10, commerce: 0.08 },
  spectacle:    { spectacle: 0.48, urgency: 0.06, informationDensity: -0.10 },
  corridor:     { spectacle: 0.18, locality: 0.10, commerce: 0.08 },
  quiet:        { spectacle: -0.32, urgency: -0.20, informationDensity: -0.12, human: 0.10 },
  pedestrian:   { human: 0.18, locality: 0.16, commerce: 0.10 },
  loading:      { machine: 0.22, urgency: 0.08, commerce: -0.08 },
  alley:        { locality: 0.20, human: 0.12, authority: -0.10, commerce: -0.04 },

  // Public-role/content tone tokens.
  warning:      { urgency: 0.42, authority: 0.18, machine: 0.12 },
  emergency:    { urgency: 0.50, authority: 0.20, spectacle: 0.06 },
  official:     { authority: 0.34, human: -0.08 },
  personal:     { human: 0.40, locality: 0.15, authority: -0.16 },
  archive:      { authority: 0.12, human: 0.18, informationDensity: 0.24, spectacle: -0.12 },
  broadcast:    { spectacle: 0.36, urgency: 0.14, informationDensity: 0.10 },
});

const FONT_STACKS = Object.freeze({
  mono: 'Consolas, "Lucida Console", "Courier New", monospace',
  block: '"Arial Black", Impact, Arial, sans-serif',
  sans: 'Verdana, Tahoma, "Trebuchet MS", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  human: '"Trebuchet MS", Verdana, Arial, sans-serif',
});

export const DISPLAY_DIALECTS = Object.freeze([
  dialect('civic-authority',
    { authority: .92, commerce: .08, machine: .34, human: .24, urgency: .38, locality: .62, spectacle: .30, informationDensity: .70 },
    ['boxed-notice','split-rail','stacked-index'], ['#e7e0cf','#111111','#b51f1f','#27374a'], ['sans','mono'], 'seal-grid'),
  dialect('machine-terminal',
    { authority: .36, commerce: .10, machine: .98, human: .06, urgency: .44, locality: .20, spectacle: .36, informationDensity: .94 },
    ['terminal-grid','vertical-code','ledger-cells'], ['#060909','#d8f8e0','#50ff8a','#59726b'], ['mono','mono'], 'scan-lines'),
  dialect('market-blast',
    { authority: .10, commerce: .98, machine: .22, human: .70, urgency: .62, locality: .68, spectacle: .76, informationDensity: .42 },
    ['hero-word','split-rail','hero-number'], ['#f0df36','#1d1712','#f04a31','#f5efe5'], ['block','sans'], 'price-burst'),
  dialect('transit-wayfinding',
    { authority: .70, commerce: .14, machine: .58, human: .28, urgency: .40, locality: .92, spectacle: .38, informationDensity: .68 },
    ['split-rail','stacked-index','hero-number'], ['#e8e4da','#14191f','#f3a927','#216093'], ['sans','mono'], 'route-band'),
  dialect('scientific-instrument',
    { authority: .55, commerce: .04, machine: .84, human: .10, urgency: .22, locality: .24, spectacle: .38, informationDensity: .98 },
    ['ledger-cells','terminal-grid','stacked-index'], ['#e5eceb','#11191c','#e05a47','#5f7f82'], ['mono','sans'], 'instrument-grid'),
  dialect('editorial-human',
    { authority: .22, commerce: .28, machine: .08, human: .96, urgency: .18, locality: .72, spectacle: .30, informationDensity: .62 },
    ['poster-editorial','quiet-mark','stacked-index'], ['#eee3cd','#221b18','#9b2f2a','#5f554c'], ['serif','human'], 'editorial-rule'),
  dialect('luxury-sparse',
    { authority: .40, commerce: .72, machine: .04, human: .28, urgency: .04, locality: .20, spectacle: .66, informationDensity: .08 },
    ['quiet-mark','hero-word','split-rail'], ['#11100f','#f3ede0','#b99b62','#4c4740'], ['serif','sans'], 'fine-rule'),
  dialect('industrial-warning',
    { authority: .58, commerce: .08, machine: .88, human: .08, urgency: .96, locality: .28, spectacle: .48, informationDensity: .52 },
    ['warning-field','hero-number','boxed-notice'], ['#e8c62d','#111111','#e13a2d','#f2eee3'], ['block','mono'], 'hazard-stripe'),
  dialect('broadcast-spectacle',
    { authority: .20, commerce: .62, machine: .42, human: .30, urgency: .62, locality: .12, spectacle: .99, informationDensity: .46 },
    ['broadcast-ticker','hero-word','hero-number'], ['#130a21','#f7f1f4','#ff3a77','#45d5ff'], ['block','sans'], 'broadcast-bars'),
  dialect('network-protocol',
    { authority: .48, commerce: .14, machine: .96, human: .04, urgency: .34, locality: .10, spectacle: .44, informationDensity: .96 },
    ['vertical-code','terminal-grid','ledger-cells'], ['#07131b','#d8edf5','#55c7ff','#ec5a49'], ['mono','mono'], 'packet-grid'),
  dialect('street-handmade',
    { authority: .04, commerce: .30, machine: .04, human: .99, urgency: .48, locality: .96, spectacle: .40, informationDensity: .30 },
    ['hero-word','poster-editorial','warning-field'], ['#e8d8b4','#17110d','#e6432f','#286c65'], ['human','block'], 'tape-marks'),
  dialect('archive-manifesto',
    { authority: .38, commerce: .04, machine: .20, human: .74, urgency: .34, locality: .58, spectacle: .24, informationDensity: .92 },
    ['stacked-index','poster-editorial','boxed-notice'], ['#ddd6c8','#1d1b19','#8e1d20','#4c5b58'], ['serif','mono'], 'archive-stamp'),
]);

const DIALECT_PRIORS = Object.freeze({
  'civic-authority': ['civic','official','public','institutional','authority'],
  'machine-terminal': ['terminal','utility','mechanical','service','machine'],
  'market-blast': ['market','retail','commercial','restaurant','storefront'],
  'transit-wayfinding': ['transport','transit','circulation','route','platform'],
  'scientific-instrument': ['scientific','weather','observatory','station','sensor'],
  'editorial-human': ['personal','residential','editorial','community','memory'],
  'luxury-sparse': ['luxury','private','tower','lobby','quiet'],
  'industrial-warning': ['industrial','warning','emergency','loading','hazard'],
  'broadcast-spectacle': ['broadcast','entertainment','nightlife','spectacle','landmark','media'],
  'network-protocol': ['network','protocol','encoding','port','packet'],
  'street-handmade': ['alley','pedestrian','handmade','cafe','local'],
  'archive-manifesto': ['archive','record','manifesto','index','document'],
});

const DIALECT_BY_ID = new Map(DISPLAY_DIALECTS.map(item => [item.id, item]));

function dialect(id, anchor, layouts, palette, fonts, motif) {
  return Object.freeze({ id, anchor: Object.freeze(anchor), layouts: Object.freeze(layouts), palette: Object.freeze(palette), fonts: Object.freeze(fonts), motif });
}

export function normalizeDisplaySurface(value) {
  const key = String(value ?? 'facade-sign').toLowerCase();
  return SURFACE_ALIASES[key] ?? key;
}

export function hashDisplaySeed(value) {
  let h = 2166136261 >>> 0;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rngForDisplaySeed(seed) {
  let a = Number(seed) >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveDisplayVectors(context = {}) {
  const seed = hashDisplaySeed(displayIdentityKey(context));
  const rng = rngForDisplaySeed(seed);
  const vector = Object.fromEntries(VECTOR_KEYS.map(key => [key, 0.34 + rng() * 0.16]));
  const surface = normalizeDisplaySurface(context.surfaceKind ?? context.assemblyKind ?? context.targetSurface ?? context.kind);
  addVector(vector, SURFACE_DEFAULTS[surface]);

  const text = semanticTokenText(context);
  for (const [token, delta] of Object.entries(TOKEN_VECTORS)) {
    if (text.includes(token)) addVector(vector, delta);
  }

  if (context.landmark === true) addVector(vector, TOKEN_VECTORS.landmark);
  if (context.spectacle === true || /mega|spectacle|billboard/.test(surface)) vector.spectacle += 0.12;
  if (context.publicRole === 'public' || context.publicRole === 'civic') vector.authority += 0.12;

  // Stable micro-jitter prevents identical semantic contexts from quantizing into clones.
  for (const key of VECTOR_KEYS) vector[key] = clamp01(vector[key] + (rng() - 0.5) * 0.10);

  return Object.freeze({ schema: DISPLAY_VECTOR_SCHEMA, ...vector });
}

export function resolveDisplayRecipe(context = {}) {
  const surfaceKind = normalizeDisplaySurface(context.surfaceKind ?? context.assemblyKind ?? context.targetSurface ?? context.kind);
  const vectors = deriveDisplayVectors({ ...context, surfaceKind });
  // Campaign-level semantics choose the graphic dialect and palette. Surface type
  // only chooses the manifestation/layout, so the same campaign remains visibly
  // related across megascreens, blade signs, posters, flyers, and stickers.
  const campaignVectors = deriveDisplayVectors({ ...context, surfaceKind: 'campaign' });
  const campaignKey = String(context.campaignKey ?? context.frontageBindingKey ?? context.bindingKey ?? context.entityId ?? context.hostBuildingId ?? 'jweb:anonymous');
  const campaignIdentity = displayCampaignIdentityKey({ ...context, campaignKey });
  const seed = Number.isFinite(context.campaignSeed) ? Number(context.campaignSeed) >>> 0 : hashDisplaySeed(campaignIdentity);
  const campaignRng = rngForDisplaySeed(seed);
  const surfaceSeed = hashDisplaySeed(`${seed}:${surfaceKind}`);
  const rng = rngForDisplaySeed(surfaceSeed);

  const ranked = DISPLAY_DIALECTS
    .map(d => ({ dialect: d, score: dialectDistance(campaignVectors, d.anchor) + semanticPriorScore(context, d.id) + stableTie(seed, d.id) }))
    .sort((a, b) => a.score - b.score);
  const chosen = ranked[0].dialect;

  const paletteShift = Math.floor(campaignRng() * chosen.palette.length);
  const palette = rotate(chosen.palette, paletteShift);
  const allowedLayouts = layoutCandidatesForSurface(surfaceKind, chosen.layouts);
  const layout = allowedLayouts[Math.floor(rng() * allowedLayouts.length) % allowedLayouts.length];
  const primaryFont = FONT_STACKS[chosen.fonts[0]] ?? FONT_STACKS.sans;
  const secondaryFont = FONT_STACKS[chosen.fonts[1]] ?? FONT_STACKS.mono;

  const recipe = {
    schema: DISPLAY_RECIPE_SCHEMA,
    id: `${campaignKey}:${surfaceKind}:${surfaceSeed.toString(16).padStart(8, '0')}`,
    campaignKey,
    seed,
    surfaceSeed,
    surfaceKind,
    dialect: chosen.id,
    layout,
    motif: chosen.motif,
    vectors,
    campaignVectors,
    palette: {
      background: palette[0],
      foreground: palette[1],
      accent: palette[2],
      secondary: palette[3] ?? palette[1],
    },
    fonts: { primary: primaryFont, secondary: secondaryFont },
    alignment: pickWeighted(rng, alignmentWeights(vectors, layout)),
    casing: pickWeighted(campaignRng, casingWeights(chosen.id, campaignVectors)),
    border: borderRecipe(rng, vectors, surfaceKind),
    density: densityBand(vectors.informationDensity),
    emphasis: emphasisBand(vectors.spectacle, vectors.urgency),
    showSerial: vectors.informationDensity > 0.42 || vectors.machine > 0.58,
    showValue: vectors.commerce > 0.52 || vectors.informationDensity > 0.72,
    showFamily: true,
    inversePanel: rng() < 0.34 + vectors.spectacle * 0.18,
    markVariant: Math.floor(campaignRng() * 7),
    stripeCount: 3 + Math.floor(rng() * 7),
    ruleCount: 1 + Math.floor(rng() * 4),
  };
  return Object.freeze(recipe);
}

export function displayCampaignIdentityKey(context = {}) {
  return [
    context.campaignKey,
    context.frontageBindingKey ?? context.bindingKey,
    context.entityId ?? context.hostBuildingId,
    context.districtId,
    context.districtFamily,
    context.districtSubCharacter,
    context.blockRole,
    context.program ?? context.semanticProgram,
    context.frontageRole,
    context.publicRole,
    context.semanticDestinationId,
  ].filter(value => value != null && value !== '').join('|') || 'jweb:campaign';
}

export function recipeContextFromSemanticMedia(media = {}, placement = {}) {
  return {
    campaignKey: media.campaignKey,
    campaignSeed: media.campaignSeed,
    entityId: media.entityId ?? media.hostBuildingId,
    hostBuildingId: media.hostBuildingId,
    buildingSemanticTruthId: media.buildingSemanticTruthId,
    semanticProgram: media.semanticProgram,
    program: media.semanticProgram,
    semanticDestinationId: media.semanticDestinationId,
    districtId: media.districtId,
    districtFamily: media.districtFamily,
    frontageBindingKey: media.frontageBindingKey,
    frontageRole: media.frontageRole,
    publicRole: media.publicRole,
    landmark: media.landmark,
    assemblyKind: media.assemblyKind ?? placement.assemblyKind,
    surfaceKind: media.assemblyKind ?? placement.assemblyKind,
    semanticOpportunityRole: placement.semanticOpportunityRole ?? placement.role,
  };
}

export function recipeContextFromExteriorTask(task = {}, overrides = {}) {
  const semantic = task.semanticContentContext ?? {};
  return {
    campaignKey: semantic.campaignKey,
    entityId: task.entityId,
    hostBuildingId: task.entityId,
    buildingSemanticTruthId: task.buildingSemanticTruthId,
    semanticProgram: semantic.program ?? task.buildingSemanticProgram ?? task.semanticProgram,
    program: semantic.program ?? task.buildingSemanticProgram ?? task.semanticProgram,
    semanticDestinationId: semantic.destinationId ?? task.semanticDestinationId,
    districtId: semantic.districtId ?? task.districtId,
    districtFamily: semantic.districtFamily ?? task.districtFamily,
    districtSubCharacter: semantic.districtSubCharacter ?? task.districtSubCharacter,
    blockRole: semantic.blockRole ?? task.blockRole,
    frontageBindingKey: semantic.bindingKey,
    frontageRole: semantic.frontageRole ?? task.frontageRole,
    publicRole: semantic.publicRole ?? task.publicRole,
    landmark: semantic.landmark ?? task.landmark,
    semanticOpportunityRole: task.semanticOpportunityRole,
    surfaceKind: overrides.surfaceKind ?? task.assemblyKind ?? task.semanticOpportunityRole ?? task.kind,
    ...overrides,
  };
}

export function displayIdentityKey(context = {}) {
  return [
    context.campaignKey,
    context.frontageBindingKey ?? context.bindingKey,
    context.entityId ?? context.hostBuildingId,
    context.districtId,
    context.districtFamily,
    context.districtSubCharacter,
    context.blockRole,
    context.program ?? context.semanticProgram,
    context.frontageRole,
    context.publicRole,
    normalizeDisplaySurface(context.surfaceKind ?? context.assemblyKind ?? context.targetSurface ?? context.kind),
    context.semanticDestinationId,
  ].filter(value => value != null && value !== '').join('|') || 'jweb:display';
}

function semanticTokenText(context) {
  return [
    context.districtFamily, context.districtSubCharacter, context.blockRole,
    context.program, context.semanticProgram, context.frontageRole, context.publicRole,
    context.semanticOpportunityRole, context.targetSurface, context.kind, context.assemblyKind,
    context.semanticFamily, context.contentFamily,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_:/.-]+/g, ' ');
}

function addVector(target, delta) {
  if (!delta) return target;
  for (const key of VECTOR_KEYS) {
    if (Number.isFinite(delta[key])) target[key] += delta[key];
  }
  return target;
}

function semanticPriorScore(context, dialectId) {
  const text = semanticTokenText(context);
  const tokens = DIALECT_PRIORS[dialectId] ?? [];
  let matches = 0;
  for (const token of tokens) if (text.includes(token)) matches++;
  // Small prior only: vectors remain authoritative, but clear jweb semantic families
  // do not collapse into near-neighbor visual dialects such as network/scientific.
  return -Math.min(0.42, matches * 0.11);
}

function dialectDistance(vectors, anchor) {
  let sum = 0;
  const weights = { authority: 1.0, commerce: 1.0, machine: 1.08, human: 1.0, urgency: .82, locality: .78, spectacle: 1.05, informationDensity: 1.08 };
  for (const key of VECTOR_KEYS) {
    const diff = vectors[key] - anchor[key];
    sum += diff * diff * weights[key];
  }
  return sum;
}

function layoutCandidatesForSurface(surface, dialectLayouts) {
  const preferred = {
    'blade-sign': ['hero-word','quiet-mark','hero-number','split-rail'],
    'facade-sign': ['hero-word','hero-number','split-rail','quiet-mark','boxed-notice'],
    poster: ['poster-editorial','stacked-index','boxed-notice','warning-field','ledger-cells'],
    flyer: ['poster-editorial','stacked-index','boxed-notice','ledger-cells'],
    sticker: ['hero-word','hero-number','quiet-mark','warning-field'],
    'roof-billboard': ['hero-word','hero-number','quiet-mark','broadcast-ticker','split-rail'],
    'facade-megascreen': ['hero-word','hero-number','broadcast-ticker','terminal-grid','split-rail','vertical-code'],
    'corner-megascreen': ['hero-word','hero-number','broadcast-ticker','split-rail','vertical-code'],
  }[surface] ?? dialectLayouts;
  const intersection = dialectLayouts.filter(item => preferred.includes(item));
  return intersection.length ? intersection : dialectLayouts;
}

function alignmentWeights(vectors, layout) {
  if (layout === 'terminal-grid' || layout === 'ledger-cells' || layout === 'vertical-code') return [['left', .84], ['center', .08], ['right', .08]];
  if (layout === 'quiet-mark') return [['left', .36], ['center', .44], ['right', .20]];
  return [['left', .48 + vectors.informationDensity * .18], ['center', .38 + vectors.spectacle * .14], ['right', .14]];
}

function casingWeights(dialectId, vectors) {
  if (dialectId === 'editorial-human' || dialectId === 'luxury-sparse') return [['natural', .55], ['upper', .35], ['lower', .10]];
  return [['upper', .58 + vectors.authority * .12], ['natural', .34], ['lower', .08]];
}

function borderRecipe(rng, vectors, surfaceKind) {
  const chance = surfaceKind === 'sticker' ? .25 : .52 + vectors.authority * .18;
  if (rng() > chance) return { style: 'none', width: 0, inset: 0 };
  const styles = vectors.urgency > .72 ? ['cut','solid','double'] : ['solid','double','hairline','cut'];
  return {
    style: styles[Math.floor(rng() * styles.length) % styles.length],
    width: 0.004 + rng() * 0.009,
    inset: 0.018 + rng() * 0.022,
  };
}

function densityBand(value) {
  if (value > .78) return 'dense';
  if (value > .48) return 'medium';
  return 'sparse';
}

function emphasisBand(spectacle, urgency) {
  const value = spectacle * .7 + urgency * .3;
  if (value > .72) return 'max';
  if (value > .46) return 'strong';
  return 'restrained';
}

function stableTie(seed, id) {
  return (hashDisplaySeed(`${seed}:${id}`) / 0xffffffff) * 0.00001;
}

function pickWeighted(rng, pairs) {
  const total = pairs.reduce((sum, item) => sum + item[1], 0);
  let needle = rng() * total;
  for (const [value, weight] of pairs) {
    needle -= weight;
    if (needle <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function rotate(items, offset) {
  return items.map((_, index) => items[(index + offset) % items.length]);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getDisplayDialect(id) {
  return DIALECT_BY_ID.get(id) ?? null;
}
