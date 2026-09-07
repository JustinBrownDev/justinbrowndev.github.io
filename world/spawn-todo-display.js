import { loadSpawnTodoList } from './spawn-todo-runtime.js';

const DISPLAY_SCHEMA = 'jweb.spawn-todo-display.v2';
const EPS = 1e-6;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

function rotateLocal(rotY, x, z) {
    const sin = Math.sin(rotY || 0), cos = Math.cos(rotY || 0);
    return { x: x * cos + z * sin, z: z * cos - x * sin };
}

function inverseLocal(rotY, x, z) {
    const sin = Math.sin(rotY || 0), cos = Math.cos(rotY || 0);
    return { x: x * cos - z * sin, z: z * cos + x * sin };
}

function facingRotation(from, target) {
    return Math.atan2(target.x - from.x, target.z - from.z);
}

function orientedHalfExtents(dimensionsM, rotY = 0, pad = 0) {
    const w = Math.max(0.01, finite(Number(dimensionsM?.[0]), 0.5));
    const d = Math.max(0.01, finite(Number(dimensionsM?.[2]), 0.5));
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    return {
        halfX: c * w * 0.5 + s * d * 0.5 + pad,
        halfZ: s * w * 0.5 + c * d * 0.5 + pad,
    };
}

function envelope({ x, yMin, yMax, z, dimensionsM, rotY = 0, pad = 0 }) {
    const ext = orientedHalfExtents(dimensionsM, rotY, pad);
    return { x, z, halfX: ext.halfX, halfZ: ext.halfZ, yMin, yMax };
}

function overlap(a, b, pad = 0) {
    if (!a || !b) return false;
    if (a.yMin >= b.yMax - EPS || a.yMax <= b.yMin + EPS) return false;
    return Math.abs(a.x - b.x) < a.halfX + b.halfX + pad
        && Math.abs(a.z - b.z) < a.halfZ + b.halfZ + pad;
}

function insidePatch(box, patch, pad = 0.04) {
    if (!box || !patch) return false;
    const px = finite(Number(patch.x));
    const pz = finite(Number(patch.z));
    const phx = Math.max(0, finite(Number(patch.halfX), finite(Number(patch.hx), finite(Number(patch.sx)) * 0.5)));
    const phz = Math.max(0, finite(Number(patch.halfZ), finite(Number(patch.hz), finite(Number(patch.sz)) * 0.5)));
    return box.x - box.halfX >= px - phx + pad
        && box.x + box.halfX <= px + phx - pad
        && box.z - box.halfZ >= pz - phz + pad
        && box.z + box.halfZ <= pz + phz - pad;
}

function placementBox(placement, surfaceY = 0, pad = 0.03) {
    if (!placement?.transform) return null;
    const dims = placement.dimensionsM ?? [0.5, 0.5, 0.5];
    const h = Math.max(0.02, finite(Number(dims[1]), 0.5));
    const y = finite(Number(placement.transform.y), surfaceY + h * 0.5);
    return envelope({
        x: finite(Number(placement.transform.x)),
        z: finite(Number(placement.transform.z)),
        yMin: y - h * 0.5,
        yMax: y + h * 0.5,
        dimensionsM: dims,
        rotY: finite(Number(placement.transform.rotY)),
        pad,
    });
}

function reservationBox(reservation) {
    if (!reservation) return null;
    const halfX = Math.max(0, finite(Number(reservation.halfX), finite(Number(reservation.hx), finite(Number(reservation.sx)) * 0.5)));
    const halfZ = Math.max(0, finite(Number(reservation.halfZ), finite(Number(reservation.hz), finite(Number(reservation.sz)) * 0.5)));
    return {
        x: finite(Number(reservation.x)), z: finite(Number(reservation.z)), halfX, halfZ,
        yMin: finite(Number(reservation.yMin), -Infinity), yMax: finite(Number(reservation.yMax), Infinity),
    };
}

function planBounds(plan, hostSpace) {
    const placements = plan?.placements ?? [];
    if (hostSpace?.bounds && Number.isFinite(hostSpace.bounds.x) && Number.isFinite(hostSpace.bounds.z)) {
        return {
            centerX: Number(hostSpace.bounds.x), centerZ: Number(hostSpace.bounds.z),
            surfaceY: finite(Number(hostSpace.surfaceY)),
        };
    }
    if (!placements.length) return { centerX: 0, centerZ: 0, surfaceY: finite(Number(hostSpace?.surfaceY)) };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    for (const p of placements) {
        const [w = 0.5, h = 0.5, d = 0.5] = p.dimensionsM ?? [];
        const x = finite(Number(p.transform?.x)), y = finite(Number(p.transform?.y)), z = finite(Number(p.transform?.z));
        minX = Math.min(minX, x - w * 0.5); maxX = Math.max(maxX, x + w * 0.5);
        minZ = Math.min(minZ, z - d * 0.5); maxZ = Math.max(maxZ, z + d * 0.5);
        minY = Math.min(minY, y - h * 0.5);
    }
    return { centerX: (minX + maxX) * 0.5, centerZ: (minZ + maxZ) * 0.5, surfaceY: finite(Number(hostSpace?.surfaceY), minY) };
}

function supportPlacement(plan) {
    return (plan?.placements ?? []).find(p => p.slot === 'tv-support') ?? null;
}

function mediaPlacement(plan) {
    return (plan?.placements ?? []).find(p => p.slot === 'primary-tv') ?? null;
}

function blockers(plan, hostSpace) {
    const surfaceY = finite(Number(hostSpace?.surfaceY));
    return [
        ...(plan?.placements ?? []).map(p => placementBox(p, surfaceY)).filter(Boolean),
        ...(plan?.reservations ?? []).map(reservationBox).filter(Boolean),
    ];
}

function chunks(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function deterministicTilt(id, span = 0.055) {
    let h = 0;
    const text = String(id ?? '');
    for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
    return (((h >>> 0) % 1001) / 1000 - 0.5) * span * 2;
}

export function spawnTodoDisplayMode(plan) {
    const profile = plan?.startProfile?.id ?? '';
    if (profile === 'radio-roof') return 'post-its';
    if (profile === 'small-tv-roof') return 'clipboard';
    if (profile === 'terra-backroom') return 'terra-display';
    return 'whiteboard';
}

function localTableObstacles(plan, support) {
    if (!support) return [];
    const rotY = finite(Number(support.transform?.rotY));
    const out = [];
    for (const p of plan?.placements ?? []) {
        if (p === support) continue;
        const related = p.relationTo === support.instanceId || p.slot === 'primary-tv';
        if (!related) continue;
        const delta = inverseLocal(rotY,
            finite(Number(p.transform?.x)) - finite(Number(support.transform?.x)),
            finite(Number(p.transform?.z)) - finite(Number(support.transform?.z)));
        const dims = p.dimensionsM ?? [0.2, 0.2, 0.2];
        const relativeRot = finite(Number(p.transform?.rotY)) - rotY;
        const ext = orientedHalfExtents(dims, relativeRot, 0.025);
        out.push({ x: delta.x, z: delta.z, halfX: ext.halfX, halfZ: ext.halfZ });
    }
    return out;
}

function localRectOverlap(a, b, pad = 0) {
    return Math.abs(a.x - b.x) < a.halfX + b.halfX + pad
        && Math.abs(a.z - b.z) < a.halfZ + b.halfZ + pad;
}

function tabletopGrid({ support, plan, count, baseW, baseD }) {
    const [supportW = 0.9, , supportD = 0.6] = support?.dimensionsM ?? [];
    const obstacles = localTableObstacles(plan, support);
    const scales = [1, 0.88, 0.76, 0.64, 0.54, 0.46];
    let best = null;
    for (const scale of scales) {
        const w = clamp(baseW * scale, 0.09, baseW);
        const d = clamp(baseD * scale, 0.075, baseD);
        const usableW = Math.max(0.04, supportW - 0.08);
        const usableD = Math.max(0.04, supportD - 0.08);
        const cols = Math.max(1, Math.floor(usableW / (w * 1.07)));
        const rows = Math.max(1, Math.floor(usableD / (d * 1.08)));
        const candidates = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols === 1 ? 0 : -usableW * 0.5 + w * 0.5 + c * ((usableW - w) / (cols - 1));
                const z = rows === 1 ? 0 : -usableD * 0.5 + d * 0.5 + r * ((usableD - d) / (rows - 1));
                const rect = { x, z, halfX: w * 0.5, halfZ: d * 0.5 };
                if (obstacles.some(other => localRectOverlap(rect, other, 0.012))) continue;
                candidates.push({ x, z });
            }
        }
        if (!best || candidates.length > best.candidates.length) best = { w, d, candidates };
        if (candidates.length >= Math.min(count, 1)) {
            if (candidates.length >= count) return { w, d, candidates };
        }
    }
    if (best?.candidates?.length) return best;
    // A crowded tiny table still gets a deterministic corner stack instead of dropping tasks.
    return { w: 0.09, d: 0.075, candidates: [{ x: -supportW * 0.32, z: supportD * 0.30 }] };
}

function planPostIts(plan, hostSpace, items) {
    const support = supportPlacement(plan);
    if (!support) return { mode: 'post-its', notes: [], fallback: true };
    const [,,] = support.dimensionsM ?? [];
    const topY = finite(Number(support.transform?.y)) + finite(Number(support.dimensionsM?.[1]), 0.75) * 0.5;
    const rotY = finite(Number(support.transform?.rotY));
    const grid = tabletopGrid({ support, plan, count: items.length, baseW: 0.25, baseD: 0.205 });
    const candidates = grid.candidates;
    const notes = items.map((item, index) => {
        const base = candidates[index % candidates.length];
        const layer = Math.floor(index / candidates.length);
        const jitter = deterministicTilt(item.id, 0.012);
        const world = rotateLocal(rotY, base.x + jitter * 0.25, base.z - jitter * 0.15);
        return {
            item,
            x: finite(Number(support.transform?.x)) + world.x,
            y: topY + 0.004 + layer * 0.0022,
            z: finite(Number(support.transform?.z)) + world.z,
            rotY: rotY + deterministicTilt(item.id),
            width: grid.w,
            depth: grid.d,
            layer,
        };
    });
    return { mode: 'post-its', notes, supportId: support.instanceId };
}

function planClipboards(plan, hostSpace, items) {
    const support = supportPlacement(plan);
    const pages = chunks(items, 7);
    if (!support) return { mode: 'clipboard', boards: [], fallback: true };
    const topY = finite(Number(support.transform?.y)) + finite(Number(support.dimensionsM?.[1]), 0.75) * 0.5;
    const rotY = finite(Number(support.transform?.rotY));
    const grid = tabletopGrid({ support, plan, count: pages.length, baseW: 0.40, baseD: 0.54 });
    const boards = pages.map((pageItems, index) => {
        const base = grid.candidates[index % grid.candidates.length];
        const layer = Math.floor(index / grid.candidates.length);
        const world = rotateLocal(rotY, base.x, base.z);
        return {
            items: pageItems, pageIndex: index, pageCount: pages.length,
            x: finite(Number(support.transform?.x)) + world.x,
            y: topY + 0.016 + layer * 0.032,
            z: finite(Number(support.transform?.z)) + world.z,
            rotY: rotY + deterministicTilt(pageItems[0]?.id ?? index, 0.04),
            width: grid.w,
            depth: grid.d,
            layer,
        };
    });
    return { mode: 'clipboard', boards, supportId: support.instanceId };
}

function hostWallFrames(hostSpace, plan) {
    const center = planBounds(plan, hostSpace);
    const floorY = finite(Number(hostSpace?.surfaceY), center.surfaceY);
    return (hostSpace?.nearbyWalls ?? []).map((wall, wallIndex) => {
        const x1 = Number(wall?.x1), z1 = Number(wall?.z1), x2 = Number(wall?.x2), z2 = Number(wall?.z2);
        if (![x1, z1, x2, z2].every(Number.isFinite)) return null;
        const dx = x2 - x1, dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < 0.8) return null;
        const tx = dx / length, tz = dz / length;
        let nx = -tz, nz = tx;
        const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
        if ((center.centerX - mx) * nx + (center.centerZ - mz) * nz < 0) { nx = -nx; nz = -nz; }
        return {
            wallIndex, wall, x1, z1, x2, z2, mx, mz, length, tx, tz, nx, nz,
            thickness: Math.max(0.08, finite(Number(wall?.thickness), 0.14)),
            yMin: finite(Number(wall?.yMin), floorY),
            yMax: finite(Number(wall?.yMax), floorY + 3.15),
        };
    }).filter(Boolean);
}

function wallCandidateBox(frame, { width, height, depth, t, centerY }) {
    const along = frame.length * t;
    const wx = frame.x1 + frame.tx * along;
    const wz = frame.z1 + frame.tz * along;
    const x = wx + frame.nx * (frame.thickness * 0.5 + depth * 0.5 + 0.012);
    const z = wz + frame.nz * (frame.thickness * 0.5 + depth * 0.5 + 0.012);
    const rotY = facingRotation({ x, z }, { x: x + frame.nx, z: z + frame.nz });
    const box = envelope({ x, z, yMin: centerY - height * 0.5, yMax: centerY + height * 0.5, dimensionsM: [width, height, depth], rotY, pad: 0.02 });
    return { x, z, y: centerY, rotY, box, frame, t };
}

function chooseWallMount({ plan, hostSpace, width, height, depth, preferredCenterAboveFloor, extraBlockers = [] }) {
    const floorY = finite(Number(hostSpace?.surfaceY), planBounds(plan, hostSpace).surfaceY);
    const baseBlockers = blockers(plan, hostSpace);
    const frames = hostWallFrames(hostSpace, plan).filter(frame => frame.length >= width + 0.20 && frame.yMax - frame.yMin >= height + 0.14);
    const tValues = [0.50, 0.28, 0.72, 0.16, 0.84, 0.39, 0.61];
    const candidates = [];
    for (const frame of frames) {
        const fixtureCountOnWall = (plan?.placements ?? []).filter(p => p.spatialRelation?.wallIndex === frame.wallIndex).length;
        const minCenterY = frame.yMin + height * 0.5 + 0.07;
        const maxCenterY = frame.yMax - height * 0.5 - 0.07;
        if (minCenterY > maxCenterY) continue;
        const centerY = clamp(floorY + preferredCenterAboveFloor, minCenterY, maxCenterY);
        const marginT = (width * 0.5 + 0.10) / frame.length;
        for (const rawT of tValues) {
            const t = clamp(rawT, marginT, 1 - marginT);
            const candidate = wallCandidateBox(frame, { width, height, depth, t, centerY });
            const allBlockers = [...baseBlockers, ...extraBlockers];
            let overlaps = 0;
            let overlapPenalty = 0;
            for (const other of allBlockers) {
                if (!overlap(candidate.box, other, 0.025)) continue;
                overlaps++;
                overlapPenalty += 1;
            }
            const wallFixtureDistance = (plan?.placements ?? []).reduce((sum, p) => {
                if (p.spatialRelation?.wallIndex !== frame.wallIndex) return sum;
                return sum + 1 / Math.max(0.25, Math.hypot(candidate.x - finite(Number(p.transform?.x)), candidate.z - finite(Number(p.transform?.z))));
            }, 0);
            candidates.push({
                ...candidate,
                overlaps,
                score: -overlapPenalty * 100 - wallFixtureDistance * 3 - fixtureCountOnWall * 0.8 + frame.length * 0.03,
            });
        }
    }
    candidates.sort((a, b) => a.overlaps - b.overlaps || b.score - a.score || a.frame.wallIndex - b.frame.wallIndex || a.t - b.t);
    return candidates[0] ?? null;
}

function chooseFreestandingMount({ plan, hostSpace, width, height, depth, extraBlockers = [] }) {
    const floorY = finite(Number(hostSpace?.surfaceY), planBounds(plan, hostSpace).surfaceY);
    const baseBlockers = [...blockers(plan, hostSpace), ...extraBlockers];
    const media = mediaPlacement(plan);
    const target = media?.transform ?? planBounds(plan, hostSpace);
    const rotations = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    const candidates = [];
    for (const patch of hostSpace?.supportPatches ?? []) {
        const px = finite(Number(patch.x)), pz = finite(Number(patch.z));
        const hx = Math.max(0.2, finite(Number(patch.halfX), finite(Number(patch.sx)) * 0.5));
        const hz = Math.max(0.2, finite(Number(patch.halfZ), finite(Number(patch.sz)) * 0.5));
        const points = [
            [px, pz], [px - hx * 0.65, pz], [px + hx * 0.65, pz],
            [px, pz - hz * 0.65], [px, pz + hz * 0.65],
        ];
        for (const [x, z] of points) for (const rotY of rotations) {
            const box = envelope({ x, z, yMin: floorY, yMax: floorY + height + 0.25, dimensionsM: [width, height, depth], rotY, pad: 0.08 });
            if (!insidePatch(box, patch, 0.08)) continue;
            if (baseBlockers.some(other => overlap(box, other, 0.04))) continue;
            const desired = facingRotation({ x, z }, { x: finite(Number(target.x), x), z: finite(Number(target.z), z) });
            const facingPenalty = Math.abs(Math.atan2(Math.sin(rotY - desired), Math.cos(rotY - desired)));
            const mediaDistance = Math.hypot(x - finite(Number(target.x), x), z - finite(Number(target.z), z));
            candidates.push({ x, z, y: floorY + 1.18, rotY, floorY, box, score: -Math.abs(mediaDistance - 2.8) - facingPenalty * 0.6 });
        }
    }
    candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z || a.rotY - b.rotY);
    return candidates[0] ?? null;
}

function planPanelSequence({ plan, hostSpace, pages, kind }) {
    const specs = kind === 'terra-display'
        ? { width: 2.35, height: 1.05, depth: 0.13, center: 2.08 }
        : { width: 2.10, height: 1.28, depth: 0.085, center: 1.62 };
    const mounts = [];
    const reserved = [];
    for (let index = 0; index < pages.length; index++) {
        let mount = chooseWallMount({
            plan, hostSpace, width: specs.width, height: specs.height, depth: specs.depth,
            preferredCenterAboveFloor: specs.center,
            extraBlockers: reserved,
        });
        let freestanding = false;
        if (!mount || (mount.overlaps > 0 && kind !== 'terra-display')) {
            const fallback = chooseFreestandingMount({
                plan, hostSpace, width: specs.width, height: specs.height, depth: 0.62,
                extraBlockers: reserved,
            });
            if (fallback) { mount = fallback; freestanding = true; }
        }
        if (!mount) {
            const b = planBounds(plan, hostSpace);
            mount = {
                x: b.centerX + (index + 1) * (specs.width + 0.25),
                y: finite(Number(hostSpace?.surfaceY), b.surfaceY) + specs.center,
                z: b.centerZ,
                rotY: -Math.PI * 0.5,
                floorY: finite(Number(hostSpace?.surfaceY), b.surfaceY),
                box: envelope({
                    x: b.centerX + (index + 1) * (specs.width + 0.25), z: b.centerZ,
                    yMin: b.surfaceY, yMax: b.surfaceY + specs.height + 0.5,
                    dimensionsM: [specs.width, specs.height, 0.62], rotY: -Math.PI * 0.5,
                }),
                emergencyFallback: true,
            };
            freestanding = true;
        }
        reserved.push(mount.box);
        mounts.push({
            ...mount, freestanding,
            pageIndex: index, pageCount: pages.length, items: pages[index],
            width: specs.width, height: specs.height, depth: specs.depth,
        });
    }
    return mounts;
}

export function planSpawnTodoDisplay({ plan, hostSpace = null, items = [] } = {}) {
    const mode = spawnTodoDisplayMode(plan);
    if (!plan || !items.length) return Object.freeze({ schema: DISPLAY_SCHEMA, mode, itemCount: items.length, elements: Object.freeze([]) });
    let elements;
    if (mode === 'post-its') elements = planPostIts(plan, hostSpace, items).notes;
    else if (mode === 'clipboard') elements = planClipboards(plan, hostSpace, items).boards;
    else if (mode === 'terra-display') elements = planPanelSequence({ plan, hostSpace, pages: chunks(items, 12), kind: mode });
    else elements = planPanelSequence({ plan, hostSpace, pages: chunks(items, 10), kind: mode });
    return Object.freeze({ schema: DISPLAY_SCHEMA, mode, itemCount: items.length, elements: Object.freeze(elements) });
}

function createResources(THREE) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    geometries.add(unitBox); geometries.add(unitPlane);
    return {
        unitBox, unitPlane, geometries, materials, textures,
        material(factory) { const mat = factory(); materials.add(mat); return mat; },
        texture(texture) { if (texture) textures.add(texture); return texture; },
        dispose() {
            for (const texture of textures) texture?.dispose?.();
            for (const material of materials) material?.dispose?.();
            for (const geometry of geometries) geometry?.dispose?.();
            textures.clear(); materials.clear(); geometries.clear();
        },
    };
}

function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const out = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || ctx.measureText(candidate).width <= maxWidth) line = candidate;
        else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
}

function canvasTexture(THREE, kind, items, { pageIndex = 0, pageCount = 1 } = {}) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const compact = kind === 'post-it';
    canvas.width = compact ? 420 : 1200;
    canvas.height = compact ? 340 : 760;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (kind === 'terra') {
        ctx.fillStyle = '#06100c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#153126';
        for (let y = 0; y < canvas.height; y += 12) ctx.fillRect(0, y, canvas.width, 1);
        ctx.fillStyle = '#8cffbf';
        ctx.font = '700 38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(`JWEB // OPEN TASKS${pageCount > 1 ? `  ${pageIndex + 1}/${pageCount}` : ''}`, 48, 42);
        ctx.fillStyle = '#34705a'; ctx.fillRect(48, 96, canvas.width - 96, 3);
        ctx.font = '34px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        let y = 126;
        items.forEach((item, i) => {
            ctx.fillStyle = '#8cffbf';
            const prefix = `${String(pageIndex * 12 + i + 1).padStart(2, '0')}  `;
            const lines = wrapLines(ctx, item.text, canvas.width - 160);
            for (let li = 0; li < lines.length; li++) {
                if (y > canvas.height - 60) break;
                ctx.fillText(li === 0 ? prefix + lines[li] : '    ' + lines[li], 48, y);
                y += 46;
            }
            y += 7;
        });
        ctx.fillStyle = '#34705a'; ctx.font = '24px ui-monospace, monospace';
        ctx.fillText(`SOURCE JWEB-TODO   OPEN ${items.length}`, 48, canvas.height - 40);
    } else if (kind === 'whiteboard') {
        ctx.fillStyle = '#eef0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#27302c';
        ctx.font = '700 46px "Segoe Print", "Trebuchet MS", sans-serif';
        ctx.fillText(pageCount > 1 ? `TODO  ${pageIndex + 1}/${pageCount}` : 'TODO', 56, 42);
        ctx.fillStyle = '#6f7772'; ctx.fillRect(54, 102, canvas.width - 108, 3);
        ctx.font = '35px "Segoe Print", "Trebuchet MS", sans-serif';
        let y = 132;
        for (const item of items) {
            ctx.strokeStyle = '#27302c'; ctx.lineWidth = 3; ctx.strokeRect(58, y + 4, 24, 24);
            ctx.fillStyle = '#27302c';
            const lines = wrapLines(ctx, item.text, canvas.width - 180);
            for (let li = 0; li < lines.length; li++) {
                if (y > canvas.height - 52) break;
                ctx.fillText(lines[li], 104, y);
                y += 42;
            }
            y += 12;
        }
    } else if (kind === 'clipboard') {
        ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#d8d2c4'; ctx.lineWidth = 2;
        for (let y = 130; y < canvas.height; y += 54) { ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(canvas.width - 44, y); ctx.stroke(); }
        ctx.fillStyle = '#222522'; ctx.font = '700 42px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(pageCount > 1 ? `TODO ${pageIndex + 1}/${pageCount}` : 'TODO', 52, 42);
        ctx.font = '34px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        let y = 122;
        for (const item of items) {
            ctx.strokeStyle = '#333'; ctx.strokeRect(54, y + 3, 22, 22);
            const lines = wrapLines(ctx, item.text, canvas.width - 170);
            ctx.fillStyle = '#222522';
            for (const line of lines) { if (y > canvas.height - 52) break; ctx.fillText(line, 96, y); y += 46; }
            y += 12;
        }
    } else {
        ctx.fillStyle = '#efe69a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#292716';
        let font = 44;
        ctx.font = `600 ${font}px "Segoe Print", "Trebuchet MS", sans-serif`;
        let lines = wrapLines(ctx, items[0]?.text ?? '', canvas.width - 54);
        while (lines.length * font * 1.18 > canvas.height - 52 && font > 24) {
            font -= 3; ctx.font = `600 ${font}px "Segoe Print", "Trebuchet MS", sans-serif`;
            lines = wrapLines(ctx, items[0]?.text ?? '', canvas.width - 54);
        }
        let y = Math.max(28, (canvas.height - lines.length * font * 1.15) * 0.45);
        for (const line of lines) { ctx.fillText(line, 28, y); y += font * 1.15; }
        ctx.fillStyle = '#c9bf6c'; ctx.fillRect(0, 0, canvas.width, 18);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function addBox(THREE, parent, resources, material, scale, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(resources.unitBox, material);
    mesh.scale.set(Math.max(0.002, scale[0]), Math.max(0.002, scale[1]), Math.max(0.002, scale[2]));
    mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
}

function addPlane(THREE, parent, resources, texture, size, position, rotation = [0, 0, 0]) {
    if (!texture) return null;
    resources.texture(texture);
    const material = resources.material(() => new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(resources.unitPlane, material);
    mesh.scale.set(size[0], size[1], 1);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(mesh);
    return mesh;
}

function buildPostIts(THREE, root, resources, layout) {
    const paperColors = [0xeadf84, 0xf0e69a, 0xe6d978];
    const mats = paperColors.map(color => resources.material(() => new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0 })));
    const adhesive = resources.material(() => new THREE.MeshStandardMaterial({ color: 0xc7bd68, roughness: 0.96 }));
    const parent = new THREE.Group(); parent.name = 'spawn-todo:post-its'; root.add(parent);
    for (let index = 0; index < layout.elements.length; index++) {
        const note = layout.elements[index];
        const group = new THREE.Group();
        group.name = `spawn-todo:item:${note.item.id}`;
        group.position.set(note.x, note.y, note.z); group.rotation.y = note.rotY;
        group.userData = { todoItemId: note.item.id, todoText: note.item.text, todoPresentation: 'post-it' };
        parent.add(group);
        addBox(THREE, group, resources, mats[index % mats.length], [note.width, 0.0028, note.depth], [0, 0, 0]);
        addBox(THREE, group, resources, adhesive, [note.width * 0.92, 0.0016, note.depth * 0.13], [0, 0.0021, -note.depth * 0.42]);
        const texture = canvasTexture(THREE, 'post-it', [note.item]);
        addPlane(THREE, group, resources, texture, [note.width * 0.94, note.depth * 0.86], [0, 0.0033, note.depth * 0.025], [-Math.PI / 2, 0, 0]);
    }
    return parent;
}

function buildClipboards(THREE, root, resources, layout) {
    const wood = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x71583e, roughness: 0.9 }));
    const paper = resources.material(() => new THREE.MeshStandardMaterial({ color: 0xe9e5da, roughness: 0.96 }));
    const metal = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x707575, roughness: 0.35, metalness: 0.72 }));
    const parent = new THREE.Group(); parent.name = 'spawn-todo:clipboards'; root.add(parent);
    for (const board of layout.elements) {
        const group = new THREE.Group(); group.position.set(board.x, board.y, board.z); group.rotation.y = board.rotY;
        group.name = `spawn-todo:clipboard:${board.pageIndex + 1}`;
        group.userData = { todoItemIds: board.items.map(item => item.id), todoPresentation: 'clipboard', pageIndex: board.pageIndex };
        parent.add(group);
        addBox(THREE, group, resources, wood, [board.width, 0.022, board.depth], [0, 0, 0]);
        addBox(THREE, group, resources, paper, [board.width * 0.90, 0.004, board.depth * 0.88], [0, 0.014, board.depth * 0.015]);
        addBox(THREE, group, resources, metal, [board.width * 0.34, 0.034, board.depth * 0.09], [0, 0.035, -board.depth * 0.42]);
        addBox(THREE, group, resources, metal, [board.width * 0.17, 0.015, board.depth * 0.04], [0, 0.052, -board.depth * 0.39]);
        const texture = canvasTexture(THREE, 'clipboard', board.items, { pageIndex: board.pageIndex, pageCount: board.pageCount });
        addPlane(THREE, group, resources, texture, [board.width * 0.86, board.depth * 0.82], [0, 0.018, board.depth * 0.03], [-Math.PI / 2, 0, 0]);
    }
    return parent;
}

function buildWhiteboards(THREE, root, resources, layout) {
    const frame = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x7b8080, roughness: 0.50, metalness: 0.42 }));
    const backing = resources.material(() => new THREE.MeshStandardMaterial({ color: 0xd9ddd8, roughness: 0.84 }));
    const tray = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x606565, roughness: 0.60, metalness: 0.28 }));
    const marker = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x202323, roughness: 0.72 }));
    const parent = new THREE.Group(); parent.name = 'spawn-todo:whiteboards'; root.add(parent);
    for (const panel of layout.elements) {
        const group = new THREE.Group(); group.position.set(panel.x, panel.y, panel.z); group.rotation.y = panel.rotY;
        group.name = `spawn-todo:whiteboard:${panel.pageIndex + 1}`;
        group.userData = { todoItemIds: panel.items.map(item => item.id), todoPresentation: 'whiteboard', wallIndex: panel.frame?.wallIndex ?? null, freestanding: panel.freestanding };
        parent.add(group);
        const w = panel.width, h = panel.height, d = panel.depth;
        addBox(THREE, group, resources, backing, [w, h, d * 0.42], [0, 0, -d * 0.16]);
        const bar = 0.055;
        addBox(THREE, group, resources, frame, [w + bar * 2, bar, d], [0, h * 0.5 + bar * 0.5, 0]);
        addBox(THREE, group, resources, frame, [w + bar * 2, bar, d], [0, -h * 0.5 - bar * 0.5, 0]);
        addBox(THREE, group, resources, frame, [bar, h, d], [-w * 0.5 - bar * 0.5, 0, 0]);
        addBox(THREE, group, resources, frame, [bar, h, d], [w * 0.5 + bar * 0.5, 0, 0]);
        addBox(THREE, group, resources, tray, [w * 0.58, 0.045, 0.14], [0, -h * 0.5 - 0.085, d * 0.72]);
        addBox(THREE, group, resources, marker, [w * 0.17, 0.022, 0.025], [-w * 0.13, -h * 0.5 - 0.058, d * 1.15]);
        addBox(THREE, group, resources, marker, [w * 0.14, 0.022, 0.025], [w * 0.10, -h * 0.5 - 0.058, d * 1.15]);
        const texture = canvasTexture(THREE, 'whiteboard', panel.items, { pageIndex: panel.pageIndex, pageCount: panel.pageCount });
        addPlane(THREE, group, resources, texture, [w * 0.96, h * 0.93], [0, 0, d * 0.55], [0, 0, 0]);
        if (panel.freestanding) {
            const floorLocalY = finite(Number(panel.floorY), panel.y - 1.18) - panel.y;
            const postTop = -h * 0.20;
            const postHeight = Math.max(0.35, postTop - floorLocalY);
            for (const sx of [-1, 1]) {
                addBox(THREE, group, resources, frame, [0.055, postHeight, 0.055], [sx * w * 0.34, floorLocalY + postHeight * 0.5, -d * 0.15]);
                addBox(THREE, group, resources, frame, [0.50, 0.045, 0.075], [sx * w * 0.34, floorLocalY + 0.024, 0]);
            }
        }
    }
    return parent;
}

function buildTerraDisplays(THREE, root, resources, layout) {
    const shell = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x0f1715, roughness: 0.36, metalness: 0.46 }));
    const rail = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x26322f, roughness: 0.48, metalness: 0.38 }));
    const led = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x5cb987, emissive: 0x316d50, emissiveIntensity: 0.8, roughness: 0.32 }));
    const conduit = resources.material(() => new THREE.MeshStandardMaterial({ color: 0x303a37, roughness: 0.74, metalness: 0.20 }));
    const parent = new THREE.Group(); parent.name = 'spawn-todo:terra-displays'; root.add(parent);
    for (const panel of layout.elements) {
        const group = new THREE.Group(); group.position.set(panel.x, panel.y, panel.z); group.rotation.y = panel.rotY;
        group.name = `spawn-todo:terra:${panel.pageIndex + 1}`;
        group.userData = { todoItemIds: panel.items.map(item => item.id), todoPresentation: 'terra-display', wallIndex: panel.frame?.wallIndex ?? null, freestanding: panel.freestanding };
        parent.add(group);
        const w = panel.width, h = panel.height, d = panel.depth;
        addBox(THREE, group, resources, shell, [w + 0.15, h + 0.15, d], [0, 0, 0]);
        addBox(THREE, group, resources, rail, [w + 0.22, 0.055, d * 1.18], [0, h * 0.5 + 0.11, -d * 0.05]);
        addBox(THREE, group, resources, rail, [w + 0.22, 0.055, d * 1.18], [0, -h * 0.5 - 0.11, -d * 0.05]);
        for (let i = 0; i < 3; i++) addBox(THREE, group, resources, led, [0.028, 0.028, 0.018], [-w * 0.43 + i * 0.045, -h * 0.5 - 0.105, d * 0.58]);
        const texture = canvasTexture(THREE, 'terra', panel.items, { pageIndex: panel.pageIndex, pageCount: panel.pageCount });
        addPlane(THREE, group, resources, texture, [w, h], [0, 0, d * 0.505 + 0.006], [0, 0, 0]);
        if (!panel.freestanding) {
            const floorY = finite(Number(panel.frame?.yMin), finite(Number(panel.y)) - 2.0);
            const drop = Math.max(0.3, panel.y - h * 0.5 - floorY);
            addBox(THREE, group, resources, conduit, [0.055, drop, 0.055], [w * 0.42, -h * 0.5 - drop * 0.5, -d * 0.58]);
        }
    }
    return parent;
}

function realizeLayout(THREE, root, layout) {
    const resources = createResources(THREE);
    let displayRoot = null;
    if (layout.mode === 'post-its') displayRoot = buildPostIts(THREE, root, resources, layout);
    else if (layout.mode === 'clipboard') displayRoot = buildClipboards(THREE, root, resources, layout);
    else if (layout.mode === 'terra-display') displayRoot = buildTerraDisplays(THREE, root, resources, layout);
    else displayRoot = buildWhiteboards(THREE, root, resources, layout);
    return { displayRoot, resources };
}

export function attachSpawnTodoDisplay({ THREE, root, plan, hostSpace = null } = {}) {
    if (!THREE || !root || !plan) return null;
    let disposed = false;
    let displayRoot = null;
    let ownedResources = null;
    const controller = {
        schema: DISPLAY_SCHEMA,
        source: 'spawn-todo-source.js',
        mode: spawnTodoDisplayMode(plan),
        itemCount: 0,
        itemIds: [],
        list: null,
        layout: null,
        ready: null,
        dispose() {
            disposed = true;
            if (displayRoot?.parent) displayRoot.parent.remove(displayRoot);
            ownedResources?.dispose?.();
            ownedResources = null;
            displayRoot = null;
        },
    };
    controller.ready = loadSpawnTodoList().then(todo => {
        if (disposed) return todo;
        controller.list = todo;
        controller.itemCount = todo.items.length;
        controller.itemIds = todo.items.map(item => item.id);
        if (!todo.items.length) return todo;
        const layout = planSpawnTodoDisplay({ plan, hostSpace, items: todo.items });
        controller.layout = layout;
        const realized = realizeLayout(THREE, root, layout);
        displayRoot = realized.displayRoot;
        ownedResources = realized.resources;
        displayRoot.userData = {
            ...(displayRoot.userData || {}),
            spawnTodoDisplaySchema: DISPLAY_SCHEMA,
            spawnTodoListSchema: todo.schema,
            spawnTodoSource: todo.source,
            spawnTodoMode: layout.mode,
            spawnTodoItemIds: controller.itemIds,
        };
        displayRoot.updateMatrixWorld?.(true);
        displayRoot.traverse?.(object => {
            object.updateMatrix?.();
            object.matrixAutoUpdate = false;
            if ('matrixWorldAutoUpdate' in object) object.matrixWorldAutoUpdate = false;
        });
        if (typeof window !== 'undefined') {
            try { window.dispatchEvent(new CustomEvent('jweb:spawn-todo-ready', { detail: controller })); }
            catch (_) { /* Semantic publication is optional; physical display is not. */ }
        }
        return todo;
    });
    return controller;
}
