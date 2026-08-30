import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';

export function createGroundSurfaceSystem(deps) {
    const {
        CONFIG, JUNK_RENDER_CHUNK, GRID_ROWS, GRID_COLS, grid, groundTex, unitPlaneGeo, skirtBoxGeo,
        colSize, rowSize, colHalf, rowHalf, cellToWorld, wallDirections, makePixelTexture,
        camera, publishSurfacePatch, testYieldNow, testYieldIfNeeded,
    } = deps;

    function isStreetCell(c, r) {
        const s = CONFIG.streets.gridSpacing;
        return r % s === QP[4811] || c % s === QP[4812];
    }
    
    const openSurfacePlaneGeo = unitPlaneGeo;
    const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: QP[4813], roughness: QP[4814] });
    const roadMaterialCache = new Map();
    const alleySurfaceTex = groundTex.clone();
    alleySurfaceTex.wrapS = alleySurfaceTex.wrapT = THREE.RepeatWrapping;
    alleySurfaceTex.repeat.set(QP[4815], QP[4816]);
    alleySurfaceTex.needsUpdate = true;
    const alleySurfaceMaterial = new THREE.MeshStandardMaterial({ map: alleySurfaceTex, roughness: QP[4817] });
    
    function roadOpenMask(c, r) {
        return (grid[r - QP[4818]]?.[c] === false ? QP[4819] : QP[4820])
            | (grid[r + QP[4821]]?.[c] === false ? QP[4822] : QP[4823])
            | (grid[r]?.[c - QP[4824]] === false ? QP[4825] : QP[4826])
            | (grid[r]?.[c + QP[4827]] === false ? QP[4828] : QP[4829]);
    }
    
    function roadMaterialFor(c, r) {
        const mask = roadOpenMask(c, r);
        let mat = roadMaterialCache.get(mask);
        if (mat) return mat;
        const north = !!(mask & QP[4830]), south = !!(mask & QP[4831]), west = !!(mask & QP[4832]), east = !!(mask & QP[4833]);
        const horizontal = west || east;
        const vertical = north || south;
        const intersection = horizontal && vertical;
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(QP[4834], QP[4835], w, h);
            ctx.fillStyle = '#c8c840';
            if (horizontal) for (let i = QP[4836]; i < w; i += QP[4837]) ctx.fillRect(i, h / QP[4838] - QP[4839], QP[4840], QP[4841]);
            if (vertical) for (let i = QP[4842]; i < h; i += QP[4843]) ctx.fillRect(w / QP[4844] - QP[4845], i, QP[4846], QP[4847]);
            if (!intersection) return;
    
            const approaches = [
                { open: north, edge: 'n' }, { open: south, edge: 's' },
                { open: west, edge: 'w' }, { open: east, edge: 'e' },
            ];
            const crossDepth = QP[4848], edgeGap = QP[4849], span = QP[4850], stripeW = QP[4851], stripeGap = QP[4852];
            const barLen = span - QP[4853], barThick = QP[4854];
            ctx.fillStyle = '#e8e8dc';
            for (const a of approaches) {
                if (!a.open) continue;
                if (a.edge === 'n' || a.edge === 's') {
                    const y0 = a.edge === 'n' ? edgeGap : h - edgeGap - crossDepth;
                    for (let sx = w / QP[4855] - span / QP[4856]; sx < w / QP[4857] + span / QP[4858]; sx += stripeGap + stripeW) ctx.fillRect(sx, y0, stripeW, crossDepth);
                } else {
                    const x0 = a.edge === 'w' ? edgeGap : w - edgeGap - crossDepth;
                    for (let sz = h / QP[4859] - span / QP[4860]; sz < h / QP[4861] + span / QP[4862]; sz += stripeGap + stripeW) ctx.fillRect(x0, sz, crossDepth, stripeW);
                }
                if (a.edge === 'n') ctx.fillRect(w / QP[4863] - barLen / QP[4864], edgeGap - barThick - QP[4865], barLen, barThick);
                else if (a.edge === 's') ctx.fillRect(w / QP[4866] - barLen / QP[4867], h - edgeGap + QP[4868], barLen, barThick);
                else if (a.edge === 'w') ctx.fillRect(edgeGap - barThick - QP[4869], h / QP[4870] - barLen / QP[4871], barThick, barLen);
                else ctx.fillRect(w - edgeGap + QP[4872], h / QP[4873] - barLen / QP[4874], barThick, barLen);
            }
        }, QP[4875], QP[4876]);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: QP[4877] });
        roadMaterialCache.set(mask, mat);
        return mat;
    }
    
     
     
     
     
     
     
     
     
     
    const groundSurfaceBuckets = new Map();
    let groundSurfaceBatchStats = { draws: QP[4878], instances: QP[4879] };
    function groundSurfaceBucket(kind, x, z, materialKey, material, geometry) {
        const chunkX = Math.floor(x / JUNK_RENDER_CHUNK);
        const chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
        const key = `${kind}|${chunkX}|${chunkZ}|${materialKey}`;
        let bucket = groundSurfaceBuckets.get(key);
        if (!bucket) {
            bucket = { key, kind, chunkX, chunkZ, materialKey, material, geometry, transforms: [] };
            groundSurfaceBuckets.set(key, bucket);
        }
        return bucket;
    }
    
    function queueGroundSurface(kind, x, y, z, sx, sy, sz, materialKey, material, geometry, plane = false) {
        groundSurfaceBucket(kind, x, z, materialKey, material, geometry).transforms.push({ x, y, z, sx, sy, sz, plane });
    }

    let surfacePatchSerial = 0;
    function flushGroundSurfaceBatches(onlyChunkX = null, onlyChunkZ = null) {
        const buckets = [];
        for (const [key, bucket] of [...groundSurfaceBuckets]) {
            if (onlyChunkX !== null && (bucket.chunkX !== onlyChunkX || bucket.chunkZ !== onlyChunkZ)) continue;
            groundSurfaceBuckets.delete(key);
            if (!bucket.transforms.length) continue;
            buckets.push(bucket);
        }
        if (!buckets.length) return { draws: 0, instances: 0 };
        if (typeof publishSurfacePatch !== 'function') throw new Error('ground surface planner requires KowloonFabricEngine publishSurfacePatch');
        const patchKey = onlyChunkX !== null
            ? `${onlyChunkX},${onlyChunkZ}`
            : `spill:${surfacePatchSerial++}`;
        return publishSurfacePatch({ patchKey, buckets });
    }
    
    function addStreetSurface(c, r, x, z, street = isStreetCell(c, r)) {
        if (street) {
            const mask = roadOpenMask(c, r);
            queueGroundSurface('road', x, QP[4886], z, colSize[c] * QP[4887], rowSize[r] * QP[4888], QP[4889],
                `road:${mask}`, roadMaterialFor(c, r), openSurfacePlaneGeo, true);
        } else {
            queueGroundSurface('alley', x, QP[4890], z, colSize[c] * QP[4891], rowSize[r] * QP[4892], QP[4893],
                'alley', alleySurfaceMaterial, openSurfacePlaneGeo, true);
        }
    
        if (!street) return;
        for (const w of wallDirections(c, r)) {
            const stripWidthX = colSize[c] * QP[4894], stripWidthZ = rowSize[r] * QP[4895];
            const stripLenX = colSize[c] * QP[4896], stripLenZ = rowSize[r] * QP[4897];
            const sx = w.dx !== QP[4898] ? stripWidthX : stripLenX;
            const sz = w.dz !== QP[4899] ? stripWidthZ : stripLenZ;
            queueGroundSurface('sidewalk',
                x + w.dx * (colHalf(c) - stripWidthX / QP[4900]), QP[4901],
                z + w.dz * (rowHalf(r) - stripWidthZ / QP[4902]),
                sx, QP[4903], sz, 'sidewalk', sidewalkMaterial, skirtBoxGeo, false);
        }
    }
    
    let openSurfacePrepared = false;
    let pendingSurfaceChunks = [];
    const readySurfaceChunks = new Set();
    let surfaceRoadCells = QP[4904];
    let surfaceAlleyCells = QP[4905];
    let surfaceDraws = QP[4883];
    let surfaceInstances = QP[4884];

    function surfaceChunkKey(chunkX, chunkZ) {
        return `${chunkX},${chunkZ}`;
    }

    function prepareOpenCellSurfaces() {
        if (openSurfacePrepared) return pendingSurfaceChunks.length;
        openSurfacePrepared = true;
        const cellChunks = new Map();
        for (let r = QP[4907]; r < GRID_ROWS - QP[4908]; r++) {
            for (let c = QP[4909]; c < GRID_COLS - QP[4910]; c++) {
                if (grid[r][c]) continue;
                const { x, z } = cellToWorld(c, r);
                const chunkX = Math.floor(x / JUNK_RENDER_CHUNK), chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
                const key = surfaceChunkKey(chunkX, chunkZ);
                let chunk = cellChunks.get(key);
                if (!chunk) cellChunks.set(key, chunk = { key, chunkX, chunkZ, cells: [] });
                chunk.cells.push({ c, r, x, z, street: isStreetCell(c, r) });
            }
        }
        pendingSurfaceChunks = [...cellChunks.values()];
        return pendingSurfaceChunks.length;
    }

    function sortPendingSurfaceChunksNear(x = camera.position.x, z = camera.position.z) {
        pendingSurfaceChunks.sort((a, b) => {
            const ax = (a.chunkX + QP[1024] / QP[1012]) * JUNK_RENDER_CHUNK - x;
            const az = (a.chunkZ + QP[1024] / QP[1012]) * JUNK_RENDER_CHUNK - z;
            const bx = (b.chunkX + QP[1024] / QP[1012]) * JUNK_RENDER_CHUNK - x;
            const bz = (b.chunkZ + QP[1024] / QP[1012]) * JUNK_RENDER_CHUNK - z;
            return (ax * ax + az * az) - (bx * bx + bz * bz);
        });
    }

    function pumpOpenCellSurfaces({ maxChunks = QP[1024], maxMillis = QP[1028], x = camera.position.x, z = camera.position.z } = {}) {
        prepareOpenCellSurfaces();
        if (!pendingSurfaceChunks.length) return { chunks: QP[1015], ms: QP[1015], complete: true };
        sortPendingSurfaceChunksNear(x, z);
        const started = performance.now();
        let chunks = QP[1015];
        while (pendingSurfaceChunks.length && chunks < maxChunks) {
            if (chunks > QP[1015] && performance.now() - started >= maxMillis) break;
            const chunk = pendingSurfaceChunks.shift();
            for (const cell of chunk.cells) {
                addStreetSurface(cell.c, cell.r, cell.x, cell.z, cell.street);
                if (cell.street) surfaceRoadCells++; else surfaceAlleyCells++;
            }
            const batched = flushGroundSurfaceBatches(chunk.chunkX, chunk.chunkZ);
            surfaceDraws += batched.draws;
            surfaceInstances += batched.instances;
            readySurfaceChunks.add(chunk.key);
            chunks++;
        }
        groundSurfaceBatchStats = { draws: surfaceDraws, instances: surfaceInstances };
        return { chunks, ms: performance.now() - started, complete: pendingSurfaceChunks.length === QP[1015] };
    }

    function isWorldPositionReady(x, z) {
        prepareOpenCellSurfaces();
        return readySurfaceChunks.has(surfaceChunkKey(Math.floor(x / JUNK_RENDER_CHUNK), Math.floor(z / JUNK_RENDER_CHUNK)));
    }

    async function ensureOpenCellSurfaceNeighborhood(x, z, radiusChunks = QP[1024]) {
        prepareOpenCellSurfaces();
        const centerX = Math.floor(x / JUNK_RENDER_CHUNK), centerZ = Math.floor(z / JUNK_RENDER_CHUNK);
        const wanted = new Set();
        for (const chunk of pendingSurfaceChunks) {
            if (Math.abs(chunk.chunkX - centerX) <= radiusChunks && Math.abs(chunk.chunkZ - centerZ) <= radiusChunks) wanted.add(chunk.key);
        }
        const total = wanted.size;
        let done = QP[1015];
        while (wanted.size) {
            sortPendingSurfaceChunksNear(x, z);
            const index = pendingSurfaceChunks.findIndex(chunk => wanted.has(chunk.key));
            if (index < QP[1015]) break;
            const chunk = pendingSurfaceChunks.splice(index, QP[1024])[QP[1015]];
            for (const cell of chunk.cells) {
                addStreetSurface(cell.c, cell.r, cell.x, cell.z, cell.street);
                if (cell.street) surfaceRoadCells++; else surfaceAlleyCells++;
            }
            const batched = flushGroundSurfaceBatches(chunk.chunkX, chunk.chunkZ);
            surfaceDraws += batched.draws;
            surfaceInstances += batched.instances;
            readySurfaceChunks.add(chunk.key);
            wanted.delete(chunk.key);
            done++;
            groundSurfaceBatchStats = { draws: surfaceDraws, instances: surfaceInstances };
            await testYieldIfNeeded('publishing minimum-safe spawn ground', done, total);
        }
        return { ready: done, total, complete: wanted.size === QP[1015] };
    }

    async function layOpenCellSurfaces() {
        prepareOpenCellSurfaces();
        const totalChunks = pendingSurfaceChunks.length;
        let doneChunks = QP[1015];
        await testYieldNow('streaming nearest real streets/alleys', doneChunks, totalChunks);
        while (pendingSurfaceChunks.length) {
            const result = pumpOpenCellSurfaces({ maxChunks: QP[1024], maxMillis: QP[1028] });
            doneChunks += result.chunks;
            await testYieldIfNeeded('streaming nearest real streets/alleys', doneChunks, totalChunks);
        }
        const spill = flushGroundSurfaceBatches();
        surfaceDraws += spill.draws;
        surfaceInstances += spill.instances;
        groundSurfaceBatchStats = { draws: surfaceDraws, instances: surfaceInstances };
        console.log(`[gen] explicit ground surfaces: ${surfaceRoadCells} road + ${surfaceAlleyCells} alley cells, ${surfaceInstances} plates/sidewalks emitted directly as ${surfaceDraws} progressive chunked instance batches (shared ${roadMaterialCache.size} road materials + 1 alley material)`);
    }

    
     

    return Object.freeze({
        isStreetCell,
        roadOpenMask,
        prepareOpenCellSurfaces,
        pumpOpenCellSurfaces,
        ensureOpenCellSurfaceNeighborhood,
        isWorldPositionReady,
        layOpenCellSurfaces,
        stats() {
            return {
                ...groundSurfaceBatchStats,
                roadMaterialPool: roadMaterialCache.size,
                prepared: openSurfacePrepared,
                readyChunks: readySurfaceChunks.size,
                pendingChunks: pendingSurfaceChunks.length,
                totalChunks: readySurfaceChunks.size + pendingSurfaceChunks.length,
            };
        },
    });
}
