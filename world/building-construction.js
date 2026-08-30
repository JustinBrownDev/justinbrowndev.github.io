import * as THREE from '../vendor/three/three.module.js';
import { CONFIG } from '../config/game-config.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { CELL_SIDE_DEFS, outwardRotationY } from '../systems/cardinal.js';
import { computeNotchedRects } from '../systems/geometry-utils.js';

export function createBuildingConstructionSystem(deps) {
    const {
        DEBUG_FACADES, DEBUG_FOOTPRINTS, DEBUG_SIGNATURES, QUALITY, SEED, STREET, BLOCK, WALL_THICKNESS,
        addAwning, addBalcony, addBench, addCrate, addDebugRectOutline, addGraffitiTag,
        addIvyPatch, addPipeCluster, addPottedPlant, addRooftopClutter, addSecurityCamera, addWallFlyer,
        buildCoreFloor, buildFireEscape, buildRooftopMechanicalRoom,
        buildingFacades, buildingWallSegments, candidateFaces,
        cellToWorld, colHalf, colSize, edgeKindForSite, elevatedPlatforms,
        exteriorDecorationVolumes, facadeReserve, findFreeFacadeRect,
        fireEscapeDepth, fireEscapeDimensions, fireEscapeSideFits, footprintOf,
        hashString32, jitterGeometry, localRng, makeFacade, makePixelTexture, makeProjectionBox,
        makeTopologyStainTexture, makeWindowGridTexture, maybeAddElevator, maybeAddMezzanine,
        pick, pileJunkCluster, placeRealModel, placeSemanticCityAsset, placeSignsOnFacadeSteps,
        pointOnFacade, projectionFits, randRange, reserveProjectionVolume, rng, rooftopDecks,
        rowHalf, rowSize, scatterJunk, scene, semanticCornerPoint, sharedBuildingFacadeMaterial,
        signatureInstances, siteIdOf, skirtBoxGeo, takeDynamicLight, webAlignment, weightedPick,
    } = deps;
    let totalExposedSetbackWalls = QP[948];

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
    
     
     
     
     
     
     
     
    function computeCellRect(x, z, kinds, streetSetbackX, streetSetbackZ, partySetback, hwxFull, hwzFull) {
        const setbackFor = (kind, streetSetback) => kind === 'internal' ? QP[1809] : kind === 'party' ? partySetback : streetSetback;
        const zMin = z - hwzFull + setbackFor(kinds.N, streetSetbackZ);
        const zMax = z + hwzFull - setbackFor(kinds.S, streetSetbackZ);
        const xMin = x - hwxFull + setbackFor(kinds.W, streetSetbackX);
        const xMax = x + hwxFull - setbackFor(kinds.E, streetSetbackX);
        return { cx: (xMin + xMax) / QP[1810], cz: (zMin + zMax) / QP[1811], hwx: (xMax - xMin) / QP[1812], hwz: (zMax - zMin) / QP[1813] };
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
        const pavers = new THREE.Mesh(new THREE.PlaneGeometry(halfX * QP[1826], halfZ * QP[1827]), new THREE.MeshStandardMaterial({ map: paverTex, roughness: QP[1828] }));
        pavers.rotation.x = -Math.PI / QP[1829];
        pavers.position.set(cx, QP[1830], cz);
        scene.add(pavers);
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
    
     
     
     
    const interiorShellMaterialCache = new Map();
    function sharedInteriorShellMaterial(color) {
        const key = color >>> QP[1860];
        if (!interiorShellMaterialCache.has(key)) interiorShellMaterialCache.set(key, new THREE.MeshStandardMaterial({ color: key, roughness: QP[1861], side: THREE.DoubleSide }));
        return interiorShellMaterialCache.get(key);
    }
    const curbMaterialCache = new Map();
    function sharedCurbMaterial(color) {
        const key = color >>> QP[1862];
        if (!curbMaterialCache.has(key)) curbMaterialCache.set(key, new THREE.MeshStandardMaterial({ color: key, roughness: QP[1863] }));
        return curbMaterialCache.get(key);
    }
    
    function* addBuildingModuleSteps(cell, opts) {
        const { isPrimary, isWarehouse, isHeroTower = false, floorCount, floorHeight, height, color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell, siteFloorCounts, signatureMode, circulationByFloor = null, roomTargetsByFloor = null, fireEscapeSide: plannedFireEscapeSide = null } = opts;
        const { row, col } = cell;
        const { x, z } = cellToWorld(col, row);
    
        const kinds = {};
        for (const s of CELL_SIDE_DEFS) kinds[s.key] = edgeKindForSite(cell, s.dz, s.dx, voidCell);
    
        const rect = computeCellRect(x, z, kinds, streetSetbackX, streetSetbackZ, partySetback, colHalf(col), rowHalf(row));
        const { cx, cz, hwx, hwz } = rect;
        footprintOf[row][col] = { cx, cz, hwx, hwz, height, floorCount };
    
         
         
         
         
        let effectiveCirculationByFloor = circulationByFloor;
        if (!effectiveCirculationByFloor && signatureMode && floorCount > QP[1864]) {
            effectiveCirculationByFloor = Array.from({ length: floorCount }, () => ({ incoming: null, outgoing: null }));
            for (let fl = QP[1865]; fl < floorCount - QP[1866]; fl++) {
                const spec = makeInteriorStairSpec(rect, fl, `signature-${row}-${col}`, `${row},${col}`, false);
                if (!spec) continue;
                effectiveCirculationByFloor[fl].outgoing = spec;
                effectiveCirculationByFloor[fl + QP[1867]].incoming = spec;
            }
            const roof = makeInteriorStairSpec(rect, floorCount - QP[1868], `signature-${row}-${col}`, `${row},${col}`, false);
            if (roof) { roof.toRoof = true; effectiveCirculationByFloor[floorCount - QP[1869]].outgoing = roof; }
        }
    
        const shellMat = sharedInteriorShellMaterial(color);
        const streetSides = CELL_SIDE_DEFS.filter(s => kinds[s.key] === 'street');
         
         
         
         
         
         
         
        const forcedSide = opts.forceDoorSide && streetSides.find(s => s.dx === opts.forceDoorSide.dc && s.dz === opts.forceDoorSide.dr);
        const door = forcedSide || (streetSides.length ? pick(streetSides) : null);
        rect.edgeKinds = kinds;
        rect.doorSide = door;
        rect.floorHeight = floorHeight;
    
         
         
         
         
         
         
         
         
         
         
         
         
         
         
         
         
        const baseGaps = [];
        for (const s of CELL_SIDE_DEFS) {
            const kind = kinds[s.key];
            if (kind === 'internal') {
                const neighborKey = `${row + s.dz},${col + s.dx}`;
                const neighborFloorCount = siteFloorCounts?.get(neighborKey) ?? floorCount;
                baseGaps.push(s.dx !== QP[1870]
                    ? { dx: s.dx, dz: QP[1871], lo: cz - hwz, hi: cz + hwz, floorMax: neighborFloorCount }
                    : { dx: QP[1872], dz: s.dz, lo: cx - hwx, hi: cx + hwx, floorMax: neighborFloorCount });
            } else if (kind === 'courtyard') {
                baseGaps.push(s.dx !== QP[1873] ? { dx: s.dx, dz: QP[1874], lo: cz - QP[1875], hi: cz + QP[1876] } : { dx: QP[1877], dz: s.dz, lo: cx - QP[1878], hi: cx + QP[1879] });
            }
        }
    
         
         
    
         
         
         
         
         
         
        const fireEscapeSide = (!signatureMode && floorCount >= QP[1880]) ? plannedFireEscapeSide : null;
        rect.fireEscapeSide = fireEscapeSide;
        if (fireEscapeSide) {
            for (let fl = QP[1881]; fl < floorCount; fl++) {
                baseGaps.push(fireEscapeSide.dx !== QP[1882]
                    ? { dx: fireEscapeSide.dx, dz: QP[1883], lo: cz - QP[1884], hi: cz + QP[1885], floorOnly: fl }
                    : { dx: QP[1886], dz: fireEscapeSide.dz, lo: cx - QP[1887], hi: cx + QP[1888], floorOnly: fl });
            }
        }
    
         
         
         
         
         
         
        const exposedSetbackSidesByFloor = [];
    
        const floors = [];
        for (let fl = QP[1889]; fl < floorCount; fl++) {
            const gaps = baseGaps.filter(g => (g.floorOnly === undefined || g.floorOnly === fl) && (g.floorMax === undefined || fl < g.floorMax));
            const exposedThisFloor = CELL_SIDE_DEFS.filter(s => {
                const g = baseGaps.find(bg => bg.dx === s.dx && bg.dz === s.dz && bg.floorMax !== undefined);
                return g && fl >= g.floorMax;
            });
            exposedSetbackSidesByFloor.push(exposedThisFloor);
            totalExposedSetbackWalls += exposedThisFloor.length;
            const coreDoor = fl === QP[1890] ? door : null;
            const extMat = fl === QP[1891] ? shellMat : material;
            const segments = buildCoreFloor(
                rect, fl, floorCount, floorHeight, coreDoor, extMat, shellMat, gaps,
                effectiveCirculationByFloor?.[fl] ?? null,
                { roomTarget: roomTargetsByFloor?.[fl], hero: isHeroTower && isPrimary }
            );
            floors.push({ yMin: fl * floorHeight, yMax: fl * floorHeight + floorHeight, segments });
            yield { phase: 'floor', row, col, floor: fl };
        }
        buildingWallSegments.set(`${row},${col}`, { floors });
    
         
         
         
         
         
         
         
         
         
         
        for (const s of CELL_SIDE_DEFS) {
            let firstExposedFloor = QP[1892];
            for (let fl = QP[1893]; fl < floorCount; fl++) {
                if (exposedSetbackSidesByFloor[fl].includes(s)) { firstExposedFloor = fl; break; }
            }
            if (firstExposedFloor === QP[1894]) continue;
            buildingFacades.push(makeFacade(rect, s.dx, s.dz, firstExposedFloor * floorHeight, height, null, 'setback', `${row},${col}`));
        }
    
         
         
         
         
         
        const hw = Math.min(hwx, hwz);
        if (!signatureMode) {
            maybeAddMezzanine(cx, cz, hw, floorHeight, door);
            maybeAddElevator(cx, cz, hw, floorHeight, door);
    
             
             
             
            if (rng() < QP[1895]) placeSemanticCityAsset(rect, pick(['interior/shelf_01', 'interior/shelf_02', 'interior/shelf_03']), QP[1896]);
            if (rng() < QP[1897]) placeSemanticCityAsset(rect, pick(['interior/desk_01', 'interior/desk_02', 'interior/desk_03', 'interior/desk_04']), QP[1898]);
            const crateCorner = semanticCornerPoint(rect, QP[1899], QP[1900]);
            addCrate(crateCorner.x, crateCorner.z);
            const plantCorner = semanticCornerPoint(rect, QP[1901], QP[1902]);
            if (rng() < QP[1903]) addPottedPlant(plantCorner.x, plantCorner.z);
            const pileCorner = semanticCornerPoint(rect, QP[1904], QP[1905]);
            const pileCount = QP[1906] + Math.floor((QP[1907] - buildingContext.maintenance) * QP[1908] + rng() * QP[1909]);
            pileJunkCluster('indoor', pileCorner.x, pileCorner.z, {
                baseCount: Math.max(QP[1910], Math.ceil(pileCount * QP[1911])),
                tiers: pileCount >= QP[1912] ? QP[1913] : QP[1914], spill: Math.max(QP[1915], Math.floor(pileCount * QP[1916])),
                spread: Math.min(QP[1917], hw * QP[1918]),
            });
            if (rng() < QP[1919]) placeSemanticCityAsset(rect, pick(['interior/chair_01', 'interior/chair_02', 'interior/chair_03']), QP[1920]);
            yield { phase: 'interior', row, col };
        }
    
         
         
         
         
         
         
        const topOutgoing = effectiveCirculationByFloor?.[floorCount - QP[1921]]?.outgoing;
        const roofHole = topOutgoing?.toRoof ? topOutgoing.hole : null;
        const roofRects = roofHole
            ? computeNotchedRects(cx, cz, hwx, hwz, roofHole.x - roofHole.hx, roofHole.x + roofHole.hx, roofHole.z - roofHole.hz, roofHole.z + roofHole.hz)
            : [{ x: cx, z: cz, hx: hwx, hz: hwz }];
        for (const roofRect of roofRects) {
            elevatedPlatforms.push({ ...roofRect, y: height, supportKind: 'roof' });
            rooftopDecks.push({ ...roofRect, y: height, buildingKey: `${row},${col}` });
        }
         
         
         
         
         
         
        if (!signatureMode && isPrimary && !isWarehouse && hw > QP[1922] && rng() < QP[1923]) {
            const room = buildRooftopMechanicalRoom(cx, cz, hw, height);
            buildingWallSegments.get(`${row},${col}`).floors.push(room);
        }
         
         
         
        if (!signatureMode && isPrimary && !isWarehouse) {
            const topper = weightedPick({ none: QP[1924], dome: QP[1925], spire: QP[1926] });
            if (topper === 'dome') {
                const dome = new THREE.Mesh(new THREE.SphereGeometry(hw * QP[1927], QP[1928], QP[1929], QP[1930], Math.PI * QP[1931], QP[1932], Math.PI / QP[1933]), material);
                dome.position.set(cx, height, cz);
                scene.add(dome);
            } else if (topper === 'spire') {
                const spireH = randRange(QP[1934], QP[1935]);
                const spire = new THREE.Mesh(
                    jitterGeometry(new THREE.ConeGeometry(QP[1936], spireH, QP[1937]), QP[1938]),
                    new THREE.MeshStandardMaterial({ color: QP[1939], roughness: QP[1940], metalness: QP[1941] })
                );
                spire.position.set(cx, height + spireH / QP[1942], cz);
                scene.add(spire);
            }
        }
    
         
        const curb = CONFIG.buildings.curb;
        const skirt = new THREE.Mesh(skirtBoxGeo, sharedCurbMaterial(curb.color));
        skirt.scale.set(hwx * QP[1943] + curb.overhang, curb.height, hwz * QP[1944] + curb.overhang);
        skirt.position.set(cx, curb.height / QP[1945], cz);
        scene.add(skirt);
        yield { phase: 'roof', row, col };
    
         
         
         
         
         
         
         
         
         
         
         
         
         
         
        const sideFacades = streetSides.map(s => {
            const isFireEscapeFace = fireEscapeSide && fireEscapeSide.dx === s.dx && fireEscapeSide.dz === s.dz;
             
             
             
            const facade = makeFacade(rect, s.dx, s.dz, QP[1946], height, door, 'street', `${row},${col}`);
            if (isFireEscapeFace) {
                const escapeHalf = fireEscapeDimensions(facade).accessHalf;
                facadeReserve(facade, 'fireEscape', -escapeHalf, escapeHalf, QP[1947], height);
                 
                 
                reserveProjectionVolume(makeProjectionBox(
                    facade, QP[1948], QP[1949], height, fireEscapeDepth + QP[1950], escapeHalf
                ));
            }
            buildingFacades.push(facade);
            return { s, facade, isFireEscapeFace };
        });
         
         
         
         
         
         
         
         
         
        rect.streetFacades = sideFacades.map(sf => sf.facade);
        if (signatureMode) {
            addRooftopClutter(cx, cz, hw * QP[1951], height, buildingContext.maintenance);
            yield { phase: 'rooftop', row, col };
            return rect;
        }
    
        for (const { s, facade, isFireEscapeFace } of sideFacades) {
            const ox = s.dx * (hwx + QP[1952]), oz = s.dz * (hwz + QP[1953]);
            const rotY = outwardRotationY(s.dx, s.dz);
    
             
             
             
             
            const t = webAlignment(cz);
            const signChance = THREE.MathUtils.lerp(CONFIG.narrative.darkWeb.signChance, CONFIG.narrative.lightWeb.signChance, t);
            let signCount = QP[1954];
            if (rng() < signChance) {
                const signRolls = [QP[1955], QP[1956], QP[1957]];
                for (const p of signRolls) { if (rng() < p) signCount++; else break; }
            }
            const signsPlaced = yield* placeSignsOnFacadeSteps(facade, signCount, row);
             
             
             
             
             
             
             
            if (signsPlaced === QP[1958]) candidateFaces.push(facade);
            yield { phase: 'facade-signs-complete', row, col, facadeId: facade.id };
    
             
             
             
             
             
             
             
             
    
             
             
             
             
             
            if (rng() < QP[1959]) {
                const pipeHeight = Math.min(height - QP[1960], QP[1961]);
                const spot = findFreeFacadeRect(facade, 'pipe', QP[1962], pipeHeight, QP[1963], height);
                if (spot) {
                    const p = pointOnFacade(facade, spot.u, QP[1964], WALL_THICKNESS / QP[1965] + QP[1966]);
                    addPipeCluster(p.x, p.z, rotY, height, buildingContext.maintenance);
                }
            }
             
             
             
             
             
             
            if (rng() < QP[1967]) {
                const awningWidth = randRange(QP[1968], QP[1969]);
                const awningHeight = awningWidth * QP[1970];
                const awningY = Math.max(QP[1971], floorHeight + QP[1972]);
                const spot = findFreeFacadeRect(facade, 'awning', awningWidth, awningHeight, awningY - QP[1973], awningY + QP[1974]);
                if (spot) {
                    const box = makeProjectionBox(facade, spot.u, spot.v - awningHeight / QP[1975], awningHeight, awningWidth * QP[1976], awningWidth / QP[1977]);
                    if (projectionFits(box)) {
                        reserveProjectionVolume(box);
                        const p = pointOnFacade(facade, spot.u, spot.v);
                        addAwning(p.x, p.y, p.z, rotY, awningWidth);
                    }
                }
            }
             
            if (rng() < QP[1978]) {
                const spot = findFreeFacadeRect(facade, 'camera', QP[1979], QP[1980], QP[1981], Math.min(height - QP[1982], QP[1983]));
                if (spot) {
                    const p = pointOnFacade(facade, spot.u, spot.v);
                    addSecurityCamera(p.x, p.z, rotY, height);
                }
            }
    
             
             
            if (rng() < QP[1984]) {
                const flyerCount = rng() < QP[1985] ? QP[1986] : QP[1987];
                for (let i = QP[1988]; i < flyerCount; i++) {
                    const spot = findFreeFacadeRect(facade, 'flyer', QP[1989], QP[1990], QP[1991], QP[1992], QP[1993], QP[1994]);
                    if (spot) {
                        const p = pointOnFacade(facade, spot.u, spot.v);
                        addWallFlyer(p.x, p.y, p.z, rotY);
                    }
                }
            }
             
            if (rng() < QP[1995]) {
                const spot = findFreeFacadeRect(facade, 'ivy', QP[1996], QP[1997], QP[1998], Math.min(height - QP[1999], QP[2000]), QP[2001], QP[2002]);
                if (spot) {
                    const p = pointOnFacade(facade, spot.u, spot.v);
                    addIvyPatch(p.x, p.y, p.z, rotY);
                }
            }
             
             
             
             
             
            const graffitiRolls = [QP[2003], QP[2004], QP[2005]];
            let graffitiPlaced = QP[2006];
            for (const p of graffitiRolls) {
                if (rng() >= p) break;
                const spot = findFreeFacadeRect(facade, 'graffiti', QP[2007], QP[2008], QP[2009], QP[2010], QP[2011], QP[2012]);
                if (!spot) continue;
                graffitiPlaced++;
                const pp = pointOnFacade(facade, spot.u, spot.v);
                addGraffitiTag(pp.x, pp.y, pp.z, rotY);
            }
            if (graffitiPlaced && rng() < QP[2013] * QUALITY.propDensity) {
                placeRealModel('sprayCans', cx + ox * QP[2014], cz + oz * QP[2015], randRange(QP[2016], Math.PI * QP[2017]));
            }
    
             
             
             
            if (isFireEscapeFace) {
                buildFireEscape(facade, floorHeight, floorCount, `${row},${col}`);
            } else if (rng() < QP[2018] && !isWarehouse) {
                 
                 
                 
                const spot = findFreeFacadeRect(facade, 'balcony', QP[2019], QP[2020], floorHeight + QP[2021], Math.max(floorHeight + QP[2022], height - QP[2023]));
                if (spot) {
                    const p = pointOnFacade(facade, spot.u, spot.v);
                    addBalcony(p.x, p.y, p.z, rotY, buildingContext.maintenance);
                }
            }
            yield { phase: 'facade-detail', row, col, facadeId: facade.id };
        }
    
        addRooftopClutter(cx, cz, hw * QP[2024], height, buildingContext.maintenance);
        yield { phase: 'rooftop', row, col };
        return rect;
    }

    function drainBuildingModuleSteps(iterator) {
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }

    function addBuildingModule(cell, opts) {
        return drainBuildingModuleSteps(addBuildingModuleSteps(cell, opts));
    }
    
     
     
     
     
     
     
     
     
     
     
     
    function streetSetbackRoll() {
        return Math.min(randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / QP[2025], STREET * QP[2026]);
    }
    
     
     
     
     
     
     
    let rectHeroTowerCount = QP[2027];
    let totalSiteStairTransitions = QP[2028];
    let verticalCirculationValidationFailures = QP[2029];
    function previewSiteModuleRect(cell, voidCell, streetSetbackX, streetSetbackZ, partySetback) {
        const { x, z } = cellToWorld(cell.col, cell.row);
        const kinds = {};
        for (const side of CELL_SIDE_DEFS) kinds[side.key] = edgeKindForSite(cell, side.dz, side.dx, voidCell);
        return { ...computeCellRect(x, z, kinds, streetSetbackX, streetSetbackZ, partySetback, colHalf(cell.col), rowHalf(cell.row)), kinds };
    }
    
    function makeInteriorStairSpec(rect, transitionIndex, siteId, cellKey, heroCore = false) {
         
         
         
        const width = heroCore ? QP[2031] : QP[2032];
        const landingDepth = heroCore ? QP[2033] : QP[2034];
        const candidates = [];
        if (rect.hwx > QP[2035] && rect.hwz > width * QP[2036] + QP[2037]) candidates.push('x');
        if (rect.hwz > QP[2038] && rect.hwx > width * QP[2039] + QP[2040]) candidates.push('z');
        if (!candidates.length) return null;
    
        const lr = localRng(hashString32(`${SEED}:site-stair:${siteId}:${cellKey}:${transitionIndex}:${heroCore ? 'hero' : 'regular'}`));
        let axis;
        if (candidates.length === QP[2041]) axis = candidates[QP[2042]];
        else if (heroCore) axis = rect.hwx >= rect.hwz ? 'x' : 'z';
        else axis = candidates[(transitionIndex + (lr() < QP[2043] ? QP[2044] : QP[2045])) % candidates.length];
    
        const alongCenter = axis === 'x' ? rect.cx : rect.cz;
        const crossCenter = axis === 'x' ? rect.cz : rect.cx;
        const halfAlong = axis === 'x' ? rect.hwx : rect.hwz;
        const halfCross = axis === 'x' ? rect.hwz : rect.hwx;
        const effectiveLanding = Math.min(landingDepth, Math.max(QP[2046], halfAlong * QP[2047]));
        const runHalf = Math.max(QP[2048], halfAlong - effectiveLanding - QP[2049]);
        if (runHalf * QP[2050] < QP[2051]) return null;
    
        const maxCrossOffset = Math.max(QP[2052], halfCross - width * QP[2053] - QP[2054]);
        const slotOffset = heroCore ? QP[2055] : Math.min(QP[2056], maxCrossOffset) * (transitionIndex % QP[2057] ? QP[2058] : QP[2059]);
        const cross = crossCenter + slotOffset;
        const direction = (transitionIndex % QP[2060] === QP[2061] ? QP[2062] : QP[2063]) * (heroCore ? QP[2064] : (lr() < QP[2065] ? QP[2066] : QP[2067]));
        const low = alongCenter - runHalf, high = alongCenter + runHalf;
        const from = direction > QP[2068] ? low : high;
        const to = direction > QP[2069] ? high : low;
        const holeAlongLo = low - QP[2070], holeAlongHi = high + QP[2071];
        const crossHalf = width * QP[2072] + QP[2073];
        const hole = axis === 'x'
            ? { x: (holeAlongLo + holeAlongHi) / QP[2074], z: cross, hx: (holeAlongHi - holeAlongLo) / QP[2075], hz: crossHalf }
            : { x: cross, z: (holeAlongLo + holeAlongHi) / QP[2076], hx: crossHalf, hz: (holeAlongHi - holeAlongLo) / QP[2077] };
        const shaft = heroCore ? (axis === 'x'
            ? { x: alongCenter, z: cross, hx: Math.min(rect.hwx - QP[2078], runHalf + effectiveLanding * QP[2079]), hz: Math.min(rect.hwz - QP[2080], crossHalf + QP[2081]) }
            : { x: cross, z: alongCenter, hx: Math.min(rect.hwx - QP[2082], crossHalf + QP[2083]), hz: Math.min(rect.hwz - QP[2084], runHalf + effectiveLanding * QP[2085]) }) : null;
        return { axis, from, to, cross, width, hole, shaft, heroCore, transitionIndex };
    }
    
    function planSiteVerticalCirculation(siteId, modulePlans, primaryKey, isHeroTower) {
        const circulationByCellKey = new Map();
        const roomTargetsByCellKey = new Map();
        const byKey = new Map(modulePlans.map(m => [m.key, m]));
        for (const m of modulePlans) {
            circulationByCellKey.set(m.key, Array.from({ length: m.floorCount }, () => ({ incoming: null, outgoing: null })));
            const lr = localRng(hashString32(`${SEED}:site-rooms:${siteId}:${m.key}`));
            roomTargetsByCellKey.set(m.key, Array.from({ length: m.floorCount }, (_, fl) => {
                if (isHeroTower && m.key === primaryKey) return QP[2086] + Math.floor(lr() * QP[2087]);  
                return QP[2088] + Math.floor(lr() * (fl % QP[2089] === QP[2090] ? QP[2091] : QP[2092]));
            }));
        }
    
        const maxFloors = Math.max(...modulePlans.map(m => m.floorCount));
        let previousHost = null;
        let transitionCount = QP[2093];
        const adjacent = (a, b) => a && b && Math.abs(a.cell.row - b.cell.row) + Math.abs(a.cell.col - b.cell.col) === QP[2094];
    
        for (let fl = QP[2095]; fl < maxFloors - QP[2096]; fl++) {
            let candidates = modulePlans.filter(m => m.floorCount > fl + QP[2097] && makeInteriorStairSpec(m.rect, fl, siteId, m.key, isHeroTower && m.key === primaryKey));
            if (!candidates.length) {
                console.warn(`[circulation] site ${siteId} floor ${fl}->${fl + QP[2098]}: no module can fit a real stair; transition omitted`);
                continue;
            }
    
            let host;
            if (isHeroTower && candidates.some(m => m.key === primaryKey)) {
                host = byKey.get(primaryKey);
            } else {
                const nearPrevious = previousHost ? candidates.filter(m => m.key !== previousHost.key && adjacent(m, previousHost)) : [];
                const different = candidates.filter(m => !previousHost || m.key !== previousHost.key);
                const pool = nearPrevious.length ? nearPrevious : different.length ? different : candidates;
                const lr = localRng(hashString32(`${SEED}:site-host:${siteId}:${fl}`));
                host = pool[Math.floor(lr() * pool.length) % pool.length];
            }
            const spec = makeInteriorStairSpec(host.rect, fl, siteId, host.key, isHeroTower && host.key === primaryKey);
            if (!spec) continue;
            circulationByCellKey.get(host.key)[fl].outgoing = spec;
            circulationByCellKey.get(host.key)[fl + QP[2099]].incoming = spec;
            previousHost = host;
            transitionCount++;
        }
    
         
         
         
        const preferredRoofHost = byKey.get(primaryKey);
        const roofHost = preferredRoofHost?.floorCount === maxFloors
            ? preferredRoofHost
            : modulePlans.find(m => m.floorCount === maxFloors);
        if (roofHost && roofHost.floorCount > QP[2100]) {
            const fl = roofHost.floorCount - QP[2101];
            const roofSpec = makeInteriorStairSpec(roofHost.rect, fl, siteId, roofHost.key, isHeroTower);
            if (roofSpec) {
                roofSpec.toRoof = true;
                circulationByCellKey.get(roofHost.key)[fl].outgoing = roofSpec;
            }
        }
    
         
         
         
         
        for (let fl = QP[2102]; fl < maxFloors - QP[2103]; fl++) {
            const upperExists = modulePlans.some(m => m.floorCount > fl + QP[2104]);
            if (!upperExists) continue;
            let outgoingCount = QP[2105], incomingCount = QP[2106];
            for (const m of modulePlans) {
                const plan = circulationByCellKey.get(m.key);
                if (plan?.[fl]?.outgoing && !plan[fl].outgoing.toRoof) outgoingCount++;
                if (plan?.[fl + QP[2107]]?.incoming) incomingCount++;
            }
            if (outgoingCount !== QP[2108] || incomingCount !== QP[2109]) {
                verticalCirculationValidationFailures++;
                console.error(`[circulation] INVALID site ${siteId} floor ${fl}->${fl + QP[2110]}: outgoing=${outgoingCount}, incoming=${incomingCount}; expected exactly one of each`);
            }
        }
        return { circulationByCellKey, roomTargetsByCellKey, transitionCount };
    }
    
     
     
     
    function* addBuildingSiteSteps(site) {
        const { cells } = site;
        const degreeOf = (cell) => [[QP[2111], QP[2112]], [QP[2113], QP[2114]], [QP[2115], QP[2116]], [QP[2117], QP[2118]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === site.id).length;
        let primary = cells[QP[2119]], primaryDegree = QP[2120];
        for (const cell of cells) {
            const d = degreeOf(cell);
            if (d > primaryDegree) { primaryDegree = d; primary = cell; }
        }
    
        const isWarehouse = rng() < QP[2121];
         
         
        const heroCoreCandidates = cells.filter(cell => colSize[cell.col] >= BLOCK - QP[2122] && rowSize[cell.row] >= BLOCK - QP[2123]);
        const isHeroTower = !isWarehouse && heroCoreCandidates.length > QP[2124] && rng() < CONFIG.buildings.heroTowerChance;
        if (isHeroTower) {
            heroCoreCandidates.sort((a, b) => degreeOf(b) - degreeOf(a));
            primary = heroCoreCandidates[QP[2125]];
        }
    
        const color = pick(CONFIG.buildings.palette);
        const buildingContext = { wealth: rng(), maintenance: rng() };
        const useStain = !isWarehouse && rng() < QP[2126] + (QP[2127] - buildingContext.maintenance) * QP[2128];
        const useWindows = !isWarehouse && !useStain;
        const litRatio = Math.max(QP[2129], Math.min(QP[2130], QP[2131] + buildingContext.wealth * QP[2132] - (QP[2133] - buildingContext.maintenance) * QP[2134]));
        const floorHeight = QP[2135];
        const streetSetbackX = isWarehouse ? CONFIG.maze.buildingMarginMin / QP[2136] : isHeroTower ? Math.min(QP[2137], streetSetbackRoll()) : streetSetbackRoll();
        const streetSetbackZ = isWarehouse ? CONFIG.maze.buildingMarginMin / QP[2138] : isHeroTower ? Math.min(QP[2139], streetSetbackRoll()) : streetSetbackRoll();
        const partySetback = randRange(QP[2140], QP[2141]);
    
        let voidCell = null;
        if (cells.length >= QP[2142]) {
            for (const cell of cells) {
                if (cell === primary) continue;
                if (degreeOf(cell) === QP[2143]) { voidCell = cell; break; }
            }
        }
    
        const maxFloorsForThis = isWarehouse ? Math.min(QUALITY.maxEnterableFloors, QP[2144]) : isHeroTower ? QUALITY.maxHeroFloors : QUALITY.maxEnterableFloors;
        const weights = isHeroTower ? CONFIG.buildings.heroFloorCountWeights : CONFIG.buildings.floorCountWeights;
        const primaryFloorCount = Math.max(QP[2145], Math.min(maxFloorsForThis, Number(weightedPick(weights))));
        const height = primaryFloorCount * floorHeight;
        const material = useStain
            ? sharedBuildingFacadeMaterial({ map: makeTopologyStainTexture() })
            : useWindows
                ? sharedBuildingFacadeMaterial({ map: makeWindowGridTexture(height, color, litRatio) })
                : sharedBuildingFacadeMaterial({ color });
    
        const floorCountByCellKey = new Map();
        for (const cell of cells) {
            if (voidCell && cell.row === voidCell.row && cell.col === voidCell.col) continue;
            const key = `${cell.row},${cell.col}`;
            const isPrimaryCell = cell.row === primary.row && cell.col === primary.col;
            let floorCount;
            if (isPrimaryCell) floorCount = primaryFloorCount;
            else if (isHeroTower) {
                 
                 
                 
                const lr = localRng(hashString32(`${SEED}:hero-podium:${site.id}:${key}`));
                floorCount = Math.max(QP[2146], Math.min(primaryFloorCount - QP[2147], QP[2148] + Math.floor(lr() * QP[2149])));
            } else {
                floorCount = Math.max(QP[2150], primaryFloorCount - Math.floor(rng() * QP[2151]));
            }
            floorCountByCellKey.set(key, floorCount);
        }
    
        const modulePlans = [];
        for (const cell of cells) {
            const key = `${cell.row},${cell.col}`;
            if (!floorCountByCellKey.has(key)) continue;
            modulePlans.push({
                key, cell,
                floorCount: floorCountByCellKey.get(key),
                rect: previewSiteModuleRect(cell, voidCell, streetSetbackX, streetSetbackZ, partySetback),
            });
        }
    
         
         
         
         
        for (const m of modulePlans) {
            if (m.floorCount <= QP[2152]) continue;
            const canFit = !!makeInteriorStairSpec(m.rect, QP[2153], site.id, m.key, isHeroTower && m.cell === primary);
            if (!canFit) {
                m.floorCount = QP[2154];
                floorCountByCellKey.set(m.key, QP[2155]);
            }
        }
        if (!isHeroTower) {
            const currentPrimaryKey = `${primary.row},${primary.col}`;
            const currentPrimaryPlan = modulePlans.find(m => m.key === currentPrimaryKey);
            if (!currentPrimaryPlan || currentPrimaryPlan.floorCount <= QP[2156]) {
                const better = modulePlans.filter(m => m.floorCount > QP[2157]).sort((a, b) => b.floorCount - a.floorCount || degreeOf(b.cell) - degreeOf(a.cell))[QP[2158]];
                if (better) primary = better.cell;
            }
        }
        const primaryKey = `${primary.row},${primary.col}`;
        const circulation = planSiteVerticalCirculation(site.id, modulePlans, primaryKey, isHeroTower);
    
         
         
         
        let plannedEscape = null;
        const escapeCandidates = [];
        for (const m of modulePlans) {
            if (m.floorCount < QP[2159]) continue;
            for (const side of CELL_SIDE_DEFS) {
                if (m.rect.kinds[side.key] !== 'street') continue;
                if (fireEscapeSideFits(m.rect, side, m.floorCount * floorHeight)) escapeCandidates.push({ module: m, side });
            }
        }
        if (escapeCandidates.length) {
            escapeCandidates.sort((a, b) => b.module.floorCount - a.module.floorCount);
            const topFloor = escapeCandidates[QP[2160]].module.floorCount;
            const top = escapeCandidates.filter(x => x.module.floorCount === topFloor);
            const lr = localRng(hashString32(`${SEED}:fire-escape-site:${site.id}`));
            plannedEscape = top[Math.floor(lr() * top.length) % top.length];
        }
    
        const builtModules = [];
        for (const cell of cells) {
            if (voidCell && cell.row === voidCell.row && cell.col === voidCell.col) {
                buildCourtyardVoid(cell);
                yield { phase: 'courtyard', row: cell.row, col: cell.col };
                continue;
            }
            const key = `${cell.row},${cell.col}`;
            const isPrimary = key === primaryKey;
            const floorCount = floorCountByCellKey.get(key);
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary, isWarehouse, isHeroTower, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell,
                siteFloorCounts: floorCountByCellKey,
                circulationByFloor: circulation.circulationByCellKey.get(key),
                roomTargetsByFloor: circulation.roomTargetsByCellKey.get(key),
                fireEscapeSide: plannedEscape?.module.key === key ? plannedEscape.side : null,
            });
            builtModules.push(rect);
        }
        if (isHeroTower) rectHeroTowerCount++;
        totalSiteStairTransitions += circulation.transitionCount;
        addSiteDebugOverlay(cells, builtModules, voidCell);
        return builtModules;
    }

    function addBuildingSite(site) {
        const iterator = addBuildingSiteSteps(site);
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }
    
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
    
    
     
     
     
     
     
     
     
     
     
     
     
     

    return Object.freeze({
        addBuildingModule,
        addBuildingModuleSteps,
        addBuildingSite,
        addBuildingSiteSteps,
        buildCourtyardVoid,
        addSiteDebugOverlay,
        addFacadeDebugOverlay,
        addSignatureDebugOverlay,
        streetSetbackRoll,
        stats() {
            return {
                totalExposedSetbackWalls,
                heroTowers: rectHeroTowerCount,
                authoredStairTransitions: totalSiteStairTransitions,
                circulationValidationFailures: verticalCirculationValidationFailures,
            };
        },
    });
}
