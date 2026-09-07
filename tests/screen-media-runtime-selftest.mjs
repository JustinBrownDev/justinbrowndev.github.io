import assert from 'node:assert/strict';
import { resolveMediaSource, listMediaSourceKeys } from '../world/media-source-resolver.js';
import { attachScreenMedia, attachAudioMedia } from '../world/screen-media-runtime.js';

const resolved = resolveMediaSource({
    sourceKey: 'live-news.al-jazeera-english',
    defaultAudio: 'proximity',
    networkFailureIsFatal: false,
});
assert.ok(resolved);
assert.equal(resolved.kind, 'hls');
assert.equal(resolved.muted, true, 'proximity media must start muted so picture autoplay is browser-safe');
assert.equal(resolved.audioMode, 'proximity');
assert.ok(resolved.audioNearDistanceM < resolved.audioFarDistanceM);
assert.match(resolved.streams[0].url, /^https:\/\/live-hls-apps-aje-fa\.getaj\.net\/AJE\/index\.m3u8$/);
assert.ok(listMediaSourceKeys().includes('live-news.al-jazeera-english'));
assert.equal(resolveMediaSource({ sourceKey: 'unknown.source' }), null);

class ColorValue {
    setHex(value) { this.value = value; }
}
class Material {
    constructor() {
        this.color = new ColorValue();
        this.emissive = new ColorValue();
        this.emissiveMap = null;
        this.map = null;
        this.emissiveIntensity = 0.2;
        this.needsUpdate = false;
    }
}
class CanvasTexture {
    constructor(canvas) { this.canvas = canvas; this.kind = 'fallback'; this.generateMipmaps = true; }
    dispose() { this.disposed = true; }
}
class VideoTexture {
    constructor(video) { this.video = video; this.kind = 'video'; this.generateMipmaps = true; }
    dispose() { this.disposed = true; }
}
const THREE = { CanvasTexture, VideoTexture, SRGBColorSpace: 'srgb', LinearFilter: 'linear' };

function makeVideo(kind = 'video') {
    const listeners = new Map();
    return {
        kind,
        style: {},
        paused: true,
        muted: true,
        defaultMuted: true,
        volume: 0,
        canPlayType: () => '',
        setAttribute() {},
        removeAttribute() {},
        addEventListener(name, fn) { listeners.set(name, fn); },
        play() {
            this.paused = false;
            listeners.get('playing')?.();
            return Promise.resolve();
        },
        pause() { this.paused = true; },
        load() {},
        remove() { this.removed = true; },
    };
}

const documentRef = {
    head: { appendChild() {} },
    body: { appendChild(node) { node.appended = true; } },
    createElement(kind) {
        if (kind === 'canvas') return {
            width: 0,
            height: 0,
            getContext() {
                return {
                    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
                    fillRect() {}, strokeRect() {}, fillText() {},
                };
            },
        };
        if (kind === 'video' || kind === 'audio') return makeVideo(kind);
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
    attachMedia(video) {
        this.video = video;
        this.handlers.get('manifest')?.();
    }
    stopLoad() { this.stopped = true; }
    startLoad() { this.restarted = true; }
    destroy() { this.destroyed = true; }
    recoverMediaError() { this.recovered = true; }
}

const material = new Material();
const socket = {
    id: 'screen-1',
    center: { x: 0, y: 2, z: 0 },
    mesh: { material },
};
const camera = { position: { x: 100, y: 2, z: 0 } };
const controller = attachScreenMedia({
    THREE,
    camera,
    sockets: [socket],
    mediaIntent: { sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'proximity' },
    documentRef,
    windowRef: {},
    loadHlsClass: async () => FakeHls,
    autoSchedule: false,
});
assert.ok(controller);
assert.equal(material.map.kind, 'fallback', 'fallback texture must exist before network playback');
await controller.sync();
assert.equal(FakeHls.instances.length, 0, 'far screens must not start network playback');

camera.position.x = 2;
await controller.sync();
assert.equal(FakeHls.instances.length, 1, 'near screen starts one HLS pipeline');
assert.equal(FakeHls.instances[0].url, resolved.streams[0].url);
assert.equal(material.map.kind, 'video', 'playing media replaces fallback texture');
assert.equal(controller.getState().status, 'playing');
assert.equal(FakeHls.instances[0].video.muted, true, 'live picture stays silent until a real interaction unlocks audio');
assert.equal(controller.getState().audioUnlocked, false);

assert.equal(controller.unlockAudio(), true);
await controller.sync();
assert.equal(controller.getState().audioUnlocked, true);
assert.equal(controller.getState().audioAudible, true, 'nearby unlocked TV must become audible');
assert.equal(FakeHls.instances[0].video.muted, false);
const nearVolume = FakeHls.instances[0].video.volume;
assert.ok(nearVolume > 0.5 && nearVolume <= 1, `near TV volume should be substantial, got ${nearVolume}`);

camera.position.x = 12;
await controller.sync();
const middleVolume = FakeHls.instances[0].video.volume;
assert.ok(middleVolume > 0 && middleVolume < nearVolume, 'TV volume must attenuate continuously with distance');

camera.position.x = 24;
await controller.sync();
assert.equal(controller.getState().active, true, 'picture may remain active outside the audio radius');
assert.equal(controller.getState().audioAudible, false, 'audio must be local even while the picture is still streaming');
assert.equal(FakeHls.instances[0].video.muted, true);
assert.equal(FakeHls.instances[0].video.volume, 0);

camera.position.x = 100;
await controller.sync();
assert.equal(FakeHls.instances[0].stopped, true, 'distance sleep stops HLS loading');
assert.equal(controller.getState().status, 'sleeping');

camera.position.x = 1;
await controller.sync();
assert.equal(FakeHls.instances[0].restarted, true, 'returning near the screen resumes the same HLS pipeline');
assert.equal(FakeHls.instances[0].video.muted, false, 'audio unlock survives a distance sleep/wake cycle');
assert.ok(FakeHls.instances[0].video.volume > middleVolume);

controller.dispose();
assert.equal(FakeHls.instances[0].destroyed, true);
assert.equal(controller.getState().status, 'disposed');
console.log('[screen-media-runtime-selftest] PASS', {
    sourceKey: resolved.sourceKey,
    stream: resolved.streams[0].url,
});


FakeHls.instances.length = 0;
const radioCamera = { position: { x: 1, y: 1, z: 0 } };
const radioSocket = { id: 'radio-audio-1', role: 'radio-audio', center: { x: 0, y: 1, z: 0 } };
const radioController = attachAudioMedia({
    THREE,
    camera: radioCamera,
    sockets: [radioSocket],
    mediaIntent: { sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'proximity' },
    documentRef,
    windowRef: {},
    loadHlsClass: async () => FakeHls,
    autoSchedule: false,
});
assert.ok(radioController, 'radio must create an audio-only media controller without a mesh');
assert.equal(radioController.mode, 'audio-only');
assert.equal(radioController.sockets[0].mesh, undefined, 'radio audio socket must not fabricate a video surface');
await radioController.sync();
assert.equal(FakeHls.instances.length, 1, 'near radio starts the same live HLS source');
assert.equal(FakeHls.instances[0].video.kind, 'audio', 'radio must attach HLS to an audio element, not a video element');
assert.equal(radioController.getState().status, 'playing');
assert.equal(radioController.getState().audioAudible, false, 'browser-safe radio begins silent until user gesture');
assert.equal(radioController.unlockAudio(), true);
await radioController.sync();
assert.equal(radioController.getState().audioAudible, true, 'unlocked nearby radio plays live audio');
assert.ok(FakeHls.instances[0].video.volume > 0.5);
radioController.dispose();
assert.equal(FakeHls.instances[0].destroyed, true);
console.log('[screen-media-runtime-selftest] RADIO AUDIO PASS', {
    mode: radioController.mode,
    sourceKey: radioController.source.sourceKey,
});
