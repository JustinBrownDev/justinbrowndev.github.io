import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';

// Content/debug helpers extracted from the historical authored building system.
// This module intentionally contains NO wall/floor/stair/building construction.
// Keeping these helpers separate lets the runtime retire the legacy geometry
// engine without losing the reserved courtyard treatment or debug tooling.
export function createAuthoredContentHelpers({
    CONFIG, STREET,
    DEBUG_FACADES, DEBUG_FOOTPRINTS, DEBUG_SIGNATURES,
    scene, buildingFacades, exteriorDecorationVolumes, signatureInstances,
    pointOnFacade, cellToWorld, colHalf, rowHalf, addDebugRectOutline,
    makePixelTexture, addPottedPlant, addBench, scatterJunk,
    randRange, rng, takeDynamicLight, publishSurfacePatch,
} = {}) {
    function facadeDebugRectOutline(facade, uMin, uMax, vMin, vMax, color, outwardOffset = QP[1764]) {
        const corners = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]
            .map(([u, v]) => pointOnFacade(facade, u, v, outwardOffset));
        const geo = new THREE.BufferGeometry().setFromPoints(corners.map(p => new THREE.Vector3(p.x, p.y, p.z)));
        scene.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color })));
    }

    const OCCUPANCY_DEBUG_COLORS = {
        door: QP[1765], fireEscape: QP[1766],
        sign: QP[1767], poster: QP[1768],
        camera: QP[1769], pipe: QP[1770], awning: QP[1771], balcony: QP[1772],
        graffiti: QP[1773], ivy: QP[1774], flyer: QP[1775], sticker: QP[1776],
    };

    function addFacadeDebugOverlay() {
        if (!DEBUG_FACADES) return;
        for (const facade of buildingFacades) {
            facadeDebugRectOutline(facade, -facade.half, facade.half, facade.yMin, facade.yMax, facade.exposure === 'setback' ? QP[1777] : QP[1778]);
            const midV = (facade.yMin + facade.yMax) / QP[1779];
            const base = pointOnFacade(facade, QP[1780], midV, QP[1781]);
            const tip = pointOnFacade(facade, QP[1782], midV, QP[1783]);
            const arrowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(tip.x, tip.y, tip.z)]);
            scene.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: QP[1784] })));
            const tipDot = new THREE.Mesh(new THREE.SphereGeometry(QP[1785], QP[1786], QP[1787]), new THREE.MeshBasicMaterial({ color: QP[1788] }));
            tipDot.position.set(tip.x, tip.y, tip.z);
            scene.add(tipDot);
            for (const r of facade.occupied) {
                facadeDebugRectOutline(facade, r.uMin, r.uMax, r.vMin, r.vMax, OCCUPANCY_DEBUG_COLORS[r.type] ?? QP[1789], QP[1790]);
            }
        }
        for (const v of exteriorDecorationVolumes) {
            const box = new THREE.Box3(new THREE.Vector3(v.xMin, v.yMin, v.zMin), new THREE.Vector3(v.xMax, v.yMax, v.zMax));
            scene.add(new THREE.Box3Helper(box, QP[1791]));
        }
        console.log(`[testing] debugFacades overlay: drew ${buildingFacades.length} facades + ${exteriorDecorationVolumes.length} projection volumes`);
    }

    const SIGNATURE_DEBUG_COLORS = {
        artGallery: QP[1792], as400Archive: QP[1793], justinIndex: QP[1794],
        systemsWorkshop: QP[1795], loreShrine: QP[1796], futurePlaceholder: QP[1797],
    };

    function addSignatureDebugOverlay() {
        if (!DEBUG_SIGNATURES) return;
        for (const inst of signatureInstances) {
            const color = SIGNATURE_DEBUG_COLORS[inst.type] ?? QP[1797];
            for (const cell of inst.cells) {
                const { x, z } = cellToWorld(cell.col, cell.row);
                addDebugRectOutline(x, z, colHalf(cell.col) - QP[1798], rowHalf(cell.row) - QP[1799], QP[1800], color);
            }
            for (const entrance of [inst.mainEntrance, inst.secondaryEntrance]) {
                if (!entrance) continue;
                const isMain = entrance === inst.mainEntrance;
                const topY = isMain ? QP[1801] : QP[1802];
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(entrance.doorX, QP[1803], entrance.doorZ),
                    new THREE.Vector3(entrance.doorX, topY, entrance.doorZ),
                ]);
                scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: isMain ? QP[1804] : QP[1805] })));
                const dot = new THREE.Mesh(new THREE.SphereGeometry(QP[1806], QP[1807], QP[1808]), new THREE.MeshBasicMaterial({ color }));
                dot.position.set(entrance.outsideX, topY, entrance.outsideZ);
                scene.add(dot);
            }
        }
        console.log(`[signature] debugSignatures overlay: drew ${signatureInstances.length} reserved sites`);
    }

    function buildCourtyardVoid(cell) {
        const { x: cx, z: cz } = cellToWorld(cell.col, cell.row);
        const halfX = colHalf(cell.col) - QP[1814], halfZ = rowHalf(cell.row) - QP[1815];
        const half = Math.min(halfX, halfZ);
        const paverTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#8a8270';
            ctx.fillRect(QP[1816], QP[1817], w, h);
            ctx.strokeStyle = '#5a5648';
            for (let i = QP[1818]; i < w; i += QP[1819]) { ctx.beginPath(); ctx.moveTo(i, QP[1820]); ctx.lineTo(i, h); ctx.stroke(); }
            for (let i = QP[1821]; i < h; i += QP[1822]) { ctx.beginPath(); ctx.moveTo(QP[1823], i); ctx.lineTo(w, i); ctx.stroke(); }
        }, QP[1824], QP[1825]);
        const paverGeometry = new THREE.PlaneGeometry(halfX * QP[1826], halfZ * QP[1827]);
        const paverMaterial = new THREE.MeshStandardMaterial({ map: paverTex, roughness: QP[1828] });
        if (typeof publishSurfacePatch !== 'function') throw new Error('reserved courtyard surface requires KowloonFabricEngine publication');
        publishSurfacePatch({
            patchKey: `reserved-courtyard:${cell.col},${cell.row}`,
            buckets: [{
                kind: 'courtyard-pavers', geometry: paverGeometry, material: paverMaterial,
                transforms: [{ x: cx, y: QP[1830], z: cz, sx: 1, sy: 1, sz: 1, plane: true }],
            }],
        });
        addPottedPlant(cx + half * QP[1831], cz + half * QP[1832]);
        addPottedPlant(cx - half * QP[1833], cz - half * QP[1834]);
        addBench(cx - half * QP[1835], cz + half * QP[1836], randRange(QP[1837], Math.PI * QP[1838]));
        addBench(cx + half * QP[1839], cz - half * QP[1840], randRange(QP[1841], Math.PI * QP[1842]));
        scatterJunk('alley', cx, cz, QP[1843] + Math.floor(rng() * QP[1844]), half * QP[1845]);
        if (takeDynamicLight(QP[1846])) {
            const light = new THREE.PointLight(QP[1847], QP[1848], QP[1849], QP[1850]);
            light.position.set(cx, QP[1851], cz);
            scene.add(light);
        }
    }

    function addSiteDebugOverlay(cells, builtModules, voidCell) {
        if (!DEBUG_FOOTPRINTS) return;
        for (const cell of cells) {
            const { x, z } = cellToWorld(cell.col, cell.row);
            addDebugRectOutline(x, z, colHalf(cell.col), rowHalf(cell.row), QP[1852], QP[1853]);
        }
        for (const m of builtModules) addDebugRectOutline(m.cx, m.cz, m.hwx, m.hwz, QP[1854], QP[1855]);
        if (voidCell) {
            const { x, z } = cellToWorld(voidCell.col, voidCell.row);
            addDebugRectOutline(x, z, colHalf(voidCell.col) - QP[1856], rowHalf(voidCell.row) - QP[1857], QP[1858], QP[1859]);
        }
    }

    function streetSetbackRoll() {
        return Math.min(randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / QP[2025], STREET * QP[2026]);
    }

    return Object.freeze({
        buildCourtyardVoid,
        addSiteDebugOverlay,
        addFacadeDebugOverlay,
        addSignatureDebugOverlay,
        streetSetbackRoll,
    });
}
