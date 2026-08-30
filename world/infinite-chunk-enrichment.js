import { hashString32 } from '../world-chunk-streamer.js';
import { pickMassiveNoisePair, pickPoetryTag } from '../noise-data-bootstrap.js';
import { BASE_GRAFFITI_TAGS } from '../content/graffiti-content.js';
import { createProceduralTextExciter } from './procedural-text-exciter.js';

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

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pick(rng, values) { return values[Math.floor(rng() * values.length) % values.length]; }

const DETAIL_PHASE = Object.freeze({
    STRUCTURAL_READY: 'structural-ready',
    REFINING: 'refining',
    READY: 'ready',
    DISPOSED: 'disposed',
});

const SIGN_BACKGROUNDS = Object.freeze(['#171717', '#231f1b', '#0d1d1f', '#271519', '#141922']);
const SIGN_INKS = Object.freeze(['#f5e7c8', '#f7d95d', '#b8e7df', '#ffb0b0', '#d6c7ff']);
const AWNING_COLORS = Object.freeze([0x6b3d3b, 0x35595f, 0x6a5d36, 0x4d496d, 0x5e4430]);
const PIPE_COLORS = Object.freeze([0x5f625f, 0x725d4a, 0x40565a, 0x615959]);
const IVY_COLORS = Object.freeze([0x394f32, 0x465a35, 0x2f4634, 0x52603b]);

function facadePoint(entity, side, along = 0, y = 2, facadeIndex = null) {
    const facade = Number.isInteger(facadeIndex) ? entity.facades?.[facadeIndex] : null;
    const x0 = facade?.x ?? entity.x;
    const z0 = facade?.z ?? entity.z;
    const halfX = facade?.halfX ?? entity.halfX ?? 2;
    const halfZ = facade?.halfZ ?? entity.halfZ ?? 2;
    const actualSide = facade?.side ?? side;
    if (actualSide === 'north') return { x: x0 + along * halfX, y, z: z0 - halfZ - 0.02, ry: 0 };
    if (actualSide === 'south') return { x: x0 - along * halfX, y, z: z0 + halfZ + 0.02, ry: Math.PI };
    if (actualSide === 'west') return { x: x0 - halfX - 0.02, y, z: z0 - along * halfZ, ry: Math.PI * 0.5 };
    return { x: x0 + halfX + 0.02, y, z: z0 + along * halfZ, ry: -Math.PI * 0.5 };
}

function chooseFacadeIndex(entity, rng, preferredSide = null) {
    const facades = entity.facades || [];
    if (!facades.length) return null;
    const candidates = [];
    for (let i = 0; i < facades.length; i++) {
        if (!preferredSide || facades[i].side === preferredSide) candidates.push(i);
    }
    const pool = candidates.length ? candidates : facades.map((_, i) => i);
    return pool[Math.floor(rng() * pool.length) % pool.length];
}

function oppositeSide(side) {
    if (side === 'north') return 'south';
    if (side === 'south') return 'north';
    if (side === 'west') return 'east';
    return 'west';
}

function adjacentSide(side, clockwise) {
    const sides = ['north', 'east', 'south', 'west'];
    const i = sides.indexOf(side);
    return sides[(i + (clockwise ? 1 : 3)) % 4];
}

function canvasTextTexture(THREE, title, subtitle, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(seed);
    ctx.fillStyle = pick(rng, SIGN_BACKGROUNDS);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = pick(rng, SIGN_INKS);
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textBaseline = 'middle';
    ctx.font = '700 32px monospace';
    const fit = (text, max) => {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        if (ctx.measureText(s).width <= max) return s;
        let lo = 4, hi = s.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) * 0.5);
            if (ctx.measureText(`${s.slice(0, mid)}…`).width <= max) lo = mid;
            else hi = mid - 1;
        }
        return `${s.slice(0, lo)}…`;
    };
    ctx.fillText(fit(title, 342), 24, 60);
    ctx.font = '18px monospace';
    ctx.globalAlpha = 0.78;
    ctx.fillText(fit(subtitle, 342), 24, 115);
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function graffitiTexture(THREE, text, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rng = mulberry32(seed);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(12, 52);
    ctx.rotate((rng() - 0.5) * 0.10);
    ctx.font = `700 ${34 + Math.floor(rng() * 12)}px monospace`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.fillStyle = pick(rng, SIGN_INKS);
    const clipped = String(text ?? 'NO SIGNAL').replace(/\s+/g, ' ').slice(0, 22);
    ctx.strokeText(clipped, 0, 0);
    ctx.fillText(clipped, 0, 0);
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function freezeObject(object) {
    object.updateMatrix?.();
    object.updateMatrixWorld?.(true);
    object.matrixAutoUpdate = false;
    if ('matrixWorldAutoUpdate' in object) object.matrixWorldAutoUpdate = false;
}

export function createInfiniteChunkEnrichment({ THREE, worldSeed = 0 } = {}) {
    if (!THREE) throw new Error('createInfiniteChunkEnrichment requires THREE');

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1, false);
    const leafGeo = new THREE.PlaneGeometry(0.34, 0.42);
    const pipeMaterials = PIPE_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.36 }));
    const awningMaterials = AWNING_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    const ivyMaterials = IVY_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
    const securityMat = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.74, metalness: 0.25 });
    const posterFallbackMat = new THREE.MeshStandardMaterial({ color: 0x97876e, emissive: 0x17110a, emissiveIntensity: 0.22, roughness: 0.8, side: THREE.DoubleSide });
    const textExciter = createProceduralTextExciter({ worldSeed });
    console.log('[world-text] deterministic full curated corpus exciter ready', textExciter.stats);

    function taskSeed(chunk, entityId, kind, index = 0) {
        return hashString32(`${worldSeed}:chunk-detail:${chunk.key}:${entityId}:${kind}:${index}`);
    }

    function planBuildingTasks(chunk, entity) {
        const seed = taskSeed(chunk, entity.id, 'plan');
        const rng = mulberry32(seed);
        const tasks = [];
        const front = entity.doorSide || 'north';
        const side = adjacentSide(front, rng() < 0.5);
        const back = oppositeSide(front);
        const frontFacadeIndex = chooseFacadeIndex(entity, rng, front);
        const sideFacadeIndex = chooseFacadeIndex(entity, rng, side);
        const backFacadeIndex = chooseFacadeIndex(entity, rng, back);
        const floors = Math.max(1, entity.floors || 1);
        const wallHeight = floors * (entity.floorH || 3.15);

        if (rng() < 0.88) {
            const labelRng = mulberry32(taskSeed(chunk, entity.id, 'sign-label'));
            const basePair = pickMassiveNoisePair(labelRng);
            const [title, subtitle] = textExciter.pairFor(chunk, entity.id, 'sign-label', basePair);
            tasks.push({
                kind: 'sign', entityId: entity.id, side: front, facadeIndex: frontFacadeIndex,
                y: clamp(2.45 + rng() * Math.min(2.6, wallHeight * 0.28), 2.25, Math.max(2.4, wallHeight - 0.8)),
                along: (rng() - 0.5) * 0.5,
                width: clamp((entity.halfX ?? 2) * 0.95, 1.65, 3.9),
                height: 0.86 + rng() * 0.54,
                title, subtitle,
                seed: taskSeed(chunk, entity.id, 'sign'),
            });
        }

        if (rng() < 0.76) {
            const graffitiRng = mulberry32(taskSeed(chunk, entity.id, 'graffiti-label'));
            const baseText = graffitiRng() < 0.52
                ? pickPoetryTag(graffitiRng)
                : BASE_GRAFFITI_TAGS[Math.floor(graffitiRng() * BASE_GRAFFITI_TAGS.length) % BASE_GRAFFITI_TAGS.length];
            const text = textExciter.tagFor(chunk, entity.id, 'graffiti-label', baseText);
            tasks.push({
                kind: 'graffiti', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
                y: 0.95 + rng() * 1.1, along: (rng() - 0.5) * 0.9,
                width: 1.1 + rng() * 1.8, height: 0.5 + rng() * 0.65,
                text, seed: taskSeed(chunk, entity.id, 'graffiti'),
            });
        }

        const pipeCount = 1 + (rng() < 0.38 ? 1 : 0);
        for (let i = 0; i < pipeCount; i++) {
            tasks.push({
                kind: 'pipe', entityId: entity.id, side: i ? back : side, facadeIndex: i ? backFacadeIndex : sideFacadeIndex,
                y: wallHeight * 0.48,
                height: clamp(wallHeight * (0.58 + rng() * 0.34), 2.5, wallHeight - 0.3),
                along: (rng() - 0.5) * 1.25,
                seed: taskSeed(chunk, entity.id, 'pipe', i),
            });
        }

        if (rng() < 0.58) {
            tasks.push({
                kind: 'awning', entityId: entity.id, side: front, facadeIndex: frontFacadeIndex,
                y: 2.52, along: 0,
                width: clamp((front === 'north' || front === 'south' ? entity.halfX : entity.halfZ) * 1.25, 1.6, 4.4),
                depth: 0.72 + rng() * 0.45,
                seed: taskSeed(chunk, entity.id, 'awning'),
            });
        }

        if (floors >= 2 && rng() < 0.62) {
            tasks.push({
                kind: 'ivy', entityId: entity.id, side: back, facadeIndex: backFacadeIndex,
                y: clamp(wallHeight * (0.35 + rng() * 0.26), 2.2, wallHeight - 1),
                height: clamp(wallHeight * (0.35 + rng() * 0.34), 1.8, wallHeight - 0.5),
                along: (rng() - 0.5) * 0.8,
                count: 7 + Math.floor(rng() * 9),
                seed: taskSeed(chunk, entity.id, 'ivy'),
            });
        }

        if (rng() < 0.44) {
            tasks.push({
                kind: 'security', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
                y: clamp(2.6 + rng() * 1.6, 2.5, Math.max(2.6, wallHeight - 0.7)),
                along: (rng() - 0.5) * 1.15,
                seed: taskSeed(chunk, entity.id, 'security'),
            });
        }
        return tasks;
    }

    function planPlazaTasks(chunk, entity) {
        const rng = mulberry32(taskSeed(chunk, entity.id, 'plaza-plan'));
        const tasks = [];
        if (rng() < 0.66) tasks.push({
            kind: 'marker', entityId: entity.id,
            x: entity.x + (rng() - 0.5) * 2.6,
            z: entity.z + (rng() - 0.5) * 2.6,
            y: 0.75 + rng() * 0.45,
            seed: taskSeed(chunk, entity.id, 'marker'),
        });
        return tasks;
    }

    function plan(chunk, entities) {
        const tasks = [];
        for (const entity of entities || []) {
            if (entity.kind === 'building' || entity.kind === 'district-landmark') tasks.push(...planBuildingTasks(chunk, entity));
            else if (entity.kind === 'plaza') tasks.push(...planPlazaTasks(chunk, entity));
        }
        tasks.sort((a, b) => {
            const ai = String(a.entityId), bi = String(b.entityId);
            return ai.localeCompare(bi) || a.kind.localeCompare(b.kind) || (a.seed >>> 0) - (b.seed >>> 0);
        });
        return {
            phase: tasks.length ? DETAIL_PHASE.STRUCTURAL_READY : DETAIL_PHASE.READY,
            tasks,
            cursor: 0,
            completed: 0,
            failures: 0,
            worstStepMs: 0,
            totalStepMs: 0,
            startedAt: 0,
            completedAt: tasks.length ? 0 : performance.now(),
        };
    }

    function getEntity(payload, id) {
        return payload.entities?.find(entity => entity.id === id) ?? null;
    }

    function createPanel(payload, task, graffiti = false) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const texture = graffiti
            ? graffitiTexture(THREE, task.text, task.seed)
            : canvasTextTexture(THREE, task.title, task.subtitle, task.seed);
        const material = texture
            ? new THREE.MeshStandardMaterial({
                map: texture,
                transparent: graffiti,
                alphaTest: graffiti ? 0.08 : 0,
                emissive: graffiti ? 0x070707 : 0x16110a,
                emissiveIntensity: graffiti ? 0.08 : 0.35,
                roughness: graffiti ? 0.88 : 0.64,
                side: THREE.DoubleSide,
            })
            : posterFallbackMat;
        const mesh = new THREE.Mesh(unitPlane, material);
        mesh.name = `${graffiti ? 'chunk-graffiti' : 'chunk-sign'}:${task.entityId}`;
        mesh.position.set(point.x, point.y, point.z);
        mesh.rotation.y = point.ry;
        mesh.scale.set(task.width, task.height, 1);
        mesh.userData.chunkCosmetic = true;
        mesh.userData.detailKind = task.kind;
        if (texture) {
            payload.detailResources.textures.add(texture);
            payload.detailResources.materials.add(material);
        }
        return mesh;
    }

    function createPipe(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const mat = pipeMaterials[task.seed % pipeMaterials.length];
        const mesh = new THREE.Mesh(pipeGeo, mat);
        mesh.name = `chunk-pipe:${task.entityId}`;
        mesh.position.set(point.x, task.y, point.z);
        mesh.scale.set(1, task.height, 1);
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createAwning(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const mesh = new THREE.Mesh(unitBox, awningMaterials[task.seed % awningMaterials.length]);
        mesh.name = `chunk-awning:${task.entityId}`;
        const horizontal = task.side === 'north' || task.side === 'south';
        mesh.position.set(point.x, task.y, point.z);
        if (horizontal) {
            mesh.position.z += task.side === 'north' ? -task.depth * 0.48 : task.depth * 0.48;
            mesh.scale.set(task.width, 0.14, task.depth);
        } else {
            mesh.position.x += task.side === 'west' ? -task.depth * 0.48 : task.depth * 0.48;
            mesh.scale.set(task.depth, 0.14, task.width);
        }
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createIvy(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const rng = mulberry32(task.seed);
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const mesh = new THREE.InstancedMesh(leafGeo, ivyMaterials[task.seed % ivyMaterials.length], task.count);
        mesh.name = `chunk-ivy:${task.entityId}`;
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const horizontal = task.side === 'north' || task.side === 'south';
        for (let i = 0; i < task.count; i++) {
            const vertical = (rng() - 0.5) * task.height;
            const spread = (rng() - 0.5) * 1.4;
            p.set(point.x, point.y + vertical, point.z);
            if (horizontal) p.x += spread;
            else p.z += spread;
            q.setFromAxisAngle(up, point.ry + (rng() - 0.5) * 0.22);
            s.set(0.75 + rng() * 0.85, 0.75 + rng() * 1.1, 1);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.chunkCosmetic = true;
        return mesh;
    }

    function createSecurity(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const group = new THREE.Group();
        group.name = `chunk-security:${task.entityId}`;
        group.position.set(point.x, point.y, point.z);
        group.rotation.y = point.ry;
        const arm = new THREE.Mesh(unitBox, securityMat);
        arm.scale.set(0.10, 0.10, 0.42);
        arm.position.z = 0.20;
        const body = new THREE.Mesh(unitBox, securityMat);
        body.scale.set(0.34, 0.22, 0.44);
        body.position.z = 0.50;
        body.rotation.x = -0.18;
        group.add(arm, body);
        group.userData.chunkCosmetic = true;
        return group;
    }

    function createMarker(payload, task) {
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-marker:${task.entityId}`;
        const count = 3 + Math.floor(rng() * 4);
        for (let i = 0; i < count; i++) {
            const box = new THREE.Mesh(unitBox, awningMaterials[(task.seed + i) % awningMaterials.length]);
            box.position.set(task.x + (rng() - 0.5) * 0.75, 0.12 + i * 0.19, task.z + (rng() - 0.5) * 0.75);
            box.rotation.y = rng() * Math.PI;
            box.scale.set(0.32 + rng() * 0.28, 0.18 + rng() * 0.2, 0.30 + rng() * 0.34);
            group.add(box);
        }
        group.userData.chunkCosmetic = true;
        return group;
    }

    function applyTask(chunk, payload, task) {
        if (!payload?.detailRoot || payload.disposed) return false;
        let object = null;
        if (task.kind === 'sign') object = createPanel(payload, task, false);
        else if (task.kind === 'graffiti') object = createPanel(payload, task, true);
        else if (task.kind === 'pipe') object = createPipe(payload, task);
        else if (task.kind === 'awning') object = createAwning(payload, task);
        else if (task.kind === 'ivy') object = createIvy(payload, task);
        else if (task.kind === 'security') object = createSecurity(payload, task);
        else if (task.kind === 'marker') object = createMarker(payload, task);
        if (!object) return false;
        payload.detailRoot.add(object);
        object.traverse?.(freezeObject);
        freezeObject(object);
        payload.detailRoot.updateMatrixWorld(true);
        payload.refinement.lastKind = task.kind;
        return true;
    }

    function hasPending(payload) {
        const state = payload?.refinement;
        return !!state && state.phase !== DETAIL_PHASE.DISPOSED && state.cursor < state.tasks.length;
    }

    function pump(chunk, payload, { maxSteps = 1, maxMillis = 2 } = {}) {
        const state = payload?.refinement;
        if (!state || state.phase === DETAIL_PHASE.DISPOSED) return { progressed: false, steps: 0, complete: true, pending: 0, elapsedMs: 0 };
        if (!hasPending(payload)) {
            state.phase = DETAIL_PHASE.READY;
            if (!state.completedAt) state.completedAt = performance.now();
            return { progressed: false, steps: 0, complete: true, pending: 0, elapsedMs: 0 };
        }
        if (!state.startedAt) state.startedAt = performance.now();
        state.phase = DETAIL_PHASE.REFINING;
        const start = performance.now();
        let steps = 0;
        const stepCap = Math.max(1, Math.floor(maxSteps));
        const timeCap = Number.isFinite(maxMillis) ? Math.max(0.1, maxMillis) : Infinity;
        while (state.cursor < state.tasks.length && steps < stepCap) {
            const task = state.tasks[state.cursor++];
            const stepStart = performance.now();
            try {
                applyTask(chunk, payload, task);
                state.completed++;
            } catch (error) {
                state.failures++;
                console.warn?.(`[world] chunk ${chunk.key} detail ${task.kind} failed`, error);
            }
            const stepMs = performance.now() - stepStart;
            state.totalStepMs += stepMs;
            state.worstStepMs = Math.max(state.worstStepMs, stepMs);
            steps++;
            if (performance.now() - start >= timeCap) break;
        }
        const complete = state.cursor >= state.tasks.length;
        if (complete) {
            state.phase = DETAIL_PHASE.READY;
            state.completedAt = performance.now();
        }
        return {
            progressed: steps > 0,
            steps,
            complete,
            pending: Math.max(0, state.tasks.length - state.cursor),
            elapsedMs: performance.now() - start,
            lastKind: state.lastKind ?? null,
        };
    }

    function initializePayload(chunk, payload) {
        const detailRoot = new THREE.Group();
        detailRoot.name = `world-chunk-details:${chunk.key}`;
        detailRoot.userData.worldChunkDetailRoot = true;
        detailRoot.userData.noSpatialChunk = true;
        payload.root.add(detailRoot);
        payload.detailRoot = detailRoot;
        payload.detailResources = { textures: new Set(), materials: new Set() };
        payload.refinement = plan(chunk, payload.entities);
        return payload.refinement;
    }

    function disposePayload(payload) {
        const state = payload?.refinement;
        if (state) state.phase = DETAIL_PHASE.DISPOSED;
        for (const texture of payload?.detailResources?.textures ?? []) texture.dispose?.();
        for (const material of payload?.detailResources?.materials ?? []) material.dispose?.();
        payload?.detailResources?.textures?.clear?.();
        payload?.detailResources?.materials?.clear?.();
        payload?.detailRoot?.clear?.();
        if (payload) payload.disposed = true;
    }

    function disposeShared() {
        unitBox.dispose();
        unitPlane.dispose();
        pipeGeo.dispose();
        leafGeo.dispose();
        for (const material of [...pipeMaterials, ...awningMaterials, ...ivyMaterials, securityMat, posterFallbackMat]) material.dispose();
    }

    return {
        DETAIL_PHASE,
        initializePayload,
        hasPending,
        pump,
        disposePayload,
        disposeShared,
    };
}
