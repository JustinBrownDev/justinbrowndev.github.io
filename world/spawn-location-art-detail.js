const ART_SCHEMA = 'jweb.spawn-location-art-detail.v1';
const DEFAULT_PART_BUDGET = 132;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function dimsOf(placement) {
    const dims = Array.isArray(placement?.dimensionsM) ? placement.dimensionsM : [];
    return [
        Math.max(0.04, finite(dims[0], 0.4)),
        Math.max(0.025, finite(dims[1], 0.3)),
        Math.max(0.04, finite(dims[2], 0.4)),
    ];
}

function findPlacementGroup(root, instanceId) {
    if (!root || !instanceId || !Array.isArray(root.children)) return null;
    return root.children.find(child => child?.name === instanceId || child?.userData?.spawnInstanceId === instanceId) ?? null;
}

function material(THREE, values, resources) {
    const result = new THREE.MeshStandardMaterial(values);
    resources?.materials?.push?.(result);
    return result;
}

function makePalette(THREE, resources) {
    return {
        darkMetal: material(THREE, { color: 0x24292a, roughness: 0.82, metalness: 0.34 }, resources),
        wornMetal: material(THREE, { color: 0x5d5650, roughness: 0.86, metalness: 0.22 }, resources),
        wood: material(THREE, { color: 0x5a4635, roughness: 0.94, metalness: 0.02 }, resources),
        cloth: material(THREE, { color: 0x4b5360, roughness: 0.98, metalness: 0 }, resources),
        warm: material(THREE, { color: 0xd3aa70, emissive: 0x7a4b1d, emissiveIntensity: 0.62, roughness: 0.62 }, resources),
        green: material(THREE, { color: 0x45583f, roughness: 0.96, metalness: 0 }, resources),
        glass: material(THREE, { color: 0x9eada7, emissive: 0x25352f, emissiveIntensity: 0.22, roughness: 0.2, metalness: 0.02, transparent: true, opacity: 0.42, depthWrite: false }, resources),
        paper: material(THREE, { color: 0xb4aa92, roughness: 0.98, metalness: 0 }, resources),
    };
}

function makeContext({ THREE, resources, partBudget = DEFAULT_PART_BUDGET, plan = null }) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    resources?.geometries?.push?.(box);
    return {
        THREE,
        box,
        palette: makePalette(THREE, resources),
        partBudget: Math.max(24, finite(partBudget, DEFAULT_PART_BUDGET)),
        partCount: 0,
        profileId: plan?.startProfile?.id ?? null,
        spawnProgressionRank: Number(plan?.startProfile?.progressionRank ?? 0),
        detailedInstances: 0,
        replacedProxyInstances: 0,
    };
}

function part(ctx, group, materialRef, scale, position = [0, 0, 0], rotation = null) {
    if (!group || ctx.partCount >= ctx.partBudget) return null;
    const mesh = new ctx.THREE.Mesh(ctx.box, materialRef);
    mesh.scale.set(
        Math.max(0.006, finite(scale?.[0], 0.02)),
        Math.max(0.006, finite(scale?.[1], 0.02)),
        Math.max(0.006, finite(scale?.[2], 0.02)),
    );
    mesh.position.set(finite(position?.[0]), finite(position?.[1]), finite(position?.[2]));
    if (rotation) {
        if (Number.isFinite(rotation[0])) mesh.rotation.x = rotation[0];
        if (Number.isFinite(rotation[1])) mesh.rotation.y = rotation[1];
        if (Number.isFinite(rotation[2])) mesh.rotation.z = rotation[2];
    }
    mesh.userData = { ...(mesh.userData || {}), spawnArtDetail: true };
    group.add(mesh);
    ctx.partCount++;
    return mesh;
}

function barBetweenXY(ctx, group, materialRef, a, b, thickness, depth) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.max(0.01, Math.hypot(dx, dy));
    return part(
        ctx,
        group,
        materialRef,
        [length, thickness, depth],
        [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5],
        [0, 0, Math.atan2(dy, dx)],
    );
}

function hideBaseMeshes(group) {
    if (!group || !Array.isArray(group.children)) return 0;
    let hidden = 0;
    for (const child of [...group.children]) {
        if (!child || child?.userData?.spawnArtDetail) continue;
        if ('visible' in child) child.visible = false;
        else child.visible = false;
        child.userData = { ...(child.userData || {}), spawnArtBaseHidden: true };
        hidden++;
    }
    return hidden;
}

function supportDetail(ctx, group, placement) {
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '');
    const p = ctx.palette;
    const topY = h * 0.5 - Math.max(0.055, Math.min(0.12, h * 0.13));

    if (/cinderblock-plank/.test(id)) {
        hideBaseMeshes(group);
        ctx.replacedProxyInstances++;
        for (const sx of [-1, 1]) {
            part(ctx, group, p.wornMetal, [w * 0.22, h * 0.26, d * 0.72], [sx * w * 0.33, -h * 0.28, 0]);
            part(ctx, group, p.wornMetal, [w * 0.22, h * 0.22, d * 0.72], [sx * w * 0.33, -h * 0.03, 0]);
        }
        part(ctx, group, p.wood, [w * 1.02, 0.055, d * 0.96], [0, h * 0.47, 0]);
        return;
    }
    if (/plywood-crates/.test(id)) {
        hideBaseMeshes(group);
        ctx.replacedProxyInstances++;
        for (const sx of [-1, 1]) {
            const x = sx * w * 0.31;
            part(ctx, group, p.darkMetal, [w * 0.25, h * 0.5, 0.035], [x, -h * 0.18, d * 0.39]);
            part(ctx, group, p.darkMetal, [w * 0.25, 0.035, d * 0.72], [x, -h * 0.38, 0]);
        }
        part(ctx, group, p.wood, [w * 1.03, 0.05, d * 0.98], [0, h * 0.48, 0]);
        return;
    }
    if (/filing-cabinet/.test(id)) {
        for (const y of [-0.16, 0.08, 0.30]) {
            part(ctx, group, p.darkMetal, [w * 0.72, 0.018, 0.022], [0, h * y, d * 0.47]);
        }
        part(ctx, group, p.wornMetal, [w * 0.26, 0.026, 0.03], [0, h * 0.12, d * 0.49]);
        return;
    }
    if (/cooler/.test(id)) {
        part(ctx, group, p.paper, [w * 0.82, 0.025, d * 0.78], [0, h * 0.48, 0]);
        part(ctx, group, p.darkMetal, [w * 0.13, h * 0.18, 0.025], [w * 0.34, h * 0.12, d * 0.47]);
        return;
    }
    if (/cable-spool/.test(id)) {
        for (const y of [-h * 0.42, h * 0.42]) {
            part(ctx, group, p.wood, [w * 0.9, 0.035, d * 0.12], [0, y, 0]);
            part(ctx, group, p.wood, [w * 0.12, 0.035, d * 0.9], [0, y, 0]);
        }
        return;
    }
    if (/sawhorse/.test(id)) {
        hideBaseMeshes(group);
        ctx.replacedProxyInstances++;
        part(ctx, group, p.wood, [w * 1.02, 0.055, d * 0.96], [0, h * 0.46, 0]);
        for (const z of [-d * 0.32, d * 0.32]) {
            barBetweenXY(ctx, group, p.wornMetal, [-w * 0.34, -h * 0.46, z], [-w * 0.14, topY, z], 0.035, 0.035);
            barBetweenXY(ctx, group, p.wornMetal, [w * 0.34, -h * 0.46, z], [w * 0.14, topY, z], 0.035, 0.035);
        }
        return;
    }

    part(ctx, group, p.darkMetal, [w * 0.72, 0.035, 0.035], [0, -h * 0.12, 0]);
    for (const z of [-d * 0.34, d * 0.34]) {
        barBetweenXY(ctx, group, p.wornMetal, [-w * 0.36, -h * 0.43, z], [w * 0.36, h * 0.29, z], 0.026, 0.026);
    }
}

function seatDetail(ctx, group, placement) {
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '');
    const tags = new Set(placement.tags ?? []);
    const p = ctx.palette;

    if (/floor-cushion/.test(id) || tags.has('soft')) {
        part(ctx, group, p.cloth, [w * 0.82, 0.022, d * 0.055], [0, h * 0.39, d * 0.44]);
        part(ctx, group, p.cloth, [0.022, h * 0.05, d * 0.82], [w * 0.44, h * 0.36, 0]);
        return;
    }
    if (/milk-crate/.test(id) || tags.has('crate')) {
        for (const x of [-w * 0.25, 0, w * 0.25]) part(ctx, group, p.darkMetal, [0.024, h * 0.52, 0.02], [x, -h * 0.05, d * 0.47]);
        for (const y of [-h * 0.22, h * 0.08]) part(ctx, group, p.darkMetal, [w * 0.72, 0.024, 0.02], [0, y, d * 0.47]);
        return;
    }
    if (/bucket/.test(id) || tags.has('bucket')) {
        part(ctx, group, p.wornMetal, [w * 0.88, 0.028, d * 0.88], [0, h * 0.45, 0]);
        part(ctx, group, p.darkMetal, [w * 0.72, 0.018, 0.018], [0, h * 0.02, d * 0.46]);
        return;
    }
    if (/car-seat/.test(id)) {
        part(ctx, group, p.cloth, [w * 0.46, h * 0.22, d * 0.23], [0, h * 0.50, -d * 0.35]);
        for (const sx of [-1, 1]) part(ctx, group, p.cloth, [w * 0.13, h * 0.36, d * 0.14], [sx * w * 0.42, h * 0.05, -d * 0.18]);
        return;
    }
    if (/office-task/.test(id) || tags.has('rolling')) {
        part(ctx, group, p.darkMetal, [0.05, h * 0.5, 0.05], [0, -h * 0.23, 0]);
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5;
            part(ctx, group, p.darkMetal, [w * 0.32, 0.035, 0.035], [Math.cos(a) * w * 0.16, -h * 0.47, Math.sin(a) * d * 0.16], [0, -a, 0]);
        }
        return;
    }
    if (tags.has('stool')) {
        for (const z of [-d * 0.32, d * 0.32]) part(ctx, group, p.wornMetal, [w * 0.62, 0.026, 0.026], [0, -h * 0.22, z]);
        for (const x of [-w * 0.32, w * 0.32]) part(ctx, group, p.wornMetal, [0.026, 0.026, d * 0.62], [x, -h * 0.22, 0]);
        return;
    }
    if (/pallet-bench|wood-bench/.test(id) || tags.has('bench')) {
        for (const y of [h * 0.04, h * 0.20, h * 0.36]) part(ctx, group, p.wood, [w * 0.84, 0.045, 0.035], [0, y, -d * 0.48]);
        for (const z of [-d * 0.22, d * 0.22]) part(ctx, group, p.wood, [w * 0.82, 0.035, 0.045], [0, -h * 0.03, z]);
        return;
    }
    if (/folding/.test(id) || tags.has('folding')) {
        for (const z of [-d * 0.35, d * 0.35]) {
            barBetweenXY(ctx, group, p.wornMetal, [-w * 0.34, -h * 0.43, z], [w * 0.22, h * 0.08, z], 0.025, 0.025);
            barBetweenXY(ctx, group, p.wornMetal, [w * 0.34, -h * 0.43, z], [-w * 0.22, h * 0.08, z], 0.025, 0.025);
        }
        return;
    }

    for (const x of [-w * 0.30, 0, w * 0.30]) part(ctx, group, p.wornMetal, [0.025, h * 0.34, 0.025], [x, h * 0.25, -d * 0.47]);
    if (/monobloc/.test(id) || tags.has('patio')) {
        for (const sx of [-1, 1]) part(ctx, group, p.wornMetal, [0.035, 0.035, d * 0.56], [sx * w * 0.46, h * 0.06, -d * 0.03]);
    }
}

function mediaDetail(ctx, group, placement) {
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '');
    const tags = new Set(placement.tags ?? []);
    const p = ctx.palette;
    const isLaptop = tags.has('laptop') || /laptop/.test(id) || ctx.profileId === 'small-tv-roof';
    if (isLaptop) {
        const keyboardD = Math.max(0.24, w * 0.62);
        part(ctx, group, p.darkMetal, [w * 0.96, 0.035, keyboardD], [0, -h * 0.46, keyboardD * 0.46]);
        part(ctx, group, p.wornMetal, [w * 0.86, 0.018, keyboardD * 0.56], [0, -h * 0.435, keyboardD * 0.46]);
        for (let row = 0; row < 3; row++) for (let col = -3; col <= 3; col++) {
            part(ctx, group, p.darkMetal, [w * 0.085, 0.009, keyboardD * 0.075], [col * w * 0.105, -h * 0.417, keyboardD * (0.32 + row * 0.13)]);
        }
        part(ctx, group, p.darkMetal, [w * 0.24, 0.010, keyboardD * 0.18], [0, -h * 0.414, keyboardD * 0.70]);
        part(ctx, group, p.wornMetal, [w * 0.92, 0.026, 0.035], [0, -h * 0.34, 0.02]);
        return;
    }
    const isRadio = placement.familyId === 'spawn.media.radio' || tags.has('radio') || /^radio\./.test(id);
    if (isRadio) {
        part(ctx, group, p.wornMetal, [w * 0.64, 0.035, d * 0.66], [0, h * 0.56, 0]);
        part(ctx, group, p.wornMetal, [0.022, h * 1.35, 0.022], [w * 0.38, h * 0.88, -d * 0.16], [0, 0, -0.12]);
        part(ctx, group, p.warm, [w * 0.16, h * 0.12, 0.018], [w * 0.22, h * 0.14, d * 0.52]);
        return;
    }
    const massiveCrt = ctx.spawnProgressionRank >= 3 && (tags.has('crt') || placement.constructionRecipe === 'crt-box' || /crt|video-monitor/.test(id));
    if (massiveCrt) {
        for (let y = -3; y <= 3; y++) {
            part(ctx, group, p.wornMetal, [Math.max(0.025, w * 0.018), h * 0.075, d * 0.50], [-w * 0.49, y * h * 0.105, -d * 0.10]);
            part(ctx, group, p.wornMetal, [Math.max(0.025, w * 0.018), h * 0.075, d * 0.50], [w * 0.49, y * h * 0.105, -d * 0.10]);
        }
        for (const sx of [-1, 1]) {
            part(ctx, group, p.darkMetal, [w * 0.08, h * 0.14, d * 0.18], [sx * w * 0.34, -h * 0.43, d * 0.40]);
            part(ctx, group, p.wornMetal, [w * 0.05, h * 0.10, d * 0.42], [sx * w * 0.43, h * 0.34, -d * 0.22]);
        }
        for (let i = -4; i <= 4; i++) part(ctx, group, p.darkMetal, [w * 0.055, 0.022, d * 0.34], [i * w * 0.085, h * 0.47, -d * 0.15]);
        for (let i = 0; i < 5; i++) part(ctx, group, i === 0 ? p.warm : p.wornMetal, [w * 0.025, h * 0.04, 0.02], [w * (0.30 + i * 0.055), -h * 0.39, d * 0.505]);
        return;
    }
    const flat = tags.has('lcd') || id.includes('flat');
    if (flat) {
        part(ctx, group, p.darkMetal, [w * 0.44, h * 0.07, d * 0.55], [0, -h * 0.46, -d * 0.08]);
        part(ctx, group, p.wornMetal, [w * 0.62, 0.025, 0.025], [0, h * 0.43, d * 0.13]);
        part(ctx, group, p.warm, [0.018, 0.018, 0.018], [w * 0.38, -h * 0.42, Math.min(d, 0.22) * 0.52]);
        return;
    }
    for (const x of [-w * 0.18, 0, w * 0.18]) part(ctx, group, p.wornMetal, [w * 0.11, 0.018, d * 0.20], [x, h * 0.46, -d * 0.08]);
    for (const sx of [-1, 1]) barBetweenXY(ctx, group, p.darkMetal, [sx * w * 0.10, h * 0.47, -d * 0.10], [sx * w * 0.34, h * 0.88, -d * 0.10], 0.018, 0.018);
}

function softDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '');
    const p = ctx.palette;
    const y = -h * 0.12;
    part(ctx, group, p.cloth, [w * 0.97, Math.max(0.018, h * 0.72), d * 0.97], [0, y, 0], [0.02, 0.02, id.includes('draped') ? 0.04 : 0]);
    part(ctx, group, p.paper, [w * 0.88, 0.012, d * 0.035], [0, y + h * 0.38, d * 0.42]);
    if (/blanket|rug|tarp/.test(id)) {
        part(ctx, group, p.cloth, [w * 0.16, Math.max(0.014, h * 0.9), d * 0.94], [-w * 0.34, y + 0.01, 0]);
    }
}

function clutterDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '').toLowerCase();
    const p = ctx.palette;

    if (/bottle|wine|beer|thermos/.test(id)) {
        part(ctx, group, p.glass, [w * 0.52, h * 0.58, d * 0.52], [0, -h * 0.15, 0]);
        part(ctx, group, p.glass, [w * 0.24, h * 0.30, d * 0.24], [0, h * 0.27, 0]);
        part(ctx, group, p.wornMetal, [w * 0.28, 0.025, d * 0.28], [0, h * 0.44, 0]);
        return;
    }
    if (/mug|cup/.test(id)) {
        part(ctx, group, p.paper, [w * 0.64, h * 0.76, d * 0.64], [-w * 0.08, 0, 0]);
        const hx = w * 0.40;
        part(ctx, group, p.paper, [w * 0.24, 0.025, 0.025], [hx, h * 0.19, 0]);
        part(ctx, group, p.paper, [0.025, h * 0.38, 0.025], [hx + w * 0.11, 0, 0]);
        part(ctx, group, p.paper, [w * 0.24, 0.025, 0.025], [hx, -h * 0.19, 0]);
        return;
    }
    if (/can/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.62, h * 0.86, d * 0.62], [0, -h * 0.02, 0]);
        part(ctx, group, p.darkMetal, [w * 0.48, 0.018, d * 0.48], [0, h * 0.44, 0]);
        return;
    }
    if (/ash|tray/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.92, Math.max(0.018, h * 0.32), d * 0.92], [0, -h * 0.18, 0]);
        part(ctx, group, p.paper, [w * 0.72, 0.018, d * 0.12], [w * 0.12, h * 0.06, 0], [0, 0.25, 0.08]);
        return;
    }
    if (/paper|newspaper|notebook|card|map/.test(id)) {
        for (let i = 0; i < 3; i++) part(ctx, group, p.paper, [w * (0.92 - i * 0.08), 0.012, d * (0.90 - i * 0.12)], [(i - 1) * w * 0.05, i * 0.012, (1 - i) * d * 0.04], [0, (i - 1) * 0.07, 0]);
        return;
    }
    if (/toolbox/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.94, h * 0.70, d * 0.94], [0, -h * 0.12, 0]);
        part(ctx, group, p.darkMetal, [w * 0.46, 0.035, 0.035], [0, h * 0.36, 0]);
        for (const sx of [-1, 1]) part(ctx, group, p.darkMetal, [0.025, h * 0.28, 0.025], [sx * w * 0.23, h * 0.24, 0]);
        return;
    }
    if (/screwdriver/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.18, h * 0.72, d * 0.18], [0, h * 0.06, 0], [0, 0, 0.72]);
        part(ctx, group, p.wood, [w * 0.34, h * 0.26, d * 0.34], [-w * 0.18, -h * 0.22, 0], [0, 0, 0.72]);
        return;
    }
    if (/key/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.62, 0.018, d * 0.10], [0, 0, 0], [0, 0.42, 0]);
        part(ctx, group, p.wornMetal, [w * 0.34, 0.018, d * 0.10], [w * 0.18, 0.02, d * 0.12], [0, -0.54, 0]);
        return;
    }
    if (/multimeter|scanner|receiver|electronics|remote/.test(id)) {
        part(ctx, group, p.darkMetal, [w * 0.90, h * 0.82, d * 0.90], [0, -h * 0.03, 0]);
        part(ctx, group, p.glass, [w * 0.44, h * 0.22, 0.018], [-w * 0.12, h * 0.14, d * 0.46]);
        part(ctx, group, p.warm, [w * 0.10, h * 0.10, 0.018], [w * 0.26, h * 0.10, d * 0.47]);
        part(ctx, group, p.wornMetal, [0.018, h * 0.92, 0.018], [w * 0.34, h * 0.48, -d * 0.20], [0, 0, -0.12]);
        return;
    }

    part(ctx, group, p.paper, [w * 0.82, h * 0.56, d * 0.74], [-w * 0.06, -h * 0.10, 0], [0, 0.09, 0.04]);
    part(ctx, group, p.wornMetal, [w * 0.36, h * 0.24, d * 0.42], [w * 0.25, h * 0.23, d * 0.08], [0, -0.18, 0]);
}

function powerDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '').toLowerCase();
    const p = ctx.palette;

    if (/cable|coax|extension/.test(id)) {
        const segW = Math.max(0.10, w * 0.28);
        for (let i = 0; i < 4; i++) {
            part(ctx, group, p.darkMetal, [segW, Math.max(0.012, h * 0.18), Math.max(0.012, d * 0.12)], [(i - 1.5) * segW * 0.74, (i % 2) * 0.006, (i % 2 ? 1 : -1) * d * 0.14], [0, (i - 1.5) * 0.18, 0]);
        }
        return;
    }
    if (/strip/.test(id)) {
        part(ctx, group, p.paper, [w * 0.94, h * 0.58, d * 0.82], [0, -h * 0.08, 0]);
        for (let i = -2; i <= 2; i++) part(ctx, group, p.darkMetal, [w * 0.09, 0.014, d * 0.32], [i * w * 0.16, h * 0.24, 0]);
        return;
    }
    if (/reel/.test(id)) {
        part(ctx, group, p.darkMetal, [w * 0.34, h * 0.74, d * 0.34], [0, 0, 0]);
        for (const y of [-h * 0.38, h * 0.38]) {
            part(ctx, group, p.wornMetal, [w * 0.92, 0.035, d * 0.12], [0, y, 0]);
            part(ctx, group, p.wornMetal, [w * 0.12, 0.035, d * 0.92], [0, y, 0]);
        }
        return;
    }
    if (/battery/.test(id)) {
        part(ctx, group, p.darkMetal, [w * 0.92, h * 0.82, d * 0.92], [0, -h * 0.07, 0]);
        for (const sx of [-1, 1]) part(ctx, group, p.wornMetal, [w * 0.11, h * 0.16, d * 0.11], [sx * w * 0.27, h * 0.43, 0]);
        return;
    }

    part(ctx, group, p.darkMetal, [w * 0.86, h * 0.78, d * 0.86], [0, -h * 0.05, 0]);
    part(ctx, group, p.wornMetal, [w * 0.54, 0.022, d * 0.18], [0, h * 0.38, 0]);
}

function roofUtilityDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const id = String(placement.variantId ?? '').toLowerCase();
    const p = ctx.palette;

    if (/vent-mushroom/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.34, h * 0.72, d * 0.34], [0, -h * 0.09, 0]);
        part(ctx, group, p.darkMetal, [w * 0.86, h * 0.16, d * 0.86], [0, h * 0.32, 0]);
        part(ctx, group, p.wornMetal, [w * 0.60, h * 0.11, d * 0.60], [0, h * 0.43, 0]);
        return;
    }
    if (/hvac|condenser/.test(id)) {
        part(ctx, group, p.wornMetal, [w * 0.94, h * 0.82, d * 0.94], [0, -h * 0.06, 0]);
        for (let i = -3; i <= 3; i++) part(ctx, group, p.darkMetal, [w * 0.62, 0.018, 0.018], [0, i * h * 0.085, d * 0.48]);
        part(ctx, group, p.darkMetal, [w * 0.52, 0.025, d * 0.08], [0, h * 0.42, 0]);
        part(ctx, group, p.darkMetal, [w * 0.08, 0.025, d * 0.52], [0, h * 0.42, 0]);
        return;
    }
    if (/antenna|mast/.test(id)) {
        part(ctx, group, p.darkMetal, [Math.max(0.025, w * 0.09), h * 0.92, Math.max(0.025, d * 0.09)], [0, 0, 0]);
        for (const y of [-h * 0.08, h * 0.18, h * 0.36]) part(ctx, group, p.wornMetal, [w * 0.88, 0.025, 0.025], [0, y, 0]);
        barBetweenXY(ctx, group, p.darkMetal, [-w * 0.42, -h * 0.45, 0], [0, h * 0.28, 0], 0.018, 0.018);
        barBetweenXY(ctx, group, p.darkMetal, [w * 0.42, -h * 0.45, 0], [0, h * 0.28, 0], 0.018, 0.018);
        return;
    }
    if (/conduit|pipe|rack/.test(id)) {
        for (const x of [-w * 0.28, 0, w * 0.28]) part(ctx, group, p.wornMetal, [Math.max(0.022, w * 0.08), h * 0.84, Math.max(0.022, d * 0.08)], [x, -h * 0.06, 0]);
        for (const y of [-h * 0.28, h * 0.20]) part(ctx, group, p.darkMetal, [w * 0.86, 0.035, d * 0.36], [0, y, 0]);
        return;
    }
    if (/dish/.test(id)) {
        part(ctx, group, p.darkMetal, [w * 0.12, h * 0.64, d * 0.12], [0, -h * 0.16, 0]);
        part(ctx, group, p.wornMetal, [w * 0.82, h * 0.10, d * 0.62], [0, h * 0.18, 0], [0.48, 0, 0]);
        part(ctx, group, p.darkMetal, [0.025, h * 0.34, 0.025], [0, h * 0.20, d * 0.22], [0.28, 0, 0]);
        return;
    }

    part(ctx, group, p.wornMetal, [w * 0.86, h * 0.76, d * 0.86], [0, -h * 0.08, 0]);
    part(ctx, group, p.darkMetal, [w * 0.62, h * 0.025, d * 0.025], [0, h * 0.23, d * 0.44]);
    part(ctx, group, p.darkMetal, [0.035, h * 0.74, 0.035], [w * 0.38, -h * 0.04, d * 0.36]);
}

function lampDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.darkMetal, [w * 0.54, h * 0.10, d * 0.54], [0, -h * 0.44, 0]);
    part(ctx, group, p.wornMetal, [Math.max(0.025, w * 0.10), h * 0.70, Math.max(0.025, d * 0.10)], [0, -h * 0.08, 0]);
    part(ctx, group, p.warm, [w * 0.90, h * 0.22, d * 0.90], [0, h * 0.35, 0]);
    part(ctx, group, p.darkMetal, [w * 0.18, h * 0.05, d * 0.18], [0, h * 0.48, 0]);
    part(ctx, group, p.darkMetal, [Math.max(0.015, w * 0.05), h * 0.44, Math.max(0.015, d * 0.05)], [w * 0.38, -h * 0.36, d * 0.18], [0, 0, 0.18]);
}

function plantDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.wornMetal, [w * 0.58, h * 0.28, d * 0.58], [0, -h * 0.36, 0]);
    part(ctx, group, p.green, [w * 0.08, h * 0.56, d * 0.08], [0, -h * 0.02, 0]);
    const leaves = [
        [-0.25, 0.13, 0.03, -0.55], [0.25, 0.22, -0.03, 0.55],
        [-0.16, 0.34, -0.12, -0.32], [0.16, 0.40, 0.12, 0.32],
    ];
    for (const [x, y, z, rz] of leaves) part(ctx, group, p.green, [w * 0.46, h * 0.07, d * 0.16], [x * w, y * h, z * d], [0, rz * 0.35, rz]);
}

function landmarkDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.darkMetal, [w * 0.72, h * 0.12, d * 0.72], [0, -h * 0.44, 0]);
    part(ctx, group, p.wornMetal, [w * 0.58, h * 0.10, d * 0.58], [0, -h * 0.33, 0]);
    part(ctx, group, p.glass, [w * 0.62, h * 0.62, d * 0.62], [0, h * 0.04, 0]);
    for (const sx of [-1, 1]) {
        part(ctx, group, p.warm, [w * 0.055, h * 0.48, d * 0.055], [sx * w * 0.15, h * 0.02, 0]);
        barBetweenXY(ctx, group, p.warm, [sx * w * 0.15, -h * 0.08, 0], [0, h * 0.28, 0], Math.max(0.018, w * 0.035), Math.max(0.018, d * 0.035));
    }
    part(ctx, group, p.darkMetal, [w * 0.70, h * 0.08, d * 0.70], [0, h * 0.37, 0]);
    for (const x of [-w * 0.22, 0, w * 0.22]) part(ctx, group, p.wornMetal, [w * 0.06, h * 0.16, d * 0.06], [x, h * 0.46, 0]);
}

function workstationDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    const bottom = -h * 0.5;
    const deskY = bottom + Math.min(0.78, h * 0.55);
    part(ctx, group, p.wood, [w * 0.98, 0.065, d * 0.92], [0, deskY, 0]);
    const legH = Math.max(0.38, deskY - bottom);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(ctx, group, p.darkMetal, [0.045, legH, 0.045], [sx * w * 0.44, bottom + legH * 0.5, sz * d * 0.36]);
    const screens = ctx.spawnProgressionRank >= 6 ? 3 : (ctx.spawnProgressionRank >= 4 ? 2 : 1);
    for (let i = 0; i < screens; i++) {
        const sw = Math.min(0.48, w * (screens === 1 ? 0.34 : 0.24));
        const x = (i - (screens - 1) * 0.5) * sw * 1.18;
        part(ctx, group, p.darkMetal, [sw, h * 0.27, 0.045], [x, deskY + h * 0.22, -d * 0.19], [0, (i - (screens - 1) * 0.5) * -0.14, 0]);
        part(ctx, group, p.glass, [sw * 0.88, h * 0.22, 0.012], [x, deskY + h * 0.22, -d * 0.165], [0, (i - (screens - 1) * 0.5) * -0.14, 0]);
        part(ctx, group, p.darkMetal, [0.035, h * 0.15, 0.035], [x, deskY + h * 0.07, -d * 0.20]);
    }
    part(ctx, group, p.darkMetal, [w * 0.46, 0.025, d * 0.24], [0, deskY + 0.055, d * 0.18]);
    part(ctx, group, p.wornMetal, [w * 0.20, h * 0.30, d * 0.38], [w * 0.34, bottom + h * 0.20, -d * 0.08]);
    for (let i = 0; i < 3; i++) part(ctx, group, p.warm, [0.018, 0.018, 0.018], [w * 0.42, bottom + h * (0.13 + i * 0.055), d * 0.12]);
}

function serverRackDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.darkMetal, [w, 0.065, d], [0, -h * 0.47, 0]);
    part(ctx, group, p.darkMetal, [w, 0.065, d], [0, h * 0.47, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(ctx, group, p.wornMetal, [0.045, h * 0.92, 0.045], [sx * w * 0.45, 0, sz * d * 0.43]);
    const units = ctx.spawnProgressionRank >= 7 ? 10 : 8;
    for (let i = 0; i < units; i++) {
        const y = -h * 0.38 + i * (h * 0.76 / Math.max(1, units - 1));
        part(ctx, group, p.darkMetal, [w * 0.82, h * 0.055, d * 0.72], [0, y, 0]);
        part(ctx, group, p.wornMetal, [w * 0.58, h * 0.018, 0.018], [-w * 0.07, y, d * 0.37]);
        part(ctx, group, i % 3 === 0 ? p.warm : p.glass, [0.018, 0.018, 0.018], [w * 0.31, y, d * 0.39]);
    }
    part(ctx, group, p.wornMetal, [w * 0.06, h * 0.72, d * 0.08], [w * 0.40, 0, -d * 0.38]);
}

function operatorChairDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.cloth, [w * 0.82, h * 0.10, d * 0.72], [0, -h * 0.04, 0]);
    part(ctx, group, p.cloth, [w * 0.76, h * 0.46, 0.08], [0, h * 0.25, -d * 0.33]);
    part(ctx, group, p.darkMetal, [0.05, h * 0.46, 0.05], [0, -h * 0.28, 0]);
    for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        part(ctx, group, p.darkMetal, [w * 0.34, 0.035, 0.035], [Math.sin(a) * w * 0.16, -h * 0.47, Math.cos(a) * d * 0.16], [0, a, 0]);
    }
}

function equipmentCartDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    for (const y of [-h * 0.34, 0, h * 0.34]) part(ctx, group, p.wornMetal, [w * 0.92, 0.055, d * 0.88], [0, y, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(ctx, group, p.darkMetal, [0.04, h * 0.86, 0.04], [sx * w * 0.42, 0, sz * d * 0.38]);
    part(ctx, group, p.darkMetal, [w * 0.68, h * 0.20, d * 0.62], [0, h * 0.15, 0]);
    part(ctx, group, p.glass, [w * 0.32, h * 0.08, 0.015], [-w * 0.12, h * 0.18, d * 0.32]);
}

function genericDetail(ctx, group, placement) {
    hideBaseMeshes(group);
    ctx.replacedProxyInstances++;
    const [w, h, d] = dimsOf(placement);
    const p = ctx.palette;
    part(ctx, group, p.wornMetal, [w * 0.84, h * 0.72, d * 0.80], [-w * 0.04, -h * 0.08, 0], [0, 0.06, 0]);
    part(ctx, group, p.darkMetal, [w * 0.48, h * 0.10, d * 0.18], [w * 0.18, h * 0.34, d * 0.28], [0, -0.12, 0]);
}

function detailPlacement(ctx, group, placement) {
    const slot = placement.slot;
    const familyId = String(placement.familyId ?? '');
    if (slot === 'tv-support') supportDetail(ctx, group, placement);
    else if (slot === 'seating') seatDetail(ctx, group, placement);
    else if (slot === 'primary-tv') mediaDetail(ctx, group, placement);
    else if (slot === 'softening') softDetail(ctx, group, placement);
    else if (slot === 'warm-practical') lampDetail(ctx, group, placement);
    else if (slot === 'plant-softener') plantDetail(ctx, group, placement);
    else if (slot === 'roof-credibility') roofUtilityDetail(ctx, group, placement);
    else if (slot === 'vacuum-landmark') landmarkDetail(ctx, group, placement);
    else if (slot === 'progression-workstation') workstationDetail(ctx, group, placement);
    else if (slot === 'progression-server-rack') serverRackDetail(ctx, group, placement);
    else if (slot === 'progression-operator-chair') operatorChairDetail(ctx, group, placement);
    else if (slot === 'progression-equipment-cart') equipmentCartDetail(ctx, group, placement);
    else if (slot === 'power-explanation' || /power-and-cables/.test(familyId)) powerDetail(ctx, group, placement);
    else if (slot === 'drink-evidence' || slot === 'personal-evidence' || /clutter|small-electronics/.test(familyId)) clutterDetail(ctx, group, placement);
    else genericDetail(ctx, group, placement);
    group.userData = {
        ...(group.userData || {}),
        spawnArtDetailSchema: ART_SCHEMA,
        spawnArtDetailed: true,
    };
    ctx.detailedInstances++;
}

export function detailSpawnLocation({
    THREE,
    root,
    plan,
    resources = null,
    partBudget = DEFAULT_PART_BUDGET,
} = {}) {
    if (!THREE?.Mesh || !THREE?.BoxGeometry || !THREE?.MeshStandardMaterial || !root || !Array.isArray(plan?.placements)) {
        return { schema: ART_SCHEMA, applied: false, detailedInstances: 0, partCount: 0, replacedProxyInstances: 0 };
    }

    const ctx = makeContext({ THREE, resources, partBudget, plan });
    for (const placement of plan.placements) {
        if (ctx.partCount >= ctx.partBudget) break;
        const group = findPlacementGroup(root, placement?.instanceId);
        if (!group) continue;
        detailPlacement(ctx, group, placement);
    }

    const summary = {
        schema: ART_SCHEMA,
        applied: ctx.detailedInstances > 0,
        detailedInstances: ctx.detailedInstances,
        partCount: ctx.partCount,
        partBudget: ctx.partBudget,
        replacedProxyInstances: ctx.replacedProxyInstances,
    };
    root.userData = { ...(root.userData || {}), spawnArtDetail: summary };
    return summary;
}
