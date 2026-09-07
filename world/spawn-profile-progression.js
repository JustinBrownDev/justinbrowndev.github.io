const PROFILE_OVERRIDES = Object.freeze({
    'radio-roof': Object.freeze({
        progressionRank: 0,
        artPartBudget: 118,
        slotMinimums: Object.freeze({ 'drink-evidence': 2 }),
    }),
    'small-tv-roof': Object.freeze({
        progressionRank: 1,
        artPartBudget: 132,
        mediaVariantIds: Object.freeze(['tv.flat.office-monitor']),
        mediaRecipes: Object.freeze(['flat-screen']),
        mediaScale: 0.72,
        vocabularyTags: Object.freeze(['portable', 'office', 'cheap', 'repurposed', 'computer']),
    }),
    'normal-tv-roof': Object.freeze({ progressionRank: 2, artPartBudget: 144 }),
    'big-tv-roof': Object.freeze({
        progressionRank: 3,
        artPartBudget: 170,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([1.75, 1.42, 1.48]),
    }),
    'super-big-tv-roof': Object.freeze({
        progressionRank: 4,
        artPartBudget: 200,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([2.60, 2.10, 2.10]),
    }),
    'radio-under-shelter': Object.freeze({
        progressionRank: 2,
        artPartBudget: 154,
        slotMinimums: Object.freeze({ 'drink-evidence': 2 }),
    }),
    'super-big-shelter': Object.freeze({
        progressionRank: 4,
        artPartBudget: 215,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([2.80, 2.20, 2.30]),
    }),
    'mega-big-shelter': Object.freeze({
        progressionRank: 5,
        artPartBudget: 265,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([3.80, 2.80, 2.80]),
    }),
    'giga-shopfront': Object.freeze({
        progressionRank: 6,
        artPartBudget: 325,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([5.00, 3.50, 3.60]),
    }),
    'terra-backroom': Object.freeze({
        progressionRank: 7,
        artPartBudget: 430,
        mediaVariantIds: Object.freeze(['tv.crt.black-cube', 'tv.crt.motel-woodgrain', 'tv.crt.shop-counter']),
        mediaRecipes: Object.freeze(['crt-box']),
        mediaScale: Object.freeze([7.50, 4.50, 5.20]),
        slotMinimums: Object.freeze({ 'drink-evidence': 3, 'personal-evidence': 4 }),
    }),
});

function cloneArray(value) {
    return Array.isArray(value) ? [...value] : value;
}

export function applySpawnProfileProgression(profile) {
    if (!profile) return profile;
    const override = PROFILE_OVERRIDES[profile.id];
    if (!override) return profile;
    const next = { ...profile, ...override };
    for (const key of ['mediaVariantIds', 'mediaRecipes', 'mediaScale', 'vocabularyTags']) {
        if (Array.isArray(next[key])) next[key] = cloneArray(next[key]);
    }
    if (override.slotMinimums) next.slotMinimums = { ...override.slotMinimums };
    return Object.freeze(next);
}

export function progressionSlotCountRange(profile, slot, range) {
    let [lo, hi] = Array.isArray(range) ? range : [0, 0];
    const minimum = Number(profile?.slotMinimums?.[slot]);
    if (Number.isFinite(minimum)) {
        lo = Math.min(hi, Math.max(lo, Math.floor(minimum)));
    }
    return [lo, hi];
}

function laptopPick(pick) {
    return {
        ...pick,
        variantId: 'media.laptop-salvage',
        label: 'Scarred laptop with live screen',
        dimensionsM: [0.46, 0.30, 0.055],
        constructionRecipe: 'laptop',
        tags: ['laptop', 'lcd', 'portable', 'computer', 'repurposed'],
        placement: {
            mount: 'surface',
            canSupportProps: false,
            requiresSupportSurface: true,
            supportSocket: 'topSurface',
        },
    };
}

function radioSupportPick(pick) {
    return {
        ...pick,
        variantId: 'support.plywood-crates',
        label: 'Scuffed equipment box and board',
        dimensionsM: [0.78, 0.50, 0.56],
        constructionRecipe: 'improvised-table',
        tags: ['improvised', 'crate', 'cheap', 'portable'],
    };
}


function largeCrtPlinthPick(pick) {
    return {
        ...pick,
        variantId: 'support.cinderblock-plank',
        label: 'Reinforced low CRT plinth',
        dimensionsM: [1.50, 0.34, 0.92],
        constructionRecipe: 'improvised-table',
        tags: ['improvised', 'heavy', 'rough', 'crt-plinth', 'industrial'],
    };
}

function radioEvidencePick(pick, index) {
    if (index === 0) {
        return {
            ...pick,
            variantId: 'drink.water-bottle',
            label: 'Half-finished water bottle',
            dimensionsM: [0.085, 0.27, 0.085],
            constructionRecipe: 'bottle',
            tags: ['water', 'plastic', 'recent-human-trace'],
        };
    }
    if (index === 1) {
        return {
            ...pick,
            variantId: 'clutter.ashtray-metal',
            label: 'Used metal ashtray',
            dimensionsM: [0.15, 0.045, 0.15],
            constructionRecipe: 'small-container',
            tags: ['ashtray', 'metal', 'recent-human-trace'],
        };
    }
    return pick;
}

export function shapeSpawnPickForProgression(profile, slot, index, pick) {
    if (!pick || !profile) return pick;
    if (profile.id === 'small-tv-roof' && slot === 'primary-tv') return laptopPick(pick);
    if (Number(profile.progressionRank ?? 0) >= 5 && slot === 'tv-support') return largeCrtPlinthPick(pick);
    if ((profile.id === 'radio-roof' || profile.id === 'radio-under-shelter') && slot === 'tv-support') {
        return radioSupportPick(pick);
    }
    if ((profile.id === 'radio-roof' || profile.id === 'radio-under-shelter') && slot === 'drink-evidence') {
        return radioEvidencePick(pick, index);
    }
    return pick;
}

export function spawnProgressionRank(profileOrId) {
    const id = typeof profileOrId === 'string' ? profileOrId : profileOrId?.id;
    return Number(PROFILE_OVERRIDES[id]?.progressionRank ?? profileOrId?.progressionRank ?? 0);
}
