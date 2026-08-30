import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';

export function createOrganicGeometryTools(randRange) {
    function jitterGeometry(geo, amount) {
        const pos = geo.attributes.position;
        const a = pos.array;
        const offsets = new Map();
        for (let i = QP[881]; i < a.length; i += QP[882]) {
            const ox = a[i], oy = a[i + QP[883]], oz = a[i + QP[884]];
            const key = `${Math.round(ox * QP[885])},${Math.round(oy * QP[886])},${Math.round(oz * QP[887])}`;
            let off = offsets.get(key);
            if (!off) {
                off = [randRange(-amount, amount), randRange(-amount, amount) * QP[888], randRange(-amount, amount)];
                offsets.set(key, off);
            }
            a[i] = ox + off[QP[889]];
            a[i + QP[890]] = oy + off[QP[891]];
            a[i + QP[892]] = oz + off[QP[893]];
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
    }

    function buildOrganicTowerGeometry(hwx, hwz, height) {
        const cutX = () => randRange(hwx * QP[894], hwx * QP[895]);
        const cutZ = () => randRange(hwz * QP[896], hwz * QP[897]);
        const nwX = cutX(), nwZ = cutZ(), neX = cutX(), neZ = cutZ(), seX = cutX(), seZ = cutZ(), swX = cutX(), swZ = cutZ();
        const basePts = [
            [-hwx + nwX, -hwz], [hwx - neX, -hwz], [hwx, -hwz + neZ], [hwx, hwz - seZ],
            [hwx - seX, hwz], [-hwx + swX, hwz], [-hwx, hwz - swZ], [-hwx, -hwz + nwZ],
        ];
        const taper = randRange(QP[898], QP[899]);
        const twist = randRange(QP[900], QP[901]);
        const cosT = Math.cos(twist), sinT = Math.sin(twist);
        const topPts = basePts.map(([px, pz]) => {
            const sx = px * taper, sz = pz * taper;
            return [sx * cosT - sz * sinT, sx * sinT + sz * cosT];
        });
        const n = basePts.length;
        const positions = [];
        const uvs = [];
        const pushTri = (a, b, c) => { positions.push(...a, ...b, ...c); };
        for (let i = QP[902]; i < n; i++) {
            const j = (i + QP[903]) % n;
            const b0 = [basePts[i][QP[904]], QP[905], basePts[i][QP[906]]];
            const b1 = [basePts[j][QP[907]], QP[908], basePts[j][QP[909]]];
            const t0 = [topPts[i][QP[910]], height, topPts[i][QP[911]]];
            const t1 = [topPts[j][QP[912]], height, topPts[j][QP[913]]];
            pushTri(b0, t1, b1); uvs.push(QP[914], QP[915], QP[916], QP[917], QP[918], QP[919]);
            pushTri(b0, t0, t1); uvs.push(QP[920], QP[921], QP[922], QP[923], QP[924], QP[925]);
        }
        for (let i = QP[926]; i < n - QP[927]; i++) {
            const t0 = [topPts[QP[928]][QP[929]], height, topPts[QP[930]][QP[931]]];
            const ti = [topPts[i][QP[932]], height, topPts[i][QP[933]]];
            const tj = [topPts[i + QP[934]][QP[935]], height, topPts[i + QP[936]][QP[937]]];
            pushTri(t0, tj, ti); uvs.push(QP[938], QP[939], QP[940], QP[941], QP[942], QP[943]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, QP[944]));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, QP[945]));
        geo.computeVertexNormals();
        return geo;
    }

    return Object.freeze({ jitterGeometry, buildOrganicTowerGeometry });
}

export function remapWallUV(geo, axis, len, height, u0, u1, v0, v1) {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = QP[949]; i < pos.count; i++) {
        const tangentCoord = axis === 'x' ? pos.getZ(i) : pos.getX(i);
        const tu = tangentCoord / len + QP[950], tv = pos.getY(i) / height + QP[951];
        uv.setXY(i, u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    uv.needsUpdate = true;
}

export function computeNotchedRects(x, z, hwx, hwz, holeXLo, holeXHi, holeZLo, holeZHi) {
    const fx0 = x - hwx, fx1 = x + hwx, fz0 = z - hwz, fz1 = z + hwz;
    const hx0 = Math.max(fx0, Math.min(holeXLo, holeXHi));
    const hx1 = Math.min(fx1, Math.max(holeXLo, holeXHi));
    const hz0 = Math.max(fz0, Math.min(holeZLo, holeZHi));
    const hz1 = Math.min(fz1, Math.max(holeZLo, holeZHi));
    const rectFrom = (x0, x1, z0, z1) => ({ x: (x0 + x1) / QP[1007], z: (z0 + z1) / QP[1008], hx: (x1 - x0) / QP[1009], hz: (z1 - z0) / QP[1010] });
    const rects = [];
    if (hz0 > fz0) rects.push(rectFrom(fx0, fx1, fz0, hz0));
    if (hz1 < fz1) rects.push(rectFrom(fx0, fx1, hz1, fz1));
    if (hx0 > fx0) rects.push(rectFrom(fx0, hx0, hz0, hz1));
    if (hx1 < fx1) rects.push(rectFrom(hx1, fx1, hz0, hz1));
    return rects;
}

export function appendBoxData(positions, indices, cx, cy, cz, sx, sy, sz) {
    const base = positions.length / QP[1300];
    const x0 = cx - sx / QP[1301], x1 = cx + sx / QP[1302];
    const y0 = cy - sy / QP[1303], y1 = cy + sy / QP[1304];
    const z0 = cz - sz / QP[1305], z1 = cz + sz / QP[1306];
    positions.push(x0,y0,z0, x1,y0,z0, x1,y1,z0, x0,y1,z0, x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1);
    indices.push(
        base+QP[1307],base+QP[1308],base+QP[1309], base+QP[1310],base+QP[1311],base+QP[1312],
        base+QP[1313],base+QP[1314],base+QP[1315], base+QP[1316],base+QP[1317],base+QP[1318],
        base+QP[1319],base+QP[1320],base+QP[1321], base+QP[1322],base+QP[1323],base+QP[1324],
        base+QP[1325],base+QP[1326],base+QP[1327], base+QP[1328],base+QP[1329],base+QP[1330],
        base+QP[1331],base+QP[1332],base+QP[1333], base+QP[1334],base+QP[1335],base+QP[1336],
        base+QP[1337],base+QP[1338],base+QP[1339], base+QP[1340],base+QP[1341],base+QP[1342]
    );
}

export function boxesIntersect(a, b) {
    return a.xMin < b.xMax && b.xMin < a.xMax && a.yMin < b.yMax && b.yMin < a.yMax && a.zMin < b.zMax && b.zMin < a.zMax;
}
