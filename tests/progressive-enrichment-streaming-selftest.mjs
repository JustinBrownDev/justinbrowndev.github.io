import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');

assert.match(main, /if \(GENERATION_LANES\.microEnrichment \|\| !worldChunkStreamer[^\n]*\) return 0;/,
  'full profile must not request additive skeleton deepening');
assert.match(main, /if \(!worldStats\?\.localRenderRing\?\.complete\) return 0;/,
  'micro detail must wait until the playable local render ring is complete');
assert.match(main, /const radius = desktop \? 1 : 0;/,
  'progressive requests must remain local around the player');
assert.match(main, /\.sort\(\(a, b\) => \{[\s\S]*?playerChunk[\s\S]*?return ad - bd/,
  'streamed READY chunks must deepen nearest-player first');
assert.match(main, /progressiveEnrichmentNextAt = now \+ \(desktop \? 90 : 180\);/,
  'request cadence must be throttled after handoff');
assert.match(main, /maybeRequestProgressiveEnrichment\(now, liveWorldStats, playerNearSpawn\)/,
  'animation loop must own progressive request timing');
assert.doesNotMatch(main, /generationProfile\s*=\s*['"]full['"]|GENERATION_PROFILE_NAME\s*=\s*['"]full['"]/,
  'runtime deepening must not switch the browser to the full generation profile');
assert.match(engine, /requestProgressiveDeepening/,
  'fabric engine must expose the one-time deepening request');
assert.match(enrichment, /PROGRESSIVE_EXTERIOR_DETAIL_KINDS/);
assert.match(enrichment, /createExteriorCompositionCompiler/,
  'progressive tasks must still pass through exterior composition authority');
assert.match(enrichment, /compiler\.step\(\{ maxUnits: 1 \}\)/,
  'second-stage composition planning must remain cooperatively bounded');
assert.doesNotMatch(enrichment, /PROGRESSIVE_EXTERIOR_DETAIL_KINDS[\s\S]{0,500}semantic-interior/,
  '21N must not progressively populate interiors before 21O egress authority');

console.log('[progressive-enrichment-streaming-selftest] PASS', {
  startGate: 'local render ring complete',
  requestRadius: 'desktop=1 chunk, weak=0 chunks',
  cadenceMs: 'desktop=90, weak=180',
  topologyPolicy: 'cosmetic common-fabric tasks only; no full-profile switch',
});
