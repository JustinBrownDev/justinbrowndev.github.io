import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionKowloonCompounds, chooseKowloonCompoundTargetSize } from '../world/kowloon-structure.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enginePath = path.join(repo, 'kowloon-fabric-engine.js');
if (fs.existsSync(enginePath)) {
  const engine = fs.readFileSync(enginePath, 'utf8');
  assert.match(engine, /treadVisualBudget:\s*GENERATION_LANES\.broadStrokesOnly \? 3 : Infinity/,
    'skeleton must cap eager tread visuals without changing ramp physics');
  assert.match(engine, /buildFullFatHangingCityLayer/,
    'overhead city must be generated as a peer full-fat city layer');
  assert.doesNotMatch(engine, /planInvertedTowerField\(/,
    'retired sparse inverted-tower macro path must not remain live');
}

const solidKeys = new Set();
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  if (c === 4 && r !== 1 && r !== 7) continue;
  if (r === 4 && c !== 1 && c !== 7) continue;
  solidKeys.add(`${c},${r}`);
}
const makeRng = seed0 => {
  let a = seed0 >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const chooseOld = rng => {
  const base = [[5,8],[6,18],[7,24],[8,22],[9,16],[10,8],[11,3],[12,1]];
  const adjusted = base.map(([size, weight]) => [size, weight + (size >= 7 ? (size - 5) * 3 : 0)]);
  let roll = rng() * adjusted.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [size, weight] of adjusted) {
    roll -= weight;
    if (roll <= 0) return size;
  }
  return adjusted.at(-1)[0];
};
const countSites = (seed, scaled) => {
  const rng = makeRng(seed);
  const partition = partitionKowloonCompounds({
    cols: 9,
    rows: 9,
    solidKeys,
    chooseTargetSize: () => scaled ? chooseKowloonCompoundTargetSize(rng, 0) : chooseOld(rng),
    pick: candidates => candidates[Math.floor(rng() * candidates.length) % candidates.length],
  });
  return partition.sites.length;
};
let oldSites = 0;
let scaledSites = 0;
for (let seed = 1; seed <= 32; seed++) {
  oldSites += countSites(seed, false);
  scaledSites += countSites(seed, true);
}
assert.ok(scaledSites < oldSites * 0.55,
  `4x floorplates should reduce independent building/core planning work materially: ${oldSites} -> ${scaledSites}`);

console.log('[cut14-first-paint-budget-selftest] PASS', {
  oldSites,
  scaledSites,
  ratio: scaledSites / oldSites,
  invariant: 'fewer independent ground core plans + bounded tread visuals + peer hanging city on the same compound topology',
});
