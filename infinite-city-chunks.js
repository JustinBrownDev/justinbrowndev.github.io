import { hashString32 } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId, worldEntityId } from './world-contract.js';

// Infinite procedural city substrate.
//
// Chunk 0,0 is the authored spawn district and is never rebuilt here. Every
// other coordinate is independently reproducible from (worldSeed, chunkX,
// chunkZ). Neighboring chunks share deterministic road-portal contracts at
// their common boundary, but everything inside the boundary is locally owned
// and disposable.

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
    chunkSize = 64,
    worldSeed = 0,
    spawnChunkKey = '0,0',
    microCells = 7,
    yieldControl = null,
} = {}) {
    if (!THREE || !scene || !playerPhysics) throw new Error('createInfiniteCityChunkFactory requires THREE, scene, playerPhysics');
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

    // Shared-edge road contract. The canonical edge key is identical from
    // either neighboring chunk, so generation order never affects where the
    // opening lands. One full micro-cell is the cross-boundary gate.
    function edgeLane(chunkX, chunkZ, side) {
        let edgeKey;
        if (side === 'north') edgeKey = `H:${chunkX}:${chunkZ}`;
        else if (side === 'south') edgeKey = `H:${chunkX}:${chunkZ + 1}`;
        else if (side === 'west') edgeKey = `V:${chunkX}:${chunkZ}`;
        else edgeKey = `V:${chunkX + 1}:${chunkZ}`;

        // The authored spawn district exposes four centered cardinal streets.
        // Force the four shared boundaries touching chunk 0,0 to the matching
        // center lane; all other edges remain hash-addressed and irregular.
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

        // A few deterministic local alleys/loops keep interiors from reducing
        // to four L-shaped spokes. Weirdness can increase this later without
        // changing the boundary contract or world format.
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

    function addFacadeDetails(transforms, rng, { cx, cz, halfX, halfZ, floorH, floors, doorSide }) {
        // Door is a visible panel inside the real collision opening.
        const doorH = 2.2, doorW = 1.35, inset = 0.018;
        if (doorSide === 'north' || doorSide === 'south') {
            const z = cz + (doorSide === 'north' ? -halfZ - inset : halfZ + inset);
            transforms.doors.push({ x: cx, y: doorH * 0.5, z, sx: doorW, sy: doorH, sz: 0.05 });
        } else {
            const x = cx + (doorSide === 'west' ? -halfX - inset : halfX + inset);
            transforms.doors.push({ x, y: doorH * 0.5, z: cz, sx: 0.05, sy: doorH, sz: doorW });
        }

        // Cheap instanced windows keep streamed districts legible as actual
        // buildings without introducing per-window materials or draw calls.
        for (let floor = 0; floor < floors; floor++) {
            const y = floor * floorH + floorH * 0.58;
            const n = rng() < 0.45 ? 1 : 2;
            for (let i = 0; i < n; i++) {
                const u = n === 1 ? 0 : (i === 0 ? -0.32 : 0.32);
                transforms.windows.push({ x: cx + u * halfX, y, z: cz - halfZ - 0.022, sx: Math.min(1.25, halfX * 0.42), sy: 0.72, sz: 0.04 });
                transforms.windows.push({ x: cx + u * halfX, y, z: cz + halfZ + 0.022, sx: Math.min(1.25, halfX * 0.42), sy: 0.72, sz: 0.04 });
            }
        }
    }

    function buildBuilding({ physics, transforms, rng, cx, cz, halfX, halfZ, floors, doorSide, wallList }) {
        const floorH = 3.15;
        const wallT = 0.16;
        const width = halfX * 2;
        const depth = halfZ * 2;
        const stairGapW = Math.min(2.7, width * 0.42);
        const stairGapD = Math.min(5.4, depth * 0.68);
        const stairCx = cx + (doorSide === 'west' ? width * 0.20 : doorSide === 'east' ? -width * 0.20 : (rng() - 0.5) * width * 0.22);
        const stairCz = cz + (doorSide === 'north' ? depth * 0.18 : doorSide === 'south' ? -depth * 0.18 : (rng() - 0.5) * depth * 0.22);
        const doorW = 1.65;

        for (let floor = 0; floor < floors; floor++) {
            const y0 = floor * floorH;
            const y1 = y0 + floorH;
            const wallY = y0 + floorH * 0.5;
            const gap = floor === 0 ? doorW : 0;

            const addHorizontalWall = (z, side) => {
                if (gap && doorSide === side) {
                    const seg = (width - gap) * 0.5;
                    wallTransform(wallList, cx - (gap + seg) * 0.5, wallY, z, seg, floorH, wallT);
                    wallTransform(wallList, cx + (gap + seg) * 0.5, wallY, z, seg, floorH, wallT);
                } else wallTransform(wallList, cx, wallY, z, width, floorH, wallT);
            };
            const addVerticalWall = (x, side) => {
                if (gap && doorSide === side) {
                    const seg = (depth - gap) * 0.5;
                    wallTransform(wallList, x, wallY, cz - (gap + seg) * 0.5, wallT, floorH, seg);
                    wallTransform(wallList, x, wallY, cz + (gap + seg) * 0.5, wallT, floorH, seg);
                } else wallTransform(wallList, x, wallY, cz, wallT, floorH, depth);
            };
            addHorizontalWall(cz - halfZ, 'north');
            addHorizontalWall(cz + halfZ, 'south');
            addVerticalWall(cx - halfX, 'west');
            addVerticalWall(cx + halfX, 'east');
            pushWallSegments(physics.mazeWalls, cx, cz, halfX, halfZ, y0, y1, floor === 0 ? doorSide : null, doorW);

            if (floor > 0) {
                addNotchedFloor(physics.platforms, cx, cz, width - wallT * 2, depth - wallT * 2, y0, stairCx, stairCz, stairGapW, stairGapD);
                addRenderedNotchedSlab(transforms, cx, cz, width - wallT * 2, depth - wallT * 2, y0, stairCx, stairCz, stairGapW, stairGapD);
            }

            // Every occupied floor has a real stair to the next support level;
            // the final flight reaches a NOTCHED roof instead of terminating at
            // an invisible ceiling.
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

        const roofY = floors * floorH;
        addNotchedFloor(physics.platforms, cx, cz, width - wallT * 2, depth - wallT * 2, roofY, stairCx, stairCz, stairGapW, stairGapD, 'roof');
        addRenderedNotchedSlab(transforms, cx, cz, width - wallT * 2, depth - wallT * 2, roofY, stairCx, stairCz, stairGapW, stairGapD);
        addFacadeDetails(transforms, rng, { cx, cz, halfX, halfZ, floorH, floors, doorSide });

        if (rng() < 0.58) {
            const px = cx + (doorSide === 'west' ? -halfX - 0.7 : doorSide === 'east' ? halfX + 0.7 : (rng() - 0.5) * width * 0.55);
            const pz = cz + (doorSide === 'north' ? -halfZ - 0.7 : doorSide === 'south' ? halfZ + 0.7 : (rng() - 0.5) * depth * 0.55);
            transforms.props.push({ x: px, y: 0.38, z: pz, sx: 0.75, sy: 0.76, sz: 0.75 });
            physics.props.push({ x: px, z: pz, radius: 0.52, height: 0.76 });
        }
    }

    function roadNeighborSides(c, r, roads) {
        const candidates = [];
        if (roads.has(key(c, r - 1))) candidates.push('north');
        if (roads.has(key(c, r + 1))) candidates.push('south');
        if (roads.has(key(c - 1, r))) candidates.push('west');
        if (roads.has(key(c + 1, r))) candidates.push('east');
        return candidates;
    }

    function addOwnedBoundaryBarriers(chunk, roadPlan, physics, wallList, cellSize) {
        const half = chunkSize * 0.5;
        const last = microCells - 1;
        const wallH = 1.55, wallT = 0.16;

        // Canonical ownership: each chunk owns only EAST and SOUTH edges.
        // Neighboring west/north edges therefore never double-render the same
        // barrier. The one road-portal cell remains open.
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
        if (chunk.key === spawnChunkKey) return { spawnDistrict: true, portals: null, roads: [] };
        const roadPlan = planRoads(chunk);
        return {
            portals: { ...roadPlan.portals },
            hub: { ...roadPlan.hub },
            roads: [...roadPlan.roads].sort(),
            weirdness: chunk.weirdness,
        };
    }

    async function build(chunk) {
        if (chunk.key === spawnChunkKey) return { spawnDistrict: true, key: chunk.key };

        const rng = mulberry32(chunk.seed ^ (worldSeed >>> 0));
        const roadPlan = planRoads(chunk);
        const root = new THREE.Group();
        root.name = `world-chunk:${chunk.key}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkKey = chunk.key;
        root.userData.worldChunkOwnerId = chunk.ownerId ?? worldChunkOwnerId(worldSeed, chunk.x, chunk.z);
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.weirdness = chunk.weirdness;
        root.userData.roadPortals = { ...roadPlan.portals };

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

        // One canonical low wall around non-road chunk seams turns the shared
        // portal layout into a real traversable contract instead of merely a
        // pavement texture. It also gives the infinite city a maze-like edge.
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
                entities.push({ id: plazaId, kind: 'plaza', c, r, x: cellCx, z: cellCz, clutter });
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
            buildBuilding({
                physics, transforms, rng,
                cx: bx, cz: bz, halfX, halfZ, floors, doorSide,
                wallList: transforms.wallGroups[materialIndex],
            });
            entities.push({ id: buildingId, kind: 'building', c, r, x: bx, z: bz, floors, doorSide, materialIndex });
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

        freezeChunkRoot(root);
        return {
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
            drawBatches: root.children.length,
            committed: false,
        };
    }

    async function commit(chunk, payload) {
        if (!payload || payload.spawnDistrict || payload.committed) return payload;
        scene.add(payload.root);
        playerPhysics.registerOwnedWorld(payload.ownerId, payload.physics);
        payload.committed = true;
        return payload;
    }

    async function unload(chunk, payload) {
        if (chunk.key === spawnChunkKey || payload?.spawnDistrict) return;
        if (payload?.committed) playerPhysics.unregisterOwnedWorld(payload.ownerId);
        const root = payload?.root;
        if (root?.parent) root.parent.remove(root);
        // All GPU geometries/materials are shared factory resources. Clearing
        // the root releases only this chunk's Object3D + instance-matrix data;
        // physics ownership is deactivated/compacted independently.
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
    }

    return { build, commit, unload, planChunk, disposeShared };
}
