import { hashString32 } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId, worldEntityId } from './world-contract.js';
import { createInfiniteChunkEnrichment } from './world/infinite-chunk-enrichment.js';

 
 
 
 
 
 
 

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

    function buildBuilding({ physics, transforms, rng, enhancementRng = rng, entityId = '', cx, cz, halfX, halfZ, floors, doorSide, wallList }) {
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
        const structural = buildBuilding({
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
        const occupied = new Set();
        const cellOrder = [];
        for (let r = 0; r < microCells; r++) for (let c = 0; c < microCells; c++) cellOrder.push({ c, r, roll: rng() });
        cellOrder.sort((a, b) => a.roll - b.roll);

        for (const { c, r } of cellOrder) {
            const k = key(c, r);
            if (roadPlan.roads.has(k) || occupied.has(k)) continue;
            const doorCandidates = roadNeighborSides(c, r, roadPlan.roads);
            const cellCx = cx0 - half + (c + 0.5) * cellSize;
            const cellCz = cz0 - half + (r + 0.5) * cellSize;

            if (districtLandmarkCell && k === districtLandmarkCell.key) {
                occupied.add(k);
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
                continue;
            }

            const buildingChance = 0.74 - weird * 0.16;
            if (!doorCandidates.length || rng() > buildingChance) {
                plazas++;
                const clutter = doorCandidates.length ? 1 + Math.floor(rng() * (2 + weird * 4)) : Math.floor(rng() * (1 + weird * 3));
                const plazaId = worldEntityId(worldSeed, chunk.x, chunk.z, 'plaza', k);
                for (let i = 0; i < clutter; i++) {
                    const px = cellCx + (rng() - 0.5) * cellSize * 0.58;
                    const pz = cellCz + (rng() - 0.5) * cellSize * 0.58;
                    const h = 0.28 + rng() * (0.62 + weird * 1.8);
                    const w = 0.45 + rng() * (0.65 + weird * 0.45);
                    transforms.props.push({ x: px, y: h * 0.5, z: pz, sx: w, sy: h, sz: 0.45 + rng() * 0.8 });
                    physics.props.push({ x: px, z: pz, radius: Math.max(0.3, w * 0.5), height: h });
                }
                const climbPile = rng() < 0.38 + weird * 0.38
                    ? addClimbablePlazaPile({ physics, transforms, rng, cx: cellCx, cz: cellCz, cellSize, weird })
                    : null;
                entities.push({
                    id: plazaId, kind: 'plaza', c, r, x: cellCx, z: cellCz, clutter,
                    climbTiers: climbPile?.tiers ?? 0,
                    climbHeight: climbPile?.topY ?? 0,
                });
                if (yieldControl && (entities.length & 7) === 0) await yieldControl(`building chunk ${chunk.key}`, entities.length, microCells * microCells);
                continue;
            }

            occupied.add(k);
            const doorSide = doorCandidates[Math.floor(rng() * doorCandidates.length) % doorCandidates.length];
            const insetScaleX = 0.67 + rng() * (0.18 - weird * 0.04);
            const insetScaleZ = 0.67 + rng() * (0.18 - weird * 0.04);
            const halfX = cellSize * 0.5 * insetScaleX;
            const halfZ = cellSize * 0.5 * insetScaleZ;
            const jitter = cellSize * (0.035 + weird * 0.025);
            const bx = cellCx + (rng() - 0.5) * jitter;
            const bz = cellCz + (rng() - 0.5) * jitter;
            const baseFloors = 1 + Math.floor(rng() * 3);
            const weirdFloors = rng() < weird * 0.78 ? 1 + Math.floor(rng() * (1 + weird * 6)) : 0;
            const floors = Math.min(10, baseFloors + weirdFloors);
            const materialIndex = hashString32(`${chunk.seed}:facade:${c}:${r}`) % wallMats.length;

            const buildingId = worldEntityId(worldSeed, chunk.x, chunk.z, 'building', k);
            const structural = buildBuilding({
                physics, transforms, rng,
                enhancementRng: mulberry32(hashString32(`${buildingId}:structure-v2`)),
                entityId: buildingId,
                cx: bx, cz: bz, halfX, halfZ, floors, doorSide,
                wallList: transforms.wallGroups[materialIndex],
            });
            entities.push({ id: buildingId, kind: 'building', c, r, x: bx, z: bz, floors, doorSide, materialIndex, ...structural });
            buildings++;
            if (yieldControl && (entities.length & 7) === 0) await yieldControl(`building chunk ${chunk.key}`, entities.length, microCells * microCells);
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
