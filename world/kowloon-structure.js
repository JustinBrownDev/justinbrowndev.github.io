// Shared structural grammar for both the authored origin and streamed infinity.
//
// ONE STRUCTURAL LANGUAGE. Spawn, singular landmark shells, recurring district
// landmarks, and streamed infinity all consume this topology through the same
// KowloonFabricEngine renderer/collision publisher. Unique authored content is a
// recipe layered on top; it is not allowed to define a second wall/floor/stair
// system. This module is the one source of truth for city massing and edge semantics.

export const KOWLOON_DIRS = Object.freeze([
    Object.freeze({ key: 'N', dc: 0, dr: -1, side: 'north' }),
    Object.freeze({ key: 'S', dc: 0, dr: 1, side: 'south' }),
    Object.freeze({ key: 'W', dc: -1, dr: 0, side: 'west' }),
    Object.freeze({ key: 'E', dc: 1, dr: 0, side: 'east' }),
]);

export function kowloonCellKey(col, row) {
    return `${col},${row}`;
}

export function parseKowloonCellKey(value) {
    const comma = value.indexOf(',');
    return {
        col: Number(value.slice(0, comma)),
        row: Number(value.slice(comma + 1)),
    };
}

/**
 * Exact constrained-cell partitioning used by the authored spawn district.
 *
 * Keeping this algorithm shared is important: a "building" is not one grid
 * square.  It is a connected compound grown from the most constrained solid
 * cell, then accreted through neighboring cells up to a seeded target size.
 * Callers own the RNG policy via chooseTargetSize() and pick().
 */
export function partitionKowloonCompounds({
    cols,
    rows,
    solidKeys,
    chooseTargetSize,
    pick,
    initialSiteId = 0,
} = {}) {
    if (!Number.isInteger(cols) || cols <= 0 || !Number.isInteger(rows) || rows <= 0) {
        throw new Error('partitionKowloonCompounds requires positive integer cols/rows');
    }
    if (typeof chooseTargetSize !== 'function' || typeof pick !== 'function') {
        throw new Error('partitionKowloonCompounds requires chooseTargetSize and pick callbacks');
    }

    const unclaimedSet = solidKeys instanceof Set ? new Set(solidKeys) : new Set(solidKeys || []);
    const siteIdOf = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const sites = [];
    const degreeBuckets = Array.from({ length: 5 }, () => new Set());
    const degreeByKey = new Map();

    const degreeFor = (c, r) => {
        let degree = 0;
        for (const { dc, dr } of KOWLOON_DIRS) {
            if (unclaimedSet.has(kowloonCellKey(c + dc, r + dr))) degree++;
        }
        return degree;
    };

    for (const key of unclaimedSet) {
        const { col, row } = parseKowloonCellKey(key);
        const degree = degreeFor(col, row);
        degreeByKey.set(key, degree);
        degreeBuckets[degree].add(key);
    }

    function claimCell(col, row, siteId) {
        const key = kowloonCellKey(col, row);
        if (!unclaimedSet.has(key)) return false;
        const oldDegree = degreeByKey.get(key);
        degreeBuckets[oldDegree]?.delete(key);
        degreeByKey.delete(key);
        unclaimedSet.delete(key);
        if (row >= 0 && row < rows && col >= 0 && col < cols) siteIdOf[row][col] = siteId;
        for (const { dc, dr } of KOWLOON_DIRS) {
            const nk = kowloonCellKey(col + dc, row + dr);
            if (!unclaimedSet.has(nk)) continue;
            const d = degreeByKey.get(nk);
            degreeBuckets[d]?.delete(nk);
            const nextDegree = d - 1;
            degreeByKey.set(nk, nextDegree);
            degreeBuckets[nextDegree].add(nk);
        }
        return true;
    }

    function mostConstrainedKey() {
        for (let degree = 0; degree <= 4; degree++) {
            const next = degreeBuckets[degree].values().next();
            if (!next.done) return next.value;
        }
        return null;
    }

    while (unclaimedSet.size) {
        const seedKey = mostConstrainedKey();
        if (seedKey === null) break;
        const seed = parseKowloonCellKey(seedKey);
        const id = initialSiteId + sites.length;
        const cells = [{ row: seed.row, col: seed.col }];
        claimCell(seed.col, seed.row, id);
        const target = Math.max(1, Math.floor(Number(chooseTargetSize({ id, seed, remaining: unclaimedSet.size })) || 1));

        while (cells.length < target) {
            const candidates = [];
            for (const cell of cells) {
                for (const { dc, dr } of KOWLOON_DIRS) {
                    const nc = cell.col + dc;
                    const nr = cell.row + dr;
                    if (unclaimedSet.has(kowloonCellKey(nc, nr))) candidates.push([nc, nr]);
                }
            }
            if (!candidates.length) break;
            const next = pick(candidates, { siteId: id, cells });
            if (!next) break;
            const [nc, nr] = next;
            if (!claimCell(nc, nr, id)) continue;
            cells.push({ row: nr, col: nc });
        }
        sites.push({ id, cells });
    }

    return { siteIdOf, sites };
}


export function selectKowloonCourtyardCell(site, degreeOf, primary, { minCells = 5, degree = 4 } = {}) {
    if (!site?.cells?.length || site.cells.length < minCells) return null;
    for (const cell of site.cells) {
        if (cell === primary) continue;
        if (degreeOf(cell) === degree) return cell;
    }
    return null;
}

export function analyzeKowloonCompound(site, siteIdOf, { courtyardMinCells = 5, courtyardDegree = 4 } = {}) {
    if (!site?.cells?.length) throw new Error('analyzeKowloonCompound requires a non-empty site');
    const degreeByKey = new Map();
    const degreeOf = cell => {
        const key = kowloonCellKey(cell.col, cell.row);
        if (degreeByKey.has(key)) return degreeByKey.get(key);
        let degree = 0;
        for (const { dc, dr } of KOWLOON_DIRS) {
            if (siteIdOf[cell.row + dr]?.[cell.col + dc] === site.id) degree++;
        }
        degreeByKey.set(key, degree);
        return degree;
    };

    let primary = site.cells[0];
    let primaryDegree = -1;
    for (const cell of site.cells) {
        const degree = degreeOf(cell);
        if (degree > primaryDegree) {
            primary = cell;
            primaryDegree = degree;
        }
    }

    const courtyardCandidate = selectKowloonCourtyardCell(site, degreeOf, primary, { minCells: courtyardMinCells, degree: courtyardDegree });

    return {
        primary,
        primaryDegree,
        courtyardCandidate,
        degreeByKey,
        degreeOf,
    };
}

export function classifyKowloonEdge({
    siteIdOf,
    siteId,
    row,
    col,
    dr,
    dc,
    isStreet,
    courtyardCell = null,
} = {}) {
    const nr = row + dr;
    const nc = col + dc;
    if (typeof isStreet === 'function' && isStreet(nc, nr)) return 'street';
    if (courtyardCell && courtyardCell.row === nr && courtyardCell.col === nc) return 'courtyard';
    const neighborId = siteIdOf?.[nr]?.[nc];
    if (neighborId === siteId) return 'internal';
    if (neighborId === undefined || neighborId < 0) return 'street';
    return 'party';
}

/**
 * Kowloon / personal-city intensity is structural, not a decoration switch.
 * It controls accretion opportunities while leaving the caller in charge of
 * deterministic RNG streams and renderer cost.
 */

export function chooseKowloonCompoundTargetSize(rng, weirdness = 0) {
    if (typeof rng !== 'function') throw new Error('chooseKowloonCompoundTargetSize requires rng');
    const intensity = kowloonIntensity(weirdness);
    // Authored spawn keeps its historical CONFIG weights by injecting its own
    // chooseTargetSize callback. Infinite chunks use this Kowloon-biased curve:
    // small compounds remain common, but higher weirdness increasingly accretes
    // 4-7-cell masses rather than reverting to one-cell boxes.
    const base = [
        [1, 22], [2, 25], [3, 20], [4, 15], [5, 9], [6, 6], [7, 3],
    ];
    const adjusted = base.map(([size, weight]) => {
        const bonus = size >= 4 ? intensity.siteTargetBonus * (size - 2) * 2.5 : 0;
        return [size, weight + bonus];
    });
    const total = adjusted.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng() * total;
    for (const [size, weight] of adjusted) {
        roll -= weight;
        if (roll <= 0) return size;
    }
    return adjusted[adjusted.length - 1][0];
}

export function kowloonIntensity(weirdness = 0) {
    const w = Math.max(0, Math.min(1, Number(weirdness) || 0));
    return Object.freeze({
        siteTargetBonus: w < 0.3 ? 0 : w < 0.7 ? 1 : 2,
        courtyardChance: 0.22 + w * 0.42,
        verticalVariance: 1 + Math.floor(w * 4),
        setbackChance: 0.34 + w * 0.48,
        scaffoldChance: 0.42 + w * 0.38,
        serviceGutsChance: 0.48 + w * 0.40,
        bridgeChance: 0.10 + w * 0.34,
        cageChance: 0.22 + w * 0.50,
        overhangChance: 0.18 + w * 0.46,
    });
}
