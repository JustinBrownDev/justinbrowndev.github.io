import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';

export function createGroundSurfaceSystem(deps) {
    const {
        CONFIG, JUNK_RENDER_CHUNK, GRID_ROWS, GRID_COLS, grid, groundTex, unitPlaneGeo, skirtBoxGeo,
        colSize, rowSize, colHalf, rowHalf, cellToWorld, wallDirections, parkCells, makePixelTexture,
        scene, camera, testYieldNow, testYieldIfNeeded,
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
    const _surfaceMatrix = new THREE.Matrix4();
    const _surfacePos = new THREE.Vector3();
    const _surfaceScale = new THREE.Vector3();
    const _surfacePlaneQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / QP[4880], QP[4881], QP[4882]));
    const _surfaceBoxQuat = new THREE.Quaternion();
    
    function groundSurfaceBucket(kind, x, z, materialKey, material, geometry) {
        const chunkX = Math.floor(x / JUNK_RENDER_CHUNK);
        const chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
        const key = `${kind}|${chunkX}|${chunkZ}|${materialKey}`;
        let bucket = groundSurfaceBuckets.get(key);
        if (!bucket) {
            bucket = { kind, chunkX, chunkZ, material, geometry, transforms: [] };
            groundSurfaceBuckets.set(key, bucket);
        }
        return bucket;
    }
    
    function queueGroundSurface(kind, x, y, z, sx, sy, sz, materialKey, material, geometry, plane = false) {
        groundSurfaceBucket(kind, x, z, materialKey, material, geometry).transforms.push({ x, y, z, sx, sy, sz, plane });
    }
    
    function flushGroundSurfaceBatches(onlyChunkX = null, onlyChunkZ = null) {
        let draws = QP[4883], instances = QP[4884];
        for (const [key, bucket] of [...groundSurfaceBuckets]) {
            if (onlyChunkX !== null && (bucket.chunkX !== onlyChunkX || bucket.chunkZ !== onlyChunkZ)) continue;
            const list = bucket.transforms;
            groundSurfaceBuckets.delete(key);
            if (!list.length) continue;
            const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, list.length);
            mesh.name = `groundBatch:${key}`;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            for (let i = QP[4885]; i < list.length; i++) {
                const t = list[i];
                _surfacePos.set(t.x, t.y, t.z);
                _surfaceScale.set(t.sx, t.sy, t.sz);
                _surfaceMatrix.compose(_surfacePos, t.plane ? _surfacePlaneQuat : _surfaceBoxQuat, _surfaceScale);
                mesh.setMatrixAt(i, _surfaceMatrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox?.();
            mesh.computeBoundingSphere?.();
            scene.add(mesh);
            draws++;
            instances += list.length;
        }
        return { draws, instances };
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
    
    async function layOpenCellSurfaces() {
        let roadCells = QP[4904], alleyCells = QP[4905], parkSkipped = QP[4906];
        const cellChunks = new Map();
        for (let r = QP[4907]; r < GRID_ROWS - QP[4908]; r++) {
            for (let c = QP[4909]; c < GRID_COLS - QP[4910]; c++) {
                if (grid[r][c]) continue;
                if (parkCells.has(`${c},${r}`)) { parkSkipped++; continue; }
                const { x, z } = cellToWorld(c, r);
                const chunkX = Math.floor(x / JUNK_RENDER_CHUNK), chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
                const key = `${chunkX},${chunkZ}`;
                let chunk = cellChunks.get(key);
                if (!chunk) cellChunks.set(key, chunk = { chunkX, chunkZ, cells: [] });
                chunk.cells.push({ c, r, x, z, street: isStreetCell(c, r) });
            }
        }
    
        const pendingChunks = [...cellChunks.values()];
        const totalChunks = pendingChunks.length;
        let doneChunks = 0, draws = 0, instances = 0;
        let reprioritizeChunks = true;
        await testYieldNow('streaming nearest real streets/alleys', doneChunks, totalChunks);
        while (pendingChunks.length) {
            if (reprioritizeChunks) {
                pendingChunks.sort((a, b) => {
                    const ax = (a.chunkX + 0.5) * JUNK_RENDER_CHUNK - camera.position.x;
                    const az = (a.chunkZ + 0.5) * JUNK_RENDER_CHUNK - camera.position.z;
                    const bx = (b.chunkX + 0.5) * JUNK_RENDER_CHUNK - camera.position.x;
                    const bz = (b.chunkZ + 0.5) * JUNK_RENDER_CHUNK - camera.position.z;
                    return (bx * bx + bz * bz) - (ax * ax + az * az);
                });
                reprioritizeChunks = false;
            }
            const chunk = pendingChunks.pop();
            for (const cell of chunk.cells) {
                addStreetSurface(cell.c, cell.r, cell.x, cell.z, cell.street);
                if (cell.street) roadCells++; else alleyCells++;
            }
            const batched = flushGroundSurfaceBatches(chunk.chunkX, chunk.chunkZ);
            draws += batched.draws;
            instances += batched.instances;
            doneChunks++;
            reprioritizeChunks = await testYieldIfNeeded('streaming nearest real streets/alleys', doneChunks, totalChunks);
        }
         
         
         
        const spill = flushGroundSurfaceBatches();
        draws += spill.draws;
        instances += spill.instances;
        groundSurfaceBatchStats = { draws, instances };
        console.log(`[gen] explicit ground surfaces: ${roadCells} road + ${alleyCells} alley cells, ${parkSkipped} parks; ${instances} plates/sidewalks emitted directly as ${draws} nearest-first chunked instance batches (shared ${roadMaterialCache.size} road materials + 1 alley material)`);
    }
    
     

    return Object.freeze({
        isStreetCell,
        roadOpenMask,
        layOpenCellSurfaces,
        stats() { return { ...groundSurfaceBatchStats, roadMaterialPool: roadMaterialCache.size }; },
    });
}
