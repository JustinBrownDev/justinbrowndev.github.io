const TRACKS = [
    { title: 'Rainy Forest', artist: 'TAD', layer: 'undercity', src: 'https://opengameart.org/sites/default/files/Rainy%20Forest_0.mp3' },
    { title: 'Bartender', artist: 'TAD', layer: 'undercity', src: 'https://opengameart.org/sites/default/files/Bartender_0.mp3' },
    { title: 'Cat caffe', artist: 'TAD', layer: 'street', src: 'https://opengameart.org/sites/default/files/Cat%20caffe_0.mp3' },
    { title: 'A cup of tea', artist: 'TAD', layer: 'street', src: 'https://opengameart.org/sites/default/files/A%20cup%20of%20tea_0.mp3' },
    { title: 'Countryside', artist: 'TAD', layer: 'street', src: 'https://opengameart.org/sites/default/files/Countryside_0.mp3' },
    { title: 'Cue', artist: 'TAD', layer: 'upper', src: 'https://opengameart.org/sites/default/files/Cue_0.mp3' },
    { title: 'Oceanside', artist: 'TAD', layer: 'upper', src: 'https://opengameart.org/sites/default/files/Oceanside_0.mp3' },
    { title: 'Florist', artist: 'TAD', layer: 'heaven', src: 'https://opengameart.org/sites/default/files/Florist_0.mp3' },
    { title: 'Morning rain', artist: 'TAD', layer: 'heaven', src: 'https://opengameart.org/sites/default/files/Morning%20rain_0.mp3' },
];

function layerForVertical(vt) {
    if (vt < 0.18) return 'undercity';
    if (vt < 0.54) return 'street';
    if (vt < 0.82) return 'upper';
    return 'heaven';
}

function buildUi() {
    const style = document.createElement('style');
    style.textContent = `
#musicPlayer{position:fixed;right:12px;bottom:12px;z-index:90;display:grid;grid-template-columns:auto auto auto minmax(76px,130px);align-items:center;gap:6px;padding:7px 9px;border:1px solid rgba(255,255,255,.28);background:rgba(5,8,10,.68);backdrop-filter:blur(6px);font:11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:#d7f8df;max-width:min(92vw,410px);box-shadow:0 4px 24px rgba(0,0,0,.28)}
#musicPlayer button{appearance:none;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:inherit;font:inherit;padding:4px 7px;cursor:pointer}
#musicPlayer button:hover,#musicPlayer button:focus-visible{background:rgba(255,255,255,.18)}
#musicPlayer .musicMeta{min-width:0;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#musicPlayer .musicLayer{opacity:.58;text-transform:uppercase;margin-right:5px}
#musicPlayer input[type=range]{width:100%;min-width:76px;accent-color:#b8e7c3}
@media(max-width:620px){#musicPlayer{right:8px;bottom:8px;grid-template-columns:auto auto auto}.musicMeta{grid-column:1/-1;grid-row:1}.musicVolume{display:none}}
`;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'musicPlayer';
    root.setAttribute('aria-label', 'Lo-fi music player');
    root.innerHTML = '<div class="musicMeta"><span class="musicLayer">street</span><span class="musicTitle">lo-fi paused</span></div><button type="button" class="musicPlay" aria-label="Play music">play</button><button type="button" class="musicNext" aria-label="Next track">next</button><button type="button" class="musicMute" aria-label="Mute music">mute</button><input class="musicVolume" aria-label="Music volume" type="range" min="0" max="1" step="0.01" value="0.18">';
    document.body.appendChild(root);
    return root;
}

export function createMusicPlayer() {
    const root = buildUi();
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = false;
    audio.volume = 0.18;
    const playButton = root.querySelector('.musicPlay');
    const nextButton = root.querySelector('.musicNext');
    const muteButton = root.querySelector('.musicMute');
    const volume = root.querySelector('.musicVolume');
    const title = root.querySelector('.musicTitle');
    const layerLabel = root.querySelector('.musicLayer');
    let desiredLayer = 'street';
    let currentIndex = TRACKS.findIndex(track => track.layer === desiredLayer);
    let started = false;
    let muted = false;

    function layerIndices(layer) {
        const result = [];
        for (let i = 0; i < TRACKS.length; i++) if (TRACKS[i].layer === layer) result.push(i);
        return result;
    }

    function setTrack(index, autoplay = started) {
        currentIndex = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
        const track = TRACKS[currentIndex];
        audio.src = track.src;
        audio.load();
        title.textContent = `${track.title} · ${track.artist}`;
        layerLabel.textContent = track.layer;
        if (autoplay) audio.play().catch(() => {
            started = false;
            playButton.textContent = 'play';
        });
    }

    function nextInLayer() {
        const candidates = layerIndices(desiredLayer);
        if (!candidates.length) return;
        const currentPos = candidates.indexOf(currentIndex);
        setTrack(candidates[(currentPos + 1 + candidates.length) % candidates.length]);
    }

    function play() {
        if (!audio.src) setTrack(currentIndex, false);
        started = true;
        audio.play().then(() => { playButton.textContent = 'pause'; }).catch(() => {
            started = false;
            playButton.textContent = 'play';
        });
    }

    function pause() {
        started = false;
        audio.pause();
        playButton.textContent = 'play';
    }

    playButton.addEventListener('click', event => {
        event.stopPropagation();
        if (started && !audio.paused) pause(); else play();
    });
    nextButton.addEventListener('click', event => {
        event.stopPropagation();
        started = true;
        nextInLayer();
        playButton.textContent = 'pause';
    });
    muteButton.addEventListener('click', event => {
        event.stopPropagation();
        muted = !muted;
        audio.muted = muted;
        muteButton.textContent = muted ? 'unmute' : 'mute';
    });
    volume.addEventListener('input', event => {
        event.stopPropagation();
        audio.volume = Number(volume.value);
    });
    root.addEventListener('pointerdown', event => event.stopPropagation());
    root.addEventListener('click', event => event.stopPropagation());
    audio.addEventListener('ended', nextInLayer);
    audio.addEventListener('error', () => {
        title.textContent = 'track unavailable · next';
    });

    return {
        root,
        audio,
        setWorldMix(_horizontal, vertical) {
            const nextLayer = layerForVertical(vertical);
            if (nextLayer === desiredLayer) return;
            desiredLayer = nextLayer;
            layerLabel.textContent = desiredLayer;
            if (!started) return;
            const candidates = layerIndices(desiredLayer);
            if (candidates.length && !candidates.includes(currentIndex)) setTrack(candidates[0], true);
        },
        stats() {
            return { started, muted, desiredLayer, track: TRACKS[currentIndex]?.title || null, preload: audio.preload };
        },
    };
}

export const MUSIC_LICENSE = Object.freeze({
    source: 'https://opengameart.org/content/lofi-compilation',
    author: 'TAD',
    license: 'CC0 1.0',
    tracks: TRACKS.map(({ title, layer, src }) => ({ title, layer, src })),
});
