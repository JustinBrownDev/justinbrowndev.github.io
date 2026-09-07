import { getMediaChannel } from './catalog.mjs';
import { resolveBlenderOpenMovies } from './adapters/blender-peertube.mjs';
import { resolveDvidsLive } from './adapters/dvids-live.mjs';
import { resolveCuratedAllowlist } from './adapters/curated-allowlist.mjs';
import { LOC_PUBLIC_DOMAIN_PROGRAMS } from './data/loc-programs.mjs';
import { getLinearProgramAt } from './linear-scheduler.mjs';

function applyIntent(source, channel, mediaIntent = {}) {
    if (!source) return null;
    const screen = channel.screen ?? {};
    const requestedAudio = mediaIntent.defaultAudio;
    const audioMode = requestedAudio === 'audible' ? 'audible' : (requestedAudio === 'proximity' ? 'proximity' : 'muted');
    return Object.freeze({
        ...source,
        audioMode,
        muted: audioMode !== 'audible' || source.defaultMuted !== false,
        activationDistanceM: Number.isFinite(mediaIntent.activationDistanceM) ? mediaIntent.activationDistanceM : screen.activationDistanceM,
        sleepDistanceM: Number.isFinite(mediaIntent.sleepDistanceM) ? mediaIntent.sleepDistanceM : screen.sleepDistanceM,
        audioNearDistanceM: Number.isFinite(mediaIntent.audioNearDistanceM) ? mediaIntent.audioNearDistanceM : screen.audioNearDistanceM,
        audioFarDistanceM: Number.isFinite(mediaIntent.audioFarDistanceM) ? mediaIntent.audioFarDistanceM : screen.audioFarDistanceM,
        audioMaxVolume: Number.isFinite(mediaIntent.audioMaxVolume) ? mediaIntent.audioMaxVolume : screen.audioMaxVolume,
        audioCurve: Number.isFinite(mediaIntent.audioCurve) ? mediaIntent.audioCurve : screen.audioCurve,
        retryDelayMs: screen.retryDelayMs,
        networkFailureIsFatal: mediaIntent.networkFailureIsFatal === true,
        fallback: mediaIntent.fallback ?? 'dark glass / subtle static / NO SIGNAL',
    });
}

function catalogOnly(channel, extras = {}) {
    return Object.freeze({
        schema: 'jweb.media-source-catalog.v1',
        sourceKey: channel.sourceKey,
        label: channel.label,
        provider: channel.provider,
        ready: false,
        readiness: channel.readiness,
        officialPageUrl: channel.officialPageUrl ?? null,
        ...extras,
    });
}

export async function resolveJwebMediaChannel(mediaIntent, options = {}) {
    const sourceKey = typeof mediaIntent === 'string' ? mediaIntent : mediaIntent?.sourceKey;
    const channel = getMediaChannel(sourceKey);
    if (!channel) return null;

    const intent = typeof mediaIntent === 'string' ? { sourceKey } : mediaIntent;
    const strategy = channel.playback?.strategy;
    let source = null;

    if (strategy === 'delegate-existing-resolver') {
        if (typeof options.baseResolver !== 'function') return catalogOnly(channel, { requires: 'baseResolver' });
        source = await options.baseResolver(intent);
    } else if (strategy === 'dvids-live-api') {
        source = await resolveDvidsLive(channel, options);
    } else if (strategy === 'blender-peertube-linear') {
        source = await resolveBlenderOpenMovies(channel, options);
    } else if (strategy === 'curated-stream-allowlist') {
        source = resolveCuratedAllowlist(channel, options);
    } else if (strategy === 'loc-public-domain-linear-pending') {
        const slot = getLinearProgramAt(LOC_PUBLIC_DOMAIN_PROGRAMS, options.nowMs ?? Date.now());
        return catalogOnly(channel, { nowPlaying: slot?.program ?? null, seekSec: slot?.seekSec ?? 0 });
    }

    if (!source || source.pending) {
        return catalogOnly(channel, source?.pending ? { pending: source } : {});
    }
    return applyIntent(source, channel, intent);
}

export function describeJwebMediaChannel(sourceKey) {
    const channel = getMediaChannel(sourceKey);
    return channel ? catalogOnly(channel, { ready: channel.selectable }) : null;
}
