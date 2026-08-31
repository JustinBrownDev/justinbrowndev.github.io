// Semantic-only exterior field. This module is deliberately a consumer of
// semantic opportunities; it is not allowed to discover facade/roof/portal
// geometry independently.

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
        'roof-utility-zone',
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
        spatialTopologyHostId: opportunity.spatialTopologyHostId ?? opportunity.connectorId ?? opportunity.surfaceId ?? null,
        connectorId: opportunity.connectorId ?? null,
        apertureId: opportunity.apertureId ?? null,
        reservationIds: [...(opportunity.reservationIds ?? [])],
        surfaceId: opportunity.surfaceId ?? null,
        entityId: opportunity.entityId ?? null,
        role: opportunity.role,
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
    });
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

export function planExteriorPropField({ chunk, payload } = {}) {
    if (!chunk || !payload) throw new Error('planExteriorPropField requires chunk and payload');
    const opportunities = (payload.semanticContext?.opportunities ?? [])
        .filter(isEligible)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const placements = [];
    const claimed = new Set();
    for (const opportunity of opportunities) {
        if (claimed.has(opportunity.id)) continue;
        claimed.add(opportunity.id);
        if (opportunity.role === 'roof-utility-zone') emitRoof(opportunity, placements);
        else if (opportunity.role === 'ground-open-zone') emitOpenGround(opportunity, placements);
        else if (['ground-edge-zone', 'portal-flank-ground-zone', 'connector-service-zone'].includes(opportunity.role)) emitGround(opportunity, placements);
        else emitFacade(opportunity, placements);
    }

    const reservations = payload.semanticContext?.spatialTopology?.reservations ?? [];
    const safePlacements = reservations.length
        ? placements.filter(item => !reservations.some(reservation => placementIntersectsReservation(item, reservation)))
        : placements;
    const facade = safePlacements.filter(item => item.domain === 'facade-infrastructure' || item.domain === 'facade-macro' || item.domain === 'portal-hardware');
    const macro = safePlacements.filter(item => item.domain === 'facade-macro');
    const ground = safePlacements.filter(item => item.domain === 'ground-edge-micro' || item.domain === 'connector-service' || item.domain === 'ground-open');
    const roof = safePlacements.filter(item => item.domain === 'roof-mechanical-detail');
    const facadeMeters = (payload.semanticContext?.surfaces ?? []).reduce((sum, surface) => sum + Math.max(0, finite(surface.half) * 2), 0);
    const stats = {
        schema: 'jweb.semantic-exterior-field.v1',
        semanticAuthority: true,
        generated: safePlacements.length,
        opportunitiesConsumed: claimed.size,
        facadeInfrastructure: facade.length,
        facadeMacroAssemblies: new Set(macro.map(item => item.assemblyId).filter(Boolean)).size,
        macroAssemblies: new Set(placements.map(item => item.assemblyId).filter(Boolean)).size,
        macroPrimitives: macro.length + roof.length,
        microClutter: ground.length,
        groundEdge: ground.length,
        roofEdge: roof.length,
        roofMechanicalAssemblies: new Set(roof.map(item => item.assemblyId).filter(Boolean)).size,
        facadeCategoryCount: new Set(facade.map(item => item.domain)).size,
        drawBuckets: new Set(safePlacements.map(item => item.shape)).size,
        physicalDensityNormalized: true,
        groundPerFacadeMeter: facadeMeters > 0 ? ground.length / facadeMeters : 0,
        visibleFacadePerFacadeMeter: facadeMeters > 0 ? facade.length / facadeMeters : 0,
    };
    return { schema: stats.schema, placements: safePlacements, stats };
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
            kind: 'exterior-prop-field', entityId: `exterior-field:${chunk.key}`,
            seed: hash32(`${worldSeed}:${chunk.key}:semantic-exterior-prop-field`),
            fieldPlan: plan, topologySolved: true, topologyAccepted: true,
            topologyDescriptors: [], contextualCosmetic: true, exteriorPropField: true,
            semanticExteriorAuthority: true,
        };
    }

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
        return group;
    }

    function disposeShared() {
        for (const geometry of geometries.values()) geometry.dispose?.();
        for (const material of materials.values()) material.dispose?.();
        geometries.clear(); materials.clear();
    }

    return Object.freeze({ planTask, realize, disposeShared });
}
