import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectSpawnFabricSpaces } from '../world/spawn-proof.js';
import { START_SCENE_PROFILES } from '../world/spawn-location-runtime.js';

const floor = (x, z, hx, hz, y = 6) => ({ x, z, hx, hz, y, supportKind: 'floor' });
const roof = (x, z, hx, hz, y = 9) => ({ x, z, hx, hz, y, supportKind: 'roof' });
const wall = (x1, z1, x2, z2, y = 6) => ({ x1, z1, x2, z2, yMin: y, yMax: y + 3.1 });

function entity({ id, program, physicalUse, ceilingRooted = false, facades = true }) {
    return {
        id, kind: 'building', floorH: 3, baseY: 6, ceilingRooted,
        physicalUse: { family: physicalUse },
        buildingPlan: { programArchitecture: { id: program } },
        footprintModules: [{ key: '0,0', rect: { cx: 0, cz: 0, halfX: 5, halfZ: 4 }, floors: 2, baseY: 6, roofY: 12 }],
        facades: facades ? [{ moduleKey: '0,0', yMin: 6, yMax: 12 }] : [],
    };
}

const retail = entity({ id: 'retail', program: 'retail-service', physicalUse: 'mercantile-public' });
const hangingRetail = entity({ id: 'hanging-business', program: 'generic:business', physicalUse: 'business', ceilingRooted: true });
const groundPayload = {
    ownerId: 'ground', chunk: { seed: 42 }, entities: [retail], detailReservations: [],
    physics: {
        platforms: [floor(0,0,5,4,6), floor(0,0,5,4,9), roof(0,0,5,4,12)], ceilings: [],
        semanticConnectors: [], circulationReservations: [],
        mazeWalls: [wall(-5,-4,5,-4), wall(5,-4,5,4), wall(5,4,-5,4), wall(-5,4,-5,-4)],
    },
};
groundPayload.hangingLayer = { payload: {
    ownerId: 'hanging', chunk: { seed: 42 }, entities: [hangingRetail], detailReservations: [],
    physics: {
        platforms: [floor(0,0,5,4,6), floor(0,0,5,4,9), roof(0,0,5,4,12)], ceilings: [],
        semanticConnectors: [], circulationReservations: [],
        mazeWalls: [wall(-5,-4,5,-4), wall(5,-4,5,4), wall(5,4,-5,4), wall(-5,4,-5,-4)],
    },
} };

const spaces = collectSpawnFabricSpaces(new Map([['0,0', groundPayload]]));
assert.ok(spaces.some(space => space.entityId === 'retail' && space.floorIndex === 0 && space.storefrontLike), 'upright retail entry floor must be eligible as a real storefront');
assert.ok(spaces.some(space => space.entityId === 'hanging-business' && space.payloadLayer === 'hanging' && space.ceilingRooted && space.storefrontLike), 'hanging business frontage must participate as a GIGA-capable place even when the seed has no literal retail program');

const big = START_SCENE_PROFILES.find(profile => profile.id === 'big-tv-roof');
assert.equal(big.minHostAreaM2, 7, 'forced Big must fit every roof that already qualifies as an exposed-roof host');

const terra = START_SCENE_PROFILES.find(profile => profile.id === 'terra-backroom');
assert.equal(terra.minHostAreaM2, 90);
assert.equal(terra.minContiguousAreaM2, 42);
assert.equal(terra.minHostSpanM, 6.2);
assert.equal(terra.minWallSpanM, 9.0);

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /spawnHostAuditionBudget/);
assert.doesNotMatch(mainSource, /await worldChunkStreamer\.pump\(\{\s*maxChunks: 1,\s*maxMillis: Infinity,\s*maxRefinements: 0/s);

const realizerSource = fs.readFileSync(new URL('../world/spawn-location-realizer.js', import.meta.url), 'utf8');
assert.match(realizerSource, /hostSpace\.payloadLayer === 'hanging'/);

console.log('[spawn-direct-place-hosting-selftest] PASS', {
    spaces: spaces.length,
    groundStorefronts: spaces.filter(space => space.storefrontLike && space.payloadLayer === 'ground').length,
    hangingSpaces: spaces.filter(space => space.payloadLayer === 'hanging').length,
    terraMinArea: terra.minHostAreaM2,
});
