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
        audioNearDistanceM: 3.5,
        audioFarDistanceM: 20,
        audioMaxVolume: 0.72,
        audioCurve: 1.45,
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
    const requestedAudio = mediaIntent?.defaultAudio;
    resolved.audioMode = requestedAudio === 'proximity'
        ? 'proximity'
        : (requestedAudio === 'audible' ? 'audible' : 'muted');
    // Video always begins muted when proximity audio is requested so autoplay can
    // establish the live picture before the browser grants audio after a gesture.
    resolved.muted = resolved.audioMode !== 'audible' || source.defaultMuted !== false;
    resolved.audioNearDistanceM = Number.isFinite(mediaIntent?.audioNearDistanceM)
        ? mediaIntent.audioNearDistanceM
        : source.audioNearDistanceM;
    resolved.audioFarDistanceM = Number.isFinite(mediaIntent?.audioFarDistanceM)
        ? mediaIntent.audioFarDistanceM
        : source.audioFarDistanceM;
    resolved.audioMaxVolume = Number.isFinite(mediaIntent?.audioMaxVolume)
        ? mediaIntent.audioMaxVolume
        : source.audioMaxVolume;
    resolved.audioCurve = Number.isFinite(mediaIntent?.audioCurve)
        ? mediaIntent.audioCurve
        : source.audioCurve;
    resolved.networkFailureIsFatal = mediaIntent?.networkFailureIsFatal === true;
    resolved.fallback = mediaIntent?.fallback ?? 'dark glass / subtle static / NO SIGNAL';
    return Object.freeze(resolved);
}

export function listMediaSourceKeys() {
    return Object.freeze(Object.keys(MEDIA_SOURCES));
}
