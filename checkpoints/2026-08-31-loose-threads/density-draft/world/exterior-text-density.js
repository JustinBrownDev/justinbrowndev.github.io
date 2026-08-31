const MEDIUMS = Object.freeze([
    'painted-fascia',
    'shutter-stencil',
    'window-vinyl',
    'paper-bill',
    'tape-label',
    'service-placard',
    'price-strip',
    'permit-card',
    'vertical-banner',
]);

const MEDIUM_SHAPES = Object.freeze({
    'painted-fascia': [2.45, 0.54],
    'shutter-stencil': [1.55, 0.62],
    'window-vinyl': [1.22, 0.42],
    'paper-bill': [0.52, 0.72],
    'tape-label': [0.82, 0.18],
    'service-placard': [0.66, 0.42],
    'price-strip': [1.32, 0.26],
    'permit-card': [0.58, 0.76],
    'vertical-banner': [0.72, 1.48],
});

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
function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }

function facadePoint(entity, side, along = 0, y = 2, facadeIndex = null) {
    const facade = Number.isInteger(facadeIndex) ? entity.facades?.[facadeIndex] : null;
    const x0 = facade?.x ?? entity.x;
    const z0 = facade?.z ?? entity.z;
    const halfX = facade?.halfX ?? entity.halfX ?? 2;
    const halfZ = facade?.halfZ ?? entity.halfZ ?? 2;
    const actualSide = facade?.side ?? side;
    if (actualSide === 'north') return { x: x0 + along * halfX, y, z: z0 - halfZ - 0.026, ry: 0 };
    if (actualSide === 'south') return { x: x0 - along * halfX, y, z: z0 + halfZ + 0.026, ry: Math.PI };
    if (actualSide === 'west') return { x: x0 - halfX - 0.026, y, z: z0 - along * halfZ, ry: Math.PI * 0.5 };
    return { x: x0 + halfX + 0.026, y, z: z0 + along * halfZ, ry: -Math.PI * 0.5 };
}

function chooseFacadeIndex(entity, rng, preferredSide) {
    const facades = entity.facades ?? [];
    if (!facades.length) return null;
    const matching = [];
    for (let i = 0; i < facades.length; i++) if (facades[i]?.side === preferredSide) matching.push(i);
    const pool = matching.length ? matching : facades.map((_, index) => index);
    return pool[Math.floor(rng() * pool.length) % pool.length];
}

function safeStreetAlong(side, front, along, y) {
    if (side !== front || y >= 2.34 || Math.abs(along) >= 0.34) return along;
    return along < 0 ? Math.min(-0.38, along - 0.24) : Math.max(0.38, along + 0.24);
}

export function planExteriorTextDensity({ chunk, entity, worldSeed = 0, textExciter, pickMassiveNoisePair, hashString32 } = {}) {
    if (!chunk || !entity?.id || typeof hashString32 !== 'function' || !textExciter?.pairFor || typeof pickMassiveNoisePair !== 'function') return [];
    const seedFor = (channel, index = 0) => hashString32(`${worldSeed}:exterior-text-density:${chunk.key}:${entity.id}:${channel}:${index}`);
    const rng = mulberry32(seedFor('plan'));
    const front = entity.doorSide || 'north';
    const compass = ['north', 'east', 'south', 'west'];
    const frontIndex = Math.max(0, compass.indexOf(front));
    const side = compass[(frontIndex + (rng() < 0.5 ? 1 : 3)) % 4];
    const back = compass[(frontIndex + 2) % 4];
    const floors = Math.max(1, Number(entity.floors) || 1);
    const wallHeight = floors * (Number(entity.floorH) || 3.15);
    const facadeCount = Math.max(1, entity.facades?.length || 1);

    // Density is intentionally independent of weirdness. Weirdness still decides
    // what the corpus says; this layer only decides how little blank skin survives.
    const count = clamp(10 + floors * 2 + Math.min(4, facadeCount), 14, 22);
    const sideCycle = [front, side, front, back, side, front, back, front];
    const tasks = [];
    for (let i = 0; i < count; i++) {
        const medium = MEDIUMS[i % MEDIUMS.length];
        const labelRng = mulberry32(seedFor(`label:${medium}`, i));
        const [title, subtitle] = textExciter.pairFor(
            chunk,
            entity.id,
            `exterior-density:${medium}:${i}`,
            pickMassiveNoisePair(labelRng)
        );
        const sideName = sideCycle[i % sideCycle.length];
        const facadeIndex = chooseFacadeIndex(entity, rng, sideName);
        const baseShape = MEDIUM_SHAPES[medium] ?? [0.8, 0.4];
        const scale = 0.82 + rng() * 0.42;
        const width = baseShape[0] * scale;
        const height = baseShape[1] * (0.88 + rng() * 0.30);
        const band = i % 5;
        let y;
        if (medium === 'painted-fascia') y = clamp(2.48 + (i % 3) * 0.72, 2.40, Math.max(2.45, wallHeight - 0.42));
        else if (medium === 'vertical-banner') y = clamp(2.20 + rng() * Math.min(2.6, wallHeight * 0.35), 1.75, Math.max(1.80, wallHeight - height * 0.55));
        else if (band <= 1) y = 0.82 + rng() * 1.05;
        else y = clamp(2.10 + (band - 1) * 0.78 + rng() * 0.50, 1.45, Math.max(1.55, wallHeight - height * 0.58));
        let along = ((i * 0.38196601125 + rng() * 0.28) % 1.62) - 0.81;
        along = safeStreetAlong(sideName, front, along, y);
        tasks.push({
            kind: 'surface-text', medium, entityId: entity.id, side: sideName, facadeIndex,
            along, y, width, height, title, subtitle,
            seed: seedFor(`surface:${medium}`, i),
            nonBlocking: true,
        });
    }
    return tasks;
}

function canvasSurfaceTextTexture(THREE, task, documentRef) {
    if (!THREE?.CanvasTexture || !documentRef?.createElement) return null;
    const medium = task.medium;
    const tall = medium === 'paper-bill' || medium === 'permit-card' || medium === 'vertical-banner';
    const canvas = documentRef.createElement('canvas');
    canvas.width = tall ? 192 : 320;
    canvas.height = tall ? 320 : 112;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    const rng = mulberry32(task.seed ^ 0x6d2b79f5);
    const paper = ['#d7cba7', '#d8d1bd', '#c7cec6', '#cdb9aa'];
    const ink = ['#171717', '#23201c', '#152629', '#4e1414'];
    const dark = ['#101414', '#17181a', '#1d1714', '#111b1d'];
    const accent = ['#d9ca56', '#e5e0c5', '#b7d9d1', '#d6a6a2'];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (medium === 'window-vinyl') {
        ctx.fillStyle = 'rgba(10,18,20,0.16)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = accent[Math.floor(rng() * accent.length)]; ctx.lineWidth = 5; ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    } else if (medium === 'shutter-stencil') {
        ctx.fillStyle = dark[Math.floor(rng() * dark.length)]; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#484742'; ctx.lineWidth = 2;
        for (let y = 8; y < canvas.height; y += 11) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    } else if (medium === 'painted-fascia') {
        ctx.fillStyle = dark[Math.floor(rng() * dark.length)]; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = accent[Math.floor(rng() * accent.length)]; ctx.fillRect(0, 0, canvas.width, 9);
    } else if (medium === 'tape-label') {
        ctx.fillStyle = rng() < 0.5 ? '#d6c76a' : '#ddd7be'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(40,35,25,0.12)'; for (let x = 4; x < canvas.width; x += 19) ctx.fillRect(x, 0, 1, canvas.height);
    } else if (medium === 'service-placard') {
        ctx.fillStyle = '#a3a59f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#4d514f'; ctx.lineWidth = 7; ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    } else if (medium === 'price-strip') {
        ctx.fillStyle = '#d7cfad'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#6c6655'; ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 53) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    } else if (medium === 'paper-bill' || medium === 'permit-card') {
        ctx.fillStyle = paper[Math.floor(rng() * paper.length)]; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = ink[Math.floor(rng() * ink.length)]; ctx.lineWidth = medium === 'permit-card' ? 5 : 2; ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
        if (medium === 'permit-card') for (let y = 92; y < canvas.height - 20; y += 28) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(canvas.width - 18, y); ctx.stroke(); }
    } else if (medium === 'vertical-banner') {
        ctx.fillStyle = dark[Math.floor(rng() * dark.length)]; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = accent[Math.floor(rng() * accent.length)]; ctx.fillRect(8, 8, canvas.width - 16, 6);
    } else {
        ctx.fillStyle = paper[Math.floor(rng() * paper.length)]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const title = clean(task.title).slice(0, medium === 'vertical-banner' ? 42 : 64);
    const subtitle = clean(task.subtitle).slice(0, medium === 'vertical-banner' ? 64 : 96);
    const fg = medium === 'painted-fascia' || medium === 'shutter-stencil' || medium === 'window-vinyl' || medium === 'vertical-banner'
        ? accent[Math.floor(rng() * accent.length)]
        : ink[Math.floor(rng() * ink.length)];
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = medium === 'paper-bill' || medium === 'permit-card' ? 'left' : 'center';
    const centerX = ctx.textAlign === 'center' ? canvas.width * 0.5 : 16;
    const fitSize = (text, maxWidth, maxPx, minPx) => {
        let px = maxPx;
        while (px > minPx) {
            ctx.font = `700 ${px}px monospace`;
            if (ctx.measureText(text).width <= maxWidth) break;
            px -= 2;
        }
        return px;
    };
    const titlePx = fitSize(title, canvas.width - 30, tall ? 25 : 29, 11);
    ctx.font = `700 ${titlePx}px monospace`;
    ctx.fillText(title, centerX, tall ? canvas.height * 0.28 : canvas.height * 0.39, canvas.width - 30);
    const subPx = fitSize(subtitle, canvas.width - 30, tall ? 15 : 14, 9);
    ctx.font = `${subPx}px monospace`;
    ctx.globalAlpha = 0.82;
    ctx.fillText(subtitle, centerX, tall ? canvas.height * 0.48 : canvas.height * 0.68, canvas.width - 30);
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

export function createExteriorTextSurface({ THREE, unitPlane, entity, task, documentRef = typeof document === 'undefined' ? null : document, fallbackMaterial = null } = {}) {
    if (!THREE?.Mesh || !unitPlane || !entity || !task) return null;
    const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
    const texture = canvasSurfaceTextTexture(THREE, task, documentRef);
    const material = texture ? new THREE.MeshStandardMaterial({
        map: texture,
        transparent: task.medium === 'window-vinyl',
        opacity: task.medium === 'window-vinyl' ? 0.86 : 1,
        alphaTest: task.medium === 'window-vinyl' ? 0.02 : 0,
        roughness: task.medium === 'painted-fascia' || task.medium === 'shutter-stencil' ? 0.82 : 0.93,
        emissive: task.medium === 'window-vinyl' ? 0x071012 : 0x050403,
        emissiveIntensity: task.medium === 'window-vinyl' ? 0.10 : 0.025,
        side: THREE.DoubleSide,
    }) : fallbackMaterial;
    if (!material) return null;
    const mesh = new THREE.Mesh(unitPlane, material);
    mesh.name = `chunk-surface-text:${task.medium}:${task.entityId}`;
    mesh.position.set(point.x, point.y, point.z);
    mesh.rotation.y = point.ry;
    mesh.scale.set(task.width, task.height, 1);
    mesh.userData.chunkCosmetic = true;
    mesh.userData.detailKind = task.kind;
    mesh.userData.semanticClass = `text-medium:${task.medium}`;
    mesh.userData.nonBlocking = true;
    return { object: mesh, texture, material: texture ? material : null };
}

export function listExteriorTextMedia() {
    return MEDIUMS;
}
