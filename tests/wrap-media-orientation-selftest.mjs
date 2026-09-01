import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachSpectacleMedia } from '../world/exterior-composition-authority.js';

// A north/east convex corner is the regression case that previously produced
// reverseU=true on both faces: geometrically continuous, visually mirrored.
const north = {
    shape: 'box', assemblyId: 'hero:corner', assemblyKind: 'corner-megascreen',
    side: 'north', surfaceId: 'hero:north', semanticOpportunityId: 'hero:corner-media',
    x: 2.274, y: 4, z: -4.17, sx: 4, sy: 3, sz: 0.16, rotY: 0,
};
const east = {
    shape: 'box', assemblyId: 'hero:corner', assemblyKind: 'corner-megascreen',
    side: 'east', surfaceId: 'hero:east', semanticOpportunityId: 'hero:corner-media',
    x: 4.17, y: 4, z: -2.274, sx: 4, sy: 3, sz: 0.16, rotY: -Math.PI * 0.5,
};
const task = {
    kind: 'exterior-prop-field', entityId: 'hero', exteriorVisualTier: 'spectacle', seed: 7,
    fieldPlan: { placements: [north, east] },
};
const result = attachSpectacleMedia({ chunk: { key: '0,0' }, tasks: [task] });
assert.equal(result.assemblies, 1);
assert.equal(result.surfaces, 2);
assert.equal(east.mediaSegment.index, 0, 'east face should route first so its hi edge reaches the seam');
assert.equal(north.mediaSegment.index, 1, 'north face should route second so its lo edge leaves the seam');
assert.equal(east.mediaSegment.seamEdge, 'hi');
assert.equal(north.mediaSegment.seamEdge, 'lo');
assert.equal(east.mediaSegment.reverseU, false, 'first wrap face must stay readable');
assert.equal(north.mediaSegment.reverseU, false, 'second wrap face must stay readable');
assert.equal(east.mediaSegment.seamAligned, true);
assert.equal(north.mediaSegment.seamAligned, true);
assert.ok(Math.abs(east.mediaSegment.u1 - north.mediaSegment.u0) < 1e-12, 'master texture must meet at one U seam');

const fieldSource = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
assert.match(fieldSource, /side: THREE\.FrontSide/);
assert.match(fieldSource, /polygonOffset: true/);
assert.match(fieldSource, /const mediaSeamEdge/);
assert.match(fieldSource, /const backingTrim/);
assert.match(fieldSource, /item\.sz \* 0\.5 \+ MEDIA_FACE_GAP/);

const authoritySource = fs.readFileSync(new URL('../world/exterior-composition-authority.js', import.meta.url), 'utf8');
assert.match(authoritySource, /canonicalReadableRoute/);
assert.match(authoritySource, /seamEdge: member\.seamEdge/);
assert.match(authoritySource, /reverseU: false/);

console.log('wrap-media-orientation-selftest: ok');
