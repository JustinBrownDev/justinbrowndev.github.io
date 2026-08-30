import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { createPlayerPhysics } from './player-physics.js';
import { SpatialHash2D, createProgressiveStaticWorldOptimizer } from './city-performance.js';
import { announceParameterOverrides, registerConfigLiveParameter, registerConfigLivePrefix, registerConfigRoot } from './numeric-parameters.js';
import { QP } from './runtime/main-quantitative-literals.js';
import { CONFIG } from './config/game-config.js';
import * as BOOTSTRAP_NOISE from './noise-data-bootstrap.js';
import { createWorldChunkStreamer } from './world-chunk-streamer.js';
import { createInfiniteCityChunkFactory } from './infinite-city-chunks.js';
import { createNoiseRemixer } from './systems/noise-remix.js';
import { fitCanvasText, drawCanvasLines } from './systems/canvas-text.js';
import { createOrganicGeometryTools, remapWallUV, computeNotchedRects, appendBoxData, boxesIntersect } from './systems/geometry-utils.js';
import {
    WORLD_FORMAT_VERSION,
    SPAWN_SINGULAR_TYPES,
    createSpawnSingularManifest,
    singularEntityId,
    worldWeirdnessAt,
} from './world-contract.js';
import { WIKI_FALLBACK, PERSONAL_WANTED_FACTS, WANTED_TAGLINES } from './content/wanted-content.js';
import { ART_GALLERY_CATALOG, AS400_CONTENT } from './content/signature-content.js';
import { BASE_GRAFFITI_TAGS } from './content/graffiti-content.js';
import { MYTHOLOGY_FRAGMENTS, INFRA_LORE_FRAGMENTS, UNDERCITY_LORE_FRAGMENTS } from './content/lore-fragments.js';
import { JUNK_BASE_KINDS, JUNK_WEAR_STATES, JUNK_SIZE_CLASSES } from './content/junk-content.js';
import { TEXT_FONTS, PAPER_COLORS, INK_COLORS, SIGN_SHAPES, SIGN_FONTS, SIGN_BACKINGS } from './content/text-style.js';
import { PHOTO_BY_TITLE } from './content/photo-catalog.js';
import { CODE_LORE_PAIRS } from './content/code-lore/index.js';
import { createSignatureBuildingSystem } from './world/signature-buildings.js';
import { CELL_SIDE_DEFS, outwardRotationY } from './systems/cardinal.js';
import { createAdornmentSystem } from './systems/adornment-assets.js';
import { createSignageSystem } from './world/signage.js';
import { createStreetPropsSystem } from './world/street-props.js';
import { createGroundSurfaceSystem } from './world/ground-surfaces.js';
import { createVerticalCirculationSystem } from './world/vertical-circulation.js';
import { createFacadeLayoutSystem } from './world/facade-layout.js';
import { createBuildingShellSystem } from './world/building-shell.js';
import { createBuildingConstructionSystem } from './world/building-construction.js';
import { createSpawnMazePlan, createSpawnBuildingSitePlan } from './world/spawn-district-plan.js';
import { createDynamicLightPool } from './systems/dynamic-light-pool.js';
import { createRuntimeLatencyTelemetry } from './systems/runtime-latency.js';
import { createMaterialRefinementController } from './systems/material-refinement.js';
import { createMusicPlayer } from './systems/music-player.js';

 
 
 
 
 
 
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
    clipNoiseText,
    poetryShard,
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
    c.scene.fogDensity = jitterClamped(c.scene.fogDensity, QP[51], QP[52], QP[53]);

     
    for (const pole of [c.narrative.lightWeb, c.narrative.darkWeb]) {
        pole.fogColor = shiftHue(pole.fogColor, QP[54]);
        pole.ambientColor = shiftHue(pole.ambientColor, QP[55]);
        pole.fogDensity = jitterClamped(pole.fogDensity, QP[56], QP[57], QP[58]);
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
let _sceneMaterialRevision = 0;
let _bootstrapCompileStagingEnabled = false;
const _bootstrapCompileStaged = new Map();
const _bootstrapCompileQueue = [];
const _bootstrapCompileQueued = new Set();
const _bootstrapCompileGroups = new Map();
const _bootstrapCompiledPrograms = new Set();
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
function bootstrapProgramKey(leaf) {
    const materials = Array.isArray(leaf.material) ? leaf.material : [leaf.material];
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
function stageBootstrapCompileLeaf(leaf) {
    if (!(leaf?.isMesh || leaf?.isLine || leaf?.isPoints || leaf?.isSprite) || !leaf.material) return;
    const key = bootstrapProgramKey(leaf);
    if (_bootstrapCompiledPrograms.has(key)) return;
    if (!_bootstrapCompileStaged.has(leaf)) _bootstrapCompileStaged.set(leaf, leaf.visible);
    leaf.visible = false;
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
        if (obj.userData?.__bootstrapDeferredVisual) continue;
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
    QUALITY.drawDistance
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

 
 
 
const TEST_STREAMING_RUNTIME = true;
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
let _testCompiledSceneRevision = -1;
let _testCompileTotalMs = 0;
let _testCompileMaxMs = 0;
let _testCompileCount = 0;

async function runBootstrapCompilePump() {
    if (typeof renderer.compileAsync !== 'function') {
        for (const [leaf, visible] of _bootstrapCompileStaged) if (leaf.parent) leaf.visible = visible;
        _bootstrapCompileStaged.clear();
        _bootstrapCompileQueue.length = 0;
        _bootstrapCompileQueued.clear();
        _bootstrapCompileGroups.clear();
        return;
    }
    while (_bootstrapCompileQueue.length) {
        const key = _bootstrapCompileQueue.shift();
        _bootstrapCompileQueued.delete(key);
        const group = _bootstrapCompileGroups.get(key);
        if (!group) continue;
        let representative = group.representative;
        if (!representative?.material || !representative.parent) {
            representative = [...group.leaves].find(leaf => leaf?.material && leaf.parent) ?? null;
            group.representative = representative;
        }
        if (!representative) {
            for (const leaf of group.leaves) _bootstrapCompileStaged.delete(leaf);
            _bootstrapCompileGroups.delete(key);
            continue;
        }
        const started = performance.now();
        _testCompileBarrierActive = true;
        try {
            await renderer.compileAsync(representative, camera, scene);
        } catch (error) {
            console.warn('[shader-prewarm] program-family compile failed; publishing staged leaves for normal lazy compile', error);
        } finally {
            _testCompileBarrierActive = false;
        }
        const ms = performance.now() - started;
        runtimeLatency.record('shader.compile-program', ms, {
            type: representative.type,
            material: Array.isArray(representative.material) ? 'array' : representative.material?.type,
            stagedLeaves: group.leaves.size,
        });
        _testCompileCount++;
        _testCompileTotalMs += ms;
        _testCompileMaxMs = Math.max(_testCompileMaxMs, ms);
        _bootstrapCompiledPrograms.add(key);
        for (const leaf of group.leaves) {
            const originalVisible = _bootstrapCompileStaged.get(leaf);
            if (leaf.parent && originalVisible !== undefined) {
                leaf.visible = originalVisible;
                staticWorldOptimizer?.markDirtyObject(leaf);
            }
            _bootstrapCompileStaged.delete(leaf);
        }
        _bootstrapCompileGroups.delete(key);
        if (ms > 16) console.warn(`[latency] shader.compile-program ${ms.toFixed(1)}ms · ${representative.type} · ${Array.isArray(representative.material) ? 'material[]' : representative.material?.type || 'material'} · ${group.leaves.size} staged leaf/leaves`);
        await new Promise(resolve => requestAnimationFrame(resolve));
    }
}

function scheduleBootstrapCompilePump() {
    if (!_backgroundCompileSchedulingEnabled && !_testBootstrapActive) return null;
    if (!_bootstrapCompileQueue.length || _bootstrapCompilePumpPromise) return _bootstrapCompilePumpPromise;
    _bootstrapCompilePumpPromise = runBootstrapCompilePump().finally(() => {
        _bootstrapCompilePumpPromise = null;
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
    if (IS_TOUCH || e.target.closest?.('#parameterEditorRoot, #bootStreamFilters, #escapeSiteButton, #musicPlayer')) return;
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

const bootstrapPreviewMaterial = new THREE.MeshBasicMaterial({ color: 0x171a20, fog: true });
let bootstrapPreviewOverrideActive = true;
let materialRefinementController = null;
let materialRefinementReprioritizeAt = 0;
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
    const _previousOverrideMaterial = scene.overrideMaterial;
    if (bootstrapPreviewOverrideActive) scene.overrideMaterial = bootstrapPreviewMaterial;
    renderer.render(scene, camera);
    scene.overrideMaterial = _previousOverrideMaterial;
    const _renderMs = performance.now() - _renderStarted;
    runtimeLatency.record('render.bootstrap', _renderMs, { phase: _testGenerationPhase, sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, compileActive: _testCompileBarrierActive });
    if (_renderMs > 8) console.warn(`[latency] render.bootstrap ${_renderMs.toFixed(1)}ms · phase=${_testGenerationPhase} · scene=${scene.children.length} · calls=${renderer.info.render.calls} · compile=${_testCompileBarrierActive ? 'yes' : 'no'}`);
    _testBootstrapFrame++;
}
requestAnimationFrame(testBootstrapRenderLoop);
_bootstrapCompileStagingEnabled = true;
console.log(`[stream-perf] progressive runtime active; frame work budget=${TEST_FRAME_BUDGET_MS}ms; authoritative runtime=main.js`);
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

 
 
 
function pickNetworkNoise(rng) {
    return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS.network));
}

 
 
 
 

function webAlignment(worldZ) {
    return THREE.MathUtils.clamp((worldZ / (GRID_H / QP[254]) + QP[255]) / QP[256], QP[257], QP[258]);
}

 
 
 
 
 
 
 
 
 
 
 
 
const CAVE_FOG = new THREE.Color(QP[259]);
const CAVE_AMBIENT = new THREE.Color(QP[260]);
const HEAVEN_FOG = new THREE.Color(QP[261]);
const HEAVEN_AMBIENT = new THREE.Color(QP[262]);
const _vertColor = new THREE.Color();
const _vertAmbient = new THREE.Color();
const LAYER_Y = { caveTop: QP[263], heavenBase: QP[264] };
let _lastCameraFar = camera.far;

function verticalBandT(y) {
    return THREE.MathUtils.clamp((y - LAYER_Y.caveTop) / (LAYER_Y.heavenBase - LAYER_Y.caveTop), QP[265], QP[266]);
}

function updateVerticalGradient(y, elapsed) {
    const vt = verticalBandT(y);
    if (vt <= QP[267]) {
        _vertColor.copy(CAVE_FOG);
        _vertAmbient.copy(CAVE_AMBIENT);
    } else if (vt >= QP[268]) {
        _vertColor.copy(HEAVEN_FOG);
        _vertAmbient.copy(HEAVEN_AMBIENT);
    } else {
         
         
         
        const hue = (vt * QP[269] + elapsed * QP[270]) % QP[271];
        _vertColor.setHSL(hue, QP[272], QP[273]);
        _vertAmbient.setHSL((hue + QP[274]) % QP[275], QP[276], QP[277]);
    }
    scene.fog.color.copy(_vertColor);
    scene.background.copy(_vertColor);
    ambientLight.color.copy(_vertAmbient);
    return vt;
}

function updateWebGradient(worldZ, worldY, elapsed) {
    const t = webAlignment(worldZ);
    const dark = CONFIG.narrative.darkWeb;
    const light = CONFIG.narrative.lightWeb;

     
     
     
    const vt = updateVerticalGradient(worldY, elapsed);

    const baseDensity = THREE.MathUtils.lerp(dark.fogDensity, light.fogDensity, t);
     
     
     
     
    scene.fog.density = baseDensity * THREE.MathUtils.lerp(QP[278], QP[279], vt);
    const nextFar = THREE.MathUtils.lerp(Math.min(QP[280], QUALITY.drawDistance), QUALITY.drawDistance, vt);
    if (Math.abs(nextFar - _lastCameraFar) > QP[281]) {
        camera.far = nextFar;
        camera.updateProjectionMatrix();
        _lastCameraFar = nextFar;
    }

    ambientLight.intensity = THREE.MathUtils.lerp(dark.ambientIntensity, light.ambientIntensity, t);
    hemiLight.intensity = THREE.MathUtils.lerp(dark.hemiIntensity, light.hemiIntensity, t);
     
     
    rainMat.opacity = (QP[282] - t) * QP[283] * (QP[284] - vt * QP[285]);
    updateAudioGradient(t, vt);
}

 
 
 
 
 
 
 
 
const musicPlayer = createMusicPlayer();

function updateAudioGradient(t, vt = QP[302]) {
    musicPlayer.setWorldMix(t, vt);
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
let addFenceSegment;
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
function pickTextFont() { return pick(TEXT_FONTS); }
function pickPaperColor() { return pick(PAPER_COLORS); }
function pickInkColor() { return pick(INK_COLORS); }

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
        case 'code': return { ...toContent(pick(CODE_LORE_PAIRS)), flicker: false };
         
         
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
const CELL = BLOCK;
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

 
 
 
function makeCrackTexture() {
    const data = CONFIG.realData.djiaMilestones;
    const years = data.map(([y]) => y);
    const logs = data.map(([, v]) => Math.log10(v));
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const lMin = Math.min(...logs), lMax = Math.max(...logs);
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#141414';
        ctx.fillRect(QP[561], QP[562], w, h);
        ctx.strokeStyle = '#050505';
        ctx.lineWidth = QP[563];
        ctx.beginPath();
        data.forEach(([year, val], i) => {
            const px = ((year - yMin) / (yMax - yMin)) * w;
            const py = h - ((Math.log10(val) - lMin) / (lMax - lMin)) * h;
            if (i === QP[564]) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = QP[565];
        ctx.stroke();
    }, QP[566], QP[567]);
}

 
 
 
let _topologyStainTexture = null;
function makeTopologyStainTexture() {
    if (_topologyStainTexture) return _topologyStainTexture;
    const points = CONFIG.realData.elevationsFt;
    const vals = points.map(([, ft]) => ft);
    const min = Math.min(...vals), max = Math.max(...vals);
    _topologyStainTexture = makePixelTexture((ctx, w, h) => {
        points.forEach(([name, ft], i) => {
            const t0 = i / points.length, t1 = (i + QP[568]) / points.length;
            const norm = (ft - min) / (max - min);
            const shade = Math.floor(QP[569] + norm * QP[570]);
            const tint = name.startsWith('Illinois') ? [shade, shade + QP[571], shade] : [shade, shade, shade + QP[572]];
            ctx.fillStyle = `rgb(${tint[QP[573]]},${tint[QP[574]]},${tint[QP[575]]})`;
            ctx.fillRect(QP[576], Math.floor(h * (QP[577] - t1)), w, Math.ceil(h * (t1 - t0)) + QP[578]);
        });
    }, QP[579], QP[580]);
    return _topologyStainTexture;
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

 
 
 
 
 
function runWithStableStreamingRng(key, work) {
    const previous = _rngSource;
    const local = localRng(hashString32(`${SEED}:stream:${key}`));
    let draws = 0;
    _rngSource = () => { draws++; return local(); };
    try {
        return work();
    } finally {
        _rngSource = previous;
        if (previous === _globalRng) {
            for (let i = 0; i < draws; i++) _globalRng();
        }
    }
}

function createStableStreamingRngStepper(key, iteratorFactory) {
    const local = localRng(hashString32(`${SEED}:stream:${key}`));
    let draws = 0;
    let globalAdvanced = 0;
    const source = () => { draws++; return local(); };
    const scoped = (work) => {
        const previous = _rngSource;
        _rngSource = source;
        try {
            return work();
        } finally {
            _rngSource = previous;
            if (previous === _globalRng) {
                while (globalAdvanced < draws) {
                    _globalRng();
                    globalAdvanced++;
                }
            }
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
const wantedPosterMeshes = [];

function makeWantedTexture(title, subtitle, tagline1 = 'KNOWLEDGE OF THIS TOPIC', tagline2 = 'REWARD: PEACE OF MIND') {
     
     
     
    const paper = pickPaperColor();
    const ink = pickInkColor();
    const font = pickTextFont();
    const borderWidth = Math.round(randRange(QP[643], QP[644]));
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = paper;
        ctx.fillRect(QP[645], QP[646], w, h);
        ctx.strokeStyle = ink;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(QP[647], QP[648], w - QP[649], h - QP[650]);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.font = `bold 15px ${font}`;
        ctx.fillText('WANTED', w / QP[651], QP[652]);
        ctx.font = `bold 9px ${font}`;
        ctx.fillText(title, w / QP[653], h / QP[654], w - QP[655]);
        ctx.font = `8px ${font}`;
        ctx.fillText(subtitle, w / QP[656], h / QP[657] + QP[658], w - QP[659]);
        ctx.font = `7px ${font}`;
        ctx.fillText(tagline1, w / QP[660], h - QP[661]);
        ctx.fillText(tagline2, w / QP[662], h - QP[663]);
    }, QP[664], QP[665]);
}

function addWantedPoster(x, z, rotY, placement = null) {
     
     
    const isPersonal = rng() < QP[666];
     
     
     
     
    const [title, subtitle] = isPersonal
        ? pick(PERSONAL_WANTED_FACTS)
        : (rng() < QP[667] ? pick(WIKI_FALLBACK) : pickCityNoisePair(rng, x, z));
    const [tagline1, tagline2] = pickRandomizedWantedTaglines();
    const tex = isPersonal
        ? makeWantedTexture(title, subtitle, 'ON FILE, ALLEGEDLY', "REWARD: NONE, HE'S FINE")
        : makeWantedTexture(title, subtitle, tagline1, tagline2);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(randRange(QP[668], QP[669]), randRange(QP[670], QP[671])),
        new THREE.MeshStandardMaterial({ map: tex, roughness: QP[672] })
    );
    const posterH = plane.geometry.parameters.height;
    const wallTop = placement?.wallHeight ?? QP[673];
    const minCenter = QP[674] + posterH / QP[675];
    const maxCenter = Math.max(minCenter, Math.min(QP[676], wallTop - QP[677] - posterH / QP[678]));
    plane.position.set(x, randRange(minCenter, maxCenter), z);
    plane.rotation.y = rotY;
    scene.add(plane);
     
     
    if (!isPersonal) wantedPosterMeshes.push(plane);
    return QP[679];
}

 
 
 
 
function fetchRandomWikiArticles(count) {
    for (let i = QP[680]; i < count; i++) {
        adornmentLoadQueue.enqueue({
            key: `wiki:${i}`,
             
             
             
            priority: Number.MAX_SAFE_INTEGER,
            run: async () => {
                const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary');
                return response.ok ? response.json() : null;
            },
        }).then(data => {
            if (!data?.title || !wantedPosterMeshes.length) return;
            const mesh = pick(wantedPosterMeshes);
            mesh.material.map = makeWantedTexture(
                data.title.toUpperCase(),
                (data.description || 'wikipedia article').slice(QP[681], QP[682])
            );
            mesh.material.needsUpdate = true;
        }).catch(() => {});  
    }
}

function addFissureCrack(x, z) {
    const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(randRange(QP[683], QP[684]), randRange(QP[685], QP[686])),
        new THREE.MeshBasicMaterial({ map: makeCrackTexture() })
    );
    crack.rotation.x = -Math.PI / QP[687];
    crack.rotation.z = randRange(QP[688], Math.PI * QP[689]);
    crack.position.set(x, QP[690], z);
    scene.add(crack);
    return QP[691];
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
scene.add(ground);

 
 
 
 
 

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

const mazeSealWalls = [];  
 
 
 
 
 
const MAZE_SEAL_HEIGHT = QP[853];

 

const skirtBoxGeo = new THREE.BoxGeometry(QP[874], QP[875], QP[876]);
 
 
 
const unitPlaneGeo = new THREE.PlaneGeometry(QP[877], QP[878]);
 
const sharedBenchMaterial = new THREE.MeshStandardMaterial({ color: QP[879], roughness: QP[880] });
 
let _sharedGrassMaterial = null;

 
 
 
const footprintOf = [];
for (let r = QP[946]; r < GRID_ROWS; r++) footprintOf.push(new Array(GRID_COLS).fill(null));

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
const buildingWallSegments = new Map();
const WALL_THICKNESS = QP[947];

 
 
 
 
 
 
 

 
 
 
const elevatedPlatforms = [];  
 
 
 
 
const rooftopDecks = [];  
const rampRuns = [];  
 
 
 
 
const overheadCeilings = [];
let verticalCirculationSystem = null;
let flushHorizontalPlaneBatches;
let buildCoreFloor;
let buildRooftopMechanicalRoom;
let buildRooftopCatwalks;
let maybeAddMezzanine;
let maybeAddElevator;
let buildFireEscape;
let buildHangingBridges;
let addBalcony;
let addDebugRectOutline;
let fireEscapeDimensions;
let fireEscapeSideFits;
let fireEscapeDepth;

const STATIC_BATCH_CHUNK = QP[1011];
const buildingShellSystem = createBuildingShellSystem({
    WALL_THICKNESS, randRange, scene, skirtBoxGeo, weightedPick,
});
const { buildWallWithGaps, buildExteriorPerimeter, wallIntersectsReservedRect, buildFloorLayout, drawFloorLayout } = buildingShellSystem;

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
 
 
 
const {
    addTrashCan,
    addTrafficCone,
    addMileMarker,
    addTrafficSign,
    addTrafficSignal,
    addCrate,
    addLantern,
    addVendingMachine,
    addFenceSegment: streetAddFenceSegment,
    addMuseumPlacard,
    addStickerTag,
    addWallFlyer,
    addBusinessCardLitter,
    addManhole,
    addPigeon,
    addOverheadCable,
    finalizeOverheadCables,
    addAwning,
    addTree,
    addPottedPlant,
    addTableWithClutter,
    addIvyPatch,
    addPipeCluster,
    addWeeds,
    addPlazaGlow,
    addThicketShade,
    addStatue,
    scatterJunk,
    pileJunkCluster,
    addConstructionZone,
    addNewsstand,
    addPhoneBooth,
    addAtmKiosk,
    addCrimeScene,
    trafficSignals,
    JUNK_RENDER_CHUNK,
    PROP_BUILDERS,
    PROP_HEIGHTS,
    propColliders,
    propCandidatesNear,
    plazaFacingRotY,
} = createStreetPropsSystem({
    CELL,
    CONFIG,
    STATIC_BATCH_CHUNK,
    grid,
    scene,
    unitPlaneGeo,
    takeDynamicLight,
    getStaticWorldOptimizer: () => staticWorldOptimizer,
    getPoetryShort: () => POETRY_SHORT_NOISE,
    getPoetryMedium: () => POETRY_MEDIUM_NOISE,
    getPickPoetryTag: () => pickPoetryTag,
    addFissureCrack,
    addWantedPoster,
    hexToCss,
    jitterGeometry,
    laneOffset,
    makePixelTexture,
    pick,
    pickCityNoisePair,
    pickInkColor,
    pickNetworkNoise,
    pickPaperColor,
    pickRandomizedCuratedPair,
    pickRandomizedLorePair,
    pickTextFont,
    placeRealModel,
    randRange,
    rng,
    unseededPick,
});
addFenceSegment = streetAddFenceSegment;
for (let r = QP[854]; r < GRID_ROWS; r++) {
    for (let c = QP[855]; c < GRID_COLS; c++) {
        const { x: cx, z: cz } = cellToWorld(c, r);
         
        if (c + QP[856] < GRID_COLS && grid[r]?.[c] && grid[r]?.[c + QP[857]] && siteIdOf[r][c] !== siteIdOf[r][c + QP[858]]) {
            const bx = cx + colHalf(c);
            const rh = rowHalf(r);
            mazeSealWalls.push({ x1: bx, z1: cz - rh, x2: bx, z2: cz + rh, yMin: QP[859], yMax: MAZE_SEAL_HEIGHT });
            for (let i = QP[860]; i < QP[861]; i++) addFenceSegment(bx, cz - rh + (i + QP[862]) * (rh / QP[863]), Math.PI / QP[864]);
        }
         
        if (r + QP[865] < GRID_ROWS && grid[r]?.[c] && grid[r + QP[866]]?.[c] && siteIdOf[r][c] !== siteIdOf[r + QP[867]][c]) {
            const bz = cz + rowHalf(r);
            const ch = colHalf(c);
            mazeSealWalls.push({ x1: cx - ch, z1: bz, x2: cx + ch, z2: bz, yMin: QP[868], yMax: MAZE_SEAL_HEIGHT });
            for (let i = QP[869]; i < QP[870]; i++) addFenceSegment(cx - ch + (i + QP[871]) * (ch / QP[872]), bz, QP[873]);
        }
    }
}
console.log(`[testing] maze topology: ${mazeSealWalls.length} cell boundaries sealed -- squeezing between adjacent buildings is no longer physically possible (same-site internal edges correctly excluded)`);
verticalCirculationSystem = createVerticalCirculationSystem({
    QUALITY, SEED, STATIC_BATCH_CHUNK, scene, unitPlaneGeo, skirtBoxGeo,
    elevatedPlatforms, rampRuns, overheadCeilings, rooftopDecks,
    exteriorDecorationVolumeIndex, grid,
    buildExteriorPerimeter, buildFloorLayout, buildWallWithGaps, drawFloorLayout,
    wallIntersectsReservedRect, facadeTangent, makeProjectionBox, projectionFits,
    solidClearanceAhead, worldToCellIndex,
    jitterGeometry, makePixelTexture, pick, pileJunkCluster, placeRealModel,
    randRange, rng, takeDynamicLight,
});
({
    flushHorizontalPlaneBatches,
    buildCoreFloor,
    buildRooftopMechanicalRoom,
    buildRooftopCatwalks,
    maybeAddMezzanine,
    maybeAddElevator,
    buildFireEscape,
    buildHangingBridges,
    addBalcony,
    addDebugRectOutline,
    fireEscapeDimensions,
    fireEscapeSideFits,
    fireEscapeDepth,
} = verticalCirculationSystem);

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
    flickerLights,
} = signageSystem;
adornmentSystem.setStandoffPanelMounter(mountStandoffPanel);

const buildingConstructionSystem = createBuildingConstructionSystem({
    DEBUG_FACADES, DEBUG_FOOTPRINTS, DEBUG_SIGNATURES, QUALITY, SEED, STREET, BLOCK, WALL_THICKNESS,
    addAwning, addBalcony, addBench, addCrate, addDebugRectOutline, addGraffitiTag,
    addIvyPatch, addPipeCluster, addPottedPlant, addRooftopClutter, addSecurityCamera, addWallFlyer,
    buildCoreFloor, buildFireEscape, buildRooftopMechanicalRoom,
    buildingFacades, buildingWallSegments, candidateFaces,
    cellToWorld, colHalf, colSize, edgeKindForSite, elevatedPlatforms,
    exteriorDecorationVolumes, facadeReserve, findFreeFacadeRect,
    fireEscapeDepth, fireEscapeDimensions, fireEscapeSideFits, footprintOf,
    hashString32, jitterGeometry, localRng, makeFacade, makePixelTexture, makeProjectionBox,
    makeTopologyStainTexture, makeWindowGridTexture, maybeAddElevator, maybeAddMezzanine,
    pick, pileJunkCluster, placeRealModel, placeSemanticCityAsset, placeSignsOnFacade, placeSignsOnFacadeSteps,
    pointOnFacade, projectionFits, randRange, reserveProjectionVolume, rng, rooftopDecks,
    rowHalf, rowSize, scatterJunk, scene, semanticCornerPoint, sharedBuildingFacadeMaterial,
    signatureInstances, siteIdOf, skirtBoxGeo, takeDynamicLight, webAlignment, weightedPick,
});
const { addBuildingModule, addBuildingModuleSteps, addBuildingSite, addBuildingSiteSteps, buildCourtyardVoid, addSiteDebugOverlay, addFacadeDebugOverlay, addSignatureDebugOverlay, streetSetbackRoll } = buildingConstructionSystem;

({ buildSignatureSite, buildSignatureSiteSteps, buildGalleryArtPanel } = createSignatureBuildingSystem({
    CONFIG,
    QUALITY,
    scene,
    pendingGalleryPanels,
    photoImages,
    takeDynamicLight,
    addBench,
    addBuildingModule,
    addBuildingModuleSteps,
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
}));
adornmentSystem.setGalleryPanelBuilder(buildGalleryArtPanel);

const animatedMaterials = new Set();
function refreshAnimatedMaterials() {
    for (const signal of trafficSignals) {
        animatedMaterials.add(signal.redMat);
        animatedMaterials.add(signal.yellowMat);
        animatedMaterials.add(signal.greenMat);
    }
}
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
let infiniteChunkFactory = null;
let _spawnDistrictStructuresComplete = false;
function isStreamingWorldPositionAvailable(x, z) {
    if (!_spawnDistrictStructuresComplete) {
        if (!_testTopologyReady) return true;
        if (Math.abs(x) > GRID_W / QP[559] || Math.abs(z) > GRID_H / QP[560]) return false;
        const { col, row } = worldToCellIndex(x, z);
        return grid[row]?.[col] === false;
    }
    if (worldChunkStreamer) return worldChunkStreamer.isWorldPositionAvailable(x, z);
    return Math.abs(x) <= STREAM_CHUNK_SIZE * 0.5 && Math.abs(z) <= STREAM_CHUNK_SIZE * 0.5;
}
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
    mazeSealWalls,
    propColliders,
    elevatedPlatforms,
    rampRuns,
    overheadCeilings,
    boundsHalf: Infinity,
    isWorldPositionAvailable: isStreamingWorldPositionAvailable,
    ...PHYSICS_TUNING,
});
console.log(`[stream-perf] full player physics active during authored construction at ${bootElapsed()}`);

function shouldDeferBootstrapVisualPhase(site, phase) {
    if (!phase) return false;
    if (!site.signatureType) return phase === 'facade-sign' || phase === 'facade-signs';
    if (phase === 'floor' || phase === 'rooftop' || phase.endsWith('-module') || phase === 'signature-futurePlaceholder') return false;
    return phase !== 'complete';
}

function deferBootstrapVisualRoots(roots) {
    let hidden = 0;
    for (const root of roots) {
        root?.traverse?.(obj => {
            if (!(obj.isMesh || obj.isLine || obj.isPoints || obj.isSprite) || !obj.visible || obj.userData?.__bootstrapDeferredVisual) return;
            obj.userData.__bootstrapDeferredVisual = true;
            obj.userData.__bootstrapDeferredVisible = obj.visible;
            obj.visible = false;
            hidden++;
        });
    }
    return hidden;
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

function sortBuildingSitesNearestToPlayer(sites) {
     
     
    sites.sort((a, b) => buildingSiteDistanceSqToPlayer(b) - buildingSiteDistanceSqToPlayer(a) || b.id - a.id);
}

{
    const buildStart = performance.now();
    _testGenerationTotal = buildingSites.length;
    _testGenerationDone = 0;
    const pendingBuildingSites = buildingSites.slice();
    let reprioritize = true;
    await testYieldNow('streaming nearest real buildings', _testGenerationDone, _testGenerationTotal);
    while (pendingBuildingSites.length) {
        if (reprioritize) {
            sortBuildingSitesNearestToPlayer(pendingBuildingSites);
            reprioritize = false;
        }
        const site = pendingBuildingSites.pop();
        const _siteStarted = performance.now();
        let yieldedWithinSite = false;
        {
            const iteratorFactory = site.signatureType
                ? () => buildSignatureSiteSteps(site)
                : () => addBuildingSiteSteps(site);
            const stepper = createStableStreamingRngStepper(`building:${site.id}`, iteratorFactory);
            let step;
            do {
                const _stepStarted = performance.now();
                _generationAddedRoots = [];
                try {
                    step = stepper.step();
                } finally {
                    const addedRoots = _generationAddedRoots;
                    _generationAddedRoots = null;
                    if (step && !step.done && shouldDeferBootstrapVisualPhase(site, step.value?.phase)) {
                        const hidden = deferBootstrapVisualRoots(addedRoots);
                        if (hidden) runtimeLatency.record('visual.defer-bootstrap', 0, { siteId: site.id, type: site.signatureType || 'ordinary', phase: step.value?.phase, hidden });
                    }
                }
                const _stepMs = performance.now() - _stepStarted;
                const _stepCategory = site.signatureType ? 'generation.signature-step' : 'generation.building-step';
                runtimeLatency.record(_stepCategory, _stepMs, { siteId: site.id, type: site.signatureType || 'ordinary', phase: step.value?.phase || 'complete', cells: site.cells.length });
                if (_stepMs > 8) console.warn(`[latency] ${_stepCategory} ${_stepMs.toFixed(1)}ms · site=${site.id} · type=${site.signatureType || 'ordinary'} · phase=${step.value?.phase || 'complete'} · cells=${site.cells.length}`);
                if (!step.done && await testPublishAndYieldIfNeeded('streaming nearest real buildings', _testGenerationDone, _testGenerationTotal)) yieldedWithinSite = true;
            } while (!step.done);
        }
        const _siteMs = performance.now() - _siteStarted;
        runtimeLatency.record(site.signatureType ? 'generation.signature-site-wall' : 'generation.ordinary-site-wall', _siteMs, { siteId: site.id, type: site.signatureType || 'ordinary', cells: site.cells.length });
        if (_siteMs > 8) console.warn(`[latency] generation.building-site ${_siteMs.toFixed(1)}ms · site=${site.id} · type=${site.signatureType || 'ordinary'} · cells=${site.cells.length}`);
        _testGenerationDone++;
        await testCompileSceneIfDirty();
        refreshAnimatedMaterials();
        const _flushStarted = performance.now();
        await staticWorldOptimizer.flushDirtyChunks({
            phaseLabel: 'batching nearest authored chunks',
            yieldControl: async () => {
                const elapsed = performance.now() - _testSliceStartedAt;
                const inputPending = !!navigator.scheduling?.isInputPending?.({ includeContinuous: true });
                if (!inputPending && elapsed < TEST_FRAME_BUDGET_MS) return false;
                await testPublishAndYieldNow('streaming nearest real buildings', _testGenerationDone, _testGenerationTotal);
                yieldedWithinSite = true;
                return true;
            },
        });
        runtimeLatency.record('optimizer.incremental-site-flush-wall', performance.now() - _flushStarted, { siteId: site.id, type: site.signatureType || 'ordinary' });
        const _physicsSyncStarted = performance.now();
        const _physicsSyncStats = playerPhysics.syncDynamicWorld();
        runtimeLatency.record('physics.sync-dynamic', performance.now() - _physicsSyncStarted, { siteId: site.id, ..._physicsSyncStats });
        reprioritize = yieldedWithinSite || await testPublishAndYieldIfNeeded('streaming nearest real buildings', _testGenerationDone, _testGenerationTotal);
    }
    console.log(`[perf:test] ${buildingSites.length} authoritative building sites streamed nearest-player-first in ${(performance.now() - buildStart).toFixed(QP[4723])}ms wall-clock (${bootElapsed()} total)`);
    console.log(`[testing] same-site height mismatches: ${buildingConstructionSystem.stats().totalExposedSetbackWalls} exterior setback wall-floors generated where a same-site neighbor stopped short (floor-aware internal-edge fix -- was structurally always 0 before)`);
}

 
 
 
 
 
function validateFacadeOccupancy() {
     
     
     
     
     
     
     
     
     
    let facadeBoundsViolations = QP[4724];
    for (const facade of buildingFacades) {
        for (const r of facade.occupied) {
            if (r.vMin < facade.yMin - QP[4725] || r.vMax > facade.yMax + QP[4726]) {
                facadeBoundsViolations++;
                if (facadeBoundsViolations <= QP[4727]) {
                    console.warn(`[testing] FAILED facade occupancy bounds: facade #${facade.id} (${facade.exposure}) yRange=[${facade.yMin.toFixed(QP[4728])},${facade.yMax.toFixed(QP[4729])}] but a reservation spans vMin=${r.vMin.toFixed(QP[4730])} vMax=${r.vMax.toFixed(QP[4731])}`);
                }
            }
        }
    }
    console.log(`[testing] facade occupancy bounds self-test: ${facadeBoundsViolations === QP[4732] ? 'PASS' : `FAIL (${facadeBoundsViolations} violations)`} across ${buildingFacades.length} facades`);

     
     
     
     
    let projectionIntersections = QP[4733];
    const validationCandidates = [];
    for (const box of exteriorDecorationVolumes) {
        exteriorDecorationVolumeIndex.queryBounds({
            minX: box.xMin, maxX: box.xMax,
            minZ: box.zMin, maxZ: box.zMax,
        }, validationCandidates);
        for (const other of validationCandidates) {
            if (other.__projectionId <= box.__projectionId) continue;
            if (boxesIntersect(box, other)) projectionIntersections++;
        }
    }
    console.log(`[testing] world-space projection intersection self-test: ${projectionIntersections === QP[4734] ? 'PASS' : `FAIL (${projectionIntersections} intersecting pairs)`} across ${exteriorDecorationVolumes.length} registered projections`);
}

await testCompileSceneIfDirty();
await testYieldNow('mounting real wall content');
mountContentCards();  
await testCompileSceneIfDirty();
await testYieldNow('validating real facades');
validateFacadeOccupancy();
addFacadeDebugOverlay();
addSignatureDebugOverlay();
await testCompileSceneIfDirty();
await testYieldNow('building rooftop catwalks');
const rooftopCatwalkCount = buildRooftopCatwalks();  
await testCompileSceneIfDirty();
await testYieldNow('building hanging bridges');
const hangingBridgeCount = buildHangingBridges();  
await testCompileSceneIfDirty();
await testYieldNow('city structure complete · streaming ground/props');
bootStatus(`city built, ${GRID_COLS * GRID_ROWS} cells -- placing props/decoration…`);

 
 
 
 
 
{
    const dist = new Map();
    const key = (c, r) => `${c},${r}`;
    dist.set(key(spawnCol, spawnRow), QP[4735]);
    const queue = [[spawnCol, spawnRow]];
    for (let qHead = QP[4736]; qHead < queue.length; qHead++) {
        const [c, r] = queue[qHead];
        const d = dist.get(key(c, r));
        for (const [dc, dr] of [[QP[4737], QP[4738]], [QP[4739], QP[4740]], [QP[4741], QP[4742]], [QP[4743], QP[4744]]]) {
            const nc = c + dc, nr = r + dr;
            if (grid[nr]?.[nc] === false && !dist.has(key(nc, nr))) {
                dist.set(key(nc, nr), d + QP[4745]);
                queue.push([nc, nr]);
            }
        }
    }

     
     
     
     
    const deadEnds = [];
    for (const [k, d] of dist) {
        const [c, r] = k.split(',').map(Number);
        if (openNeighborCount(c, r) === QP[4746]) deadEnds.push({ c, r, d });
    }
    deadEnds.sort((a, b) => b.d - a.d);

    const placements = [CONFIG.billboards.signal, ...CONFIG.billboards.nearMissSignals];
    placements.forEach((content, i) => {
        const cell = deadEnds[i];
        if (!cell) return;
        const { c: sc, r: sr } = cell;
        for (const [dc, dr] of [[QP[4747], QP[4748]], [QP[4749], QP[4750]], [QP[4751], QP[4752]], [QP[4753], QP[4754]]]) {
            const bc = sc + dc, br = sr + dr;
            if (!grid[br]?.[bc]) continue;  
             
             
             
             
             
             
            const moduleKey = `${br},${bc}`;
            const facade = buildingFacades.find(f => f.moduleKey === moduleKey && f.dx === -dc && f.dz === -dr);
            if (!facade) continue;
            const spot = findFreeFacadeRect(facade, i === QP[4755] ? 'photo' : 'sign', i === QP[4756] ? QP[4757] : QP[4758], i === QP[4759] ? QP[4760] * (QP[4761] / QP[4762]) : QP[4763], facade.yMin + QP[4764], Math.min(facade.yMax - QP[4765], facade.yMin + QP[4766]));
            if (!spot) continue;
            const p = pointOnFacade(facade, spot.u, spot.v);
            if (i === QP[4767]) {
                 
                 
                 
                 
                placePhotoPoster('portrait', p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, { width: QP[4768], frameColor: '#ffffff' });
            } else {
                addSign(p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, content.color);
            }
            break;
        }
    });
}

 
const shuffledPlazas = [...plazaCells].sort(() => rng() - QP[4769]);
let plazaCursor = QP[4770];
function nextPlazaCell() {
    return plazaCursor < shuffledPlazas.length ? shuffledPlazas[plazaCursor++] : null;
}

for (let i = QP[4771]; i < CONFIG.props.maxSpecialFeatures.statues; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4772]], cell[QP[4773]]);
    const r = addStatue(x, z);
    propColliders.push({ x, z, radius: r, height: QP[4774] });
}
for (let i = QP[4775]; i < CONFIG.props.maxSpecialFeatures.constructionZones; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4776]], cell[QP[4777]]);
    const r = addConstructionZone(x, z);
     
     
    propColliders.push({ x, z, radius: r, height: Infinity });
}
for (let i = QP[4778]; i < CONFIG.props.maxSpecialFeatures.crimeScenes; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4779]], cell[QP[4780]]);
    addCrimeScene(x, z);  
}
for (let i = QP[4781]; i < CONFIG.props.maxSpecialFeatures.newsstands; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4782]], cell[QP[4783]]);
    const r = addNewsstand(x, z, plazaFacingRotY(cell[QP[4784]], cell[QP[4785]]));
    propColliders.push({ x, z, radius: r, height: QP[4786] });
}
for (let i = QP[4787]; i < CONFIG.props.maxSpecialFeatures.phoneBooths; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4788]], cell[QP[4789]]);
    const r = addPhoneBooth(x, z);
    propColliders.push({ x, z, radius: r, height: QP[4790] });
}
for (let i = QP[4791]; i < CONFIG.props.maxSpecialFeatures.atmKiosks; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4792]], cell[QP[4793]]);
    const r = addAtmKiosk(x, z, plazaFacingRotY(cell[QP[4794]], cell[QP[4795]]));
    propColliders.push({ x, z, radius: r, height: QP[4796] });
}
const parkCells = new Set();  
for (let i = QP[4797]; i < CONFIG.props.maxSpecialFeatures.parks; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4798]], cell[QP[4799]]);
     
     
     
     
     
     
     
     
     
    addPark(x, z, cell[QP[4800]], cell[QP[4801]]);
    parkCells.add(`${cell[QP[4802]]},${cell[QP[4803]]}`);
}
for (let i = QP[4804]; i < CONFIG.props.maxSpecialFeatures.megaBillboards; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[QP[4805]], cell[QP[4806]]);
    const r = addMegaBillboard(x, z);
     
     
    propColliders.push({ x, z, radius: r, height: Infinity });
}

 
 
for (const [pc, pr] of plazaCells) {
    const { x, z } = cellToWorld(pc, pr);
    addPlazaGlow(x, z);
    if (rng() < QP[4807] * QUALITY.propDensity) scatterJunk('plaza', x, z, QP[4808] + Math.floor(rng() * QP[4809]), Math.min(colHalf(pc), rowHalf(pr)) * QP[4810]);
}

 
 
 
const WALL_HUGGING_PROPS = new Set([
    'trashCan', 'vendingMachine', 'museumPlacard', 'trafficSign', 'trafficSignal', 'mileMarker', 'wantedPoster',
    'lantern', 'weeds', 'fenceSegment', 'stickerTag', 'businessCardLitter',
]);
const ROAD_ONLY_PROPS = new Set(['trafficSign', 'trafficSignal', 'mileMarker', 'manhole']);

 
 
 
 
 
const groundSurfaceSystem = createGroundSurfaceSystem({
    CONFIG, JUNK_RENDER_CHUNK, GRID_ROWS, GRID_COLS, grid, groundTex, unitPlaneGeo, skirtBoxGeo,
    colSize, rowSize, colHalf, rowHalf, cellToWorld, wallDirections, parkCells, makePixelTexture,
    scene, camera, testYieldNow: testPublishAndYieldNow, testYieldIfNeeded: testPublishAndYieldIfNeeded,
});
const { isStreetCell, roadOpenMask, layOpenCellSurfaces } = groundSurfaceSystem;

function addBench(x, z, rotY) {
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

 
 
 
 
 
 
function addMegaBillboard(x, z) {
    const rotY = randRange(QP[4930], Math.PI * QP[4931]);
    const frameMat = new THREE.MeshStandardMaterial({ color: QP[4932], roughness: QP[4933], metalness: QP[4934] });
    const g = new THREE.Group();
    for (const side of [QP[4935], QP[4936]]) {
        const leg = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[4937], QP[4938], QP[4939], QP[4940]), QP[4941]), frameMat);
        leg.position.set(side * QP[4942], QP[4943], QP[4944]);
        g.add(leg);
    }
    for (let i = QP[4945]; i < QP[4946]; i++) {
        const content = i === QP[4945] ? toContent(pick(CODE_LORE_PAIRS)) : pickSignContent(x, z);
        const neon = pick(CONFIG.neonPalette);
        const font = pickTextFont();
        const backing = pick(SIGN_BACKINGS);
        const tex = makePixelTexture((ctx, w, h) => {
            const color = hexToCss(neon);
            ctx.fillStyle = backing;
            ctx.fillRect(QP[4947], QP[4948], w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = QP[4949];
            ctx.strokeRect(QP[4950], QP[4951], w - QP[4952], h - QP[4953]);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.font = `bold 34px ${font}`;
            ctx.fillText(content.title, w / QP[4954], h / QP[4955] - QP[4956], w - QP[4957]);
            ctx.font = `18px ${font}`;
            ctx.fillText(content.subtitle, w / QP[4958], h / QP[4959] + QP[4960], w - QP[4961]);
        }, QP[4962], QP[4963]);
        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[4964], QP[4965]),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        panel.position.set(QP[4966], QP[4967] + i * QP[4968], QP[4969]);
        g.add(panel);

        if (dynamicLightsRemaining > QP[4970]) {
            dynamicLightsRemaining--;
            const light = new THREE.PointLight(neon, QP[4971], QP[4972], QP[4973]);
            light.position.set(QP[4974], QP[4975] + i * QP[4976], QP[4977]);
            g.add(light);
        }
    }
    g.rotation.y = rotY;
    g.position.set(x, QP[4978], z);
    scene.add(g);
    return QP[4979];
}

function sharedGrassMaterial() {
    if (_sharedGrassMaterial) return _sharedGrassMaterial;
    const lr = localRng(hashString32(`${SEED}:shared-grass`));
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#3a5c2e'; ctx.fillRect(QP[4980], QP[4981], w, h);
        for (let i = QP[4982]; i < QP[4983]; i++) {
            const shade = QP[4984] + Math.floor(lr() * QP[4985]);
            ctx.fillStyle = `rgb(${QP[4986] + shade * QP[4987]},${QP[4988] + shade},${QP[4989] + shade * QP[4990]})`;
            ctx.fillRect(Math.floor(lr() * w), Math.floor(lr() * h), QP[4991], QP[4992]);
        }
    }, QP[4993], QP[4994]);
    _sharedGrassMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: QP[4995] });
    return _sharedGrassMaterial;
}

function addPark(x, z, col = null, row = null) {
     
     
     
     
    const hwx = col !== null ? colHalf(col) : BLOCK / QP[4996];
    const hwz = row !== null ? rowHalf(row) : BLOCK / QP[4997];
    const grass = new THREE.Mesh(unitPlaneGeo, sharedGrassMaterial());
    grass.rotation.x = -Math.PI / QP[4998];
    grass.scale.set(hwx * QP[4999] * QP[5000], hwz * QP[5001] * QP[5002], QP[5003]);
    grass.position.set(x, QP[5004], z);
    scene.add(grass);

    const clusterCount = QP[5005] + Math.floor(rng() * QP[5006]);
    for (let i = QP[5007]; i < clusterCount; i++) {
        const px = x + randRange(-hwx * QP[5008], hwx * QP[5009]);
        const pz = z + randRange(-hwz * QP[5010], hwz * QP[5011]);
        addTree(px, pz);
        propColliders.push({ x: px, z: pz, radius: QP[5012], height: PROP_HEIGHTS.tree });
    }
    const benchAngle = randRange(QP[5013], Math.PI * QP[5014]);
    addBench(x + Math.cos(benchAngle) * QP[5015], z + Math.sin(benchAngle) * QP[5016], benchAngle + Math.PI / QP[5017]);
    scatterJunk('park', x, z, QP[5018], Math.min(hwx, hwz) * QP[5019]);
    if (rng() < QP[5020]) placeRealModel('ironGate', x, z - hwz * QP[5021], QP[5022]);  
    return Math.min(hwx, hwz);
}

function wallDirections(c, r) {
    const dirs = [];
    if (grid[r]?.[c - QP[5023]]) dirs.push({ dx: QP[5024], dz: QP[5025] });
    if (grid[r]?.[c + QP[5026]]) dirs.push({ dx: QP[5027], dz: QP[5028] });
    if (grid[r - QP[5029]]?.[c]) dirs.push({ dx: QP[5030], dz: QP[5031] });
    if (grid[r + QP[5032]]?.[c]) dirs.push({ dx: QP[5033], dz: QP[5034] });
    return dirs;
}

 
 
 
 
function wallAnchorForOpenCell(c, r, w, standoff = QP[5035], tangentMargin = QP[5036]) {
    const bc = c + w.dx, br = r + w.dz;
    const fp = footprintOf[br]?.[bc];
    if (!fp) return null;
    const outwardX = -w.dx, outwardZ = -w.dz;
    let wallX = fp.cx, wallZ = fp.cz, tx = QP[5037], tz = QP[5038], lo, hi;
    const { x: openX, z: openZ } = cellToWorld(c, r);
    if (w.dx !== QP[5039]) {
        wallX = fp.cx - w.dx * fp.hwx;
        tx = QP[5040]; tz = QP[5041];
        lo = Math.max(fp.cz - fp.hwz, openZ - rowHalf(r)) + tangentMargin;
        hi = Math.min(fp.cz + fp.hwz, openZ + rowHalf(r)) - tangentMargin;
        if (lo > hi) return null;
        wallZ = randRange(lo, hi);
    } else {
        wallZ = fp.cz - w.dz * fp.hwz;
        tx = QP[5042]; tz = QP[5043];
        lo = Math.max(fp.cx - fp.hwx, openX - colHalf(c)) + tangentMargin;
        hi = Math.min(fp.cx + fp.hwx, openX + colHalf(c)) - tangentMargin;
        if (lo > hi) return null;
        wallX = randRange(lo, hi);
    }
    return {
        x: wallX + outwardX * standoff,
        z: wallZ + outwardZ * standoff,
        wallX, wallZ, tx, tz,
        normalX: outwardX, normalZ: outwardZ,
        rotY: outwardRotationY(outwardX, outwardZ),
        wallHeight: fp.height,
        tangentLo: lo, tangentHi: hi,
        building: fp,
    };
}

function clearSpotAlongWall(anchor, radius) {
    for (const shift of [QP[5044], QP[5045], QP[5046], QP[5047], QP[5048]]) {
        let px = anchor.x + anchor.tx * shift, pz = anchor.z + anchor.tz * shift;
        if (anchor.tx) px = THREE.MathUtils.clamp(px, anchor.tangentLo, anchor.tangentHi);
        if (anchor.tz) pz = THREE.MathUtils.clamp(pz, anchor.tangentLo, anchor.tangentHi);
        const blocked = propCandidatesNear(px, pz, radius + QP[5049]).some(p => {
            const dx = px - p.x, dz = pz - p.z;
            return dx * dx + dz * dz < (radius + p.radius + QP[5050]) ** QP[5051];
        });
        if (!blocked) return { ...anchor, x: px, z: pz };
    }
    return anchor;
}

 
 
 
 
function findCornerDirs(c, r) {
    const walls = wallDirections(c, r);
    for (let i = QP[5052]; i < walls.length; i++) {
        for (let j = i + QP[5053]; j < walls.length; j++) {
            const a = walls[i], b = walls[j];
            if (a.dx * b.dx + a.dz * b.dz === QP[5054]) return [a, b];  
        }
    }
    return null;
}

 

 
 
 
 
function throughAxis(c, r) {
    const openX = grid[r]?.[c - QP[5055]] === false && grid[r]?.[c + QP[5056]] === false;
    const openZ = grid[r - QP[5057]]?.[c] === false && grid[r + QP[5058]]?.[c] === false;
    if (openX && !openZ) return 'x';
    if (openZ && !openX) return 'z';
    return null;
}

 
 
 
 
 
function laneOffset(spread, axis) {
    if (!axis) return [randRange(-spread, spread), randRange(-spread, spread)];
    const side = (rng() < QP[5059] ? QP[5060] : QP[5061]) * randRange(QP[5062], QP[5063]) * spread;
    return axis === 'x' ? [randRange(-spread, spread), side] : [side, randRange(-spread, spread)];
}

 
 
 
 
function findClearSpot(cx, cz, radius, tryOffsets) {
    for (const [ox, oz] of tryOffsets) {
        const px = cx + ox, pz = cz + oz;
        const blocked = propCandidatesNear(px, pz, radius + QP[5064]).some(p => {
            const dx = px - p.x, dz = pz - p.z;
            return dx * dx + dz * dz < (radius + p.radius + QP[5065]) ** QP[5066];
        });
        if (!blocked) return { x: px, z: pz };
    }
    return { x: cx + tryOffsets[QP[5067]][QP[5068]], z: cz + tryOffsets[QP[5069]][QP[5070]] };  
}

flushHorizontalPlaneBatches();
await layOpenCellSurfaces();
await testCompileSceneIfDirty();
await testYieldNow('ground complete · seeding nearby real props');

 
 
 
 
 
 
 
 
const usedPlazas = new Set(shuffledPlazas.slice(QP[5071], plazaCursor).map(([c, r]) => `${c},${r}`));
const CLUTTER_MACRO_SPAN = QP[5072];
const clutterMacroCache = new Map();

function clutterMacroValue(mx, mz) {
    const key = `${mx},${mz}`;
    let value = clutterMacroCache.get(key);
    if (value !== undefined) return value;
    const lr = localRng(hashString32(`${SEED}:clutter-district:${mx}:${mz}`));
    const roll = lr();
     
     
     
    if (roll < QP[5073]) value = QP[5074] + lr() * QP[5075];           
    else if (roll > QP[5076]) value = QP[5077] + lr() * QP[5078];     
    else value = QP[5079] + lr() * QP[5080];                      
    clutterMacroCache.set(key, value);
    return value;
}

function districtClutterDensity(c, r) {
    const gx = c / CLUTTER_MACRO_SPAN, gz = r / CLUTTER_MACRO_SPAN;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    let tx = gx - x0, tz = gz - z0;
    tx = tx * tx * (QP[5081] - QP[5082] * tx);  
    tz = tz * tz * (QP[5083] - QP[5084] * tz);
    const a = THREE.MathUtils.lerp(clutterMacroValue(x0, z0), clutterMacroValue(x0 + QP[5085], z0), tx);
    const b = THREE.MathUtils.lerp(clutterMacroValue(x0, z0 + QP[5086]), clutterMacroValue(x0 + QP[5087], z0 + QP[5088]), tx);
    return THREE.MathUtils.clamp(THREE.MathUtils.lerp(a, b, tz), QP[5089], QP[5090]);
}

function decorateOpenCell(c, r) {
    if (grid[r]?.[c]) return false;
    if (c === spawnCol && r === spawnRow) return false;
    const cellKey = `${c},${r}`;
    if (usedPlazas.has(cellKey) || parkCells.has(cellKey)) return false;

    const { x, z } = cellToWorld(c, r);
    const chx = colHalf(c), chz = rowHalf(r);
    const onStreet = isStreetCell(c, r);
    const laneAxis = throughAxis(c, r);
    const wallsHere = wallDirections(c, r);
    const districtDensity = districtClutterDensity(c, r);
    const localDensity = QUALITY.propDensity * districtDensity;
    const pileScale = THREE.MathUtils.clamp(districtDensity, QP[5091], QP[5092]);
    let pileSpot = null;

     
     
     
    const corner = findCornerDirs(c, r);
    const cornerChance = Math.min(QP[5093], (onStreet ? QP[5094] : QP[5095]) * localDensity);
    const wallChance = Math.min(QP[5096], (onStreet ? QP[5097] : QP[5098]) * localDensity);
    if (corner && rng() < cornerChance) {
        const intoX = corner[QP[5099]].dx + corner[QP[5100]].dx, intoZ = corner[QP[5101]].dz + corner[QP[5102]].dz;
        const len = Math.hypot(intoX, intoZ) || QP[5103];
        const bx = intoX / len, bz = intoZ / len;
        const reach = Math.min(chx, chz) * QP[5104];
        const px = x + bx * reach, pz = z + bz * reach;
        const dirtyBonus = districtDensity > QP[5105] ? QP[5106] + Math.floor((districtDensity - QP[5107]) * QP[5108]) : QP[5109];
        const pile = pileJunkCluster(onStreet ? 'street' : 'alley', px, pz, {
            backX: bx, backZ: bz,
            tiers: Math.min(QP[5110], (onStreet ? QP[5111] : QP[5112]) + dirtyBonus + (rng() < QP[5113] * pileScale ? QP[5114] : QP[5115])),
            spread: Math.min(QP[5116], Math.min(chx, chz) * (QP[5117] + QP[5118] * pileScale)),
            baseCount: Math.min(QP[5119], (onStreet ? QP[5120] : QP[5121]) + Math.floor(QP[5122] * pileScale)),
            spill: Math.min(QP[5123], Math.floor(QP[5124] + pileScale)),
        });
        if (pile) pileSpot = pile;
    } else if (wallsHere.length && rng() < wallChance) {
        const w = pick(wallsHere);
        const wall = wallAnchorForOpenCell(c, r, w, QP[5125], QP[5126]);
        if (wall) {
            const dirtyBonus = districtDensity > QP[5127] ? QP[5128] : QP[5129];
            const pile = pileJunkCluster(onStreet ? 'street' : 'alley', wall.x, wall.z, {
                backX: w.dx, backZ: w.dz,
                tiers: Math.min(QP[5130], (onStreet ? QP[5131] : QP[5132]) + dirtyBonus + (rng() < QP[5133] * pileScale ? QP[5134] : QP[5135])),
                spread: Math.min(QP[5136], (onStreet ? QP[5137] : QP[5138]) * pileScale),
                baseCount: Math.min(QP[5139], (onStreet ? QP[5140] : QP[5141]) + Math.floor(pileScale)),
                spill: districtDensity > QP[5142] ? QP[5143] + (rng() < QP[5144] ? QP[5145] : QP[5146]) : QP[5147],
            });
            if (pile) pileSpot = pile;
        }
    }

     
     
    const looseDensity = Math.sqrt(Math.max(QP[5148], districtDensity));
    if (onStreet) {
        if (rng() < Math.min(QP[5149], QP[5150] * QUALITY.propDensity * looseDensity)) {
            scatterJunk('street', x, z, QP[5151], Math.min(chx, chz) * QP[5152], laneAxis);
        }
        if (rng() < Math.min(QP[5153], QP[5154] * QUALITY.propDensity * looseDensity) && wallsHere.length) {
            const dir = pick(wallsHere);
            const lamp = wallAnchorForOpenCell(c, r, dir, QP[5155], QP[5156]);
            if (lamp) placeRealModel('streetLamp', lamp.x, lamp.z, lamp.rotY);
        }
    } else if (rng() < Math.min(QP[5157], QP[5158] * QUALITY.propDensity * looseDensity)) {
        scatterJunk('alley', x, z, QP[5159] + (districtDensity > QP[5160] && rng() < QP[5161] ? QP[5162] : QP[5163]), Math.min(chx, chz) * QP[5164], laneAxis);
    }

     
     
     
    if (pileSpot && districtDensity > QP[5165]) {
        const accentChance = Math.min(QP[5166], QP[5167] + (districtDensity - QP[5168]) * QP[5169]) * QUALITY.propDensity;
        if (rng() < accentChance) placeRealModel('tyre', pileSpot.x + randRange(QP[5170], QP[5171]), pileSpot.z + randRange(QP[5172], QP[5173]), randRange(QP[5174], Math.PI * QP[5175]));
        if (rng() < accentChance) placeRealModel('trashbag', pileSpot.x + randRange(QP[5176], QP[5177]), pileSpot.z + randRange(QP[5178], QP[5179]), randRange(QP[5180], Math.PI * QP[5181]));
    }
    if (onStreet && rng() < Math.min(QP[5182], QP[5183] * QUALITY.propDensity * looseDensity)) {
        placeRealModel('manhole', x + randRange(QP[5184], QP[5185]), z + randRange(QP[5186], QP[5187]), randRange(QP[5188], Math.PI * QP[5189]));
    }
    if (wallsHere.length && districtDensity > QP[5190] && rng() < Math.min(QP[5191], QP[5192] * localDensity)) {
        const bin = wallAnchorForOpenCell(c, r, pick(wallsHere), QP[5193], QP[5194]);
        if (bin) placeRealModel('trashCanReal', bin.x, bin.z, bin.rotY);
    }

     
     
    const wireChance = THREE.MathUtils.clamp(QP[5195] + districtDensity * QP[5196], QP[5197], QP[5198]);
    if (grid[r]?.[c - QP[5199]] && grid[r]?.[c + QP[5200]]) {
        const a = footprintOf[r][c - QP[5201]], b = footprintOf[r][c + QP[5202]];
        if (a && b && rng() < wireChance) {
            const zLo = Math.max(a.cz - a.hwz, b.cz - b.hwz, z - chz * QP[5203]);
            const zHi = Math.min(a.cz + a.hwz, b.cz + b.hwz, z + chz * QP[5204]);
            if (zHi - zLo > QP[5205]) {
                const cableZ = randRange(zLo + QP[5206], zHi - QP[5207]);
                addOverheadCable(a.cx + a.hwx + QP[5208], cableZ, a.height, b.cx - b.hwx - QP[5209], cableZ, b.height);
            }
        }
    }
    if (grid[r - QP[5210]]?.[c] && grid[r + QP[5211]]?.[c]) {
        const a = footprintOf[r - QP[5212]][c], b = footprintOf[r + QP[5213]][c];
        if (a && b && rng() < wireChance) {
            const xLo = Math.max(a.cx - a.hwx, b.cx - b.hwx, x - chx * QP[5214]);
            const xHi = Math.min(a.cx + a.hwx, b.cx + b.hwx, x + chx * QP[5215]);
            if (xHi - xLo > QP[5216]) {
                const cableX = randRange(xLo + QP[5217], xHi - QP[5218]);
                addOverheadCable(cableX, a.cz + a.hwz + QP[5219], a.height, cableX, b.cz - b.hwz - QP[5220], b.height);
            }
        }
    }

    const t = webAlignment(z);
    const gradientMul = THREE.MathUtils.lerp(
        CONFIG.narrative.darkWeb.propDensityMul, CONFIG.narrative.lightWeb.propDensityMul, t
    ) * (onStreet ? CONFIG.streets.propDensityMul : QP[5221]);

    const choice = weightedPick(CONFIG.props.weights);
    if (choice === 'none') return true;
    if (ROAD_ONLY_PROPS.has(choice) && !onStreet) return true;
    if (choice === 'trafficSignal') {
        const mask = roadOpenMask(c, r);
        const horizontal = !!(mask & QP[5222]) || !!(mask & QP[5223]);
        const vertical = !!(mask & QP[5224]) || !!(mask & QP[5225]);
        if (!horizontal || !vertical) return true;
    }

    const wallBound = WALL_HUGGING_PROPS.has(choice);
    const districtSingletonMul = THREE.MathUtils.clamp(QP[5226] + districtDensity * QP[5227], QP[5228], QP[5229]);
    const singletonChance = Math.min(QP[5230],
        QUALITY.propDensity * gradientMul * districtSingletonMul
        * (wallBound ? QP[5231] : QP[5232]) * (pileSpot && !wallBound ? QP[5233] : QP[5234]));
    if (rng() > singletonChance) return true;

    let px, pz;
    let facingRotY;
    let placementMeta = null;
    if (WALL_HUGGING_PROPS.has(choice)) {
        if (wallsHere.length) {
            const w = pick(wallsHere);
            const standoffByType = {
                wantedPoster: QP[5235], stickerTag: QP[5236], businessCardLitter: QP[5237],
                fenceSegment: QP[5238], trafficSign: QP[5239], mileMarker: QP[5240],
                museumPlacard: QP[5241], trashCan: QP[5242], vendingMachine: QP[5243],
                lantern: QP[5244], trafficSignal: QP[5245], weeds: QP[5246],
            };
            const raw = wallAnchorForOpenCell(c, r, w, standoffByType[choice] ?? QP[5247], QP[5248]);
            if (raw) {
                placementMeta = clearSpotAlongWall(raw, choice === 'vendingMachine' ? QP[5249] : QP[5250]);
                px = placementMeta.x; pz = placementMeta.z; facingRotY = placementMeta.rotY;
            }
        }
        if (px === undefined) {
            if (choice === 'wantedPoster' || choice === 'stickerTag') return true;
            px = x + randRange(-chx * QP[5251], chx * QP[5252]);
            pz = z + randRange(-chz * QP[5253], chz * QP[5254]);
        }
    } else {
        const jitter = Math.min(chx, chz) * QP[5255];
        const spot = findClearSpot(x, z, QP[5256], [
            laneOffset(jitter, laneAxis),
            laneOffset(jitter, laneAxis),
            [QP[5257], QP[5258]],
        ]);
        px = spot.x; pz = spot.z;
    }

    const radius = PROP_BUILDERS[choice](px, pz, facingRotY, placementMeta);
    propColliders.push({ x: px, z: pz, radius, height: PROP_HEIGHTS[choice] ?? QP[5259] });
    if (choice === 'tree') addThicketShade(x, z);
    return true;
}

const DECOR_SECTOR_SPAN = QP[5260];
const decorationSectorMap = new Map();
const decorationSectors = [];
function decorationSectorFor(c, r) {
    const sx = Math.floor(c / DECOR_SECTOR_SPAN), sz = Math.floor(r / DECOR_SECTOR_SPAN);
    const key = `${sx},${sz}`;
    let sector = decorationSectorMap.get(key);
    if (!sector) {
        sector = { key, sx, sz, cells: [], cursor: QP[5261], status: 'pending', centerX: QP[5262], centerZ: QP[5263] };
        decorationSectorMap.set(key, sector);
        decorationSectors.push(sector);
    }
    return sector;
}
for (let r = QP[5264]; r < GRID_ROWS - QP[5265]; r++) {
    for (let c = QP[5266]; c < GRID_COLS - QP[5267]; c++) {
        if (grid[r][c]) continue;
        if (c === spawnCol && r === spawnRow) continue;
        const key = `${c},${r}`;
        if (usedPlazas.has(key) || parkCells.has(key)) continue;
        decorationSectorFor(c, r).cells.push([c, r]);
    }
}
for (const sector of decorationSectors) {
    const c = Math.min(GRID_COLS - QP[5268], Math.max(QP[5269], sector.sx * DECOR_SECTOR_SPAN + DECOR_SECTOR_SPAN * QP[5270]));
    const r = Math.min(GRID_ROWS - QP[5271], Math.max(QP[5272], sector.sz * DECOR_SECTOR_SPAN + DECOR_SECTOR_SPAN * QP[5273]));
    const pos = cellToWorld(Math.floor(c), Math.floor(r));
    sector.centerX = pos.x; sector.centerZ = pos.z;
}

let initialDecorationCells = QP[5274];
let initialDecorationSectors = QP[5275];
const initialDecorationCount = Math.min(decorationSectors.length, (QP[5276] * 2 + 1) ** 2);
const initialDecorationOrder = decorationSectors.slice().sort((a, b) => {
    const adx = a.centerX - camera.position.x, adz = a.centerZ - camera.position.z;
    const bdx = b.centerX - camera.position.x, bdz = b.centerZ - camera.position.z;
    return (adx * adx + adz * adz) - (bdx * bdx + bdz * bdz);
});
for (const sector of initialDecorationOrder.slice(0, initialDecorationCount)) {
    sector.status = 'generated';
    sector.cursor = sector.cells.length;
    initialDecorationSectors++;
    for (const [c, r] of sector.cells) {
        if (runWithStableStreamingRng(`decor:${c}:${r}`, () => decorateOpenCell(c, r))) initialDecorationCells++;
    }
    await testYieldIfNeeded('seeding nearest real props', initialDecorationSectors, initialDecorationCount);
}
finalizeOverheadCables();

const deferredDecorationStats = {
    totalSectors: decorationSectors.length,
    generatedSectors: initialDecorationSectors,
    generatedCells: initialDecorationCells,
    queuedSectors: QP[5277],
    pendingSectors: Math.max(QP[5278], decorationSectors.length - initialDecorationSectors),
    lastPumpMs: QP[5279],
};
const decorationQueue = [];
let decorationIdleHandle = null;
let decorationStreamTimer = QP[5280];

function sortDecorationQueueNearPlayer() {
    decorationQueue.sort((a, b) => {
        const adx = a.centerX - camera.position.x, adz = a.centerZ - camera.position.z;
        const bdx = b.centerX - camera.position.x, bdz = b.centerZ - camera.position.z;
        return (adx * adx + adz * adz) - (bdx * bdx + bdz * bdz);
    });
}

function queueDecorationNear(x, z) {
    const prefetch = QUALITY.drawDistance * QP[5281] + JUNK_RENDER_CHUNK;
    const prefetchSq = prefetch * prefetch;
    const candidates = [];
    for (const sector of decorationSectors) {
        if (sector.status !== 'pending') continue;
        const dx = sector.centerX - x, dz = sector.centerZ - z;
        const d2 = dx * dx + dz * dz;
         
         
         
        candidates.push([d2 <= prefetchSq ? 0 : 1, d2, sector]);
    }
    candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const admit = Math.min(QP[5284], candidates.length);
    for (let i = QP[5285]; i < admit; i++) {
        const sector = candidates[i][2];
        sector.status = 'queued';
        decorationQueue.push(sector);
    }
    sortDecorationQueueNearPlayer();
    deferredDecorationStats.queuedSectors = decorationQueue.length;
    scheduleDecorationPump();
}

function scheduleDecorationPump() {
    if (decorationIdleHandle !== null || !decorationQueue.length) return;
    if ('requestIdleCallback' in window) {
        decorationIdleHandle = requestIdleCallback(pumpDecoration, { timeout: QP[5287] });
    } else {
        decorationIdleHandle = setTimeout(() => pumpDecoration(null), QP[5288]);
    }
}

function pumpDecoration(deadline) {
    decorationIdleHandle = null;
    sortDecorationQueueNearPlayer();
    const started = performance.now();
    let cellsDone = QP[5289];
    const hardBudgetMs = QP[5290];
    const maxCells = QP[5291];
    while (decorationQueue.length && cellsDone < maxCells) {
        if (cellsDone > QP[5292]) {
            const elapsed = performance.now() - started;
            const idleLow = deadline && !deadline.didTimeout && deadline.timeRemaining() < QP[5293];
            if (elapsed >= hardBudgetMs || idleLow) break;
        }
        const sector = decorationQueue[QP[5294]];
        const cell = sector.cells[sector.cursor++];
        if (cell) {
            if (runWithStableStreamingRng(`decor:${cell[QP[5295]]}:${cell[QP[5296]]}`, () => decorateOpenCell(cell[QP[5295]], cell[QP[5296]]))) deferredDecorationStats.generatedCells++;
            cellsDone++;
        }
        if (sector.cursor >= sector.cells.length) {
            sector.status = 'generated';
            decorationQueue.shift();
            deferredDecorationStats.generatedSectors++;
            deferredDecorationStats.pendingSectors--;
        }
    }
    if (cellsDone) {
        finalizeOverheadCables(false);
        playerPhysics.syncDynamicWorld();
        deferredDecorationStats.lastPumpMs = performance.now() - started;
    }
    deferredDecorationStats.queuedSectors = decorationQueue.length;
    if (decorationQueue.length) scheduleDecorationPump();
}

function updateDecorationStreaming(delta) {
    decorationStreamTimer -= delta;
    if (decorationStreamTimer > QP[5297]) return;
    decorationStreamTimer = QP[5298];
    if (decorationQueue.length < QP[5299]) queueDecorationNear(camera.position.x, camera.position.z);
}

console.log(`[perf] decoration streaming: ${initialDecorationCells} nearby cells in ${initialDecorationSectors}/${decorationSectors.length} sectors generated synchronously; remaining sectors load near the camera during idle time`);

 

 

 
 
 
 
let touchMoveVec = { x: QP[5301], y: QP[5302] };
const velocity = new THREE.Vector3();  
const _moveForwardWorld = new THREE.Vector3();
const _moveRightWorld = new THREE.Vector3();

 
 
 


const spawn = cellToWorld(spawnCol, spawnRow);
if (!_testBootstrapHasMoved) camera.position.set(spawn.x, CONFIG.camera.eyeHeight, spawn.z);
else camera.position.y = CONFIG.camera.eyeHeight;

 
 
 
 
 
if (urlLandmark) {
    const landmarkInstance = signatureInstances.find(s => s.type === urlLandmark);
    if (landmarkInstance) {
        const e = landmarkInstance.mainEntrance;
        camera.position.set(e.outsideX, CONFIG.camera.eyeHeight, e.outsideZ);
        camera.rotation.set(QP[5318], e.facingRotY, QP[5319]);
        console.log(`[signature] ?landmark=${urlLandmark} -- spawning outside site ${landmarkInstance.id}'s main entrance instead of a random cell`);
    } else {
        console.warn(`[signature] ?landmark=${urlLandmark} requested, but no such signature was reserved this seed (disabled this load, or not a real key: ${SIGNATURE_TYPES.join(', ')})`);
    }
}

playerPhysics.syncFromPosition({ forceAirborne: false, resetVelocity: false });
playerPhysics.syncDynamicWorld();
_spawnDistrictStructuresComplete = true;
await testYieldNow('nearest authored district collision-ready · releasing construction safety gate');

 
 
 
const _worldStreamHeading = new THREE.Vector3();
infiniteChunkFactory = createInfiniteCityChunkFactory({
    THREE, scene, playerPhysics, directSceneAdd: _origSceneAdd, chunkSize: STREAM_CHUNK_SIZE, worldSeed: SEED, spawnChunkKey: '0,0',
     
     
     
    landmarkSpacingChunks: CONFIG.streaming.landmarkSpacingChunks,
     
     
     
     
     
    yieldControl: null,
});
worldChunkStreamer = createWorldChunkStreamer({
    chunkSize: STREAM_CHUNK_SIZE,
    worldSeed: SEED,
    getPlayerPosition: () => camera.position,
    getPlayerHeading: () => camera.getWorldDirection(_worldStreamHeading),
    renderRadiusChunks: CONFIG.streaming.renderRadiusChunks,
    prefetchRadiusChunks: CONFIG.streaming.prefetchRadiusChunks,
    retentionRadiusChunks: CONFIG.streaming.retentionRadiusChunks,
    pinnedChunkKeys: ['0,0'],
    weirdness: { startRadius: 1.5, fullRadius: 36, curve: 1.3 },
    buildChunk: chunk => infiniteChunkFactory.build(chunk),
    commitChunk: (chunk, payload) => infiniteChunkFactory.commit(chunk, payload),
    setChunkVisibility: (chunk, payload, visible) => infiniteChunkFactory.setVisible(chunk, payload, visible),
    verifyChunkReady: (chunk, payload, visible) => infiniteChunkFactory.verifyReady(chunk, payload, visible),
    unloadChunk: (chunk, payload) => infiniteChunkFactory.unload(chunk, payload),
     
     
    yieldControl: null,
    onChunkState: (chunk, state) => {
        if (state === 'ready' || state === 'unloaded') {
            console.log(`[world] chunk ${chunk.key} ${state} · weirdness=${chunk.weirdness.sampled.toFixed(3)}`);
        }
    },
});
const spawnSingularManifest = createSpawnSingularManifest(SEED, signatureInstances);
worldChunkStreamer.markChunkReady(0, 0, {
    formatVersion: WORLD_FORMAT_VERSION,
    spawnDistrict: true,
    singulars: spawnSingularManifest,
});
worldChunkStreamer.ensureNeighborhood();

 

 
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
        if (e.target.closest('#escapeSiteButton, #parameterEditorRoot, #musicPlayer')) return;
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
let trafficSignalUpdateTimer = QP[5342];
let worldChunkPumpPromise = null;
let worldChunkNextKickAt = 0;
let backgroundEnrichmentReleased = false;
let wikiEnrichmentScheduled = false;

function maybeReleaseBackgroundEnrichment() {
    if (backgroundEnrichmentReleased || !worldChunkStreamer) return false;
    const worldStats = worldChunkStreamer.stats();
     
     
     
    if (!worldStats.localPrefetchRing.complete) return false;
    backgroundEnrichmentReleased = true;
    adornmentLoadQueue.resume();
    console.log('[asset] structural 7x7 warm · releasing bounded adornment queue', adornmentLoadQueue.stats());
    if (!wikiEnrichmentScheduled) {
        wikiEnrichmentScheduled = true;
        const runWiki = () => fetchRandomWikiArticles(QP[5300]);
        if ('requestIdleCallback' in window) requestIdleCallback(runWiki, { timeout: 2000 });
        else setTimeout(runWiki, 0);
    }
    return true;
}

function pumpWorldChunksAggressively() {
    if (!worldChunkStreamer || worldChunkPumpPromise || performance.now() < worldChunkNextKickAt) return;
    const before = worldChunkStreamer.stats();
    const renderWarm = before.localRenderRing.complete;
    const prefetchWarm = before.localPrefetchRing.complete;
     
     
     
     
     
    const maxChunks = !renderWarm
        ? CONFIG.streaming.urgentPumpChunks
        : !prefetchWarm
            ? CONFIG.streaming.prefetchPumpChunks
            : CONFIG.streaming.warmPumpChunks;
    const maxMillis = !renderWarm
        ? CONFIG.streaming.urgentBuildBudgetMs
        : !prefetchWarm
            ? CONFIG.streaming.prefetchBuildBudgetMs
            : CONFIG.streaming.warmBuildBudgetMs;
    const warmCooldownMs = renderWarm && prefetchWarm ? CONFIG.streaming.warmCooldownMs : 0;
    worldChunkPumpPromise = worldChunkStreamer.pump({ maxChunks, maxMillis })
        .then(builtAny => {
            if (!builtAny) return;
            const after = worldChunkStreamer.stats();
            const t = after.throughput;
            const assets = adornmentLoadQueue.stats();
            console.log(`[world-perf] pump ${t.lastPumpBuilt} chunk(s) in ${t.lastPumpMs.toFixed(1)}ms · avg build ${t.avgBuildMs.toFixed(2)}ms · commit→visible ${t.avgCommitToVisibleMs.toFixed(2)}ms · render ${after.localRenderRing.ready}/${after.localRenderRing.total} · prefetch ${after.localPrefetchRing.ready}/${after.localPrefetchRing.total} · assets ${assets.active}/${assets.concurrency} active + ${assets.pending} pending · failed ${assets.failed}`);
            maybeReleaseBackgroundEnrichment();
        })
        .catch(error => console.error('[world] chunk pump failed', error))
        .finally(() => {
            worldChunkPumpPromise = null;
            worldChunkNextKickAt = performance.now() + warmCooldownMs;
        });
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
    updateDecorationStreaming(delta);
     
     
     
    pumpWorldChunksAggressively();
    maybeReleaseBackgroundEnrichment();

    for (const f of flickerLights) {
        f.light.intensity = f.mode === 'blink'
            ? (Math.floor(elapsedTime * f.speed + f.phase) % QP[5343] === QP[5344] ? f.base : QP[5345])
            : f.base * (QP[5346] + QP[5347] * Math.sin(elapsedTime * f.speed + f.phase));
    }

     
     
     
    trafficSignalUpdateTimer += delta;
    if (trafficSignalUpdateTimer >= QP[5348]) {
        trafficSignalUpdateTimer %= QP[5349];
        for (const s of trafficSignals) {
            const cyclePos = (elapsedTime + s.phase) % QP[5350];
            const on = cyclePos < QP[5351] ? 'red' : cyclePos < QP[5352] ? 'green' : 'yellow';
            if (s.state === on) continue;
            s.state = on;
            s.redMat.color.set(on === 'red' ? QP[5353] : QP[5354]);
            s.greenMat.color.set(on === 'green' ? QP[5355] : QP[5356]);
            s.yellowMat.color.set(on === 'yellow' ? QP[5357] : QP[5358]);
            if (s.light) s.light.color.set(on === 'red' ? QP[5359] : on === 'green' ? QP[5360] : QP[5361]);
        }
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
        updateWebGradient(camera.position.z, camera.position.y, elapsedTime);
        updateRain(delta);
        const _freecamRenderStarted = performance.now();
        const _freecamOverrideMaterial = scene.overrideMaterial;
        if (bootstrapPreviewOverrideActive) scene.overrideMaterial = bootstrapPreviewMaterial;
        composer.render();
        scene.overrideMaterial = _freecamOverrideMaterial;
        runtimeLatency.record('render.full', performance.now() - _freecamRenderStarted, { mode: 'freecam', sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, preview: bootstrapPreviewOverrideActive });
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

    updateWebGradient(camera.position.z, camera.position.y, elapsedTime);
    updateRain(delta);

    if (materialRefinementController) {
        if (now >= materialRefinementReprioritizeAt) {
            const priorityResult = materialRefinementController.reprioritize();
            if (priorityResult.sorted) runtimeLatency.record('material.refinement-priority', priorityResult.ms, priorityResult);
            materialRefinementReprioritizeAt = now + 750;
        }
        const refinementResult = materialRefinementController.pump({ maxItems: QUALITY === CONFIG.quality.desktop ? 6 : 3, maxReveals: 1, maxMillis: 2 });
        if (refinementResult.restored) runtimeLatency.record('material.refinement-pump', refinementResult.ms, { ...refinementResult, ...materialRefinementController.stats() });
        if (materialRefinementController.stats().complete && _testRefinementActive) {
            _testRefinementActive = false;
            restoreFinalRenderQuality();
            console.log('[perf] authored material refinement complete', materialRefinementController.stats());
        }
    }
    const _runtimeRenderStarted = performance.now();
    const _runtimeOverrideMaterial = scene.overrideMaterial;
    if (bootstrapPreviewOverrideActive) scene.overrideMaterial = bootstrapPreviewMaterial;
    composer.render();
    scene.overrideMaterial = _runtimeOverrideMaterial;
    runtimeLatency.record('render.full', performance.now() - _runtimeRenderStarted, { mode: 'player', sceneChildren: scene.children.length, drawCalls: renderer.info.render.calls, preview: bootstrapPreviewOverrideActive, materialPending: materialRefinementController?.stats().pending ?? 0 });

     
     
     
     
    fpsFrameCount++;
    const nowMs = performance.now();
    if (nowMs - fpsLastLogMs > QP[5394]) {
        const fps = (fpsFrameCount * QP[5395]) / (nowMs - fpsLastLogMs);
        const ri = renderer.info;
        const chunkStats = staticWorldOptimizer?.getStats();
        console.log(`[perf] ~${fps.toFixed(QP[5396])} fps | calls=${ri.render.calls} tris=${ri.render.triangles} | geo=${ri.memory.geometries} tex=${ri.memory.textures}`
            + ` | chunks=${chunkStats?.visibleChunks ?? '-'}/${chunkStats?.chunks ?? '-'} | deco=${deferredDecorationStats.generatedSectors}/${deferredDecorationStats.totalSectors}`
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

refreshAnimatedMaterials();

console.log(`[perf] spawn structural handoff at ${bootElapsed()} since page start -- starting live world stream before static refinement`);
testStatus('spawn playable · refinement continues in live runtime');
bootStatus(`spawn playable (${bootElapsed()}) · world streaming`);
_backgroundCompileSchedulingEnabled = true;
scheduleBootstrapCompilePump();
_testBootstrapActive = false;
console.log(`[stream-perf] bootstrap handoff after ${_testBootstrapFrame} painted frames; full physics/runtime now authoritative`);
animate();
window.__boot?.ready();

await testYieldNow('optimizing spawn chunk · background refinement');
const staticOptimizeStart = performance.now();
await staticWorldOptimizer.finalizeIncremental({
    yieldControl: (phase, done, total) => testYieldIfNeeded(phase, done, total),
});
const staticWorldStats = staticWorldOptimizer.getStats();
materialRefinementController = createMaterialRefinementController({
    scene,
    camera,
    previewMaterial: bootstrapPreviewMaterial,
    dynamicMaterials: animatedMaterials,
});
console.log(`[perf] background static-world refinement ${(performance.now() - staticOptimizeStart).toFixed(QP[5426])}ms wall-clock:`, staticWorldStats);
while (!worldChunkStreamer.stats().localRenderRing.complete) {
    testStatus('warming playable chunk ring', worldChunkStreamer.stats().localRenderRing.ready, worldChunkStreamer.stats().localRenderRing.total);
    await testNextPaint();
}
const materialRefinementStart = materialRefinementController.prepare();
bootstrapPreviewOverrideActive = false;
materialRefinementReprioritizeAt = performance.now();
if (materialRefinementStart.complete) {
    _testRefinementActive = false;
    restoreFinalRenderQuality();
}
console.log('[perf] playable 5x5 chunk ring warm · staged authored material refinement started', materialRefinementStart);
console.log(`[perf] spawn refinement complete at ${bootElapsed()} since page start; live world remained authoritative throughout`);
scheduleTraversalValidation();

 
 
 
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
        currentWeirdness: (() => {
            const c = worldChunkStreamer?.getChunkAtWorld(camera.position.x, camera.position.z);
            return c?.weirdness ?? worldWeirdnessAt(0, 0, { worldSeed: SEED });
        })(),
        city: {
            cols: GRID_COLS, rows: GRID_ROWS, sites: buildingSites.length,
            rooftopDecks: rooftopDecks.length, propColliders: propColliders.length,
            rooftopCatwalks: rooftopCatwalkCount, hangingBridges: hangingBridgeCount,
            fireEscapeBridgeAnchors: verticalCirculationSystem.stats().fireEscapeBridgeAnchors, roadMaterialPool: groundSurfaceSystem.stats().roadMaterialPool,
            windowTexturePool: _windowTextureCache.size, buildingMaterialPool: _buildingFacadeMaterialCache.size,
            heroTowers: buildingConstructionSystem.stats().heroTowers, authoredStairTransitions: buildingConstructionSystem.stats().authoredStairTransitions,
            circulationValidationFailures: buildingConstructionSystem.stats().circulationValidationFailures, fireEscapeStories: verticalCirculationSystem.stats().fireEscapeStories,
            groundSurfaceBatches: groundSurfaceSystem.stats(), horizontalPlaneBatches: verticalCirculationSystem.stats().horizontalPlaneBatches,
        },
        decoration: {
            ...deferredDecorationStats,
            adornmentQueue: adornmentLoadQueue.stats(),
            backgroundEnrichmentReleased,
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
