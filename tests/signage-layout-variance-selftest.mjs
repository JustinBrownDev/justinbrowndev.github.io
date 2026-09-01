import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveDisplayRecipe } from '../content/sign-visual-language.js';
import { renderDisplayCanvas } from '../systems/sign-display-renderer.js';

function recordingContext() {
    const ops = [];
    const ctx = new Proxy({
        ops,
        globalAlpha: 1,
        lineWidth: 1,
        font: '',
        fillStyle: '',
        strokeStyle: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, strokeRect() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
        fillText(...args) { ops.push(['fillText', this.font, ...args]); },
        measureText(value) {
            const match = String(this.font).match(/([0-9.]+)px/);
            const px = match ? Number(match[1]) : 10;
            return { width: String(value).length * px * 0.56 };
        },
    }, { set(target, prop, value) { target[prop] = value; return true; } });
    return ctx;
}

const recipe = resolveDisplayRecipe({ campaignKey: 'cut4:test', surfaceKind: 'blade-sign', program: 'retail' });
const ctx = recordingContext();
renderDisplayCanvas(ctx, 640, 256, { recipe, title: 'GO', subtitle: 'ONE LINE PLEASE', family: 'LOCAL' });
const textOps = ctx.ops.filter(op => op[0] === 'fillText');
assert.ok(textOps.length >= 2, 'display should render text');
assert.ok(textOps.every(op => op.length === 5), 'Canvas fillText must not use maxWidth glyph compression');

const renderer = fs.readFileSync(new URL('../systems/sign-display-renderer.js', import.meta.url), 'utf8');
assert.match(renderer, /singleLineEllipsis/);
assert.match(renderer, /textValue\.length <= 12 \? 1\.26/);
assert.doesNotMatch(renderer, /fillText\(textValue, x, y, maxWidth\)/);

const signage = fs.readFileSync(new URL('../world/signage.js', import.meta.url), 'utf8');
assert.match(signage, /pickWeightedSignShape/);
assert.match(signage, /rng\(\) < 0\.82/);
assert.match(signage, /textureScale = Math\.max\(3, 384/);

const semantic = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
assert.match(semantic, /occurrenceProbability/);
assert.match(semantic, /verticalRoll/);
assert.match(semantic, /usableSignHeight/);
assert.doesNotMatch(semantic, /surface\.yMin \+ 2\.3 \+ index \* 0\.7/);

const authority = fs.readFileSync(new URL('../world/exterior-composition-authority.js', import.meta.url), 'utf8');
assert.match(authority, /routeCornerMediaMembers/);
assert.match(authority, /cornerTurn/);
assert.match(authority, /reverseU/);
assert.match(authority, /seamAligned/);

const field = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
assert.match(field, /alignCornerMediaSegments/);
assert.match(field, /lineIntersection2D/);
assert.match(field, /reverseU \? u1 - localU \* span/);
assert.match(field, /seamAligned \? 1 : 0\.94/);

console.log('signage-layout-variance-selftest: ok');
