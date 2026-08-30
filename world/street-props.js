import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { SpatialHash2D } from '../city-performance.js';
import { JUNK_BASE_KINDS, JUNK_WEAR_STATES, JUNK_SIZE_CLASSES } from '../content/junk-content.js';
import { outwardRotationY } from '../systems/cardinal.js';

export function createStreetPropsSystem(deps) {
    const {
        CELL, CONFIG, JUNK_RENDER_CHUNK_SIZE, grid, scene, unitPlaneGeo, takeDynamicLight,
        getStaticWorldOptimizer, registerAnimatedMaterial, getPoetryShort, getPoetryMedium, getPickPoetryTag,
        addFissureCrack, addWantedPoster, hexToCss, jitterGeometry, laneOffset, makePixelTexture,
        pick, pickCityNoisePair, pickInkColor, pickNetworkNoise, pickPaperColor,
        pickRandomizedCuratedPair, pickRandomizedLorePair, pickTextFont, placeRealModel,
        randRange, rng, unseededPick
    } = deps;


    function propCandidatesNear(x, z, queryRadius) {
        return propColliderIndex.queryRadius(x, z, queryRadius + maxPropColliderRadius + QP[4721], _propOverlapCandidates);
    }

    function addPottedPlant(x, z) {
        const thriving = rng() < QP[3775];
        const pot = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[3776], QP[3777], QP[3778], QP[3779]), QP[3780]),
            new THREE.MeshStandardMaterial({ color: QP[3781], roughness: QP[3782] })
        );
        pot.position.y = QP[3783];
        const g = new THREE.Group();
        g.add(pot);
        const leafColor = thriving ? pick([QP[3784], QP[3785]]) : pick([QP[3786], QP[3787]]);
        const leafCount = thriving ? QP[3788] + Math.floor(rng() * QP[3789]) : QP[3790] + Math.floor(rng() * QP[3791]);
        for (let i = QP[3792]; i < leafCount; i++) {
            const leaf = new THREE.Mesh(
                new THREE.ConeGeometry(QP[3793], randRange(QP[3794], QP[3795]), QP[3796]),
                new THREE.MeshStandardMaterial({ color: leafColor, roughness: QP[3797] })
            );
            leaf.position.set(randRange(QP[3798], QP[3799]), QP[3800] + randRange(QP[3801], QP[3802]), randRange(QP[3803], QP[3804]));
            leaf.rotation.z = randRange(QP[3805], QP[3806]);
            leaf.rotation.x = randRange(QP[3807], QP[3808]);
            g.add(leaf);
        }
        g.position.set(x, QP[3809], z);
        scene.add(g);
        return QP[3810];
    }

     
     
     
     
     

     
     

     
     
     
     
     
     
     
     

     

     
     
     
    let _plazaGlowMaterial = null;
    let _thicketShadeMaterial = null;

     
     
     



     
     
     
    const JUNK_DESCRIPTORS = [];
    for (const kind of JUNK_BASE_KINDS) {
        for (const wear of JUNK_WEAR_STATES) {
            for (const sizeClass of JUNK_SIZE_CLASSES) {
                const m = wear.sizeMul * sizeClass.mul;
                JUNK_DESCRIPTORS.push({
                    name: `${kind.name} (${wear.tag}, ${sizeClass.tag})`,
                    shape: kind.shape,
                    contexts: kind.contexts,
                    size: kind.size.map(s => [s * m * QP[4345], s * m * QP[4346]]),
                    colors: kind.colors,
                });
            }
        }
    }

     
     
    const JUNK_BY_CONTEXT = new Map();
    for (const d of JUNK_DESCRIPTORS) {
        for (const context of d.contexts) {
            let pool = JUNK_BY_CONTEXT.get(context);
            if (!pool) JUNK_BY_CONTEXT.set(context, pool = []);
            pool.push(d);
        }
    }

     
     
     
     
     
    const JUNK_RENDER_CHUNK = JUNK_RENDER_CHUNK_SIZE;
    const JUNK_BUCKET_CAPACITY = QP[4347];
    const junkBuckets = new Map();  
    const junkMeshes = new Set();
    const junkGeometryByShape = new Map();
    const junkMaterialByShape = new Map();
    const _junkMatrix = new THREE.Matrix4();
    const _junkPos = new THREE.Vector3();
    const _junkQuat = new THREE.Quaternion();
    const _junkEuler = new THREE.Euler();
    const _junkScale = new THREE.Vector3();
    const _junkColor = new THREE.Color();

    for (const shape of ['box', 'cylinder', 'cone', 'sphere']) {
        let geo;
        switch (shape) {
            case 'box': geo = new THREE.BoxGeometry(QP[4348], QP[4349], QP[4350]); break;
            case 'cylinder': geo = new THREE.CylinderGeometry(QP[4351], QP[4352], QP[4353], QP[4354]); break;
            case 'cone': geo = new THREE.ConeGeometry(QP[4355], QP[4356], QP[4357]); break;
            case 'sphere': geo = new THREE.SphereGeometry(QP[4358], QP[4359], QP[4360]); break;
        }
        jitterGeometry(geo, QP[4361]);
        junkGeometryByShape.set(shape, geo);
        junkMaterialByShape.set(shape, new THREE.MeshStandardMaterial({ roughness: QP[4362] }));
    }

    function junkBucketFor(shape, x, z) {
        const chunkX = Math.floor(x / JUNK_RENDER_CHUNK);
        const chunkZ = Math.floor(z / JUNK_RENDER_CHUNK);
        const key = `${shape}|${chunkX}|${chunkZ}`;
        let list = junkBuckets.get(key);
        if (!list) junkBuckets.set(key, list = []);
        let bucket = list[list.length - QP[4363]];
        if (!bucket || bucket.count >= JUNK_BUCKET_CAPACITY) {
            const originX = chunkX * JUNK_RENDER_CHUNK;
            const originZ = chunkZ * JUNK_RENDER_CHUNK;
            const mesh = new THREE.InstancedMesh(junkGeometryByShape.get(shape), junkMaterialByShape.get(shape), JUNK_BUCKET_CAPACITY);
            mesh.count = QP[4364];
            mesh.position.set(originX, QP[4365], originZ);
            mesh.name = `junk:${shape}:${chunkX},${chunkZ}:${list.length}`;
            scene.add(mesh);
            junkMeshes.add(mesh);
            bucket = { mesh, count: QP[4366], originX, originZ };
            list.push(bucket);
        }
        return bucket;
    }

    function spawnJunkInstance(d, x, z, opts = {}) {
        const bucket = junkBucketFor(d.shape, x, z);
        const { mesh } = bucket;
        const idx = bucket.count++;
        const sizeMul = opts.sizeMul ?? QP[4367];
        const sx = randRange(...d.size[QP[4368]]) * sizeMul, sy = randRange(...d.size[QP[4369]]) * sizeMul, sz = randRange(...d.size[QP[4370]]) * sizeMul;
        const baseY = opts.baseY ?? QP[4371];
        _junkPos.set(x - bucket.originX, baseY + sy / QP[4372], z - bucket.originZ);
        _junkEuler.set(QP[4373], opts.rotY ?? randRange(QP[4374], Math.PI * QP[4375]), QP[4376]);
        _junkQuat.setFromEuler(_junkEuler);
        _junkScale.set(sx, sy, sz);
        _junkMatrix.compose(_junkPos, _junkQuat, _junkScale);
        mesh.setMatrixAt(idx, _junkMatrix);
        mesh.setColorAt(idx, _junkColor.set(pick(d.colors)));
        mesh.count = bucket.count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
         
         
         
         
        if (getStaticWorldOptimizer()) { mesh.boundingSphere = null; mesh.boundingBox = null; }
        return { radius: Math.max(sx, sz) / QP[4377], height: baseY + sy, yMin: baseY, localHeight: sy };
    }

     
     
     
    function scatterJunk(context, x, z, count, spread, axis = null) {
        const pool = JUNK_BY_CONTEXT.get(context) || [];
        if (!pool.length) return;
        for (let i = QP[4378]; i < count; i++) {
             
             
             
             
            let px, pz;
            for (let attempt = QP[4379]; attempt < QP[4380]; attempt++) {
                const [ox, oz] = laneOffset(spread, axis);
                px = x + ox; pz = z + oz;
                const blocked = propCandidatesNear(px, pz, QP[4381]).some(p => {
                    const dx = px - p.x, dz = pz - p.z;
                    return dx * dx + dz * dz < (QP[4382] + p.radius) ** QP[4383];
                });
                if (!blocked) break;
            }
            const { radius, height } = spawnJunkInstance(pick(pool), px, pz);
            propColliders.push({ x: px, z: pz, radius, height });
        }
    }

     
     
     
     
    const PILE_JUNK_BY_CONTEXT = new Map();
    const pileFriendly = /crate|box|bag|bucket|tire|cinderblock|pallet|spool|newspaper|pizza|bottle|can|toolbox|lid|sheet|cord/i;
    for (const [context, pool] of JUNK_BY_CONTEXT) PILE_JUNK_BY_CONTEXT.set(context, pool.filter(d => pileFriendly.test(d.name)));
    PILE_JUNK_BY_CONTEXT.set('rooftop', JUNK_DESCRIPTORS.filter(d => pileFriendly.test(d.name) && !/large\)/i.test(d.name)));

    function pileJunkCluster(context, x, z, opts = {}) {
        const pool = PILE_JUNK_BY_CONTEXT.get(context) || PILE_JUNK_BY_CONTEXT.get('alley') || [];
        if (!pool.length) return null;
        const baseY = opts.baseY ?? QP[4384];
        const tiers = Math.max(QP[4385], opts.tiers ?? (QP[4386] + Math.floor(rng() * QP[4387])));
        const spread = opts.spread ?? QP[4388];
        let bx = opts.backX ?? QP[4389], bz = opts.backZ ?? QP[4390];
        const bl = Math.hypot(bx, bz);
        if (bl > QP[4391]) { bx /= bl; bz /= bl; }
        const tx = -bz, tz = bx;
        const supports = [];
        let topY = baseY;

        const pushPiece = (px, pz, bottomY, sizeMul) => {
            const piece = spawnJunkInstance(pick(pool), px, pz, { baseY: bottomY, sizeMul });
            propColliders.push({ x: px, z: pz, radius: piece.radius, yMin: piece.yMin, height: piece.height });
            supports.push({ x: px, z: pz, radius: piece.radius, top: piece.height });
            topY = Math.max(topY, piece.height);
            return piece;
        };

        const baseCount = Math.max(QP[4392], opts.baseCount ?? (QP[4393] + Math.floor(rng() * QP[4394])));
        for (let i = QP[4395]; i < baseCount; i++) {
            const depth = bl > QP[4396] ? randRange(QP[4397], spread * QP[4398]) : randRange(-spread * QP[4399], spread * QP[4400]);
            const side = randRange(-spread * QP[4401], spread * QP[4402]);
            pushPiece(x + bx * depth + tx * side, z + bz * depth + tz * side, baseY, randRange(QP[4403], QP[4404]));
        }

        let previousTier = supports.slice();
        for (let tier = QP[4405]; tier < tiers; tier++) {
            const nextTier = [];
            const count = Math.max(QP[4406], Math.ceil(baseCount * Math.pow(QP[4407], tier)));
            for (let i = QP[4408]; i < count; i++) {
                const parent = pick(previousTier.length ? previousTier : supports);
                const inward = bl > QP[4409] ? tier * randRange(QP[4410], QP[4411]) : QP[4412];
                const px = parent.x + bx * inward + randRange(-parent.radius * QP[4413], parent.radius * QP[4414]);
                const pz = parent.z + bz * inward + randRange(-parent.radius * QP[4415], parent.radius * QP[4416]);
                const before = supports.length;
                pushPiece(px, pz, parent.top, Math.max(QP[4417], QP[4418] - tier * QP[4419]));
                nextTier.push(supports[before]);
            }
            previousTier = nextTier;
        }

         
         
        const spill = opts.spill ?? (QP[4420] + Math.floor(rng() * QP[4421]));
        for (let i = QP[4422]; i < spill; i++) {
            const outward = bl > QP[4423] ? randRange(-spread * QP[4424], -spread * QP[4425]) : randRange(-spread, spread);
            const side = randRange(-spread, spread);
            pushPiece(x + bx * outward + tx * side, z + bz * outward + tz * side, baseY, randRange(QP[4426], QP[4427]));
        }
        return { x, z, baseY, topY, radius: spread };
    }


     
     
     
     
     
     
     
     
     
     
     
     


     
     

     
     


     

    const propColliders = [];  
    const propColliderIndex = new SpatialHash2D(QP[4718]);
    const _propOverlapCandidates = [];
    let maxPropColliderRadius = QP[4719];
    const _nativePropColliderPush = Array.prototype.push;
    propColliders.push = function (...items) {
        for (const item of items) {
            if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
            const radius = Number.isFinite(item.radius) ? item.radius : QP[4720];
            maxPropColliderRadius = Math.max(maxPropColliderRadius, radius);
            propColliderIndex.insert(item, {
                minX: item.x - radius, maxX: item.x + radius,
                minZ: item.z - radius, maxZ: item.z + radius,
            });
        }
        return _nativePropColliderPush.apply(this, items);
    };
    return Object.freeze({
        addPottedPlant,
        scatterJunk,
        pileJunkCluster,
        JUNK_RENDER_CHUNK,
        propColliders,
    });
}
