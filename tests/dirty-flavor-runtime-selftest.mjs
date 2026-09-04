import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dirtyData from '../noise-data-dirty-flavor.js';
import {
    DIRTY_FLAVOR_SIDECAR_SCHEMA,
    MOUNTAIN_GOATS_FLYER_CHANCE,
    dirtyFlavorLaneForSurface,
    installDirtyFlavorSidecar,
    pickDirtyFlavorPairForSurface,
} from '../content/dirty-flavor-sidecar.js';

const { DIRTY_FLAVOR_META, DIRTY_FLAVOR_LANES, MOUNTAIN_GOATS_RARE_TITLES } = dirtyData;

const here = path.dirname(fileURLToPath(import.meta.url));
const sidecarSource = fs.readFileSync(path.join(here, '..', 'content', 'dirty-flavor-sidecar.js'), 'utf8');
const enrichmentSource = fs.readFileSync(path.join(here, '..', 'world', 'kowloon-fabric-enrichment.js'), 'utf8');
assert.match(sidecarSource, /import\('\.\.\/noise-data-dirty-flavor\.js'\)/, 'dirty flavor reservoir must remain a lazy dynamic import');
assert.doesNotMatch(sidecarSource, /^import\s+.*noise-data-dirty-flavor/m, 'dirty flavor reservoir must not become a first-paint static import');
assert.match(enrichmentSource, /pickDirtyFlavorPairForSurface/, 'fast-path enrichment must consume the routed dirty-flavor sidecar');

assert.equal(DIRTY_FLAVOR_SIDECAR_SCHEMA, 'jweb.dirty-flavor-sidecar.v1');
assert.equal(DIRTY_FLAVOR_META.schema, 'jweb.dirty-flavor-runtime.v1');
assert.equal(DIRTY_FLAVOR_META.sourceUniqueEntries, 1156520);
assert.equal(DIRTY_FLAVOR_META.ordinaryRuntimeRows, 78336);
assert.equal(DIRTY_FLAVOR_META.excludedWpaPosterDescriptions, 875);
assert.ok(MOUNTAIN_GOATS_RARE_TITLES.length >= 1100, 'rare Mountain Goats title reservoir unexpectedly shrank');
assert.ok(MOUNTAIN_GOATS_FLYER_CHANCE <= 0.004, 'Mountain Goats flyer chance must remain extremely rare');

const expectedSurfaceLanes = {
    sign: 'storefront',
    flyer: 'flyer',
    'plaza-newsstand': 'institutional',
    'plaza-phone-booth': 'background',
    'plaza-atm-kiosk': 'technical',
    'plaza-park': 'institutional',
    megascreen: 'spectacle',
};
for (const [surface, lane] of Object.entries(expectedSurfaceLanes)) {
    assert.equal(dirtyFlavorLaneForSurface(surface), lane, `${surface} routed to the wrong flavor lane`);
}

const ordinary = Object.values(DIRTY_FLAVOR_LANES).flat();
assert.equal(ordinary.length, DIRTY_FLAVOR_META.ordinaryRuntimeRows);
assert.ok(ordinary.every(text => !/\bis a Mountain Goats recording\.?$/i.test(text)), 'recording boilerplate leaked into ordinary runtime rows');
assert.ok(ordinary.every(text => !/^A poster\b/i.test(text)), 'WPA unseen-poster descriptions leaked into runtime rows');
assert.ok(MOUNTAIN_GOATS_RARE_TITLES.every(text => !/\bis a Mountain Goats recording\.?$/i.test(text)), 'rare music pool still contains recording boilerplate');

assert.ok(DIRTY_FLAVOR_LANES.background.some(text => /census|GeoNames|Unicode character name data|Weather observations/i.test(text)), 'background lane lost weak metadata texture');
assert.ok(DIRTY_FLAVOR_LANES.storefront.every(text => text.length <= 64), 'storefront labels must stay sign-sized');
assert.ok(DIRTY_FLAVOR_LANES.technical.some(text => /RFC|CISA|protocol|vulnerability|service bulletin/i.test(text)), 'technical lane lacks technical signal');
assert.ok(DIRTY_FLAVOR_LANES.institutional.some(text => /facility|Airport|recorded|system|legal|water/i.test(text)), 'institutional lane lacks civic/registry signal');
assert.ok(DIRTY_FLAVOR_LANES.spectacle.every(text => !/census|Unicode character name data|recorded population|stationary facility|facility registry|populated place index|small airport|heliport|RFC \d+ is titled|pharmaceutical product|supplied as/i.test(text)), 'weak registry metadata escaped onto spectacle surfaces');
assert.ok(DIRTY_FLAVOR_LANES.spectacle.some(text => /CISA lists|vulnerability|crash|failure|recall|mine production|earthquake/i.test(text)), 'spectacle lane lacks high-signal material');

assert.equal(installDirtyFlavorSidecar(dirtyData), true);
const zeroRng = () => 0;
for (const [surface, lane] of Object.entries(expectedSurfaceLanes)) {
    if (surface === 'flyer') continue; // zero triggers the intentionally rare music branch.
    const [title, subtitle] = pickDirtyFlavorPairForSurface(zeroRng, surface);
    assert.ok(DIRTY_FLAVOR_LANES[lane].includes(title), `${surface} title did not come from ${lane}`);
    assert.ok(DIRTY_FLAVOR_LANES[lane].includes(subtitle), `${surface} subtitle did not come from ${lane}`);
}

let rareIndex = 0;
const rareRngValues = [0, 0, 0];
const rareRng = () => rareRngValues[rareIndex++ % rareRngValues.length];
const [rareTitle, rareSubtitle] = pickDirtyFlavorPairForSurface(rareRng, 'flyer');
assert.ok(MOUNTAIN_GOATS_RARE_TITLES.includes(rareTitle), 'rare flyer branch should draw title-only Mountain Goats metadata');
assert.ok(DIRTY_FLAVOR_LANES.flyer.includes(rareSubtitle), 'rare music title must be paired with ordinary flyer context');

console.log('[dirty-flavor-runtime-selftest] PASS', {
    ordinaryRuntimeRows: ordinary.length,
    rareMountainGoatsTitles: MOUNTAIN_GOATS_RARE_TITLES.length,
    excludedWpaPosterDescriptions: DIRTY_FLAVOR_META.excludedWpaPosterDescriptions,
    spectacleRows: DIRTY_FLAVOR_LANES.spectacle.length,
});
