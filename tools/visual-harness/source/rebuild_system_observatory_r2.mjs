#!/usr/bin/env node
// Re-render a System Observatory R2 report from cached per-chunk summaries.
// This intentionally avoids rebuilding the city so visual/report iterations are cheap.
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSweepAnalysisR2,
  buildTriageTargets,
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
function arg(name, fallback=null){const i=process.argv.indexOf(name); return i>=0&&i+1<process.argv.length?process.argv[i+1]:fallback;}
const out=path.resolve(arg('--out', '.visual-probe-output/system-observatory-r2'));
const chunkRoot=path.join(out,'chunks');
if(!fs.existsSync(chunkRoot)) throw new Error(`No cached chunk directory: ${chunkRoot}`);
const summaries=[], failures=[];
for(const entry of fs.readdirSync(chunkRoot,{withFileTypes:true})){
  if(!entry.isDirectory()) continue;
  const dir=path.join(chunkRoot,entry.name), summaryPath=path.join(dir,'summary.json'), failurePath=path.join(dir,'failure.json');
  if(fs.existsSync(summaryPath)) summaries.push(JSON.parse(fs.readFileSync(summaryPath,'utf8')));
  else if(fs.existsSync(failurePath)) failures.push(JSON.parse(fs.readFileSync(failurePath,'utf8')));
}
summaries.sort((a,b)=>(a.chunk?.x??0)-(b.chunk?.x??0)||(a.chunk?.z??0)-(b.chunk?.z??0));
failures.sort((a,b)=>(a.x??0)-(b.x??0)||(a.z??0)-(b.z??0));
const previousSweep=fs.existsSync(path.join(out,'sweep.json'))?JSON.parse(fs.readFileSync(path.join(out,'sweep.json'),'utf8')):{};
const issueScan=fs.existsSync(path.join(out,'code-issue-scan.json'))?JSON.parse(fs.readFileSync(path.join(out,'code-issue-scan.json'),'utf8')):{lenses:[],nodes:{}};
const sweep=buildSweepAnalysisR2(summaries,failures);
sweep.triageTargets=buildTriageTargets(sweep);
sweep.source={...(previousSweep.source??{}),rebuiltFromCachedSummaries:true}; sweep.codeIssueScan=issueScan;
for(const summary of summaries){
  const dir=path.join(chunkRoot,summary.chunk.key);
  fs.writeFileSync(path.join(dir,'audit-lenses.svg'),renderAuditLensSvg(summary));
  fs.writeFileSync(path.join(dir,'macro-anatomy.svg'),renderMacroAnatomySvg(summary));
  fs.writeFileSync(path.join(dir,'bridge-grammar.svg'),renderBridgeGrammarSvg(summary));
  fs.writeFileSync(path.join(dir,'stair-rhythm.svg'),renderStairRhythmSvg(summary));
  fs.writeFileSync(path.join(dir,'system-story.svg'),renderSystemStorySvg(summary));
  fs.writeFileSync(path.join(dir,'building-stacks.svg'),renderBuildingStacksSvg(summary));
  fs.writeFileSync(path.join(dir,'attention-ledger.svg'),renderAttentionLedgerSvg(summary));
  fs.writeFileSync(path.join(dir,'index.html'),renderChunkIndexHtmlR2(summary));
}
fs.writeFileSync(path.join(out,'sweep.json'),JSON.stringify(sweep,null,2));
fs.writeFileSync(path.join(out,'build-failures.json'),JSON.stringify(failures,null,2));
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
fs.writeFileSync(path.join(out,'index.html'),renderSweepIndexHtmlR2(sweep,{title:`JWEB System Observatory R2 — ${summaries.length}/${summaries.length+failures.length} cached chunks`}));
console.log(JSON.stringify({pass:true,out,built:summaries.length,failed:failures.length,runtimeCounts:sweep.runtimeCounts,stairRhythm:sweep.stairRhythm},null,2));
