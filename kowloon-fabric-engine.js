import { GENERATION_LANES, GENERATION_PROFILE_NAME } from './config/performance-isolation.js';
import { hashString32 } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId, worldEntityId } from './world-contract.js';
import { createKowloonFabricEnrichment } from './world/kowloon-fabric-enrichment.js';
import { assertBuildingFootprintsDoNotOverlap } from './world/building-footprint-invariant.js';
import { createKowloonMazeTopology } from './world/kowloon-district-plan.js';
import { planInvertedTowerField } from './world/inverted-tower-field.js';
import { classifyPhysicalUse } from './world/physical-use.js';
import { deriveStairFlight, gameplayTraversalEnvelope, resolvePhysicalTruth } from './world/physical-truth.js';
import { BUILDING_SLAB_THICKNESS, storyCeilingLocalY } from './world/interior-geometry-policy.js';
import { planInteriorSwitchbackStairCore } from './world/interior-stair-core.js';
import { planBuildingSidecar } from './world/architecture/building-plan-sidecar.js';
import { assertBuildingPlanAuthority, promoteBuildingPlanAuthority } from './world/architecture/building-plan-authority.js';
import { createSemanticPlanCache, semanticPlanCacheKey } from './world/architecture/semantic-plan-runtime.js';
import { accessAnchorsForBuildingPortals, compileAccessPortals } from './world/access-portals.js';
import { compileDistrictBlockComposition, districtBuildingPolicyForEntity, districtContextForEntity } from './world/district-block-composition.js';
import { planExteriorScaffoldRoute } from './world/scaffold-circulation-plan.js';
import { assertCanonicalScaffoldSwitchback } from './world/stair-volume-contract.js';
import { guardFamilyForContext, guardOpeningWidth, planFlightGuardPair, planHorizontalGuardSpan, splitHorizontalGuardSpan } from './world/guardrail-authority.js';
import { normalizeTransportSurface, planExteriorTransportNetwork, transportSurfaceIntersection } from './world/exterior-transport-network.js';
import { planFastFacadeArchitecture } from './world/fast-facade-architecture.js';
import { buildExteriorDebugSnapshot, emitExteriorDebugSnapshot } from './world/exterior-debug-summary.js';
import { EXTERIOR_CIRCULATION_DEBT, planExteriorStreetLayerPolicy } from './world/exterior-street-layer-policy.js';
import { assertFastVerticalRoute, planExteriorStreetLayerTrunk } from './world/fast-vertical-route.js';
import {
    anyReservationIntersectsBox,
    createBoxCirculationReservation,
    createRampCirculationReservation,
    reservationCutForAxisSegment,
    reservationIntersectsBox,
} from './world/circulation-reservations.js';
import {
    buildConservativeBuildingObstacles,
    evaluateExteriorRouteCollision,
    firstCirculationVolumeConflict,
    publishedCirculationReservation,
    wallSegmentBuildingObstacles,
} from './world/circulation-collision-authority.js';
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



function kowloonCellSetConnected(cells) {
    if (cells.length <= 1) return true;
    const byCell = new Map(cells.map(cell => [key(cell.col, cell.row), cell]));
    const seen = new Set();
    const queue = [cells[0]];
    seen.add(key(cells[0].col, cells[0].row));
    while (queue.length) {
        const current = queue.shift();
        const neighbors = KOWLOON_DIRS
            .map(dir => byCell.get(key(current.col + dir.dc, current.row + dir.dr)))
            .filter(Boolean)
            .sort((a, b) => key(a.col, a.row).localeCompare(key(b.col, b.row)));
        for (const next of neighbors) {
            const nextKey = key(next.col, next.row);
            if (seen.has(nextKey)) continue;
            seen.add(nextKey);
            queue.push(next);
        }
    }
    return seen.size === byCell.size;
}

function normalizeModuleFloorConnectivity(modulePlans, primaryModule, bridgePortals = []) {
    if (!primaryModule || modulePlans.length <= 1) {
        return { raisedForBridgeModules: [], raisedFloorLevels: 0, trimmedModules: [], trimmedFloorLevels: 0 };
    }
    const byCell = new Map(modulePlans.map(module => [key(module.cell.col, module.cell.row), module]));
    const raised = new Map();
    const topPlateRaised = new Map();
    const trimmed = new Map();

    const neighborsOfModule = module => KOWLOON_DIRS
        .map(dir => byCell.get(key(module.cell.col + dir.dc, module.cell.row + dir.dr)))
        .filter(Boolean)
        .sort((a, b) => a.key.localeCompare(b.key));

    const pathToPrimary = start => {
        if (start === primaryModule) return [start];
        const queue = [start];
        const parent = new Map([[start.key, null]]);
        while (queue.length) {
            const current = queue.shift();
            for (const next of neighborsOfModule(current)) {
                if (parent.has(next.key)) continue;
                parent.set(next.key, current.key);
                if (next === primaryModule) {
                    const path = [primaryModule];
                    let cursor = current.key;
                    while (cursor) {
                        path.push(byCell.get(cursor));
                        cursor = parent.get(cursor);
                    }
                    return path.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    };

    // A bridge is already a real circulation connector, so preserve the floor it
    // lands on and raise only the shortest same-site support path back to the
    // persistent stair spine. Current bridges use floor 1, but keep this generic.
    for (const portal of bridgePortals) {
        const target = modulePlans.find(module => module.key === portal.moduleKey);
        if (!target) continue;
        const requiredFloors = Math.min(primaryModule.floors, Math.max(1, Number(portal.floor) + 1 || 1));
        if (requiredFloors <= 1) continue;
        const path = pathToPrimary(target);
        if (!path) throw new Error(`Kowloon bridge module ${target.key} is disconnected from primary ${primaryModule.key}`);
        for (const module of path) {
            if (module.floors >= requiredFloors) continue;
            const before = module.floors;
            module.floors = requiredFloors;
            raised.set(module.key, (raised.get(module.key) ?? 0) + (requiredFloors - before));
        }
    }

    // Do not let a real building terminate as a stair tower with no usable floor
    // beside it. A tall building is not a stair shaft with a token room wrapped around it.
    // Carry a connected multi-module tower plate all the way to the top occupied
    // floor. Taller towers demand more plate so upper stories can own a real
    // hallway plus multiple full occupancies while lower modules can still step
    // down into roofs/terraces around that tower.
    const requiredTopPlateModules = Math.min(
        modulePlans.length,
        primaryModule.floors >= 10 ? 5
            : primaryModule.floors >= 7 ? 4
                : primaryModule.floors >= 4 ? 3
                    : primaryModule.floors >= 2 ? 2 : 1,
    );
    const towerPlateKeys = new Set([primaryModule.key]);
    while (towerPlateKeys.size < requiredTopPlateModules) {
        const candidates = modulePlans.filter(module => !towerPlateKeys.has(module.key)
            && neighborsOfModule(module).some(neighbor => towerPlateKeys.has(neighbor.key)));
        if (!candidates.length) break;
        candidates.sort((a, b) => {
            const aTouches = neighborsOfModule(a).filter(neighbor => towerPlateKeys.has(neighbor.key)).length;
            const bTouches = neighborsOfModule(b).filter(neighbor => towerPlateKeys.has(neighbor.key)).length;
            return bTouches - aTouches
                || b.floors - a.floors
                || (b.rect.halfX * b.rect.halfZ) - (a.rect.halfX * a.rect.halfZ)
                || a.key.localeCompare(b.key);
        });
        const companion = candidates[0];
        towerPlateKeys.add(companion.key);
        const before = companion.floors;
        companion.floors = primaryModule.floors;
        if (companion.floors > before) topPlateRaised.set(companion.key, companion.floors - before);
    }

    // Random height variation may otherwise leave an upper-floor island with no
    // stair or bridge route. Trim only the inaccessible levels; never invent a
    // second vertical core and never grow the whole compound to match one tower.
    for (let floor = 1; floor < primaryModule.floors; floor++) {
        const active = new Set(modulePlans.filter(module => module.floors > floor).map(module => module.key));
        if (!active.has(primaryModule.key)) break;
        const reachable = new Set([primaryModule.key]);
        const queue = [primaryModule];
        while (queue.length) {
            const current = queue.shift();
            for (const next of neighborsOfModule(current)) {
                if (!active.has(next.key) || reachable.has(next.key)) continue;
                reachable.add(next.key);
                queue.push(next);
            }
        }
        for (const module of modulePlans) {
            if (module.floors <= floor || reachable.has(module.key)) continue;
            const before = module.floors;
            module.floors = floor;
            trimmed.set(module.key, (trimmed.get(module.key) ?? 0) + (before - floor));
        }
    }

    return {
        raisedForBridgeModules: [...raised.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([moduleKey, floorsAdded]) => ({ moduleKey, floorsAdded })),
        raisedFloorLevels: [...raised.values()].reduce((sum, count) => sum + count, 0),
        raisedForTopPlateModules: [...topPlateRaised.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([moduleKey, floorsAdded]) => ({ moduleKey, floorsAdded })),
        raisedTopPlateFloorLevels: [...topPlateRaised.values()].reduce((sum, count) => sum + count, 0),
        trimmedModules: [...trimmed.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([moduleKey, floorsRemoved]) => ({ moduleKey, floorsRemoved })),
        trimmedFloorLevels: [...trimmed.values()].reduce((sum, count) => sum + count, 0),
    };
}

function primaryPhysicalRole(family) {
    if (family === 'residential-lodging') return 'dwelling-entry';
    if (family === 'mercantile-public' || family === 'business' || family === 'assembly-institutional') return 'accessible-public-entry';
    return 'maintenance-access';
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

function addRectPlatform(out, x, z, sx, sz, y, supportKind = 'floor', supportMargin = null) {
    if (sx <= 0.05 || sz <= 0.05) return;
    const explicitSupportMargin = supportMargin === null || supportMargin === undefined
        ? null
        : Math.max(0, Number(supportMargin) || 0);
    out.push({
        x, z, hx: sx * 0.5, hz: sz * 0.5, y, supportKind,
        ...(explicitSupportMargin === null ? {} : { supportMargin: explicitSupportMargin }),
    });
}

function addNotchedFloor(out, cx, cz, width, depth, y, gapCx, gapCz, gapW, gapD, supportKind = 'floor') {
    const x0 = cx - width * 0.5, x1 = cx + width * 0.5;
    const z0 = cz - depth * 0.5, z1 = cz + depth * 0.5;
    const gx0 = Math.max(x0, gapCx - gapW * 0.5), gx1 = Math.min(x1, gapCx + gapW * 0.5);
    const gz0 = Math.max(z0, gapCz - gapD * 0.5), gz1 = Math.min(z1, gapCz + gapD * 0.5);
    // Notched slabs must stop supporting the player exactly where the visible
    // slab stops. The generic player-radius edge forgiveness would otherwise
    // create an invisible lip across a stair/roof opening.
    addRectPlatform(out, (x0 + gx0) * 0.5, cz, gx0 - x0, depth, y, supportKind, 0);
    addRectPlatform(out, (gx1 + x1) * 0.5, cz, x1 - gx1, depth, y, supportKind, 0);
    addRectPlatform(out, (gx0 + gx1) * 0.5, (z0 + gz0) * 0.5, gx1 - gx0, gz0 - z0, y, supportKind, 0);
    addRectPlatform(out, (gx0 + gx1) * 0.5, (gz1 + z1) * 0.5, gx1 - gx0, z1 - gz1, y, supportKind, 0);
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
            if (payload.committed) {
                throw new Error(`[topology-precommit] late Kowloon collision publication forbidden for ${payload.ownerId}:${kind}`);
            }
            payload.physics[kind]?.push?.(item);
            return true;
        },
    });
    const committedOwners = new Set();
    const buildingPlanCache = createSemanticPlanCache({ maxEntries: 1024 });
    let authoredOriginChunkPayload = null;
    if (microCells < 5 || microCells % 2 === 0) throw new Error('microCells must be an odd integer >= 5');

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.96 });
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4e4b45, roughness: 1 });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x85817a, roughness: 0.9 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 0.9 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x4b4f4d, roughness: 0.82, metalness: 0.18 });
    const guardMetalMat = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.68, metalness: 0.52 });
    const guardConcreteMat = new THREE.MeshStandardMaterial({ color: 0x8b8982, roughness: 0.96, metalness: 0.0 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x24211f, roughness: 0.9, metalness: 0.05 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x8fa9a8, emissive: 0x182827, emissiveIntensity: 0.5, roughness: 0.35 });
    const traversalEnvelope = gameplayTraversalEnvelope();
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
    const boxEuler = new THREE.Euler();

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
            else if (t.rx || t.rz) quat.setFromEuler(boxEuler.set(t.rx || 0, t.ry || 0, t.rz || 0));
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

    function wallTransform(list, x, y, z, sx, sy, sz, metadata = null) {
        list.push({ x, y, z, sx, sy, sz, ...(metadata || {}) });
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
        const slabT = BUILDING_SLAB_THICKNESS;
        if (gx0 > x0) transforms.slabs.push({ x: (x0 + gx0) * 0.5, y: y - slabT * 0.5, z: cz, sx: gx0 - x0, sy: slabT, sz: z1 - z0 });
        if (gx1 < x1) transforms.slabs.push({ x: (gx1 + x1) * 0.5, y: y - slabT * 0.5, z: cz, sx: x1 - gx1, sy: slabT, sz: z1 - z0 });
        if (gz0 > z0) transforms.slabs.push({ x: (gx0 + gx1) * 0.5, y: y - slabT * 0.5, z: (z0 + gz0) * 0.5, sx: gx1 - gx0, sy: slabT, sz: gz0 - z0 });
        if (gz1 < z1) transforms.slabs.push({ x: (gx0 + gx1) * 0.5, y: y - slabT * 0.5, z: (gz1 + z1) * 0.5, sx: gx1 - gx0, sy: slabT, sz: z1 - gz1 });
    }

    function realizeBuildingPlanWallRuns({ physics, wallList, plan }) {
        const wallT = 0.14;
        const coreReservation = plan?.verticalCore?.reservation ?? null;
        let segments = 0;
        const emitRaw = (run, a, b, yMin = run.yBase, yMax = run.yBase + run.height) => {
            const ceilingY = run.yBase + storyCeilingLocalY(run.height);
            yMax = Math.min(yMax, ceilingY);
            if (b - a <= 0.04 || yMax - yMin <= 0.04) return;
            const wallH = yMax - yMin;
            const wallY = yMin + wallH * 0.5;
            const mid = (a + b) * 0.5;
            if (run.axis === 'x') {
                wallTransform(wallList, mid, wallY, run.fixedCoord, b - a, wallH, wallT);
                physics.mazeWalls.push({
                    x1: a, z1: run.fixedCoord, x2: b, z2: run.fixedCoord,
                    yMin, yMax, thickness: wallT, supportKind: 'building-plan-partition',
                    buildingPlanWallId: run.id, fromSpaceId: run.fromSpaceId, toSpaceId: run.toSpaceId,
                });
            } else {
                wallTransform(wallList, run.fixedCoord, wallY, mid, wallT, wallH, b - a);
                physics.mazeWalls.push({
                    x1: run.fixedCoord, z1: a, x2: run.fixedCoord, z2: b,
                    yMin, yMax, thickness: wallT, supportKind: 'building-plan-partition',
                    buildingPlanWallId: run.id, fromSpaceId: run.fromSpaceId, toSpaceId: run.toSpaceId,
                });
            }
            segments++;
        };
        const emit = (run, a, b, yMin = run.yBase, yMax = run.yBase + run.height) => {
            if (!coreReservation) return emitRaw(run, a, b, yMin, yMax);
            const coreCut = reservationCutForAxisSegment(coreReservation, {
                axis: run.axis,
                fixedCoord: run.fixedCoord,
                from: a,
                to: b,
                yMin,
                yMax,
            }, wallT * 0.5 + 0.01);
            if (!coreCut) return emitRaw(run, a, b, yMin, yMax);
            emitRaw(run, a, coreCut.from, yMin, yMax);
            emitRaw(run, coreCut.to, b, yMin, yMax);
        };

        for (const run of plan?.wallRuns ?? []) {
            let cursor = run.spanA;
            const gaps = [...(run.gaps ?? [])].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
            for (const gap of gaps) {
                const lo = Math.max(run.spanA, gap.lo);
                const hi = Math.min(run.spanB, gap.hi);
                if (hi <= lo) continue;
                emit(run, cursor, lo);
                const openingTop = Math.min(run.yBase + run.height, run.yBase + Math.max(1.9, Number(gap.height) || 2.03));
                emit(run, lo, hi, openingTop, run.yBase + run.height);
                cursor = Math.max(cursor, hi);
            }
            emit(run, cursor, run.spanB);
        }
        return segments;
    }

    function registerBuildingPlanInteriorDoors(physics, plan, physicalTruth) {
        const result = [];
        const approachDepth = Math.max(0.85, Number(physicalTruth?.door?.approachDepthSI) || 1.0);
        for (const floor of plan?.floors ?? []) {
            const byKey = new Map((floor.spaces ?? []).map(space => [space.key, space]));
            for (const opening of floor.openings ?? []) {
                if (opening.kind !== 'interior-door') continue;
                const fromSpace = byKey.get(opening.fromSpaceKey);
                const toSpace = byKey.get(opening.toSpaceKey);
                if (!fromSpace || !toSpace) throw new Error(`building plan opening ${opening.id} references missing spaces`);
                const side = opening.axis === 'x' ? 'north' : 'west';
                const portal = {
                    id: `${opening.id}:portal`, kind: 'portal-endpoint',
                    x: opening.x, y: floor.yBase, z: opening.z,
                    width: opening.width, height: opening.height, depth: approachDepth,
                    floorH: floor.floorHeight, side,
                    normalX: side === 'west' ? -1 : 0,
                    normalZ: side === 'north' ? -1 : 0,
                    source: 'building-plan-authority',
                    fromSpaceId: fromSpace.id, toSpaceId: toSpace.id,
                    physicalTruth,
                    dimensionAuthority: 'resolved-physical-truth',
                };
                const connector = createPortalConnector({
                    id: `${opening.id}:connector`, portal,
                    kind: 'door', source: 'building-plan-authority', visualRole: 'interior-doorway',
                    physicalTruth,
                    metadata: {
                        buildingPlanId: plan.deterministicKey,
                        openingId: opening.id,
                        floor: floor.floor,
                        fromSpaceId: fromSpace.id,
                        toSpaceId: toSpace.id,
                    },
                });
                connector.spaceIds = [fromSpace.id, toSpace.id];
                registerSemanticConnector(physics, connector);
                opening.connectorId = connector.id;
                result.push(connector);
            }
        }
        return result;
    }

    function buildingPlanReservationsForModule(plan, module, doorConnectors = []) {
        const result = [];
        const push = reservation => {
            if (!reservation?.id || result.some(existing => existing.id === reservation.id)) return;
            result.push(reservation);
        };
        for (const clearance of plan?.circulationClearances ?? []) {
            if (clearance.moduleKeys?.includes(module.key)) push(clearance);
        }
        const moduleBox = {
            x: module.rect.cx, z: module.rect.cz,
            sx: module.rect.halfX * 2, sz: module.rect.halfZ * 2,
            yMin: 0, yMax: module.floors * (plan?.floors?.[0]?.floorHeight || 3.15),
        };
        for (const connector of doorConnectors) {
            for (const reservation of connector.reservations ?? []) {
                if (reservationIntersectsBox(reservation, moduleBox)) push(reservation);
            }
        }
        return result;
    }

    function addBalcony({ physics, transforms, wallList, fp, y, side }) {
        void wallList;
        const slabT = 0.12;
        const depth = 0.92;
        const family = 'residential-civic-bar';
        const baseId = `balcony:${side}:${fp.cx}:${fp.cz}:${y}`;
        if (side === 'north' || side === 'south') {
            const width = Math.max(1.8, fp.halfX * 1.45);
            const z = fp.cz + (side === 'north' ? -fp.halfZ - depth * 0.5 : fp.halfZ + depth * 0.5);
            transforms.slabs.push({ x: fp.cx, y: y - slabT * 0.5, z, sx: width, sy: slabT, sz: depth });
            addRectPlatform(physics.platforms, fp.cx, z, width, depth, y, 'balcony');
            const innerZ = z + (side === 'north' ? depth * 0.5 : -depth * 0.5);
            const outerZ = z + (side === 'north' ? -depth * 0.5 : depth * 0.5);
            emitGuardSpanFromAuthority({ physics, transforms, id: `${baseId}:outer`, x1: fp.cx - width * 0.5, z1: outerZ, x2: fp.cx + width * 0.5, z2: outerZ, y, family, supportKind: 'balcony-rail' });
            for (const [index, x] of [fp.cx - width * 0.5, fp.cx + width * 0.5].entries()) {
                emitGuardSpanFromAuthority({ physics, transforms, id: `${baseId}:side:${index}`, x1: x, z1: innerZ, x2: x, z2: outerZ, y, family, supportKind: 'balcony-rail' });
            }
        } else {
            const width = Math.max(1.8, fp.halfZ * 1.45);
            const x = fp.cx + (side === 'west' ? -fp.halfX - depth * 0.5 : fp.halfX + depth * 0.5);
            transforms.slabs.push({ x, y: y - slabT * 0.5, z: fp.cz, sx: depth, sy: slabT, sz: width });
            addRectPlatform(physics.platforms, x, fp.cz, depth, width, y, 'balcony');
            const innerX = x + (side === 'west' ? depth * 0.5 : -depth * 0.5);
            const outerX = x + (side === 'west' ? -depth * 0.5 : depth * 0.5);
            emitGuardSpanFromAuthority({ physics, transforms, id: `${baseId}:outer`, x1: outerX, z1: fp.cz - width * 0.5, x2: outerX, z2: fp.cz + width * 0.5, y, family, supportKind: 'balcony-rail' });
            for (const [index, z] of [fp.cz - width * 0.5, fp.cz + width * 0.5].entries()) {
                emitGuardSpanFromAuthority({ physics, transforms, id: `${baseId}:side:${index}`, x1: innerX, z1: z, x2: outerX, z2: z, y, family, supportKind: 'balcony-rail' });
            }
        }
    }

    function realizeExteriorScaffold({ physics, transforms, plan }) {
        if (!plan || plan.fitStatus !== 'fits-resolved-truth') return 0;
        assertCanonicalScaffoldSwitchback(plan);
        if (plan.flights.some(flight => flight.fitClassification !== 'fits-resolved-truth')) {
            throw new Error(`invalid scaffold route escaped planner: ${plan.id}`);
        }
        const routes = physics.scaffoldCirculationRoutes ?? (physics.scaffoldCirculationRoutes = []);
        if (!routes.some(route => route.id === plan.id)) routes.push(plan);
        const slabT = 0.12;
        const horizontalFace = plan.side === 'north' || plan.side === 'south';
        const outward = plan.side === 'north' || plan.side === 'west' ? -1 : 1;

        // Visual support cage is derived from the accepted route envelope. It has
        // no independent layout authority and cannot create an alternate stair.
        const minX = Math.min(...plan.landings.map(landing => landing.x - landing.sx * 0.5));
        const maxX = Math.max(...plan.landings.map(landing => landing.x + landing.sx * 0.5));
        const minZ = Math.min(...plan.landings.map(landing => landing.z - landing.sz * 0.5));
        const maxZ = Math.max(...plan.landings.map(landing => landing.z + landing.sz * 0.5));
        const postH = plan.floors * plan.floorH + 0.75;
        for (const x of [minX, maxX]) {
            for (const z of [minZ, maxZ]) {
                transforms.props.push({ x, y: postH * 0.5, z, sx: 0.10, sy: postH, sz: 0.10, routeId: plan.id });
            }
        }

        for (const landing of plan.landings) {
            transforms.slabs.push({
                x: landing.x, y: landing.y - slabT * 0.5, z: landing.z,
                sx: landing.sx, sy: slabT, sz: landing.sz,
                routeId: plan.id, landingId: landing.id,
            });
            addRectPlatform(physics.platforms, landing.x, landing.z, landing.sx, landing.sz, landing.y, 'scaffold');
            const platform = physics.platforms[physics.platforms.length - 1];
            platform.routeId = plan.id;
            platform.landingId = landing.id;
            const scaffoldSurface = registerExteriorTransportSurface(physics, {
                id: `${landing.id}:street-layer`, kind: 'scaffold-landing-street-layer',
                x: landing.x, z: landing.z, hx: landing.sx * 0.5, hz: landing.sz * 0.5, y: landing.y,
                siteId: plan.siteId ?? null, moduleKey: plan.moduleKey, routeId: plan.id, networkKey: plan.id,
                reachable: true, priority: 'circulation-owned', physicalTruth: plan.physicalTruth,
            });
            platform.surfaceId = scaffoldSurface.id;
            const scaffoldSlabTransform = transforms.slabs[transforms.slabs.length - 1];
            if (scaffoldSlabTransform?.routeId === plan.id && scaffoldSlabTransform?.landingId === landing.id) {
                scaffoldSlabTransform.surfaceId = scaffoldSurface.id;
            }

            // The good scaffold geometry is the authority. Guard the street edge plus
            // the dead-end edge of each full-width landing; leave the facade and run
            // entry open. This turns the old short blocker into the intended L-shaped
            // fire-escape landing guard without ever crossing the A<->B turn path.
            if (horizontalFace) {
                const outerZ = landing.z + outward * landing.sz * 0.5;
                emitTransportRail({
                    physics, transforms, wallList: transforms.wallGroups[0], surfaceId: scaffoldSurface.id,
                    x1: landing.x - landing.sx * 0.5, z1: outerZ,
                    x2: landing.x + landing.sx * 0.5, z2: outerZ,
                    y: landing.y, supportKind: 'scaffold-rail', guardFamily: 'fire-escape-pipe',
                    metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'fire-escape-landing', guardSegmentRole: 'street-edge' },
                });
                for (const [index, x] of [landing.x - landing.sx * 0.5, landing.x + landing.sx * 0.5].entries()) {
                    emitTransportRail({
                        physics, transforms, wallList: transforms.wallGroups[0], surfaceId: scaffoldSurface.id,
                        x1: x, z1: landing.z - landing.sz * 0.5,
                        x2: x, z2: landing.z + landing.sz * 0.5,
                        y: landing.y, supportKind: 'scaffold-rail', guardFamily: 'fire-escape-pipe',
                        metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'fire-escape-landing', guardSegmentRole: `end:${index}` },
                    });
                }
            } else {
                const outerX = landing.x + outward * landing.sx * 0.5;
                emitTransportRail({
                    physics, transforms, wallList: transforms.wallGroups[0], surfaceId: scaffoldSurface.id,
                    x1: outerX, z1: landing.z - landing.sz * 0.5,
                    x2: outerX, z2: landing.z + landing.sz * 0.5,
                    y: landing.y, supportKind: 'scaffold-rail', guardFamily: 'fire-escape-pipe',
                    metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'fire-escape-landing', guardSegmentRole: 'street-edge' },
                });
                for (const [index, z] of [landing.z - landing.sz * 0.5, landing.z + landing.sz * 0.5].entries()) {
                    emitTransportRail({
                        physics, transforms, wallList: transforms.wallGroups[0], surfaceId: scaffoldSurface.id,
                        x1: landing.x - landing.sx * 0.5, z1: z,
                        x2: landing.x + landing.sx * 0.5, z2: z,
                        y: landing.y, supportKind: 'scaffold-rail', guardFamily: 'fire-escape-pipe',
                        metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'fire-escape-landing', guardSegmentRole: `end:${index}` },
                    });
                }
            }

            for (const mouth of [landing.incomingMouth, landing.outgoingMouth]) {
                if (!mouth?.point) continue;
                carveTransportRailGap({
                    physics, transforms, surfaceId: scaffoldSurface.id,
                    point: mouth.point, width: plan.clearWidth + 0.18,
                });
            }

            const openingIds = plan.openings.filter(opening => opening.landingId === landing.id).map(opening => opening.id);
            const connector = createLandingConnector({
                id: `${landing.id}:connector`,
                x: landing.x, z: landing.z,
                halfX: landing.sx * 0.5, halfZ: landing.sz * 0.5,
                y: landing.y,
                source: 'exterior-scaffold',
                visualRole: landing.kind === 'switchback-landing' ? 'fire-escape-turn-landing' : 'fire-escape-landing',
                reservationKind: 'scaffold-landing',
                physicalTruth: plan.physicalTruth,
                metadata: {
                    routeId: plan.id,
                    landingId: landing.id,
                    nodeIds: landing.nodeIds,
                    openingIds,
                    level: landing.level,
                    topology: plan.topology,
                    fitClassification: plan.fitStatus,
                    physicalUse: plan.physicalTruth?.physicalUse ?? null,
                },
            });
            connector.routeId = plan.id;
            connector.landingId = landing.id;
            connector.routeNodeIds = [...landing.nodeIds];
            connector.openingIds = openingIds;
            registerSemanticConnector(physics, connector);
        }

        const scaffoldFlightClearances = physics.fastStairThroats ?? (physics.fastStairThroats = []);
        for (const flight of plan.flights) {
            if (!flight.headroomClearance) throw new Error(`${plan.id}:${flight.id}: scaffold flight headroom clearance missing`);
            scaffoldFlightClearances.push({
                ...flight.headroomClearance,
                routeId: plan.id,
                flightId: flight.id,
                landingId: flight.toLandingId,
                y: flight.y1,
                requiredHeadroom: flight.headroom,
                clearanceKind: 'flight-headroom',
            });
            const ramp = {
                axis: flight.axis,
                from: flight.from,
                to: flight.to,
                fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth,
                y0: flight.y0,
                y1: flight.y1,
                supportKind: 'scaffold',
                routeId: plan.id,
                flightId: flight.id,
            };
            physics.ramps.push(ramp);
            emitFlightGuardPairFromAuthority({
                physics, transforms, idPrefix: `${flight.id}:guard`,
                axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth, y0: flight.y0, y1: flight.y1,
                family: 'fire-escape-pipe', supportKind: 'scaffold-flight-guard',
                metadata: { routeId: plan.id, flightId: flight.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'fire-escape-flight' },
            });
            const connector = createRampConnector({
                id: `${flight.id}:connector`,
                kind: 'fire-escape',
                axis: flight.axis,
                from: flight.from,
                to: flight.to,
                fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth,
                y0: flight.y0,
                y1: flight.y1,
                headroom: flight.headroom,
                source: 'exterior-scaffold',
                visualRole: 'fire-escape-flight',
                reservationKind: 'scaffold-ramp',
                physicalTruth: plan.physicalTruth,
                stairFlight: flight.stairFlight,
                metadata: {
                    routeId: plan.id,
                    flightId: flight.id,
                    fromNodeId: flight.fromNodeId,
                    toNodeId: flight.toNodeId,
                    fromLandingId: flight.fromLandingId,
                    toLandingId: flight.toLandingId,
                    level: flight.level,
                    segment: flight.segment,
                    topology: plan.topology,
                    fitClassification: flight.fitClassification,
                    physicalUse: plan.physicalTruth?.physicalUse ?? null,
                },
            });
            connector.routeId = plan.id;
            connector.flightId = flight.id;
            connector.fromNodeId = flight.fromNodeId;
            connector.toNodeId = flight.toNodeId;
            connector.fromLandingId = flight.fromLandingId;
            connector.toLandingId = flight.toLandingId;
            registerSemanticConnector(physics, connector);

            const steps = flight.stairFlight.stepCount;
            const stepThickness = Math.min(0.14, Math.max(0.075, flight.stairFlight.riserHeight * 0.62));
            for (let i = 0; i < steps; i++) {
                const t = (i + 0.5) / steps;
                const along = flight.from + (flight.to - flight.from) * t;
                const stepY = flight.y0 + flight.stairFlight.riserHeight * (i + 1) - stepThickness * 0.5;
                transforms.steps.push(flight.axis === 'x'
                    ? { x: along, y: stepY, z: flight.fixedCoord, sx: flight.run / steps * 1.08, sy: stepThickness, sz: flight.clearWidth, routeId: plan.id, flightId: flight.id }
                    : { x: flight.fixedCoord, y: stepY, z: along, sx: flight.clearWidth, sy: stepThickness, sz: flight.run / steps * 1.08, routeId: plan.id, flightId: flight.id });
            }
        }
        return plan.landings.length;
    }

    function rectPiecesMinusGap(rect, gap) {
        const full = { x: Number(rect.x), z: Number(rect.z), hx: Number(rect.hx), hz: Number(rect.hz) };
        if (!gap || ![full.x, full.z, full.hx, full.hz].every(Number.isFinite) || full.hx <= 0 || full.hz <= 0) return [full];
        const x0 = full.x - full.hx, x1 = full.x + full.hx;
        const z0 = full.z - full.hz, z1 = full.z + full.hz;
        const gx0 = Math.max(x0, Number(gap.x) - Number(gap.hx));
        const gx1 = Math.min(x1, Number(gap.x) + Number(gap.hx));
        const gz0 = Math.max(z0, Number(gap.z) - Number(gap.hz));
        const gz1 = Math.min(z1, Number(gap.z) + Number(gap.hz));
        if (!(gx1 > gx0 + 0.02) || !(gz1 > gz0 + 0.02)) return [full];
        const pieces = [];
        const push = (ax0, ax1, az0, az1) => {
            if (!(ax1 > ax0 + 0.04) || !(az1 > az0 + 0.04)) return;
            pieces.push({ x: (ax0 + ax1) * 0.5, z: (az0 + az1) * 0.5, hx: (ax1 - ax0) * 0.5, hz: (az1 - az0) * 0.5 });
        };
        push(x0, gx0, z0, z1);
        push(gx1, x1, z0, z1);
        push(gx0, gx1, z0, gz0);
        push(gx0, gx1, gz1, z1);
        return pieces;
    }

    function exteriorTransportSurfaces(physics) {
        return physics.exteriorTransportSurfaces ?? (physics.exteriorTransportSurfaces = []);
    }

    function registerExteriorTransportSurface(physics, raw) {
        const registry = exteriorTransportSurfaces(physics);
        const existing = registry.find(surface => surface.id === raw.id);
        if (existing) return existing;
        const surface = normalizeTransportSurface(raw);
        registry.push(surface);
        return surface;
    }

    function transportRectIntersection(a, b) {
        const minX = Math.max(a.x - a.hx, b.x - b.hx);
        const maxX = Math.min(a.x + a.hx, b.x + b.hx);
        const minZ = Math.max(a.z - a.hz, b.z - b.hz);
        const maxZ = Math.min(a.z + a.hz, b.z + b.hz);
        if (!(maxX > minX + 0.02) || !(maxZ > minZ + 0.02)) return null;
        return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5, hx: (maxX - minX) * 0.5, hz: (maxZ - minZ) * 0.5 };
    }

    function piecesMinusCuts(rect, cuts) {
        let pieces = [rect];
        for (const cut of cuts) pieces = pieces.flatMap(piece => rectPiecesMinusGap(piece, cut));
        return pieces;
    }

    function guardSpanRegistry(physics) {
        return physics.guardSpans ?? (physics.guardSpans = []);
    }

    function publishGuardPlan({ physics, transforms, plan, supportKind, surfaceId = null, metadata = null }) {
        if (!plan) return null;
        if (!physics || !transforms || !Array.isArray(transforms.guardMetal) || !Array.isArray(transforms.guardConcrete)) {
            throw new Error(String(plan.id ?? 'guard') + ': guard render transforms are required');
        }
        const shared = {
            guardSpanId: plan.id,
            guardFamily: plan.family,
            guardConstruction: plan.construction,
            supportKind,
            surfaceId,
            ...(metadata || {}),
        };
        for (const primitive of plan.visual ?? []) {
            const bucket = primitive.material === 'concrete' ? transforms.guardConcrete : transforms.guardMetal;
            bucket.push({ ...primitive, ...shared });
        }
        physics.mazeWalls.push({ ...plan.collision, ...shared, transportRailId: surfaceId ? plan.id : null });
        guardSpanRegistry(physics).push({
            id: plan.id,
            family: plan.family,
            construction: plan.construction,
            role: plan.role ?? metadata?.guardRole ?? 'edge',
            axis: plan.axis,
            from: plan.from,
            to: plan.to,
            fixedCoord: plan.fixedCoord,
            y0: plan.y0,
            y1: plan.y1,
            visualPrimitiveCount: plan.visual?.length ?? 0,
            ...shared,
        });
        return plan.id;
    }

    function emitGuardSpanFromAuthority({
        physics, transforms, id, x1, z1, x2, z2, y,
        family = 'residential-civic-bar', supportKind = 'guard', surfaceId = null, metadata = null,
    }) {
        return publishGuardPlan({
            physics, transforms,
            plan: planHorizontalGuardSpan({ id, x1, z1, x2, z2, y, family }),
            supportKind, surfaceId, metadata,
        });
    }

    function reconcileTransportPlatformOwnership({ physics, transforms }) {
        const surfaceIds = new Set(exteriorTransportSurfaces(physics).map(surface => surface.id));
        const platforms = physics.platforms ?? [];
        const transport = platforms.filter(platform => platform.surfaceId && surfaceIds.has(platform.surfaceId));
        if (!transport.length) return { before: 0, after: 0, splitPieces: 0 };
        const untouched = platforms.filter(platform => !(platform.surfaceId && surfaceIds.has(platform.surfaceId)));
        const accepted = [];
        const rebuilt = [];
        let splitPieces = 0;
        for (const platform of transport) {
            const cuts = accepted
                .filter(other => Math.abs(Number(other.y) - Number(platform.y)) <= 0.06)
                .map(other => transportRectIntersection(other, platform))
                .filter(Boolean);
            const pieces = piecesMinusCuts(
                { x: platform.x, z: platform.z, hx: platform.hx, hz: platform.hz },
                cuts,
            );
            if (pieces.length > 1 || (cuts.length && pieces.length !== 1)) splitPieces += pieces.length;
            for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
                const piece = pieces[pieceIndex];
                const next = { ...platform, ...piece, pieceIndex };
                rebuilt.push(next);
                accepted.push(next);
            }
        }
        physics.platforms = [...untouched, ...rebuilt];

        const slabTemplates = new Map();
        for (const slab of transforms.slabs ?? []) {
            if (slab.surfaceId && surfaceIds.has(slab.surfaceId) && !slabTemplates.has(slab.surfaceId)) {
                slabTemplates.set(slab.surfaceId, slab);
            }
        }
        transforms.slabs = (transforms.slabs ?? []).filter(slab => !(slab.surfaceId && surfaceIds.has(slab.surfaceId)));
        for (const platform of rebuilt) {
            const template = slabTemplates.get(platform.surfaceId);
            if (!template) continue;
            const thickness = Number(template.sy) || 0.12;
            transforms.slabs.push({
                ...template,
                x: platform.x,
                y: Number(platform.y) - thickness * 0.5,
                z: platform.z,
                sx: platform.hx * 2,
                sy: thickness,
                sz: platform.hz * 2,
                pieceIndex: platform.pieceIndex,
            });
        }
        return { before: transport.length, after: rebuilt.length, splitPieces };
    }

    function emitTransportRail({
        physics, transforms, wallList, surfaceId, x1, z1, x2, z2, y,
        height = null, thickness = null, supportKind = 'transport-rail', guardFamily = null, metadata = null,
    }) {
        void wallList; void height; void thickness;
        if (!surfaceId) return null;
        const serial = (physics.transportRailSerial = (physics.transportRailSerial ?? 0) + 1);
        const id = `transport-rail:${surfaceId}:${serial}`;
        const family = guardFamily ?? guardFamilyForContext({
            supportKind,
            visualRole: metadata?.visualRole,
            physicalUse: metadata?.physicalUse,
            kind: metadata?.transportKind,
        });
        return emitGuardSpanFromAuthority({
            physics, transforms, id, surfaceId, x1, z1, x2, z2, y,
            family, supportKind, metadata,
        });
    }

    function emitFlightGuardPairFromAuthority({
        physics, transforms, idPrefix, axis, from, to, fixedCoord, halfWidth, y0, y1,
        family, supportKind = 'stair-guard', metadata = null,
    }) {
        const resolvedFamily = family ?? guardFamilyForContext({
            supportKind,
            visualRole: metadata?.visualRole,
            physicalUse: metadata?.physicalUse,
        });
        const plans = planFlightGuardPair({
            id: idPrefix, axis, from, to, fixedCoord, halfWidth, y0, y1,
            family: resolvedFamily,
        });
        for (const plan of plans) publishGuardPlan({
            physics, transforms, plan, supportKind, surfaceId: null,
            metadata: { guardRole: 'flight-side', ...(metadata || {}) },
        });
        return plans.length;
    }

    function realizeInteriorSwitchbackStory({
        physics, transforms, core, floor, y0, y1, guardFamily, metadata = null, treadVisualBudget = Infinity,
    }) {
        const slabT = BUILDING_SLAB_THICKNESS;
        const addLanding = (landing, y, supportKind, landingRole) => {
            physics.platforms.push({
                x: landing.x, z: landing.z, hx: landing.hx, hz: landing.hz, y,
                supportKind, supportMargin: 0, blocksFromBelow: false,
                stairTopology: core.topology, floor, landingRole, ...(metadata || {}),
            });
            transforms.slabs.push({
                x: landing.x, y: y - slabT * 0.5, z: landing.z,
                sx: landing.sx, sy: slabT, sz: landing.sz,
                stairTopology: core.topology, floor, landingRole, ...(metadata || {}),
            });
        };

        // The story slab itself owns the low-side floor landing. Only true
        // intermediate turns are separate platforms; this prevents a seam/gap
        // where a floating landing used to merely touch the floor edge.
        for (const landing of core.intermediateLandings) {
            const landingY = y0 + (y1 - y0) * landing.yFraction;
            addLanding(landing.geometry, landingY, 'compound-stair-mid-landing', landing.sideRole);
        }

        for (const flight of core.flights) {
            const flightY0 = y0 + (y1 - y0) * flight.y0Fraction;
            const flightY1 = y0 + (y1 - y0) * flight.y1Fraction;
            physics.ramps.push({
                axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
                halfWidth: core.halfWidth, y0: flightY0, y1: flightY1,
                supportKind: 'compound-stair', stairTopology: core.topology, floor, flightId: flight.id, ...(metadata || {}),
            });
            const steps = core.segmentFlight.stepCount;
            const visualStepCount = Number.isFinite(treadVisualBudget)
                ? Math.max(0, Math.min(steps, Math.floor(treadVisualBudget)))
                : steps;
            const stepThickness = Math.min(0.14, Math.max(0.075, core.segmentFlight.riserHeight * 0.62));
            for (let visualIndex = 0; visualIndex < visualStepCount; visualIndex++) {
                const i = Math.min(steps - 1, Math.floor(((visualIndex + 0.5) * steps) / visualStepCount));
                const t = (i + 0.5) / steps;
                const along = flight.from + (flight.to - flight.from) * t;
                const stepY = flightY0 + core.segmentFlight.riserHeight * (i + 1) - stepThickness * 0.5;
                const runStep = Math.abs(flight.to - flight.from) / steps * 1.06;
                transforms.steps.push(flight.axis === 'z'
                    ? { x: flight.fixedCoord, y: stepY, z: along, sx: core.clearWidth, sy: stepThickness, sz: runStep, stairTopology: core.topology, floor, flightId: flight.id }
                    : { x: along, y: stepY, z: flight.fixedCoord, sx: runStep, sy: stepThickness, sz: core.clearWidth, stairTopology: core.topology, floor, flightId: flight.id });
            }
            const direction = Math.sign(flight.to - flight.from) || 1;
            const guardFrom = flight.from + direction * core.guardMouthClearance;
            const guardTo = flight.to - direction * core.guardMouthClearance;
            if (Math.abs(guardTo - guardFrom) > 0.20) emitFlightGuardPairFromAuthority({
                physics, transforms, idPrefix: `${metadata?.stairId ?? "interior-stair"}:${floor}:${flight.id}:guard`,
                axis: flight.axis, from: guardFrom, to: guardTo, fixedCoord: flight.fixedCoord,
                halfWidth: core.halfWidth, y0: flightY0, y1: flightY1,
                family: guardFamily, supportKind: "compound-stair-guard",
                metadata: { ...(metadata || {}), floor, flightId: flight.id, visualRole: "interior-stair" },
            });
        }
        for (const landing of core.intermediateLandings) {
            const landingY = y0 + (y1 - y0) * landing.yFraction;
            const back = landing.backGuard;
            emitGuardSpanFromAuthority({
                physics, transforms, id: `${metadata?.stairId ?? "interior-stair"}:${floor}:${landing.id}:back-guard`,
                x1: back.x1, z1: back.z1, x2: back.x2, z2: back.z2, y: landingY,
                family: guardFamily, supportKind: "compound-stair-mid-landing-guard",
                metadata: { ...(metadata || {}), floor, landingId: landing.id, visualRole: "interior-stair-mid-landing" },
            });
        }
    }
    function removeGuardArtifacts({ physics, transforms, guardSpanId }) {
        if (!guardSpanId) return;
        transforms.guardMetal = (transforms.guardMetal ?? []).filter(item => item.guardSpanId !== guardSpanId);
        transforms.guardConcrete = (transforms.guardConcrete ?? []).filter(item => item.guardSpanId !== guardSpanId);
        physics.guardSpans = (physics.guardSpans ?? []).filter(item => item.id !== guardSpanId);
    }

    function carveTransportRailGap({ physics, transforms, surfaceId, point, width }) {
        if (!surfaceId || !point || !(width > 0)) return 0;
        const openingWidth = guardOpeningWidth(width, { playerRadius: traversalEnvelope.playerRadius });
        const matches = [...(physics.mazeWalls ?? [])].filter(wall => wall.surfaceId === surfaceId && wall.transportRailId);
        let carved = 0;
        for (const wall of matches) {
            const sourcePlan = planHorizontalGuardSpan({
                id: wall.transportRailId,
                x1: wall.x1, z1: wall.z1, x2: wall.x2, z2: wall.z2,
                y: wall.yMin,
                family: wall.guardFamily ?? guardFamilyForContext({ supportKind: wall.supportKind, physicalUse: wall.physicalUse }),
            });
            const pieces = splitHorizontalGuardSpan({ span: sourcePlan, point, width: openingWidth });
            if (pieces.length === 1 && pieces[0] === sourcePlan) continue;
            const wallIndex = physics.mazeWalls.indexOf(wall);
            if (wallIndex >= 0) physics.mazeWalls.splice(wallIndex, 1);
            removeGuardArtifacts({ physics, transforms, guardSpanId: wall.transportRailId });
            const metadata = {
                routeId: wall.routeId ?? null,
                landingId: wall.landingId ?? null,
                bridgeId: wall.bridgeId ?? null,
                moduleKey: wall.moduleKey ?? null,
                side: wall.side ?? null,
                physicalUse: wall.physicalUse ?? null,
                visualRole: wall.visualRole ?? null,
                transportKind: wall.transportKind ?? null,
                transportLinkId: wall.transportLinkId ?? null,
                guardSegmentRole: wall.guardSegmentRole ?? null,
            };
            for (const piece of pieces) publishGuardPlan({
                physics, transforms, plan: piece,
                supportKind: wall.supportKind ?? 'transport-rail',
                surfaceId,
                metadata,
            });
            carved++;
        }
        return carved;
    }

    function publishTransportSurfaceSlab({ physics, transforms, rawSurface, supportKind = 'exterior-transport-link', slabT = 0.12 }) {
        const registry = exteriorTransportSurfaces(physics);
        const overlaps = registry.filter(surface => Math.abs(surface.y - rawSurface.y) <= 0.12)
            .map(surface => ({ surface, cut: transportRectIntersection(surface, rawSurface) }))
            .filter(item => item.cut);
        const throatCuts = (physics.fastStairThroats ?? [])
            .filter(throat => Math.abs(Number(throat.y) - Number(rawSurface.y)) <= 0.06)
            .map(throat => transportRectIntersection({
                ...throat,
                hx: Number(throat.hx) + 0.08,
                hz: Number(throat.hz) + 0.08,
            }, rawSurface))
            .filter(Boolean);
        const pieces = piecesMinusCuts(
            { x: rawSurface.x, z: rawSurface.z, hx: rawSurface.hx, hz: rawSurface.hz },
            [...overlaps.map(item => item.cut), ...throatCuts],
        );
        const surface = registerExteriorTransportSurface(physics, rawSurface);
        for (let i = 0; i < pieces.length; i++) {
            const piece = pieces[i];
            physics.platforms.push({ x: piece.x, z: piece.z, hx: piece.hx, hz: piece.hz, y: surface.y, supportKind, surfaceId: surface.id, pieceIndex: i });
            transforms.slabs.push({ x: piece.x, y: surface.y - slabT * 0.5, z: piece.z, sx: piece.hx * 2, sy: slabT, sz: piece.hz * 2, surfaceId: surface.id, pieceIndex: i });
        }
        return { surface, overlaps: overlaps.map(item => item.surface), pieces };
    }

    function smoothTransportUnion({ physics, transforms, a, b, intersection = null, width = null }) {
        const cut = intersection ?? transportSurfaceIntersection(a, b) ?? transportRectIntersection(a, b);
        if (!cut) return 0;
        const openingWidth = width ?? Math.max(0.90, Math.min(cut.hx * 2, cut.hz * 2, 1.65));
        const point = { x: cut.x, z: cut.z };
        return carveTransportRailGap({ physics, transforms, surfaceId: a.id, point, width: openingWidth })
            + carveTransportRailGap({ physics, transforms, surfaceId: b.id, point, width: openingWidth });
    }

    function reserveTransportJunction({ physics, surface, point, width, id, peerSurfaceId = null }) {
        if (!surface || !point || !(width > 0)) return null;
        const half = Math.max(0.38, width * 0.55);
        const connector = createLandingConnector({
            id, x: point.x, z: point.z,
            halfX: Math.min(surface.hx, half), halfZ: Math.min(surface.hz, half), y: surface.y,
            source: 'exterior-transport-network', visualRole: 'street-layer-junction',
            reservationKind: 'exterior-transport-junction', physicalTruth: surface.physicalTruth,
            metadata: { surfaceId: surface.id, peerSurfaceId },
        });
        registerSemanticConnector(physics, connector);
        return connector;
    }

    function realizeExteriorTransportNetwork({ physics, transforms, stableKey }) {
        const surfaceOwnership = reconcileTransportPlatformOwnership({ physics, transforms });
        const surfaces = exteriorTransportSurfaces(physics);
        const plan = planExteriorTransportNetwork({
            surfaces, blockedRects: physics.fastStairThroats ?? [],
            maxLinks: 10, maxStairLinks: 6, stableKey,
        });
        const byId = new Map(surfaces.map(surface => [surface.id, surface]));
        const edgeRegistry = physics.exteriorTransportEdges ?? (physics.exteriorTransportEdges = []);
        let realized = 0;
        let stairLinks = 0;
        let walkwayLinks = 0;
        let unions = 0;
        for (const link of plan.links) {
            const a = byId.get(link.aId), b = byId.get(link.bId);
            if (!a || !b) continue;
            if (link.kind === 'surface-union') {
                smoothTransportUnion({ physics, transforms, a, b, intersection: link.intersection });
                reserveTransportJunction({
                    physics, surface: a, point: { x: link.intersection.x, z: link.intersection.z },
                    width: Math.max(0.90, Math.min(link.intersection.hx * 2, link.intersection.hz * 2, 1.65)),
                    id: `${link.id}:junction`, peerSurfaceId: b.id,
                });
                edgeRegistry.push({ ...link, source: 'surface-union' });
                unions++;
                realized++;
                continue;
            }
            if (link.kind === 'walkway-link') {
                const from = Math.min(link.aEdge, link.bEdge), to = Math.max(link.aEdge, link.bEdge);
                const span = to - from;
                if (!(span > 0.08)) continue;
                const surfaceId = `${link.id}:surface`;
                const rawSurface = link.axis === 'x'
                    ? { id: surfaceId, kind: 'street-layer-link', x: (from + to) * 0.5, z: link.fixedCoord, hx: span * 0.5, hz: link.halfWidth, y: link.y0,
                        routeId: link.id, networkKey: link.id, reachable: true, physicalTruth: a.physicalTruth ?? b.physicalTruth }
                    : { id: surfaceId, kind: 'street-layer-link', x: link.fixedCoord, z: (from + to) * 0.5, hx: link.halfWidth, hz: span * 0.5, y: link.y0,
                        routeId: link.id, networkKey: link.id, reachable: true, physicalTruth: a.physicalTruth ?? b.physicalTruth };
                const published = publishTransportSurfaceSlab({ physics, transforms, rawSurface, supportKind: 'street-layer-link' });
                const s = published.surface;
                if (link.axis === 'x') {
                    for (const z of [s.z - s.hz, s.z + s.hz]) emitTransportRail({ physics, transforms, wallList: transforms.wallGroups[0], surfaceId: s.id, x1: s.x - s.hx, z1: z, x2: s.x + s.hx, z2: z, y: s.y });
                } else {
                    for (const x of [s.x - s.hx, s.x + s.hx]) emitTransportRail({ physics, transforms, wallList: transforms.wallGroups[0], surfaceId: s.id, x1: x, z1: s.z - s.hz, x2: x, z2: s.z + s.hz, y: s.y });
                }
                carveTransportRailGap({ physics, transforms, surfaceId: a.id, point: link.aPoint, width: link.clearWidth + 0.18 });
                carveTransportRailGap({ physics, transforms, surfaceId: b.id, point: link.bPoint, width: link.clearWidth + 0.18 });
                reserveTransportJunction({ physics, surface: a, point: link.aPoint, width: link.clearWidth,
                    id: `${link.id}:a-junction`, peerSurfaceId: b.id });
                reserveTransportJunction({ physics, surface: b, point: link.bPoint, width: link.clearWidth,
                    id: `${link.id}:b-junction`, peerSurfaceId: a.id });
                for (const overlap of published.overlaps) smoothTransportUnion({ physics, transforms, a: s, b: overlap });
                registerSemanticConnector(physics, createBridgeConnector({
                    id: `${link.id}:connector`, axis: link.axis, from: link.aEdge, to: link.bEdge,
                    fixedCoord: link.fixedCoord, halfWidth: link.halfWidth, y: link.y0,
                    source: 'exterior-transport-network', visualRole: 'street-layer-link',
                    physicalTruth: a.physicalTruth ?? b.physicalTruth,
                    metadata: { transportLinkId: link.id, aSurfaceId: a.id, bSurfaceId: b.id },
                }));
                edgeRegistry.push({ ...link, surfaceId: s.id, source: 'walkway-link' });
                walkwayLinks++;
                realized++;
                continue;
            }
            if (link.kind === 'stair-link') {
                const lower = byId.get(link.lowerId), upper = byId.get(link.upperId);
                if (!lower || !upper) continue;
                physics.ramps.push({
                    axis: link.axis, from: link.from, to: link.to, fixedCoord: link.fixedCoord,
                    halfWidth: link.halfWidth, y0: link.y0, y1: link.y1,
                    supportKind: 'exterior-transport-stair', transportLinkId: link.id,
                });
                registerSemanticConnector(physics, createRampConnector({
                    id: `${link.id}:connector`, kind: 'stair', reservationKind: 'exterior-transport-stair-sweep',
                    axis: link.axis, from: link.from, to: link.to, fixedCoord: link.fixedCoord,
                    halfWidth: link.halfWidth, y0: link.y0, y1: link.y1,
                    headroom: link.physicalTruth?.stair?.headroomSI,
                    source: 'exterior-transport-network', visualRole: 'street-layer-to-street-layer-stair',
                    physicalTruth: link.physicalTruth, stairFlight: link.stairFlight,
                    metadata: { transportLinkId: link.id, lowerSurfaceId: lower.id, upperSurfaceId: upper.id },
                }));
                const steps = link.stairFlight.stepCount;
                const stepThickness = Math.min(0.14, Math.max(0.075, link.stairFlight.riserHeight * 0.62));
                for (let i = 0; i < steps; i++) {
                    const t = (i + 0.5) / steps;
                    const along = link.from + (link.to - link.from) * t;
                    const stepY = link.y0 + link.stairFlight.riserHeight * (i + 1) - stepThickness * 0.5;
                    transforms.steps.push(link.axis === 'x'
                        ? { x: along, y: stepY, z: link.fixedCoord, sx: link.gap / steps * 1.06, sy: stepThickness, sz: link.clearWidth, transportLinkId: link.id }
                        : { x: link.fixedCoord, y: stepY, z: along, sx: link.clearWidth, sy: stepThickness, sz: link.gap / steps * 1.06, transportLinkId: link.id });
                }
                emitFlightGuardPairFromAuthority({
                    physics, transforms, idPrefix: `${link.id}:guard`,
                    axis: link.axis, from: link.from, to: link.to, fixedCoord: link.fixedCoord,
                    halfWidth: link.halfWidth, y0: link.y0, y1: link.y1,
                    family: guardFamilyForContext({ supportKind: 'exterior-transport-stair', visualRole: 'street-layer-to-street-layer-stair', physicalUse: link.physicalTruth?.physicalUse }),
                    supportKind: 'exterior-transport-stair-guard',
                    metadata: { transportLinkId: link.id, physicalUse: link.physicalTruth?.physicalUse, visualRole: 'street-layer-to-street-layer-stair' },
                });
                carveTransportRailGap({ physics, transforms, surfaceId: lower.id, point: link.lowerPoint, width: link.clearWidth + 0.20 });
                carveTransportRailGap({ physics, transforms, surfaceId: upper.id, point: link.upperPoint, width: link.clearWidth + 0.20 });
                reserveTransportJunction({ physics, surface: lower, point: link.lowerPoint, width: link.clearWidth,
                    id: `${link.id}:lower-junction`, peerSurfaceId: upper.id });
                reserveTransportJunction({ physics, surface: upper, point: link.upperPoint, width: link.clearWidth,
                    id: `${link.id}:upper-junction`, peerSurfaceId: lower.id });
                edgeRegistry.push({ ...link, source: 'stair-link' });
                stairLinks++;
                realized++;
            }
        }
        physics.exteriorTransportNetwork = { ...plan, realized, stairLinks, walkwayLinks, unions, surfaceOwnership };
        return physics.exteriorTransportNetwork;
    }

    function realizeFastVerticalRoute({ physics, transforms, wallList, plan }) {
        assertFastVerticalRoute(plan);
        const routeRegistry = physics.fastVerticalRoutes ?? (physics.fastVerticalRoutes = []);
        if (!routeRegistry.some(route => route.id === plan.id)) routeRegistry.push(plan);
        const clearanceRegistry = physics.fastStairThroats ?? (physics.fastStairThroats = []);

        let realizedFlights = 0;
        let realizedLandings = 0;
        let realizedDecks = 0;
        for (const flight of plan.flights) {
            physics.ramps.push({
                axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth, y0: flight.y0, y1: flight.y1,
                supportKind: 'broad-vertical-stair', routeId: plan.id, flightId: flight.id,
            });
            const connector = createRampConnector({
                id: `${flight.id}:connector`,
                kind: 'stair',
                axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth, y0: flight.y0, y1: flight.y1,
                headroom: flight.headroom,
                source: 'broad-vertical-route',
                visualRole: plan.family,
                reservationKind: 'broad-vertical-ramp',
                physicalTruth: plan.physicalTruth,
                stairFlight: flight.stairFlight,
                metadata: {
                    routeId: plan.id, family: plan.family, shape: plan.shape,
                    graphAuthority: plan.graphAuthority ?? null,
                    fromLandingId: flight.fromLandingId, toLandingId: flight.toLandingId,
                    lowerSupport: plan.lowerSupport, upperSupport: plan.upperSupport,
                    fitClassification: flight.fitClassification,
                },
            });
            connector.routeId = plan.id;
            connector.flightId = flight.id;
            connector.fromLandingId = flight.fromLandingId;
            connector.toLandingId = flight.toLandingId;
            registerSemanticConnector(physics, connector);

            const steps = flight.stairFlight.stepCount;
            const stepThickness = Math.min(0.14, Math.max(0.075, flight.stairFlight.riserHeight * 0.62));
            for (let i = 0; i < steps; i++) {
                const t = (i + 0.5) / steps;
                const along = flight.from + (flight.to - flight.from) * t;
                const stepY = flight.y0 + flight.stairFlight.riserHeight * (i + 1) - stepThickness * 0.5;
                transforms.steps.push(flight.axis === 'x'
                    ? { x: along, y: stepY, z: flight.fixedCoord, sx: flight.run / steps * 1.08, sy: stepThickness, sz: flight.clearWidth, routeId: plan.id, flightId: flight.id }
                    : { x: flight.fixedCoord, y: stepY, z: along, sx: flight.clearWidth, sy: stepThickness, sz: flight.run / steps * 1.08, routeId: plan.id, flightId: flight.id });
            }
            emitFlightGuardPairFromAuthority({
                physics, transforms, idPrefix: `${flight.id}:guard`,
                axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
                halfWidth: flight.halfWidth, y0: flight.y0, y1: flight.y1,
                family: guardFamilyForContext({ supportKind: 'broad-vertical-stair', visualRole: plan.family, physicalUse: plan.physicalTruth?.physicalUse }),
                supportKind: 'broad-vertical-stair-guard',
                metadata: { routeId: plan.id, flightId: flight.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: plan.family },
            });
            if (!flight.headroomClearance) throw new Error(`${plan.id}:${flight.id}: flight headroom clearance missing`);
            clearanceRegistry.push({
                ...flight.headroomClearance,
                routeId: plan.id,
                flightId: flight.id,
                landingId: flight.toLandingId,
                y: flight.y1,
                requiredHeadroom: flight.headroom,
                clearanceKind: 'flight-headroom',
            });
            realizedFlights++;
        }

        const deckRegistry = physics.fastExteriorDecks ?? (physics.fastExteriorDecks = []);
        for (const landing of plan.generatedLandings) {
            const geometry = landing.geometry;
            if (landing.stairThroat) throw new Error(`${plan.id}:${landing.id}: landing carve is forbidden`);
            const throat = null;
            const rawDeckUnionSurface = {
                id: `${landing.id}:deck`, kind: 'balcony-street-layer',
                x: geometry.x, z: geometry.z, hx: geometry.hx, hz: geometry.hz, y: landing.y,
                siteId: plan.siteId ?? null, moduleKey: plan.moduleKey, routeId: plan.id, networkKey: plan.id,
                reachable: true, priority: 'circulation-owned', physicalTruth: plan.physicalTruth,
                stairThroat: throat,
            };
            const deckOverlapCuts = exteriorTransportSurfaces(physics)
                .filter(surface => Math.abs(surface.y - landing.y) <= 0.12)
                .map(surface => ({ surface, cut: transportRectIntersection(surface, rawDeckUnionSurface) }))
                .filter(item => item.cut);
            const pieces = piecesMinusCuts(
                { x: geometry.x, z: geometry.z, hx: geometry.hx, hz: geometry.hz },
                [ ...(throat ? [throat] : []), ...deckOverlapCuts.map(item => item.cut) ],
            );
            if (!pieces.length && deckOverlapCuts.length === 0) {
                throw new Error(`${plan.id}:${landing.id}: stair throat consumed the entire street-layer deck`);
            }
            for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
                const piece = pieces[pieceIndex];
                physics.platforms.push({
                    x: piece.x, z: piece.z, hx: piece.hx, hz: piece.hz, y: landing.y,
                    supportKind: 'broad-vertical-landing', deckKind: 'exterior-street-layer',
                    routeId: plan.id, landingId: landing.id, pieceIndex,
                    surfaceId: `${landing.id}:deck`,
                });
                transforms.slabs.push({
                    x: piece.x, y: landing.y - 0.07, z: piece.z,
                    sx: piece.hx * 2, sy: 0.14, sz: piece.hz * 2,
                    routeId: plan.id, landingId: landing.id, pieceIndex, deckKind: 'exterior-street-layer',
                    surfaceId: `${landing.id}:deck`,
                });
            }
            const deckSurfaceId = `${landing.id}:deck`;
            const deckSurface = registerExteriorTransportSurface(physics, {
                id: deckSurfaceId,
                kind: 'balcony-street-layer',
                x: geometry.x, z: geometry.z, hx: geometry.hx, hz: geometry.hz, y: landing.y,
                siteId: plan.siteId ?? null, moduleKey: plan.moduleKey, routeId: plan.id, networkKey: plan.id,
                reachable: true, priority: 'circulation-owned', physicalTruth: plan.physicalTruth,
                stairThroat: throat,
            });

            // Balcony/street layers get three outward guards. The building edge stays
            // open for doors; any real stair/catwalk/roof junction cuts these semantic
            // spans and regenerates clean rail ends/posts.
            const deckGuardFamily = guardFamilyForContext({
                supportKind: 'transport-rail', visualRole: 'balcony-street-layer', physicalUse: plan.physicalTruth?.physicalUse,
            });
            const outward = plan.orientation?.outward ?? 0;
            if (outward && plan.orientation?.normalAxis === 'z') {
                const innerZ = geometry.z - outward * geometry.hz;
                const outerZ = geometry.z + outward * geometry.hz;
                emitTransportRail({ physics, transforms, wallList, surfaceId: deckSurface.id,
                    x1: geometry.x - geometry.hx, z1: outerZ, x2: geometry.x + geometry.hx, z2: outerZ,
                    y: landing.y, supportKind: 'transport-rail', guardFamily: deckGuardFamily,
                    metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'balcony-street-layer', guardSegmentRole: 'outer' } });
                for (const [index, x] of [geometry.x - geometry.hx, geometry.x + geometry.hx].entries()) {
                    emitTransportRail({ physics, transforms, wallList, surfaceId: deckSurface.id,
                        x1: x, z1: innerZ, x2: x, z2: outerZ,
                        y: landing.y, supportKind: 'transport-rail', guardFamily: deckGuardFamily,
                        metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'balcony-street-layer', guardSegmentRole: `side:${index}` } });
                }
            } else if (outward && plan.orientation?.normalAxis === 'x') {
                const innerX = geometry.x - outward * geometry.hx;
                const outerX = geometry.x + outward * geometry.hx;
                emitTransportRail({ physics, transforms, wallList, surfaceId: deckSurface.id,
                    x1: outerX, z1: geometry.z - geometry.hz, x2: outerX, z2: geometry.z + geometry.hz,
                    y: landing.y, supportKind: 'transport-rail', guardFamily: deckGuardFamily,
                    metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'balcony-street-layer', guardSegmentRole: 'outer' } });
                for (const [index, z] of [geometry.z - geometry.hz, geometry.z + geometry.hz].entries()) {
                    emitTransportRail({ physics, transforms, wallList, surfaceId: deckSurface.id,
                        x1: innerX, z1: z, x2: outerX, z2: z,
                        y: landing.y, supportKind: 'transport-rail', guardFamily: deckGuardFamily,
                        metadata: { routeId: plan.id, landingId: landing.id, physicalUse: plan.physicalTruth?.physicalUse, visualRole: 'balcony-street-layer', guardSegmentRole: `side:${index}` } });
                }
            }
            // PERF: mouth coordinates are already O(1) planner outputs; do not rescan
            // every route flight for every landing just to rediscover an endpoint.
            for (const mouth of [landing.incomingMouth, landing.outgoingMouth]) {
                if (!mouth?.point) continue;
                carveTransportRailGap({
                    physics, transforms, surfaceId: deckSurface.id,
                    point: mouth.point, width: (Number(plan.physicalTruth?.stair?.widthSI) || 0.9) + 0.18,
                });
            }
            for (const overlap of deckOverlapCuts) {
                smoothTransportUnion({ physics, transforms, a: deckSurface, b: overlap.surface, intersection: overlap.cut });
            }

            const connector = createLandingConnector({
                id: `${landing.id}:connector`,
                x: geometry.x, z: geometry.z, halfX: geometry.hx, halfZ: geometry.hz, y: landing.y,
                source: 'broad-vertical-route',
                visualRole: `${plan.family}-street-layer`,
                reservationKind: 'broad-vertical-landing',
                physicalTruth: plan.physicalTruth,
                metadata: {
                    routeId: plan.id, landingId: landing.id, family: plan.family, shape: plan.shape,
                    graphAuthority: plan.graphAuthority ?? null,
                    support: landing.support, generated: true, deckKind: 'exterior-street-layer',
                    stairThroat: throat,
                },
            });
            connector.routeId = plan.id;
            connector.landingId = landing.id;
            registerSemanticConnector(physics, connector);

            const floor = Number(landing.support?.floor) || Math.round(landing.y / Math.max(0.001, Number(plan.floorH)));
            const layer = (plan.streetLayers ?? []).find(item => Number(item.floor) === floor);
            const portalIds = layer?.portalIds ?? (plan.portalStops ?? [])
                .filter(stop => Number(stop.floor) === floor).map(stop => stop.portalId ?? stop.portal?.id).filter(Boolean);
            deckRegistry.push({
                id: deckSurface.id, surfaceId: deckSurface.id, routeId: plan.id, landingId: landing.id,
                faceKey: `${plan.moduleKey}:${plan.dirKey}`, floor,
                kind: 'exterior-street-layer', priority: 'circulation-owned', portalIds,
                stairThroat: throat, pieceCount: pieces.length,
                x: geometry.x, z: geometry.z, hx: geometry.hx, hz: geometry.hz, y: landing.y,
            });
            realizedLandings++;
            realizedDecks++;
        }
        return { flights: realizedFlights, landings: realizedLandings, decks: realizedDecks };
    }

    function addCompoundSideWall({ physics, wallList, rect, floorH, floor, side, opening = 0 }) {
        const storyY0 = floor * floorH;
        const wallT = KOWLOON_EXTERIOR_WALL_THICKNESS;
        const ceilingLocalY = storyCeilingLocalY(floorH);
        const horizontal = side === 'north' || side === 'south';
        const fixed = horizontal
            ? rect.cz + (side === 'north' ? -rect.halfZ : rect.halfZ)
            : rect.cx + (side === 'west' ? -rect.halfX : rect.halfX);
        const lo = horizontal ? rect.cx - rect.halfX : rect.cz - rect.halfZ;
        const hi = horizontal ? rect.cx + rect.halfX : rect.cz + rect.halfZ;
        const span = hi - lo;
        const rawOpenings = Array.isArray(opening) ? opening : [opening];
        const apertures = rawOpenings.map(raw => {
            const spec = raw && typeof raw === 'object' ? raw : null;
            const requestedWidth = spec ? Number(spec.width) || 0 : Number(raw) || 0;
            const width = Math.max(0, Math.min(span - 0.12, requestedWidth));
            if (!(width > 0.04)) return null;
            const defaultMid = (lo + hi) * 0.5;
            const requestedCenter = spec?.center;
            const requestedMid = requestedCenter !== null && requestedCenter !== undefined && Number.isFinite(Number(requestedCenter))
                ? Number(requestedCenter)
                : defaultMid;
            const center = clamp(requestedMid, lo + width * 0.5, hi - width * 0.5);
            const bottom = spec && Number.isFinite(Number(spec.bottom))
                ? clamp(Number(spec.bottom), 0, floorH) : 0;
            const requestedHeight = spec ? Number(spec.height) || 0 : 0;
            // Width-only legacy callers are door apertures, never permission to erase
            // an entire story-height wall bay. Explicit authority still wins when present.
            const height = requestedHeight > 0 ? requestedHeight : Math.min(2.20, floorH);
            const top = clamp(bottom + height, bottom, floorH);
            return top > bottom + 0.04
                ? { lo: center - width * 0.5, hi: center + width * 0.5, bottom, top }
                : null;
        }).filter(Boolean);

        const addSegment = (a, b, localY0 = 0, localY1 = floorH) => {
            localY1 = Math.min(localY1, ceilingLocalY);
            if (b - a <= 0.04 || localY1 - localY0 <= 0.04) return;
            const mid = (a + b) * 0.5;
            const yMin = storyY0 + localY0;
            const yMax = storyY0 + localY1;
            const wallY = (yMin + yMax) * 0.5;
            const wallH = yMax - yMin;
            if (horizontal) {
                wallTransform(wallList, mid, wallY, fixed, b - a, wallH, wallT);
                physics.mazeWalls.push({ x1: a, z1: fixed, x2: b, z2: fixed, yMin, yMax, thickness: wallT });
            } else {
                wallTransform(wallList, fixed, wallY, mid, wallT, wallH, b - a);
                physics.mazeWalls.push({ x1: fixed, z1: a, x2: fixed, z2: b, yMin, yMax, thickness: wallT });
            }
        };
        if (!apertures.length) {
            addSegment(lo, hi);
            return;
        }

        // PERF: facade stories have only a handful of apertures. Banding them once
        // avoids boolean geometry and keeps wall collision/render segmentation O(A log A).
        const cuts = [...new Set([0, floorH, ...apertures.flatMap(item => [item.bottom, item.top])])].sort((a, b) => a - b);
        for (let band = 0; band < cuts.length - 1; band++) {
            const y0 = cuts[band], y1 = cuts[band + 1];
            if (!(y1 > y0 + 0.04)) continue;
            const gaps = apertures
                .filter(item => item.bottom < y1 - 1e-7 && item.top > y0 + 1e-7)
                .map(item => [item.lo, item.hi])
                .sort((a, b) => a[0] - b[0]);
            let cursor = lo;
            for (const gap of gaps) {
                const gapLo = Math.max(lo, gap[0]);
                const gapHi = Math.min(hi, gap[1]);
                if (gapHi <= cursor) continue;
                addSegment(cursor, gapLo, y0, y1);
                cursor = Math.max(cursor, gapHi);
            }
            addSegment(cursor, hi, y0, y1);
        }
    }

    function addCompoundRoofParapetSide({ physics, transforms, wallList, rect, roofY, side, surfaceId = null, opening = null, physicalUse = null }) {
        void wallList;
        const horizontal = side === 'north' || side === 'south';
        const fixed = horizontal
            ? rect.cz + (side === 'north' ? -rect.halfZ : rect.halfZ)
            : rect.cx + (side === 'west' ? -rect.halfX : rect.halfX);
        const lo = horizontal ? rect.cx - rect.halfX : rect.cz - rect.halfZ;
        const hi = horizontal ? rect.cx + rect.halfX : rect.cz + rect.halfZ;
        const requestedWidth = Math.max(0, Number(opening?.width) || 0);
        const center = Number.isFinite(opening?.center) ? clamp(Number(opening.center), lo, hi) : (lo + hi) * 0.5;
        const gap0 = Math.max(lo, center - requestedWidth * 0.5);
        const gap1 = Math.min(hi, center + requestedWidth * 0.5);
        const family = guardFamilyForContext({ supportKind: 'parapet', visualRole: 'roof-parapet', physicalUse });
        let serial = 0;
        const emit = (a, b) => {
            if (!(b > a + 0.04)) return;
            const args = {
                physics, transforms,
                x1: horizontal ? a : fixed, z1: horizontal ? fixed : a,
                x2: horizontal ? b : fixed, z2: horizontal ? fixed : b,
                y: roofY, family, supportKind: 'parapet',
                metadata: { side, physicalUse, visualRole: 'roof-parapet' },
            };
            if (surfaceId) emitTransportRail({ ...args, wallList: null, surfaceId, guardFamily: family });
            else emitGuardSpanFromAuthority({ ...args, id: `roof-parapet:${side}:${rect.cx}:${rect.cz}:${roofY}:${serial++}` });
        };
        if (requestedWidth > 0 && gap1 > gap0 + 0.04) {
            emit(lo, gap0);
            emit(gap1, hi);
        } else emit(lo, hi);
    }

    // SKELETON PROFILE: structural architecture is mandatory again. Building Plan
    // rooms, partitions, doors and the persistent vertical core run here; expensive
    // clutter, mezzanines and authored enrichment remain deferred by the profile.
    function* buildBroadStrokesCompoundSteps({
        chunk, site, siteIdOf, openSiteIds, topology, siteSignature, siteSeed, structureProfile,
        physics, transforms, materialIndex, modulePlans, moduleByKey, primaryModule,
        floorH, archetype, physicalUse, physicalTruth, servicePhysicalTruth, stairPhysicalTruth,
        districtBuildingPolicy, districtBuildingContext,
        floorConnectivityRepair, courtyard, courtyardSuppressedForConnectivity,
        bridgeOpeningKeys, bridgeOpeningByKey, bridgePortals,
        cx0, cz0, half, cellSize,
    }) {
        const wallList = transforms.wallGroups[materialIndex];
        const facades = [];
        let internalOpenFaces = 0;
        let exposedSetbackFaces = 0;
        let partyFaces = 0;

        const streetFaces = [];
        for (let broadStreetModuleIndex = 0; broadStreetModuleIndex < modulePlans.length; broadStreetModuleIndex++) {
            const module = modulePlans[broadStreetModuleIndex];
            for (const dir of KOWLOON_DIRS) {
                const exposure = module.edgeKinds[dir.key];
                if (exposure === 'street' || exposure === 'courtyard') {
                    streetFaces.push({ module, dir, courtyard: exposure === 'courtyard' });
                }
            }
            yield {
                phase: 'broad-street-faces',
                current: broadStreetModuleIndex + 1,
                total: modulePlans.length,
                moduleKey: module.key,
            };
        }
        const requestedEntrances = Array.isArray(structureProfile?.entrances) ? structureProfile.entrances : [];
        const forcedEntranceFaces = [];
        for (const entrance of requestedEntrances) {
            const moduleKey = kowloonCellKey(entrance.col, entrance.row);
            const face = streetFaces.find(candidate => candidate.module.key === moduleKey
                && candidate.dir.dc === entrance.dc && candidate.dir.dr === entrance.dr && !candidate.courtyard);
            if (face && !forcedEntranceFaces.includes(face)) forcedEntranceFaces.push(face);
        }
        const primaryStreet = streetFaces.filter(face => face.module === primaryModule && !face.courtyard);
        const doorPool = primaryStreet.length ? primaryStreet : streetFaces.filter(face => !face.courtyard);
        const doorFace = forcedEntranceFaces[0]
            ?? (doorPool.length ? doorPool[siteSeed % doorPool.length] : null);
        const entranceFaces = forcedEntranceFaces.length ? forcedEntranceFaces : (doorFace ? [doorFace] : []);
        const broadRoofTopper = archetype === 'vertical-stack' && (hashString32(`${siteSeed}:broad-roof-topper`) % 4 === 0)
            ? 'spire'
            : 'none';
        const broadRoofTopperModuleKey = (doorFace?.module || primaryModule)?.key ?? null;
        const roofTopperAllowsTransport = module => broadRoofTopper === 'none' || module.key !== broadRoofTopperModuleKey;
        const fastRoofAccessByModuleSide = new Map();
        const broadCirculationStartCount = physics.circulationReservations?.length ?? 0;

        // STRUCTURAL INTERIOR AUTHORITY: skeleton keeps the cheap generation profile,
        // but rooms, partitions, doors, the persistent core and its slab voids are
        // structural prerequisites now. Rich clutter/enrichment remains deferred.
        const primaryStairCore = planInteriorSwitchbackStairCore({
            rect: primaryModule.rect,
            floorH,
            physicalTruth: stairPhysicalTruth,
            traversalEnvelope,
            stableKey: `${chunk.key}:${siteSignature}:${primaryModule.key}:switchback-core`,
        });
        if (!primaryStairCore) {
            throw new Error(`${chunk.key}:${siteSignature}:${primaryModule.key}: no human-scale switchback stair fits the primary module`);
        }
        const primaryStairAxis = primaryStairCore.axis;
        const primaryRunInterior = primaryStairCore.metrics.availableAlong;
        const primaryCrossInterior = primaryStairCore.metrics.availableCross;
        const primaryNominalStairFlight = primaryStairCore.segmentFlight;
        const primaryStairAvailableRun = primaryStairCore.segmentFlight.requiredRun;
        const primaryActualStairClearWidth = primaryStairCore.clearWidth;
        const primaryStairCrossOpening = primaryStairAxis === 'z' ? primaryStairCore.opening.sx : primaryStairCore.opening.sz;
        const primaryStairRunOpening = primaryStairAxis === 'z' ? primaryStairCore.opening.sz : primaryStairCore.opening.sx;
        const primaryStairGapW = primaryStairCore.opening.sx;
        const primaryStairGapD = primaryStairCore.opening.sz;
        const primaryStairCx = primaryStairCore.opening.x;
        const primaryStairCz = primaryStairCore.opening.z;
        const primaryStairFrom = primaryStairCore.flights[0].from;
        const primaryStairTo = primaryStairCore.flights[0].to;
        const primaryStairHalfWidth = primaryStairCore.halfWidth;
        const primaryStairFlight = primaryStairCore.segmentFlight;

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
                physicalTruth,
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
                physicalTruth,
                metadata: { moduleKey: face.module.key, dirKey: face.dir.key, floor: 0, physicalUse: physicalUse.family },
            });
            registerSemanticConnector(physics, connector);
            entranceConnectorByKey.set(openingKey, connector);
        }

        // Switchback core geometry was solved once above and is the vertical-core authority.
        const primaryModuleRoofY = primaryModule.floors > 0
            ? (primaryModule.floors - 1) * floorH + floorH
            : 0;
        const buildingPlanEntityId = worldEntityId(worldSeed, chunk.x, chunk.z, 'building', siteSignature);
        const primaryStairConnector = createStairConnector({
            id: `${chunk.key}:${siteSignature}:${primaryModule.key}:stair`,
            x: primaryStairCx, z: primaryStairCz,
            openingWidth: primaryStairGapW,
            openingDepth: primaryStairGapD,
            baseY: 0,
            roofY: primaryModuleRoofY,
            exitHeadroom: stairPhysicalTruth.stair.headroomSI,
            rampAxis: primaryStairAxis,
            rampFrom: primaryStairFrom,
            rampTo: primaryStairTo,
            rampHalfWidth: primaryStairHalfWidth,
            source: 'compound-stair',
            visualRole: 'vertical-spine',
            fromSpaceId: null,
            toSpaceId: null,
            physicalTruth: stairPhysicalTruth,
            stairFlight: primaryStairFlight,
            metadata: {
                moduleKey: primaryModule.key,
                floors: primaryModule.floors,
                floorH,
                physicalUse: physicalUse.family,
                clearWidthRealizedSI: primaryActualStairClearWidth,
                widthFitClassification: primaryActualStairClearWidth + 1e-9 < stairPhysicalTruth.stair.widthSI
                    ? 'geometry-fit-outside-truth'
                    : 'fits-resolved-truth',
                runFitClassification: primaryStairFlight.fitClassification,
                buildingPlanId: buildingPlanEntityId,
            },
        });
        registerSemanticConnector(physics, primaryStairConnector);
        const primaryStairReservation = primaryStairConnector.primaryReservation;
        primaryStairReservation.stairTopology = primaryStairCore.topology;
        primaryStairReservation.integratedFloorLanding = true;
        primaryStairReservation.floorLandingDepth = primaryStairCore.floorLandingDepth;
        primaryStairReservation.midLandingDepth = primaryStairCore.midLandingDepth;
        primaryStairReservation.flightCount = primaryStairCore.flightCount;
        primaryStairReservation.playerSideClearance = primaryStairCore.sideCapsuleClearance;
        const primaryStairSlabOpening = primaryStairCore.slabOpening;
        if (!primaryStairSlabOpening) throw new Error(`${chunk.key}:${siteSignature}:${primaryModule.key}: stair core missing slab opening`);
        const primaryStairSlabOpeningReservation = createBoxCirculationReservation({
            id: `${chunk.key}:${siteSignature}:${primaryModule.key}:stair:slab-opening`,
            kind: 'stair-slab-opening',
            x: primaryStairSlabOpening.x,
            z: primaryStairSlabOpening.z,
            halfX: primaryStairSlabOpening.hx,
            halfZ: primaryStairSlabOpening.hz,
            yMin: 0,
            yMax: primaryModuleRoofY + stairPhysicalTruth.stair.headroomSI,
            source: 'compound-stair-slab-opening',
            metadata: {
                stairTopology: primaryStairCore.topology,
                integratedFloorLanding: true,
                fullReservationId: primaryStairReservation.id,
            },
        });
        primaryStairReservation.slabOpeningX = primaryStairSlabOpening.x;
        primaryStairReservation.slabOpeningZ = primaryStairSlabOpening.z;
        primaryStairReservation.slabOpeningWidth = primaryStairSlabOpening.sx;
        primaryStairReservation.slabOpeningDepth = primaryStairSlabOpening.sz;

        const accessPortals = compileAccessPortals({ connectors: [...entranceConnectorByKey.values()] });
        const accessAnchors = accessAnchorsForBuildingPortals(accessPortals);
        const buildingPlanKey = semanticPlanCacheKey({
            worldSeed,
            chunkKey: chunk.key,
            entityId: buildingPlanEntityId,
            planKind: 'building-plan-authority',
        });
        const buildingPlan = buildingPlanCache.getOrCreate(buildingPlanKey, () => promoteBuildingPlanAuthority(planBuildingSidecar({
            worldSeed,
            chunkKey: chunk.key,
            chunkX: chunk.x,
            chunkZ: chunk.z,
            distanceChunks: chunk.weirdness?.distanceChunks ?? Math.hypot(chunk.x || 0, chunk.z || 0),
            weirdnessSampled: chunk.weirdness?.sampled ?? 0,
            isSpawn: chunk.key === spawnChunkKey || String(chunk.key).startsWith('spawn-'),
            entityId: buildingPlanEntityId,
            signatureType: structureProfile?.signatureType ?? null,
            programHint: structureProfile?.semanticProgram ?? structureProfile?.programHint ?? districtBuildingPolicy.programHint ?? null,
            exteriorMacroPreference: structureProfile?.exteriorMacroPreference ?? null,
            districtCompositionId: districtBuildingPolicy.compositionId ?? null,
            districtComposition: districtBuildingContext ?? districtBuildingPolicy,
            physicalUse,
            physicalTruth,
            floorHeight: floorH,
            modules: modulePlans.map(module => ({
                key: module.key,
                cx: module.rect.cx,
                cz: module.rect.cz,
                halfX: module.rect.halfX,
                halfZ: module.rect.halfZ,
                floors: module.floors,
            })),
            accessAnchors,
            circulationReservations: [
                primaryStairReservation,
                ...[...entranceConnectorByKey.values()].flatMap(connector => connector.reservations ?? []),
            ],
        }), {
            coreReservationId: primaryStairReservation.id,
            coreReservation: primaryStairReservation,
            chunkKey: chunk.key,
            entityId: buildingPlanEntityId,
        }));
        assertBuildingPlanAuthority(buildingPlan);

        const groundFloorPlan = buildingPlan.floors.find(floor => floor.floor === 0) ?? buildingPlan.floors[0];
        const groundRoot = groundFloorPlan?.spaces?.find(space => space.key === groundFloorPlan.rootSpaceKey) ?? groundFloorPlan?.spaces?.[0];
        if (groundRoot) {
            for (const connector of entranceConnectorByKey.values()) {
                connector.fromSpaceId = groundRoot.id;
                connector.toSpaceId = `${chunk.key}:street`;
                connector.spaceIds = [groundRoot.id];
                for (const endpoint of connector.endpoints ?? []) {
                    endpoint.fromSpaceId = groundRoot.id;
                    endpoint.toSpaceId = connector.toSpaceId;
                }
            }
        }
        const coreSpaceIds = buildingPlan.verticalCore?.floorSpaceIds ?? [];
        primaryStairConnector.fromSpaceId = coreSpaceIds[0] ?? null;
        primaryStairConnector.toSpaceId = coreSpaceIds[coreSpaceIds.length - 1] ?? null;
        primaryStairConnector.spaceIds = [...coreSpaceIds];
        registerBuildingPlanInteriorDoors(physics, buildingPlan, physicalTruth);

        const buildingPlanSpaceForModuleFloor = (moduleKey, floor, side) => {
            const module = moduleByKey.get(moduleKey);
            const sameFloor = (buildingPlan.topologySpaces ?? []).filter(space => Number(space.floor) === Number(floor));
            const candidates = sameFloor.filter(space => space.moduleKey === moduleKey || (space.moduleKeys ?? []).includes(moduleKey));
            if (module && candidates.length) {
                const faceCoord = side === 'north' ? module.rect.cz - module.rect.halfZ
                    : side === 'south' ? module.rect.cz + module.rect.halfZ
                    : side === 'west' ? module.rect.cx - module.rect.halfX
                    : module.rect.cx + module.rect.halfX;
                const touchesFacade = candidates.find(space => (space.regions ?? []).some(region => {
                    if (side === 'north') return Number(region.minZ) <= faceCoord + 0.35;
                    if (side === 'south') return Number(region.maxZ) >= faceCoord - 0.35;
                    if (side === 'west') return Number(region.minX) <= faceCoord + 0.35;
                    return Number(region.maxX) >= faceCoord - 0.35;
                }));
                if (touchesFacade) return touchesFacade;
            }
            return candidates[0] ?? sameFloor[0] ?? null;
        };
        const roofIntersectsInteriorCore = module => {
            const roofY = module.floors * floorH;
            const roofRect = computeKowloonSlabRect(module, moduleByKey, module.floors, { roof: true });
            return reservationIntersectsBox(primaryStairReservation, {
                x: roofRect.cx, z: roofRect.cz, sx: roofRect.width, sz: roofRect.depth,
                yMin: roofY - 0.02, yMax: roofY + 0.02,
            });
        };
        const roofNeedsInteriorCoreOpening = module => {
            const roofY = module.floors * floorH;
            const roofRect = computeKowloonSlabRect(module, moduleByKey, module.floors, { roof: true });
            return reservationIntersectsBox(primaryStairSlabOpeningReservation, {
                x: roofRect.cx, z: roofRect.cz, sx: roofRect.width, sz: roofRect.depth,
                yMin: roofY - 0.02, yMax: roofY + 0.02,
            });
        };
        const roofClearForTransport = module => roofTopperAllowsTransport(module) && !roofIntersectsInteriorCore(module);

        // CUT 12: exterior circulation is accepted against building mass before
        // facade walls/slabs render. An aperture is only a semantic handoff point:
        // no flight or landing clearance is ever allowed to cross the facade plane.
        const exteriorBuildingObstacles = [
            ...buildConservativeBuildingObstacles({
                currentSiteId: site.id,
                modulePlans,
                floorH,
                siteIdOf,
                openSiteIds,
                cx0, cz0, half, cellSize,
            }),
            // Earlier sites/landmarks already have exact wall geometry. This also
            // covers cells intentionally absent from the compound partition.
            ...wallSegmentBuildingObstacles(physics.mazeWalls),
        ];
        const acceptedExteriorClearances = physics.exteriorCirculationAcceptedClearances
            ?? (physics.exteriorCirculationAcceptedClearances = []);
        const collisionRejectRegistry = physics.exteriorCirculationCollisionRejects
            ?? (physics.exteriorCirculationCollisionRejects = []);
        const recordExteriorCollisionReject = (plan, face, family, evaluation, circulationConflict = null) => {
            collisionRejectRegistry.push({
                routeId: plan?.id ?? null,
                family,
                faceKey: face ? `${face.module.key}:${face.dir.key}` : null,
                hostBoundaryViolationIds: (evaluation?.hostBoundaryViolations ?? []).map(item => item.id),
                buildingBlockers: (evaluation?.blockers ?? []).map(item => ({
                    reservationId: item.reservation?.id ?? null,
                    obstacleId: item.obstacle?.id ?? null,
                    obstacleSource: item.obstacle?.obstacleSource ?? null,
                })),
                circulationConflict: circulationConflict ? {
                    reservationId: circulationConflict.reservation?.id ?? null,
                    blockerId: circulationConflict.blocker?.id ?? null,
                } : null,
            });
        };
        const evaluateExteriorCandidate = (plan, face, family) => {
            const evaluation = evaluateExteriorRouteCollision({
                plan,
                obstacles: exteriorBuildingObstacles,
                hostRect: face?.module?.rect ?? plan?.hostRect ?? plan?.face?.rect,
                side: face?.dir?.side ?? plan?.side,
            });
            if (!evaluation.accepted) recordExteriorCollisionReject(plan, face, family, evaluation);
            return evaluation;
        };
        const publishExteriorRouteClearances = reservations => {
            for (const reservation of reservations ?? []) {
                if (!acceptedExteriorClearances.some(item => item.id === reservation.id)) acceptedExteriorClearances.push(reservation);
                if (!physics.circulationReservations.some(item => item.id === reservation.id)) {
                    physics.circulationReservations.push(publishedCirculationReservation(reservation));
                }
            }
        };

        // EXTERIOR STRUCTURAL FAST LANE: preserve deterministic scaffold/fire-escape
        // planning around the restored interior/core reservations. Micro enrichment and
        // authored decoration stay disabled; facade apertures still publish before walls.
        const scaffoldCandidates = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        const scaffoldOpeningByKey = new Map();
        let scaffoldPlan = null;
        let scaffoldSide = null;
        let scaffoldCollisionEvaluation = null;
        if (scaffoldCandidates.length) {
            const scaffoldPresenceRng = mulberry32(hashString32(`${siteSeed}:scaffold-presence`));
            const scaffoldChance = kowloonIntensity(chunk.weirdness?.sampled ?? 0).scaffoldChance;
            if (scaffoldPresenceRng() < scaffoldChance) {
                const validScaffolds = scaffoldCandidates.map(face => {
                    const seed = hashString32(`${siteSeed}:scaffold:${face.module.key}:${face.dir.side}`);
                    const moduleDepth = Math.min(face.module.rect.halfX, face.module.rect.halfZ);
                    const scaffoldEnvelopeDepth = Math.max(1.2, Math.min(2.4, moduleDepth * 0.72));
                    const plan = planExteriorScaffoldRoute({
                        fp: face.module.rect,
                        siteId: site.id,
                        moduleKey: face.module.key,
                        floors: face.module.floors,
                        floorH,
                        side: face.dir.side,
                        seed,
                        physicalTruth: servicePhysicalTruth,
                        maxExteriorDepth: scaffoldEnvelopeDepth,
                        routeId: `${chunk.key}:${siteSignature}:${face.module.key}:scaffold:${face.dir.side}`,
                    });
                    // Canonical scaffold concept: A uses the street half, B the building half,
                    // and full-width landings live beyond the run. No parity/mirroring author exists.
                    if (!plan || plan.topology !== 'canonical-facade-zigzag') return null;
                    assertCanonicalScaffoldSwitchback(plan);
                    const openingConflict = plan.openings.some(opening => {
                        const openingKey = `${face.module.key}:${face.dir.key}:${opening.level}`;
                        return bridgeOpeningKeys.has(openingKey)
                            || (opening.level === 0 && entranceFaces.some(entrance =>
                                entrance.module === face.module && entrance.dir.key === face.dir.key));
                    });
                    if (openingConflict) return null;
                    const collision = evaluateExteriorCandidate(plan, face, 'fire-escape-scaffold');
                    return collision.accepted ? { face, plan, collision } : null;
                }).filter(Boolean);
                validScaffolds.sort((a, b) => {
                    const heightRank = b.face.module.floors - a.face.module.floors;
                    if (heightRank) return heightRank;
                    const topologyRank = (a.plan.topology === 'canonical-facade-zigzag' ? 0 : 1)
                        - (b.plan.topology === 'canonical-facade-zigzag' ? 0 : 1);
                    if (topologyRank) return topologyRank;
                    const aMargin = a.plan.facadeTangentAvailable - a.plan.tangentSpan;
                    const bMargin = b.plan.facadeTangentAvailable - b.plan.tangentSpan;
                    if (Math.abs(aMargin - bMargin) > 1e-9) return bMargin - aMargin;
                    return `${a.face.module.key}:${a.face.dir.side}`.localeCompare(`${b.face.module.key}:${b.face.dir.side}`);
                });
                const accepted = validScaffolds[0] ?? null;
                if (accepted) {
                    scaffoldPlan = accepted.plan;
                    scaffoldSide = accepted.face.dir.side;
                    scaffoldCollisionEvaluation = accepted.collision;
                    for (const opening of scaffoldPlan.openings) {
                        scaffoldOpeningByKey.set(
                            `${accepted.face.module.key}:${accepted.face.dir.key}:${opening.level}`,
                            { width: opening.width, height: opening.height, center: opening.tangent, routeId: scaffoldPlan.id, openingId: opening.id },
                        );
                    }
                }
            }
        }

        // EXTERIOR STREET-LAYER CIRCULATION V1.
        // Transport surfaces are planned before occupancy doors. Bridges/catwalks
        // are authoritative street-layer anchors; sparse room portals attach to
        // those layers. One wall-hugging stair trunk connects neighboring layers.
        const broadVerticalRoutes = [];
        const usedBroadVerticalFaces = new Set();
        const fastVerticalOpeningByKey = new Map();
        const fastBridgeFaceKeys = new Set((bridgePortals ?? []).map(portal => `${portal.moduleKey}:${portal.dirKey}`));
        const bridgeFaceRegistry = physics.fastBridgeFaceKeys ?? (physics.fastBridgeFaceKeys = []);
        for (const faceKey of fastBridgeFaceKeys) if (!bridgeFaceRegistry.includes(faceKey)) bridgeFaceRegistry.push(faceKey);
        const debtRegistry = physics.exteriorCirculationDebtTags ?? (physics.exteriorCirculationDebtTags = []);
        for (const item of EXTERIOR_CIRCULATION_DEBT) if (!debtRegistry.includes(item.tag)) debtRegistry.push(item.tag);

        const broadVerticalCandidates = streetFaces
            .filter(face => !face.courtyard && face.module.floors >= 2)
            .sort((a, b) => {
                const floorDelta = b.module.floors - a.module.floors;
                if (floorDelta) return floorDelta;
                const ar = hashString32(`${siteSeed}:street-layer-rank:${a.module.key}:${a.dir.side}`);
                const br = hashString32(`${siteSeed}:street-layer-rank:${b.module.key}:${b.dir.side}`);
                return ar - br || `${a.module.key}:${a.dir.side}`.localeCompare(`${b.module.key}:${b.dir.side}`);
            });
        const broadVerticalFaceKey = face => `${face.module.key}:${face.dir.key}`;
        const entranceOwnsFace = face => entranceFaces.some(entrance => entrance.module === face.module && entrance.dir.key === face.dir.key);
        const canUseBroadVerticalFace = face => !usedBroadVerticalFaces.has(broadVerticalFaceKey(face)) && !scaffoldOwnsFace(face);
        const portalOpening = portal => ({
            width: Number(portal.width) || (servicePhysicalTruth?.door?.clearWidth?.realizedSI ?? 1.35),
            height: Number(portal.height) || (servicePhysicalTruth?.door?.clearHeight?.realizedSI ?? 2.20),
            center: portal.side === 'north' || portal.side === 'south' ? Number(portal.x) : Number(portal.z),
        });
        const makeRoomAccessDemand = (face, floor, { source = 'fast-vertical-room-portal', anchorPortal = null } = {}) => {
            const roomSpace = buildingPlanSpaceForModuleFloor(face.module.key, floor, face.dir.side);
            if (!roomSpace) throw new Error(`${chunk.key}:${siteSignature}:${face.module.key}:floor:${floor}: occupancy access demand has no Building Plan space`);
            const roomSpaceId = roomSpace.id;
            const layerSpaceId = `${chunk.key}:${siteSignature}:${face.module.key}:street-layer:${floor}`;
            const horizontal = face.dir.side === 'north' || face.dir.side === 'south';
            const rawAnchorTangent = anchorPortal?.tangent;
            const rawAnchorCoordinate = horizontal ? anchorPortal?.x : anchorPortal?.z;
            const anchorTangent = rawAnchorTangent === null || rawAnchorTangent === undefined ? NaN : Number(rawAnchorTangent);
            const anchorCoordinate = rawAnchorCoordinate === null || rawAnchorCoordinate === undefined ? NaN : Number(rawAnchorCoordinate);
            const bridgeTangent = Number.isFinite(anchorTangent)
                ? anchorTangent
                : (Number.isFinite(anchorCoordinate) ? anchorCoordinate : NaN);
            if (source === 'bridge-portal' && !Number.isFinite(bridgeTangent)) {
                throw new Error(`${chunk.key}:${siteSignature}:${face.module.key}:${face.dir.key}:${floor}: unresolved bridge endpoint reached circulation planning`);
            }
            return {
                floor,
                roomSpaceId,
                landingSpaceId: layerSpaceId,
                source,
                openingKey: `${face.module.key}:${face.dir.key}:${floor}`,
                portalId: `${chunk.key}:${siteSignature}:${face.module.key}:${face.dir.key}:street-layer-portal:${floor}`,
                width: servicePhysicalTruth?.door?.clearWidth?.realizedSI ?? 1.35,
                height: servicePhysicalTruth?.door?.clearHeight?.realizedSI ?? 2.20,
                depth: servicePhysicalTruth?.door?.approachDepthSI ?? 1.20,
                preferredTangent: source === 'bridge-portal' ? bridgeTangent : null,
                placementAuthority: source === 'bridge-portal' ? 'external-anchor' : 'occupancy-access-demand',
                metadata: {
                    moduleKey: face.module.key, dirKey: face.dir.key, floor,
                    anchorPortalId: anchorPortal?.id ?? null,
                },
            };
        };
        const commitRoomPortal = (stop, route) => {
            const placement = stop.portalPlacement ?? stop.portal;
            const rawTangent = placement?.tangent;
            const tangent = rawTangent === null || rawTangent === undefined ? NaN : Number(rawTangent);
            if (!Number.isFinite(tangent)) throw new Error(`${route.id}:${stop.openingKey}: circulation portal placement missing`);
            const portal = semanticPortalForRect({
                id: stop.portalId ?? placement.id,
                rect: route.hostRect,
                side: route.side,
                floor: stop.floor,
                floorH: route.floorH,
                width: stop.width ?? placement.width,
                height: stop.height ?? placement.height,
                depth: stop.depth ?? placement.depth,
                tangent,
                physicalTruth: servicePhysicalTruth,
                source: stop.source,
                fromSpaceId: stop.roomSpaceId,
                toSpaceId: stop.landingSpaceId,
                metadata: { ...(stop.metadata || {}), routeId: route.id, landingId: placement.landingId },
            });
            fastVerticalOpeningByKey.set(stop.openingKey, portalOpening(portal));
            if (stop.source === 'bridge-portal') return;
            const connector = createPortalConnector({
                id: `${portal.id}:connector`,
                portal,
                kind: 'door',
                source: 'fast-vertical-room-portal',
                visualRole: 'street-layer-occupancy-door',
                physicalTruth: servicePhysicalTruth,
                metadata: {
                    routeId: route.id,
                    portalId: portal.id,
                    moduleKey: route.moduleKey,
                    dirKey: route.dirKey,
                    floor: stop.floor,
                    graphAuthority: route.graphAuthority,
                    placementAuthority: placement.placementAuthority,
                },
            });
            registerSemanticConnector(physics, connector);
        };
        const scaffoldOwnsFace = face => !!scaffoldPlan
            && scaffoldPlan.moduleKey === face.module.key
            && scaffoldPlan.side === face.dir.side;
        const bridgePortalForFaceFloor = (face, floor) => (bridgePortals ?? []).find(portal =>
            portal.moduleKey === face.module.key && portal.dirKey === face.dir.key && Number(portal.floor) === Number(floor));
        const buildStreetLayerStops = (face, policy) => policy.layerFloors.map(floor => {
            const bridgePortal = bridgePortalForFaceFloor(face, floor);
            const accessDemands = [];
            let support = null;
            let transportKind = policy.roofFloor === floor ? 'clear-roof-edge-layer' : 'balcony-street-layer';
            if (bridgePortal) {
                accessDemands.push(makeRoomAccessDemand(face, floor, { source: 'bridge-portal', anchorPortal: bridgePortal }));
                // The walkway owns the portal/anchor, but the facade street layer still
                // supplies its own notched stair-arrival deck. That prevents the bridge
                // deck itself from becoming a ceiling over the top of the stair flight.
                transportKind = 'bridge-anchored-street-layer';
            }
            if (policy.occupancyPortalFloors.includes(floor) && !bridgePortal) {
                accessDemands.push(makeRoomAccessDemand(face, floor));
            }
            return { floor, support, accessDemands, transportKind };
        });
        const acceptStreetLayerRoute = (face, policy, family) => {
            if (!face || !canUseBroadVerticalFace(face) || !policy?.layerFloors?.length) return false;
            const routeId = `${chunk.key}:${siteSignature}:${face.module.key}:street-layers:${family}:${face.dir.side}`;
            const plan = planExteriorStreetLayerTrunk({
                routeId,
                family,
                fp: face.module.rect,
                siteId: site.id,
                moduleKey: face.module.key,
                dirKey: face.dir.key,
                side: face.dir.side,
                floorH,
                physicalTruth: servicePhysicalTruth,
                layerStops: buildStreetLayerStops(face, policy),
                stableKey: routeId,
                maxRun: 6.2,
            });
            if (!plan) return false;
            const collision = evaluateExteriorCandidate(plan, face, family);
            if (!collision.accepted) return false;
            const circulationConflict = firstCirculationVolumeConflict(collision.reservations, acceptedExteriorClearances, 0.02);
            if (circulationConflict) {
                recordExteriorCollisionReject(plan, face, family, collision, circulationConflict);
                return false;
            }
            publishExteriorRouteClearances(collision.reservations);
            usedBroadVerticalFaces.add(broadVerticalFaceKey(face));
            broadVerticalRoutes.push(plan);
            for (const stop of plan.portalStops) commitRoomPortal(stop, plan);
            if (policy.roofFloor) {
                const roofLanding = plan.landings.find(landing => Number(landing.support?.floor) === Number(policy.roofFloor));
                const roofFlight = roofLanding ? plan.flights.find(flight => flight.toLandingId === roofLanding.id) : null;
                if (roofFlight) fastRoofAccessByModuleSide.set(`${face.module.key}:${face.dir.key}`, {
                    floor: policy.roofFloor,
                    center: roofFlight.to,
                    width: Math.max(0.90, Number(plan.physicalTruth?.stair?.widthSI) * 1.35 || 1.10),
                    routeId: plan.id,
                });
            }
            return true;
        };

        // Fire escape is independent egress. Publish its accepted clearance before
        // generic exterior transport so the newer street-layer trunk routes around it.
        if (scaffoldPlan && scaffoldCollisionEvaluation) {
            publishExteriorRouteClearances(scaffoldCollisionEvaluation.reservations);
            const scaffoldFace = scaffoldCandidates.find(face =>
                face.module.key === scaffoldPlan.moduleKey && face.dir.side === scaffoldPlan.side) ?? null;
            if (scaffoldFace) usedBroadVerticalFaces.add(broadVerticalFaceKey(scaffoldFace));
        }

        // Walkways are the strongest horizontal street-layer anchors. If a bridge
        // face can host the trunk, it anchors the layer and the route may continue through upper
        // balcony layers without creating a second vertical connector for the site.
        let streetLayerRouteAccepted = false;
        for (const bridgePortal of bridgePortals ?? []) {
            const face = broadVerticalCandidates.find(candidate =>
                candidate.module.key === bridgePortal.moduleKey && candidate.dir.key === bridgePortal.dirKey);
            if (!face || !canUseBroadVerticalFace(face)) continue;
            const existingFloors = (bridgePortals ?? [])
                .filter(item => item.moduleKey === face.module.key && item.dirKey === face.dir.key)
                .map(item => Number(item.floor));
            const policy = planExteriorStreetLayerPolicy({
                floors: face.module.floors,
                existingPortalFloors: existingFloors,
                maxLayers: 5,
                maxExteriorConnections: 2,
                includeRoof: roofClearForTransport(face.module),
            });
            if (acceptStreetLayerRoute(face, policy, 'walkway-anchored-street-trunk')) {
                streetLayerRouteAccepted = true;
                break;
            }
        }

        // Without an existing walkway, choose one transport facade for the compound.
        // It receives several stacked street layers but at most two occupancy doors.
        if (!streetLayerRouteAccepted && hashString32(`${siteSeed}:street-layer-presence`) % 100 < 82) {
            for (const face of broadVerticalCandidates) {
                if (!canUseBroadVerticalFace(face) || entranceOwnsFace(face)) continue;
                const policy = planExteriorStreetLayerPolicy({
                    floors: face.module.floors,
                    existingPortalFloors: [],
                    maxLayers: 5,
                    maxExteriorConnections: 2,
                    includeRoof: roofClearForTransport(face.module),
                });
                if (acceptStreetLayerRoute(face, policy, 'shared-exterior-street-trunk')) {
                    streetLayerRouteAccepted = true;
                    break;
                }
            }
        }


        // The fire escape was published before generic trunk selection. At this point
        // it must still own every accepted reservation; later transport cannot delete it.
        if (scaffoldPlan && scaffoldCollisionEvaluation) {
            const acceptedIds = new Set(acceptedExteriorClearances.map(item => item.id));
            for (const reservation of scaffoldCollisionEvaluation.reservations) {
                if (!acceptedIds.has(reservation.id)) throw new Error(`${scaffoldPlan.id}: fire escape clearance lost before wall publication`);
            }
        }

        // FACADE ARCHITECTURE V1: circulation openings already exist. This layer can
        // frame those voids and consume leftover wall area, but it never creates a door.
        // Transport remains above facade treatment in the authority hierarchy.
        const defaultFacadeDoorWidth = servicePhysicalTruth?.door?.clearWidth?.realizedSI
            ?? physicalTruth?.door?.clearWidth?.realizedSI ?? 1.35;
        const defaultFacadeDoorHeight = servicePhysicalTruth?.door?.clearHeight?.realizedSI
            ?? physicalTruth?.door?.clearHeight?.realizedSI ?? 2.20;
        const facadeArchitectureFaces = streetFaces.filter(face => !face.courtyard).map(face => {
            const tangentCenter = face.dir.side === 'north' || face.dir.side === 'south'
                ? face.module.rect.cx : face.module.rect.cz;
            const openings = [];
            for (let floor = 0; floor < face.module.floors; floor++) {
                const openingKey = `${face.module.key}:${face.dir.key}:${floor}`;
                if (bridgeOpeningKeys.has(openingKey)) {
                    const raw = fastVerticalOpeningByKey.get(openingKey) ?? bridgeOpeningByKey.get(openingKey);
                    openings.push({
                        floor, kind: 'bridge-portal', openingKey,
                        center: Number.isFinite(raw?.center) ? Number(raw.center) : tangentCenter,
                        width: Number(raw?.width) || defaultFacadeDoorWidth,
                        height: Number(raw?.height) || defaultFacadeDoorHeight,
                    });
                    continue;
                }
                if (fastVerticalOpeningByKey.has(openingKey)) {
                    const raw = fastVerticalOpeningByKey.get(openingKey);
                    openings.push({
                        floor, kind: 'street-layer-portal', openingKey, openingId: raw?.openingId ?? null,
                        center: Number.isFinite(raw?.center) ? Number(raw.center) : tangentCenter,
                        width: Number(raw?.width) || defaultFacadeDoorWidth,
                        height: Number(raw?.height) || defaultFacadeDoorHeight,
                    });
                    continue;
                }
                if (scaffoldOpeningByKey.has(openingKey)) {
                    const raw = scaffoldOpeningByKey.get(openingKey);
                    openings.push({
                        floor, kind: 'scaffold-portal', openingKey, openingId: raw?.openingId ?? null,
                        center: Number.isFinite(raw?.center) ? Number(raw.center) : tangentCenter,
                        width: Number(raw?.width) || defaultFacadeDoorWidth,
                        height: Number(raw?.height) || defaultFacadeDoorHeight,
                    });
                    continue;
                }
                if (floor === 0 && entranceFaces.some(entry => entry.module === face.module && entry.dir.key === face.dir.key)) {
                    openings.push({
                        floor, kind: 'primary-entrance', openingKey, center: tangentCenter,
                        width: physicalTruth?.door?.clearWidth?.realizedSI ?? defaultFacadeDoorWidth,
                        height: physicalTruth?.door?.clearHeight?.realizedSI ?? defaultFacadeDoorHeight,
                    });
                }
            }
            return {
                moduleKey: face.module.key, dirKey: face.dir.key, side: face.dir.side,
                floors: face.module.floors, rect: { ...face.module.rect }, openings,
            };
        });
        const facadeArchitecture = planFastFacadeArchitecture({
            stableKey: `${chunk.key}:${siteSignature}:facade-07`,
            faces: facadeArchitectureFaces, floorH,
            defaultDoorWidth: defaultFacadeDoorWidth,
            defaultDoorHeight: defaultFacadeDoorHeight,
        });
        const facadeAperturesByKey = new Map();
        for (const aperture of facadeArchitecture.apertures ?? []) {
            const key = `${aperture.moduleKey}:${aperture.dirKey}:${aperture.floor}`;
            const list = facadeAperturesByKey.get(key) ?? [];
            list.push(aperture);
            facadeAperturesByKey.set(key, list);
        }

        let partitionSegments = 0;
        for (let broadModuleIndex = 0; broadModuleIndex < modulePlans.length; broadModuleIndex++) {
            const module = modulePlans[broadModuleIndex];
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

                    const openingKey = `${module.key}:${dir.key}:${floor}`;
                    const openings = [...(facadeAperturesByKey.get(openingKey) ?? [])];
                    if (fastVerticalOpeningByKey.has(openingKey)) {
                        openings.push(fastVerticalOpeningByKey.get(openingKey));
                    } else if (bridgeOpeningByKey.has(openingKey)) {
                        openings.push(bridgeOpeningByKey.get(openingKey));
                    } else if (scaffoldOpeningByKey.has(openingKey)) {
                        openings.push(scaffoldOpeningByKey.get(openingKey));
                    } else if (floor === 0 && entranceFaces.some(face => face.module === module && face.dir.key === dir.key)) {
                        openings.push({
                            center: dir.side === 'north' || dir.side === 'south' ? module.rect.cx : module.rect.cz,
                            width: physicalTruth?.door?.clearWidth?.realizedSI ?? 1.35,
                            height: physicalTruth?.door?.clearHeight?.realizedSI ?? 2.20,
                        });
                    }
                    addCompoundSideWall({ physics, wallList, rect: module.rect, floorH, floor, side: dir.side, opening: openings });
                }

                if (floor > 0) {
                    const slabRect = computeKowloonSlabRect(module, moduleByKey, floor);
                    const primaryShaftCutsSlab = reservationIntersectsBox(primaryStairSlabOpeningReservation, {
                        x: slabRect.cx, z: slabRect.cz, sx: slabRect.width, sz: slabRect.depth,
                        yMin: y0 - 0.02, yMax: y0 + 0.02,
                    });
                    if (primaryShaftCutsSlab) {
                        addNotchedFloor(physics.platforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                            primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
                        addRenderedNotchedSlab(transforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                            primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
                    } else {
                        addRectPlatform(physics.platforms, slabRect.cx, slabRect.cz, slabRect.width, slabRect.depth, y0, 'floor');
                        transforms.slabs.push({ x: slabRect.cx, y: y0 - 0.06, z: slabRect.cz,
                            sx: slabRect.width, sy: 0.12, sz: slabRect.depth });
                    }
                }

                if (module === primaryModule) {
                    const stairGuardFamily = guardFamilyForContext({ supportKind: 'compound-stair', visualRole: 'interior-stair', physicalUse: stairPhysicalTruth?.physicalUse });
                    realizeInteriorSwitchbackStory({
                        physics, transforms, core: primaryStairCore, floor, y0, y1, guardFamily: stairGuardFamily,
                        treadVisualBudget: GENERATION_LANES.broadStrokesOnly ? 3 : Infinity,
                        metadata: {
                            stairId: `${chunk.key}:${siteSignature}:${module.key}:compound-stair`,
                            moduleKey: module.key, physicalUse: stairPhysicalTruth?.physicalUse,
                        },
                    });
                }
                yield {
                    phase: 'broad-shell-floor',
                    current: floor + 1,
                    total: module.floors,
                    moduleKey: module.key,
                    moduleIndex: broadModuleIndex,
                    moduleTotal: modulePlans.length,
                };
            }

            // Semantic facade hosts are whole exposed wall faces, not per-floor
            // slices. Publish them on the actual wall plane so projecting signs and
            // facade/corner megascreens cannot be buried inside the building mass.
            for (const dir of KOWLOON_DIRS) {
                const exposure = module.edgeKinds[dir.key];
                if (exposure !== 'street' && exposure !== 'courtyard') continue;
                facades.push({
                    moduleKey: module.key, side: dir.side, exposure,
                    x: module.rect.cx + (dir.side === 'west' ? -module.rect.halfX : dir.side === 'east' ? module.rect.halfX : 0),
                    z: module.rect.cz + (dir.side === 'north' ? -module.rect.halfZ : dir.side === 'south' ? module.rect.halfZ : 0),
                    halfX: module.rect.halfX, halfZ: module.rect.halfZ,
                    yMin: 0, yMax: module.floors * floorH,
                });
            }

            yield {
                phase: 'broad-facade-hosts',
                current: broadModuleIndex + 1,
                total: modulePlans.length,
                moduleKey: module.key,
            };

            const roofY = module.floors * floorH;
            const roofRect = computeKowloonSlabRect(module, moduleByKey, module.floors, { roof: true });
            const localRoofAccess = [...fastRoofAccessByModuleSide.entries()]
                .filter(([key]) => key.startsWith(`${module.key}:`))
                .map(([key, value]) => ({ dirKey: key.slice(module.key.length + 1), ...value }));
            let roofSurface = null;
            if (roofClearForTransport(module)) {
                const publishedRoof = publishTransportSurfaceSlab({
                    physics, transforms,
                    rawSurface: {
                        id: `${chunk.key}:${siteSignature}:${module.key}:roof-street-layer`,
                        kind: 'clear-roof-street-layer',
                        x: roofRect.cx, z: roofRect.cz, hx: roofRect.width * 0.5, hz: roofRect.depth * 0.5, y: roofY,
                        siteId: site.id, moduleKey: module.key, routeId: null,
                        networkKey: `roof:${site.id}:${module.key}`,
                        reachable: localRoofAccess.length > 0,
                        priority: 'circulation-candidate', physicalTruth: servicePhysicalTruth,
                    },
                    supportKind: 'roof', slabT: 0.12,
                });
                roofSurface = publishedRoof.surface;
                for (const overlap of publishedRoof.overlaps) smoothTransportUnion({ physics, transforms, a: roofSurface, b: overlap });
            } else {
                if (roofNeedsInteriorCoreOpening(module)) {
                    addNotchedFloor(physics.platforms, roofRect.cx, roofRect.cz,
                        roofRect.width, roofRect.depth,
                        roofY, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                        primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2, 'roof');
                    addRenderedNotchedSlab(transforms, roofRect.cx, roofRect.cz,
                        roofRect.width, roofRect.depth,
                        roofY, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                        primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
                } else {
                    addRectPlatform(physics.platforms, roofRect.cx, roofRect.cz, roofRect.width, roofRect.depth, roofY, 'roof');
                    transforms.slabs.push({
                        x: roofRect.cx, y: roofY - 0.06, z: roofRect.cz,
                        sx: roofRect.width, sy: 0.12, sz: roofRect.depth,
                    });
                }
            }
            for (const dir of KOWLOON_DIRS) {
                let exposed = module.edgeKinds[dir.key] !== 'internal';
                if (!exposed) {
                    const neighbor = moduleByKey.get(kowloonCellKey(module.cell.col + dir.dc, module.cell.row + dir.dr));
                    exposed = !neighbor || neighbor.floors < module.floors;
                }
                if (exposed) addCompoundRoofParapetSide({
                    physics, transforms, wallList, rect: module.rect, roofY, side: dir.side,
                    surfaceId: roofSurface?.id ?? null,
                    opening: localRoofAccess.find(access => access.dirKey === dir.key) ?? null,
                    physicalUse: servicePhysicalTruth?.physicalUse ?? null,
                });
            }
            yield {
                phase: 'broad-roof-shell',
                current: broadModuleIndex + 1,
                total: modulePlans.length,
                moduleKey: module.key,
            };
        }

        partitionSegments += realizeBuildingPlanWallRuns({
            physics,
            wallList: transforms.wallGroups[materialIndex],
            plan: buildingPlan,
        });
        yield { phase: 'broad-structural-interiors', current: modulePlans.length, total: modulePlans.length };

        let scaffoldLandings = 0;
        if (scaffoldPlan) {
            scaffoldLandings = realizeExteriorScaffold({ physics, transforms, plan: scaffoldPlan });
            yield {
                phase: 'broad-scaffold',
                current: 1,
                total: 1,
                moduleKey: scaffoldPlan.moduleKey,
                routeId: scaffoldPlan.id,
            };
        }

        let fastVerticalFlights = 0;
        let fastVerticalLandings = 0;
        let fastVerticalDecks = 0;
        for (let routeIndex = 0; routeIndex < broadVerticalRoutes.length; routeIndex++) {
            const route = broadVerticalRoutes[routeIndex];
            const realized = realizeFastVerticalRoute({
                physics, transforms, wallList: transforms.wallGroups[materialIndex], plan: route,
            });
            fastVerticalFlights += realized.flights;
            fastVerticalLandings += realized.landings;
            fastVerticalDecks += realized.decks;
            yield {
                phase: 'broad-vertical-route',
                current: routeIndex + 1,
                total: broadVerticalRoutes.length,
                moduleKey: route.moduleKey,
                routeId: route.id,
                family: route.family,
            };
        }

        const bounds = modulePlans.reduce((acc, module) => ({
            minX: Math.min(acc.minX, module.rect.cx - module.rect.halfX),
            maxX: Math.max(acc.maxX, module.rect.cx + module.rect.halfX),
            minZ: Math.min(acc.minZ, module.rect.cz - module.rect.halfZ),
            maxZ: Math.max(acc.maxZ, module.rect.cz + module.rect.halfZ),
        }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        const anchor = doorFace?.module || primaryModule;
        const floorCounts = modulePlans.map(module => module.floors);
        transforms.props.push(...facadeArchitecture.render.props);
        transforms.windows.push(...facadeArchitecture.render.windows);
        const facadeRegistry = physics.fastFacadeArchitecture ?? (physics.fastFacadeArchitecture = []);
        for (const treatment of facadeArchitecture.treatments) {
            facadeRegistry.push({ ...treatment, chunkKey: chunk.key, siteId: site.id });
        }

        const roofTopper = broadRoofTopper;

        return {
            x: anchor.rect.cx, z: anchor.rect.cz,
            halfX: anchor.rect.halfX, halfZ: anchor.rect.halfZ,
            floorH,
            floors: Math.max(...floorCounts),
            archetype,
            physicalUse,
            physicalTruth,
            servicePhysicalTruth,
            physicalTruthDecision: {
                schema: 'jweb.physical-truth-decision.v1',
                floorHeightSource: Number.isFinite(structureProfile?.floorHeight) ? 'explicit-structure-profile' : 'resolved-physical-truth',
                topologyPhase: 'precommit-broad-strokes',
            },
            semanticSiteKey: siteSignature,
            semanticChunkKey: chunk.key,
            doorSide: doorFace?.dir.side ?? 'north',
            entranceFaces: entranceFaces.map(face => ({ moduleKey: face.module.key, side: face.dir.side, dirKey: face.dir.key })),
            compoundCells: site.cells.map(cell => ({ col: cell.col, row: cell.row })),
            primaryCell: { col: topology.primary.col, row: topology.primary.row },
            courtyardCell: courtyard ? { col: courtyard.col, row: courtyard.row } : null,
            courtyardSuppressedForConnectivity,
            moduleCount: modulePlans.length,
            footprintModules: modulePlans.map(module => ({ ...module.rect, floors: module.floors, key: module.key })),
            modularSetbacks: Math.max(0, new Set(floorCounts).size - 1) + Math.max(0, modulePlans.length - 1),
            floorConnectivityRepair,
            heightVariance: Math.max(...floorCounts) - Math.min(...floorCounts),
            partitionSegments,
            buildingPlan,
            buildingPlanAuthority: buildingPlan.authoritySchema,
            buildingPlanFingerprint: buildingPlan.fingerprint,
            buildingPlanInspection: buildingPlan.inspection,
            internalOpenFaces,
            exposedSetbackFaces,
            partyFaces,
            balconySide: broadVerticalRoutes.find(route => route.generatedLandings?.length)?.side ?? null,
            scaffoldSide,
            scaffoldLandings,
            fastVerticalRouteCount: broadVerticalRoutes.length,
            fastVerticalFlightCount: fastVerticalFlights,
            fastVerticalLandingCount: fastVerticalLandings,
            fastVerticalDeckCount: fastVerticalDecks,
            fastExteriorStreetLayerCount: broadVerticalRoutes.reduce((sum, route) => sum + (route.streetLayers?.length ?? 0), 0),
            fastVerticalRoomPortalCount: broadVerticalRoutes.reduce((sum, route) => sum + (route.portalStops?.filter(stop => stop.source !== 'bridge-portal').length ?? 0), 0),
            fastVerticalSharedTrunkCount: broadVerticalRoutes.filter(route => (route.streetLayers?.length ?? 0) > 1).length,
            fastVerticalRouteFamilies: broadVerticalRoutes.map(route => route.family),
            exteriorCirculationAcceptedClearanceCount: acceptedExteriorClearances.length,
            exteriorCirculationCollisionRejectCount: collisionRejectRegistry.length,
            fastFacadeArchitectureSchema: facadeArchitecture.schema,
            fastFacadeArchitectureMetrics: facadeArchitecture.metrics,
            exteriorCirculationDebtTags: EXTERIOR_CIRCULATION_DEBT.map(item => item.tag),
            serviceCages: 0,
            cantileverRooms: 0,
            mezzanines: 0,
            interiorClutter: 0,
            serviceCores: 0,
            rooftopMechanical: 0,
            roofCrowns: roofTopper === 'none' ? 0 : 1,
            roofTopper,
            circulationReservationCount: Math.max(0, (physics.circulationReservations?.length ?? 0) - broadCirculationStartCount),
            singularRecipe: structureProfile?.singularRecipe ?? null,
            exteriorIdentity: structureProfile?.exteriorIdentity ? { ...structureProfile.exteriorIdentity } : null,
            exteriorMacroPreference: structureProfile?.exteriorMacroPreference ? { ...structureProfile.exteriorMacroPreference } : null,
            exteriorCompositionOwned: structureProfile?.exteriorCompositionOwned === true,
            suppressInteriorEnrichment: true,
            bridgePortalCount: bridgeOpeningKeys.size,
            facades,
            compoundBounds: bounds,
            kowloonIntensity: chunk.weirdness.sampled,
            generationProfile: GENERATION_PROFILE_NAME,
            broadStrokesOnly: true,
        };
    }


    function* buildKowloonCompoundSteps({
        chunk, site, siteIdOf, roadPlan, openSiteIds, bridgePortalsBySite, physics, transforms,
        cx0, cz0, half, cellSize, materialIndex, geometryAdapter = null,
        streetCellOverride = null, courtyardCellOverride = undefined, structureProfile = null, districtBuildingContext = null,
    }) {
        const weird = chunk.weirdness.sampled;
        const intensity = kowloonIntensity(weird);
        const siteSignature = site.cells.map(cell => kowloonCellKey(cell.col, cell.row)).join('|');
        const siteSeed = hashString32(`${worldSeed}:kowloon-compound:${chunk.key}:${siteSignature}`);
        const rng = mulberry32(siteSeed);
        const topology = analyzeKowloonCompound(site, siteIdOf);
        const requestedCourtyard = courtyardCellOverride !== undefined
            ? courtyardCellOverride
            : (topology.courtyardCandidate
                ?? selectKowloonCourtyardCell(site, topology.degreeOf, topology.primary, { minCells: 5, degree: 3 }));
        // A courtyard is an open cell inside one compound, not permission to split
        // that building into unreachable detached masses. Articulation-point
        // candidates are suppressed so the Building Plan Authority can own one
        // physically connected ground-floor topology.
        const courtyard = requestedCourtyard
            && kowloonCellSetConnected(site.cells.filter(cell => cell !== requestedCourtyard))
            ? requestedCourtyard
            : null;
        const courtyardSuppressedForConnectivity = !!requestedCourtyard && !courtyard;
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
        const physicalUse = classifyPhysicalUse({
            morphology: archetype,
            stableKey: `${chunk.key}:${siteSignature}`,
            districtContext: 'kowloon',
            override: structureProfile?.physicalUse ?? null,
        });
        const districtBuildingPolicy = districtBuildingPolicyForEntity({
            physicalUse,
            districtComposition: districtBuildingContext,
        });
        const entryRole = primaryPhysicalRole(physicalUse.family);
        const physicalTruth = resolvePhysicalTruth({
            physicalUse,
            role: entryRole,
            weirdness: weird,
            stableKey: `${chunk.key}:${siteSignature}:primary`,
        });
        const servicePhysicalTruth = resolvePhysicalTruth({
            physicalUse,
            role: 'maintenance-access',
            weirdness: weird,
            stableKey: `${chunk.key}:${siteSignature}:service`,
        });
        const stairPhysicalTruth = resolvePhysicalTruth({
            physicalUse,
            role: 'primary-circulation',
            weirdness: weird,
            stableKey: `${chunk.key}:${siteSignature}:stair`,
        });
        let primaryFloors = Math.min(12, baseFloors + verticalBurst + (site.cells.length >= 4 && archetype !== 'workshop-warehouse' ? 1 : 0));
        if (Number.isFinite(structureProfile?.primaryFloors)) primaryFloors = Math.max(1, Math.min(12, Math.floor(structureProfile.primaryFloors)));
        const floorH = Number.isFinite(structureProfile?.floorHeight)
            ? Math.max(2.4, Math.min(5.8, structureProfile.floorHeight))
            : Math.max(2.4, Math.min(5.8, physicalTruth.floorHeight.realizedSI));
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
        const bridgeOpeningByKey = new Map();
        for (const portal of bridgePortals) {
            const module = modulePlans.find(candidate => candidate.key === portal.moduleKey);
            if (!module) continue;
            const dir = KOWLOON_DIRS.find(candidate => candidate.key === portal.dirKey);
            if (!dir) throw new Error(`bridge endpoint ${portal.id ?? portal.bridgeId ?? 'unknown'} has invalid facade direction ${portal.dirKey}`);
            module.floors = Math.max(module.floors, portal.floor + 1);
            const metric = geometryAdapter?.metricForCell?.(module.cell) ?? {
                x: cx0 - half + (module.cell.col + 0.5) * cellSize,
                z: cz0 - half + (module.cell.row + 0.5) * cellSize,
            };
            const horizontal = dir.side === 'north' || dir.side === 'south';
            const width = Number(servicePhysicalTruth?.door?.clearWidth?.realizedSI) || 1.35;
            const height = Number(servicePhysicalTruth?.door?.clearHeight?.realizedSI) || 2.20;
            const depth = Number(servicePhysicalTruth?.door?.approachDepthSI) || 1.20;
            const tangentCenter = horizontal ? Number(module.rect.cx) : Number(module.rect.cz);
            const tangentHalf = horizontal ? Number(module.rect.halfX) : Number(module.rect.halfZ);
            const requestedTangent = horizontal ? Number(metric.x) : Number(metric.z);
            if (![tangentCenter, tangentHalf, requestedTangent].every(Number.isFinite) || tangentHalf * 2 < width + 0.04) {
                throw new Error(`${portal.id ?? portal.bridgeId ?? 'bridge-endpoint'}: facade cannot resolve a full-width bridge doorway`);
            }
            const endpointNormalAxis = horizontal ? 'z' : 'x';
            if (portal.axis && portal.axis !== endpointNormalAxis) {
                throw new Error(`${portal.id ?? portal.bridgeId ?? 'bridge-endpoint'}: bridge axis does not match endpoint facade normal`);
            }
            const usableHalf = tangentHalf - width * 0.5;
            const tangent = clamp(requestedTangent, tangentCenter - usableHalf, tangentCenter + usableHalf);
            const x = horizontal
                ? tangent
                : Number(module.rect.cx) + (dir.side === 'west' ? -Number(module.rect.halfX) : Number(module.rect.halfX));
            const z = horizontal
                ? Number(module.rect.cz) + (dir.side === 'north' ? -Number(module.rect.halfZ) : Number(module.rect.halfZ))
                : tangent;
            Object.assign(portal, {
                side: dir.side, tangent, x, z, y: Number(portal.floor) * floorH,
                width, height, depth,
                resolved: true,
                endpointAuthority: 'bridge-facade-endpoint-v1',
                placementAuthority: 'external-anchor',
            });
            const openingKey = `${portal.moduleKey}:${portal.dirKey}:${portal.floor}`;
            bridgeOpeningKeys.add(openingKey);
            bridgeOpeningByKey.set(openingKey, {
                center: tangent, width, height,
                bridgeId: portal.bridgeId ?? null,
                endpointId: portal.id ?? null,
                endpointAuthority: portal.endpointAuthority,
            });
        }

        // The vertical spine must be the tallest module so every other occupied
        // floor can be reached laterally through same-site openings.
        let primaryModule = modulePlans.find(module => module.key === primaryKey) || modulePlans[0];
        for (const module of modulePlans) module.floors = Math.min(module.floors, primaryModule.floors);
        // Every occupied upper-floor module must have a same-site lateral route to
        // the persistent vertical spine. Raise only the deterministic shortest
        // support chain needed to preserve requested/bridge-served upper floors.
        const floorConnectivityRepair = normalizeModuleFloorConnectivity(modulePlans, primaryModule, bridgePortals);
        const moduleByKey = new Map(modulePlans.map(module => [module.key, module]));

        if (GENERATION_LANES.broadStrokesOnly) {
            return yield* buildBroadStrokesCompoundSteps({
                chunk, site, siteIdOf, openSiteIds, topology, siteSignature, siteSeed, structureProfile,
                physics, transforms, materialIndex, modulePlans, moduleByKey, primaryModule,
                floorH, archetype, physicalUse, physicalTruth, servicePhysicalTruth, stairPhysicalTruth,
                districtBuildingPolicy, districtBuildingContext,
                floorConnectivityRepair, courtyard, courtyardSuppressedForConnectivity,
                bridgeOpeningKeys, bridgeOpeningByKey, bridgePortals,
                cx0, cz0, half, cellSize,
            });
        }
        yield { phase: 'compound-massing-plan', current: 0, total: modulePlans.length };

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
                physicalTruth,
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
                physicalTruth,
                metadata: { moduleKey: face.module.key, dirKey: face.dir.key, floor: 0, physicalUse: physicalUse.family },
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

        // Scaffold circulation is solved before wall publication so facade apertures,
        // connector reservations and later realization all consume the same valid route.
        // The primary stair center is still chosen later by the legacy shared RNG, so
        // preflight against the complete range that center may occupy. Primary interior
        // circulation wins before a scaffold can publish either geometry or an aperture.
        const primaryStairCore = planInteriorSwitchbackStairCore({
            rect: primaryModule.rect,
            floorH,
            physicalTruth: stairPhysicalTruth,
            traversalEnvelope,
            stableKey: `${chunk.key}:${siteSignature}:${primaryModule.key}:switchback-core`,
        });
        if (!primaryStairCore) {
            throw new Error(`${chunk.key}:${siteSignature}:${primaryModule.key}: no human-scale switchback stair fits the primary module`);
        }
        const primaryStairAxis = primaryStairCore.axis;
        const primaryRunInterior = primaryStairCore.metrics.availableAlong;
        const primaryCrossInterior = primaryStairCore.metrics.availableCross;
        const primaryNominalStairFlight = primaryStairCore.segmentFlight;
        const primaryStairAvailableRun = primaryStairCore.segmentFlight.requiredRun;
        const primaryActualStairClearWidth = primaryStairCore.clearWidth;
        const primaryStairCrossOpening = primaryStairAxis === 'z' ? primaryStairCore.opening.sx : primaryStairCore.opening.sz;
        const primaryStairRunOpening = primaryStairAxis === 'z' ? primaryStairCore.opening.sz : primaryStairCore.opening.sx;
        const primaryStairGapW = primaryStairCore.opening.sx;
        const primaryStairGapD = primaryStairCore.opening.sz;
        const primaryStairCx = primaryStairCore.opening.x;
        const primaryStairCz = primaryStairCore.opening.z;
        const primaryStairFrom = primaryStairCore.flights[0].from;
        const primaryStairTo = primaryStairCore.flights[0].to;
        const primaryStairHalfWidth = primaryStairCore.halfWidth;
        const primaryStairFlight = primaryStairCore.segmentFlight;
        const primaryStairEnvelope = createBoxCirculationReservation({
            id: `${chunk.key}:${siteSignature}:${primaryModule.key}:stair:preflight-envelope`,
            kind: 'stair-preflight-envelope',
            x: primaryStairCx,
            z: primaryStairCz,
            // The internal core is deterministic and centered now. Preflight the
            // actual player-clear switchback envelope rather than a legacy jitter range.
            halfX: primaryStairGapW * 0.5 + KOWLOON_EXTERIOR_WALL_THICKNESS,
            halfZ: primaryStairGapD * 0.5 + KOWLOON_EXTERIOR_WALL_THICKNESS,
            yMin: 0,
            yMax: primaryModule.floors * floorH + stairPhysicalTruth.stair.headroomSI,
            source: 'compound-stair-preflight',
        });
        const scaffoldCandidates = streetFaces.filter(face => !face.courtyard && face.module.floors >= 2);
        const scaffoldOpeningByKey = new Map();
        let scaffoldPlan = null;
        let scaffoldSide = null;
        if (scaffoldCandidates.length) {
            const scaffoldPresenceRng = mulberry32(hashString32(`${siteSeed}:scaffold-presence`));
            if (scaffoldPresenceRng() < intensity.scaffoldChance) {
                const scaffoldEnvelopeDepth = Math.max(1.2, Math.min(2.4, cellSize * 0.34));
                const validScaffolds = scaffoldCandidates.map(face => {
                    const seed = hashString32(`${siteSeed}:scaffold:${face.module.key}:${face.dir.side}`);
                    const plan = planExteriorScaffoldRoute({
                        fp: face.module.rect,
                        siteId: site.id,
                        moduleKey: face.module.key,
                        floors: face.module.floors,
                        floorH,
                        side: face.dir.side,
                        seed,
                        physicalTruth: servicePhysicalTruth,
                        maxExteriorDepth: scaffoldEnvelopeDepth,
                        routeId: `${chunk.key}:${siteSignature}:${face.module.key}:scaffold:${face.dir.side}`,
                    });
                    if (!plan) return null;
                    const primaryCirculationConflict = plan.landings.some(landing =>
                        reservationIntersectsBox(primaryStairEnvelope, {
                            x: landing.x, z: landing.z, sx: landing.sx, sz: landing.sz,
                            yMin: landing.y - 0.02, yMax: landing.y + 0.02,
                        })
                    ) || plan.flights.some(flight => {
                        const corridor = createRampCirculationReservation({
                            id: `${plan.id}:${flight.id}:preflight`,
                            kind: 'scaffold-preflight-ramp',
                            axis: flight.axis,
                            from: flight.from,
                            to: flight.to,
                            fixedCoord: flight.fixedCoord,
                            halfWidth: flight.halfWidth,
                            y0: flight.y0,
                            y1: flight.y1,
                            capsuleRadius: 0.28,
                            headroom: flight.headroom,
                            source: 'exterior-scaffold-preflight',
                        });
                        return reservationIntersectsBox(primaryStairEnvelope, {
                            x: corridor.x, z: corridor.z, hx: corridor.halfX, hz: corridor.halfZ,
                            yMin: corridor.yMin, yMax: corridor.yMax,
                        });
                    });
                    if (primaryCirculationConflict) return null;
                    const openingConflict = plan.openings.some(opening => {
                        const openingKey = `${face.module.key}:${face.dir.key}:${opening.level}`;
                        return bridgeOpeningKeys.has(openingKey)
                            || cantileverOpeningKeys.has(openingKey)
                            || serviceCageOpeningKeys.has(openingKey)
                            || entranceConnectorByKey.has(openingKey);
                    });
                    return openingConflict ? null : { face, plan };
                }).filter(Boolean);
                validScaffolds.sort((a, b) => {
                    const heightRank = b.face.module.floors - a.face.module.floors;
                    if (heightRank) return heightRank;
                    const topologyRank = (a.plan.topology === 'canonical-facade-zigzag' ? 0 : 1) - (b.plan.topology === 'canonical-facade-zigzag' ? 0 : 1);
                    if (topologyRank) return topologyRank;
                    const aMargin = a.plan.facadeTangentAvailable - a.plan.tangentSpan;
                    const bMargin = b.plan.facadeTangentAvailable - b.plan.tangentSpan;
                    if (Math.abs(aMargin - bMargin) > 1e-9) return bMargin - aMargin;
                    return `${a.face.module.key}:${a.face.dir.side}`.localeCompare(`${b.face.module.key}:${b.face.dir.side}`);
                });
                const accepted = validScaffolds[0] ?? null;
                if (accepted) {
                    scaffoldPlan = accepted.plan;
                    scaffoldSide = accepted.face.dir.side;
                    for (const opening of scaffoldPlan.openings) {
                        scaffoldOpeningByKey.set(
                            `${accepted.face.module.key}:${accepted.face.dir.key}:${opening.level}`,
                            { width: opening.width, height: opening.height, center: opening.tangent, routeId: scaffoldPlan.id, openingId: opening.id },
                        );
                    }
                }
            }
        }
        yield { phase: 'compound-exterior-feature-plan', current: 0, total: modulePlans.length };

        let partitionSegments = 0;
        let exposedSetbackFaces = 0;
        let internalOpenFaces = 0;
        let partyFaces = 0;
        const facades = [];
        const circulationStartCount = physics.circulationReservations.length;
        const circulationByModule = new Map();

        // BUILDING PLAN AUTHORITY: physical envelope, entrance connectors and the
        // persistent vertical core are known now.  Author the semantic floor graph
        // before any partition geometry is published, then make geometry consume it.
        // Switchback core geometry was solved once above and is the vertical-core authority.
        const primaryModuleRoofY = primaryModule.floors > 0
            ? (primaryModule.floors - 1) * floorH + floorH
            : 0;
        const buildingPlanEntityId = worldEntityId(worldSeed, chunk.x, chunk.z, 'building', siteSignature);
        const primaryStairConnector = createStairConnector({
            id: `${chunk.key}:${siteSignature}:${primaryModule.key}:stair`,
            x: primaryStairCx, z: primaryStairCz,
            openingWidth: primaryStairGapW,
            openingDepth: primaryStairGapD,
            baseY: 0,
            roofY: primaryModuleRoofY,
            exitHeadroom: stairPhysicalTruth.stair.headroomSI,
            rampAxis: primaryStairAxis,
            rampFrom: primaryStairFrom,
            rampTo: primaryStairTo,
            rampHalfWidth: primaryStairHalfWidth,
            source: 'compound-stair',
            visualRole: 'vertical-spine',
            fromSpaceId: null,
            toSpaceId: null,
            physicalTruth: stairPhysicalTruth,
            stairFlight: primaryStairFlight,
            metadata: {
                moduleKey: primaryModule.key,
                floors: primaryModule.floors,
                floorH,
                physicalUse: physicalUse.family,
                clearWidthRealizedSI: primaryActualStairClearWidth,
                widthFitClassification: primaryActualStairClearWidth + 1e-9 < stairPhysicalTruth.stair.widthSI
                    ? 'geometry-fit-outside-truth'
                    : 'fits-resolved-truth',
                runFitClassification: primaryStairFlight.fitClassification,
                buildingPlanId: buildingPlanEntityId,
            },
        });
        registerSemanticConnector(physics, primaryStairConnector);
        const primaryStairReservation = primaryStairConnector.primaryReservation;
        primaryStairReservation.stairTopology = primaryStairCore.topology;
        primaryStairReservation.integratedFloorLanding = true;
        primaryStairReservation.floorLandingDepth = primaryStairCore.floorLandingDepth;
        primaryStairReservation.midLandingDepth = primaryStairCore.midLandingDepth;
        primaryStairReservation.flightCount = primaryStairCore.flightCount;
        primaryStairReservation.playerSideClearance = primaryStairCore.sideCapsuleClearance;
        const primaryStairSlabOpening = primaryStairCore.slabOpening;
        if (!primaryStairSlabOpening) throw new Error(`${chunk.key}:${siteSignature}:${primaryModule.key}: stair core missing slab opening`);
        const primaryStairSlabOpeningReservation = createBoxCirculationReservation({
            id: `${chunk.key}:${siteSignature}:${primaryModule.key}:stair:slab-opening`,
            kind: 'stair-slab-opening',
            x: primaryStairSlabOpening.x,
            z: primaryStairSlabOpening.z,
            halfX: primaryStairSlabOpening.hx,
            halfZ: primaryStairSlabOpening.hz,
            yMin: 0,
            yMax: primaryModuleRoofY + stairPhysicalTruth.stair.headroomSI,
            source: 'compound-stair-slab-opening',
            metadata: {
                stairTopology: primaryStairCore.topology,
                integratedFloorLanding: true,
                fullReservationId: primaryStairReservation.id,
            },
        });
        primaryStairReservation.slabOpeningX = primaryStairSlabOpening.x;
        primaryStairReservation.slabOpeningZ = primaryStairSlabOpening.z;
        primaryStairReservation.slabOpeningWidth = primaryStairSlabOpening.sx;
        primaryStairReservation.slabOpeningDepth = primaryStairSlabOpening.sz;
        // Access identity comes from canonical Portals, not connector publication
        // order or an independent interior entrance roll. Structural connector IDs
        // remain the physical identity carried by each Portal.
        const accessPortals = compileAccessPortals({ connectors: [...entranceConnectorByKey.values()] });
        const accessAnchors = accessAnchorsForBuildingPortals(accessPortals);
        const buildingPlanKey = semanticPlanCacheKey({
            worldSeed,
            chunkKey: chunk.key,
            entityId: buildingPlanEntityId,
            planKind: 'building-plan-authority',
        });
        const buildingPlan = buildingPlanCache.getOrCreate(buildingPlanKey, () => promoteBuildingPlanAuthority(planBuildingSidecar({
            worldSeed,
            chunkKey: chunk.key,
            chunkX: chunk.x,
            chunkZ: chunk.z,
            distanceChunks: chunk.weirdness?.distanceChunks ?? Math.hypot(chunk.x || 0, chunk.z || 0),
            weirdnessSampled: weird,
            isSpawn: chunk.key === spawnChunkKey || String(chunk.key).startsWith('spawn-'),
            entityId: buildingPlanEntityId,
            signatureType: structureProfile?.signatureType ?? null,
            programHint: structureProfile?.semanticProgram ?? structureProfile?.programHint ?? districtBuildingPolicy.programHint ?? null,
            exteriorMacroPreference: structureProfile?.exteriorMacroPreference ?? null,
            districtCompositionId: districtBuildingPolicy.compositionId ?? null,
            districtComposition: districtBuildingContext ?? districtBuildingPolicy,
            physicalUse,
            physicalTruth,
            floorHeight: floorH,
            modules: modulePlans.map(module => ({
                key: module.key,
                cx: module.rect.cx,
                cz: module.rect.cz,
                halfX: module.rect.halfX,
                halfZ: module.rect.halfZ,
                floors: module.floors,
            })),
            accessAnchors,
            circulationReservations: [
                primaryStairReservation,
                ...[...entranceConnectorByKey.values()].flatMap(connector => connector.reservations ?? []),
            ],
        }), {
            coreReservationId: primaryStairReservation.id,
            coreReservation: primaryStairReservation,
            chunkKey: chunk.key,
            entityId: buildingPlanEntityId,
        }));
        assertBuildingPlanAuthority(buildingPlan);

        const groundFloorPlan = buildingPlan.floors.find(floor => floor.floor === 0) ?? buildingPlan.floors[0];
        const groundRoot = groundFloorPlan?.spaces?.find(space => space.key === groundFloorPlan.rootSpaceKey) ?? groundFloorPlan?.spaces?.[0];
        if (groundRoot) {
            for (const connector of entranceConnectorByKey.values()) {
                connector.fromSpaceId = groundRoot.id;
                connector.toSpaceId = `${chunk.key}:street`;
                connector.spaceIds = [groundRoot.id];
                for (const endpoint of connector.endpoints ?? []) {
                    endpoint.fromSpaceId = groundRoot.id;
                    endpoint.toSpaceId = connector.toSpaceId;
                }
            }
        }
        const coreSpaceIds = buildingPlan.verticalCore?.floorSpaceIds ?? [];
        primaryStairConnector.fromSpaceId = coreSpaceIds[0] ?? null;
        primaryStairConnector.toSpaceId = coreSpaceIds[coreSpaceIds.length - 1] ?? null;
        primaryStairConnector.spaceIds = [...coreSpaceIds];
        const buildingPlanDoorConnectors = registerBuildingPlanInteriorDoors(physics, buildingPlan, physicalTruth);
        for (const module of modulePlans) {
            circulationByModule.set(module.key, buildingPlanReservationsForModule(buildingPlan, module, buildingPlanDoorConnectors));
        }

        yield { phase: 'compound-semantic-plan', current: 0, total: modulePlans.length };
        for (const module of modulePlans) {
            const wallList = transforms.wallGroups[materialIndex];
            const sampledStairCx = module.rect.cx + (rng() - 0.5) * module.rect.halfX * 0.18;
            const sampledStairCz = module.rect.cz + (rng() - 0.5) * module.rect.halfZ * 0.18;
            const isSpine = module === primaryModule;
            const stairCx = isSpine ? primaryStairCx : sampledStairCx;
            const stairCz = isSpine ? primaryStairCz : sampledStairCz;
            const stairRunAxis = module.rect.halfZ >= module.rect.halfX ? 'z' : 'x';
            const runInterior = Math.max(1.2, (stairRunAxis === 'z' ? module.rect.halfZ : module.rect.halfX) * 2 - 0.44);
            const crossInterior = Math.max(0.8, (stairRunAxis === 'z' ? module.rect.halfX : module.rect.halfZ) * 2 - 0.38);
            const nominalStairFlight = deriveStairFlight({
                rise: floorH,
                truth: stairPhysicalTruth,
                stableKey: `${chunk.key}:${siteSignature}:${module.key}:flight:nominal`,
            });
            const stairAvailableRun = Math.min(nominalStairFlight.requiredRun, runInterior);
            const stairFlight = deriveStairFlight({
                rise: floorH,
                truth: stairPhysicalTruth,
                stableKey: `${chunk.key}:${siteSignature}:${module.key}:flight`,
                availableRun: stairAvailableRun,
            });
            const actualStairClearWidth = Math.min(stairPhysicalTruth.stair.widthSI, Math.max(0.56, crossInterior - 0.14));
            const stairCrossOpening = Math.min(crossInterior, Math.max(actualStairClearWidth + 0.16, actualStairClearWidth * 1.08));
            const stairRunOpening = Math.min(runInterior + 0.18, Math.max(stairAvailableRun + 0.18, 1.35));
            const stairGapW = stairRunAxis === 'z' ? stairCrossOpening : stairRunOpening;
            const stairGapD = stairRunAxis === 'z' ? stairRunOpening : stairCrossOpening;
            const stairFrom = stairRunAxis === 'z' ? stairCz - stairAvailableRun * 0.5 : stairCx - stairAvailableRun * 0.5;
            const stairTo = stairRunAxis === 'z' ? stairCz + stairAvailableRun * 0.5 : stairCx + stairAvailableRun * 0.5;
            const stairHalfWidth = actualStairClearWidth * 0.5;
            // Match the exact arithmetic used by the final stair flight arrival.
            // JS can represent floors * floorH and (floors - 1) * floorH + floorH
            // a few ulps apart, which breaks the circulation contract's exact roof key.
            const moduleRoofY = module.floors > 0 ? (module.floors - 1) * floorH + floorH : 0;
            const stairConnector = isSpine ? primaryStairConnector : null;
            const stairReservation = stairConnector?.primaryReservation ?? null;
            if (stairConnector) {
                registerSemanticConnector(physics, stairConnector);
                const reservations = circulationByModule.get(module.key) ?? [];
                if (stairReservation && !reservations.some(item => item.id === stairReservation.id)) reservations.push(stairReservation);
                circulationByModule.set(module.key, reservations);
            } else if (!circulationByModule.has(module.key)) {
                circulationByModule.set(module.key, []);
            }

            // Existing interior circulation authority wins over an otherwise valid
            // exterior scaffold plan. This happens before this module's walls publish,
            // so rejection cannot leave orphan facade apertures.
            if (scaffoldPlan?.moduleKey === module.key && stairReservation) {
                const blocksPrimaryStair = scaffoldPlan.landings.some(landing =>
                    reservationIntersectsBox(stairReservation, {
                        x: landing.x, z: landing.z, sx: landing.sx, sz: landing.sz,
                        yMin: landing.y - 0.02, yMax: landing.y + 0.02,
                    })
                );
                if (blocksPrimaryStair) {
                    scaffoldPlan = null;
                    scaffoldSide = null;
                    scaffoldOpeningByKey.clear();
                }
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
                    if (bridgeOpeningByKey.has(`${module.key}:${dir.key}:${floor}`)) opening = bridgeOpeningByKey.get(`${module.key}:${dir.key}:${floor}`);
                    else if (cantileverOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = servicePhysicalTruth.door.clearWidth.realizedSI;
                    else if (scaffoldOpeningByKey.has(`${module.key}:${dir.key}:${floor}`)) opening = scaffoldOpeningByKey.get(`${module.key}:${dir.key}:${floor}`);
                    else if (serviceCageOpeningKeys.has(`${module.key}:${dir.key}:${floor}`)) opening = servicePhysicalTruth.door.clearWidth.realizedSI;
                    else if (entranceConnectorByKey.has(`${module.key}:${dir.key}:${floor}`)) {
                        opening = connectorOpeningWidth(entranceConnectorByKey.get(`${module.key}:${dir.key}:${floor}`), physicalTruth.door.clearWidth.realizedSI);
                    }
                    else if (floor === 0 && kind === 'courtyard' && rng() < 0.44) opening = servicePhysicalTruth.door.clearWidth.realizedSI;
                    addCompoundSideWall({ physics, wallList, rect: module.rect, floorH, floor, side: dir.side, opening });
                    if (kind === 'street' || kind === 'courtyard') facades.push({
                        moduleKey: module.key, side: dir.side, exposure: kind, x: module.rect.cx, z: module.rect.cz,
                        halfX: module.rect.halfX, halfZ: module.rect.halfZ,
                        yMin: y0, yMax: y1,
                    });
                }

                if (floor > 0) {
                    const slabRect = computeKowloonSlabRect(module, moduleByKey, floor);
                    const primaryShaftCutsSlab = reservationIntersectsBox(primaryStairSlabOpeningReservation, {
                        x: slabRect.cx, z: slabRect.cz, sx: slabRect.width, sz: slabRect.depth,
                        yMin: y0 - 0.02, yMax: y0 + 0.02,
                    });
                    if (primaryShaftCutsSlab) {
                        addNotchedFloor(physics.platforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                            primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
                        addRenderedNotchedSlab(transforms, slabRect.cx, slabRect.cz,
                            slabRect.width, slabRect.depth,
                            y0, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                            primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
                    } else {
                        addRectPlatform(physics.platforms, slabRect.cx, slabRect.cz, slabRect.width, slabRect.depth, y0, 'floor');
                        transforms.slabs.push({ x: slabRect.cx, y: y0 - 0.06, z: slabRect.cz,
                            sx: slabRect.width, sy: 0.12, sz: slabRect.depth });
                    }
                }

                // Interior room geometry is no longer sampled independently here.
                // Planned wall runs are emitted once after the envelope/slab pass.

                if (isSpine && floor < module.floors) {
                    const stairGuardFamily = guardFamilyForContext({ supportKind: 'compound-stair', visualRole: 'interior-stair', physicalUse: stairPhysicalTruth?.physicalUse });
                    realizeInteriorSwitchbackStory({
                        physics, transforms, core: primaryStairCore, floor, y0, y1, guardFamily: stairGuardFamily,
                        treadVisualBudget: GENERATION_LANES.broadStrokesOnly ? 3 : Infinity,
                        metadata: {
                            stairId: `${chunk.key}:${siteSignature}:${module.key}:compound-stair`,
                            moduleKey: module.key, physicalUse: stairPhysicalTruth?.physicalUse,
                        },
                    });
                }
            }

            const roofY = moduleRoofY;
            const roofRect = computeKowloonSlabRect(module, moduleByKey, module.floors, { roof: true });
            const primaryShaftCutsRoof = reservationIntersectsBox(primaryStairSlabOpeningReservation, {
                x: roofRect.cx, z: roofRect.cz, sx: roofRect.width, sz: roofRect.depth,
                yMin: roofY - 0.02, yMax: roofY + 0.02,
            });
            if (primaryShaftCutsRoof) {
                // The vertical-core reservation is building-wide. If a neighboring
                // module's floor/roof overlaps the shaft envelope, it must yield too;
                // otherwise a valid stair can still arrive under another module's slab.
                addNotchedFloor(physics.platforms, roofRect.cx, roofRect.cz,
                    roofRect.width, roofRect.depth,
                    roofY, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                    primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2, 'roof');
                addRenderedNotchedSlab(transforms, roofRect.cx, roofRect.cz,
                    roofRect.width, roofRect.depth,
                    roofY, primaryStairSlabOpeningReservation.x, primaryStairSlabOpeningReservation.z,
                    primaryStairSlabOpeningReservation.halfX * 2, primaryStairSlabOpeningReservation.halfZ * 2);
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
                if (exposed) addCompoundRoofParapetSide({ physics, transforms, wallList, rect: module.rect, roofY, side: dir.side });
            }
            yield { phase: 'compound-module-shell', moduleKey: module.key, current: modulePlans.indexOf(module) + 1, total: modulePlans.length };
        }

        partitionSegments += realizeBuildingPlanWallRuns({
            physics,
            wallList: transforms.wallGroups[materialIndex],
            plan: buildingPlan,
        });

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
            const connector = entranceConnectorByKey.get(`${entranceFace.module.key}:${entranceFace.dir.key}:0`);
            const width = connector?.aperture?.width ?? physicalTruth.door.clearWidth.realizedSI;
            const height = connector?.aperture?.height ?? physicalTruth.door.clearHeight.realizedSI;
            if (side === 'north' || side === 'south') {
                transforms.doors.push({ x: rect.cx, y: height * 0.5, z: rect.cz + (side === 'north' ? -rect.halfZ - 0.018 : rect.halfZ + 0.018), sx: width, sy: height, sz: 0.05 });
            } else {
                transforms.doors.push({ x: rect.cx + (side === 'west' ? -rect.halfX - 0.018 : rect.halfX + 0.018), y: height * 0.5, z: rect.cz, sx: 0.05, sy: height, sz: width });
            }
        }

        yield { phase: 'compound-facade-layer', current: modulePlans.length, total: modulePlans.length };

        // Preserve the legacy shared RNG stream position so unrelated balcony and
        // feature choices do not drift merely because scaffold feasibility moved pre-wall.
        if (scaffoldCandidates.length) rng();
        let scaffoldLandings = 0;
        if (scaffoldPlan) {
            scaffoldLandings = realizeExteriorScaffold({ physics, transforms, plan: scaffoldPlan });
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

        yield { phase: 'compound-medium-exterior', current: modulePlans.length, total: modulePlans.length };

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
                const mezzanineFlight = deriveStairFlight({
                    rise: y,
                    truth: servicePhysicalTruth,
                    stableKey: `${chunk.key}:${siteSignature}:${module.key}:mezzanine:${mezzanines}`,
                    availableRun: Math.abs(to - from),
                });
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
                    headroom: servicePhysicalTruth.route.headroomSI,
                    source: 'mezzanine-stair',
                    visualRole: 'mezzanine-access',
                    reservationKind: 'mezzanine-ramp',
                    physicalTruth: servicePhysicalTruth,
                    stairFlight: mezzanineFlight,
                    metadata: { moduleKey: module.key, index: mezzanines, fitClassification: mezzanineFlight.fitClassification, physicalUse: physicalUse.family },
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
                    const stepCount = mezzanineFlight.stepCount;
                    const stepThickness = Math.min(0.11, Math.max(0.065, mezzanineFlight.riserHeight * 0.58));
                    for (let i = 0; i < stepCount; i++) {
                        const t = (i + 0.5) / stepCount;
                        const along = from + (to - from) * t;
                        const stepY = mezzanineFlight.riserHeight * (i + 1) - stepThickness * 0.5;
                        transforms.steps.push(axis === 'x'
                            ? { x: along, y: stepY, z: fixedCoord, sx: Math.abs(to - from) / stepCount * 1.06, sy: stepThickness, sz: rampWidth }
                            : { x: fixedCoord, y: stepY, z: along, sx: rampWidth, sy: stepThickness, sz: Math.abs(to - from) / stepCount * 1.06 });
                    }
                    emitFlightGuardPairFromAuthority({
                        physics, transforms, idPrefix: `${chunk.key}:${siteSignature}:${module.key}:mezzanine:${mezzanines}:guard`,
                        axis, from, to, fixedCoord, halfWidth: rampWidth * 0.5, y0: 0, y1: y,
                        family: guardFamilyForContext({ supportKind: 'mezzanine-stair', visualRole: 'mezzanine-access', physicalUse: servicePhysicalTruth?.physicalUse }),
                        supportKind: 'mezzanine-stair-guard',
                        metadata: { moduleKey: module.key, index: mezzanines, physicalUse: servicePhysicalTruth?.physicalUse, visualRole: 'mezzanine-access' },
                    });
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
            yield { phase: 'compound-shared-features', moduleKey: module.key, current: modulePlans.indexOf(module) + 1, total: modulePlans.length };
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
            physicalUse,
            physicalTruth,
            servicePhysicalTruth,
            physicalTruthDecision: {
                schema: 'jweb.physical-truth-decision.v1',
                floorHeightSource: Number.isFinite(structureProfile?.floorHeight) ? 'explicit-structure-profile' : 'resolved-physical-truth',
                topologyPhase: 'precommit',
            },
            semanticSiteKey: siteSignature,
            semanticChunkKey: chunk.key,
            doorSide: doorFace?.dir.side ?? scaffoldSide ?? 'north',
            entranceFaces: entranceFaces.map(face => ({ moduleKey: face.module.key, side: face.dir.side, dirKey: face.dir.key })),
            compoundCells: site.cells.map(cell => ({ col: cell.col, row: cell.row })),
            primaryCell: { col: topology.primary.col, row: topology.primary.row },
            courtyardCell: courtyard ? { col: courtyard.col, row: courtyard.row } : null,
            courtyardSuppressedForConnectivity,
            moduleCount: modulePlans.length,
            footprintModules: modulePlans.map(module => ({ ...module.rect, floors: module.floors, key: module.key })),
            modularSetbacks: Math.max(0, new Set(floorCounts).size - 1) + Math.max(0, modulePlans.length - 1),
            floorConnectivityRepair,
            heightVariance: Math.max(...floorCounts) - Math.min(...floorCounts),
            partitionSegments,
            buildingPlan,
            buildingPlanAuthority: buildingPlan.authoritySchema,
            buildingPlanFingerprint: buildingPlan.fingerprint,
            buildingPlanInspection: buildingPlan.inspection,
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
            exteriorIdentity: structureProfile?.exteriorIdentity ? { ...structureProfile.exteriorIdentity } : null,
            exteriorMacroPreference: structureProfile?.exteriorMacroPreference ? { ...structureProfile.exteriorMacroPreference } : null,
            exteriorCompositionOwned: structureProfile?.exteriorCompositionOwned === true,
            suppressInteriorEnrichment: !!structureProfile?.suppressInteriorClutter,
            bridgePortalCount: bridgeOpeningKeys.size,
            facades,
            compoundBounds: bounds,
            kowloonIntensity: weird,
        };
    }

    function runCompoundStepperToCompletion(stepper) {
        let step = stepper.next();
        while (!step.done) step = stepper.next();
        return step.value;
    }

    function buildKowloonCompound(args) {
        return runCompoundStepperToCompletion(buildKowloonCompoundSteps(args));
    }

    async function buildKowloonCompoundCooperative(args) {
        yieldControl?.resetSlice?.();
        const stepper = buildKowloonCompoundSteps(args);
        let step = stepper.next();
        while (!step.done) {
            const checkpoint = step.value ?? {};
            if (yieldControl) {
                await yieldControl(`${checkpoint.phase ?? 'compound-step'} ${args.chunk?.key ?? 'unknown'}`, checkpoint.current ?? 0, checkpoint.total ?? 0);
            }
            step = stepper.next();
        }
        return step.value;
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

    function semanticSpaceIdForEntity(entity, moduleKey, floor, point = null) {
        const planned = (entity?.buildingPlan?.topologySpaces ?? [])
            .filter(space => space.floor === floor && (!moduleKey || space.moduleKeys?.includes(moduleKey)));
        if (planned.length) {
            const containsPoint = point ? planned.find(space => (space.regions ?? []).some(region =>
                point.x >= region.minX - 0.25 && point.x <= region.maxX + 0.25
                && point.z >= region.minZ - 0.25 && point.z <= region.maxZ + 0.25)) : null;
            if (containsPoint) return containsPoint.id;
            const roleRank = role => role === 'circulation' ? 0 : role === 'entry' ? 1 : role === 'public' ? 2 : 3;
            planned.sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.id.localeCompare(b.id));
            return planned[0].id;
        }
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
        const bridgeTruth = aEntity.servicePhysicalTruth ?? aEntity.physicalTruth ?? bEntity.servicePhysicalTruth ?? bEntity.physicalTruth ?? null;
        const truthWidth = bridgeTruth?.stair?.widthSI ?? 0.86;
        const width = hanging ? Math.max(0.72, Math.min(0.96, truthWidth * 0.90)) : Math.max(0.90, Math.min(1.22, truthWidth));
        const aEndpoint = bridge.aEndpoint?.resolved === true ? bridge.aEndpoint : null;
        const bEndpoint = bridge.bEndpoint?.resolved === true ? bridge.bEndpoint : null;
        const endpointAuthority = !!aEndpoint && !!bEndpoint;
        if (endpointAuthority && (aEndpoint.bridgeId !== bridge.id || bEndpoint.bridgeId !== bridge.id
            || aEndpoint.axis !== bridge.axis || bEndpoint.axis !== bridge.axis)) {
            throw new Error(`${bridge.id}: resolved endpoint ownership drift`);
        }
        let from, to, fixedCoord, rawSurface;
        if (bridge.axis === 'x') {
            from = endpointAuthority ? Number(aEndpoint.x) : aModule.cx + aModule.halfX + 0.02;
            to = endpointAuthority ? Number(bEndpoint.x) : bModule.cx - bModule.halfX - 0.02;
            if (endpointAuthority && Math.abs(Number(aEndpoint.z) - Number(bEndpoint.z)) > 0.02) {
                throw new Error(`${bridge.id}: resolved bridge endpoint tangents disagree`);
            }
            fixedCoord = endpointAuthority ? (Number(aEndpoint.z) + Number(bEndpoint.z)) * 0.5 : (aModule.cz + bModule.cz) * 0.5;
            if (to <= from) return false;
            rawSurface = {
                id: `${bridge.id}:surface`, kind: bridge.variant || 'skybridge',
                x: (from + to) * 0.5, z: fixedCoord, hx: (to - from) * 0.5, hz: width * 0.5, y,
                bridgeId: bridge.id, networkKey: bridge.id, reachable: true, priority: 'walkway-authority', physicalTruth: bridgeTruth,
                endpointAuthority: endpointAuthority ? 'bridge-facade-endpoint-v1' : 'legacy-derived-endpoint',
            };
        } else {
            from = endpointAuthority ? Number(aEndpoint.z) : aModule.cz + aModule.halfZ + 0.02;
            to = endpointAuthority ? Number(bEndpoint.z) : bModule.cz - bModule.halfZ - 0.02;
            if (endpointAuthority && Math.abs(Number(aEndpoint.x) - Number(bEndpoint.x)) > 0.02) {
                throw new Error(`${bridge.id}: resolved bridge endpoint tangents disagree`);
            }
            fixedCoord = endpointAuthority ? (Number(aEndpoint.x) + Number(bEndpoint.x)) * 0.5 : (aModule.cx + bModule.cx) * 0.5;
            if (to <= from) return false;
            rawSurface = {
                id: `${bridge.id}:surface`, kind: bridge.variant || 'skybridge',
                x: fixedCoord, z: (from + to) * 0.5, hx: width * 0.5, hz: (to - from) * 0.5, y,
                bridgeId: bridge.id, networkKey: bridge.id, reachable: true, priority: 'walkway-authority', physicalTruth: bridgeTruth,
                endpointAuthority: endpointAuthority ? 'bridge-facade-endpoint-v1' : 'legacy-derived-endpoint',
            };
        }
        registerSemanticConnector(physics, createBridgeConnector({
            id: `${bridge.id}:connector`, axis: bridge.axis, from, to, fixedCoord, halfWidth: width * 0.5, y,
            source: 'skybridge', visualRole: bridge.variant || 'skybridge',
            fromSpaceId: bridge.axis === 'x'
                ? semanticSpaceIdForEntity(aEntity, bridge.aModuleKey, bridge.floor, { x: from, z: fixedCoord })
                : semanticSpaceIdForEntity(aEntity, bridge.aModuleKey, bridge.floor, { x: fixedCoord, z: from }),
            toSpaceId: bridge.axis === 'x'
                ? semanticSpaceIdForEntity(bEntity, bridge.bModuleKey, bridge.floor, { x: to, z: fixedCoord })
                : semanticSpaceIdForEntity(bEntity, bridge.bModuleKey, bridge.floor, { x: fixedCoord, z: to }),
            physicalTruth: bridgeTruth,
            metadata: {
                bridgeId: bridge.id, variant: bridge.variant || 'skybridge', floor: bridge.floor,
                physicalUse: bridgeTruth?.physicalUse ?? null,
                endpointAuthority: endpointAuthority ? 'bridge-facade-endpoint-v1' : 'legacy-derived-endpoint',
                aEndpointId: aEndpoint?.id ?? null,
                bEndpointId: bEndpoint?.id ?? null,
            },
        }));
        const published = publishTransportSurfaceSlab({ physics, transforms, rawSurface, supportKind: bridge.variant || 'skybridge' });
        const surface = published.surface;
        if (bridge.axis === 'x') {
            for (const z of [surface.z - surface.hz, surface.z + surface.hz]) emitTransportRail({
                physics, transforms, wallList: transforms.wallGroups[0], surfaceId: surface.id,
                x1: surface.x - surface.hx, z1: z, x2: surface.x + surface.hx, z2: z,
                y,
            });
        } else {
            for (const x of [surface.x - surface.hx, surface.x + surface.hx]) emitTransportRail({
                physics, transforms, wallList: transforms.wallGroups[0], surfaceId: surface.id,
                x1: x, z1: surface.z - surface.hz, x2: x, z2: surface.z + surface.hz,
                y,
            });
        }
        for (const overlap of published.overlaps) smoothTransportUnion({ physics, transforms, a: surface, b: overlap });
        if (hanging) {
            const span = Math.abs(to - from);
            const postCount = Math.max(2, Math.floor(span / 1.7));
            for (let i = 0; i <= postCount; i++) {
                const along = from + (to - from) * (i / postCount);
                const sag = Math.sin(Math.PI * (i / postCount)) * 0.38;
                if (bridge.axis === 'x') {
                    transforms.props.push({ x: along, y: y + 1.02 - sag, z: fixedCoord - width * 0.5, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                    transforms.props.push({ x: along, y: y + 1.02 - sag, z: fixedCoord + width * 0.5, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                } else {
                    transforms.props.push({ x: fixedCoord - width * 0.5, y: y + 1.02 - sag, z: along, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
                    transforms.props.push({ x: fixedCoord + width * 0.5, y: y + 1.02 - sag, z: along, sx: 0.055, sy: 1.08 - sag, sz: 0.055 });
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

    async function buildDistrictLandmark({ chunk, spec, cell, physics, transforms, cellCx, cellCz, cellSize, districtBuildingContext = null }) {
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
        const structural = await buildKowloonCompoundCooperative({
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
            districtBuildingContext,
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
            districtCompositionId: districtBuildingContext?.compositionId ?? null,
            districtComposition: districtBuildingContext,
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
            transforms: { wallGroups: wallMats.map(() => []), slabs: [], steps: [], props: [], guardMetal: [], guardConcrete: [], roads: [], windows: [], doors: [] },
            physics: { mazeWalls: [], platforms: [], ramps: [], ceilings: [], props: [], guardSpans: [], circulationReservations: [], semanticConnectors: [] },
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
        const guardMetalMesh = makeInstanced(`${namePrefix}-guard-metal`, unitBox, guardMetalMat, transforms.guardMetal);
        const guardConcreteMesh = makeInstanced(`${namePrefix}-guard-concrete`, unitBox, guardConcreteMat, transforms.guardConcrete);
        const windowMesh = makeInstanced(`${namePrefix}-windows`, unitBox, windowMat, transforms.windows);
        const doorMesh = makeInstanced(`${namePrefix}-doors`, unitBox, doorMat, transforms.doors);
        for (const mesh of [slabMesh, stepMesh, propMesh, guardMetalMesh, guardConcreteMesh, windowMesh, doorMesh]) if (mesh) root.add(mesh);
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

    function* buildAuthoredSiteSteps({
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
        const structural = yield* buildKowloonCompoundSteps({
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

    function buildAuthoredSite(args = {}) {
        return runCompoundStepperToCompletion(buildAuthoredSiteSteps(args));
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
            const bridgeId = worldEntityId(worldSeed, 0, 0, 'spawn-skybridge', identity);
            const aEndpoint = {
                id: `${bridgeId}:endpoint:a`, bridgeId, endpointRole: 'a', axis,
                moduleKey: a.moduleKey, dirKey: a.dirKey, floor, resolved: false,
            };
            const bEndpoint = {
                id: `${bridgeId}:endpoint:b`, bridgeId, endpointRole: 'b', axis,
                moduleKey: b.moduleKey, dirKey: b.dirKey, floor, resolved: false,
            };
            const plan = {
                id: bridgeId,
                axis, floor, roadC: c, roadR: r, aSiteId: a.siteId, bSiteId: b.siteId,
                aModuleKey: a.moduleKey, bModuleKey: b.moduleKey, aDirKey: a.dirKey, bDirKey: b.dirKey,
                aEndpoint, bEndpoint,
                endpointAuthority: 'bridge-facade-endpoint-v1',
                variant: brng() < 0.46 ? 'hanging-bridge' : 'guarded-catwalk',
            };
            bridgePlans.push(plan);
            addPortal(a.siteId, aEndpoint);
            addPortal(b.siteId, bEndpoint);
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
        const preliminaryDistrictComposition = compileDistrictBlockComposition({
            chunk,
            entities: districtLandmarkCell && districtLandmarkSpec ? [{
                id: districtLandmarkSpec.id,
                kind: 'district-landmark',
                x: districtLandmarkCell.c,
                z: districtLandmarkCell.r,
            }] : [],
        });
        if (districtLandmarkCell) {
            const cellCx = cx0 - half + (districtLandmarkCell.c + 0.5) * cellSize;
            const cellCz = cz0 - half + (districtLandmarkCell.r + 0.5) * cellSize;
            const landmark = await buildDistrictLandmark({
                chunk,
                spec: districtLandmarkSpec,
                cell: districtLandmarkCell,
                districtBuildingContext: districtContextForEntity(preliminaryDistrictComposition, districtLandmarkSpec.id),
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

        // INVERTED CITY MASS AUTHORITY: the upside-down city is a structural
        // macro layer derived from the same compound partition, not a decor pass.
        // It stays first-paint cheap: one or two towers, three instanced boxes each.
        const invertedTowerField = planInvertedTowerField({
            worldSeed,
            chunkKey: chunk.key,
            chunkCenterX: chunk.centerX,
            chunkCenterZ: chunk.centerZ,
            chunkSize,
            microCells,
            sites: compoundPartition.sites,
            weirdness: weird,
        });
        for (const mass of invertedTowerField.masses) transforms.slabs.push({ ...mass, invertedTowerMass: true });
        const invertedTowerRegistry = physics.invertedTowerFields ?? (physics.invertedTowerFields = []);
        invertedTowerRegistry.push({
            schema: invertedTowerField.schema,
            chunkKey: chunk.key,
            verticalPolarity: invertedTowerField.verticalPolarity,
            ceilingY: invertedTowerField.ceilingY,
            towerCount: invertedTowerField.towers.length,
            instanceCount: invertedTowerField.instanceCount,
            towerIds: invertedTowerField.towers.map(tower => tower.id),
            towers: invertedTowerField.towers.map(tower => ({
                id: tower.id,
                sourceSiteId: tower.sourceSiteId,
                sourceSiteCellCount: tower.sourceSiteCellCount,
                sourceSignature: tower.sourceSignature,
                sourceCells: tower.sourceCells,
                verticalPolarity: tower.verticalPolarity,
                verticalFrame: tower.verticalFrame,
                anchorY: tower.anchorY,
                tipY: tower.tipY,
                localHeight: tower.localHeight,
                footprint: tower.footprint,
            })),
        });

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
        if (yieldControl) await yieldControl(`planned Kowloon topology ${chunk.key}`, 0, sitePlans.length);
        const districtCompositionCandidates = sitePlans.filter(plan => !plan.isPlaza).map(plan => {
            const cols = plan.site.cells.map(cell => cell.col);
            const rows = plan.site.cells.map(cell => cell.row);
            const minCol = Math.min(...cols), maxCol = Math.max(...cols);
            const minRow = Math.min(...rows), maxRow = Math.max(...rows);
            return {
                id: worldEntityId(worldSeed, chunk.x, chunk.z, 'building', plan.signature),
                kind: 'building',
                x: (minCol + maxCol) * 0.5,
                z: (minRow + maxRow) * 0.5,
                halfX: Math.max(0.5, (maxCol - minCol + 1) * 0.5),
                halfZ: Math.max(0.5, (maxRow - minRow + 1) * 0.5),
                floors: 1,
            };
        });
        if (districtLandmarkCell && districtLandmarkSpec) districtCompositionCandidates.push({
            id: districtLandmarkSpec.id,
            kind: 'district-landmark',
            x: districtLandmarkCell.c,
            z: districtLandmarkCell.r,
            halfX: 0.5,
            halfZ: 0.5,
            floors: 1,
        });
        const districtComposition = compileDistrictBlockComposition({ chunk, entities: districtCompositionCandidates });
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
            const bridgeId = worldEntityId(worldSeed, chunk.x, chunk.z, 'skybridge', identity);
            const aEndpoint = {
                id: `${bridgeId}:endpoint:a`, bridgeId, endpointRole: 'a', axis,
                moduleKey: a.moduleKey, dirKey: a.dirKey, floor, resolved: false,
            };
            const bEndpoint = {
                id: `${bridgeId}:endpoint:b`, bridgeId, endpointRole: 'b', axis,
                moduleKey: b.moduleKey, dirKey: b.dirKey, floor, resolved: false,
            };
            const plan = {
                id: bridgeId,
                axis, floor, roadC, roadR,
                aSiteId: a.siteId, bSiteId: b.siteId,
                aModuleKey: a.moduleKey, bModuleKey: b.moduleKey,
                aDirKey: a.dirKey, bDirKey: b.dirKey,
                aEndpoint, bEndpoint,
                endpointAuthority: 'bridge-facade-endpoint-v1',
                variant: brng() < 0.34 + weird * 0.18 ? 'hanging-bridge' : 'guarded-catwalk',
            };
            bridgePlans.push(plan);
            addBridgePortal(a.siteId, aEndpoint);
            addBridgePortal(b.siteId, bEndpoint);
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
                    const localClutter = GENERATION_LANES.plazaClutter ? 1 + Math.floor(plazaRng() * (2 + weird * 4)) : 0;
                    clutter += localClutter;
                    for (let i = 0; i < localClutter; i++) {
                        const px = cellCx + (plazaRng() - 0.5) * cellSize * 0.58;
                        const pz = cellCz + (plazaRng() - 0.5) * cellSize * 0.58;
                        const h = 0.28 + plazaRng() * (0.62 + weird * 1.8);
                        const w = 0.45 + plazaRng() * (0.65 + weird * 0.45);
                        transforms.props.push({ x: px, y: h * 0.5, z: pz, sx: w, sy: h, sz: 0.45 + plazaRng() * 0.8 });
                        physics.props.push({ x: px, z: pz, radius: Math.max(0.3, w * 0.5), height: h });
                    }
                    if (GENERATION_LANES.plazaClutter && plazaRng() < 0.42 + weird * 0.36) {
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
                const districtBuildingContext = districtContextForEntity(districtComposition, siteEntityId);
                const structural = await buildKowloonCompoundCooperative({
                    chunk, site, siteIdOf, roadPlan, openSiteIds, bridgePortalsBySite,
                    physics, transforms, cx0, cz0, half, cellSize, materialIndex, districtBuildingContext,
                });
                if (!structural) continue;
                entities.push({
                    id: siteEntityId,
                    kind: 'building',
                    siteId: site.id,
                    materialIndex,
                    districtCompositionId: districtComposition.id,
                    districtComposition: districtBuildingContext,
                    ...structural,
                });
                buildings++;
            }
            if (yieldControl) await yieldControl(`building Kowloon compound ${chunk.key}`, entities.length, sitePlans.length + (districtLandmarkCell ? 1 : 0));
        }

        // Cross-building footprint overlap is a generator contract failure, not a
        // visual defect to hide later. Fail before bridges, enrichment, or publish.
        const buildingFootprintInvariant = assertBuildingFootprintsDoNotOverlap(entities);

        const compoundEntityBySite = new Map(entities.filter(entity => entity.kind === 'building').map(entity => [entity.siteId, entity]));
        let skybridges = 0;
        for (const bridge of bridgePlans) {
            const aEntity = compoundEntityBySite.get(bridge.aSiteId);
            const bEntity = compoundEntityBySite.get(bridge.bSiteId);
            if (!emitSkybridge({ bridge, aEntity, bEntity, physics, transforms })) continue;
            entities.push({ id: bridge.id, kind: 'skybridge', ...bridge });
            skybridges++;
        }

        const exteriorTransportNetwork = realizeExteriorTransportNetwork({
            physics, transforms, stableKey: `${worldSeed}:${chunk.key}:exterior-transport`,
        });
        const exteriorDebugSnapshot = buildExteriorDebugSnapshot({
            chunk, physics, entities, exteriorTransportNetwork,
        });
        physics.exteriorDebugSnapshot = exteriorDebugSnapshot;
        emitExteriorDebugSnapshot(exteriorDebugSnapshot);

        attachFabricMeshes(root, transforms, `chunk:${chunk.key}`);

        const payload = {
            formatVersion: WORLD_FORMAT_VERSION,
            ownerId,
            root,
            physics,
            districtBlockComposition: districtComposition,
            entities,
            buildings,
            plazas,
            skybridges,
            exteriorTransportNetwork,
            buildingFootprintInvariant,
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
        await enrichment.initializePayloadCooperative(chunk, payload, { yieldControl, maxUnitsPerSlice: 1 });
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
        guardMetalMat.dispose();
        guardConcreteMat.dispose();
        doorMat.dispose();
        windowMat.dispose();
        for (const mat of wallMats) mat.dispose();
        buildingPlanCache.clear();
        enrichment.disposeShared();
    }

    const hasPendingRefinement = (_chunk, payload) => enrichment.hasPending(payload);
    const refine = (chunk, payload, budget) => enrichment.pump(chunk, payload, budget);
    const planningCacheStats = () => buildingPlanCache.stats();

    return { build, buildAuthoredOriginChunk, buildAuthoredSite, buildAuthoredSiteSteps, buildAuthoredPlaza, buildAuthoredSurfacePatch, buildAuthoredBridge, planAuthoredBridgeNetwork, commit, setVisible, verifyReady, unload, refine, hasPendingRefinement, planChunk, districtLandmarkFor, planningCacheStats, disposeShared };
}
