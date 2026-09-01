import assert from 'node:assert/strict';
import {
  deriveDisplayVectors,
  normalizeDisplaySurface,
  recipeContextFromSemanticMedia,
  resolveDisplayRecipe,
} from '../content/sign-visual-language.js';

const market = {
  campaignKey: 'district-7:storefront:tea',
  districtFamily: 'geographic market',
  blockRole: 'pedestrian commercial corridor',
  program: 'retail restaurant',
  frontageRole: 'storefront public-entry',
  surfaceKind: 'facade-sign',
};
const a = resolveDisplayRecipe(market);
const b = resolveDisplayRecipe(market);
assert.deepEqual(a, b, 'same semantic/campaign input must be deterministic');
assert.ok(a.vectors.commerce > .7, 'retail/market context should strongly bias commerce');
assert.ok(a.vectors.human > .6, 'retail/market context should bias human voice');
assert.equal(a.dialect, 'market-blast', 'reference market context should resolve to the supplied market dialect');

const sameCampaignPoster = resolveDisplayRecipe({ ...market, surfaceKind: 'poster' });
const sameCampaignMega = resolveDisplayRecipe({ ...market, surfaceKind: 'facade-megascreen' });
assert.equal(sameCampaignPoster.dialect, sameCampaignMega.dialect, 'one campaign must keep one dialect across surfaces');
assert.deepEqual(sameCampaignPoster.palette, sameCampaignMega.palette, 'one campaign must keep one palette across surfaces');
assert.notEqual(sameCampaignPoster.surfaceKind, sameCampaignMega.surfaceKind);

const service = resolveDisplayRecipe({
  campaignKey: 'building-4:service',
  districtFamily: 'network',
  program: 'mechanical service utility',
  frontageRole: 'service',
  surfaceKind: 'facade-sign',
});
assert.ok(service.vectors.machine > a.vectors.machine, 'service/network identity should be more machine-like than market identity');
assert.notEqual(service.dialect, a.dialect, 'network/mechanical service should not collapse into the market dialect');

const spectacle = resolveDisplayRecipe({
  ...market,
  surfaceKind: 'corner-megascreen',
  landmark: true,
});
assert.ok(spectacle.vectors.spectacle > a.vectors.spectacle, 'corner megascreen + landmark must raise spectacle');

assert.equal(normalizeDisplaySurface('corner-media-band'), 'corner-megascreen');
assert.equal(normalizeDisplaySurface('facade-spectacle-span'), 'facade-megascreen');

const mediaContext = recipeContextFromSemanticMedia({
  campaignKey: 'building-9:frontage-campaign',
  campaignSeed: 12345,
  entityId: 'building-9',
  semanticProgram: 'institutional public',
  districtFamily: 'transport',
  frontageRole: 'public-entry',
  publicRole: 'public',
  assemblyKind: 'corner-megascreen',
}, { assemblyKind: 'corner-megascreen' });
const mediaRecipe = resolveDisplayRecipe(mediaContext);
assert.equal(mediaRecipe.seed, 12345, 'live semantic media campaignSeed should be preserved');
assert.equal(mediaRecipe.surfaceKind, 'corner-megascreen');

const v = deriveDisplayVectors({ campaignKey: 'x', program: 'industrial mechanical', surfaceKind: 'facade-sign' });
for (const key of ['authority','commerce','machine','human','urgency','locality','spectacle','informationDensity']) {
  assert.ok(v[key] >= 0 && v[key] <= 1, `${key} must stay normalized`);
}

console.log('sign-visual-language-selftest: ok');
