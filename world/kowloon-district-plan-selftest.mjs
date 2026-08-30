import assert from 'node:assert/strict';
import { createKowloonMazeTopology } from './kowloon-district-plan.js';

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function legacySpawnMaze(cols, rows, rng, loopChance) {
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(true));
    const inBounds = (c, r) => c >= 1 && c < cols - 1 && r >= 1 && r < rows - 1;
    const startCol = Math.floor(cols / 2), startRow = Math.floor(rows / 2);
    grid[startRow][startCol] = false;
    const stack = [[startCol, startRow]];
    const dirsBase = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    while (stack.length) {
        const [c, r] = stack[stack.length - 1];
        const dirs = [...dirsBase].sort(() => rng() - 0.5);
        let carved = false;
        for (const [dc, dr] of dirs) {
            const nc = c + dc, nr = r + dr;
            if (inBounds(nc, nr) && grid[nr][nc]) {
                grid[nr][nc] = false;
                grid[r + dr / 2][c + dc / 2] = false;
                stack.push([nc, nr]);
                carved = true;
                break;
            }
        }
        if (!carved) stack.pop();
    }
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
        if (!grid[r][c]) continue;
        const n = [[0,-1],[0,1],[-1,0],[1,0]].filter(([dc,dr]) => !grid[r+dr]?.[c+dc]).length;
        if (n >= 2 && rng() < loopChance) grid[r][c] = false;
    }
    for (let c = 0; c < cols; c++) grid[startRow][c] = false;
    for (let r = 0; r < rows; r++) grid[r][startCol] = false;
    const openNeighborCount = (c,r) => [[0,-1],[0,1],[-1,0],[1,0]].filter(([dc,dr]) => grid[r+dr]?.[c+dc] === false).length;
    const plazaCells = [], allOpenCells = [];
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (!grid[r][c]) {
        allOpenCells.push([c,r]);
        if (openNeighborCount(c,r) >= 3) plazaCells.push([c,r]);
    }
    return { grid, startCol, startRow, plazaCells, allOpenCells };
}

const seed = 0x51a77e11;
const legacyRng = mulberry32(seed);
const sharedRng = mulberry32(seed);
const legacy = legacySpawnMaze(13, 13, legacyRng, 0.28);
const shared = createKowloonMazeTopology({ cols: 13, rows: 13, rng: sharedRng, loopChance: 0.28, forceCentralCross: true });
assert.deepEqual(shared.grid, legacy.grid, 'origin mode must reproduce the historical authored maze exactly');
assert.deepEqual(shared.allOpenCells, legacy.allOpenCells, 'origin open-cell ordering must remain unchanged');
assert.deepEqual(shared.plazaCells, legacy.plazaCells, 'origin plaza classification must remain unchanged');
assert.equal(shared.startCol, legacy.startCol);
assert.equal(shared.startRow, legacy.startRow);
assert.equal(sharedRng(), legacyRng(), 'shared origin planner must consume the exact same RNG sequence');

const outer = createKowloonMazeTopology({
    cols: 9, rows: 9, rng: mulberry32(seed ^ 0x9e3779b9), loopChance: 0.22,
    anchors: [{ c: 4, r: 0 }, { c: 4, r: 8 }, { c: 0, r: 3 }, { c: 8, r: 6 }],
});
for (const [c,r] of [[4,0],[4,8],[0,3],[8,6]]) assert.equal(outer.grid[r][c], false, `outer portal ${c},${r} must be open`);
const allRoads = new Set();
for (let r=0;r<9;r++) for(let c=0;c<9;c++) if (!outer.grid[r][c]) allRoads.add(`${c},${r}`);
const first = [...allRoads][0], seen = new Set([first]), queue=[first];
while(queue.length){const [c,r]=queue.shift().split(',').map(Number);for(const k of [`${c+1},${r}`,`${c-1},${r}`,`${c},${r+1}`,`${c},${r-1}`])if(allRoads.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}
assert.equal(seen.size, allRoads.size, 'outer portal-anchored maze must remain one connected network');
assert.ok(allRoads.size >= 24 && allRoads.size <= 42, `9x9 outer maze density escaped Kowloon target: ${allRoads.size} open cells`);

console.log('[kowloon-district-plan-selftest] PASS', {
    originOpenCells: legacy.allOpenCells.length,
    originPlazas: legacy.plazaCells.length,
    outerRoadCells: allRoads.size,
    outerSolidCells: 81 - allRoads.size,
});
