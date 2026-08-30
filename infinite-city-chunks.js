import { hashString32 } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId, worldEntityId } from './world-contract.js';
import { createInfiniteChunkEnrichment } from './world/infinite-chunk-enrichment.js';
import {
    KOWLOON_DIRS,
    analyzeKowloonCompound,
    chooseKowloonCompoundTargetSize,
    classifyKowloonEdge,
    kowloonCellKey,
    kowloonIntensity,
    partitionKowloonCompounds,
    selectKowloonCourtyardCell,
} from './world/kowloon-structure.js';

 
 
 
 
 
 
 

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
function key(c, r) { return `${c},${r}`; }
function oppositeSide(side) {
    if (side === 'north') return 'south';
    if (side === 'south') return 'north';
    if (side === 'west') return 'east';
    return 'west';
}

function pushWallSegments(out, cx, cz, halfX, halfZ, yMin, yMax, doorSide = null, doorWidth = 1.5) {
    const x0 = cx - halfX, x1 = cx + halfX, z0 = cz - halfZ, z1 = cz + halfZ;
    const split = (a0, a1, fixed, horizontal, side) => {
        if (doorSide !== side) {
            out.push(horizontal
                ? { x1: a0, z1: fixed, x2: a1, z2: fixed, yMin, yMax }
                : { x1: fixed, z1: a0, x2: fixed, z2: a1, yMin, yMax });
            return;
        }
        const mid = (a0 + a1) * 0.5;
        const gap0 = mid - doorWidth * 0.5, gap1 = mid + doorWidth * 0.5;
        if (gap0 > a0) out.push(horizontal
            ? { x1: a0, z1: fixed, x2: gap0, z2: fixed, yMin, yMax }
            : { x1: fixed, z1: a0, x2: fixed, z2: gap0, yMin, yMax });
        if (gap1 < a1) out.push(horizontal
            ? { x1: gap1, z1: fixed, x2: a1, z2: fixed, yMin, yMax }
            : { x1: fixed, z1: gap1, x2: fixed, z2: a1, yMin, yMax });
    };
    split(x0, x1, z0, true, 'north');
    split(x0, x1, z1, true, 'south');
    split(z0, z1, x0, false, 'west');
    split(z0, z1, x1, false, 'east');
}

function addRectPlatform(out, x, z, sx, sz, y, supportKind = 'floor') {
    if (sx <= 0.05 || sz <= 0.05) return;
    out.push({ x, z, hx: sx * 0.5, hz: sz * 0.5, y, supportKind });
}

function addNotchedFloor(out, cx, cz, width, depth, y, gapCx, gapCz, gapW, gapD, supportKind = 'floor') {
    const x0 = cx - width * 0.5, x1 = cx + width * 0.5;
    const z0 = cz - depth * 0.5, z1 = cz + depth * 0.5;
    const gx0 = Math.max(x0, gapCx - gapW * 0.5), gx1 = Math.min(x1, gapCx + gapW * 0.5);
    const gz0 = Math.max(z0, gapCz - gapD * 0.5), gz1 = Math.min(z1, gapCz + gapD * 0.5);
    addRectPlatform(out, (x0 + gx0) * 0.5, cz, gx0 - x0, depth, y, supportKind);
    addRectPlatform(out, (gx1 + x1) * 0.5, cz, x1 - gx1, depth, y, supportKind);
    addRectPlatform(out, (gx0 + gx1) * 0.5, (z0 + gz0) * 0.5, gx1 - gx0, gz0 - z0, y, supportKind);
    addRectPlatform(out, (gx0 + gx1) * 0.5, (gz1 + z1) * 0.5, gx1 - gx0, z1 - gz1, y, supportKind);
}

export function createInfiniteCityChunkFactory({
    THREE,
    scene,
    playerPhysics,
    directSceneAdd = null,
    chunkSize = 64,
    worldSeed = 0,
    spawnChunkKey = '0,0',
    microCells = 7,
    landmarkSpacingChunks = 4,
    yieldControl = null,
} = {}) {
    if (!THREE || !scene || !playerPhysics) throw new Error('createInfiniteCityChunkFactory requires THREE, scene, playerPhysics');
    const addStreamRoot = typeof directSceneAdd === 'function' ? directSceneAdd : scene.add.bind(scene);
    const enrichment = createInfiniteChunkEnrichment({ THREE, worldSeed });
    const committedOwners = new Set();
    if (microCells < 5 || microCells % 2 === 0) throw new Error('microCells must be an odd integer >= 5');

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.96 });
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4e4b45, roughness: 1 });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x85817a, roughness: 0.9 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 0.9 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x4b4f4d, roughness: 0.82, metalness: 0.18 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x24211f, roughness: 0.9, metalness: 0.05 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x8fa9a8, emissive: 0x182827, emissiveIntensity: 0.5, roughness: 0.35 });
    const wallMats = [
        new THREE.MeshStandardMaterial({ color: 0xb6ae9c, roughness: 0.82 }),
        new THREE.MeshStandardMaterial({ color: 0x9ca99d, roughness: 0.84 }),
        new THREE.MeshStandardMaterial({ color: 0xb18e75, roughness: 0.86 }),
        new THREE.MeshStandardMaterial({ color: 0x8fa6aa, roughness: 0.82 }),
    ];

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const planeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

    function makeInstanced(name, geometry, material, transforms) {
        if (!transforms.length) return null;
        const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
        mesh.name = name;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage?.(THREE.StaticDrawUsage);
        for (let i = 0; i < transforms.length; i++) {
            const t = transforms[i];
            pos.set(t.x, t.y, t.z);
            scale.set(t.sx, t.sy, t.sz);
            if (t.plane) quat.copy(planeQuat);
            else if (t.ry) quat.setFromAxisAngle(upAxis, t.ry);
            else quat.identity();
            matrix.compose(pos, quat, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox?.();
        mesh.computeBoundingSphere?.();
        return mesh;
    }

    function freezeChunkRoot(root) {
        root.updateMatrixWorld(true);
        root.traverse(obj => {
            obj.updateMatrix?.();
            obj.matrixAutoUpdate = false;
            if ('matrixWorldAutoUpdate' in obj) obj.matrixWorldAutoUpdate = false;
        });
    }

    function wallTransform(list, x, y, z, sx, sy, sz) {
        list.push({ x, y, z, sx, sy, sz });
    }

     
     
     
    function edgeLane(chunkX, chunkZ, side) {
        let edgeKey;
        if (side === 'north') edgeKey = `H:${chunkX}:${chunkZ}`;
        else if (side === 'south') edgeKey = `H:${chunkX}:${chunkZ + 1}`;
        else if (side === 'west') edgeKey = `V:${chunkX}:${chunkZ}`;
        else edgeKey = `V:${chunkX + 1}:${chunkZ}`;

         
         
         
        if (edgeKey === 'H:0:0' || edgeKey === 'H:0:1' || edgeKey === 'V:0:0' || edgeKey === 'V:1:0') {
            return Math.floor(microCells / 2);
        }
        return 1 + (hashString32(`${worldSeed}:road-edge:${edgeKey}`) % (microCells - 2));
    }

    function carveManhattan(roads, a, b, horizontalFirst) {
        let c = a.c, r = a.r;
        roads.add(key(c, r));
        const stepC = () => {
            while (c !== b.c) { c += Math.sign(b.c - c); roads.add(key(c, r)); }
        };
        const stepR = () => {
            while (r !== b.r) { r += Math.sign(b.r - r); roads.add(key(c, r)); }
        };
        if (horizontalFirst) { stepC(); stepR(); }
        else { stepR(); stepC(); }
    }

    function planRoads(chunk) {
        const rng = mulberry32(chunk.seed ^ hashString32('roads'));
        const last = microCells - 1;
        const portals = {
            north: edgeLane(chunk.x, chunk.z, 'north'),
            south: edgeLane(chunk.x, chunk.z, 'south'),
            west: edgeLane(chunk.x, chunk.z, 'west'),
            east: edgeLane(chunk.x, chunk.z, 'east'),
        };
        const hub = {
            c: clamp(Math.floor(microCells * (0.30 + rng() * 0.40)), 1, last - 1),
            r: clamp(Math.floor(microCells * (0.30 + rng() * 0.40)), 1, last - 1),
        };
        const roads = new Set();
        const starts = [
            { c: portals.north, r: 0 },
            { c: portals.south, r: last },
            { c: 0, r: portals.west },
            { c: last, r: portals.east },
        ];
        for (const start of starts) carveManhattan(roads, start, hub, rng() < 0.5);

         
         
         
        const spurCount = 1 + Math.floor(chunk.weirdness.sampled * 3);
        for (let i = 0; i < spurCount; i++) {
            const roadList = [...roads];
            const startKey = roadList[Math.floor(rng() * roadList.length) % roadList.length];
            const [c, r] = startKey.split(',').map(Number);
            const target = {
                c: clamp(c + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 2)), 1, last - 1),
                r: clamp(r + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 2)), 1, last - 1),
            };
            carveManhattan(roads, { c, r }, target, rng() < 0.5);
        }
        return { portals, hub, roads };
    }

    function addRenderedNotchedSlab(transforms, cx, cz, width, depth, y, gapCx, gapCz, gapW, gapD) {
        const x0 = cx - width * 0.5, x1 = cx + width * 0.5;
        const z0 = cz - depth * 0.5, z1 = cz + depth * 0.5;
        const gx0 = Math.max(x0, gapCx - gapW * 0.5), gx1 = Math.min(x1, gapCx + gapW * 0.5);
        const gz0 = Math.max(z0, gapCz - gapD * 0.5), gz1 = Math.min(z1, gapCz + gapD * 0.5);
        const slabT = 0.12;
        if (gx0 > x0) transforms.slabs.push({ x: (x0 + gx0) * 0.5, y: y - slabT * 0.5, z: cz, sx: gx0 - x0, sy: slabT, sz: z1 - z0 });
        if (gx1 < x1) transforms.slabs.push({ x: (gx1 + x1) * 0.5, y: y - slabT * 0.5, z: cz, sx: x1 - gx1, sy: slabT, sz: z1 - z0 });
        if (gz0 > z0) transforms.slabs.push({ x: (gx0 + gx1) * 0.5, y: y - slabT * 0.5, z: (z0 + gz0) * 0.5, sx: gx1 - gx0, sy: slabT, sz: gz0 - z0 });
        if (gz1 < z1) transforms.slabs.push({ x: (gx0 + gx1) * 0.5, y: y - slabT * 0.5, z: (gz1 + z1) * 0.5, sx: gx1 - gx0, sy: slabT, sz: z1 - gz1 });
    }

    function addFacadeDetails(transforms, rng, { footprints, floorH, floors, doorSide, balconySpec = null }) {
        const base = footprints[0];
        const doorH = 2.2, doorW = 1.35, inset = 0.018;
        if (doorSide === 'north' || doorSide === 'south') {
            const z = base.cz + (doorSide === 'north' ? -base.halfZ - inset : base.halfZ + inset);
            transforms.doors.push({ x: base.cx, y: doorH * 0.5, z, sx: doorW, sy: doorH, sz: 0.05 });
        } else {
            const x = base.cx + (doorSide === 'west' ? -base.halfX - inset : base.halfX + inset);
            transforms.doors.push({ x, y: doorH * 0.5, z: base.cz, sx: 0.05, sy: doorH, sz: doorW });
        }

        for (let floor = 0; floor < floors; floor++) {
            const fp = footprints[floor];
            const y = floor * floorH + floorH * 0.58;
            const n = rng() < 0.45 ? 1 : 2;
            for (let i = 0; i < n; i++) {
                const u = n === 1 ? 0 : (i === 0 ? -0.32 : 0.32);
                transforms.windows.push({ x: fp.cx + u * fp.halfX, y, z: fp.cz - fp.halfZ - 0.022, sx: Math.min(1.25, fp.halfX * 0.42), sy: 0.72, sz: 0.04 });
                transforms.windows.push({ x: fp.cx + u * fp.halfX, y, z: fp.cz + fp.halfZ + 0.022, sx: Math.min(1.25, fp.halfX * 0.42), sy: 0.72, sz: 0.04 });
            }
            if (fp.halfZ > 1.2) {
                const sideWindowZ = fp.cz + (floor % 2 ? 0.22 : -0.22) * fp.halfZ;
                transforms.windows.push({ x: fp.cx - fp.halfX - 0.022, y, z: sideWindowZ, sx: 0.04, sy: 0.68, sz: Math.min(1.15, fp.halfZ * 0.44) });
                transforms.windows.push({ x: fp.cx + fp.halfX + 0.022, y, z: sideWindowZ, sx: 0.04, sy: 0.68, sz: Math.min(1.15, fp.halfZ * 0.44) });
            }
        }

        if (balconySpec) {
            const fp = footprints[Math.min(1, footprints.length - 1)];
            const y = floorH + 1.15;
            const side = balconySpec.side;
            if (side === 'north' || side === 'south') {
                const z = fp.cz + (side === 'north' ? -fp.halfZ - inset : fp.halfZ + inset);
                transforms.doors.push({ x: fp.cx, y, z, sx: 1.1, sy: 2.05, sz: 0.05 });
            } else {
                const x = fp.cx + (side === 'west' ? -fp.halfX - inset : fp.halfX + inset);
                transforms.doors.push({ x, y, z: fp.cz, sx: 0.05, sy: 2.05, sz: 1.1 });
            }
        }
    }

    function addPartitionWall(wallList, physics, fp, y0, y1, spec, stairCx, stairCz) {
        if (!spec) return 0;
        const wallH = y1 - y0;
        const wallY = y0 + wallH * 0.5;
        const wallT = 0.14;
        const gap = 1.25;
        let segments = 0;
        if (spec.axis === 'x') {
            const z = fp.cz + spec.offset * fp.halfZ;
            const x0 = fp.cx - fp.halfX + 0.18, x1 = fp.cx + fp.halfX - 0.18;
            const gapCx = clamp(stairCx, x0 + gap * 0.55, x1 - gap * 0.55);
            const g0 = gapCx - gap * 0.5, g1 = gapCx + gap * 0.5;
            if (g0 > x0) {
                const w = g0 - x0;
                wallTransform(wallList, x0 + w * 0.5, wallY, z, w, wallH, wallT);
                physics.mazeWalls.push({ x1: x0, z1: z, x2: g0, z2: z, yMin: y0, yMax: y1 });
                segments++;
            }
            if (g1 < x1) {
                const w = x1 - g1;
                wallTransform(wallList, g1 + w * 0.5, wallY, z, w, wallH, wallT);
                physics.mazeWalls.push({ x1: g1, z1: z, x2: x1, z2: z, yMin: y0, yMax: y1 });
                segments++;
            }
        } else {
            const x = fp.cx + spec.offset * fp.halfX;
            const z0 = fp.cz - fp.halfZ + 0.18, z1 = fp.cz + fp.halfZ - 0.18;
            const gapCz = clamp(stairCz, z0 + gap * 0.55, z1 - gap * 0.55);
            const g0 = gapCz - gap * 0.5, g1 = gapCz + gap * 0.5;
            if (g0 > z0) {
                const d = g0 - z0;
                wallTransform(wallList, x, wallY, z0 + d * 0.5, wallT, wallH, d);
                physics.mazeWalls.push({ x1: x, z1: z0, x2: x, z2: g0, yMin: y0, yMax: y1 });
                segments++;
            }
            if (g1 < z1) {
                const d = z1 - g1;
                wallTransform(wallList, x, wallY, g1 + d * 0.5, wallT, wallH, d);
                physics.mazeWalls.push({ x1: x, z1: g1, x2: x, z2: z1, yMin: y0, yMax: y1 });
                segments++;
            }
        }
        return segments;
    }

    function buildModularFootprints({ cx, cz, halfX, halfZ, floors, stairCx, stairCz, stairGapW, stairGapD, enhancementRng }) {
        const footprints = [{ cx, cz, halfX, halfZ }];
        if (floors <= 1) return footprints;
        const useSetback = floors >= 3 && enhancementRng() < 0.82;
        const setbackFloor = useSetback ? 1 + Math.floor(enhancementRng() * Math.max(1, floors - 2)) : floors;
        const scaleX = useSetback ? 0.72 + enhancementRng() * 0.20 : 1;
        const scaleZ = useSetback ? 0.72 + enhancementRng() * 0.20 : 1;
        const rawOffX = (enhancementRng() - 0.5) * halfX * 0.22;
        const rawOffZ = (enhancementRng() - 0.5) * halfZ * 0.22;
        for (let floor = 1; floor < floors; floor++) {
            if (floor < setbackFloor) {
                footprints.push({ cx, cz, halfX, halfZ });
                continue;
            }
            const hx = Math.max(stairGapW * 0.5 + 0.55, halfX * scaleX);
            const hz = Math.max(stairGapD * 0.5 + 0.55, halfZ * scaleZ);
            const maxDx = Math.max(0, hx - stairGapW * 0.5 - 0.35);
            const maxDz = Math.max(0, hz - stairGapD * 0.5 - 0.35);
            const fx = clamp(cx + rawOffX, stairCx - maxDx, stairCx + maxDx);
            const fz = clamp(cz + rawOffZ, stairCz - maxDz, stairCz + maxDz);
            footprints.push({ cx: fx, cz: fz, halfX: hx, halfZ: hz });
        }
        return footprints;
    }

    function addBalcony({ physics, transforms, wallList, fp, y, side }) {
        const slabT = 0.12;
        const depth = 0.92;
        const railH = 0.82;
        const railT = 0.09;
        if (side === 'north' || side === 'south') {
            const width = Math.max(1.8, fp.halfX * 1.45);
            const z = fp.cz + (side === 'north' ? -fp.halfZ - depth * 0.5 : fp.halfZ + depth * 0.5);
            transforms.slabs.push({ x: fp.cx, y: y - slabT * 0.5, z, sx: width, sy: slabT, sz: depth });
            addRectPlatform(physics.platforms, fp.cx, z, width, depth, y, 'balcony');
            const outerZ = z + (side === 'north' ? -depth * 0.5 : depth * 0.5);
            wallTransform(wallList, fp.cx, y + railH * 0.5, outerZ, width, railH, railT);
            physics.mazeWalls.push({ x1: fp.cx - width * 0.5, z1: outerZ, x2: fp.cx + width * 0.5, z2: outerZ, yMin: y, yMax: y + railH });
            for (const x of [fp.cx - width * 0.5, fp.cx + width * 0.5]) {
                wallTransform(wallList, x, y + railH * 0.5, z, railT, railH, depth);
                physics.mazeWalls.push({ x1: x, z1: z - depth * 0.5, x2: x, z2: z + depth * 0.5, yMin: y, yMax: y + railH });
            }
        } else {
            const width = Math.max(1.8, fp.halfZ * 1.45);
            const x = fp.cx + (side === 'west' ? -fp.halfX - depth * 0.5 : fp.halfX + depth * 0.5);
            transforms.slabs.push({ x, y: y - slabT * 0.5, z: fp.cz, sx: depth, sy: slabT, sz: width });
            addRectPlatform(physics.platforms, x, fp.cz, depth, width, y, 'balcony');
            const outerX = x + (side === 'west' ? -depth * 0.5 : depth * 0.5);
            wallTransform(wallList, outerX, y + railH * 0.5, fp.cz, railT, railH, width);
            physics.mazeWalls.push({ x1: outerX, z1: fp.cz - width * 0.5, x2: outerX, z2: fp.cz + width * 0.5, yMin: y, yMax: y + railH });
            for (const z of [fp.cz - width * 0.5, fp.cz + width * 0.5]) {
                wallTransform(wallList, x, y + railH * 0.5, z, depth, railH, railT);
                physics.mazeWalls.push({ x1: x - depth * 0.5, z1: z, x2: x + depth * 0.5, z2: z, yMin: y, yMax: y + railH });
            }
        }
    }

    function addExteriorScaffold({ physics, transforms, fp, floors, floorH, side, seed }) {
        if (floors < 2) return 0;
        const rng = mulberry32(seed);
        const horizontalFace = side === 'north' || side === 'south';
        const depth = 1.0;
        const tangentSpan = Math.max(3.2, Math.min(6.4, (horizontalFace ? fp.halfX : fp.halfZ) * 1.7));
        const outward = side === 'north' || side === 'west' ? -1 : 1;
        const face = horizontalFace ? fp.cz : fp.cx;
        const halfFace = horizontalFace ? fp.halfZ : fp.halfX;
        const fixed = face + outward * (halfFace + depth * 0.62);
        const landingDepth = 0.82;
        const landingWidth = Math.min(tangentSpan, Math.max(2.4, tangentSpan * 0.72));
        const slabT = 0.12;
        const postH = floors * floorH + 0.75;
        let landings = 0;

        // Four skinny posts turn the stair into a recognizable exterior scaffold,
        // not merely an invisible physics ramp.
        for (const tangent of [-landingWidth * 0.5, landingWidth * 0.5]) {
            for (const depthOffset of [-landingDepth * 0.38, landingDepth * 0.38]) {
                const x = horizontalFace ? fp.cx + tangent : fixed + depthOffset;
                const z = horizontalFace ? fixed + depthOffset : fp.cz + tangent;
                transforms.props.push({ x, y: postH * 0.5, z, sx: 0.10, sy: postH, sz: 0.10 });
            }
        }

        for (let level = 0; level <= floors; level++) {
            const y = level * floorH;
            const x = horizontalFace ? fp.cx : fixed;
            const z = horizontalFace ? fixed : fp.cz;
            transforms.slabs.push({
                x, y: y - slabT * 0.5, z,
                sx: horizontalFace ? landingWidth : landingDepth,
                sy: slabT,
                sz: horizontalFace ? landingDepth : landingWidth,
            });
            addRectPlatform(
                physics.platforms,
                x, z,
                horizontalFace ? landingWidth : landingDepth,
                horizontalFace ? landingDepth : landingWidth,
                y,
                'scaffold',
            );
            landings++;
            if (level >= floors) continue;

            const direction = ((level + (seed & 1)) & 1) ? -1 : 1;
            const from = direction < 0 ? landingWidth * 0.38 : -landingWidth * 0.38;
            const to = -from;
            const axis = horizontalFace ? 'x' : 'z';
            physics.ramps.push({
                axis,
                from: (horizontalFace ? fp.cx : fp.cz) + from,
                to: (horizontalFace ? fp.cx : fp.cz) + to,
                fixedCoord: fixed,
                halfWidth: landingDepth * 0.34,
                y0: y,
                y1: y + floorH,
                supportKind: 'scaffold',
            });
            const steps = 12;
            for (let i = 0; i < steps; i++) {
                const t = (i + 0.5) / steps;
                const along = (horizontalFace ? fp.cx : fp.cz) + from + (to - from) * t;
                const stepY = y + floorH * (i + 1) / steps - 0.07;
                if (horizontalFace) transforms.steps.push({ x: along, y: stepY, z: fixed, sx: Math.abs(to - from) / steps * 1.08, sy: 0.14, sz: landingDepth * 0.72 });
                else transforms.steps.push({ x: fixed, y: stepY, z: along, sx: landingDepth * 0.72, sy: 0.14, sz: Math.abs(to - from) / steps * 1.08 });
            }
        }
        return landings;
    }

    function addRoofParapet({ physics, wallList, fp, roofY }) {
        const h = 0.68, t = 0.12;
        wallTransform(wallList, fp.cx, roofY + h * 0.5, fp.cz - fp.halfZ, fp.halfX * 2, h, t);
        wallTransform(wallList, fp.cx, roofY + h * 0.5, fp.cz + fp.halfZ, fp.halfX * 2, h, t);
        wallTransform(wallList, fp.cx - fp.halfX, roofY + h * 0.5, fp.cz, t, h, fp.halfZ * 2);
        wallTransform(wallList, fp.cx + fp.halfX, roofY + h * 0.5, fp.cz, t, h, fp.halfZ * 2);
        physics.mazeWalls.push(
            { x1: fp.cx - fp.halfX, z1: fp.cz - fp.halfZ, x2: fp.cx + fp.halfX, z2: fp.cz - fp.halfZ, yMin: roofY, yMax: roofY + h },
            { x1: fp.cx - fp.halfX, z1: fp.cz + fp.halfZ, x2: fp.cx + fp.halfX, z2: fp.cz + fp.halfZ, yMin: roofY, yMax: roofY + h },
            { x1: fp.cx - fp.halfX, z1: fp.cz - fp.halfZ, x2: fp.cx - fp.halfX, z2: fp.cz + fp.halfZ, yMin: roofY, yMax: roofY + h },
            { x1: fp.cx + fp.halfX, z1: fp.cz - fp.halfZ, x2: fp.cx + fp.halfX, z2: fp.cz + fp.halfZ, yMin: roofY, yMax: roofY + h },
        );
    }

    function buildDistrictLandmarkTower({ physics, transforms, rng, enhancementRng = rng, entityId = '', cx, cz, halfX, halfZ, floors, doorSide, wallList }) {
        const floorH = 3.15;
        const wallT = 0.16;
        const width = halfX * 2;
        const depth = halfZ * 2;
        const stairGapW = Math.min(2.7, width * 0.42);
        const stairGapD = Math.min(5.4, depth * 0.68);
        const stairCx = cx + (doorSide === 'west' ? width * 0.20 : doorSide === 'east' ? -width * 0.20 : (rng() - 0.5) * width * 0.22);
        const stairCz = cz + (doorSide === 'north' ? depth * 0.18 : doorSide === 'south' ? -depth * 0.18 : (rng() - 0.5) * depth * 0.22);
        const doorW = 1.65;
        const footprints = buildModularFootprints({ cx, cz, halfX, halfZ, floors, stairCx, stairCz, stairGapW, stairGapD, enhancementRng });
        const balconySpec = floors >= 2 && enhancementRng() < 0.58
            ? { side: ['north', 'east', 'south', 'west'][(hashString32(`${entityId}:balcony`) >>> 0) % 4] }
            : null;
        const scaffoldSide = floors >= 2 && enhancementRng() < 0.48
            ? oppositeSide(doorSide)
            : null;
        const partitionSpecs = footprints.map((fp, floor) => {
            if (fp.halfX < 1.8 || fp.halfZ < 1.8 || enhancementRng() > (floor === 0 ? 0.78 : 0.54)) return null;
            return { axis: enhancementRng() < 0.5 ? 'x' : 'z', offset: (enhancementRng() - 0.5) * 0.45 };
        });
        let partitionSegments = 0;

        for (let floor = 0; floor < floors; floor++) {
            const fp = footprints[floor];
            const y0 = floor * floorH;
            const y1 = y0 + floorH;
            const wallY = y0 + floorH * 0.5;
            const wallWidth = fp.halfX * 2;
            const wallDepth = fp.halfZ * 2;
            const openingSide = floor === 0 ? doorSide : (floor === 1 ? balconySpec?.side : null);
            const openingWidth = floor === 0 ? doorW : (openingSide ? 1.25 : 0);

            const addHorizontalWall = (z, side) => {
                if (openingWidth && openingSide === side) {
                    const seg = Math.max(0.05, (wallWidth - openingWidth) * 0.5);
                    wallTransform(wallList, fp.cx - (openingWidth + seg) * 0.5, wallY, z, seg, floorH, wallT);
                    wallTransform(wallList, fp.cx + (openingWidth + seg) * 0.5, wallY, z, seg, floorH, wallT);
                } else wallTransform(wallList, fp.cx, wallY, z, wallWidth, floorH, wallT);
            };
            const addVerticalWall = (x, side) => {
                if (openingWidth && openingSide === side) {
                    const seg = Math.max(0.05, (wallDepth - openingWidth) * 0.5);
                    wallTransform(wallList, x, wallY, fp.cz - (openingWidth + seg) * 0.5, wallT, floorH, seg);
                    wallTransform(wallList, x, wallY, fp.cz + (openingWidth + seg) * 0.5, wallT, floorH, seg);
                } else wallTransform(wallList, x, wallY, fp.cz, wallT, floorH, wallDepth);
            };
            addHorizontalWall(fp.cz - fp.halfZ, 'north');
            addHorizontalWall(fp.cz + fp.halfZ, 'south');
            addVerticalWall(fp.cx - fp.halfX, 'west');
            addVerticalWall(fp.cx + fp.halfX, 'east');
            pushWallSegments(physics.mazeWalls, fp.cx, fp.cz, fp.halfX, fp.halfZ, y0, y1, openingSide, openingWidth || doorW);
            partitionSegments += addPartitionWall(wallList, physics, fp, y0, y1, partitionSpecs[floor], stairCx, stairCz);

            if (floor > 0) {
                const supportFp = footprints[floor - 1];
                addNotchedFloor(physics.platforms, supportFp.cx, supportFp.cz, supportFp.halfX * 2 - wallT * 2, supportFp.halfZ * 2 - wallT * 2, y0, stairCx, stairCz, stairGapW, stairGapD);
                addRenderedNotchedSlab(transforms, supportFp.cx, supportFp.cz, supportFp.halfX * 2 - wallT * 2, supportFp.halfZ * 2 - wallT * 2, y0, stairCx, stairCz, stairGapW, stairGapD);
            }

            const runAxis = stairGapD >= stairGapW ? 'z' : 'x';
            const from = runAxis === 'z' ? stairCz - stairGapD * 0.42 : stairCx - stairGapW * 0.42;
            const to = runAxis === 'z' ? stairCz + stairGapD * 0.42 : stairCx + stairGapW * 0.42;
            physics.ramps.push({
                axis: runAxis,
                from,
                to,
                fixedCoord: runAxis === 'z' ? stairCx : stairCz,
                halfWidth: Math.min(stairGapW, stairGapD) * 0.35,
                y0,
                y1,
            });
            const steps = 12;
            for (let i = 0; i < steps; i++) {
                const t = (i + 0.5) / steps;
                const along = from + (to - from) * t;
                const stepY = y0 + (y1 - y0) * (i + 1) / steps - 0.08;
                transforms.steps.push(runAxis === 'z'
                    ? { x: stairCx, y: stepY, z: along, sx: stairGapW * 0.62, sy: 0.16, sz: Math.abs(to - from) / steps * 1.06 }
                    : { x: along, y: stepY, z: stairCz, sx: Math.abs(to - from) / steps * 1.06, sy: 0.16, sz: stairGapD * 0.62 });
            }
        }

        const top = footprints[footprints.length - 1];
        const roofY = floors * floorH;
        addNotchedFloor(physics.platforms, top.cx, top.cz, top.halfX * 2 - wallT * 2, top.halfZ * 2 - wallT * 2, roofY, stairCx, stairCz, stairGapW, stairGapD, 'roof');
        addRenderedNotchedSlab(transforms, top.cx, top.cz, top.halfX * 2 - wallT * 2, top.halfZ * 2 - wallT * 2, roofY, stairCx, stairCz, stairGapW, stairGapD);
        addRoofParapet({ physics, wallList, fp: top, roofY });
        if (balconySpec) addBalcony({ physics, transforms, wallList, fp: footprints[Math.min(1, footprints.length - 1)], y: floorH, side: balconySpec.side });
        const scaffoldLandings = scaffoldSide
            ? addExteriorScaffold({ physics, transforms, fp: footprints[0], floors, floorH, side: scaffoldSide, seed: hashString32(`${entityId}:scaffold`) })
            : 0;
        addFacadeDetails(transforms, rng, { footprints, floorH, floors, doorSide, balconySpec });

        if (rng() < 0.58) {
            const px = cx + (doorSide === 'west' ? -halfX - 0.7 : doorSide === 'east' ? halfX + 0.7 : (rng() - 0.5) * width * 0.55);
            const pz = cz + (doorSide === 'north' ? -halfZ - 0.7 : doorSide === 'south' ? halfZ + 0.7 : (rng() - 0.5) * depth * 0.55);
            transforms.props.push({ x: px, y: 0.38, z: pz, sx: 0.75, sy: 0.76, sz: 0.75 });
            physics.props.push({ x: px, z: pz, radius: 0.52, height: 0.76 });
        }

        return {
            floorH,
            halfX,
            halfZ,
            footprintModules: footprints.map(fp => ({ ...fp })),
            modularSetbacks: footprints.filter((fp, i) => i > 0 && (fp.cx !== footprints[i - 1].cx || fp.cz !== footprints[i - 1].cz || fp.halfX !== footprints[i - 1].halfX || fp.halfZ !== footprints[i - 1].halfZ)).length,
            partitionSegments,
            balconySide: balconySpec?.side ?? null,
            scaffoldSide,
            scaffoldLandings,
        };
    }


    function addCompoundSideWall({ physics, wallList, rect, floorH, floor, side, opening = 0 }) {
        const y0 = floor * floorH;
        const y1 = y0 + floorH;
        const wallY = (y0 + y1) * 0.5;
        const wallT = 0.16;
        const horizontal = side === 'north' || side === 'south';
        const fixed = horizontal
            ? rect.cz + (side === 'north' ? -rect.halfZ : rect.halfZ)
            : rect.cx + (side === 'west' ? -rect.halfX : rect.halfX);
        const lo = horizontal ? rect.cx - rect.halfX : rect.cz - rect.halfZ;
        const hi = horizontal ? rect.cx + rect.halfX : rect.cz + rect.halfZ;
        const span = hi - lo;
        const gap = Math.max(0, Math.min(span - 0.12, opening || 0));
        const addSegment = (a, b) => {
            if (b - a <= 0.04) return;
            const mid = (a + b) * 0.5;
            if (horizontal) {
                wallTransform(wallList, mid, wallY, fixed, b - a, floorH, wallT);
                physics.mazeWalls.push({ x1: a, z1: fixed, x2: b, z2: fixed, yMin: y0, yMax: y1 });
            } else {
                wallTransform(wallList, fixed, wallY, mid, wallT, floorH, b - a);
                physics.mazeWalls.push({ x1: fixed, z1: a, x2: fixed, z2: b, yMin: y0, yMax: y1 });
            }
        };
        if (!gap) {
            addSegment(lo, hi);
            return;
        }
        const mid = (lo + hi) * 0.5;
        addSegment(lo, mid - gap * 0.5);
        addSegment(mid + gap * 0.5, hi);
    }

    function addCompoundRoofParapetSide({ physics, wallList, rect, roofY, side }) {
        const h = 0.68, t = 0.12;
        if (side === 'north' || side === 'south') {
            const z = rect.cz + (side === 'north' ? -rect.halfZ : rect.halfZ);
            wallTransform(wallList, rect.cx, roofY + h * 0.5, z, rect.halfX * 2, h, t);
            physics.mazeWalls.push({ x1: rect.cx - rect.halfX, z1: z, x2: rect.cx + rect.halfX, z2: z, yMin: roofY, yMax: roofY + h });
        } else {
            const x = rect.cx + (side === 'west' ? -rect.halfX : rect.halfX);
            wallTransform(wallList, x, roofY + h * 0.5, rect.cz, t, h, rect.halfZ * 2);
            physics.mazeWalls.push({ x1: x, z1: rect.cz - rect.halfZ, x2: x, z2: rect.cz + rect.halfZ, yMin: roofY, yMax: roofY + h });
        }
    }

    function buildKowloonCompound({
        chunk, site, siteIdOf, roadPlan, openSiteIds, bridgePortalsBySite, physics, transforms,
        cx0, cz0, half, cellSize, materialIndex,
    }) {
        const weird = chunk.weirdness.sampled;
        const intensity = kowloonIntensity(weird);
        const siteSignature = site.cells.map(cell => kowloonCellKey(cell.col, cell.row)).join('|');
        const siteSeed = hashString32(`${worldSeed}:kowloon-compound:${chunk.key}:${siteSignature}`);
        const rng = mulberry32(siteSeed);
        const topology = analyzeKowloonCompound(site, siteIdOf);
        const courtyard = topology.courtyardCandidate
            ?? selectKowloonCourtyardCell(site, topology.degreeOf, topology.primary, { minCells: 5, degree: 3 });
        const activeCells = site.cells.filter(cell => cell !== courtyard);
        if (!activeCells.length) return null;

        const isStreetCell = (col, row) => {
            if (col < 0 || row < 0 || col >= microCells || row >= microCells) return true;
            if (roadPlan.roads.has(kowloonCellKey(col, row))) return true;
            const neighborSiteId = siteIdOf[row]?.[col];
            return neighborSiteId >= 0 && openSiteIds.has(neighborSiteId);
        };
        const edgeKindsFor = cell => {
            const result = {};
            for (const dir of KOWLOON_DIRS) {
                result[dir.key] = classifyKowloonEdge({
                    siteIdOf, siteId: site.id, row: cell.row, col: cell.col,
                    dr: dir.dr, dc: dir.dc, isStreet: isStreetCell, courtyardCell: courtyard,
                });
            }
            return result;
        };

        const primaryKey = kowloonCellKey(topology.primary.col, topology.primary.row);
        const baseFloors = 2 + Math.floor(rng() * 3);
        const verticalBurst = rng() < 0.38 + weird * 0.48
            ? 1 + Math.floor(rng() * (2 + intensity.verticalVariance))
            : 0;
        const primaryFloors = Math.min(12, baseFloors + verticalBurst + (site.cells.length >= 4 ? 1 : 0));
        const floorH = 3.15;
        const modulePlans = [];

        for (const cell of activeCells) {
            const key = kowloonCellKey(cell.col, cell.row);
            const edgeKinds = edgeKindsFor(cell);
            const cellCx = cx0 - half + (cell.col + 0.5) * cellSize;
            const cellCz = cz0 - half + (cell.row + 0.5) * cellSize;
            const streetSetback = cellSize * (0.055 + rng() * 0.055);
            const partySetback = cellSize * (0.010 + rng() * 0.018);
            const internalSetback = cellSize * 0.002;
            const setbackFor = kind => kind === 'internal' ? internalSetback : kind === 'party' ? partySetback : streetSetback;
            const x0 = cellCx - cellSize * 0.5 + setbackFor(edgeKinds.W);
            const x1 = cellCx + cellSize * 0.5 - setbackFor(edgeKinds.E);
            const z0 = cellCz - cellSize * 0.5 + setbackFor(edgeKinds.N);
            const z1 = cellCz + cellSize * 0.5 - setbackFor(edgeKinds.S);
            let floors;
            if (key === primaryKey) floors = primaryFloors;
            else {
                const drop = Math.floor(rng() * (2 + intensity.verticalVariance));
                floors = Math.max(1, primaryFloors - drop);
                if (rng() < 0.16 + weird * 0.16) floors = Math.max(1, floors - 1);
            }
            modulePlans.push({
                key, cell, edgeKinds, floors,
                rect: { cx: (x0 + x1) * 0.5, cz: (z0 + z1) * 0.5, halfX: (x1 - x0) * 0.5, halfZ: (z1 - z0) * 0.5 },
            });
        }

        const bridgePortals = bridgePortalsBySite?.get(site.id) ?? [];
        const bridgeOpeningKeys = new Set();
        for (const portal of bridgePortals) {
            const module = modulePlans.find(candidate => candidate.key === portal.moduleKey);
            if (!module) continue;
            module.floors = Math.max(module.floors, portal.floor + 1);
            bridgeOpeningKeys.add(`${portal.moduleKey}:${portal.dirKey}:${portal.floor}`);
        }

        // The vertical spine must be the tallest module so every other occupied
        // floor can be reached laterally through same-site openings.
        let primaryModule = modulePlans.find(module => module.key === primaryKey) || modulePlans[0];
        for (const module of modulePlans) module.floors = Math.min(module.floors, primaryModule.floors);
        const moduleByKey = new Map(modulePlans.map(module => [module.key, module]));

        const streetFaces = [];
        for (const module of modulePlans) {
            for (const dir of KOWLOON_DIRS) {
                if (module.edgeKinds[dir.key] === 'street' || module.edgeKinds[dir.key] === 'courtyard') {
                    streetFaces.push({ module, dir, courtyard: module.edgeKinds[dir.key] === 'courtyard' });
                }
            }
        }
        const primaryStreet = streetFaces.filter(face => face.module === primaryModule && !face.courtyard);
        const doorFacePool = primaryStreet.length ? primaryStreet : streetFaces.filter(face => !face.courtyard);
        const doorFace = doorFacePool.length ? doorFacePool[Math.floor(rng() * doorFacePool.length) % doorFacePool.length] : null;
        if (doorFace) primaryModule = primaryModule || doorFace.module;

        const serviceCagePlans = [];
        const serviceCageOpeningKeys = new Set();
        const serviceFacePool = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        if (serviceFacePool.length && rng() < intensity.cageChance) {
            const count = 1 + Math.floor(rng() * Math.min(3, 1 + site.cells.length * 0.5));
            for (let i = 0; i < count; i++) {
                const face = serviceFacePool[Math.floor(rng() * serviceFacePool.length) % serviceFacePool.length];
                const level = 1 + Math.floor(rng() * Math.max(1, face.module.floors - 1));
                const horizontal = face.dir.side === 'north' || face.dir.side === 'south';
                const depth = 0.55 + rng() * 0.55;
                const width = Math.min(horizontal ? face.module.rect.halfX * 1.45 : face.module.rect.halfZ * 1.45, 2.8 + rng() * 1.5);
                serviceCagePlans.push({ face, level, horizontal, depth, width });
                serviceCageOpeningKeys.add(`${face.module.key}:${face.dir.key}:${level}`);
            }
        }

        let partitionSegments = 0;
        let exposedSetbackFaces = 0;
        let internalOpenFaces = 0;
        let partyFaces = 0;
        const facades = [];

        for (const module of modulePlans) {
            const wallList = transforms.wallGroups[materialIndex];
            const stairGapW = Math.min(2.65, module.rect.halfX * 2 * 0.42);
            const stairGapD = Math.min(4.9, module.rect.halfZ * 2 * 0.64);
            const stairCx = module.rect.cx + (rng() - 0.5) * module.rect.halfX * 0.26;
            const stairCz = module.rect.cz + (rng() - 0.5) * module.rect.halfZ * 0.26;
            const isSpine = module === primaryModule;

            for (let floor = 0; floor < module.floors; floor++) {
                const y0 = floor * floorH;
                const y1 = y0 + floorH;
                for (const dir of KOWLOON_DIRS) {
                    const kind = module.edgeKinds[dir.key];
                    let shouldWall = kind !== 'internal';
                    if (kind === 'party') partyFaces++;
                    if (kind === 'internal') {
                        const neighbor = moduleByKey.get(kowloonCellKey(module.cell.col + dir.dc, module.cell.row + dir.dr));
                        if (neighbor && floor < neighbor.floors) {
                            internalOpenFaces++;
                            shouldWall = false;
                        } else {
                            exposedSetbackFaces++;
                            shouldWall = true;
                        }
                    }
                    if (!shouldWall) continue;
                    let opening = 0;
                    if (bridgeOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = 1.20;
                    else if (serviceCageOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = 1.08;
                    else if (floor === 0 && doorFace?.module === module && doorFace.dir.key === dir.key) opening = 1.55;
                    else if (floor === 0 && kind === 'courtyard' && rng() < 0.44) opening = 1.18;
                    addCompoundSideWall({ physics, wallList, rect: module.rect, floorH, floor, side: dir.side, opening });
                    if (kind === 'street' || kind === 'courtyard') facades.push({
                        moduleKey: module.key, side: dir.side, x: module.rect.cx, z: module.rect.cz,
                        halfX: module.rect.halfX, halfZ: module.rect.halfZ,
                        yMin: y0, yMax: y1,
                    });
                }

                if (floor > 0) {
                    if (isSpine) {
                        addNotchedFloor(physics.platforms, module.rect.cx, module.rect.cz,
                            module.rect.halfX * 2 - 0.12, module.rect.halfZ * 2 - 0.12,
                            y0, stairCx, stairCz, stairGapW, stairGapD);
                        addRenderedNotchedSlab(transforms, module.rect.cx, module.rect.cz,
                            module.rect.halfX * 2 - 0.12, module.rect.halfZ * 2 - 0.12,
                            y0, stairCx, stairCz, stairGapW, stairGapD);
                    } else {
                        addRectPlatform(physics.platforms, module.rect.cx, module.rect.cz,
                            module.rect.halfX * 2 - 0.12, module.rect.halfZ * 2 - 0.12, y0, 'floor');
                        transforms.slabs.push({ x: module.rect.cx, y: y0 - 0.06, z: module.rect.cz,
                            sx: module.rect.halfX * 2 - 0.12, sy: 0.12, sz: module.rect.halfZ * 2 - 0.12 });
                    }
                }

                const partitionRng = mulberry32(hashString32(`${siteSeed}:${module.key}:partition:${floor}`));
                if (module.rect.halfX > 1.55 && module.rect.halfZ > 1.55 && partitionRng() < (floor === 0 ? 0.72 : 0.52)) {
                    const spec = { axis: partitionRng() < 0.5 ? 'x' : 'z', offset: (partitionRng() - 0.5) * 0.42 };
                    partitionSegments += addPartitionWall(wallList, physics, module.rect, y0, y1, spec, stairCx, stairCz);
                }

                if (isSpine && floor < module.floors) {
                    const runAxis = stairGapD >= stairGapW ? 'z' : 'x';
                    const from = runAxis === 'z' ? stairCz - stairGapD * 0.42 : stairCx - stairGapW * 0.42;
                    const to = runAxis === 'z' ? stairCz + stairGapD * 0.42 : stairCx + stairGapW * 0.42;
                    physics.ramps.push({
                        axis: runAxis, from, to,
                        fixedCoord: runAxis === 'z' ? stairCx : stairCz,
                        halfWidth: Math.min(stairGapW, stairGapD) * 0.35,
                        y0, y1, supportKind: 'compound-stair',
                    });
                    const steps = 12;
                    for (let i = 0; i < steps; i++) {
                        const t = (i + 0.5) / steps;
                        const along = from + (to - from) * t;
                        const stepY = y0 + floorH * (i + 1) / steps - 0.08;
                        transforms.steps.push(runAxis === 'z'
                            ? { x: stairCx, y: stepY, z: along, sx: stairGapW * 0.62, sy: 0.16, sz: Math.abs(to - from) / steps * 1.06 }
                            : { x: along, y: stepY, z: stairCz, sx: Math.abs(to - from) / steps * 1.06, sy: 0.16, sz: stairGapD * 0.62 });
                    }
                }
            }

            const roofY = module.floors * floorH;
            addRectPlatform(physics.platforms, module.rect.cx, module.rect.cz,
                module.rect.halfX * 2 - 0.12, module.rect.halfZ * 2 - 0.12, roofY, 'roof');
            transforms.slabs.push({ x: module.rect.cx, y: roofY - 0.06, z: module.rect.cz,
                sx: module.rect.halfX * 2 - 0.12, sy: 0.12, sz: module.rect.halfZ * 2 - 0.12 });
            for (const dir of KOWLOON_DIRS) {
                let exposed = module.edgeKinds[dir.key] !== 'internal';
                if (!exposed) {
                    const neighbor = moduleByKey.get(kowloonCellKey(module.cell.col + dir.dc, module.cell.row + dir.dr));
                    exposed = !neighbor || neighbor.floors < module.floors;
                }
                if (exposed) addCompoundRoofParapetSide({ physics, wallList, rect: module.rect, roofY, side: dir.side });
            }
        }

        // Keep the old readable facade layer, but derive it from the shared
        // compound faces instead of painting every side of a one-cell box.
        for (const facade of facades) {
            const module = moduleByKey.get(facade.moduleKey);
            if (!module) continue;
            const floor = Math.max(0, Math.round(facade.yMin / floorH));
            const y = facade.yMin + floorH * 0.58;
            const n = rng() < 0.48 ? 1 : 2;
            for (let i = 0; i < n; i++) {
                const u = n === 1 ? 0 : (i === 0 ? -0.32 : 0.32);
                if (facade.side === 'north' || facade.side === 'south') {
                    const z = module.rect.cz + (facade.side === 'north' ? -module.rect.halfZ - 0.022 : module.rect.halfZ + 0.022);
                    transforms.windows.push({ x: module.rect.cx + u * module.rect.halfX, y, z, sx: Math.min(1.25, module.rect.halfX * 0.42), sy: 0.72, sz: 0.04 });
                } else {
                    const x = module.rect.cx + (facade.side === 'west' ? -module.rect.halfX - 0.022 : module.rect.halfX + 0.022);
                    transforms.windows.push({ x, y, z: module.rect.cz + u * module.rect.halfZ, sx: 0.04, sy: 0.72, sz: Math.min(1.25, module.rect.halfZ * 0.42) });
                }
            }
        }
        if (doorFace) {
            const rect = doorFace.module.rect;
            const side = doorFace.dir.side;
            if (side === 'north' || side === 'south') {
                transforms.doors.push({ x: rect.cx, y: 1.1, z: rect.cz + (side === 'north' ? -rect.halfZ - 0.018 : rect.halfZ + 0.018), sx: 1.35, sy: 2.2, sz: 0.05 });
            } else {
                transforms.doors.push({ x: rect.cx + (side === 'west' ? -rect.halfX - 0.018 : rect.halfX + 0.018), y: 1.1, z: rect.cz, sx: 0.05, sy: 2.2, sz: 1.35 });
            }
        }

        const scaffoldCandidates = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        let scaffoldSide = null;
        let scaffoldLandings = 0;
        if (scaffoldCandidates.length && rng() < intensity.scaffoldChance) {
            scaffoldCandidates.sort((a, b) => b.module.floors - a.module.floors || a.module.key.localeCompare(b.module.key));
            const scaffoldFace = scaffoldCandidates[0];
            scaffoldSide = scaffoldFace.dir.side;
            scaffoldLandings = addExteriorScaffold({
                physics, transforms, fp: scaffoldFace.module.rect,
                floors: scaffoldFace.module.floors, floorH, side: scaffoldSide,
                seed: hashString32(`${siteSeed}:scaffold`),
            });
        }

        let balconySide = null;
        const balconyCandidates = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        if (balconyCandidates.length && rng() < 0.50 + weird * 0.18) {
            const balconyFace = balconyCandidates[Math.floor(rng() * balconyCandidates.length) % balconyCandidates.length];
            balconySide = balconyFace.dir.side;
            addBalcony({ physics, transforms, wallList: transforms.wallGroups[materialIndex], fp: balconyFace.module.rect, y: floorH, side: balconySide });
        }

        // Accessible exterior service cages/utility ledges: openings were
        // reserved before wall emission, so these are part of the circulation
        // graph rather than decorative shelves glued to a sealed facade.
        let serviceCages = 0;
        for (const cage of serviceCagePlans) {
            const { face, level, horizontal, depth, width } = cage;
            const y = level * floorH;
            const x = horizontal ? face.module.rect.cx : face.module.rect.cx + (face.dir.side === 'west' ? -face.module.rect.halfX - depth * 0.5 : face.module.rect.halfX + depth * 0.5);
            const z = horizontal ? face.module.rect.cz + (face.dir.side === 'north' ? -face.module.rect.halfZ - depth * 0.5 : face.module.rect.halfZ + depth * 0.5) : face.module.rect.cz;
            const sx = horizontal ? width : depth;
            const sz = horizontal ? depth : width;
            transforms.slabs.push({ x, y: y - 0.06, z, sx, sy: 0.12, sz });
            addRectPlatform(physics.platforms, x, z, sx, sz, y, 'service-cage');

            const railH = 0.82, railT = 0.08;
            if (horizontal) {
                const outerZ = z + (face.dir.side === 'north' ? -depth * 0.5 : depth * 0.5);
                wallTransform(transforms.wallGroups[materialIndex], x, y + railH * 0.5, outerZ, sx, railH, railT);
                physics.mazeWalls.push({ x1: x - sx * 0.5, z1: outerZ, x2: x + sx * 0.5, z2: outerZ, yMin: y, yMax: y + railH });
            } else {
                const outerX = x + (face.dir.side === 'west' ? -depth * 0.5 : depth * 0.5);
                wallTransform(transforms.wallGroups[materialIndex], outerX, y + railH * 0.5, z, railT, railH, sz);
                physics.mazeWalls.push({ x1: outerX, z1: z - sz * 0.5, x2: outerX, z2: z + sz * 0.5, yMin: y, yMax: y + railH });
            }
            serviceCages++;
        }

        if (courtyard) {
            const cx = cx0 - half + (courtyard.col + 0.5) * cellSize;
            const cz = cz0 - half + (courtyard.row + 0.5) * cellSize;
            const pile = addClimbablePlazaPile({ physics, transforms, rng, cx, cz, cellSize, weird });
            if (pile.topY > 0) serviceCages += 0; // retained in structural metrics through courtyard flag.
        }

        const bounds = modulePlans.reduce((acc, module) => ({
            minX: Math.min(acc.minX, module.rect.cx - module.rect.halfX),
            maxX: Math.max(acc.maxX, module.rect.cx + module.rect.halfX),
            minZ: Math.min(acc.minZ, module.rect.cz - module.rect.halfZ),
            maxZ: Math.max(acc.maxZ, module.rect.cz + module.rect.halfZ),
        }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        const anchor = doorFace?.module || primaryModule;
        const floorCounts = modulePlans.map(module => module.floors);
        return {
            x: anchor.rect.cx, z: anchor.rect.cz,
            halfX: anchor.rect.halfX, halfZ: anchor.rect.halfZ,
            floorH,
            floors: Math.max(...floorCounts),
            doorSide: doorFace?.dir.side ?? scaffoldSide ?? 'north',
            compoundCells: site.cells.map(cell => ({ col: cell.col, row: cell.row })),
            primaryCell: { col: topology.primary.col, row: topology.primary.row },
            courtyardCell: courtyard ? { col: courtyard.col, row: courtyard.row } : null,
            moduleCount: modulePlans.length,
            footprintModules: modulePlans.map(module => ({ ...module.rect, floors: module.floors, key: module.key })),
            modularSetbacks: Math.max(0, new Set(floorCounts).size - 1) + Math.max(0, modulePlans.length - 1),
            heightVariance: Math.max(...floorCounts) - Math.min(...floorCounts),
            partitionSegments,
            internalOpenFaces,
            exposedSetbackFaces,
            partyFaces,
            balconySide,
            scaffoldSide,
            scaffoldLandings,
            serviceCages,
            bridgePortalCount: bridgeOpeningKeys.size,
            facades,
            compoundBounds: bounds,
            kowloonIntensity: weird,
        };
    }

    function addClimbablePlazaPile({ physics, transforms, rng, cx, cz, cellSize, weird }) {
        const tiers = 3 + Math.floor(rng() * (2 + weird * 3));
        const baseWidth = cellSize * (0.22 + rng() * 0.10);
        const driftX = (rng() - 0.5) * cellSize * 0.12;
        const driftZ = (rng() - 0.5) * cellSize * 0.12;
        let topY = 0;
        for (let tier = 0; tier < tiers; tier++) {
            const h = 0.24 + rng() * 0.13;
            const shrink = Math.max(0.48, 1 - tier * 0.11);
            const sx = baseWidth * shrink;
            const sz = baseWidth * (0.78 + rng() * 0.36) * shrink;
            const x = cx + driftX * tier / Math.max(1, tiers - 1);
            const z = cz + driftZ * tier / Math.max(1, tiers - 1);
            transforms.props.push({ x, y: topY + h * 0.5, z, sx, sy: h, sz });
            physics.props.push({
                x, z,
                radius: Math.max(0.28, Math.min(sx, sz) * 0.42),
                yMin: topY,
                height: topY + h,
                supportKind: 'junk-pile',
            });
            topY += h;
        }
        return { tiers, topY };
    }

    const districtLandmarkTypes = Object.freeze(['spire', 'stack', 'gatehouse', 'archive', 'beacon']);
    const districtLandmarkSpacing = Math.max(3, Math.floor(landmarkSpacingChunks));

     
     
     
     
    function districtLandmarkFor(chunk) {
        if (!chunk || chunk.key === spawnChunkKey) return null;
        const macroX = Math.floor(chunk.x / districtLandmarkSpacing);
        const macroZ = Math.floor(chunk.z / districtLandmarkSpacing);
        const macroSeed = hashString32(`${worldSeed}:district-landmark:${macroX}:${macroZ}`);
        let localX = macroSeed % districtLandmarkSpacing;
        let localZ = (macroSeed >>> 8) % districtLandmarkSpacing;
        let chunkX = macroX * districtLandmarkSpacing + localX;
        let chunkZ = macroZ * districtLandmarkSpacing + localZ;
        if (chunkX === 0 && chunkZ === 0) {
            localX = (localX + 1) % districtLandmarkSpacing;
            chunkX = macroX * districtLandmarkSpacing + localX;
        }
        if (chunk.x !== chunkX || chunk.z !== chunkZ) return null;
        const type = districtLandmarkTypes[(macroSeed >>> 16) % districtLandmarkTypes.length];
        return {
            id: worldEntityId(worldSeed, chunk.x, chunk.z, 'district-landmark', type),
            type,
            macroX,
            macroZ,
            spacingChunks: districtLandmarkSpacing,
        };
    }

    function roadNeighborSides(c, r, roads) {
        const candidates = [];
        if (roads.has(key(c, r - 1))) candidates.push('north');
        if (roads.has(key(c, r + 1))) candidates.push('south');
        if (roads.has(key(c - 1, r))) candidates.push('west');
        if (roads.has(key(c + 1, r))) candidates.push('east');
        return candidates;
    }

    function chooseDistrictLandmarkCell(roadPlan) {
        let best = null;
        for (let r = 0; r < microCells; r++) {
            for (let c = 0; c < microCells; c++) {
                if (roadPlan.roads.has(key(c, r))) continue;
                const sides = roadNeighborSides(c, r, roadPlan.roads);
                if (!sides.length) continue;
                const dc = c - roadPlan.hub.c;
                const dr = r - roadPlan.hub.r;
                const score = dc * dc + dr * dr;
                if (!best || score < best.score || (score === best.score && key(c, r) < best.key)) {
                    best = { c, r, key: key(c, r), sides, score };
                }
            }
        }
        return best;
    }

    function buildDistrictLandmark({ chunk, spec, cell, physics, transforms, rng, cellCx, cellCz, cellSize }) {
        const typeIndex = districtLandmarkTypes.indexOf(spec.type);
        const weird = chunk.weirdness.sampled;
        const floors = Math.min(12, 5 + typeIndex + Math.floor(weird * 3));
        const halfX = cellSize * (spec.type === 'gatehouse' ? 0.46 : 0.42);
        const halfZ = cellSize * (spec.type === 'stack' ? 0.46 : 0.42);
        const doorSide = cell.sides[hashString32(`${spec.id}:door`) % cell.sides.length];
        const materialIndex = hashString32(`${spec.id}:facade`) % wallMats.length;
        const structural = buildDistrictLandmarkTower({
            physics,
            transforms,
            rng,
            enhancementRng: mulberry32(hashString32(`${spec.id}:structure-v2`)),
            entityId: spec.id,
            cx: cellCx,
            cz: cellCz,
            halfX,
            halfZ,
            floors,
            doorSide,
            wallList: transforms.wallGroups[materialIndex],
        });

         
         
         
        const floorH = 3.15;
        const roofY = floors * floorH;
        const crownH = 0.9 + typeIndex * 0.22 + weird * 0.8;
        const crownHalfX = halfX * (0.72 - Math.min(0.24, typeIndex * 0.035));
        const crownHalfZ = halfZ * (0.72 - Math.min(0.24, typeIndex * 0.035));
        wallTransform(transforms.wallGroups[materialIndex], cellCx, roofY + crownH * 0.5, cellCz, crownHalfX * 2, crownH, crownHalfZ * 2);
        pushWallSegments(physics.mazeWalls, cellCx, cellCz, crownHalfX, crownHalfZ, roofY, roofY + crownH);
        if (spec.type === 'spire' || spec.type === 'beacon') {
            const mastH = 2.4 + weird * 3.2;
            wallTransform(transforms.wallGroups[materialIndex], cellCx, roofY + crownH + mastH * 0.5, cellCz, 0.22, mastH, 0.22);
        }
        return { ...spec, c: cell.c, r: cell.r, x: cellCx, z: cellCz, floors, doorSide, materialIndex, ...structural };
    }

    function addOwnedBoundaryBarriers(chunk, roadPlan, physics, wallList, cellSize) {
        const half = chunkSize * 0.5;
        const last = microCells - 1;
        const wallH = 1.55, wallT = 0.16;

         
         
         
        for (let r = 0; r < microCells; r++) {
            if (r === roadPlan.portals.east) continue;
            const z = chunk.centerZ - half + (r + 0.5) * cellSize;
            const x = chunk.centerX + half - wallT * 0.5;
            wallTransform(wallList, x, wallH * 0.5, z, wallT, wallH, cellSize);
            physics.mazeWalls.push({ x1: x, z1: z - cellSize * 0.5, x2: x, z2: z + cellSize * 0.5, yMin: 0, yMax: wallH });
        }
        for (let c = 0; c < microCells; c++) {
            if (c === roadPlan.portals.south) continue;
            const x = chunk.centerX - half + (c + 0.5) * cellSize;
            const z = chunk.centerZ + half - wallT * 0.5;
            wallTransform(wallList, x, wallH * 0.5, z, cellSize, wallH, wallT);
            physics.mazeWalls.push({ x1: x - cellSize * 0.5, z1: z, x2: x + cellSize * 0.5, z2: z, yMin: 0, yMax: wallH });
        }
        return last;
    }

    function planChunk(chunk) {
        if (chunk.key === spawnChunkKey) return { spawnDistrict: true, portals: null, roads: [], districtLandmark: null };
        const roadPlan = planRoads(chunk);
        return {
            portals: { ...roadPlan.portals },
            hub: { ...roadPlan.hub },
            roads: [...roadPlan.roads].sort(),
            weirdness: chunk.weirdness,
            districtLandmark: districtLandmarkFor(chunk),
        };
    }

    async function build(chunk) {
        if (chunk.key === spawnChunkKey) return { spawnDistrict: true, key: chunk.key };

        const rng = mulberry32(chunk.seed ^ (worldSeed >>> 0));
        const roadPlan = planRoads(chunk);
        const districtLandmarkSpec = districtLandmarkFor(chunk);
        const districtLandmarkCell = districtLandmarkSpec ? chooseDistrictLandmarkCell(roadPlan) : null;
        const root = new THREE.Group();
        root.name = `world-chunk:${chunk.key}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = chunk.key;
        root.userData.worldChunkOwnerId = chunk.ownerId ?? worldChunkOwnerId(worldSeed, chunk.x, chunk.z);
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'WorldChunkStreamer';
        root.userData.weirdness = chunk.weirdness;
        root.userData.roadPortals = { ...roadPlan.portals };
         
         
         
        root.visible = false;

        const transforms = {
            wallGroups: wallMats.map(() => []),
            slabs: [], steps: [], props: [], roads: [], windows: [], doors: [],
        };
        const physics = { mazeWalls: [], platforms: [], ramps: [], ceilings: [], props: [] };
        const entities = [];
        const ownerId = chunk.ownerId ?? worldChunkOwnerId(worldSeed, chunk.x, chunk.z);
        const cx0 = chunk.centerX;
        const cz0 = chunk.centerZ;
        const half = chunkSize * 0.5;
        const cellSize = chunkSize / microCells;
        const weird = chunk.weirdness.sampled;

        const ground = new THREE.Mesh(unitPlane, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.scale.set(chunkSize, chunkSize, 1);
        ground.position.set(cx0, -0.025, cz0);
        ground.receiveShadow = true;
        root.add(ground);

        for (const roadKey of roadPlan.roads) {
            const [c, r] = roadKey.split(',').map(Number);
            transforms.roads.push({
                x: cx0 - half + (c + 0.5) * cellSize,
                y: 0.002,
                z: cz0 - half + (r + 0.5) * cellSize,
                sx: cellSize * 1.015,
                sy: cellSize * 1.015,
                sz: 1,
                plane: true,
            });
        }

         
         
         
        addOwnedBoundaryBarriers(chunk, roadPlan, physics, transforms.wallGroups[0], cellSize);

        let buildings = 0;
        let plazas = 0;

        // District landmarks remain a sparse non-singular overlay, but ordinary
        // fabric no longer has a separate one-cell grammar. Reserve the landmark
        // cell, then partition every other solid cell through the same compound
        // algorithm used by authored spawn.
        if (districtLandmarkCell) {
            const cellCx = cx0 - half + (districtLandmarkCell.c + 0.5) * cellSize;
            const cellCz = cz0 - half + (districtLandmarkCell.r + 0.5) * cellSize;
            const landmark = buildDistrictLandmark({
                chunk,
                spec: districtLandmarkSpec,
                cell: districtLandmarkCell,
                physics,
                transforms,
                rng,
                cellCx,
                cellCz,
                cellSize,
            });
            entities.push({ ...landmark, kind: 'district-landmark' });
            buildings++;
            if (yieldControl) await yieldControl(`building landmark ${chunk.key}`, entities.length, microCells * microCells);
        }

        const solidKeys = new Set();
        for (let r = 0; r < microCells; r++) {
            for (let c = 0; c < microCells; c++) {
                const k = key(c, r);
                if (roadPlan.roads.has(k)) continue;
                if (districtLandmarkCell && k === districtLandmarkCell.key) continue;
                solidKeys.add(k);
            }
        }
        const compoundPartitionRng = mulberry32(hashString32(`${worldSeed}:kowloon-partition:${chunk.key}:${chunk.seed}`));
        const compoundPartition = partitionKowloonCompounds({
            cols: microCells,
            rows: microCells,
            solidKeys,
            chooseTargetSize: () => chooseKowloonCompoundTargetSize(compoundPartitionRng, weird),
            pick: candidates => candidates[Math.floor(compoundPartitionRng() * candidates.length) % candidates.length],
        });
        const siteIdOf = compoundPartition.siteIdOf;

        const sitePlans = compoundPartition.sites.map(site => {
            const signature = site.cells.map(cell => key(cell.col, cell.row)).join('|');
            const siteRng = mulberry32(hashString32(`${worldSeed}:kowloon-site-class:${chunk.key}:${signature}`));
            let realRoadFaces = 0;
            for (const cell of site.cells) {
                for (const dir of KOWLOON_DIRS) {
                    const nc = cell.col + dir.dc, nr = cell.row + dir.dr;
                    if (nc < 0 || nr < 0 || nc >= microCells || nr >= microCells || roadPlan.roads.has(key(nc, nr))) realRoadFaces++;
                }
            }
            const plazaChance = Math.max(0.06, 0.20 - weird * 0.07 - Math.max(0, site.cells.length - 2) * 0.025);
            const isPlaza = realRoadFaces === 0 || siteRng() < plazaChance;
            return { site, signature, realRoadFaces, isPlaza, roll: siteRng() };
        });
        if (sitePlans.length && sitePlans.every(plan => plan.isPlaza)) {
            sitePlans.sort((a, b) => b.site.cells.length - a.site.cells.length || a.signature.localeCompare(b.signature));
            sitePlans[0].isPlaza = false;
        }
        const openSiteIds = new Set(sitePlans.filter(plan => plan.isPlaza).map(plan => plan.site.id));
        const buildingSiteIds = new Set(sitePlans.filter(plan => !plan.isPlaza).map(plan => plan.site.id));

        // Real upper-level lateral circulation: selected second-floor portals
        // are planned before walls are emitted, so the wall openings and bridge
        // collision are one structural contract rather than a decorative add-on.
        const bridgePlans = [];
        const bridgePortalsBySite = new Map();
        const bridgeIntensity = kowloonIntensity(weird);
        const addBridgePortal = (siteId, portal) => {
            if (!bridgePortalsBySite.has(siteId)) bridgePortalsBySite.set(siteId, []);
            bridgePortalsBySite.get(siteId).push(portal);
        };
        const considerBridge = (roadC, roadR, a, b, axis) => {
            if (bridgePlans.length >= 4) return;
            if (!a || !b || a.siteId < 0 || b.siteId < 0 || a.siteId === b.siteId) return;
            if (!buildingSiteIds.has(a.siteId) || !buildingSiteIds.has(b.siteId)) return;
            const identity = `${chunk.key}:${roadC},${roadR}:${Math.min(a.siteId, b.siteId)}:${Math.max(a.siteId, b.siteId)}:${axis}`;
            const brng = mulberry32(hashString32(`${worldSeed}:kowloon-bridge:${identity}`));
            if (brng() >= bridgeIntensity.bridgeChance) return;
            const floor = 1;
            const plan = {
                id: worldEntityId(worldSeed, chunk.x, chunk.z, 'skybridge', identity),
                axis, floor, roadC, roadR,
                aSiteId: a.siteId, bSiteId: b.siteId,
                aModuleKey: a.moduleKey, bModuleKey: b.moduleKey,
                aDirKey: a.dirKey, bDirKey: b.dirKey,
            };
            bridgePlans.push(plan);
            addBridgePortal(a.siteId, { moduleKey: a.moduleKey, dirKey: a.dirKey, floor });
            addBridgePortal(b.siteId, { moduleKey: b.moduleKey, dirKey: b.dirKey, floor });
        };
        for (const roadKey of roadPlan.roads) {
            const [c, r] = roadKey.split(',').map(Number);
            if (c > 0 && c < microCells - 1) {
                const westId = siteIdOf[r]?.[c - 1] ?? -1;
                const eastId = siteIdOf[r]?.[c + 1] ?? -1;
                considerBridge(c, r,
                    { siteId: westId, moduleKey: key(c - 1, r), dirKey: 'E' },
                    { siteId: eastId, moduleKey: key(c + 1, r), dirKey: 'W' },
                    'x');
            }
            if (r > 0 && r < microCells - 1) {
                const northId = siteIdOf[r - 1]?.[c] ?? -1;
                const southId = siteIdOf[r + 1]?.[c] ?? -1;
                considerBridge(c, r,
                    { siteId: northId, moduleKey: key(c, r - 1), dirKey: 'S' },
                    { siteId: southId, moduleKey: key(c, r + 1), dirKey: 'N' },
                    'z');
            }
        }

        for (const plan of sitePlans) {
            const { site, signature } = plan;
            const siteEntityId = worldEntityId(worldSeed, chunk.x, chunk.z, plan.isPlaza ? 'plaza' : 'building', signature);
            if (plan.isPlaza) {
                const plazaRng = mulberry32(hashString32(`${worldSeed}:kowloon-plaza:${chunk.key}:${signature}`));
                let clutter = 0;
                let climbTiers = 0;
                let climbHeight = 0;
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (const cell of site.cells) {
                    const cellCx = cx0 - half + (cell.col + 0.5) * cellSize;
                    const cellCz = cz0 - half + (cell.row + 0.5) * cellSize;
                    minX = Math.min(minX, cellCx - cellSize * 0.5);
                    maxX = Math.max(maxX, cellCx + cellSize * 0.5);
                    minZ = Math.min(minZ, cellCz - cellSize * 0.5);
                    maxZ = Math.max(maxZ, cellCz + cellSize * 0.5);
                    const localClutter = 1 + Math.floor(plazaRng() * (2 + weird * 4));
                    clutter += localClutter;
                    for (let i = 0; i < localClutter; i++) {
                        const px = cellCx + (plazaRng() - 0.5) * cellSize * 0.58;
                        const pz = cellCz + (plazaRng() - 0.5) * cellSize * 0.58;
                        const h = 0.28 + plazaRng() * (0.62 + weird * 1.8);
                        const w = 0.45 + plazaRng() * (0.65 + weird * 0.45);
                        transforms.props.push({ x: px, y: h * 0.5, z: pz, sx: w, sy: h, sz: 0.45 + plazaRng() * 0.8 });
                        physics.props.push({ x: px, z: pz, radius: Math.max(0.3, w * 0.5), height: h });
                    }
                    if (plazaRng() < 0.42 + weird * 0.36) {
                        const pile = addClimbablePlazaPile({ physics, transforms, rng: plazaRng, cx: cellCx, cz: cellCz, cellSize, weird });
                        climbTiers = Math.max(climbTiers, pile.tiers);
                        climbHeight = Math.max(climbHeight, pile.topY);
                    }
                }
                plazas++;
                entities.push({
                    id: siteEntityId,
                    kind: 'plaza',
                    x: (minX + maxX) * 0.5,
                    z: (minZ + maxZ) * 0.5,
                    halfX: (maxX - minX) * 0.5,
                    halfZ: (maxZ - minZ) * 0.5,
                    compoundCells: site.cells.map(cell => ({ col: cell.col, row: cell.row })),
                    clutter,
                    climbTiers,
                    climbHeight,
                    kowloonServiceVoid: plan.realRoadFaces === 0,
                });
            } else {
                const materialIndex = hashString32(`${chunk.seed}:compound-facade:${signature}`) % wallMats.length;
                const structural = buildKowloonCompound({
                    chunk, site, siteIdOf, roadPlan, openSiteIds, bridgePortalsBySite,
                    physics, transforms, cx0, cz0, half, cellSize, materialIndex,
                });
                if (!structural) continue;
                entities.push({
                    id: siteEntityId,
                    kind: 'building',
                    siteId: site.id,
                    materialIndex,
                    ...structural,
                });
                buildings++;
            }
            if (yieldControl) await yieldControl(`building Kowloon compound ${chunk.key}`, entities.length, sitePlans.length + (districtLandmarkCell ? 1 : 0));
        }

        const compoundEntityBySite = new Map(entities.filter(entity => entity.kind === 'building').map(entity => [entity.siteId, entity]));
        let skybridges = 0;
        for (const bridge of bridgePlans) {
            const aEntity = compoundEntityBySite.get(bridge.aSiteId);
            const bEntity = compoundEntityBySite.get(bridge.bSiteId);
            const aModule = aEntity?.footprintModules?.find(module => module.key === bridge.aModuleKey);
            const bModule = bEntity?.footprintModules?.find(module => module.key === bridge.bModuleKey);
            if (!aModule || !bModule || aModule.floors <= bridge.floor || bModule.floors <= bridge.floor) continue;
            const y = bridge.floor * (aEntity.floorH || 3.15);
            const width = 1.05;
            const railH = 0.86;
            const railT = 0.10;
            if (bridge.axis === 'x') {
                const x0 = aModule.cx + aModule.halfX + 0.02;
                const x1 = bModule.cx - bModule.halfX - 0.02;
                const z = (aModule.cz + bModule.cz) * 0.5;
                if (x1 <= x0) continue;
                const span = x1 - x0;
                const x = (x0 + x1) * 0.5;
                transforms.slabs.push({ x, y: y - 0.06, z, sx: span, sy: 0.12, sz: width });
                addRectPlatform(physics.platforms, x, z, span, width, y, 'skybridge');
                for (const sideZ of [z - width * 0.5, z + width * 0.5]) {
                    wallTransform(transforms.wallGroups[0], x, y + railH * 0.5, sideZ, span, railH, railT);
                    physics.mazeWalls.push({ x1: x0, z1: sideZ, x2: x1, z2: sideZ, yMin: y, yMax: y + railH });
                }
            } else {
                const z0 = aModule.cz + aModule.halfZ + 0.02;
                const z1 = bModule.cz - bModule.halfZ - 0.02;
                const x = (aModule.cx + bModule.cx) * 0.5;
                if (z1 <= z0) continue;
                const span = z1 - z0;
                const z = (z0 + z1) * 0.5;
                transforms.slabs.push({ x, y: y - 0.06, z, sx: width, sy: 0.12, sz: span });
                addRectPlatform(physics.platforms, x, z, width, span, y, 'skybridge');
                for (const sideX of [x - width * 0.5, x + width * 0.5]) {
                    wallTransform(transforms.wallGroups[0], sideX, y + railH * 0.5, z, railT, railH, span);
                    physics.mazeWalls.push({ x1: sideX, z1: z0, x2: sideX, z2: z1, yMin: y, yMax: y + railH });
                }
            }
            aEntity.skybridges = (aEntity.skybridges || 0) + 1;
            bEntity.skybridges = (bEntity.skybridges || 0) + 1;
            entities.push({ id: bridge.id, kind: 'skybridge', ...bridge });
            skybridges++;
        }

        const roadMesh = makeInstanced(`chunk-roads:${chunk.key}`, unitPlane, roadMat, transforms.roads);
        if (roadMesh) root.add(roadMesh);
        for (let i = 0; i < transforms.wallGroups.length; i++) {
            const mesh = makeInstanced(`chunk-walls-${i}:${chunk.key}`, unitBox, wallMats[i], transforms.wallGroups[i]);
            if (mesh) root.add(mesh);
        }
        const slabMesh = makeInstanced(`chunk-slabs:${chunk.key}`, unitBox, slabMat, transforms.slabs);
        const stepMesh = makeInstanced(`chunk-steps:${chunk.key}`, unitBox, stepMat, transforms.steps);
        const propMesh = makeInstanced(`chunk-props:${chunk.key}`, unitBox, propMat, transforms.props);
        const windowMesh = makeInstanced(`chunk-windows:${chunk.key}`, unitBox, windowMat, transforms.windows);
        const doorMesh = makeInstanced(`chunk-doors:${chunk.key}`, unitBox, doorMat, transforms.doors);
        for (const mesh of [slabMesh, stepMesh, propMesh, windowMesh, doorMesh]) if (mesh) root.add(mesh);

        const payload = {
            formatVersion: WORLD_FORMAT_VERSION,
            ownerId,
            root,
            physics,
            entities,
            buildings,
            plazas,
            skybridges,
            portals: { ...roadPlan.portals },
            roadCells: roadPlan.roads.size,
            weirdness: chunk.weirdness,
            districtLandmark: districtLandmarkSpec
                ? entities.find(entity => entity.kind === 'district-landmark') ?? null
                : null,
            drawBatches: root.children.length,
            committed: false,
            disposed: false,
        };
        enrichment.initializePayload(chunk, payload);
        payload.drawBatches = root.children.length;
        freezeChunkRoot(root);
        return payload;
    }

    async function commit(chunk, payload) {
        if (!payload || payload.spawnDistrict || payload.committed) return payload;
         
         
         
         
        addStreamRoot(payload.root);
        payload.root.updateMatrixWorld(true);
        playerPhysics.registerOwnedWorld(payload.ownerId, payload.physics);
        committedOwners.add(payload.ownerId);
        payload.worldMatricesReady = true;
        payload.committed = true;
        return payload;
    }

    function setVisible(chunk, payload, visible) {
        if (!payload || payload.spawnDistrict || !payload.root) return false;
        payload.root.visible = !!visible;
        payload.visible = payload.root.visible;
        return payload.visible;
    }

    function verifyReady(chunk, payload, expectedVisible) {
        if (!payload || payload.spawnDistrict) return true;
        const root = payload.root;
        if (!payload.committed) throw new Error(`chunk ${chunk.key} READY verification failed: payload not committed`);
        if (!root || root.parent !== scene) throw new Error(`chunk ${chunk.key} READY verification failed: root is not attached directly to scene`);
        if (!root.userData?.worldChunkRoot) throw new Error(`chunk ${chunk.key} READY verification failed: worldChunkRoot identity missing`);
        if (root.userData.renderAuthority !== 'WorldChunkStreamer') throw new Error(`chunk ${chunk.key} READY verification failed: wrong render authority`);
        if (root.parent?.userData?.__perfChunkGroup || root.parent?.name?.startsWith?.('perf-chunk:')) {
            throw new Error(`chunk ${chunk.key} READY verification failed: legacy optimizer owns streamed root`);
        }
        if (!payload.worldMatricesReady) throw new Error(`chunk ${chunk.key} READY verification failed: world matrices not committed`);
        if (!committedOwners.has(payload.ownerId)) throw new Error(`chunk ${chunk.key} READY verification failed: physics owner is not active`);
        if (root.visible !== !!expectedVisible) throw new Error(`chunk ${chunk.key} READY verification failed: visibility does not match streamer authority`);
        return true;
    }

    async function unload(chunk, payload) {
        if (chunk.key === spawnChunkKey || payload?.spawnDistrict) return;
        if (payload?.committed) playerPhysics.unregisterOwnedWorld(payload.ownerId);
        if (payload?.ownerId) committedOwners.delete(payload.ownerId);
        const root = payload?.root;
        if (root?.parent) root.parent.remove(root);
        enrichment.disposePayload(payload);
        root?.clear?.();
        if (payload) payload.committed = false;
    }

    function disposeShared() {
        unitBox.dispose();
        unitPlane.dispose();
        roadMat.dispose();
        groundMat.dispose();
        slabMat.dispose();
        stepMat.dispose();
        propMat.dispose();
        doorMat.dispose();
        windowMat.dispose();
        for (const mat of wallMats) mat.dispose();
        enrichment.disposeShared();
    }

    const hasPendingRefinement = (_chunk, payload) => enrichment.hasPending(payload);
    const refine = (chunk, payload, budget) => enrichment.pump(chunk, payload, budget);

    return { build, commit, setVisible, verifyReady, unload, refine, hasPendingRefinement, planChunk, districtLandmarkFor, disposeShared };
}
