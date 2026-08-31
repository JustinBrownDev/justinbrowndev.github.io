export const BUILDING_FOOTPRINT_INVARIANT_SCHEMA = 'jweb.building-footprint-invariant.v1';

function finitePositive(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`[building-footprint] invalid ${label}: ${value}`);
    return n;
}

function finiteCoordinate(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`[building-footprint] invalid ${label}: ${value}`);
    return n;
}

function buildingModules(entities) {
    const modules = [];
    let buildings = 0;
    for (const entity of entities ?? []) {
        if (entity?.kind !== 'building') continue;
        buildings++;
        const footprint = entity.footprintModules;
        if (!Array.isArray(footprint) || !footprint.length) {
            throw new Error(`[building-footprint] building ${entity.id ?? '<unknown>'} has no footprint modules`);
        }
        footprint.forEach((module, index) => {
            const cx = finiteCoordinate(module?.cx, `${entity.id}:module:${index}.cx`);
            const cz = finiteCoordinate(module?.cz, `${entity.id}:module:${index}.cz`);
            const halfX = finitePositive(module?.halfX, `${entity.id}:module:${index}.halfX`);
            const halfZ = finitePositive(module?.halfZ, `${entity.id}:module:${index}.halfZ`);
            modules.push({
                entityId: String(entity.id ?? `building:${buildings - 1}`),
                moduleId: String(module?.key ?? module?.id ?? index),
                cx, cz, halfX, halfZ,
                minX: cx - halfX,
                maxX: cx + halfX,
                minZ: cz - halfZ,
                maxZ: cz + halfZ,
            });
        });
    }
    return { buildings, modules };
}

export function assertBuildingFootprintsDoNotOverlap(entities, { epsilon = 1e-5 } = {}) {
    const tolerance = Math.max(0, Number.isFinite(epsilon) ? epsilon : 1e-5);
    const { buildings, modules } = buildingModules(entities);
    const sorted = [...modules].sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || a.entityId.localeCompare(b.entityId) || a.moduleId.localeCompare(b.moduleId));
    let comparisons = 0;

    for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        for (let j = i + 1; j < sorted.length; j++) {
            const b = sorted[j];
            if (b.minX >= a.maxX - tolerance) break;
            if (a.entityId === b.entityId) continue;
            comparisons++;
            const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
            const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
            if (overlapX > tolerance && overlapZ > tolerance) {
                throw new Error(
                    `[building-footprint] overlap ${a.entityId}/${a.moduleId} <-> ${b.entityId}/${b.moduleId} ` +
                    `(x=${overlapX.toFixed(4)}m z=${overlapZ.toFixed(4)}m)`
                );
            }
        }
    }

    return {
        schema: BUILDING_FOOTPRINT_INVARIANT_SCHEMA,
        buildings,
        modules: modules.length,
        comparisons,
        overlaps: 0,
        epsilon: tolerance,
    };
}
