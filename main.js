import { CUT_AUTHORED_SPAWN_DECORATION, GENERATION_LANES, GENERATION_PROFILE_NAME, WORLD_BUILD_BUDGET_MS } from './config/performance-isolation.js';
import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { createPlayerPhysics } from './player-physics.js';
import { SpatialHash2D, createProgressiveStaticWorldOptimizer } from './city-performance.js';
import { cylindricalFarPlaneDistance } from './world/cylindrical-render-distance.js';
import { announceParameterOverrides, registerConfigLiveParameter, registerConfigLivePrefix, registerConfigRoot } from './numeric-parameters.js';
import { QP } from './runtime/main-quantitative-literals.js';
import { CONFIG } from './config/game-config.js';
import * as BOOTSTRAP_NOISE from './noise-data-bootstrap.js';
import { createWorldChunkStreamer } from './world-chunk-streamer.js';
import { createKowloonFabricEngine } from './kowloon-fabric-engine.js';
import { createNoiseRemixer } from './systems/noise-remix.js';
import { createOrganicGeometryTools } from './systems/geometry-utils.js';
import { worldWeirdnessAt } from './world-contract.js';
import { WANTED_TAGLINES } from './content/wanted-content.js';
import { BASE_GRAFFITI_TAGS } from './content/graffiti-content.js';
import { MYTHOLOGY_FRAGMENTS, INFRA_LORE_FRAGMENTS, UNDERCITY_LORE_FRAGMENTS } from './content/lore-fragments.js';
import { createSignatureBuildingSystem } from './world/signature-buildings.js';
import { createAdornmentSystem } from './systems/adornment-assets.js';
import { createSignageSystem } from './world/signage.js';
import { createStreetPropsSystem } from './world/street-props.js';
import { createGroundSurfaceSystem } from './world/ground-surfaces.js';
import { createFacadeLayoutSystem } from './world/facade-layout.js';
import { createAuthoredContentHelpers } from './world/authored-content-helpers.js';
import { createSpawnMazePlan, createSpawnBuildingSitePlan } from './world/spawn-district-plan.js';
import { provePlayableSpawn } from './world/spawn-proof.js';
import { realizeSpawnLocation } from './world/spawn-location-realizer.js';
import { WORLD_STREAMING_GEAR, choosePlayerCenteredStreamingGear, createPrefetchPressureGate } from './world/player-centered-streaming.js';
import { createDynamicLightPool } from './systems/dynamic-light-pool.js';
import { createRuntimeLatencyTelemetry } from './systems/runtime-latency.js';
import { createCooperativeBuildYield } from './systems/cooperative-build-yield.js';

 
 
 
 
 
 
let {
    UNICODE_NOISE, MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, TIMEZONE_NOISE, INDEX_STATUS_NOISE,
    NOISE_ACTIONS, MASSIVE_NOISE_META, pickMassiveNoisePair,
    IANA_PORTS_NOISE, IANA_TLDS_NOISE, RFC_INDEX_NOISE,
    OURAIRPORTS_AIRPORTS_NOISE, OURAIRPORTS_FREQUENCIES_NOISE, OURAIRPORTS_RUNWAYS_NOISE, OURAIRPORTS_NAVAIDS_NOISE,
    GEONAMES_CITIES500_NOISE, NOAA_GHCND_STATIONS_NOISE, USGS_EARTHQUAKES_MONTH_NOISE, REMOTE_NOISE_META,
    POETRY_SHORT_NOISE, POETRY_MEDIUM_NOISE, POETRY_PAIRS_NOISE, pickPoetryTag, POETRY_NOISE_META,
} = BOOTSTRAP_NOISE;

const GRAFFITI_TAGS = Object.freeze([...BASE_GRAFFITI_TAGS, ...POETRY_SHORT_NOISE]);
const {
    pickRandomizedCuratedPair,
    pickRandomizedLorePair,
    pickRandomizedGraffitiTag,
    pickRandomizedWantedTaglines,
    unseededPick,
} = createNoiseRemixer({
    poetryShort: () => POETRY_SHORT_NOISE,
    poetryMedium: () => POETRY_MEDIUM_NOISE,
    mythologyFragments: MYTHOLOGY_FRAGMENTS,
    infraLoreFragments: INFRA_LORE_FRAGMENTS,
    undercityLoreFragments: UNDERCITY_LORE_FRAGMENTS,
    graffitiTags: () => GRAFFITI_TAGS,
    wantedTaglines: WANTED_TAGLINES,
});

let fullNoiseHydrationPromise = null;
function hydrateFullNoiseCorpus() {
    if (fullNoiseHydrationPromise) return fullNoiseHydrationPromise;
    fullNoiseHydrationPromise = Promise.all([
        import('./noise-data-hard.js'),
        import('./noise-data-remote.js'),
        import('./noise-data-poetry.js'),
    ]).then(([hard, remote, poetry]) => {
        ({ UNICODE_NOISE, MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, TIMEZONE_NOISE, INDEX_STATUS_NOISE,
            NOISE_ACTIONS, MASSIVE_NOISE_META, pickMassiveNoisePair } = hard);
        ({ IANA_PORTS_NOISE, IANA_TLDS_NOISE, RFC_INDEX_NOISE,
            OURAIRPORTS_AIRPORTS_NOISE, OURAIRPORTS_FREQUENCIES_NOISE, OURAIRPORTS_RUNWAYS_NOISE, OURAIRPORTS_NAVAIDS_NOISE,
            GEONAMES_CITIES500_NOISE, NOAA_GHCND_STATIONS_NOISE, USGS_EARTHQUAKES_MONTH_NOISE, REMOTE_NOISE_META } = remote);
        ({ POETRY_SHORT_NOISE, POETRY_MEDIUM_NOISE, POETRY_PAIRS_NOISE, pickPoetryTag, POETRY_NOISE_META } = poetry);
        console.log(`[noise] full archival corpus hydrated after runtime start: ${MASSIVE_NOISE_META.concreteRows.toLocaleString()} local rows + ${REMOTE_NOISE_META.rows.toLocaleString()} remote rows + ${POETRY_NOISE_META.totalLines.toLocaleString()} verbal lines`);
        return true;
    }).catch(error => {
        fullNoiseHydrationPromise = null;
        console.warn('[noise] full archival corpus hydration skipped/failed; bootstrap corpus remains authoritative', error);
        return false;
    });
    return fullNoiseHydrationPromise;
}

 
 
 
 
 
 
 
 
function bootStatus(text) { window.__boot?.status(text); }
function bootElapsed() { return window.__boot ? window.__boot.elapsed().toFixed(QP[0]) + 's' : '?s (no __boot -- index.html out of sync with main.js)'; }
console.log('[perf] engine + compact bootstrap corpus imports resolved at', bootElapsed(), 'since page start');
bootStatus(`imports resolved at ${bootElapsed()} -- starting maze/city generation…`);

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 

 
 
 
 

 
 
 
 
 
 
 
function mulberry32(seed) {
    return function () {
        seed |= QP[19]; seed = (seed + QP[20]) | QP[21];
        let t = Math.imul(seed ^ (seed >>> QP[22]), QP[23] | seed);
        t = (t + Math.imul(t ^ (t >>> QP[24]), QP[25] | t)) ^ t;
        return ((t ^ (t >>> QP[26])) >>> QP[27]) / QP[28];
    };
}
const urlSeed = new URLSearchParams(location.search).get('seed');
const SEED = urlSeed !== null ? Number(urlSeed) : Math.floor(Math.random() * QP[29] ** QP[30]);
const _globalRng = mulberry32(SEED);
let _rngSource = _globalRng;
function rng() { return _rngSource(); }
console.log(`[testing] maze seed = ${SEED}  (reload with ?seed=${SEED} to get this exact layout)`);

 
 
 
 

 
 
 
 
 
 
 
 
 
 
function jitter(base, pct) {
    return base * (QP[31] + (rng() * QP[32] - QP[33]) * pct);
}
function jitterClamped(base, pct, lo, hi) {
    return Math.min(hi, Math.max(lo, jitter(base, pct)));
}
function jitterInt(base, pct, lo, hi) {
    return Math.round(jitterClamped(base, pct, lo, hi));
}
const _hsl = { h: QP[34], s: QP[35], l: QP[36] };
function shiftHue(hex, degRange, satPct = QP[37], lightPct = QP[38]) {
    const c = new THREE.Color(hex);
    c.getHSL(_hsl);
    let h = _hsl.h + (rng() * QP[39] - QP[40]) * (degRange / QP[41]);
    h = ((h % QP[42]) + QP[43]) % QP[44];
    const s = Math.min(QP[45], Math.max(QP[46], jitter(_hsl.s, satPct)));
    const l = Math.min(QP[47], Math.max(QP[48], jitter(_hsl.l, lightPct)));
    c.setHSL(h, s, l);
    return c.getHex();
}
function randomizeConfig() {
    const c = CONFIG;

     
    c.scene.backgroundColor = shiftHue(c.scene.backgroundColor, QP[49]);
    c.scene.fogColor = shiftHue(c.scene.fogColor, QP[50]);
    c.scene.fogDensity = jitterClamped(c.scene.fogDensity, 0.04, 0.00095, 0.0013);

     
    for (const pole of [c.narrative.lightWeb, c.narrative.darkWeb]) {
        pole.fogColor = shiftHue(pole.fogColor, QP[54]);
        pole.ambientColor = shiftHue(pole.ambientColor, QP[55]);
        pole.fogDensity = jitterClamped(pole.fogDensity, 0.035, 0.0009, 0.00135);
        pole.ambientIntensity = jitterClamped(pole.ambientIntensity, QP[59], QP[60], QP[61]);
        pole.hemiIntensity = jitterClamped(pole.hemiIntensity, QP[62], QP[63], QP[64]);
        pole.signChance = jitterClamped(pole.signChance, QP[65], QP[66], QP[67]);
        pole.propDensityMul = jitterClamped(pole.propDensityMul, QP[68], QP[69], QP[70]);
    }

     
    c.camera.fov = jitterInt(c.camera.fov, QP[71], QP[72], QP[73]);

     
    c.lighting.ambientColor = shiftHue(c.lighting.ambientColor, QP[74]);
    c.lighting.ambientIntensity = jitterClamped(c.lighting.ambientIntensity, QP[75], QP[76], QP[77]);
    c.lighting.moonColor = shiftHue(c.lighting.moonColor, QP[78]);
    c.lighting.moonIntensity = jitterClamped(c.lighting.moonIntensity, QP[79], QP[80], QP[81]);
    c.lighting.fillColor = shiftHue(c.lighting.fillColor, QP[82]);
    c.lighting.fillIntensity = jitterClamped(c.lighting.fillIntensity, QP[83], QP[84], QP[85]);
    c.lighting.moonPosition.x = jitter(c.lighting.moonPosition.x, QP[86]);
    c.lighting.moonPosition.y = jitterClamped(c.lighting.moonPosition.y, QP[87], QP[88], QP[89]);
    c.lighting.moonPosition.z = jitter(c.lighting.moonPosition.z, QP[90]);
    c.lighting.signLight.intensity = jitterClamped(c.lighting.signLight.intensity, QP[91], QP[92], QP[93]);
    c.lighting.signLight.distance = jitterClamped(c.lighting.signLight.distance, QP[94], QP[95], QP[96]);

     
     
     
     
    for (const tier of [c.quality.desktop, c.quality.mobile, c.quality.potato]) {
        if (tier.bloom) {
            tier.bloom.strength = jitterClamped(tier.bloom.strength, QP[97], QP[98], QP[99]);
            tier.bloom.radius = jitterClamped(tier.bloom.radius, QP[100], QP[101], QP[102]);
            tier.bloom.threshold = jitterClamped(tier.bloom.threshold, QP[103], QP[104], QP[105]);
        }
        tier.propDensity = jitterClamped(tier.propDensity, QP[106], tier.propDensity * QP[107], tier.propDensity * QP[108]);
    }

     
    c.maze.loopChance = jitterClamped(c.maze.loopChance, QP[109], QP[110], QP[111]);
    c.maze.buildingMarginMin = jitterClamped(c.maze.buildingMarginMin, QP[112], QP[113], QP[114]);
    c.maze.buildingMarginMax = jitterClamped(c.maze.buildingMarginMax, QP[115], QP[116], QP[117]);

     
     
     
     
    c.buildings.heroTowerChance = jitterClamped(c.buildings.heroTowerChance, QP[118], QP[119], QP[120]);
    c.buildings.roughness = jitterClamped(c.buildings.roughness, QP[121], QP[122], QP[123]);
    c.buildings.palette = c.buildings.palette.map(hex => shiftHue(hex, QP[124], QP[125], QP[126]));
    c.buildings.curb.height = jitterClamped(c.buildings.curb.height, QP[127], QP[128], QP[129]);
    c.buildings.curb.overhang = jitterClamped(c.buildings.curb.overhang, QP[130], QP[131], QP[132]);
    c.buildings.curb.color = shiftHue(c.buildings.curb.color, QP[133]);

     
     
     
     

     
     
    for (const k of Object.keys(c.billboards.contentWeights)) {
        c.billboards.contentWeights[k] = jitterClamped(c.billboards.contentWeights[k], QP[134], QP[135], QP[136]);
    }

     
    for (const k of Object.keys(c.props.weights)) {
        c.props.weights[k] = jitterClamped(c.props.weights[k], QP[137], QP[138], c.props.weights[k] * QP[139] + QP[140]);
    }
    for (const k of Object.keys(c.props.maxSpecialFeatures)) {
        c.props.maxSpecialFeatures[k] = jitterInt(c.props.maxSpecialFeatures[k], QP[141], QP[142], c.props.maxSpecialFeatures[k] * QP[143]);
    }

     
    c.streets.propDensityMul = jitterClamped(c.streets.propDensityMul, QP[144], QP[145], QP[146]);

     
    c.movement.speed = jitterClamped(c.movement.speed, QP[147], QP[148], QP[149]);
    c.movement.sprintMultiplier = jitterClamped(c.movement.sprintMultiplier, QP[150], QP[151], QP[152]);

     
    c.desktopControls.pointerSpeed = jitterClamped(c.desktopControls.pointerSpeed, QP[153], QP[154], QP[155]);
    c.touchControls.lookSensitivity = jitterClamped(c.touchControls.lookSensitivity, QP[156], QP[157], QP[158]);
}
randomizeConfig();

 
 
 
 
 
const CITY_SIZE_PRESETS = { normal: null, large: QP[159], huge: QP[160], absurd: QP[161] };
const _cityParams = new URLSearchParams(location.search);
const _cityPreset = _cityParams.get('city');
const _citySizeRaw = _cityParams.get('citySize');
let _citySizeOverride = null;
if (_citySizeRaw !== null && Number.isFinite(Number(_citySizeRaw))) {
    _citySizeOverride = Math.round(Number(_citySizeRaw));
} else if (_cityPreset && CITY_SIZE_PRESETS[_cityPreset] !== undefined) {
    _citySizeOverride = CITY_SIZE_PRESETS[_cityPreset];
}
if (_citySizeOverride !== null) {
    _citySizeOverride = Math.max(QP[162], Math.min(QP[163], _citySizeOverride));
     
     
     
    if (_citySizeOverride % QP[164] === QP[165]) _citySizeOverride = Math.min(QP[166], _citySizeOverride + QP[167]);
    CONFIG.maze.cols = _citySizeOverride;
    CONFIG.maze.rows = _citySizeOverride;
    console.log(`[perf] city size override: ${_citySizeOverride}x${_citySizeOverride} (${_citySizeRaw !== null ? '?citySize=' + _citySizeRaw : '?city=' + _cityPreset})`);
}

 
 
 
 
registerConfigRoot(CONFIG);
announceParameterOverrides(bootStatus, SEED);

console.log('[testing] config randomized from seed -- reload for a new mood, or pin ?seed= to freeze it too.');
 
 
 
 
console.log('[config] full randomized CONFIG:', CONFIG);
console.log('[config] key tunables -- propDensity(desktop/mobile/potato):', CONFIG.quality.desktop.propDensity.toFixed(QP[168]), CONFIG.quality.mobile.propDensity.toFixed(QP[169]), CONFIG.quality.potato.propDensity.toFixed(QP[170]),
    '| buildingMargin:', CONFIG.maze.buildingMarginMin.toFixed(QP[171]), '-', CONFIG.maze.buildingMarginMax.toFixed(QP[172]),
    '| loopChance:', CONFIG.maze.loopChance.toFixed(QP[173]),
    '| moveSpeed/sprint:', CONFIG.movement.speed.toFixed(QP[174]), CONFIG.movement.sprintMultiplier.toFixed(QP[175]));

 

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > QP[176];

 
 
 
 
 
 
 
 
 
 
 
const forcedQuality = new URLSearchParams(location.search).get('quality');
 
 
 
 
 
 
 
const DEBUG_FOOTPRINTS = new URLSearchParams(location.search).get('debugFootprints') === '1';
 
 
 
 
 
 
 
 
 
 
const DEBUG_FACADES = new URLSearchParams(location.search).get('debugFacades') === '1';
 
 
 
const DEBUG_SIGNATURES = new URLSearchParams(location.search).get('debugSignatures') === '1';
 
 
 
 
 
 
const urlLandmark = new URLSearchParams(location.search).get('landmark');
const cores = navigator.hardwareConcurrency || QP[177];
const mem = navigator.deviceMemory || QP[178];  

function detectWeakGPU() {
    try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
        if (!gl) return true;  
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererStr = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
         
         
        return /intel|swiftshader|llvmpipe|software|basic render|mali-4|adreno [23]0/.test(rendererStr);
    } catch {
        return false;  
    }
}
const looksLikePotato = cores <= QP[179] || mem <= QP[180] || detectWeakGPU();

const QUALITY = forcedQuality === 'high' ? CONFIG.quality.desktop
    : forcedQuality === 'low' ? CONFIG.quality.potato
    : looksLikePotato ? CONFIG.quality.potato
    : IS_TOUCH ? CONFIG.quality.mobile
    : CONFIG.quality.desktop;

 

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.scene.backgroundColor);
scene.fog = new THREE.FogExp2(CONFIG.scene.fogColor, CONFIG.scene.fogDensity);

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
const allDynamicLights = [];
const detailCullObjects = new Set();
let _detailCullTick = QP[181];
let staticWorldOptimizer = null;
let _backgroundCompileSchedulingEnabled = false;
let _worldStreamPriorityLock = true;
let _sceneMaterialRevision = 0;
let _bootstrapCompileStagingEnabled = true;
const _bootstrapCompileStaged = new Map();
const _bootstrapCompileQueue = [];
const _bootstrapCompileQueued = new Set();
const _bootstrapCompileGroups = new Map();
const _bootstrapCompiledPrograms = new Set();
const _bootstrapPreviewMaterials = new Map();
let _bootstrapCompilePumpPromise = null;
let _generationAddedRoots = null;
function bootstrapMaterialProgramKey(material) {
    if (!material) return 'none';
    const defines = material.defines && typeof material.defines === 'object'
        ? Object.entries(material.defines).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(',')
        : '';
    const customKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey() : '';
    return [
        material.type,
        material.side,
        material.transparent ? 1 : 0,
        material.alphaTest > 0 ? 1 : 0,
        material.vertexColors ? 1 : 0,
        material.flatShading ? 1 : 0,
        material.fog === false ? 0 : 1,
        material.toneMapped === false ? 0 : 1,
        material.wireframe ? 1 : 0,
        material.map ? 1 : 0,
        material.alphaMap ? 1 : 0,
        material.aoMap ? 1 : 0,
        material.lightMap ? 1 : 0,
        material.emissiveMap ? 1 : 0,
        material.bumpMap ? 1 : 0,
        material.normalMap ? 1 : 0,
        material.displacementMap ? 1 : 0,
        material.roughnessMap ? 1 : 0,
        material.metalnessMap ? 1 : 0,
        material.envMap ? 1 : 0,
        defines,
        customKey,
    ].join('|');
}
function bootstrapProgramKey(leaf, materialOverride = leaf.material) {
    const materials = Array.isArray(materialOverride) ? materialOverride : [materialOverride];
    const attrs = Object.keys(leaf.geometry?.attributes || {}).sort().join(',');
    const morph = Object.keys(leaf.geometry?.morphAttributes || {}).sort().join(',');
    return [
        leaf.type,
        leaf.isInstancedMesh ? 'instanced' : 'plain',
        leaf.isSkinnedMesh ? 'skinned' : 'rigid',
        attrs,
        morph,
        materials.map(bootstrapMaterialProgramKey).join('||'),
    ].join('::');
}

function bootstrapPreviewColorHex(material) {
    if (material?.color?.isColor) return material.color.getHex();
    if (material?.emissive?.isColor) return material.emissive.getHex();
    return 0x62666d;
}

function bootstrapPreviewMaterialFor(material, leaf) {
    if (!material) return material;
    const kind = leaf.isLine ? 'line' : leaf.isPoints ? 'points' : leaf.isSprite ? 'sprite' : 'mesh';
    const color = bootstrapPreviewColorHex(material);
    const opacity = Number.isFinite(Number(material.opacity)) ? Math.max(0, Math.min(1, Number(material.opacity))) : 1;
    const key = [
        kind,
        color.toString(16),
        opacity.toFixed(3),
        material.transparent ? 1 : 0,
        material.depthTest === false ? 0 : 1,
        material.depthWrite === false ? 0 : 1,
        Number(material.side) || 0,
        material.vertexColors ? 1 : 0,
        material.wireframe ? 1 : 0,
        Number(material.size) || 1,
    ].join('|');
    const cached = _bootstrapPreviewMaterials.get(key);
    if (cached) return cached;
    const common = {
        color,
        opacity,
        transparent: !!material.transparent || opacity < 1,
        depthTest: material.depthTest !== false,
        depthWrite: material.depthWrite !== false,
        side: material.side,
        vertexColors: !!material.vertexColors,
        fog: material.fog !== false,
        toneMapped: false,
    };
    let preview;
    if (leaf.isLine) preview = new THREE.LineBasicMaterial(common);
    else if (leaf.isPoints) preview = new THREE.PointsMaterial({
        ...common,
        size: Math.max(0.01, Number(material.size) || 1),
        sizeAttenuation: material.sizeAttenuation !== false,
    });
    else if (leaf.isSprite) preview = new THREE.SpriteMaterial({
        ...common,
        rotation: Number(material.rotation) || 0,
    });
    else preview = new THREE.MeshBasicMaterial({ ...common, wireframe: !!material.wireframe });
    preview.name = `bootstrap-color-proxy:${material.name || material.type || kind}`;
    _bootstrapPreviewMaterials.set(key, preview);
    return preview;
}

function bootstrapPreviewForLeaf(leaf, material) {
    return Array.isArray(material)
        ? material.map(item => bootstrapPreviewMaterialFor(item, leaf))
        : bootstrapPreviewMaterialFor(material, leaf);
}

function releaseBootstrapPreviewMaterialsIfIdle() {
    if (_bootstrapCompileStaged.size || _bootstrapCompileQueue.length || _bootstrapCompilePumpPromise) return false;
    for (const material of _bootstrapPreviewMaterials.values()) material?.dispose?.();
    _bootstrapPreviewMaterials.clear();
    return true;
}

function stageBootstrapCompileLeaf(leaf) {
    if (!(leaf?.isMesh || leaf?.isLine || leaf?.isPoints || leaf?.isSprite) || !leaf.material) return;
    const existing = _bootstrapCompileStaged.get(leaf);
    const originalMaterial = existing?.material ?? leaf.material;
    const key = existing?.key ?? bootstrapProgramKey(leaf, originalMaterial);
    if (_bootstrapCompiledPrograms.has(key)) return;
    if (!existing) {
        _bootstrapCompileStaged.set(leaf, {
            key,
            visible: leaf.visible,
            material: originalMaterial,
        });
        // Minimum visual truth publishes immediately. The cheap proxy preserves the
        // object's authored color while the expensive real shader program compiles
        // in the background; geometry no longer disappears behind a global gray gate.
        leaf.material = bootstrapPreviewForLeaf(leaf, originalMaterial);
    }
    let group = _bootstrapCompileGroups.get(key);
    if (!group) {
        group = { key, representative: leaf, leaves: new Set() };
        _bootstrapCompileGroups.set(key, group);
    }
    group.leaves.add(leaf);
    if (!_bootstrapCompileQueued.has(key)) {
        _bootstrapCompileQueued.add(key);
        _bootstrapCompileQueue.push(key);
    }
}
const _origSceneAdd = scene.add.bind(scene);
const dynamicLightPool = createDynamicLightPool({ THREE, directSceneAdd: _origSceneAdd, scene, maxVisible: QUALITY.maxDynamicLights });
dynamicLightPool.attach();
function isWorldStreamRoot(obj) {
    return !!obj?.userData?.worldChunkRoot;
}
scene.add = function (...objs) {
    const renderables = [];
    for (const o of objs) {
        if (o && o.isPointLight && !o.userData?.dynamicLightPoolSlot) {
            if (dynamicLightPool.register(o)) allDynamicLights.push(o);
            continue;
        }
        if (o?.userData?.detailCullDistance) detailCullObjects.add(o);
        if (_bootstrapCompileStagingEnabled && o && (o.isMesh || o.isLine || o.isPoints || o.isSprite || o.isGroup) && !isWorldStreamRoot(o)) {
            o.traverse?.(stageBootstrapCompileLeaf);
        }
        renderables.push(o);
    }
    const result = renderables.length ? _origSceneAdd(...renderables) : scene;
    if (renderables.some(o => o && (o.isMesh || o.isLine || o.isPoints || o.isSprite || o.isGroup))) _sceneMaterialRevision++;
    if (staticWorldOptimizer) {
        for (const o of renderables) {
            if (!isWorldStreamRoot(o)) staticWorldOptimizer.registerLateObject(o);
        }
    }
    if (_generationAddedRoots) {
        for (const o of renderables) if (o && !isWorldStreamRoot(o)) _generationAddedRoots.push(o);
    }
    return result;
};
let _lightCullTick = QP[182];
function updateDynamicLightCulling(force = false) {
    if (!force && ++_lightCullTick % QP[183] !== QP[184]) return;
    dynamicLightPool.update(camera.position);
}

function updateDetailObjectCulling() {
    if (++_detailCullTick % QP[186] !== QP[187] || !detailCullObjects.size) return;
    const px = camera.position.x, pz = camera.position.z;
    for (const obj of detailCullObjects) {
        if (!obj.parent) { detailCullObjects.delete(obj); continue; }
        const cx = obj.userData.detailCullCenterX ?? obj.position.x;
        const cz = obj.userData.detailCullCenterZ ?? obj.position.z;
        const dx = cx - px, dz = cz - pz;
        const dist = obj.userData.detailCullDistance;
        obj.visible = dx * dx + dz * dz <= dist * dist;
    }
}

const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    cylindricalFarPlaneDistance(QUALITY.drawDistance)
);
camera.rotation.order = 'YXZ';

 
 
 
const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance' });
renderer.debug.checkShaderErrors = new URLSearchParams(location.search).get('shaderDebug') === '1';
 
 
 
 
renderer.info.autoReset = false;
const TARGET_PIXEL_RATIO = Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
const PROGRESSIVE_PIXEL_RATIO = Math.min(1, TARGET_PIXEL_RATIO);
let finalRenderQualityRestored = PROGRESSIVE_PIXEL_RATIO === TARGET_PIXEL_RATIO && !QUALITY.bloom;
renderer.setPixelRatio(PROGRESSIVE_PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
 
 
let bloomPass = null;
if (QUALITY.bloom) {
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        QUALITY.bloom.strength,
        QUALITY.bloom.radius,
        QUALITY.bloom.threshold
    );
    bloomPass.enabled = false;
    composer.addPass(bloomPass);
}

function restoreFinalRenderQuality() {
    if (finalRenderQualityRestored) return;
    if (TARGET_PIXEL_RATIO !== PROGRESSIVE_PIXEL_RATIO) {
        renderer.setPixelRatio(TARGET_PIXEL_RATIO);
        composer.setPixelRatio?.(TARGET_PIXEL_RATIO);
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (bloomPass) bloomPass.enabled = true;
    finalRenderQualityRestored = true;
    console.log(`[perf] final render quality restored · pixelRatio=${TARGET_PIXEL_RATIO.toFixed(2)} · bloom=${!!bloomPass}`);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

 

const ambientLight = new THREE.AmbientLight(CONFIG.lighting.ambientColor, CONFIG.lighting.ambientIntensity);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(CONFIG.lighting.fillColor, QP[188], CONFIG.lighting.fillIntensity);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(CONFIG.lighting.moonColor, CONFIG.lighting.moonIntensity);
sun.position.set(CONFIG.lighting.moonPosition.x, CONFIG.lighting.moonPosition.y, CONFIG.lighting.moonPosition.z);
scene.add(sun);

 
 
 
 
 
 
 
 
let dynamicLightsRemaining = QUALITY.maxDynamicLights * QP[189];
function takeDynamicLight(threshold) {
    if (dynamicLightsRemaining <= threshold) return false;
    dynamicLightsRemaining--;
    return true;
}

 
 
 
const runtimeLatency = createRuntimeLatencyTelemetry();
const _testParams = new URLSearchParams(location.search);
const TEST_FRAME_BUDGET_MS = Math.max(2, Math.min(12, Number(_testParams.get('frameBudget')) || (QUALITY === CONFIG.quality.desktop ? 7 : 5)));
const TEST_BOOT_MOVE_SPEED = Math.max(2, CONFIG.movement.speed);
let _testSliceStartedAt = performance.now();
let _testBootstrapActive = true;
let _testRefinementActive = true;
let _testTopologyReady = false;
let _testBootstrapHasMoved = false;
let _testBootstrapFrame = 0;
let _testLastBootPaint = performance.now();
let _testGenerationPhase = 'loading corpus';
let _testGenerationDone = 0;
let _testGenerationTotal = 0;
let _testCompileBarrierActive = false;
let _testCompileTotalMs = 0;
let _testCompileMaxMs = 0;
let _testCompileCount = 0;

async function runBootstrapCompilePump() {
    if (typeof renderer.compileAsync !== 'function') {
        for (const [leaf, staged] of _bootstrapCompileStaged) {
            if (leaf.parent) {
                leaf.material = staged.material;
                leaf.visible = staged.visible;
            }
        }
        _bootstrapCompileStaged.clear();
        _bootstrapCompileQueue.length = 0;
        _bootstrapCompileQueued.clear();
        _bootstrapCompileGroups.clear();
        _testRefinementActive = false;
        releaseBootstrapPreviewMaterialsIfIdle();
        return;
    }
    while (_bootstrapCompileQueue.length) {
        const key = _bootstrapCompileQueue.shift();
        _bootstrapCompileQueued.delete(key);
        const group = _bootstrapCompileGroups.get(key);
        if (!group) continue;
        let representative = group.representative;
        let representativeStage = representative ? _bootstrapCompileStaged.get(representative) : null;
        if (!representative?.parent || !representativeStage) {
            representative = [...group.leaves].find(leaf => leaf?.parent && _bootstrapCompileStaged.has(leaf)) ?? null;
            representativeStage = representative ? _bootstrapCompileStaged.get(representative) : null;
            group.representative = representative;
        }
        if (!representative || !representativeStage) {
            for (const leaf of group.leaves) _bootstrapCompileStaged.delete(leaf);
            _bootstrapCompileGroups.delete(key);
            continue;
        }
        // Compile a detached representative with the final material. Live geometry
        // remains visible with its cheap color proxy during the async compile.
        const compileTarget = representative.clone(false);
        compileTarget.material = representativeStage.material;
        compileTarget.visible = true;
        compileTarget.frustumCulled = false;
        const started = performance.now();
        _testCompileBarrierActive = true;
        try {
            await renderer.compileAsync(compileTarget, camera, scene);
        } catch (error) {
            console.warn('[shader-prewarm] program-family compile failed; restoring real material for normal lazy compile', error);
        } finally {
            _testCompileBarrierActive = false;
        }
        const ms = performance.now() - started;
        runtimeLatency.record('shader.compile-program', ms, {
            type: representative.type,
            material: Array.isArray(representativeStage.material) ? 'array' : representativeStage.material?.type,
            proxyVisibleLeaves: group.leaves.size,
        });
        _testCompileCount++;
        _testCompileTotalMs += ms;
        _testCompileMaxMs = Math.max(_testCompileMaxMs, ms);
        _bootstrapCompiledPrograms.add(key);
        for (const leaf of group.leaves) {
            const staged = _bootstrapCompileStaged.get(leaf);
            if (leaf.parent && staged) {
                leaf.material = staged.material;
                leaf.visible = staged.visible;
                staticWorldOptimizer?.markDirtyObject(leaf);
            }
            _bootstrapCompileStaged.delete(leaf);
        }
        _bootstrapCompileGroups.delete(key);
        if (ms > 16) console.warn(`[latency] shader.compile-program ${ms.toFixed(1)}ms · ${representative.type} · ${Array.isArray(representativeStage.material) ? 'material[]' : representativeStage.material?.type || 'material'} · ${group.leaves.size} color-proxy leaf/leaves`);
        await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (!_bootstrapCompileStaged.size) _testRefinementActive = false;
}

function scheduleBootstrapCompilePump() {
    if (!_backgroundCompileSchedulingEnabled || _worldStreamPriorityLock) return null;
    if (!_bootstrapCompileQueue.length || _bootstrapCompilePumpPromise) return _bootstrapCompilePumpPromise;
    _bootstrapCompilePumpPromise = runBootstrapCompilePump().finally(() => {
        _bootstrapCompilePumpPromise = null;
        releaseBootstrapPreviewMaterialsIfIdle();
        if (_bootstrapCompileQueue.length) scheduleBootstrapCompilePump();
    });
    return _bootstrapCompilePumpPromise;
}

async function testCompileSceneIfDirty() {
    scheduleBootstrapCompilePump();
    return false;
}

function testStatus(phase, done = _testGenerationDone, total = _testGenerationTotal) {
    _testGenerationPhase = phase;
    _testGenerationDone = done;
    _testGenerationTotal = total;
    const progress = total > 0 ? ` ${done}/${total}` : '';
    bootStatus(`${phase}${progress} · live ${bootElapsed()}`);
}

function testNextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => {
        _testSliceStartedAt = performance.now();
        _testLastBootPaint = _testSliceStartedAt;
        resolve();
    }));
}

async function testYieldNow(phase = _testGenerationPhase, done = _testGenerationDone, total = _testGenerationTotal) {
    testStatus(phase, done, total);
    await testNextPaint();
}

async function testYieldIfNeeded(phase = _testGenerationPhase, done = _testGenerationDone, total = _testGenerationTotal) {
    const elapsed = performance.now() - _testSliceStartedAt;
    const inputPending = !!navigator.scheduling?.isInputPending?.({ includeContinuous: true });
    if (!inputPending && elapsed < TEST_FRAME_BUDGET_MS) return false;
    await testYieldNow(phase, done, total);
    return true;
}

async function testPublishAndYieldNow(phase = _testGenerationPhase, done = _testGenerationDone, total = _testGenerationTotal) {
    testStatus(phase, done, total);
    scheduleBootstrapCompilePump();
    await testNextPaint();
}

async function testPublishAndYieldIfNeeded(phase = _testGenerationPhase, done = _testGenerationDone, total = _testGenerationTotal) {
    const elapsed = performance.now() - _testSliceStartedAt;
    const inputPending = !!navigator.scheduling?.isInputPending?.({ includeContinuous: true });
    if (!inputPending && elapsed < TEST_FRAME_BUDGET_MS) return false;
    await testPublishAndYieldNow(phase, done, total);
    return true;
}

 
 
 
const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = CONFIG.desktopControls.pointerSpeed;
const move = { forward: false, back: false, left: false, right: false, sprint: false, flyUp: false, flyDown: false };
let playerPhysics = null;
let freecamEnabled = false;
const _bootstrapMoveForwardWorld = new THREE.Vector3();
const _bootstrapMoveRightWorld = new THREE.Vector3();

function testEarlyKeyDown(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = true; break;
        case 'KeyS': case 'ArrowDown': move.back = true; break;
        case 'KeyA': case 'ArrowLeft': move.left = true; break;
        case 'KeyD': case 'ArrowRight': move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = true; break;
        case 'Space':
            playerPhysics?.bufferJump();
            move.flyUp = true;
            e.preventDefault();
            break;
        case 'KeyC': move.flyDown = true; break;
        case 'KeyF':
            freecamEnabled = !freecamEnabled;
            if (!freecamEnabled) playerPhysics?.syncFromPosition({ forceAirborne: true, resetVelocity: true });
            break;
        case 'KeyP':
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) break;
            e.preventDefault();
            if (controls.isLocked) controls.unlock();
            import('./parameter-editor.js').then(mod => mod.toggleParameterEditor({ seed: SEED })).catch(err => console.error('[params] parameter editor failed to load', err));
            break;
    }
}
function testEarlyKeyUp(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = false; break;
        case 'KeyS': case 'ArrowDown': move.back = false; break;
        case 'KeyA': case 'ArrowLeft': move.left = false; break;
        case 'KeyD': case 'ArrowRight': move.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = false; break;
        case 'Space': move.flyUp = false; break;
        case 'KeyC': move.flyDown = false; break;
    }
}
function testEarlyClick(e) {
    if (IS_TOUCH || e.target.closest?.('#parameterEditorRoot, #bootStreamFilters, #escapeSiteButton')) return;
    if (!controls.isLocked) controls.lock();
}
document.addEventListener('keydown', testEarlyKeyDown);
document.addEventListener('keyup', testEarlyKeyUp);
document.addEventListener('click', testEarlyClick);

function testDisableBootstrapInput() {
    document.removeEventListener('keydown', testEarlyKeyDown);
    document.removeEventListener('keyup', testEarlyKeyUp);
    document.removeEventListener('click', testEarlyClick);
}

function testBootstrapCanStand(x, z) {
    if (!_testTopologyReady) return true;
    const { col, row } = worldToCellIndex(x, z);
    return grid[row]?.[col] === false;
}

let _testBootstrapLast = performance.now();
function testBootstrapRenderLoop(now) {
    if (!_testBootstrapActive) return;
    runtimeLatency.raf(now, { runtime: 'bootstrap', phase: _testGenerationPhase });
    requestAnimationFrame(testBootstrapRenderLoop);
    const dt = Math.min(0.05, Math.max(0, (now - _testBootstrapLast) / 1000));
    _testBootstrapLast = now;

    if (!IS_TOUCH && controls.isLocked) {
        let f = (move.forward ? 1 : 0) - (move.back ? 1 : 0);
        let r = (move.right ? 1 : 0) - (move.left ? 1 : 0);
        const len = Math.hypot(f, r);
        if (len > 0) { f /= len; r /= len; }
        const speed = TEST_BOOT_MOVE_SPEED * (move.sprint ? CONFIG.movement.sprintMultiplier : 1);
        if (freecamEnabled) {
            if (len > 0) {
                controls.moveRight(r * speed * dt);
                controls.moveForward(f * speed * dt);
                _testBootstrapHasMoved = true;
            }
            const vertical = (move.flyUp ? 1 : 0) - (move.flyDown ? 1 : 0);
            camera.position.y += vertical * speed * 2 * dt;
        } else if (playerPhysics) {
            let wishVelocityX = 0;
            let wishVelocityZ = 0;
            if (len > 0) {
                camera.getWorldDirection(_bootstrapMoveForwardWorld);
                _bootstrapMoveForwardWorld.y = 0;
                if (_bootstrapMoveForwardWorld.lengthSq() > 0) _bootstrapMoveForwardWorld.normalize();
                else _bootstrapMoveForwardWorld.set(0, 0, -1);
                _bootstrapMoveRightWorld.crossVectors(_bootstrapMoveForwardWorld, camera.up);
                if (_bootstrapMoveRightWorld.lengthSq() > 0) _bootstrapMoveRightWorld.normalize();
                else _bootstrapMoveRightWorld.set(1, 0, 0);
                wishVelocityX = (_bootstrapMoveRightWorld.x * r + _bootstrapMoveForwardWorld.x * f) * speed;
                wishVelocityZ = (_bootstrapMoveRightWorld.z * r + _bootstrapMoveForwardWorld.z * f) * speed;
                _testBootstrapHasMoved = true;
            }
            playerPhysics.step(dt, wishVelocityX, wishVelocityZ);
        } else if (len > 0) {
            const yaw = camera.rotation.y;
            const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) * speed * dt;
            const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) * speed * dt;
            const nx = camera.position.x + dx;
            const nz = camera.position.z + dz;
            if (testBootstrapCanStand(nx, camera.position.z)) camera.position.x = nx;
            if (testBootstrapCanStand(camera.position.x, nz)) camera.position.z = nz;
            camera.position.y = CONFIG.camera.eyeHeight;
            _testBootstrapHasMoved = true;
        }
    }

    updateDynamicLightCulling();
    renderer.info.reset();
    const _renderStarted = performance.now();
    renderer.render(scene, camera);
    const _renderMs = performance.now() - _renderStarted;
    runtimeLatency.record('render.bootstrap', _renderMs, { phase: _testGenerationPhase, sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, compileActive: _testCompileBarrierActive, colorProxyPending: _bootstrapCompileStaged.size });
    if (_renderMs > 8) console.warn(`[latency] render.bootstrap ${_renderMs.toFixed(1)}ms · phase=${_testGenerationPhase} · scene=${scene.children.length} · calls=${renderer.info.render.calls} · compile=${_testCompileBarrierActive ? 'yes' : 'no'}`);
    _testBootstrapFrame++;
}
requestAnimationFrame(testBootstrapRenderLoop);
console.log(`[stream-perf] progressive color runtime active; frame work budget=${TEST_FRAME_BUDGET_MS}ms; authored geometry publishes with color proxies while final shaders compile`);
window.__streamingDebug = {
    mode: 'full-fidelity-progressive',
    frameBudgetMs: TEST_FRAME_BUDGET_MS,
    get phase() { return _testGenerationPhase; },
    get done() { return _testGenerationDone; },
    get total() { return _testGenerationTotal; },
    get topologyReady() { return _testTopologyReady; },
    get bootstrapActive() { return _testBootstrapActive; },
    get refinementActive() { return _testRefinementActive; },
    get paintedFrames() { return _testBootstrapFrame; },
    get sceneChildren() { return scene.children.length; },
    get playerMovedDuringLoad() { return _testBootstrapHasMoved; },
    get shaderCompileBarrierActive() { return _testCompileBarrierActive; },
    get shaderCompileCount() { return _testCompileCount; },
    get shaderCompileMaxMs() { return _testCompileMaxMs; },
    get shaderCompileTotalMs() { return _testCompileTotalMs; },
    get shaderProgramFamiliesPending() { return _bootstrapCompileQueue.length; },
    get shaderStagedLeaves() { return _bootstrapCompileStaged.size; },
    latencySnapshot() { return runtimeLatency.snapshot(); },
};

 
 
 
 
bootStatus(`bootstrap corpus ready at ${bootElapsed()} -- planning spawn chunk…`);
console.log(`[noise] bootstrap corpus: ${MASSIVE_NOISE_META.concreteRows.toLocaleString()} representative local rows; ${REMOTE_NOISE_META.rows.toLocaleString()} representative public-data rows; ${POETRY_NOISE_META.totalLines.toLocaleString()} verbal lines`);
window.__loadFullNoiseCorpus = hydrateFullNoiseCorpus;

 
 
 
 
 
 
 
const NOISE_DISTRICTS = {
    network: [MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, INDEX_STATUS_NOISE, IANA_PORTS_NOISE, IANA_TLDS_NOISE, RFC_INDEX_NOISE],
    transport: [OURAIRPORTS_AIRPORTS_NOISE, OURAIRPORTS_FREQUENCIES_NOISE, OURAIRPORTS_RUNWAYS_NOISE, OURAIRPORTS_NAVAIDS_NOISE],
    geographic: [GEONAMES_CITIES500_NOISE, TIMEZONE_NOISE],
    scientific: [NOAA_GHCND_STATIONS_NOISE, USGS_EARTHQUAKES_MONTH_NOISE],
    encoding: [UNICODE_NOISE],
     
     
     
     
    verbal: [POETRY_PAIRS_NOISE],
};
const DISTRICT_KEYS = Object.keys(NOISE_DISTRICTS);
function pickFromPools(rng, pools) {
    const pool = pools[Math.floor(rng() * pools.length)];
    return pool[Math.floor(rng() * pool.length)];
}

 
 
 
 
 
function districtHash(col, row) {
    let h = Math.imul(SEED ^ QP[228], QP[229]);
    h = Math.imul(h ^ col, QP[230]);
    h = Math.imul(h ^ row, QP[231]);
    h ^= h >>> QP[232];
    return (h >>> QP[233]) / QP[234];
}
function districtForCell(col, row) {
    return DISTRICT_KEYS[Math.floor(districtHash(col, row) * DISTRICT_KEYS.length)];
}

 
 
 
 
function stylizeNoisePair(rng, pair) {
    if (rng() > QP[235]) return pair;
    const [title, subtitle] = pair;
    switch (Math.floor(rng() * QP[236])) {
        case QP[237]: {
            const n = QP[238] + Math.floor(rng() * QP[239]);
            const total = n + Math.floor(rng() * QP[240]);
            return [title, `RESULT ${String(n).padStart(QP[241], '0')} / ${total.toLocaleString()}`];
        }
        case QP[242]: {
            const offset = Math.floor(rng() * QP[243]);
            return [title, `ROW 0x${offset.toString(QP[244]).toUpperCase().padStart(QP[245], '0')} · SHARD ${Math.floor(rng() * QP[246])}`];
        }
        case QP[247]: return [`${pick(NOISE_ACTIONS)} ${title}`, subtitle];
        default: {
            const etag = Math.floor(rng() * QP[248]).toString(QP[249]).toUpperCase();
            return [title, `ETAG ${etag} · AGE ${Math.floor(rng() * QP[250])}S`];
        }
    }
}

 
 
 
function pickAnyNoisePair(rng) {
    if (rng() < QP[251]) return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS[DISTRICT_KEYS[Math.floor(rng() * DISTRICT_KEYS.length)]]));
    return pickMassiveNoisePair(rng, QP[252]);
}

 
 
 
function pickCityNoisePair(rng, worldX, worldZ) {
    if (worldX === undefined) return pickAnyNoisePair(rng);
    const { col, row } = worldToCell(worldX, worldZ);
    if (rng() < QP[253]) return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS[districtForCell(col, row)]));
    return pickAnyNoisePair(rng);
}

 
 
 
 

function webAlignment(worldZ) {
    return THREE.MathUtils.clamp((worldZ / (GRID_H / QP[254]) + QP[255]) / QP[256], QP[257], QP[258]);
}

 
 
 
 
 
 
 
 
 
 
 
 
const ATMOSPHERE_DARK_FOG = new THREE.Color(CONFIG.narrative.darkWeb.fogColor);
const ATMOSPHERE_LIGHT_FOG = new THREE.Color(CONFIG.narrative.lightWeb.fogColor);
const ATMOSPHERE_DARK_AMBIENT = new THREE.Color(CONFIG.narrative.darkWeb.ambientColor);
const ATMOSPHERE_LIGHT_AMBIENT = new THREE.Color(CONFIG.narrative.lightWeb.ambientColor);
const _atmosphereColor = new THREE.Color();
const _atmosphereAmbient = new THREE.Color();
let _lastCameraFar = camera.far;

function updateWebGradient(worldZ) {
    const t = webAlignment(worldZ);
    const dark = CONFIG.narrative.darkWeb;
    const light = CONFIG.narrative.lightWeb;

    // One distant neutral atmosphere everywhere. Horizontal world alignment is
    // allowed only a very small gray/cool/warm perturbation; altitude never
    // changes fog color, density, or camera range.
    _atmosphereColor.copy(ATMOSPHERE_DARK_FOG).lerp(ATMOSPHERE_LIGHT_FOG, t);
    _atmosphereAmbient.copy(ATMOSPHERE_DARK_AMBIENT).lerp(ATMOSPHERE_LIGHT_AMBIENT, t);
    scene.fog.color.copy(_atmosphereColor);
    scene.background.copy(_atmosphereColor);
    scene.fog.density = THREE.MathUtils.lerp(dark.fogDensity, light.fogDensity, t);

    const nextFar = cylindricalFarPlaneDistance(QUALITY.drawDistance);
    if (Math.abs(nextFar - _lastCameraFar) > QP[281]) {
        camera.far = nextFar;
        camera.updateProjectionMatrix();
        _lastCameraFar = nextFar;
    }

    ambientLight.color.copy(_atmosphereAmbient);
    ambientLight.intensity = THREE.MathUtils.lerp(dark.ambientIntensity, light.ambientIntensity, t);
    hemiLight.intensity = THREE.MathUtils.lerp(dark.hemiIntensity, light.hemiIntensity, t);
    rainMat.opacity = (QP[282] - t) * QP[283];
}


function playFootstep() {}

const RAIN_COUNT = IS_TOUCH ? QP[327] : QP[328];
const RAIN_SPAN = QP[329], RAIN_HEIGHT = QP[330];
const rainPositions = new Float32Array(RAIN_COUNT * QP[331]);
const rainSpeeds = new Float32Array(RAIN_COUNT);
for (let i = QP[332]; i < RAIN_COUNT; i++) {
    rainPositions[i * QP[333]] = randRange(-RAIN_SPAN / QP[334], RAIN_SPAN / QP[335]);
    rainPositions[i * QP[336] + QP[337]] = randRange(QP[338], RAIN_HEIGHT);
    rainPositions[i * QP[339] + QP[340]] = randRange(-RAIN_SPAN / QP[341], RAIN_SPAN / QP[342]);
    rainSpeeds[i] = randRange(QP[343], QP[344]);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, QP[345]));
const rainMat = new THREE.PointsMaterial({
    color: QP[346], size: QP[347], transparent: true, opacity: QP[348], depthWrite: false,
});
const rain = new THREE.Points(rainGeo, rainMat);
scene.add(rain);

function updateRain(delta) {
     
     
    if (rainMat.opacity <= QP[349]) { rain.visible = false; return; }
    rain.visible = true;
    const pos = rainGeo.attributes.position;
    for (let i = QP[350]; i < RAIN_COUNT; i++) {
        let y = pos.array[i * QP[351] + QP[352]] - rainSpeeds[i] * delta;
        if (y < QP[353]) y = RAIN_HEIGHT;
        pos.array[i * QP[354] + QP[355]] = y;
    }
    pos.needsUpdate = true;
    rain.position.set(camera.position.x, QP[356], camera.position.z);
     
     
    staticWorldOptimizer?.updateDynamicObject(rain);
}

 
 
 
 
 
 
 
 
 
 
let buildGalleryArtPanel = null;
let buildSignatureSite = null;
let buildSignatureSiteSteps = null;
let signageSystem = null;
const adornmentSystem = createAdornmentSystem({ CONFIG, camera, scene, pick, randRange, rng });
const {
    adornmentLoadQueue,
    failedRealModelLoads,
    failedCityAssetLoads,
    failedPhotoLoads,
    pendingGalleryPanels,
    photoImages,
    placeRealModel,
    placeCityAsset,
    placeSemanticCityAsset,
    semanticCornerPoint,
    placePhotoPoster,
} = adornmentSystem;

function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randRange(min, max) { return min + rng() * (max - min); }
const { jitterGeometry, buildOrganicTowerGeometry } = createOrganicGeometryTools(randRange);

const _weightedPickCache = new WeakMap();
function weightedPick(weights) {
     
     
     
    let cached = _weightedPickCache.get(weights);
    if (!cached) {
        const entries = Object.entries(weights);
        cached = { entries, total: entries.reduce((sum, [, weight]) => sum + weight, QP[524]) };
        _weightedPickCache.set(weights, cached);
    }
    let r = rng() * cached.total;
    for (const [key, w] of cached.entries) {
        r -= w;
        if (r <= QP[525]) return key;
    }
    return cached.entries[cached.entries.length - QP[526]][QP[527]];
}

 
 
 
 
 
const TEXTURE_SUPERSAMPLE = Math.max(CONFIG.maze.cols, CONFIG.maze.rows) >= QP[528]
    ? QP[529]
    : QUALITY === CONFIG.quality.desktop ? QP[530]
        : QUALITY === CONFIG.quality.mobile ? QP[531] : QP[532];
let _pixelTextureCount = 0;
let _pixelTextureTotalMs = 0;
let _pixelTextureMaxMs = 0;
function makePixelTexture(draw, w, h) {
    const _textureStarted = performance.now();
    const canvas = document.createElement('canvas');
    const activeSupersample = _testBootstrapActive ? Math.min(1, TEXTURE_SUPERSAMPLE) : TEXTURE_SUPERSAMPLE;
    canvas.width = Math.max(QP[533], Math.round(w * activeSupersample)); canvas.height = Math.max(QP[534], Math.round(h * activeSupersample));
    const ctx = canvas.getContext('2d');
    ctx.scale(activeSupersample, activeSupersample);
    ctx.imageSmoothingEnabled = true;
    const _allocationDone = performance.now();
    draw(ctx, w, h);
    const _drawDone = performance.now();
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const _textureDone = performance.now();
    const _allocationMs = _allocationDone - _textureStarted;
    const _drawMs = _drawDone - _allocationDone;
    const _constructMs = _textureDone - _drawDone;
    const _textureMs = _textureDone - _textureStarted;
    _pixelTextureCount++;
    _pixelTextureTotalMs += _textureMs;
    _pixelTextureMaxMs = Math.max(_pixelTextureMaxMs, _textureMs);
    runtimeLatency.record('canvas.allocate', _allocationMs, { width: w, height: h, count: _pixelTextureCount });
    runtimeLatency.record('canvas.draw', _drawMs, { width: w, height: h, count: _pixelTextureCount });
    runtimeLatency.record('canvas.texture-construct', _constructMs, { width: w, height: h, count: _pixelTextureCount });
    runtimeLatency.record('canvas.makePixelTexture', _textureMs, { width: w, height: h, count: _pixelTextureCount });
    if (_textureMs > 8) console.warn(`[latency] canvas.makePixelTexture ${_textureMs.toFixed(1)}ms · alloc=${_allocationMs.toFixed(1)} draw=${_drawMs.toFixed(1)} tex=${_constructMs.toFixed(1)} · ${w}x${h} · count=${_pixelTextureCount}`);
    return tex;
}

function hexToCss(hex) { return '#' + hex.toString(QP[535]).padStart(QP[536], '0'); }

function toContent([title, subtitle]) { return { title, subtitle }; }

 
 
let navPageIndex = QP[537];
function pickSignContent(x, z) {
    const weights = { ...CONFIG.billboards.contentWeights };
    if (navPageIndex >= CONFIG.billboards.navPages.length) delete weights.nav;
    const kind = weightedPick(weights);
    switch (kind) {
        case 'nav': return { ...CONFIG.billboards.navPages[navPageIndex++], flicker: false };
        case 'decoy': return { ...toContent(pick(CONFIG.billboards.decoyIdentities)), flicker: false };
         
         
        case 'noise': return { ...toContent(pickRandomizedCuratedPair(CONFIG.billboards.systemNoise, 'system')), flicker: true };
         
         
        case 'data': return { ...toContent(pickCityNoisePair(rng, x, z)), flicker: rng() < QP[538] };
        default: return { ...toContent(pickRandomizedCuratedPair(CONFIG.billboards.flavorWords, 'street')), flicker: false };
    }
}

 
 

 
 
function pickNeonForRow(row) {
    const t = webAlignment(cellToWorld(QP[539], row).z);
    return rng() < t ? pick(CONFIG.neonWarm) : pick(CONFIG.neonCool);
}

 

const GRID_COLS = CONFIG.maze.cols;
const GRID_ROWS = CONFIG.maze.rows;
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
const BLOCK = CONFIG.maze.blockSize;
const STREET = CONFIG.maze.streetWidth;
function axisPitch(i) { return i % QP[540] === QP[541] ? STREET : BLOCK; }
const colSize = Array.from({ length: GRID_COLS }, (_, i) => axisPitch(i));
const rowSize = Array.from({ length: GRID_ROWS }, (_, i) => axisPitch(i));
function prefixEdges(sizes) {
    const edges = [QP[542]];
    for (const s of sizes) edges.push(edges[edges.length - QP[543]] + s);
    return edges;
}
const colEdge = prefixEdges(colSize);  
const rowEdge = prefixEdges(rowSize);
const GRID_W = colEdge[GRID_COLS];
const GRID_H = rowEdge[GRID_ROWS];
function colHalf(c) { return colSize[c] / QP[544]; }
function rowHalf(r) { return rowSize[r] / QP[545]; }

function cellToWorld(col, row) {
    return {
        x: (colEdge[col] + colEdge[col + QP[546]]) / QP[547] - GRID_W / QP[548],
        z: (rowEdge[row] + rowEdge[row + QP[549]]) / QP[550] - GRID_H / QP[551],
    };
}

 
 
 
 
function containingEdgeIndex(edges, value) {
     
     
    let lo = QP[552], hi = edges.length - QP[553];
    while (lo < hi) {
        const mid = (lo + hi) >> QP[554];
        if (value < edges[mid]) hi = mid;
        else lo = mid + QP[555];
    }
    return Math.max(QP[556], Math.min(edges.length - QP[557], lo - QP[558]));
}
function worldToCellIndex(x, z) {
    const wx = x + GRID_W / QP[559], wz = z + GRID_H / QP[560];
    return { col: containingEdgeIndex(colEdge, wx), row: containingEdgeIndex(rowEdge, wz) };
}

 
 
 

 
 
 
 
 
 
const WINDOW_TEXTURE_VARIANTS = QP[581];
const _windowTextureCache = new Map();
function hashString32(text) {
    let h = QP[582] >>> QP[583];
    for (let i = QP[584]; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, QP[585]); }
    return h >>> QP[586];
}
function localRng(seed) {
    let a = seed >>> QP[587];
    return () => {
        a = (a + QP[588]) >>> QP[589];
        let t = a;
        t = Math.imul(t ^ (t >>> QP[590]), t | QP[591]);
        t ^= t + Math.imul(t ^ (t >>> QP[592]), t | QP[593]);
        return ((t ^ (t >>> QP[594])) >>> QP[595]) / QP[596];
    };
}

function createStableStreamingRngStepper(key, iteratorFactory) {
    const local = localRng(hashString32(`${SEED}:stream:${key}`));
    const scoped = (work) => {
        const previous = _rngSource;
        _rngSource = local;
        try {
            return work();
        } finally {
            _rngSource = previous;
        }
    };
    const iterator = scoped(iteratorFactory);
    return Object.freeze({ step: () => scoped(() => iterator.next()) });
}
function makeWindowGridTexture(height, baseColorHex, litRatio = QP[597]) {
    const floorH = randRange(QP[598], QP[599]);
    const rows = Math.max(QP[600], Math.min(QP[601], Math.round(height / floorH)));
    const cols = QP[602] + Math.floor(rng() * QP[603]);

     
     
    let rollHash = QP[604] >>> QP[605];
    const fold = (v) => { rollHash ^= Math.floor(v * QP[606]) >>> QP[607]; rollHash = Math.imul(rollHash, QP[608]) >>> QP[609]; return v; };
    for (let r = QP[610]; r < rows; r++) {
        for (let c = QP[611]; c < cols; c++) {
            const lit = fold(rng()) < litRatio;
            if (!lit) fold(rng());
            fold(rng());  
        }
    }

     
     
     
    const visualRows = rows <= QP[612] ? QP[613] : rows <= QP[614] ? QP[615] : rows <= QP[616] ? QP[617] : rows <= QP[618] ? QP[619] : QP[620];
    const litBand = Math.max(QP[621], Math.min(QP[622], Math.round(litRatio * QP[623]) / QP[624]));
    const variant = rollHash % WINDOW_TEXTURE_VARIANTS;
    const key = `${baseColorHex}|${visualRows}|${cols}|${litBand.toFixed(QP[625])}|${variant}`;
    const cached = _windowTextureCache.get(key);
    if (cached) return cached;

    const cellW = QP[626], cellH = QP[627];
    const base = hexToCss(baseColorHex);
    const vrng = localRng(hashString32(key));
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(QP[628], QP[629], w, h);
        for (let r = QP[630]; r < visualRows; r++) {
            const py = h - (r + QP[631]) * cellH;
            for (let c = QP[632]; c < cols; c++) {
                const px = c * cellW;
                const lit = vrng() < litBand;
                ctx.fillStyle = lit ? '#ffdf8c' : (vrng() < QP[633] ? '#232c38' : '#171d26');
                ctx.fillRect(px + QP[634], py + QP[635], cellW - QP[636], cellH - QP[637]);
                if (vrng() < QP[638]) {
                    ctx.fillStyle = '#7d8288';
                    ctx.fillRect(px + QP[639], py + cellH - QP[640], cellW - QP[641], QP[642]);
                }
            }
        }
    }, cols * cellW, visualRows * cellH);
    _windowTextureCache.set(key, tex);
    return tex;
}

 
 
 
const _buildingFacadeMaterialCache = new Map();
function sharedBuildingFacadeMaterial({ map = null, color = null } = {}) {
    const key = map ? `map:${map.uuid}` : `color:${color}`;
    let material = _buildingFacadeMaterialCache.get(key);
    if (!material) {
        material = new THREE.MeshStandardMaterial({
            ...(map ? { map } : { color }),
            roughness: CONFIG.buildings.roughness,
            side: THREE.DoubleSide,
        });
        _buildingFacadeMaterialCache.set(key, material);
    }
    return material;
}

function makeGroundTexture() {
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0c0808';
        ctx.fillRect(QP[692], QP[693], w, h);
         
        for (let i = QP[694]; i < QP[695]; i++) {
            const shade = QP[696] + Math.floor(rng() * QP[697]);
            ctx.fillStyle = `rgb(${shade + QP[698]},${shade},${shade + QP[699]})`;
            ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), QP[700], QP[701]);
        }
         
        ctx.strokeStyle = '#1c1414';
        ctx.lineWidth = QP[702];
        for (let i = QP[703]; i <= w; i += QP[704]) {
            ctx.beginPath(); ctx.moveTo(i, QP[705]); ctx.lineTo(i, h); ctx.stroke();
        }
        for (let i = QP[706]; i <= h; i += QP[707]) {
            ctx.beginPath(); ctx.moveTo(QP[708], i); ctx.lineTo(w, i); ctx.stroke();
        }
    }, QP[709], QP[710]);
}

const groundTex = makeGroundTexture();
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(GRID_COLS * QP[711], GRID_ROWS * QP[712]);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_W, GRID_H),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: QP[713] })
);
ground.rotation.x = -Math.PI / QP[714];
// Retired authored-origin ground. Kept as an unmounted texture/material donor
// for legacy helper code only; the visible origin surface comes from chunk 0,0.

 
 
 
 
 

const mazePlan = createSpawnMazePlan({ GRID_COLS, GRID_ROWS, rng });
const { grid, startCol, startRow, spawnCol, spawnRow, plazaCells, allOpenCells, openNeighborCount } = mazePlan;
console.log(`[gen] maze grid ready at ${bootElapsed()}: ${GRID_COLS}x${GRID_ROWS} cells, ${allOpenCells.length} open, ${plazaCells.length} plazas, spawn=(${spawnCol},${spawnRow})`);
bootStatus(`maze carved (${allOpenCells.length} open cells) -- building the city…`);
{
    const _testSpawn = cellToWorld(spawnCol, spawnRow);
    camera.position.set(_testSpawn.x, CONFIG.camera.eyeHeight, _testSpawn.z);
    _testTopologyReady = true;
    _testBootstrapHasMoved = false;
}
await testYieldNow('maze ready · streaming real buildings', 0, 0);
const sitePlan = createSpawnBuildingSitePlan({
    GRID_COLS, GRID_ROWS, grid, startCol, startRow, SEED, rng, pick, weightedPick, cellToWorld, colHalf, rowHalf,
});
const { siteIdOf, buildingSites, SIGNATURE_TYPES, signatureInstances, cellEdgeKind } = sitePlan;

const skirtBoxGeo = new THREE.BoxGeometry(QP[874], QP[875], QP[876]);
 
 
 
const unitPlaneGeo = new THREE.PlaneGeometry(QP[877], QP[878]);
 
const sharedBenchMaterial = new THREE.MeshStandardMaterial({ color: QP[879], roughness: QP[880] });
 

 
 
 
const footprintOf = [];
for (let r = QP[946]; r < GRID_ROWS; r++) footprintOf.push(new Array(GRID_COLS).fill(null));

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
const buildingWallSegments = new Map();
const WALL_THICKNESS = QP[947];

 
 
 
 
 
 
 

 
 
 
const elevatedPlatforms = [];  
 
 
 
 
const rooftopDecks = [];  
const rampRuns = [];  
 
 
 
 
const overheadCeilings = [];
function flushHorizontalPlaneBatches() {
    // All building plates are now emitted by KowloonFabricEngine. This legacy
    // summary hook intentionally has no separate batch authority.
    return { draws: 0, instances: 0, unifiedFabric: true };
}
function addDebugRectOutline(cx, cz, hwx, hwz, y, color) {
    const pts = [
        new THREE.Vector3(cx - hwx, y, cz - hwz),
        new THREE.Vector3(cx + hwx, y, cz - hwz),
        new THREE.Vector3(cx + hwx, y, cz + hwz),
        new THREE.Vector3(cx - hwx, y, cz + hwz),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color })));
}

const facadeLayoutSystem = createFacadeLayoutSystem({
    GRID_COLS, GRID_ROWS, GRID_W, GRID_H, STREET, grid,
    cellEdgeKind, cellToWorld, colEdge, colHalf, rowEdge, rowHalf, worldToCellIndex,
    pick, pickNeonForRow, pickSignContent, randRange, rng,
    addSign: (...args) => signageSystem.addSign(...args),
});
const {
    buildingFacades,
    exteriorDecorationVolumes,
    exteriorDecorationVolumeIndex,
    makeFacade,
    facadeBlocks,
    facadeFits,
    facadeReserve,
    findFreeFacadeRect,
    solidClearanceAhead,
    safeBladeProjectionDepth,
    fitBladeDimensions,
    createSignSpec,
    placeSignsOnFacade,
    placeSignsOnFacadeSteps,
    edgeKindForSite,
    kindForSide,
    facadeTangent,
    pointOnFacade,
    makeProjectionBox,
    projectionFits,
    reserveProjectionVolume,
} = facadeLayoutSystem;


const candidateFaces = [];  
 
 
 
// Street/junk batching remains a cosmetic performance concern. Structural
// geometry is owned exclusively by KowloonFabricEngine.
const JUNK_RENDER_CHUNK_SIZE = QP[1011];

const {
    addPottedPlant,
    scatterJunk,
    pileJunkCluster,
    JUNK_RENDER_CHUNK,
    propColliders,
    propCandidatesNear,
} = createStreetPropsSystem({
    JUNK_RENDER_CHUNK_SIZE,
    scene,
    getStaticWorldOptimizer: () => staticWorldOptimizer,
    jitterGeometry,
    laneOffset,
    pick,
    randRange,
    rng,
});
// Unified building geometry is the only inter-site collision authority.
// Synthetic maze-seal walls/fence planes are intentionally gone: if there is
// visible clearance between neighboring buildings, the player may use it.
console.log('[testing] maze topology: synthetic inter-site seal walls retired; visible unified fabric defines passage collision');
signageSystem = createSignageSystem({
    CONFIG,
    QUALITY,
    candidateFaces,
    signatureInstances,
    scene,
    takeDynamicLight,
    findFreeFacadeRect,
    fitBladeDimensions,
    hexToCss,
    jitterGeometry,
    makePixelTexture,
    pick,
    pickRandomizedGraffitiTag,
    pileJunkCluster,
    placePhotoPoster,
    pointOnFacade,
    randRange,
    rng,
    safeBladeProjectionDepth,
    skirtBoxGeo,
    unitPlaneGeo,
});
const {
    addSign,
    addGraffitiTag,
    addSecurityCamera,
    addRooftopClutter,
    mountStandoffPanel,
    addWallPoster,
    addTerminalPlaque,
    mountContentCards,
    mountContentCardSteps,
    flickerLights,
} = signageSystem;
adornmentSystem.setStandoffPanelMounter(mountStandoffPanel);

const {
    buildCourtyardVoid, addSiteDebugOverlay, addFacadeDebugOverlay, addSignatureDebugOverlay, streetSetbackRoll,
} = createAuthoredContentHelpers({
    CONFIG, STREET, DEBUG_FACADES, DEBUG_FOOTPRINTS, DEBUG_SIGNATURES,
    scene, buildingFacades, exteriorDecorationVolumes, signatureInstances,
    pointOnFacade, cellToWorld, colHalf, rowHalf, addDebugRectOutline,
    makePixelTexture, addPottedPlant, addBench, scatterJunk,
    randRange, rng, takeDynamicLight,
    publishSurfacePatch: patch => {
        if (!cityFabricEngine) throw new Error('KowloonFabricEngine not initialized before reserved courtyard publication');
        const payload = cityFabricEngine.buildAuthoredSurfacePatch({ ...patch, ownerId: `spawn-content-surface:${SEED}:${patch.patchKey}` });
        cityFabricEngine.commit({ key: `spawn-content-surface:${patch.patchKey}` }, payload);
        return payload;
    },
});

let activeUnifiedSignatureSite = null;
let signatureContentSiteSteps = null;

function runWithUnifiedSignatureSite(site, work) {
    const previous = activeUnifiedSignatureSite;
    activeUnifiedSignatureSite = site;
    try {
        return work();
    } finally {
        activeUnifiedSignatureSite = previous;
    }
}

function* unifiedSignatureModuleAdapterSteps(cell, opts = {}) {
    const site = activeUnifiedSignatureSite;
    const payload = site ? unifiedSpawnFabricPayloads.get(site.id) : null;
    const entity = payload?.entity;
    if (!site || !entity) throw new Error('signature content recipe requested module metadata before unified fabric shell existed');
    const moduleKey = `${cell.col},${cell.row}`;
    const module = entity.footprintModules?.find(candidate => candidate.key === moduleKey);
    if (!module) throw new Error(`unified signature fabric missing module ${moduleKey} for site ${site.id}`);
    const legacyFacadeKey = `${cell.row},${cell.col}`;
    const streetFacades = buildingFacades.filter(facade =>
        facade.userData?.siteId === site.id && facade.moduleKey === legacyFacadeKey && facade.exposure === 'street'
    );
    const rect = {
        cx: module.cx, cz: module.cz, hwx: module.halfX, hwz: module.halfZ,
        height: module.floors * entity.floorH, floorCount: module.floors, floorHeight: entity.floorH,
        streetFacades, unifiedFabric: true, edgeKinds: opts.edgeKinds || null,
    };
    yield { phase: 'signature-unified-module-ref', row: cell.row, col: cell.col, moduleKey };
    return rect;
}

({ buildSignatureSiteSteps: signatureContentSiteSteps, buildGalleryArtPanel } = createSignatureBuildingSystem({
    CONFIG,
    QUALITY,
    scene,
    pendingGalleryPanels,
    photoImages,
    takeDynamicLight,
    addBench,
    addBuildingModuleSteps: unifiedSignatureModuleAdapterSteps,
    addPottedPlant,
    addSign,
    addSiteDebugOverlay,
    addTerminalPlaque,
    addWallPoster,
    buildCourtyardVoid,
    cellToWorld,
    colHalf,
    findFreeFacadeRect,
    jitterGeometry,
    makePixelTexture,
    makeWindowGridTexture,
    mountStandoffPanel,
    pick,
    pickRandomizedCuratedPair,
    placeCityAsset,
    placeSemanticCityAsset,
    pointOnFacade,
    randRange,
    rng,
    rowHalf,
    sharedBuildingFacadeMaterial,
    siteIdOf,
    streetSetbackRoll,
    exteriorCompositionOwned: true,
}));
adornmentSystem.setGalleryPanelBuilder(buildGalleryArtPanel);

const animatedMaterials = new Set();
staticWorldOptimizer = createProgressiveStaticWorldOptimizer({
    THREE,
    scene,
    camera,
    rawSceneAdd: _origSceneAdd,
    drawDistance: QUALITY.drawDistance,
    chunkSize: JUNK_RENDER_CHUNK,
    dynamicRoots: new Set([rain]),
    dynamicMaterials: animatedMaterials,
    mergeMinMeshes: QP[5424],
    mergeMaxVertices: QP[5425],
    onChunkOptimized: ({ ms, key, sourceMeshes, mergedMeshes, drawCallsSaved }) => {
        runtimeLatency.record('optimizer.chunk-step', ms, { key, sourceMeshes, mergedMeshes, drawCallsSaved });
        if (ms > 8) console.warn(`[latency] optimizer.chunk-step ${ms.toFixed(1)}ms · ${key} · ${sourceMeshes}->${mergedMeshes} · saved=${drawCallsSaved}`);
    },
});
staticWorldOptimizer.beginIncremental();
for (const root of [...scene.children]) {
    if (!root.userData?.__perfChunkGroup && !root.userData?.worldChunkRoot) staticWorldOptimizer.registerLateObject(root);
}
staticWorldOptimizer.updateVisibility(true);

const STREAM_CHUNK_SIZE = Math.max(GRID_W, GRID_H);
let worldChunkStreamer = null;
let cityFabricEngine = null;
let _spawnDistrictStructuresComplete = false;
let authoredCompletedSiteIds = null;
let authoredStructuralReadySiteIds = null;
function worldToCell(x, z) {
    return worldToCellIndex(x, z);
}
const PHYSICS_TUNING = {
    bodyHeight: CONFIG.camera.eyeHeight + QP[5303],
    headClearance: QP[5304],
    maxStepHeight: QP[5305],
    stepDownTolerance: QP[5306],
    jumpSpeed: QP[5307],
    gravity: QP[5308],
    maxFallSpeed: QP[5309],
    coyoteTime: QP[5310],
    jumpBufferTime: QP[5311],
    maxSubstepSeconds: QP[5312] / QP[5313],
    maxHorizontalSubstep: Math.max(QP[5314], CONFIG.camera.playerRadius * QP[5315]),
    maxVerticalSubstep: QP[5316],
    maxSubsteps: QP[5317],
};
playerPhysics = createPlayerPhysics({
    position: camera.position,
    eyeHeight: CONFIG.camera.eyeHeight,
    playerRadius: CONFIG.camera.playerRadius,
    wallThickness: WALL_THICKNESS,
    worldToCell,
    grid,
    buildingWallSegments,
    propColliders,
    elevatedPlatforms,
    rampRuns,
    overheadCeilings,
    boundsHalf: Infinity,
    ...PHYSICS_TUNING,
});
console.log(`[stream-perf] full player physics active during authored construction at ${bootElapsed()}`);

const cooperativeFabricBuildYield = createCooperativeBuildYield({
    budgetMs: WORLD_BUILD_BUDGET_MS,
    warnUnitMs: Math.max(12, WORLD_BUILD_BUDGET_MS * 2),
    label: 'fabric-build',
});
const cooperativeStreamerYield = createCooperativeBuildYield({
    budgetMs: WORLD_BUILD_BUDGET_MS,
    warnUnitMs: Math.max(12, WORLD_BUILD_BUDGET_MS * 2),
    label: 'streamer',
});
if (typeof window !== 'undefined') {
    window.__worldBuildSchedulers = Object.freeze({
        fabric: cooperativeFabricBuildYield,
        streamer: cooperativeStreamerYield,
    });
}
console.log(`[generation-profile] runtime=${GENERATION_PROFILE_NAME} broad=${GENERATION_LANES.broadStrokesOnly ? 'ON' : 'OFF'} budget=${WORLD_BUILD_BUDGET_MS.toFixed(1)}ms`);

// ONE CITY-FABRIC ENGINE. Chunk 0,0 is intentionally not a spawn species: it is
// built, committed, enriched, hidden/shown, and unloaded by the same path as any
// other streamed coordinate. "Spawn" is only a player-placement + TV-refuge step
// after the ordinary chunk exists.
cityFabricEngine = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: _origSceneAdd, chunkSize: STREAM_CHUNK_SIZE, worldSeed: SEED,
    landmarkSpacingChunks: CONFIG.streaming.landmarkSpacingChunks,
    yieldControl: cooperativeFabricBuildYield,
    gameplayTraversalProfile: {
        playerRadius: CONFIG.camera.playerRadius,
        bodyHeight: PHYSICS_TUNING.bodyHeight,
        maxStep: PHYSICS_TUNING.maxStepHeight,
        jumpSpeed: PHYSICS_TUNING.jumpSpeed,
        gravity: PHYSICS_TUNING.gravity,
        horizontalSpeed: CONFIG.movement.speed,
        sprintMultiplier: CONFIG.movement.sprintMultiplier,
    },
});
const _worldStreamHeading = new THREE.Vector3();
// Keep the player capsule well clear while the first ordinary chunk publishes.
// This avoids staging the chunk merely because the pre-spawn camera happened to
// overlap deterministic geometry at 0,0. Spawn proof below uses ground-relative
// feetY=0 and immediately moves the player to a real supported pose.
if (!_testBootstrapHasMoved) camera.position.set(0, 512 + CONFIG.camera.eyeHeight, 0);
worldChunkStreamer = createWorldChunkStreamer({
    chunkSize: STREAM_CHUNK_SIZE,
    worldSeed: SEED,
    getPlayerPosition: () => camera.position,
    getPlayerHeading: () => camera.getWorldDirection(_worldStreamHeading),
    renderRadiusChunks: CONFIG.streaming.renderRadiusChunks,
    prefetchRadiusChunks: CONFIG.streaming.prefetchRadiusChunks,
    retentionRadiusChunks: CONFIG.streaming.retentionRadiusChunks,
    pinnedChunkKeys: [],
    weirdness: { startRadius: 1.5, fullRadius: 36, curve: 1.3 },
    buildChunk: chunk => cityFabricEngine.build(chunk),
    commitChunk: (chunk, payload) => cityFabricEngine.commit(chunk, payload),
    setChunkVisibility: (chunk, payload, visible) => cityFabricEngine.setVisible(chunk, payload, visible),
    verifyChunkReady: (chunk, payload, visible) => cityFabricEngine.verifyReady(chunk, payload, visible),
    refineChunk: (chunk, payload, budget) => cityFabricEngine.refine(chunk, payload, budget),
    hasPendingRefinement: (chunk, payload) => cityFabricEngine.hasPendingRefinement(chunk, payload),
    refineAfterPrefetchReady: false,
    minimumVisibleRefinementTurns: QUALITY === CONFIG.quality.desktop
        ? CONFIG.streaming.visibleDetailFloorDesktop
        : CONFIG.streaming.visibleDetailFloorWeak,
    unloadChunk: (chunk, payload) => cityFabricEngine.unload(chunk, payload),
    yieldControl: cooperativeStreamerYield,
    onChunkState: (chunk, state) => {
        if (state === 'ready' || state === 'unloaded') {
            console.log(`[world] chunk ${chunk.key} ${state} · weirdness=${chunk.weirdness.sampled.toFixed(3)}`);
        }
    },
});
const initialSpawnChunk = await worldChunkStreamer.buildSpawnChunk();
worldChunkStreamer.ensureNeighborhood();
playerPhysics.syncDynamicWorld();
const initialSpawnFabricPayloads = new Map([[initialSpawnChunk.key, initialSpawnChunk.payload]]);
const requestedSpawnPose = { x: 0, z: 0, feetY: 0 };
const spawnProof = provePlayableSpawn({
    playerPhysics,
    origin: requestedSpawnPose,
    fabricPayloads: initialSpawnFabricPayloads,
    // Ordinary chunks are large enough that a safe roof need not sit right on the
    // chunk center. Search broadly, but only inside already-committed physics.
    searchRadius: Math.min(28, STREAM_CHUNK_SIZE * 0.42),
});
if (!spawnProof.ok) {
    throw new Error(`[spawn-proof] refused unplayable ordinary-chunk spawn: ${spawnProof.reason}; candidates=${spawnProof.searchedCandidates}; probes=${spawnProof.probes}; best=${spawnProof.bestDistance?.toFixed?.(2) ?? 'n/a'}m`);
}
camera.position.set(spawnProof.pose.x, spawnProof.pose.feetY + CONFIG.camera.eyeHeight, spawnProof.pose.z);
playerPhysics.syncFromPosition({ forceAirborne: false, resetVelocity: false, allowLastSafeFallback: false });
if (!playerPhysics.poseIsValid(camera.position.x, camera.position.z, playerPhysics.getState().feetY)) {
    throw new Error('[spawn-proof] proven ordinary-chunk pose became invalid during authoritative startup sync');
}
const spawnRealization = spawnProof.location?.spatialPlan?.ready
    ? realizeSpawnLocation({
        THREE,
        scene,
        camera,
        boundLocation: spawnProof.location,
        fabricPayloads: initialSpawnFabricPayloads,
        propColliders,
    })
    : null;
if (!spawnRealization) {
    throw new Error('[spawn-location] ordinary spawn chunk was playable but the required TV refuge could not be realized on its fabric');
}
if (spawnRealization.colliderCount) {
    playerPhysics.syncDynamicWorld();
    if (!playerPhysics.poseIsValid(camera.position.x, camera.position.z, playerPhysics.getState().feetY)) {
        throw new Error('[spawn-location] TV refuge realization violated the proven arrival capsule');
    }
}
console.log(`[spawn-proof] PASS ordinary chunk=${initialSpawnChunk.key} · route=${spawnProof.routeKind} · TV=ready · escape=${spawnProof.escapeDistance.toFixed(2)}m · probes=${spawnProof.probes}`);
_spawnDistrictStructuresComplete = true;

// The finite authored origin district is retired. Keep these empty compatibility
// collections only for old diagnostics/dev tools that still inspect them; no
// authored shell, bridge plan, ceiling overlay, plaza admission, or ground patch
// participates in runtime generation anymore.
const authoredFabricRelationshipPlan = Object.freeze({ bridgePlans: [], bridgePortalsBySite: new Map() });

const unifiedSpawnFabricPayloads = new Map();
const unifiedSpawnRelationshipPayloads = [];
const unifiedSpawnFabricRefinementQueue = [];
let unifiedSpawnFabricExposedSetbackFaces = QP[1015];

function registerUnifiedSpawnFabricSite(site, payload) {
    const entity = payload?.entity;
    if (!entity) return;
    unifiedSpawnFabricPayloads.set(site.id, payload);
    unifiedSpawnFabricRefinementQueue.push(payload);
    unifiedSpawnFabricExposedSetbackFaces += entity.exposedSetbackFaces ?? QP[1015];

    const moduleByKey = new Map((entity.footprintModules || []).map(module => [module.key, module]));
    for (const module of entity.footprintModules || []) {
        const [col, row] = module.key.split(',').map(Number);
        if (!footprintOf[row]) continue;
        footprintOf[row][col] = {
            cx: module.cx, cz: module.cz, hwx: module.halfX, hwz: module.halfZ,
            height: module.floors * entity.floorH, floorCount: module.floors,
        };
        // Preserve the authored registries consumed by validation and singular/post
        // passes without duplicating collision.  Physics authority lives in the
        // Kowloon fabric owner is published only by the shared atomic commit().
        buildingWallSegments.set(`${row},${col}`, {
            unifiedFabric: true,
            floors: Array.from({ length: module.floors }, (_, floor) => ({
                yMin: floor * entity.floorH, yMax: (floor + QP[1024]) * entity.floorH, segments: [],
            })),
        });
        rooftopDecks.push({
            x: module.cx, z: module.cz, hx: module.halfX, hz: module.halfZ,
            y: module.floors * entity.floorH, buildingKey: `${row},${col}`, unifiedFabric: true,
        });
    }

    // Rehydrate the old facade registry from the new shared structural faces.
    // This keeps authored signage/content-card/relationship systems as consumers
    // while removing their dependency on the legacy ordinary geometry builder.
    const facadeGroups = new Map();
    for (const face of entity.facades || []) {
        const key = `${face.moduleKey}:${face.side}:${face.exposure || 'street'}`;
        const existing = facadeGroups.get(key);
        if (existing) {
            existing.yMin = Math.min(existing.yMin, face.yMin);
            existing.yMax = Math.max(existing.yMax, face.yMax);
        } else facadeGroups.set(key, { ...face });
    }
    for (const face of facadeGroups.values()) {
        const module = moduleByKey.get(face.moduleKey);
        if (!module) continue;
        const [col, row] = face.moduleKey.split(',').map(Number);
        const dir = face.side === 'north' ? { dx: QP[1015], dz: -QP[1024] }
            : face.side === 'south' ? { dx: QP[1015], dz: QP[1024] }
                : face.side === 'west' ? { dx: -QP[1024], dz: QP[1015] }
                    : { dx: QP[1024], dz: QP[1015] };
        const isEntranceFace = (entity.entranceFaces || []).some(entrance =>
            entrance.moduleKey === face.moduleKey && entrance.side === face.side
        );
        const facade = makeFacade(
            { cx: module.cx, cz: module.cz, hwx: module.halfX, hwz: module.halfZ },
            dir.dx, dir.dz, face.yMin, face.yMax, isEntranceFace ? dir : null, face.exposure || 'street', `${row},${col}`
        );
        facade.userData = { ...(facade.userData || {}), unifiedFabric: true, siteId: site.id };
        buildingFacades.push(facade);
        candidateFaces.push(facade);
    }
}

function* buildUnifiedKowloonSiteSteps(site) {
    yield { phase: 'unified-fabric-ready', siteId: site.id };
    const payload = yield* cityFabricEngine.buildAuthoredSiteSteps({
        site, siteIdOf, grid, cellToWorld, colHalf, rowHalf,
        ownerId: `spawn-fabric:${SEED}:${site.id}`,
        weirdness: Math.max(CONFIG.maze.loopChance, CONFIG.narrative.darkWeb.signChance),
        bridgePortalsBySite: authoredFabricRelationshipPlan.bridgePortalsBySite,
    });
    if (!payload) return [];
    cityFabricEngine.commit(payload.chunk, payload);
    registerUnifiedSpawnFabricSite(site, payload);
    yield {
        phase: 'unified-fabric-structure', siteId: site.id,
        modules: payload.entity.moduleCount, floors: payload.entity.floors,
        serviceCages: payload.entity.serviceCages, scaffoldLandings: payload.entity.scaffoldLandings,
    };
    return payload.entity.footprintModules || [];
}

function signatureFabricProfile(site) {
    const type = site.signatureType;
    const preferred = CONFIG.signatureBuildings[type]?.preferredFloors ?? 2;
    const floors = type === 'artGallery' ? 2
        : type === 'as400Archive' ? Math.max(3, Math.min(4, preferred))
            : type === 'justinIndex' ? Math.max(4, Math.min(6, preferred))
                : type === 'systemsWorkshop' ? Math.max(2, Math.min(3, preferred))
                    : type === 'loreShrine' ? Math.max(2, Math.min(4, preferred))
                        : Math.max(1, preferred);
    const typeCfg = CONFIG.signatureBuildings[type] ?? {};
    const floorCountByCell = Object.fromEntries(site.cells.map(cell => [`${cell.col},${cell.row}`, floors]));
    const entrances = [site.signatureInstance?.mainEntrance, site.signatureInstance?.secondaryEntrance]
        .filter(Boolean)
        .map(entrance => ({ col: entrance.cell.col, row: entrance.cell.row, dc: entrance.dc, dr: entrance.dr }));
    return {
        primaryFloors: floors, floorHeight: 3, floorCountByCell, entrances,
        archetype: type === 'systemsWorkshop' ? 'workshop-warehouse'
            : type === 'as400Archive' || type === 'justinIndex' ? 'vertical-stack'
                : 'service-tenement',
        courtyardCell: null,
        suppressInteriorClutter: true,
        suppressMezzanines: true,
        singularRecipe: type,
        exteriorCompositionOwned: true,
        exteriorIdentity: {
            title: typeCfg.exteriorName ?? String(type).toUpperCase(),
            subtitle: typeCfg.exteriorSubtitle ?? '',
            semanticFamily: 'signage',
            priorityTier: 'identity',
        },
        exteriorMacroPreference: type === 'as400Archive'
            ? { roofSemanticFamily: 'roof-antenna', facadeSemanticFamily: 'vertical-mechanical' }
            : null,
    };
}

function* maybeSignatureContentSteps(site) {
    if (!GENERATION_LANES.signatureContent) {
        yield {
            phase: 'signature-content-skipped-broad-strokes',
            siteId: site.id,
            type: site.signatureType,
            generationProfile: GENERATION_PROFILE_NAME,
        };
        return;
    }
    yield* maybeSignatureContentSteps(site);
}


function* buildUnifiedSignatureSiteSteps(site) {
    // RESERVED is intentionally an empty singular parcel. It has no alternate
    // building engine because it has no building at all; its recipe owns only
    // courtyard/marker content.
    if (site.signatureType === 'futurePlaceholder') {
        yield { phase: 'signature-empty-parcel-ready', siteId: site.id, type: site.signatureType };
        activeUnifiedSignatureSite = site;
        try {
            yield* signatureContentSiteSteps(site);
        } finally {
            activeUnifiedSignatureSite = null;
        }
        return;
    }

    const payload = yield* cityFabricEngine.buildAuthoredSiteSteps({
        site, siteIdOf, grid, cellToWorld, colHalf, rowHalf,
        ownerId: `spawn-singular-fabric:${SEED}:${site.id}`,
        weirdness: Math.max(CONFIG.maze.loopChance, CONFIG.narrative.darkWeb.signChance),
        structureProfile: signatureFabricProfile(site),
        bridgePortalsBySite: authoredFabricRelationshipPlan.bridgePortalsBySite,
    });
    if (!payload) throw new Error(`unified fabric failed to build singular site ${site.id}`);
    payload.singularRecipe = site.signatureType;
    cityFabricEngine.commit(payload.chunk, payload);
    registerUnifiedSpawnFabricSite(site, payload);
    yield {
        phase: 'signature-unified-shell', siteId: site.id, type: site.signatureType,
        modules: payload.entity.moduleCount, floors: payload.entity.floors, renderAuthority: payload.root.userData.renderAuthority,
    };

    yield* maybeSignatureContentSteps(site);
}

buildSignatureSiteSteps = buildUnifiedSignatureSiteSteps;
buildSignatureSite = (site) => {
    const iterator = buildUnifiedSignatureSiteSteps(site);
    let step = iterator.next();
    while (!step.done) step = iterator.next();
    return step.value;
};

function sortUnifiedSpawnFabricRefinementNearPlayer() {
    unifiedSpawnFabricRefinementQueue.sort((a, b) => {
        const ae = a?.entity, be = b?.entity;
        const ax = ae?.x ?? a?.chunk?.centerX ?? 0, az = ae?.z ?? a?.chunk?.centerZ ?? 0;
        const bx = be?.x ?? b?.chunk?.centerX ?? 0, bz = be?.z ?? b?.chunk?.centerZ ?? 0;
        const adx = ax - camera.position.x, adz = az - camera.position.z;
        const bdx = bx - camera.position.x, bdz = bz - camera.position.z;
        return (adx * adx + adz * adz) - (bdx * bdx + bdz * bdz)
            || String(a?.chunk?.key ?? '').localeCompare(String(b?.chunk?.key ?? ''));
    });
}

function pumpUnifiedSpawnFabricRefinement({ maxSteps = QP[1024], maxMillis = QP[1] } = {}) {
    if (!unifiedSpawnFabricRefinementQueue.length) return { steps: QP[1015], pending: QP[1015], ms: QP[1015] };
    const started = performance.now();
    let steps = QP[1015];
    let cursorGuard = unifiedSpawnFabricRefinementQueue.length;
    while (unifiedSpawnFabricRefinementQueue.length && steps < maxSteps && cursorGuard-- > QP[1015]) {
        // Re-rank every turn so the site beside the player can actually converge
        // instead of receiving one turn and rotating behind every other spawn site.
        sortUnifiedSpawnFabricRefinementNearPlayer();
        const payload = unifiedSpawnFabricRefinementQueue.shift();
        const result = cityFabricEngine.refine(payload.chunk, payload, { maxSteps: QP[1024], maxMillis });
        steps += result.steps || QP[1015];
        if (!result.complete) unifiedSpawnFabricRefinementQueue.push(payload);
        if (performance.now() - started >= maxMillis) break;
    }
    return { steps, pending: unifiedSpawnFabricRefinementQueue.length, ms: performance.now() - started };
}

function shouldMarkBootstrapSpeculativeVisualPhase(site, phase) {
    if (!phase) return false;
    if (!site.signatureType) return phase === 'facade-sign' || phase === 'facade-signs';
    if (phase === 'floor' || phase === 'rooftop' || phase.endsWith('-module') || phase === 'signature-futurePlaceholder') return false;
    return phase !== 'complete';
}

function markBootstrapSpeculativeVisualRoots(roots, phase = '') {
    let marked = 0;
    for (const root of roots) {
        root?.traverse?.(obj => {
            if (!(obj.isMesh || obj.isLine || obj.isPoints || obj.isSprite) || !obj.visible) return;
            // Visual candidates are allowed to be seen before later arbitration.
            // If a later step replaces or removes them, that visible correction is
            // intentional computational texture; traversal/physics authority is not speculative.
            obj.userData.__bootstrapSpeculativeVisual = true;
            obj.userData.__bootstrapSpeculativePhase = String(phase || '');
            marked++;
        });
    }
    return marked;
}

function buildingSiteDistanceSqToPlayer(site) {
    let best = Infinity;
    for (const cell of site.cells) {
        const pos = cellToWorld(cell.col, cell.row);
        const dx = pos.x - camera.position.x, dz = pos.z - camera.position.z;
        best = Math.min(best, dx * dx + dz * dz);
    }
    return best;
}

const authoredBuildStart = performance.now();
_testGenerationTotal = QP[1015];
_testGenerationDone = QP[1015];
const authoredBuildingJobs = [];
authoredCompletedSiteIds = new Set();
authoredStructuralReadySiteIds = new Set();
const authoredFailedSiteIds = new Set();
let authoredSchedulerTurns = QP[1015];
let authoredStructuralSyncs = QP[1015];
const authoredBuildingsResolve = () => {};
const authoredBuildingsCompletePromise = Promise.resolve();
let authoredBuildingsResolved = true;
let authoredCeilingOverlayComplete = true;
let authoredCeilingOverlayPayload = null;

function collectMinimumSafeAuthoredSiteIds() {
    const wanted = new Set();
    const visited = new Set();
    const queue = [{ c: spawnCol, r: spawnRow, depth: QP[1015] }];
    const maxDepth = QP[4];
    while (queue.length) {
        const cur = queue.shift();
        const key = `${cur.c},${cur.r}`;
        if (visited.has(key)) continue;
        visited.add(key);
        for (const [dc, dr] of [[QP[1024], QP[1015]], [-QP[1024], QP[1015]], [QP[1015], QP[1024]], [QP[1015], -QP[1024]]]) {
            const nc = cur.c + dc, nr = cur.r + dr;
            if (nr < QP[1015] || nr >= GRID_ROWS || nc < QP[1015] || nc >= GRID_COLS) continue;
            const siteId = siteIdOf[nr]?.[nc] ?? QP[775];
            if (siteId >= QP[1015]) {
                wanted.add(siteId);
                continue;
            }
            if (cur.depth < maxDepth && grid[nr]?.[nc] === false) queue.push({ c: nc, r: nr, depth: cur.depth + QP[1024] });
        }
    }
    return wanted;
}

function sortAuthoredBuildingJobsNearPlayer(jobs = authoredBuildingJobs) {
    jobs.sort((a, b) =>
        buildingSiteDistanceSqToPlayer(a.site) - buildingSiteDistanceSqToPlayer(b.site)
        || a.turns - b.turns
        || a.site.id - b.site.id
    );
}

function authoredStructuralRevision(site) {
    let floorRecords = QP[1015];
    for (const cell of site.cells) floorRecords += buildingWallSegments.get(`${cell.row},${cell.col}`)?.floors?.length ?? QP[1015];
    return {
        floorRecords,
        platforms: elevatedPlatforms.length,
        ramps: rampRuns.length,
        ceilings: overheadCeilings.length,
        props: propColliders.length,
    };
}

function authoredStructuralRevisionChanged(before, after) {
    return before.floorRecords !== after.floorRecords
        || before.platforms !== after.platforms
        || before.ramps !== after.ramps
        || before.ceilings !== after.ceilings
        || before.props !== after.props;
}

function stepAuthoredBuildingJob(job) {
    const site = job.site;
    if (!job.startedAt) job.startedAt = performance.now();
    const stepStarted = performance.now();
    const structuralBefore = authoredStructuralRevision(site);
    _generationAddedRoots = [];
    let step;
    let addedRoots = [];
    let deferredVisualPhase = false;
    try {
        step = site.signatureType
            ? runWithUnifiedSignatureSite(site, () => job.stepper.step())
            : job.stepper.step();
    } catch (error) {
        job.failed = true;
        job.completed = true;
        job.lastPhase = 'failed';
        job.error = error;
        authoredFailedSiteIds.add(site.id);
        _testGenerationDone++;
        console.error(`[building] site ${site.id} (${site.signatureType || 'ordinary'}) failed locally and was skipped; boot continues`, error);
    } finally {
        addedRoots = _generationAddedRoots;
        _generationAddedRoots = null;
        deferredVisualPhase = !!(step && !step.done && shouldMarkBootstrapSpeculativeVisualPhase(site, step.value?.phase));
        if (deferredVisualPhase) {
            const marked = markBootstrapSpeculativeVisualRoots(addedRoots, step.value?.phase);
            if (marked) runtimeLatency.record('visual.publish-speculative', QP[1015], { siteId: site.id, type: site.signatureType || 'ordinary', phase: step.value?.phase, marked });
        }
    }

    const stepMs = performance.now() - stepStarted;
    if (job.failed) {
        const idx = authoredBuildingJobs.indexOf(job);
        if (idx >= QP[1015]) authoredBuildingJobs.splice(idx, QP[1024]);
        runtimeLatency.record('generation.building-failed-local', stepMs, {
            siteId: site.id, type: site.signatureType || 'ordinary', cells: site.cells.length,
            error: String(job.error?.message || job.error || 'unknown building failure'),
        });
        if (!authoredBuildingJobs.length && !authoredBuildingsResolved) {
            authoredBuildingsResolved = true;
            authoredBuildingsResolve();
        }
        return { step: null, stepMs, phase: 'failed', addedRoots: addedRoots.length, completed: true, failed: true };
    }
    const phase = step.value?.phase || 'complete';
    const structuralReadyPhase = phase === 'unified-fabric-structure'
        || phase === 'signature-unified-shell'
        || phase === 'signature-empty-parcel-ready';
    if (!job.structuralReady && structuralReadyPhase) {
        job.structuralReady = true;
        authoredStructuralReadySiteIds.add(site.id);
        runtimeLatency.record('generation.authored-structural-ready', stepMs, {
            siteId: site.id, type: site.signatureType || 'ordinary', phase, cells: site.cells.length,
        });
    }
    job.lastPhase = phase;
    job.turns++;
    authoredSchedulerTurns++;
    const stepCategory = site.signatureType ? 'generation.signature-step' : 'generation.building-step';
    runtimeLatency.record(stepCategory, stepMs, {
        siteId: site.id,
        type: site.signatureType || 'ordinary',
        phase,
        cells: site.cells.length,
        schedulerTurn: authoredSchedulerTurns,
        siteTurn: job.turns,
    });
    if (stepMs > QP[8]) console.warn(`[latency] ${stepCategory} ${stepMs.toFixed(QP[1])}ms · site=${site.id} · type=${site.signatureType || 'ordinary'} · phase=${phase} · cells=${site.cells.length}`);

    // Physics synchronization follows structural state changes, not scene.add().
    // Appendable floor instance pages can gain a floor without adding a new root, so
    // scene-root counting is insufficient. Conversely, signs/graffiti must not rebuild
    // collision indexes. The revision snapshot catches both sides of that contract.
    const structuralAfter = authoredStructuralRevision(site);
    if (authoredStructuralRevisionChanged(structuralBefore, structuralAfter)) {
        const syncStarted = performance.now();
        const syncStats = playerPhysics.syncDynamicWorld();
        authoredStructuralSyncs++;
        runtimeLatency.record('physics.sync-authored-step', performance.now() - syncStarted, {
            siteId: site.id,
            phase,
            schedulerTurn: authoredSchedulerTurns,
            deferredVisualPhase,
            structuralBefore,
            structuralAfter,
            ...syncStats,
        });
    }

    if (step.done) {
        job.completed = true;
        authoredCompletedSiteIds.add(site.id);
        _testGenerationDone++;
        runtimeLatency.record(site.signatureType ? 'generation.signature-site-wall' : 'generation.ordinary-site-wall', performance.now() - job.startedAt, {
            siteId: site.id,
            type: site.signatureType || 'ordinary',
            cells: site.cells.length,
            semanticTurns: job.turns,
        });
        const idx = authoredBuildingJobs.indexOf(job);
        if (idx >= QP[1015]) authoredBuildingJobs.splice(idx, QP[1024]);
        if (!authoredBuildingJobs.length && !authoredBuildingsResolved) {
            authoredBuildingsResolved = true;
            authoredBuildingsResolve();
            console.log(`[perf:test] all ${buildingSites.length} authored sites completed progressively in ${(performance.now() - authoredBuildStart).toFixed(QP[1])}ms wall-clock; schedulerTurns=${authoredSchedulerTurns}; structuralSyncs=${authoredStructuralSyncs}`);
            console.log(`[testing] unified fabric exposed-setback faces: ${unifiedSpawnFabricExposedSetbackFaces} ordinary spawn faces generated by the same compound engine used outside spawn`);
        }
    }
    return { step, stepMs, phase, addedRoots: addedRoots.length, completed: job.completed };
}

function pumpAuthoredBuildingJobs({ maxSteps = QP[0], maxMillis = QP[1], onlySiteIds = null, structuralOnly = false } = {}) {
    const started = performance.now();
    let steps = QP[1015];
    let completed = QP[1015];
    while (steps < maxSteps && performance.now() - started < maxMillis) {
        const candidates = authoredBuildingJobs.filter(job =>
            (!onlySiteIds || onlySiteIds.has(job.site.id))
            && (!structuralOnly || !job.structuralReady)
        );
        if (!candidates.length) break;
        sortAuthoredBuildingJobsNearPlayer(candidates);
        const result = stepAuthoredBuildingJob(candidates[QP[1015]]);
        steps++;
        if (result.completed) completed++;
    }
    return { steps, completed, pending: authoredBuildingJobs.length, ms: performance.now() - started };
}

const minimumSafeAuthoredSiteIds = new Set();
console.log('[stream-perf] authored spawn district retired; ordinary streamed chunk + TV refuge is the complete spawn contract');

let rooftopCatwalkCount = QP[1015];
let hangingBridgeCount = QP[1015];
let authoredPostStructureStarted = true;
let authoredPostStructureFinished = true;
const authoredPostStructureResolve = () => {};
const authoredPostStructureCompletePromise = Promise.resolve();
const authoredPostStructureJobs = [];

function* buildUnifiedAuthoredRelationshipSteps() {
    let guarded = 0, hanging = 0, skipped = 0;
    for (const bridge of authoredFabricRelationshipPlan.bridgePlans) {
        const payload = cityFabricEngine.buildAuthoredBridge({
            bridge, payloadBySite: unifiedSpawnFabricPayloads, ownerId: `spawn-link:${SEED}:${bridge.id}`,
        });
        if (!payload) {
            skipped++;
            yield { phase: 'kowloon-link-skipped', bridgeId: bridge.id, variant: bridge.variant };
            continue;
        }
        cityFabricEngine.commit({ key: `spawn-link:${bridge.id}` }, payload);
        unifiedSpawnRelationshipPayloads.push(payload);
        if (bridge.variant === 'hanging-bridge') hanging++; else guarded++;
        yield { phase: 'kowloon-link-published', bridgeId: bridge.id, variant: bridge.variant, guarded, hanging };
    }
    return { total: guarded + hanging, guarded, hanging, skipped };
}

function finishAuthoredPostStructurePipeline() {
    if (authoredPostStructureFinished) return;
    authoredPostStructureFinished = true;
    authoredPostStructureResolve();
    console.log(`[stream-perf] authored relationship pass complete in live runtime · catwalks=${rooftopCatwalkCount} bridges=${hangingBridgeCount}`);
}

function maybeStartAuthoredPostStructurePipeline() {
    if (authoredPostStructureStarted || authoredBuildingJobs.length) return false;
    authoredPostStructureStarted = true;
    authoredPostStructureJobs.push({
        id: 'kowloon-cross-site-links',
        structural: true,
        ownedWorldStructural: true,
        onComplete: value => {
            rooftopCatwalkCount = value?.guarded ?? QP[1015];
            hangingBridgeCount = value?.hanging ?? QP[1015];
        },
        stepper: createStableStreamingRngStepper('authored:kowloon-links', () => buildUnifiedAuthoredRelationshipSteps()),
    });
    console.log('[stream-perf] authored post-structure lane contains only shared-fabric cross-site links');
    return true;
}

function pumpAuthoredPostStructurePipeline({ maxSteps = QP[1024], maxMillis = QP[1024] } = {}) {
    const started = performance.now();
    let steps = QP[1015];
    while (authoredPostStructureJobs.length && steps < maxSteps && performance.now() - started < maxMillis) {
        const job = authoredPostStructureJobs[QP[1015]];
        const stepStarted = performance.now();
        let result;
        try {
            result = job.stepper.step();
        } catch (error) {
            console.error(`[runtime] authored post-structure job ${job.id} failed; continuing remaining live world`, error);
            authoredPostStructureJobs.shift();
            steps++;
            continue;
        }
        const stepMs = performance.now() - stepStarted;
        runtimeLatency.record('authored-post.live-step', stepMs, {
            job: job.id,
            phase: result.value?.phase || (result.done ? 'complete' : 'step'),
            remainingJobs: authoredPostStructureJobs.length,
        });
        if (job.structural && !job.ownedWorldStructural && !result.done) {
            const syncStarted = performance.now();
            const syncStats = playerPhysics.syncDynamicWorld();
            runtimeLatency.record('physics.sync-authored-post-step', performance.now() - syncStarted, { job: job.id, ...syncStats });
        }
        if (result.done) {
            job.onComplete?.(result.value);
            authoredPostStructureJobs.shift();
        }
        steps++;
    }
    if (!authoredPostStructureJobs.length && authoredPostStructureStarted) finishAuthoredPostStructurePipeline();
    return { steps, pendingJobs: authoredPostStructureJobs.length, ms: performance.now() - started };
}

await testYieldNow('ordinary spawn chunk + TV ready · starting live chunk systems');
bootStatus('ordinary spawn chunk + TV ready -- starting live chunk systems…');

 
 
 
 
 


 
 
 
 
 
const groundSurfaceSystem = createGroundSurfaceSystem({
    CONFIG, JUNK_RENDER_CHUNK, GRID_ROWS, GRID_COLS, grid, groundTex, unitPlaneGeo, skirtBoxGeo,
    colSize, rowSize, colHalf, rowHalf, cellToWorld, wallDirections, makePixelTexture,
    camera,
    publishSurfacePatch: patch => {
        const payload = cityFabricEngine.buildAuthoredSurfacePatch(patch);
        cityFabricEngine.commit({ key: `spawn-surface:${patch.patchKey}` }, payload);
        return payload;
    },
    testYieldNow: testPublishAndYieldNow, testYieldIfNeeded: testPublishAndYieldIfNeeded,
});
const { isStreetCell, roadOpenMask, prepareOpenCellSurfaces, pumpOpenCellSurfaces, ensureOpenCellSurfaceNeighborhood, isWorldPositionReady: isSpawnGroundPositionReady, layOpenCellSurfaces } = groundSurfaceSystem;

// Spawn plazas are now thin adapters into the universal chunk enrichment path.
// Admission waits for each plaza's real ground patch, then common fabric owns
// rendering, progressive refinement, reservations, and late collision.
const authoredSpawnPlazaAdmissions = [];
const authoredSpawnPlazaTotal = authoredSpawnPlazaAdmissions.length;
let authoredSpawnPlazasAdmitted = 0;
function sortAuthoredSpawnPlazaAdmissionsNearPlayer() {
    authoredSpawnPlazaAdmissions.sort((a, b) => {
        const ap = cellToWorld(a.c, a.r), bp = cellToWorld(b.c, b.r);
        const adx = ap.x - camera.position.x, adz = ap.z - camera.position.z;
        const bdx = bp.x - camera.position.x, bdz = bp.z - camera.position.z;
        return (adx * adx + adz * adz) - (bdx * bdx + bdz * bdz) || a.key.localeCompare(b.key);
    });
}
function pumpAuthoredSpawnPlazaAdmissions({ maxPlazas = 1 } = {}) {
    if (!authoredSpawnPlazaAdmissions.length) return { admitted: 0, pending: 0 };
    sortAuthoredSpawnPlazaAdmissionsNearPlayer();
    let admitted = 0;
    while (authoredSpawnPlazaAdmissions.length && admitted < maxPlazas) {
        const readyIndex = authoredSpawnPlazaAdmissions.findIndex(job => {
            const p = cellToWorld(job.c, job.r);
            return isSpawnGroundPositionReady(p.x, p.z);
        });
        if (readyIndex < 0) break;
        const [job] = authoredSpawnPlazaAdmissions.splice(readyIndex, 1);
        const payload = cityFabricEngine.buildAuthoredPlaza({
            col: job.c, row: job.r, cellToWorld, colHalf, rowHalf,
            ownerId: `spawn-plaza:${SEED}:${job.c},${job.r}`,
            weirdness: Math.max(CONFIG.maze.loopChance, CONFIG.narrative.darkWeb.signChance),
            detailDensity: 0.72,
        });
        cityFabricEngine.commit(payload.chunk, payload);
        unifiedSpawnFabricPayloads.set(job.key, payload);
        if (cityFabricEngine.hasPendingRefinement(payload.chunk, payload)) unifiedSpawnFabricRefinementQueue.push(payload);
        authoredSpawnPlazasAdmitted++;
        admitted++;
    }
    return { admitted, pending: authoredSpawnPlazaAdmissions.length };
}
console.log('[kowloon] authored spawn plaza admission retired; ordinary chunk plazas own the origin');


function maybeMarkSpawnDistrictStructuresComplete() {
    _spawnDistrictStructuresComplete = true;
    return true;
}

function addBench(x, z, rotY) {
        if (CUT_AUTHORED_SPAWN_DECORATION) return 0;
    const g = new THREE.Group();
    const seat = new THREE.Mesh(skirtBoxGeo, sharedBenchMaterial);
    seat.scale.set(QP[4911], QP[4912], QP[4913]);
    seat.position.y = QP[4914];
    const back = new THREE.Mesh(skirtBoxGeo, sharedBenchMaterial);
    back.scale.set(QP[4915], QP[4916], QP[4917]);
    back.position.set(QP[4918], QP[4919], QP[4920]);
    g.add(seat, back);
    for (const lx of [QP[4921], QP[4922]]) {
        const leg = new THREE.Mesh(skirtBoxGeo, sharedBenchMaterial);
        leg.scale.set(QP[4923], QP[4924], QP[4925]);
        leg.position.set(lx, QP[4926], QP[4927]);
        g.add(leg);
    }
    g.rotation.y = rotY;
    g.position.set(x, QP[4928], z);
    scene.add(g);
    return QP[4929];
}

 
 
 
 
 
 




function wallDirections(c, r) {
    const dirs = [];
    if (grid[r]?.[c - QP[5023]]) dirs.push({ dx: QP[5024], dz: QP[5025] });
    if (grid[r]?.[c + QP[5026]]) dirs.push({ dx: QP[5027], dz: QP[5028] });
    if (grid[r - QP[5029]]?.[c]) dirs.push({ dx: QP[5030], dz: QP[5031] });
    if (grid[r + QP[5032]]?.[c]) dirs.push({ dx: QP[5033], dz: QP[5034] });
    return dirs;
}

 
 
 
 
 
function laneOffset(spread, axis) {
    if (!axis) return [randRange(-spread, spread), randRange(-spread, spread)];
    const side = (rng() < QP[5059] ? QP[5060] : QP[5061]) * randRange(QP[5062], QP[5063]) * spread;
    return axis === 'x' ? [randRange(-spread, spread), side] : [side, randRange(-spread, spread)];
}

flushHorizontalPlaneBatches(); // unified fabric owns all building plates
await testYieldNow('ordinary spawn fabric + TV collision-ready · releasing construction safety gate');

 
 
 
 
 
 
 
 
// Legacy weighted open-cell random-prop authority removed. Common Kowloon
// enrichment is now the sole ordinary street/facade decoration generator.


 

 

 
 
 
 
let touchMoveVec = { x: QP[5301], y: QP[5302] };
const velocity = new THREE.Vector3();  
const _moveForwardWorld = new THREE.Vector3();
const _moveRightWorld = new THREE.Vector3();

 
 
 


if (urlLandmark) {
    console.warn(`[signature] ?landmark=${urlLandmark} no longer redirects the player into the retired authored origin; normal streamed spawn remains authoritative`);
}


 
 
 

 

 
controls.pointerSpeed = CONFIG.desktopControls.pointerSpeed;

const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');

function showHint(text) {
    hint.textContent = text;
    hint.style.opacity = '1';
}
function fadeHint(delayMs) {
    setTimeout(() => { hint.style.opacity = '0'; }, delayMs);
}

if (IS_TOUCH) {
    document.getElementById('joystickZone').style.display = 'block';
    document.getElementById('lookZone').style.display = 'block';
    showHint('left half: move · right half: drag to look');
    fadeHint(QP[5322]);
} else {
    crosshair.style.display = 'block';
    showHint('click to look around · WASD to move · space to jump · shift to sprint · F freecam · P parameters · ESC to release');

    document.addEventListener('click', (e) => {
        if (e.target.closest('#escapeSiteButton, #parameterEditorRoot')) return;
        if (!controls.isLocked) controls.lock();
    });
    controls.addEventListener('lock', () => fadeHint(QP[5323]));
    controls.addEventListener('unlock', () => showHint('click to look around · WASD to move · space to jump'));
}

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = true; break;
        case 'KeyS': case 'ArrowDown': move.back = true; break;
        case 'KeyA': case 'ArrowLeft': move.left = true; break;
        case 'KeyD': case 'ArrowRight': move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = true; break;
        case 'Space':
            playerPhysics.bufferJump();  
            move.flyUp = true;  
            e.preventDefault();  
            break;
        case 'KeyC': move.flyDown = true; break;
        case 'KeyP':
             
             
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) break;
            e.preventDefault();
            if (controls.isLocked) controls.unlock();
            showHint('loading quantitative parameter catalog…');
            import('./parameter-editor.js')
                .then(mod => mod.toggleParameterEditor({ seed: SEED }))
                .catch(err => { console.error('[params] parameter editor failed to load', err); showHint('parameter editor failed -- see console'); });
            break;
        case 'KeyF':
            freecamEnabled = !freecamEnabled;
             
             
             
            if (!freecamEnabled) playerPhysics.syncFromPosition({ forceAirborne: true, resetVelocity: true });
            showHint(freecamEnabled ? 'freecam: space up · C down · F to exit' : 'freecam off');
            fadeHint(QP[5324]);
            break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = false; break;
        case 'KeyS': case 'ArrowDown': move.back = false; break;
        case 'KeyA': case 'ArrowLeft': move.left = false; break;
        case 'KeyD': case 'ArrowRight': move.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = false; break;
        case 'Space': move.flyUp = false; break;
        case 'KeyC': move.flyDown = false; break;
    }
});

 

if (IS_TOUCH) {
    const tc = CONFIG.touchControls;
    const joystickZone = document.getElementById('joystickZone');
    const lookZone = document.getElementById('lookZone');
    const base = document.getElementById('joystickBase');
    const knob = document.getElementById('joystickKnob');

    let joystickTouchId = null;
    let joystickOrigin = { x: QP[5325], y: QP[5326] };

    let lookTouchId = null;
    let lastLook = { x: QP[5327], y: QP[5328] };
    let pitch = QP[5329];

    joystickZone.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[QP[5330]];
        joystickTouchId = t.identifier;
        joystickOrigin = { x: t.clientX, y: t.clientY };
        base.style.left = (t.clientX - QP[5331]) + 'px';
        base.style.top = (t.clientY - QP[5332]) + 'px';
        knob.style.left = (t.clientX - QP[5333]) + 'px';
        knob.style.top = (t.clientY - QP[5334]) + 'px';
        base.style.display = 'block';
        knob.style.display = 'block';
    }, { passive: true });

    joystickZone.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier !== joystickTouchId) continue;
            let dx = t.clientX - joystickOrigin.x;
            let dy = t.clientY - joystickOrigin.y;
            const dist = Math.min(tc.joystickRadius, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * dist;
            dy = Math.sin(angle) * dist;
            knob.style.left = (joystickOrigin.x + dx - QP[5335]) + 'px';
            knob.style.top = (joystickOrigin.y + dy - QP[5336]) + 'px';
            touchMoveVec.x = dx / tc.joystickRadius;
            touchMoveVec.y = dy / tc.joystickRadius;
        }
    }, { passive: true });

    function endJoystick(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== joystickTouchId) continue;
            joystickTouchId = null;
            touchMoveVec = { x: QP[5337], y: QP[5338] };
            base.style.display = 'none';
            knob.style.display = 'none';
        }
    }
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    lookZone.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[QP[5339]];
        lookTouchId = t.identifier;
        lastLook = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    lookZone.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier !== lookTouchId) continue;
            const dx = t.clientX - lastLook.x;
            const dy = t.clientY - lastLook.y;
            lastLook = { x: t.clientX, y: t.clientY };

            camera.rotation.y -= dx * tc.lookSensitivity;
            pitch -= dy * tc.lookSensitivity;
            pitch = Math.max(-tc.pitchLimit, Math.min(tc.pitchLimit, pitch));
            camera.rotation.x = pitch;
        }
    }, { passive: true });

    lookZone.addEventListener('touchend', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouchId) lookTouchId = null;
        }
    });
}

testDisableBootstrapInput();

 
 
 
 

 

const clock = new THREE.Clock();

let elapsedTime = QP[5340];  
let footstepTimer = QP[5341];
let worldChunkPumpPromise = null;
let worldChunkNextKickAt = 0;
const worldPrefetchPressureGate = createPrefetchPressureGate({
    frameBudgetMs: CONFIG.streaming.prefetchHealthyFrameMs,
    motionDistance: CONFIG.streaming.prefetchMotionThreshold,
    cooldownMs: CONFIG.streaming.prefetchPressureCooldownMs,
});
let authoredOptimizerNextAt = 0;
let backgroundEnrichmentReleased = false;
let authoredAssetLaneOpened = false;
let authoredBackgroundQueueNear = false;
let progressiveEnrichmentNextAt = 0;
let progressiveEnrichmentRequests = 0;
let progressiveEnrichmentPayloads = 0;

function playerNearAuthoredSpawn() {
    return false;
}

function diagnosticErrorText(error) {
    const name = error?.name ? String(error.name) + ': ' : '';
    const message = error?.message ?? error;
    return (name + String(message ?? 'unknown error')).replace(/\s+/g, ' ').slice(0, 600);
}

function formatAdornmentQueueStats(stats = adornmentLoadQueue.stats()) {
    return 'assets=' + stats.active + '/' + stats.concurrency + ' active'
        + ' pending=' + stats.pending
        + ' done=' + stats.completed
        + ' failed=' + stats.failed
        + ' state=' + (stats.paused ? 'paused' : 'running');
}

function syncAuthoredBackgroundQueueLocality(nearSpawn = playerNearAuthoredSpawn()) {
    if (!authoredAssetLaneOpened || nearSpawn === authoredBackgroundQueueNear) return false;
    authoredBackgroundQueueNear = nearSpawn;
    if (nearSpawn) adornmentLoadQueue.resume();
    else adornmentLoadQueue.pause();
    console.log('[asset-event] ' + (nearSpawn ? 'resume-near-authored' : 'pause-outside-authored')
        + ' | ' + formatAdornmentQueueStats());
    return true;
}

function maybeOpenAuthoredAssetLane(nearSpawn = playerNearAuthoredSpawn()) {
    if (authoredAssetLaneOpened || !nearSpawn) return false;
    authoredAssetLaneOpened = true;
    authoredBackgroundQueueNear = true;
    adornmentLoadQueue.setConcurrency(QP[1024]);
    adornmentLoadQueue.resume();
    console.log('[asset-event] open-near-authored | ' + formatAdornmentQueueStats());
    return true;
}

function maybeReleaseBackgroundEnrichment() {
    if (backgroundEnrichmentReleased || !worldChunkStreamer) return false;
    const worldStats = worldChunkStreamer.stats();
     
     
     
    if (!(worldStats.localPrefetchRing.settled)) return false;
    backgroundEnrichmentReleased = true;
    authoredAssetLaneOpened = true;
    adornmentLoadQueue.setConcurrency(CONFIG.streaming.adornmentConcurrency);
    adornmentLoadQueue.resume();
    authoredBackgroundQueueNear = true;
    console.log('[asset-event] widen-after-prefetch | ' + formatAdornmentQueueStats());
    return true;
}

function requestProgressivePayload(chunk, payload, { authored = false } = {}) {
    if (!payload || GENERATION_LANES.microEnrichment) return 0;
    const result = cityFabricEngine.requestProgressiveDeepening(chunk, payload);
    const requested = Number(result?.requested) || 0;
    if (!requested) return 0;
    progressiveEnrichmentRequests++;
    progressiveEnrichmentPayloads += requested;
    if (authored && cityFabricEngine.hasPendingRefinement(chunk, payload)
        && !unifiedSpawnFabricRefinementQueue.includes(payload)) {
        unifiedSpawnFabricRefinementQueue.push(payload);
    }
    return requested;
}

function maybeRequestProgressiveEnrichment(now, worldStats) {
    // Full profile already planned all enrichment during the initial pass. 21N is
    // only the additive skeleton -> rich path, and it starts after the playable
    // render ring exists so first control / structure never waits on micro detail.
    if (GENERATION_LANES.microEnrichment || !worldChunkStreamer || now < progressiveEnrichmentNextAt) return 0;
    if (!worldStats?.localRenderRing?.complete) return 0;

    const desktop = QUALITY === CONFIG.quality.desktop;
    const radius = desktop ? 1 : 0;
    const playerChunk = worldChunkStreamer.playerChunkCoords();
    const streamed = [...worldChunkStreamer.chunks.values()]
        .filter(chunk => chunk?.state === 'ready' && chunk.renderPublished && chunk.payload
            && Math.abs(chunk.x - playerChunk.x) <= radius
            && Math.abs(chunk.z - playerChunk.z) <= radius)
        .sort((a, b) => {
            const ad = (a.x - playerChunk.x) ** 2 + (a.z - playerChunk.z) ** 2;
            const bd = (b.x - playerChunk.x) ** 2 + (b.z - playerChunk.z) ** 2;
            return ad - bd || a.key.localeCompare(b.key);
        });

    let requested = 0;
    for (const chunk of streamed) {
        requested += requestProgressivePayload(chunk, chunk.payload);
        if (requested) break;
    }

    progressiveEnrichmentNextAt = now + (desktop ? 90 : 180);
    return requested;
}

const WORLD_DIAGNOSTIC_INTERVAL_MS = 2000;
let worldDiagnosticsNextLogAt = performance.now() + WORLD_DIAGNOSTIC_INTERVAL_MS;
let worldDiagnosticsPrevious = null;

function diagnosticRate(current, previous, seconds) {
    if (!(seconds > 0)) return '-';
    return (Math.max(0, current - previous) / seconds).toFixed(1) + '/s';
}

function authoredOriginFocusDiagnostic() {
    let nearestPending = null;
    let nearestAny = null;
    for (const [siteId, payload] of unifiedSpawnFabricPayloads.entries()) {
        const entity = payload?.entity;
        const state = payload?.refinement;
        if (!entity || !state) continue;
        const dx = (entity.x ?? 0) - camera.position.x;
        const dz = (entity.z ?? 0) - camera.position.z;
        const distanceSq = dx * dx + dz * dz;
        const taskCount = state.tasks?.length ?? 0;
        const cursor = Number(state.cursor) || 0;
        const candidate = {
            key: 'spawn:' + siteId,
            distanceSq,
            published: Number(state.published) || 0,
            taskCount,
            pendingTasks: Math.max(0, taskCount - cursor),
            firstPassEntitiesComplete: Number(state.firstPassEntitiesComplete) || 0,
            firstPassEntityTarget: Number(state.firstPassEntityTarget) || 0,
        };
        if (!nearestAny || distanceSq < nearestAny.distanceSq) nearestAny = candidate;
        if (candidate.pendingTasks > 0 && (!nearestPending || distanceSq < nearestPending.distanceSq)) nearestPending = candidate;
    }
    return nearestPending ?? nearestAny;
}

function maybeLogWorldDiagnostics(now) {
    if (now < worldDiagnosticsNextLogAt || !worldChunkStreamer) return false;
    worldDiagnosticsNextLogAt = now + WORLD_DIAGNOSTIC_INTERVAL_MS;
    // Full scene-tree richness inspection is diagnostics-only. Normal frame and
    // scheduler stats remain counter/ring based and never traverse render trees.
    const stats = worldChunkStreamer.stats({ includeRichness: true });
    if (!stats?.richness) return false;

    const richness = stats.richness;
    const throughput = stats.throughput ?? {};
    const refinement = stats.refinement ?? {};
    const render = stats.localRenderRing ?? {};
    const firstPass = stats.localRenderRefinement ?? {};
    const prefetch = stats.localPrefetchRing ?? {};
    const health = stats.richnessHealth ?? {};
    const states = stats.states ?? {};
    const failureDiagnostics = stats.failureDiagnostics ?? {};
    const failedKeys = (failureDiagnostics.recent ?? []).slice(0, 4).map(item => item.key).join(',');
    const assets = adornmentLoadQueue.stats();
    const speculative = cityFabricEngine?.speculativePreviewStats?.() ?? {};
    const playerChunk = worldChunkStreamer.playerChunkCoords();
    const streamFocusKey = `${playerChunk.x},${playerChunk.z}`;
    const streamFocus = richness.perChunk?.find(chunk => chunk.key === streamFocusKey) ?? null;
    // The streamed origin is a composite shell with no own refinement tasks. While
    // physically in 0,0, report the nearest unfinished authored fabric payload so
    // focus= describes the work the player can actually see converging.
    const authoredFocus = playerChunk.x === 0 && playerChunk.z === 0
        ? authoredOriginFocusDiagnostic()
        : null;
    const focus = authoredFocus ?? streamFocus;
    const focusKey = focus?.key ?? streamFocusKey;
    const current = {
        at: now,
        builds: throughput.builds ?? 0,
        refinementSteps: refinement.steps ?? 0,
        attempts: refinement.attempts ?? 0,
        published: refinement.published ?? 0,
        assetCompleted: assets.completed ?? 0,
    };
    const seconds = worldDiagnosticsPrevious
        ? Math.max(0.001, (now - worldDiagnosticsPrevious.at) / 1000)
        : 0;
    const rates = worldDiagnosticsPrevious ? {
        build: diagnosticRate(current.builds, worldDiagnosticsPrevious.builds, seconds),
        refine: diagnosticRate(current.refinementSteps, worldDiagnosticsPrevious.refinementSteps, seconds),
        attempt: diagnosticRate(current.attempts, worldDiagnosticsPrevious.attempts, seconds),
        publish: diagnosticRate(current.published, worldDiagnosticsPrevious.published, seconds),
        asset: diagnosticRate(current.assetCompleted, worldDiagnosticsPrevious.assetCompleted, seconds),
    } : { build: '-', refine: '-', attempt: '-', publish: '-', asset: '-' };
    worldDiagnosticsPrevious = current;

    console.log('[world-state] t=' + (now / 1000).toFixed(1) + 's'
        + ' gear=' + worldStreamingGear
        + ' player=' + camera.position.x.toFixed(1) + ',' + camera.position.y.toFixed(1) + ',' + camera.position.z.toFixed(1)
        + ' chunk=' + playerChunk.x + ',' + playerChunk.z
        + ' | focus=' + focusKey
        + ':detail=' + (focus?.published ?? 0) + '/' + (focus?.taskCount ?? 0)
        + ':pending=' + (focus?.pendingTasks ?? 0)
        + ':first=' + (focus?.firstPassEntitiesComplete ?? 0) + '/' + (focus?.firstPassEntityTarget ?? 0)
        + ' | ring pub=' + (render.published ?? render.ready ?? 0) + '/' + (render.total ?? 0)
        + ' phys=' + (render.physicsAuthoritative ?? 0) + '/' + (render.total ?? 0)
        + ' struct=' + (render.structuralReady ?? 0) + '/' + (render.total ?? 0)
        + ' stalledPub=' + (stats.publication?.stalledRequestedVisible ?? 0)
        + ' prefetch=' + (prefetch.ready ?? 0) + '/' + (prefetch.total ?? 0)
        + ' | firstPass=' + (richness.firstPassEntitiesComplete ?? 0) + '/' + (richness.firstPassEntityTarget ?? 0)
        + ' pendingChunks=' + (firstPass.floorPendingChunks ?? 0)
        + ' | detail pub=' + (richness.successful ?? 0) + '/' + (richness.tasks ?? 0)
        + ' attempts=' + (richness.attempted ?? 0)
        + ' noop=' + (richness.noOp ?? 0)
        + ' fail=' + (richness.failed ?? 0)
        + ' pendingVisible=' + (richness.pendingPublishedDetailChunks ?? 0)
        + ' children=' + (richness.detailChildren ?? 0)
        + ' instances=' + (richness.detailRenderInstances ?? 0)
        + ' lastKind=' + (refinement.lastKind ?? '-')
        + ' | rate build=' + rates.build
        + ' refine=' + rates.refine
        + ' try=' + rates.attempt
        + ' pub=' + rates.publish
        + ' asset=' + rates.asset
        + ' decor=' + rates.decor
        + ' | pump=' + (throughput.lastPumpBuilt ?? 0) + 'b+' + (throughput.lastPumpRefined ?? 0) + 'r/' + (throughput.lastPumpMs ?? 0).toFixed(1) + 'ms'
        + ' buildAvg=' + (throughput.avgBuildMs ?? 0).toFixed(1) + 'ms'
        + ' buildWorst=' + (throughput.worstBuildMs ?? 0).toFixed(1) + 'ms'
        + ' detailAvg=' + (refinement.avgStepMs ?? 0).toFixed(2) + 'ms'
        + ' detailWorst=' + (refinement.worstStepMs ?? 0).toFixed(2) + 'ms'
        + ' commitVisibleAvg=' + (throughput.avgCommitToVisibleMs ?? 0).toFixed(1) + 'ms'
        + ' | paint proxy=' + _bootstrapCompileStaged.size
        + ' compileQ=' + _bootstrapCompileQueue.length
        + ' | preview chunks=' + (speculative.activeChunks ?? 0)
        + ' groups=' + (speculative.activeGroups ?? 0) + '/' + (speculative.maxGroupsPerChunk ?? 0)
        + ' inst=' + (speculative.activeInstances ?? 0)
        + ' held=' + (speculative.activeSuppressedInstances ?? 0)
        + ' published=' + (speculative.publishedInstances ?? 0)
        + ' | chunks q=' + (states.queued ?? 0)
        + ' building=' + (states.building ?? 0)
        + ' ready=' + (states.ready ?? 0)
        + ' failed=' + (states.failed ?? 0)
        + ' failedVisible=' + (failureDiagnostics.visible ?? 0)
        + (failedKeys ? ' failedKeys=' + failedKeys : '')
        + ' | ' + formatAdornmentQueueStats(assets)
        + ' | authored=' + (playerNearAuthoredSpawn() ? 'near' : 'far')
        + ' structural=' + authoredStructuralReadySiteIds.size + '/' + buildingSites.length
        + ' jobs=' + authoredBuildingJobs.length
        + ' fabric=' + unifiedSpawnFabricRefinementQueue.length
        + ' plazas=' + authoredSpawnPlazaAdmissions.length
        + ' complete=' + (_spawnDistrictStructuresComplete ? 1 : 0)        + ' | health stall=' + (health.stallWarnings ?? 0)
        + ' starved=' + (health.starvedWarnings ?? 0)
        + ' noGrowthAttempts=' + (health.attemptsWithoutGrowth ?? 0));
    return true;
}

let worldStreamingGear = 'bootstrap';
function worldStreamingGearFor(stats = worldChunkStreamer?.stats()) {
    return choosePlayerCenteredStreamingGear({
        // Strict `complete` remains geometry/physics truth. Streaming gears use
        // the separate `settled` liveness contract so terminal local failures cannot
        // deadlock unrelated color, enrichment, or quality restoration.
        renderSettled: !!stats?.localRenderRing.settled,
        visibleFirstPassSettled: !!stats?.localRenderRefinement?.floorSettled,
        prefetchSettled: !!stats?.localPrefetchRing.settled,
    });
}

function updateWorldStreamingGear(stats = worldChunkStreamer?.stats()) {
    const next = worldStreamingGearFor(stats);
    if (next !== worldStreamingGear) {
        const detail = stats?.localRenderRefinement;
        console.log('[stream-perf] player-centered gear ' + worldStreamingGear + ' -> ' + next
            + ' · render=' + (stats?.localRenderRing.ready ?? 0) + '/' + (stats?.localRenderRing.total ?? 0)
            + ' · first-pass-pending=' + (detail?.floorPendingChunks ?? '-')
            + ' · prefetch=' + (stats?.localPrefetchRing.ready ?? 0) + '/' + (stats?.localPrefetchRing.total ?? 0)
            + ' · authored-near=' + playerNearAuthoredSpawn());
        worldStreamingGear = next;
    }
    if (next === WORLD_STREAMING_GEAR.LOCAL_DEEPEN && _worldStreamPriorityLock) {
        _worldStreamPriorityLock = false;
        restoreFinalRenderQuality();
        console.log('[stream-perf] player neighborhood first-pass populated + structural prefetch warm · entering perpetual local-deepen mode');
        scheduleBootstrapCompilePump();
    }
    return next;
}

function pumpWorldChunksAggressively() {
    const pumpNow = performance.now();
    const prefetchPressure = worldPrefetchPressureGate.observe({ now: pumpNow, position: camera.position });
    if (!worldChunkStreamer || worldChunkPumpPromise || pumpNow < worldChunkNextKickAt) return;
    const before = worldChunkStreamer.stats();
    const gear = updateWorldStreamingGear(before);
    if (gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE && prefetchPressure.pressured) {
        worldChunkNextKickAt = Math.max(worldChunkNextKickAt, prefetchPressure.pressureUntil);
        return;
    }
    const desktop = QUALITY === CONFIG.quality.desktop;
    const structureIncomplete = gear === WORLD_STREAMING_GEAR.VISIBLE_STRUCTURE;
    const maxChunks = structureIncomplete
        ? CONFIG.streaming.urgentPumpChunks
        : gear === WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS
            ? 0
            : gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
                ? CONFIG.streaming.prefetchPumpChunks
                : CONFIG.streaming.warmPumpChunks;
    const maxMillis = structureIncomplete
        ? (desktop ? CONFIG.streaming.sprintBuildBudgetMsDesktop : CONFIG.streaming.sprintBuildBudgetMsWeak)
        : gear === WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS
            ? (desktop ? CONFIG.streaming.visibleDetailBudgetMsDesktop : CONFIG.streaming.visibleDetailBudgetMsWeak)
            : gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
                ? (desktop ? CONFIG.streaming.prefetchSprintBudgetMsDesktop : CONFIG.streaming.prefetchSprintBudgetMsWeak)
                : CONFIG.streaming.warmBuildBudgetMs;
    // CONVERGENCE SCHEDULER: missing structure still owns most of the frame,
    // but one bounded visible refinement lane runs before an indivisible chunk
    // build. A 20ms build overrun can no longer starve already-visible detail.
    const maxRefinements = structureIncomplete
        ? (desktop ? 2 : 1)
        : gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
            ? 1
            : gear === WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS || gear === WORLD_STREAMING_GEAR.LOCAL_DEEPEN
                ? (desktop ? CONFIG.streaming.chunkRefinementStepsDesktop : CONFIG.streaming.chunkRefinementStepsWeak)
                : 0;
    const refineFirst = structureIncomplete
        || gear === WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS
        || gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
        || gear === WORLD_STREAMING_GEAR.LOCAL_DEEPEN;
    const refinementBudgetMs = structureIncomplete
        ? (desktop ? Math.min(1.5, CONFIG.streaming.visibleDetailBudgetMsDesktop) : Math.min(1.0, CONFIG.streaming.visibleDetailBudgetMsWeak))
        : gear === WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS
            ? (desktop ? CONFIG.streaming.visibleDetailBudgetMsDesktop : CONFIG.streaming.visibleDetailBudgetMsWeak)
            : gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
                ? (desktop ? Math.min(1.25, CONFIG.streaming.visibleDetailBudgetMsDesktop) : Math.min(0.75, CONFIG.streaming.visibleDetailBudgetMsWeak))
                : gear === WORLD_STREAMING_GEAR.LOCAL_DEEPEN ? CONFIG.streaming.warmBuildBudgetMs : Infinity;
    const pumpCooldownMs = gear === WORLD_STREAMING_GEAR.LOCAL_DEEPEN
        ? CONFIG.streaming.warmCooldownMs
        : gear === WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE
            ? CONFIG.streaming.prefetchPostBuildCooldownMs
            : 0;
    worldChunkPumpPromise = worldChunkStreamer.pump({
        maxChunks, maxMillis, maxRefinements, refineFirst, refinementBudgetMs,
    })
        .then(builtAny => {
            if (!builtAny) return;
            const after = worldChunkStreamer.stats();
            updateWorldStreamingGear(after);
            maybeReleaseBackgroundEnrichment();
        })
        .catch(error => console.error('[world-error] chunk-pump | ' + diagnosticErrorText(error)))
        .finally(() => {
            worldChunkPumpPromise = null;
            worldChunkNextKickAt = performance.now() + pumpCooldownMs;
        });
}

function pumpAuthoredOptimizer(now) {
    if (now < authoredOptimizerNextAt || !worldChunkStreamer?.stats().localRenderRing.complete) return false;
    if (!staticWorldOptimizer?.getStats().dirtyChunks) return false;
    const optimized = staticWorldOptimizer.optimizeNearestDirtyChunk('optimizing nearest live authored chunk');
    authoredOptimizerNextAt = now + QP[5331];
    return optimized;
}

function animate(now = performance.now()) {
    runtimeLatency.raf(now, { runtime: 'full', phase: _testGenerationPhase });
    requestAnimationFrame(animate);
    renderer.info.reset();
    const delta = Math.min(CONFIG.movement.maxDeltaSeconds, clock.getDelta());
    elapsedTime += delta;
    updateDynamicLightCulling();
    updateDetailObjectCulling();
     
     
    staticWorldOptimizer?.updateVisibility();
    worldChunkStreamer?.updateVisibility();
    const liveWorldStats = worldChunkStreamer?.stats();
    maybeLogWorldDiagnostics(now);

    updateWorldStreamingGear(liveWorldStats);
    pumpWorldChunksAggressively();
    const progressiveRequested = maybeRequestProgressiveEnrichment(now, liveWorldStats);
    if (progressiveRequested) runtimeLatency.record('progressive-enrichment.request', 0, {
        requested: progressiveRequested, totalRequests: progressiveEnrichmentRequests, payloads: progressiveEnrichmentPayloads,
    });
    maybeReleaseBackgroundEnrichment();

    for (const f of flickerLights) {
        f.light.intensity = f.mode === 'blink'
            ? (Math.floor(elapsedTime * f.speed + f.phase) % QP[5343] === QP[5344] ? f.base : QP[5345])
            : f.base * (QP[5346] + QP[5347] * Math.sin(elapsedTime * f.speed + f.phase));
    }

    const forwardInput = (move.forward ? QP[5362] : QP[5363]) - (move.back ? QP[5364] : QP[5365]) - touchMoveVec.y;
    const rightInput = (move.right ? QP[5366] : QP[5367]) - (move.left ? QP[5368] : QP[5369]) + touchMoveVec.x;

     
     
     
     
     
    velocity.set(rightInput, QP[5370], -forwardInput);
    if (velocity.lengthSq() > QP[5371]) velocity.normalize();
    const localRight = velocity.x;
    const localForward = -velocity.z;
    const speedMul = move.sprint ? CONFIG.movement.sprintMultiplier : QP[5372];
    const moveSpeed = CONFIG.movement.speed * speedMul;
    const inputActive = controls.isLocked || IS_TOUCH;

    if (inputActive && velocity.lengthSq() > QP[5373]) {
        footstepTimer -= delta;
        if (footstepTimer <= QP[5374]) {
            playFootstep();
            footstepTimer = QP[5375];
        }
    } else {
        footstepTimer = QP[5376];
    }

    if (freecamEnabled) {
         
         
        if (inputActive) {
            controls.moveRight(localRight * moveSpeed * delta);
            controls.moveForward(localForward * moveSpeed * delta);
        }
        const flySpeed = moveSpeed * QP[5377];
        const vertical = (move.flyUp ? QP[5378] : QP[5379]) - (move.flyDown ? QP[5380] : QP[5381]);
        camera.position.y += vertical * flySpeed * delta;
        updateWebGradient(camera.position.z);
        updateRain(delta);
        const _freecamRenderStarted = performance.now();
        composer.render();
        runtimeLatency.record('render.full', performance.now() - _freecamRenderStarted, { mode: 'freecam', sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, colorProxyPending: _bootstrapCompileStaged.size });
        return;
    }

    let wishVelocityX = QP[5382];
    let wishVelocityZ = QP[5383];
    if (inputActive && velocity.lengthSq() > QP[5384]) {
        camera.getWorldDirection(_moveForwardWorld);
        _moveForwardWorld.y = QP[5385];
        if (_moveForwardWorld.lengthSq() > QP[5386]) _moveForwardWorld.normalize();
        else _moveForwardWorld.set(QP[5387], QP[5388], QP[5389]);

        _moveRightWorld.crossVectors(_moveForwardWorld, camera.up);
        if (_moveRightWorld.lengthSq() > QP[5390]) _moveRightWorld.normalize();
        else _moveRightWorld.set(QP[5391], QP[5392], QP[5393]);

        wishVelocityX = (_moveRightWorld.x * localRight + _moveForwardWorld.x * localForward) * moveSpeed;
        wishVelocityZ = (_moveRightWorld.z * localRight + _moveForwardWorld.z * localForward) * moveSpeed;
    }

     
     
     
    playerPhysics.step(delta, wishVelocityX, wishVelocityZ);
    // Cut 16: growth direction is architecture, not gravity.  The ceiling city
    // hangs downward while the player/camera keep the single ordinary world-up
    // frame everywhere.
    camera.up.set(0, 1, 0);
    camera.rotation.z = 0;

    updateWebGradient(camera.position.z);
    updateRain(delta);

    const _runtimeRenderStarted = performance.now();
    composer.render();
    runtimeLatency.record('render.full', performance.now() - _runtimeRenderStarted, { mode: 'player', sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, colorProxyPending: _bootstrapCompileStaged.size, compileGroupsPending: _bootstrapCompileQueue.length });

     
     
     
     
    fpsFrameCount++;
    const nowMs = performance.now();
    if (nowMs - fpsLastLogMs > QP[5394]) {
        const fps = (fpsFrameCount * QP[5395]) / (nowMs - fpsLastLogMs);
        const ri = renderer.info;
        const chunkStats = staticWorldOptimizer?.getStats();
        console.log(`[perf] ~${fps.toFixed(QP[5396])} fps | calls=${ri.render.calls} tris=${ri.render.triangles} | geo=${ri.memory.geometries} tex=${ri.memory.textures}`
            + ` | chunks=${chunkStats?.visibleChunks ?? '-'}/${chunkStats?.chunks ?? '-'}`
            + ` | quality=${QUALITY === CONFIG.quality.desktop ? 'desktop' : QUALITY === CONFIG.quality.mobile ? 'mobile' : 'potato'}`);
        fpsFrameCount = QP[5397];
        fpsLastLogMs = nowMs;
    }
}
let fpsFrameCount = QP[5398];
let fpsLastLogMs = performance.now();

 
 
 
 
 
 
 
 
 
 
 
 
 
function buildTraversalGraph() {
    const nodes = elevatedPlatforms.map((p, i) => ({ ...p, id: i }));
    const groundId = nodes.length;
    nodes.push({ x: QP[5399], z: QP[5400], hx: GRID_W, hz: GRID_H, y: QP[5401], id: groundId });  
    const adj = nodes.map(() => new Set());
    function link(a, b) { if (a !== null && b !== null && a !== b) { adj[a].add(b); adj[b].add(a); } }

     
     
     
    const surfaceIndex = new SpatialHash2D(QP[5402]);
    const surfaceCandidates = [];
    for (let i = QP[5403]; i < groundId; i++) {
        const n = nodes[i];
        surfaceIndex.insert(n, {
            minX: n.x - n.hx - QP[5404], maxX: n.x + n.hx + QP[5405],
            minZ: n.z - n.hz - QP[5406], maxZ: n.z + n.hz + QP[5407],
        });
        if (Math.abs(n.y) <= QP[5408]) link(i, groundId);
    }

    function nodeNear(x, z, y, tol = QP[5409]) {
        let best = null, bestD = Infinity;
        surfaceIndex.queryBounds({ minX: x - tol, maxX: x + tol, minZ: z - tol, maxZ: z + tol }, surfaceCandidates);
        for (const n of surfaceCandidates) {
            if (Math.abs(n.y - y) > tol) continue;
            if (x < n.x - n.hx - tol || x > n.x + n.hx + tol || z < n.z - n.hz - tol || z > n.z + n.hz + tol) continue;
            const d = Math.hypot(x - n.x, z - n.z);
            if (d < bestD) { bestD = d; best = n.id; }
        }
         
         
        const ground = nodes[groundId];
        if (Math.abs(ground.y - y) <= tol
            && x >= ground.x - ground.hx - tol && x <= ground.x + ground.hx + tol
            && z >= ground.z - ground.hz - tol && z <= ground.z + ground.hz + tol) {
            const d = Math.hypot(x - ground.x, z - ground.z);
            if (d < bestD) best = groundId;
        }
        return best;
    }
    let unmatchedRamps = QP[5410];
    for (const r of rampRuns) {
        const x0 = r.axis === 'x' ? r.from : r.fixedCoord, z0 = r.axis === 'x' ? r.fixedCoord : r.from;
        const x1 = r.axis === 'x' ? r.to : r.fixedCoord, z1 = r.axis === 'x' ? r.fixedCoord : r.to;
        const a = nodeNear(x0, z0, r.y0), b = nodeNear(x1, z1, r.y1);
        if (a === null || b === null) unmatchedRamps++;
        link(a, b);
    }
     
     
    for (let i = QP[5411]; i < groundId; i++) {
        const a = nodes[i];
        surfaceIndex.queryBounds({
            minX: a.x - a.hx - QP[5412], maxX: a.x + a.hx + QP[5413],
            minZ: a.z - a.hz - QP[5414], maxZ: a.z + a.hz + QP[5415],
        }, surfaceCandidates);
        for (const b of surfaceCandidates) {
            const j = b.id;
            if (j <= i || j >= groundId) continue;
            if (Math.abs(a.y - b.y) > QP[5416]) continue;
            if (Math.abs(a.x - b.x) < a.hx + b.hx + QP[5417] && Math.abs(a.z - b.z) < a.hz + b.hz + QP[5418]) link(i, j);
        }
    }
    return { nodes, adj, groundId, unmatchedRamps };
}

function validateTraversal() {
    const { nodes, adj, groundId, unmatchedRamps } = buildTraversalGraph();
    const seen = new Set([groundId]);
    const queue = [groundId];
    for (let qHead = QP[5419]; qHead < queue.length; qHead++) {
        const cur = queue[qHead];
        for (const nb of adj[cur]) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
    const total = nodes.length, reachable = seen.size;
    const pct = (QP[5420] * reachable / total).toFixed(QP[5421]);
    console.log(`[traversal] ${reachable}/${total} walkable surfaces reachable from ground (${pct}%), ${rampRuns.length} stair/ramp runs (${unmatchedRamps} didn't match a surface at either end)`);
    if (reachable < total * QP[5422]) {
        console.warn(`[traversal] WARNING: fewer than half of all registered walkable surfaces are reachable from the ground -- some generated geometry may be an unreachable island. Not fatal (a lot of this is genuinely far-apart rooftops/platforms only meant to be reached by jumping/climbing, which this simple graph doesn't model), but worth a look if it's ever much lower than usual.`);
    }
    if (unmatchedRamps > QP[5423]) {
        console.warn(`[traversal] WARNING: ${unmatchedRamps} stair/ramp run(s) didn't find a registered walkable surface within 0.5 units of one of their own endpoints -- possible gap between a flight and its landing.`);
    }
}
function scheduleTraversalValidation() {
    const run = () => {
        try { validateTraversal(); }
        catch (error) { console.warn('[traversal] background validation failed', error); }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: QP[5394] });
    else setTimeout(run, 0);
}

await testCompileSceneIfDirty();

console.log(`[perf] spawn structural handoff at ${bootElapsed()} since page start -- starting live world stream before static refinement`);
testStatus('spawn playable · refinement continues in live runtime');
bootStatus(`spawn playable (${bootElapsed()}) · world streaming`);
_backgroundCompileSchedulingEnabled = true;
_testBootstrapActive = false;
console.log(`[stream-perf] bootstrap handoff after ${_testBootstrapFrame} painted frames; full physics/runtime now authoritative`);
animate();
window.__boot?.ready();
requestAnimationFrame(() => setTimeout(() => scheduleBootstrapCompilePump(), 0));

void (async function continuePostHandoffWorldRefinement() {
    await authoredBuildingsCompletePromise;
    maybeStartAuthoredPostStructurePipeline();
    await authoredPostStructureCompletePromise;
    while (!_spawnDistrictStructuresComplete) await testNextPaint();
    await testYieldNow('optimizing completed spawn chunk · background refinement');
    const staticOptimizeStart = performance.now();
    await staticWorldOptimizer.finalizeIncremental({
        yieldControl: (phase, done, total) => testYieldIfNeeded(phase, done, total),
    });
    const staticWorldStats = staticWorldOptimizer.getStats();
    console.log(`[perf] background static-world refinement ${(performance.now() - staticOptimizeStart).toFixed(QP[5426])}ms wall-clock:`, staticWorldStats);
    // Color is not a post-handoff gate anymore. Authored leaves have already been
    // visible with color-preserving proxies; the compile pump swaps each program
    // family to its final material independently whenever it is ready.
    scheduleBootstrapCompilePump();
    console.log(`[perf] spawn structural refinement complete at ${bootElapsed()} since page start; final material programs continue deepening independently`);
    scheduleTraversalValidation();
})().catch(error => {
    console.error('[runtime] post-handoff world refinement failed without taking down the live player runtime', error);
});

 
 
 
registerConfigLiveParameter('cfg.narrative.lightWeb.fogDensity');
registerConfigLiveParameter('cfg.narrative.darkWeb.fogDensity');
registerConfigLiveParameter('cfg.narrative.lightWeb.ambientIntensity');
registerConfigLiveParameter('cfg.narrative.darkWeb.ambientIntensity');
registerConfigLiveParameter('cfg.narrative.lightWeb.hemiIntensity');
registerConfigLiveParameter('cfg.narrative.darkWeb.hemiIntensity');
registerConfigLiveParameter('cfg.movement.speed');
registerConfigLiveParameter('cfg.movement.sprintMultiplier');
registerConfigLivePrefix('cfg.touchControls');
registerConfigLiveParameter('cfg.desktopControls.pointerSpeed', value => { controls.pointerSpeed = value; });
registerConfigLiveParameter('cfg.camera.fov', value => { camera.fov = value; camera.updateProjectionMatrix(); });
registerConfigLiveParameter('cfg.camera.near', value => { camera.near = value; camera.updateProjectionMatrix(); });
registerConfigLiveParameter('cfg.lighting.moonIntensity', value => { sun.intensity = value; });
registerConfigLiveParameter('cfg.lighting.moonColor', value => { sun.color.setHex(value); });
registerConfigLiveParameter('cfg.lighting.moonPosition.x', value => { sun.position.x = value; });
registerConfigLiveParameter('cfg.lighting.moonPosition.y', value => { sun.position.y = value; });
registerConfigLiveParameter('cfg.lighting.moonPosition.z', value => { sun.position.z = value; });
registerConfigLiveParameter('cfg.lighting.fillColor', value => { hemiLight.color.setHex(value); });

const _activeQualityParamName = QUALITY === CONFIG.quality.desktop ? 'desktop' : QUALITY === CONFIG.quality.mobile ? 'mobile' : 'potato';
const _activeQualityParamPrefix = `cfg.quality.${_activeQualityParamName}`;
registerConfigLiveParameter(`${_activeQualityParamPrefix}.drawDistance`, value => {
    staticWorldOptimizer?.setDrawDistance(value);
    _lastCameraFar = NaN;
});
registerConfigLiveParameter(`${_activeQualityParamPrefix}.maxDynamicLights`);
registerConfigLiveParameter(`${_activeQualityParamPrefix}.maxPixelRatio`, value => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, value));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
if (bloomPass) {
    registerConfigLiveParameter(`${_activeQualityParamPrefix}.bloom.strength`, value => { bloomPass.strength = value; });
    registerConfigLiveParameter(`${_activeQualityParamPrefix}.bloom.radius`, value => { bloomPass.radius = value; });
    registerConfigLiveParameter(`${_activeQualityParamPrefix}.bloom.threshold`, value => { bloomPass.threshold = value; });
}

 
 
 
 
 
 
window.__debug = {
    scene, camera, THREE,
    setFreecam: (v) => { freecamEnabled = v; },
    perf: () => ({
        fpsSamplerActive: true,
        renderer: {
            calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
            pixelRatio: renderer.getPixelRatio(),
        },
        staticWorld: staticWorldOptimizer?.getStats() ?? null,
        worldStream: worldChunkStreamer?.stats() ?? null,
        currentChunk: (() => {
            const c = worldChunkStreamer?.getChunkAtWorld(camera.position.x, camera.position.z);
            return c ? { key: c.key, x: c.x, z: c.z, state: c.state, renderPublished: !!c.renderPublished, physicsAuthoritative: !!c.physicsAuthoritative } : null;
        })(),
        currentWeirdness: (() => {
            const c = worldChunkStreamer?.getChunkAtWorld(camera.position.x, camera.position.z);
            return c?.weirdness ?? worldWeirdnessAt(0, 0, { worldSeed: SEED });
        })(),
        authored: {
            pendingSites: authoredBuildingJobs.length,
            completedSites: authoredCompletedSiteIds?.size ?? QP[1015],
            minimumSafeSites: minimumSafeAuthoredSiteIds.size,
            schedulerTurns: authoredSchedulerTurns,
            structuralSyncs: authoredStructuralSyncs,
            structuresComplete: _spawnDistrictStructuresComplete,
            ground: groundSurfaceSystem.stats(),
            plazas: { total: authoredSpawnPlazaTotal, completed: authoredSpawnPlazasAdmitted, pending: authoredSpawnPlazaAdmissions.length, worstMs: 0, commonEngine: true },
        },
        city: {
            cols: GRID_COLS, rows: GRID_ROWS, sites: buildingSites.length,
            rooftopDecks: rooftopDecks.length, propColliders: propColliders.length,
            rooftopCatwalks: rooftopCatwalkCount, hangingBridges: hangingBridgeCount,
            commonFabricPayloads: unifiedSpawnFabricPayloads.size, commonFabricRelationships: unifiedSpawnRelationshipPayloads.length,
            commonFabricServiceCages: [...unifiedSpawnFabricPayloads.values()].reduce((n, p) => n + (p.entity?.serviceCages ?? 0), 0),
            commonFabricScaffoldLandings: [...unifiedSpawnFabricPayloads.values()].reduce((n, p) => n + (p.entity?.scaffoldLandings ?? 0), 0),
            commonFabricRamps: [...unifiedSpawnFabricPayloads.values()].reduce((n, p) => n + (p.physics?.ramps?.length ?? 0), 0),
            roadMaterialPool: groundSurfaceSystem.stats().roadMaterialPool,
            windowTexturePool: _windowTextureCache.size, buildingMaterialPool: _buildingFacadeMaterialCache.size,
            groundSurfaceBatches: groundSurfaceSystem.stats(), horizontalPlaneBatches: flushHorizontalPlaneBatches(),
        },
        decoration: {
            authority: 'KowloonFabricEngine',
            adornmentQueue: adornmentLoadQueue.stats(),
            backgroundEnrichmentReleased,
            progressiveEnrichment: {
                enabled: !GENERATION_LANES.microEnrichment,
                requests: progressiveEnrichmentRequests,
                payloads: progressiveEnrichmentPayloads,
            },
            failedCityAssets: failedCityAssetLoads.size,
            failedRealModels: failedRealModelLoads.size,
            failedPhotos: failedPhotoLoads.size,
            expensiveModelsPlaced: adornmentSystem.stats().expensiveModelsPlaced,
            expensiveModelBudgets: adornmentSystem.stats().expensiveModelBudgets,
            shortRangeDetailObjects: detailCullObjects.size,
        },
    }),
    buildingWallSegments, buildingSites, footprintOf, siteIdOf, grid, buildingFacades, exteriorDecorationVolumes,
};

// Dev-only live visual/geometry inspection seam. This stays inert during normal
// JWEB boot: the harness module is imported only when an agent/developer asks for
// it from __debug or opts in with ?visualProbe=1.  The harness consumes the same
// committed payload authorities the player sees, including streamed chunks,
// authored spawn fabric/relationships, and the hanging authored ceiling overlay.
function visualProbePayloadEntries() {
    const entries = [];
    const seen = new Set();
    const add = (payload, chunkKey, source) => {
        if (!payload?.root) return;
        const key = payload.ownerId ?? payload.root.uuid;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push({ payload, chunkKey: String(chunkKey ?? payload.chunk?.key ?? payload.root.userData?.worldChunkKey ?? ''), source });
    };

    for (const chunk of worldChunkStreamer?.chunks?.values?.() ?? []) {
        if (chunk?.state === 'ready' && chunk.payload) add(chunk.payload, chunk.key, 'world-stream');
    }
    for (const [siteId, payload] of unifiedSpawnFabricPayloads.entries()) add(payload, payload?.chunk?.key ?? '0,0', `authored-fabric:${siteId}`);
    for (const payload of unifiedSpawnRelationshipPayloads) add(payload, payload?.chunk?.key ?? '0,0', 'authored-relationship');
    add(authoredCeilingOverlayPayload, authoredCeilingOverlayPayload?.chunk?.key ?? '0,0', 'authored-ceiling-overlay');
    return entries;
}

async function installVisualProbe() {
    if (window.__jwebVisualProbe) return window.__jwebVisualProbe;
    const { installJwebVisualProbe } = await import('./tools/visual-harness/runtime-visual-probe.js');
    return installJwebVisualProbe({
        THREE,
        scene,
        camera,
        renderer,
        composer,
        chunkSize: STREAM_CHUNK_SIZE,
        setFreecam: value => { freecamEnabled = !!value; },
        onCameraMoved: () => {
            worldChunkStreamer?.ensureNeighborhood?.();
            worldChunkStreamer?.updateVisibility?.(worldChunkStreamer?.playerChunkCoords?.(), true);
        },
        getCurrentChunk: () => worldChunkStreamer?.getChunkAtWorld(camera.position.x, camera.position.z) ?? null,
        getPayloadEntries: visualProbePayloadEntries,
        getStatus: () => window.__debug?.perf?.() ?? null,
    });
}

window.__debug.visualProbe = Object.freeze({
    install: installVisualProbe,
    payloadEntries: visualProbePayloadEntries,
    get installed() { return !!window.__jwebVisualProbe; },
});

if (new URLSearchParams(location.search).get('visualProbe') === '1') {
    installVisualProbe().catch(error => console.error('[visual-probe] live install failed', error));
}
