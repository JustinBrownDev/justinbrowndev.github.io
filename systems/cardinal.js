import { QP } from '../runtime/main-quantitative-literals.js';

export const CELL_SIDE_DEFS = Object.freeze([
    Object.freeze({ key: 'N', dx: QP[1736], dz: QP[1737] }),
    Object.freeze({ key: 'S', dx: QP[1738], dz: QP[1739] }),
    Object.freeze({ key: 'W', dx: QP[1740], dz: QP[1741] }),
    Object.freeze({ key: 'E', dx: QP[1742], dz: QP[1743] }),
]);

export function outwardRotationY(nx, nz) {
    return Math.atan2(nx, nz);
}
