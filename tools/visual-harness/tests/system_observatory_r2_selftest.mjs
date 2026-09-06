import assert from 'node:assert/strict';
import {
  analyzeChunkPayloadR2, buildSweepAnalysisR2, classifyBuildFailure,
  renderAuditLensMatrixSvg, renderAuditLensSvg, renderBridgeGrammarSvg,
  renderMacroAnatomySvg, renderMacroFieldSvg, renderStairRhythmSvg,
  renderSystemFingerprintSvg,
} from '../system-observatory-r2-core.js';

const entity = (id, key, floors=3) => ({id,floors,floorH:3,primaryCell:{col:Number(key.split(',')[0]),row:Number(key.split(',')[1])},footprintModules:[{key,floors,floorBase:0}]});
const payload = {
  entities:[entity('g','1,1',4), entity('g2','2,2',2)],
  hangingCity:{frame:{anchorY:30},buildings:1,skybridges:1},
  hangingLayer:{payload:{entities:[{...entity('h','1,1',4),footprintModules:[{key:'1,1',floors:4,baseY:18,roofY:30}]}],physics:{
    bridgeArchitecture:[{bridgeId:'b1',family:'box-girder',bridgeVariant:'hanging-bridge',structuralGrammar:'suspended-catenary-v1',variantParts:8,supportParts:8,parts:30}],
    stairOwnership:[{id:'hs',stairTopology:'two-flight-switchback',floors:4}], stairArchitectureExpressions:[], circulationDemands:[], structuralShellClosures:[],structuralSurfaceClaims:[]
  }}},
  physics:{
    bridgeArchitecture:[{bridgeId:'b0',family:'simple-guarded',bridgeVariant:'guarded-catwalk',structuralGrammar:'family-native-v1',variantParts:0,supportParts:0,parts:4}],
    stairOwnership:[{id:'s1',stairTopology:'two-flight-switchback',floors:4},{id:'s2',stairTopology:'two-flight-switchback',floors:2}],
    stairArchitectureExpressions:[{id:'x1',family:'residential-enclosed'}], circulationDemands:[{id:'d',field:'ground',requiresFacadeChange:true}], structuralShellClosures:[],structuralSurfaceClaims:[]
  },
  spatialTopology:{spaces:[{id:'a',entityId:'g',floor:0,yBase:0,role:'entry',layer:'ground'}],surfaces:[],apertures:[],portals:[],connectors:[],reservations:[],transportSurfaces:[],transportEdges:[],edges:[],stats:{circulation:{components:1,unreachableSpaces:0,unreachableTransportNodes:0,explicitEgressFailures:0}}},
  worldCirculation:{nodes:[{id:'a'}],edges:[],routes:{a:{distanceToExit:0}},exits:[{spaceId:'a'}],buildings:[],stats:{components:1,unreachableSpaces:0,unreachableTransportNodes:0,explicitEgressFailures:0,maxHopsToExit:0}},
};
const summary=analyzeChunkPayloadR2(payload,{key:'1,2',x:1,z:2});
assert.equal(summary.macro.sharedCells,1);
assert.equal(summary.macro.interlockCells,0);
assert.equal(summary.bridgeGrammar.suspensionOverlayConflicts,1);
assert.equal(summary.bridgeGrammar.stackedLargeSystems,1);
assert.equal(summary.stairRhythm.count,3);
assert.equal(summary.stairRhythm.dominantTopologyShare,1);
assert.equal(summary.auditLenses.F04.level,2);
const failure=classifyBuildFailure(Object.assign(new Error('cannot route'),{code:'JWEB_TOWER_TRANSFER_UNREALIZED'}),{key:'9,9',x:9,z:9});
assert.equal(failure.lens,'F01');
const sweep=buildSweepAnalysisR2([summary],[failure]);
assert.equal(sweep.transferFailures,1);
assert.equal(sweep.bridgeGrammar.suspensionOverlayConflicts,1);
for(const svg of [renderAuditLensSvg(summary),renderMacroAnatomySvg(summary),renderBridgeGrammarSvg(summary),renderStairRhythmSvg(summary),renderMacroFieldSvg(sweep),renderAuditLensMatrixSvg(sweep),renderSystemFingerprintSvg(sweep)]) assert.match(svg,/<svg/);
console.log('system observatory R2 selftest PASS');
