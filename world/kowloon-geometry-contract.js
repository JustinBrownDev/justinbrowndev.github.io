// Pure geometry contract shared by streamed and authored Kowloon fabric.
// Topology owns seams so render slabs, collision walls, and chunk boundaries
// cannot independently invent incompatible edge offsets.

export const KOWLOON_EXTERIOR_WALL_THICKNESS = 0.16;
export const KOWLOON_SLAB_THICKNESS = 0.12;
export const KOWLOON_BOUNDARY_BARRIER_THICKNESS = 0.16;
export const KOWLOON_BOUNDARY_BARRIER_HEIGHT = 1.55;
export const KOWLOON_WALL_HALF = KOWLOON_EXTERIOR_WALL_THICKNESS * 0.5;
export const KOWLOON_BOUNDARY_BUILDING_SETBACK = KOWLOON_BOUNDARY_BARRIER_THICKNESS + KOWLOON_WALL_HALF;

const DIRS = Object.freeze([
    Object.freeze({ key: 'N', dc: 0, dr: -1 }),
    Object.freeze({ key: 'S', dc: 0, dr: 1 }),
    Object.freeze({ key: 'W', dc: -1, dr: 0 }),
    Object.freeze({ key: 'E', dc: 1, dr: 0 }),
]);

export function isKowloonSharedRoadCell(col, row, { microCells, portals, roads }) {
    if (col >= 0 && row >= 0 && col < microCells && row < microCells) return roads.has(`${col},${row}`);
    if (row === -1 && col >= 0 && col < microCells) return col === portals.north;
    if (row === microCells && col >= 0 && col < microCells) return col === portals.south;
    if (col === -1 && row >= 0 && row < microCells) return row === portals.west;
    if (col === microCells && row >= 0 && row < microCells) return row === portals.east;
    return false;
}

export function kowloonChunkBoundaryEdgeKind(cell, dir, { microCells, portals, roads }) {
    const col = cell.col + dir.dc;
    const row = cell.row + dir.dr;
    if (col >= 0 && row >= 0 && col < microCells && row < microCells) return null;
    return isKowloonSharedRoadCell(col, row, { microCells, portals, roads }) ? 'street' : 'boundary';
}

export function kowloonStreetEncroachmentAllowed(cell, dir, isRoadCell) {
    const roadCol = cell.col + dir.dc;
    const roadRow = cell.row + dir.dr;
    if (!isRoadCell(roadCol, roadRow)) return false;
    if (dir.dc !== 0) {
        return isRoadCell(roadCol, roadRow - 1) && isRoadCell(roadCol, roadRow + 1)
            && !isRoadCell(roadCol - 1, roadRow) && !isRoadCell(roadCol + 1, roadRow);
    }
    return isRoadCell(roadCol - 1, roadRow) && isRoadCell(roadCol + 1, roadRow)
        && !isRoadCell(roadCol, roadRow - 1) && !isRoadCell(roadCol, roadRow + 1);
}

export function computeKowloonModuleRect({ cellCx, cellCz, halfX, halfZ, edgeKinds, streetSetback, partySetback, boundarySetback = KOWLOON_BOUNDARY_BUILDING_SETBACK, allowStreetEncroachment = () => false }) {
    const setbackFor = sideKey => {
        const kind = edgeKinds[sideKey];
        if (kind === 'internal') return 0;
        if (kind === 'party') return partySetback;
        if (kind === 'boundary') return boundarySetback;
        if (kind === 'street') return allowStreetEncroachment(sideKey) ? streetSetback : 0;
        return 0;
    };
    const x0 = cellCx - halfX + setbackFor('W');
    const x1 = cellCx + halfX - setbackFor('E');
    const z0 = cellCz - halfZ + setbackFor('N');
    const z1 = cellCz + halfZ - setbackFor('S');
    return { cx: (x0 + x1) * 0.5, cz: (z0 + z1) * 0.5, halfX: Math.max(0.3, (x1 - x0) * 0.5), halfZ: Math.max(0.3, (z1 - z0) * 0.5) };
}

export function computeKowloonSlabRect(module, moduleByKey, level, { roof = false, wallHalf = KOWLOON_WALL_HALF } = {}) {
    const insetFor = dir => {
        if (module.edgeKinds[dir.key] !== 'internal') return wallHalf;
        const neighbor = moduleByKey.get(`${module.cell.col + dir.dc},${module.cell.row + dir.dr}`);
        if (!neighbor) return wallHalf;
        const seamOpen = roof ? neighbor.floors === module.floors : level < neighbor.floors;
        return seamOpen ? 0 : wallHalf;
    };
    const west = insetFor(DIRS[2]), east = insetFor(DIRS[3]), north = insetFor(DIRS[0]), south = insetFor(DIRS[1]);
    const x0 = module.rect.cx - module.rect.halfX + west, x1 = module.rect.cx + module.rect.halfX - east;
    const z0 = module.rect.cz - module.rect.halfZ + north, z1 = module.rect.cz + module.rect.halfZ - south;
    return { cx: (x0 + x1) * 0.5, cz: (z0 + z1) * 0.5, width: Math.max(0, x1 - x0), depth: Math.max(0, z1 - z0), x0, x1, z0, z1 };
}
