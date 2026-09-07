import assert from 'node:assert/strict';
import { MEDIA_CHANNELS, getMediaChannel } from '../catalog.mjs';
import { createMediaIntent, pickMediaChannel } from '../selector.mjs';
import { getLinearProgramAt } from '../linear-scheduler.mjs';
import { resolveJwebMediaChannel } from '../resolver.mjs';

const news = MEDIA_CHANNELS.filter((channel) => channel.genres.includes('news'));
assert.equal(news.length, 1, 'Al Jazeera must remain the only news channel');
assert.equal(news[0].sourceKey, 'live-news.al-jazeera-english');
assert.equal(getMediaChannel('experimental-filmon.genre-channels').selectable, false);
assert.equal(getMediaChannel('live-weird.owncast-curated').selectable, false);
assert.equal(getMediaChannel('live-nature.noaa-ocean-explorer').selectable, false, 'NOAA current live transport is YouTube-backed and must fail closed');

for (const channel of MEDIA_CHANNELS) {
    assert.equal(channel.transportPolicy.youtube, false, `${channel.sourceKey} must refuse YouTube transport`);
    const urls = JSON.stringify(channel).match(/https?:[^" ]+/g) ?? [];
    assert.ok(urls.every((url) => !/youtube\.com|youtu\.be|wikipedia\.org|archive\.org/i.test(url)), `${channel.sourceKey} contains a banned provider URL`);
}

const a = pickMediaChannel({ seed: '123', genre: 'cartoons' });
const b = pickMediaChannel({ seed: '123', genre: 'cartoons' });
assert.equal(a?.sourceKey, b?.sourceKey, 'selection must be deterministic');
assert.equal(a?.sourceKey, 'linear-cartoons.blender-open-movies');

const intent = createMediaIntent({ sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'proximity' });
const delegated = await resolveJwebMediaChannel(intent, {
    baseResolver: (value) => ({
        schema: 'jweb.media-source.v1',
        sourceKey: value.sourceKey,
        kind: 'hls',
        label: 'AJE',
        provider: 'Al Jazeera',
        streams: [{ url: 'https://example.invalid/live.m3u8', transport: 'hls', role: 'primary' }],
        defaultMuted: true,
    }),
});
assert.equal(delegated.kind, 'hls');
assert.equal(delegated.audioMode, 'proximity');
assert.equal(delegated.muted, true);

const programs = [{ title: 'A', durationSec: 10 }, { title: 'B', durationSec: 20 }];
const epoch = 1704067200000;
assert.equal(getLinearProgramAt(programs, epoch + 5000, epoch).program.title, 'A');
assert.equal(getLinearProgramAt(programs, epoch + 15000, epoch).program.title, 'B');
assert.equal(getLinearProgramAt(programs, epoch + 35000, epoch).program.title, 'A');

const dvids = await resolveJwebMediaChannel({ sourceKey: 'live-public-affairs.dvids' });
assert.equal(dvids.kind, 'hls');
assert.equal(dvids.streams[0].resolver, 'json-hls');
assert.equal(dvids.streams[0].manifestUrl, 'https://raw.githubusercontent.com/JustinBrownDev/justinbrowndev.github.io/jweb-media-runtime/dvids-live.json');
assert.ok(dvids.streams[0].allowedHlsRules.some((rule) => rule.host === 'api.dvidshub.net'));
assert.ok(dvids.streams[0].allowedHlsRules.some((rule) => rule.hostSuffix === '.cloudfront.net'));
assert.equal(JSON.stringify(dvids).includes('api_key'), false, 'browser DVIDS source must carry no API credential');

const peerList = {
    data: [
        { uuid: 'bbb', name: 'Big Buck Bunny', duration: 596, url: 'https://video.blender.org/w/bbb' },
        { uuid: 'making', name: 'Making Of Big Buck Bunny', duration: 1000, url: 'https://video.blender.org/w/making' },
    ],
};
const peerDetail = {
    uuid: 'bbb',
    name: 'Big Buck Bunny',
    url: 'https://video.blender.org/w/bbb',
    streamingPlaylists: [{ playlistUrl: 'https://video.blender.org/static/streaming-playlists/hls/bbb/master.m3u8', files: [] }],
    licence: { label: 'CC BY' },
    account: { displayName: 'Blender' },
};
const peerFetch = async (url) => ({ ok: true, json: async () => url.includes('/api/v1/videos/') ? peerDetail : peerList });
const cartoon = await resolveJwebMediaChannel({ sourceKey: 'linear-cartoons.blender-open-movies' }, { fetchImpl: peerFetch, nowMs: epoch + 1000 });
assert.equal(cartoon.kind, 'hls');
assert.equal(cartoon.linear.wallClockSynchronized, true);
assert.match(cartoon.streams[0].url, /master\.m3u8$/);

console.log('[jweb-media-channel-pack] PASS', { channels: MEDIA_CHANNELS.length, news: news[0].sourceKey });
