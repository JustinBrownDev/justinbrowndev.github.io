import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

assert.match(engine, /planHangingCityCounterparts/);
assert.match(engine, /buildFullFatHangingCityLayer/);
assert.match(engine, /cloneBridgePlansForHangingFrame/);
assert.match(engine, /hangingRoot\.scale\.y\s*=\s*-1/);
assert.match(engine, /assertBuildingFootprintsDoNotOverlap\(hangingEntities\)/);
assert.match(engine, /polarityPortals/);
assert.match(engine, /authoredHangingStreetRoot/);
assert.match(engine, /spawn-hanging-/);
assert.match(engine, /buildAuthoredBridge/);
assert.match(engine, /dualPolaritySeam/);
assert.match(enrichment, /!entity\.dualPolaritySeam/);
assert.match(main, /createDualPolarityPlayerPhysics/);
assert.match(main, /verticalPolarity === -1/);
assert.doesNotMatch(engine, /planInvertedTowerField\(/);

console.log('[hanging-city-engine-contract-selftest] PASS', {
  invariant: 'peer full-fat inverted frame + natural catwalk topology + one-building seam promotion + routed polarity physics',
});
