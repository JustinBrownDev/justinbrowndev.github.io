import { MEDIA_ALLOWLISTS } from '../data/allowlists.mjs';

function normalizeEntry(entry) {
    if (!entry || entry.enabled === false || typeof entry.url !== 'string') return null;
    const transport = entry.transport === 'mp4' ? 'video-file' : entry.transport;
    if (!['hls', 'video-file', 'iframe'].includes(transport)) return null;
    return { ...entry, transport };
}

export function resolveCuratedAllowlist(channel, { seed = 'jweb' } = {}) {
    const key = channel?.playback?.allowlist;
    const entries = (MEDIA_ALLOWLISTS[key] ?? []).map(normalizeEntry).filter(Boolean);
    if (!entries.length) return null;
    let h = 2166136261 >>> 0;
    const text = `${seed}|${channel.sourceKey}`;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    const entry = entries[h % entries.length];
    return Object.freeze({
        schema: 'jweb.media-source.v1',
        sourceKey: channel.sourceKey,
        kind: entry.transport,
        label: entry.label ?? channel.label,
        provider: entry.provider ?? channel.provider,
        officialPageUrl: entry.officialPageUrl ?? channel.officialPageUrl ?? null,
        streams: Object.freeze([{ url: entry.url, transport: entry.transport === 'video-file' ? 'mp4' : entry.transport, role: 'primary' }]),
        defaultMuted: true,
        attribution: entry.attribution ?? null,
    });
}
