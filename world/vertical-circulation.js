import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { CONFIG } from '../config/game-config.js';
import { SpatialHash2D } from '../city-performance.js';
import { appendBoxData, boxesIntersect, computeNotchedRects } from '../systems/geometry-utils.js';
import { outwardRotationY } from '../systems/cardinal.js';

export function createVerticalCirculationSystem(deps) {
    const {
        QUALITY, SEED, STATIC_BATCH_CHUNK, scene, unitPlaneGeo, skirtBoxGeo,
        elevatedPlatforms, rampRuns, overheadCeilings, rooftopDecks,
        exteriorDecorationVolumeIndex, grid,
        buildExteriorPerimeter, buildFloorLayout, buildWallWithGaps, drawFloorLayout,
        wallIntersectsReservedRect, facadeTangent, makeProjectionBox, projectionFits,
        solidClearanceAhead, worldToCellIndex,
        jitterGeometry, makePixelTexture, pick, pileJunkCluster, placeRealModel,
        randRange, rng, takeDynamicLight,
    } = deps;
    let fireEscapeStoryCount = QP[2030];

    const horizontalPlaneBatches = new Map();
    const HORIZONTAL_PLANE_PAGE_CAPACITY = QP[4875];
    const _horizontalBatchMatrix = new THREE.Matrix4();
    const _horizontalBatchPos = new THREE.Vector3();
    const _horizontalBatchScale = new THREE.Vector3();
    const _horizontalBatchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / QP[1012], QP[1013], QP[1014]));
    let horizontalPlaneBatchStats = { draws: QP[1015], instances: QP[1016] };

    function createHorizontalPlanePage(key, bucket) {
        const mesh = new THREE.InstancedMesh(unitPlaneGeo, bucket.mat, HORIZONTAL_PLANE_PAGE_CAPACITY);
        mesh.name = `horizontalPlanes:${key}:page${bucket.pages.length}`;
        mesh.receiveShadow = true;
        mesh.count = QP[1015];
        const page = { mesh, count: QP[1015] };
        bucket.pages.push(page);
        return page;
    }

    function addHorizontalPlane(rect, y, mat) {
        if (rect.hx < QP[1017] || rect.hz < QP[1018]) return;
        const chunkX = Math.floor(rect.x / STATIC_BATCH_CHUNK);
        const chunkZ = Math.floor(rect.z / STATIC_BATCH_CHUNK);
        const key = `${mat.uuid}|${chunkX}|${chunkZ}`;
        let bucket = horizontalPlaneBatches.get(key);
        if (!bucket) {
            bucket = { mat, chunkX, chunkZ, pages: [], instances: QP[1015] };
            horizontalPlaneBatches.set(key, bucket);
        }
        let page = bucket.pages[bucket.pages.length - QP[1024]];
        if (!page || page.count >= HORIZONTAL_PLANE_PAGE_CAPACITY) page = createHorizontalPlanePage(key, bucket);

        _horizontalBatchPos.set(rect.x, y, rect.z);
        _horizontalBatchScale.set(rect.hx * QP[1019], rect.hz * QP[1020], QP[1024]);
        _horizontalBatchMatrix.compose(_horizontalBatchPos, _horizontalBatchQuat, _horizontalBatchScale);
        page.mesh.setMatrixAt(page.count, _horizontalBatchMatrix);
        page.count++;
        page.mesh.count = page.count;
        page.mesh.instanceMatrix.needsUpdate = true;
        page.mesh.computeBoundingBox?.();
        page.mesh.computeBoundingSphere?.();
        bucket.instances++;

        if (page.count === QP[1024]) scene.add(page.mesh);
    }

    function flushHorizontalPlaneBatches() {
        let draws = QP[1021], instances = QP[1022];
        for (const bucket of horizontalPlaneBatches.values()) {
            draws += bucket.pages.length;
            instances += bucket.instances;
        }
        horizontalPlaneBatchStats = { draws, instances };
        console.log(`[perf] horizontal building plates: ${instances} floor/ceiling rectangles live in ${draws} appendable chunk instance pages`);
        return horizontalPlaneBatchStats;
    }
    
     
     
     
     
     
     
     
     
    
     
     
     
     
     
    function addDebugRectOutline(cx, cz, hwx, hwz, y, color) {
        const pts = [
            new THREE.Vector3(cx - hwx, y, cz - hwz),
            new THREE.Vector3(cx + hwx, y, cz - hwz),
            new THREE.Vector3(cx + hwx, y, cz + hwz),
            new THREE.Vector3(cx - hwx, y, cz + hwz),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const loop = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
        scene.add(loop);
    }
    
    let _sharedInteriorFloorMaterial = null;
    function sharedInteriorFloorMaterial() {
        if (_sharedInteriorFloorMaterial) return _sharedInteriorFloorMaterial;
        const floorTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#6a5030';
            ctx.fillRect(QP[1025], QP[1026], w, h);
            ctx.strokeStyle = '#4a3520';
            for (let i = QP[1027]; i < w; i += QP[1028]) { ctx.beginPath(); ctx.moveTo(i, QP[1029]); ctx.lineTo(i, h); ctx.stroke(); }
        }, QP[1030], QP[1031]);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        _sharedInteriorFloorMaterial = new THREE.MeshStandardMaterial({ map: floorTex, roughness: QP[1032] });
        return _sharedInteriorFloorMaterial;
    }
    
     
     
     
     
     
    function addFloorOrCeilingRects(core, y, mat, hole, { support = false, ceiling = false, supportKind = 'interiorFloor' } = {}) {
        const { cx, cz, hwx, hwz } = core;
        const rects = hole
            ? computeNotchedRects(cx, cz, hwx, hwz, hole.x - hole.hx, hole.x + hole.hx, hole.z - hole.hz, hole.z + hole.hz)
            : [{ x: cx, z: cz, hx: hwx, hz: hwz }];
        for (const r of rects) {
            if (support) elevatedPlatforms.push({ ...r, y, supportKind });
            if (ceiling) overheadCeilings.push({ ...r, y });
            addHorizontalPlane(r, y + (support ? QP[1033] : QP[1034]), mat);
        }
        return rects;
    }
    
    function addHeroStairCoreWalls(stair, y0, floorHeight, mat, outSegments) {
        if (!stair?.heroCore || !stair.shaft) return;
        const sh = stair.shaft;
        const doorHalf = Math.min(QP[1035], stair.width * QP[1036]);
        if (stair.axis === 'x') {
             
             
             
            outSegments.push(...buildWallWithGaps('x', sh.x - sh.hx, sh.z - sh.hz, sh.z + sh.hz, [{ lo: stair.cross - doorHalf, hi: stair.cross + doorHalf }], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('x', sh.x + sh.hx, sh.z - sh.hz, sh.z + sh.hz, [{ lo: stair.cross - doorHalf, hi: stair.cross + doorHalf }], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('z', sh.z - sh.hz, sh.x - sh.hx, sh.x + sh.hx, [], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('z', sh.z + sh.hz, sh.x - sh.hx, sh.x + sh.hx, [], floorHeight, mat, y0));
        } else {
            outSegments.push(...buildWallWithGaps('z', sh.z - sh.hz, sh.x - sh.hx, sh.x + sh.hx, [{ lo: stair.cross - doorHalf, hi: stair.cross + doorHalf }], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('z', sh.z + sh.hz, sh.x - sh.hx, sh.x + sh.hx, [{ lo: stair.cross - doorHalf, hi: stair.cross + doorHalf }], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('x', sh.x - sh.hx, sh.z - sh.hz, sh.z + sh.hz, [], floorHeight, mat, y0));
            outSegments.push(...buildWallWithGaps('x', sh.x + sh.hx, sh.z - sh.hz, sh.z + sh.hz, [], floorHeight, mat, y0));
        }
    }
    
     
     
     
     
     
    function buildCoreFloor(core, fl, floorCount, floorHeight, door, extMat, shellMat, wingGaps, circulation = null, floorOptions = {}) {
        const { cx, cz, hwx, hwz } = core;
        const y0 = fl * floorHeight;
        const fullHeight = floorCount * floorHeight;
        const incoming = circulation?.incoming ?? null;
        const outgoing = circulation?.outgoing ?? null;
        const segments = [];
        segments.push(...buildExteriorPerimeter(cx, cz, hwx, hwz, y0, floorHeight, door, extMat, wingGaps, fullHeight));
    
        const coreStair = outgoing?.heroCore ? outgoing : incoming?.heroCore ? incoming : null;
        const reservations = [incoming?.hole, outgoing?.hole, coreStair?.shaft].filter(Boolean);
        const layout = buildFloorLayout(cx, cz, hwx, hwz, door, {
            reservedRects: reservations,
            roomTarget: floorOptions.roomTarget,
        });
         
         
         
         
         
        if (floorOptions.hero && layout.walls.length === QP[1037] && coreStair?.shaft) {
            const sh = coreStair.shaft;
            const candidates = [];
            if (coreStair.axis === 'x') {
                const lowBand = (sh.z - sh.hz) - (cz - hwz);
                const highBand = (cz + hwz) - (sh.z + sh.hz);
                if (lowBand > QP[1038]) candidates.push({ axis: 'z', fixedCoord: (cz - hwz + sh.z - sh.hz) * QP[1039], spanA: cx - hwx, spanB: cx + hwx, doorFrac: QP[1040] });
                if (highBand > QP[1041]) candidates.push({ axis: 'z', fixedCoord: (sh.z + sh.hz + cz + hwz) * QP[1042], spanA: cx - hwx, spanB: cx + hwx, doorFrac: QP[1043] });
            } else {
                const lowBand = (sh.x - sh.hx) - (cx - hwx);
                const highBand = (cx + hwx) - (sh.x + sh.hx);
                if (lowBand > QP[1044]) candidates.push({ axis: 'x', fixedCoord: (cx - hwx + sh.x - sh.hx) * QP[1045], spanA: cz - hwz, spanB: cz + hwz, doorFrac: QP[1046] });
                if (highBand > QP[1047]) candidates.push({ axis: 'x', fixedCoord: (sh.x + sh.hx + cx + hwx) * QP[1048], spanA: cz - hwz, spanB: cz + hwz, doorFrac: QP[1049] });
            }
            const fallback = candidates.find(w => !reservations.some(r => wallIntersectsReservedRect(w, r, QP[1050])));
            if (fallback) layout.walls.push(fallback);
        }
        drawFloorLayout(layout.walls, floorHeight, shellMat, y0, segments);
        addHeroStairCoreWalls(coreStair, y0, floorHeight, shellMat, segments);
    
         
         
         
         
        if (fl > QP[1051]) {
            addFloorOrCeilingRects(core, y0, shellMat, incoming?.hole, { support: true });
        }
    
        if (outgoing) {
            addStairFlight(outgoing.axis, outgoing.from, outgoing.to, outgoing.cross, y0, y0 + floorHeight, {
                width: outgoing.width,
                color: outgoing.heroCore ? QP[1052] : QP[1053],
                railColor: QP[1054],
            });
            addFloorOrCeilingRects(core, y0 + floorHeight, shellMat, outgoing.hole, { ceiling: true });
        } else {
            addFloorOrCeilingRects(core, y0 + floorHeight, shellMat, null, { ceiling: true });
        }
    
        if ((fl === QP[1056] || (floorOptions.hero && fl % QP[1057] === QP[1058])) && takeDynamicLight(QP[1055])) {
            const light = new THREE.PointLight(QP[1059], fl === QP[1060] ? QP[1061] : QP[1062], floorHeight * QP[1063], QP[1064]);
            light.position.set(cx + randRange(-hwx * QP[1065], hwx * QP[1066]), y0 + floorHeight * QP[1067], cz + randRange(-hwz * QP[1068], hwz * QP[1069]));
            scene.add(light);
        }
        if (fl === QP[1070]) {
            const floor = new THREE.Mesh(unitPlaneGeo, sharedInteriorFloorMaterial());
            floor.rotation.x = -Math.PI / QP[1071];
            floor.scale.set(hwx * QP[1072], hwz * QP[1073], QP[1074]);
            floor.position.set(cx, QP[1075], cz);
            scene.add(floor);
        }
        return segments;
    }
    
     
     
     
     
     
     
     
     
     
    const rooftopMechanicalRoomMat = new THREE.MeshStandardMaterial({ color: QP[1076], roughness: QP[1077], metalness: QP[1078], side: THREE.DoubleSide });
    function buildRooftopMechanicalRoom(cx, cz, deckHalf, roofY) {
        const roomHw = Math.max(QP[1079], Math.min(deckHalf * QP[1080], QP[1081]));
        const roomH = QP[1082];
        const mat = rooftopMechanicalRoomMat;
        const maxOffset = Math.max(QP[1083], deckHalf - roomHw - QP[1084]);
        const rcx = cx + randRange(-maxOffset, maxOffset), rcz = cz + randRange(-maxOffset, maxOffset);
        const door = pick([{ dx: QP[1085], dz: QP[1086] }, { dx: QP[1087], dz: QP[1088] }, { dx: QP[1089], dz: QP[1090] }, { dx: QP[1091], dz: QP[1092] }]);
        const segments = buildExteriorPerimeter(rcx, rcz, roomHw, roomHw, roofY, roomH, door, mat, []);
        overheadCeilings.push({ x: rcx, z: rcz, hx: roomHw, hz: roomHw, y: roofY + roomH });
        addHorizontalPlane({ x: rcx, z: rcz, hx: roomHw, hz: roomHw }, roofY + roomH, mat);
         
         
         
         
        addHorizontalPlane({ x: rcx, z: rcz, hx: roomHw, hz: roomHw }, roofY + QP[1093], mat);
        pileJunkCluster('indoor', rcx - roomHw * QP[1094], rcz - roomHw * QP[1095], {
            baseY: roofY,
            spread: Math.max(QP[1096], roomHw * QP[1097]),
            backX: QP[1098],
            backZ: QP[1099],
            tiers: QP[1100] + (rng() < QP[1101] ? QP[1102] : QP[1103]),
            baseCount: QP[1104],
        });
        if (takeDynamicLight(QP[1105])) {
            const light = new THREE.PointLight(QP[1106], QP[1107], roomH * QP[1108], QP[1109]);
            light.position.set(rcx, roofY + roomH * QP[1110], rcz);
            scene.add(light);
        }
        return { yMin: roofY, yMax: roofY + roomH, segments };
    }
    
     
     
     
     
     
     
     
     
     
     
    const catwalkDeckMat = new THREE.MeshStandardMaterial({ color: QP[1111], roughness: QP[1112], metalness: QP[1113] });
    const catwalkRailMat = new THREE.MeshStandardMaterial({ color: QP[1114], roughness: QP[1115], metalness: QP[1116] });
    
    function addCatwalk(a, b) {
        const y = (a.y + b.y) / QP[1117];
        const alongX = Math.abs(a.z - b.z) < QP[1118];  
        const width = QP[1119];
    
         
         
         
         
         
         
        let rect;
        if (alongX) {
            const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
            const lo = left.x + left.hx, hi = right.x - right.hx;
            const len = hi - lo;
            const cz = (a.z + b.z) / QP[1120];
            const deck = new THREE.Mesh(skirtBoxGeo, catwalkDeckMat);
            deck.scale.set(len, QP[1121], width);
            deck.position.set((lo + hi) / QP[1122], y - QP[1123], cz);
            scene.add(deck);
            for (const side of [QP[1124], QP[1125]]) {
                const rail = new THREE.Mesh(skirtBoxGeo, catwalkRailMat);
                rail.scale.set(len, QP[1126], QP[1127]);
                rail.position.set((lo + hi) / QP[1128], y + QP[1129], cz + side * width / QP[1130]);
                scene.add(rail);
            }
            rect = { x: (lo + hi) / QP[1131], z: cz, hx: len / QP[1132], hz: width / QP[1133], y };
        } else {
            const near = a.z < b.z ? a : b, far = a.z < b.z ? b : a;
            const lo = near.z + near.hz, hi = far.z - far.hz;
            const len = hi - lo;
            const cx = (a.x + b.x) / QP[1134];
            const deck = new THREE.Mesh(skirtBoxGeo, catwalkDeckMat);
            deck.scale.set(width, QP[1135], len);
            deck.position.set(cx, y - QP[1136], (lo + hi) / QP[1137]);
            scene.add(deck);
            for (const side of [QP[1138], QP[1139]]) {
                const rail = new THREE.Mesh(skirtBoxGeo, catwalkRailMat);
                rail.scale.set(QP[1140], QP[1141], len);
                rail.position.set(cx + side * width / QP[1142], y + QP[1143], (lo + hi) / QP[1144]);
                scene.add(rail);
            }
            rect = { x: cx, z: (lo + hi) / QP[1145], hx: width / QP[1146], hz: len / QP[1147], y };
        }
        elevatedPlatforms.push(rect);
        if (rng() < QP[1149] && takeDynamicLight(QP[1148])) {
            const light = new THREE.PointLight(QP[1150], QP[1151], QP[1152], QP[1153]);
            light.position.set(rect.x, y + QP[1154], rect.z);
            scene.add(light);
        }
    }
    
     
     
     
     
     
    function* buildRooftopCatwalkSteps() {
        let built = QP[1155];
         
         
         
        const roofIndex = new SpatialHash2D(QP[1156]);
        const candidates = [];
        for (let i = QP[1157]; i < rooftopDecks.length; i++) {
            const roof = rooftopDecks[i];
            roof.__catwalkId = i;
            roofIndex.insert(roof, {
                minX: roof.x - roof.hx, maxX: roof.x + roof.hx,
                minZ: roof.z - roof.hz, maxZ: roof.z + roof.hz,
            });
        }
        const maxCatwalks = Math.min(QP[1158], Math.max(QP[1159], Math.ceil(rooftopDecks.length * QP[1160])));
        for (let i = QP[1161]; i < rooftopDecks.length && built < maxCatwalks; i++) {
            const a = rooftopDecks[i];
            roofIndex.queryBounds({
                minX: a.x - a.hx - QP[1162], maxX: a.x + a.hx + QP[1163],
                minZ: a.z - a.hz - QP[1164], maxZ: a.z + a.hz + QP[1165],
            }, candidates);
             
             
             
            candidates.sort((u, v) => u.__catwalkId - v.__catwalkId);
            for (const b of candidates) {
                if (built >= maxCatwalks) break;
                if (b.__catwalkId <= i || a.buildingKey === b.buildingKey) continue;
                 
                 
                 
                 
                 
                if (Math.abs(a.y - b.y) > QP[1166]) continue;
                const alignedX = Math.abs(a.z - b.z) < QP[1167];
                const alignedZ = Math.abs(a.x - b.x) < QP[1168];
                if (!alignedX && !alignedZ) continue;
                const centerDist = alignedX ? Math.abs(a.x - b.x) : Math.abs(a.z - b.z);
                const gap = centerDist - ((alignedX ? a.hx : a.hz) + (alignedX ? b.hx : b.hz));
                if (gap < QP[1169] || gap > QP[1170]) continue;
                if (rng() > QP[1171]) continue;
                addCatwalk(a, b);
                built++;
            }
            yield { phase: 'rooftop-catwalk-anchor', index: i, built, total: rooftopDecks.length };
        }
        console.log(`[gen] ${built} rooftop catwalks built (${rooftopDecks.length} candidate rooftop decks)`);
        return built;
    }

    function buildRooftopCatwalks() {
        const iterator = buildRooftopCatwalkSteps();
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }
    
     
     
     
     
     
     
     
     
    function addStairTowerExpression(bx, bz, cornerSignX, swZ, enterHeight, hw, floorHeight) {
        const bumpDepth = QP[1172], bumpWidth = QP[1173];
        const faceX = bx + cornerSignX * hw;
        const mat = new THREE.MeshStandardMaterial({ color: QP[1174], roughness: QP[1175], metalness: QP[1176] });
        const bump = new THREE.Mesh(new THREE.BoxGeometry(bumpDepth, enterHeight, bumpWidth), mat);
        bump.position.set(faceX + cornerSignX * bumpDepth / QP[1177], enterHeight / QP[1178], swZ);
        scene.add(bump);
        const winMat = new THREE.MeshStandardMaterial({
            color: QP[1179], roughness: QP[1180], metalness: QP[1181], emissive: QP[1182], emissiveIntensity: QP[1183],
        });
        const floorsHere = Math.max(QP[1184], Math.round(enterHeight / floorHeight));
        for (let i = QP[1185]; i < floorsHere; i++) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(QP[1186], QP[1187]), winMat);
            win.position.set(faceX + cornerSignX * (bumpDepth + QP[1188]), (i + QP[1189]) * floorHeight, swZ);
            win.rotation.y = cornerSignX > QP[1190] ? Math.PI / QP[1191] : -Math.PI / QP[1192];
            scene.add(win);
        }
    }
    
     
     
     
     
    function maybeAddMezzanine(x, z, hw, groundFloorHeight, door) {
        if (rng() > QP[1193]) return;
         
         
         
         
         
        const maxPlatformY = groundFloorHeight - CONFIG.camera.eyeHeight - QP[1194];
        if (maxPlatformY < QP[1195]) return;
        const awayX = door ? -door.dx : QP[1196];
        const awayZ = door ? -door.dz : QP[1197];
        const axis = awayX !== QP[1198] ? 'x' : 'z';
        const platformY = Math.min(maxPlatformY, groundFloorHeight * QP[1199]);
        const platformHalf = hw * QP[1200];
    
        const px = x + awayX * (hw - platformHalf - QP[1201]);
        const pz = z + awayZ * (hw - platformHalf - QP[1202]);
    
        const platform = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(platformHalf * QP[1203], QP[1204], platformHalf * QP[1205]), QP[1206]),
            new THREE.MeshStandardMaterial({ color: QP[1207], roughness: QP[1208] })
        );
        platform.position.set(px, platformY, pz);
        scene.add(platform);
    
         
        const railMat = new THREE.MeshStandardMaterial({ color: QP[1209], roughness: QP[1210] });
        const rail = new THREE.Mesh(new THREE.BoxGeometry(
            axis === 'x' ? QP[1211] : platformHalf * QP[1212], QP[1213], axis === 'x' ? platformHalf * QP[1214] : QP[1215]
        ), railMat);
        rail.position.set(
            px + (axis === 'x' ? awayX * platformHalf : QP[1216]),
            platformY + QP[1217],
            pz + (axis === 'z' ? awayZ * platformHalf : QP[1218])
        );
        scene.add(rail);
    
         
         
         
         
         
         
        const ladderX = axis === 'x' ? px - awayX * platformHalf : x;
        const ladderZ = axis === 'x' ? z : pz - awayZ * platformHalf;
         
         
         
         
        const ladderRotY = outwardRotationY(-awayX, -awayZ);
        addLadder(ladderX, ladderZ, ladderRotY, QP[1219], platformY);
    
        elevatedPlatforms.push({ x: px, z: pz, hx: platformHalf, hz: platformHalf, y: platformY });
    }
    
     
     
     
     
     
     
     
     
    function maybeAddElevator(x, z, hw, groundFloorHeight, door) {
        if (rng() > QP[1220]) return;
        const wallDirs = [{ dx: QP[1221], dz: QP[1222] }, { dx: QP[1223], dz: QP[1224] }, { dx: QP[1225], dz: QP[1226] }, { dx: QP[1227], dz: QP[1228] }]
            .filter(d => !door || d.dx !== door.dx || d.dz !== door.dz);  
        const w = pick(wallDirs);
        const cabW = QP[1229], cabH = Math.min(QP[1230], groundFloorHeight - QP[1231]);
        if (cabH < QP[1232]) return;  
    
        const g = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: QP[1233], roughness: QP[1234], metalness: QP[1235] });
        const frame = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(cabW + QP[1236], cabH + QP[1237], QP[1238]), QP[1239]), frameMat);
        frame.position.set(QP[1240], cabH / QP[1241], QP[1242]);
        g.add(frame);
    
        const doorMat = new THREE.MeshStandardMaterial({ color: QP[1243], roughness: QP[1244], metalness: QP[1245] });
        for (const side of [QP[1246], QP[1247]]) {
            const cabDoor = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(cabW / QP[1248] - QP[1249], cabH - QP[1250], QP[1251]), QP[1252]), doorMat);
            cabDoor.position.set(side * (cabW / QP[1253]), (cabH - QP[1254]) / QP[1255], QP[1256]);
            g.add(cabDoor);
        }
    
         
         
        const floorNum = QP[1257] + Math.floor(rng() * QP[1258]);
        const indicatorTex = makePixelTexture((ctx, iw, ih) => {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(QP[1259], QP[1260], iw, ih);
            ctx.fillStyle = '#ff3a1e';
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(String(floorNum), iw / QP[1261], ih / QP[1262] + QP[1263]);
        }, QP[1264], QP[1265]);
        const indicator = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[1266], QP[1267]),
            new THREE.MeshBasicMaterial({ map: indicatorTex })
        );
        indicator.position.set(QP[1268], cabH + QP[1269], QP[1270]);
        g.add(indicator);
    
        const buttonMat = new THREE.MeshStandardMaterial({ color: QP[1271], emissive: QP[1272], roughness: QP[1273] });
        const button = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(QP[1274], QP[1275], QP[1276], QP[1277]), QP[1278]), buttonMat);
        button.rotation.x = Math.PI / QP[1279];
        button.position.set(cabW / QP[1280] + QP[1281], QP[1282], QP[1283]);
        g.add(button);
    
        if (takeDynamicLight(QP[1284])) {
            const light = new THREE.PointLight(QP[1285], QP[1286], QP[1287], QP[1288]);
            light.position.set(QP[1289], cabH + QP[1290], QP[1291]);
            g.add(light);
        }
    
         
         
         
         
         
        g.rotation.y = outwardRotationY(-w.dx, -w.dz);
        g.position.set(x + w.dx * (hw - QP[1292]), QP[1293], z + w.dz * (hw - QP[1294]));
        scene.add(g);
    }
    
     
     
     
     
     
     
    const stairStepMaterialCache = new Map();
    const stairRailMaterialCache = new Map();
    function cachedStairMaterial(cache, color, rail = false) {
        const key = color >>> QP[1295];
        if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({
            color: key,
            roughness: rail ? QP[1296] : QP[1297],
            metalness: rail ? QP[1298] : QP[1299],
        }));
        return cache.get(key);
    }
    function addStairFlight(axis, along0, along1, cross, y0, y1, opts = {}) {
        const width = opts.width ?? QP[1343];
        const along = along1 - along0, rise = y1 - y0;
        const n = Math.max(QP[1344], Math.round(Math.abs(rise) / QP[1345]));
        const stepDepth = Math.abs(along) / n;
    
         
         
         
         
         
         
        const positions = [], indices = [];
        for (let i = QP[1346]; i < n; i++) {
            const tMid = (i + QP[1347]) / n;
            const posAlong = along0 + along * tMid;
            const posY = y0 + rise * tMid;
            appendBoxData(
                positions, indices,
                axis === 'x' ? posAlong : cross,
                posY,
                axis === 'x' ? cross : posAlong,
                axis === 'x' ? stepDepth * QP[1348] : width,
                QP[1349],
                axis === 'x' ? width : stepDepth * QP[1350],
            );
        }
        const stepGeo = new THREE.BufferGeometry();
        stepGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, QP[1351]));
        stepGeo.setIndex(indices);
        stepGeo.computeVertexNormals();
        const stepMat = cachedStairMaterial(stairStepMaterialCache, opts.color ?? QP[1352], false);
        scene.add(new THREE.Mesh(stepGeo, stepMat));
    
        const railMat = cachedStairMaterial(stairRailMaterialCache, opts.railColor ?? QP[1353], true);
        for (const side of [QP[1354], QP[1355]]) {
            const rc = cross + side * (width / QP[1356] + QP[1357]);
            const rail = new THREE.Mesh(skirtBoxGeo, railMat);
            rail.scale.set(
                axis === 'x' ? Math.abs(along) * QP[1358] : QP[1359],
                QP[1360],
                axis === 'x' ? QP[1361] : Math.abs(along) * QP[1362],
            );
            rail.position.set(
                axis === 'x' ? along0 + along / QP[1363] : rc,
                y0 + rise / QP[1364] + QP[1365],
                axis === 'x' ? rc : along0 + along / QP[1366],
            );
            scene.add(rail);
        }
        rampRuns.push({ axis, from: along0, to: along1, fixedCoord: cross, halfWidth: width / QP[1367] + QP[1368], y0, y1 });
    }
    
    function addLandingPlatform(x, z, halfW, y, opts = {}) {
        const platform = new THREE.Mesh(
            skirtBoxGeo,
            cachedStairMaterial(stairStepMaterialCache, opts.color ?? QP[1369], false)
        );
        platform.scale.set(halfW * QP[1370], QP[1371], halfW * QP[1372]);
         
        platform.position.set(x, y - QP[1373], z);
        scene.add(platform);
        elevatedPlatforms.push({ x, z, hx: halfW, hz: halfW, y });
    }
    
     
     
     
     
     
     
     
    const FIRE_ESCAPE_DEPTH = QP[1374];
    const FIRE_ESCAPE_MIN_FACADE_HALF = QP[1375];
    const FIRE_ESCAPE_OUTER_CLEARANCE = QP[1376];
    const FIRE_ESCAPE_FLIGHT_WIDTH = QP[1377];
    const fireEscapeDeckMat = new THREE.MeshStandardMaterial({ color: QP[1378], roughness: QP[1379], metalness: QP[1380] });
    const fireEscapeRailMat = new THREE.MeshStandardMaterial({ color: QP[1381], roughness: QP[1382], metalness: QP[1383] });
    const fireEscapeBraceMat = new THREE.MeshStandardMaterial({ color: QP[1384], roughness: QP[1385], metalness: QP[1386] });
    const elevatedBridgeAnchors = [];
    
    function addFireEscapeRectDeck(facade, uCenter, outwardCenter, tangentHalf, normalHalf, y, opts = {}) {
        const { tx, tz } = facadeTangent(facade);
        const nx = facade.normalX, nz = facade.normalZ;
        const x = facade.cx + tx * uCenter + nx * outwardCenter;
        const z = facade.cz + tz * uCenter + nz * outwardCenter;
        const hx = facade.axisIsX ? tangentHalf : normalHalf;
        const hz = facade.axisIsX ? normalHalf : tangentHalf;
        const deck = new THREE.Mesh(skirtBoxGeo, fireEscapeDeckMat);
        deck.scale.set(hx * QP[1387], QP[1388], hz * QP[1389]);
        deck.position.set(x, y - QP[1390], z);
        scene.add(deck);
        elevatedPlatforms.push({ x, z, hx, hz, y, supportKind: 'fireEscape' });
    
        if (opts.outerRail) {
            const rail = new THREE.Mesh(skirtBoxGeo, fireEscapeRailMat);
            rail.scale.set(facade.axisIsX ? tangentHalf * QP[1391] : QP[1392], QP[1393], facade.axisIsX ? QP[1394] : tangentHalf * QP[1395]);
            rail.position.set(x + nx * (normalHalf - QP[1396]), y + QP[1397], z + nz * (normalHalf - QP[1398]));
            scene.add(rail);
        }
        return { x, z, hx, hz, y };
    }
    
    function addFireEscapeTurnRail(facade, uCenter, outwardCenter, tangentHalf, normalHalf, y, openTowardU) {
        const { tx, tz } = facadeTangent(facade);
        const nx = facade.normalX, nz = facade.normalZ;
         
        const outer = new THREE.Mesh(skirtBoxGeo, fireEscapeRailMat);
        outer.scale.set(facade.axisIsX ? tangentHalf * QP[1399] : QP[1400], QP[1401], facade.axisIsX ? QP[1402] : tangentHalf * QP[1403]);
        outer.position.set(
            facade.cx + tx * uCenter + nx * (outwardCenter + normalHalf - QP[1404]), y + QP[1405],
            facade.cz + tz * uCenter + nz * (outwardCenter + normalHalf - QP[1406])
        );
        scene.add(outer);
        const closedSign = -Math.sign(openTowardU || QP[1407]);
        const end = new THREE.Mesh(skirtBoxGeo, fireEscapeRailMat);
        end.scale.set(facade.axisIsX ? QP[1408] : normalHalf * QP[1409], QP[1410], facade.axisIsX ? normalHalf * QP[1411] : QP[1412]);
        end.position.set(
            facade.cx + tx * (uCenter + closedSign * (tangentHalf - QP[1413])) + nx * outwardCenter,
            y + QP[1414],
            facade.cz + tz * (uCenter + closedSign * (tangentHalf - QP[1415])) + nz * outwardCenter
        );
        scene.add(end);
    }
    
    function fireEscapePreviewFacade(rect, side, height) {
        const axisIsX = side.dz !== QP[1416];
        return {
            id: QP[1417],
            cx: rect.cx + side.dx * (rect.hwx + QP[1418]),
            cz: rect.cz + side.dz * (rect.hwz + QP[1419]),
            normalX: side.dx, normalZ: side.dz,
            axisIsX,
            half: axisIsX ? rect.hwx : rect.hwz,
            yMin: QP[1420], yMax: height,
        };
    }
    
    function fireEscapeDimensions(facade) {
        const runHalf = Math.min(QP[1421], Math.max(QP[1422], facade.half - QP[1423]));
        const turnHalf = Math.min(QP[1424], Math.max(QP[1425], facade.half - runHalf - QP[1426]));
        const outerU = runHalf + turnHalf;
        const accessHalf = Math.min(facade.half - QP[1427], outerU + QP[1428]);
        return { runHalf, turnHalf, outerU, accessHalf };
    }
    
    function fireEscapeSideFits(rect, side, height) {
        const facade = fireEscapePreviewFacade(rect, side, height);
        if (facade.half < FIRE_ESCAPE_MIN_FACADE_HALF) return false;
        const dims = fireEscapeDimensions(facade);
        if (dims.runHalf < QP[1429] || dims.accessHalf > facade.half) return false;
        const clearance = solidClearanceAhead(facade.cx, facade.cz, side.dx, side.dz);
        if (Number.isFinite(clearance) && clearance < FIRE_ESCAPE_DEPTH + FIRE_ESCAPE_OUTER_CLEARANCE) return false;
        return projectionFits(makeProjectionBox(facade, QP[1430], QP[1431], height, FIRE_ESCAPE_DEPTH + QP[1432], dims.accessHalf));
    }
    
    function buildFireEscape(facade, floorHeight, floorCount, buildingKey) {
        if (!facade || floorCount < QP[1433]) return [];
        const nx = facade.normalX, nz = facade.normalZ;
        const { tx, tz } = facadeTangent(facade);
        const axis = facade.axisIsX ? 'x' : 'z';
        const centerAlong = axis === 'x' ? facade.cx : facade.cz;
        const dims = fireEscapeDimensions(facade);
        const { runHalf, turnHalf, outerU, accessHalf } = dims;
    
         
         
         
        const innerNormal = QP[1434];
        const outerNormal = QP[1435];
        const innerCross = axis === 'x' ? facade.cz + nz * innerNormal : facade.cx + nx * innerNormal;
        const outerCross = axis === 'x' ? facade.cz + nz * outerNormal : facade.cx + nx * outerNormal;
        const floorTurnNormalCenter = FIRE_ESCAPE_DEPTH * QP[1436];
        const floorTurnNormalHalf = FIRE_ESCAPE_DEPTH * QP[1437];
        const accessDepth = QP[1438];
        const landings = [];
    
         
         
        const groundTurnU = -outerU;
        addFireEscapeRectDeck(facade, groundTurnU, floorTurnNormalCenter, turnHalf, floorTurnNormalHalf, QP[1439], { outerRail: true });
        addFireEscapeTurnRail(facade, groundTurnU, floorTurnNormalCenter, turnHalf, floorTurnNormalHalf, QP[1440], QP[1441]);
    
        for (let story = QP[1442]; story < floorCount; story++) {
            const y0 = story * floorHeight;
            const y1 = (story + QP[1443]) * floorHeight;
            const yMid = (y0 + y1) * QP[1444];
            const a0 = centerAlong - runHalf;
            const a1 = centerAlong + runHalf;
    
            addStairFlight(axis, a0, a1, innerCross, Math.max(QP[1445], y0), yMid, {
                width: FIRE_ESCAPE_FLIGHT_WIDTH, color: QP[1446], railColor: QP[1447],
            });
    
             
             
             
            const midU = outerU;
            const midNormalCenter = (innerNormal + outerNormal) * QP[1448];
            const midNormalHalf = (outerNormal - innerNormal) * QP[1449] + FIRE_ESCAPE_FLIGHT_WIDTH * QP[1450] + QP[1451];
            addFireEscapeRectDeck(facade, midU, midNormalCenter, turnHalf, midNormalHalf, yMid, { outerRail: true });
            addFireEscapeTurnRail(facade, midU, midNormalCenter, turnHalf, midNormalHalf, yMid, QP[1452]);
    
            addStairFlight(axis, a1, a0, outerCross, yMid, y1, {
                width: FIRE_ESCAPE_FLIGHT_WIDTH, color: QP[1453], railColor: QP[1454],
            });
    
             
             
             
             
             
            const access = addFireEscapeRectDeck(facade, QP[1455], accessDepth * QP[1456] + QP[1457], accessHalf, accessDepth * QP[1458], y1, { outerRail: false });
            const floorU = -outerU;
            addFireEscapeRectDeck(facade, floorU, floorTurnNormalCenter, turnHalf, floorTurnNormalHalf, y1, { outerRail: true });
            addFireEscapeTurnRail(facade, floorU, floorTurnNormalCenter, turnHalf, floorTurnNormalHalf, y1, QP[1459]);
    
            fireEscapeStoryCount++;
            const anchor = {
                 
                 
                 
                x: facade.cx + nx * (FIRE_ESCAPE_DEPTH * QP[1460]),
                z: facade.cz + nz * (FIRE_ESCAPE_DEPTH * QP[1461]),
                y: y1,
                hx: facade.axisIsX ? accessHalf : FIRE_ESCAPE_DEPTH * QP[1462],
                hz: facade.axisIsX ? FIRE_ESCAPE_DEPTH * QP[1463] : accessHalf,
                u: QP[1464],
                story: story + QP[1465],
            };
            landings.push(anchor);
            if (story + QP[1466] < floorCount) {
                elevatedBridgeAnchors.push({
                    ...anchor,
                    normalX: nx, normalZ: nz,
                    tangentX: tx, tangentZ: tz,
                    buildingKey, facadeId: facade.id,
                    floor: story + QP[1467],
                });
            }
    
             
            if (y1 > QP[1468]) {
                for (const sign of [QP[1469], QP[1470]]) {
                    const brace = new THREE.Mesh(skirtBoxGeo, fireEscapeBraceMat);
                    brace.scale.set(QP[1471], QP[1472], QP[1473]);
                    brace.position.set(
                        facade.cx + tx * (floorU + sign * turnHalf * QP[1474]) + nx * (FIRE_ESCAPE_DEPTH * QP[1475]),
                        y1 - QP[1476],
                        facade.cz + tz * (floorU + sign * turnHalf * QP[1477]) + nz * (FIRE_ESCAPE_DEPTH * QP[1478])
                    );
                    brace.rotation.z = facade.axisIsX ? sign * QP[1479] : QP[1480];
                    brace.rotation.x = facade.axisIsX ? QP[1481] : -sign * QP[1482];
                    scene.add(brace);
                }
            }
        }
        return landings;
    }
    
     
     
     
     
     
    const hangingBridgeDeckMat = new THREE.MeshStandardMaterial({ color: QP[1483], roughness: QP[1484], metalness: QP[1485] });
    const hangingBridgeCableMat = new THREE.LineBasicMaterial({ color: QP[1486] });
    function hangingBridgeSpanIsOpen(a, b) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const steps = Math.max(QP[1487], Math.ceil(dist / QP[1488]));
         
         
        for (let i = QP[1489]; i < steps - QP[1490]; i++) {
            const t = i / steps;
            const { col, row } = worldToCellIndex(a.x + dx * t, a.z + dz * t);
            if (grid[row]?.[col]) return false;
        }
        return true;
    }
    
    const _hangingProjectionCandidates = [];
    function hangingBridgeClearsDecor(a, b) {
        const alongX = Math.abs(a.normalX) > QP[1491];
        const width = QP[1492];
        const y = Math.min(a.y, b.y);
        let xMin, xMax, zMin, zMax;
        if (alongX) {
            const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
            xMin = left.x + left.hx; xMax = right.x - right.hx;
            zMin = (a.z + b.z) * QP[1493] - width * QP[1494];
            zMax = (a.z + b.z) * QP[1495] + width * QP[1496];
        } else {
            const near = a.z < b.z ? a : b, far = a.z < b.z ? b : a;
            zMin = near.z + near.hz; zMax = far.z - far.hz;
            xMin = (a.x + b.x) * QP[1497] - width * QP[1498];
            xMax = (a.x + b.x) * QP[1499] + width * QP[1500];
        }
        if (xMax <= xMin || zMax <= zMin) return false;
        const box = { xMin, xMax, zMin, zMax, yMin: y - QP[1501], yMax: y + QP[1502] };
        exteriorDecorationVolumeIndex.queryBounds({ minX: xMin, maxX: xMax, minZ: zMin, maxZ: zMax }, _hangingProjectionCandidates);
        for (const v of _hangingProjectionCandidates) {
             
             
             
            if (v.facadeId === a.facadeId || v.facadeId === b.facadeId) continue;
            if (boxesIntersect(box, v)) return false;
        }
        return true;
    }
    
    function addHangingBridge(a, b, cableBuckets) {
        const alongX = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
        const width = QP[1503];
        const y = Math.min(a.y, b.y);
        let x, z, hx, hz, len;
        if (alongX) {
            const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
            const lo = left.x + left.hx, hi = right.x - right.hx;
            len = hi - lo;
            if (len <= QP[1504]) return false;
            x = (lo + hi) * QP[1505]; z = (a.z + b.z) * QP[1506]; hx = len * QP[1507]; hz = width * QP[1508];
        } else {
            const near = a.z < b.z ? a : b, far = a.z < b.z ? b : a;
            const lo = near.z + near.hz, hi = far.z - far.hz;
            len = hi - lo;
            if (len <= QP[1509]) return false;
            x = (a.x + b.x) * QP[1510]; z = (lo + hi) * QP[1511]; hx = width * QP[1512]; hz = len * QP[1513];
        }
    
        const deck = new THREE.Mesh(skirtBoxGeo, hangingBridgeDeckMat);
        deck.scale.set(hx * QP[1514], QP[1515], hz * QP[1516]);
        deck.position.set(x, y - QP[1517], z);
        scene.add(deck);
        elevatedPlatforms.push({ x, z, hx, hz, y, supportKind: 'hangingBridge' });
    
         
         
         
        const chunkX = Math.floor(x / QP[1518]), chunkZ = Math.floor(z / QP[1519]);
        const key = `${chunkX},${chunkZ}`;
        let pos = cableBuckets.get(key);
        if (!pos) cableBuckets.set(key, pos = []);
        const sideAxisX = alongX ? QP[1520] : QP[1521];
        const sideAxisZ = alongX ? QP[1522] : QP[1523];
        const startAlong = alongX ? x - hx : z - hz;
        const endAlong = alongX ? x + hx : z + hz;
        const segments = Math.max(QP[1524], Math.ceil(len / QP[1525]));
        for (const side of [QP[1526], QP[1527]]) {
            let prev = null;
            for (let i = QP[1528]; i <= segments; i++) {
                const t = i / segments;
                const along = startAlong + (endAlong - startAlong) * t;
                const sag = QP[1529] * t * (QP[1530] - t);  
                const px = alongX ? along : x + sideAxisX * side * width * QP[1531];
                const pz = alongX ? z + sideAxisZ * side * width * QP[1532] : along;
                const py = y + QP[1533] - sag * QP[1534];
                if (prev) pos.push(prev[QP[1535]], prev[QP[1536]], prev[QP[1537]], px, py, pz);
                 
                 
                if (i > QP[1538] && i < segments && i % QP[1539] === QP[1540]) pos.push(px, py, pz, px, y + QP[1541], pz);
                prev = [px, py, pz];
            }
        }
        return true;
    }
    
    function* buildHangingBridgeSteps() {
        if (elevatedBridgeAnchors.length < QP[1542]) {
            console.log(`[gen] 0 upper-floor hanging bridges (${elevatedBridgeAnchors.length} landing anchors)`);
            return QP[1543];
        }
        const index = new SpatialHash2D(QP[1544]);
        for (let i = QP[1545]; i < elevatedBridgeAnchors.length; i++) {
            const a = elevatedBridgeAnchors[i];
            a.__bridgeAnchorId = i;
            index.insert(a, { minX: a.x - QP[1546], maxX: a.x + QP[1547], minZ: a.z - QP[1548], maxZ: a.z + QP[1549] });
        }
        const used = new Set();
        const candidates = [];
        const cableBuckets = new Map();
        const maxBuilt = Math.min(QP[1550], Math.max(QP[1551], Math.ceil(elevatedBridgeAnchors.length * QP[1552])));
        let built = QP[1553];
    
        for (const a of elevatedBridgeAnchors) {
            yield { phase: 'hanging-bridge-anchor', anchor: a.__bridgeAnchorId, built, total: elevatedBridgeAnchors.length };
            if (built >= maxBuilt || used.has(a.__bridgeAnchorId)) continue;
            index.queryRadius(a.x, a.z, QP[1554], candidates);
            let best = null, bestGap = Infinity;
            for (const b of candidates) {
                if (b === a || used.has(b.__bridgeAnchorId) || a.buildingKey === b.buildingKey) continue;
                 
                 
                 
                 
                if (Math.abs(a.y - b.y) > QP[1555]) continue;
                if (a.normalX * b.normalX + a.normalZ * b.normalZ > QP[1556]) continue;  
                const dx = b.x - a.x, dz = b.z - a.z;
                if (dx * a.normalX + dz * a.normalZ < QP[1557]) continue;
                if (-dx * b.normalX - dz * b.normalZ < QP[1558]) continue;
                const alongX = Math.abs(a.normalX) > QP[1559];
                if (alongX ? Math.abs(dz) > QP[1560] : Math.abs(dx) > QP[1561]) continue;
                const span = alongX ? Math.abs(dx) : Math.abs(dz);
                const supportHalfA = alongX ? a.hx : a.hz;
                const supportHalfB = alongX ? b.hx : b.hz;
                const gap = span - supportHalfA - supportHalfB;
                if (gap < QP[1562] || gap > QP[1563] || gap >= bestGap) continue;
                if (!hangingBridgeSpanIsOpen(a, b)) continue;
                if (!hangingBridgeClearsDecor(a, b)) continue;
                best = b; bestGap = gap;
            }
            if (!best || rng() > QP[1564]) continue;
            if (!addHangingBridge(a, best, cableBuckets)) continue;
            used.add(a.__bridgeAnchorId); used.add(best.__bridgeAnchorId);
            built++;
        }
    
        for (const [key, positions] of cableBuckets) {
            if (!positions.length) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, QP[1565]));
            const cables = new THREE.LineSegments(geo, hangingBridgeCableMat);
            cables.name = `hangingBridgeCables:${key}`;
            scene.add(cables);
            yield { phase: 'hanging-bridge-cables', chunk: key, built, total: cableBuckets.size };
        }
        console.log(`[gen] ${built} upper-floor hanging bridges (${elevatedBridgeAnchors.length} landing anchors, ${cableBuckets.size} cable chunks)`);
        return built;
    }

    function buildHangingBridges() {
        const iterator = buildHangingBridgeSteps();
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }
    
     
     
     
     
     
     
     
     
     
    function addLadder(x, z, rotY, y0, y1, opts = {}) {
        const standoff = opts.standoff ?? QP[1566];  
        const climbStandoff = opts.climbStandoff ?? QP[1567];  
        const climbHalf = opts.climbHalf ?? QP[1568];
        const width = opts.width ?? QP[1569];
        const rise = y1 - y0;
        if (rise <= QP[1570]) return;
        const g = new THREE.Group();
        const railMat = new THREE.MeshStandardMaterial({ color: opts.color ?? QP[1571], roughness: QP[1572], metalness: QP[1573] });
        const railR = QP[1574];
        for (const side of [QP[1575], QP[1576]]) {
            const rail = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(railR, railR, rise, QP[1577]), QP[1578]),
                railMat
            );
            rail.position.set(side * width / QP[1579], rise / QP[1580], standoff);
            g.add(rail);
        }
        const rungGap = QP[1581];
        const rungCount = Math.max(QP[1582], Math.round(rise / rungGap));
        for (let i = QP[1583]; i <= rungCount; i++) {
            const ry = (rise * i) / rungCount;
            const rung = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(railR * QP[1584], railR * QP[1585], width, QP[1586]), QP[1587]),
                railMat
            );
            rung.rotation.z = Math.PI / QP[1588];
            rung.position.set(QP[1589], ry, standoff);
            g.add(rung);
        }
        g.rotation.y = rotY;
        g.position.set(x, y0, z);
        scene.add(g);
    
         
         
         
         
         
        const climbX = x + Math.sin(rotY) * climbStandoff;
        const climbZ = z + Math.cos(rotY) * climbStandoff;
        const stepGap = QP[1590];
        const steps = Math.max(QP[1591], Math.ceil(rise / stepGap));
        for (let i = QP[1592]; i <= steps; i++) {
            const y = y0 + (rise * i) / steps;
            elevatedPlatforms.push({ x: climbX, z: climbZ, hx: climbHalf, hz: climbHalf, y, blocksFromBelow: false, supportKind: 'ladder' });
        }
    }
    
     
     
     
     
     
    function addBalcony(x, y, z, rotY, maintenance = QP[1593]) {
        const depth = randRange(QP[1594], QP[1595]), width = randRange(QP[1596], QP[1597]);
        const g = new THREE.Group();
        const floorMat = new THREE.MeshStandardMaterial({ color: QP[1598], roughness: QP[1599] });
        const floor = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(width, QP[1600], depth), QP[1601]), floorMat);
        floor.position.set(QP[1602], QP[1603], depth / QP[1604]);
        g.add(floor);
    
        const braceMat = new THREE.MeshStandardMaterial({ color: QP[1605], roughness: QP[1606], metalness: QP[1607] });
        for (const side of [QP[1608], QP[1609]]) {
            const brace = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(QP[1610], QP[1611], Math.hypot(depth, depth * QP[1612]), QP[1613]), QP[1614]),
                braceMat
            );
            brace.rotation.x = Math.atan2(depth, depth * QP[1615]);
            brace.position.set(side * width * QP[1616], -depth * QP[1617], depth / QP[1618]);
            g.add(brace);
        }
    
        const railMat = new THREE.MeshStandardMaterial({ color: QP[1619], roughness: QP[1620], metalness: QP[1621] });
        const railH = QP[1622];
        const railFar = new THREE.Mesh(new THREE.BoxGeometry(width, railH, QP[1623]), railMat);
        railFar.position.set(QP[1624], railH / QP[1625], depth);
        g.add(railFar);
        for (const side of [QP[1626], QP[1627]]) {
            const railSide = new THREE.Mesh(new THREE.BoxGeometry(QP[1628], railH, depth), railMat);
            railSide.position.set(side * width / QP[1629], railH / QP[1630], depth / QP[1631]);
            g.add(railSide);
        }
    
         
         
        if (rng() < QP[1632] + maintenance * QP[1633]) {
            const planter = new THREE.Mesh(
                jitterGeometry(new THREE.BoxGeometry(width * QP[1634], QP[1635], depth * QP[1636]), QP[1637]),
                new THREE.MeshStandardMaterial({ color: QP[1638], roughness: QP[1639] })
            );
            planter.position.set(randRange(-width * QP[1640], width * QP[1641]), QP[1642], depth * QP[1643]);
            g.add(planter);
            const leafTex = makePixelTexture((ctx, w, h) => {
                ctx.fillStyle = rng() < QP[1644] ? '#2a5a2a' : '#5a4a20';
                ctx.fillRect(QP[1645], QP[1646], w, h);
            }, QP[1647], QP[1648]);
            const leaves = new THREE.Mesh(
                new THREE.SphereGeometry(width * QP[1649], QP[1650], QP[1651]),
                new THREE.MeshStandardMaterial({ map: leafTex, roughness: QP[1652] })
            );
            leaves.position.set(planter.position.x, QP[1653], depth * QP[1654]);
            g.add(leaves);
        }
    
        g.rotation.y = rotY;
        g.position.set(x, y, z);
        scene.add(g);
    
        const wx = x + Math.sin(rotY) * (depth / QP[1655]), wz = z + Math.cos(rotY) * (depth / QP[1656]);
        elevatedPlatforms.push({ x: wx, z: wz, hx: width / QP[1657] * QP[1658], hz: depth / QP[1659] * QP[1660], y });
    }
    
     
     
     
     
     
     
     
     
     
     
     
     
     

    return Object.freeze({
        flushHorizontalPlaneBatches,
        buildCoreFloor,
        buildRooftopMechanicalRoom,
        buildRooftopCatwalks,
        buildRooftopCatwalkSteps,
        maybeAddMezzanine,
        maybeAddElevator,
        buildFireEscape,
        buildHangingBridges,
        buildHangingBridgeSteps,
        addBalcony,
        addDebugRectOutline,
        fireEscapeDimensions,
        fireEscapeSideFits,
        fireEscapeDepth: FIRE_ESCAPE_DEPTH,
        stats() {
            return {
                horizontalPlaneBatches: { ...horizontalPlaneBatchStats },
                fireEscapeStories: fireEscapeStoryCount,
                fireEscapeBridgeAnchors: elevatedBridgeAnchors.length,
            };
        },
    });
}
