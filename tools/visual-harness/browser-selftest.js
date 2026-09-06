import * as THREE from 'three';
import { installJwebVisualProbe } from './runtime-visual-probe.js';
import { DEFAULT_RENDER_PASSES, DIAGNOSTIC_COLORS } from './visual-probe-core.js';

const out=document.getElementById('out');
const lines=[];
const log=(text)=>{lines.push(String(text));out.textContent=lines.join('\n');console.log('[visual-harness-browser-selftest]',text);};
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const entryBy=(bundle,suffix)=>bundle.entries.find(entry=>entry.name.endsWith(suffix));
const pngSignature=[137,80,78,71,13,10,26,10];

async function assertPng(blob,label){
  const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  assert(bytes.length===8&&pngSignature.every((v,i)=>bytes[i]===v),`${label}: invalid PNG signature`);
}

async function rgba(blob){
  const bitmap=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close?.();
  return {data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
}

function hasRgb(data,[r,g,b]){for(let i=0;i<data.length;i+=4)if(data[i]===r&&data[i+1]===g&&data[i+2]===b)return true;return false;}
function rgbOfInt(value){return [(value>>>16)&255,(value>>>8)&255,value&255];}

async function main(){
  assert(typeof WebGL2RenderingContext!=='undefined'||typeof WebGLRenderingContext!=='undefined','browser exposes no WebGL API');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101217);
  scene.add(new THREE.AmbientLight(0xffffff,1.4));
  const key=new THREE.DirectionalLight(0xffffff,2.1);key.position.set(4,8,8);scene.add(key);

  const geometry=new THREE.BoxGeometry(1.35,1.35,1.35);
  const material=new THREE.MeshStandardMaterial({color:0xb8d4ff,roughness:0.55,metalness:0.08});
  const instanced=new THREE.InstancedMesh(geometry,material,3);instanced.name='browser-selftest:instances';
  const m=new THREE.Matrix4();[-2.2,0,2.2].forEach((x,i)=>{m.makeTranslation(x,0,0);instanced.setMatrixAt(i,m);});instanced.instanceMatrix.needsUpdate=true;scene.add(instanced);

  const single=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.8),new THREE.MeshStandardMaterial({color:0xffc78e,roughness:0.65}));single.position.set(0,0,2.2);single.name='browser-selftest:single';scene.add(single);
  scene.updateMatrixWorld(true);

  const targetBounds={minX:-3.1,minY:-0.8,minZ:-0.9,maxX:3.1,maxY:0.8,maxZ:0.9};
  const payload={
    ownerId:'browser-selftest',
    root:scene,
    physics:{
      visualProbeTargets:[{targetKind:'fixture-component',id:'browser-selftest:instances',bounds:targetBounds,labels:['browser-selftest','instances'],visualObjects:[instanced]}],
      platforms:[{id:'browser-selftest:platform',x:0,z:0,hx:3.4,hz:1.15,y:-0.82}],
      circulationReservations:[{id:'browser-selftest:reservation',minX:-3.2,minY:-0.72,minZ:-0.35,maxX:3.2,maxY:-0.48,maxZ:0.35}],
      guardSpans:[{id:'browser-selftest:guard',x1:-3.0,z1:0.9,x2:3.0,z2:0.9,yMin:-0.4,yMax:0.8,thickness:0.08}],
    },
  };

  const camera=new THREE.PerspectiveCamera(55,16/9,0.03,100);camera.position.set(0,4.5,9);camera.lookAt(0,0,0);
  const canvas=document.createElement('canvas');canvas.id='live';document.body.appendChild(canvas);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(480,270,false);renderer.render(scene,camera);
  const api=installJwebVisualProbe({THREE,scene,camera,renderer,composer:null,getPayloadEntries:()=>[{payload,chunkKey:'browser-selftest'}],getStatus:()=>({worldStream:{localRenderRing:{complete:true}},authored:{structuresComplete:true,pendingSites:0}})});

  const exact=api.search({id:'browser-selftest:instances',kind:'fixture-component'});
  assert(exact.length===1,'exact ID lookup must resolve exactly one target');
  assert(api.search({id:'browser-selftest',kind:'fixture-component'}).length===0,'object id must not degrade into substring matching');

  const bundle=await api.captureTarget({id:'browser-selftest:instances',kind:'fixture-component'},{width:360,height:240,views:['front'],worldContext:false,passes:DEFAULT_RENDER_PASSES,filters:['sobel','highpass-3'],name:'browser-selftest'});
  const pngEntries=bundle.entries.filter(entry=>entry.name.endsWith('.png'));
  assert(pngEntries.length===DEFAULT_RENDER_PASSES.length+2,`unexpected PNG count ${pngEntries.length}`);
  for(const entry of pngEntries)await assertPng(entry.data,entry.name);
  assert(bundle.manifest.fragments.length===1,'exact instanced target should isolate one render fragment');
  assert(bundle.manifest.fragments[0].instances===3,'isolated instanced fragment should contain exactly 3 instances');
  assert(bundle.manifest.segmentation.objectId.length===1,'object-id map should contain one isolated render object');
  assert(bundle.manifest.segmentation.instanceId.length===3,'instance-id map should contain three source instances');
  assert(bundle.manifest.physicalColliderProxyCount>0,'collider pass should contain physical proxy geometry');
  assert(bundle.manifest.semanticProxyCount>0,'semantic pass should contain semantic proxy geometry');

  const objectId=await rgba(entryBy(bundle,'front.isolated.object-id.png').data);
  const instanceId=await rgba(entryBy(bundle,'front.isolated.instance-id.png').data);
  for(const record of bundle.manifest.segmentation.objectId)assert(hasRgb(objectId.data,record.rgb),`object-id PNG missing exact mapped color ${record.hex}`);
  for(const record of bundle.manifest.segmentation.instanceId)assert(hasRgb(instanceId.data,record.rgb),`instance-id PNG missing exact mapped color ${record.hex} for source instance ${record.sourceInstanceIndex}`);

  const collider=await rgba(entryBy(bundle,'front.isolated.collider.png').data);
  assert(hasRgb(collider.data,rgbOfInt(DIAGNOSTIC_COLORS.collider)),'collider mask missing exact collider palette color');
  const semantic=await rgba(entryBy(bundle,'front.isolated.semantic.png').data);
  const semanticColors=['connector','reservation','surface','edge','guard'].map(key=>rgbOfInt(DIAGNOSTIC_COLORS[key]));
  assert(semanticColors.some(color=>hasRgb(semantic.data,color)),'semantic mask contains none of the exact semantic palette colors');

  const zip=await bundle.zip();const zipHead=new Uint8Array(await zip.slice(0,4).arrayBuffer());assert(zipHead[0]===0x50&&zipHead[1]===0x4b,'capture ZIP missing PK signature');
  const oneInstance=await api.captureObject({uuid:instanced.uuid,instanceId:1},{width:240,height:180,views:['front'],worldContext:false,passes:['beauty','instance-id'],filters:[],name:'browser-selftest-one-instance'});
  assert(oneInstance.manifest.selectionMode==='exact-render-fragments','picked instance must use exact render-fragment selection');
  assert(oneInstance.manifest.fragments.length===1&&oneInstance.manifest.fragments[0].instances===1,'picked instance capture must contain exactly one shared-mesh instance');
  assert(oneInstance.manifest.segmentation.instanceId.length===1&&oneInstance.manifest.segmentation.instanceId[0].sourceInstanceIndex===1,'picked instance segmentation must map back to source instance 1');
  let duplicateRejected=false;try{await api.captureSet([{query:{id:'browser-selftest:instances',kind:'fixture-component'},options:{views:['front'],passes:['beauty'],filters:[],worldContext:false}},{query:{id:'browser-selftest:instances',kind:'fixture-component'},options:{views:['front'],passes:['beauty'],filters:[],worldContext:false}}]).then(set=>set.zip());}catch(error){log(`capture-set error: ${error.message}`);throw error;}
  duplicateRejected=true;assert(duplicateRejected,'capture-set should zip cleanly with duplicate logical requests');

  const decomposition=await api.captureDecomposition({id:'browser-selftest:instances',kind:'fixture-component'},{maxParts:1,views:['front'],passes:['beauty'],filters:[],worldContext:false});
  assert(decomposition.manifest.captures.length===1,'maxParts=1 must mean exactly one decomposition capture');
  await decomposition.zip();

  renderer.dispose();geometry.dispose();material.dispose();single.geometry.dispose();single.material.dispose();
  document.body.dataset.status='PASS';out.className='pass';
  log(`PASS\nPNG entries: ${pngEntries.length}\nobject IDs: ${bundle.manifest.segmentation.objectId.length}\ninstance IDs: ${bundle.manifest.segmentation.instanceId.length}\nphysical proxies: ${bundle.manifest.physicalColliderProxyCount}\nsemantic proxies: ${bundle.manifest.semanticProxyCount}`);
  window.__jwebVisualHarnessBrowserSelftest={pass:true,bundle};
}

main().catch(error=>{document.body.dataset.status='FAIL';out.className='fail';out.textContent=`FAIL\n${error?.stack??error}`;console.error(error);window.__jwebVisualHarnessBrowserSelftest={pass:false,error:String(error?.stack??error)};});
