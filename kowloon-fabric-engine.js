import { hashString32 } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId, worldEntityId } from './world-contract.js';
import { createKowloonFabricEnrichment } from './world/kowloon-fabric-enrichment.js';
import { createKowloonMazeTopology } from './world/kowloon-district-plan.js';
import {
    anyReservationIntersectsBox,
    createBoxCirculationReservation,
    createRampCirculationReservation,
    reservationCutForAxisSegment,
    reservationIntersectsBox,
} from './world/circulation-reservations.js';
import {
    connectorOpeningWidth,
    createBridgeConnector,
    createLandingConnector,
    createPortalConnector,
    createRampConnector,
    createStairConnector,
    registerSemanticConnector,
    semanticPortalForRect,
} from './world/semantic-connectors.js';
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
import {
    KOWLOON_BOUNDARY_BARRIER_HEIGHT,
    KOWLOON_BOUNDARY_BARRIER_THICKNESS,
    KOWLOON_EXTERIOR_WALL_THICKNESS,
    computeKowloonModuleRect,
    computeKowloonSlabRect,
    isKowloonSharedRoadCell,
    kowloonChunkBoundaryEdgeKind,
    kowloonStreetEncroachmentAllowed,
} from './world/kowloon-geometry-contract.js';

 
 
 
 
 
 
 

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

export function createKowloonFabricEngine({
    THREE,
    scene,
    playerPhysics,
    directSceneAdd = null,
    chunkSize = 64,
    worldSeed = 0,
    spawnChunkKey = '0,0',
    microCells = 9,
    landmarkSpacingChunks = 4,
    yieldControl = null,
} = {}) {
    if (!THREE || !scene || !playerPhysics) throw new Error('createKowloonFabricEngine requires THREE, scene, playerPhysics');
    const addStreamRoot = typeof directSceneAdd === 'function' ? directSceneAdd : scene.add.bind(scene);
    const enrichment = createKowloonFabricEnrichment({
        THREE,
        worldSeed,
        publishDetailPhysics(payload, kind, item) {
            if (!payload?.physics || !item) return false;
            if (!payload.committed) {
                payload.physics[kind]?.push?.(item);
                return true;
            }
            return playerPhysics.appendOwnedWorldItem?.(payload.ownerId, kind, item) ?? false;
        },
    });
    const committedOwners = new Set();
    let authoredOriginChunkPayload = null;
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

    function planRoads(chunk) {
        const rng = mulberry32(chunk.seed ^ hashString32('roads'));
        const last = microCells - 1;
        const portals = {
            north: edgeLane(chunk.x, chunk.z, 'north'),
            south: edgeLane(chunk.x, chunk.z, 'south'),
            west: edgeLane(chunk.x, chunk.z, 'west'),
            east: edgeLane(chunk.x, chunk.z, 'east'),
        };
        const topology = createKowloonMazeTopology({
            cols: microCells,
            rows: microCells,
            rng,
            loopChance: clamp(0.10 + chunk.weirdness.sampled * 0.34, 0.08, 0.52),
            anchors: [
                { c: portals.north, r: 0 },
                { c: portals.south, r: last },
                { c: 0, r: portals.west },
                { c: last, r: portals.east },
            ],
        });
        const roads = new Set();
        for (let r = 0; r < microCells; r++) {
            for (let c = 0; c < microCells; c++) if (topology.grid[r][c] === false) roads.add(key(c, r));
        }
        return { portals, hub: topology.hub, roads, topology };
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

    function addPartitionWall(wallList, physics, fp, y0, y1, spec, stairCx, stairCz, circulationReservation = null) {
        if (!spec) return 0;
        const wallH = y1 - y0;
        const wallY = y0 + wallH * 0.5;
        const wallT = 0.14;
        const legacyGap = 1.25;
        let segments = 0;

        const emit = (axis, fixed, a, b) => {
            if (b - a <= 0.04) return;
            const mid = (a + b) * 0.5;
            if (axis === 'x') {
                wallTransform(wallList, mid, wallY, fixed, b - a, wallH, wallT);
                physics.mazeWalls.push({ x1: a, z1: fixed, x2: b, z2: fixed, yMin: y0, yMax: y1, supportKind: 'partition' });
            } else {
                wallTransform(wallList, fixed, wallY, mid, wallT, wallH, b - a);
                physics.mazeWalls.push({ x1: fixed, z1: a, x2: fixed, z2: b, yMin: y0, yMax: y1, supportKind: 'partition' });
            }
            segments++;
        };

        const emitAroundCut = (axis, fixed, a0, a1, legacyCenter) => {
            if (circulationReservation) {
                const cut = reservationCutForAxisSegment(circulationReservation, {
                    axis, fixedCoord: fixed, from: a0, to: a1, yMin: y0, yMax: y1,
                }, wallT * 0.5);
                if (!cut) {
                    emit(axis, fixed, a0, a1);
                    return;
                }
                emit(axis, fixed, a0, cut.from);
                emit(axis, fixed, cut.to, a1);
                return;
            }

            // Non-spine modules retain the old seeded room-divider shape for this
            // landing. P5 only changes a divider when real circulation authority exists.
            const gapCenter = clamp(legacyCenter, a0 + legacyGap * 0.55, a1 - legacyGap * 0.55);
            emit(axis, fixed, a0, gapCenter - legacyGap * 0.5);
            emit(axis, fixed, gapCenter + legacyGap * 0.5, a1);
        };

        if (spec.axis === 'x') {
            const z = fp.cz + spec.offset * fp.halfZ;
            const x0 = fp.cx - fp.halfX + 0.18, x1 = fp.cx + fp.halfX - 0.18;
            emitAroundCut('x', z, x0, x1, stairCx);
        } else {
            const x = fp.cx + spec.offset * fp.halfX;
            const z0 = fp.cz - fp.halfZ + 0.18, z1 = fp.cz + fp.halfZ - 0.18;
            emitAroundCut('z', x, z0, z1, stairCz);
        }
        return segments;
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
            registerSemanticConnector(physics, createLandingConnector({
                id: `scaffold:${seed}:landing:${level}`,
                x, z,
                halfX: (horizontalFace ? landingWidth : landingDepth) * 0.5,
                halfZ: (horizontalFace ? landingDepth : landingWidth) * 0.5,
                y,
                source: 'exterior-scaffold',
                visualRole: 'fire-escape-landing',
                reservationKind: 'scaffold-landing',
                metadata: { level, side },
            }));
            landings++;
            if (level >= floors) continue;

            const direction = ((level + (seed & 1)) & 1) ? -1 : 1;
            const from = direction < 0 ? landingWidth * 0.38 : -landingWidth * 0.38;
            const to = -from;
            const axis = horizontalFace ? 'x' : 'z';
            const scaffoldRamp = {
                axis,
                from: (horizontalFace ? fp.cx : fp.cz) + from,
                to: (horizontalFace ? fp.cx : fp.cz) + to,
                fixedCoord: fixed,
                halfWidth: landingDepth * 0.34,
                y0: y,
                y1: y + floorH,
                supportKind: 'scaffold',
            };
            physics.ramps.push(scaffoldRamp);
            registerSemanticConnector(physics, createRampConnector({
                id: `scaffold:${seed}:ramp:${level}`,
                kind: 'fire-escape',
                axis: scaffoldRamp.axis,
                from: scaffoldRamp.from,
                to: scaffoldRamp.to,
                fixedCoord: scaffoldRamp.fixedCoord,
                halfWidth: scaffoldRamp.halfWidth,
                y0: scaffoldRamp.y0,
                y1: scaffoldRamp.y1,
                source: 'exterior-scaffold',
                visualRole: 'fire-escape-flight',
                reservationKind: 'scaffold-ramp',
                metadata: { level, side },
            }));
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

    function addCompoundSideWall({ physics, wallList, rect, floorH, floor, side, opening = 0 }) {
        const y0 = floor * floorH;
        const y1 = y0 + floorH;
        const wallY = (y0 + y1) * 0.5;
        const wallT = KOWLOON_EXTERIOR_WALL_THICKNESS;
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
                physics.mazeWalls.push({ x1: a, z1: fixed, x2: b, z2: fixed, yMin: y0, yMax: y1, thickness: wallT });
            } else {
                wallTransform(wallList, fixed, wallY, mid, wallT, floorH, b - a);
                physics.mazeWalls.push({ x1: fixed, z1: a, x2: fixed, z2: b, yMin: y0, yMax: y1, thickness: wallT });
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
            physics.mazeWalls.push({ x1: rect.cx - rect.halfX, z1: z, x2: rect.cx + rect.halfX, z2: z, yMin: roofY, yMax: roofY + h, thickness: t, supportKind: 'parapet' });
        } else {
            const x = rect.cx + (side === 'west' ? -rect.halfX : rect.halfX);
            wallTransform(wallList, x, roofY + h * 0.5, rect.cz, t, h, rect.halfZ * 2);
            physics.mazeWalls.push({ x1: x, z1: rect.cz - rect.halfZ, x2: x, z2: rect.cz + rect.halfZ, yMin: roofY, yMax: roofY + h, thickness: t, supportKind: 'parapet' });
        }
    }

    function buildKowloonCompound({
        chunk, site, siteIdOf, roadPlan, openSiteIds, bridgePortalsBySite, physics, transforms,
        cx0, cz0, half, cellSize, materialIndex, geometryAdapter = null,
        streetCellOverride = null, courtyardCellOverride = undefined, structureProfile = null,
    }) {
        const weird = chunk.weirdness.sampled;
        const intensity = kowloonIntensity(weird);
        const siteSignature = site.cells.map(cell => kowloonCellKey(cell.col, cell.row)).join('|');
        const siteSeed = hashString32(`${worldSeed}:kowloon-compound:${chunk.key}:${siteSignature}`);
        const rng = mulberry32(siteSeed);
        const topology = analyzeKowloonCompound(site, siteIdOf);
        const courtyard = courtyardCellOverride !== undefined
            ? courtyardCellOverride
            : (topology.courtyardCandidate
                ?? selectKowloonCourtyardCell(site, topology.degreeOf, topology.primary, { minCells: 5, degree: 3 }));
        const activeCells = site.cells.filter(cell => cell !== courtyard);
        if (!activeCells.length) return null;

        const isStreetCell = (col, row) => {
            if (streetCellOverride) return !!streetCellOverride(col, row);
            if (col < 0 || row < 0 || col >= microCells || row >= microCells) {
                return isKowloonSharedRoadCell(col, row, { microCells, portals: roadPlan.portals, roads: roadPlan.roads });
            }
            if (roadPlan.roads.has(kowloonCellKey(col, row))) return true;
            const neighborSiteId = siteIdOf[row]?.[col];
            return neighborSiteId >= 0 && openSiteIds.has(neighborSiteId);
        };
        const edgeKindsFor = cell => {
            const result = {};
            for (const dir of KOWLOON_DIRS) {
                const chunkBoundaryKind = streetCellOverride ? null : kowloonChunkBoundaryEdgeKind(cell, dir, {
                    microCells, portals: roadPlan.portals, roads: roadPlan.roads,
                });
                result[dir.key] = chunkBoundaryKind ?? classifyKowloonEdge({
                    siteIdOf, siteId: site.id, row: cell.row, col: cell.col,
                    dr: dir.dr, dc: dir.dc, isStreet: isStreetCell, courtyardCell: courtyard,
                });
            }
            return result;
        };

        const primaryKey = kowloonCellKey(topology.primary.col, topology.primary.row);

        // One seeded archetype system replaces the old authored warehouse/hero
        // split and applies it everywhere.  These are not separate builders; they
        // are parameter families consumed by this same compound engine.
        const archetypeRoll = rng();
        const archetype = structureProfile?.archetype || (site.cells.length >= 2 && archetypeRoll < 0.10 + weird * 0.18
            ? 'vertical-stack'
            : archetypeRoll < 0.22
                ? 'workshop-warehouse'
                : archetypeRoll < 0.52 + weird * 0.12
                    ? 'service-tenement'
                    : 'dense-tenement');
        let baseFloors;
        let verticalBurst = 0;
        if (archetype === 'workshop-warehouse') {
            baseFloors = 1 + (rng() < 0.42 ? 1 : 0);
        } else if (archetype === 'vertical-stack') {
            baseFloors = 4 + Math.floor(rng() * 3);
            verticalBurst = 1 + Math.floor(rng() * (2 + intensity.verticalVariance));
        } else {
            baseFloors = 2 + Math.floor(rng() * 3);
            verticalBurst = rng() < 0.38 + weird * 0.48
                ? 1 + Math.floor(rng() * (2 + intensity.verticalVariance))
                : 0;
        }
        let primaryFloors = Math.min(12, baseFloors + verticalBurst + (site.cells.length >= 4 && archetype !== 'workshop-warehouse' ? 1 : 0));
        if (Number.isFinite(structureProfile?.primaryFloors)) primaryFloors = Math.max(1, Math.min(12, Math.floor(structureProfile.primaryFloors)));
        const floorH = Number.isFinite(structureProfile?.floorHeight)
            ? Math.max(2.4, Math.min(5.0, structureProfile.floorHeight))
            : archetype === 'workshop-warehouse' ? 3.55 : 3.15;
        const modulePlans = [];

        for (const cell of activeCells) {
            const key = kowloonCellKey(cell.col, cell.row);
            const edgeKinds = edgeKindsFor(cell);
            let rect;
            if (geometryAdapter?.rectForCell) {
                rect = geometryAdapter.rectForCell(cell, edgeKinds, rng);
            } else {
                const cellCx = cx0 - half + (cell.col + 0.5) * cellSize;
                const cellCz = cz0 - half + (cell.row + 0.5) * cellSize;
                // Buildings deliberately trespass slightly into the nominal road cell.
                // The topology centerline remains untouched, but opposing facades read
                // as a cramped alley instead of a suburban setback.
                const streetSetback = cellSize * (-0.14 + rng() * 0.07);
                const partySetback = cellSize * (0.010 + rng() * 0.018);
                const dirByKey = new Map(KOWLOON_DIRS.map(dir => [dir.key, dir]));
                rect = computeKowloonModuleRect({
                    cellCx, cellCz, halfX: cellSize * 0.5, halfZ: cellSize * 0.5, edgeKinds,
                    streetSetback, partySetback,
                    allowStreetEncroachment: sideKey => kowloonStreetEncroachmentAllowed(cell, dirByKey.get(sideKey), isStreetCell),
                });
            }
            let floors;
            if (key === primaryKey) floors = primaryFloors;
            else if (archetype === 'workshop-warehouse') {
                floors = Math.max(1, primaryFloors - (rng() < 0.68 ? 0 : 1));
            } else if (archetype === 'vertical-stack') {
                const drop = 1 + Math.floor(rng() * Math.max(2, 2 + intensity.verticalVariance));
                floors = Math.max(2, primaryFloors - drop);
            } else {
                const drop = Math.floor(rng() * (2 + intensity.verticalVariance));
                floors = Math.max(1, primaryFloors - drop);
                if (rng() < 0.16 + weird * 0.16) floors = Math.max(1, floors - 1);
            }
            const forcedFloors = structureProfile?.floorCountByCell?.[key]
                ?? structureProfile?.floorCountForCell?.(cell, { key, topology, primaryFloors, archetype });
            if (Number.isFinite(forcedFloors)) floors = Math.max(1, Math.min(12, Math.floor(forcedFloors)));
            modulePlans.push({ key, cell, edgeKinds, floors, rect });
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
        const requestedEntrances = Array.isArray(structureProfile?.entrances) ? structureProfile.entrances : [];
        const forcedEntranceFaces = [];
        for (const entrance of requestedEntrances) {
            const key = kowloonCellKey(entrance.col, entrance.row);
            const face = streetFaces.find(candidate => candidate.module.key === key
                && candidate.dir.dc === entrance.dc && candidate.dir.dr === entrance.dr && !candidate.courtyard);
            if (face && !forcedEntranceFaces.includes(face)) forcedEntranceFaces.push(face);
        }
        const doorFace = forcedEntranceFaces[0]
            ?? (doorFacePool.length ? doorFacePool[Math.floor(rng() * doorFacePool.length) % doorFacePool.length] : null);
        const entranceFaces = forcedEntranceFaces.length ? forcedEntranceFaces : (doorFace ? [doorFace] : []);
        const entranceConnectorByKey = new Map();
        for (let i = 0; i < entranceFaces.length; i++) {
            const face = entranceFaces[i];
            const openingKey = `${face.module.key}:${face.dir.key}:0`;
            const portal = semanticPortalForRect({
                id: `${chunk.key}:${siteSignature}:${face.module.key}:entrance:${i}:portal`,
                rect: face.module.rect,
                side: face.dir.side,
                floor: 0,
                floorH,
                width: 1.55,
                height: 2.2,
                depth: 1.2,
                source: 'compound-entrance',
                fromSpaceId: `${chunk.key}:${siteSignature}:${face.module.key}:floor:0`,
                toSpaceId: `${chunk.key}:street`,
                metadata: { moduleKey: face.module.key, dirKey: face.dir.key, floor: 0 },
            });
            const connector = createPortalConnector({
                id: `${chunk.key}:${siteSignature}:${face.module.key}:entrance:${i}`,
                portal,
                kind: 'door',
                source: 'compound-entrance',
                visualRole: 'street-entrance',
                metadata: { moduleKey: face.module.key, dirKey: face.dir.key, floor: 0 },
            });
            registerSemanticConnector(physics, connector);
            entranceConnectorByKey.set(openingKey, connector);
        }
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

        // Upper rooms literally accrete beyond the original footprint.  Their
        // door openings are reserved before wall emission, so the cantilever is
        // traversable interior space rather than a cosmetic box glued outside.
        const cantileverPlans = [];
        const cantileverOpeningKeys = new Set();
        const cantileverFacePool = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        if (cantileverFacePool.length && rng() < intensity.overhangChance) {
            const count = 1 + (rng() < weird * 0.38 ? 1 : 0);
            for (let i = 0; i < count; i++) {
                const face = cantileverFacePool[Math.floor(rng() * cantileverFacePool.length) % cantileverFacePool.length];
                const level = 1 + Math.floor(rng() * Math.max(1, face.module.floors - 1));
                const horizontal = face.dir.side === 'north' || face.dir.side === 'south';
                const depth = 0.72 + rng() * (0.72 + weird * 0.38);
                const alongHalf = horizontal ? face.module.rect.halfX : face.module.rect.halfZ;
                const width = Math.min(alongHalf * 1.55, 2.4 + rng() * 2.2);
                const roomH = Math.min(floorH * 0.82, 2.55 + rng() * 0.36);
                cantileverPlans.push({ face, level, horizontal, depth, width, roomH });
                cantileverOpeningKeys.add(`${face.module.key}:${face.dir.key}:${level}`);
            }
        }

        let partitionSegments = 0;
        let exposedSetbackFaces = 0;
        let internalOpenFaces = 0;
        let partyFaces = 0;
        const facades = [];
        const circulationStartCount = physics.circulationReservations.length;
        const circulationByModule = new Map();

        for (const module of modulePlans) {
            const wallList = transforms.wallGroups[materialIndex];
            const stairGapW = Math.min(2.65, module.rect.halfX * 2 * 0.42);
            const stairGapD = Math.min(4.9, module.rect.halfZ * 2 * 0.64);
            const stairCx = module.rect.cx + (rng() - 0.5) * module.rect.halfX * 0.26;
            const stairCz = module.rect.cz + (rng() - 0.5) * module.rect.halfZ * 0.26;
            const isSpine = module === primaryModule;
            const stairRunAxis = stairGapD >= stairGapW ? 'z' : 'x';
            const stairFrom = stairRunAxis === 'z' ? stairCz - stairGapD * 0.42 : stairCx - stairGapW * 0.42;
            const stairTo = stairRunAxis === 'z' ? stairCz + stairGapD * 0.42 : stairCx + stairGapW * 0.42;
            const stairHalfWidth = Math.min(stairGapW, stairGapD) * 0.35;
            // Match the exact arithmetic used by the final stair flight arrival.
            // JS can represent floors * floorH and (floors - 1) * floorH + floorH
            // a few ulps apart, which breaks the circulation contract's exact roof key.
            const moduleRoofY = module.floors > 0 ? (module.floors - 1) * floorH + floorH : 0;
            const stairConnector = isSpine ? createStairConnector({
                id: `${chunk.key}:${siteSignature}:${module.key}:stair`,
                x: stairCx, z: stairCz,
                openingWidth: stairGapW,
                openingDepth: stairGapD,
                baseY: 0,
                roofY: moduleRoofY,
                exitHeadroom: 2.1,
                rampAxis: stairRunAxis,
                rampFrom: stairFrom,
                rampTo: stairTo,
                rampHalfWidth: stairHalfWidth,
                source: 'compound-stair',
                visualRole: 'vertical-spine',
                fromSpaceId: `${chunk.key}:${siteSignature}:${module.key}:ground`,
                toSpaceId: `${chunk.key}:${siteSignature}:${module.key}:roof`,
                metadata: { moduleKey: module.key, floors: module.floors, floorH },
            }) : null;
            const stairReservation = stairConnector?.primaryReservation ?? null;
            if (stairConnector) {
                registerSemanticConnector(physics, stairConnector);
                circulationByModule.set(module.key, [stairReservation]);
            } else {
                circulationByModule.set(module.key, []);
            }

            // CIRCULATION SANITY HANDOFF: topology reserves the whole player-sized
            // stair volume before slabs, partitions, or optional weirdness publish.
            // Render and collision are both authored around this same reservation.
            // Optional geometry loses conflicts; structural access never does.

            // Preserve the authored curb/skirt massing universally. It is a visual
            // foundation lip, emitted through the same slab batch as every other
            // compound surface rather than a spawn-only scene mesh.
            transforms.slabs.push({
                x: module.rect.cx, y: 0.055, z: module.rect.cz,
                sx: module.rect.halfX * 2 + 0.12, sy: 0.11, sz: module.rect.halfZ * 2 + 0.12,
            });

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
                    else if (cantileverOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = 1.12;
                    else if (serviceCageOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = 1.08;
                    else if (entranceConnectorByKey.has(`${module.key}:${dir.key}:${floor}`)) {
                        opening = connectorOpeningWidth(entranceConnectorByKey.get(`${module.key}:${dir.key}:${floor}`), 1.55);
                    }
                    else if (floor === 0 && kind === 'courtyard' && rng() < 0.44) opening = 1.18;
                    addCompoundSideWall({ physics, wallList, rect: module.rect, floorH, floor, side: dir.side, opening });
                    if (kind === 'street' || kind === 'courtyard') facades.push({
                        moduleKey: module.key, side: dir.side, exposure: kind, x: module.rect.cx, z: module.rect.cz,
                        halfX: module.rect.halfX, halfZ: module.rect.halfZ,
                        yMin: y0, yMax: y1,
                    });
                }

                if (floor > 0) {
                    const slabRect = computeKowloonSlabRect(module, moduleByKey, floor);
                    if (isSpine) {
                        addNotchedFloor(physics.platforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, stairReservation.x, stairReservation.z, stairReservation.openingWidth, stairReservation.openingDepth);
                        addRenderedNotchedSlab(transforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, stairReservation.x, stairReservation.z, stairReservation.openingWidth, stairReservation.openingDepth);
                    } else {
                        addRectPlatform(physics.platforms, slabRect.cx, slabRect.cz, slabRect.width, slabRect.depth, y0, 'floor');
                        transforms.slabs.push({ x: slabRect.cx, y: y0 - 0.06, z: slabRect.cz,
                            sx: slabRect.width, sy: 0.12, sz: slabRect.depth });
                    }
                }

                const partitionRng = mulberry32(hashString32(`${siteSeed}:${module.key}:partition:${floor}`));
                const partitionChance = archetype === 'workshop-warehouse'
                    ? (floor === 0 ? 0.28 : 0.18)
                    : archetype === 'vertical-stack'
                        ? (floor === 0 ? 0.78 : 0.66)
                        : (floor === 0 ? 0.72 : 0.52);
                if (module.rect.halfX > 1.55 && module.rect.halfZ > 1.55 && partitionRng() < partitionChance) {
                    const spec = { axis: partitionRng() < 0.5 ? 'x' : 'z', offset: (partitionRng() - 0.5) * 0.42 };
                    partitionSegments += addPartitionWall(wallList, physics, module.rect, y0, y1, spec, stairCx, stairCz, stairReservation);
                }

                if (isSpine && floor < module.floors) {
                    physics.ramps.push({
                        axis: stairRunAxis, from: stairFrom, to: stairTo,
                        fixedCoord: stairRunAxis === 'z' ? stairCx : stairCz,
                        halfWidth: stairHalfWidth,
                        y0, y1, supportKind: 'compound-stair',
                    });
                    const steps = 12;
                    for (let i = 0; i < steps; i++) {
                        const t = (i + 0.5) / steps;
                        const along = stairFrom + (stairTo - stairFrom) * t;
                        const stepY = y0 + floorH * (i + 1) / steps - 0.08;
                        transforms.steps.push(stairRunAxis === 'z'
                            ? { x: stairCx, y: stepY, z: along, sx: stairGapW * 0.62, sy: 0.16, sz: Math.abs(stairTo - stairFrom) / steps * 1.06 }
                            : { x: along, y: stepY, z: stairCz, sx: Math.abs(stairTo - stairFrom) / steps * 1.06, sy: 0.16, sz: stairGapD * 0.62 });
                    }
                }
            }

            const roofY = moduleRoofY;
            const roofRect = computeKowloonSlabRect(module, moduleByKey, module.floors, { roof: true });
            if (isSpine) {
                // The final flight reaches the roof, so the roof must obey the exact
                // same shaft reservation as every intermediate floor. A solid cap
                // here used to turn a valid stair into a procedural dead end.
                addNotchedFloor(physics.platforms, roofRect.cx, roofRect.cz,
                    roofRect.width, roofRect.depth,
                    roofY, stairReservation.x, stairReservation.z, stairReservation.openingWidth, stairReservation.openingDepth, 'roof');
                addRenderedNotchedSlab(transforms, roofRect.cx, roofRect.cz,
                    roofRect.width, roofRect.depth,
                    roofY, stairReservation.x, stairReservation.z, stairReservation.openingWidth, stairReservation.openingDepth);
            } else {
                addRectPlatform(physics.platforms, roofRect.cx, roofRect.cz, roofRect.width, roofRect.depth, roofY, 'roof');
                transforms.slabs.push({ x: roofRect.cx, y: roofY - 0.06, z: roofRect.cz,
                    sx: roofRect.width, sy: 0.12, sz: roofRect.depth });
            }
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
        for (const entranceFace of entranceFaces) {
            const rect = entranceFace.module.rect;
            const side = entranceFace.dir.side;
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

        let cantileverRooms = 0;
        for (const plan of cantileverPlans) {
            const { face, level, horizontal, depth, width, roomH } = plan;
            const baseY = level * floorH;
            const rect = face.module.rect;
            const side = face.dir.side;
            const x = horizontal ? rect.cx : rect.cx + (side === 'west' ? -rect.halfX - depth * 0.5 : rect.halfX + depth * 0.5);
            const z = horizontal ? rect.cz + (side === 'north' ? -rect.halfZ - depth * 0.5 : rect.halfZ + depth * 0.5) : rect.cz;
            const sx = horizontal ? width : depth;
            const sz = horizontal ? depth : width;

            transforms.slabs.push({ x, y: baseY - 0.06, z, sx, sy: 0.12, sz });
            addRectPlatform(physics.platforms, x, z, sx, sz, baseY, 'cantilever-room');
            transforms.slabs.push({ x, y: baseY + roomH - 0.06, z, sx, sy: 0.12, sz });
            addRectPlatform(physics.platforms, x, z, sx, sz, baseY + roomH, 'cantilever-roof');

            const wallList = transforms.wallGroups[materialIndex];
            const t = 0.12;
            if (horizontal) {
                const outerZ = z + (side === 'north' ? -depth * 0.5 : depth * 0.5);
                wallTransform(wallList, x, baseY + roomH * 0.5, outerZ, sx, roomH, t);
                physics.mazeWalls.push({ x1: x - sx * 0.5, z1: outerZ, x2: x + sx * 0.5, z2: outerZ, yMin: baseY, yMax: baseY + roomH });
                for (const sideX of [x - sx * 0.5, x + sx * 0.5]) {
                    wallTransform(wallList, sideX, baseY + roomH * 0.5, z, t, roomH, sz);
                    physics.mazeWalls.push({ x1: sideX, z1: z - sz * 0.5, x2: sideX, z2: z + sz * 0.5, yMin: baseY, yMax: baseY + roomH });
                }
                transforms.windows.push({ x, y: baseY + roomH * 0.56, z: outerZ + (side === 'north' ? -0.02 : 0.02), sx: Math.min(1.35, sx * 0.44), sy: Math.min(0.8, roomH * 0.34), sz: 0.04 });
            } else {
                const outerX = x + (side === 'west' ? -depth * 0.5 : depth * 0.5);
                wallTransform(wallList, outerX, baseY + roomH * 0.5, z, t, roomH, sz);
                physics.mazeWalls.push({ x1: outerX, z1: z - sz * 0.5, x2: outerX, z2: z + sz * 0.5, yMin: baseY, yMax: baseY + roomH });
                for (const sideZ of [z - sz * 0.5, z + sz * 0.5]) {
                    wallTransform(wallList, x, baseY + roomH * 0.5, sideZ, sx, roomH, t);
                    physics.mazeWalls.push({ x1: x - sx * 0.5, z1: sideZ, x2: x + sx * 0.5, z2: sideZ, yMin: baseY, yMax: baseY + roomH });
                }
                transforms.windows.push({ x: outerX + (side === 'west' ? -0.02 : 0.02), y: baseY + roomH * 0.56, z, sx: 0.04, sy: Math.min(0.8, roomH * 0.34), sz: Math.min(1.35, sz * 0.44) });
            }
            cantileverRooms++;
        }

        // Capabilities carried forward from the old authored ordinary builder,
        // now implemented once for BOTH spawn fabric and infinity.  These are
        // structural/navigation features rather than a spawn-only decoration pass.
        let mezzanines = 0;
        let interiorClutter = 0;
        let serviceCores = 0;
        let rooftopMechanical = 0;
        let roofCrowns = 0;
        let roofTopper = 'none';
        for (const module of modulePlans) {
            const featureRng = mulberry32(hashString32(`${siteSeed}:${module.key}:shared-features`));
            const rect = module.rect;

            // Partial intermediate floor plus a physical access ramp.  This carries
            // the old mezzanine idea into the common fabric instead of preserving a
            // separate authored-only implementation.
            if (!structureProfile?.suppressMezzanines && rect.halfX > 1.75 && rect.halfZ > 1.75 && featureRng() < 0.30 + weird * 0.18) {
                const y = floorH * (0.46 + featureRng() * 0.12);
                const axis = featureRng() < 0.5 ? 'x' : 'z';
                const side = featureRng() < 0.5 ? -1 : 1;
                const sx = axis === 'x' ? rect.halfX * 0.88 : rect.halfX * 1.55;
                const sz = axis === 'z' ? rect.halfZ * 0.88 : rect.halfZ * 1.55;
                const mx = rect.cx + (axis === 'x' ? side * rect.halfX * 0.48 : 0);
                const mz = rect.cz + (axis === 'z' ? side * rect.halfZ * 0.48 : 0);

                const rampWidth = Math.max(0.72, Math.min(1.15, axis === 'x' ? sz * 0.48 : sx * 0.48));
                const run = Math.max(1.15, Math.min(2.4, axis === 'x' ? rect.halfX * 0.82 : rect.halfZ * 0.82));
                const from = axis === 'x' ? rect.cx - side * run * 0.55 : rect.cz - side * run * 0.55;
                const to = axis === 'x' ? rect.cx + side * run * 0.45 : rect.cz + side * run * 0.45;
                const fixedCoord = axis === 'x' ? mz : mx;
                const mezzanineRamp = { axis, from, to, fixedCoord, halfWidth: rampWidth * 0.5, y0: 0, y1: y, supportKind: 'mezzanine-stair' };
                const mezzanineConnector = createRampConnector({
                    id: `${chunk.key}:${siteSignature}:${module.key}:mezzanine:${mezzanines}`,
                    kind: 'mezzanine-ramp',
                    axis: mezzanineRamp.axis,
                    from: mezzanineRamp.from,
                    to: mezzanineRamp.to,
                    fixedCoord: mezzanineRamp.fixedCoord,
                    halfWidth: mezzanineRamp.halfWidth,
                    y0: mezzanineRamp.y0,
                    y1: mezzanineRamp.y1,
                    source: 'mezzanine-stair',
                    visualRole: 'mezzanine-access',
                    reservationKind: 'mezzanine-ramp',
                    metadata: { moduleKey: module.key, index: mezzanines },
                });
                const mezzanineReservation = mezzanineConnector.primaryReservation;
                const moduleReservations = circulationByModule.get(module.key);
                const blocksExistingCirculation = anyReservationIntersectsBox(moduleReservations, {
                    x: mx, z: mz, sx, sz, yMin: y - 0.12, yMax: y + 0.12,
                }) || moduleReservations.some(existing => reservationIntersectsBox(existing, mezzanineReservation));
                if (!blocksExistingCirculation) {
                    transforms.slabs.push({ x: mx, y: y - 0.06, z: mz, sx, sy: 0.12, sz });
                    addRectPlatform(physics.platforms, mx, mz, sx, sz, y, 'mezzanine');
                    physics.ramps.push(mezzanineRamp);
                    registerSemanticConnector(physics, mezzanineConnector);
                    moduleReservations.push(mezzanineReservation);
                    const stepCount = 7;
                    for (let i = 0; i < stepCount; i++) {
                        const t = (i + 0.5) / stepCount;
                        const along = from + (to - from) * t;
                        const stepY = y * (i + 1) / stepCount - 0.055;
                        transforms.steps.push(axis === 'x'
                            ? { x: along, y: stepY, z: fixedCoord, sx: Math.abs(to - from) / stepCount * 1.06, sy: 0.11, sz: rampWidth }
                            : { x: fixedCoord, y: stepY, z: along, sx: rampWidth, sy: 0.11, sz: Math.abs(to - from) / stepCount * 1.06 });
                    }
                    mezzanines++;
                }
            }

            // The old interior shelf/desk/chair/junk hooks become deterministic
            // common clutter masses.  Rich semantic models remain an enrichment
            // concern, but the navigable obstruction/climb language is universal.
            if (!structureProfile?.suppressInteriorClutter) {
                const clutterCount = 1 + Math.floor(featureRng() * (2 + weird * 2));
                for (let i = 0; i < clutterCount; i++) {
                    if (featureRng() > 0.58 + weird * 0.20) continue;
                    const w = 0.42 + featureRng() * 0.72;
                    const d = 0.38 + featureRng() * 0.78;
                    const h = 0.45 + featureRng() * 1.05;
                    const x = rect.cx + (featureRng() - 0.5) * Math.max(0.2, rect.halfX * 1.25 - w);
                    const z = rect.cz + (featureRng() - 0.5) * Math.max(0.2, rect.halfZ * 1.25 - d);
                    if (anyReservationIntersectsBox(circulationByModule.get(module.key), { x, z, sx: w, sz: d, yMin: 0, yMax: h })) continue;
                    transforms.props.push({ x, y: h * 0.5, z, sx: w, sy: h, sz: d });
                    physics.props.push({ x, z, radius: Math.max(0.26, Math.min(w, d) * 0.42), yMin: 0, height: h, supportKind: 'interior-clutter' });
                    interiorClutter++;
                }
            }
        }

        // Shared vertical service core / rooftop mechanical accretion / crown.
        // This absorbs three conspicuous silhouette features from the old ordinary
        // authored builder into the one fabric engine.
        if (primaryModule) {
            const featureRng = mulberry32(hashString32(`${siteSeed}:primary-service-growth`));
            const rect = primaryModule.rect;
            const roofY = primaryModule.floors * floorH;
            if (rect.halfX > 1.8 && rect.halfZ > 1.8 && featureRng() < 0.34 + weird * 0.18) {
                const w = Math.min(1.25, rect.halfX * 0.45);
                const d = Math.min(1.25, rect.halfZ * 0.45);
                const x = rect.cx + rect.halfX * (featureRng() < 0.5 ? -0.46 : 0.46);
                const z = rect.cz + rect.halfZ * (featureRng() < 0.5 ? -0.46 : 0.46);
                if (!anyReservationIntersectsBox(circulationByModule.get(primaryModule.key), { x, z, sx: w, sz: d, yMin: 0, yMax: roofY })) {
                    transforms.props.push({ x, y: roofY * 0.5, z, sx: w, sy: roofY, sz: d });
                    physics.props.push({ x, z, radius: Math.max(0.32, Math.min(w, d) * 0.43), yMin: 0, height: roofY, supportKind: 'service-core' });
                    serviceCores++;
                }
            }
            let crownBaseY = roofY;
            if (featureRng() < 0.52 + weird * 0.22) {
                const w = Math.min(rect.halfX * 0.92, 2.8 + featureRng() * 1.6);
                const d = Math.min(rect.halfZ * 0.92, 2.6 + featureRng() * 1.5);
                const h = 1.35 + featureRng() * 1.45;
                const x = rect.cx + (featureRng() - 0.5) * Math.max(0, rect.halfX - w * 0.6);
                const z = rect.cz + (featureRng() - 0.5) * Math.max(0, rect.halfZ - d * 0.6);
                if (!anyReservationIntersectsBox(circulationByModule.get(primaryModule.key), { x, z, sx: w, sz: d, yMin: roofY, yMax: roofY + h })) {
                    transforms.props.push({ x, y: roofY + h * 0.5, z, sx: w, sy: h, sz: d });
                    physics.props.push({ x, z, radius: Math.max(0.45, Math.min(w, d) * 0.42), yMin: roofY, height: roofY + h, supportKind: 'rooftop-mechanical' });
                    crownBaseY = roofY + h;
                    rooftopMechanical++;
                }
            }
            if (featureRng() < 0.40 + weird * 0.30) {
                roofTopper = featureRng() < 0.44 ? 'dome' : 'spire';
                if (roofTopper === 'spire') {
                    const h = 1.8 + featureRng() * 4.2;
                    const w = 0.12 + featureRng() * 0.16;
                    if (!anyReservationIntersectsBox(circulationByModule.get(primaryModule.key), {
                        x: rect.cx, z: rect.cz, sx: w, sz: w, yMin: crownBaseY, yMax: crownBaseY + h,
                    })) {
                        transforms.props.push({ x: rect.cx, y: crownBaseY + h * 0.5, z: rect.cz, sx: w, sy: h, sz: w });
                    } else {
                        roofTopper = 'none';
                    }
                }
                if (roofTopper !== 'none') roofCrowns++;
            }
        }

        if (courtyard) {
            const metric = geometryAdapter?.metricForCell?.(courtyard) ?? {
                x: cx0 - half + (courtyard.col + 0.5) * cellSize,
                z: cz0 - half + (courtyard.row + 0.5) * cellSize,
                cellSize,
            };
            const pile = addClimbablePlazaPile({ physics, transforms, rng, cx: metric.x, cz: metric.z, cellSize: metric.cellSize, weird });
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
            archetype,
            semanticSiteKey: siteSignature,
            semanticChunkKey: chunk.key,
            doorSide: doorFace?.dir.side ?? scaffoldSide ?? 'north',
            entranceFaces: entranceFaces.map(face => ({ moduleKey: face.module.key, side: face.dir.side, dirKey: face.dir.key })),
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
            cantileverRooms,
            mezzanines,
            interiorClutter,
            serviceCores,
            rooftopMechanical,
            roofCrowns,
            roofTopper,
            circulationReservationCount: physics.circulationReservations.length - circulationStartCount,
            singularRecipe: structureProfile?.singularRecipe ?? null,
            suppressInteriorEnrichment: !!structureProfile?.suppressInteriorClutter,
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

    function semanticSpaceIdForEntity(entity, moduleKey, floor) {
        if (!entity?.semanticChunkKey || !entity?.semanticSiteKey || !moduleKey) return null;
        return `${entity.semanticChunkKey}:${entity.semanticSiteKey}:${moduleKey}:floor:${floor}`;
    }

    function emitSkybridge({ bridge, aEntity, bEntity, physics, transforms }) {
        const aModule = aEntity?.footprintModules?.find(module => module.key === bridge.aModuleKey);
        const bModule = bEntity?.footprintModules?.find(module => module.key === bridge.bModuleKey);
        if (!aModule || !bModule || aModule.floors <= bridge.floor || bModule.floors <= bridge.floor) return false;
        const floorH = Math.min(aEntity.floorH || 3.15, bEntity.floorH || 3.15);
        const y = bridge.floor * floorH;
        const hanging = bridge.variant === 'hanging-bridge';
        const width = hanging ? 0.86 : 1.05;
        const railH = hanging ? 0.70 : 0.86;
        const railT = hanging ? 0.065 : 0.10;
        if (bridge.axis === 'x') {
            const x0 = aModule.cx + aModule.halfX + 0.02;
            const x1 = bModule.cx - bModule.halfX - 0.02;
            const z = (aModule.cz + bModule.cz) * 0.5;
            if (x1 <= x0) return false;
            const span = x1 - x0;
            const x = (x0 + x1) * 0.5;
            registerSemanticConnector(physics, createBridgeConnector({
                id: `${bridge.id}:connector`,
                axis: 'x', from: x0, to: x1, fixedCoord: z, halfWidth: width * 0.5, y,
                source: 'skybridge', visualRole: bridge.variant || 'skybridge',
                fromSpaceId: semanticSpaceIdForEntity(aEntity, bridge.aModuleKey, bridge.floor),
                toSpaceId: semanticSpaceIdForEntity(bEntity, bridge.bModuleKey, bridge.floor),
                metadata: { bridgeId: bridge.id, variant: bridge.variant || 'skybridge', floor: bridge.floor },
            }));
            transforms.slabs.push({ x, y: y - 0.06, z, sx: span, sy: 0.12, sz: width });
            addRectPlatform(physics.platforms, x, z, span, width, y, bridge.variant || 'skybridge');
            for (const sideZ of [z - width * 0.5, z + width * 0.5]) {
                wallTransform(transforms.wallGroups[0], x, y + railH * 0.5, sideZ, span, railH, railT);
                physics.mazeWalls.push({ x1: x0, z1: sideZ, x2: x1, z2: sideZ, yMin: y, yMax: y + railH });
            }
            if (hanging) {
                const postCount = Math.max(2, Math.floor(span / 1.7));
                for (let i = 0; i <= postCount; i++) {
                    const px = x0 + span * (i / postCount);
                    const sag = Math.sin(Math.PI * (i / postCount)) * 0.38;
                    transforms.props.push({ x: px, y: y + 1.02 - sag, z: z - width * 0.5, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                    transforms.props.push({ x: px, y: y + 1.02 - sag, z: z + width * 0.5, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                }
            }
        } else {
            const z0 = aModule.cz + aModule.halfZ + 0.02;
            const z1 = bModule.cz - bModule.halfZ - 0.02;
            const x = (aModule.cx + bModule.cx) * 0.5;
            if (z1 <= z0) return false;
            const span = z1 - z0;
            const z = (z0 + z1) * 0.5;
            registerSemanticConnector(physics, createBridgeConnector({
                id: `${bridge.id}:connector`,
                axis: 'z', from: z0, to: z1, fixedCoord: x, halfWidth: width * 0.5, y,
                source: 'skybridge', visualRole: bridge.variant || 'skybridge',
                fromSpaceId: semanticSpaceIdForEntity(aEntity, bridge.aModuleKey, bridge.floor),
                toSpaceId: semanticSpaceIdForEntity(bEntity, bridge.bModuleKey, bridge.floor),
                metadata: { bridgeId: bridge.id, variant: bridge.variant || 'skybridge', floor: bridge.floor },
            }));
            transforms.slabs.push({ x, y: y - 0.06, z, sx: width, sy: 0.12, sz: span });
            addRectPlatform(physics.platforms, x, z, width, span, y, bridge.variant || 'skybridge');
            for (const sideX of [x - width * 0.5, x + width * 0.5]) {
                wallTransform(transforms.wallGroups[0], sideX, y + railH * 0.5, z, railT, railH, span);
                physics.mazeWalls.push({ x1: sideX, z1: z0, x2: sideX, z2: z1, yMin: y, yMax: y + railH });
            }
            if (hanging) {
                const postCount = Math.max(2, Math.floor(span / 1.7));
                for (let i = 0; i <= postCount; i++) {
                    const pz = z0 + span * (i / postCount);
                    const sag = Math.sin(Math.PI * (i / postCount)) * 0.38;
                    transforms.props.push({ x: x - width * 0.5, y: y + 1.02 - sag, z: pz, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                    transforms.props.push({ x: x + width * 0.5, y: y + 1.02 - sag, z: pz, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                }
            }
        }
        aEntity.skybridges = (aEntity.skybridges || 0) + 1;
        bEntity.skybridges = (bEntity.skybridges || 0) + 1;
        return true;
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

    function buildDistrictLandmark({ chunk, spec, cell, physics, transforms, cellCx, cellCz, cellSize }) {
        // A district landmark is a Kowloon compound with a landmark profile, not a
        // second tower builder.  The recurring identity only controls recipe data
        // (height/footprint/entrance/crown); wall, floor, stair, facade and collision
        // publication all go through buildKowloonCompound().
        const typeIndex = districtLandmarkTypes.indexOf(spec.type);
        const weird = chunk.weirdness.sampled;
        const floors = Math.min(12, 5 + typeIndex + Math.floor(weird * 3));
        const halfX = cellSize * (spec.type === 'gatehouse' ? 0.46 : 0.42);
        const halfZ = cellSize * (spec.type === 'stack' ? 0.46 : 0.42);
        const doorSide = cell.sides[hashString32(`${spec.id}:door`) % cell.sides.length];
        const dir = KOWLOON_DIRS.find(candidate => candidate.side === doorSide) || KOWLOON_DIRS[0];
        const materialIndex = hashString32(`${spec.id}:facade`) % wallMats.length;
        const landmarkSiteId = 0;
        const landmarkSite = { id: landmarkSiteId, cells: [{ col: cell.c, row: cell.r }] };
        const landmarkSiteIdOf = Array.from({ length: microCells }, () => new Array(microCells).fill(-1));
        landmarkSiteIdOf[cell.r][cell.c] = landmarkSiteId;
        const structural = buildKowloonCompound({
            chunk,
            site: landmarkSite,
            siteIdOf: landmarkSiteIdOf,
            roadPlan: { roads: new Set() },
            openSiteIds: new Set(),
            bridgePortalsBySite: new Map(),
            physics,
            transforms,
            cx0: chunk.centerX,
            cz0: chunk.centerZ,
            half: chunkSize * 0.5,
            cellSize,
            materialIndex,
            geometryAdapter: {
                rectForCell: () => ({ cx: cellCx, cz: cellCz, halfX, halfZ }),
            },
            streetCellOverride: () => true,
            structureProfile: {
                archetype: 'vertical-stack',
                primaryFloors: floors,
                floorHeight: 3.15,
                floorCountByCell: { [kowloonCellKey(cell.c, cell.r)]: floors },
                entrances: [{ col: cell.c, row: cell.r, dc: dir.dc, dr: dir.dr }],
                singularRecipe: `district-landmark:${spec.type}`,
            },
        });
        if (!structural) throw new Error(`district landmark ${spec.id} failed to build through KowloonFabricEngine`);

        // Landmark identity is a content profile over the shared shell.  Crowns and
        // beacons remain special semantic additions, but they are emitted inside the
        // same fabric owner/buffer/collision commit as the compound itself.
        const floorH = structural.floorH;
        const roofY = structural.floors * floorH;
        const crownH = 0.9 + typeIndex * 0.22 + weird * 0.8;
        const crownHalfX = structural.halfX * (0.72 - Math.min(0.24, typeIndex * 0.035));
        const crownHalfZ = structural.halfZ * (0.72 - Math.min(0.24, typeIndex * 0.035));
        wallTransform(transforms.wallGroups[materialIndex], structural.x, roofY + crownH * 0.5, structural.z, crownHalfX * 2, crownH, crownHalfZ * 2);
        pushWallSegments(physics.mazeWalls, structural.x, structural.z, crownHalfX, crownHalfZ, roofY, roofY + crownH);
        if (spec.type === 'spire' || spec.type === 'beacon') {
            const mastH = 2.4 + weird * 3.2;
            wallTransform(transforms.wallGroups[materialIndex], structural.x, roofY + crownH + mastH * 0.5, structural.z, 0.22, mastH, 0.22);
        }
        return {
            ...spec,
            c: cell.c,
            r: cell.r,
            x: structural.x,
            z: structural.z,
            floors: structural.floors,
            doorSide: structural.doorSide,
            materialIndex,
            ...structural,
            landmarkProfile: spec.type,
        };
    }

    function addOwnedBoundaryBarriers(chunk, roadPlan, physics, wallList, cellSize) {
        const half = chunkSize * 0.5;
        const last = microCells - 1;
        const wallH = KOWLOON_BOUNDARY_BARRIER_HEIGHT, wallT = KOWLOON_BOUNDARY_BARRIER_THICKNESS;

         
         
         
        for (let r = 0; r < microCells; r++) {
            if (r === roadPlan.portals.east) continue;
            const z = chunk.centerZ - half + (r + 0.5) * cellSize;
            const x = chunk.centerX + half - wallT * 0.5;
            wallTransform(wallList, x, wallH * 0.5, z, wallT, wallH, cellSize);
            physics.mazeWalls.push({ x1: x, z1: z - cellSize * 0.5, x2: x, z2: z + cellSize * 0.5, yMin: 0, yMax: wallH, thickness: wallT });
        }
        for (let c = 0; c < microCells; c++) {
            if (c === roadPlan.portals.south) continue;
            const x = chunk.centerX - half + (c + 0.5) * cellSize;
            const z = chunk.centerZ + half - wallT * 0.5;
            wallTransform(wallList, x, wallH * 0.5, z, cellSize, wallH, wallT);
            physics.mazeWalls.push({ x1: x - cellSize * 0.5, z1: z, x2: x + cellSize * 0.5, z2: z, yMin: 0, yMax: wallH, thickness: wallT });
        }
        return last;
    }

    function planChunk(chunk) {
        const roadPlan = planRoads(chunk);
        return {
            portals: { ...roadPlan.portals },
            hub: { ...roadPlan.hub },
            roads: [...roadPlan.roads].sort(),
            weirdness: chunk.weirdness,
            districtLandmark: districtLandmarkFor(chunk),
        };
    }

    function createFabricBuffers() {
        return {
            transforms: { wallGroups: wallMats.map(() => []), slabs: [], steps: [], props: [], roads: [], windows: [], doors: [] },
            physics: { mazeWalls: [], platforms: [], ramps: [], ceilings: [], props: [], circulationReservations: [], semanticConnectors: [] },
        };
    }

    function attachFabricMeshes(root, transforms, namePrefix) {
        const roadMesh = makeInstanced(`${namePrefix}-roads`, unitPlane, roadMat, transforms.roads);
        if (roadMesh) root.add(roadMesh);
        for (let i = 0; i < transforms.wallGroups.length; i++) {
            const mesh = makeInstanced(`${namePrefix}-walls-${i}`, unitBox, wallMats[i], transforms.wallGroups[i]);
            if (mesh) root.add(mesh);
        }
        const slabMesh = makeInstanced(`${namePrefix}-slabs`, unitBox, slabMat, transforms.slabs);
        const stepMesh = makeInstanced(`${namePrefix}-steps`, unitBox, stepMat, transforms.steps);
        const propMesh = makeInstanced(`${namePrefix}-props`, unitBox, propMat, transforms.props);
        const windowMesh = makeInstanced(`${namePrefix}-windows`, unitBox, windowMat, transforms.windows);
        const doorMesh = makeInstanced(`${namePrefix}-doors`, unitBox, doorMat, transforms.doors);
        for (const mesh of [slabMesh, stepMesh, propMesh, windowMesh, doorMesh]) if (mesh) root.add(mesh);
        return root.children.length;
    }

    function buildAuthoredOriginChunk({ singulars = [] } = {}) {
        if (authoredOriginChunkPayload) return authoredOriginChunkPayload;
        const ownerId = worldChunkOwnerId(worldSeed, 0, 0);
        const chunk = {
            key: spawnChunkKey, x: 0, z: 0, centerX: 0, centerZ: 0,
            seed: hashString32(`${worldSeed}:authored-origin`), ownerId,
            weirdness: { sampled: 0 },
        };
        const root = new THREE.Group();
        root.name = `world-chunk:${spawnChunkKey}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = spawnChunkKey;
        root.userData.worldChunkOwnerId = ownerId;
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.streamAuthority = 'WorldChunkStreamer';
        root.userData.authoredOriginComposite = true;
        root.visible = false;
        const { physics } = createFabricBuffers();
        authoredOriginChunkPayload = {
            formatVersion: WORLD_FORMAT_VERSION, key: spawnChunkKey, chunk, ownerId, root, physics,
            entities: [], singulars: [...singulars], components: [], authoredOriginComposite: true,
            committed: false, disposed: false, worldMatricesReady: false, physicsPublished: false,
        };
        freezeChunkRoot(root);
        return authoredOriginChunkPayload;
    }

    function buildAuthoredSite({
        site, siteIdOf, grid, cellToWorld, colHalf, rowHalf,
        ownerId = `spawn-fabric:${site?.id ?? 'unknown'}`,
        weirdness = 0.20, materialIndex = null, structureProfile = null, bridgePortalsBySite = null,
    } = {}) {
        if (!site?.cells?.length || !siteIdOf || !grid || !cellToWorld || !colHalf || !rowHalf) {
            throw new Error('buildAuthoredSite requires site/siteIdOf/grid/cellToWorld/colHalf/rowHalf');
        }
        const chunk = {
            key: `spawn-site:${site.id}`, x: 0, z: 0, seed: hashString32(`${worldSeed}:spawn-site:${site.id}`),
            weirdness: { sampled: Math.max(0, Math.min(1, weirdness)) },
            ownerId, centerX: 0, centerZ: 0,
        };
        const root = new THREE.Group();
        root.name = `kowloon-fabric:${chunk.key}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = '0,0';
        root.userData.worldChunkOwnerId = ownerId;
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.authoredSpawnFabric = true;
        root.userData.siteId = site.id;

        const { transforms, physics } = createFabricBuffers();
        const geometryAdapter = {
            rectForCell(cell, edgeKinds, rng) {
                const center = cellToWorld(cell.col, cell.row);
                const hx = colHalf(cell.col), hz = rowHalf(cell.row);
                const scale = Math.max(0.5, Math.min(hx * 2, hz * 2));
                const streetSetback = scale * (-0.14 + rng() * 0.07);
                const partySetback = scale * (0.010 + rng() * 0.018);
                const isAuthoredRoadCell = (col, row) => grid[row]?.[col] !== true;
                const dirByKey = new Map(KOWLOON_DIRS.map(dir => [dir.key, dir]));
                return computeKowloonModuleRect({
                    cellCx: center.x, cellCz: center.z, halfX: hx, halfZ: hz, edgeKinds, streetSetback, partySetback,
                    allowStreetEncroachment: sideKey => kowloonStreetEncroachmentAllowed(cell, dirByKey.get(sideKey), isAuthoredRoadCell),
                });
            },
            metricForCell(cell) {
                const center = cellToWorld(cell.col, cell.row);
                return { x: center.x, z: center.z, cellSize: Math.max(0.5, Math.min(colHalf(cell.col) * 2, rowHalf(cell.row) * 2)) };
            },
        };
        const structural = buildKowloonCompound({
            chunk, site, siteIdOf, roadPlan: { roads: new Set() }, openSiteIds: new Set(), bridgePortalsBySite,
            physics, transforms, cx0: 0, cz0: 0, half: 0, cellSize: 1,
            materialIndex: materialIndex ?? (hashString32(`${worldSeed}:spawn-fabric-material:${site.id}`) % wallMats.length),
            geometryAdapter,
            streetCellOverride: (col, row) => grid[row]?.[col] !== true,
            // Preserve intentionally reserved singular courtyards only in their own recipes;
            // ordinary spawn fabric uses the same service-void policy as infinity.
            courtyardCellOverride: structureProfile?.courtyardCell,
            structureProfile,
        });
        if (!structural) return null;
        attachFabricMeshes(root, transforms, `spawn-fabric-${site.id}`);
        const entity = { id: worldEntityId(worldSeed, 0, 0, 'spawn-fabric-site', String(site.id)), kind: 'building', siteId: site.id, ...structural };
        const payload = {
            formatVersion: WORLD_FORMAT_VERSION, ownerId, root, physics, chunk,
            entity, entities: [entity], buildings: 1, plazas: 0, skybridges: 0,
            committed: false, disposed: false, authoredSpawnFabric: true,
        };
        enrichment.initializePayload(chunk, payload);
        freezeChunkRoot(root);
        return payload;
    }



    function buildAuthoredPlaza({
        col, row, cellToWorld, colHalf, rowHalf,
        ownerId = `spawn-plaza:${col},${row}`, weirdness = 0.20, detailDensity = 0.38,
    } = {}) {
        if (!Number.isInteger(col) || !Number.isInteger(row) || !cellToWorld || !colHalf || !rowHalf) {
            throw new Error('buildAuthoredPlaza requires col/row/cellToWorld/colHalf/rowHalf');
        }
        const center = cellToWorld(col, row);
        const chunk = {
            key: `spawn-plaza:${col},${row}`, x: 0, z: 0,
            centerX: center.x, centerZ: center.z,
            seed: hashString32(`${worldSeed}:spawn-plaza:${col},${row}`),
            weirdness: { sampled: Math.max(0, Math.min(1, weirdness)) }, ownerId,
        };
        const root = new THREE.Group();
        root.name = `kowloon-fabric:${chunk.key}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = '0,0';
        root.userData.worldChunkOwnerId = ownerId;
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.authoredSpawnPlaza = true;
        const { physics } = createFabricBuffers();
        const entity = {
            id: worldEntityId(worldSeed, 0, 0, 'spawn-plaza', `${col},${row}`),
            kind: 'plaza', x: center.x, z: center.z,
            halfX: colHalf(col), halfZ: rowHalf(row),
            kowloonIntensity: chunk.weirdness.sampled, detailDensity: Math.max(0, Math.min(1, detailDensity)),
        };
        const payload = {
            formatVersion: WORLD_FORMAT_VERSION, ownerId, root, physics, chunk,
            entity, entities: [entity], buildings: 0, plazas: 1, skybridges: 0,
            committed: false, disposed: false, authoredSpawnPlaza: true,
        };
        enrichment.initializePayload(chunk, payload);
        freezeChunkRoot(root);
        return payload;
    }

    function planAuthoredBridgeNetwork({ sites, siteIdOf, grid, weirdness = 0.2, maxBridges = 18 } = {}) {
        const eligible = new Set((sites || []).filter(site => site.signatureType !== 'futurePlaceholder').map(site => site.id));
        const bridgePlans = [];
        const bridgePortalsBySite = new Map();
        const intensity = kowloonIntensity(weirdness);
        const addPortal = (siteId, portal) => {
            if (!bridgePortalsBySite.has(siteId)) bridgePortalsBySite.set(siteId, []);
            bridgePortalsBySite.get(siteId).push(portal);
        };
        const consider = (c, r, a, b, axis) => {
            if (bridgePlans.length >= maxBridges || !a || !b || a.siteId < 0 || b.siteId < 0 || a.siteId === b.siteId) return;
            if (!eligible.has(a.siteId) || !eligible.has(b.siteId)) return;
            const identity = `spawn:${c},${r}:${Math.min(a.siteId,b.siteId)}:${Math.max(a.siteId,b.siteId)}:${axis}`;
            const brng = mulberry32(hashString32(`${worldSeed}:kowloon-bridge:${identity}`));
            if (brng() >= Math.min(0.74, intensity.bridgeChance + 0.12)) return;
            const floor = 1;
            const plan = {
                id: worldEntityId(worldSeed, 0, 0, 'spawn-skybridge', identity),
                axis, floor, roadC: c, roadR: r, aSiteId: a.siteId, bSiteId: b.siteId,
                aModuleKey: a.moduleKey, bModuleKey: b.moduleKey, aDirKey: a.dirKey, bDirKey: b.dirKey,
                variant: brng() < 0.46 ? 'hanging-bridge' : 'guarded-catwalk',
            };
            bridgePlans.push(plan);
            addPortal(a.siteId, { moduleKey: a.moduleKey, dirKey: a.dirKey, floor });
            addPortal(b.siteId, { moduleKey: b.moduleKey, dirKey: b.dirKey, floor });
        };
        const rows = grid?.length || 0, cols = grid?.[0]?.length || 0;
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (grid[r]?.[c] !== false) continue;
                const west = siteIdOf[r]?.[c-1] ?? -1, east = siteIdOf[r]?.[c+1] ?? -1;
                consider(c, r, { siteId: west, moduleKey: key(c-1,r), dirKey: 'E' }, { siteId: east, moduleKey: key(c+1,r), dirKey: 'W' }, 'x');
                const north = siteIdOf[r-1]?.[c] ?? -1, south = siteIdOf[r+1]?.[c] ?? -1;
                consider(c, r, { siteId: north, moduleKey: key(c,r-1), dirKey: 'S' }, { siteId: south, moduleKey: key(c,r+1), dirKey: 'N' }, 'z');
            }
        }
        return { bridgePlans, bridgePortalsBySite };
    }

    function buildAuthoredSurfacePatch({ patchKey, buckets, ownerId = `spawn-surface:${patchKey ?? 'unknown'}` } = {}) {
        if (!patchKey || !Array.isArray(buckets) || !buckets.length) return { ownerId, root: null, draws: 0, instances: 0, committed: true };
        const root = new THREE.Group();
        root.name = `kowloon-surface:${patchKey}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = '0,0';
        root.userData.worldChunkOwnerId = ownerId;
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.authoredSpawnSurface = true;
        let draws = 0, instances = 0;
        for (const bucket of buckets) {
            if (!bucket?.transforms?.length || !bucket.geometry || !bucket.material) continue;
            const mesh = makeInstanced(`spawn-surface:${patchKey}:${bucket.kind ?? draws}`, bucket.geometry, bucket.material, bucket.transforms);
            if (!mesh) continue;
            root.add(mesh);
            draws++;
            instances += bucket.transforms.length;
        }
        if (root.children.length) freezeChunkRoot(root);
        return { ownerId, root, physics: null, draws, instances, committed: false, patchKey, authoredSpawnSurface: true };
    }

    function buildAuthoredBridge({ bridge, payloadBySite, ownerId = `spawn-link:${bridge?.id ?? 'unknown'}` } = {}) {
        if (!bridge || !payloadBySite) return null;
        const aEntity = payloadBySite.get(bridge.aSiteId)?.entity;
        const bEntity = payloadBySite.get(bridge.bSiteId)?.entity;
        const { transforms, physics } = createFabricBuffers();
        if (!emitSkybridge({ bridge, aEntity, bEntity, physics, transforms })) return null;
        const root = new THREE.Group();
        root.name = `kowloon-link:${bridge.id}`;
        root.userData.noSpatialChunk = true;
        root.userData.worldChunkRoot = true;
        root.userData.worldChunkKey = '0,0';
        root.userData.worldChunkOwnerId = ownerId;
        root.userData.worldFormatVersion = WORLD_FORMAT_VERSION;
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.authoredSpawnRelationship = true;
        attachFabricMeshes(root, transforms, `spawn-link-${bridge.id}`);
        freezeChunkRoot(root);
        return { ownerId, root, physics, bridge, entity: { id: bridge.id, kind: 'skybridge', ...bridge }, committed: false, disposed: false, authoredSpawnRelationship: true };
    }

    async function build(chunk) {
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
        root.userData.renderAuthority = 'KowloonFabricEngine';
        root.userData.streamAuthority = 'WorldChunkStreamer';
        root.userData.weirdness = chunk.weirdness;
        root.userData.roadPortals = { ...roadPlan.portals };
         
         
         
        root.visible = false;

        const { transforms, physics } = createFabricBuffers();
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
            const plazaChance = Math.max(0.035, 0.135 - weird * 0.05 - Math.max(0, site.cells.length - 2) * 0.022);
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
                variant: brng() < 0.34 + weird * 0.18 ? 'hanging-bridge' : 'guarded-catwalk',
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
            if (!emitSkybridge({ bridge, aEntity, bEntity, physics, transforms })) continue;
            entities.push({ id: bridge.id, kind: 'skybridge', ...bridge });
            skybridges++;
        }

        attachFabricMeshes(root, transforms, `chunk:${chunk.key}`);

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

    // Render and collision are one owner-level authority unit. Streamer visibility
    // is a REQUEST; actual publication additionally requires the physics owner to be
    // active. If late geometry intersects the player, player-physics stages the whole
    // owner and this root remains hidden until that same owner activates.
    function applyPayloadVisibility(payload) {
        if (!payload?.root) return false;
        const physicsReady = !payload.physics || payload.physicsActivationState === 'active';
        payload.root.visible = !!payload.requestedVisible && physicsReady;
        payload.visible = payload.root.visible;
        payload.renderPublished = payload.visible;
        return payload.visible;
    }

    function updatePayloadPhysicsActivation(payload, record) {
        if (!payload || payload.disposed) return;
        payload.physicsActivationState = record?.activationState ?? 'active';
        payload.physicsDeferredReason = record?.deferredReason ?? null;
        applyPayloadVisibility(payload);
    }

    async function commit(chunk, payload) {
        if (!payload || payload.committed) return payload;
        // ONE publication boundary for authored spawn, singular shells, surface
        // patches, cross-site links, and generic streamed chunks. Build stays
        // off-scene. A player-conflicting owner may attach staged, but neither its
        // render nor any of its collision becomes authoritative until the capsule clears.
        if (payload.root) {
            payload.requestedVisible = payload.root.visible !== false;
            payload.root.visible = false;
            const originComponent = authoredOriginChunkPayload?.committed
                && payload !== authoredOriginChunkPayload
                && payload.root.userData?.worldChunkKey === spawnChunkKey;
            if (originComponent) {
                authoredOriginChunkPayload.root.add(payload.root);
                if (!authoredOriginChunkPayload.components.includes(payload)) authoredOriginChunkPayload.components.push(payload);
            } else {
                addStreamRoot(payload.root);
            }
            payload.root.updateMatrixWorld(true);
            payload.worldMatricesReady = true;
        }
        if (payload.physics) {
            const record = playerPhysics.registerOwnedWorld(payload.ownerId, payload.physics, {
                onActivationChange: nextRecord => updatePayloadPhysicsActivation(payload, nextRecord),
            });
            committedOwners.add(payload.ownerId);
            payload.physicsPublished = true;
            payload.physicsActivationState = record?.activationState ?? 'active';
            payload.physicsDeferredReason = record?.deferredReason ?? null;
        } else {
            payload.physicsActivationState = 'active';
            payload.physicsDeferredReason = null;
        }
        payload.committed = true;
        applyPayloadVisibility(payload);
        return payload;
    }

    function setVisible(chunk, payload, visible) {
        if (!payload || !payload.root) return false;
        payload.requestedVisible = !!visible;
        return applyPayloadVisibility(payload);
    }

    function verifyReady(chunk, payload, expectedVisible) {
        if (!payload) return true;
        const root = payload.root;
        if (!payload.committed) throw new Error(`chunk ${chunk.key} READY verification failed: payload not committed`);
        if (!root || root.parent !== scene) throw new Error(`chunk ${chunk.key} READY verification failed: root is not attached directly to scene`);
        if (!root.userData?.worldChunkRoot) throw new Error(`chunk ${chunk.key} READY verification failed: worldChunkRoot identity missing`);
        if (root.userData.renderAuthority !== 'KowloonFabricEngine') throw new Error(`chunk ${chunk.key} READY verification failed: wrong render authority`);
        if (root.userData.streamAuthority !== 'WorldChunkStreamer') throw new Error(`chunk ${chunk.key} READY verification failed: stream authority missing`);
        if (root.parent?.userData?.__perfChunkGroup || root.parent?.name?.startsWith?.('perf-chunk:')) {
            throw new Error(`chunk ${chunk.key} READY verification failed: legacy optimizer owns streamed root`);
        }
        if (!payload.worldMatricesReady) throw new Error(`chunk ${chunk.key} READY verification failed: world matrices not committed`);
        if (!committedOwners.has(payload.ownerId)) throw new Error(`chunk ${chunk.key} READY verification failed: physics owner is not registered`);
        if (payload.requestedVisible !== !!expectedVisible) throw new Error(`chunk ${chunk.key} READY verification failed: visibility request does not match streamer authority`);
        const physicsReady = !payload.physics || payload.physicsActivationState === 'active';
        const expectedActualVisibility = !!expectedVisible && physicsReady;
        if (root.visible !== expectedActualVisibility) throw new Error(`chunk ${chunk.key} READY verification failed: render/collision activation parity violated`);
        return true;
    }

    async function unload(chunk, payload) {
        if (!payload) return;
        if (payload.authoredOriginComposite) {
            for (const component of payload.components || []) {
                if (component?.physicsPublished) playerPhysics.unregisterOwnedWorld(component.ownerId);
                if (component?.ownerId) committedOwners.delete(component.ownerId);
                enrichment.disposePayload(component);
                component.committed = false;
                component.physicsPublished = false;
            }
            payload.components.length = 0;
        }
        if (payload.committed && payload.physicsPublished) playerPhysics.unregisterOwnedWorld(payload.ownerId);
        if (payload.physicsPublished && payload.ownerId) committedOwners.delete(payload.ownerId);
        if (authoredOriginChunkPayload && payload !== authoredOriginChunkPayload) {
            const componentIndex = authoredOriginChunkPayload.components.indexOf(payload);
            if (componentIndex >= 0) authoredOriginChunkPayload.components.splice(componentIndex, 1);
        }
        const root = payload.root;
        if (root?.parent) root.parent.remove(root);
        enrichment.disposePayload(payload);
        root?.clear?.();
        payload.committed = false;
        payload.physicsPublished = false;
        if (payload === authoredOriginChunkPayload) authoredOriginChunkPayload = null;
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

    return { build, buildAuthoredOriginChunk, buildAuthoredSite, buildAuthoredPlaza, buildAuthoredSurfacePatch, buildAuthoredBridge, planAuthoredBridgeNetwork, commit, setVisible, verifyReady, unload, refine, hasPendingRefinement, planChunk, districtLandmarkFor, disposeShared };
}

