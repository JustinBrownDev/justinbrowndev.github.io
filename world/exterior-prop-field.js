// Semantic-only exterior field. This module is deliberately a consumer of
// semantic opportunities; it is not allowed to discover facade/roof/portal
// geometry independently.

import { GENERATION_LANES } from '../config/performance-isolation.js';
import { EXTERIOR_OPPORTUNITY_PRIORITY, EXTERIOR_VISUAL_TIER, exteriorOpportunityVisualTier, exteriorPlacementVisualImpact } from './exterior-spectacle-priority.js';
import { recipeContextFromSemanticMedia, resolveDisplayRecipe } from '../content/sign-visual-language.js';
import { renderDisplayCanvas } from '../systems/sign-display-renderer.js';

const SHAPES = Object.freeze(['box', 'cylinder', 'cone', 'sphere']);
const COLORS = Object.freeze([0x4b5150, 0x62635e, 0x756956, 0x42585d, 0x6b5b61, 0x514c45]);

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }

function rngFor(value) {
    let a = hash32(value);
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}


function placementIntersectsReservation(item, reservation) {
    const itemMinY = item.y;
    const itemMaxY = item.y + item.sy;
    const rMinY = finite(reservation?.yMin, finite(reservation?.y0, -Infinity));
    const rMaxY = finite(reservation?.yMax, finite(reservation?.y1, Infinity));
    if (itemMinY >= rMaxY || itemMaxY <= rMinY) return false;
    let minX, maxX, minZ, maxZ;
    if ([reservation?.x, reservation?.z, reservation?.halfX, reservation?.halfZ].every(Number.isFinite)) {
        minX = reservation.x - reservation.halfX; maxX = reservation.x + reservation.halfX;
        minZ = reservation.z - reservation.halfZ; maxZ = reservation.z + reservation.halfZ;
    } else if (reservation?.axis && Number.isFinite(reservation.from) && Number.isFinite(reservation.to) && Number.isFinite(reservation.fixedCoord)) {
        const half = Math.max(0.2, finite(reservation.halfWidth, 0.45) + 0.30);
        if (reservation.axis === 'x') {
            minX = Math.min(reservation.from, reservation.to) - 0.30; maxX = Math.max(reservation.from, reservation.to) + 0.30;
            minZ = reservation.fixedCoord - half; maxZ = reservation.fixedCoord + half;
        } else {
            minX = reservation.fixedCoord - half; maxX = reservation.fixedCoord + half;
            minZ = Math.min(reservation.from, reservation.to) - 0.30; maxZ = Math.max(reservation.from, reservation.to) + 0.30;
        }
    } else return false;
    const itemMinX = item.x - item.sx * 0.5, itemMaxX = item.x + item.sx * 0.5;
    const itemMinZ = item.z - item.sz * 0.5, itemMaxZ = item.z + item.sz * 0.5;
    return itemMinX < maxX && itemMaxX > minX && itemMinZ < maxZ && itemMaxZ > minZ;
}

function isEligible(opportunity) {
    if (!opportunity || opportunity.decorationMayIntrude === false) return false;
    return [
        'wall-mounted-prop-zone', 'facade-service-band', 'facade-sign-zone',
        'portal-flank-wall-zone', 'portal-lintel-zone', 'ground-edge-zone',
        'portal-flank-ground-zone', 'connector-service-zone', 'ground-open-zone',
        'roof-utility-zone', 'facade-spectacle-span', 'corner-media-band', 'roof-spectacle-envelope',
    ].includes(opportunity.role);
}

function frame(opportunity) {
    const source = opportunity.surfaceFrame ?? opportunity;
    return {
        tx: finite(source.tangentX, opportunity.side === 'east' || opportunity.side === 'west' ? 0 : 1),
        tz: finite(source.tangentZ, opportunity.side === 'east' || opportunity.side === 'west' ? 1 : 0),
        nx: finite(source.normalX),
        nz: finite(source.normalZ),
    };
}

function placementBase(opportunity, domain, primitiveIndex) {
    return {
        semanticAuthority: true,
        semanticOpportunityId: opportunity.id,
        semanticHostId: opportunity.surfaceId ?? opportunity.hostId ?? opportunity.entityId ?? null,
        semanticContextId: opportunity.contextId ?? null,
        spatialTopologyHostId: opportunity.spatialTopologyHostId ?? opportunity.connectorId ?? opportunity.surfaceId ?? null,
        connectorId: opportunity.connectorId ?? null,
        apertureId: opportunity.apertureId ?? null,
        reservationIds: [...(opportunity.reservationIds ?? [])],
        surfaceId: opportunity.surfaceId ?? null,
        entityId: opportunity.entityId ?? null,
        role: opportunity.role,
        side: opportunity.side ?? null,
        surfaceFrame: opportunity.surfaceFrame ? { ...opportunity.surfaceFrame } : null,
        domain,
        primitiveIndex,
    };
}

function surfacePoint(opportunity, du = 0, dy = 0, outward = 0) {
    const f = frame(opportunity);
    const t = opportunity.transform;
    return {
        x: finite(t?.x) + f.tx * du + f.nx * outward,
        y: finite(t?.y) + dy,
        z: finite(t?.z) + f.tz * du + f.nz * outward,
        rotY: finite(t?.rotY),
    };
}

function pushPrimitive(placements, opportunity, spec, domain, index) {
    placements.push({
        ...placementBase(opportunity, domain, index),
        shape: spec.shape ?? 'box',
        x: spec.x, y: spec.y, z: spec.z,
        sx: Math.max(0.04, spec.sx), sy: Math.max(0.04, spec.sy), sz: Math.max(0.04, spec.sz),
        rotY: finite(spec.rotY), color: spec.color ?? COLORS[hash32(`${opportunity.id}:${index}`) % COLORS.length],
        assemblyId: spec.assemblyId ?? null,
        assemblyKind: spec.assemblyKind ?? null,
        visualTier: spec.visualTier ?? exteriorOpportunityVisualTier(opportunity.role),
        visualImpact: 0,
        spectacleSurfaceIds: [...(spec.spectacleSurfaceIds ?? [])],
    });
    const pushed = placements[placements.length - 1];
    pushed.visualImpact = exteriorPlacementVisualImpact(pushed);
}


function segmentPoint(segment, outward = 0.16) {
    const f = segment.surfaceFrame ?? {};
    const t = segment.transform ?? {};
    return {
        x: finite(t.x) + finite(f.normalX) * outward,
        y: finite(t.y) - Math.max(0, finite(segment.height)) * 0.5,
        z: finite(t.z) + finite(f.normalZ) * outward,
        rotY: finite(t.rotY),
    };
}

function lineIntersection2D(aPoint, aDir, bPoint, bDir) {
    const den = aDir.x * bDir.z - aDir.z * bDir.x;
    if (Math.abs(den) < 1e-6) return null;
    const dx = bPoint.x - aPoint.x;
    const dz = bPoint.z - aPoint.z;
    const t = (dx * bDir.z - dz * bDir.x) / den;
    return { x: aPoint.x + aDir.x * t, z: aPoint.z + aDir.z * t };
}

function alignCornerMediaSegments(segments, screenOutward = 0.17, panelOffset = 0.092) {
    if (!Array.isArray(segments) || segments.length !== 2) return null;
    const lines = segments.map(segment => {
        const f = segment.surfaceFrame ?? {};
        const t = segment.transform ?? {};
        const tangent = { x: finite(f.tangentX), z: finite(f.tangentZ) };
        const normal = { x: finite(f.normalX), z: finite(f.normalZ) };
        const width = Math.max(0.01, finite(segment.width, 1));
        const panelCenter = {
            x: finite(t.x) + normal.x * (screenOutward + panelOffset),
            z: finite(t.z) + normal.z * (screenOutward + panelOffset),
        };
        return { segment, tangent, normal, width, panelCenter };
    });
    const seam = lineIntersection2D(lines[0].panelCenter, lines[0].tangent, lines[1].panelCenter, lines[1].tangent);
    if (!seam) return null;

    const bottom = Math.max(...segments.map(segment => finite(segment.transform?.y) - Math.max(0, finite(segment.height)) * 0.5));
    const top = Math.min(...segments.map(segment => finite(segment.transform?.y) + Math.max(0, finite(segment.height)) * 0.5));
    const commonHeight = top - bottom;
    if (commonHeight < 1.55) return null;

    const aligned = lines.map(line => {
        const half = line.width * 0.5;
        const lo = { x: line.panelCenter.x - line.tangent.x * half, z: line.panelCenter.z - line.tangent.z * half };
        const hi = { x: line.panelCenter.x + line.tangent.x * half, z: line.panelCenter.z + line.tangent.z * half };
        const dlo = Math.hypot(lo.x - seam.x, lo.z - seam.z);
        const dhi = Math.hypot(hi.x - seam.x, hi.z - seam.z);
        const nearDistance = Math.min(dlo, dhi);
        if (nearDistance > 1.45) return null;
        const far = dlo > dhi ? lo : hi;
        const width = Math.hypot(far.x - seam.x, far.z - seam.z);
        if (width < 3.0 || width > 20.0) return null;
        const panelCenter = { x: (far.x + seam.x) * 0.5, z: (far.z + seam.z) * 0.5 };
        return {
            point: {
                x: panelCenter.x - line.normal.x * panelOffset,
                y: bottom,
                z: panelCenter.z - line.normal.z * panelOffset,
                rotY: finite(line.segment.transform?.rotY),
            },
            width,
            height: commonHeight,
        };
    });
    return aligned.every(Boolean) ? aligned : null;
}

function emitFacadeSpectacle(opportunity, placements) {
    const segments = opportunity.segments?.length ? opportunity.segments : [{
        surfaceId: opportunity.surfaceId,
        side: opportunity.side,
        surfaceFrame: opportunity.surfaceFrame,
        transform: opportunity.transform,
        width: finite(opportunity.clearanceBudget?.width, opportunity.availableWidth),
        height: finite(opportunity.clearanceBudget?.height, 3),
    }];
    if (!segments.length) return false;
    const assemblyId = opportunity.id + ':megascreen';
    const assemblyKind = opportunity.role === 'corner-media-band' ? 'corner-megascreen' : 'facade-megascreen';
    const surfaceIds = segments.map(segment => segment.surfaceId).filter(Boolean);
    const alignedCorner = opportunity.role === 'corner-media-band' ? alignCornerMediaSegments(segments) : null;
    let emitted = 0;
    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const signageStress = GENERATION_LANES.signageStress === true;
        const aligned = alignedCorner?.[index] ?? null;
        const width = aligned?.width ?? clamp(finite(segment.width, 3.2) * (signageStress ? 0.99 : 0.93), 3.0, signageStress ? 18.0 : 12.5);
        const height = aligned?.height ?? clamp(
            Math.min(finite(segment.height, 3.0) * (signageStress ? 0.94 : 0.82), width * (signageStress ? 1.35 : 0.62)),
            1.55, signageStress ? 10.0 : 6.8,
        );
        const p = aligned?.point ?? segmentPoint(segment, 0.17);
        const pseudo = {
            ...opportunity,
            surfaceId: segment.surfaceId ?? opportunity.surfaceId,
            side: segment.side ?? opportunity.side,
            surfaceFrame: segment.surfaceFrame ?? opportunity.surfaceFrame,
        };
        pushPrimitive(placements, pseudo, {
            ...p, shape: 'box', sx: width, sy: height, sz: 0.16,
            assemblyId, assemblyKind, visualTier: 'spectacle', spectacleSurfaceIds: surfaceIds,
            color: [0x6ecbd1, 0xe06caa, 0xf0c65e, 0x78d779][hash32(opportunity.id + ':screen:' + index) % 4],
        }, 'facade-spectacle', index * 4);
        if (!signageStress) {
            for (const [supportIndex, du] of [-width * 0.43, width * 0.43].entries()) {
                const f = segment.surfaceFrame ?? {};
                pushPrimitive(placements, pseudo, {
                    x: p.x + finite(f.tangentX) * du,
                    y: p.y - height * 0.42,
                    z: p.z + finite(f.tangentZ) * du,
                    rotY: p.rotY,
                    shape: 'cylinder', sx: 0.13, sy: height * 0.92, sz: 0.13,
                    assemblyId, assemblyKind, visualTier: 'spectacle', spectacleSurfaceIds: surfaceIds,
                    color: 0x343b3d,
                }, 'facade-spectacle', index * 4 + supportIndex + 1);
            }
        }
        emitted++;
    }
    return emitted > 0;
}

function emitRoofSpectacle(opportunity, placements) {
    const bounds = opportunity.bounds;
    if (!bounds) return false;
    const rng = rngFor('roof-spectacle:' + opportunity.id);
    const widthX = Math.max(0, finite(bounds.halfX) * 2);
    const widthZ = Math.max(0, finite(bounds.halfZ) * 2);
    if (widthX < 3.2 || widthZ < 2.2) return false;
    const alongX = widthX >= widthZ;
    const usable = alongX ? widthX : widthZ;
    const panelW = clamp(usable * 0.86, 3.8, 12.5);
    const panelH = clamp(panelW * (0.30 + rng() * 0.12), 1.7, 4.8);
    const assemblyId = opportunity.id + ':roof-billboard';
    const assemblyKind = rng() < 0.72 ? 'roof-megascreen' : 'roof-industrial-crown';
    const rotY = alongX ? 0 : Math.PI * 0.5;
    const baseY = finite(bounds.y) + 0.16;
    if (assemblyKind === 'roof-megascreen') {
        pushPrimitive(placements, opportunity, {
            x: bounds.x, y: baseY + 1.15, z: bounds.z, rotY,
            shape: 'box', sx: panelW, sy: panelH, sz: 0.20,
            assemblyId, assemblyKind, visualTier: 'spectacle', color: 0x70cfd1,
        }, 'roof-spectacle', 0);
        for (const [index, offset] of [-panelW * 0.38, panelW * 0.38].entries()) {
            const x = bounds.x + (alongX ? offset : 0);
            const z = bounds.z + (alongX ? 0 : offset);
            pushPrimitive(placements, opportunity, {
                x, y: baseY, z, rotY, shape: 'cylinder', sx: 0.16, sy: 1.25, sz: 0.16,
                assemblyId, assemblyKind, visualTier: 'spectacle', color: 0x353b3c,
            }, 'roof-spectacle', index + 1);
        }
    } else {
        const bankDepth = clamp(Math.min(widthX, widthZ) * 0.68, 1.8, 4.8);
        pushPrimitive(placements, opportunity, {
            x: bounds.x, y: baseY, z: bounds.z, rotY,
            shape: 'box', sx: panelW * 0.82, sy: clamp(panelH * 0.62, 1.2, 3.0), sz: bankDepth,
            assemblyId, assemblyKind, visualTier: 'spectacle', color: 0x626c6b,
        }, 'roof-spectacle', 0);
        pushPrimitive(placements, opportunity, {
            x: bounds.x, y: baseY + panelH * 0.68, z: bounds.z, rotY,
            shape: 'cylinder', sx: 0.34, sy: clamp(panelH * 0.9, 1.8, 4.2), sz: 0.34,
            assemblyId, assemblyKind, visualTier: 'spectacle', color: 0x3f4748,
        }, 'roof-spectacle', 1);
    }
    return true;
}

function emitFacade(opportunity, placements) {
    const rng = rngFor(`facade:${opportunity.id}`);
    const budget = opportunity.clearanceBudget ?? {};
    const width = clamp(finite(budget.width, finite(opportunity.availableWidth, 1.2)), 0.35, 7.5);
    const height = clamp(finite(budget.height, 1.4), 0.35, 6.0);
    const role = opportunity.role;

    if (role === 'facade-sign-zone' && width >= 2.8) {
        const assemblyId = `${opportunity.id}:macro-sign`;
        const panelW = clamp(width * 0.78, 2.3, 5.8);
        const panelH = clamp(Math.min(height, panelW * 0.42), 0.8, 2.4);
        const p = surfacePoint(opportunity, 0, 0.15, 0.18);
        pushPrimitive(placements, opportunity, { ...p, shape: 'box', sx: panelW, sy: panelH, sz: 0.12, assemblyId }, 'facade-macro', 0);
        for (const [index, du] of [-panelW * 0.36, panelW * 0.36].entries()) {
            const support = surfacePoint(opportunity, du, -panelH * 0.35, 0.08);
            pushPrimitive(placements, opportunity, { ...support, shape: 'cylinder', sx: 0.11, sy: panelH * 0.85, sz: 0.11, assemblyId }, 'facade-macro', index + 1);
        }
        return;
    }

    const count = role === 'facade-service-band' ? clamp(Math.ceil(width / 2.4), 1, 3) : 1;
    for (let i = 0; i < count; i++) {
        const du = count === 1 ? 0 : (-width * 0.35 + (width * 0.70) * (i / Math.max(1, count - 1)));
        const p = surfacePoint(opportunity, du, 0, 0.08 + rng() * 0.06);
        if (role === 'portal-lintel-zone') {
            pushPrimitive(placements, opportunity, { ...p, shape: rng() < 0.5 ? 'box' : 'cylinder', sx: 0.48 + rng() * 0.45, sy: 0.16 + rng() * 0.14, sz: 0.16 + rng() * 0.18 }, 'portal-hardware', i);
        } else if (role === 'portal-flank-wall-zone') {
            pushPrimitive(placements, opportunity, { ...p, shape: 'box', sx: 0.24 + rng() * 0.28, sy: 0.42 + rng() * 0.70, sz: 0.16 + rng() * 0.18 }, 'portal-hardware', i);
        } else if (role === 'facade-service-band' || role === 'wall-mounted-prop-zone') {
            const pipeLike = rng() < 0.46;
            pushPrimitive(placements, opportunity, pipeLike
                ? { ...p, shape: 'cylinder', sx: 0.10 + rng() * 0.10, sy: clamp(height * (0.55 + rng() * 0.35), 0.7, 3.8), sz: 0.10 + rng() * 0.10 }
                : { ...p, shape: 'box', sx: clamp(width * (0.22 + rng() * 0.22), 0.32, 1.3), sy: clamp(height * (0.30 + rng() * 0.35), 0.38, 1.8), sz: 0.22 + rng() * 0.28 },
                'facade-infrastructure', i);
        }
    }
}

function emitFacadeMechanicalMacro(opportunity, placements, request = {}) {
    const budget = opportunity.clearanceBudget ?? {};
    const width = clamp(finite(budget.width, finite(opportunity.availableWidth, 2.6)), 1.0, 8.0);
    const height = clamp(finite(budget.height, finite(opportunity.availableHeight, 4.5)), 1.4, 8.5);
    if (width < 1.0 || height < 1.4) return false;
    const rng = rngFor(`facade-macro-mechanical:${opportunity.id}:${request.semanticFamily ?? 'mechanical'}`);
    const assemblyId = `${opportunity.id}:macro-mechanical`;
    const family = String(request.semanticFamily ?? 'mechanical-service');
    const vertical = family.includes('vertical') || height >= width * 1.15;
    const p = surfacePoint(opportunity, 0, 0, 0.15);
    if (vertical) {
        const pipeCount = width >= 3.2 ? 3 : 2;
        const spread = Math.min(width * 0.56, 2.2);
        for (let i = 0; i < pipeCount; i++) {
            const du = pipeCount === 1 ? 0 : -spread * 0.5 + spread * (i / (pipeCount - 1));
            const q = surfacePoint(opportunity, du, 0, 0.14 + i * 0.018);
            pushPrimitive(placements, opportunity, {
                ...q, shape: 'cylinder', sx: 0.22 + rng() * 0.12,
                sy: clamp(height * (0.72 + rng() * 0.18), 1.8, 7.2), sz: 0.22 + rng() * 0.12,
                assemblyId, assemblyKind: 'facade-vertical-mechanical', visualTier: 'macro', color: 0x4d5655,
            }, 'facade-macro', i);
        }
        const cross = surfacePoint(opportunity, 0, -height * 0.28, 0.17);
        pushPrimitive(placements, opportunity, {
            ...cross, shape: 'box', sx: clamp(width * 0.66, 1.15, 4.8), sy: 0.34, sz: 0.36,
            assemblyId, assemblyKind: 'facade-vertical-mechanical', visualTier: 'macro', color: 0x626c6b,
        }, 'facade-macro', pipeCount);
    } else {
        const unitW = clamp(width * 0.66, 1.4, 4.8);
        const unitH = clamp(height * 0.38, 0.8, 2.5);
        pushPrimitive(placements, opportunity, {
            ...p, shape: 'box', sx: unitW, sy: unitH, sz: clamp(unitW * 0.24, 0.38, 1.05),
            assemblyId, assemblyKind: 'facade-hvac-bank', visualTier: 'macro', color: 0x626c6b,
        }, 'facade-macro', 0);
        for (const [index, du] of [-unitW * 0.28, unitW * 0.28].entries()) {
            const q = surfacePoint(opportunity, du, unitH * 0.02, 0.18);
            pushPrimitive(placements, opportunity, {
                ...q, shape: 'cylinder', sx: unitH * 0.30, sy: unitH * 0.16, sz: unitH * 0.30,
                assemblyId, assemblyKind: 'facade-hvac-bank', visualTier: 'macro', color: 0x343b3d,
            }, 'facade-macro', index + 1);
        }
    }
    return true;
}

function emitRoofMechanicalMacro(opportunity, placements, request = {}) {
    const bounds = opportunity.bounds;
    if (!bounds) return false;
    const widthX = Math.max(0, finite(bounds.halfX) * 2);
    const widthZ = Math.max(0, finite(bounds.halfZ) * 2);
    if (widthX < 1.2 || widthZ < 1.2) return false;
    const rng = rngFor(`roof-macro-mechanical:${opportunity.id}:${request.semanticFamily ?? 'mechanical'}`);
    const family = String(request.semanticFamily ?? 'roof-mechanical');
    const baseY = finite(bounds.y) + 0.04;
    if (family === 'roof-antenna') {
        const assemblyId = `${opportunity.id}:roof-antenna`;
        const mastH = clamp(Math.max(widthX, widthZ) * 0.78, 2.4, 6.2);
        const mastRadius = clamp(Math.min(widthX, widthZ) * 0.045, 0.12, 0.26);
        pushPrimitive(placements, opportunity, {
            x: bounds.x, y: baseY, z: bounds.z, rotY: 0,
            shape: 'cylinder', sx: mastRadius, sy: mastH, sz: mastRadius,
            assemblyId, assemblyKind: 'roof-antenna-mast', visualTier: 'macro', color: 0x3d4547,
        }, 'roof-antenna-macro', 0);
        pushPrimitive(placements, opportunity, {
            x: bounds.x, y: baseY + mastH * 0.62, z: bounds.z, rotY: rng() * Math.PI,
            shape: 'box', sx: clamp(widthX * 0.44, 1.2, 3.6), sy: 0.12, sz: 0.12,
            assemblyId, assemblyKind: 'roof-antenna-mast', visualTier: 'macro', color: 0x515b5c,
        }, 'roof-antenna-macro', 1);
        pushPrimitive(placements, opportunity, {
            x: bounds.x + clamp(widthX * 0.24, 0.55, 1.8), y: baseY + mastH * 0.42, z: bounds.z, rotY: Math.PI * 0.5,
            shape: 'cone', sx: clamp(Math.min(widthX, widthZ) * 0.18, 0.38, 1.05), sy: 0.22, sz: clamp(Math.min(widthX, widthZ) * 0.18, 0.38, 1.05),
            assemblyId, assemblyKind: 'roof-antenna-dish', visualTier: 'macro', color: 0x707979,
        }, 'roof-antenna-macro', 2);
        return true;
    }
    const assemblyId = `${opportunity.id}:roof-hvac-cluster`;
    const bankW = clamp(widthX * 0.58, 1.2, 5.6);
    const bankD = clamp(widthZ * 0.52, 1.1, 4.6);
    const bankH = clamp(Math.min(bankW, bankD) * (0.44 + rng() * 0.18), 0.72, 2.2);
    pushPrimitive(placements, opportunity, {
        x: bounds.x, y: baseY, z: bounds.z, rotY: rng() < 0.5 ? 0 : Math.PI * 0.5,
        shape: 'box', sx: bankW, sy: bankH, sz: bankD,
        assemblyId, assemblyKind: 'roof-hvac-cluster', visualTier: 'macro', color: 0x626c6b,
    }, 'roof-mechanical-macro', 0);
    const fanRadius = clamp(Math.min(bankW, bankD) * 0.18, 0.24, 0.72);
    for (const [index, dx] of [-bankW * 0.23, bankW * 0.23].entries()) {
        pushPrimitive(placements, opportunity, {
            x: bounds.x + dx, y: baseY + bankH, z: bounds.z, rotY: 0,
            shape: 'cylinder', sx: fanRadius, sy: 0.18, sz: fanRadius,
            assemblyId, assemblyKind: 'roof-hvac-cluster', visualTier: 'macro', color: 0x3f4748,
        }, 'roof-mechanical-macro', index + 1);
    }
    if (Math.max(widthX, widthZ) >= 4.5) {
        const mastH = clamp(Math.max(widthX, widthZ) * 0.58, 1.8, 4.8);
        pushPrimitive(placements, opportunity, {
            x: bounds.x + bankW * 0.34, y: baseY + bankH, z: bounds.z + bankD * 0.34, rotY: 0,
            shape: 'cylinder', sx: 0.18, sy: mastH, sz: 0.18,
            assemblyId, assemblyKind: 'roof-hvac-cluster', visualTier: 'macro', color: 0x353b3c,
        }, 'roof-mechanical-macro', 3);
    }
    return true;
}

function emitGround(opportunity, placements) {
    const rng = rngFor(`ground:${opportunity.id}`);
    const budget = opportunity.clearanceBudget ?? {};
    const width = clamp(finite(budget.width, 0.8), 0.4, 3.5);
    const p = surfacePoint(opportunity, (rng() - 0.5) * Math.max(0, width - 0.4), 0, 0.06 + rng() * 0.10);
    const type = hash32(opportunity.id) % 5;
    const specs = [
        { shape: 'box', sx: 0.42, sy: 0.54, sz: 0.38 },
        { shape: 'cylinder', sx: 0.34, sy: 0.72, sz: 0.34 },
        { shape: 'box', sx: 0.62, sy: 0.92, sz: 0.30 },
        { shape: 'cone', sx: 0.28, sy: 0.58, sz: 0.28 },
        { shape: 'box', sx: 0.70, sy: 0.24, sz: 0.42 },
    ];
    pushPrimitive(placements, opportunity, { ...p, ...specs[type], rotY: p.rotY + (rng() - 0.5) * 0.35 }, opportunity.role === 'connector-service-zone' ? 'connector-service' : 'ground-edge-micro', 0);
}

function emitOpenGround(opportunity, placements) {
    const rng = rngFor(`open:${opportunity.id}`);
    const bounds = opportunity.bounds;
    if (!bounds) return;
    const count = clamp(Math.floor((bounds.halfX + bounds.halfZ) * 0.75), 1, 5);
    for (let i = 0; i < count; i++) {
        const x = bounds.x + (rng() - 0.5) * Math.max(0, bounds.halfX * 1.45);
        const z = bounds.z + (rng() - 0.5) * Math.max(0, bounds.halfZ * 1.45);
        const type = hash32(`${opportunity.id}:${i}`) % 4;
        const spec = type === 0 ? { shape: 'box', sx: 0.65, sy: 0.48, sz: 0.48 }
            : type === 1 ? { shape: 'cylinder', sx: 0.42, sy: 0.78, sz: 0.42 }
            : type === 2 ? { shape: 'box', sx: 0.95, sy: 0.18, sz: 0.42 }
            : { shape: 'cone', sx: 0.30, sy: 0.62, sz: 0.30 };
        pushPrimitive(placements, opportunity, { x, y: finite(bounds.y, 0), z, rotY: rng() * Math.PI * 2, ...spec }, 'ground-open', i);
    }
}

function emitRoof(opportunity, placements) {
    const rng = rngFor(`roof:${opportunity.id}`);
    const bounds = opportunity.bounds;
    if (!bounds) return;
    const area = Math.max(0.1, bounds.halfX * 2 * bounds.halfZ * 2);
    const count = clamp(Math.round(area / 11), 2, 8);
    const assemblyId = `${opportunity.id}:roof-utility`;
    for (let i = 0; i < count; i++) {
        const sx = 0.35 + rng() * Math.min(1.5, bounds.halfX * 0.65);
        const sz = 0.35 + rng() * Math.min(1.5, bounds.halfZ * 0.65);
        const sy = 0.24 + rng() * 0.82;
        const x = bounds.x + (rng() - 0.5) * Math.max(0, bounds.halfX * 1.45 - sx);
        const z = bounds.z + (rng() - 0.5) * Math.max(0, bounds.halfZ * 1.45 - sz);
        pushPrimitive(placements, opportunity, {
            x, y: finite(bounds.y) + 0.03, z, rotY: rng() * Math.PI,
            shape: rng() < 0.30 ? 'cylinder' : 'box', sx, sy, sz, assemblyId,
        }, 'roof-mechanical-detail', i);
    }
}

export function planExteriorPropFieldRequest({ chunk, payload, opportunity, request = {} } = {}) {
    if (!chunk || !payload || !opportunity) throw new Error('planExteriorPropFieldRequest requires chunk, payload, and opportunity');
    if (!isEligible(opportunity) || opportunity.spectacleReserved === true) return null;
    const placements = [];
    const desired = request.desiredScaleClass ?? 'medium';
    const tier = request.priorityTier ?? (desired === 'spectacle' ? 'spectacle' : desired === 'large' ? 'macro' : desired);

    if (opportunity.role === 'facade-spectacle-span' || opportunity.role === 'corner-media-band') {
        emitFacadeSpectacle(opportunity, placements);
    } else if (opportunity.role === 'roof-spectacle-envelope') {
        emitRoofSpectacle(opportunity, placements);
    } else if (opportunity.role === 'roof-utility-zone' && (desired === 'large' || desired === 'macro')) {
        emitRoofMechanicalMacro(opportunity, placements, request);
    } else if ((opportunity.role === 'facade-service-band' || opportunity.role === 'wall-mounted-prop-zone')
        && (desired === 'large' || desired === 'macro')) {
        emitFacadeMechanicalMacro(opportunity, placements, request);
    } else if (opportunity.role === 'roof-utility-zone') {
        // A refinement request gets one compact roof assembly; area never turns into
        // an implicit density multiplier.
        const bounds = opportunity.bounds;
        if (bounds) {
            const p = {
                x: bounds.x, y: finite(bounds.y) + 0.03, z: bounds.z, rotY: finite(opportunity.transform?.rotY),
                shape: 'box', sx: clamp(finite(bounds.halfX, 1) * 0.70, 0.55, 1.8), sy: 0.58,
                sz: clamp(finite(bounds.halfZ, 1) * 0.70, 0.55, 1.8),
                assemblyId: `${opportunity.id}:roof-utility-single`, assemblyKind: 'roof-utility-single', visualTier: tier,
            };
            pushPrimitive(placements, opportunity, p, 'roof-mechanical-detail', 0);
        }
    } else if (opportunity.role === 'ground-open-zone') {
        emitGround(opportunity, placements);
    } else if (['ground-edge-zone', 'portal-flank-ground-zone', 'connector-service-zone'].includes(opportunity.role)) {
        emitGround(opportunity, placements);
    } else {
        emitFacade(opportunity, placements);
    }

    const reservations = payload.semanticContext?.spatialTopology?.reservations ?? [];
    const safePlacements = reservations.length
        ? placements.filter(item => !reservations.some(reservation => placementIntersectsReservation(item, reservation)))
        : placements;
    if (!safePlacements.length) return null;
    for (const placement of safePlacements) {
        placement.visualTier = tier;
        placement.exteriorPlanOwner = request.planOwner ?? 'exterior-composition-authority';
        placement.exteriorReservationOwner = request.reservationOwner ?? request.planRequestId ?? opportunity.id;
    }
    const visualImpact = safePlacements.reduce((max, item) => Math.max(max, item.visualImpact || 0), 0);
    return {
        schema: 'jweb.semantic-exterior-field.v2',
        placements: safePlacements,
        stats: {
            schema: 'jweb.semantic-exterior-field.v2', semanticAuthority: true, plannerRequestOnly: true,
            requests: 1, opportunitiesConsumed: 1, generated: safePlacements.length,
            macroAssemblies: new Set(safePlacements.map(item => item.assemblyId).filter(Boolean)).size,
            drawBuckets: new Set(safePlacements.map(item => item.shape)).size, visualTier: tier, visualImpact,
        },
    };
}

// Compatibility batch wrapper: only explicit planner requests are accepted.
// Calling this with no requests cannot populate a facade or hardware lattice.
export function planExteriorPropField({ chunk, payload, requests = [] } = {}) {
    if (!chunk || !payload) throw new Error('planExteriorPropField requires chunk and payload');
    if (!Array.isArray(requests) || !requests.length) {
        return {
            schema: 'jweb.semantic-exterior-field.v2', placements: [],
            stats: { schema: 'jweb.semantic-exterior-field.v2', semanticAuthority: true, plannerRequestOnly: true, automaticPopulationDisabled: true, generated: 0, opportunitiesConsumed: 0, requests: 0, drawBuckets: 0 },
        };
    }
    const byId = new Map((payload.semanticContext?.opportunities ?? []).map(item => [item.id, item]));
    const placements = [];
    let consumed = 0;
    for (const request of requests) {
        const opportunity = request?.opportunity ?? byId.get(request?.opportunityId);
        if (!opportunity) continue;
        const planned = planExteriorPropFieldRequest({ chunk, payload, opportunity, request });
        if (!planned) continue;
        consumed++;
        placements.push(...planned.placements);
    }
    return {
        schema: 'jweb.semantic-exterior-field.v2', placements,
        stats: { schema: 'jweb.semantic-exterior-field.v2', semanticAuthority: true, plannerRequestOnly: true, automaticPopulationDisabled: true, requests: requests.length, opportunitiesConsumed: consumed, generated: placements.length, drawBuckets: new Set(placements.map(item => item.shape)).size },
    };
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
    const mediaPlaneGeometry = new THREE.PlaneGeometry(1, 1);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    function createMediaTexture(media, placement = null) {
        if (typeof document === 'undefined' || !media) return null;
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const recipe = resolveDisplayRecipe(recipeContextFromSemanticMedia(media, placement ?? {}));
        renderDisplayCanvas(ctx, canvas.width, canvas.height, {
            recipe,
            title: media.title,
            subtitle: media.subtitle,
            family: media.family,
            value: media.value?.label,
            serial: media.id,
        });
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function createMediaSegmentGeometry(segment) {
        const u0 = clamp(Number(segment?.u0 ?? 0), 0, 1);
        const rawU1 = clamp(Number(segment?.u1 ?? 1), 0, 1);
        const u1 = rawU1 > u0 ? rawU1 : 1;
        if (u0 <= 0.000001 && u1 >= 0.999999) return mediaPlaneGeometry;
        const geometry = mediaPlaneGeometry.clone();
        const uv = geometry.getAttribute?.('uv');
        const reverseU = segment?.reverseU === true;
        if (uv) {
            const span = u1 - u0;
            for (let i = 0; i < uv.count; i++) {
                const localU = uv.getX(i);
                uv.setX(i, reverseU ? u1 - localU * span : u0 + localU * span);
            }
            uv.needsUpdate = true;
        }
        geometry.userData = {
            ...(geometry.userData ?? {}),
            semanticMediaSegment: { u0, u1, reverseU, index: segment?.index ?? 0, count: segment?.count ?? 1 },
        };
        return geometry;
    }

    function makeTask(chunk, plan, placements, tier, entityId, ordinal, request = {}) {
        const visualImpact = placements.reduce((max, item) => Math.max(max, item.visualImpact || 0), 0);
        return {
            kind: 'exterior-prop-field', entityId: entityId || 'exterior-field:' + chunk.key,
            seed: hash32(worldSeed + ':' + chunk.key + ':semantic-exterior-prop-field:' + tier + ':' + entityId + ':' + ordinal),
            exteriorVisualTier: tier,
            exteriorVisualImpact: visualImpact,
            fieldPlan: {
                schema: plan.schema,
                placements,
                aggregateStats: plan.stats,
                stats: {
                    ...plan.stats,
                    generated: placements.length,
                    drawBuckets: new Set(placements.map(item => item.shape)).size,
                    visualTier: tier,
                    entityId: entityId ?? null,
                },
            },
            topologySolved: true, topologyAccepted: true, topologyDescriptors: [],
            exteriorPlanOwner: request.planOwner ?? 'exterior-composition-authority',
            exteriorReservationOwner: request.reservationOwner ?? request.planRequestId ?? placements[0]?.semanticOpportunityId ?? null,
            exteriorRequest: {
                semanticFamily: request.semanticFamily ?? 'primitive-fallback',
                desiredScaleClass: request.desiredScaleClass ?? tier,
                targetSurface: placements[0]?.role ?? null,
                priorityTier: request.priorityTier ?? tier,
                planRequestId: request.planRequestId ?? null,
            },
            semanticOpportunityId: placements[0]?.semanticOpportunityId ?? null,
            semanticHostId: placements[0]?.semanticHostId ?? null,
            semanticOpportunityRole: placements[0]?.role ?? null,
            semanticPlacement: placements[0] ? {
                x: placements[0].x, y: placements[0].y, z: placements[0].z, rotY: placements[0].rotY,
                mode: `field-opportunity:${placements[0].role}`,
                role: placements[0].role,
                opportunityId: placements[0].semanticOpportunityId,
                surfaceId: placements[0].surfaceId ?? null,
                connectorId: placements[0].connectorId ?? null,
                apertureId: placements[0].apertureId ?? null,
                reservationIds: [...(placements[0].reservationIds ?? [])],
            } : null,
            contextualCosmetic: true, exteriorPropField: true, semanticExteriorAuthority: true,
        };
    }

    function planRequestTask(chunk, payload, opportunity, request = {}) {
        const plan = planExteriorPropFieldRequest({ chunk, payload, opportunity, request });
        if (!plan?.placements?.length) return null;
        const tier = request.priorityTier ?? plan.placements[0]?.visualTier ?? exteriorOpportunityVisualTier(opportunity.role);
        const entityId = opportunity.entityId ?? opportunity.hostId ?? `exterior-field:${chunk.key}`;
        return makeTask(chunk, plan, plan.placements, tier, entityId, 0, request);
    }

    // Legacy population entry points are deliberately inert. Callers must submit
    // an explicit planner request + reserved opportunity through planRequestTask.
    function planTasks() { return []; }
    function planTask() { return null; }

    function realize(payload, task) {
        const placements = task?.fieldPlan?.placements ?? [];
        if (!placements.length) return null;
        const group = new THREE.Group();
        group.name = `chunk-semantic-exterior-field:${payload?.ownerId ?? task.entityId ?? 'chunk'}`;
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = 'exterior-prop-field';
        group.userData.semanticExteriorAuthority = true;
        group.userData.instanceCount = placements.length;
        group.userData.drawBucketCount = task.fieldPlan.stats.drawBuckets;
        group.userData.semanticOpportunityIds = [...new Set(placements.map(item => item.semanticOpportunityId))];

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
            mesh.userData.semanticExteriorAuthority = true;
            group.add(mesh);
        }

        const mediaPlacements = placements.filter(item => item?.media && item.shape === 'box' && /megascreen/i.test(String(item.assemblyKind ?? '')));
        const mediaGroups = new Map();
        for (const item of mediaPlacements) {
            const mediaId = String(item.media?.id ?? item.assemblyId ?? item.semanticOpportunityId ?? 'screen');
            const assembly = mediaGroups.get(mediaId) ?? [];
            assembly.push(item);
            mediaGroups.set(mediaId, assembly);
        }
        group.userData.mediaSurfaceCount = mediaPlacements.length;
        group.userData.mediaAssemblyCount = mediaGroups.size;
        group.userData.mediaDescriptorIds = [...mediaGroups.keys()];
        for (const [mediaId, assemblyPlacements] of mediaGroups) {
            const media = assemblyPlacements[0]?.media;
            const texture = createMediaTexture(media, assemblyPlacements[0]);
            if (!texture) continue;
            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
            payload?.detailResources?.textures?.add?.(texture);
            payload?.detailResources?.materials?.add?.(material);
            for (const item of assemblyPlacements) {
                const segmentGeometry = createMediaSegmentGeometry(item.mediaSegment);
                if (segmentGeometry !== mediaPlaneGeometry) payload?.detailResources?.geometries?.add?.(segmentGeometry);
                const panel = new THREE.Mesh(segmentGeometry, material);
                panel.name = group.name + ':media:' + mediaId + ':' + String(item.mediaSegment?.index ?? 0);
                const outwardX = -Math.sin(item.rotY);
                const outwardZ = -Math.cos(item.rotY);
                const offset = Math.max(0.015, item.sz * 0.5 + 0.012);
                panel.position.set(item.x + outwardX * offset, item.y + item.sy * 0.5, item.z + outwardZ * offset);
                panel.rotation.y = item.rotY + Math.PI;
                const seamAligned = item.mediaSegment?.seamAligned === true;
                panel.scale.set(item.sx * (seamAligned ? 1 : 0.94), item.sy * (seamAligned ? 1 : 0.90), 1);
                panel.userData.chunkCosmetic = true;
                panel.userData.detailKind = 'megascreen-media';
                panel.userData.semanticExteriorAuthority = true;
                panel.userData.media = media;
                panel.userData.mediaSegment = item.mediaSegment ?? null;
                group.add(panel);
            }
        }
        return group;
    }

    function disposeShared() {
        for (const geometry of geometries.values()) geometry.dispose?.();
        for (const material of materials.values()) material.dispose?.();
        mediaPlaneGeometry.dispose?.();
        geometries.clear(); materials.clear();
    }

    return Object.freeze({ planTask, planTasks, planRequestTask, realize, disposeShared });
}
