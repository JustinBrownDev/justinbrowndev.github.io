import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveMediaSource, listMediaSourceKeys } from '../world/media-source-resolver.js';
import { attachScreenMedia, attachAudioMedia } from '../world/screen-media-runtime.js';
import { getMediaChannel } from '../world/jweb-media-channel-pack/catalog.mjs';
import { createMediaIntent } from '../world/jweb-media-channel-pack/selector.mjs';
import { resolveJwebMediaChannel } from '../world/jweb-media-channel-pack/resolver.mjs';

const KEY = 'live-public-affairs.dvids';
const BRIDGE = 'https://raw.githubusercontent.com/JustinBrownDev/justinbrowndev.github.io/jweb-media-runtime/dvids-live.json';
const DIRECT_HLS = 'https://d1b55jk78a7el0.cloudfront.net/out/v1/1d4a1a50b52b4333894d00ce0c4c7ca5/index.m3u8';

const baseKnowsDvids = listMediaSourceKeys().includes(KEY);
const baseSource = resolveMediaSource({ sourceKey: KEY, defaultAudio: 'proximity' });
if (baseKnowsDvids) assert.ok(baseSource, 'legacy/base resolver DVIDS registration must resolve when present');

const catalog = getMediaChannel(KEY);
assert.equal(catalog?.selectable, true, 'DVIDS selector gate must be open');
assert.equal(catalog?.readiness, 'live-bridge-ready');
assert.equal(catalog?.playback?.strategy, 'dvids-live-bridge');
assert.equal(catalog?.radioEligible, true);

const intent = createMediaIntent({ sourceKey: KEY, defaultAudio: 'proximity' });
assert.equal(intent?.sourceKey, KEY);
const packSource = await resolveJwebMediaChannel(intent);
assert.equal(packSource?.kind, 'hls');
assert.equal(packSource?.streams?.[0]?.resolver, 'json-hls');
assert.equal(packSource?.streams?.[0]?.manifestUrl, BRIDGE);
const source = baseSource ?? packSource;
assert.equal(source?.kind, 'hls');
assert.equal(source?.streams?.[0]?.resolver, 'json-hls');
assert.equal(source?.streams?.[0]?.manifestUrl, BRIDGE);
assert.ok(source?.streams?.[0]?.allowedHlsRules?.some((rule) => rule.host === 'api.dvidshub.net'));
assert.ok(source?.streams?.[0]?.allowedHlsRules?.some((rule) => rule.hostSuffix === '.cloudfront.net'));
assert.equal(JSON.stringify(source).includes('api_key'), false, 'browser source descriptor must contain no DVIDS credential');

// Exercise the shared screen runtime all the way from the credential-free JSON
// bridge to the direct, host-validated DVIDS HLS URL.
class ColorValue { setHex(value) { this.value = value; } }
class Material {
    constructor() {
        this.color = new ColorValue();
        this.emissive = new ColorValue();
        this.map = null;
        this.emissiveMap = null;
        this.emissiveIntensity = 0;
        this.needsUpdate = false;
    }
}
class CanvasTexture { constructor(canvas) { this.canvas = canvas; } dispose() {} }
class VideoTexture { constructor(video) { this.video = video; } dispose() {} }
const THREE = { CanvasTexture, VideoTexture, SRGBColorSpace: 'srgb', LinearFilter: 'linear' };
function makeVideo() {
    const listeners = new Map();
    return {
        style: {}, muted: true, defaultMuted: true, volume: 0, autoplay: true, playsInline: true,
        canPlayType: () => '', setAttribute() {}, removeAttribute() {}, load() {}, pause() {}, remove() {},
        addEventListener(name, fn) { listeners.set(name, fn); },
        play() { listeners.get('playing')?.(); return Promise.resolve(); },
    };
}
const documentRef = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement(kind) {
        if (kind === 'canvas') return {
            width: 0, height: 0,
            getContext: () => ({ fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', fillRect() {}, strokeRect() {}, fillText() {} }),
        };
        if (kind === 'video' || kind === 'audio') return makeVideo();
        return { style: {} };
    },
};
class FakeHls {
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = { MEDIA_ERROR: 'mediaError' };
    static instances = [];
    static isSupported() { return true; }
    constructor() { this.handlers = new Map(); FakeHls.instances.push(this); }
    on(name, fn) { this.handlers.set(name, fn); }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; this.handlers.get('manifest')?.(); }
    stopLoad() {} startLoad() {} destroy() {} recoverMediaError() {}
}
let bridgeFetches = 0;
const windowRef = {
    fetch: async (url, options) => {
        bridgeFetches++;
        assert.equal(url, BRIDGE);
        assert.equal(options?.credentials, 'omit');
        return {
            ok: true,
            status: 200,
            json: async () => ({
                schema: 'jweb.dvids-live-bridge.v1',
                sourceKey: KEY,
                state: 'ready',
                selectedEvent: { id: '38403', title: 'Fixture DVIDS live', hlsUrl: DIRECT_HLS },
            }),
        };
    },
};
const material = new Material();
const controller = attachScreenMedia({
    THREE,
    camera: { position: { x: 1, y: 2, z: 0 } },
    sockets: [{ id: 'dvids-screen', center: { x: 0, y: 2, z: 0 }, mesh: { material } }],
    mediaIntent: { sourceKey: KEY, defaultAudio: 'proximity' },
    documentRef,
    windowRef,
    loadHlsClass: async () => FakeHls,
    autoSchedule: false,
});
assert.ok(controller, 'DVIDS source must create normal/deferred screen controller');
await controller.ready;
await controller.sync();
assert.equal(bridgeFetches, 1, 'runtime should resolve one sanitized bridge document on startup');
assert.equal(FakeHls.instances.length, 1);
assert.equal(FakeHls.instances[0].url, DIRECT_HLS, 'HLS player must receive direct validated DVIDS URL, not a nested proxy playlist');
assert.equal(controller.getState().status, 'playing');
controller.dispose();

FakeHls.instances.length = 0;
bridgeFetches = 0;
const radioController = attachAudioMedia({
    THREE,
    camera: { position: { x: 1, y: 1, z: 0 } },
    sockets: [{ id: 'dvids-radio', role: 'radio-audio', center: { x: 0, y: 1, z: 0 } }],
    mediaIntent: { sourceKey: KEY, defaultAudio: 'proximity' },
    documentRef,
    windowRef,
    loadHlsClass: async () => FakeHls,
    autoSchedule: false,
});
assert.ok(radioController, 'DVIDS source must create normal/deferred radio controller');
await radioController.ready;
await radioController.sync();
assert.equal(bridgeFetches, 1, 'radio resolves the same sanitized bridge document');
assert.equal(FakeHls.instances.length, 1, 'radio must use the shared HLS path');
assert.equal(FakeHls.instances[0].url, DIRECT_HLS, 'radio must receive the same direct validated DVIDS HLS URL');
radioController.dispose();

const spawnRealizerText = await fs.readFile(new URL('../world/spawn-location-realizer.js', import.meta.url), 'utf8');
assert.match(spawnRealizerText, /mediaIntent:\s*boundLocation\?\.composition\?\.media\s*\?\?\s*null/,
    'spawn realizer must continue forwarding composition.media to the shared TV/radio runtime');
assert.match(spawnRealizerText, /attachScreenMedia\(\{[\s\S]{0,900}?mediaIntent:\s*boundLocation\?\.composition\?\.media\s*\?\?\s*null/,
    'spawn TV sockets must consume composition.media');
assert.match(spawnRealizerText, /attachAudioMedia\(\{[\s\S]{0,900}?mediaIntent:\s*boundLocation\?\.composition\?\.media\s*\?\?\s*null/,
    'spawn radio sockets must consume the same composition.media source');

const workflowText = await fs.readFile(new URL('../.github/workflows/refresh-dvids-live.yml', import.meta.url), 'utf8');
assert.match(workflowText, /secrets\.DVIDS_API_KEY/);
assert.doesNotMatch(workflowText, /key-[0-9a-f]{8,}/i, 'workflow must not contain a literal DVIDS credential');
const toolText = await fs.readFile(new URL('../tools/media/refresh-dvids-live.mjs', import.meta.url), 'utf8');
assert.match(toolText, /process\.env\.DVIDS_API_KEY/);
assert.doesNotMatch(toolText, /key-[0-9a-f]{8,}/i, 'refresh tool must not contain a literal DVIDS credential');

console.log('[dvids-live-bridge-selftest] PASS', {
    sourceKey: KEY,
    directDvidsHls: true,
    spawnReady: true,
    radioReady: true,
    browserCredentialFree: true,
});
