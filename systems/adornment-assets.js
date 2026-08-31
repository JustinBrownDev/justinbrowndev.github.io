import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { CLAUDE_CITY_ASSETS } from '../vendor/city-pack/asset-catalog.js';
import { cityAssetPlacementMetadata } from '../vendor/city-pack/placement-metadata.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { createPriorityLoadQueue } from '../priority-load-queue.js';
import { CELL_SIDE_DEFS, outwardRotationY } from './cardinal.js';

export function createAdornmentSystem({ CONFIG, camera, scene, pick, randRange, rng }) {
    const pendingGalleryPanels = {};
    let galleryPanelBuilder = null;
    let standoffPanelMounter = null;

    const gltfLoader = new GLTFLoader();
    gltfLoader.setPath('./vendor/models/');
     
     
     
     
     
     
     
     
     
     
    const cityAssetLoader = new GLTFLoader();

     
     
     
     
     
    const adornmentLoadQueue = createPriorityLoadQueue({
        concurrency: CONFIG.streaming.adornmentConcurrency,
        paused: true,
    });
    const failedRealModelLoads = new Set();
    const failedCityAssetLoads = new Set();
    const failedPhotoLoads = new Set();

    function nearestAdornmentPriority(requests, fallback = Number.POSITIVE_INFINITY) {
        if (!requests?.length) return fallback;
        let best = Number.POSITIVE_INFINITY;
        const px = camera.position.x, pz = camera.position.z;
        for (const req of requests) {
            const dx = req.x - px, dz = req.z - pz;
            const d2 = dx * dx + dz * dz;
            if (d2 < best) best = d2;
        }
        return best;
    }

    function queuedGltfLoad(loader, url, key, priority) {
        return adornmentLoadQueue.enqueue({
            key,
            priority,
            run: () => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject)),
        });
    }
    const REAL_MODEL_DEFS = {
        tyre: { file: 'old_tyre.gltf', scale: QP[357] },
        trashbag: { file: 'trashbag.gltf', scale: QP[358] },
        manhole: { file: 'water_manhole_cover.gltf', scale: QP[359] },
        sprayCans: { file: 'spray_paint_bottles.gltf', scale: QP[360] },
        trashCanReal: { file: 'metal_trash_can.gltf', scale: QP[361] },
        streetLamp: { file: 'street_lamp_02.gltf', scale: QP[362] },
        barrelStove: { file: 'barrel_stove.gltf', scale: QP[363] },
        ironGate: { file: 'large_iron_gate.gltf', scale: QP[364] },
    };
    const pendingRealModelPlacements = Object.fromEntries(Object.keys(REAL_MODEL_DEFS).map(k => [k, []]));
    const realModelTemplates = new Map();
    const realModelLoads = new Set();
    const realModelFlushScheduled = new Set();
    const realModelPlacedCount = Object.fromEntries(Object.keys(REAL_MODEL_DEFS).map(k => [k, QP[365]]));
    const _cityAreaCells = CONFIG.maze.cols * CONFIG.maze.rows;
     
     
     
    const LOOSE_REAL_MODEL_BUDGET_SCALE = 0.72;
    const scaleLooseBudget = value => Math.max(0, Math.floor(value * LOOSE_REAL_MODEL_BUDGET_SCALE));
    const REAL_MODEL_BUDGETS = {
        tyre: scaleLooseBudget(Math.min(QP[366], QP[367] + Math.ceil(_cityAreaCells / QP[368]))),
        trashbag: scaleLooseBudget(Math.min(QP[369], QP[370] + Math.ceil(_cityAreaCells / QP[371]))),
        manhole: Math.min(QP[372], QP[373] + Math.ceil(_cityAreaCells / QP[374])),
        sprayCans: scaleLooseBudget(QP[375]),
        trashCanReal: Math.min(QP[376], QP[377] + Math.ceil(_cityAreaCells / QP[378])),
        streetLamp: Math.min(QP[379], QP[380] + Math.ceil(_cityAreaCells / QP[381])),
        barrelStove: QP[382],
        ironGate: 0,
    };

    function sortPlacementRequestsNearestToPlayer(requests) {
        requests.sort((a, b) => {
            const adx = a.x - camera.position.x, adz = a.z - camera.position.z;
            const bdx = b.x - camera.position.x, bdz = b.z - camera.position.z;
            return (adx * adx + adz * adz) - (bdx * bdx + bdz * bdz);
        });
        return requests;
    }

    function flushRealModelPlacements(name) {
        realModelFlushScheduled.delete(name);
        const template = realModelTemplates.get(name);
        const pending = pendingRealModelPlacements[name];
        if (!template || !pending?.length) return;
        const requests = sortPlacementRequestsNearestToPlayer(pending.splice(QP[384], pending.length));
        instantiateCityAssetBatch(template, requests, `real:${name}`);
    }

    function scheduleRealModelFlush(name) {
        if (realModelFlushScheduled.has(name)) return;
        realModelFlushScheduled.add(name);
        queueMicrotask(() => flushRealModelPlacements(name));
    }

    function ensureRealModelLoaded(name) {
        if (realModelTemplates.has(name) || realModelLoads.has(name) || failedRealModelLoads.has(name)) return;
        const def = REAL_MODEL_DEFS[name];
        if (!def) return;
        realModelLoads.add(name);
        queuedGltfLoad(
            gltfLoader,
            def.file,
            `real:${name}`,
            () => nearestAdornmentPriority(pendingRealModelPlacements[name]),
        ).then(gltf => {
            const template = gltf.scene;
            template.scale.setScalar(def.scale);
            realModelTemplates.set(name, template);
            realModelLoads.delete(name);
            flushRealModelPlacements(name);
        }).catch(err => {
            realModelLoads.delete(name);
            failedRealModelLoads.add(name);
            pendingRealModelPlacements[name].length = QP[385];
            console.warn(`[asset] real model "${name}" failed once; structural world unaffected`, err?.message ?? err);
        });
    }

    function placeRealModel(name, x, z, rotY, opts = {}) {
        // Normal world generation intentionally has no wrought-iron gate placement.
        if (name === 'ironGate') return false;
        if (!REAL_MODEL_DEFS[name] || failedRealModelLoads.has(name)) return false;
        const budget = REAL_MODEL_BUDGETS[name] ?? Infinity;
        if (realModelPlacedCount[name] >= budget) return false;
        realModelPlacedCount[name]++;
        pendingRealModelPlacements[name].push({ x, y: opts.y ?? QP[386], z, rotY, scale: opts.scale });
        if (realModelTemplates.has(name)) scheduleRealModelFlush(name);
        else ensureRealModelLoaded(name);
        return true;
    }

     
     
     
     
     
     
     
     
     
     
     
    const CITY_ASSET_BY_ID = new Map(CLAUDE_CITY_ASSETS.map(a => [a.id, a]));
    const cityAssetTemplates = new Map();  
    const cityAssetPending = new Map();    
    const cityAssetFlushScheduled = new Set();

    function instantiateCityAsset(template, req) {
        const inst = template.clone(true);
        inst.position.set(req.x, req.y ?? QP[387], req.z);
        inst.rotation.y = req.rotY;
        if (req.scale !== undefined) {
            if (typeof req.scale === 'number') inst.scale.setScalar(req.scale);
            else inst.scale.set(req.scale.x ?? QP[388], req.scale.y ?? QP[389], req.scale.z ?? QP[390]);
        }
        scene.add(inst);
        return inst;
    }

     
     
     
     
     
    const CITY_ASSET_INSTANCE_CHUNK = QP[391];
    const _cityAssetReqMatrix = new THREE.Matrix4();
    const _cityAssetLeafMatrix = new THREE.Matrix4();
    const _cityAssetPos = new THREE.Vector3();
    const _cityAssetQuat = new THREE.Quaternion();
    const _cityAssetScale = new THREE.Vector3();
    const _cityAssetEuler = new THREE.Euler();
    function instantiateCityAssetBatch(template, requests, assetId) {
        if (!requests?.length) return;
        template.updateMatrixWorld(true);
        const leaves = [];
        let batchable = true;
        template.traverse(obj => {
            if (obj.isSkinnedMesh || obj.morphTargetInfluences) batchable = false;
            if (obj.isMesh) {
                if (!obj.geometry || Array.isArray(obj.material)) batchable = false;
                leaves.push(obj);
            }
        });
        const forceInstanced = typeof assetId === 'string' && assetId.startsWith('real:');
        if (!batchable || !leaves.length || (requests.length < QP[392] && !forceInstanced)) {
            for (const req of requests) instantiateCityAsset(template, req);
            return;
        }

        const chunks = new Map();
        for (const req of requests) {
            const cx = Math.floor(req.x / CITY_ASSET_INSTANCE_CHUNK);
            const cz = Math.floor(req.z / CITY_ASSET_INSTANCE_CHUNK);
            const key = `${cx},${cz}`;
            let bucket = chunks.get(key);
            if (!bucket) chunks.set(key, bucket = { cx, cz, requests: [] });
            bucket.requests.push(req);
        }

        for (const bucket of chunks.values()) {
            const originX = bucket.cx * CITY_ASSET_INSTANCE_CHUNK;
            const originZ = bucket.cz * CITY_ASSET_INSTANCE_CHUNK;
            for (let leafIndex = QP[393]; leafIndex < leaves.length; leafIndex++) {
                const leaf = leaves[leafIndex];
                const mesh = new THREE.InstancedMesh(leaf.geometry, leaf.material, bucket.requests.length);
                mesh.name = `cityAsset:${assetId}:${bucket.cx},${bucket.cz}:${leafIndex}`;
                mesh.position.set(originX, QP[394], originZ);
                mesh.castShadow = leaf.castShadow;
                mesh.receiveShadow = leaf.receiveShadow;
                for (let i = QP[395]; i < bucket.requests.length; i++) {
                    const req = bucket.requests[i];
                    _cityAssetPos.set(req.x - originX, req.y ?? QP[396], req.z - originZ);
                    _cityAssetEuler.set(QP[397], req.rotY, QP[398]);
                    _cityAssetQuat.setFromEuler(_cityAssetEuler);
                    if (typeof req.scale === 'number') _cityAssetScale.setScalar(req.scale);
                    else _cityAssetScale.set(req.scale?.x ?? QP[399], req.scale?.y ?? QP[400], req.scale?.z ?? QP[401]);
                    _cityAssetReqMatrix.compose(_cityAssetPos, _cityAssetQuat, _cityAssetScale);
                    _cityAssetLeafMatrix.multiplyMatrices(_cityAssetReqMatrix, leaf.matrixWorld);
                    mesh.setMatrixAt(i, _cityAssetLeafMatrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
                if (assetId === 'real:tyre' || assetId === 'real:trashbag' || assetId === 'real:sprayCans') {
                    let sx = QP[402], sz = QP[403];
                    for (const req of bucket.requests) { sx += req.x; sz += req.z; }
                    mesh.userData.detailCullDistance = QP[404];
                    mesh.userData.detailCullCenterX = sx / bucket.requests.length;
                    mesh.userData.detailCullCenterZ = sz / bucket.requests.length;
                }
                scene.add(mesh);
            }
        }
    }

    function flushCityAssetPending(id) {
        cityAssetFlushScheduled.delete(id);
        const template = cityAssetTemplates.get(id);
        const pending = cityAssetPending.get(id);
        if (!template || !pending?.length) return;
        const requests = sortPlacementRequestsNearestToPlayer(pending.splice(QP[405], pending.length));
        if (!pending.length) cityAssetPending.delete(id);
        instantiateCityAssetBatch(template, requests, id);
    }

    function scheduleCityAssetFlush(id) {
        if (cityAssetFlushScheduled.has(id)) return;
        cityAssetFlushScheduled.add(id);
        queueMicrotask(() => flushCityAssetPending(id));
    }

     
     
     
     
     
     
     
     
    function placeCityAsset(id, x, z, rotY = QP[406], opts = {}) {
        const def = CITY_ASSET_BY_ID.get(id);
        if (!def) { console.warn(`[testing] unknown city-pack asset "${id}"`); return false; }
        if (failedCityAssetLoads.has(id)) return false;
        const req = { x, y: opts.y ?? QP[407], z, rotY, scale: opts.scale };
        if (cityAssetTemplates.has(id)) {
            let pending = cityAssetPending.get(id);
            if (!pending) cityAssetPending.set(id, pending = []);
            pending.push(req);
            scheduleCityAssetFlush(id);
            return true;
        }
        if (cityAssetPending.has(id)) { cityAssetPending.get(id).push(req); return true; }
        cityAssetPending.set(id, [req]);
        queuedGltfLoad(
            cityAssetLoader,
            './vendor/city-pack/' + def.file,
            `city:${id}`,
            () => nearestAdornmentPriority(cityAssetPending.get(id)),
        ).then(gltf => {
            cityAssetTemplates.set(id, gltf.scene);
            flushCityAssetPending(id);
        }).catch(err => {
            failedCityAssetLoads.add(id);
            cityAssetPending.delete(id);
            console.warn(`[asset] city-pack "${id}" failed once; structural world unaffected`, err?.message ?? err);
        });
        return true;
    }

     
     
     
    const cityAssetCategoryCache = new Map();
    function cityAssetsByCategory(category) {
        if (!cityAssetCategoryCache.has(category)) {
            cityAssetCategoryCache.set(category, CLAUDE_CITY_ASSETS.filter(a => a.category === category));
        }
        return cityAssetCategoryCache.get(category);
    }

     
     
     
     
     
     
     
    const semanticRoomPlacement = new WeakMap();
    function semanticFloorState(rect, yLevel) {
        let floors = semanticRoomPlacement.get(rect);
        if (!floors) semanticRoomPlacement.set(rect, floors = new Map());
        const key = Math.round(yLevel * QP[408]);
        let state = floors.get(key);
        if (!state) floors.set(key, state = { wallUsage: new Map(), supports: [], supportCursor: QP[409], cornerCursor: Math.floor(rng() * QP[410]) });
        return state;
    }
    function semanticAssetBounds(def) {
        const min = def?.boundsMin ?? [QP[411], QP[412], QP[413]];
        const max = def?.boundsMax ?? [QP[414], QP[415], QP[416]];
        const dims = def?.dimensionsXYZ ?? [max[QP[417]] - min[QP[418]], max[QP[419]] - min[QP[420]], max[QP[421]] - min[QP[422]]];
        return { min, max, dims };
    }
    function semanticUsableSides(rect) {
        return CELL_SIDE_DEFS.filter(side => {
            const kind = rect.edgeKinds?.[side.key];
            return kind !== 'internal' && kind !== 'courtyard';
        });
    }
    function semanticWallPose(rect, def, yLevel = QP[423], opts = {}) {
        const state = semanticFloorState(rect, yLevel);
        const { min, dims } = semanticAssetBounds(def);
        const width = Math.max(QP[424], dims[QP[425]] * (opts.scaleX ?? QP[426]));
        const depth = Math.max(QP[427], dims[QP[428]] * (opts.scaleZ ?? QP[429]));
        const sides = semanticUsableSides(rect);
        if (!sides.length) return null;
        const start = Math.floor(rng() * sides.length);

        for (let si = QP[430]; si < sides.length; si++) {
            const side = sides[(start + si) % sides.length];
            const tangentHalf = side.dz !== QP[431] ? rect.hwx : rect.hwz;
            const avail = tangentHalf - width / QP[432] - QP[433];
            if (avail < QP[434]) continue;
            let used = state.wallUsage.get(side.key);
            if (!used) state.wallUsage.set(side.key, used = []);
            const candidates = [QP[435], -avail * QP[436], avail * QP[437], -avail, avail];
            for (const u of candidates) {
                 
                 
                 
                const isDoorSide = rect.doorSide && rect.doorSide.dx === side.dx && rect.doorSide.dz === side.dz;
                const isFireSide = rect.fireEscapeSide && rect.fireEscapeSide.dx === side.dx && rect.fireEscapeSide.dz === side.dz;
                if ((isDoorSide && yLevel < QP[438] || isFireSide && yLevel > QP[439]) && Math.abs(u) < QP[440] + width / QP[441]) continue;
                const lo = u - width / QP[442], hi = u + width / QP[443];
                if (used.some(r => lo - QP[444] < r.hi && r.lo < hi + QP[445])) continue;
                used.push({ lo, hi });
                const tx = side.dz !== QP[446] ? QP[447] : QP[448], tz = side.dx !== QP[449] ? QP[450] : QP[451];
                const wallX = rect.cx + side.dx * (rect.hwx - QP[452]);
                const wallZ = rect.cz + side.dz * (rect.hwz - QP[453]);
                 
                 
                const inwardOffset = Math.max(depth * QP[454], -min[QP[455]]) + QP[456];
                return {
                    x: wallX + tx * u - side.dx * inwardOffset,
                    z: wallZ + tz * u - side.dz * inwardOffset,
                    rotY: outwardRotationY(-side.dx, -side.dz),
                    side, u, tx, tz, width, depth,
                };
            }
        }
        return null;
    }
    function semanticCornerPoint(rect, yLevel = QP[457], inset = QP[458]) {
        const state = semanticFloorState(rect, yLevel);
        const corners = [[QP[459],QP[460]],[QP[461],QP[462]],[QP[463],QP[464]],[QP[465],QP[466]]];
        const [sx, sz] = corners[state.cornerCursor++ % corners.length];
        return {
            x: rect.cx + sx * Math.max(QP[467], rect.hwx - inset),
            z: rect.cz + sz * Math.max(QP[468], rect.hwz - inset),
            sx, sz,
        };
    }
    function semanticRecordSupport(rect, yLevel, pose, def) {
        const placement = cityAssetPlacementMetadata(def);
        if (!placement.canSupportProps || !placement.supportSurfaces.length) return;
        const state = semanticFloorState(rect, yLevel);
        const { dims } = semanticAssetBounds(def);
         
         
        state.supports.push({
            x: pose.x, z: pose.z, rotY: pose.rotY,
            y: yLevel + Math.min(QP[469], Math.max(QP[470], dims[QP[471]] * QP[472])),
            supportAssetId: def.id,
            supportSurface: placement.supportSurfaces[0].id,
            supportRole: placement.supportSurfaces[0].role,
        });
    }
    function ensureSemanticSupport(rect, yLevel) {
        const state = semanticFloorState(rect, yLevel);
        if (state.supports.length) return state.supports[state.supportCursor++ % state.supports.length];
        const id = pick(['interior/desk_01', 'interior/desk_02', 'interior/desk_03', 'interior/desk_04']);
        const def = CITY_ASSET_BY_ID.get(id);
        const pose = semanticWallPose(rect, def, yLevel);
        if (!pose) return null;
        const { min } = semanticAssetBounds(def);
        placeCityAsset(id, pose.x, pose.z, pose.rotY, { y: yLevel - min[QP[473]] });
        semanticRecordSupport(rect, yLevel, pose, def);
        return state.supports[state.supportCursor++ % state.supports.length];
    }
    function placeSemanticCityAsset(rect, id, yLevel = QP[474], opts = {}) {
        const def = CITY_ASSET_BY_ID.get(id);
        if (!rect || !def) return null;
        const { min, max } = semanticAssetBounds(def);
        const roomHeight = opts.roomHeight ?? rect.floorHeight ?? QP[475];
        const mount = opts.mount ?? def.mount ?? 'ground';

        if (/chair/i.test(def.kind || '')) {
            const state = semanticFloorState(rect, yLevel);
            if (state.supports.length) {
                const support = state.supports[state.supportCursor++ % state.supports.length];
                const inwardX = Math.sin(support.rotY), inwardZ = Math.cos(support.rotY);
                const x = support.x + inwardX * QP[476], z = support.z + inwardZ * QP[477];
                const y = yLevel - min[QP[478]];
                 
                const rotY = support.rotY + Math.PI;
                placeCityAsset(id, x, z, rotY, { y, scale: opts.scale });
                return { x, z, rotY, y, mount: 'floor-by-work-surface' };
            }
        }

        if (mount === 'desk' || mount === 'table') {
            const support = ensureSemanticSupport(rect, yLevel);
            if (!support) return null;
            const y = support.y - min[QP[479]] + QP[480];
            placeCityAsset(id, support.x, support.z, support.rotY, { y, scale: opts.scale });
            return { ...support, y, mount };
        }

        if (mount === 'ceiling') {
            const y = yLevel + roomHeight - QP[481] - max[QP[482]];
            const x = rect.cx + randRange(-rect.hwx * QP[483], rect.hwx * QP[484]);
            const z = rect.cz + randRange(-rect.hwz * QP[485], rect.hwz * QP[486]);
            const rotY = pick([QP[487], Math.PI / QP[488]]);
            placeCityAsset(id, x, z, rotY, { y, scale: opts.scale });
            return { x, z, rotY, y, mount };
        }

        const pose = semanticWallPose(rect, def, yLevel, opts);
        if (!pose) return null;
        let y;
        if (mount === 'wall') {
            const desiredBottom = yLevel + Math.min(QP[489], roomHeight * QP[490]);
            y = Math.min(desiredBottom - min[QP[491]], yLevel + roomHeight - QP[492] - max[QP[493]]);
        } else {
            y = yLevel - min[QP[494]];  
        }
        placeCityAsset(id, pose.x, pose.z, pose.rotY, { y, scale: opts.scale });
        if (mount === 'ground') semanticRecordSupport(rect, yLevel, pose, def);
        return { ...pose, y, mount };
    }

     
     
     
     
     
    const photoImages = {};
    const pendingPhotoPlacements = {};

    function loadPhoto(key, file) {
        adornmentLoadQueue.enqueue({
            key: `photo:${key}`,
            priority: () => nearestAdornmentPriority([
                ...(pendingPhotoPlacements[key] || []),
                ...(pendingGalleryPanels?.[key] || []),
            ]),
            run: () => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`photo ${key} failed`));
                img.src = './vendor/photos/' + file;
            }),
        }).then(img => {
            photoImages[key] = img;
            for (const req of (pendingPhotoPlacements[key] || [])) buildPhotoPosterMesh(img, req);
            pendingPhotoPlacements[key] = [];
            for (const req of (pendingGalleryPanels[key] || [])) galleryPanelBuilder?.(img, req.x, req.y, req.z, req.rotY, req.widthUnits, req.title, req.subtitle);
            pendingGalleryPanels[key] = [];
        }).catch(err => {
            failedPhotoLoads.add(key);
            pendingPhotoPlacements[key] = [];
            if (typeof pendingGalleryPanels !== 'undefined') pendingGalleryPanels[key] = [];
            console.warn(`[asset] photo "${key}" failed once; structural world unaffected`, err?.message ?? err);
        });
    }

    function buildPhotoPosterMesh(img, req) {
        const canvas = document.createElement('canvas');
        canvas.width = QP[495]; canvas.height = QP[496];
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = req.paper || '#e8ddc2';
        ctx.fillRect(QP[497], QP[498], QP[499], QP[500]);
        const imgH = Math.min(QP[501], (img.height / img.width) * QP[502]);
        const imgY = QP[503] + (QP[504] - imgH) / QP[505];
        ctx.drawImage(img, QP[506], imgY, QP[507], imgH);
        ctx.strokeStyle = req.frameColor || '#2a2420';
        ctx.lineWidth = QP[508];
        ctx.strokeRect(QP[509], QP[510], QP[511], QP[512]);
        ctx.fillStyle = req.frameColor || '#2a2420';
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillText(req.title, QP[513], QP[514], QP[515]);
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText(req.subtitle, QP[516], QP[517], QP[518]);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const width = req.width || randRange(QP[519], QP[520]);
        standoffPanelMounter?.(
            req.x, req.y, req.z, req.rotY, width, width * (QP[521] / QP[522]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[523] })
        );
    }

     
     
     
    function placePhotoPoster(key, x, y, z, rotY, title, subtitle, opts = {}) {
        const req = { x, y, z, rotY, title, subtitle, ...opts };
        if (photoImages[key]) buildPhotoPosterMesh(photoImages[key], req);
        else (pendingPhotoPlacements[key] ??= []).push(req);
    }

    loadPhoto('portrait', 'me_smiling.jpg');
    loadPhoto('teeth', 'teeth.jpg');
    loadPhoto('selfPortrait', 'self_portrait.jpg');
    loadPhoto('bike', 'bike.jpg');
    loadPhoto('linoPrint', 'lino_print.jpg');
    loadPhoto('puppet', 'puppet_image.jpg');
    loadPhoto('vitalsage', 'vitalsage.jpg');
    loadPhoto('brandyou', 'brandyou.jpg');
    loadPhoto('bibitinator', 'bibitinator.jpg');
    loadPhoto('slidingTiles', 'sliding_tiles.jpg');
     
     
     
     
     
    loadPhoto('graduation', 'graduation.jpg');
    loadPhoto('foundry', 'foundry.jpg');
    loadPhoto('serverRack', 'server_rack.jpg');
    loadPhoto('hardDrives', 'hard_drives.jpg');
    loadPhoto('mirrorPortrait', 'mirror_portrait.jpg');

     

    return Object.freeze({
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
        setGalleryPanelBuilder(builder) { galleryPanelBuilder = typeof builder === 'function' ? builder : null; },
        setStandoffPanelMounter(mounter) { standoffPanelMounter = typeof mounter === 'function' ? mounter : null; },
        stats() {
            return Object.freeze({
                queue: adornmentLoadQueue.stats(),
                failedRealModels: failedRealModelLoads.size,
                failedCityAssets: failedCityAssetLoads.size,
                failedPhotos: failedPhotoLoads.size,
                expensiveModelsPlaced: { ...realModelPlacedCount },
                expensiveModelBudgets: { ...REAL_MODEL_BUDGETS },
            });
        },
    });
}
