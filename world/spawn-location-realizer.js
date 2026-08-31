import { attachScreenMedia } from './screen-media-runtime.js';

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function iterablePayloadEntries(input) {
    if (!input) return [];
    if (input instanceof Map) return [...input.entries()];
    if (Array.isArray(input)) return input.map((value, index) => [String(index), value]);
    if (typeof input[Symbol.iterator] === 'function') return [...input];
    return Object.entries(input);
}

function findHostPayload(fabricPayloads, hostSpace) {
    if (!hostSpace) return null;
    if (fabricPayloads instanceof Map && fabricPayloads.has(hostSpace.payloadKey)) {
        return fabricPayloads.get(hostSpace.payloadKey);
    }
    for (const [key, payload] of iterablePayloadEntries(fabricPayloads)) {
        if (String(key) === String(hostSpace.payloadKey)) return payload;
        if (payload?.entity?.id && payload.entity.id === hostSpace.entityId) return payload;
    }
    return null;
}

function installReservations(payload, plan) {
    if (!payload?.physics || !plan?.reservations) return 0;
    const list = payload.physics.circulationReservations ?? (payload.physics.circulationReservations = []);
    let added = 0;
    for (const reservation of plan.reservations) {
        if (!reservation?.id || list.some(existing => existing?.id === reservation.id)) continue;
        list.push({ ...reservation, source: reservation.source ?? 'spawn-spatial-plan' });
        added++;
    }
    return added;
}

function freezeObject(root) {
    root.updateMatrixWorld?.(true);
    root.traverse?.(object => {
        object.updateMatrix?.();
        object.matrixAutoUpdate = false;
        if ('matrixWorldAutoUpdate' in object) object.matrixWorldAutoUpdate = false;
    });
}

function addBox(THREE, parent, unitBox, material, placement, { scale = [1, 1, 1], offset = [0, 0, 0] } = {}) {
    const mesh = new THREE.Mesh(unitBox, material);
    const dims = placement.dimensionsM;
    mesh.scale.set(dims[0] * scale[0], dims[1] * scale[1], dims[2] * scale[2]);
    mesh.position.set(
        placement.transform.x + offset[0],
        placement.transform.y + offset[1],
        placement.transform.z + offset[2]
    );
    mesh.rotation.y = placement.transform.rotY || 0;
    mesh.userData = {
        ...(mesh.userData || {}),
        spawnInstanceId: placement.instanceId,
        spawnSlot: placement.slot,
        variantId: placement.variantId,
    };
    parent.add(mesh);
    return mesh;
}

function addSeatProxy(THREE, parent, unitBox, seatMaterial, placement) {
    const group = new THREE.Group();
    group.name = placement.instanceId;
    group.position.set(placement.transform.x, placement.transform.y - placement.dimensionsM[1] * 0.5, placement.transform.z);
    group.rotation.y = placement.transform.rotY || 0;
    const [w, h, d] = placement.dimensionsM;
    const seat = new THREE.Mesh(unitBox, seatMaterial);
    seat.scale.set(w, Math.max(0.10, h * 0.14), d * 0.92);
    seat.position.set(0, h * 0.47, 0);
    group.add(seat);
    const back = new THREE.Mesh(unitBox, seatMaterial);
    back.scale.set(w, Math.max(0.18, h * 0.56), Math.max(0.08, d * 0.12));
    back.position.set(0, h * 0.72, -d * 0.42);
    group.add(back);
    parent.add(group);
    return group;
}

function addTvProxy(THREE, parent, unitBox, bodyMaterial, screenMaterial, placement) {
    const group = new THREE.Group();
    group.name = placement.instanceId;
    group.position.set(placement.transform.x, placement.transform.y, placement.transform.z);
    group.rotation.y = placement.transform.rotY || 0;
    const [w, h, d] = placement.dimensionsM;
    const body = new THREE.Mesh(unitBox, bodyMaterial);
    body.scale.set(w, h, d);
    group.add(body);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMaterial);
    const screenWidth = Math.max(0.12, w * 0.78);
    const screenHeight = Math.max(0.10, h * 0.62);
    screen.scale.set(screenWidth, screenHeight, 1);
    screen.position.set(0, h * 0.035, d * 0.505 + 0.004);
    group.add(screen);
    parent.add(group);

    const ry = placement.transform.rotY || 0;
    const normalX = Math.sin(ry);
    const normalZ = Math.cos(ry);
    const center = {
        x: placement.transform.x + normalX * (d * 0.505 + 0.004),
        y: placement.transform.y + h * 0.035,
        z: placement.transform.z + normalZ * (d * 0.505 + 0.004),
    };
    return {
        group,
        screen,
        socket: {
            schema: 'jweb.screen-socket.v1',
            id: `${placement.instanceId}:screen`,
            instanceId: placement.instanceId,
            role: 'television-screen',
            center,
            width: screenWidth,
            height: screenHeight,
            normal: { x: normalX, y: 0, z: normalZ },
            up: { x: 0, y: 1, z: 0 },
            mesh: screen,
        },
    };
}

function addLightProxy(THREE, parent, unitBox, material, placement) {
    const group = new THREE.Group();
    group.name = placement.instanceId;
    group.position.set(placement.transform.x, placement.transform.y - placement.dimensionsM[1] * 0.5, placement.transform.z);
    group.rotation.y = placement.transform.rotY || 0;
    const [w, h, d] = placement.dimensionsM;
    const base = new THREE.Mesh(unitBox, material);
    base.scale.set(Math.max(0.08, w * 0.45), Math.max(0.08, h * 0.58), Math.max(0.08, d * 0.45));
    base.position.y = h * 0.29;
    group.add(base);
    const glow = new THREE.Mesh(unitBox, material);
    glow.scale.set(w, Math.max(0.10, h * 0.25), d);
    glow.position.y = h * 0.78;
    group.add(glow);
    parent.add(group);
    return group;
}

function colliderFromPlacement(placement, surfaceY) {
    const [w, h, d] = placement.dimensionsM;
    return {
        x: placement.transform.x,
        z: placement.transform.z,
        radius: Math.max(0.14, Math.min(w, d) * 0.42),
        yMin: surfaceY,
        height: surfaceY + h,
        supportKind: 'spawn-semantic-prop',
        spawnInstanceId: placement.instanceId,
    };
}

export function realizeSpawnLocation({
    THREE,
    scene,
    camera = null,
    boundLocation,
    fabricPayloads,
    propColliders = null,
} = {}) {
    const plan = boundLocation?.spatialPlan;
    const hostSpace = boundLocation?.hostSpace;
    if (!THREE || !scene || !plan || !hostSpace || !plan.ready) return null;
    const payload = findHostPayload(fabricPayloads, hostSpace);
    if (!payload) return null;

    const reservationsInstalled = installReservations(payload, plan);
    const root = new THREE.Group();
    root.name = `spawn-location:${boundLocation.locationId}`;
    root.userData = {
        ...(root.userData || {}),
        spawnLocationId: boundLocation.locationId,
        spawnHostSpaceId: hostSpace.spaceId,
        spawnSpatialPlanSchema: plan.schema,
    };

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4442, roughness: 0.84, metalness: 0.16 });
    const tvMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1c1d, roughness: 0.62, metalness: 0.24 });
    const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x07090a, emissive: 0x0a1114, emissiveIntensity: 0.35, roughness: 0.25 });
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4b42, roughness: 0.92 });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xc7a46c, emissive: 0x8a5d27, emissiveIntensity: 0.68, roughness: 0.58 });
    const resources = { geometries: [unitBox], materials: [supportMaterial, tvMaterial, screenMaterial, seatMaterial, lightMaterial] };
    const screenSockets = [];
    const colliders = [];

    for (const placement of plan.placements) {
        if (placement.slot === 'tv-support') {
            addBox(THREE, root, unitBox, supportMaterial, placement);
            colliders.push(colliderFromPlacement(placement, hostSpace.surfaceY));
        } else if (placement.slot === 'primary-tv') {
            const tv = addTvProxy(THREE, root, unitBox, tvMaterial, screenMaterial, placement);
            screenSockets.push(tv.socket);
            resources.geometries.push(tv.screen.geometry);
        } else if (placement.slot === 'seating') {
            addSeatProxy(THREE, root, unitBox, seatMaterial, placement);
            colliders.push(colliderFromPlacement(placement, hostSpace.surfaceY));
        } else if (placement.slot === 'warm-practical') {
            addLightProxy(THREE, root, unitBox, lightMaterial, placement);
        }
    }

    scene.add(root);
    if (Array.isArray(propColliders)) propColliders.push(...colliders);
    freezeObject(root);

    const mediaController = attachScreenMedia({
        THREE,
        camera,
        sockets: screenSockets,
        mediaIntent: boundLocation?.composition?.media ?? null,
    });

    const realization = {
        schema: 'jweb.spawn-location-realization.v1',
        locationId: boundLocation.locationId,
        hostSpaceId: hostSpace.spaceId,
        root,
        screenSockets,
        mediaController,
        reservationsInstalled,
        colliders,
        colliderCount: colliders.length,
        resources,
    };
    if (typeof window !== 'undefined') {
        window.__spawnLocationRealization = realization;
        try { window.dispatchEvent(new CustomEvent('jweb:spawn-location-realized', { detail: realization })); }
        catch (_) { /* Event publication is optional; physical realization is not. */ }
    }
    return realization;
}
