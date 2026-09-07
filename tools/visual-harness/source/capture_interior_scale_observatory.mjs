#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };
const repo = path.resolve(arg('--repo', process.cwd()));
const seed = Number(arg('--seed', 671278205)) | 0;
const chunkText = arg('--chunks', '0,0;4,3;8,8;-9,4');
const out = path.resolve(arg('--out', path.join(process.cwd(), 'interior-scale-observatory.json')));
const chunks = chunkText.split(';').map(v => v.trim()).filter(Boolean).map(v => { const [x,z]=v.split(',').map(Number); return {x,z,key:`${x},${z}`}; });

const quietLog = console.log;
const quietWarn = console.warn;
if (!argv.includes('--verbose')) { console.log = () => {}; console.warn = () => {}; }
const THREE = await import(pathToFileURL(path.join(repo, 'vendor/three/three.module.js')));
const { createKowloonFabricEngine } = await import(pathToFileURL(path.join(repo, 'kowloon-fabric-engine.js')));
const { deterministicChunkSeed, worldWeirdnessAt } = await import(pathToFileURL(path.join(repo, 'world-contract.js')));

function percentile(values, p) {
  if (!values.length) return null;
  const a = [...values].sort((x,y)=>x-y);
  const pos = (a.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos), t = pos - lo;
  return a[lo] * (1-t) + a[hi] * t;
}
function stats(values) {
  const a = values.filter(Number.isFinite);
  if (!a.length) return { count:0, min:null, p10:null, median:null, p90:null, max:null };
  return { count:a.length, min:Math.min(...a), p10:percentile(a,.1), median:percentile(a,.5), p90:percentile(a,.9), max:Math.max(...a) };
}
function roundedStats(values) {
  const s=stats(values); for (const k of ['min','p10','median','p90','max']) if (s[k]!=null) s[k]=Math.round(s[k]*100)/100; return s;
}
function graphDiameter(floor) {
  const spaces = floor.spaces ?? [];
  if (spaces.length < 2) return spaces.length ? 0 : null;
  const adj = new Map(spaces.map(s=>[s.key,[]]));
  for (const e of floor.edges ?? []) { if (adj.has(e.a) && adj.has(e.b)) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); } }
  let diameter = 0;
  for (const s of spaces) {
    const d=new Map([[s.key,0]]), q=[s.key];
    while(q.length){const a=q.shift(); for(const b of adj.get(a)??[]){if(!d.has(b)){d.set(b,d.get(a)+1);q.push(b);}}}
    if (d.size !== spaces.length) return null;
    diameter=Math.max(diameter,...d.values());
  }
  return diameter;
}
function roomArea(room){ return Number(room.area) || Math.max(0,Number(room.maxX)-Number(room.minX))*Math.max(0,Number(room.maxZ)-Number(room.minZ)); }
function roomShort(room){ return Number(room.shortDimension) || Math.min(Math.max(0,Number(room.maxX)-Number(room.minX)),Math.max(0,Number(room.maxZ)-Number(room.minZ))); }
function inc(obj,key){key=String(key??'unknown');obj[key]=(obj[key]??0)+1;}

const scene = new THREE.Scene();
const playerPhysics={registerOwnedWorld(){return {activationState:'active'};},unregisterOwnedWorld(){return true;}};
const engine=createKowloonFabricEngine({THREE,scene,playerPhysics,directSceneAdd:scene.add.bind(scene),worldSeed:seed,chunkSize:64,landmarkSpacingChunks:3,yieldControl:null});
const unitAreas=[],unitShorts=[],nestedAreas=[],nestedShorts=[],floorDiameters=[],corridorLongSpans=[],corridorAreas=[];
const morphologyCounts={};
const chunkRows=[];
let apartmentBuildings=0, apartmentFloors=0, units=0, nestedUnits=0, adaptableUnits=0, crampedSpaces=0, sharedDestinationFloors=0;
for(const c of chunks){
  const chunk={...c,centerX:c.x*64,centerZ:c.z*64,seed:deterministicChunkSeed(seed,c.x,c.z),weirdness:worldWeirdnessAt(c.x,c.z,{worldSeed:seed,startRadius:1.5,fullRadius:36,curve:1.3})};
  const payload=await engine.build(chunk);
  let localBuildings=0,localFloors=0,localUnits=0;
  for(const entity of payload.entities??[]){
    const plan=entity.buildingPlan;
    if(!plan || plan.programArchitecture?.id!=='apartment') continue;
    apartmentBuildings++; localBuildings++; inc(morphologyCounts,plan.grammar?.id);
    for(const floor of plan.floors??[]){
      apartmentFloors++; localFloors++;
      const diameter=graphDiameter(floor); if(Number.isFinite(diameter)) floorDiameters.push(diameter);
      if((floor.spaces??[]).some(s=>s.role==='shared' && s.functionalFixture)) sharedDestinationFloors++;
      crampedSpaces += (floor.spaces??[]).filter(s=>!['entry','circulation'].includes(s.role) && s.shortDimensionHealthy===false).length;
      for(const s of floor.spaces??[]){
        if(s.role==='circulation'){ corridorLongSpans.push(Math.max(Number(s.realizedWidth)||0,Number(s.realizedDepth)||0)); corridorAreas.push(Number(s.realizedArea)||0); }
        if(s.templateKey!=='dwelling-unit') continue;
        units++; localUnits++; unitAreas.push(Number(s.realizedArea)||0); unitShorts.push(Number(s.realizedShortDimension)||0);
        if(s.unitPlan?.rooms?.length){ nestedUnits++; for(const r of s.unitPlan.rooms){nestedAreas.push(roomArea(r));nestedShorts.push(roomShort(r));} }
        else adaptableUnits++;
      }
    }
  }
  chunkRows.push({chunk:c.key,apartmentBuildings:localBuildings,apartmentFloors:localFloors,dwellingUnits:localUnits});
}
const report={
  schema:'jweb.interior-scale-observatory.v1', seed, chunks:chunkRows,
  counts:{apartmentBuildings,apartmentFloors,dwellingUnits:units,nestedDwellingUnits:nestedUnits,adaptableDwellingUnits:adaptableUnits,crampedDestinationSpaces:crampedSpaces,sharedDestinationFloors},
  morphologyCounts,
  metrics:{
    dwellingUnitAreaM2:roundedStats(unitAreas),
    dwellingUnitShortDimensionM:roundedStats(unitShorts),
    nestedRoomAreaM2:roundedStats(nestedAreas),
    nestedRoomShortDimensionM:roundedStats(nestedShorts),
    floorGraphDiameterHops:roundedStats(floorDiameters),
    circulationLongSpanM:roundedStats(corridorLongSpans),
    circulationAreaM2:roundedStats(corridorAreas),
  },
};
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log=quietLog; console.warn=quietWarn;
console.log(JSON.stringify(report,null,2));
