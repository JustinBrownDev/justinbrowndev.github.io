import * as THREE from '../vendor/three/three.module.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { ART_GALLERY_CATALOG, AS400_CONTENT } from '../content/signature-content.js';

export function createSignatureBuildingSystem(deps) {
    const {
        CONFIG, QUALITY, scene, pendingGalleryPanels, photoImages, takeDynamicLight,
        addBench, addBuildingModule, addBuildingModuleSteps, addPottedPlant, addSign, addSiteDebugOverlay,
        addTerminalPlaque, addWallPoster, buildCourtyardVoid, cellToWorld, colHalf, findFreeFacadeRect,
        jitterGeometry, makePixelTexture, makeWindowGridTexture, mountStandoffPanel, pick,
        pickRandomizedCuratedPair, placeCityAsset, placeSemanticCityAsset, pointOnFacade, randRange, rng,
        rowHalf, sharedBuildingFacadeMaterial, siteIdOf, streetSetbackRoll
    } = deps;

    function buildFuturePlaceholder(site) {
        const { cells, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.futurePlaceholder;
    
        for (const cell of cells) buildCourtyardVoid(cell);
        addSiteDebugOverlay(cells, [], null);
    
        const e = signatureInstance?.mainEntrance;
        if (e) {
            addSign(
                e.doorX, 2.15, e.doorZ, e.outwardRotY,
                typeCfg.exteriorName, typeCfg.exteriorSubtitle,
                0xffffff, false, null, { w: 2.9, h: 0.78 }
            );
        }
        console.log(`[signature] RESERVED: future singular area established (${cells.length} cells); no building authored by design`);
    }
    
    function buildSignaturePlaceholder(site) {
        const { cells, signatureType, signatureInstance, id } = site;
        const typeCfg = CONFIG.signatureBuildings[signatureType];
         
         
         
         
        const color = QP[2161];
        const buildingContext = { wealth: QP[2162], maintenance: QP[2163] };
        const floorHeight = QP[2164];
        const primaryFloorCount = Math.max(QP[2165], Math.min(QUALITY.maxEnterableFloors, typeCfg.preferredFloors || QP[2166]));
        const material = sharedBuildingFacadeMaterial({ map: makeWindowGridTexture(primaryFloorCount * floorHeight, color, QP[2167]) });
        const streetSetbackX = streetSetbackRoll();
        const streetSetbackZ = streetSetbackRoll();
        const partySetback = randRange(QP[2168], QP[2169]);
    
        const degreeOf = (cell) => [[QP[2170], QP[2171]], [QP[2172], QP[2173]], [QP[2174], QP[2175]], [QP[2176], QP[2177]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2178]], primaryDegree = QP[2179];
        for (const cell of cells) { const d = degreeOf(cell); if (d > primaryDegree) { primaryDegree = d; primary = cell; } }
    
        const floorCountByCellKey = new Map();
        for (const cell of cells) {
            const isPrimaryCell = cell.row === primary.row && cell.col === primary.col;
            floorCountByCellKey.set(`${cell.row},${cell.col}`, isPrimaryCell ? primaryFloorCount : Math.max(QP[2180], primaryFloorCount - Math.floor(rng() * QP[2181])));
        }
    
        const builtModules = [];
        for (const cell of cells) {
            const isPrimary = cell.row === primary.row && cell.col === primary.col;
            const floorCount = floorCountByCellKey.get(`${cell.row},${cell.col}`);
            const rect = addBuildingModule(cell, {
                isPrimary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell: null,
                siteFloorCounts: floorCountByCellKey,
            });
            builtModules.push(rect);
        }
        addSiteDebugOverlay(cells, builtModules, null);
    
         
         
         
         
         
         
        const e = signatureInstance.mainEntrance;
         
         
         
         
        addSign(e.doorX, primaryFloorCount * floorHeight - QP[2182], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2183], false, QP[2184], { w: QP[2185], h: QP[2186] });
    
        console.log(`[signature] ${typeCfg.exteriorName}: placeholder massing built (${cells.length} cells, ${primaryFloorCount} floors) -- authored interior pending, see task list`);
    }
    
    function addGalleryPlacard(x, z, facingRotY, title, subtitle) {
        const g = new THREE.Group();
        const post = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(QP[2201], QP[2202], QP[2203], QP[2204]), QP[2205]),
            new THREE.MeshStandardMaterial({ color: QP[2206], roughness: QP[2207], metalness: QP[2208] })
        );
        post.position.y = QP[2209];
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#e8e2d0';
            ctx.fillRect(QP[2210], QP[2211], w, h);
            ctx.fillStyle = '#201c18';
            ctx.textAlign = 'center';
            ctx.font = 'bold 9px "Courier New", monospace';
            ctx.fillText(title, w / QP[2212], h / QP[2213] - QP[2214], w - QP[2215]);
            ctx.font = '7px "Courier New", monospace';
            ctx.fillText(subtitle, w / QP[2216], h / QP[2217] + QP[2218], w - QP[2219]);
        }, QP[2220], QP[2221]);
        const plate = new THREE.Mesh(
            new THREE.PlaneGeometry(QP[2222], QP[2223]),
            new THREE.MeshStandardMaterial({ map: tex, roughness: QP[2224], metalness: QP[2225] })
        );
        plate.rotation.x = QP[2226];
         
         
        plate.position.set(QP[2227], QP[2228], QP[2229]);
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(QP[2230], QP[2231], QP[2232]),
            new THREE.MeshStandardMaterial({ color: QP[2233], roughness: QP[2234], metalness: QP[2235] })
        );
        arm.position.set(QP[2236], QP[2237], QP[2238]);
        g.add(post, arm, plate);
        g.rotation.y = facingRotY;
        g.position.set(x, QP[2239], z);
        scene.add(g);
    }
    
    function buildGalleryArtPanel(img, x, y, z, rotY, widthUnits, title, subtitle) {
        const imgAspect = img.height / img.width;  
        const canvasW = QP[2240];
        const imgAreaH = Math.round(canvasW * imgAspect);
        const captionH = QP[2241];
        const canvas = document.createElement('canvas');
        canvas.width = canvasW; canvas.height = imgAreaH + captionH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f2ede0';
        ctx.fillRect(QP[2242], QP[2243], canvasW, canvas.height);
        ctx.drawImage(img, QP[2244], QP[2245], canvasW, imgAreaH);
        ctx.fillStyle = '#201c18';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px "Courier New", monospace';
        ctx.fillText(title, canvasW / QP[2246], imgAreaH + QP[2247], canvasW - QP[2248]);
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(subtitle, canvasW / QP[2249], imgAreaH + QP[2250], canvasW - QP[2251]);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const heightUnits = widthUnits * (canvas.height / canvasW);
        mountStandoffPanel(x, y, z, rotY, widthUnits, heightUnits, new THREE.MeshStandardMaterial({ map: tex, roughness: QP[2252] }));
        return heightUnits;
    }
    
    function mountGalleryPiece(facade, vLo, vHi, piece) {
        const width = piece.featured ? randRange(QP[2253], QP[2254]) : randRange(QP[2255], QP[2256]);
        const height = width * piece.aspectRatio + width * QP[2257];  
        const spot = findFreeFacadeRect(facade, 'galleryArt', width, height, vLo, vHi, QP[2258], QP[2259]);
        if (!spot) return false;
        const p = pointOnFacade(facade, spot.u, spot.v, QP[2260]);  
        const rotY = facade.rotY + Math.PI;  
        const img = photoImages[piece.photoKey];
        if (img) buildGalleryArtPanel(img, p.x, p.y, p.z, rotY, width, piece.title, piece.subtitle);
        else (pendingGalleryPanels[piece.photoKey] ??= []).push({ x: p.x, y: p.y, z: p.z, rotY, widthUnits: width, title: piece.title, subtitle: piece.subtitle });
        return true;
    }
    
    function* buildArtGallerySteps(site) {
        const { cells, id, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.artGallery;
        const floorHeight = QP[2261];
        const floorCount = QP[2262];  
        const color = QP[2263];  
        const material = new THREE.MeshStandardMaterial({ color, roughness: QP[2264], side: THREE.DoubleSide });
        const buildingContext = { wealth: QP[2265], maintenance: QP[2266] };  
        const streetSetback = streetSetbackRoll();
        const partySetback = randRange(QP[2267], QP[2268]);
    
        const degreeOf = (cell) => [[QP[2269], QP[2270]], [QP[2271], QP[2272]], [QP[2273], QP[2274]], [QP[2275], QP[2276]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2277]], primaryDegree = QP[2278];
        for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }
    
         
         
         
         
        let voidCell = null;
        if (cells.length >= QP[2279]) {
            for (const c of cells) {
                if (c === primary) continue;
                if (degreeOf(c) === QP[2280]) { voidCell = c; break; }
            }
        }
        const buildCells = cells.filter(c => !voidCell || c.row !== voidCell.row || c.col !== voidCell.col);
    
         
         
         
         
         
         
         
         
         
        const mainEntrance = signatureInstance.mainEntrance;
        const secondaryEntrance = signatureInstance.secondaryEntrance;
        const others0 = buildCells.filter(c => c !== primary);
        const vestibule = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[QP[2281]] ?? primary;
        const others1 = others0.filter(c => c !== vestibule);
        const service = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - QP[2282]] ?? null;
        const others2 = others1.filter(c => c !== service);
        const sideGalleryA = others2[QP[2283]] ?? null;
        const sideGalleryB = others2[QP[2284]] ?? null;
        const storageExtras = others2.slice(QP[2285]);
    
        const roleByCellKey = new Map();
        roleByCellKey.set(`${primary.row},${primary.col}`, 'mainGallery');
        roleByCellKey.set(`${vestibule.row},${vestibule.col}`, roleByCellKey.get(`${vestibule.row},${vestibule.col}`) ?? 'vestibule');
        if (service) roleByCellKey.set(`${service.row},${service.col}`, roleByCellKey.get(`${service.row},${service.col}`) ?? 'service');
        if (sideGalleryA) roleByCellKey.set(`${sideGalleryA.row},${sideGalleryA.col}`, 'sideGalleryA');
        if (sideGalleryB) roleByCellKey.set(`${sideGalleryB.row},${sideGalleryB.col}`, 'sideGalleryB');
        for (const c of storageExtras) roleByCellKey.set(`${c.row},${c.col}`, 'storage');
    
         
         
         
         
        const floorCountByCellKey = new Map(buildCells.map(c => [`${c.row},${c.col}`, floorCount]));
    
         
         
         
         
         
        const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
        const rectByCellKey = new Map();
        for (const cell of buildCells) {
            const isPrimaryCell = cell === primary;
            const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
                : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                    : null;
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary: isPrimaryCell, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
                voidCell, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
            });
            rectByCellKey.set(`${cell.row},${cell.col}`, rect);
            yield { phase: 'art-gallery-module', row: cell.row, col: cell.col };
        }
        if (voidCell) buildCourtyardVoid(voidCell);  
    
        const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
         
         
         
         
         
        const groundBand = [QP[2286], floorHeight - QP[2287]];
        const upperBand = [floorHeight + QP[2288], floorCount * floorHeight - QP[2289]];
    
         
         
         
         
         
        const roomCellFor = { mainGallery: primary, vestibule, sideGalleryA, sideGalleryB, upperGallery: primary, service, storage: storageExtras[QP[2290]] };
        let hung = QP[2291], skipped = QP[2292];
        for (const piece of ART_GALLERY_CATALOG) {
            if (piece.kind === 'pedestal') continue;  
            const band = piece.room === 'upperGallery' ? upperBand : groundBand;
            const preferredCell = roomCellFor[piece.room] ?? primary;
            const candidateCells = [preferredCell, primary, vestibule, sideGalleryA, sideGalleryB].filter(Boolean);
            let placed = false;
            for (const cell of candidateCells) {
                for (const facade of facadesFor(cell)) {
                    if (mountGalleryPiece(facade, band[QP[2293]], band[QP[2294]], piece)) { placed = true; break; }
                }
                if (placed) break;
            }
            placed ? hung++ : skipped++;
            if (!placed) console.warn(`[signature] ART GALLERY: no free wall found for "${piece.title}" -- skipped (never overlapped, never invented a second wall)`);
            yield { phase: 'art-gallery-art', piece: piece.id };
        }
    
         
         
         
         
         
         
         
        {
            const organicTV = ART_GALLERY_CATALOG.find(p => p.id === 'organicTV');
            const target = voidCell ?? primary;
            const { x: tx, z: tz } = cellToWorld(target.col, target.row);
            const jitterR = voidCell ? (Math.min(colHalf(target.col), rowHalf(target.row)) - QP[2295]) : Math.min(rectByCellKey.get(`${target.row},${target.col}`)?.hwx ?? QP[2296], rectByCellKey.get(`${target.row},${target.col}`)?.hwz ?? QP[2297]) * QP[2298];
            const px = tx + randRange(-jitterR, jitterR), pz = tz + randRange(-jitterR, jitterR);
            placeCityAsset(pick(['art_gallery/pedestal_01', 'art_gallery/pedestal_02', 'art_gallery/pedestal_03', 'art_gallery/pedestal_04']), px, pz, randRange(QP[2299], Math.PI * QP[2300]));
            const sculpture = new THREE.Mesh(
                jitterGeometry(new THREE.TorusKnotGeometry(QP[2301], QP[2302], QP[2303], QP[2304], QP[2305], QP[2306]), QP[2307]),
                new THREE.MeshStandardMaterial({ color: QP[2308], roughness: QP[2309], metalness: QP[2310] })
            );
            sculpture.position.set(px, QP[2311], pz);
            sculpture.rotation.set(randRange(QP[2312], Math.PI), randRange(QP[2313], Math.PI), QP[2314]);
            scene.add(sculpture);
            addGalleryPlacard(px + QP[2315], pz + QP[2316], randRange(QP[2317], Math.PI * QP[2318]), organicTV.title, organicTV.subtitle);
            console.log(`[signature] ART GALLERY: "${organicTV.title}" on pedestal in ${voidCell ? 'the courtyard' : 'the main gallery'}`);
        }
        yield { phase: 'art-gallery-pedestal' };
    
         
         
        {
            const { x: vx, z: vz } = cellToWorld(vestibule.col, vestibule.row);
            addBench(vx + randRange(QP[2319], QP[2320]), vz + randRange(QP[2321], QP[2322]), randRange(QP[2323], Math.PI * QP[2324]));
        }
         
         
        {
            const { x: mx, z: mz } = cellToWorld(primary.col, primary.row);
            const mr = rectByCellKey.get(`${primary.row},${primary.col}`);
            addBench(mx + randRange(-((mr?.hwx ?? QP[2325]) * QP[2326]), (mr?.hwx ?? QP[2327]) * QP[2328]), mz + randRange(-((mr?.hwz ?? QP[2329]) * QP[2330]), (mr?.hwz ?? QP[2331]) * QP[2332]), randRange(QP[2333], Math.PI * QP[2334]));
        }
         
         
         
        {
            const { x: rx, z: rz } = cellToWorld(primary.col, primary.row);
            const roofY = floorCount * floorHeight;
            const mr = rectByCellKey.get(`${primary.row},${primary.col}`);
            const rhw = Math.min(mr?.hwx ?? QP[2335], mr?.hwz ?? QP[2336]) * QP[2337];
            addPottedPlant(rx + rhw, rz + rhw * QP[2338]);
            addPottedPlant(rx - rhw, rz - rhw * QP[2339]);
            addBench(rx + rhw * QP[2340], rz - rhw * QP[2341], randRange(QP[2342], Math.PI * QP[2343]));
            console.log(`[signature] ART GALLERY: roof terrace at y=${roofY.toFixed(QP[2344])} above the main gallery`);
        }
    
         
         
        const e = mainEntrance;
        const vestFacade = facadesFor(vestibule)[QP[2345]] ?? facadesFor(primary)[QP[2346]];
        if (vestFacade) {
            const spot = findFreeFacadeRect(vestFacade, 'sign', QP[2347], QP[2348], floorCount * floorHeight - QP[2349], floorCount * floorHeight - QP[2350], QP[2351], QP[2352]);
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2353], false, QP[2354], { w: QP[2355], h: QP[2356] });
            } else {
                addSign(e.doorX, floorCount * floorHeight - QP[2357], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2358], false, QP[2359], { w: QP[2360], h: QP[2361] });
            }
        }
         
         
         
         
         
        if (vestFacade) {
            for (const piece of [ART_GALLERY_CATALOG[QP[2362]], ART_GALLERY_CATALOG[QP[2363]]]) {
                const spot = findFreeFacadeRect(vestFacade, 'posterCase', QP[2364], QP[2365], QP[2366], QP[2367], QP[2368], QP[2369]);
                if (spot) {
                    const p = pointOnFacade(vestFacade, spot.u, spot.v);
                    addWallPoster(p.x, p.y, p.z, vestFacade.rotY, piece.title, piece.subtitle);
                }
            }
        }
    
        yield { phase: 'art-gallery-finish' };
        console.log(`[signature] ART GALLERY: built ${buildCells.length} modules (courtyard=${!!voidCell}), ${hung}/${ART_GALLERY_CATALOG.filter(p => p.kind !== 'pedestal').length} wall pieces hung${skipped ? `, ${skipped} skipped (no free wall)` : ''}, 1 pedestal piece, roof terrace active`);
    }
    
    function* buildAS400ArchiveSteps(site) {
        const { cells, id, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.as400Archive;
        const floorHeight = QP[2370];
        const floorCount = Math.max(QP[2371], Math.min(QP[2372], typeCfg.preferredFloors || QP[2373]));
        const color = QP[2374];  
        const material = new THREE.MeshStandardMaterial({ color, roughness: QP[2375], side: THREE.DoubleSide });
        const buildingContext = { wealth: QP[2376], maintenance: QP[2377] };
        const streetSetback = streetSetbackRoll();
        const partySetback = randRange(QP[2378], QP[2379]);
    
        const degreeOf = (cell) => [[QP[2380], QP[2381]], [QP[2382], QP[2383]], [QP[2384], QP[2385]], [QP[2386], QP[2387]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2388]], primaryDegree = QP[2389];
        for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }
    
        const mainEntrance = signatureInstance.mainEntrance;
        const secondaryEntrance = signatureInstance.secondaryEntrance;
        const others0 = cells.filter(c => c !== primary);
         
         
        const orientation = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[QP[2390]] ?? primary;
         
         
        const others1 = others0.filter(c => c !== orientation);
        const machineRoom = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - QP[2391]] ?? primary;
        const remaining = others1.filter(c => c !== machineRoom);
    
        const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
        const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
        const rectByCellKey = new Map();
        for (const cell of cells) {
            const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
                : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                    : null;
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
                voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
            });
            rectByCellKey.set(`${cell.row},${cell.col}`, rect);
            yield { phase: 'as400-module', row: cell.row, col: cell.col };
        }
    
        const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
        const bandFor = (fl) => [fl * floorHeight + QP[2392], (fl + QP[2393]) * floorHeight - QP[2394]];
        const RACK_MODELS = ['as400_archive/equipment_rack_01', 'as400_archive/equipment_rack_02', 'as400_archive/equipment_rack_03', 'as400_archive/equipment_rack_04'];
        const TERMINAL_MODELS = ['as400_archive/crt_terminal_01', 'as400_archive/crt_terminal_02', 'as400_archive/crt_terminal_03', 'as400_archive/crt_terminal_04', 'as400_archive/crt_terminal_05', 'as400_archive/crt_terminal_06'];
        const WORKSTATION_MODELS = ['as400_archive/workstation_01', 'as400_archive/workstation_02', 'as400_archive/workstation_03', 'as400_archive/workstation_04', 'as400_archive/workstation_05'];
    
         
         
         
         
        {
            const { x: ox, z: oz } = cellToWorld(orientation.col, orientation.row);
            addBench(ox + randRange(QP[2395], QP[2396]), oz + randRange(QP[2397], QP[2398]), randRange(QP[2399], Math.PI * QP[2400]));
             
             
             
             
             
            let placedLineage = QP[2401];
            const orientationFacades = facadesFor(orientation);
            for (const [name, desc] of AS400_CONTENT.lineage) {
                for (const facade of orientationFacades) {
                    const spot = findFreeFacadeRect(facade, 'sign', QP[2402], QP[2403], ...bandFor(QP[2404]), QP[2405], QP[2406]);
                    if (!spot) continue;
                    const p = pointOnFacade(facade, spot.u, spot.v, QP[2407]);
                    addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, name, desc);
                    placedLineage++;
                    break;
                }
                yield { phase: 'as400-orientation-panel', panel: name };
            }
             
            const orientationRect = rectByCellKey.get(`${orientation.row},${orientation.col}`);
            for (let i = QP[2408]; i < QP[2409]; i++) {
                placeSemanticCityAsset(orientationRect, pick(TERMINAL_MODELS), QP[2410], { roomHeight: floorHeight });
                yield { phase: 'as400-orientation-terminal', index: i };
            }
            const [objTitle, objDesc] = AS400_CONTENT.concepts[QP[2411]];  
            addGalleryPlacard(ox + QP[2412], oz - QP[2413], randRange(QP[2414], Math.PI * QP[2415]), objTitle, objDesc);
            console.log(`[signature] AS/400 ARCHIVE: orientation lobby -- ${placedLineage}/${AS400_CONTENT.lineage.length} lineage panels hung`);
            yield { phase: 'as400-orientation' };
        }
        {
            const { x: mx, z: mz } = cellToWorld(machineRoom.col, machineRoom.row);
            const mr = rectByCellKey.get(`${machineRoom.row},${machineRoom.col}`);
            const jr = Math.min(mr?.hwx ?? QP[2416], mr?.hwz ?? QP[2417]) * QP[2418];
            const machineModels = [...RACK_MODELS, 'as400_archive/line_printer_01', 'as400_archive/line_printer_02', 'as400_archive/tape_drive_01', 'as400_archive/tape_drive_02', 'as400_archive/disk_unit_01', 'as400_archive/operator_console_01'];
            for (const modelId of machineModels) {
                placeSemanticCityAsset(mr, modelId, QP[2419], { roomHeight: floorHeight });
                yield { phase: 'as400-machine-prop', modelId };
            }
            addGalleryPlacard(mx, mz + jr * QP[2420], randRange(QP[2421], Math.PI * QP[2422]), 'MACHINE ROOM', 'real hardware, real heat -- keep clear of the racks');
            console.log(`[signature] AS/400 ARCHIVE: machine room -- ${machineModels.length} real hardware props placed`);
            yield { phase: 'as400-machine-room' };
        }
    
         
         
         
         
         
        let libraryHung = QP[2423];
        if (floorCount > QP[2424]) {
            const libraryCells = [primary, orientation, machineRoom, ...remaining];
            let ci = QP[2425];
            for (const [term, desc] of AS400_CONTENT.concepts) {
                let placed = false;
                for (let attempt = QP[2426]; attempt < libraryCells.length && !placed; attempt++) {
                    const cell = libraryCells[(ci + attempt) % libraryCells.length];
                    for (const facade of facadesFor(cell)) {
                        const spot = findFreeFacadeRect(facade, 'sign', QP[2427], QP[2428], ...bandFor(QP[2429]), QP[2430], QP[2431]);
                        if (!spot) continue;
                        const p = pointOnFacade(facade, spot.u, spot.v, QP[2432]);
                        addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, term, desc);
                        placed = true;
                        break;
                    }
                }
                if (placed) { libraryHung++; ci++; }
                yield { phase: 'as400-library-panel', panel: term };
            }
            const libraryRect = rectByCellKey.get(`${primary.row},${primary.col}`);
            for (let i = QP[2433]; i < QP[2434]; i++) {
                placeSemanticCityAsset(libraryRect, pick(['as400_archive/binder_shelf_01', 'as400_archive/binder_shelf_02', 'as400_archive/binder_shelf_03']), floorHeight, { roomHeight: floorHeight });
                yield { phase: 'as400-library-shelf', index: i };
            }
        }
        console.log(`[signature] AS/400 ARCHIVE: reference library -- ${libraryHung}/${AS400_CONTENT.concepts.length} concept panels hung`);
        yield { phase: 'as400-library' };
    
         
         
         
         
        let commandsHung = QP[2435];
        if (floorCount > QP[2436]) {
            const labCells = [primary, orientation, machineRoom, ...remaining];
            let ci = QP[2437];
            for (const [cmd, desc] of AS400_CONTENT.commands) {
                let placed = false;
                for (let attempt = QP[2438]; attempt < labCells.length && !placed; attempt++) {
                    const cell = labCells[(ci + attempt) % labCells.length];
                    for (const facade of facadesFor(cell)) {
                        const spot = findFreeFacadeRect(facade, 'sign', QP[2439], QP[2440], ...bandFor(QP[2441]), QP[2442], QP[2443]);
                        if (!spot) continue;
                        const p = pointOnFacade(facade, spot.u, spot.v, QP[2444]);
                        addTerminalPlaque(p.x, p.y, p.z, facade.rotY + Math.PI, cmd, desc);
                        placed = true;
                        break;
                    }
                }
                if (placed) { commandsHung++; ci++; }
                yield { phase: 'as400-terminal-panel', panel: cmd };
            }
            const labRect = rectByCellKey.get(`${primary.row},${primary.col}`);
            for (let i = QP[2445]; i < QP[2446]; i++) {
                const modelId = rng() < QP[2447] ? pick(TERMINAL_MODELS) : pick(WORKSTATION_MODELS);
                placeSemanticCityAsset(labRect, modelId, floorHeight * QP[2448], { roomHeight: floorHeight });
                yield { phase: 'as400-terminal-prop', index: i };
            }
        }
        console.log(`[signature] AS/400 ARCHIVE: terminal lab -- ${commandsHung}/${AS400_CONTENT.commands.length} command pages hung, real terminal/workstation props on floor`);
        yield { phase: 'as400-terminal-lab' };
    
         
         
         
         
         
        {
            const { x: rx, z: rz } = cellToWorld(primary.col, primary.row);
            const roofY = floorCount * floorHeight;
            const mast = new THREE.Mesh(
                new THREE.CylinderGeometry(QP[2449], QP[2450], QP[2451], QP[2452]),
                new THREE.MeshStandardMaterial({ color: QP[2453], roughness: QP[2454], metalness: QP[2455] })
            );
            mast.position.set(rx - QP[2456], roofY + QP[2457], rz - QP[2458]);
            scene.add(mast);
            const dish = new THREE.Mesh(
                new THREE.SphereGeometry(QP[2459], QP[2460], QP[2461], QP[2462], Math.PI * QP[2463], QP[2464], Math.PI / QP[2465]),
                new THREE.MeshStandardMaterial({ color: QP[2466], roughness: QP[2467], metalness: QP[2468], side: THREE.DoubleSide })
            );
            dish.rotation.x = Math.PI * QP[2469];
            dish.position.set(rx + QP[2470], roofY + QP[2471], rz + QP[2472]);
            scene.add(dish);
            console.log(`[signature] AS/400 ARCHIVE: roof antenna/dish at y=${roofY.toFixed(QP[2473])}`);
            yield { phase: 'as400-roof' };
        }
    
         
        const vestFacade = facadesFor(orientation)[QP[2474]] ?? facadesFor(primary)[QP[2475]];
        if (vestFacade) {
            const spot = findFreeFacadeRect(vestFacade, 'sign', QP[2476], QP[2477], floorCount * floorHeight - QP[2478], floorCount * floorHeight - QP[2479], QP[2480], QP[2481]);
            const e = mainEntrance;
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2482], false, QP[2483], { w: QP[2484], h: QP[2485] });
            } else {
                addSign(e.doorX, floorCount * floorHeight - QP[2486], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2487], false, QP[2488], { w: QP[2489], h: QP[2490] });
            }
        }
    
        console.log(`[signature] AS/400 ARCHIVE: built ${cells.length} modules, ${floorCount} floors, orientation+machine room+library+terminal lab all populated`);
    }
    
    function buildAS400Archive(site) {
        const iterator = buildAS400ArchiveSteps(site);
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }

    function* buildJustinIndexSteps(site) {
        const { cells, id, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.justinIndex;
        const floorHeight = QP[2491];
        const floorCount = Math.max(QP[2492], Math.min(QP[2493], typeCfg.preferredFloors || QP[2494]));
        const color = QP[2495];  
        const material = new THREE.MeshStandardMaterial({ color, roughness: QP[2496], side: THREE.DoubleSide });
        const buildingContext = { wealth: QP[2497], maintenance: QP[2498] };
        const streetSetback = streetSetbackRoll();
        const partySetback = randRange(QP[2499], QP[2500]);
    
        const degreeOf = (cell) => [[QP[2501], QP[2502]], [QP[2503], QP[2504]], [QP[2505], QP[2506]], [QP[2507], QP[2508]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2509]], primaryDegree = QP[2510];
        for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }
    
        const mainEntrance = signatureInstance.mainEntrance;
        const secondaryEntrance = signatureInstance.secondaryEntrance;
        const others0 = cells.filter(c => c !== primary);
        const lobby = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[QP[2511]] ?? primary;
        const others1 = others0.filter(c => c !== lobby);
        const rearStacks = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - QP[2512]] ?? primary;
        const deepStacks = others1.filter(c => c !== rearStacks);
        const allStackCells = [primary, ...deepStacks, rearStacks];
    
        const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
        const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
        const rectByCellKey = new Map();
        for (const cell of cells) {
            const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
                : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                    : null;
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
                voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
            });
            rectByCellKey.set(`${cell.row},${cell.col}`, rect);
            yield { phase: 'justin-index-module', row: cell.row, col: cell.col };
        }
    
        const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
        const bandFor = (fl) => [fl * floorHeight + QP[2513], (fl + QP[2514]) * floorHeight - QP[2515]];
        const CABINET_MODELS = ['interior/cabinet_01', 'interior/cabinet_02', 'interior/cabinet_03', 'interior/cabinet_04'];
        const SHELF_MODELS = ['interior/shelf_01', 'interior/shelf_02', 'interior/shelf_03', 'interior/shelf_04', 'interior/shelf_05'];
        const LOCKER_MODELS = ['interior/locker_bank_01', 'interior/locker_bank_02', 'interior/locker_bank_03', 'interior/locker_bank_04'];
    
         
         
         
         
         
         
        const decoyPool = CONFIG.billboards.decoyIdentities;
        const noisePool = CONFIG.billboards.systemNoise.slice(QP[2516], QP[2517]);  
        let decoyIdx = QP[2518];
        const nextDecoy = () => decoyPool[decoyIdx++ % decoyPool.length];
        const nextNoise = () => pickRandomizedCuratedPair(noisePool, 'system', QP[2519]);
    
         
         
         
        {
            const { x: lx, z: lz } = cellToWorld(lobby.col, lobby.row);
            const lobbyRect = rectByCellKey.get(`${lobby.row},${lobby.col}`);
            placeSemanticCityAsset(lobbyRect, pick(['interior/desk_01', 'interior/desk_02', 'interior/desk_03', 'interior/desk_04']), QP[2520], { roomHeight: floorHeight });
            placeSemanticCityAsset(lobbyRect, pick(['interior/chair_01', 'interior/chair_02', 'interior/chair_03']), QP[2521], { roomHeight: floorHeight });
            const [t0, s0] = decoyPool[decoyPool.length - QP[2522]];  
            addGalleryPlacard(lx - QP[2523], lz - QP[2524], randRange(QP[2525], Math.PI * QP[2526]), t0, s0);
            let hung = QP[2527];
            for (const facade of facadesFor(lobby)) {
                for (let i = QP[2528]; i < QP[2529]; i++) {
                    const [t, s] = nextNoise();
                    const spot = findFreeFacadeRect(facade, 'sign', QP[2530], QP[2531], ...bandFor(QP[2532]), QP[2533], QP[2534]);
                    if (!spot) break;
                    const p = pointOnFacade(facade, spot.u, spot.v, QP[2535]);
                    addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, t, s);
                    hung++;
                    yield { phase: 'justin-index-lobby-panel' };
                }
            }
            console.log(`[signature] JUSTIN BROWN INDEX: records lobby -- reception + ${hung} system-noise panels`);
        }
    
         
         
         
         
        let stackLabels = QP[2536], stackFixtures = QP[2537];
        for (const cell of allStackCells) {
            const { x: cx, z: cz } = cellToWorld(cell.col, cell.row);
            const r = rectByCellKey.get(`${cell.row},${cell.col}`);
            const hw = Math.min(r?.hwx ?? QP[2538], r?.hwz ?? QP[2539]);
            const rowCount = QP[2540] + Math.floor(rng() * QP[2541]);
            for (let i = QP[2542]; i < rowCount; i++) {
                const modelId = rng() < QP[2543] ? pick(CABINET_MODELS) : pick(SHELF_MODELS);
                const placed = placeSemanticCityAsset(r, modelId, QP[2544], { roomHeight: floorHeight });
                if (!placed) continue;
                stackFixtures++;
                if (rng() < QP[2545]) {
                    const [t, s] = nextDecoy();
                    addGalleryPlacard(placed.x + placed.tx * QP[2546], placed.z + placed.tz * QP[2547], placed.rotY, t, s);
                    stackLabels++;
                }
                yield { phase: 'justin-index-stack-fixture', row: cell.row, col: cell.col };
            }
        }
        console.log(`[signature] JUSTIN BROWN INDEX: deep stacks -- ${stackFixtures} cabinets/shelves across ${allStackCells.length} rooms, ${stackLabels} real decoy records labeled`);
    
         
         
         
         
         
        let upperHung = QP[2548];
        for (let fl = QP[2549]; fl < floorCount; fl++) {
            const useDecoy = fl % QP[2550] === QP[2551];  
            for (const cell of [primary, lobby, rearStacks, ...deepStacks]) {
                for (const facade of facadesFor(cell)) {
                    const [t, s] = useDecoy ? nextDecoy() : nextNoise();
                    const spot = findFreeFacadeRect(facade, 'sign', QP[2552], QP[2553], ...bandFor(fl), QP[2554], QP[2555]);
                    if (!spot) continue;
                    const p = pointOnFacade(facade, spot.u, spot.v, QP[2556]);
                    addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, t, s);
                    upperHung++;
                    yield { phase: 'justin-index-upper-panel', floor: fl };
                }
            }
             
             
            const primaryRect = rectByCellKey.get(`${primary.row},${primary.col}`);
            placeSemanticCityAsset(primaryRect, pick(LOCKER_MODELS), fl * floorHeight, { roomHeight: floorHeight });
            yield { phase: 'justin-index-upper-floor', floor: fl };
        }
        console.log(`[signature] JUSTIN BROWN INDEX: ${floorCount - QP[2557]} upper floors -- ${upperHung} real decoy/noise panels hung, deeper into the stacks per floor`);
    
         
        const vestFacade = facadesFor(lobby)[QP[2558]] ?? facadesFor(primary)[QP[2559]];
        if (vestFacade) {
            const spot = findFreeFacadeRect(vestFacade, 'sign', QP[2560], QP[2561], floorCount * floorHeight - QP[2562], floorCount * floorHeight - QP[2563], QP[2564], QP[2565]);
            const e = mainEntrance;
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2566], false, QP[2567], { w: QP[2568], h: QP[2569] });
            } else {
                addSign(e.doorX, floorCount * floorHeight - QP[2570], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2571], false, QP[2572], { w: QP[2573], h: QP[2574] });
            }
        }
    
        yield { phase: 'justin-index-finish' };
        console.log(`[signature] JUSTIN BROWN INDEX: built ${cells.length} modules, ${floorCount} floors -- lobby+search hall+deep stacks all populated, ${allStackCells.length + QP[2575]} internally-connected rooms give real multiple routes`);
    }
    
    function* buildSystemsWorkshopSteps(site) {
        const { cells, id, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.systemsWorkshop;
        const floorHeight = QP[2576];
        const floorCount = Math.max(QP[2577], Math.min(QP[2578], typeCfg.preferredFloors || QP[2579]));
        const color = QP[2580];  
        const material = new THREE.MeshStandardMaterial({ color, roughness: QP[2581], side: THREE.DoubleSide });
        const buildingContext = { wealth: QP[2582], maintenance: QP[2583] };  
        const streetSetback = streetSetbackRoll();
        const partySetback = randRange(QP[2584], QP[2585]);
    
        const degreeOf = (cell) => [[QP[2586], QP[2587]], [QP[2588], QP[2589]], [QP[2590], QP[2591]], [QP[2592], QP[2593]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2594]], primaryDegree = QP[2595];
        for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }
    
        const mainEntrance = signatureInstance.mainEntrance;
        const secondaryEntrance = signatureInstance.secondaryEntrance;
        const others0 = cells.filter(c => c !== primary);
        const frontShop = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[QP[2596]] ?? primary;
        const others1 = others0.filter(c => c !== frontShop);
         
         
        const rearYard = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - QP[2597]] ?? primary;
        const remaining = others1.filter(c => c !== rearYard);
        const computerLab = remaining[QP[2598]] ?? primary;
        const electronicsBench = remaining[QP[2599]] ?? frontShop;
    
        const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
        const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
        const rectByCellKey = new Map();
        for (const cell of cells) {
            const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
                : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                    : null;
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
                voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
            });
            rectByCellKey.set(`${cell.row},${cell.col}`, rect);
            yield { phase: 'systems-workshop-module', row: cell.row, col: cell.col };
        }
    
        const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
        function* placeClusterSteps(cell, modelIds, count, yLevel = QP[2600]) {
            const r = rectByCellKey.get(`${cell.row},${cell.col}`);
            if (!r) return;
            for (let i = QP[2601]; i < count; i++) {
                placeSemanticCityAsset(r, pick(modelIds), yLevel, { roomHeight: floorHeight });
                yield { phase: 'systems-workshop-fixture', row: cell.row, col: cell.col };
            }
        }
    
         
         
         
         
         
         
         
        yield* placeClusterSteps(primary, ['systems_workshop/workbench_01', 'systems_workshop/workbench_02', 'systems_workshop/workbench_03', 'systems_workshop/workbench_04', 'systems_workshop/workbench_05'], QP[2602], QP[2603]);
        yield* placeClusterSteps(primary, ['systems_workshop/pegboard_01', 'systems_workshop/pegboard_02', 'systems_workshop/pegboard_03', 'systems_workshop/pegboard_04'], QP[2604], QP[2605]);
        yield* placeClusterSteps(primary, ['systems_workshop/3d_printer_01', 'systems_workshop/3d_printer_02', 'systems_workshop/3d_printer_03', 'systems_workshop/3d_printer_04'], QP[2606], QP[2607]);
        yield* placeClusterSteps(primary, ['systems_workshop/tool_chest_01', 'systems_workshop/tool_chest_02', 'systems_workshop/tool_chest_03', 'systems_workshop/tool_chest_04'], QP[2608], QP[2609]);
    
         
         
        yield* placeClusterSteps(frontShop, ['systems_workshop/tool_chest_01', 'systems_workshop/tool_chest_02'], QP[2610], QP[2611]);
        yield* placeClusterSteps(frontShop, ['systems_workshop/parts_rack_01', 'systems_workshop/parts_rack_02', 'systems_workshop/parts_rack_03'], QP[2612], QP[2613]);
    
         
         
         
         
        yield* placeClusterSteps(computerLab, ['systems_workshop/server_bench_01', 'systems_workshop/server_bench_02', 'systems_workshop/server_bench_03'], QP[2614], QP[2615]);
        yield* placeClusterSteps(computerLab, ['systems_workshop/cable_cart_01', 'systems_workshop/cable_cart_02'], QP[2616], QP[2617]);
        let codeHung = QP[2618];
        for (const [title, subtitle] of CONFIG.siteContent.codeProjects) {
            let placed = false;
            for (const cell of [computerLab, primary, frontShop]) {
                for (const facade of facadesFor(cell)) {
                    const spot = findFreeFacadeRect(facade, 'sign', QP[2619], QP[2620], QP[2621], floorHeight - QP[2622], QP[2623], QP[2624]);
                    if (!spot) continue;
                    const p = pointOnFacade(facade, spot.u, spot.v, QP[2625]);
                    addTerminalPlaque(p.x, p.y, p.z, facade.rotY + Math.PI, title, subtitle);
                    placed = true;
                    break;
                }
                if (placed) break;
            }
            if (placed) codeHung++;
            yield { phase: 'systems-workshop-code-project' };
        }
    
         
        yield* placeClusterSteps(electronicsBench, ['systems_workshop/workbench_01', 'systems_workshop/workbench_02'], QP[2626], QP[2627]);
        yield* placeClusterSteps(electronicsBench, ['systems_workshop/solder_station_01', 'systems_workshop/solder_station_02', 'systems_workshop/solder_station_03'], QP[2628], QP[2629]);
        yield* placeClusterSteps(electronicsBench, ['systems_workshop/pegboard_01', 'systems_workshop/pegboard_02'], QP[2630], QP[2631]);
    
         
         
         
         
        yield* placeClusterSteps(rearYard, ['industrial/cable_spool_01', 'industrial/cable_spool_02', 'industrial/cable_spool_03', 'industrial/cable_spool_04'], QP[2632], QP[2633]);
        yield* placeClusterSteps(rearYard, ['industrial/electrical_cabinet_01', 'industrial/electrical_cabinet_02'], QP[2634], QP[2635]);
        yield* placeClusterSteps(rearYard, ['industrial/drum_cluster_01', 'industrial/drum_cluster_02', 'industrial/drum_cluster_03'], QP[2636], QP[2637]);
    
         
         
         
         
        if (floorCount > QP[2638]) {
            yield* placeClusterSteps(primary, ['systems_workshop/parts_rack_01', 'systems_workshop/parts_rack_02', 'systems_workshop/parts_rack_03'], QP[2639], floorHeight);
            yield* placeClusterSteps(computerLab, ['interior/shelf_01', 'interior/shelf_02', 'interior/shelf_03'], QP[2640], floorHeight);
        }
    
         
        const vestFacade = facadesFor(frontShop)[QP[2641]] ?? facadesFor(primary)[QP[2642]];
        if (vestFacade) {
            const spot = findFreeFacadeRect(vestFacade, 'sign', QP[2643], QP[2644], floorCount * floorHeight - QP[2645], floorCount * floorHeight - QP[2646], QP[2647], QP[2648]);
            const e = mainEntrance;
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2649], false, QP[2650], { w: QP[2651], h: QP[2652] });
            } else {
                addSign(e.doorX, floorCount * floorHeight - QP[2653], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2654], false, QP[2655], { w: QP[2656], h: QP[2657] });
            }
        }
    
        yield { phase: 'systems-workshop-finish' };
        console.log(`[signature] SYSTEMS WORKSHOP: built ${cells.length} modules, ${floorCount} floors -- main workshop+front shop+computer lab+electronics bench+rear yard populated, ${codeHung}/${CONFIG.siteContent.codeProjects.length} real code projects on display`);
    }
    
    function* buildLoreShrineSteps(site) {
        const { cells, id, signatureInstance } = site;
        const typeCfg = CONFIG.signatureBuildings.loreShrine;
        const floorHeight = QP[2684];
        const floorCount = Math.max(QP[2685], Math.min(QP[2686], typeCfg.preferredFloors || QP[2687]));
        const color = QP[2688];  
        const material = new THREE.MeshStandardMaterial({ color, roughness: QP[2689], side: THREE.DoubleSide });
        const buildingContext = { wealth: QP[2690], maintenance: QP[2691] };  
        const streetSetback = streetSetbackRoll();
        const partySetback = randRange(QP[2692], QP[2693]);
    
        const degreeOf = (cell) => [[QP[2694], QP[2695]], [QP[2696], QP[2697]], [QP[2698], QP[2699]], [QP[2700], QP[2701]]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
        let primary = cells[QP[2702]], primaryDegree = QP[2703];
        for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }
    
        const mainEntrance = signatureInstance.mainEntrance;
        const secondaryEntrance = signatureInstance.secondaryEntrance;
        const others0 = cells.filter(c => c !== primary);
         
         
        const fourButtonChamber = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[QP[2704]] ?? primary;
        const others1 = others0.filter(c => c !== fourButtonChamber);
         
        const rearChamber = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - QP[2705]] ?? primary;
        const others2 = others1.filter(c => c !== rearChamber);
        const refrigerationSanctum = others2[QP[2706]] ?? rearChamber;
        const handToolsHall = others2[QP[2707]] ?? rearChamber;
         
         
         
         
         
        const altarCell = others2[QP[2708]] ?? primary;
    
        const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
        const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
        const rectByCellKey = new Map();
        for (const cell of cells) {
            const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
                : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                    : null;
            const rect = yield* addBuildingModuleSteps(cell, {
                isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
                color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
                voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
            });
            rectByCellKey.set(`${cell.row},${cell.col}`, rect);
            yield { phase: 'lore-shrine-module', row: cell.row, col: cell.col };
        }
        const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
    
         
         
         
         
         
        {
            const { x, z } = cellToWorld(fourButtonChamber.col, fourButtonChamber.row);
            const plinthH = QP[2709];
            const plinth = new THREE.Mesh(new THREE.BoxGeometry(QP[2710], plinthH, QP[2711]), new THREE.MeshStandardMaterial({ color: QP[2712], roughness: QP[2713] }));
            plinth.position.set(x, plinthH / QP[2714], z);
            scene.add(plinth);
            const body = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(QP[2715], QP[2716], QP[2717]), QP[2718]), new THREE.MeshStandardMaterial({ color: QP[2719], roughness: QP[2720], metalness: QP[2721] }));
            body.position.set(x, plinthH + QP[2722], z);
            scene.add(body);
            const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(QP[2723], QP[2724], QP[2725]), new THREE.MeshStandardMaterial({ color: QP[2726], roughness: QP[2727], metalness: QP[2728] }));
            doorPanel.position.set(x, plinthH + QP[2729], z + QP[2730]);
            scene.add(doorPanel);
            const buttonLabels = typeCfg.buttonLabels || ['TIME', 'POWER', 'START', 'STOP'];
            const buttonColors = [QP[2731], QP[2732], QP[2733], QP[2734]];
            for (let i = QP[2735]; i < QP[2736]; i++) {
                const btn = new THREE.Mesh(new THREE.CylinderGeometry(QP[2737], QP[2738], QP[2739], QP[2740]), new THREE.MeshStandardMaterial({ color: buttonColors[i], roughness: QP[2741], metalness: QP[2742] }));
                btn.rotation.x = Math.PI / QP[2743];
                btn.position.set(x + QP[2744], plinthH + QP[2745] - i * QP[2746], z + QP[2747]);
                scene.add(btn);
            }
            addGalleryPlacard(x - QP[2748], z - QP[2749], randRange(QP[2750], Math.PI * QP[2751]), 'THE FOUR BUTTON CHAMBER', `${buttonLabels.join(' · ')} -- nothing more, nothing less`);
            if (takeDynamicLight(QP[2752])) {
    const light = new THREE.PointLight(QP[2753], QP[2754], QP[2755], QP[2756]);
                light.position.set(x, plinthH + QP[2757], z);
                scene.add(light);
            }
            console.log('[signature] LORE SHRINE: Four Button Chamber built -- ' + buttonLabels.join('/'));
        }
        yield { phase: 'lore-shrine-four-button' };
    
         
         
        {
            const { x, z } = cellToWorld(refrigerationSanctum.col, refrigerationSanctum.row);
            const stages = [
                ['COMPRESSOR', 'raises pressure & temperature'],
                ['CONDENSER', 'rejects heat, refrigerant liquefies'],
                ['EXPANSION DEVICE', 'pressure drops sharply'],
                ['EVAPORATOR', 'absorbs heat, refrigerant boils'],
            ];
            const positions = [[QP[2758], QP[2759]], [QP[2760], QP[2761]], [QP[2762], QP[2763]], [QP[2764], QP[2765]]];
            for (let i = QP[2766]; i < stages.length; i++) {
                const [dx, dz] = positions[i];
                const geo = i % QP[2767] === QP[2768] ? new THREE.CylinderGeometry(QP[2769], QP[2770], QP[2771], QP[2772]) : new THREE.SphereGeometry(QP[2773], QP[2774], QP[2775]);
                const mesh = new THREE.Mesh(jitterGeometry(geo, QP[2776]), new THREE.MeshStandardMaterial({ color: QP[2777], roughness: QP[2778], metalness: QP[2779] }));
                mesh.position.set(x + dx, QP[2780], z + dz);
                scene.add(mesh);
                addGalleryPlacard(x + dx + QP[2781], z + dz, randRange(QP[2782], Math.PI * QP[2783]), stages[i][QP[2784]], stages[i][QP[2785]]);
                yield { phase: 'lore-shrine-refrigeration-stage', index: i };
            }
            let diagramHung = QP[2786];
            for (const facade of facadesFor(refrigerationSanctum)) {
                const spot = findFreeFacadeRect(facade, 'sign', QP[2787], QP[2788], QP[2789], floorHeight - QP[2790], QP[2791], QP[2792]);
                if (!spot) continue;
                const p = pointOnFacade(facade, spot.u, spot.v, QP[2793]);
                addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, 'THE CYCLE', 'compress → condense → expand → evaporate');
                diagramHung++;
                break;
            }
            console.log(`[signature] LORE SHRINE: Refrigeration Sanctum built -- 4 stages + ${diagramHung} cycle diagram`);
        }
        yield { phase: 'lore-shrine-refrigeration' };
    
         
        {
            const { x, z } = cellToWorld(handToolsHall.col, handToolsHall.row);
            const tools = [
                ['VISE GRIP, 10-INCH', 'locking pliers -- see also: the Altar'],
                ['CRESCENT WRENCH', 'adjustable, forged steel'],
                ['CLAW HAMMER', 'one head, two purposes'],
                ['NEEDLE-NOSE PLIERS', 'precision, not force'],
            ];
            const toolGeos = [
                new THREE.TorusGeometry(QP[2794], QP[2795], QP[2796], QP[2797], Math.PI * QP[2798]),
                new THREE.CylinderGeometry(QP[2799], QP[2800], QP[2801], QP[2802]),
                new THREE.BoxGeometry(QP[2803], QP[2804], QP[2805]),
                new THREE.ConeGeometry(QP[2806], QP[2807], QP[2808]),
            ];
            const spread = [[QP[2809], QP[2810]], [QP[2811], QP[2812]], [QP[2813], QP[2814]], [QP[2815], QP[2816]]];
            for (let i = QP[2817]; i < tools.length; i++) {
                const [dx, dz] = spread[i];
                addAbstractDisplay(x + dx, z + dz, tools[i][QP[2818]], tools[i][QP[2819]], toolGeos[i], QP[2820], QP[2821]);
                yield { phase: 'lore-shrine-hand-tool', index: i };
            }
            console.log('[signature] LORE SHRINE: Hall of Hand Tools built -- 4 exhibits');
        }
    
         
        {
            const { x, z } = cellToWorld(altarCell.col, altarCell.row);
            const jawGeo = new THREE.TorusGeometry(QP[2822], QP[2823], QP[2824], QP[2825], Math.PI * QP[2826]);
            addAbstractDisplay(x, z, 'THE VISE-GRIP ALTAR', 'locking pliers, mounted with undue ceremony', jawGeo, QP[2827], QP[2828]);
             
             
            if (takeDynamicLight(QP[2829])) {
    const light = new THREE.PointLight(QP[2830], QP[2831], QP[2832], QP[2833]);
                light.position.set(x, QP[2834], z);
                scene.add(light);
            }
            console.log('[signature] LORE SHRINE: Vise-Grip Altar built');
        }
        yield { phase: 'lore-shrine-altar' };
    
         
         
        const vestFacade = facadesFor(fourButtonChamber)[QP[2835]] ?? facadesFor(primary)[QP[2836]];
        if (vestFacade) {
            const spot = findFreeFacadeRect(vestFacade, 'sign', QP[2837], QP[2838], floorCount * floorHeight - QP[2839], floorCount * floorHeight - QP[2840], QP[2841], QP[2842]);
            const e = mainEntrance;
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2843], false, QP[2844], { w: QP[2845], h: QP[2846] });
            } else {
                addSign(e.doorX, floorCount * floorHeight - QP[2847], e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, QP[2848], false, QP[2849], { w: QP[2850], h: QP[2851] });
            }
        }
    
        yield { phase: 'lore-shrine-finish' };
        console.log(`[signature] LORE SHRINE: built ${cells.length} modules, ${floorCount} floors -- Four Button Chamber + Refrigeration Sanctum + Hall of Hand Tools + Vise-Grip Altar all present`);
    }


    const addAbstractDisplay = (x, z, title, subtitle, geometry, matColor, pedestalHeight = QP[2658]) => {
        const pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(QP[2659], QP[2660], pedestalHeight, QP[2661]),
            new THREE.MeshStandardMaterial({ color: QP[2662], roughness: QP[2663] })
        );
        pedestal.position.set(x, pedestalHeight / QP[2664], z);
        scene.add(pedestal);
        const obj = new THREE.Mesh(jitterGeometry(geometry, QP[2665]), new THREE.MeshStandardMaterial({ color: matColor, roughness: QP[2666], metalness: QP[2667] }));
        obj.position.set(x, pedestalHeight + QP[2668], z);
        obj.rotation.set(randRange(QP[2669], Math.PI * QP[2670]), randRange(QP[2671], Math.PI * QP[2672]), QP[2673]);
        scene.add(obj);
        addGalleryPlacard(x + QP[2674], z + QP[2675], randRange(QP[2676], Math.PI * QP[2677]), title, subtitle);
        if (takeDynamicLight(QP[2678])) {
            const light = new THREE.PointLight(QP[2679], QP[2680], QP[2681], QP[2682]);  
            light.position.set(x, pedestalHeight + QP[2683], z);
            scene.add(light);
        }
    };

    function drainSignatureSteps(iterator) {
        let step = iterator.next();
        while (!step.done) step = iterator.next();
        return step.value;
    }

    function* buildSynchronousSignatureSteps(site, builder, phase) {
        builder(site);
        yield { phase };
    }

    const SIGNATURE_STEP_BUILDERS = Object.freeze({
        artGallery: buildArtGallerySteps,
        as400Archive: buildAS400ArchiveSteps,
        justinIndex: buildJustinIndexSteps,
        systemsWorkshop: buildSystemsWorkshopSteps,
        loreShrine: buildLoreShrineSteps,
    });

    function* buildSignatureSiteSteps(site) {
        const stepBuilder = SIGNATURE_STEP_BUILDERS[site.signatureType];
        if (stepBuilder) {
            yield* stepBuilder(site);
            return;
        }
        if (site.signatureType === 'futurePlaceholder') {
            yield* buildSynchronousSignatureSteps(site, buildFuturePlaceholder, 'signature-futurePlaceholder');
            return;
        }
        yield* buildSynchronousSignatureSteps(site, buildSignaturePlaceholder, `signature-${site.signatureType || 'placeholder'}`);
    }

    function buildSignatureSite(site) {
        return drainSignatureSteps(buildSignatureSiteSteps(site));
    }

    return Object.freeze({ buildSignatureSite, buildSignatureSiteSteps, buildGalleryArtPanel });
}
