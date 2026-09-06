import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

assert.equal(main.includes('bootstrapPreviewOverrideActive'), false,
  'whole-scene gray override must not return');
assert.equal(main.includes('scene.overrideMaterial = bootstrapPreviewMaterial'), false,
  'bootstrap rendering must never replace every authored material with one gray material');
assert.equal(fs.existsSync(path.join(root, 'systems/material-refinement.js')), false,
  'late whole-scene material restore controller is obsolete once color publishes at creation time');
assert.match(main, /let _bootstrapCompileStagingEnabled = true;/,
  'color-proxy compile staging must cover authored geometry from its first publication');
assert.match(main, /function bootstrapPreviewMaterialFor\(/,
  'cheap color proxy material factory missing');
assert.match(main, /leaf\.material = bootstrapPreviewForLeaf\(leaf, originalMaterial\);/,
  'uncompiled authored leaves must keep publishing via a color proxy');
assert.doesNotMatch(main, /stageBootstrapCompileLeaf[\s\S]{0,1500}leaf\.visible = false/,
  'shader staging must not hide geometry while compiling');
assert.match(main, /const compileTarget = representative\.clone\(false\);[\s\S]{0,300}compileTarget\.material = representativeStage\.material;/,
  'final shader should compile on a detached representative while live proxy stays visible');
assert.match(main, /leaf\.material = staged\.material;/,
  'compiled leaves must independently deepen to their final material');
assert.match(main, /visual\.publish-speculative/,
  'safe visual candidates should be visible before final arbitration');
assert.match(main, /__bootstrapSpeculativeVisual = true/,
  'speculative visual publication must be explicitly marked for diagnostics/future overwrite policy');
assert.doesNotMatch(main, /__bootstrapDeferredVisual|visual\.defer-bootstrap/,
  'old hidden-until-later visual staging must remain retired');
assert.match(main, /colorProxyPending: _bootstrapCompileStaged\.size/,
  'runtime telemetry must expose unfinished material deepening without treating it as a visibility gate');

const postHandoff = main.slice(main.indexOf('void (async function continuePostHandoffWorldRefinement()'));
assert.doesNotMatch(postHandoff, /localRenderRing[\s\S]{0,400}(while|materialRefinement)/,
  'post-handoff color/material publication must not wait for a neighborhood-wide ring gate');

console.log('[progressive-color-publication-selftest] PASS', {
  policy: 'colored proxy now -> final material independently',
  globalPaintGate: false,
  speculativeVisuals: true,
});
