const HLS_JS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.1/dist/hls.min.js';

const MEDIA_SOURCES = Object.freeze({
    'live-news.al-jazeera-english': Object.freeze({
        schema: 'jweb.media-source.v1',
        sourceKey: 'live-news.al-jazeera-english',
        kind: 'hls',
        label: 'Al Jazeera English Live',
        provider: 'Al Jazeera',
        officialPageUrl: 'https://www.aljazeera.com/video/live',
        streams: Object.freeze([
            Object.freeze({
                url: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8',
                transport: 'hls',
                role: 'primary',
            }),
        ]),
        hlsLibraryUrl: HLS_JS_URL,
        defaultMuted: true,
        crossOrigin: 'anonymous',
        activationDistanceM: 30,
        sleepDistanceM: 42,
        retryDelayMs: 15000,
    }),
});

function clonePlain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function resolveMediaSource(mediaIntent) {
    const sourceKey = typeof mediaIntent === 'string'
        ? mediaIntent
        : mediaIntent?.sourceKey;
    if (!sourceKey) return null;
    const source = MEDIA_SOURCES[sourceKey];
    if (!source) return null;
    const resolved = clonePlain(source);
    resolved.muted = mediaIntent?.defaultAudio === 'muted'
        ? true
        : source.defaultMuted !== false;
    resolved.networkFailureIsFatal = mediaIntent?.networkFailureIsFatal === true;
    resolved.fallback = mediaIntent?.fallback ?? 'dark glass / subtle static / NO SIGNAL';
    return Object.freeze(resolved);
}

export function listMediaSourceKeys() {
    return Object.freeze(Object.keys(MEDIA_SOURCES));
}
