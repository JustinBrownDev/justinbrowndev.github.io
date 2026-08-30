import { CONFIG } from '../config/game-config.js';
import { QP } from '../runtime/main-quantitative-literals.js';
import { SPAWN_SINGULAR_TYPES, singularEntityId } from '../world-contract.js';
import { outwardRotationY } from '../systems/cardinal.js';
import { classifyKowloonEdge, partitionKowloonCompounds } from './kowloon-structure.js';

export function createSpawnMazePlan({ GRID_COLS, GRID_ROWS, rng }) {
    const grid = [];
    for (let r = QP[715]; r < GRID_ROWS; r++) grid.push(new Array(GRID_COLS).fill(true));

    const inBounds = (c, r) => c >= QP[716] && c < GRID_COLS - QP[717] && r >= QP[718] && r < GRID_ROWS - QP[719];
    const startCol = Math.floor(GRID_COLS / QP[720]);
    const startRow = Math.floor(GRID_ROWS / QP[721]);
    grid[startRow][startCol] = false;

    const stack = [[startCol, startRow]];
    const dirsBase = [[QP[722], QP[723]], [QP[724], QP[725]], [QP[726], QP[727]], [QP[728], QP[729]]];
    while (stack.length) {
        const [c, r] = stack[stack.length - QP[730]];
        const dirs = [...dirsBase].sort(() => rng() - QP[731]);
        let carved = false;
        for (const [dc, dr] of dirs) {
            const nc = c + dc, nr = r + dr;
            if (inBounds(nc, nr) && grid[nr][nc]) {
                grid[nr][nc] = false;
                grid[r + dr / QP[732]][c + dc / QP[733]] = false;
                stack.push([nc, nr]);
                carved = true;
                break;
            }
        }
        if (!carved) stack.pop();
    }

    for (let r = QP[734]; r < GRID_ROWS - QP[735]; r++) {
        for (let c = QP[736]; c < GRID_COLS - QP[737]; c++) {
            if (!grid[r][c]) continue;
            const openNeighbors = [[QP[738], QP[739]], [QP[740], QP[741]], [QP[742], QP[743]], [QP[744], QP[745]]]
                .filter(([dc, dr]) => !grid[r + dr]?.[c + dc]).length;
            if (openNeighbors >= QP[746] && rng() < CONFIG.maze.loopChance) grid[r][c] = false;
        }
    }

    for (let c = QP[715]; c < GRID_COLS; c++) grid[startRow][c] = false;
    for (let r = QP[715]; r < GRID_ROWS; r++) grid[r][startCol] = false;

    function openNeighborCount(c, r) {
        return [[QP[747], QP[748]], [QP[749], QP[750]], [QP[751], QP[752]], [QP[753], QP[754]]]
            .filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false).length;
    }

    const plazaCells = [];
    const allOpenCells = [];
    for (let r = QP[755]; r < GRID_ROWS - QP[756]; r++) {
        for (let c = QP[757]; c < GRID_COLS - QP[758]; c++) {
            if (grid[r][c]) continue;
            allOpenCells.push([c, r]);
            if (openNeighborCount(c, r) >= QP[759]) plazaCells.push([c, r]);
        }
    }

    return Object.freeze({ grid, startCol, startRow, spawnCol: startCol, spawnRow: startRow, plazaCells, allOpenCells, openNeighborCount });
}

export function createSpawnBuildingSitePlan(deps) {
    const { GRID_COLS, GRID_ROWS, grid, startCol, startRow, SEED, rng, pick, weightedPick, cellToWorld, colHalf, rowHalf } = deps;
    const SITE_SIZE_WEIGHTS = { [QP[760]]: QP[761], [QP[762]]: QP[763], [QP[764]]: QP[765], [QP[766]]: QP[767], [QP[768]]: QP[769], [QP[770]]: QP[771], [QP[772]]: QP[773] };
    const siteIdOf = [];
    for (let r = QP[774]; r < GRID_ROWS; r++) siteIdOf.push(new Array(GRID_COLS).fill(QP[775]));
    const buildingSites = [];
    const SIGNATURE_TYPES = ['artGallery', 'as400Archive', 'justinIndex', 'systemsWorkshop', 'loreShrine', 'futurePlaceholder'];
    const signatureInstances = [];

    if (SIGNATURE_TYPES.length !== SPAWN_SINGULAR_TYPES.length || SIGNATURE_TYPES.some((type, i) => type !== SPAWN_SINGULAR_TYPES[i])) {
        throw new Error('signature type list diverged from world-contract.js');
    }

    function reserveSignatureSites(unclaimedSet) {
        const sigConfig = CONFIG.signatureBuildings;
        if (!sigConfig?.enabled) { console.log('[signature] CONFIG.signatureBuildings.enabled=false -- no signature locations this load'); return; }
        const placementCfg = sigConfig.placement;
        const cheby = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
        const minDistToPlaced = (cell, placedCells) => placedCells.length ? Math.min(...placedCells.map(p => cheby(cell, p))) : Infinity;
        const placedCells = [];

        function unclaimedBlobSize(seed, cap) {
            const seen = new Set([`${seed.col},${seed.row}`]);
            const stack = [seed];
            while (stack.length && seen.size < cap) {
                const cur = stack.pop();
                for (const [dc, dr] of [[QP[776], QP[777]], [QP[778], QP[779]], [QP[780], QP[781]], [QP[782], QP[783]]]) {
                    const nc = cur.col + dc, nr = cur.row + dr, k = `${nc},${nr}`;
                    if (seen.size >= cap) break;
                    if (grid[nr]?.[nc] && unclaimedSet.has(k) && !seen.has(k)) { seen.add(k); stack.push({ col: nc, row: nr }); }
                }
            }
            return seen.size;
        }

        for (const type of SIGNATURE_TYPES) {
            const typeCfg = sigConfig[type];
            if (!typeCfg?.enabled) { console.log(`[signature] ${type}: disabled in config -- skipped`); continue; }
            const [minCells, maxCells] = typeCfg.targetCells;
            let best = null, bestScore = -Infinity, attempts = 0;
            const [offsetCol = 0, offsetRow = 0] = typeCfg.spawnOffsetCells ?? [0, 0];
            const targetCol = startCol + offsetCol, targetRow = startRow + offsetRow;
            const candidates = [...unclaimedSet]
                .map(key => { const [c, r] = key.split(',').map(Number); return { key, c, r }; })
                .filter(({ c, r }) => Math.max(Math.abs(c - startCol), Math.abs(r - startRow)) <= placementCfg.spawnRadiusCells)
                .sort((a, b) => {
                    const ad = (a.c - targetCol) ** 2 + (a.r - targetRow) ** 2;
                    const bd = (b.c - targetCol) ** 2 + (b.r - targetRow) ** 2;
                    return ad - bd || a.r - b.r || a.c - b.c;
                });
            for (const { c, r } of candidates) {
                if (++attempts > placementCfg.maxSeedAttempts) break;
                const cell = { col: c, row: r };
                const openSides = [[QP[786], QP[787]], [QP[788], QP[789]], [QP[790], QP[791]], [QP[792], QP[793]]].filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false).length;
                if (placementCfg.requireStreetEntrance && openSides < QP[794]) continue;
                const d = minDistToPlaced(cell, placedCells);
                if (d < placementCfg.minDistanceCells) continue;
                if (unclaimedBlobSize(cell, minCells) < minCells) continue;
                const targetDistance = Math.hypot(c - targetCol, r - targetRow);
                const spacingScore = Number.isFinite(d) ? -Math.abs(d - placementCfg.preferredDistanceCells) * 0.35 : 0;
                const score = -targetDistance * 4 + spacingScore + openSides * 0.5;
                if (score > bestScore) { bestScore = score; best = cell; }
            }
            if (!best) {
                console.warn(`[signature] ${type}: no valid spawn-district cell found in ${attempts} attempts (radius=${placementCfg.spawnRadiusCells} cells, spacing=${placementCfg.minDistanceCells}) -- DISABLED this load`);
                continue;
            }

            const target = minCells + Math.floor(rng() * (maxCells - minCells + QP[798]));
            const cells = [best];
            const claimed = new Set([`${best.col},${best.row}`]);
            unclaimedSet.delete(`${best.col},${best.row}`);
            while (cells.length < target) {
                const candidates = [];
                for (const cell of cells) {
                    for (const [dc, dr] of [[QP[799], QP[800]], [QP[801], QP[802]], [QP[803], QP[804]], [QP[805], QP[806]]]) {
                        const nc = cell.col + dc, nr = cell.row + dr, k = `${nc},${nr}`;
                        if (grid[nr]?.[nc] && unclaimedSet.has(k) && !claimed.has(k)) candidates.push({ col: nc, row: nr });
                    }
                }
                if (!candidates.length) break;
                const next = pick(candidates);
                cells.push(next);
                claimed.add(`${next.col},${next.row}`);
                unclaimedSet.delete(`${next.col},${next.row}`);
            }
            if (cells.length < minCells) console.warn(`[signature] ${type}: grew to only ${cells.length}/${minCells}-${maxCells} target cells (boxed in by earlier reservations) -- keeping the smaller footprint`);

            const openEdges = [];
            for (const cell of cells) for (const [dc, dr] of [[QP[807], QP[808]], [QP[809], QP[810]], [QP[811], QP[812]], [QP[813], QP[814]]]) if (grid[cell.row + dr]?.[cell.col + dc] === false) openEdges.push({ cell, dc, dr });
            if (!openEdges.length) {
                console.warn(`[signature] ${type}: grew with NO street-facing edge left (fully boxed in) -- unenterable, DISABLED this load; cells returned to the generic pool`);
                for (const c of cells) unclaimedSet.add(`${c.col},${c.row}`);
                continue;
            }
            const mainEdge = pick(openEdges);
            const secondaryPool = openEdges.filter(e => e !== mainEdge);
            const secondaryEdge = secondaryPool.length ? pick(secondaryPool) : null;
            if (placementCfg.requireSecondaryConnection && !secondaryEdge) console.warn(`[signature] ${type}: only one street-facing edge -- proceeding without a secondary route (footprint too small/pinched this seed)`);

            const id = buildingSites.length;
            for (const c of cells) siteIdOf[c.row][c.col] = id;
            const toEntrance = edge => {
                const { x: cx, z: cz } = cellToWorld(edge.cell.col, edge.cell.row);
                const doorX = cx + edge.dc * colHalf(edge.cell.col), doorZ = cz + edge.dr * rowHalf(edge.cell.row);
                const outside = cellToWorld(edge.cell.col + edge.dc, edge.cell.row + edge.dr);
                return { cell: edge.cell, dc: edge.dc, dr: edge.dr, doorX, doorZ, outwardRotY: outwardRotationY(edge.dc, edge.dr), facingRotY: outwardRotationY(edge.dc, edge.dr), outsideX: outside.x, outsideZ: outside.z };
            };
            const instance = { type, id, entityId: singularEntityId(SEED, type), cells, mainEntrance: toEntrance(mainEdge), secondaryEntrance: secondaryEdge ? toEntrance(secondaryEdge) : null };
            signatureInstances.push(instance);
            buildingSites.push({ id, cells, signatureType: type, signatureInstance: instance });
            placedCells.push(...cells);
            console.log(`[signature] ${typeCfg.exteriorName ?? type} reserved: site=${id} cells=${cells.length} (target ${minCells}-${maxCells}) entrance=(${instance.mainEntrance.doorX.toFixed(QP[815])},${instance.mainEntrance.doorZ.toFixed(QP[816])}) ${secondaryEdge ? '+secondary' : '(no secondary)'}`);
        }
    }

    const unclaimedSet = new Set();
    for (let r = QP[817]; r < GRID_ROWS; r++) for (let c = QP[818]; c < GRID_COLS; c++) if (grid[r][c]) unclaimedSet.add(`${c},${r}`);
    reserveSignatureSites(unclaimedSet);

    // Ordinary authored fabric now uses the same constrained multi-cell compound
    // partitioner as streamed infinity. Signature reservations stay spawn-only,
    // but there is no second ordinary-building shape grammar anymore.
    const ordinaryPartition = partitionKowloonCompounds({
        cols: GRID_COLS,
        rows: GRID_ROWS,
        solidKeys: unclaimedSet,
        initialSiteId: buildingSites.length,
        chooseTargetSize: () => Number(weightedPick(SITE_SIZE_WEIGHTS)),
        pick: candidates => pick(candidates),
    });
    for (const site of ordinaryPartition.sites) {
        for (const cell of site.cells) siteIdOf[cell.row][cell.col] = site.id;
        buildingSites.push(site);
    }

    const totalCells = buildingSites.reduce((sum, site) => sum + site.cells.length, QP[849]);
    const bySize = {};
    for (const site of buildingSites) bySize[site.cells.length] = (bySize[site.cells.length] || QP[850]) + QP[851];
    console.log(`[gen] ${buildingSites.length} building sites over ${totalCells} solid cells (mean ${(totalCells / buildingSites.length).toFixed(QP[852])} cells/site) -- size histogram:`, bySize);

    function cellEdgeKind(r, c, dr, dc) {
        return classifyKowloonEdge({
            siteIdOf, siteId: siteIdOf[r][c], row: r, col: c, dr, dc,
            isStreet: (nc, nr) => grid[nr]?.[nc] === undefined || grid[nr][nc] === false,
        });
    }

    return Object.freeze({ siteIdOf, buildingSites, SIGNATURE_TYPES, signatureInstances, cellEdgeKind });
}
