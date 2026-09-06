import * as THREE from 'three';
import { installJwebVisualProbe } from './runtime-visual-probe.js';
import {
  buildIsolatedVisualScene,
  expandBounds,
  frameCameraForBounds,
  visualFragmentsForBounds,
  visualFragmentsForObjects,
} from './visual-probe-core.js';
import { loadGeometryHarnessFixture } from './geometry-fixture-adapter.js';
import { buildJwebGeneratorSpecimen } from './jweb-generator-adapter.js';

const params=new URLSearchParams(location.search);
const mode=String(params.get('mode') ?? (params.has('fixture') ? 'fixture' : 'generator')).toLowerCase();
const seed=Number(params.get('seed')??671278205)|0;
const [chunkX,chunkZ]=String(params.get('chunk')??'0,0').split(',').map(v=>Number(v)|0);
const fixtureName=params.get('fixture')??'apartment-stair';
const requestedTarget=params.get('target');
const targetIndex=Math.max(0,Number(params.get('index')??0)|0);
const autoCapture=params.get('capture')==='1';
const autoDecompose=params.get('decompose')==='1';
const decomposeParts=Math.max(1,Math.min(48,Number(params.get('parts')??12)|0));
const autoDownload=params.get('download')==='1';
const panel=document.getElementById('panel');
const setStatus=text=>{panel.textContent=text;console.log('[specimen]',text);};

async function loadStageLighting(){
  const fallback={ambientColor:0xffffff,ambientIntensity:0.8,fillColor:0xb8d8ff,fillIntensity:0.55,moonColor:0xffffff,moonIntensity:1.15,moonPosition:{x:22,y:34,z:18}};
  try{
    const {CONFIG}=await import('../../config/game-config.js');const l=CONFIG?.lighting??{};
    return {ambientColor:l.ambientColor??fallback.ambientColor,ambientIntensity:l.ambientIntensity??fallback.ambientIntensity,fillColor:l.fillColor??fallback.fillColor,fillIntensity:l.fillIntensity??fallback.fillIntensity,moonColor:l.moonColor??fallback.moonColor,moonIntensity:l.moonIntensity??fallback.moonIntensity,moonPosition:l.moonPosition??fallback.moonPosition};
  }catch(error){console.warn('[specimen] game lighting config unavailable; using neutral specimen lights',error);return fallback;}
}

async function createStage(){
  const lighting=await loadStageLighting();
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x070707);
  const ambient=new THREE.AmbientLight(lighting.ambientColor,lighting.ambientIntensity);scene.add(ambient);
  const hemi=new THREE.HemisphereLight(lighting.fillColor,0x151515,lighting.fillIntensity);scene.add(hemi);
  const sun=new THREE.DirectionalLight(lighting.moonColor,lighting.moonIntensity);sun.position.set(lighting.moonPosition.x,lighting.moonPosition.y,lighting.moonPosition.z);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.03,2000);camera.position.set(30,26,30);camera.lookAt(0,5,0);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  return {scene,camera,renderer};
}

async function buildGeneratorSpecimen(scene){
  const {payload,engine,chunk}=await buildJwebGeneratorSpecimen({THREE,scene,seed,chunkX,chunkZ});
  return {payload,engine,chunk,label:`generator payload · seed ${seed} · chunk ${chunk.key}`,defaultTarget:'stair',fixture:null};
}

async function buildFixtureSpecimen(scene){
  const fixture=await loadGeometryHarnessFixture(THREE,fixtureName);const payload=fixture.payload;scene.add(payload.root);payload.root.visible=true;
  const firstVisual=fixture.targets.find(t=>t.targetKind==='fixture-element'&&(t.visualObjects?.length||t.colliderObjects?.length)) ?? fixture.targets[0];
  return {payload,engine:null,chunk:{key:`fixture:${fixtureName}`},label:`geometry fixture · ${fixtureName} · zero city/chunk generation`,defaultTarget:firstVisual?.id??'fixture-component',fixture};
}

const ready=(async()=>{
  if(!['generator','fixture'].includes(mode))throw new Error(`unknown specimen mode ${mode}; use generator or fixture`);
  setStatus(mode==='fixture'
    ? `building DIRECT GEOMETRY FIXTURE\n${fixtureName}\n(no main.js / no streamer / no world / no chunk generator)`
    : `building ONE generator payload only\nseed ${seed} · chunk ${chunkX},${chunkZ}\n(no main.js / no streamed world / no authored spawn boot)`);
  const {scene,camera,renderer}=await createStage();const started=performance.now();
  const built=mode==='fixture'?await buildFixtureSpecimen(scene):await buildGeneratorSpecimen(scene);const {payload,engine,chunk,fixture}=built;
  scene.updateMatrixWorld(true);
  const api=installJwebVisualProbe({THREE,scene,camera,renderer,composer:null,getPayloadEntries:()=>[{payload,chunkKey:chunk.key}],getStatus:()=>({mode:`${mode}-specimen`,buildMs:performance.now()-started,worldStream:{localRenderRing:{complete:true}},authored:{structuresComplete:true,pendingSites:0},chunk:{key:chunk.key,seed:chunk.seed??null,weirdness:chunk.weirdness??null},fixture:fixture?{name:fixtureName,targets:fixture.targets.length}:null})});
  const target=requestedTarget??built.defaultTarget;const matches=api.search(target,{limit:100,refresh:true});const chosen=matches[targetIndex]??matches[0]??null;
  let displayScene=scene,displayFragments=[];
  if(chosen?.bounds){
    const framedBounds=expandBounds(chosen.bounds,0.55);
    if(fixture){
      const exact=fixture.targets.find(t=>t.id===chosen.id&&t.targetKind===chosen.targetKind) ?? fixture.targets.find(t=>t.id===chosen.id);
      const objects=exact?.visualObjects?.length?exact.visualObjects:(exact?.colliderObjects??[]);
      if(objects.length)displayFragments=visualFragmentsForObjects(THREE,objects);
    }
    if(!displayFragments.length)displayFragments=visualFragmentsForBounds(THREE,[payload.root],framedBounds,{includeInvisible:true});
    const isolated=buildIsolatedVisualScene(THREE,displayFragments,{sourceScene:scene,background:0x070707});isolated.scene.fog=null;payload.root.visible=false;displayScene=isolated.scene;
    const framedCamera=frameCameraForBounds(THREE,framedBounds,{view:'iso',aspect:innerWidth/innerHeight});camera.position.copy(framedCamera.position);camera.quaternion.copy(framedCamera.quaternion);camera.up.copy(framedCamera.up);camera.fov=framedCamera.fov;camera.near=framedCamera.near;camera.far=framedCamera.far;camera.updateProjectionMatrix();
  }
  setStatus(`${mode==='fixture'?'DIRECT FIXTURE':'GENERATOR'} SPECIMEN READY · selected object shown alone in void\n${built.label} · build ${(performance.now()-started).toFixed(1)} ms\nquery ${JSON.stringify(target)} · matches ${matches.length} · shown index ${targetIndex}\nvisual fragments ${displayFragments.length}\n\nconsole:\n  __jwebVisualProbe.search('stair')\n  await __jwebVisualProbe.captureTarget(${JSON.stringify(target)},{index:${targetIndex},download:true,worldContext:false})
  await __jwebVisualProbe.captureDecomposition(${JSON.stringify(target)},{index:${targetIndex},maxParts:12,download:true})\n\nURL examples:\n  fixture:   ?mode=fixture&fixture=apartment-stair&target=flight-low\n  generated: ?mode=generator&seed=${seed}&chunk=${chunk.key.replace('fixture:','0,0')}&target=stair\n  autocap:   add &capture=1&download=1
  decompose: add &decompose=1&parts=12&download=1`);
  function render(){requestAnimationFrame(render);renderer.render(displayScene,camera);}render();
  let capture=null;if(autoDecompose){capture=await api.captureDecomposition(target,{index:targetIndex,maxParts:decomposeParts,worldContext:false,download:autoDownload,name:`specimen-${mode}-${chunk.key}-${targetIndex}-decomposed`});window.__jwebSpecimenCapture=capture;}
  else if(autoCapture){capture=await api.captureTarget(target,{index:targetIndex,worldContext:false,download:autoDownload,name:`specimen-${mode}-${chunk.key}-${targetIndex}`});window.__jwebSpecimenCapture=capture;}
  return {api,payload,engine,scene,camera,renderer,capture,fixture,mode,target};
})().catch(error=>{setStatus('SPECIMEN FAILED\n'+(error?.stack??error));throw error;});
window.__jwebSpecimenReady=ready;
await ready; // keep load behind deterministic specimen construction for simple screenshot drivers
