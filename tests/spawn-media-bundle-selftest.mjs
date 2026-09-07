import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeSpawnFlavorOverride,
  readSpawnFlavorOverride,
  forcedHostArchetypeForSpawnFlavor,
  readSpawnMediaOverride,
  createSpawnComposition,
} from '../world/spawn-location-runtime.js';

assert.equal(normalizeSpawnFlavorOverride('terra'), 'terra-backroom');
assert.equal(normalizeSpawnFlavorOverride('giga'), 'giga-shopfront');
assert.equal(normalizeSpawnFlavorOverride('mega'), 'mega-big-shelter');
assert.equal(normalizeSpawnFlavorOverride('radio'), 'radio-roof');
assert.equal(readSpawnFlavorOverride('?spawnFlavor=terra'), 'terra-backroom');
assert.equal(forcedHostArchetypeForSpawnFlavor('terra'), 'deep-backroom');
assert.equal(forcedHostArchetypeForSpawnFlavor('giga'), 'hanging-storefront');
assert.equal(readSpawnMediaOverride('?spawnMedia=cartoons'), 'linear-cartoons.blender-open-movies');
assert.equal(readSpawnMediaOverride('?spawnMedia=news'), 'live-news.al-jazeera-english');
assert.equal(readSpawnMediaOverride('?spawnMedia=dvids'), 'live-public-affairs.dvids');

const variant = (id, tags=['cheap']) => ({id, label:id, dimensionsM:[0.8,0.6,0.3], constructionRecipe:'flat-screen', tags, weight:1, placement:{mount:'surface'}});
const runtime = {
  location: {id:'spawn', microstories:[], hardInvariants:[], mediaIntent:null},
  familyById: new Map([
    ['spawn.media.television', {variants:[variant('tv')] }],
    ['spawn.media.radio', {variants:[variant('radio',['radio'])] }],
    ['support', {variants:[variant('support')] }],
    ['seat', {variants:[variant('seat')] }],
  ]),
  slots: [
    {slot:'primary-tv', count:[1,1], families:['spawn.media.television','spawn.media.radio']},
    {slot:'tv-support', count:[1,1], families:['support']},
    {slot:'seating', count:[2,4], families:['seat']},
  ],
};
const host = {hostArchetype:'exposed-roof', supportAreaM2:20, largestSupportPatchAreaM2:20, maxWallSpanM:10, overheadCovered:false, nearbyWalls:[]};
const a = createSpawnComposition(runtime, 'same-key', host);
const b = createSpawnComposition(runtime, 'same-key', host);
assert.equal(a.startProfile.id, b.startProfile.id);
assert.equal(a.media.sourceKey, b.media.sourceKey, 'media mapping must be deterministic for the same place');
assert.ok(['live-news.al-jazeera-english','linear-cartoons.blender-open-movies','live-public-affairs.dvids'].includes(a.media.sourceKey));

const spawnSource = fs.readFileSync(new URL('../world/spawn-location-runtime.js', import.meta.url), 'utf8');
assert.match(spawnSource, /SPAWN_MEDIA_POOLS[\s\S]*live-public-affairs\.dvids/, 'DVIDS must be present in spawn RNG pools');

const screenSource = fs.readFileSync(new URL('../world/screen-media-runtime.js', import.meta.url), 'utf8');
assert.match(screenSource, /resolveJwebMediaChannel/);
assert.match(screenSource, /stream\.transport === 'hls'/);
assert.match(screenSource, /attachDeferredChannelPackMedia/);
assert.match(screenSource, /DEFAULT_HLS_JS_URL/);

console.log('[spawn-media-bundle-selftest] PASS', { profile: a.startProfile.id, media: a.media.sourceKey });
