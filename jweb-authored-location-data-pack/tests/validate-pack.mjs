import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('manifest.json');
for (const rel of manifest.contents.filter(x=>x.endsWith('.json'))) {
  const full=path.join(root,rel);
  if (!fs.existsSync(full)) throw new Error(`missing ${rel}`);
  read(rel);
}
const assets=read('assets/spawnpoint-asset-families.json');
const familyIds=new Set();
const variantIds=new Set();
for (const family of assets.families) {
  if (familyIds.has(family.id)) throw new Error(`duplicate family ${family.id}`);
  familyIds.add(family.id);
  for (const variant of family.variants) {
    if (variantIds.has(variant.id)) throw new Error(`duplicate variant ${variant.id}`);
    variantIds.add(variant.id);
    if (!assets.constructionRecipes[variant.constructionRecipe]) throw new Error(`unknown construction recipe ${variant.constructionRecipe} for ${variant.id}`);
    if (!Array.isArray(variant.dimensionsM) || variant.dimensionsM.length !== 3 || variant.dimensionsM.some(n=>!(n>0))) throw new Error(`bad dimensions ${variant.id}`);
  }
}
const spawn=read('locations/spawn-rooftop-reality-leak.json');
for (const slot of spawn.compositionSlots) for (const id of slot.families) if (!familyIds.has(id)) throw new Error(`spawn slot references unknown family ${id}`);
if (spawn.hardInvariants.length < 8) throw new Error('spawn emotional grammar is under-specified');
if (!spawn.progressiveRealization.some(p=>p.id==='structural-safe'&&p.mustExistBeforePlay)) throw new Error('spawn lacks structural-safe phase');
const reg=read('locations/location-registry.json');
if (!reg.singular.includes(spawn.id)) throw new Error('spawn missing from registry');
console.log(`OK authored-location pack: ${assets.families.length} asset families, ${variantIds.size} authored variants, ${reg.singular.length} singular locations`);
