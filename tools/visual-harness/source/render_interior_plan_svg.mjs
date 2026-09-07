#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const argv=process.argv.slice(2); const arg=(n,d=null)=>{const i=argv.indexOf(n);return i>=0&&i+1<argv.length?argv[i+1]:d;};
const repo=path.resolve(arg('--repo',process.cwd())); const seed=Number(arg('--seed',671278205))|0;
const [x,z]=arg('--chunk','4,3').split(',').map(Number); const floorNumber=Number(arg('--floor','0'))|0; const grammarMatch=arg('--grammar',null); const entityMatch=arg('--entity-match',null); const out=path.resolve(arg('--out','interior-plan.svg'));
const realLog=console.log,realWarn=console.warn; console.log=()=>{};console.warn=()=>{};
const THREE=await import(pathToFileURL(path.join(repo,'vendor/three/three.module.js'))); const {createKowloonFabricEngine}=await import(pathToFileURL(path.join(repo,'kowloon-fabric-engine.js'))); const {deterministicChunkSeed,worldWeirdnessAt}=await import(pathToFileURL(path.join(repo,'world-contract.js')));
const scene=new THREE.Scene(), pp={registerOwnedWorld(){return {activationState:'active'}},unregisterOwnedWorld(){return true}}; const engine=createKowloonFabricEngine({THREE,scene,playerPhysics:pp,directSceneAdd:scene.add.bind(scene),worldSeed:seed,chunkSize:64,landmarkSpacingChunks:3,yieldControl:null});
const payload=await engine.build({key:`${x},${z}`,x,z,centerX:x*64,centerZ:z*64,seed:deterministicChunkSeed(seed,x,z),weirdness:worldWeirdnessAt(x,z,{worldSeed:seed,startRadius:1.5,fullRadius:36,curve:1.3})}); console.log=realLog;console.warn=realWarn;
const entity=(payload.entities??[]).find(e=>e.buildingPlan && (!grammarMatch||e.buildingPlan.grammar?.id===grammarMatch) && (!entityMatch||String(e.id).includes(entityMatch)));
if(!entity) throw new Error('matching buildingPlan entity not found'); const plan=entity.buildingPlan; const floor=plan.floors?.find(f=>f.floor===floorNumber); if(!floor)throw new Error(`floor ${floorNumber} not found`);
const regs=floor.spaces.flatMap(s=>(s.regions??[]).map(r=>({...r,space:s}))); if(!regs.length)throw new Error('no regions');
const minX=Math.min(...regs.map(r=>r.minX)),maxX=Math.max(...regs.map(r=>r.maxX)),minZ=Math.min(...regs.map(r=>r.minZ)),maxZ=Math.max(...regs.map(r=>r.maxZ)); const spanX=maxX-minX,spanZ=maxZ-minZ;
const W=1600,H=1050,pad=90, header=90; const scale=Math.min((W-2*pad)/spanX,(H-header-2*pad)/spanZ); const sx=v=>pad+(v-minX)*scale, sy=v=>header+pad+(v-minZ)*scale;
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fill={entry:'#f4d7a1',circulation:'#b8d8ea',private:'#e8d7d7',shared:'#d8e9c4',service:'#d8d8d8',storage:'#c9c9c9',public:'#f5e3a7',work:'#d8cbea',program:'#c7dfcf'};
let body='';
// Semantic space territories.
for(const s of floor.spaces){for(const r of s.regions??[]){body+=`<rect x="${sx(r.minX)}" y="${sy(r.minZ)}" width="${(r.maxX-r.minX)*scale}" height="${(r.maxZ-r.minZ)*scale}" fill="${fill[s.role]??'#eeeeee'}" stroke="#111" stroke-width="2"/>`;}}
// Graph connections between semantic space centroids.
const byKey=new Map(floor.spaces.map(s=>[s.key,s])); for(const e of floor.edges??[]){const a=byKey.get(e.a),b=byKey.get(e.b);if(!a?.centroid||!b?.centroid)continue;body+=`<line x1="${sx(a.centroid.x)}" y1="${sy(a.centroid.z)}" x2="${sx(b.centroid.x)}" y2="${sy(b.centroid.z)}" stroke="#6b3f2f" stroke-width="4" stroke-dasharray="10 8" opacity="0.75"/>`;}
// Nested domestic partitions.
for(const s of floor.spaces){if(!s.unitPlan?.rooms?.length)continue;for(const r of s.unitPlan.rooms){body+=`<rect x="${sx(r.minX)}" y="${sy(r.minZ)}" width="${(r.maxX-r.minX)*scale}" height="${(r.maxZ-r.minZ)*scale}" fill="none" stroke="#3f2f2f" stroke-width="2.5" stroke-dasharray="6 4"/>`;body+=`<text x="${sx((r.minX+r.maxX)/2)}" y="${sy((r.minZ+r.maxZ)/2)}" font-size="${Math.max(12,Math.min(22,scale*.42))}" text-anchor="middle" dominant-baseline="middle" fill="#332222">${esc(r.key)}</text>`;}}
// Space labels.
for(const s of floor.spaces){if(!s.centroid)continue;const area=Number(s.realizedArea)||0; const short=Number(s.realizedShortDimension)||0; body+=`<g><rect x="${sx(s.centroid.x)-70}" y="${sy(s.centroid.z)-25}" width="140" height="50" rx="7" fill="#fff" opacity="0.82"/><text x="${sx(s.centroid.x)}" y="${sy(s.centroid.z)-5}" font-size="16" font-weight="700" text-anchor="middle">${esc(s.templateKey)}</text><text x="${sx(s.centroid.x)}" y="${sy(s.centroid.z)+15}" font-size="13" text-anchor="middle">${area.toFixed(0)} m² · short ${short.toFixed(1)} m</text></g>`;}
const title=`${plan.grammar?.id??'plan'} · ${plan.programArchitecture?.id??plan.buildingSemanticTruth?.program??''} · chunk ${x},${z} · floor ${floorNumber}`;
const subtitle=`${floor.spaces.length} spaces · graph edges ${(floor.edges??[]).length} · plate ${Number(floor.approximateArea||0).toFixed(0)} m² · ${entity.id}`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#faf9f5"/><text x="${pad}" y="42" font-family="Arial" font-size="28" font-weight="700">${esc(title)}</text><text x="${pad}" y="70" font-family="Arial" font-size="15" fill="#555">${esc(subtitle)}</text><g font-family="Arial">${body}</g></svg>`;
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,svg);console.log(out);
