import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime } from '../world/spawn-location-runtime.js';
import { SPAWN_HOST_ARCHETYPES, chooseSpawnHostArchetype, selectSpawnEnclaveCandidate } from '../world/spawn-proof.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

const totalProbability = Object.values(SPAWN_HOST_ARCHETYPES).reduce((sum, item) => sum + item.probability, 0);
assert.ok(Math.abs(totalProbability - 1) < 1e-9);
const counts = new Map();
for (let i = 0; i < 20000; i++) {
    const archetype = chooseSpawnHostArchetype(`distribution-${i}`);
    counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
}
const terraRate = (counts.get('deep-backroom') ?? 0) / 20000;
assert.ok(terraRate > 0.008 && terraRate < 0.016, `TERRA host request should stay around 1%, got ${(terraRate * 100).toFixed(2)}%`);

function seedFor(archetype) {
    for (let seed = 0; seed < 200000; seed++) {
        if (chooseSpawnHostArchetype(`${location.id}:${seed}`) === archetype) return seed;
    }
    throw new Error(`could not find deterministic seed for ${archetype}`);
}

function rectPatch(x, z, halfX, halfZ, y, supportKind = 'floor') {
    return { x, z, halfX, halfZ, minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, yMin: y, yMax: y + 0.12, supportKind };
}
function walls(x, z, halfX, halfZ, y = 6) {
    return [
        { x1: x - halfX, z1: z - halfZ, x2: x + halfX, z2: z - halfZ, yMin: y, yMax: y + 3.1 },
        { x1: x + halfX, z1: z - halfZ, x2: x + halfX, z2: z + halfZ, yMin: y, yMax: y + 3.1 },
        { x1: x + halfX, z1: z + halfZ, x2: x - halfX, z2: z + halfZ, yMin: y, yMax: y + 3.1 },
        { x1: x - halfX, z1: z + halfZ, x2: x - halfX, z2: z - halfZ, yMin: y, yMax: y + 3.1 },
    ];
}
function space({ id, x, z, halfX, halfZ, surfaceClass, chunkSeed, retailLike = false, storefrontLike = false, ceilingRooted = false, overhead = false }) {
    const area = halfX * 2 * halfZ * 2;
    return {
        spaceId: id, payloadKey: 'synthetic', siteId: 'synthetic', entityId: id, moduleKey: '0,0',
        floorIndex: surfaceClass === 'interior-floor' ? 0 : 2,
        surfaceClass, exposure: surfaceClass === 'roof' ? 'exterior' : 'interior', surfaceY: 6,
        bounds: rectPatch(x, z, halfX, halfZ, 6, surfaceClass === 'roof' ? 'roof' : 'floor'),
        supportPatches: [rectPatch(x, z, halfX, halfZ, 6, surfaceClass === 'roof' ? 'roof' : 'floor')],
        overheadPatches: overhead ? [rectPatch(x, z, halfX, halfZ, 9.1, 'ceiling')] : [],
        connectorIds: [`${id}:connector`], reservations: [], existingDetailReservations: [],
        nearbyWalls: surfaceClass === 'interior-floor' ? walls(x, z, halfX, halfZ) : [],
        facadeCount: storefrontLike ? 2 : 0,
        supportAreaM2: area, largestSupportPatchAreaM2: area,
        maxSupportSpanM: Math.max(halfX, halfZ) * 2,
        maxWallSpanM: surfaceClass === 'interior-floor' ? Math.max(halfX, halfZ) * 2 : 0,
        ceilingRooted, physicalUseFamily: retailLike ? 'mercantile-public' : 'institutional',
        programArchitectureId: retailLike ? 'retail-service' : 'office', retailLike, storefrontLike, chunkSeed,
    };
}

function physicsFor(spaces) {
    function supportAt(x, z, queryY) {
        const candidates = [];
        for (const item of spaces) {
            for (const patch of item.supportPatches) {
                if (x < patch.minX || x > patch.maxX || z < patch.minZ || z > patch.maxZ) continue;
                if (item.surfaceY <= queryY + 0.2) candidates.push(item.surfaceY);
            }
        }
        return candidates.length ? Math.max(...candidates) : 0;
    }
    return {
        supportHeightAt: supportAt,
        poseIsValid(x, z, feetY) { return Math.abs(supportAt(x, z, feetY + 0.12) - feetY) < 0.01; },
        probeControllerPath({ start, steps }) {
            const dx = steps.reduce((sum, step) => sum + step.wishVelocityX * step.dt, 0);
            const dz = steps.reduce((sum, step) => sum + step.wishVelocityZ * step.dt, 0);
            const distance = Math.hypot(dx, dz);
            return { validStart: true, validEnd: true, distance, maxDistance: distance, end: { x: start.x + dx, z: start.z + dz, feetY: start.feetY, grounded: true } };
        },
    };
}

const deepSeed = seedFor('deep-backroom');
const deep = space({ id: 'deep', x: 3, z: 0, halfX: 6.0, halfZ: 5.0, surfaceClass: 'interior-floor', chunkSeed: deepSeed, overhead: true });
const exposedAtDeepSeed = space({ id: 'roof-deep-seed', x: 14, z: 0, halfX: 3.2, halfZ: 3.2, surfaceClass: 'roof', chunkSeed: deepSeed });
let selected = selectSpawnEnclaveCandidate({ playerPhysics: physicsFor([deep, exposedAtDeepSeed]), origin: { x: 0, z: 0, feetY: 0 }, locationRuntime: runtime, fabricSpaces: [deep, exposedAtDeepSeed] });
assert.ok(selected);
assert.equal(selected.desiredHostArchetype, 'deep-backroom');
assert.equal(selected.hostArchetype, 'deep-backroom', 'TERRA RNG should intentionally choose the qualifying large backroom over an ordinary roof');
assert.ok(selected.space.supportAreaM2 >= 110 && selected.space.largestSupportPatchAreaM2 >= 96, 'TERRA host must be a genuinely large contiguous hangout room');
assert.ok(selected.wallDirectionCount >= 3 && selected.edgeDepthM >= 3.0, 'TERRA host must read as enclosed/deep rather than a shallow alcove');

const tooSmallDeep = space({ id: 'too-small-deep', x: 3, z: 0, halfX: 4.8, halfZ: 4.8, surfaceClass: 'interior-floor', chunkSeed: deepSeed, overhead: true });
selected = selectSpawnEnclaveCandidate({ playerPhysics: physicsFor([tooSmallDeep, exposedAtDeepSeed]), origin: { x: 0, z: 0, feetY: 0 }, locationRuntime: runtime, fabricSpaces: [tooSmallDeep, exposedAtDeepSeed] });
assert.ok(selected);
assert.notEqual(selected.hostArchetype, 'deep-backroom', 'a cramped room must make a TERRA request step down safely');

const gigaSeed = seedFor('hanging-storefront');
const gigaShop = space({ id: 'giga-shop', x: 3, z: 0, halfX: 4.2, halfZ: 3.7, surfaceClass: 'interior-floor', chunkSeed: gigaSeed, overhead: true, retailLike: true, storefrontLike: true, ceilingRooted: true });
const exposedAtGigaSeed = space({ id: 'roof-giga-seed', x: 14, z: 0, halfX: 3.2, halfZ: 3.2, surfaceClass: 'roof', chunkSeed: gigaSeed });
selected = selectSpawnEnclaveCandidate({ playerPhysics: physicsFor([gigaShop, exposedAtGigaSeed]), origin: { x: 0, z: 0, feetY: 0 }, locationRuntime: runtime, fabricSpaces: [gigaShop, exposedAtGigaSeed] });
assert.ok(selected);
assert.equal(selected.desiredHostArchetype, 'hanging-storefront');
assert.equal(selected.hostArchetype, 'hanging-storefront', 'GIGA RNG should intentionally choose a real windowed retail frontage room');
assert.equal(selected.space.ceilingRooted, true, 'hanging tower storefronts get the intended preference');
assert.equal(selected.space.storefrontLike, true);

console.log('[spawn-host-archetype-selftest] PASS', {
    terraRate: Number((terraRate * 100).toFixed(2)),
    deepSeed,
    gigaSeed,
    terraHost: deep.spaceId,
    gigaHost: gigaShop.spaceId,
});
