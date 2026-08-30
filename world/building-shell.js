import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { remapWallUV } from '../systems/geometry-utils.js';

export function createBuildingShellSystem(deps) {
    const { WALL_THICKNESS, randRange, scene, skirtBoxGeo, weightedPick } = deps;

    function buildWallWithGaps(axis, fixedCoord, spanA, spanB, gaps, height, mat, yBase = QP[952], fullHeight = height) {
        const sorted = gaps.slice().sort((a, b) => a.lo - b.lo);
        const segs = [];
         
         
         
         
         
         
         
         
        const spanLen = spanB - spanA;
        const addSolid = (a0, a1) => {
            if (a1 - a0 < QP[953]) return;
            const len = a1 - a0, mid = (a0 + a1) / QP[954];
            let wall;
            if (mat?.map) {
                 
                 
                const geo = axis === 'x' ? new THREE.BoxGeometry(WALL_THICKNESS, height, len) : new THREE.BoxGeometry(len, height, WALL_THICKNESS);
                remapWallUV(geo, axis, len, height,
                    spanLen > QP[955] ? (a0 - spanA) / spanLen : QP[956], spanLen > QP[957] ? (a1 - spanA) / spanLen : QP[958],
                    yBase / fullHeight, (yBase + height) / fullHeight);
                wall = new THREE.Mesh(geo, mat);
            } else {
                 
                 
                 
                wall = new THREE.Mesh(skirtBoxGeo, mat);
                wall.scale.set(axis === 'x' ? WALL_THICKNESS : len, height, axis === 'x' ? len : WALL_THICKNESS);
            }
            if (axis === 'x') {
                wall.position.set(fixedCoord, yBase + height / QP[959], mid);
                segs.push({ x1: fixedCoord, z1: a0, x2: fixedCoord, z2: a1 });
            } else {
                wall.position.set(mid, yBase + height / QP[960], fixedCoord);
                segs.push({ x1: a0, z1: fixedCoord, x2: a1, z2: fixedCoord });
            }
            scene.add(wall);
        };
        let cursor = spanA;
        for (const g of sorted) {
            const lo = Math.max(spanA, Math.min(g.lo, g.hi)), hi = Math.min(spanB, Math.max(g.lo, g.hi));
            if (hi <= cursor) continue;  
            addSolid(cursor, Math.max(cursor, lo));
            cursor = Math.max(cursor, hi);
        }
        addSolid(cursor, spanB);
        return segs;
    }
    
     
     
     
     
     
     
     
     
     
    function buildExteriorPerimeter(x, z, hwx, hwz, y0, floorHeight, door, mat, openGaps = [], fullHeight = floorHeight) {
        const doorWidth = QP[961], doorHeight = QP[962];
        const faces = [
            { dx: QP[963], dz: QP[964], axis: 'z', fixedCoord: z - hwz, spanA: x - hwx, spanB: x + hwx, along: x },
            { dx: QP[965], dz: QP[966], axis: 'z', fixedCoord: z + hwz, spanA: x - hwx, spanB: x + hwx, along: x },
            { dx: QP[967], dz: QP[968], axis: 'x', fixedCoord: x - hwx, spanA: z - hwz, spanB: z + hwz, along: z },
            { dx: QP[969], dz: QP[970], axis: 'x', fixedCoord: x + hwx, spanA: z - hwz, spanB: z + hwz, along: z },
        ];
        const segments = [];
        for (const f of faces) {
            const gaps = [];
            const isDoorWall = door && f.dx === door.dx && f.dz === door.dz;
            if (isDoorWall) gaps.push({ lo: f.along - doorWidth / QP[971], hi: f.along + doorWidth / QP[972] });
            for (const g of openGaps) if (g.dx === f.dx && g.dz === f.dz) gaps.push({ lo: g.lo, hi: g.hi });
            segments.push(...buildWallWithGaps(f.axis, f.fixedCoord, f.spanA, f.spanB, gaps, floorHeight, mat, y0, fullHeight));
            if (isDoorWall) {
                 
                 
                 
                 
                 
                 
                 
                const lintelH = floorHeight - doorHeight;
                const lintelGeo = f.axis === 'x' ? new THREE.BoxGeometry(WALL_THICKNESS, lintelH, doorWidth) : new THREE.BoxGeometry(doorWidth, lintelH, WALL_THICKNESS);
                remapWallUV(lintelGeo, f.axis, doorWidth, lintelH,
                    (f.along - doorWidth / QP[973] - f.spanA) / (f.spanB - f.spanA), (f.along + doorWidth / QP[974] - f.spanA) / (f.spanB - f.spanA),
                    (y0 + doorHeight) / fullHeight, (y0 + doorHeight + lintelH) / fullHeight);
                const lintel = new THREE.Mesh(lintelGeo, mat);
                if (f.axis === 'x') lintel.position.set(f.fixedCoord, y0 + doorHeight + lintelH / QP[975], f.along);
                else lintel.position.set(f.along, y0 + doorHeight + lintelH / QP[976], f.fixedCoord);
                scene.add(lintel);
            }
        }
        return segments;
    }
    
     
     
     
     
     
     
     
     
    function wallIntersectsReservedRect(w, rect, pad = QP[977]) {
        if (!rect) return false;
        if (w.axis === 'x') {
            if (w.fixedCoord < rect.x - rect.hx - pad || w.fixedCoord > rect.x + rect.hx + pad) return false;
            return w.spanB >= rect.z - rect.hz - pad && w.spanA <= rect.z + rect.hz + pad;
        }
        if (w.fixedCoord < rect.z - rect.hz - pad || w.fixedCoord > rect.z + rect.hz + pad) return false;
        return w.spanB >= rect.x - rect.hx - pad && w.spanA <= rect.x + rect.hx + pad;
    }
    
    
     
     
     
     
     
     
     
     
    const FLOOR_ROOM_TARGET_WEIGHTS = Object.freeze({ [QP[978]]: QP[979], [QP[980]]: QP[981], [QP[982]]: QP[983] });

    function buildFloorLayout(x, z, hwx, hwz, door, opts = {}) {
        const reservedRects = opts.reservedRects ?? [];
        const requestedRooms = THREE.MathUtils.clamp(
            Math.round(opts.roomTarget ?? Number(weightedPick(FLOOR_ROOM_TARGET_WEIGHTS))),
            QP[984], QP[985]
        );
        const awayX = door ? -door.dx : QP[986];
        const awayZ = door ? -door.dz : QP[987];
        const preferredAxis = awayX !== QP[988] ? 'x' : 'z';
        const axes = preferredAxis === 'x' ? ['x', 'z'] : ['z', 'x'];
        let best = [];
    
        for (const axis of axes) {
            const center = axis === 'x' ? x : z;
            const half = axis === 'x' ? hwx : hwz;
            const spanCenter = axis === 'x' ? z : x;
            const spanHalf = axis === 'x' ? hwz : hwx;
            if (half < QP[989] || spanHalf < QP[990]) continue;
            const walls = [];
            for (let i = QP[991]; i < requestedRooms; i++) {
                 
                 
                 
                const baseF = i / requestedRooms;
                const f = THREE.MathUtils.clamp(baseF + randRange(QP[992], QP[993]), QP[994], QP[995]);
                const fixedCoord = center - half + f * half * QP[996];
                const w = {
                    axis, fixedCoord,
                    spanA: spanCenter - spanHalf,
                    spanB: spanCenter + spanHalf,
                    doorFrac: i % QP[997] ? randRange(QP[998], QP[999]) : randRange(QP[1000], QP[1001]),
                };
                if (!reservedRects.some(r => wallIntersectsReservedRect(w, r))) walls.push(w);
            }
            if (walls.length > best.length) best = walls;
            if (walls.length >= requestedRooms - QP[1002]) break;
        }
        return { walls: best, roomCount: best.length + QP[1003] };
    }
    
     
     
     
     
    function drawFloorLayout(layoutWalls, floorHeight, mat, yBase, outSegments) {
        const doorInteriorWidth = QP[1004];
        for (const w of layoutWalls) {
            const doorCenter = w.spanA + (w.spanB - w.spanA) * w.doorFrac;
            const segs = buildWallWithGaps(w.axis, w.fixedCoord, w.spanA, w.spanB, [{ lo: doorCenter - doorInteriorWidth / QP[1005], hi: doorCenter + doorInteriorWidth / QP[1006] }], floorHeight, mat, yBase);
            outSegments.push(...segs);
        }
    }
    
     
     
     
     
     

    return Object.freeze({
        buildWallWithGaps,
        buildExteriorPerimeter,
        wallIntersectsReservedRect,
        buildFloorLayout,
        drawFloorLayout,
    });
}
