import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');

const freezeStart = source.indexOf('function freezeObject(object)');
const freezeEnd = source.indexOf('\n}\n', freezeStart) + 2;
assert.ok(freezeStart >= 0 && freezeEnd > freezeStart, 'freezeObject helper must exist');
const freezeBlock = source.slice(freezeStart, freezeEnd);
assert.match(freezeBlock, /object\.updateMatrix\?\.\(\)/, 'freeze must update the new node local matrix');
assert.match(freezeBlock, /object\.updateMatrixWorld\?\.\(true\)/, 'freeze must update the new node world matrix');
assert.match(freezeBlock, /object\.matrixAutoUpdate = false/, 'freeze must still disable local auto-updates');

const applyStart = source.indexOf('function applyTask(');
const applyEnd = source.indexOf('function hasPending(', applyStart);
assert.ok(applyStart >= 0 && applyEnd > applyStart, 'applyTask boundary must exist');
const applyBlock = source.slice(applyStart, applyEnd);
assert.match(applyBlock, /payload\.detailRoot\.add\(object\);/, 'new detail object must still publish to the chunk root');
assert.match(applyBlock, /object\.traverse\?\.\(freezeObject\);/, 'new detail subtree must be frozen after publication');
assert.doesNotMatch(applyBlock, /freezeObject\(object\);/, 'Object3D.traverse already includes the root; duplicate root freeze must stay removed');
assert.doesNotMatch(applyBlock, /payload\.detailRoot\.updateMatrixWorld\(true\)/, 'a single detail publication must not re-walk the accumulated chunk detail tree');
assert.match(applyBlock, /payload\.refinement\.lastKind = task\.kind;/, 'publication bookkeeping must remain intact');

// Density stays exactly where Cut 9 left it. This cut buys headroom; it does not
// quietly change visible population while measuring the effect.
assert.match(source, /pipe: 65/);
assert.match(source, /'spray-cans': 40/);
assert.match(source, /'overhead-cable': 30/);

console.log('detail-publication-freeze-selftest: ok');
