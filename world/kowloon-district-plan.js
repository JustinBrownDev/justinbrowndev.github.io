import { QP } from '../runtime/main-quantitative-literals.js';

export function createKowloonMazeTopology({
    cols,
    rows,
    rng,
    loopChance,
    forceCentralCross = false,
    anchors = null,
} = {}) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < QP[716] + QP[720] * QP[720] || rows < QP[718] + QP[721] * QP[721]) {
        throw new Error('Kowloon maze topology requires a grid at least 5x5');
    }
    if (typeof rng !== 'function') throw new Error('Kowloon maze topology requires deterministic rng');

    const grid = [];
    for (let r = QP[715]; r < rows; r++) grid.push(new Array(cols).fill(true));
    const inBounds = (c, r) => c >= QP[716] && c < cols - QP[717] && r >= QP[718] && r < rows - QP[719];
    const startCol = Math.floor(cols / QP[720]);
    const startRow = Math.floor(rows / QP[721]);
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

    for (let r = QP[734]; r < rows - QP[735]; r++) {
        for (let c = QP[736]; c < cols - QP[737]; c++) {
            if (!grid[r][c]) continue;
            const openNeighbors = [[QP[738], QP[739]], [QP[740], QP[741]], [QP[742], QP[743]], [QP[744], QP[745]]]
                .filter(([dc, dr]) => !grid[r + dr]?.[c + dc]).length;
            if (openNeighbors >= QP[746] && rng() < loopChance) grid[r][c] = false;
        }
    }

    function carveAnchorRoute(anchor) {
        let c = Math.max(QP[715], Math.min(cols - QP[730], anchor.c));
        let r = Math.max(QP[715], Math.min(rows - QP[730], anchor.r));
        grid[r][c] = false;
        const horizontalFirst = anchor.horizontalFirst ?? (rng() < QP[731]);
        const stepCol = () => {
            while (c !== startCol) {
                c += Math.sign(startCol - c);
                grid[r][c] = false;
            }
        };
        const stepRow = () => {
            while (r !== startRow) {
                r += Math.sign(startRow - r);
                grid[r][c] = false;
            }
        };
        if (horizontalFirst) { stepCol(); stepRow(); }
        else { stepRow(); stepCol(); }
    }

    if (forceCentralCross) {
        for (let c = QP[715]; c < cols; c++) grid[startRow][c] = false;
        for (let r = QP[715]; r < rows; r++) grid[r][startCol] = false;
    } else {
        for (const anchor of anchors || []) carveAnchorRoute(anchor);
    }

    function openNeighborCount(c, r) {
        return [[QP[747], QP[748]], [QP[749], QP[750]], [QP[751], QP[752]], [QP[753], QP[754]]]
            .filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false).length;
    }

    const plazaCells = [];
    const allOpenCells = [];
    for (let r = QP[755]; r < rows - QP[756]; r++) {
        for (let c = QP[757]; c < cols - QP[758]; c++) {
            if (grid[r][c]) continue;
            allOpenCells.push([c, r]);
            if (openNeighborCount(c, r) >= QP[759]) plazaCells.push([c, r]);
        }
    }

    return Object.freeze({
        grid,
        startCol,
        startRow,
        hub: Object.freeze({ c: startCol, r: startRow }),
        plazaCells,
        allOpenCells,
        openNeighborCount,
    });
}
