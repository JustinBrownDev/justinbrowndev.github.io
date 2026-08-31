// Generation profile + lane switches.
//
// The browser intentionally starts in SKELETON mode: topology, building massing,
// exterior shells, essential collision, large signage and spectacle only.  The
// expensive authored/interior/micro lanes stay genuinely OFF so they are not even
// planned during the baseline performance pass.
//
// A/B escape hatch:
//   ?generationProfile=skeleton|full
// Fine-grained diagnostic overrides:
//   ?laneMacro=0|1
//   ?laneSpectacle=0|1
//   ?laneSignature=0|1
//   ?laneMicro=0|1
//   ?laneAuthored=0|1
//   ?lanePlaza=0|1
//   ?laneBroad=0|1
// Scheduler budget override:
//   ?buildBudgetMs=2..12
//
// Node/self-test imports default to FULL so semantic contract tests continue to
// exercise the complete architecture unless they explicitly resolve another profile.

const TRUE_RE = /^(?:1|true|on|yes)$/i;
const FALSE_RE = /^(?:0|false|off|no)$/i;

export const GENERATION_PROFILE_DEFINITIONS = Object.freeze({
    skeleton: Object.freeze({
        broadStrokesOnly: true,
        macroSignage: true,
        spectacle: true,
        signatureContent: false,
        microEnrichment: false,
        authoredDecoration: false,
        plazaClutter: false,
    }),
    full: Object.freeze({
        broadStrokesOnly: false,
        macroSignage: true,
        spectacle: true,
        signatureContent: true,
        microEnrichment: true,
        authoredDecoration: true,
        plazaClutter: true,
    }),
});

const LANE_QUERY_NAMES = Object.freeze({
    broadStrokesOnly: 'laneBroad',
    macroSignage: 'laneMacro',
    spectacle: 'laneSpectacle',
    signatureContent: 'laneSignature',
    microEnrichment: 'laneMicro',
    authoredDecoration: 'laneAuthored',
    plazaClutter: 'lanePlaza',
});

function parseBoolean(raw, fallback) {
    if (raw == null) return fallback;
    if (TRUE_RE.test(String(raw))) return true;
    if (FALSE_RE.test(String(raw))) return false;
    return fallback;
}

function searchParamsFrom(search = '') {
    if (search instanceof URLSearchParams) return search;
    return new URLSearchParams(String(search || '').replace(/^\?/, ''));
}

export function resolveGenerationProfile({ browser = true, search = '' } = {}) {
    const params = searchParamsFrom(search);
    const requested = String(params.get('generationProfile') || '').toLowerCase();
    const profileName = requested in GENERATION_PROFILE_DEFINITIONS
        ? requested
        : (browser ? 'skeleton' : 'full');
    const lanes = { ...GENERATION_PROFILE_DEFINITIONS[profileName] };
    for (const [lane, queryName] of Object.entries(LANE_QUERY_NAMES)) {
        lanes[lane] = parseBoolean(params.get(queryName), lanes[lane]);
    }
    return Object.freeze({
        name: profileName,
        lanes: Object.freeze(lanes),
    });
}

function clampBudget(raw, fallback = 5.5) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(2, Math.min(12, n));
}

const IS_BROWSER = typeof window !== 'undefined' && typeof location !== 'undefined';
const ACTIVE = resolveGenerationProfile({
    browser: IS_BROWSER,
    search: IS_BROWSER ? location.search : '',
});

export const GENERATION_PROFILE_NAME = ACTIVE.name;
export const GENERATION_LANES = ACTIVE.lanes;
export const WORLD_BUILD_BUDGET_MS = clampBudget(
    IS_BROWSER ? new URLSearchParams(location.search).get('buildBudgetMs') : null,
    5.5,
);

// Backward-compatible exports consumed by the already-live isolation seams.
export const CUT_COMMON_KOWLOON_ENRICHMENT = !GENERATION_LANES.microEnrichment;
export const CUT_AUTHORED_SPAWN_DECORATION = !GENERATION_LANES.authoredDecoration;

if (IS_BROWSER) {
    window.__generationProfile = Object.freeze({
        name: GENERATION_PROFILE_NAME,
        lanes: GENERATION_LANES,
        worldBuildBudgetMs: WORLD_BUILD_BUDGET_MS,
    });
    window.__performanceIsolation = Object.freeze({
        generationProfile: GENERATION_PROFILE_NAME,
        generationLanes: GENERATION_LANES,
        worldBuildBudgetMs: WORLD_BUILD_BUDGET_MS,
        commonKowloonEnrichmentCut: CUT_COMMON_KOWLOON_ENRICHMENT,
        authoredSpawnDecorationCut: CUT_AUTHORED_SPAWN_DECORATION,
        queryOverrides: Object.freeze({
            generationProfile: 'generationProfile',
            commonKowloonEnrichment: 'laneMicro',
            authoredSpawnDecoration: 'laneAuthored',
            signatureContent: 'laneSignature',
            plazaClutter: 'lanePlaza',
            macroSignage: 'laneMacro',
            spectacle: 'laneSpectacle',
            broadStrokesOnly: 'laneBroad',
            worldBuildBudgetMs: 'buildBudgetMs',
        }),
    });
    console.log('[generation-profile] ' + GENERATION_PROFILE_NAME
        + ' budget=' + WORLD_BUILD_BUDGET_MS.toFixed(1) + 'ms'
        + ' lanes=' + Object.entries(GENERATION_LANES).map(([key, value]) => `${key}:${value ? 'ON' : 'OFF'}`).join(','));
}
