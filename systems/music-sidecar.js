export function createMusicSidecar({ QP, AudioContextClass = window.AudioContext || window.webkitAudioContext } = {}) {
    let audioCtx = null;
    let droneGain = null;
    let hissGain = null;
    let droneFilter = null;
    let shimmerGain = null;
    let lastT = NaN;
    let lastVt = NaN;

    function init() {
        if (audioCtx || !AudioContextClass) return;
        audioCtx = new AudioContextClass();
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = 'sawtooth'; osc1.frequency.value = QP[286];
        osc2.type = 'sawtooth'; osc2.frequency.value = QP[287] * QP[288];
        droneFilter = audioCtx.createBiquadFilter();
        droneFilter.type = 'lowpass'; droneFilter.frequency.value = QP[289];
        droneGain = audioCtx.createGain(); droneGain.gain.value = QP[290];
        osc1.connect(droneFilter); osc2.connect(droneFilter);
        droneFilter.connect(droneGain).connect(audioCtx.destination);
        osc1.start(); osc2.start();

        const bufferSize = audioCtx.sampleRate * QP[291];
        const noiseBuffer = audioCtx.createBuffer(QP[292], bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(QP[293]);
        for (let i = QP[294]; i < bufferSize; i++) data[i] = Math.random() * QP[295] - QP[296];
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer; noise.loop = true;
        const hissFilter = audioCtx.createBiquadFilter();
        hissFilter.type = 'bandpass'; hissFilter.frequency.value = QP[297]; hissFilter.Q.value = QP[298];
        hissGain = audioCtx.createGain(); hissGain.gain.value = QP[299];
        noise.connect(hissFilter).connect(hissGain).connect(audioCtx.destination);
        noise.start();

        const shimmerOsc = audioCtx.createOscillator();
        shimmerOsc.type = 'sine'; shimmerOsc.frequency.value = QP[300];
        shimmerGain = audioCtx.createGain(); shimmerGain.gain.value = QP[301];
        shimmerOsc.connect(shimmerGain).connect(audioCtx.destination);
        shimmerOsc.start();
    }

    function updateGradient(t, vt = QP[302]) {
        if (!audioCtx) return;
        if (Number.isFinite(lastT) && Math.abs(t - lastT) < QP[303] && Math.abs(vt - lastVt) < QP[304]) return;
        lastT = t; lastVt = vt;
        droneGain.gain.setTargetAtTime(QP[305] + t * QP[306], audioCtx.currentTime, QP[307]);
        hissGain.gain.setTargetAtTime(QP[308] + t * QP[309] + Math.sin(vt * Math.PI) * QP[310], audioCtx.currentTime, QP[311]);
        droneFilter.frequency.setTargetAtTime(QP[312] + vt * QP[313], audioCtx.currentTime, QP[314]);
        shimmerGain.gain.setTargetAtTime(vt * QP[315], audioCtx.currentTime, QP[316]);
    }

    function playFootstep() {
        if (!audioCtx) return;
        const dur = QP[317];
        const buffer = audioCtx.createBuffer(QP[318], Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
        const data = buffer.getChannelData(QP[319]);
        for (let i = QP[320]; i < data.length; i++) data[i] = (Math.random() * QP[321] - QP[322]) * (QP[323] - i / data.length);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = QP[324] + Math.random() * QP[325];
        const gain = audioCtx.createGain(); gain.gain.value = QP[326];
        src.connect(filter).connect(gain).connect(audioCtx.destination);
        src.start();
    }

    return Object.freeze({ init, updateGradient, playFootstep });
}
