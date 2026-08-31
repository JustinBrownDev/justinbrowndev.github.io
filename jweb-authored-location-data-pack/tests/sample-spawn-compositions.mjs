import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const assets=JSON.parse(fs.readFileSync(path.join(root,'assets/spawnpoint-asset-families.json'),'utf8'));
const spawn=JSON.parse(fs.readFileSync(path.join(root,'locations/spawn-rooftop-reality-leak.json'),'utf8'));
const byFamily=new Map(assets.families.map(f=>[f.id,f]));
function hash(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function pick(r,f){return f.variants[Math.floor(r()*f.variants.length)%f.variants.length]}
function choose(seed){
 const r=rng(hash(seed));
 const story=spawn.microstories[Math.floor(r()*spawn.microstories.length)%spawn.microstories.length];
 const one=id=>pick(r,byFamily.get(id));
 const n=(id,lo,hi)=>{const out=[];const pool=[...byFamily.get(id).variants];const count=lo+Math.floor(r()*(hi-lo+1));for(let i=0;i<count&&pool.length;i++){out.push(pool.splice(Math.floor(r()*pool.length)%pool.length,1)[0])}return out};
 const selected={
  tv:one('spawn.media.television'),support:one('spawn.support.tv'),seating:n('spawn.seating',2,4),soft:n('spawn.soft-goods',0,2),
  drinks:n('spawn.drink-and-table-clutter',2,4),personal:n(r()<0.5?'spawn.personal-clutter':'spawn.small-electronics',2,4),
  light:one('spawn.lighting'),power:n('spawn.power-and-cables',1,3),utilities:n('spawn.roof-utilities',2,5),tube:one('spawn.vacuum-landmark'),plants:n('spawn.plants',0,1)
 };
 return {seed,story:story.id,identityBeats:spawn.hardInvariants.map(x=>x.beat),selected:Object.fromEntries(Object.entries(selected).map(([k,val])=>[k,Array.isArray(val)?val.map(x=>x.id):val.id]))};
}
const samples=Array.from({length:12},(_,i)=>choose(`spearhead-${i+1}`));
const signatures=samples.map(s=>JSON.stringify([s.selected.tv,s.selected.support,s.selected.seating,s.selected.tube,s.story]));
if(new Set(signatures).size!==samples.length) throw new Error('sample composition collapse: duplicate identity tuple');
fs.writeFileSync(path.join(root,'SAMPLE-SPAWN-COMPOSITIONS.json'),JSON.stringify({schema:'jweb.spawn-composition-samples.v1',note:'Dry-run content selections only. Not runtime placement.',samples},null,2)+'\n');
console.log(`OK ${samples.length} unique spawn composition dry-runs`);
for(const s of samples.slice(0,6)) console.log(`${s.seed}: ${s.story} | ${s.selected.tv} | ${s.selected.support} | seats=${s.selected.seating.join(',')} | ${s.selected.tube}`);
