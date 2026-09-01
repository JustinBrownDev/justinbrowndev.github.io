// Deterministic semantic visual-language resolver for signs and media surfaces.
// Pure data only: no THREE, canvas, assets, timers, or frame-loop behavior.

export const DISPLAY_RECIPE_SCHEMA = 'jweb.display-recipe.v2';

const SURFACE_ALIASES = Object.freeze({
    sign: 'facade-sign',
    signage: 'facade-sign',
    'facade-sign-zone': 'facade-sign',
    'portal-lintel-zone': 'facade-sign',
    blade: 'blade-sign',
    'blade-sign': 'blade-sign',
    poster: 'poster',
    flyer: 'flyer',
    sticker: 'sticker',
    billboard: 'roof-billboard',
    'roof-billboard': 'roof-billboard',
    'roof-megascreen': 'roof-billboard',
    megascreen: 'facade-megascreen',
    'facade-megascreen': 'facade-megascreen',
    'corner-megascreen': 'corner-megascreen',
    'corner-media-band': 'corner-megascreen',
    'facade-spectacle-span': 'facade-megascreen',
});

const FAMILY_PROFILES = Object.freeze({
    'market-retail': Object.freeze({
        layouts: Object.freeze(['market-stack', 'market-rail']),
        palettes: Object.freeze([
            Object.freeze(['#f0df36', '#1d1712', '#f04a31', '#f5efe5']),
            Object.freeze(['#f4efe4', '#16181c', '#d8324a', '#e3a72f']),
            Object.freeze(['#13241d', '#ecf2df', '#ff6a38', '#8ccf75']),
        ]),
        fonts: Object.freeze({ primary: 'Impact, "Arial Black", Arial, sans-serif', secondary: 'Verdana, Tahoma, Arial, sans-serif' }),
        motif: 'price-burst',
        slots: Object.freeze(['brand', 'offer', 'detail', 'value']),
    }),
    'service-mechanical': Object.freeze({
        layouts: Object.freeze(['service-grid', 'service-warning']),
        palettes: Object.freeze([
            Object.freeze(['#07131b', '#d8edf5', '#55c7ff', '#ec5a49']),
            Object.freeze(['#080b0b', '#d8f8e0', '#50ff8a', '#647b72']),
            Object.freeze(['#17130a', '#f1e7b7', '#e8c62d', '#d24a35']),
        ]),
        fonts: Object.freeze({ primary: 'Consolas, "Lucida Console", "Courier New", monospace', secondary: 'Consolas, "Lucida Console", "Courier New", monospace' }),
        motif: 'instrument-grid',
        slots: Object.freeze(['status', 'machine', 'telemetry', 'serial', 'warning']),
    }),
    'public-transport': Object.freeze({
        layouts: Object.freeze(['public-wayfinding', 'public-notice']),
        palettes: Object.freeze([
            Object.freeze(['#e8e4da', '#14191f', '#f3a927', '#216093']),
            Object.freeze(['#f0eee6', '#172236', '#c3332d', '#477c98']),
            Object.freeze(['#14201e', '#e7e7d7', '#e1a82b', '#5ca7a5']),
        ]),
        fonts: Object.freeze({ primary: 'Verdana, Tahoma, "Trebuchet MS", Arial, sans-serif', secondary: 'Consolas, "Lucida Console", "Courier New", monospace' }),
        motif: 'route-band',
        slots: Object.freeze(['route', 'destination', 'direction', 'authority']),
    }),
    spectacle: Object.freeze({
        layouts: Object.freeze(['spectacle-ribbon', 'spectacle-hero']),
        palettes: Object.freeze([
            Object.freeze(['#130a21', '#f7f1f4', '#ff3a77', '#45d5ff']),
            Object.freeze(['#06141f', '#f2f8ff', '#6ee7ff', '#ffce43']),
            Object.freeze(['#1b0710', '#fff0dd', '#ff5d4a', '#bc8cff']),
        ]),
        fonts: Object.freeze({ primary: 'Impact, "Arial Black", Arial, sans-serif', secondary: 'Verdana, Tahoma, Arial, sans-serif' }),
        motif: 'broadcast-bars',
        slots: Object.freeze(['hero', 'signal', 'ticker']),
    }),
    'local-mixed': Object.freeze({
        layouts: Object.freeze(['local-index', 'local-mark']),
        palettes: Object.freeze([
            Object.freeze(['#171717', '#f5e7c8', '#d17c3a', '#8faeaa']),
            Object.freeze(['#0d1d1f', '#e7efe8', '#65c6ba', '#d9974c']),
            Object.freeze(['#24191b', '#f0e5dc', '#d95761', '#a894d1']),
        ]),
        fonts: Object.freeze({ primary: '"Trebuchet MS", Verdana, Arial, sans-serif', secondary: 'Consolas, "Lucida Console", "Courier New", monospace' }),
        motif: 'index-rule',
        slots: Object.freeze(['identity', 'detail', 'serial']),
    }),
});

export function hashDisplaySeed(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function rngForSeed(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function normalizeDisplaySurface(value) {
    const key = String(value ?? 'facade-sign').toLowerCase();
    return SURFACE_ALIASES[key] ?? key;
}

function semanticText(context = {}) {
    return [
        context.districtFamily,
        context.districtSubCharacter,
        context.blockRole,
        context.program,
        context.semanticProgram,
        context.frontageRole,
        context.publicRole,
        context.semanticOpportunityRole,
        context.semanticFamily,
        context.contentFamily,
        context.family,
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_:/.-]+/g, ' ');
}

function hasAny(text, words) {
    return words.some(word => text.includes(word));
}

export function classifyDisplayFamily(context = {}) {
    const text = semanticText(context);
    if (hasAny(text, ['market', 'retail', 'commercial', 'restaurant', 'storefront', 'shop', 'vendor', 'commerce'])) return 'market-retail';
    if (hasAny(text, ['service', 'mechanical', 'industrial', 'utility', 'loading', 'warning', 'network', 'protocol', 'encoding', 'machine'])) return 'service-mechanical';
    if (hasAny(text, ['transport', 'transit', 'public', 'civic', 'institution', 'station', 'route', 'wayfinding', 'municipal'])) return 'public-transport';
    if (hasAny(text, ['spectacle', 'broadcast', 'entertainment', 'nightlife', 'media', 'landmark'])) return 'spectacle';
    const surface = normalizeDisplaySurface(context.surfaceKind ?? context.assemblyKind ?? context.targetSurface ?? context.kind);
    if (context.landmark === true || /megascreen|billboard|spectacle/.test(surface)) return 'spectacle';
    return 'local-mixed';
}

function campaignIdentity(context = {}) {
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
    ].filter(value => value != null && value !== '').join('|') || 'jweb:display';
}

function chooseSurfaceLayout(profile, family, surface, rng) {
    if (/megascreen|billboard/.test(surface)) return rng() < 0.5 ? 'spectacle-ribbon' : 'spectacle-hero';
    if (surface === 'flyer' || surface === 'poster') {
        if (family === 'service-mechanical') return 'service-warning';
        if (family === 'public-transport') return 'public-notice';
        if (family === 'market-retail') return 'market-stack';
        return 'local-index';
    }
    return profile.layouts[Math.floor(rng() * profile.layouts.length) % profile.layouts.length];
}

export function resolveDisplayRecipe(context = {}) {
    const surfaceKind = normalizeDisplaySurface(context.surfaceKind ?? context.assemblyKind ?? context.targetSurface ?? context.kind);
    const family = classifyDisplayFamily({ ...context, surfaceKind });
    const profile = FAMILY_PROFILES[family] ?? FAMILY_PROFILES['local-mixed'];
    const identity = campaignIdentity(context);
    const seed = Number.isFinite(Number(context.campaignSeed))
        ? Number(context.campaignSeed) >>> 0
        : hashDisplaySeed(identity);
    const campaignRng = rngForSeed(seed);
    const palette = profile.palettes[Math.floor(campaignRng() * profile.palettes.length) % profile.palettes.length];
    const instanceKey = context.instanceKey ?? context.exteriorRequestId ?? context.semanticOpportunityId ?? context.seed ?? '';
    const surfaceSeed = hashDisplaySeed(`${seed}:${surfaceKind}:${instanceKey}`);
    const surfaceRng = rngForSeed(surfaceSeed);
    const layout = chooseSurfaceLayout(profile, family, surfaceKind, surfaceRng);
    const emphasis = /megascreen|billboard/.test(surfaceKind) || context.landmark ? 'max' : family === 'service-mechanical' ? 'strong' : 'balanced';
    const alignment = layout === 'spectacle-hero' ? 'center' : surfaceRng() < 0.76 ? 'left' : 'right';
    const paletteObject = Object.freeze({
        background: palette[0], foreground: palette[1], accent: palette[2], secondary: palette[3],
    });
    return Object.freeze({
        schema: DISPLAY_RECIPE_SCHEMA,
        id: `${identity}:${surfaceKind}:${surfaceSeed.toString(16).padStart(8, '0')}`,
        campaignKey: String(context.campaignKey ?? identity),
        seed,
        surfaceSeed,
        surfaceKind,
        family,
        layout,
        motif: profile.motif,
        palette: paletteObject,
        fonts: profile.fonts,
        alignment,
        emphasis,
        showSerial: family === 'service-mechanical' || family === 'public-transport' || family === 'local-mixed',
        showValue: family === 'market-retail' || /megascreen|billboard/.test(surfaceKind),
        structure: Object.freeze({ slots: profile.slots, density: family === 'service-mechanical' ? 'dense' : family === 'spectacle' ? 'sparse' : 'medium' }),
    });
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
        semanticFamily: media.family,
        contentFamily: media.family,
        assemblyKind: media.assemblyKind ?? placement.assemblyKind,
        surfaceKind: media.assemblyKind ?? placement.assemblyKind,
        semanticOpportunityRole: placement.semanticOpportunityRole ?? placement.role,
        instanceKey: media.assemblyId ?? placement.assemblyId ?? media.id,
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
        frontageBindingKey: semantic.bindingKey ?? task.frontageBinding?.key,
        frontageRole: semantic.frontageRole ?? task.frontageRole,
        publicRole: semantic.publicRole ?? task.publicRole,
        landmark: semantic.landmark ?? task.landmark,
        semanticOpportunityRole: task.semanticOpportunityRole,
        semanticFamily: task.exteriorRequest?.semanticFamily ?? task.semanticFamily,
        instanceKey: task.exteriorRequestId ?? task.semanticOpportunityId ?? task.seed,
        surfaceKind: overrides.surfaceKind ?? task.assemblyKind ?? task.semanticOpportunityRole ?? task.kind,
        ...overrides,
    };
}
