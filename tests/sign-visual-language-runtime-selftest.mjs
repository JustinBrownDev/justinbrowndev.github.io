import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    classifyDisplayFamily,
    recipeContextFromSemanticMedia,
    resolveDisplayRecipe,
} from '../content/sign-visual-language.js';
import { renderDisplayCanvas } from '../systems/sign-display-renderer.js';

const contexts = {
    market: { campaignKey: 'market:tea', districtFamily: 'geographic market', program: 'retail restaurant', frontageRole: 'storefront', surfaceKind: 'blade-sign' },
    service: { campaignKey: 'service:compressor', districtFamily: 'network', program: 'mechanical service utility', publicRole: 'service', surfaceKind: 'blade-sign' },
    public: { campaignKey: 'public:route', districtFamily: 'transport', program: 'institutional public', publicRole: 'public', surfaceKind: 'blade-sign' },
    spectacle: { campaignKey: 'spectacle:night', program: 'entertainment broadcast', landmark: true, surfaceKind: 'corner-megascreen' },
};

const recipes = Object.fromEntries(Object.entries(contexts).map(([key, value]) => [key, resolveDisplayRecipe(value)]));
assert.deepEqual(resolveDisplayRecipe(contexts.market), recipes.market, 'same semantic input must resolve deterministically');
assert.equal(classifyDisplayFamily(contexts.market), 'market-retail');
assert.equal(classifyDisplayFamily(contexts.service), 'service-mechanical');
assert.equal(classifyDisplayFamily(contexts.public), 'public-transport');
assert.equal(classifyDisplayFamily(contexts.spectacle), 'spectacle');
assert.equal(recipes.market.family, 'market-retail');
assert.equal(recipes.service.family, 'service-mechanical');
assert.equal(recipes.public.family, 'public-transport');
assert.equal(recipes.spectacle.family, 'spectacle');
assert.equal(new Set(Object.values(recipes).map(recipe => recipe.layout)).size, 4, 'reference contexts must be structurally distinct');
assert.equal(new Set(Object.values(recipes).map(recipe => JSON.stringify(recipe.structure.slots))).size, 4, 'reference contexts must expose distinct slot structures');

const marketMega = resolveDisplayRecipe({ ...contexts.market, surfaceKind: 'corner-megascreen' });
assert.equal(marketMega.family, recipes.market.family, 'surface manifestation must not erase campaign semantic family');
assert.deepEqual(marketMega.palette, recipes.market.palette, 'campaign palette must remain stable across surfaces');
assert.match(marketMega.layout, /^spectacle-/, 'megascreen surface must use a spectacle-scale manifestation');

const mediaContext = recipeContextFromSemanticMedia({
    campaignKey: 'building-9:frontage', campaignSeed: 12345, entityId: 'building-9',
    semanticProgram: 'institutional public', districtFamily: 'transport', frontageRole: 'public-entry',
    publicRole: 'public', assemblyKind: 'corner-megascreen', assemblyId: 'building-9:corner', family: 'institutional',
}, { assemblyKind: 'corner-megascreen' });
const mediaRecipe = resolveDisplayRecipe(mediaContext);
assert.equal(mediaRecipe.seed, 12345, 'semantic media campaignSeed must be preserved');
assert.equal(mediaRecipe.surfaceKind, 'corner-megascreen');

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
        save() { ops.push(['save']); }, restore() { ops.push(['restore']); }, beginPath() { ops.push(['beginPath']); },
        rect(...args) { ops.push(['rect', ...args]); }, clip() { ops.push(['clip']); }, fillRect(...args) { ops.push(['fillRect', ...args]); },
        strokeRect(...args) { ops.push(['strokeRect', ...args]); }, moveTo(...args) { ops.push(['moveTo', ...args]); }, lineTo(...args) { ops.push(['lineTo', ...args]); },
        stroke() { ops.push(['stroke']); }, arc(...args) { ops.push(['arc', ...args]); }, fill() { ops.push(['fill']); },
        fillText(...args) { ops.push(['fillText', ...args]); }, measureText(value) { return { width: String(value).length * 9 }; },
    }, { set(target, prop, value) { target[prop] = value; if (['fillStyle','strokeStyle','font','lineWidth'].includes(String(prop))) ops.push(['set', prop, value]); return true; } });
    return ctx;
}

const operationShapes = [];
for (const recipe of Object.values(recipes)) {
    const ctx = recordingContext();
    const result = renderDisplayCanvas(ctx, 640, 256, { recipe, title: 'PRIMARY', subtitle: 'SECONDARY', family: recipe.family, value: '88' });
    assert.equal(result.layout, recipe.layout);
    operationShapes.push(JSON.stringify(ctx.ops));
}
assert.equal(new Set(operationShapes).size, 4, 'render paths must be visibly/structurally different, not palette-only variants');

const fieldSource = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
assert.match(fieldSource, /createMediaSegmentGeometry/);
assert.match(fieldSource, /uv\.setX\(/);
assert.match(fieldSource, /new THREE\.Mesh\(segmentGeometry, material\)/);
assert.match(fieldSource, /detailResources\?\.geometries/);
const enrichSource = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
assert.match(enrichSource, /recipeContextFromExteriorTask/);
assert.match(enrichSource, /renderDisplayCanvas/);
const authoredSource = fs.readFileSync(new URL('../world/signage.js', import.meta.url), 'utf8');
assert.match(authoredSource, /resolveDisplayRecipe/);
assert.match(authoredSource, /renderDisplayCanvas/);
const rendererSource = fs.readFileSync(new URL('../systems/sign-display-renderer.js', import.meta.url), 'utf8');
assert.doesNotMatch(rendererSource, /requestAnimationFrame|setAnimationLoop|setInterval/);

console.log('sign-visual-language-runtime-selftest: ok');
