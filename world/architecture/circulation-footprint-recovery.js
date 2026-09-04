import {
    KOWLOON_BOUNDARY_BARRIER_THICKNESS,
    KOWLOON_EXTERIOR_WALL_THICKNESS,
} from '../kowloon-geometry-contract.js';

export const CIRCULATION_FOOTPRINT_RECOVERY_SCHEMA = 'jweb.circulation-footprint-recovery.v1';

function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function frozenRect(rect) {
    return Object.freeze({
        cx: Number(rect.cx), cz: Number(rect.cz),
        halfX: Number(rect.halfX), halfZ: Number(rect.halfZ),
    });
}

export function recoverCellFootprintForCirculation({
    module,
    geometryAdapter = null,
    cx0 = 0,
    cz0 = 0,
    half = 0,
    cellSize = 0,
} = {}) {
    if (!module?.rect || !module?.cell) return null;
    const original = frozenRect(module.rect);
    if (![original.cx, original.cz, original.halfX, original.halfZ].every(Number.isFinite)) return null;

    const metric = geometryAdapter?.metricForCell?.(module.cell) ?? null;
    const resolvedCellSize = Math.max(0, finite(metric?.cellSize, finite(cellSize, 0)) ?? 0);
    if (!(resolvedCellSize > 0.5)) return null;

    const cellCx = finite(metric?.x,
        finite(cx0, 0) - finite(half, 0) + (Number(module.cell.col) + 0.5) * resolvedCellSize);
    const cellCz = finite(metric?.z,
        finite(cz0, 0) - finite(half, 0) + (Number(module.cell.row) + 0.5) * resolvedCellSize);
    if (![cellCx, cellCz].every(Number.isFinite)) return null;

    const cellHalf = resolvedCellSize * 0.5;
    const boundaryInset = KOWLOON_BOUNDARY_BARRIER_THICKNESS + KOWLOON_EXTERIOR_WALL_THICKNESS * 0.5;
    const inset = side => module.edgeKinds?.[side] === 'boundary' ? boundaryInset : 0;
    const x0 = cellCx - cellHalf + inset('W');
    const x1 = cellCx + cellHalf - inset('E');
    const z0 = cellCz - cellHalf + inset('N');
    const z1 = cellCz + cellHalf - inset('S');
    if (!(x1 > x0 + 0.5) || !(z1 > z0 + 0.5)) return null;

    const rect = frozenRect({
        cx: (x0 + x1) * 0.5,
        cz: (z0 + z1) * 0.5,
        halfX: (x1 - x0) * 0.5,
        halfZ: (z1 - z0) * 0.5,
    });
    const containsOriginal = rect.cx - rect.halfX <= original.cx - original.halfX + 0.001
        && rect.cx + rect.halfX >= original.cx + original.halfX - 0.001
        && rect.cz - rect.halfZ <= original.cz - original.halfZ + 0.001
        && rect.cz + rect.halfZ >= original.cz + original.halfZ - 0.001;
    if (!containsOriginal) return null;
    const expandsX = rect.halfX > original.halfX + 0.025;
    const expandsZ = rect.halfZ > original.halfZ + 0.025;
    if (!expandsX && !expandsZ) return null;

    return Object.freeze({
        schema: CIRCULATION_FOOTPRINT_RECOVERY_SCHEMA,
        action: 'expand-primary-cell-footprint',
        moduleKey: String(module.key ?? `${module.cell.col},${module.cell.row}`),
        originalRect: original,
        rect,
        cell: Object.freeze({
            col: Number(module.cell.col), row: Number(module.cell.row),
            cx: cellCx, cz: cellCz, size: resolvedCellSize,
        }),
        boundaryInset,
    });
}
