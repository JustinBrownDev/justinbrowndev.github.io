import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIGNAGE_GEOMETRY_POLICY,
  boundedBladePanelHeight,
  boundedFacadeMediaPanel,
  boundedRoofMediaPanel,
  signAltitudeScale,
} from '../world/signage-geometry-policy.js';
import { planFastFacadeArchitecture } from '../world/fast-facade-architecture.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bladeH = boundedBladePanelHeight(4, 2.5);
assert.ok(bladeH / 4 <= SIGNAGE_GEOMETRY_POLICY.bladeMaxAspect + 1e-9, 'blade signs must reject absurdly tall shape ratios');
assert.ok(bladeH / 4 >= SIGNAGE_GEOMETRY_POLICY.bladeMinAspect - 1e-9, 'blade signs must retain a readable minimum panel height');

const facadePanel = boundedFacadeMediaPanel(10, 13.5, 10);
assert.ok(facadePanel.height <= 6.2 + 1e-9, 'facade megascreen height must be aspect-bounded even in signage stress mode');
const roofPanel = boundedRoofMediaPanel(10, 8, 4.8);
assert.ok(roofPanel.height <= 4.8 + 1e-9 && roofPanel.height / roofPanel.width <= 0.50 + 1e-9,
  'roof billboard must remain landscape and height-bounded');

const lowScale = signAltitudeScale(3, 0);
const highScale = signAltitudeScale(30, 0);
assert.equal(lowScale, 1, 'eye-level signs keep ordinary scale');
assert.ok(highScale >= 2 && highScale <= SIGNAGE_GEOMETRY_POLICY.altitudeScaleMax + 1e-9,
  'high facade signs must become substantially larger for ground readability');

const storefrontPlan = planFastFacadeArchitecture({
  stableKey: 'facade-unit',
  floorH: 3.2,
  faces: [{
    moduleKey: 'm1', dirKey: 'E', side: 'east', floors: 3,
    rect: { cx: 8, cz: 0, halfX: 2.8, halfZ: 3.2 }, openings: [],
  }],
});
const storefront = storefrontPlan.treatments.find(item => item.kind === 'storefront');
assert.ok(storefront, 'fixture must deterministically select a storefront');
const storefrontAperture = storefrontPlan.apertures.find(item => item.kind === 'storefront');
assert.ok(storefrontAperture, 'storefront treatment must publish a real wall aperture');
assert.equal(storefrontAperture.bottom, 0, 'storefront aperture must reach the floor like a large doorway');
assert.ok(storefrontAperture.height >= 2.30, 'storefront carve must be human-door-height, not a floating window');
assert.equal(storefrontPlan.metrics.newPortalCount, 0, 'storefront carve is facade architecture, not a fabricated circulation portal');

const signage = fs.readFileSync(path.join(repo, 'world/signage.js'), 'utf8');
assert.match(signage, /boundedBladePanelHeight/);
assert.match(signage, /THREE\.AdditiveBlending/);
assert.match(signage, /toneMapped:\s*false/);

const facadeLayout = fs.readFileSync(path.join(repo, 'world/facade-layout.js'), 'utf8');
assert.match(facadeLayout, /signAltitudeScale/);
assert.match(facadeLayout, /targetCenterY/);

const renderer = fs.readFileSync(path.join(repo, 'systems/sign-display-renderer.js'), 'utf8');
assert.match(renderer, /startPx \* 1\.16/, 'display typography should be materially larger');
assert.match(renderer, /textValue\.length <= 12 \? 1\.26/, 'existing short-copy growth behavior remains intact');

const field = fs.readFileSync(path.join(repo, 'world/exterior-prop-field.js'), 'utf8');
assert.match(field, /boundedFacadeMediaPanel/);
assert.match(field, /boundedRoofMediaPanel/);
assert.doesNotMatch(field, /width \* \(signageStress \? 1\.35 : 0\.62\)/,
  'stress mode must not reintroduce portrait megascreens');

console.log('[cut13-signage-storefront-selftest] PASS', {
  bladeAspect: bladeH / 4,
  facadeAspect: facadePanel.height / facadePanel.width,
  roofAspect: roofPanel.height / roofPanel.width,
  highSignScale: highScale,
  storefront: `${storefrontAperture.width.toFixed(2)}m x ${storefrontAperture.height.toFixed(2)}m`,
  invariant: 'high signs scale up; media stays landscape; neon glows; storefront is a literal wall cut without inventing a portal',
});
