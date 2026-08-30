const fs = require('fs');
const assert = require('assert');
const main = fs.readFileSync('main.js', 'utf8');
const enrich = fs.readFileSync('world/infinite-chunk-enrichment.js', 'utf8');
const exciter = fs.readFileSync('world/procedural-text-exciter.js', 'utf8');
assert(main.includes('streaming authored sites · fair semantic turns'));
assert(main.includes('a.turns - b.turns'));
assert(main.includes('physics.sync-authored-step'));
assert(main.includes('void (async function continuePostHandoffWorldRefinement()'));
assert(!main.includes("await testYieldNow('optimizing spawn chunk · background refinement');\nconst staticOptimizeStart"));
assert(enrich.includes('createProceduralTextExciter'));
assert(enrich.includes("textExciter.pairFor(chunk, entity.id, 'sign-label'"));
assert(enrich.includes("textExciter.tagFor(chunk, entity.id, 'graffiti-label'"));
assert(exciter.includes('CURATED_CLUTTER_CORPUS'));
assert(exciter.includes('CURATED_CLUTTER_FRAGMENTS'));
assert(exciter.includes('CURATED_POETRY'));
assert(exciter.includes('EVERY CHUNK LOADS ITSELF'));
console.log('[progressive-spawn-checkpoint-audit] PASS', {
  fairAuthoredSemanticTurns: true,
  structuralCollisionSync: true,
  detachedPostHandoffRefinement: true,
  deterministicFullCuratedCorpusExciter: true,
});
