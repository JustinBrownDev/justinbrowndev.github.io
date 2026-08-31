import { CUT_COMMON_KOWLOON_ENRICHMENT } from '../config/performance-isolation.js';
import { hashString32 } from '../world-chunk-streamer.js';
import { pickMassiveNoisePair, pickPoetryTag } from '../noise-data-bootstrap.js';
import { BASE_GRAFFITI_TAGS } from '../content/graffiti-content.js';
import { createProceduralTextExciter } from './procedural-text-exciter.js';
import { SEMANTIC_RUNTIME_PROP_ASSETS as SEMANTIC_INTERIOR_ASSETS, SEMANTIC_RUNTIME_PROP_ASSET_BY_ID as SEMANTIC_INTERIOR_ASSET_BY_ID } from '../vendor/city-pack/semantic-megapack/runtime-props-v6.js';
import { SEMANTIC_ROOM_RECIPES } from '../vendor/city-pack/semantic-megapack/room-recipes.js';
import { anyReservationIntersectsBox } from './circulation-reservations.js';
import { solveSemanticLayout } from './semantic-layout.js';
import { selectSemanticContextAsset, semanticContextCatalogStats } from './semantic-context-multiplier.js';
import { createExteriorPropFieldSystem } from './exterior-prop-field.js';
import { requiresSemanticExteriorPlacement, semanticExteriorProvenance, semanticPlacementPoint } from './semantic-exterior-authority.js';
import { semanticAssetAlignment, semanticAssetFitScale } from './semantic-asset-frame.js';
import { EXTERIOR_FIRST_PASS_KIND_ORDER, EXTERIOR_TASK_KIND_PRIORITY, compareExteriorPriorityKeys, exteriorTaskPriorityKey, exteriorTaskVisualImpact } from './exterior-spectacle-priority.js';
import { attachSpectacleMedia, compileExteriorCompositionAuthority, createExteriorCompositionCompiler } from './exterior-composition-authority.js';
import { createExteriorCoverageRuntime, exteriorCoverageSnapshot, noteMicroAheadCoverageViolation, recordExteriorCoverageResult } from './exterior-composition-runtime.js';
import { runCooperativeCompiler } from './architecture/semantic-plan-runtime.js';

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pick(rng, values) { return values[Math.floor(rng() * values.length) % values.length]; }

const DETAIL_PHASE = Object.freeze({
    STRUCTURAL_READY: 'structural-ready',
    REFINING: 'refining',
    READY: 'ready',
    DISPOSED: 'disposed',
});

const SIGN_BACKGROUNDS = Object.freeze(['#171717', '#231f1b', '#0d1d1f', '#271519', '#141922']);
const SIGN_INKS = Object.freeze(['#f5e7c8', '#f7d95d', '#b8e7df', '#ffb0b0', '#d6c7ff']);
const AWNING_COLORS = Object.freeze([0x6b3d3b, 0x35595f, 0x6a5d36, 0x4d496d, 0x5e4430]);
const PIPE_COLORS = Object.freeze([0x5f625f, 0x725d4a, 0x40565a, 0x615959]);
const IVY_COLORS = Object.freeze([0x394f32, 0x465a35, 0x2f4634, 0x52603b]);

function facadePoint(entity, side, along = 0, y = 2, facadeIndex = null) {
    const facade = Number.isInteger(facadeIndex) ? entity.facades?.[facadeIndex] : null;
    const x0 = facade?.x ?? entity.x;
    const z0 = facade?.z ?? entity.z;
    const halfX = facade?.halfX ?? entity.halfX ?? 2;
    const halfZ = facade?.halfZ ?? entity.halfZ ?? 2;
    const actualSide = facade?.side ?? side;
    if (actualSide === 'north') return { x: x0 + along * halfX, y, z: z0 - halfZ - 0.02, ry: 0 };
    if (actualSide === 'south') return { x: x0 - along * halfX, y, z: z0 + halfZ + 0.02, ry: Math.PI };
    if (actualSide === 'west') return { x: x0 - halfX - 0.02, y, z: z0 - along * halfZ, ry: Math.PI * 0.5 };
    return { x: x0 + halfX + 0.02, y, z: z0 + along * halfZ, ry: -Math.PI * 0.5 };
}

function chooseFacadeIndex(entity, rng, preferredSide = null) {
    const facades = entity.facades || [];
    if (!facades.length) return null;
    const candidates = [];
    for (let i = 0; i < facades.length; i++) {
        if (!preferredSide || facades[i].side === preferredSide) candidates.push(i);
    }
    const pool = candidates.length ? candidates : facades.map((_, i) => i);
    return pool[Math.floor(rng() * pool.length) % pool.length];
}

function oppositeSide(side) {
    if (side === 'north') return 'south';
    if (side === 'south') return 'north';
    if (side === 'west') return 'east';
    return 'west';
}

function adjacentSide(side, clockwise) {
    const sides = ['north', 'east', 'south', 'west'];
    const i = sides.indexOf(side);
    return sides[(i + (clockwise ? 1 : 3)) % 4];
}

function semanticContentLabel(value, fallback = 'LOCAL') {
    const text = String(value ?? fallback).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (text || fallback).toUpperCase();
}

function frontageContentFallback(context, fallbackPair = ['NO SIGNAL', 'LOCAL WORLD']) {
    if (!context) return fallbackPair;
    const program = semanticContentLabel(context.program ?? context.spaceType ?? context.physicalUseFamily, 'MIXED');
    const role = semanticContentLabel(context.frontageRole ?? context.publicRole, 'FRONTAGE');
    const district = semanticContentLabel(context.districtFamily, 'LOCAL');
    const landmark = context.landmark ? ' / LANDMARK' : '';
    return [fallbackPair?.[0] || `${program} ${role}`, `${program} / ${role} / ${district}${landmark}`];
}

function semanticMediaFamily(context) {
    if (!context) return null;
    if (context.publicRole === 'service' || /service|mechanical/.test(String(context.frontageRole ?? ''))) return 'service-warning';
    if (context.frontageRole === 'storefront') return 'commercial-ad';
    if (context.publicRole === 'public' || context.landmark) return 'institutional';
    return 'data-feed';
}

function canvasTextTexture(THREE, title, subtitle, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(seed);
    ctx.fillStyle = pick(rng, SIGN_BACKGROUNDS);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = pick(rng, SIGN_INKS);
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textBaseline = 'middle';
    ctx.font = '700 32px monospace';
    const fit = (text, max) => {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        if (ctx.measureText(s).width <= max) return s;
        let lo = 4, hi = s.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) * 0.5);
            if (ctx.measureText(`${s.slice(0, mid)}…`).width <= max) lo = mid;
            else hi = mid - 1;
        }
        return `${s.slice(0, lo)}…`;
    };
    ctx.fillText(fit(title, 342), 24, 60);
    ctx.font = '18px monospace';
    ctx.globalAlpha = 0.78;
    ctx.fillText(fit(subtitle, 342), 24, 115);
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function canvasFlyerTexture(THREE, title, subtitle, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 336;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(seed ^ 0x51ed270b);
    ctx.fillStyle = pick(rng, ['#d7c9a3', '#c7d2cb', '#d4b7ae', '#bfc3d7']);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#26231f';
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#24211e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const fit = (text, maxWidth, startPx) => {
        let px = startPx;
        const value = clean(text);
        while (px > 12) {
            ctx.font = `700 ${px}px monospace`;
            if (ctx.measureText(value).width <= maxWidth) return { value, px };
            px -= 2;
        }
        let clipped = value;
        ctx.font = '700 12px monospace';
        while (clipped.length > 4 && ctx.measureText(clipped + '...').width > maxWidth) clipped = clipped.slice(0, -1);
        return { value: clipped + '...', px: 12 };
    };
    const head = fit(title, 216, 25);
    ctx.font = `700 ${head.px}px monospace`;
    ctx.fillText(head.value, 128, 96);
    const sub = fit(subtitle, 216, 16);
    ctx.font = `${sub.px}px monospace`;
    const words = sub.value.split(' ');
    let line = '', y = 185;
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > 216 && line) { ctx.fillText(line, 128, y); line = word; y += 30; }
        else line = test;
        if (y > 276) break;
    }
    if (line && y <= 306) ctx.fillText(line, 128, y);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function graffitiTexture(THREE, text, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(seed);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(12, 52);
    ctx.rotate((rng() - 0.5) * 0.10);
    ctx.font = `700 ${34 + Math.floor(rng() * 12)}px monospace`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.fillStyle = pick(rng, SIGN_INKS);
    const clipped = String(text ?? 'NO SIGNAL').replace(/\s+/g, ' ').slice(0, 22);
    ctx.strokeText(clipped, 0, 0);
    ctx.fillText(clipped, 0, 0);
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function freezeObject(object) {
    object.updateMatrix?.();
    object.updateMatrixWorld?.(true);
    object.matrixAutoUpdate = false;
    if ('matrixWorldAutoUpdate' in object) object.matrixWorldAutoUpdate = false;
}


const DIAGNOSTIC_SIGNAGE_RE = /(?:^|[-_ ])(?:sign|signage|billboard|megascreen|screen|marquee|poster|flyer|graffiti|plaque|terminal)(?:$|[-_ ])/i;
const DIAGNOSTIC_SMALL_PROP_RE = /(?:pipe|duct|hvac|vent|fixture|clutter|ivy|security|spray|awning|interior|semantic-prop|street-fixture|furniture|crate|trash|plant|bench|bollard|overhead-cable|elevator-hardware)/i;
const DIAGNOSTIC_ARCHITECTURE_RE = /(?:^|[-_ ])(?:roof-topper)(?:$|[-_ ])/i;
function keepTaskUnderCommonDiagnosticCut(task) {
    if (!CUT_COMMON_KOWLOON_ENRICHMENT) return true;
    const label = [
        task?.kind, task?.semanticFamily, task?.exteriorSemanticFamily,
        task?.request?.kind, task?.request?.semanticFamily, task?.assetId,
    ].filter(Boolean).join(' ');
    if (DIAGNOSTIC_SIGNAGE_RE.test(label) || DIAGNOSTIC_ARCHITECTURE_RE.test(label)) return true;
    const tier = String(task?.exteriorVisualTier ?? task?.priorityTier ?? '').toLowerCase();
    if ((tier === 'spectacle' || tier === 'macro' || tier === 'identity') && !DIAGNOSTIC_SMALL_PROP_RE.test(label)) return true;
    return false;
}

export function createKowloonFabricEnrichment({ THREE, worldSeed = 0, publishDetailPhysics = null } = {}) {
    if (!THREE) throw new Error('createKowloonFabricEnrichment requires THREE');

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1, false);
    const fixtureCylinderGeo = new THREE.CylinderGeometry(0.30, 0.27, 0.72, 8, 1, false);
    const leafGeo = new THREE.PlaneGeometry(0.34, 0.42);
    const topperDomeGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const topperSpireGeo = new THREE.ConeGeometry(1, 1, 9);
    const pipeMaterials = PIPE_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.36 }));
    const awningMaterials = AWNING_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    const ivyMaterials = IVY_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
    const securityMat = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.74, metalness: 0.25 });
    const posterFallbackMat = new THREE.MeshStandardMaterial({ color: 0x97876e, emissive: 0x17110a, emissiveIntensity: 0.22, roughness: 0.8, side: THREE.DoubleSide });
    const flyerFallbackMat = new THREE.MeshStandardMaterial({ color: 0xc9b98d, roughness: 0.93, side: THREE.DoubleSide });
    const roofHardwareMat = new THREE.MeshStandardMaterial({ color: 0x555a57, roughness: 0.78, metalness: 0.32 });
    const elevatorMat = new THREE.MeshStandardMaterial({ color: 0x4d514f, roughness: 0.62, metalness: 0.48 });
    const elevatorDoorMat = new THREE.MeshStandardMaterial({ color: 0x777b78, roughness: 0.52, metalness: 0.58 });
    const plazaConcreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6862, roughness: 0.94 });
    const plazaDarkMat = new THREE.MeshStandardMaterial({ color: 0x292c2d, roughness: 0.78, metalness: 0.18 });
    const plazaGlassMat = new THREE.MeshStandardMaterial({ color: 0x6e9093, emissive: 0x102426, emissiveIntensity: 0.22, roughness: 0.34, transparent: true, opacity: 0.72 });
    const plazaGreenMat = new THREE.MeshStandardMaterial({ color: 0x445b39, roughness: 1 });
    const plazaTapeMat = new THREE.MeshStandardMaterial({ color: 0xc8ba3e, emissive: 0x292306, emissiveIntensity: 0.18, roughness: 0.74 });
    const interiorWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c4b3c, roughness: 0.91 });
    const interiorMetalMat = new THREE.MeshStandardMaterial({ color: 0x545957, roughness: 0.76, metalness: 0.28 });
    const topperMat = new THREE.MeshStandardMaterial({ color: 0x4c5558, roughness: 0.62, metalness: 0.38 });
    const textExciter = createProceduralTextExciter({ worldSeed });
    console.log('[world-text] deterministic full curated corpus exciter ready', textExciter.stats);
    const exteriorPropField = createExteriorPropFieldSystem({ THREE, worldSeed });

    const semanticRecipeById = new Map(SEMANTIC_ROOM_RECIPES.map(recipe => [recipe.id, recipe]));
    const semanticVariantFamilies = new Map();
    const semanticProgramPhasePools = new Map();
    const semanticAllPhasePools = new Map();
    const phaseForImportance = importance => importance === 'identity' ? 'identity' : importance === 'narrative' ? 'life' : 'functional';
    const addCanonicalToPool = (map, key, canonicalId) => {
        const pool = map.get(key) ?? [];
        if (!pool.includes(canonicalId)) pool.push(canonicalId);
        map.set(key, pool);
    };
    for (const def of SEMANTIC_INTERIOR_ASSETS) {
        if (!def?.id || !def?.semanticGraph?.roles?.includes('semantic-prop')) continue;
        const canonicalId = def.canonicalId || def.id;
        const family = semanticVariantFamilies.get(canonicalId) ?? [];
        family.push(def.id);
        semanticVariantFamilies.set(canonicalId, family);
        const phase = phaseForImportance(def.importance);
        addCanonicalToPool(semanticAllPhasePools, phase, canonicalId);
        for (const program of def.programs ?? []) addCanonicalToPool(semanticProgramPhasePools, `${program}:${phase}`, canonicalId);
    }
    for (const family of semanticVariantFamilies.values()) family.sort((a, b) => a.localeCompare(b));
    let semanticLoader = null;
    let semanticLoaderPromise = null;
    const semanticTemplates = new Map();
    const semanticTemplatePromises = new Map();
    const semanticFailed = new Set();
    const semanticLoadQueue = [];
    let semanticActiveLoads = 0;
    const SEMANTIC_LOAD_CONCURRENCY = 6;
    const SEMANTIC_LOAD_MAX_ATTEMPTS = 4;
    const semanticProgramFamilies = Object.freeze({
        'workshop-warehouse': ['auto_shop', 'hardware_store', 'print_shop', 'photo_lab', 'electronics_repair', 'laboratory', 'projection_booth', 'radio_station', 'boiler_room', 'factory_control', 'fire_station'],
        'vertical-stack': ['office', '1980s_office', 'server_room', 'mainframe_room', 'archive', 'library', 'bank', 'post_office', 'clinic', 'pharmacy', 'school_classroom', 'police_booking', 'courtroom', 'dentist'],
        'dense-tenement': ['diner', 'laundromat', 'convenience', 'motel_room', 'bar', 'arcade', 'grocery', 'clinic', 'florist', 'pharmacy', 'funeral_home', 'butcher'],
        default: SEMANTIC_ROOM_RECIPES.map(recipe => recipe.id),
    });

    function denseSemanticAssetId(pool, fallbackPool, seed, ordinal) {
        const eligible = pool.filter(assetId => semanticVariantFamilies.has(assetId));
        const source = eligible.length ? eligible : fallbackPool;
        if (!source?.length) return null;
        const canonicalId = source[((seed >>> 0) + ordinal) % source.length];
        const family = semanticVariantFamilies.get(canonicalId) ?? [];
        if (!family.length) return null;
        const variantLayer = Math.floor(ordinal / source.length);
        const variantOffset = (seed >>> 8) % family.length;
        return family[(variantOffset + variantLayer) % family.length];
    }

    function normalizeDecorationTemplate(root) {
        root?.traverse?.(object => {
            if (!object?.isMesh) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (!material) continue;
                material.side = THREE.DoubleSide;
                material.needsUpdate = true;
            }
        });
        return root;
    }

    function ensureSemanticLoader() {
        if (semanticLoader) return Promise.resolve(semanticLoader);
        if (typeof window === 'undefined') return Promise.resolve(null);
        if (!semanticLoaderPromise) {
            semanticLoaderPromise = import('../vendor/three/addons/loaders/GLTFLoader.js')
                .then(module => { semanticLoader = new module.GLTFLoader(); return semanticLoader; })
                .catch(error => {
                    semanticLoaderPromise = null;
                    console.warn?.('[asset] semantic GLTF loader unavailable; proxies retained', error?.message ?? error);
                    return null;
                });
        }
        return semanticLoaderPromise;
    }

    function pumpSemanticLoadQueue() {
        if (typeof window === 'undefined') return;
        if (!semanticLoader) {
            ensureSemanticLoader().then(loader => { if (loader) pumpSemanticLoadQueue(); });
            return;
        }
        while (semanticActiveLoads < SEMANTIC_LOAD_CONCURRENCY && semanticLoadQueue.length) {
            const job = semanticLoadQueue.shift();
            semanticActiveLoads++;
            semanticLoader.load('./vendor/city-pack/' + job.def.file, gltf => {
                const template = normalizeDecorationTemplate(gltf.scene);
                semanticTemplates.set(job.def.id, template);
                semanticTemplatePromises.delete(job.def.id);
                semanticActiveLoads--;
                job.resolve(template);
                pumpSemanticLoadQueue();
            }, undefined, error => {
                semanticActiveLoads--;
                const nextAttempt = (job.attempt ?? 0) + 1;
                if (nextAttempt < SEMANTIC_LOAD_MAX_ATTEMPTS) {
                    console.warn?.('[asset] semantic decoration "' + job.def.id + '" load retry ' + nextAttempt + '/' + (SEMANTIC_LOAD_MAX_ATTEMPTS - 1), error?.message ?? error);
                    semanticLoadQueue.unshift({ ...job, attempt: nextAttempt });
                    pumpSemanticLoadQueue();
                    return;
                }
                semanticTemplatePromises.delete(job.def.id);
                semanticFailed.add(job.def.id);
                console.warn?.('[asset] semantic decoration "' + job.def.id + '" exhausted ' + SEMANTIC_LOAD_MAX_ATTEMPTS + ' attempts; proxy retained', error?.message ?? error);
                job.resolve(null);
                pumpSemanticLoadQueue();
            });
        }
    }

    function loadSemanticTemplate(def) {
        if (!def || semanticFailed.has(def.id) || typeof window === 'undefined') return Promise.resolve(null);
        if (semanticTemplates.has(def.id)) return Promise.resolve(semanticTemplates.get(def.id));
        if (semanticTemplatePromises.has(def.id)) return semanticTemplatePromises.get(def.id);
        const promise = new Promise(resolve => {
            semanticLoadQueue.push({ def, resolve, attempt: 0 });
            pumpSemanticLoadQueue();
        });
        semanticTemplatePromises.set(def.id, promise);
        return promise;
    }

    function queueSemanticUpgrade(payload, holder, def) {
        if (typeof window === 'undefined' || !holder || !def) return;
        loadSemanticTemplate(def).then(template => {
            if (!template || payload?.disposed || !holder.parent) return;
            const clone = template.clone(true);
            normalizeDecorationTemplate(clone);
            clone.updateMatrixWorld?.(true);
            const rawBounds = new THREE.Box3().setFromObject(clone);
            if (rawBounds.isEmpty()) return;
            const rawSize = rawBounds.getSize(new THREE.Vector3());
            const fitScale = semanticAssetFitScale(def, rawBounds);
            if (fitScale < 1) {
                clone.scale.multiplyScalar(fitScale);
                clone.updateMatrixWorld?.(true);
            }
            const fittedBounds = new THREE.Box3().setFromObject(clone);
            const alignment = semanticAssetAlignment(def, fittedBounds);
            clone.position.x += alignment.x;
            clone.position.y += alignment.y;
            clone.position.z += alignment.z;
            clone.updateMatrixWorld?.(true);
            holder.clear();
            holder.add(clone);
            holder.updateMatrixWorld?.(true);
            const worldBounds = new THREE.Box3().setFromObject(holder);
            const boundsMinY = Number(def.boundsMin?.[1]) || 0;
            const expectedSupportY = holder.position.y + boundsMinY;
            const frame = holder.userData.semanticAssetFrame = {
                schema: 'jweb.semantic-asset-frame.v1',
                scale: fitScale,
                oversizeFitApplied: fitScale < 0.999999,
                alignment: { ...alignment },
                catalogDimensionsXYZ: [...(def.dimensionsXYZ ?? [])],
                catalogBoundsMin: [...(def.boundsMin ?? [])],
                rawSize: [rawSize.x, rawSize.y, rawSize.z],
                worldBounds: {
                    min: [worldBounds.min.x, worldBounds.min.y, worldBounds.min.z],
                    max: [worldBounds.max.x, worldBounds.max.y, worldBounds.max.z],
                },
                expectedSupportY,
                supportErrorY: worldBounds.min.y - expectedSupportY,
                accepted: null,
            };
            if (!objectClearsStructuralReservations(payload, holder)) {
                frame.accepted = false;
                frame.rejectedReason = 'structural-reservation';
                holder.remove(clone);
                return;
            }
            frame.accepted = true;
            clone.traverse?.(freezeObject);
            freezeObject(clone);
            holder.updateMatrixWorld?.(true);
        });
    }

    function queueSemanticContextUpgrade(payload, holder, def, task) {
        if (typeof window === 'undefined' || !holder || !def || !task?.semanticFit) return;
        loadSemanticTemplate(def).then(template => {
            if (!template || payload?.disposed || !holder.parent) return;
            const clone = template.clone(true);
            normalizeDecorationTemplate(clone);
            clone.updateMatrixWorld?.(true);
            const rawBounds = new THREE.Box3().setFromObject(clone);
            if (rawBounds.isEmpty()) return;
            const size = rawBounds.getSize(new THREE.Vector3());
            const fit = task.semanticFit;
            const requested = Number.isFinite(fit.scale) ? fit.scale : 1;
            const measured = Math.min(
                1,
                requested,
                Math.max(0.01, fit.width) / Math.max(0.01, size.x),
                Math.max(0.01, fit.height) / Math.max(0.01, size.y),
                Math.max(0.01, fit.depth) / Math.max(0.01, size.z)
            );
            if (!Number.isFinite(measured) || measured < (fit.minScale ?? 0.24)) return;
            clone.scale.multiplyScalar(measured);
            clone.updateMatrixWorld?.(true);
            const fittedBounds = new THREE.Box3().setFromObject(clone);
            const center = fittedBounds.getCenter(new THREE.Vector3());
            clone.position.x -= center.x;
            clone.position.z -= center.z;
            clone.position.y -= fit.anchor === 'center' ? center.y : fittedBounds.min.y;
            holder.clear();
            holder.add(clone);
            holder.updateMatrixWorld?.(true);
            if (!objectClearsStructuralReservations(payload, holder)) {
                holder.remove(clone);
                return;
            }
            holder.userData.semanticContextScale = measured;
            clone.traverse?.(freezeObject);
            freezeObject(clone);
            holder.updateMatrixWorld?.(true);
        });
    }

    function semanticProgramForSpace(chunk, entity, moduleKey, floor) {
        const programs = semanticProgramFamilies[entity.archetype] ?? semanticProgramFamilies.default;
        const index = taskSeed(chunk, entity.id, `semantic-program:${moduleKey}:${floor}`) % programs.length;
        return programs[index];
    }

    function semanticSlotsForEntity(entity) {
        const modules = entity.footprintModules ?? [];
        const authored = Array.isArray(entity?.buildingPlan?.topologySpaces)
            ? entity.buildingPlan.topologySpaces.filter(space => space?.regions?.length)
            : [];
        if (authored.length) {
            const occupiable = authored.filter(space => !['circulation', 'entry'].includes(space.role));
            const source = occupiable.length ? occupiable : authored;
            const slots = source.map(space => {
                const moduleKeys = new Set([...(space.moduleKeys ?? []), space.moduleKey].filter(Boolean));
                const cx = Number(space?.centroid?.x);
                const cz = Number(space?.centroid?.z);
                const module = modules.find(candidate =>
                    moduleKeys.has(candidate.key)
                    && Number.isFinite(cx) && Number.isFinite(cz)
                    && cx >= candidate.cx - candidate.halfX && cx <= candidate.cx + candidate.halfX
                    && cz >= candidate.cz - candidate.halfZ && cz <= candidate.cz + candidate.halfZ)
                    ?? modules.find(candidate => moduleKeys.has(candidate.key))
                    ?? modules[0];
                if (!module) return null;
                return {
                    module,
                    floor: Math.max(0, Math.floor(Number(space.floor) || 0)),
                    spaceId: space.id,
                    program: space.semanticProgram ?? null,
                    role: space.role ?? null,
                    spaceType: space.spaceType ?? null,
                };
            }).filter(Boolean);
            if (slots.length) return slots;
        }
        const legacy = [];
        for (const module of modules) {
            const maxFloor = Math.max(1, Math.min(6, module.floors || 1));
            for (let floor = 0; floor < maxFloor; floor++) legacy.push({ module, floor, spaceId: null, program: null, role: null, spaceType: null });
        }
        return legacy;
    }

    function detailReservations(payload) {
        return payload.detailReservations ?? (payload.detailReservations = []);
    }

    function reserveDetailBox(payload, x, z, halfX, halfZ, yMin = 0, yMax = 2, margin = 0.12) {
        const paddedHalfX = halfX + margin;
        const paddedHalfZ = halfZ + margin;
        const structural = payload?.physics?.circulationReservations ?? [];
        if (structural.length && anyReservationIntersectsBox(structural, { x, z, halfX: paddedHalfX, halfZ: paddedHalfZ, yMin, yMax })) return false;
        const next = {
            x, z, halfX: paddedHalfX, halfZ: paddedHalfZ,
            minX: x - paddedHalfX, maxX: x + paddedHalfX,
            minZ: z - paddedHalfZ, maxZ: z + paddedHalfZ,
            yMin, yMax,
        };
        for (const other of detailReservations(payload)) {
            if (next.yMin >= other.yMax || next.yMax <= other.yMin) continue;
            if (next.minX < other.maxX && next.maxX > other.minX && next.minZ < other.maxZ && next.maxZ > other.minZ) return false;
        }
        detailReservations(payload).push(next);
        return true;
    }

    function objectClearsStructuralReservations(payload, object) {
        const structural = payload?.physics?.circulationReservations ?? [];
        if (!structural.length || !object) return true;
        object.updateMatrixWorld?.(true);
        const bounds = new THREE.Box3().setFromObject(object);
        if (bounds.isEmpty()) return true;
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        return !anyReservationIntersectsBox(structural, {
            x: center.x, z: center.z,
            halfX: size.x * 0.5, halfZ: size.z * 0.5,
            yMin: bounds.min.y, yMax: bounds.max.y,
        });
    }

    function publishPhysics(payload, kind, item) {
        if (typeof publishDetailPhysics !== 'function' || !payload || !item) return false;
        try { return publishDetailPhysics(payload, kind, item); }
        catch (error) { console.warn?.('[world] late detail collision publication failed', error); return false; }
    }

        function publishObjectPhysics(payload, object) {
        const entries = object?.userData?.detailPhysics;
        if (Array.isArray(entries) && entries.length) {
            throw new Error('[topology-precommit] visual realization attempted to publish collision');
        }
    }

    function topologyDescriptorId(chunk, task, index = 0) {
        return `${chunk.key}:${task.entityId ?? "world"}:${task.kind}:${task.seed >>> 0}:${index}`;
    }

    function topologyDescriptor(chunk, task, item, index = 0, relationship = null) {
        const id = topologyDescriptorId(chunk, task, index);
        return {
            id, kind: 'props', taskKind: task.kind, entityId: task.entityId ?? null,
            relationship,
            item: { ...item, topologyDescriptorId: id, topologyTaskKind: task.kind, topologyOwnerId: task.entityId ?? null },
        };
    }

    function reserveTopologyDescriptor(payload, descriptor, margin = 0.10) {
        const item = descriptor?.item;
        if (!item) return false;
        const yMin = Number.isFinite(item.yMin) ? item.yMin : 0;
        const yMax = Number.isFinite(item.height) ? item.height : yMin + 2;
        const radius = Math.max(0.04, Number(item.radius) || 0.12);
        return reserveDetailBox(payload, item.x, item.z, radius, radius, yMin, yMax, margin);
    }

    function acceptTopologyDescriptors(payload, task, descriptors, { reserve = true, margin = 0.10 } = {}) {
        if (!descriptors.length) { task.topologyDescriptors = []; task.topologySolved = true; task.topologyAccepted = true; return true; }
        const accepted = [];
        for (const descriptor of descriptors) {
            if (reserve && !reserveTopologyDescriptor(payload, descriptor, margin)) continue;
            payload.physics?.[descriptor.kind]?.push?.(descriptor.item);
            accepted.push(descriptor);
        }
        task.topologyDescriptors = accepted;
        task.topologySolved = true;
        task.topologyRejected = descriptors.length - accepted.length;
        task.topologyAccepted = accepted.length > 0;
        return task.topologyAccepted;
    }

    function streetFixtureCollider(task) {
        const table = {
            'trash-can': [0.28, 0.76, 0.34], crate: [0.34, 0.58, 0.42],
            'utility-box': [0.31, 0.98, 0.38], planter: [0.27, 0.38, 0.34],
            'vending-machine': [0.38, 1.86, 0.48], bollard: [0.16, 0.92, 0.24],
            'street-lamp': [0.13, 2.95, 0.25], 'news-box': [0.30, 1.16, 0.38],
            bench: [0.52, 0.52, 0.66], lantern: [0.10, 2.20, 0.22],
        };
        return table[task.variant] ?? (task.variant === 'manhole' || task.variant === 'weeds' ? null : table.lantern);
    }

    function solveStreetFixtureTopology(chunk, payload, task) {
        const point = semanticPlacementPoint(task);
        const localZ = -0.34;
        const center = { x: point.x + Math.sin(point.ry) * localZ, z: point.z + Math.cos(point.ry) * localZ };
        const collider = streetFixtureCollider(task);
        task.topologyPlacement = { point, localZ, center, collider };
        if (!collider) { task.topologyDescriptors = []; task.topologySolved = true; task.topologyAccepted = true; return true; }
        const descriptor = topologyDescriptor(chunk, task, { x: center.x, z: center.z, radius: collider[0], height: collider[1] }, 0, { entityId: task.entityId, facadeIndex: task.facadeIndex, side: task.side });
        if (!reserveDetailBox(payload, center.x, center.z, collider[2], collider[2], 0, collider[1], 0.10)) {
            task.topologyDescriptors = []; task.topologySolved = true; task.topologyRejected = 1; task.topologyAccepted = false;
            return false;
        }
        payload.physics?.props?.push?.(descriptor.item);
        task.topologyDescriptors = [descriptor]; task.topologySolved = true; task.topologyRejected = 0; task.topologyAccepted = true;
        return true;
    }

    function solveRoofClutterTopology(chunk, payload, task) {
        const entity = getEntity(payload, task.entityId);
        const bounds = task.semanticOpportunityBounds;
        if (!entity || !bounds) return false;
        const roof = { x: bounds.x, z: bounds.z, halfX: bounds.halfX, halfZ: bounds.halfZ, y: bounds.y };
        const rng = mulberry32(task.seed);
        const specs = [];
        const descriptors = [];
        const count = Math.max(2, task.count || 3);
        for (let i = 0; i < count; i++) {
            const w = 0.22 + rng() * 0.62, d = 0.22 + rng() * 0.58, h = 0.18 + rng() * 0.75;
            const spec = {
                x: roof.x + (rng() - 0.5) * Math.max(0.2, roof.halfX * 1.35 - w),
                y: roof.y + h * 0.5 + 0.03,
                z: roof.z + (rng() - 0.5) * Math.max(0.2, roof.halfZ * 1.35 - d),
                w, d, h, ry: rng() * Math.PI,
            };
            const descriptor = topologyDescriptor(chunk, task, { x: spec.x, z: spec.z, radius: Math.max(0.14, Math.min(w, d) * 0.42), yMin: roof.y, height: roof.y + h }, i, { entityId: task.entityId, roof: true });
            if (!reserveDetailBox(payload, spec.x, spec.z, w * 0.5, d * 0.5, roof.y, roof.y + h, 0.08)) continue;
            payload.physics?.props?.push?.(descriptor.item);
            specs.push(spec); descriptors.push(descriptor);
        }
        let mast = null;
        if (rng() < 0.62) {
            const h = 1.0 + rng() * 2.7;
            mast = { h, x: roof.x + (rng() - 0.5) * roof.halfX, y: roof.y + h * 0.5, z: roof.z + (rng() - 0.5) * roof.halfZ };
        }
        task.topologyPlacement = { roof, boxes: specs, mast };
        task.topologyDescriptors = descriptors; task.topologySolved = true; task.topologyRejected = count - descriptors.length; task.topologyAccepted = true;
        return true;
    }

    function solveRoofTopperTopology(chunk, payload, task) {
        const entity = getEntity(payload, task.entityId);
        const bounds = task.semanticOpportunityBounds;
        if (!entity || !bounds) return false;
        const roof = { x: bounds.x, z: bounds.z, halfX: bounds.halfX, halfZ: bounds.halfZ, y: bounds.y };
        let spec, item;
        if (task.topper === 'dome') {
            const radius = Math.max(0.55, Math.min(1.75, Math.min(roof.halfX, roof.halfZ) * 0.48));
            spec = { topper: 'dome', radius, x: roof.x, y: roof.y + 0.02, z: roof.z };
            item = { x: roof.x, z: roof.z, radius: radius * 0.72, yMin: roof.y, height: roof.y + radius * 0.62 };
        } else {
            const h = 1.8 + (task.seed % 260) / 100;
            const r = 0.32 + ((task.seed >>> 8) % 36) / 100;
            spec = { topper: task.topper, h, r, x: roof.x, y: roof.y + h * 0.5, z: roof.z };
            item = { x: roof.x, z: roof.z, radius: Math.max(0.16, r * 0.72), yMin: roof.y, height: roof.y + h };
        }
        task.topologyPlacement = spec;
        return acceptTopologyDescriptors(payload, task, [topologyDescriptor(chunk, task, item, 0, { entityId: task.entityId, roof: true })], { reserve: true, margin: 0.08 });
    }

    function plazaPhysicsFromTask(chunk, task) {
        const rng = mulberry32(task.seed);
        const descriptors = [];
        if (task.kind === 'plaza-park') {
            const trees = [];
            for (let i = 0; i < 3; i++) {
                const x = (rng()-0.5)*1.8, z = (rng()-0.5)*1.8;
                trees.push({ x, z });
                rng();
            }
            const rotation = (rng() - 0.5) * 0.32;
            const rotateOffset = (x, z) => ({ x: task.x + Math.cos(rotation) * x + Math.sin(rotation) * z, z: task.z - Math.sin(rotation) * x + Math.cos(rotation) * z });
            for (let i = 0; i < trees.length; i++) {
                const p = rotateOffset(trees[i].x, trees[i].z);
                descriptors.push(topologyDescriptor(chunk, task, { x: p.x, z: p.z, radius: 0.14, height: 1.10 }, i, { entityId: task.entityId, plaza: true }));
            }
            const p = rotateOffset(0, -0.85);
            descriptors.push(topologyDescriptor(chunk, task, { x: p.x, z: p.z, radius: 0.58, height: 0.36 }, 3, { entityId: task.entityId, plaza: true }));
            return { rotation, trees, descriptors };
        }
        const rotation = (rng() - 0.5) * 0.32;
        const collider = task.kind === 'plaza-newsstand' ? [0.78, 1.86]
            : task.kind === 'plaza-phone-booth' ? [0.48, 2.20]
            : task.kind === 'plaza-atm-kiosk' ? [0.52, 1.86] : null;
        if (collider) descriptors.push(topologyDescriptor(chunk, task, { x: task.x, z: task.z, radius: collider[0], height: collider[1] }, 0, { entityId: task.entityId, plaza: true }));
        return { rotation, trees: null, descriptors };
    }

    function solvePlazaTopology(chunk, payload, task) {
        const spec = plazaPhysicsFromTask(chunk, task);
        task.topologyPlacement = spec;
        const reservationStart = detailReservations(payload).length;
        for (const descriptor of spec.descriptors) {
            if (!reserveTopologyDescriptor(payload, descriptor, 0.12)) {
                detailReservations(payload).splice(reservationStart);
                task.topologyDescriptors = []; task.topologySolved = true; task.topologyRejected = spec.descriptors.length; task.topologyAccepted = false;
                return false;
            }
        }
        task.topologyDescriptors = spec.descriptors; task.topologySolved = true; task.topologyRejected = 0; task.topologyAccepted = true;
        for (const descriptor of spec.descriptors) payload.physics?.props?.push?.(descriptor.item);
        return true;
    }

    function solveBlockingTopology(chunk, payload, tasks) {
        let planned = 0, solved = 0, descriptors = 0, rejected = 0;
        for (const task of tasks) {
            if (String(task.kind).startsWith('semantic-')) {
                if (task.topologySolved) { solved++; descriptors += task.topologyDescriptors?.length ?? 0; }
                continue;
            }
            let handled = false, ok = false;
            if (task.kind === 'street-fixture') { handled = true; ok = solveStreetFixtureTopology(chunk, payload, task); }
            else if (task.kind === 'roof-clutter') { handled = true; ok = solveRoofClutterTopology(chunk, payload, task); }
            else if (task.kind === 'roof-topper') { handled = true; ok = solveRoofTopperTopology(chunk, payload, task); }
            else if (String(task.kind).startsWith('plaza-')) { handled = true; ok = solvePlazaTopology(chunk, payload, task); }
            if (!handled) continue;
            planned++; if (ok) solved++; descriptors += task.topologyDescriptors?.length ?? 0; rejected += task.topologyRejected ?? 0;
        }
        payload.topologyPrecommit = { schema: 'jweb.topology-precommit.v1', planned, solved, descriptors, rejected };
        return payload.topologyPrecommit;
    }

    function taskSeed(chunk, entityId, kind, index = 0) {
        return hashString32(`${worldSeed}:chunk-detail:${chunk.key}:${entityId}:${kind}:${index}`);
    }

    function planBuildingTasks(chunk, entity) {
        const seed = taskSeed(chunk, entity.id, 'plan');
        const rng = mulberry32(seed);
        const tasks = [];
        const front = entity.doorSide || 'north';
        const side = adjacentSide(front, rng() < 0.5);
        const back = oppositeSide(front);
        const frontFacadeIndex = chooseFacadeIndex(entity, rng, front);
        const sideFacadeIndex = chooseFacadeIndex(entity, rng, side);
        const backFacadeIndex = chooseFacadeIndex(entity, rng, back);
        const floors = Math.max(1, entity.floors || 1);
        const wallHeight = floors * (entity.floorH || 3.15);

        if (entity.exteriorIdentity || rng() < 0.96) {
            const labelRng = mulberry32(taskSeed(chunk, entity.id, 'sign-label'));
            const basePair = pickMassiveNoisePair(labelRng);
            const generatedPair = textExciter.pairFor(chunk, entity.id, 'sign-label', basePair);
            const title = String(entity.exteriorIdentity?.title ?? generatedPair[0]);
            const subtitle = String(entity.exteriorIdentity?.subtitle ?? generatedPair[1]);
            tasks.push({
                kind: 'sign', entityId: entity.id, side: front, facadeIndex: frontFacadeIndex,
                y: clamp(2.45 + rng() * Math.min(2.6, wallHeight * 0.28), 2.25, Math.max(2.4, wallHeight - 0.8)),
                along: (rng() - 0.5) * 0.5,
                width: clamp((entity.halfX ?? 2) * 0.95, 1.65, 3.9),
                height: 0.86 + rng() * 0.54,
                title, subtitle,
                seed: taskSeed(chunk, entity.id, 'sign'),
                signatureIdentity: !!entity.exteriorIdentity,
                exteriorVisualTier: 'identity',
            });
        }

        // Independent sign stream: density can grow without perturbing the old
        // facade/pipe/awning RNG sequence. Tight streets should read as vertical
        // layers of projecting signs, not one token sign per building.
        const signDensityRng = mulberry32(taskSeed(chunk, entity.id, 'sign-density'));
        const extraSignCount = (signDensityRng() < 0.78 ? 1 : 0)
            + (floors >= 2 && signDensityRng() < 0.46 ? 1 : 0)
            + (floors >= 4 && signDensityRng() < 0.20 ? 1 : 0);
        for (let i = 0; i < extraSignCount; i++) {
            const signSide = i % 2 ? side : front;
            const signFacadeIndex = chooseFacadeIndex(entity, signDensityRng, signSide);
            const labelRng = mulberry32(taskSeed(chunk, entity.id, 'sign-extra-label', i));
            const [title, subtitle] = textExciter.pairFor(chunk, entity.id, `sign-extra:${i}`, pickMassiveNoisePair(labelRng));
            tasks.push({
                kind: 'sign', entityId: entity.id, side: signSide, facadeIndex: signFacadeIndex,
                y: clamp(2.35 + signDensityRng() * Math.min(5.8, wallHeight * 0.62), 2.25, Math.max(2.45, wallHeight - 0.65)),
                along: (signDensityRng() - 0.5) * 1.34,
                width: clamp(1.55 + signDensityRng() * 2.35, 1.55, 3.90),
                height: 0.75 + signDensityRng() * 0.36,
                title, subtitle, seed: taskSeed(chunk, entity.id, 'sign-extra', i),
            });
        }

        if (rng() < 0.76) {
            const graffitiRng = mulberry32(taskSeed(chunk, entity.id, 'graffiti-label'));
            const baseText = graffitiRng() < 0.52
                ? pickPoetryTag(graffitiRng)
                : BASE_GRAFFITI_TAGS[Math.floor(graffitiRng() * BASE_GRAFFITI_TAGS.length) % BASE_GRAFFITI_TAGS.length];
            const text = textExciter.tagFor(chunk, entity.id, 'graffiti-label', baseText);
            tasks.push({
                kind: 'graffiti', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
                y: 0.95 + rng() * 1.1, along: (rng() - 0.5) * 0.9,
                width: 1.1 + rng() * 1.8, height: 0.5 + rng() * 0.65,
                text, seed: taskSeed(chunk, entity.id, 'graffiti'),
            });
        }

        const pipeCount = 1 + (rng() < 0.38 ? 1 : 0);
        for (let i = 0; i < pipeCount; i++) {
            tasks.push({
                kind: 'pipe', entityId: entity.id, side: i ? back : side, facadeIndex: i ? backFacadeIndex : sideFacadeIndex,
                y: wallHeight * 0.48,
                height: clamp(wallHeight * (0.58 + rng() * 0.34), 2.5, wallHeight - 0.3),
                along: (rng() - 0.5) * 1.25,
                seed: taskSeed(chunk, entity.id, 'pipe', i),
            });
        }

        if (rng() < 0.58) {
            tasks.push({
                kind: 'awning', entityId: entity.id, side: front, facadeIndex: frontFacadeIndex,
                y: 2.52, along: 0,
                width: clamp((front === 'north' || front === 'south' ? entity.halfX : entity.halfZ) * 1.25, 1.6, 4.4),
                depth: 0.72 + rng() * 0.45,
                seed: taskSeed(chunk, entity.id, 'awning'),
            });
        }

        if (rng() < 0.64) {
            const flyerCount = 1 + (rng() < 0.32 ? 1 : 0) + (rng() < 0.10 ? 1 : 0);
            for (let i = 0; i < flyerCount; i++) {
                const flyerRng = mulberry32(taskSeed(chunk, entity.id, 'flyer-label', i));
                const basePair = pickMassiveNoisePair(flyerRng);
                const [title, subtitle] = textExciter.pairFor(chunk, entity.id, `flyer-label:${i}`, basePair);
                tasks.push({
                    kind: 'flyer', entityId: entity.id, side: i ? side : front, facadeIndex: i ? sideFacadeIndex : frontFacadeIndex,
                    y: 1.05 + rng() * 1.55, along: (rng() - 0.5) * 1.35,
                    width: 0.42 + rng() * 0.28, height: 0.54 + rng() * 0.34,
                    title, subtitle, seed: taskSeed(chunk, entity.id, 'flyer', i),
                });
            }
        }

        if (floors >= 2 && rng() < 0.62) {
            tasks.push({
                kind: 'ivy', entityId: entity.id, side: back, facadeIndex: backFacadeIndex,
                y: clamp(wallHeight * (0.35 + rng() * 0.26), 2.2, wallHeight - 1),
                height: clamp(wallHeight * (0.35 + rng() * 0.34), 1.8, wallHeight - 0.5),
                along: (rng() - 0.5) * 0.8,
                count: 7 + Math.floor(rng() * 9),
                seed: taskSeed(chunk, entity.id, 'ivy'),
            });
        }

        if (rng() < 0.44) {
            tasks.push({
                kind: 'security', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
                y: clamp(2.6 + rng() * 1.6, 2.5, Math.max(2.6, wallHeight - 0.7)),
                along: (rng() - 0.5) * 1.15,
                seed: taskSeed(chunk, entity.id, 'security'),
            });
        }
        if (floors >= 3 && rng() < 0.28) {
            tasks.push({
                kind: 'elevator-hardware', entityId: entity.id, side: back, facadeIndex: backFacadeIndex,
                y: 1.15, along: (rng() - 0.5) * 0.55, seed: taskSeed(chunk, entity.id, 'elevator-hardware'),
            });
        }
        tasks.push({
            kind: 'roof-clutter', entityId: entity.id, seed: taskSeed(chunk, entity.id, 'roof-clutter'),
            count: 2 + (rng() < 0.35 ? 1 : 0),
        });
        if (tasks.some(task => task.kind === 'graffiti') && rng() < 0.46) tasks.push({
            kind: 'spray-cans', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
            seed: taskSeed(chunk, entity.id, 'spray-cans'),
        });
        // Street-level identity belongs to the same deterministic payload as signs,
        // pipes, and awnings. Use an independent RNG so adding this family does not
        // perturb the established authored/procedural task sequence.
        const fixtureRng = mulberry32(taskSeed(chunk, entity.id, 'street-fixture-plan'));
        const fixtureCount = 2 + (fixtureRng() < 0.94 ? 1 : 0) + (fixtureRng() < 0.78 ? 1 : 0) + (fixtureRng() < 0.52 ? 1 : 0) + (fixtureRng() < 0.28 ? 1 : 0);
        const variants = ['trash-can', 'crate', 'utility-box', 'planter', 'lantern', 'vending-machine', 'bollard', 'manhole', 'weeds', 'street-lamp', 'news-box', 'bench'];
        for (let i = 0; i < fixtureCount; i++) {
            const fixtureSide = i ? side : front;
            tasks.push({
                kind: 'street-fixture', entityId: entity.id, side: fixtureSide,
                facadeIndex: i ? sideFacadeIndex : frontFacadeIndex,
                along: (fixtureRng() - 0.5) * 1.48,
                variant: variants[Math.floor(fixtureRng() * variants.length) % variants.length],
                seed: taskSeed(chunk, entity.id, 'street-fixture', i),
            });
        }
        if (!entity.suppressInteriorEnrichment && entity.footprintModules?.length) {
            const semanticSlots = semanticSlotsForEntity(entity);
            if (semanticSlots.length) {
                const activeSlotCount = Math.max(1, Math.min(12, semanticSlots.length));
                const slotStart = taskSeed(chunk, entity.id, 'semantic-space-rotation') % semanticSlots.length;
                const activeSlots = Array.from({ length: activeSlotCount }, (_, i) => semanticSlots[(slotStart + i) % semanticSlots.length]);
                for (let slotOrdinal = 0; slotOrdinal < activeSlots.length; slotOrdinal++) {
                    const slot = activeSlots[slotOrdinal];
                    const module = slot.module;
                    const floor = slot.floor;
                    const stableSpaceKey = slot.spaceId ?? `${module.key}:floor:${floor}`;
                    const program = slot.program ?? semanticProgramForSpace(chunk, entity, module.key, floor);
                    const recipe = semanticRecipeById.get(program)
                        ?? SEMANTIC_ROOM_RECIPES[taskSeed(chunk, entity.id, `semantic-room-fallback:${stableSpaceKey}`) % SEMANTIC_ROOM_RECIPES.length];
                    const phaseTargets = recipe?.population?.phaseTargets ?? { identity: 6, functional: 10, life: 8 };
                    for (const phase of ['identity', 'functional', 'life']) {
                        const target = Math.max(0, Math.floor(Number(phaseTargets[phase]) || 0));
                        const base = Math.floor(target / activeSlots.length);
                        const extra = slotOrdinal < target % activeSlots.length ? 1 : 0;
                        const wanted = base + extra;
                        const pool = recipe?.[phase] ?? [];
                        const fallbackPool = semanticProgramPhasePools.get(`${program}:${phase}`) ?? semanticAllPhasePools.get(phase) ?? [];
                        const phaseSeed = taskSeed(chunk, entity.id, `semantic-space:${stableSpaceKey}:${phase}`);
                        for (let i = 0; i < wanted; i++) {
                            const assetId = denseSemanticAssetId(pool, fallbackPool, phaseSeed, i);
                            if (!assetId) continue;
                            tasks.push({
                                kind: `semantic-${phase}`, entityId: entity.id, assetId, program,
                                moduleKey: module.key, floor, spaceId: slot.spaceId,
                                architecturalSpaceRole: slot.role,
                                architecturalSpaceType: slot.spaceType,
                                architecturalProgram: slot.program,
                                seed: taskSeed(chunk, entity.id, `semantic-object:${stableSpaceKey}:${phase}`, i),
                            });
                        }
                    }
                }
            }
        }
        if (entity.roofTopper && entity.roofTopper !== 'none') tasks.push({
            kind: 'roof-topper', entityId: entity.id, topper: entity.roofTopper,
            seed: taskSeed(chunk, entity.id, 'roof-topper'),
        });
        return CUT_COMMON_KOWLOON_ENRICHMENT ? tasks.filter(keepTaskUnderCommonDiagnosticCut) : tasks;
    }

    function planPlazaTasks(chunk, entity) {
        const rng = mulberry32(taskSeed(chunk, entity.id, 'plaza-plan'));
        const tasks = [];
        const density = clamp(entity.detailDensity ?? 1, 0, 1);
        // Ordinary plazas get at most one context-legible civic/street feature.
        // Spectacle props (statues, crime scenes, construction barricades and
        // mega-billboards) are no longer selected randomly; those remain available
        // only for future explicit landmark recipes.
        if (rng() >= density) return tasks;
        const kinds = ['newsstand', 'phone-booth', 'atm-kiosk', 'park'];
        const feature = kinds[taskSeed(chunk, entity.id, 'plaza-feature-order') % kinds.length];
        const seed = taskSeed(chunk, entity.id, `plaza-${feature}`);
        const labelRng = mulberry32(seed ^ 0x6a09e667);
        const [title, subtitle] = textExciter.pairFor(chunk, entity.id, `plaza-${feature}`, pickMassiveNoisePair(labelRng));
        tasks.push({
            kind: `plaza-${feature}`,
            entityId: entity.id,
            x: entity.x + (rng() - 0.5) * Math.max(1.1, (entity.halfX || 2) * 0.72),
            z: entity.z + (rng() - 0.5) * Math.max(1.1, (entity.halfZ || 2) * 0.72),
            title, subtitle, seed,
        });
        return CUT_COMMON_KOWLOON_ENRICHMENT ? tasks.filter(keepTaskUnderCommonDiagnosticCut) : tasks;
    }

    function firstPassClass(taskOrKind) {
        const task = typeof taskOrKind === 'object' && taskOrKind ? taskOrKind : null;
        const kind = task?.kind ?? taskOrKind;
        if (kind === 'semantic-context-prop') {
            const tier = task?.exteriorVisualTier;
            return tier === 'spectacle' || tier === 'identity' || tier === 'macro' ? 'macro-exterior' : 'hidden';
        }
        if (kind === 'sign' || kind === 'awning' || kind === 'graffiti' || kind === 'flyer') return 'facade';
        if (kind === 'pipe' || kind === 'ivy' || kind === 'security' || kind === 'elevator-hardware' || kind === 'spray-cans' || kind === 'street-fixture') return 'fixture';
        if (kind === 'interior-prop' || String(kind).startsWith('semantic-') || kind === 'overhead-cable') return 'hidden';
        if (kind === 'roof-clutter' || kind === 'roof-topper' || String(kind).startsWith('plaza-')) return 'cap';
        return 'other';
    }

    function detailPriority(taskOrKind) {
        const task = typeof taskOrKind === 'object' && taskOrKind ? taskOrKind : null;
        const kind = task?.kind ?? taskOrKind;
        if (kind === 'semantic-context-prop') {
            const tier = task?.exteriorVisualTier;
            if (tier === 'spectacle' || tier === 'identity' || tier === 'macro') return 0;
        }
        if (String(kind).startsWith('plaza-')) return 2;
        return EXTERIOR_TASK_KIND_PRIORITY[kind] ?? 3;
    }

    function sortedEntityTasks(queue) {
        return queue.sort((a, b) =>
            detailPriority(a) - detailPriority(b)
            || exteriorTaskVisualImpact(b) - exteriorTaskVisualImpact(a)
            || a.kind.localeCompare(b.kind)
            || (a.seed >>> 0) - (b.seed >>> 0));
    }

    function chooseFirstPassBundle(queue) {
        const visibleCandidates = queue.filter(task => firstPassClass(task) !== 'hidden');
        if (!visibleCandidates.length) return [];

        // One obvious birth per visible entity is enough to leave first-pass mode.
        // Plaza semantic objects beat generic markers; buildings prefer readable
        // facade/fixture identity. Every other deterministic task remains queued.
        const plazaFeature = visibleCandidates.find(task => String(task.kind).startsWith('plaza-'));
        if (plazaFeature) return [plazaFeature];
        for (const kind of EXTERIOR_FIRST_PASS_KIND_ORDER) {
            const task = visibleCandidates.find(candidate => candidate.kind === kind);
            if (task) return [task];
        }
        return [visibleCandidates[0]];
    }

    function layerTasksAcrossEntities(tasks) {
        const byEntity = new Map();
        for (const task of tasks) {
            const id = String(task.entityId ?? '');
            if (!byEntity.has(id)) byEntity.set(id, []);
            byEntity.get(id).push(task);
        }
        const queues = [...byEntity.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([id, raw]) => {
                const all = sortedEntityTasks(raw);
                const firstPass = chooseFirstPassBundle(all);
                const firstSet = new Set(firstPass);
                const deep = all.filter(task => !firstSet.has(task));
                firstPass.forEach((task, index) => {
                    task.firstPassBundle = true;
                    task.firstPassBundleIndex = index;
                    task.firstPassClass = firstPassClass(task);
                });
                return { id, firstPass, deep, firstPassTarget: firstPass.length };
            });

        const layered = [];
        for (const queue of queues) {
            if (queue.firstPass[0]) layered.push(queue.firstPass[0]);
        }
        for (let layer = 0; ; layer++) {
            let emitted = 0;
            for (const queue of queues) {
                if (layer >= queue.deep.length) continue;
                layered.push(queue.deep[layer]);
                emitted++;
            }
            if (!emitted) break;
        }

        const firstPassTargetByEntity = Object.fromEntries(queues.map(queue => [queue.id, queue.firstPassTarget]));
        const firstPassPublicationTarget = queues.reduce((sum, queue) => sum + queue.firstPassTarget, 0);
        const firstPassEntityTarget = queues.filter(queue => queue.firstPassTarget > 0).length;
        return { tasks: layered, firstPassTargetByEntity, firstPassPublicationTarget, firstPassEntityTarget };
    }



    function planOverheadCableTasks(chunk, entities) {
        const buildings = (entities || []).filter(entity => entity.kind === 'building' || entity.kind === 'district-landmark');
        const tasks = [];
        const seen = new Set();
        for (let i = 0; i < buildings.length && tasks.length < 7; i++) {
            for (let j = i + 1; j < buildings.length && tasks.length < 7; j++) {
                const a = buildings[i], b = buildings[j];
                const dx = b.x - a.x, dz = b.z - a.z;
                const absX = Math.abs(dx), absZ = Math.abs(dz);
                const axis = absX >= absZ ? 'x' : 'z';
                const cross = axis === 'x' ? absZ : absX;
                const along = axis === 'x' ? absX : absZ;
                if (cross > 4.2 || along < 4.0 || along > 13.5) continue;
                const identity = [String(a.id), String(b.id)].sort().join('|');
                if (seen.has(identity)) continue;
                const cableRng = mulberry32(hashString32(`${worldSeed}:cable:${chunk.key}:${identity}`));
                if (cableRng() > 0.34) continue;
                seen.add(identity);
                tasks.push({ kind: 'overhead-cable', entityId: a.id, otherEntityId: b.id, axis, seed: hashString32(`${worldSeed}:cable-task:${chunk.key}:${identity}`) });
            }
        }
        return CUT_COMMON_KOWLOON_ENRICHMENT ? tasks.filter(keepTaskUnderCommonDiagnosticCut) : tasks;
    }

    function plan(chunk, entities) {
        const tasks = [];
        for (const entity of entities || []) {
            if (entity.kind === 'building' || entity.kind === 'district-landmark') tasks.push(...planBuildingTasks(chunk, entity));
            else if (entity.kind === 'plaza') tasks.push(...planPlazaTasks(chunk, entity));
        }
        tasks.push(...planOverheadCableTasks(chunk, entities));
        // CONVERGENCE SCHEDULER: preserve the exact deterministic corpus, but
        // require only one meaningful visible publication per entity before the
        // neighborhood may leave first-pass mode. Second/third features deepen later.
        const layered = layerTasksAcrossEntities(tasks);
        return {
            phase: layered.tasks.length ? DETAIL_PHASE.STRUCTURAL_READY : DETAIL_PHASE.READY,
            tasks: layered.tasks,
            firstPassTargetByEntity: layered.firstPassTargetByEntity,
            firstPassPublishedByEntity: {},
            firstPassPublicationTarget: layered.firstPassPublicationTarget,
            firstPassSuccessfulPublications: 0,
            firstPassEntityTarget: layered.firstPassEntityTarget,
            firstPassEntitiesComplete: 0,
            firstPassComplete: layered.firstPassEntityTarget === 0,
            // Compatibility for older diagnostics. This is now the total number
            // of successful publications required for the semantic first pass.
            firstPassTaskCount: layered.firstPassPublicationTarget,
            cursor: 0,
            attempted: 0,
            published: 0,
            noOp: 0,
            failed: 0,
            completed: 0,
            failures: 0,
            worstStepMs: 0,
            totalStepMs: 0,
            startedAt: 0,
            completedAt: layered.tasks.length ? 0 : performance.now(),
        };
    }

    function getEntity(payload, id) {
        return payload.entities?.find(entity => entity.id === id) ?? null;
    }

    function createPanel(payload, task, graffiti = false) {
        const point = semanticPlacementPoint(task);
        const texture = graffiti
            ? graffitiTexture(THREE, task.text, task.seed)
            : canvasTextTexture(THREE, task.title, task.subtitle, task.seed);
        const material = texture
            ? new THREE.MeshStandardMaterial({
                map: texture,
                transparent: graffiti,
                alphaTest: graffiti ? 0.08 : 0,
                emissive: graffiti ? 0x070707 : 0x16110a,
                emissiveIntensity: graffiti ? 0.08 : 0.35,
                roughness: graffiti ? 0.88 : 0.64,
                side: THREE.DoubleSide,
            })
            : posterFallbackMat;
        if (texture) {
            payload.detailResources.textures.add(texture);
            payload.detailResources.materials.add(material);
        }

        if (graffiti) {
            const tangentX = Math.abs(Math.sin(point.ry)) < 0.5;
            const halfX = tangentX ? task.width * 0.5 : 0.035;
            const halfZ = tangentX ? 0.035 : task.width * 0.5;
            if (!reserveDetailBox(payload, point.x, point.z, halfX, halfZ, point.y - task.height * 0.5, point.y + task.height * 0.5, 0.025)) return null;
            const mesh = new THREE.Mesh(unitPlane, material);
            mesh.name = `chunk-graffiti:${task.entityId}`;
            mesh.position.set(point.x, point.y, point.z);
            mesh.rotation.y = point.ry;
            mesh.scale.set(task.width, task.height, 1);
            mesh.userData.chunkCosmetic = true;
            mesh.userData.detailKind = task.kind;
            return mesh;
        }

        // Projecting blade sign: same street-reading silhouette as authored spawn --
        // wall plate + cantilever arm + dimensional double-sided panel. The panel
        // stays compact enough for ordinary streamed alleys and remains cosmetic.
        const rng = mulberry32(task.seed ^ 0x9e3779b9);
        const group = new THREE.Group();
        group.name = `chunk-blade-sign:${task.entityId}`;
        group.position.set(point.x, point.y, point.z);
        group.rotation.y = point.ry;
        const armLength = 0.34 + rng() * 0.18;
        const bladeWidth = clamp(task.width * 0.52, 1.08, 1.92);
        const bladeHeight = clamp(bladeWidth / 2.25, 0.58, 0.92);
        const panelLocalZ = -(armLength + bladeWidth * 0.5);
        const panelCenterX = point.x + Math.sin(point.ry) * panelLocalZ;
        const panelCenterZ = point.z + Math.cos(point.ry) * panelLocalZ;
        if (!reserveDetailBox(payload, panelCenterX, panelCenterZ, bladeWidth * 0.52, bladeWidth * 0.52, point.y - bladeHeight * 0.56, point.y + bladeHeight * 0.56, 0.06)) return null;

        const plate = new THREE.Mesh(unitBox, securityMat);
        plate.scale.set(0.13, 0.34, 0.09);
        plate.position.set(0, 0, -0.02);
        const arm = new THREE.Mesh(pipeGeo, securityMat);
        arm.scale.set(0.92, armLength, 0.92);
        arm.rotation.x = Math.PI * 0.5;
        arm.position.set(0, 0.08, -armLength * 0.5);
        const braceDrop = 0.24;
        const braceLength = Math.hypot(armLength, braceDrop);
        const brace = new THREE.Mesh(pipeGeo, securityMat);
        brace.scale.set(0.78, braceLength, 0.78);
        brace.rotation.x = -Math.atan2(armLength, braceDrop);
        brace.position.set(0, -braceDrop * 0.5, -armLength * 0.5);
        const panel = new THREE.Mesh(unitBox, [roofHardwareMat, roofHardwareMat, roofHardwareMat, roofHardwareMat, material, material]);
        panel.scale.set(bladeWidth, bladeHeight, 0.075);
        panel.rotation.y = Math.PI * 0.5;
        panel.position.set(0, -0.03, -(armLength + bladeWidth * 0.5));
        group.add(plate, arm, brace, panel);
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        group.userData.semanticClass = 'hanging-sign';
        return group;
    }

    function createPipe(payload, task) {
        const point = semanticPlacementPoint(task);
        const mat = pipeMaterials[task.seed % pipeMaterials.length];
        const mesh = new THREE.Mesh(pipeGeo, mat);
        mesh.name = `chunk-pipe:${task.entityId}`;
        mesh.position.set(point.x, task.y, point.z);
        mesh.scale.set(1, task.height, 1);
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createAwning(payload, task) {
        const point = semanticPlacementPoint(task);
        const mesh = new THREE.Mesh(unitBox, awningMaterials[task.seed % awningMaterials.length]);
        mesh.name = `chunk-awning:${task.entityId}`;
        const horizontal = task.side === 'north' || task.side === 'south';
        mesh.position.set(point.x, task.y, point.z);
        if (horizontal) {
            mesh.position.z += task.side === 'north' ? -task.depth * 0.48 : task.depth * 0.48;
            mesh.scale.set(task.width, 0.14, task.depth);
        } else {
            mesh.position.x += task.side === 'west' ? -task.depth * 0.48 : task.depth * 0.48;
            mesh.scale.set(task.depth, 0.14, task.width);
        }
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createIvy(payload, task) {
        const rng = mulberry32(task.seed);
        const point = semanticPlacementPoint(task);
        const mesh = new THREE.InstancedMesh(leafGeo, ivyMaterials[task.seed % ivyMaterials.length], task.count);
        mesh.name = `chunk-ivy:${task.entityId}`;
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const horizontal = task.side === 'north' || task.side === 'south';
        for (let i = 0; i < task.count; i++) {
            const vertical = (rng() - 0.5) * task.height;
            const spread = (rng() - 0.5) * 1.4;
            p.set(point.x, point.y + vertical, point.z);
            if (horizontal) p.x += spread;
            else p.z += spread;
            q.setFromAxisAngle(up, point.ry + (rng() - 0.5) * 0.22);
            s.set(0.75 + rng() * 0.85, 0.75 + rng() * 1.1, 1);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createFlyer(payload, task) {
        const point = semanticPlacementPoint(task);
        const tangentX = Math.abs(Math.sin(point.ry)) < 0.5;
        const halfX = tangentX ? task.width * 0.5 : 0.03;
        const halfZ = tangentX ? 0.03 : task.width * 0.5;
        if (!reserveDetailBox(payload, point.x, point.z, halfX, halfZ, point.y - task.height * 0.5, point.y + task.height * 0.5, 0.02)) return null;
        const texture = canvasFlyerTexture(THREE, task.title, task.subtitle, task.seed);
        const material = texture ? new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.92, side: THREE.DoubleSide, emissive: 0x080604, emissiveIntensity: 0.05,
        }) : flyerFallbackMat;
        const mesh = new THREE.Mesh(unitPlane, material);
        mesh.name = `chunk-flyer:${task.entityId}`;
        mesh.position.set(point.x, point.y, point.z);
        mesh.rotation.y = point.ry;
        mesh.scale.set(task.width, task.height, 1);
        mesh.userData.chunkCosmetic = true;
        mesh.userData.detailKind = task.kind;
        if (texture) { payload.detailResources.textures.add(texture); payload.detailResources.materials.add(material); }
        return mesh;
    }

    function primaryRoofSpec(entity) {
        const primaryKey = entity.primaryCell ? `${entity.primaryCell.col},${entity.primaryCell.row}` : null;
        const module = entity.footprintModules?.find(candidate => candidate.key === primaryKey) ?? entity.footprintModules?.[0];
        if (!module) return { x: entity.x, z: entity.z, halfX: entity.halfX ?? 2, halfZ: entity.halfZ ?? 2, y: (entity.floors || 1) * (entity.floorH || 3.15) };
        return { x: module.cx, z: module.cz, halfX: module.halfX, halfZ: module.halfZ, y: module.floors * (entity.floorH || 3.15) };
    }

        function createRoofClutter(payload, task) {
        const entity = getEntity(payload, task.entityId);
        const placement = task.topologyPlacement;
        if (!entity || !placement) return null;
        const group = new THREE.Group();
        group.name = `chunk-roof-clutter:${task.entityId}`;
        for (const spec of placement.boxes ?? []) {
            const box = new THREE.Mesh(unitBox, roofHardwareMat);
            box.scale.set(spec.w, spec.h, spec.d);
            box.position.set(spec.x, spec.y, spec.z);
            box.rotation.y = spec.ry;
            group.add(box);
        }
        if (placement.mast) {
            const mast = new THREE.Mesh(pipeGeo, roofHardwareMat);
            mast.scale.set(1.15, placement.mast.h, 1.15);
            mast.position.set(placement.mast.x, placement.mast.y, placement.mast.z);
            group.add(mast);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
    }

    function createElevatorHardware(payload, task) {
        const point = semanticPlacementPoint(task);
        const group = new THREE.Group();
        group.name = `chunk-elevator-hardware:${task.entityId}`;
        group.position.set(point.x, 0, point.z);
        group.rotation.y = point.ry;
        const frame = new THREE.Mesh(unitBox, elevatorMat);
        frame.scale.set(1.42, 2.28, 0.10);
        frame.position.set(0, 1.14, 0.055);
        const left = new THREE.Mesh(unitBox, elevatorDoorMat);
        const right = new THREE.Mesh(unitBox, elevatorDoorMat);
        left.scale.set(0.62, 1.98, 0.045); right.scale.copy(left.scale);
        left.position.set(-0.315, 1.04, 0.115); right.position.set(0.315, 1.04, 0.115);
        const button = new THREE.Mesh(unitBox, awningMaterials[task.seed % awningMaterials.length]);
        button.scale.set(0.10, 0.16, 0.05); button.position.set(0.82, 1.08, 0.15);
        group.add(frame, left, right, button);
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
    }

    function createSprayCans(payload, task) {
        const point = semanticPlacementPoint(task);
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-spray-cans:${task.entityId}`;
        for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
            const can = new THREE.Mesh(pipeGeo, awningMaterials[(task.seed + i) % awningMaterials.length]);
            can.scale.set(1.7, 0.18 + rng() * 0.08, 1.7);
            can.position.set(point.x + (rng() - 0.5) * 0.55, 0.10, point.z + (rng() - 0.5) * 0.55);
            can.rotation.z = (rng() - 0.5) * 0.7;
            group.add(can);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
    }

        function createStreetFixture(payload, task) {
        const point = semanticPlacementPoint(task);
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-street-fixture:${task.variant}:${task.entityId}`;
        group.position.set(point.x, 0, point.z);
        group.rotation.y = point.ry;
        const z = task.topologyPlacement?.localZ ?? -0.34;
        const box = (material, x, y, localZ, sx, sy, sz) => {
            const mesh = new THREE.Mesh(unitBox, material);
            mesh.position.set(x, y, localZ); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
        };
        if (task.variant === 'trash-can') {
            const body = new THREE.Mesh(fixtureCylinderGeo, roofHardwareMat); body.position.set(0, 0.36, z); body.scale.set(0.86, 1, 0.86); group.add(body);
            box(securityMat, 0, 0.72, z, 0.34, 0.07, 0.34);
        } else if (task.variant === 'crate') {
            box(interiorWoodMat, -0.13, 0.28, z, 0.48, 0.56, 0.46).rotation.y = (rng() - 0.5) * 0.20;
            box(interiorWoodMat, 0.20, 0.18, z - 0.08, 0.34, 0.36, 0.34).rotation.y = (rng() - 0.5) * 0.28;
        } else if (task.variant === 'utility-box') {
            box(elevatorMat, 0, 0.48, z, 0.58, 0.96, 0.30); box(elevatorDoorMat, 0, 0.52, z - 0.17, 0.32, 0.34, 0.035);
        } else if (task.variant === 'planter') {
            const pot = new THREE.Mesh(fixtureCylinderGeo, plazaConcreteMat); pot.position.set(0, 0.18, z); pot.scale.set(0.78, 0.50, 0.78); group.add(pot);
            for (let i = 0; i < 3; i++) { const leaf = new THREE.Mesh(leafGeo, ivyMaterials[(task.seed + i) % ivyMaterials.length]); leaf.position.set((i - 1) * 0.12, 0.58 + i * 0.08, z); leaf.rotation.y = i * Math.PI / 3 + rng() * 0.25; leaf.scale.set(0.72, 0.92 + rng() * 0.30, 1); group.add(leaf); }
        } else if (task.variant === 'vending-machine') {
            box(elevatorMat, 0, 0.92, z, 0.72, 1.84, 0.48); box(awningMaterials[task.seed % awningMaterials.length], 0, 1.13, z - 0.26, 0.52, 0.78, 0.04);
        } else if (task.variant === 'bollard') {
            const post = new THREE.Mesh(fixtureCylinderGeo, roofHardwareMat); post.position.set(0, 0.46, z); post.scale.set(0.38, 1.18, 0.38); group.add(post);
        } else if (task.variant === 'manhole') {
            const lid = new THREE.Mesh(fixtureCylinderGeo, roofHardwareMat); lid.position.set(0, 0.025, z - 0.40); lid.scale.set(1.05, 0.07, 1.05); group.add(lid);
        } else if (task.variant === 'weeds') {
            for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(leafGeo, ivyMaterials[(task.seed + i) % ivyMaterials.length]); leaf.position.set((rng()-0.5)*0.34, 0.20 + rng()*0.22, z + (rng()-0.5)*0.24); leaf.rotation.y = rng()*Math.PI; leaf.rotation.z = (rng()-0.5)*0.5; leaf.scale.set(0.42, 0.64 + rng()*0.55, 1); group.add(leaf); }
        } else if (task.variant === 'street-lamp') {
            const post = new THREE.Mesh(pipeGeo, securityMat); post.position.set(0, 1.45, z); post.scale.set(1.55, 2.9, 1.55); group.add(post); box(awningMaterials[task.seed % awningMaterials.length], 0, 2.82, z - 0.10, 0.46, 0.24, 0.42);
        } else if (task.variant === 'news-box') {
            box(awningMaterials[task.seed % awningMaterials.length], 0, 0.62, z, 0.54, 1.08, 0.42); box(securityMat, 0, 1.02, z - 0.23, 0.40, 0.18, 0.04);
        } else if (task.variant === 'bench') {
            box(interiorWoodMat, 0, 0.46, z, 1.25, 0.12, 0.40); box(interiorWoodMat, 0, 0.83, z + 0.16, 1.25, 0.68, 0.10);
            for (const x of [-0.48, 0.48]) box(securityMat, x, 0.23, z, 0.08, 0.46, 0.08);
        } else {
            const post = new THREE.Mesh(pipeGeo, securityMat); post.position.set(0, 1.05, z); post.scale.set(1.20, 2.10, 1.20); group.add(post); box(awningMaterials[task.seed % awningMaterials.length], 0, 2.02, z, 0.34, 0.38, 0.34);
        }
        group.userData.chunkCosmetic = true; group.userData.detailKind = task.kind; group.userData.semanticClass = task.variant;
        return group;
    }


    function createSemanticInterior(payload, task) {
        const def = SEMANTIC_INTERIOR_ASSET_BY_ID.get(task.assetId);
        const placement = task.semanticPlacement;
        if (!def || !placement) return null;
        const group = new THREE.Group();
        group.name = `chunk-semantic:${task.program}:${def.kind}:${task.entityId}`;
        group.position.set(placement.x, placement.y, placement.z);
        group.rotation.y = placement.rotY;
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        group.userData.semanticClass = def.semanticClass;
        group.userData.semanticProgram = task.program;
        group.userData.semanticSpaceId = task.spaceId ?? placement.spaceId ?? null;
        group.userData.semanticInstanceId = task.instanceId ?? placement.instanceId ?? null;
        group.userData.semanticPlacement = {
            mode: placement.mode,
            relationTo: placement.relationTo ?? null,
            schema: def.semanticGraph?.schema ?? null,
        };
        queueSemanticUpgrade(payload, group, def);
        return group;
    }

    function createSemanticContextProp(payload, task) {
        const def = SEMANTIC_INTERIOR_ASSET_BY_ID.get(task.assetId);
        const placement = task.semanticPlacement;
        if (!def || !placement || !task.contextualCosmetic) return null;
        const group = new THREE.Group();
        group.name = `chunk-semantic-context:${task.semanticContextRole}:${def.kind}:${task.entityId}`;
        group.position.set(placement.x, placement.y, placement.z);
        group.rotation.y = placement.rotY;
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        group.userData.semanticClass = def.semanticClass;
        group.userData.semanticProgram = task.program;
        group.userData.semanticContextId = task.semanticContextId ?? null;
        group.userData.semanticOpportunityId = task.semanticOpportunityId ?? null;
        group.userData.semanticContextRole = task.semanticContextRole ?? null;
        group.userData.semanticLayer = task.semanticLayer ?? null;
        group.userData.semanticInstanceId = task.instanceId ?? placement.instanceId ?? null;
        queueSemanticContextUpgrade(payload, group, def, task);
        return group;
    }

    function createOverheadCable(payload, task) {
        const span = task.semanticSpan;
        if (!span?.start || !span?.end) return null;
        const group = new THREE.Group(); group.name = `chunk-overhead-cable:${task.entityId}:${task.otherEntityId}`;
        const rng = mulberry32(task.seed);
        const start = new THREE.Vector3(span.start.x, span.start.y, span.start.z);
        const end = new THREE.Vector3(span.end.x, span.end.y, span.end.z);
        const segments = 5; const up = new THREE.Vector3(0,1,0);
        let prev = start.clone();
        for (let i = 1; i <= segments; i++) {
            const t = i / segments; const next = start.clone().lerp(end, t); next.y -= Math.sin(Math.PI * t) * (0.28 + rng()*0.32);
            const delta = next.clone().sub(prev); const length = delta.length(); const mid = prev.clone().add(next).multiplyScalar(0.5);
            const wire = new THREE.Mesh(pipeGeo, securityMat); wire.position.copy(mid); wire.scale.set(0.42, length, 0.42); wire.quaternion.setFromUnitVectors(up, delta.normalize()); group.add(wire); prev = next;
        }
        group.userData.chunkCosmetic = true; group.userData.detailKind = task.kind; return group;
    }

    function createSecurity(payload, task) {
        const point = semanticPlacementPoint(task);
        const group = new THREE.Group();
        group.name = `chunk-security:${task.entityId}`;
        group.position.set(point.x, point.y, point.z);
        group.rotation.y = point.ry;
        const arm = new THREE.Mesh(unitBox, securityMat);
        arm.scale.set(0.10, 0.10, 0.42);
        arm.position.z = 0.20;
        const body = new THREE.Mesh(unitBox, securityMat);
        body.scale.set(0.34, 0.22, 0.44);
        body.position.z = 0.50;
        body.rotation.x = -0.18;
        group.add(arm, body);
        group.userData.chunkCosmetic = true;
        return group;
    }

    function createInteriorProp(payload, task) {
        const entity = getEntity(payload, task.entityId);
        const module = entity?.footprintModules?.find(candidate => candidate.key === task.moduleKey) ?? entity?.footprintModules?.[0];
        if (!entity || !module) return null;
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-interior-${task.propClass}:${task.entityId}`;
        const marginX = Math.max(0.25, module.halfX * 0.62);
        const marginZ = Math.max(0.25, module.halfZ * 0.62);
        group.position.set(module.cx + (rng() - 0.5) * marginX, 0, module.cz + (rng() - 0.5) * marginZ);
        group.rotation.y = Math.round(rng() * 3) * Math.PI * 0.5;
        const box = (mat, x, y, z, sx, sy, sz) => {
            const mesh = new THREE.Mesh(unitBox, mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
        };
        if (task.propClass === 'shelf') {
            box(interiorWoodMat, 0, 0.95, 0, 1.15, 1.9, 0.32);
            for (const y of [0.35, 0.82, 1.28, 1.68]) box(interiorMetalMat, 0, y, 0.19, 1.05, 0.06, 0.34);
        } else if (task.propClass === 'desk') {
            box(interiorWoodMat, 0, 0.72, 0, 1.25, 0.12, 0.68);
            for (const x of [-0.48, 0.48]) for (const z of [-0.22, 0.22]) box(interiorMetalMat, x, 0.36, z, 0.08, 0.72, 0.08);
        } else if (task.propClass === 'crate') {
            box(interiorWoodMat, 0, 0.42, 0, 0.78, 0.84, 0.78);
            box(interiorMetalMat, 0, 0.42, 0.405, 0.82, 0.08, 0.04);
        } else if (task.propClass === 'chair') {
            box(interiorWoodMat, 0, 0.48, 0, 0.52, 0.10, 0.52);
            box(interiorWoodMat, 0, 0.92, -0.22, 0.52, 0.82, 0.10);
            for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) box(interiorMetalMat, x, 0.24, z, 0.06, 0.48, 0.06);
        } else {
            box(plazaConcreteMat, 0, 0.22, 0, 0.48, 0.44, 0.48);
            box(interiorWoodMat, 0, 0.72, 0, 0.10, 0.78, 0.10);
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), plazaGreenMat);
            crown.position.set(0, 1.18, 0); group.add(crown);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        group.userData.semanticClass = task.propClass;
        return group;
    }

        function createRoofTopper(payload, task) {
        const entity = getEntity(payload, task.entityId);
        const spec = task.topologyPlacement;
        if (!entity || !spec) return null;
        const mesh = new THREE.Mesh(task.topper === 'dome' ? topperDomeGeo : topperSpireGeo, topperMat);
        mesh.name = `chunk-roof-topper:${task.topper}:${task.entityId}`;
        if (task.topper === 'dome') mesh.scale.set(spec.radius, spec.radius * 0.62, spec.radius);
        else mesh.scale.set(spec.r, spec.h, spec.r);
        mesh.position.set(spec.x, spec.y, spec.z);
        mesh.userData.chunkCosmetic = true;
        mesh.userData.detailKind = task.kind;
        return mesh;
    }

    function createPlazaFeature(payload, task) {
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-${task.kind}:${task.entityId}`;
        const semanticAnchor = semanticPlacementPoint(task);
        group.position.set(semanticAnchor.x, semanticAnchor.y, semanticAnchor.z);
        const addBox = (material, x, y, z, sx, sy, sz, ry = 0) => {
            const mesh = new THREE.Mesh(unitBox, material);
            mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = ry;
            group.add(mesh); return mesh;
        };
        const addLabel = (width = 1.4, height = 0.58, y = 1.5, z = 0.36) => {
            const texture = canvasTextTexture(THREE, task.title, task.subtitle, task.seed);
            const material = texture ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, emissive: 0x11100a, emissiveIntensity: 0.18, side: THREE.DoubleSide }) : posterFallbackMat;
            const panel = new THREE.Mesh(unitPlane, material);
            const readableWidth = Math.max(0.92, width);
            const readableHeight = Math.max(0.34, Math.min(height, readableWidth / 1.85));
            panel.position.set(0, y, z); panel.scale.set(readableWidth, readableHeight, 1);
            group.add(panel);
            if (texture) { payload.detailResources.textures.add(texture); payload.detailResources.materials.add(material); }
        };
        switch (task.kind) {
                                                case 'plaza-newsstand': {
                addBox(plazaDarkMat, 0, 0.86, 0, 1.55, 1.72, 0.95);
                addBox(awningMaterials[task.seed%awningMaterials.length], 0, 1.82, 0.05, 1.78, 0.14, 1.18);
                addLabel(1.35, 0.48, 1.34, 0.50);
                break;
            }
            case 'plaza-phone-booth': {
                addBox(plazaDarkMat, 0, 1.08, 0, 0.88, 2.16, 0.88);
                addBox(plazaGlassMat, 0, 1.10, 0.46, 0.66, 1.55, 0.035);
                addLabel(0.68, 0.28, 1.90, 0.49);
                break;
            }
            case 'plaza-atm-kiosk': {
                addBox(plazaDarkMat, 0, 0.92, 0, 1.02, 1.84, 0.78);
                addBox(elevatorDoorMat, 0, 1.12, 0.42, 0.58, 0.48, 0.055);
                addLabel(0.72, 0.28, 1.62, 0.43);
                break;
            }
            case 'plaza-park': {
                for (let i = 0; i < 3; i++) {
                    const solvedTree = task.topologyPlacement?.trees?.[i];
                    const x = solvedTree?.x ?? (rng()-0.5)*1.8, z = solvedTree?.z ?? (rng()-0.5)*1.8;
                    addBox(roofHardwareMat, x, 0.55, z, 0.16, 1.10, 0.16);
                    (group.userData.localDetailPhysics ??= []).push({ x, z, radius: 0.14, height: 1.10 });
                    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.46 + rng()*0.18, 7, 5), plazaGreenMat);
                    crown.position.set(x, 1.38, z); group.add(crown);
                }
                addBox(plazaConcreteMat, 0, 0.28, -0.85, 1.35, 0.15, 0.42);
                break;
            }
                        default: return null;
        }
        group.rotation.y = task.topologyPlacement?.rotation ?? ((rng() - 0.5) * 0.32);
        delete group.userData.localDetailPhysics;

        return group;
    }


        function applyTask(chunk, payload, task) {
        if (!payload?.detailRoot || payload.disposed) return false;
        if (requiresSemanticExteriorPlacement(task) && !task.semanticPlacement) {
            throw new Error(`[semantic-exterior] realization reached coordinate-orphaned ${task.kind}`);
        }
        if ((task.kind === 'street-fixture' || task.kind === 'roof-clutter' || task.kind === 'roof-topper' || String(task.kind).startsWith('plaza-')) && !task.topologySolved) {
            throw new Error(`[topology-precommit] realization reached unsolved blocker ${task.kind}`);
        }
        if (task.topologyAccepted === false) return false;
        let object = null;
        if (task.kind === 'sign') object = createPanel(payload, task, false);
        else if (task.kind === 'graffiti') object = createPanel(payload, task, true);
        else if (task.kind === 'flyer') object = createFlyer(payload, task);
        else if (task.kind === 'pipe') object = createPipe(payload, task);
        else if (task.kind === 'awning') object = createAwning(payload, task);
        else if (task.kind === 'ivy') object = createIvy(payload, task);
        else if (task.kind === 'security') object = createSecurity(payload, task);
        else if (task.kind === 'elevator-hardware') object = createElevatorHardware(payload, task);
        else if (task.kind === 'street-fixture') object = createStreetFixture(payload, task);
        else if (task.kind === 'exterior-prop-field') object = exteriorPropField.realize(payload, task);
        else if (task.kind === 'semantic-context-prop') object = createSemanticContextProp(payload, task);
        else if (String(task.kind).startsWith('semantic-')) object = createSemanticInterior(payload, task);
        else if (task.kind === 'overhead-cable') object = createOverheadCable(payload, task);
        else if (task.kind === 'roof-clutter') object = createRoofClutter(payload, task);
        else if (task.kind === 'spray-cans') object = createSprayCans(payload, task);
        else if (task.kind === 'interior-prop') object = createInteriorProp(payload, task);
        else if (task.kind === 'roof-topper') object = createRoofTopper(payload, task);
        else if (task.kind.startsWith('plaza-')) object = createPlazaFeature(payload, task);
        if (!object) return false;
        if (!task.topologySolved && !objectClearsStructuralReservations(payload, object)) return false;
        if (task.topologyDescriptors?.length) object.userData.topologyDescriptorIds = task.topologyDescriptors.map(descriptor => descriptor.id);
        const exteriorProvenance = semanticExteriorProvenance(task);
        if (exteriorProvenance) object.userData.semanticExteriorProvenance = exteriorProvenance;
        payload.detailRoot.add(object);
        object.traverse?.(freezeObject);
        freezeObject(object);
        payload.detailRoot.updateMatrixWorld(true);
        payload.refinement.lastKind = task.kind;
        return true;
    }

    function hasPending(payload) {
        const state = payload?.refinement;
        return !!state && state.phase !== DETAIL_PHASE.DISPOSED && state.cursor < state.tasks.length;
    }

    function taskRuntimePosition(payload, task) {
        if ([task?.semanticPlacement?.x, task?.semanticPlacement?.z].every(Number.isFinite)) return task.semanticPlacement;
        const entity = getEntity(payload, task?.entityId);
        if ([entity?.x, entity?.z].every(Number.isFinite)) return entity;
        if ([task?.x, task?.z].every(Number.isFinite)) return task;
        return null;
    }

    function nextTaskIndex(state, payload, playerPosition) {
        if (!state || state.cursor >= state.tasks.length) return state?.cursor ?? 0;
        let bestIndex = state.cursor;
        let bestKey = null;
        for (let index = state.cursor; index < state.tasks.length; index++) {
            const task = state.tasks[index];
            const key = exteriorTaskPriorityKey(task, {
                playerPosition,
                taskPosition: taskRuntimePosition(payload, task),
                firstPassIncomplete: !state.firstPassComplete,
            });
            if (!bestKey || compareExteriorPriorityKeys(key, bestKey) < 0) {
                bestIndex = index;
                bestKey = key;
            }
        }
        noteMicroAheadCoverageViolation({
            state,
            payload,
            playerPosition,
            chosen: state.tasks[bestIndex],
            chosenPriorityKey: bestKey,
            remainingTasks: state.tasks.slice(state.cursor),
            taskPositionFor: task => taskRuntimePosition(payload, task),
        });
        return bestIndex;
    }

    function settleFirstPassMiss(state, task) {
        if (!task?.firstPassBundle) return;
        const entityId = String(task.entityId ?? '');
        const target = Number(state.firstPassTargetByEntity?.[entityId]) || 0;
        if (!(target > 0)) return;
        const published = Number(state.firstPassPublishedByEntity?.[entityId]) || 0;
        const nextTarget = Math.max(published, target - 1);
        state.firstPassTargetByEntity[entityId] = nextTarget;
        state.firstPassPublicationTarget = Math.max(0, Number(state.firstPassPublicationTarget) - 1);
        state.firstPassTaskCount = state.firstPassPublicationTarget;
        if (published < target && published >= nextTarget) state.firstPassEntitiesComplete++;
        state.firstPassComplete = state.firstPassEntitiesComplete >= state.firstPassEntityTarget;
    }

    function pump(chunk, payload, { maxSteps = 1, maxMillis = 2, playerPosition = null } = {}) {
        const state = payload?.refinement;
        if (!state || state.phase === DETAIL_PHASE.DISPOSED) return { progressed: false, steps: 0, complete: true, pending: 0, elapsedMs: 0 };
        if (!hasPending(payload)) {
            state.phase = DETAIL_PHASE.READY;
            if (!state.completedAt) state.completedAt = performance.now();
            return { progressed: false, steps: 0, complete: true, pending: 0, elapsedMs: 0, exteriorCoverage: exteriorCoverageSnapshot(state, payload, playerPosition) };
        }
        if (!state.startedAt) state.startedAt = performance.now();
        state.phase = DETAIL_PHASE.REFINING;
        const start = performance.now();
        let steps = 0;
        let attempted = 0;
        let published = 0;
        let noOp = 0;
        let failed = 0;
        const stepCap = Math.max(1, Math.floor(maxSteps));
        const timeCap = Number.isFinite(maxMillis) ? Math.max(0.1, maxMillis) : Infinity;
        while (state.cursor < state.tasks.length && steps < stepCap) {
            const chosenIndex = nextTaskIndex(state, payload, playerPosition);
            if (chosenIndex !== state.cursor) [state.tasks[state.cursor], state.tasks[chosenIndex]] = [state.tasks[chosenIndex], state.tasks[state.cursor]];
            const task = state.tasks[state.cursor++];
            const stepStart = performance.now();
            attempted++;
            state.attempted++;
            try {
                const didPublish = applyTask(chunk, payload, task);
                if (didPublish) {
                    published++;
                    state.published++;
                    state.completed = state.published;
                    recordExteriorCoverageResult(state, task, true);
                    if (task.firstPassBundle) {
                        const entityId = String(task.entityId ?? '');
                        const target = Number(state.firstPassTargetByEntity?.[entityId]) || 0;
                        const before = Number(state.firstPassPublishedByEntity?.[entityId]) || 0;
                        const after = before + 1;
                        state.firstPassPublishedByEntity[entityId] = after;
                        if (before < target) {
                            state.firstPassSuccessfulPublications++;
                            if (after >= target) state.firstPassEntitiesComplete++;
                        }
                        state.firstPassComplete = state.firstPassEntitiesComplete >= state.firstPassEntityTarget;
                    }
                } else {
                    noOp++;
                    state.noOp++;
                    recordExteriorCoverageResult(state, task, false);
                    settleFirstPassMiss(state, task);
                }
            } catch (error) {
                failed++;
                state.failed++;
                state.failures = state.failed;
                recordExteriorCoverageResult(state, task, false);
                settleFirstPassMiss(state, task);
                console.warn?.(`[world] chunk ${chunk.key} detail ${task.kind} failed`, error);
            }
            const stepMs = performance.now() - stepStart;
            state.totalStepMs += stepMs;
            state.worstStepMs = Math.max(state.worstStepMs, stepMs);
            steps++;
            if (performance.now() - start >= timeCap) break;
        }
        const complete = state.cursor >= state.tasks.length;
        if (complete) {
            state.phase = DETAIL_PHASE.READY;
            state.completedAt = performance.now();
        }
        return {
            progressed: steps > 0,
            steps,
            attempted,
            published,
            noOp,
            failed,
            complete,
            pending: Math.max(0, state.tasks.length - state.cursor),
            elapsedMs: performance.now() - start,
            lastKind: state.lastKind ?? null,
            firstPassComplete: !!state.firstPassComplete,
            firstPassEntitiesComplete: state.firstPassEntitiesComplete,
            firstPassEntityTarget: state.firstPassEntityTarget,
            exteriorCoverage: exteriorCoverageSnapshot(state, payload, playerPosition),
        };
    }

    function preparePayloadPlanningState(chunk, payload) {
        const detailRoot = new THREE.Group();
        detailRoot.name = `world-chunk-details:${chunk.key}`;
        detailRoot.userData.worldChunkDetailRoot = true;
        detailRoot.userData.noSpatialChunk = true;
        payload.root.add(detailRoot);
        payload.detailRoot = detailRoot;
        payload.detailResources = { textures: new Set(), materials: new Set() };
        payload.detailReservations = [];
        payload.semanticPlacements = [];
        payload.semanticSpaces = [];
        const state = plan(chunk, payload.entities);
        state.semanticLayout = solveSemanticLayout({
            chunk,
            payload,
            tasks: state.tasks,
            assetById: SEMANTIC_INTERIOR_ASSET_BY_ID,
        });
        state.semanticTasksPlanned = state.semanticLayout.planned;
        state.semanticTasksSolved = state.semanticLayout.solved;
        state.semanticTasksUnresolved = state.semanticLayout.unresolved;
        state.semanticDensityTasksPlanned = state.semanticLayout.densityPlanned ?? state.semanticLayout.planned;
        state.semanticDensityTasksSolved = state.semanticLayout.densitySolved ?? state.semanticLayout.solved;
        state.semanticDensityTasksUnresolved = state.semanticLayout.densityUnresolved ?? state.semanticLayout.unresolved;
        state.semanticExteriorDeferred = state.tasks.filter(task => requiresSemanticExteriorPlacement(task) && task.exteriorPlacementDeferred).length;
        state.semanticExteriorUnresolved = state.tasks.filter(task => requiresSemanticExteriorPlacement(task) && !task.semanticPlacement && !task.exteriorPlacementDeferred).length;
        state.tasks = state.tasks.filter(task =>
            (!String(task.kind).startsWith('semantic-') || !!task.semanticPlacement || !!task.exteriorPlacementDeferred)
            && (!requiresSemanticExteriorPlacement(task) || !!task.semanticPlacement || !!task.exteriorPlacementDeferred));
        return state;
    }

    function exteriorCompositionInput(chunk, payload, state) {
        // Services expose candidates only. Exterior Composition retains quantity,
        // density, coverage, spectacle, reservation and final request authority.
        return {
            chunk,
            payload,
            authoredTasks: state.tasks,
            selectContextAsset: ({ opportunity, request, usedAssetIds }) => selectSemanticContextAsset({
                chunk, payload, assets: SEMANTIC_INTERIOR_ASSETS, opportunity, request, usedAssetIds,
            }),
            planFieldRequest: ({ opportunity, request }) => exteriorPropField.planRequestTask(chunk, payload, opportunity, request),
        };
    }

    function finishPayloadPlanningState(chunk, payload, state, exteriorComposition, semanticPlanning = null) {
        // Content selection consumes the binding after Exterior Composition has
        // decided WHICH requests survive. No sign is created here and no quantity
        // decision is revisited. Existing debug/signature text remains authoritative.
        for (const task of exteriorComposition.acceptedExteriorTasks) {
            const context = task.semanticContentContext;
            if (task.kind !== 'sign' || !context || task.semanticDebug || task.signatureIdentity) continue;
            const semanticFallback = frontageContentFallback(context, [task.title, task.subtitle]);
            const [title, excitedSubtitle] = textExciter.pairFor(
                chunk,
                task.entityId,
                `frontage-sign:${context.campaignKey}:${context.bindingKey}`,
                semanticFallback,
            );
            task.title = title;
            task.subtitle = `${semanticFallback[1]} :: ${excitedSubtitle}`.slice(0, 116);
            task.semanticContent = {
                ...context,
                title: task.title,
                subtitle: task.subtitle,
                source: 'frontage-semantic-binding+procedural-text-exciter',
            };
        }

        const mediaStats = attachSpectacleMedia({
            chunk,
            tasks: exteriorComposition.acceptedExteriorTasks,
            pairFor: ({ task, assemblyId, rng, semanticContentContext }) => {
                const context = semanticContentContext ?? task.semanticContentContext ?? null;
                const semanticFallback = frontageContentFallback(context, pickMassiveNoisePair(rng));
                const [title, excitedSubtitle] = textExciter.pairFor(
                    chunk,
                    task.entityId,
                    `megascreen:${context?.campaignKey ?? assemblyId}`,
                    semanticFallback,
                );
                const subtitle = context ? `${semanticFallback[1]} :: ${excitedSubtitle}`.slice(0, 116) : excitedSubtitle;
                return {
                    0: title,
                    1: subtitle,
                    title,
                    subtitle,
                    family: semanticMediaFamily(context),
                };
            },
        });
        state.tasks = CUT_COMMON_KOWLOON_ENRICHMENT ? exteriorComposition.tasks.filter(keepTaskUnderCommonDiagnosticCut) : exteriorComposition.tasks;
        state.exteriorComposition = { ...exteriorComposition.stats, media: mediaStats };
        state.exteriorCoverage = createExteriorCoverageRuntime(exteriorComposition);
        if (semanticPlanning) state.semanticPlanning = semanticPlanning;

        // Rebuild first-pass accounting from the one admitted queue. The authority
        // guarantees exactly one building exterior anchor while leaving plaza and
        // non-building first-pass work intact.
        state.firstPassTargetByEntity = {};
        state.firstPassPublishedByEntity = {};
        state.firstPassPublicationTarget = 0;
        for (const task of state.tasks) {
            if (!task.firstPassBundle) continue;
            const entityId = String(task.entityId ?? '');
            if (!entityId) continue;
            state.firstPassTargetByEntity[entityId] = (state.firstPassTargetByEntity[entityId] ?? 0) + 1;
            state.firstPassPublicationTarget++;
        }
        state.firstPassEntityTarget = Object.keys(state.firstPassTargetByEntity).length;
        state.firstPassEntitiesComplete = 0;
        state.firstPassSuccessfulPublications = 0;
        state.firstPassTaskCount = state.firstPassPublicationTarget;
        state.firstPassComplete = state.firstPassEntityTarget === 0;
        state.semanticContextMultiplier = {
            ...semanticContextCatalogStats(SEMANTIC_INTERIOR_ASSETS),
            plannerRequestOnly: true,
            automaticPopulationDisabled: true,
            plannerCandidates: exteriorComposition.stats.plannerContextCandidates,
            acceptedByComposition: exteriorComposition.stats.plannerContextAccepted,
        };

        // Traversal/collision truth remains an indivisible precommit invariant:
        // cooperative planning cannot publish a half-planned collision world.
        state.topologyPrecommit = solveBlockingTopology(chunk, payload, state.tasks);
        state.exteriorPropField = {
            plannerRequestOnly: true,
            automaticPopulationDisabled: true,
            plannerCandidates: exteriorComposition.stats.plannerFieldCandidates,
            acceptedTasks: exteriorComposition.stats.plannerFieldAccepted,
            mediaAssemblies: mediaStats.assemblies,
            coordinatedMediaAssemblies: mediaStats.coordinatedAssemblies,
            mediaSurfaces: mediaStats.surfaces,
        };
        payload.refinement = state;
        return state;
    }

    function initializePayload(chunk, payload) {
        const state = preparePayloadPlanningState(chunk, payload);
        const exteriorComposition = compileExteriorCompositionAuthority(exteriorCompositionInput(chunk, payload, state));
        return finishPayloadPlanningState(chunk, payload, state, exteriorComposition);
    }

    async function initializePayloadCooperative(chunk, payload, {
        yieldControl = null,
        maxUnitsPerSlice = 1,
    } = {}) {
        const state = preparePayloadPlanningState(chunk, payload);
        const compiler = createExteriorCompositionCompiler(exteriorCompositionInput(chunk, payload, state));
        const compiled = await runCooperativeCompiler(compiler, {
            yieldControl,
            maxUnitsPerSlice,
            label: `exterior-plan:${chunk.key}`,
        });
        return finishPayloadPlanningState(chunk, payload, state, compiled.result, {
            ...compiled.metrics,
            mode: 'cooperative-exterior-composition',
            schedulerOwnsTiming: true,
            plannerOwnsMeaning: true,
            semanticSeedsIndependentOfQueueOrder: true,
        });
    }

    function disposePayload(payload) {
        const state = payload?.refinement;
        if (state) state.phase = DETAIL_PHASE.DISPOSED;
        for (const texture of payload?.detailResources?.textures ?? []) texture.dispose?.();
        for (const material of payload?.detailResources?.materials ?? []) material.dispose?.();
        payload?.detailResources?.textures?.clear?.();
        payload?.detailResources?.materials?.clear?.();
        payload?.detailRoot?.clear?.();
        if (payload) payload.disposed = true;
    }

    function disposeShared() {
        exteriorPropField.disposeShared();
        unitBox.dispose();
        unitPlane.dispose();
        pipeGeo.dispose();
        fixtureCylinderGeo.dispose();
        leafGeo.dispose();
        topperDomeGeo.dispose();
        topperSpireGeo.dispose();
        for (const material of [...pipeMaterials, ...awningMaterials, ...ivyMaterials, securityMat, posterFallbackMat, flyerFallbackMat, roofHardwareMat, elevatorMat, elevatorDoorMat, plazaConcreteMat, plazaDarkMat, plazaGlassMat, plazaGreenMat, plazaTapeMat, interiorWoodMat, interiorMetalMat, topperMat]) material.dispose();
        for (const template of semanticTemplates.values()) template.traverse?.(object => { if (object.isMesh) { object.geometry?.dispose?.(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) material?.dispose?.(); } });
        semanticTemplates.clear(); semanticTemplatePromises.clear(); semanticFailed.clear(); semanticLoadQueue.length = 0; semanticActiveLoads = 0; semanticLoader = null; semanticLoaderPromise = null;
    }

    return {
        DETAIL_PHASE,
        initializePayload,
        initializePayloadCooperative,
        hasPending,
        pump,
        disposePayload,
        disposeShared,
    };
}
