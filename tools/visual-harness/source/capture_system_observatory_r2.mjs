#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AUDIT_LENSES,
  buildTriageTargets,
  analyzeChunkPayloadR2,
  buildSweepAnalysisR2,
  classifyBuildFailure,
  renderAttentionLedgerSvg,
  renderAuditLensMatrixSvg,
  renderAuditLensSvg,
  renderBridgeGrammarSvg,
  renderBuildingStacksSvg,
  renderChunkIndexHtmlR2,
  renderCodeIssueMapSvg,
  renderFindingsMarkdownR2,
  renderMacroAnatomySvg,
  renderMacroFieldSvg,
  renderModuleAtlasSvg,
  renderRuntimePipelineSvg,
  renderStairContractMatrixSvg,
  renderStairRhythmSvg,
  renderSweepIndexHtmlR2,
  renderSystemFingerprintSvg,
  renderSystemStorySvg,
  renderTriageTargetDeckSvg,
} from '../system-observatory-r2-core.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}
function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
function parseChunkText(text) {
  return String(text ?? '').split(/[;\s]+/).map(token => token.trim()).filter(Boolean).map(token => {
    const m = token.match(/^(-?\d+),(-?\d+)$/); if (!m) throw new Error(`invalid chunk coordinate: ${token}`);
    return { x: Number(m[1]), z: Number(m[2]) };
  });
}
function chunkListFromArgs() {
  const explicit = arg('--chunks');
  if (explicit) return parseChunkText(explicit);
  const auditSweep = arg('--audit-sweep');
  if (auditSweep) {
    const data = JSON.parse(fs.readFileSync(path.resolve(auditSweep), 'utf8'));
    const rows = Array.isArray(data) ? data : data.rows;
    if (!Array.isArray(rows)) throw new Error('--audit-sweep must point to JSON containing rows[] with x,z or chunk');
    const coords = rows.map(row => Number.isFinite(Number(row?.x)) && Number.isFinite(Number(row?.z)) ? { x:Number(row.x), z:Number(row.z) } : parseChunkText(row?.chunk ?? '')[0]).filter(Boolean);
    const limit = intArg('--limit', coords.length);
    return coords.slice(0, Math.max(1, limit));
  }
  const centerX = intArg('--center-x', 4), centerZ = intArg('--center-z', 3), radius = Math.max(0, intArg('--radius', 2));
  const coords=[]; for(let z=centerZ-radius;z<=centerZ+radius;z++) for(let x=centerX-radius;x<=centerX+radius;x++) coords.push({x,z});
  return coords;
}
function relImport(fromPath, spec) {
  if (!spec.startsWith('.')) return null;
  let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
  if (!path.posix.extname(resolved)) resolved += '.js';
  return resolved;
}
function scanIssueCode(repo) {
  const fileSet = new Set(AUDIT_LENSES.flatMap(lens => lens.files));
  const nodes = {};
  const importRe = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)["']([^"']+)["']/g;
  for (const rel of fileSet) {
    const abs=path.join(repo,rel), exists=fs.existsSync(abs), text=exists?fs.readFileSync(abs,'utf8'):'';
    const imports=[]; for(const match of text.matchAll(importRe)){const resolved=relImport(rel,match[1]); if(resolved) imports.push(resolved);}
    const schemas=[...text.matchAll(/(?:SCHEMA|schema|formatVersion)\s*[:=]\s*["'`]([^"'`]+)["'`]/g)].map(m=>m[1]).slice(0,6);
    const exports=[...text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)].map(m=>m[1]).slice(0,30);
    const intentMarkers=[...text.matchAll(/JWEB_INTENT:\s*([A-Z0-9_]+)/g)].map(m=>m[1]);
    nodes[rel]={exists,bytes:Buffer.byteLength(text),imports,exports,schemas,intentMarkers:[...new Set(intentMarkers)]};
  }
  return {generatedAt:new Date().toISOString(),lenses:AUDIT_LENSES,nodes};
}

function sourceFingerprint(repo) {
  const files=[];
  const visit=dir=>{if(!fs.existsSync(dir)) return; for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,entry.name); if(entry.isDirectory()) visit(abs); else if(entry.isFile()&&entry.name.endsWith('.js')) files.push(abs);}};
  visit(path.join(repo,'world'));
  for(const rel of ['kowloon-fabric-engine.js','world-contract.js']){const abs=path.join(repo,rel); if(fs.existsSync(abs)) files.push(abs);}
  files.sort(); const hash=crypto.createHash('sha256');
  for(const abs of files){hash.update(path.relative(repo,abs).replaceAll('\\','/')); hash.update('\0'); hash.update(fs.readFileSync(abs)); hash.update('\0');}
  return {algorithm:'sha256',hash:hash.digest('hex'),files:files.length};
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepo = path.resolve(here, '../../..');
const repo = path.resolve(arg('--repo', defaultRepo));
const out = path.resolve(arg('--out', path.join(repo, '.visual-probe-output', 'system-observatory-r2')));
const seed = intArg('--seed', 671278205);
const chunkSize = Math.max(16, intArg('--chunk-size', 64));
const landmarkSpacingChunks = Math.max(1, intArg('--landmark-spacing-chunks', 3));
const coords = chunkListFromArgs();
const resume = process.argv.includes('--resume');
const failOnBuildError = process.argv.includes('--fail-on-build-error');
for (const rel of ['vendor/three/three.module.js','kowloon-fabric-engine.js','world-contract.js']) if(!fs.existsSync(path.join(repo,rel))) throw new Error(`JWEB repo missing ${rel}: ${repo}`);
const sourceIdentity=sourceFingerprint(repo);
const progressPath=path.join(out,'progress.json');
if(resume){
  const unsafe=process.argv.includes('--resume-unsafe');
  if(!fs.existsSync(progressPath) && !unsafe) throw new Error('--resume requires an existing progress.json with a matching source fingerprint; use --resume-unsafe only if you deliberately accept mixed-source cache risk');
  if(fs.existsSync(progressPath)){
    const previous=JSON.parse(fs.readFileSync(progressPath,'utf8'));
    const mismatches=[];
    if(previous.sourceIdentity?.hash && previous.sourceIdentity.hash!==sourceIdentity.hash) mismatches.push('source hash');
    if(previous.seed!=null && Number(previous.seed)!==Number(seed)) mismatches.push('seed');
    if(previous.chunkSize!=null && Number(previous.chunkSize)!==Number(chunkSize)) mismatches.push('chunk size');
    if(previous.landmarkSpacingChunks!=null && Number(previous.landmarkSpacingChunks)!==Number(landmarkSpacingChunks)) mismatches.push('landmark spacing');
    if(!previous.sourceIdentity?.hash && !unsafe) mismatches.push('missing prior source hash');
    if(mismatches.length&&!unsafe) throw new Error(`--resume cache identity mismatch: ${mismatches.join(', ')}. Start a new output directory, or use --resume-unsafe deliberately.`);
    if(mismatches.length) process.stderr.write(`WARNING --resume-unsafe accepted: ${mismatches.join(', ')}\n`);
  }
}

const THREE = await import(pathToFileURL(path.join(repo, 'vendor/three/three.module.js')));
const { createKowloonFabricEngine } = await import(pathToFileURL(path.join(repo, 'kowloon-fabric-engine.js')));
const { deterministicChunkSeed, worldWeirdnessAt } = await import(pathToFileURL(path.join(repo, 'world-contract.js')));
const scene = new THREE.Scene();
const playerPhysics={registerOwnedWorld(){return {activationState:'active'}},unregisterOwnedWorld(){return true}};
const worldSeed=Number(seed)|0;
const engine=createKowloonFabricEngine({THREE,scene,playerPhysics,directSceneAdd:scene.add.bind(scene),worldSeed,chunkSize,landmarkSpacingChunks,yieldControl:null});
const summaries=[], failures=[]; fs.mkdirSync(out,{recursive:true});
for(const {x,z} of coords){
  const chunk={key:`${x},${z}`,x,z,centerX:x*chunkSize,centerZ:z*chunkSize,seed:deterministicChunkSeed(worldSeed,x,z),weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
  const dir=path.join(out,'chunks',chunk.key);
  const summaryPath=path.join(dir,'summary.json');
  const failurePath=path.join(dir,'failure.json');
  if(resume && fs.existsSync(summaryPath)){
    const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8')); summaries.push(summary);
    process.stdout.write(`chunk ${chunk.key} RESUME summary\n`); continue;
  }
  if(resume && fs.existsSync(failurePath)){
    const failure=JSON.parse(fs.readFileSync(failurePath,'utf8')); failures.push(failure);
    process.stderr.write(`chunk ${chunk.key} RESUME failure ${failure.code}\n`); continue;
  }
  let payload=null;
  try{
    const started=performance.now(); payload=await engine.build(chunk); const summary=analyzeChunkPayloadR2(payload,chunk); summary.buildMs=Number((performance.now()-started).toFixed(3)); summaries.push(summary);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
    fs.writeFileSync(path.join(dir,'audit-lenses.svg'),renderAuditLensSvg(summary));
    fs.writeFileSync(path.join(dir,'macro-anatomy.svg'),renderMacroAnatomySvg(summary));
    fs.writeFileSync(path.join(dir,'bridge-grammar.svg'),renderBridgeGrammarSvg(summary));
    fs.writeFileSync(path.join(dir,'stair-rhythm.svg'),renderStairRhythmSvg(summary));
    fs.writeFileSync(path.join(dir,'system-story.svg'),renderSystemStorySvg(summary));
    fs.writeFileSync(path.join(dir,'building-stacks.svg'),renderBuildingStacksSvg(summary));
    fs.writeFileSync(path.join(dir,'attention-ledger.svg'),renderAttentionLedgerSvg(summary));
    fs.writeFileSync(path.join(dir,'index.html'),renderChunkIndexHtmlR2(summary));
    process.stdout.write(`chunk ${chunk.key} macro=${(summary.macro.unionOccupancy*100).toFixed(0)}% mesh=${(summary.macro.sectionalMeshShareOfShared*100).toFixed(0)}% F04=${summary.bridgeGrammar.suspensionOverlayConflicts} F05=${summary.bridgeGrammar.stackedLargeSystems}\n`);
  }catch(error){
    const failure=classifyBuildFailure(error,chunk); failures.push(failure); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(failurePath,JSON.stringify(failure,null,2));
    process.stderr.write(`chunk ${chunk.key} FAILED ${failure.code}: ${failure.message}\n`);
  }
  finally{
    if(payload){try{await engine.unload?.(chunk,payload);}catch(error){process.stderr.write(`unload ${chunk.key}: ${error?.message??error}\n`);}}
    fs.writeFileSync(progressPath,JSON.stringify({schema:'jweb.system-observatory-progress.v2',seed:worldSeed,chunkSize,landmarkSpacingChunks,sourceIdentity,requested:coords.length,built:summaries.length,failed:failures.length,lastChunk:chunk.key,resume},null,2));
  }
}
engine.disposeShared?.();
const issueScan=scanIssueCode(repo); const sweep=buildSweepAnalysisR2(summaries,failures);
sweep.triageTargets=buildTriageTargets(sweep);
sweep.source={repo,seed:worldSeed,chunkSize,requestedChunks:coords.length,failedChunks:failures.length,coordinates:coords}; sweep.codeIssueScan=issueScan;
fs.writeFileSync(path.join(out,'sweep.json'),JSON.stringify(sweep,null,2));
fs.writeFileSync(path.join(out,'build-failures.json'),JSON.stringify(failures,null,2));
fs.writeFileSync(path.join(out,'code-issue-scan.json'),JSON.stringify(issueScan,null,2));
fs.writeFileSync(path.join(out,'triage-targets.json'),JSON.stringify(sweep.triageTargets,null,2));
fs.writeFileSync(path.join(out,'runtime-pipeline.svg'),renderRuntimePipelineSvg(sweep));
fs.writeFileSync(path.join(out,'macro-field.svg'),renderMacroFieldSvg(sweep));
fs.writeFileSync(path.join(out,'module-atlas.svg'),renderModuleAtlasSvg(sweep));
fs.writeFileSync(path.join(out,'audit-lens-matrix.svg'),renderAuditLensMatrixSvg(sweep));
fs.writeFileSync(path.join(out,'stair-contract-matrix.svg'),renderStairContractMatrixSvg(sweep));
fs.writeFileSync(path.join(out,'system-fingerprint.svg'),renderSystemFingerprintSvg(sweep));
fs.writeFileSync(path.join(out,'code-issue-map.svg'),renderCodeIssueMapSvg(issueScan));
fs.writeFileSync(path.join(out,'triage-target-deck.svg'),renderTriageTargetDeckSvg(sweep));
fs.writeFileSync(path.join(out,'SYSTEM-FINDINGS.md'),renderFindingsMarkdownR2(sweep));
fs.writeFileSync(path.join(out,'index.html'),renderSweepIndexHtmlR2(sweep,{title:`JWEB System Observatory R2 — ${summaries.length}/${coords.length} chunks built`}));
console.log(JSON.stringify({pass:failures.length===0,out,seed:worldSeed,requested:coords.length,built:summaries.length,failed:failures.length,transferFailures:sweep.transferFailures,macro:sweep.macro,bridgeGrammar:sweep.bridgeGrammar,stairRhythm:sweep.stairRhythm,lensTotals:sweep.lensTotals},null,2));
if(failures.length && failOnBuildError) process.exitCode=2;
