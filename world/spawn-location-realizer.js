import { attachScreenMedia, attachAudioMedia } from './screen-media-runtime.js';

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

function addPart(THREE, group, unitBox, material, scale, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.scale.set(Math.max(0.006, scale[0]), Math.max(0.006, scale[1]), Math.max(0.006, scale[2]));
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
}

function placementGroup(THREE, parent, placement) {
    const group = new THREE.Group();
    group.name = placement.instanceId;
    group.position.set(placement.transform.x, placement.transform.y, placement.transform.z);
    group.rotation.y = placement.transform.rotY || 0;
    group.userData = {
        ...(group.userData || {}),
        spawnInstanceId: placement.instanceId,
        spawnSlot: placement.slot,
        variantId: placement.variantId,
        familyId: placement.familyId,
    };
    parent.add(group);
    return group;
}

function addSupportProxy(THREE, parent, unitBox, material, placement) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    const id = placement.variantId ?? '';
    const topH = Math.max(0.055, Math.min(0.12, h * 0.13));

    if (/filing-cabinet|cooler/.test(id)) {
        addPart(THREE, group, unitBox, material, [w * 0.92, h * 0.88, d * 0.92], [0, -h * 0.03, 0]);
        addPart(THREE, group, unitBox, material, [w, topH, d], [0, h * 0.5 - topH * 0.5, 0]);
        addPart(THREE, group, unitBox, material, [w * 0.7, 0.025, 0.02], [0, 0.08, d * 0.47]);
        return group;
    }
    if (/cable-spool/.test(id)) {
        addPart(THREE, group, unitBox, material, [w, topH, d], [0, h * 0.5 - topH * 0.5, 0]);
        addPart(THREE, group, unitBox, material, [w * 0.38, h * 0.78, d * 0.38], [0, -h * 0.04, 0]);
        addPart(THREE, group, unitBox, material, [w * 0.84, topH, d * 0.84], [0, -h * 0.5 + topH * 0.5, 0]);
        return group;
    }

    addPart(THREE, group, unitBox, material, [w, topH, d], [0, h * 0.5 - topH * 0.5, 0]);
    const legW = Math.max(0.035, Math.min(0.075, w * 0.055));
    const legD = Math.max(0.035, Math.min(0.075, d * 0.085));
    const legH = Math.max(0.12, h - topH);
    const lx = Math.max(0, w * 0.5 - legW * 1.6);
    const lz = Math.max(0, d * 0.5 - legD * 1.6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        addPart(THREE, group, unitBox, material, [legW, legH, legD], [sx * lx, -topH * 0.5, sz * lz]);
    }
    if (placement.constructionRecipe === 'improvised-table') {
        addPart(THREE, group, unitBox, material, [w * 0.78, 0.045, 0.045], [0, -h * 0.08, 0]);
    }
    return group;
}

function addSeatProxy(THREE, parent, unitBox, material, placement) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    const tags = new Set(placement.tags ?? []);
    const id = placement.variantId ?? '';

    if (tags.has('soft') || /floor-cushion/.test(id)) {
        addPart(THREE, group, unitBox, material, [w, Math.max(0.08, h * 0.75), d], [0, 0, 0]);
        return group;
    }
    if (tags.has('crate') || tags.has('bucket')) {
        addPart(THREE, group, unitBox, material, [w * 0.92, h * 0.9, d * 0.92], [0, -h * 0.05, 0]);
        addPart(THREE, group, unitBox, material, [w, Math.max(0.035, h * 0.12), d], [0, h * 0.44, 0]);
        return group;
    }

    const seatH = Math.max(0.07, Math.min(0.13, h * 0.15));
    const seatY = -h * 0.08;
    addPart(THREE, group, unitBox, material, [w, seatH, d * 0.9], [0, seatY, 0]);
    const stool = tags.has('stool');
    const bench = tags.has('bench');
    if (!stool) {
        const backH = Math.max(0.18, h * (bench ? 0.48 : 0.55));
        addPart(THREE, group, unitBox, material, [w * 0.96, backH, Math.max(0.045, d * 0.10)],
            [0, seatY + seatH * 0.5 + backH * 0.5, -d * 0.43]);
    }
    const legH = Math.max(0.12, h * (stool ? 0.58 : 0.45));
    const legW = Math.max(0.03, Math.min(0.055, w * 0.08));
    const legD = Math.max(0.03, Math.min(0.055, d * 0.08));
    const lx = Math.max(0, w * 0.5 - legW * 1.5);
    const lz = Math.max(0, d * 0.5 - legD * 1.7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        addPart(THREE, group, unitBox, material, [legW, legH, legD], [sx * lx, seatY - legH * 0.5, sz * lz]);
    }
    return group;
}

function addTvProxy(THREE, parent, unitBox, bodyMaterial, screenMaterial, detailMaterial, placement, resources) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    const flat = (placement.tags ?? []).includes('lcd') || String(placement.variantId ?? '').includes('flat');
    const bodyDepth = flat ? Math.min(d, 0.22) : d;
    addPart(THREE, group, unitBox, bodyMaterial, [w, h, bodyDepth], [0, 0, 0]);
    if (!flat) addPart(THREE, group, unitBox, bodyMaterial, [w * 0.72, h * 0.72, d * 0.28], [0, h * 0.02, -d * 0.58]);
    addPart(THREE, group, unitBox, detailMaterial, [w * 0.5, Math.max(0.035, h * 0.08), Math.max(0.025, bodyDepth * 0.06)],
        [-w * 0.08, -h * 0.40, bodyDepth * 0.515]);
    if (!flat) {
        const footW = Math.max(0.05, w * 0.12);
        const footH = Math.max(0.03, h * 0.07);
        for (const sx of [-1, 1]) addPart(THREE, group, unitBox, detailMaterial, [footW, footH, d * 0.28], [sx * w * 0.3, -h * 0.52, 0]);
    }

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMaterial);
    const screenWidth = Math.max(0.12, w * (flat ? 0.90 : 0.78));
    const screenHeight = Math.max(0.10, h * (flat ? 0.82 : 0.62));
    screen.scale.set(screenWidth, screenHeight, 1);
    screen.position.set(0, h * (flat ? 0.02 : 0.035), bodyDepth * 0.505 + 0.004);
    group.add(screen);
    resources.geometries.push(screen.geometry);

    const ry = placement.transform.rotY || 0;
    const normalX = Math.sin(ry);
    const normalZ = Math.cos(ry);
    return {
        group,
        screen,
        socket: {
            schema: 'jweb.screen-socket.v1',
            id: `${placement.instanceId}:screen`,
            instanceId: placement.instanceId,
            role: 'television-screen',
            center: {
                x: placement.transform.x + normalX * (bodyDepth * 0.505 + 0.004),
                y: placement.transform.y + h * (flat ? 0.02 : 0.035),
                z: placement.transform.z + normalZ * (bodyDepth * 0.505 + 0.004),
            },
            width: screenWidth,
            height: screenHeight,
            normal: { x: normalX, y: 0, z: normalZ },
            up: { x: 0, y: 1, z: 0 },
            mesh: screen,
        },
    };
}

function addRadioProxy(THREE, parent, unitBox, bodyMaterial, detailMaterial, placement) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    addPart(THREE, group, unitBox, bodyMaterial, [w, h, d], [0, 0, 0]);
    addPart(THREE, group, unitBox, detailMaterial, [w * 0.48, h * 0.56, Math.max(0.018, d * 0.05)], [-w * 0.18, 0, d * 0.515]);
    for (let i = -2; i <= 2; i++) {
        addPart(THREE, group, unitBox, bodyMaterial, [w * 0.34, Math.max(0.008, h * 0.025), Math.max(0.008, d * 0.02)],
            [-w * 0.18, i * h * 0.07, d * 0.535]);
    }
    addPart(THREE, group, unitBox, detailMaterial, [w * 0.27, h * 0.18, Math.max(0.016, d * 0.05)], [w * 0.23, h * 0.14, d * 0.515]);
    addPart(THREE, group, unitBox, detailMaterial, [Math.max(0.018, w * 0.05), Math.max(0.025, h * 0.16), Math.max(0.018, d * 0.08)], [w * 0.31, -h * 0.20, d * 0.53]);
    addPart(THREE, group, unitBox, detailMaterial, [Math.max(0.012, w * 0.025), Math.max(0.12, h * 1.3), Math.max(0.012, d * 0.04)], [w * 0.36, h * 0.88, -d * 0.1]);
    return {
        group,
        socket: {
            schema: 'jweb.audio-socket.v1',
            id: `${placement.instanceId}:audio`,
            instanceId: placement.instanceId,
            role: 'radio-audio',
            center: { x: placement.transform.x, y: placement.transform.y + h * 0.15, z: placement.transform.z },
        },
    };
}

function addLightProxy(THREE, parent, unitBox, material, placement) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    addPart(THREE, group, unitBox, material, [Math.max(0.08, w * 0.45), Math.max(0.08, h * 0.58), Math.max(0.08, d * 0.45)], [0, -h * 0.18, 0]);
    addPart(THREE, group, unitBox, material, [w, Math.max(0.10, h * 0.25), d], [0, h * 0.28, 0]);
    return group;
}

function addDetailProxy(THREE, parent, unitBox, material, accentMaterial, placement) {
    const group = placementGroup(THREE, parent, placement);
    const [w, h, d] = placement.dimensionsM;
    if (placement.slot === 'softening') {
        addPart(THREE, group, unitBox, material, [w, Math.max(0.012, h), d], [0, 0, 0]);
        return group;
    }
    if (placement.slot === 'plant-softener') {
        addPart(THREE, group, unitBox, material, [w * 0.62, Math.max(0.10, h * 0.34), d * 0.62], [0, -h * 0.33, 0]);
        addPart(THREE, group, unitBox, accentMaterial, [Math.max(0.025, w * 0.08), h * 0.48, Math.max(0.025, d * 0.08)], [0, h * 0.05, 0]);
        addPart(THREE, group, unitBox, accentMaterial, [w * 0.6, Math.max(0.035, h * 0.08), d * 0.22], [0, h * 0.28, 0]);
        return group;
    }
    if (placement.slot === 'roof-credibility') {
        addPart(THREE, group, unitBox, material, [w * 0.92, h * 0.78, d * 0.92], [0, -h * 0.08, 0]);
        addPart(THREE, group, unitBox, accentMaterial, [w, Math.max(0.035, h * 0.10), d], [0, h * 0.36, 0]);
        return group;
    }
    addPart(THREE, group, unitBox, material, [w, h, d], [0, 0, 0]);
    addPart(THREE, group, unitBox, accentMaterial, [Math.max(0.02, w * 0.72), Math.max(0.008, h * 0.10), Math.max(0.008, d * 0.06)], [0, h * 0.18, d * 0.52]);
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

function detachRoot(scene, root) {
    if (!root) return;
    if (typeof scene?.remove === 'function') {
        scene.remove(root);
        return;
    }
    const parent = root.parent ?? scene;
    if (Array.isArray(parent?.children)) {
        const index = parent.children.indexOf(root);
        if (index >= 0) parent.children.splice(index, 1);
    }
    root.parent = null;
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
        spawnStartProfile: plan.startProfile?.id ?? null,
        spawnMediaKind: plan.mediaKind ?? null,
        spawnHostArchetype: plan.hostArchetype ?? hostSpace.hostArchetype ?? null,
    };

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4442, roughness: 0.84, metalness: 0.16 });
    const mediaMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1c1d, roughness: 0.62, metalness: 0.24 });
    const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x07090a, emissive: 0x0a1114, emissiveIntensity: 0.35, roughness: 0.25 });
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4b42, roughness: 0.92 });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xc7a46c, emissive: 0x8a5d27, emissiveIntensity: 0.68, roughness: 0.58 });
    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x64605a, roughness: 0.88, metalness: 0.08 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x343837, roughness: 0.72, metalness: 0.18 });
    const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x596a4b, roughness: 0.94 });
    const resources = {
        geometries: [unitBox],
        materials: [supportMaterial, mediaMaterial, screenMaterial, seatMaterial, lightMaterial, detailMaterial, accentMaterial, greenMaterial],
    };
    const screenSockets = [];
    const audioSockets = [];
    const colliders = [];

    for (const placement of plan.placements) {
        if (placement.slot === 'tv-support') {
            addSupportProxy(THREE, root, unitBox, supportMaterial, placement);
            colliders.push(colliderFromPlacement(placement, hostSpace.surfaceY));
        } else if (placement.slot === 'primary-tv') {
            if (placement.familyId === 'spawn.media.radio') {
                const radio = addRadioProxy(THREE, root, unitBox, mediaMaterial, accentMaterial, placement);
                audioSockets.push(radio.socket);
            } else {
                const tv = addTvProxy(THREE, root, unitBox, mediaMaterial, screenMaterial, accentMaterial, placement, resources);
                screenSockets.push(tv.socket);
            }
        } else if (placement.slot === 'seating') {
            addSeatProxy(THREE, root, unitBox, seatMaterial, placement);
            colliders.push(colliderFromPlacement(placement, hostSpace.surfaceY));
        } else if (placement.slot === 'warm-practical') {
            addLightProxy(THREE, root, unitBox, lightMaterial, placement);
        } else if (placement.slot === 'plant-softener') {
            addDetailProxy(THREE, root, unitBox, detailMaterial, greenMaterial, placement);
        } else {
            addDetailProxy(THREE, root, unitBox, detailMaterial, accentMaterial, placement);
        }
    }

    scene.add(root);
    if (Array.isArray(propColliders)) propColliders.push(...colliders);
    freezeObject(root);

    let mediaController = null;
    if (screenSockets.length) {
        try {
            mediaController = attachScreenMedia({
                THREE,
                camera,
                sockets: screenSockets,
                mediaIntent: boundLocation?.composition?.media ?? null,
            });
        } catch (error) {
            console.warn?.('[spawn-location] screen media attachment failed; keeping physical hangout with fallback screen', error);
        }
    } else if (audioSockets.length) {
        try {
            mediaController = attachAudioMedia({
                THREE,
                camera,
                sockets: audioSockets,
                mediaIntent: boundLocation?.composition?.media ?? null,
            });
        } catch (error) {
            console.warn?.('[spawn-location] radio audio attachment failed; keeping physical radio silent', error);
        }
    }

    let disposed = false;
    const realization = {
        schema: 'jweb.spawn-location-realization.v2',
        locationId: boundLocation.locationId,
        hostSpaceId: hostSpace.spaceId,
        hostArchetype: plan.hostArchetype ?? hostSpace.hostArchetype ?? null,
        startProfile: plan.startProfile?.id ?? null,
        mediaKind: plan.mediaKind ?? (screenSockets.length ? 'television' : (audioSockets.length ? 'radio' : 'none')),
        root,
        screenSockets,
        audioSockets,
        mediaController,
        reservationsInstalled,
        colliders,
        colliderCount: colliders.length,
        resources,
        dispose() {
            if (disposed) return;
            disposed = true;
            mediaController?.dispose?.();
            if (Array.isArray(propColliders)) {
                for (const collider of colliders) {
                    const index = propColliders.indexOf(collider);
                    if (index >= 0) propColliders.splice(index, 1);
                }
            }
            detachRoot(scene, root);
            for (const geometry of resources.geometries) geometry?.dispose?.();
            for (const material of resources.materials) material?.dispose?.();
            if (typeof window !== 'undefined' && window.__spawnLocationRealization === realization) {
                window.__spawnLocationRealization = null;
            }
        },
    };
    if (typeof window !== 'undefined') {
        window.__spawnLocationRealization = realization;
        try { window.dispatchEvent(new CustomEvent('jweb:spawn-location-realized', { detail: realization })); }
        catch (_) { /* Event publication is optional; physical realization is not. */ }
    }
    return realization;
}
