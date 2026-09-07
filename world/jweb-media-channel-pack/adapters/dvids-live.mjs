export const DVIDS_LIVE_BRIDGE = Object.freeze({
    metadataUrl: 'https://raw.githubusercontent.com/JustinBrownDev/justinbrowndev.github.io/jweb-media-runtime/dvids-live.json',
});

export async function resolveDvidsLive(channel) {
    if (!channel) return null;
    return Object.freeze({
        schema: 'jweb.media-source.v1',
        sourceKey: channel.sourceKey,
        kind: 'hls',
        label: channel.label,
        provider: 'DVIDS',
        officialPageUrl: channel.officialPageUrl ?? 'https://www.dvidshub.net/webcast/',
        streams: Object.freeze([{
            resolver: 'json-hls',
            manifestUrl: 'https://raw.githubusercontent.com/JustinBrownDev/justinbrowndev.github.io/jweb-media-runtime/dvids-live.json',
            manifestSchema: 'jweb.dvids-live-bridge.v1',
            urlPath: Object.freeze(['selectedEvent', 'hlsUrl']),
            allowedHlsRules: Object.freeze([
                Object.freeze({ host: 'api.dvidshub.net', pathPrefix: '/v', pathContains: '/playlist/', pathSuffix: '/stream' }),
                Object.freeze({ hostPrefix: 'd', hostSuffix: '.cloudfront.net', pathPrefix: '/out/v', pathSuffix: '/index.m3u8' }),
            ]),
            transport: 'hls',
            role: 'primary',
        }]),
        bridgeMetadataUrl: DVIDS_LIVE_BRIDGE.metadataUrl,
        defaultMuted: true,
        crossOrigin: 'anonymous',
        attribution: 'DVIDS',
    });
}
