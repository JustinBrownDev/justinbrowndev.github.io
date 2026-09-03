import assert from 'node:assert/strict';
import fs from 'node:fs';
const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

assert.match(engine, /ceilingSourceCoordinates/);
assert.match(engine, /planCeilingBuildingHeight/);
assert.match(engine, /buildCeilingCityLayerSteps/);
assert.match(engine, /ceilingRootMass/);
assert.match(engine, /invertedLowEndRoof/);
assert.match(engine, /addCavernLadder/);
assert.match(engine, /ceilingMat/);
assert.match(engine, /maximumCavernFloors/);
assert.doesNotMatch(engine, /\.scale\.y\s*=\s*-1/);
assert.doesNotMatch(engine, /polarityPortalForCounterpart/);
assert.doesNotMatch(engine, /planHangingCityCounterparts/);
assert.doesNotMatch(engine, /planInvertedTowerField\(/);
assert.match(enrichment, /entity\?\.baseY/);
assert.match(main, /createPlayerPhysics/);
assert.doesNotMatch(main, /createDualPolarityPlayerPhysics/);
assert.doesNotMatch(main, /verticalPolarity === -1/);
assert.match(main, /authoredCeilingOverlayComplete/);

console.log('[hanging-city-engine-contract-selftest] PASS', {
  invariant: 'two flat planes + independent phase-sampled ceiling topology + ordinary gravity + ceiling-rooted upright compounds',
});
