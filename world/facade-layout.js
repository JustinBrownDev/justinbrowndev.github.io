import { CONFIG } from '../config/game-config.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { SpatialHash2D } from '../city-performance.js';
import { boxesIntersect } from '../systems/geometry-utils.js';
import { CELL_SIDE_DEFS, outwardRotationY } from '../systems/cardinal.js';
import { SIGN_SHAPES } from '../content/text-style.js';

export function createFacadeLayoutSystem(deps) {
    const {
        GRID_COLS, GRID_ROWS, GRID_W, GRID_H, STREET, grid,
        cellEdgeKind, cellToWorld, colEdge, colHalf, rowEdge, rowHalf, worldToCellIndex,
        pick, pickNeonForRow, pickSignContent, randRange, rng, addSign,
    } = deps;
    const buildingFacades = [];

    let nextFacadeId = QP[1661];
    function makeFacade(rect, dx, dz, yMin, yMax, door, exposure = 'street', moduleKey = null) {
        const axisIsX = dz !== QP[1662];  
        const half = axisIsX ? rect.hwx : rect.hwz;
        const rotY = outwardRotationY(dx, dz);
        const cx = rect.cx + dx * (rect.hwx + QP[1663]), cz = rect.cz + dz * (rect.hwz + QP[1664]);
        const isDoorWall = door && door.dx === dx && door.dz === dz;
        return {
            id: nextFacadeId++,
            moduleKey,  
            dx, dz, cx, cz, rotY, axisIsX, half, length: half * QP[1665],
            yMin, yMax,
            normalX: dx, normalZ: dz,  
            tangentX: axisIsX ? QP[1666] : QP[1667], tangentZ: axisIsX ? QP[1668] : QP[1669],
            exposure,  
            occupied: isDoorWall ? [{ type: 'door', uMin: QP[1670], uMax: QP[1671], vMin: QP[1672], vMax: QP[1673] }] : [],
            projections: [],  
        };
    }
    
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
    const FACADE_CLASS = {
        door: 'structural', fireEscape: 'structural',
        sign: 'panel', poster: 'panel', photo: 'panel', terminal: 'panel',
        camera: 'hardware', pipe: 'hardware', awning: 'hardware', balcony: 'hardware',
        flyer: 'overlay', graffiti: 'overlay', ivy: 'overlay', sticker: 'overlay',
    };
    function facadeBlocks(typeA, typeB) {
        const a = FACADE_CLASS[typeA] || typeA, b = FACADE_CLASS[typeB] || typeB;
        if (a === 'structural' || b === 'structural') return true;
        if (a === 'overlay' || b === 'overlay') return false;
        return true;  
    }
    function facadeFits(facade, type, uMin, uMax, vMin, vMax, padding) {
        if (uMin < -facade.half || uMax > facade.half) return false;
        if (vMin < facade.yMin - QP[1674] || vMax > facade.yMax + QP[1675]) return false;
        for (const r of facade.occupied) {
            if (!facadeBlocks(type, r.type)) continue;
            if (uMin - padding < r.uMax && r.uMin < uMax + padding && vMin < r.vMax && vMax > r.vMin) return false;
        }
        return true;
    }
    function facadeReserve(facade, type, uMin, uMax, vMin, vMax) { facade.occupied.push({ type, uMin, uMax, vMin, vMax }); }
    
     
     
     
     
     
     
     
     
     
     
    function findFreeFacadeRect(facade, type, width, height, vMin, vMax, attempts = QP[1676], padding = QP[1677]) {
        const halfW = width / QP[1678], halfH = height / QP[1679];
        if (facade.half * QP[1680] < width) return null;
        const loY = Math.max(vMin, facade.yMin + halfH), hiY = Math.min(vMax, facade.yMax - halfH);
        if (loY > hiY) return null;
        for (let i = QP[1681]; i < attempts; i++) {
            const u = randRange(-facade.half + halfW, facade.half - halfW);
            const v = randRange(loY, hiY);
            if (facadeFits(facade, type, u - halfW, u + halfW, v - halfH, v + halfH, padding)) {
                facadeReserve(facade, type, u - halfW, u + halfW, v - halfH, v + halfH);
                return { u, v };
            }
        }
        return null;
    }
    
     
     
     
     
     
     
    const SIGN_BOTTOM_CLEARANCE = QP[1682];
    const SIGN_TOP_MARGIN = QP[1683];
    
     
     
     
     
     
     
     
     
     
     
     
     
    const SIGN_WALL_MOUNT_WIDTH = QP[1684];
    const SIGN_OPPOSITE_WALL_GAP = QP[1685];  
    
     
     
     
     
     
    function solidClearanceAhead(x, z, nx, nz) {
        const sampleX = x + nx * QP[1686], sampleZ = z + nz * QP[1687];
        let { col, row } = worldToCellIndex(sampleX, sampleZ);
         
         
         
        for (let n = QP[1688]; n < QP[1689] && grid[row]?.[col]; n++) { col += nx; row += nz; }
        for (let steps = QP[1690]; steps < Math.max(GRID_COLS, GRID_ROWS); steps++) {
            if (col < QP[1691] || row < QP[1692] || col >= GRID_COLS || row >= GRID_ROWS) return Infinity;
            if (grid[row]?.[col]) {
                if (nx > QP[1693]) return Math.max(QP[1694], colEdge[col] - GRID_W / QP[1695] - x);
                if (nx < QP[1696]) return Math.max(QP[1697], x - (colEdge[col + QP[1698]] - GRID_W / QP[1699]));
                if (nz > QP[1700]) return Math.max(QP[1701], rowEdge[row] - GRID_H / QP[1702] - z);
                return Math.max(QP[1703], z - (rowEdge[row + QP[1704]] - GRID_H / QP[1705]));
            }
            col += nx; row += nz;
        }
        return Infinity;
    }
    
    function safeBladeProjectionDepth(x, z, rotY) {
        const nx = Math.round(Math.sin(rotY)), nz = Math.round(Math.cos(rotY));
        const clearance = solidClearanceAhead(x, z, nx, nz);
        return Number.isFinite(clearance) ? Math.max(QP[1706], clearance - SIGN_OPPOSITE_WALL_GAP) : Infinity;
    }
    
    function fitBladeDimensions(width, armLength, maxDepth) {
        if (!Number.isFinite(maxDepth) || width + armLength <= maxDepth) return { width, armLength };
        if (maxDepth < QP[1707]) return null;
        const scale = maxDepth / Math.max(QP[1708], width + armLength);
        let w = width * scale, arm = armLength * scale;
         
         
        arm = Math.min(arm, Math.max(QP[1709], maxDepth * QP[1710]));
        w = maxDepth - arm;
        if (w < QP[1711]) { w = Math.max(QP[1712], maxDepth * QP[1713]); arm = maxDepth - w; }
        return arm > QP[1714] && w > QP[1715] ? { width: w, armLength: arm } : null;
    }
    
     
     
     
     
     
     
     
    function createSignSpec(maxProjectionDepth = Infinity) {
        const shape = pick(SIGN_SHAPES);
        const desiredWidth = randRange(QP[1716], Math.min(QP[1717], STREET * QP[1718]));
        const desiredArm = randRange(QP[1719], Math.min(QP[1720], STREET * QP[1721]));
        const fitted = fitBladeDimensions(desiredWidth, desiredArm, maxProjectionDepth);
        if (!fitted) return null;
        const { width, armLength } = fitted;
        const height = width * (shape.h / shape.w);
        return {
            shape, width, height, armLength,
            wallFootprintWidth: SIGN_WALL_MOUNT_WIDTH,
            projectionDepth: armLength + width,
        };
    }
    
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
    function* placeSignsOnFacadeSteps(facade, count, row) {
        let placed = QP[1722];
        for (let i = QP[1723]; i < count; i++) {
            let chosen = null;
             
             
             
             
             
            for (let tries = QP[1724]; tries < QP[1725]; tries++) {
                const spec = createSignSpec(safeBladeProjectionDepth(facade.cx, facade.cz, facade.rotY));
                if (!spec) continue;
                const halfMount = spec.wallFootprintWidth / QP[1726], halfH = spec.height / QP[1727];
                if (facade.half * QP[1728] < spec.wallFootprintWidth + QP[1729]) continue;  
                const minCenterY = facade.yMin + SIGN_BOTTOM_CLEARANCE + halfH;
                const maxCenterY = facade.yMax - SIGN_TOP_MARGIN - halfH;
                if (minCenterY > maxCenterY) continue;  
                const centerY = randRange(minCenterY, maxCenterY);
                const u = randRange(-facade.half + halfMount, facade.half - halfMount);
                if (!facadeFits(facade, 'sign', u - halfMount, u + halfMount, centerY - halfH, centerY + halfH, QP[1730])) continue;
                 
                 
                 
                 
                 
                 
                const box = makeProjectionBox(facade, u, centerY - halfH, spec.height, spec.projectionDepth, halfMount + QP[1731]);
                if (!projectionFits(box)) continue;
                chosen = { spec, u, centerY, box };
                break;
            }
            if (chosen === null) continue;  
            const { spec, u, centerY, box } = chosen;
            facadeReserve(facade, 'sign', u - spec.wallFootprintWidth / QP[1732], u + spec.wallFootprintWidth / QP[1733], centerY - spec.height / QP[1734], centerY + spec.height / QP[1735]);
            reserveProjectionVolume(box);
            const p = pointOnFacade(facade, u, centerY);
            const content = pickSignContent(p.x, p.z);
            const neon = pickNeonForRow(row);
            addSign(p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, neon, content.flicker, spec.width, spec.shape, spec.armLength);
            placed++;
            yield { phase: 'facade-sign', facadeId: facade.id, placed };
        }
        return placed;
    }
    
     
     
     
     
    function placeSignsOnFacade(facade, count, row) {
        const iterator = placeSignsOnFacadeSteps(facade, count, row);
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }

    function edgeKindForSite(cell, dr, dc, voidCell) {
        const base = cellEdgeKind(cell.row, cell.col, dr, dc);
        if (base === 'internal' && voidCell && cell.row + dr === voidCell.row && cell.col + dc === voidCell.col) return 'courtyard';
        return base;
    }
    
    function kindForSide(kinds, dx, dz) { return kinds[CELL_SIDE_DEFS.find(s => s.dx === dx && s.dz === dz).key]; }
    
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
    
    (function selfTestCardinalOrientation() {
         
         
         
         
         
         
        const dirs = [{ name: 'N', nx: QP[1744], nz: QP[1745] }, { name: 'S', nx: QP[1746], nz: QP[1747] }, { name: 'W', nx: QP[1748], nz: QP[1749] }, { name: 'E', nx: QP[1750], nz: QP[1751] }];
        let allOk = true;
        for (const d of dirs) {
            const rotY = outwardRotationY(d.nx, d.nz);
            const wx = Math.sin(rotY), wz = Math.cos(rotY);
            const dot = wx * d.nx + wz * d.nz;
            if (dot < QP[1752]) {
                allOk = false;
                console.warn(`[testing] FAILED cardinal orientation self-test for ${d.name}: rotY=${rotY.toFixed(QP[1753])} world dir=(${wx.toFixed(QP[1754])},${wz.toFixed(QP[1755])}) expected (${d.nx},${d.nz})`);
            }
        }
        console.log(`[testing] cardinal orientation self-test: ${allOk ? 'PASS' : 'FAIL'} -- all 4 wall-mounted-object rotations point outward`);
    })();
    
     
     
     
     
    function facadeTangent(facade) {
        return facade.axisIsX ? { tx: QP[1756], tz: QP[1757] } : { tx: QP[1758], tz: QP[1759] };
    }
    
     
     
     
     
     
     
     
    function pointOnFacade(facade, u, y, outwardOffset = QP[1760]) {
        const { tx, tz } = facadeTangent(facade);
        return {
            x: facade.cx + tx * u + facade.normalX * outwardOffset,
            y,
            z: facade.cz + tz * u + facade.normalZ * outwardOffset,
        };
    }
    
     
     
     
     
     
     
     
     
     
     
    const exteriorDecorationVolumes = [];
    const exteriorDecorationVolumeIndex = new SpatialHash2D(QP[1761]);
    const _projectionCandidates = [];
    function makeProjectionBox(facade, u, yBase, height, outwardDepth, tangentHalfWidth) {
        const { tx, tz } = facadeTangent(facade);
        const baseX = facade.cx + tx * u, baseZ = facade.cz + tz * u;
        const outX = facade.normalX * outwardDepth, outZ = facade.normalZ * outwardDepth;
        const spanX = tx ? tangentHalfWidth : QP[1762], spanZ = tz ? tangentHalfWidth : QP[1763];
        return {
            xMin: Math.min(baseX, baseX + outX) - spanX, xMax: Math.max(baseX, baseX + outX) + spanX,
            yMin: yBase, yMax: yBase + height,
            zMin: Math.min(baseZ, baseZ + outZ) - spanZ, zMax: Math.max(baseZ, baseZ + outZ) + spanZ,
            facadeId: facade.id,  
        };
    }
    function projectionFits(box) {
         
         
         
        exteriorDecorationVolumeIndex.queryBounds({
            minX: box.xMin, maxX: box.xMax,
            minZ: box.zMin, maxZ: box.zMax,
        }, _projectionCandidates);
        for (const v of _projectionCandidates) if (boxesIntersect(box, v)) return false;
        return true;
    }
    function reserveProjectionVolume(box) {
         
         
        box.__projectionId = exteriorDecorationVolumes.length;
        exteriorDecorationVolumes.push(box);
        exteriorDecorationVolumeIndex.insert(box, {
            minX: box.xMin, maxX: box.xMax,
            minZ: box.zMin, maxZ: box.zMax,
        });
    }
    
     
     
     
     
     

    return Object.freeze({
        buildingFacades,
        exteriorDecorationVolumes,
        exteriorDecorationVolumeIndex,
        makeFacade,
        facadeBlocks,
        facadeFits,
        facadeReserve,
        findFreeFacadeRect,
        solidClearanceAhead,
        safeBladeProjectionDepth,
        fitBladeDimensions,
        createSignSpec,
        placeSignsOnFacade,
        placeSignsOnFacadeSteps,
        edgeKindForSite,
        kindForSide,
        facadeTangent,
        pointOnFacade,
        makeProjectionBox,
        projectionFits,
        reserveProjectionVolume,
    });
}
