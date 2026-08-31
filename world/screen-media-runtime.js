import { resolveMediaSource } from './media-source-resolver.js';

const scriptPromises = new Map();

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function nearestSocketDistance(camera, sockets) {
    const position = camera?.position;
    if (!position || !sockets?.length) return 0;
    let bestSq = Infinity;
    for (const socket of sockets) {
        const center = socket?.center;
        if (!center) continue;
        const dx = finite(position.x) - finite(center.x);
        const dy = finite(position.y) - finite(center.y);
        const dz = finite(position.z) - finite(center.z);
        bestSq = Math.min(bestSq, dx * dx + dy * dy + dz * dz);
    }
    return Number.isFinite(bestSq) ? Math.sqrt(bestSq) : 0;
}

function loadClassicScript(url, documentRef, windowRef) {
    if (windowRef?.Hls) return Promise.resolve(windowRef.Hls);
    if (!url || !documentRef?.createElement) return Promise.resolve(null);
    if (scriptPromises.has(url)) return scriptPromises.get(url);
    const promise = new Promise((resolve, reject) => {
        const script = documentRef.createElement('script');
        script.src = url;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(windowRef?.Hls ?? null);
        script.onerror = () => reject(new Error(`[screen-media] failed to load HLS runtime ${url}`));
        (documentRef.head ?? documentRef.body ?? documentRef.documentElement)?.appendChild(script);
    });
    scriptPromises.set(url, promise);
    return promise;
}

function configureTexture(THREE, texture) {
    if (!texture) return texture;
    if ('colorSpace' in texture && THREE?.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    if ('generateMipmaps' in texture) texture.generateMipmaps = false;
    if ('minFilter' in texture && THREE?.LinearFilter) texture.minFilter = THREE.LinearFilter;
    if ('magFilter' in texture && THREE?.LinearFilter) texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createFallbackTexture(THREE, documentRef) {
    if (!THREE?.CanvasTexture || !documentRef?.createElement) return null;
    const canvas = documentRef.createElement('canvas');
    canvas.width = 512;
    canvas.height = 288;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#020506';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0c1416';
    for (let y = 0; y < canvas.height; y += 7) {
        const width = 18 + ((y * 37) % 190);
        const x = (y * 53) % Math.max(1, canvas.width - width);
        ctx.fillRect(x, y, width, 1);
    }
    ctx.strokeStyle = '#273235';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = '#9babad';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO SIGNAL', canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return configureTexture(THREE, texture);
}

function materialList(mesh) {
    if (!mesh?.material) return [];
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function applyTexture(sockets, texture) {
    if (!texture) return;
    for (const socket of sockets) {
        for (const material of materialList(socket?.mesh)) {
            material.map = texture;
            if ('emissiveMap' in material) material.emissiveMap = texture;
            material.color?.setHex?.(0xffffff);
            material.emissive?.setHex?.(0x4d5557);
            if ('emissiveIntensity' in material) material.emissiveIntensity = 0.72;
            material.needsUpdate = true;
        }
    }
}

function safeCall(fn) {
    try { return fn?.(); }
    catch (_) { return undefined; }
}

export function attachScreenMedia({
    THREE,
    camera = null,
    sockets = [],
    mediaIntent = null,
    documentRef = typeof document === 'undefined' ? null : document,
    windowRef = typeof window === 'undefined' ? null : window,
    loadHlsClass = null,
    autoSchedule = true,
} = {}) {
    const source = resolveMediaSource(mediaIntent);
    const usableSockets = (sockets ?? []).filter(socket => socket?.mesh);
    if (!source || !usableSockets.length) return null;

    let disposed = false;
    let video = null;
    let videoTexture = null;
    let fallbackTexture = createFallbackTexture(THREE, documentRef);
    let hls = null;
    let scheduler = null;
    let retryTimer = null;
    let streamIndex = 0;
    let startPromise = null;
    const state = {
        schema: 'jweb.screen-media-state.v1',
        sourceKey: source.sourceKey,
        status: 'fallback',
        active: false,
        attempt: 0,
        streamIndex: 0,
        lastError: null,
    };

    applyTexture(usableSockets, fallbackTexture);

    const browserCapable = !!(
        THREE?.VideoTexture
        && documentRef?.createElement
        && source.streams?.length
    );

    function clearRetry() {
        if (retryTimer != null) {
            safeCall(() => (windowRef?.clearTimeout ?? clearTimeout)(retryTimer));
            retryTimer = null;
        }
    }

    function destroyHls() {
        if (!hls) return;
        safeCall(() => hls.destroy?.());
        hls = null;
    }

    function ensureVideo() {
        if (video || !browserCapable) return video;
        video = documentRef.createElement('video');
        video.muted = source.muted !== false;
        video.defaultMuted = video.muted;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'none';
        video.crossOrigin = source.crossOrigin ?? 'anonymous';
        video.setAttribute?.('playsinline', '');
        video.setAttribute?.('webkit-playsinline', '');
        if (video.style) {
            video.style.position = 'fixed';
            video.style.width = '1px';
            video.style.height = '1px';
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
        }
        video.addEventListener?.('playing', () => {
            if (disposed) return;
            if (!videoTexture) videoTexture = configureTexture(THREE, new THREE.VideoTexture(video));
            applyTexture(usableSockets, videoTexture);
            state.status = 'playing';
            state.lastError = null;
        });
        video.addEventListener?.('error', () => {
            if (!disposed && state.active && !hls) handleStreamFailure(new Error('[screen-media] native media error'));
        });
        documentRef.body?.appendChild?.(video);
        return video;
    }

    function showFallback(status = 'fallback', error = null) {
        if (fallbackTexture) applyTexture(usableSockets, fallbackTexture);
        state.status = status;
        state.lastError = error ? String(error?.message ?? error) : null;
    }

    async function playVideo() {
        if (!video || disposed || !state.active) return;
        try {
            await Promise.resolve(video.play?.());
        } catch (error) {
            showFallback('autoplay-blocked', error);
        }
    }

    function scheduleRetry() {
        if (disposed || !state.active || retryTimer != null) return;
        const setTimeoutFn = windowRef?.setTimeout ?? setTimeout;
        retryTimer = setTimeoutFn(() => {
            retryTimer = null;
            if (!disposed && state.active) {
                streamIndex = 0;
                startPromise = null;
                void startPlayback();
            }
        }, Math.max(1000, finite(source.retryDelayMs, 15000)));
    }

    function handleStreamFailure(error) {
        destroyHls();
        safeCall(() => video?.pause?.());
        showFallback('stream-error', error);
        startPromise = null;
        if (streamIndex + 1 < source.streams.length) {
            streamIndex++;
            void startPlayback();
        } else {
            streamIndex = 0;
            scheduleRetry();
        }
    }

    async function startStream() {
        if (!browserCapable || disposed || !state.active) return;
        clearRetry();
        state.attempt++;
        state.streamIndex = streamIndex;
        state.status = 'connecting';
        const stream = source.streams[streamIndex];
        const media = ensureVideo();
        if (!media || !stream?.url) {
            showFallback('unavailable');
            return;
        }

        const nativeHls = !!media.canPlayType?.('application/vnd.apple.mpegurl');
        if (nativeHls) {
            destroyHls();
            media.src = stream.url;
            media.load?.();
            await playVideo();
            return;
        }

        let Hls = null;
        try {
            Hls = loadHlsClass
                ? await loadHlsClass(source)
                : await loadClassicScript(source.hlsLibraryUrl, documentRef, windowRef);
        } catch (error) {
            handleStreamFailure(error);
            return;
        }
        if (disposed || !state.active) return;
        if (!Hls?.isSupported?.()) {
            if (nativeHls) {
                media.src = stream.url;
                media.load?.();
                await playVideo();
                return;
            }
            showFallback('unsupported');
            return;
        }

        destroyHls();
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 24,
            maxBufferLength: 24,
            liveSyncDurationCount: 3,
        });
        const events = Hls.Events ?? {};
        hls.on?.(events.MANIFEST_PARSED ?? 'hlsManifestParsed', () => { void playVideo(); });
        hls.on?.(events.ERROR ?? 'hlsError', (_event, data = {}) => {
            if (!data?.fatal) return;
            const mediaErrorType = Hls.ErrorTypes?.MEDIA_ERROR;
            if (mediaErrorType && data.type === mediaErrorType && hls?.recoverMediaError) {
                safeCall(() => hls.recoverMediaError());
                return;
            }
            handleStreamFailure(new Error(`[screen-media] HLS fatal ${data?.type ?? 'error'} ${data?.details ?? ''}`.trim()));
        });
        hls.loadSource?.(stream.url);
        hls.attachMedia?.(media);
    }

    async function startPlayback() {
        if (!browserCapable || disposed || !state.active) return;
        if (hls) {
            safeCall(() => hls.startLoad?.(-1));
            await playVideo();
            return;
        }
        if (!startPromise) {
            startPromise = startStream().finally(() => { startPromise = null; });
        }
        await startPromise;
    }

    function stopPlayback() {
        clearRetry();
        safeCall(() => video?.pause?.());
        safeCall(() => hls?.stopLoad?.());
        if (!disposed) state.status = 'sleeping';
    }

    async function sync() {
        if (disposed) return { ...state };
        const distance = nearestSocketDistance(camera, usableSockets);
        const threshold = state.active
            ? finite(source.sleepDistanceM, 42)
            : finite(source.activationDistanceM, 30);
        const shouldBeActive = !camera || distance <= threshold;
        if (shouldBeActive && !state.active) {
            state.active = true;
            await startPlayback();
        } else if (!shouldBeActive && state.active) {
            state.active = false;
            stopPlayback();
        }
        return { ...state, distanceM: distance };
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        state.active = false;
        state.status = 'disposed';
        clearRetry();
        if (scheduler != null) safeCall(() => (windowRef?.clearInterval ?? clearInterval)(scheduler));
        destroyHls();
        safeCall(() => video?.pause?.());
        if (video) {
            safeCall(() => video.removeAttribute?.('src'));
            safeCall(() => video.load?.());
            safeCall(() => video.remove?.());
        }
        safeCall(() => videoTexture?.dispose?.());
        safeCall(() => fallbackTexture?.dispose?.());
        video = null;
        videoTexture = null;
        fallbackTexture = null;
    }

    const controller = {
        schema: 'jweb.screen-media-controller.v1',
        source,
        sockets: usableSockets,
        sync,
        dispose,
        getState: () => ({ ...state }),
    };

    if (autoSchedule && browserCapable) {
        void sync();
        const setIntervalFn = windowRef?.setInterval ?? setInterval;
        scheduler = setIntervalFn(() => { void sync(); }, 750);
    }

    return controller;
}
