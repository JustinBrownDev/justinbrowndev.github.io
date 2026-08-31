import { JUNK_BASE_KINDS, JUNK_WEAR_STATES, JUNK_SIZE_CLASSES } from '../content/junk-content.js';
import { anyReservationIntersectsBox } from './circulation-reservations.js';

export const EXTERIOR_PROP_FIELD_SCHEMA = 'jweb.exterior-prop-field.v1';

const SHAPES = Object.freeze(['box', 'cylinder', 'cone', 'sphere']);
const BULK_CONTEXTS = Object.freeze(['alley', 'street', 'construction', 'plaza']);
const BULK_EXCLUDE_RE = /(parked car|delivery van|fire hydrant|parking meter|generator unit|street food cart|picnic table)/i;
const ROOF_FRIENDLY_RE = /(crate|box|bucket|tire|cinderblock|pallet|spool|newspaper|bottle|can|toolbox|sheet|cord|vent|dish|tank|drum|bag)/i;
const LARGE_ANCHOR_RE = /(shopping cart|wheelbarrow|broken table|mattress|rolled carpet|utility box|bike rack|sawhorse|tank|drum|pallet)/i;

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

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

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function lerp(a, b, t) { return a + (b - a) * t; }
function range(rng, lo, hi) { return lerp(lo, hi, rng()); }
function pick(rng, values) { return values[Math.floor(rng() * values.length) % values.length]; }

function surfaceTangent(surface) {
    return surface.side === 'north' || surface.side === 'south' ? { x: 1, z: 0 } : { x: 0, z: 1 };
}

function normalizedModule(module) {
    if (!module) return null;
    const halfX = finite(module.halfX, finite(module.hwx));
    const halfZ = finite(module.halfZ, finite(module.hwz));
    const cx = finite(module.cx, finite(module.x));
    const cz = finite(module.cz, finite(module.z));
    if (!(halfX > 0) || !(halfZ > 0)) return null;
    return { cx, cz, halfX, halfZ };
}

function footprintModules(payload) {
    const modules = [];
    for (const entity of payload?.entities ?? []) {
        if (entity?.kind !== 'building' && entity?.kind !== 'district-landmark') continue;
        if (entity.footprintModules?.length) {
            for (const module of entity.footprintModules) {
                const normalized = normalizedModule(module);
                if (normalized) modules.push(normalized);
            }
        } else {
            const normalized = normalizedModule({ cx: entity.x, cz: entity.z, halfX: entity.halfX, halfZ: entity.halfZ });
            if (normalized) modules.push(normalized);
        }
    }
    return modules;
}

function insideBuildingFootprint(modules, x, z, padding = 0.05) {
    return modules.some(module => x > module.cx - module.halfX - padding
        && x < module.cx + module.halfX + padding
        && z > module.cz - module.halfZ - padding
        && z < module.cz + module.halfZ + padding);
}

function reservationList(payload) {
    const topology = payload?.semanticContext?.spatialTopology;
    const seen = new Set();
    const result = [];
    for (const reservation of [
        ...(topology?.reservations ?? []),
        ...(payload?.detailReservations ?? []),
    ]) {
        if (!reservation || !Number.isFinite(reservation.minX) || !Number.isFinite(reservation.maxX)
            || !Number.isFinite(reservation.minZ) || !Number.isFinite(reservation.maxZ)) continue;
        const id = reservation.id ?? `${reservation.minX}:${reservation.minZ}:${reservation.maxX}:${reservation.maxZ}:${reservation.yMin}:${reservation.yMax}`;
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(reservation);
    }
    return result;
}

function pointBlockedByExistingProp(payload, x, z, radius, yMin, yMax, padding = 0.12) {
    for (const prop of payload?.physics?.props ?? []) {
        if (!prop || !Number.isFinite(prop.x) || !Number.isFinite(prop.z)) continue;
        const propYMin = Number.isFinite(prop.yMin) ? prop.yMin : 0;
        const propYMax = Number.isFinite(prop.height) ? prop.height : Number.isFinite(prop.yMax) ? prop.yMax : Infinity;
        if (yMin >= propYMax || yMax <= propYMin) continue;
        const otherRadius = Math.max(0.05, finite(prop.radius, Math.max(finite(prop.halfX), finite(prop.halfZ), 0.2)));
        const dx = x - prop.x, dz = z - prop.z;
        if (dx * dx + dz * dz < (radius + otherRadius + padding) ** 2) return true;
    }
    return false;
}

function buildCatalog() {
    const descriptors = [];
    for (const kind of JUNK_BASE_KINDS) {
        if (BULK_EXCLUDE_RE.test(kind.name)) continue;
        const contexts = (kind.contexts ?? []).filter(context => BULK_CONTEXTS.includes(context));
        if (!contexts.length) continue;
        for (const wear of JUNK_WEAR_STATES) {
            for (const sizeClass of JUNK_SIZE_CLASSES) {
                const mul = finite(wear.sizeMul, 1) * finite(sizeClass.mul, 1);
                const base = kind.size ?? [0.5, 0.5, 0.5];
                descriptors.push(Object.freeze({
                    name: `${kind.name} (${wear.tag}, ${sizeClass.tag})`,
                    baseName: kind.name,
                    shape: SHAPES.includes(kind.shape) ? kind.shape : 'box',
                    contexts,
                    sizeClass: sizeClass.tag,
                    sx: Math.max(0.04, finite(base[0], 0.5) * mul),
                    sy: Math.max(0.03, finite(base[1], 0.5) * mul),
                    sz: Math.max(0.04, finite(base[2], 0.5) * mul),
                    colors: kind.colors?.length ? kind.colors : [0x66625b],
                    largeAnchor: LARGE_ANCHOR_RE.test(kind.name) || sizeClass.tag === 'large',
                }));
            }
        }
    }
    const microExclude = /(shopping cart|wheelbarrow|broken table|broken chair|mattress|rolled carpet|utility box|bike rack|sawhorse|wooden pallet|tarp-covered pile|abandoned bike)/i;
    const micro = descriptors.filter(descriptor => descriptor.sizeClass !== 'large' && !descriptor.largeAnchor && !microExclude.test(descriptor.baseName));
    const byContext = new Map();
    const byContextMicro = new Map();
    for (const context of BULK_CONTEXTS) {
        byContext.set(context, descriptors.filter(descriptor => descriptor.contexts.includes(context)));
        byContextMicro.set(context, micro.filter(descriptor => descriptor.contexts.includes(context)));
    }
    const roof = micro.filter(descriptor => ROOF_FRIENDLY_RE.test(descriptor.baseName));
    return Object.freeze({ descriptors, micro, byContext, byContextMicro, roof });
}

const CATALOG = buildCatalog();

function contextForSurface(surface, contextByEntity, rng) {
    const context = contextByEntity.get(surface.entityId);
    const program = String(context?.program ?? context?.physicalUseFamily ?? '');
    if (/industrial|service|mechanical|workshop/i.test(program) && rng() < 0.62) return 'construction';
    return surface.exposure === 'street' ? 'street' : 'alley';
}

function freeIntervals(surface, apertures, padding = 0.78) {
    const half = Math.max(0, finite(surface.half));
    if (!(half > 0.25)) return [];
    const blocked = apertures
        .filter(aperture => aperture?.surfaceId === surface.id && aperture.traversable !== false)
        .map(aperture => [
            clamp(finite(aperture.uMin) - padding, -half, half),
            clamp(finite(aperture.uMax) + padding, -half, half),
        ])
        .filter(([lo, hi]) => hi > lo)
        .sort((a, b) => a[0] - b[0]);
    const result = [];
    let cursor = -half;
    for (const [lo, hi] of blocked) {
        if (lo - cursor >= 0.6) result.push([cursor, lo]);
        cursor = Math.max(cursor, hi);
    }
    if (half - cursor >= 0.6) result.push([cursor, half]);
    return result;
}

function dimensionsForDescriptor(descriptor, rng, scale = 1) {
    const jitter = range(rng, 0.82, 1.18) * scale;
    return {
        sx: descriptor.sx * jitter,
        sy: descriptor.sy * range(rng, 0.88, 1.14) * scale,
        sz: descriptor.sz * jitter,
    };
}

function candidateFits(payload, reservations, modules, candidate, padding = 0.16) {
    const halfX = Math.max(0.025, candidate.sx * 0.5);
    const halfZ = Math.max(0.025, candidate.sz * 0.5);
    if (insideBuildingFootprint(modules, candidate.x, candidate.z, Math.min(0.06, padding * 0.35))) return false;
    const yMin = candidate.y;
    const yMax = candidate.y + candidate.sy;
    if (anyReservationIntersectsBox(reservations, {
        x: candidate.x,
        z: candidate.z,
        halfX,
        halfZ,
        yMin,
        yMax,
    }, padding)) return false;
    const radius = Math.max(halfX, halfZ);
    if (pointBlockedByExistingProp(payload, candidate.x, candidate.z, radius, yMin, yMax, padding)) return false;
    return true;
}

function placement(surface, descriptor, rng, u, outward, baseY, scale = 1) {
    const tangent = surfaceTangent(surface);
    const dims = dimensionsForDescriptor(descriptor, rng, scale);
    const sideJitter = range(rng, -0.08, 0.08);
    const x = finite(surface.x) + tangent.x * (u + sideJitter) + finite(surface.normalX) * outward;
    const z = finite(surface.z) + tangent.z * (u + sideJitter) + finite(surface.normalZ) * outward;
    const rotY = finite(surface.rotY) + range(rng, -0.42, 0.42) + (rng() < 0.08 ? Math.PI * 0.5 : 0);
    return {
        shape: descriptor.shape,
        color: pick(rng, descriptor.colors),
        x, y: baseY, z, rotY,
        sx: dims.sx, sy: dims.sy, sz: dims.sz,
        surfaceId: surface.id,
        domain: 'ground-edge-micro',
    };
}

function addWallField({ chunk, payload, placements, stats, reservations, modules, contextByEntity }) {
    const semantic = payload?.semanticContext;
    const surfaces = semantic?.surfaces ?? [];
    const apertures = semantic?.apertures ?? [];
    for (const surface of surfaces) {
        if (finite(surface.yMin) > 0.35) continue;
        const surfaceRng = mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:exterior-micro:${surface.id}`));
        const context = contextForSurface(surface, contextByEntity, surfaceRng);
        const pool = CATALOG.byContextMicro.get(context) ?? CATALOG.byContextMicro.get('alley') ?? CATALOG.micro;
        if (!pool.length) continue;
        for (const [lo, hi] of freeIntervals(surface, apertures)) {
            const width = hi - lo;
            if (width < 0.7) continue;
            const spacing = surface.exposure === 'street' ? 3.9 : 3.25;
            const cells = Math.max(1, Math.floor(width / spacing));
            const cellWidth = width / cells;
            const chance = surface.exposure === 'street' ? 0.50 : 0.66;
            for (let cell = 0; cell < cells; cell++) {
                if (surfaceRng() > chance) continue;
                const descriptor = pick(surfaceRng, pool);
                const cellCenter = lo + cellWidth * (cell + 0.5);
                const u = clamp(cellCenter + range(surfaceRng, -cellWidth * 0.25, cellWidth * 0.25), lo + 0.08, hi - 0.08);
                const outward = range(surfaceRng, 0.23, 0.48);
                const scale = range(surfaceRng, 0.62, 0.92);
                const candidate = placement(surface, descriptor, surfaceRng, u, outward, Math.max(0, finite(surface.yMin)), scale);
                if (!candidateFits(payload, reservations, modules, candidate, 0.14)) {
                    stats.rejected++;
                    continue;
                }
                placements.push(candidate);
                stats.groundEdge++;
            }
        }
    }
}

function roofEdgePoint(bounds, rng, edge, along, inward) {
    if (edge === 0) return { x: bounds.x + along * bounds.halfX, z: bounds.z - bounds.halfZ + inward, rotY: 0 };
    if (edge === 1) return { x: bounds.x + bounds.halfX - inward, z: bounds.z + along * bounds.halfZ, rotY: -Math.PI * 0.5 };
    if (edge === 2) return { x: bounds.x - along * bounds.halfX, z: bounds.z + bounds.halfZ - inward, rotY: Math.PI };
    return { x: bounds.x - bounds.halfX + inward, z: bounds.z - along * bounds.halfZ, rotY: Math.PI * 0.5 };
}

function addRoofField({ chunk, payload, placements, stats, reservations }) {
    const opportunities = (payload?.semanticContext?.opportunities ?? []).filter(opportunity => opportunity?.role === 'roof-utility-zone' && opportunity.bounds);
    const roofPool = CATALOG.roof;
    if (!roofPool.length) return;
    for (const opportunity of opportunities) {
        const bounds = opportunity.bounds;
        if (!(finite(bounds.halfX) > 0.35) || !(finite(bounds.halfZ) > 0.35)) continue;
        const rng = mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:roof-micro:${opportunity.id}`));
        const perimeter = (bounds.halfX + bounds.halfZ) * 4;
        const count = clamp(Math.floor(perimeter * 0.16 + rng() * 1.5), 1, 5);
        for (let i = 0; i < count; i++) {
            const descriptor = pick(rng, roofPool);
            const edge = Math.floor(rng() * 4) % 4;
            const along = range(rng, -0.82, 0.82);
            const inward = range(rng, 0.22, 0.50);
            const point = roofEdgePoint(bounds, rng, edge, along, inward);
            const dims = dimensionsForDescriptor(descriptor, rng, range(rng, 0.58, 0.84));
            const candidate = {
                shape: descriptor.shape,
                color: pick(rng, descriptor.colors),
                x: point.x,
                y: finite(bounds.y) + 0.015,
                z: point.z,
                rotY: point.rotY + range(rng, -0.48, 0.48),
                ...dims,
                domain: 'roof-edge-micro',
                opportunityId: opportunity.id,
            };
            if (anyReservationIntersectsBox(reservations, {
                x: candidate.x, z: candidate.z,
                halfX: candidate.sx * 0.5, halfZ: candidate.sz * 0.5,
                yMin: candidate.y, yMax: candidate.y + candidate.sy,
            }, 0.18) || pointBlockedByExistingProp(payload, candidate.x, candidate.z, Math.max(candidate.sx, candidate.sz) * 0.5, candidate.y, candidate.y + candidate.sy, 0.12)) {
                stats.rejected++;
                continue;
            }
            placements.push(candidate);
            stats.roofEdge++;
        }
    }
}

function plazaEdges(entity) {
    const halfX = Math.max(0, finite(entity.halfX));
    const halfZ = Math.max(0, finite(entity.halfZ));
    if (!(halfX > 0.8) || !(halfZ > 0.8)) return [];
    return [
        { x: entity.x, z: entity.z - halfZ, half: halfX, tx: 1, tz: 0, nx: 0, nz: 1, ry: Math.PI },
        { x: entity.x + halfX, z: entity.z, half: halfZ, tx: 0, tz: 1, nx: -1, nz: 0, ry: Math.PI * 0.5 },
        { x: entity.x, z: entity.z + halfZ, half: halfX, tx: 1, tz: 0, nx: 0, nz: -1, ry: 0 },
        { x: entity.x - halfX, z: entity.z, half: halfZ, tx: 0, tz: 1, nx: 1, nz: 0, ry: -Math.PI * 0.5 },
    ];
}

function addPlazaField({ chunk, payload, placements, stats, reservations, modules }) {
    const pool = CATALOG.byContextMicro.get('plaza')?.length ? CATALOG.byContextMicro.get('plaza') : CATALOG.byContextMicro.get('street');
    if (!pool?.length) return;
    for (const entity of payload?.entities ?? []) {
        if (entity?.kind !== 'plaza' && entity?.kind !== 'courtyard') continue;
        const rng = mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:plaza-micro:${entity.id}`));
        for (const edge of plazaEdges(entity)) {
            const edgeMeters = edge.half * 2;
            const target = clamp(Math.floor(edgeMeters * 0.14 + rng() * 0.9), 0, 3);
            for (let i = 0; i < target; i++) {
                const descriptor = pick(rng, pool);
                const along = range(rng, -edge.half * 0.80, edge.half * 0.80);
                const inward = range(rng, 0.30, 0.66);
                const dims = dimensionsForDescriptor(descriptor, rng, range(rng, 0.62, 0.90));
                const candidate = {
                    shape: descriptor.shape,
                    color: pick(rng, descriptor.colors),
                    x: edge.x + edge.tx * along + edge.nx * inward,
                    y: 0,
                    z: edge.z + edge.tz * along + edge.nz * inward,
                    rotY: edge.ry + range(rng, -0.42, 0.42),
                    ...dims,
                    domain: 'courtyard-edge-micro',
                    entityId: entity.id,
                };
                if (!candidateFits(payload, reservations, modules, candidate, 0.18)) { stats.rejected++; continue; }
                placements.push(candidate);
                stats.courtyardEdge++;
            }
        }
    }
}

export function planExteriorPropField({ chunk, payload } = {}) {
    if (!chunk || !payload) throw new Error('planExteriorPropField requires chunk and payload');
    const semantic = payload.semanticContext;
    if (!semantic?.surfaces?.length && !(payload.entities ?? []).some(entity => entity?.kind === 'plaza' || entity?.kind === 'courtyard')) {
        return { schema: EXTERIOR_PROP_FIELD_SCHEMA, placements: [], stats: { generated: 0, reason: 'no-exterior-topology' } };
    }
    const placements = [];
    const stats = { generated: 0, groundEdge: 0, wallBand: 0, courtyardEdge: 0, roofEdge: 0, rejected: 0, drawBuckets: 0 };
    const reservations = reservationList(payload);
    const modules = footprintModules(payload);
    const contextByEntity = new Map((semantic?.entities ?? []).map(context => [context.entityId, context]));

    addWallField({ chunk, payload, placements, stats, reservations, modules, contextByEntity });
    addPlazaField({ chunk, payload, placements, stats, reservations, modules });
    addRoofField({ chunk, payload, placements, stats, reservations });

    const usedShapes = new Set(placements.map(item => item.shape));
    const facadeMeters = (semantic?.surfaces ?? [])
        .filter(surface => finite(surface.yMin) <= 0.35)
        .reduce((sum, surface) => sum + Math.max(0, finite(surface.half) * 2), 0);
    const roofPerimeterMeters = (semantic?.opportunities ?? [])
        .filter(opportunity => opportunity?.role === 'roof-utility-zone' && opportunity.bounds)
        .reduce((sum, opportunity) => sum + Math.max(0, (finite(opportunity.bounds.halfX) + finite(opportunity.bounds.halfZ)) * 4), 0);
    stats.generated = placements.length;
    stats.wallBand = stats.groundEdge; // compatibility: this field is now explicitly ground micro-clutter.
    stats.microClutter = stats.groundEdge + stats.courtyardEdge + stats.roofEdge;
    stats.drawBuckets = usedShapes.size;
    stats.reservations = reservations.length;
    stats.surfaces = semantic?.surfaces?.length ?? 0;
    stats.facadeMeters = facadeMeters;
    stats.roofPerimeterMeters = roofPerimeterMeters;
    stats.groundPerFacadeMeter = facadeMeters > 0 ? stats.groundEdge / facadeMeters : 0;
    stats.instancesPerDrawBucket = usedShapes.size ? placements.length / usedShapes.size : 0;
    stats.physicalDensityNormalized = true;
    return { schema: EXTERIOR_PROP_FIELD_SCHEMA, placements, stats };
}

export function createExteriorPropFieldSystem({ THREE, worldSeed = 0 } = {}) {
    if (!THREE) throw new Error('createExteriorPropFieldSystem requires THREE');

    const geometries = new Map([
        ['box', new THREE.BoxGeometry(1, 1, 1)],
        ['cylinder', new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false)],
        ['cone', new THREE.ConeGeometry(0.5, 1, 8, 1, false)],
        ['sphere', new THREE.SphereGeometry(0.5, 8, 5)],
    ]);
    const materials = new Map(SHAPES.map(shape => [shape, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.06 })]));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    function planTask(chunk, payload) {
        const plan = planExteriorPropField({ chunk, payload });
        if (!plan.placements.length) return null;
        return {
            kind: 'exterior-prop-field',
            entityId: `exterior-field:${chunk.key}`,
            seed: hash32(`${worldSeed}:${chunk.key}:exterior-prop-field`),
            fieldPlan: plan,
            topologySolved: true,
            topologyAccepted: true,
            topologyDescriptors: [],
            contextualCosmetic: true,
            exteriorPropField: true,
        };
    }

    function realize(payload, task) {
        const placements = task?.fieldPlan?.placements ?? [];
        if (!placements.length) return null;
        const group = new THREE.Group();
        group.name = `chunk-exterior-prop-field:${payload?.ownerId ?? task.entityId ?? 'chunk'}`;
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = 'exterior-prop-field';
        group.userData.instanceCount = placements.length;
        group.userData.drawBucketCount = task.fieldPlan.stats.drawBuckets;

        for (const shape of SHAPES) {
            const bucket = placements.filter(item => item.shape === shape);
            if (!bucket.length) continue;
            const mesh = new THREE.InstancedMesh(geometries.get(shape), materials.get(shape), bucket.length);
            mesh.name = `${group.name}:${shape}`;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.instanceMatrix.setUsage?.(THREE.StaticDrawUsage);
            for (let i = 0; i < bucket.length; i++) {
                const item = bucket[i];
                position.set(item.x, item.y + item.sy * 0.5, item.z);
                euler.set(0, item.rotY, 0);
                quaternion.setFromEuler(euler);
                scale.set(item.sx, item.sy, item.sz);
                matrix.compose(position, quaternion, scale);
                mesh.setMatrixAt(i, matrix);
                mesh.setColorAt(i, color.set(item.color));
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingBox?.();
            mesh.computeBoundingSphere?.();
            mesh.userData.chunkCosmetic = true;
            mesh.userData.detailKind = 'exterior-prop-field';
            group.add(mesh);
        }
        return group;
    }

    function disposeShared() {
        for (const geometry of geometries.values()) geometry.dispose?.();
        for (const material of materials.values()) material.dispose?.();
        geometries.clear();
        materials.clear();
    }

    return Object.freeze({ planTask, realize, disposeShared });
}
