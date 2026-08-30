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

export function createKowloonFabricEnrichment({ THREE, worldSeed = 0 } = {}) {
    if (!THREE) throw new Error('createKowloonFabricEnrichment requires THREE');

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1, false);
    const leafGeo = new THREE.PlaneGeometry(0.34, 0.42);
    const topperDomeGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const topperSpireGeo = new THREE.ConeGeometry(1, 1, 9);
    const pipeMaterials = PIPE_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.36 }));
    const awningMaterials = AWNING_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    const ivyMaterials = IVY_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
    const securityMat = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.74, metalness: 0.25 });
    const posterFallbackMat = new THREE.MeshStandardMaterial({ color: 0x97876e, emissive: 0x17110a, emissiveIntensity: 0.22, roughness: 0.8, side: THREE.DoubleSide });
    const flyerFallbackMat = new THREE.MeshStandardMaterial({ color: 0xc9b98d, roughness: 0.93, side: THREE.DoubleSide });
    const roofHardwareMat = new THREE.MeshStandardMaterial({ color: 0x555a57, roughness: 0.78, metalness: 0.32 });
    const elevatorMat = new THREE.MeshStandardMaterial({ color: 0x4d514f, roughness: 0.62, metalness: 0.48 });
    const elevatorDoorMat = new THREE.MeshStandardMaterial({ color: 0x777b78, roughness: 0.52, metalness: 0.58 });
    const plazaConcreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6862, roughness: 0.94 });
    const plazaDarkMat = new THREE.MeshStandardMaterial({ color: 0x292c2d, roughness: 0.78, metalness: 0.18 });
    const plazaGlassMat = new THREE.MeshStandardMaterial({ color: 0x6e9093, emissive: 0x102426, emissiveIntensity: 0.22, roughness: 0.34, transparent: true, opacity: 0.72 });
    const plazaGreenMat = new THREE.MeshStandardMaterial({ color: 0x445b39, roughness: 1 });
    const plazaTapeMat = new THREE.MeshStandardMaterial({ color: 0xc8ba3e, emissive: 0x292306, emissiveIntensity: 0.18, roughness: 0.74 });
    const interiorWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c4b3c, roughness: 0.91 });
    const interiorMetalMat = new THREE.MeshStandardMaterial({ color: 0x545957, roughness: 0.76, metalness: 0.28 });
    const topperMat = new THREE.MeshStandardMaterial({ color: 0x4c5558, roughness: 0.62, metalness: 0.38 });
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

        if (rng() < 0.64) {
            const flyerCount = 1 + (rng() < 0.32 ? 1 : 0) + (rng() < 0.10 ? 1 : 0);
            for (let i = 0; i < flyerCount; i++) {
                const flyerRng = mulberry32(taskSeed(chunk, entity.id, 'flyer-label', i));
                const basePair = pickMassiveNoisePair(flyerRng);
                const [title, subtitle] = textExciter.pairFor(chunk, entity.id, `flyer-label:${i}`, basePair);
                tasks.push({
                    kind: 'flyer', entityId: entity.id, side: i ? side : front, facadeIndex: i ? sideFacadeIndex : frontFacadeIndex,
                    y: 1.05 + rng() * 1.55, along: (rng() - 0.5) * 1.35,
                    width: 0.42 + rng() * 0.28, height: 0.54 + rng() * 0.34,
                    title, subtitle, seed: taskSeed(chunk, entity.id, 'flyer', i),
                });
            }
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
        if (floors >= 3 && rng() < 0.28) {
            tasks.push({
                kind: 'elevator-hardware', entityId: entity.id, side: back, facadeIndex: backFacadeIndex,
                y: 1.15, along: (rng() - 0.5) * 0.55, seed: taskSeed(chunk, entity.id, 'elevator-hardware'),
            });
        }
        if (rng() < 0.82) tasks.push({
            kind: 'roof-clutter', entityId: entity.id, seed: taskSeed(chunk, entity.id, 'roof-clutter'),
            count: 3 + Math.floor(rng() * (3 + Math.max(0, entity.kowloonIntensity || 0) * 4)),
        });
        if (tasks.some(task => task.kind === 'graffiti') && rng() < 0.46) tasks.push({
            kind: 'spray-cans', entityId: entity.id, side, facadeIndex: sideFacadeIndex,
            seed: taskSeed(chunk, entity.id, 'spray-cans'),
        });
        if (!entity.suppressInteriorEnrichment && entity.footprintModules?.length) {
            const classes = ['shelf', 'desk', 'crate', 'chair', 'plant'];
            const count = 1 + Math.floor(rng() * 3);
            for (let i = 0; i < count; i++) {
                const module = entity.footprintModules[Math.floor(rng() * entity.footprintModules.length) % entity.footprintModules.length];
                tasks.push({
                    kind: 'interior-prop', entityId: entity.id, moduleKey: module.key,
                    propClass: classes[(taskSeed(chunk, entity.id, 'interior-prop-class', i) + i) % classes.length],
                    seed: taskSeed(chunk, entity.id, 'interior-prop', i),
                });
            }
        }
        if (entity.roofTopper && entity.roofTopper !== 'none') tasks.push({
            kind: 'roof-topper', entityId: entity.id, topper: entity.roofTopper,
            seed: taskSeed(chunk, entity.id, 'roof-topper'),
        });
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

        // The old authored plaza vocabulary is now universal content language.
        // Structural ground/climb topology remains owned by KowloonFabricEngine;
        // these semantic features refine on top of that same chunk-owned payload.
        const kinds = ['statue', 'construction-zone', 'crime-scene', 'newsstand', 'phone-booth', 'atm-kiosk', 'park', 'mega-billboard'];
        const offset = taskSeed(chunk, entity.id, 'plaza-feature-order') % kinds.length;
        const count = 1 + (rng() < 0.30 + Math.max(0, entity.kowloonIntensity || 0) * 0.24 ? 1 : 0);
        for (let i = 0; i < count; i++) {
            const feature = kinds[(offset + i * 3) % kinds.length];
            const seed = taskSeed(chunk, entity.id, `plaza-${feature}`, i);
            const labelRng = mulberry32(seed ^ 0x6a09e667);
            const [title, subtitle] = textExciter.pairFor(chunk, entity.id, `plaza-${feature}`, pickMassiveNoisePair(labelRng));
            tasks.push({
                kind: `plaza-${feature}`,
                entityId: entity.id,
                x: entity.x + (rng() - 0.5) * Math.max(1.1, (entity.halfX || 2) * 0.82),
                z: entity.z + (rng() - 0.5) * Math.max(1.1, (entity.halfZ || 2) * 0.82),
                title, subtitle, seed,
            });
        }
        return tasks;
    }

    const DETAIL_KIND_PRIORITY = Object.freeze({
        sign: 0, awning: 0, graffiti: 0, flyer: 0,
        pipe: 1, ivy: 1, security: 1, 'elevator-hardware': 1,
        'roof-clutter': 2, 'roof-topper': 2,
        marker: 3, 'spray-cans': 3,
        'interior-prop': 4,
    });

    const FIRST_PASS_CLASS_ORDER = Object.freeze(['facade', 'fixture', 'cap']);
    function firstPassClass(kind) {
        if (kind === 'sign' || kind === 'awning' || kind === 'graffiti' || kind === 'flyer') return 'facade';
        if (kind === 'pipe' || kind === 'ivy' || kind === 'security' || kind === 'elevator-hardware' || kind === 'spray-cans') return 'fixture';
        if (kind === 'interior-prop') return 'hidden';
        if (kind === 'roof-clutter' || kind === 'roof-topper' || kind === 'marker' || String(kind).startsWith('plaza-')) return 'cap';
        return 'other';
    }

    function detailPriority(kind) {
        if (String(kind).startsWith('plaza-')) return 2;
        return DETAIL_KIND_PRIORITY[kind] ?? 3;
    }

    function sortedEntityTasks(queue) {
        return queue.sort((a, b) =>
            detailPriority(a.kind) - detailPriority(b.kind)
            || a.kind.localeCompare(b.kind)
            || (a.seed >>> 0) - (b.seed >>> 0));
    }

    function chooseFirstPassBundle(queue) {
        const visibleCandidates = queue.filter(task => firstPassClass(task.kind) !== 'hidden');
        const target = Math.min(3, visibleCandidates.length);
        if (!target) return [];
        const chosen = [];
        const chosenSet = new Set();
        for (const className of FIRST_PASS_CLASS_ORDER) {
            const task = visibleCandidates.find(candidate => !chosenSet.has(candidate) && firstPassClass(candidate.kind) === className);
            if (!task) continue;
            chosen.push(task);
            chosenSet.add(task);
            if (chosen.length >= target) break;
        }
        for (const task of visibleCandidates) {
            if (chosen.length >= target) break;
            if (chosenSet.has(task)) continue;
            chosen.push(task);
            chosenSet.add(task);
        }
        return chosen;
    }

    function layerTasksAcrossEntities(tasks) {
        const byEntity = new Map();
        for (const task of tasks) {
            const id = String(task.entityId ?? '');
            if (!byEntity.has(id)) byEntity.set(id, []);
            byEntity.get(id).push(task);
        }
        const queues = [...byEntity.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([id, raw]) => {
                const all = sortedEntityTasks(raw);
                const firstPass = chooseFirstPassBundle(all);
                const firstSet = new Set(firstPass);
                const deep = all.filter(task => !firstSet.has(task));
                firstPass.forEach((task, index) => {
                    task.firstPassBundle = true;
                    task.firstPassBundleIndex = index;
                    task.firstPassClass = firstPassClass(task.kind);
                });
                return { id, firstPass, deep, firstPassTarget: firstPass.length };
            });

        const layered = [];
        for (let layer = 0; layer < 3; layer++) {
            for (const queue of queues) {
                if (queue.firstPass[layer]) layered.push(queue.firstPass[layer]);
            }
        }
        for (let layer = 0; ; layer++) {
            let emitted = 0;
            for (const queue of queues) {
                if (layer >= queue.deep.length) continue;
                layered.push(queue.deep[layer]);
                emitted++;
            }
            if (!emitted) break;
        }

        const firstPassTargetByEntity = Object.fromEntries(queues.map(queue => [queue.id, queue.firstPassTarget]));
        const firstPassPublicationTarget = queues.reduce((sum, queue) => sum + queue.firstPassTarget, 0);
        const firstPassEntityTarget = queues.filter(queue => queue.firstPassTarget > 0).length;
        return { tasks: layered, firstPassTargetByEntity, firstPassPublicationTarget, firstPassEntityTarget };
    }

    function plan(chunk, entities) {
        const tasks = [];
        for (const entity of entities || []) {
            if (entity.kind === 'building' || entity.kind === 'district-landmark') tasks.push(...planBuildingTasks(chunk, entity));
            else if (entity.kind === 'plaza') tasks.push(...planPlazaTasks(chunk, entity));
        }
        // VISIBLE CONVERGENCE: preserve the exact deterministic corpus, but make
        // first-pass population a conspicuous per-entity bundle rather than a
        // single sticker-sized task. Each entity gets up to three early features
        // spanning facade identity, physical fixture, and roof/plaza/cap content.
        const layered = layerTasksAcrossEntities(tasks);
        return {
            phase: layered.tasks.length ? DETAIL_PHASE.STRUCTURAL_READY : DETAIL_PHASE.READY,
            tasks: layered.tasks,
            firstPassTargetByEntity: layered.firstPassTargetByEntity,
            firstPassPublishedByEntity: {},
            firstPassPublicationTarget: layered.firstPassPublicationTarget,
            firstPassSuccessfulPublications: 0,
            firstPassEntityTarget: layered.firstPassEntityTarget,
            firstPassEntitiesComplete: 0,
            firstPassComplete: layered.firstPassEntityTarget === 0,
            // Compatibility for older diagnostics. This is now the total number
            // of successful publications required for the semantic first pass.
            firstPassTaskCount: layered.firstPassPublicationTarget,
            cursor: 0,
            attempted: 0,
            published: 0,
            noOp: 0,
            failed: 0,
            completed: 0,
            failures: 0,
            worstStepMs: 0,
            totalStepMs: 0,
            startedAt: 0,
            completedAt: layered.tasks.length ? 0 : performance.now(),
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

    function createFlyer(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const texture = canvasTextTexture(THREE, task.title, task.subtitle, task.seed);
        const material = texture ? new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.92, side: THREE.DoubleSide, emissive: 0x080604, emissiveIntensity: 0.05,
        }) : flyerFallbackMat;
        const mesh = new THREE.Mesh(unitPlane, material);
        mesh.name = `chunk-flyer:${task.entityId}`;
        mesh.position.set(point.x, point.y, point.z);
        mesh.rotation.y = point.ry;
        mesh.scale.set(task.width, task.height, 1);
        mesh.userData.chunkCosmetic = true;
        mesh.userData.detailKind = task.kind;
        if (texture) { payload.detailResources.textures.add(texture); payload.detailResources.materials.add(material); }
        return mesh;
    }

    function primaryRoofSpec(entity) {
        const primaryKey = entity.primaryCell ? `${entity.primaryCell.col},${entity.primaryCell.row}` : null;
        const module = entity.footprintModules?.find(candidate => candidate.key === primaryKey) ?? entity.footprintModules?.[0];
        if (!module) return { x: entity.x, z: entity.z, halfX: entity.halfX ?? 2, halfZ: entity.halfZ ?? 2, y: (entity.floors || 1) * (entity.floorH || 3.15) };
        return { x: module.cx, z: module.cz, halfX: module.halfX, halfZ: module.halfZ, y: module.floors * (entity.floorH || 3.15) };
    }

    function createRoofClutter(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const roof = primaryRoofSpec(entity);
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-roof-clutter:${task.entityId}`;
        const count = Math.max(2, task.count || 3);
        for (let i = 0; i < count; i++) {
            const box = new THREE.Mesh(unitBox, roofHardwareMat);
            const w = 0.22 + rng() * 0.62, d = 0.22 + rng() * 0.58, h = 0.18 + rng() * 0.75;
            box.scale.set(w, h, d);
            box.position.set(
                roof.x + (rng() - 0.5) * Math.max(0.2, roof.halfX * 1.35 - w),
                roof.y + h * 0.5 + 0.03,
                roof.z + (rng() - 0.5) * Math.max(0.2, roof.halfZ * 1.35 - d)
            );
            box.rotation.y = rng() * Math.PI;
            group.add(box);
        }
        if (rng() < 0.62) {
            const mast = new THREE.Mesh(pipeGeo, roofHardwareMat);
            const h = 1.0 + rng() * 2.7;
            mast.scale.set(1.15, h, 1.15);
            mast.position.set(roof.x + (rng() - 0.5) * roof.halfX, roof.y + h * 0.5, roof.z + (rng() - 0.5) * roof.halfZ);
            group.add(mast);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
    }

    function createElevatorHardware(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, task.along, task.y, task.facadeIndex);
        const group = new THREE.Group();
        group.name = `chunk-elevator-hardware:${task.entityId}`;
        group.position.set(point.x, 0, point.z);
        group.rotation.y = point.ry;
        const frame = new THREE.Mesh(unitBox, elevatorMat);
        frame.scale.set(1.42, 2.28, 0.10);
        frame.position.set(0, 1.14, 0.055);
        const left = new THREE.Mesh(unitBox, elevatorDoorMat);
        const right = new THREE.Mesh(unitBox, elevatorDoorMat);
        left.scale.set(0.62, 1.98, 0.045); right.scale.copy(left.scale);
        left.position.set(-0.315, 1.04, 0.115); right.position.set(0.315, 1.04, 0.115);
        const button = new THREE.Mesh(unitBox, awningMaterials[task.seed % awningMaterials.length]);
        button.scale.set(0.10, 0.16, 0.05); button.position.set(0.82, 1.08, 0.15);
        group.add(frame, left, right, button);
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
    }

    function createSprayCans(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const point = facadePoint(entity, task.side, 0.35, 0.12, task.facadeIndex);
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-spray-cans:${task.entityId}`;
        for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
            const can = new THREE.Mesh(pipeGeo, awningMaterials[(task.seed + i) % awningMaterials.length]);
            can.scale.set(1.7, 0.18 + rng() * 0.08, 1.7);
            can.position.set(point.x + (rng() - 0.5) * 0.55, 0.10, point.z + (rng() - 0.5) * 0.55);
            can.rotation.z = (rng() - 0.5) * 0.7;
            group.add(can);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        return group;
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

    function createInteriorProp(payload, task) {
        const entity = getEntity(payload, task.entityId);
        const module = entity?.footprintModules?.find(candidate => candidate.key === task.moduleKey) ?? entity?.footprintModules?.[0];
        if (!entity || !module) return null;
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-interior-${task.propClass}:${task.entityId}`;
        const marginX = Math.max(0.25, module.halfX * 0.62);
        const marginZ = Math.max(0.25, module.halfZ * 0.62);
        group.position.set(module.cx + (rng() - 0.5) * marginX, 0, module.cz + (rng() - 0.5) * marginZ);
        group.rotation.y = Math.round(rng() * 3) * Math.PI * 0.5;
        const box = (mat, x, y, z, sx, sy, sz) => {
            const mesh = new THREE.Mesh(unitBox, mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
        };
        if (task.propClass === 'shelf') {
            box(interiorWoodMat, 0, 0.95, 0, 1.15, 1.9, 0.32);
            for (const y of [0.35, 0.82, 1.28, 1.68]) box(interiorMetalMat, 0, y, 0.19, 1.05, 0.06, 0.34);
        } else if (task.propClass === 'desk') {
            box(interiorWoodMat, 0, 0.72, 0, 1.25, 0.12, 0.68);
            for (const x of [-0.48, 0.48]) for (const z of [-0.22, 0.22]) box(interiorMetalMat, x, 0.36, z, 0.08, 0.72, 0.08);
        } else if (task.propClass === 'crate') {
            box(interiorWoodMat, 0, 0.42, 0, 0.78, 0.84, 0.78);
            box(interiorMetalMat, 0, 0.42, 0.405, 0.82, 0.08, 0.04);
        } else if (task.propClass === 'chair') {
            box(interiorWoodMat, 0, 0.48, 0, 0.52, 0.10, 0.52);
            box(interiorWoodMat, 0, 0.92, -0.22, 0.52, 0.82, 0.10);
            for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) box(interiorMetalMat, x, 0.24, z, 0.06, 0.48, 0.06);
        } else {
            box(plazaConcreteMat, 0, 0.22, 0, 0.48, 0.44, 0.48);
            box(interiorWoodMat, 0, 0.72, 0, 0.10, 0.78, 0.10);
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), plazaGreenMat);
            crown.position.set(0, 1.18, 0); group.add(crown);
        }
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
        group.userData.semanticClass = task.propClass;
        return group;
    }

    function createRoofTopper(payload, task) {
        const entity = getEntity(payload, task.entityId);
        if (!entity) return null;
        const roof = primaryRoofSpec(entity);
        const mesh = new THREE.Mesh(task.topper === 'dome' ? topperDomeGeo : topperSpireGeo, topperMat);
        mesh.name = `chunk-roof-topper:${task.topper}:${task.entityId}`;
        if (task.topper === 'dome') {
            const radius = Math.max(0.55, Math.min(1.75, Math.min(roof.halfX, roof.halfZ) * 0.48));
            mesh.scale.set(radius, radius * 0.62, radius);
            mesh.position.set(roof.x, roof.y + 0.02, roof.z);
        } else {
            const h = 1.8 + (task.seed % 260) / 100;
            const r = 0.32 + ((task.seed >>> 8) % 36) / 100;
            mesh.scale.set(r, h, r);
            mesh.position.set(roof.x, roof.y + h * 0.5, roof.z);
        }
        mesh.userData.chunkCosmetic = true;
        mesh.userData.detailKind = task.kind;
        return mesh;
    }

    function createPlazaFeature(payload, task) {
        const rng = mulberry32(task.seed);
        const group = new THREE.Group();
        group.name = `chunk-${task.kind}:${task.entityId}`;
        group.position.set(task.x, 0, task.z);
        const addBox = (material, x, y, z, sx, sy, sz, ry = 0) => {
            const mesh = new THREE.Mesh(unitBox, material);
            mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = ry;
            group.add(mesh); return mesh;
        };
        const addLabel = (width = 1.4, height = 0.58, y = 1.5, z = 0.36) => {
            const texture = canvasTextTexture(THREE, task.title, task.subtitle, task.seed);
            const material = texture ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, emissive: 0x11100a, emissiveIntensity: 0.18, side: THREE.DoubleSide }) : posterFallbackMat;
            const panel = new THREE.Mesh(unitPlane, material);
            panel.position.set(0, y, z); panel.scale.set(width, height, 1);
            group.add(panel);
            if (texture) { payload.detailResources.textures.add(texture); payload.detailResources.materials.add(material); }
        };
        switch (task.kind) {
            case 'plaza-statue': {
                addBox(plazaConcreteMat, 0, 0.22, 0, 1.15, 0.44, 1.15);
                addBox(roofHardwareMat, 0, 1.18, 0, 0.38, 1.55, 0.38, rng() * 0.5);
                addBox(roofHardwareMat, 0.16, 2.04, 0, 0.48, 0.36, 0.42, rng() * 0.7);
                break;
            }
            case 'plaza-construction-zone': {
                for (const side of [-1, 1]) addBox(plazaTapeMat, side * 0.72, 0.62, 0, 1.15, 0.12, 0.10, side * 0.08);
                for (const x of [-0.95, 0.95]) addBox(plazaDarkMat, x, 0.36, 0, 0.10, 0.72, 0.10);
                for (let i = 0; i < 3; i++) addBox(awningMaterials[(task.seed+i)%awningMaterials.length], -0.55 + i*0.55, 0.22, 0.72, 0.22, 0.44, 0.22);
                break;
            }
            case 'plaza-crime-scene': {
                for (const z of [-0.65, 0.65]) addBox(plazaTapeMat, 0, 0.62, z, 1.55, 0.055, 0.055);
                for (const x of [-0.8, 0.8]) addBox(plazaTapeMat, x, 0.62, 0, 0.055, 0.055, 1.35);
                const trace = addBox(flyerFallbackMat, 0.12, 0.014, -0.08, 0.9, 0.025, 0.32, rng() * Math.PI);
                trace.userData.chunkCosmetic = true;
                break;
            }
            case 'plaza-newsstand': {
                addBox(plazaDarkMat, 0, 0.86, 0, 1.55, 1.72, 0.95);
                addBox(awningMaterials[task.seed%awningMaterials.length], 0, 1.82, 0.05, 1.78, 0.14, 1.18);
                addLabel(1.35, 0.48, 1.34, 0.50);
                break;
            }
            case 'plaza-phone-booth': {
                addBox(plazaDarkMat, 0, 1.08, 0, 0.88, 2.16, 0.88);
                addBox(plazaGlassMat, 0, 1.10, 0.46, 0.66, 1.55, 0.035);
                addLabel(0.68, 0.28, 1.90, 0.49);
                break;
            }
            case 'plaza-atm-kiosk': {
                addBox(plazaDarkMat, 0, 0.92, 0, 1.02, 1.84, 0.78);
                addBox(elevatorDoorMat, 0, 1.12, 0.42, 0.58, 0.48, 0.055);
                addLabel(0.72, 0.28, 1.62, 0.43);
                break;
            }
            case 'plaza-park': {
                for (let i = 0; i < 3; i++) {
                    const x = (rng()-0.5)*1.8, z = (rng()-0.5)*1.8;
                    addBox(roofHardwareMat, x, 0.55, z, 0.16, 1.10, 0.16);
                    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.46 + rng()*0.18, 7, 5), plazaGreenMat);
                    crown.position.set(x, 1.38, z); group.add(crown);
                }
                addBox(plazaConcreteMat, 0, 0.28, -0.85, 1.35, 0.15, 0.42);
                break;
            }
            case 'plaza-mega-billboard': {
                for (const x of [-0.85, 0.85]) addBox(plazaDarkMat, x, 1.45, 0, 0.13, 2.90, 0.13);
                addBox(plazaDarkMat, 0, 2.65, 0, 2.25, 1.12, 0.12);
                addLabel(2.05, 0.92, 2.65, 0.07);
                break;
            }
            default: return null;
        }
        group.rotation.y = (rng() - 0.5) * 0.32;
        group.userData.chunkCosmetic = true;
        group.userData.detailKind = task.kind;
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
        else if (task.kind === 'flyer') object = createFlyer(payload, task);
        else if (task.kind === 'pipe') object = createPipe(payload, task);
        else if (task.kind === 'awning') object = createAwning(payload, task);
        else if (task.kind === 'ivy') object = createIvy(payload, task);
        else if (task.kind === 'security') object = createSecurity(payload, task);
        else if (task.kind === 'elevator-hardware') object = createElevatorHardware(payload, task);
        else if (task.kind === 'roof-clutter') object = createRoofClutter(payload, task);
        else if (task.kind === 'spray-cans') object = createSprayCans(payload, task);
        else if (task.kind === 'interior-prop') object = createInteriorProp(payload, task);
        else if (task.kind === 'roof-topper') object = createRoofTopper(payload, task);
        else if (task.kind.startsWith('plaza-')) object = createPlazaFeature(payload, task);
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
        let attempted = 0;
        let published = 0;
        let noOp = 0;
        let failed = 0;
        const stepCap = Math.max(1, Math.floor(maxSteps));
        const timeCap = Number.isFinite(maxMillis) ? Math.max(0.1, maxMillis) : Infinity;
        while (state.cursor < state.tasks.length && steps < stepCap) {
            const task = state.tasks[state.cursor++];
            const stepStart = performance.now();
            attempted++;
            state.attempted++;
            try {
                const didPublish = applyTask(chunk, payload, task);
                if (didPublish) {
                    published++;
                    state.published++;
                    state.completed = state.published;
                    const entityId = String(task.entityId ?? '');
                    const target = Number(state.firstPassTargetByEntity?.[entityId]) || 0;
                    const before = Number(state.firstPassPublishedByEntity?.[entityId]) || 0;
                    const after = before + 1;
                    state.firstPassPublishedByEntity[entityId] = after;
                    if (before < target) {
                        state.firstPassSuccessfulPublications++;
                        if (after >= target) state.firstPassEntitiesComplete++;
                    }
                    state.firstPassComplete = state.firstPassEntitiesComplete >= state.firstPassEntityTarget;
                } else {
                    noOp++;
                    state.noOp++;
                }
            } catch (error) {
                failed++;
                state.failed++;
                state.failures = state.failed;
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
            attempted,
            published,
            noOp,
            failed,
            complete,
            pending: Math.max(0, state.tasks.length - state.cursor),
            elapsedMs: performance.now() - start,
            lastKind: state.lastKind ?? null,
            firstPassComplete: !!state.firstPassComplete,
            firstPassEntitiesComplete: state.firstPassEntitiesComplete,
            firstPassEntityTarget: state.firstPassEntityTarget,
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
        topperDomeGeo.dispose();
        topperSpireGeo.dispose();
        for (const material of [...pipeMaterials, ...awningMaterials, ...ivyMaterials, securityMat, posterFallbackMat, flyerFallbackMat, roofHardwareMat, elevatorMat, elevatorDoorMat, plazaConcreteMat, plazaDarkMat, plazaGlassMat, plazaGreenMat, plazaTapeMat, interiorWoodMat, interiorMetalMat, topperMat]) material.dispose();
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
