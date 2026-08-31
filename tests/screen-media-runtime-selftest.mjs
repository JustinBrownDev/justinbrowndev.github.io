import assert from 'node:assert/strict';
import { resolveMediaSource, listMediaSourceKeys } from '../world/media-source-resolver.js';
import { attachScreenMedia } from '../world/screen-media-runtime.js';

const resolved = resolveMediaSource({
    sourceKey: 'live-news.al-jazeera-english',
    defaultAudio: 'muted',
    networkFailureIsFatal: false,
});
assert.ok(resolved);
assert.equal(resolved.kind, 'hls');
assert.equal(resolved.muted, true);
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

function makeVideo() {
    const listeners = new Map();
    return {
        style: {},
        paused: true,
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
        if (kind === 'video') return makeVideo();
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
    mediaIntent: { sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'muted' },
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

camera.position.x = 100;
await controller.sync();
assert.equal(FakeHls.instances[0].stopped, true, 'distance sleep stops HLS loading');
assert.equal(controller.getState().status, 'sleeping');

camera.position.x = 1;
await controller.sync();
assert.equal(FakeHls.instances[0].restarted, true, 'returning near the screen resumes the same HLS pipeline');

controller.dispose();
assert.equal(FakeHls.instances[0].destroyed, true);
assert.equal(controller.getState().status, 'disposed');
console.log('[screen-media-runtime-selftest] PASS', {
    sourceKey: resolved.sourceKey,
    stream: resolved.streams[0].url,
});
