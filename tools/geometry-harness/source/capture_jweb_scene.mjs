#!/usr/bin/env node
// Capture one generated JWEB chunk into the neutral geometry stream consumed by
// jweb_silhouette_tester.py. V6 deliberately fails open *as evidence* but never
// fabricates valid numbers: malformed runtime geometry is recorded in
// source_metadata.capture_health.errors and omitted from authority geometry.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, fallback=null) {
  const i=process.argv.indexOf(name); return i>=0 && i+1<process.argv.length ? process.argv[i+1] : fallback;
}
function flag(name) { return process.argv.includes(name); }
function safeName(s) { return String(s??'').replace(/[^A-Za-z0-9_.:+-]+/g,'_').slice(0,120) || 'unnamed'; }

const repo=path.resolve(arg('--repo',''));
const out=path.resolve(arg('--out','jweb-scene-snapshot.json'));
const worldSeed=Number(arg('--seed','671278205'))|0;
const x=Number(arg('--x','16'))|0, z=Number(arg('--z','0'))|0;
const includeProps=flag('--include-props');
// Interior partition-wall paint (world/architecture/building-plan-authority.js runs, realized
// by realizeBuildingPlanWallRuns() in kowloon-fabric-engine.js) is excluded by default because
// it is cosmetic sidecar geometry, same as windows/doors/roads -- noise for the original
// structural-authority use case. Bugs where that paint (or the partition wall behind it) pokes
// through the exterior shell and becomes visible from outside are invisible to this capture
// unless explicitly opted back in.
const includeInteriorPaint=flag('--include-interior-paint');
const visualMode=String(arg('--visual-mode','exact')).toLowerCase();
if (!['exact','bounds'].includes(visualMode)) throw new Error(`--visual-mode must be exact or bounds, got ${visualMode}`);
if (!fs.existsSync(repo)) throw new Error(`JWEB repo not found: ${repo}`);
for (const rel of ['vendor/three/three.module.js','kowloon-fabric-engine.js','world-chunk-streamer.js']) {
  if (!fs.existsSync(path.join(repo,rel))) throw new Error(`JWEB repo missing ${rel}: ${repo}`);
}
const THREE=await import(pathToFileURL(path.join(repo,'vendor/three/three.module.js')));
const {createKowloonFabricEngine}=await import(pathToFileURL(path.join(repo,'kowloon-fabric-engine.js')));
const {deterministicChunkSeed,worldWeirdnessAt}=await import(pathToFileURL(path.join(repo,'world-chunk-streamer.js')));

const EXCLUDE=[/(?:^|[:\-])(roads?)(?:$|[:\-])/i,/(?:^|[:\-])(windows?)(?:$|[:\-])/i,/(?:^|[:\-])(doors?)(?:$|[:\-])/i,/ceiling-plane/i,/ground-plane/i,
  ...(includeInteriorPaint?[]:[/interior-paint/i])];
function excluded(o){const name=String(o?.name??'');return EXCLUDE.some(r=>r.test(name));}
function effectiveVisible(o,boundaryRoot=null){for(let c=o;c && c!==boundaryRoot;c=c.parent) if(c.visible===false) return false; return true;}
function materialVisible(m){return !!m && m.visible!==false && !(m.transparent===true && Number(m.opacity)<=0);}
function layerFor(o){let c=o;while(c){if(c?.userData?.ceilingCityFrame||String(c?.name??'').startsWith('ceiling-city:')) return 'hanging';c=c.parent;}return 'ground';}
function bboxCorners(geometry){
  geometry?.computeBoundingBox?.(); const b=geometry?.boundingBox; if(!b || b.isEmpty?.()) return null;
  const a=b.min,m=b.max;
  return [[a.x,a.y,a.z],[m.x,a.y,a.z],[m.x,m.y,a.z],[a.x,m.y,a.z],
          [a.x,a.y,m.z],[m.x,a.y,m.z],[m.x,m.y,m.z],[a.x,m.y,m.z]];
}
function xform(corners,e){return corners.map(([x,y,z])=>[
  e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14],
]);}
function finiteRequired(value,label){const n=Number(value);if(!Number.isFinite(n)) throw new Error(`${label} must be finite; got ${String(value)}`);return n;}
function positiveRequired(value,label){const n=finiteRequired(value,label);if(!(n>0)) throw new Error(`${label} must be > 0; got ${n}`);return n;}
function optionalFinite(value,fallback,label){return value==null ? fallback : finiteRequired(value,label);}
function materialRanges(geometry,material,total){
  const draw=geometry.drawRange??{start:0,count:Infinity};
  const drawStart=Math.max(0,Math.floor(Number(draw.start)||0));
  const rawCount=Number(draw.count); const drawEnd=Number.isFinite(rawCount)?Math.min(total,drawStart+Math.max(0,Math.floor(rawCount))):total;
  const materials=Array.isArray(material)?material:[material];
  if(!materials.some(materialVisible)) return [];
  if(Array.isArray(material) && geometry.groups?.length){
    const out=[];
    for(const g of geometry.groups){
      if(!materialVisible(materials[g.materialIndex??0])) continue;
      const s=Math.max(drawStart,Math.floor(g.start??0));
      const e=Math.min(drawEnd,s+Math.max(0,Math.floor(g.count??0)));
      if(e>s) out.push([s,e]);
    }
    return out;
  }
  return drawEnd>drawStart?[[drawStart,drawEnd]]:[];
}
function exactMeshData(object,matrixElements){
  const g=object.geometry; const pos=g?.getAttribute?.('position')??g?.attributes?.position;
  if(!pos || !(pos.count>0)) return null;
  const index=g.index; const total=index?.count??pos.count; const ranges=materialRanges(g,object.material,total); if(!ranges.length) return null;
  const vertices=[];
  for(let i=0;i<pos.count;i++) vertices.push(xform([[finiteRequired(pos.getX(i),`position[${i}].x`),finiteRequired(pos.getY(i),`position[${i}].y`),finiteRequired(pos.getZ(i),`position[${i}].z`)]],matrixElements)[0]);
  const faces=[]; const readIndex=i=>index?index.getX(i):i;
  for(const [start,end] of ranges){
    for(let i=start;i+2<end;i+=3){
      const a=readIndex(i),b=readIndex(i+1),c=readIndex(i+2);
      if(!Number.isInteger(a)||!Number.isInteger(b)||!Number.isInteger(c)||a<0||b<0||c<0||a>=vertices.length||b>=vertices.length||c>=vertices.length) throw new Error(`triangle index out of range at draw offset ${i}: ${a},${b},${c}`);
      const A=vertices[a],B=vertices[b],C=vertices[c];
      const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2], vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
      const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
      if(cx*cx+cy*cy+cz*cz>1e-24) faces.push([a,b,c]);
    }
  }
  return faces.length?{vertices,faces}:null;
}

const scene=new THREE.Scene();
const playerPhysics={registerOwnedWorld(){return {activationState:'active'};},unregisterOwnedWorld(){return true;}};
const engine=createKowloonFabricEngine({THREE,scene,playerPhysics,directSceneAdd:scene.add.bind(scene),worldSeed,
  chunkSize:64,landmarkSpacingChunks:3,yieldControl:null});
const chunk={key:`${x},${z}`,x,z,centerX:x*64,centerZ:z*64,seed:deterministicChunkSeed(worldSeed,x,z),
  weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
const buildStarted=performance.now();
const payload=await engine.build(chunk);
const buildMs=performance.now()-buildStarted;
const elements=[];
const stats={visual:{meshes:0,instances:0,excludedMeshes:0,invisibleMeshes:0,emptyMeshes:0,ground:0,hanging:0},physics:{mazeWalls:0,platforms:0,ramps:0,props:0,ceilings:0}};
const health={pass:true,errors:[],warnings:[],visualMode,includeInteriorPaint};
function problem(kind,index,error,item=null){health.errors.push({kind,index,error:String(error?.message??error),item:item??undefined});health.pass=false;}

// VISUAL INGEST -------------------------------------------------------------
const root=payload.root;
if (!root?.traverse) throw new Error('JWEB payload.root is not a THREE.Object3D');
root.updateMatrixWorld?.(true);
const scratchInstance=new THREE.Matrix4(), scratchWorld=new THREE.Matrix4();
let visualSeq=0;
root.traverse(object=>{
  if (!object?.isMesh && !object?.isInstancedMesh) return;
  stats.visual.meshes++;
  if (!effectiveVisible(object,root)) {stats.visual.invisibleMeshes++;return;}
  if (excluded(object)) {stats.visual.excludedMeshes++;return;}
  const layer=layerFor(object), base=safeName(object.name||object.type);
  const emit=(matrixElements,instanceIndex)=>{
    try{
      let element;
      if(visualMode==='exact'){
        const mesh=exactMeshData(object,matrixElements); if(!mesh){stats.visual.emptyMeshes++;return;}
        element={type:'mesh',id:`visual:${layer}:${String(visualSeq++).padStart(5,'0')}:${base}${instanceIndex==null?'':`:i${instanceIndex}`}`,
          roles:['visual'],vertices:mesh.vertices,faces:mesh.faces,source:{kind:'three-triangles',layer,objectName:String(object.name??''),instanceIndex}};
      } else {
        const corners=bboxCorners(object.geometry); if(!corners){stats.visual.emptyMeshes++;return;}
        element={type:'parallelepiped',id:`visual:${layer}:${String(visualSeq++).padStart(5,'0')}:${base}${instanceIndex==null?'':`:i${instanceIndex}`}`,
          roles:['visual'],corners:xform(corners,matrixElements),source:{kind:'three-bounds',layer,objectName:String(object.name??''),instanceIndex}};
      }
      elements.push(element);stats.visual.instances++;stats.visual[layer]=(stats.visual[layer]||0)+1;
    } catch(error){problem('visual',instanceIndex,error,{objectName:String(object.name??''),layer});}
  };
  if(object.isInstancedMesh){
    for(let i=0;i<object.count;i++){object.getMatrixAt(i,scratchInstance);scratchWorld.multiplyMatrices(object.matrixWorld,scratchInstance);emit(scratchWorld.elements,i);}
  } else emit(object.matrixWorld.elements,null);
});

// PHYSICS INGEST ------------------------------------------------------------
const ph=payload.physics||{};
function addWall(w,i){try{
  const x1=finiteRequired(w.x1,`mazeWalls[${i}].x1`),z1=finiteRequired(w.z1,`mazeWalls[${i}].z1`),x2=finiteRequired(w.x2,`mazeWalls[${i}].x2`),z2=finiteRequired(w.z2,`mazeWalls[${i}].z2`);
  const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz); if(!(len>1e-9)) throw new Error('wall segment has zero horizontal length');
  const yMin=finiteRequired(w.yMin,`mazeWalls[${i}].yMin`), yMax=finiteRequired(w.yMax,`mazeWalls[${i}].yMax`); if(!(yMax>yMin)) throw new Error(`wall yMax (${yMax}) must exceed yMin (${yMin})`);
  const th=w.thickness==null?0.12:positiveRequired(w.thickness,`mazeWalls[${i}].thickness`);
  // shellPieceKind distinguishes the authoritative exterior shell (addCompoundSideWall,
  // kowloon-fabric-engine.js) from everything else that also lands in physics.mazeWalls
  // (building-plan-partition interior walls, stair-shaft enclosures, crown/roof walls, ...).
  // supportKind alone only labels the non-exterior cases, so forward both plus the handful
  // of identity fields each wall-emitting function actually sets -- needed to tell "this
  // interior partition's paint is outside the exterior shell it should be inside" from pixels.
  elements.push({type:'box',id:`collider:maze-wall:${i}`,roles:['collider'],center:[(x1+x2)/2,(yMin+yMax)/2,(z1+z2)/2],size:[th,yMax-yMin,len],yaw_deg:Math.atan2(dx,dz)*180/Math.PI,
    source:{kind:'physics-maze-wall',supportKind:w.supportKind??null,shellPieceKind:w.shellPieceKind??null,shellOwnerId:w.shellOwnerId??null,
      side:w.side??null,moduleKey:w.moduleKey??null,buildingPlanWallId:w.buildingPlanWallId??null,fromSpaceId:w.fromSpaceId??null,toSpaceId:w.toSpaceId??null}});stats.physics.mazeWalls++;
}catch(error){problem('maze-wall',i,error,w);}}
for(let i=0;i<(ph.mazeWalls?.length||0);i++) addWall(ph.mazeWalls[i],i);
for(let i=0;i<(ph.platforms?.length||0);i++){const p=ph.platforms[i];try{
  const hx=positiveRequired(p.hx,`platforms[${i}].hx`),hz=positiveRequired(p.hz,`platforms[${i}].hz`),y=finiteRequired(p.y,`platforms[${i}].y`),px=finiteRequired(p.x,`platforms[${i}].x`),pz=finiteRequired(p.z,`platforms[${i}].z`);
  const t=0.06;elements.push({type:'box',id:`collider:platform:${i}:${safeName(p.supportKind)}`,roles:['collider'],center:[px,y-t/2,pz],size:[hx*2,t,hz*2],
    source:{kind:'physics-platform',approximation:'surface-extruded-down-0.06m',supportKind:p.supportKind??null}});stats.physics.platforms++;
}catch(error){problem('platform',i,error,p);}}
for(let i=0;i<(ph.ramps?.length||0);i++){const r=ph.ramps[i];try{
  const axis=String(r.axis??''); if(axis!=='x'&&axis!=='z') throw new Error(`axis must be x or z; got ${axis||'(missing)'}`);
  const from=finiteRequired(r.from,`ramps[${i}].from`),to=finiteRequired(r.to,`ramps[${i}].to`),fixed=finiteRequired(r.fixedCoord,`ramps[${i}].fixedCoord`); if(Math.abs(to-from)<=1e-9) throw new Error('ramp run is zero');
  const y0=finiteRequired(r.y0,`ramps[${i}].y0`),y1=finiteRequired(r.y1,`ramps[${i}].y1`),halfWidth=positiveRequired(r.halfWidth,`ramps[${i}].halfWidth`);
  const start=axis==='x'?[from,y0,fixed]:[fixed,y0,from],end=axis==='x'?[to,y1,fixed]:[fixed,y1,to];
  elements.push({type:'ramp',id:`collider:ramp:${i}:${safeName(r.supportKind)}`,roles:['collider'],start,end,width:halfWidth*2,thickness:0.12,
    source:{kind:'physics-ramp',approximation:'surface-extruded-down-0.12m',supportKind:r.supportKind??null,collisionAuthority:r.collisionAuthority??null}});stats.physics.ramps++;
}catch(error){problem('ramp',i,error,r);}}
for(let i=0;i<(ph.ceilings?.length||0);i++){const c=ph.ceilings[i];try{
  const hx=positiveRequired(c.hx??c.halfX,`ceilings[${i}].hx`),hz=positiveRequired(c.hz??c.halfZ,`ceilings[${i}].hz`),cx=finiteRequired(c.x,`ceilings[${i}].x`),cz=finiteRequired(c.z,`ceilings[${i}].z`);
  const y=finiteRequired(c.y??c.yMin,`ceilings[${i}].y`),t=c.thickness==null?0.08:positiveRequired(c.thickness,`ceilings[${i}].thickness`);
  elements.push({type:'box',id:`collider:ceiling:${i}`,roles:['collider'],center:[cx,y+t/2,cz],size:[hx*2,t,hz*2],source:{kind:'physics-ceiling',approximation:'surface-extruded-up'}});stats.physics.ceilings++;
}catch(error){problem('ceiling',i,error,c);}}
if(includeProps){
  for(let i=0;i<(ph.props?.length||0);i++){const p=ph.props[i];try{
    const r=positiveRequired(p.radius,`props[${i}].radius`),x0=finiteRequired(p.x,`props[${i}].x`),z0=finiteRequired(p.z,`props[${i}].z`),y0=optionalFinite(p.yMin,0,`props[${i}].yMin`),y1=finiteRequired(p.height,`props[${i}].height`);
    // JWEB player-physics interprets p.height as the absolute TOP Y (not extent).
    if(!(y1>y0)) throw new Error(`prop top p.height (${y1}) must exceed yMin (${y0})`);
    elements.push({type:'cylinder',id:`collider:prop:${i}:${safeName(p.supportKind)}`,roles:['collider'],center:[x0,(y0+y1)/2,z0],radius:r,height:y1-y0,sides:16,
      source:{kind:'physics-prop',shape:'vertical-cylinder',heightSemantics:'absolute-yMax',supportKind:p.supportKind??null}});stats.physics.props++;
  }catch(error){problem('prop',i,error,p);}}
}

health.summary={errors:health.errors.length,warnings:health.warnings.length,capturedElements:elements.length};

// SEMANTIC AUTHORITY HEALTH --------------------------------------------------
// These checks consume JWEB's own resolved stair/connector authority instead of
// trying to infer traversability from pixels. They are deliberately narrow and
// fail closed only on invariants the payload explicitly claims.
const connectors=ph.semanticConnectors??[];
const stairConnectors=connectors.filter(c=>c?.stairFlight);
const authorityErrors=[];
for(const c of stairConnectors){
  if(c.stairFlight?.fitClassification==='geometry-fit-outside-truth') authorityErrors.push({
    type:'stair-fit-outside-truth',id:c.id??null,source:c.source??null,kind:c.kind??null,
    realizedTreadDepth:c.stairFlight.realizedTreadDepth,fitThresholdTreadDepth:c.stairFlight.fitThresholdTreadDepth,
  });
  if(Number.isFinite(c.sweep?.halfWidth)&&Number.isFinite(c.stairFlight?.clearWidth)&&c.sweep.halfWidth*2+1e-9<c.stairFlight.clearWidth) authorityErrors.push({
    type:'stair-clear-width-below-truth',id:c.id??null,source:c.source??null,kind:c.kind??null,
    realizedWidth:c.sweep.halfWidth*2,clearWidth:c.stairFlight.clearWidth,
  });
  // createStairConnector wraps a whole switchback core while stairFlight is one
  // segment. Direct y-span equality is authoritative only for ramp-style flights.
  if(c.sweep?.type!=='stair'&&Number.isFinite(c.sweep?.y0)&&Number.isFinite(c.sweep?.y1)&&Number.isFinite(c.stairFlight?.rise)
      &&Math.abs(Math.abs(c.sweep.y1-c.sweep.y0)-c.stairFlight.rise)>1e-8) authorityErrors.push({
    type:'stair-rise-authority-mismatch',id:c.id??null,source:c.source??null,kind:c.kind??null,
  });
}
const reservations=ph.circulationReservations??[];
for(const r of reservations){
  const vals=[r?.minX,r?.maxX,r?.minZ,r?.maxZ,r?.yMin,r?.yMax];
  if(!vals.every(Number.isFinite)||!(r.maxX>r.minX&&r.maxZ>r.minZ&&r.yMax>r.yMin)) authorityErrors.push({type:'invalid-circulation-reservation',id:r?.id??null});
}
const authorityHealth={pass:authorityErrors.length===0,errors:authorityErrors,summary:{
  connectors:connectors.length,stairConnectors:stairConnectors.length,circulationReservations:reservations.length,errors:authorityErrors.length,
}};
const sourceMetadata={schema:'jweb.geometry-city-capture.v2',repo,worldSeed,chunk:{x,z,key:chunk.key,seed:chunk.seed,weirdness:chunk.weirdness},
  buildMs:Number(buildMs.toFixed(3)),stats,capture_health:health,authority_health:authorityHealth,ownerId:payload.ownerId??null,formatVersion:payload.formatVersion??null};
const snapshot={schema:'jweb.geometry-scene.v2',name:`JWEB city chunk ${chunk.key} / seed ${worldSeed}`,source_kind:'jweb-generated-chunk',source_metadata:sourceMetadata,elements,checks:[]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(snapshot));
engine.disposeShared?.();
console.log(JSON.stringify({out,elements:elements.length,sourceMetadata},null,2));
