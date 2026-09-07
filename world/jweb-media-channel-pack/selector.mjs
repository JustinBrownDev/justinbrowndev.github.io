import { MEDIA_CHANNELS, getMediaChannel } from './catalog.mjs';

function hash32(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function unitFloat(seedText) {
    return hash32(String(seedText)) / 0x100000000;
}

function matches(channel, options) {
    if (!options.includeDisabled && !channel.selectable) return false;
    if (options.live === true && channel.live !== true) return false;
    if (options.linear === true && channel.linear !== true) return false;
    if (options.radioEligible === true && channel.radioEligible !== true) return false;
    if (options.genre && !channel.genres.includes(options.genre)) return false;
    if (Array.isArray(options.tags) && options.tags.length && !options.tags.some((tag) => channel.tags.includes(tag))) return false;
    if (Array.isArray(options.excludeSourceKeys) && options.excludeSourceKeys.includes(channel.sourceKey)) return false;
    return true;
}

export function listMatchingMediaChannels(options = {}) {
    const normalized = { includeDisabled: false, ...options };
    return Object.freeze(MEDIA_CHANNELS.filter((channel) => matches(channel, normalized)));
}

export function pickMediaChannel({ seed = 'jweb', salt = '', ...filters } = {}) {
    const candidates = listMatchingMediaChannels(filters);
    if (!candidates.length) return null;
    const weighted = candidates.map((channel) => ({ channel, weight: Math.max(0, Number(channel.weight) || 0) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) return candidates[0];
    let cursor = unitFloat(`${seed}|${salt}|${candidates.map((item) => item.sourceKey).join('|')}`) * total;
    for (const item of weighted) {
        cursor -= item.weight;
        if (cursor <= 0) return item.channel;
    }
    return weighted[weighted.length - 1].channel;
}

export function createMediaIntent({ sourceKey, seed, salt, genre, defaultAudio = 'proximity', ...overrides } = {}) {
    const channel = sourceKey ? getMediaChannel(sourceKey) : pickMediaChannel({ seed, salt, genre, ...overrides });
    if (!channel) return null;
    return Object.freeze({
        sourceKey: channel.sourceKey,
        defaultAudio: channel.radioEligible && defaultAudio === 'audible' ? 'audible' : defaultAudio,
        fallback: overrides.fallback ?? 'dark glass / subtle static / NO SIGNAL',
        networkFailureIsFatal: false,
    });
}
