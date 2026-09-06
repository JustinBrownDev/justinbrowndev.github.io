import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import { planProgramMacroArchitecture } from '../world/architectural-family-system.js';

const floorH=3.15;
const physicalTruth={ floorHeight:{realizedSI:floorH}, door:{clearWidth:{realizedSI:0.91},clearHeight:{realizedSI:2.08}}, route:{clearWidthSI:0.91,headroomSI:2.05} };
const core={ id:'21w:core',kind:'stair-shaft',x:0,z:0,halfX:0.7,halfZ:1.7,yMin:0,yMax:40,openingWidth:1.4,openingDepth:3.4,rampHalfWidth:0.6,integratedFloorLanding:true };
const modules=[{key:'main',cx:0,cz:0,halfX:9,halfZ:8,floors:4,floorBase:0}];
function buildingPlan(program,family,{routeFloor=null}={}){
  const accessAnchors=[{id:`${program}:entry`,kind:'main-entry',x:0,z:8,side:'south',floor:0}];
  if(routeFloor!=null) accessAnchors.push({id:`${program}:sky`,kind:'city-exchange',endpointId:`${program}:endpoint`,bridgeId:`${program}:bridge`,x:-9,z:0,side:'west',floor:routeFloor,traversalPermission:'PUBLIC_THROUGH',routeCharacter:'VERTICAL_COLLECTOR'});
  const sidecar=planBuildingSidecar({ worldSeed:0x21_17, chunkKey:'0,0', entityId:`21w:${program}`, programHint:program, physicalUse:{family}, physicalTruth, floorHeight:floorH, modules, accessAnchors, circulationReservations:[core] });
  return promoteBuildingPlanAuthority(sidecar,{coreReservationId:core.id,coreReservation:core,chunkKey:'0,0',entityId:`21w:${program}`});
}
const samples=[
  ['apartment','residential-lodging','domestic-access-stack'],
  ['convenience','mercantile-public','market-frontage-frame'],
  ['diner','mercantile-public','food-service-exhaust-frame'],
  ['fire_station','industrial-service','industrial-bay-megastructure'],
  ['clinic','assembly-institutional','civic-core-frame'],
  ['laboratory','industrial-service','laboratory-utility-frame'],
  ['warehouse','storage','warehouse-loading-frame'],
  ['server_room','maintenance-utility','data-utility-megastructure'],
];
const families=new Set();
for(const [program,family,expected] of samples){
  const plan=buildingPlan(program,family,{routeFloor:program==='convenience'?2:null});
  const macro=planProgramMacroArchitecture({ id:`macro:${program}`,buildingPlan:plan,footprintModules:modules,compoundBounds:{minX:-9,maxX:9,minZ:-8,maxZ:8},floorH,floors:4,field:'ground',stableKey:`macro:${program}` });
  assert.ok(macro,program);
  assert.equal(macro.family,expected,program);
  assert.equal(macro.traversalAuthority,'building-plan-and-circulation-authority-unchanged');
  assert.ok(macro.parts>=2,`${program}: macro architecture must be visible`);
  families.add(macro.family);
  if(program==='convenience'){
    assert.ok(macro.routeFrontageFeatureCount>=1,'route-served retail needs route frontage macro architecture');
    assert.ok(macro.features.includes('route-frontage-canopy'));
  }
  if(program==='fire_station') assert.ok(macro.features.includes('bay-frame-post'));
  if(program==='warehouse') assert.ok(macro.features.includes('loading-canopy'));
  if(program==='server_room') assert.ok(macro.features.includes('major-service-stack'));
}
assert.ok(families.size>=7);
console.log('[cut21w-program-macro-architecture-selftest] PASS',{families:[...families]});
