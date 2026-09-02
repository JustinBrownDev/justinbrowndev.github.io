import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../world/guardrail-authority.js', import.meta.url), 'utf8');
const scaffold = fs.readFileSync(new URL('../world/scaffold-circulation-plan.js', import.meta.url), 'utf8');
const fast = fs.readFileSync(new URL('../world/fast-vertical-route.js', import.meta.url), 'utf8');

assert.match(engine, /from '\.\/world\/guardrail-authority\.js'/, 'runtime consumes the shared guard authority');
assert.match(engine, /guardMetalMat/);
assert.match(engine, /guardConcreteMat/);
assert.match(engine, /guardMetal:\s*\[\]/);
assert.match(engine, /guardConcrete:\s*\[\]/);
assert.match(engine, /t\.rx|t\.rz/, 'instanced transform path supports stair-slope rail rotation');
assert.match(engine, /function emitGuardSpanFromAuthority/);
assert.match(engine, /function emitFlightGuardPairFromAuthority/);
assert.match(engine, /guardOpeningWidth\(/, 'transport rail carving uses player-sized guard openings');
assert.match(engine, /publishGuardPlan[\s\S]*guard render transforms are required/,
  'semantic guard publication fails fast if a render sink was not wired');

const flightCalls = [...engine.matchAll(/emitFlightGuardPairFromAuthority\(\{/g)].length;
assert.ok(flightCalls >= 5, `expected guard authority on scaffold + transport + broad/interior stair paths, saw ${flightCalls}`);
assert.doesNotMatch(engine, /const railH = 0\.82;\s*\n\s*const railT = 0\.09;/,
  'old generic balcony solid-box railing implementation must be gone');

const emitStart = engine.indexOf('function emitTransportRail(');
const emitEnd = engine.indexOf('function publishTransportSurfaceSlab(', emitStart);
assert.ok(emitStart >= 0 && emitEnd > emitStart);
const railAdapter = engine.slice(emitStart, emitEnd);
assert.doesNotMatch(railAdapter, /wallTransform\(/,
  'transport guard collision no longer doubles as a visible full-height wall box');
assert.match(railAdapter, /splitHorizontalGuardSpan/,
  'junction carving splits semantic guard spans and regenerates their visuals');

assert.match(guard, /'fire-escape-pipe'/);
assert.match(guard, /'residential-civic-bar'/);
assert.match(guard, /'municipal-concrete'/);
assert.match(scaffold, /planAlternatingFacadeStair/);
assert.match(fast, /planAlternatingFacadeStair/);
assert.doesNotMatch(engine, /vertical-circulation\.js/,
  'retired geometry-first vertical-circulation module must not return as railing authority');

const parapetCallsites = [...engine.matchAll(/addCompoundRoofParapetSide\(\{/g)].length;
const parapetWithTransforms = [...engine.matchAll(/addCompoundRoofParapetSide\(\{[\s\S]{0,180}?physics,\s*transforms,/g)].length;
assert.ok(parapetCallsites >= 2, 'both roof shell paths should remain covered');
assert.equal(parapetWithTransforms, parapetCallsites,
  'every roof parapet path must pass render transforms into the semantic guard publisher');

console.log('[guardrail-runtime-contract-selftest] PASS', {
  flightGuardCallsites: flightCalls,
  roofParapetCallsites: parapetCallsites,
  invariant: 'one semantic guard authority drives collision + visible rails and every runtime call path supplies its sinks',
});
