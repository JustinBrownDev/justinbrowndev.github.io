// Temporary performance-isolation switches for the exterior population diagnostic.
// Browser defaults are intentionally ON. Flip either default to false when that lane
// is cleared, or both false when this diagnostic is finished.
// URL overrides support all four A/B states without another push:
//   ?cutKowloon=0|1
//   ?cutAuthored=0|1
// Node/self-test imports default to the full implementation.
const DEFAULT_CUT_COMMON_KOWLOON_ENRICHMENT = true;
const DEFAULT_CUT_AUTHORED_SPAWN_DECORATION = true;

function browserDiagnosticFlag(queryName, fallback) {
    if (typeof window === 'undefined' || typeof location === 'undefined') return false;
    const raw = new URLSearchParams(location.search).get(queryName);
    if (raw === null) return fallback;
    if (/^(?:0|false|off|no)$/i.test(raw)) return false;
    if (/^(?:1|true|on|yes)$/i.test(raw)) return true;
    return fallback;
}

export const CUT_COMMON_KOWLOON_ENRICHMENT = browserDiagnosticFlag(
    'cutKowloon', DEFAULT_CUT_COMMON_KOWLOON_ENRICHMENT,
);
export const CUT_AUTHORED_SPAWN_DECORATION = browserDiagnosticFlag(
    'cutAuthored', DEFAULT_CUT_AUTHORED_SPAWN_DECORATION,
);

if (typeof window !== 'undefined') {
    window.__performanceIsolation = Object.freeze({
        commonKowloonEnrichmentCut: CUT_COMMON_KOWLOON_ENRICHMENT,
        authoredSpawnDecorationCut: CUT_AUTHORED_SPAWN_DECORATION,
        queryOverrides: Object.freeze({
            commonKowloonEnrichment: 'cutKowloon',
            authoredSpawnDecoration: 'cutAuthored',
        }),
    });
    console.log('[perf-isolation] commonKowloon=' + (CUT_COMMON_KOWLOON_ENRICHMENT ? 'CUT' : 'FULL')
        + ' authoredSpawn=' + (CUT_AUTHORED_SPAWN_DECORATION ? 'CUT' : 'FULL'));
}
