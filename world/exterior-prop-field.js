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

const FACADE_INFRA_COLORS = Object.freeze({
    pipe: [0x5d625f, 0x77766d, 0x454b4b],
    electrical: [0x66695f, 0x807d6d, 0x4d5450],
    hvac: [0x888b83, 0x6d756f, 0x9a9687],
    vent: [0x4e5553, 0x747a75, 0x3f4544],
    cable: [0x252827, 0x3a3531, 0x171918],
    light: [0xb5aa86, 0x8a846d, 0xd0c6a2],
    duct: [0x70756f, 0x85877f, 0x5f6763],
    structure: [0x444948, 0x555957, 0x343838],
    billboard: [0x2d272f, 0x20373a, 0x493b24, 0x332421],
});

function facadeBox(surface, u, y, width, height, depth, color, category, extraOutward = 0) {
    const tangent = surfaceTangent(surface);
    const outward = depth * 0.5 + 0.055 + extraOutward;
    return { shape: 'box', color,
        x: finite(surface.x) + tangent.x * u + finite(surface.normalX) * outward,
        y, z: finite(surface.z) + tangent.z * u + finite(surface.normalZ) * outward,
        rotY: finite(surface.rotY), sx: width, sy: height, sz: depth, surfaceId: surface.id, entityId: surface.entityId,
        domain: 'facade-infrastructure', category };
}

function facadePipe(surface, u, y, height, radius, color) {
    const tangent = surfaceTangent(surface);
    const outward = radius + 0.065;
    return { shape: 'cylinder', color,
        x: finite(surface.x) + tangent.x * u + finite(surface.normalX) * outward,
        y, z: finite(surface.z) + tangent.z * u + finite(surface.normalZ) * outward,
        rotY: finite(surface.rotY), sx: radius * 2, sy: height, sz: radius * 2, surfaceId: surface.id, entityId: surface.entityId,
        domain: 'facade-infrastructure', category: 'pipe' };
}

function facadeCandidateFits(reservations, candidate, padding = 0.08) {
    return !anyReservationIntersectsBox(reservations, { x: candidate.x, z: candidate.z, halfX: Math.max(0.025, candidate.sx * 0.5), halfZ: Math.max(0.025, candidate.sz * 0.5), yMin: candidate.y, yMax: candidate.y + candidate.sy }, padding);
}
function pushFacadePrimitive(placements, stats, reservations, candidate) {
    if (!facadeCandidateFits(reservations, candidate)) { stats.rejected++; return false; }
    placements.push(candidate); stats.facadeInfrastructure++; stats.facadeCategories[candidate.category]=(stats.facadeCategories[candidate.category]??0)+1; return true;
}

function pushFacadeAssembly(placements, stats, reservations, parts, { id, kind, uMin, uMax }) {
    if (!parts.length || !parts.every(candidate => facadeCandidateFits(reservations, candidate, 0.10))) {
        stats.rejected += parts.length;
        return false;
    }
    for (const candidate of parts) {
        candidate.domain = 'facade-macro';
        candidate.assemblyId = id;
        candidate.assemblyKind = kind;
        candidate.assemblyUMin = uMin;
        candidate.assemblyUMax = uMax;
        placements.push(candidate);
        stats.facadeInfrastructure++;
        stats.facadeMacroPrimitives++;
        stats.facadeCategories[candidate.category] = (stats.facadeCategories[candidate.category] ?? 0) + 1;
    }
    stats.facadeMacroAssemblies++;
    stats.facadeMacroKinds[kind] = (stats.facadeMacroKinds[kind] ?? 0) + 1;
    return true;
}

function facadeAssemblyParts(surface, rng, kind, u, span, yMin, yMax) {
    const facadeHeight = Math.max(2.4, yMax - yMin);
    const parts = [];
    const box = (du, y, w, h, d, category, extraOutward = 0, colorFamily = category) => parts.push(
        facadeBox(surface, u + du, y, w, h, d, pick(rng, FACADE_INFRA_COLORS[colorFamily] ?? FACADE_INFRA_COLORS.structure), category, extraOutward)
    );
    const pipe = (du, y, h, radius = 0.10) => parts.push(
        facadePipe(surface, u + du, y, h, radius, pick(rng, FACADE_INFRA_COLORS.pipe))
    );

    if (kind === 'pipe-rack') {
        const h = clamp(facadeHeight * range(rng, 0.54, 0.76), 3.2, Math.max(3.2, facadeHeight - 0.5));
        const baseY = clamp(yMin + range(rng, 0.25, 0.75), yMin + 0.10, yMax - h - 0.10);
        const spread = span * 0.26;
        pipe(-spread, baseY, h, range(rng, 0.085, 0.135));
        pipe(0, baseY + range(rng, 0.18, 0.55), h - range(rng, 0.20, 0.55), range(rng, 0.07, 0.11));
        pipe(spread, baseY + range(rng, 0.05, 0.38), h - range(rng, 0.10, 0.45), range(rng, 0.085, 0.135));
        box(0, baseY + h * 0.72, span * 0.72, 0.16, 0.18, 'pipe', 0.01, 'pipe');
        box(0, baseY + h * 0.28, span * 0.66, 0.13, 0.15, 'pipe', 0.01, 'pipe');
        box(spread * 0.46, baseY + h * 0.42, 0.48, 0.58, 0.20, 'electrical');
        return parts;
    }

    if (kind === 'duct-stack') {
        const h = clamp(facadeHeight * range(rng, 0.46, 0.68), 3.0, Math.max(3.0, facadeHeight - 0.8));
        const baseY = clamp(yMin + range(rng, 0.65, 1.25), yMin + 0.18, yMax - h - 0.16);
        const trunkU = -span * 0.20;
        box(trunkU, baseY, clamp(span * 0.24, 0.58, 0.88), h, 0.48, 'duct');
        box(span * 0.08, baseY + h * 0.68, span * 0.50, 0.46, 0.48, 'duct');
        box(span * 0.17, baseY + h * 0.68 + 0.07, span * 0.28, 0.30, 0.055, 'vent', 0.29, 'vent');
        box(span * 0.02, baseY + h * 0.30, span * 0.38, 0.34, 0.42, 'duct');
        box(span * 0.10, baseY + h * 0.30 + 0.05, span * 0.22, 0.22, 0.05, 'vent', 0.25, 'vent');
        box(trunkU, baseY + h - 0.08, clamp(span * 0.36, 0.82, 1.18), 0.18, 0.62, 'duct');
        return parts;
    }

    if (kind === 'billboard-rack') {
        const panelW = clamp(span * 0.86, 1.8, 4.2);
        const panelH = clamp(facadeHeight * range(rng, 0.18, 0.28), 1.25, 2.55);
        const panelY = clamp(yMin + facadeHeight * range(rng, 0.48, 0.70), yMin + 2.0, yMax - panelH - 0.28);
        const frameW = panelW + 0.18;
        box(0, panelY, panelW, panelH, 0.13, 'billboard', 0.26, 'billboard');
        box(0, panelY - 0.10, frameW, 0.08, 0.10, 'structure', 0.31, 'structure');
        box(0, panelY + panelH + 0.02, frameW, 0.08, 0.10, 'structure', 0.31, 'structure');
        box(-panelW * 0.5 - 0.05, panelY - 0.08, 0.08, panelH + 0.18, 0.10, 'structure', 0.31, 'structure');
        box(panelW * 0.5 + 0.05, panelY - 0.08, 0.08, panelH + 0.18, 0.10, 'structure', 0.31, 'structure');
        box(-panelW * 0.28, panelY - 0.72, 0.09, 0.68, 0.18, 'structure', 0.20, 'structure');
        box(panelW * 0.28, panelY - 0.72, 0.09, 0.68, 0.18, 'structure', 0.20, 'structure');
        return parts;
    }

    const unitCount = span >= 3.1 ? 3 : 2;
    const usableW = span * 0.82;
    const unitW = clamp(usableW / unitCount * 0.78, 0.62, 1.05);
    const baseY = clamp(yMin + facadeHeight * range(rng, 0.26, 0.46), yMin + 1.0, yMax - 2.1);
    for (let i = 0; i < unitCount; i++) {
        const du = unitCount === 1 ? 0 : -usableW * 0.36 + i * (usableW * 0.72 / (unitCount - 1));
        const h = range(rng, 0.62, 0.94);
        box(du, baseY + range(rng, -0.10, 0.12), unitW, h, 0.42, 'hvac');
        box(du, baseY + h * 0.18, unitW * 0.58, h * 0.52, 0.05, 'vent', 0.24, 'vent');
    }
    box(0, baseY + 1.18, usableW * 0.90, 0.28, 0.34, 'duct');
    box(-usableW * 0.38, baseY + 0.05, 0.10, 1.46, 0.12, 'cable', 0.02, 'cable');
    return parts;
}

function addFacadeMacroAssemblies({ chunk, payload, placements, stats, reservations, contextByEntity }) {
    const semantic = payload?.semanticContext;
    const apertures = semantic?.apertures ?? [];
    const kinds = ['pipe-rack', 'duct-stack', 'billboard-rack', 'mechanical-bank'];
    for (const surface of semantic?.surfaces ?? []) {
        const yMin = finite(surface.yMin), yMax = finite(surface.yMax, yMin + 2.8);
        const facadeHeight = Math.max(0, yMax - yMin);
        if (facadeHeight < 5.1 || finite(surface.half) < 1.15) continue;
        const intervals = freeIntervals(surface, apertures, 0.62)
            .filter(([lo, hi]) => hi - lo >= 2.05)
            .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        if (!intervals.length) continue;
        const rng = mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:facade-macro:${surface.id}`));
        const context = String(contextByEntity.get(surface.entityId)?.program ?? contextByEntity.get(surface.entityId)?.physicalUseFamily ?? 'mixed');
        const chance = /industrial|service|mechanical|workshop/i.test(context) ? 0.96 : surface.exposure === 'street' ? 0.86 : 0.92;
        if (rng() > chance) continue;
        const [lo, hi] = intervals[0];
        const intervalWidth = hi - lo;
        const span = clamp(intervalWidth * range(rng, 0.72, 0.92), 2.0, 4.5);
        const margin = Math.max(0.12, (intervalWidth - span) * 0.5);
        const u = clamp((lo + hi) * 0.5 + range(rng, -intervalWidth * 0.10, intervalWidth * 0.10), lo + span * 0.5 + margin * 0.25, hi - span * 0.5 - margin * 0.25);
        let kindIndex = hash32(`${chunk.key}:${surface.id}:macro-kind`) % kinds.length;
        if (/industrial|service|mechanical|workshop/i.test(context) && kinds[kindIndex] === 'billboard-rack') kindIndex = 1;
        const kind = kinds[kindIndex];
        const uMin = u - span * 0.5, uMax = u + span * 0.5;
        const id = `${surface.id}:macro:${kind}`;
        const parts = facadeAssemblyParts(surface, rng, kind, u, span, yMin, yMax);
        pushFacadeAssembly(placements, stats, reservations, parts, { id, kind, uMin, uMax });
    }
}

function addFacadeInfrastructure({ chunk, payload, placements, stats, reservations, contextByEntity }) {
    const semantic=payload?.semanticContext; const apertures=semantic?.apertures??[];
    for (const surface of semantic?.surfaces??[]) {
        const yMin=finite(surface.yMin), yMax=finite(surface.yMax,yMin+2.8), facadeHeight=Math.max(0,yMax-yMin);
        if (facadeHeight<2.2 || finite(surface.half)<0.45) continue;
        const rng=mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:facade-infra:${surface.id}`));
        const context=String(contextByEntity.get(surface.entityId)?.program??contextByEntity.get(surface.entityId)?.physicalUseFamily??'mixed');
        for (const [lo,hi] of freeIntervals(surface,apertures,0.48)) {
            const width=hi-lo; if(width<0.75) continue; const area=width*facadeHeight;
            const n=clamp(Math.round(area/(surface.exposure==='street'?11:9)),1,6), cellWidth=width/n;
            for(let i=0;i<n;i++){
                const cellLo=lo+i*cellWidth, cellHi=cellLo+cellWidth;
                const u=clamp((cellLo+cellHi)*0.5+range(rng,-cellWidth*0.18,cellWidth*0.18),cellLo+0.18,cellHi-0.18);
                const macroOccupied = placements.some(item => item.domain === 'facade-macro' && item.surfaceId === surface.id
                    && u >= finite(item.assemblyUMin, Infinity) - 0.12 && u <= finite(item.assemblyUMax, -Infinity) + 0.12);
                if (macroOccupied) continue;
                const band=i%Math.max(1,Math.min(4,Math.ceil(facadeHeight/2.7)));
                const y=clamp(yMin+1+band*2.35+range(rng,-0.24,0.34),yMin+0.45,yMax-0.75); const r=rng();
                if(r<0.26 || (/industrial|service|mechanical/i.test(context)&&r<0.38)){
                    const ph=clamp(Math.min(Math.max(0.2,facadeHeight-1),range(rng,2,4.6)),1.3,Math.max(1.3,facadeHeight-0.35));
                    const py=clamp(y-ph*0.35,yMin+0.08,yMax-ph-0.08);
                    pushFacadePrimitive(placements,stats,reservations,facadePipe(surface,u,py,ph,range(rng,0.055,0.105),pick(rng,FACADE_INFRA_COLORS.pipe)));
                    if(cellWidth>1.25) pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u+Math.min(0.42,cellWidth*0.24),clamp(py+0.55,yMin+0.4,yMax-0.9),0.46,0.62,0.16,pick(rng,FACADE_INFRA_COLORS.electrical),'electrical'));
                } else if(r<0.52){
                    const w=clamp(cellWidth*range(rng,0.42,0.68),0.62,1.35), h=range(rng,0.48,0.88);
                    if(pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u,y,w,h,0.34,pick(rng,FACADE_INFRA_COLORS.hvac),'hvac'))) pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u,y+h*0.20,w*0.58,h*0.50,0.045,pick(rng,FACADE_INFRA_COLORS.vent),'vent',0.19));
                } else if(r<0.72){
                    const w=clamp(cellWidth*range(rng,0.30,0.52),0.42,0.95); pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u,y,w,range(rng,0.52,1.05),0.16,pick(rng,FACADE_INFRA_COLORS.electrical),'electrical'));
                    if(cellWidth>1.1) pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u+Math.min(0.48,cellWidth*0.26),y+0.12,0.055,clamp(range(rng,0.8,1.7),0.8,yMax-y-0.1),0.07,pick(rng,FACADE_INFRA_COLORS.cable),'cable'));
                } else if(r<0.90) pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u,y,clamp(cellWidth*0.48,0.52,1.15),range(rng,0.34,0.62),0.13,pick(rng,FACADE_INFRA_COLORS.vent),'vent'));
                else pushFacadePrimitive(placements,stats,reservations,facadeBox(surface,u,y,clamp(cellWidth*0.38,0.38,0.82),0.16,0.20,pick(rng,FACADE_INFRA_COLORS.light),'light'));
            }
        }
    }
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

function pushRoofMechanicalDetail(placements, stats, parts, id) {
    for (const candidate of parts) {
        candidate.domain = 'roof-mechanical-detail';
        candidate.assemblyId = id;
        candidate.assemblyKind = 'rooftop-mechanical-detail';
        placements.push(candidate);
        stats.roofMechanicalPrimitives++;
    }
    stats.roofMechanicalAssemblies++;
}

function addRoofMechanicalDetails({ chunk, payload, placements, stats }) {
    const hosts = (payload?.physics?.props ?? []).filter(prop => prop?.supportKind === 'rooftop-mechanical'
        && Number.isFinite(prop.x) && Number.isFinite(prop.z) && Number.isFinite(prop.yMin)
        && Number.isFinite(prop.height) && finite(prop.radius) >= 0.38);
    for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
        const host = hosts[hostIndex];
        const radius = clamp(finite(host.radius), 0.38, 2.4);
        const topY = Math.max(finite(host.yMin), finite(host.height));
        const hostHeight = Math.max(0.35, topY - finite(host.yMin));
        const rng = mulberry32(hash32(`${chunk.seed ?? chunk.key}:${chunk.key}:roof-mechanical-detail:${hostIndex}:${host.x}:${host.z}`));
        const parts = [];
        const detailColor = () => pick(rng, FACADE_INFRA_COLORS.hvac);
        const ventColor = () => pick(rng, FACADE_INFRA_COLORS.vent);
        const structureColor = () => pick(rng, FACADE_INFRA_COLORS.structure);
        const frontZ = host.z - radius * 0.76;
        const louverW = clamp(radius * 1.15, 0.42, 1.8);
        const louverH = clamp(hostHeight * 0.30, 0.22, 0.58);
        parts.push({
            shape: 'box', color: ventColor(), x: host.x, y: finite(host.yMin) + hostHeight * 0.36,
            z: frontZ, sx: louverW, sy: louverH, sz: 0.07, rotY: 0, category: 'vent', hostSupportKind: host.supportKind,
        });
        const fanCount = radius >= 0.78 ? 2 : 1;
        for (let i = 0; i < fanCount; i++) {
            const dx = fanCount === 1 ? 0 : (i ? 1 : -1) * radius * 0.30;
            const d = clamp(radius * range(rng, 0.34, 0.46), 0.24, 0.58);
            parts.push({
                shape: 'cylinder', color: ventColor(), x: host.x + dx, y: topY,
                z: host.z, sx: d, sy: range(rng, 0.12, 0.22), sz: d, rotY: 0, category: 'fan', hostSupportKind: host.supportKind,
            });
        }
        if (radius >= 0.58) {
            const stackD = clamp(radius * 0.24, 0.16, 0.34);
            parts.push({
                shape: 'cylinder', color: structureColor(), x: host.x + radius * 0.30, y: topY,
                z: host.z + radius * 0.28, sx: stackD, sy: range(rng, 0.58, 1.10), sz: stackD, rotY: 0, category: 'stack', hostSupportKind: host.supportKind,
            });
        }
        if (radius >= 0.74) {
            parts.push({
                shape: 'box', color: detailColor(), x: host.x - radius * 0.28, y: topY + 0.03,
                z: host.z + radius * 0.24, sx: clamp(radius * 0.48, 0.34, 0.76), sy: range(rng, 0.26, 0.46),
                sz: clamp(radius * 0.42, 0.30, 0.68), rotY: 0, category: 'duct', hostSupportKind: host.supportKind,
            });
        }
        pushRoofMechanicalDetail(placements, stats, parts, `rooftop-mechanical:${hostIndex}:${host.x}:${host.z}`);
    }
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
    const stats = { generated: 0, groundEdge: 0, wallBand: 0, facadeInfrastructure: 0, facadeCategories: {}, facadeMacroAssemblies: 0, facadeMacroPrimitives: 0, facadeMacroKinds: {}, courtyardEdge: 0, roofEdge: 0, roofMechanicalAssemblies: 0, roofMechanicalPrimitives: 0, rejected: 0, drawBuckets: 0 };
    const reservations = reservationList(payload);
    const modules = footprintModules(payload);
    const contextByEntity = new Map((semantic?.entities ?? []).map(context => [context.entityId, context]));

    addFacadeMacroAssemblies({ chunk, payload, placements, stats, reservations, contextByEntity });
    addFacadeInfrastructure({ chunk, payload, placements, stats, reservations, contextByEntity });
    addWallField({ chunk, payload, placements, stats, reservations, modules, contextByEntity });
    addPlazaField({ chunk, payload, placements, stats, reservations, modules });
    addRoofMechanicalDetails({ chunk, payload, placements, stats });
    addRoofField({ chunk, payload, placements, stats, reservations });

    const usedShapes = new Set(placements.map(item => item.shape));
    const facadeMeters = (semantic?.surfaces ?? [])
        .filter(surface => finite(surface.yMin) <= 0.35)
        .reduce((sum, surface) => sum + Math.max(0, finite(surface.half) * 2), 0);
    const roofPerimeterMeters = (semantic?.opportunities ?? [])
        .filter(opportunity => opportunity?.role === 'roof-utility-zone' && opportunity.bounds)
        .reduce((sum, opportunity) => sum + Math.max(0, (finite(opportunity.bounds.halfX) + finite(opportunity.bounds.halfZ)) * 4), 0);
    stats.generated = placements.length;
    stats.wallBand = stats.facadeInfrastructure;
    stats.facadeCategoryCount = Object.keys(stats.facadeCategories).length;
    stats.visibleFacadePerFacadeMeter = facadeMeters > 0 ? stats.facadeInfrastructure / facadeMeters : 0;
    stats.microClutter = stats.groundEdge + stats.courtyardEdge + stats.roofEdge;
    stats.macroAssemblies = stats.facadeMacroAssemblies + stats.roofMechanicalAssemblies;
    stats.macroPrimitives = stats.facadeMacroPrimitives + stats.roofMechanicalPrimitives;
    stats.macroKindCount = Object.keys(stats.facadeMacroKinds).length + (stats.roofMechanicalAssemblies > 0 ? 1 : 0);
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
