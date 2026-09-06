#!/usr/bin/env node
// Compare two System Observatory R2 sweep snapshots without rebuilding either city.
import fs from 'node:fs';
import path from 'node:path';
function arg(name,fallback=null){const i=process.argv.indexOf(name); return i>=0&&i+1<process.argv.length?process.argv[i+1]:fallback;}
function load(value){if(!value) throw new Error('usage: --before <sweep.json|report-dir> --after <sweep.json|report-dir> [--out <dir>]'); const p=path.resolve(value); const file=fs.statSync(p).isDirectory()?path.join(p,'sweep.json'):p; return {file,data:JSON.parse(fs.readFileSync(file,'utf8'))};}
const before=load(arg('--before')), after=load(arg('--after')); const out=path.resolve(arg('--out',path.join(path.dirname(after.file),'comparison'))); fs.mkdirSync(out,{recursive:true});
const metricDefs=[
 ['built chunks',s=>s.totals?.chunks??0,'count'],['build failures',s=>s.failures?.length??0,'count'],['tower-transfer failures',s=>s.transferFailures??0,'count'],
 ['median module occupancy',s=>(s.macro?.unionOccupancyMedian??0)*100,'percent'],['median vertical interlock',s=>(s.macro?.interlockShareMedian??0)*100,'percent'],
 ['bridge family/grammar conflicts',s=>s.bridgeGrammar?.suspensionOverlayConflicts??0,'count'],['triple bridge grammar stacks',s=>s.bridgeGrammar?.stackedLargeSystems??0,'count'],
 ['stair topology metadata missing',s=>s.stairRhythm?.missingTopologyMetadata??0,'count'],['stair guard primitives/story',s=>s.stairRhythm?.guardPrimitivesPerOwnedStory??0,'ratio'],
 ['unbound portal apertures',s=>s.totals?.unboundPortalApertures??0,'count'],['orphan reservations',s=>s.totals?.orphanReservations??0,'count'],['hard connectivity failures',s=>s.totals?.hardConnectivityFailures??0,'count'],
];
const rows=metricDefs.map(([name,fn,kind])=>{const a=Number(fn(before.data))||0,b=Number(fn(after.data))||0; return {name,kind,before:a,after:b,delta:b-a,relativeDelta:a?((b-a)/Math.abs(a)):null};});
const fmt=(v,kind)=>kind==='percent'?`${v.toFixed(1)}%`:kind==='ratio'?v.toFixed(2):Math.round(v).toLocaleString();
const lines=['# JWEB System Observatory R2 comparison','',`Before: \`${before.file}\``,`After: \`${after.file}\``,'','| metric | before | after | delta |','|---|---:|---:|---:|'];
for(const r of rows) lines.push(`| ${r.name} | ${fmt(r.before,r.kind)} | ${fmt(r.after,r.kind)} | ${r.delta>=0?'+':''}${fmt(r.delta,r.kind)} |`);
fs.writeFileSync(path.join(out,'COMPARISON.md'),lines.join('\n')+'\n'); fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({schema:'jweb.system-observatory-comparison.v1',before:before.file,after:after.file,rows},null,2));
const width=1500,rowH=48,height=110+rows.length*rowH,esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#080b10"/><style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#eef2fb}.title{font-size:24px;font-weight:800}.h{font-size:12px;fill:#8d98aa}.n{font-size:13px}.d{font-size:13px;font-weight:700}</style><text x="30" y="38" class="title">System Observatory comparison</text><text x="30" y="62" class="h">Cached sweep-to-sweep metrics; no city rebuild required.</text><text x="620" y="92" class="h">BEFORE</text><text x="850" y="92" class="h">AFTER</text><text x="1090" y="92" class="h">DELTA</text>`;
rows.forEach((r,i)=>{const y=110+i*rowH; const deltaText=`${r.delta>=0?'+':''}${fmt(r.delta,r.kind)}`; svg+=`<text x="30" y="${y+28}" class="n">${esc(r.name)}</text><text x="620" y="${y+28}" class="n">${fmt(r.before,r.kind)}</text><text x="850" y="${y+28}" class="n">${fmt(r.after,r.kind)}</text><text x="1090" y="${y+28}" class="d">${deltaText}</text><line x1="30" y1="${y+42}" x2="1450" y2="${y+42}" stroke="#1e2938"/>`;}); svg+='</svg>'; fs.writeFileSync(path.join(out,'comparison.svg'),svg);
console.log(JSON.stringify({pass:true,out,rows},null,2));
