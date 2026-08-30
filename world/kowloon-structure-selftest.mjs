import assert from 'node:assert/strict';
import {
  analyzeKowloonCompound,
  classifyKowloonEdge,
  kowloonCellKey,
  partitionKowloonCompounds,
  selectKowloonCourtyardCell,
} from './kowloon-structure.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Frozen copy of the pre-refactor authored ordinary-site partition algorithm.
function legacyPartition({ cols, rows, solidKeys, chooseTargetSize, pick }) {
  const unclaimedSet = new Set(solidKeys);
  const siteIdOf = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const sites = [];
  const degreeBuckets = Array.from({ length: 5 }, () => new Set());
  const degreeByKey = new Map();
  const degreeFor = (c, r) => {
    let degree = 0;
    if (unclaimedSet.has(`${c},${r - 1}`)) degree++;
    if (unclaimedSet.has(`${c},${r + 1}`)) degree++;
    if (unclaimedSet.has(`${c - 1},${r}`)) degree++;
    if (unclaimedSet.has(`${c + 1},${r}`)) degree++;
    return degree;
  };
  for (const key of unclaimedSet) {
    const comma = key.indexOf(',');
    const c = Number(key.slice(0, comma)), r = Number(key.slice(comma + 1));
    const degree = degreeFor(c, r);
    degreeByKey.set(key, degree);
    degreeBuckets[degree].add(key);
  }
  function claimCell(c, r, siteId) {
    const key = `${c},${r}`;
    if (!unclaimedSet.has(key)) return false;
    const oldDegree = degreeByKey.get(key);
    degreeBuckets[oldDegree]?.delete(key);
    degreeByKey.delete(key);
    unclaimedSet.delete(key);
    siteIdOf[r][c] = siteId;
    for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nk = `${c + dc},${r + dr}`;
      if (!unclaimedSet.has(nk)) continue;
      const d = degreeByKey.get(nk);
      degreeBuckets[d].delete(nk);
      degreeByKey.set(nk, d - 1);
      degreeBuckets[d - 1].add(nk);
    }
    return true;
  }
  function mostConstrainedKey() {
    for (let degree = 0; degree <= 4; degree++) {
      const it = degreeBuckets[degree].values().next();
      if (!it.done) return it.value;
    }
    return null;
  }
  while (unclaimedSet.size) {
    const bestKey = mostConstrainedKey();
    if (bestKey === null) break;
    const comma = bestKey.indexOf(',');
    const c0 = Number(bestKey.slice(0, comma)), r0 = Number(bestKey.slice(comma + 1));
    const id = sites.length;
    const cells = [{ row: r0, col: c0 }];
    claimCell(c0, r0, id);
    const target = chooseTargetSize();
    while (cells.length < target) {
      const candidates = [];
      for (const cell of cells) for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nc = cell.col + dc, nr = cell.row + dr;
        if (unclaimedSet.has(`${nc},${nr}`)) candidates.push([nc, nr]);
      }
      if (!candidates.length) break;
      const [nc, nr] = pick(candidates);
      claimCell(nc, nr, id);
      cells.push({ row: nr, col: nc });
    }
    sites.push({ id, cells });
  }
  return { siteIdOf, sites };
}

const solid = new Set();
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  if (c === 4 || r === 4 || (c === 1 && r > 1 && r < 7)) continue;
  solid.add(kowloonCellKey(c, r));
}
const legacyRng = mulberry32(0x13572468);
const sharedRng = mulberry32(0x13572468);
const legacy = legacyPartition({
  cols: 9, rows: 9, solidKeys: solid,
  chooseTargetSize: () => 1 + Math.floor(legacyRng() * 7),
  pick: values => values[Math.floor(legacyRng() * values.length) % values.length],
});
const shared = partitionKowloonCompounds({
  cols: 9, rows: 9, solidKeys: solid,
  chooseTargetSize: () => 1 + Math.floor(sharedRng() * 7),
  pick: values => values[Math.floor(sharedRng() * values.length) % values.length],
});
assert.deepEqual(shared, legacy, 'shared partitioner must reproduce the pre-refactor authored ordinary-site algorithm exactly');
assert.ok(shared.sites.some(site => site.cells.length > 1), 'shared planner must actually produce multi-cell compounds');

const sampleSite = { id: 7, cells: [
  { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
  { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 },
  { col: 2, row: 3 },
] };
const sampleIds = Array.from({ length: 5 }, () => new Array(5).fill(-1));
for (const cell of sampleSite.cells) sampleIds[cell.row][cell.col] = sampleSite.id;
const topology = analyzeKowloonCompound(sampleSite, sampleIds);
assert.equal(topology.primary.col, 2);
assert.equal(topology.primary.row, 2);
assert.equal(topology.degreeOf(topology.primary), 4, 'topology primary must be the most connected module');
assert.equal(topology.courtyardCandidate, null, 'historical authored degree-4 courtyard rule remains exact');
const lightwell = selectKowloonCourtyardCell(sampleSite, topology.degreeOf, topology.primary, { minCells: 5, degree: 3 });
assert.ok(lightwell, 'shared planner must support Kowloon semi-enclosed lightwell/service-void selection for streamed compounds');

assert.equal(classifyKowloonEdge({ siteIdOf: sampleIds, siteId: 7, row: 1, col: 2, dr: 1, dc: 0, isStreet: () => false }), 'internal');
assert.equal(classifyKowloonEdge({ siteIdOf: sampleIds, siteId: 7, row: 1, col: 1, dr: 0, dc: -1, isStreet: (c, r) => c === 0 }), 'street');

console.log('[kowloon-structure-selftest] PASS', {
  sites: shared.sites.length,
  multiCellSites: shared.sites.filter(site => site.cells.length > 1).length,
  primary: topology.primary,
  lightwell,
});
