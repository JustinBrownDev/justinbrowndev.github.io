export function createMaterialRefinementController({ scene, camera, previewMaterial, dynamicMaterials = new Set() } = {}) {
    if (!scene || !camera || !previewMaterial) throw new Error('createMaterialRefinementController missing required arguments');
    const pending = [];
    let prepared = false;
    let restored = 0;
    let restoredMaterials = 0;
    let restoredReveals = 0;
    let total = 0;
    let materialTotal = 0;
    let revealTotal = 0;
    let lastPriorityX = Number.NaN;
    let lastPriorityZ = Number.NaN;

    function ownerPosition(obj) {
        let current = obj;
        while (current?.parent && !current.userData?.__perfChunkGroup) current = current.parent;
        return current?.position ?? obj?.position ?? { x: 0, z: 0 };
    }

    function distanceSq(obj) {
        const position = ownerPosition(obj);
        const dx = (position.x ?? 0) - camera.position.x;
        const dz = (position.z ?? 0) - camera.position.z;
        return dx * dx + dz * dz;
    }

    function prepare() {
        if (prepared) return stats();
        const groups = scene.children
            .filter(root => root.userData?.__perfChunkGroup && !root.userData?.worldChunkRoot)
            .sort((a, b) => distanceSq(b) - distanceSq(a));
        for (const group of groups) {
            const groupEntries = [];
            group.traverse(obj => {
                if (!obj || obj.userData?.worldChunkRoot) return;
                if (obj.userData?.__bootstrapDeferredVisual) {
                    groupEntries.push({ kind: 'reveal', obj, visible: obj.userData.__bootstrapDeferredVisible !== false });
                    revealTotal++;
                    return;
                }
                if (!obj.isMesh || !obj.material) return;
                if (!Array.isArray(obj.material) && dynamicMaterials.has(obj.material)) return;
                groupEntries.push({ kind: 'material', obj, material: obj.material });
                obj.material = previewMaterial;
                materialTotal++;
            });
            groupEntries.reverse();
            for (const entry of groupEntries) pending.push(entry);
        }
        total = pending.length;
        prepared = true;
        reprioritize({ force: true });
        return stats();
    }

    function reprioritize({ force = false, minMovement = 3 } = {}) {
        const started = performance.now();
        if (!prepared || pending.length < 2) return Object.freeze({ sorted: false, ms: performance.now() - started, pending: pending.length });
        const dx = camera.position.x - lastPriorityX;
        const dz = camera.position.z - lastPriorityZ;
        if (!force && Number.isFinite(lastPriorityX) && dx * dx + dz * dz < minMovement * minMovement) {
            return Object.freeze({ sorted: false, ms: performance.now() - started, pending: pending.length });
        }
        pending.sort((a, b) => distanceSq(b.obj) - distanceSq(a.obj));
        lastPriorityX = camera.position.x;
        lastPriorityZ = camera.position.z;
        return Object.freeze({ sorted: true, ms: performance.now() - started, pending: pending.length });
    }

    function restoreEntry(entry) {
        if (!entry.obj?.parent) return false;
        if (entry.kind === 'reveal') {
            entry.obj.visible = entry.visible;
            delete entry.obj.userData.__bootstrapDeferredVisual;
            delete entry.obj.userData.__bootstrapDeferredVisible;
            restoredReveals++;
        } else {
            entry.obj.material = entry.material;
            restoredMaterials++;
        }
        return true;
    }

    function pump({ maxItems = 4, maxReveals = 1, maxMillis = 2, maxDistance = Infinity } = {}) {
        const started = performance.now();
        if (!prepared || !pending.length) return Object.freeze({ restored: 0, materials: 0, reveals: 0, ms: performance.now() - started });
        let done = 0;
        let materials = 0;
        let reveals = 0;
        const deferredReveals = [];
        const maxDistanceSq = maxDistance * maxDistance;
        while (pending.length && done < maxItems) {
            const entry = pending[pending.length - 1];
            if (distanceSq(entry.obj) > maxDistanceSq) break;
            pending.pop();
            if (entry.kind === 'reveal' && reveals >= maxReveals) {
                deferredReveals.push(entry);
                if (performance.now() - started >= maxMillis) break;
                continue;
            }
            if (restoreEntry(entry)) {
                restored++;
                done++;
                if (entry.kind === 'reveal') reveals++;
                else materials++;
            }
            if (performance.now() - started >= maxMillis) break;
        }
        while (deferredReveals.length) pending.push(deferredReveals.pop());
        return Object.freeze({ restored: done, materials, reveals, ms: performance.now() - started });
    }

    function restoreAll() {
        while (pending.length) {
            const entry = pending.pop();
            if (restoreEntry(entry)) restored++;
        }
        return stats();
    }

    function stats() {
        return Object.freeze({ prepared, total, materialTotal, revealTotal, pending: pending.length, restored, restoredMaterials, restoredReveals, complete: prepared && pending.length === 0 });
    }

    return Object.freeze({ prepare, reprioritize, pump, restoreAll, stats });
}
