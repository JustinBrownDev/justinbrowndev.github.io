export const SUPERSTRUCTURE_FALLBACK_SCHEMA = 'jweb.superstructure-fallback.v1';

const DIRS = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);
function key(col, row) { return `${col},${row}`; }
function parseCell(value) {
    const [col, row] = String(value).split(',').map(Number);
    return Number.isInteger(col) && Number.isInteger(row) ? { col, row } : null;
}

export function collapseSolidComponentsIntoSuperstructureSites({ solidKeys = [], cols, rows } = {}) {
    cols = Math.max(0, Math.floor(Number(cols) || 0));
    rows = Math.max(0, Math.floor(Number(rows) || 0));
    const solid = new Set([...solidKeys].map(String).filter(value => {
        const cell = parseCell(value);
        return cell && cell.col >= 0 && cell.row >= 0 && cell.col < cols && cell.row < rows;
    }));
    const siteIdOf = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const sites = [];
    const ordered = [...solid].map(parseCell).sort((a, b) => a.row - b.row || a.col - b.col);
    const seen = new Set();
    for (const start of ordered) {
        const startKey = key(start.col, start.row);
        if (seen.has(startKey)) continue;
        const queue = [start];
        const cells = [];
        seen.add(startKey);
        for (let qi = 0; qi < queue.length; qi++) {
            const current = queue[qi];
            cells.push(current);
            for (const [dc, dr] of DIRS) {
                const nc = current.col + dc, nr = current.row + dr;
                const nk = key(nc, nr);
                if (!solid.has(nk) || seen.has(nk)) continue;
                seen.add(nk);
                queue.push({ col: nc, row: nr });
            }
        }
        cells.sort((a, b) => a.row - b.row || a.col - b.col);
        const id = sites.length;
        for (const cell of cells) siteIdOf[cell.row][cell.col] = id;
        sites.push({ id, cells });
    }
    return Object.freeze({
        schema: SUPERSTRUCTURE_FALLBACK_SCHEMA,
        mode: 'connected-solid-superstructure',
        sites: Object.freeze(sites.map(site => Object.freeze({ id: site.id, cells: Object.freeze(site.cells.map(cell => Object.freeze({ ...cell }))) }))),
        siteIdOf: Object.freeze(siteIdOf.map(row => Object.freeze([...row]))),
    });
}

export function superstructureFallbackDecision({ ordinarySiteCount = 0, failures = [], superstructureSites = [], serviceVoids = [] } = {}) {
    return Object.freeze({
        schema: SUPERSTRUCTURE_FALLBACK_SCHEMA,
        triggered: failures.length > 0,
        mode: failures.length ? 'connected-solid-superstructure' : 'ordinary-partition',
        ordinarySiteCount: Math.max(0, Number(ordinarySiteCount) || 0),
        failureCount: failures.length,
        triggeredBy: Object.freeze(failures.map(item => Object.freeze({ ...item }))),
        superstructureSiteCount: superstructureSites.length,
        serviceVoidCount: serviceVoids.length,
        superstructureSiteIds: Object.freeze(superstructureSites.map(site => Number(site.id))),
        serviceVoidSiteIds: Object.freeze(serviceVoids.map(site => Number(site.id))),
    });
}
