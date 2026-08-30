import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const facade = fs.readFileSync(path.join(root, 'world', 'facade-layout.js'), 'utf8');
const buildings = fs.readFileSync(path.join(root, 'world', 'building-construction.js'), 'utf8');
const signatures = fs.readFileSync(path.join(root, 'world', 'signature-buildings.js'), 'utf8');
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(facade.includes('function* placeSignsOnFacadeSteps('), 'facade sign placement must expose a resumable generator');
ok(facade.includes('yield { signIndex: i, placed }'), 'facade sign generator must yield between individual sign attempts');
ok(buildings.includes("yield { phase: 'facade-sign'"), 'building generation must expose per-sign cooperative phases');
ok(buildings.includes("yield { phase: 'facade-pipes'") && buildings.includes("yield { phase: 'facade-awning'") && buildings.includes("yield { phase: 'facade-access'"), 'facade detail work must be split into bounded cooperative phases');
ok(buildings.includes("yield { phase: 'facade-shell'"), 'facade shell creation must yield between exposed faces');

for (const name of ['buildArtGallerySteps', 'buildAS400ArchiveSteps', 'buildJustinIndexSteps', 'buildSystemsWorkshopSteps', 'buildLoreShrineSteps', 'buildFuturePlaceholderSteps']) {
  ok(signatures.includes(`function* ${name}(`), `${name} must remain a resumable generator`);
}
ok(!signatures.includes('addBuildingModule(cell, {'), 'signature builders must not fall back to atomic module construction');
ok((signatures.match(/yield\* addBuildingModuleSteps\(cell, \{/g) || []).length >= 6, 'all signature massing paths must use resumable module construction');
ok(signatures.includes("yield { phase: 'signature-art-piece'"), 'art gallery must yield between wall pieces');
ok(signatures.includes("yield { phase: 'signature-index-stack-fixture'"), 'Justin Index must yield between stack fixtures');
ok(signatures.includes("yield { phase: 'signature-workshop-fixture'"), 'Systems Workshop must yield between fixtures');
ok(signatures.includes("yield { phase: 'signature-lore-cycle-stage'") && signatures.includes("yield { phase: 'signature-lore-tool'"), 'Lore Shrine must yield between dense exhibits');

const optimizerAt = main.indexOf('createProgressiveStaticWorldOptimizer({');
const physicsAt = main.indexOf('playerPhysics = createPlayerPhysics({');
const authoredLoopAt = main.indexOf('while (pendingBuildingSites.length)');
ok((main.match(/createProgressiveStaticWorldOptimizer\(\{/g) || []).length === 1, 'there must be exactly one authored-world optimizer owner');
ok(optimizerAt >= 0 && optimizerAt < authoredLoopAt, 'optimizer ownership must precede authored background construction');
ok(physicsAt >= 0 && physicsAt < authoredLoopAt, 'real player physics must precede authored background construction');
ok(!main.includes('staticWorldOptimizer.optimize({'), 'legacy whole-scene optimizer path must remain removed');
ok(main.includes('_backgroundCompileSchedulingEnabled = true;'), 'live handoff must keep background shader compilation enabled');
const compileStageEnabledAt = main.indexOf('_bootstrapCompileStagingEnabled = true;');
const compileStageLastDisableAt = main.lastIndexOf('_bootstrapCompileStagingEnabled = false;');
ok(compileStageEnabledAt >= 0 && compileStageLastDisableAt < compileStageEnabledAt, 'live handoff must not disable compile staging after bootstrap enables it');
ok(main.includes('staticWorldOptimizer?.markDirtyObject(leaf);'), 'compiled staged leaves must dirty their spatial chunk for later batching');
ok(main.includes("_spawnDistrictStructuresComplete = true;\nawait testYieldNow('nearest authored district collision-ready"), 'construction safety gate must release only after nearest authored content is collision-ready');

if (failures.length) {
  console.error(`[progressive-generation-selftest] FAIL (${failures.length})`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('[progressive-generation-selftest] PASS: real physics + resumable authored generation + incremental compile/batching handoff');
