 
 
 
 
 

export const WORLD_FORMAT_VERSION = 1;
export const WORLD_NAMESPACE = 'jweb.dev/world';
export const SPAWN_CHUNK = Object.freeze({ x: 0, z: 0, key: '0,0' });

 
 
 
export const SPAWN_SINGULAR_TYPES = Object.freeze([
    'artGallery',
    'as400Archive',
    'justinIndex',
    'systemsWorkshop',
    'loreShrine',
    'futurePlaceholder',
]);
function normalizeChunkCoordinate(value, label) {
    const n = Math.trunc(Number(value));
    if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a safe integer chunk coordinate`);
    return n;
}

export function hashString32(value) {
    let h = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
}

export function worldIdForSeed(worldSeed) {
    return `${WORLD_NAMESPACE}:v${WORLD_FORMAT_VERSION}:seed-${(worldSeed >>> 0).toString(16).padStart(8, '0')}`;
}

export function worldChunkKey(chunkX, chunkZ) {
    const x = normalizeChunkCoordinate(chunkX, 'chunkX');
    const z = normalizeChunkCoordinate(chunkZ, 'chunkZ');
    return `${x},${z}`;
}

export function deterministicChunkSeed(worldSeed, chunkX, chunkZ, channel = 'world') {
    const x = normalizeChunkCoordinate(chunkX, 'chunkX');
    const z = normalizeChunkCoordinate(chunkZ, 'chunkZ');
    return hashString32(`${WORLD_FORMAT_VERSION}:${worldSeed >>> 0}:${x}:${z}:${channel}`);
}

export function worldChunkOwnerId(worldSeed, chunkX, chunkZ) {
    return `${worldIdForSeed(worldSeed)}:chunk:${worldChunkKey(chunkX, chunkZ)}`;
}

export function worldEntityId(worldSeed, chunkX, chunkZ, kind, localId) {
    return `${worldChunkOwnerId(worldSeed, chunkX, chunkZ)}:${String(kind)}:${String(localId)}`;
}

export function singularEntityId(worldSeed, type) {
    if (!SPAWN_SINGULAR_TYPES.includes(type)) throw new Error(`unknown singular type: ${type}`);
    return `${worldIdForSeed(worldSeed)}:singular:${type}`;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

 
 
 
 
export function worldWeirdnessAt(chunkX, chunkZ, {
    startRadius = 2,
    fullRadius = 40,
    curve = 1.35,
    worldSeed = 0,
} = {}) {
    const distance = Math.hypot(chunkX, chunkZ);
    const t = fullRadius <= startRadius
        ? (distance > startRadius ? 1 : 0)
        : smoothstep((distance - startRadius) / (fullRadius - startRadius));
    const value = Math.pow(t, Math.max(0.05, curve));
    const raw = deterministicChunkSeed(worldSeed, chunkX, chunkZ, 'weirdness-grain') / 0xffffffff;
    const grain = (raw * 2 - 1) * 0.12 * value;
    return Object.freeze({
        distanceChunks: distance,
        value: clamp01(value),
        grain,
        sampled: clamp01(value + grain),
    });
}

export function createChunkDescriptor({
    worldSeed = 0,
    chunkX,
    chunkZ,
    chunkSize,
    weirdness = {},
} = {}) {
    if (!(chunkSize > 0)) throw new Error('createChunkDescriptor requires chunkSize > 0');
    if (!Number.isFinite(chunkX) || !Number.isFinite(chunkZ)) throw new Error('createChunkDescriptor requires finite chunk coordinates');
    const x = normalizeChunkCoordinate(chunkX, 'chunkX');
    const z = normalizeChunkCoordinate(chunkZ, 'chunkZ');
    const key = worldChunkKey(x, z);
    const w = worldWeirdnessAt(x, z, { ...weirdness, worldSeed });
    return Object.freeze({
        formatVersion: WORLD_FORMAT_VERSION,
        worldId: worldIdForSeed(worldSeed),
        key,
        x,
        z,
        centerX: x * chunkSize,
        centerZ: z * chunkSize,
        chunkSize,
        seed: deterministicChunkSeed(worldSeed, x, z),
        ownerId: worldChunkOwnerId(worldSeed, x, z),
        weirdness: w,
        isSpawn: x === SPAWN_CHUNK.x && z === SPAWN_CHUNK.z,
    });
}

export function createSpawnSingularManifest(worldSeed, resolved = []) {
    const byType = new Map((resolved || []).map(item => [item.type, item]));
    return Object.freeze(SPAWN_SINGULAR_TYPES.map(type => {
        const item = byType.get(type) || null;
        return Object.freeze({
            type,
            entityId: singularEntityId(worldSeed, type),
            chunkKey: SPAWN_CHUNK.key,
            reserved: type === 'futurePlaceholder',
            worldPosition: item?.mainEntrance
                ? Object.freeze({ x: item.mainEntrance.doorX, z: item.mainEntrance.doorZ })
                : null,
        });
    }));
}
