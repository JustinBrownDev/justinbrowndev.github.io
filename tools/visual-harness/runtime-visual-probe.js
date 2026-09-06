import {
  JWEB_VISUAL_PROBE_SCHEMA,
  DEFAULT_RENDER_PASSES,
  DEFAULT_IMAGE_FILTERS,
  DIAGNOSTIC_COLORS,
  applyImageFilterRGBA,
  buildColliderProxyScene,
  buildIsolatedVisualScene,
  buildTargetCatalog,
  boundsCenter,
  boundsIntersects,
  expandBounds,
  frameCameraForBounds,
  searchTargetCatalog,
  serializableTarget,
  stableHash32,
  unionBounds,
  visualFragmentForInstance,
  visualFragmentsForBounds,
  visualFragmentsForObjects,
} from './visual-probe-core.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeFile(value) {
  return String(value ?? 'capture').replace(/[^A-Za-z0-9_.+-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,140) || 'capture';
}

function normalizedZipPath(value) {
  const path=String(value??'').replace(/\\/g,'/').replace(/^\.\//,'');
  if(!path || path.startsWith('/') || path.includes('\0') || path.split('/').some(part=>part==='..')) throw new Error(`unsafe ZIP entry path: ${JSON.stringify(value)}`);
  return path;
}

function hexFromRgb(rgb){return `#${rgb.map(v=>Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('')}`;}
function intFromRgb(rgb){return ((rgb[0]&255)<<16)|((rgb[1]&255)<<8)|(rgb[2]&255);}
function allocateStableRgb(key,used){
  let value=stableHash32(key)&0xffffff;
  if(value===0)value=0x010101;
  while(used.has(value)) value=(value+0x9e3779)&0xffffff || 0x010101;
  used.add(value); return [(value>>>16)&255,(value>>>8)&255,value&255];
}

function buildSegmentationPalette(scene){
  const objectColors=new Map(),instanceColors=new Map(),objects=[],instances=[];
  const usedObjects=new Set(),usedInstances=new Set(); let meshIndex=0;
  scene.traverse(mesh=>{
    if(!mesh?.isMesh)return;
    const source=mesh.userData?.visualProbeSource??{};
    const sourceName=String(source.sourceObjectName??mesh.name??'');
    const rootName=String(source.rootName??'');
    const fragmentIndex=Number.isInteger(source.fragmentIndex)?source.fragmentIndex:meshIndex;
    const objectKey=`${rootName}|${sourceName}|fragment:${fragmentIndex}`;
    const objectRgb=allocateStableRgb(objectKey,usedObjects); objectColors.set(mesh.uuid,objectRgb);
    objects.push({rgb:objectRgb,hex:hexFromRgb(objectRgb),fragmentIndex,rootName,sourceObjectName:sourceName,sourceObjectUuid:String(source.sourceObjectUuid??''),renderObjectName:String(mesh.name??''),renderObjectUuid:String(mesh.uuid??'')});
    if(mesh.isInstancedMesh){
      const sourceIndices=Array.isArray(source.sourceInstanceIndices)?source.sourceInstanceIndices:[];
      for(let localIndex=0;localIndex<mesh.count;localIndex++){
        const sourceInstanceIndex=Number.isInteger(sourceIndices[localIndex])?sourceIndices[localIndex]:localIndex;
        const key=`${objectKey}|instance:${sourceInstanceIndex}`;
        const rgb=allocateStableRgb(key,usedInstances); instanceColors.set(`${mesh.uuid}:${localIndex}`,rgb);
        instances.push({rgb,hex:hexFromRgb(rgb),fragmentIndex,rootName,sourceObjectName:sourceName,sourceObjectUuid:String(source.sourceObjectUuid??''),renderObjectName:String(mesh.name??''),renderObjectUuid:String(mesh.uuid??''),localInstanceIndex:localIndex,sourceInstanceIndex});
      }
    }else{
      const rgb=allocateStableRgb(`${objectKey}|mesh`,usedInstances); instanceColors.set(`${mesh.uuid}:mesh`,rgb);
      instances.push({rgb,hex:hexFromRgb(rgb),fragmentIndex,rootName,sourceObjectName:sourceName,sourceObjectUuid:String(source.sourceObjectUuid??''),renderObjectName:String(mesh.name??''),renderObjectUuid:String(mesh.uuid??''),localInstanceIndex:null,sourceInstanceIndex:null});
    }
    meshIndex++;
  });
  return {objectColors,instanceColors,manifest:{objectId:objects,instanceId:instances}};
}

function diagnosticPass(pass){return ['silhouette','normals','depth','wireframe','object-id','instance-id','collider','semantic'].includes(pass);}

async function settleOrThrow(waitForSettled,wait,requireSettled,label){
  if(!wait)return null;
  const result=await waitForSettled(wait===true?{}:wait);
  if(requireSettled!==false && !result.ok) throw new Error(`${label} timed out waiting for requested world state after ${Math.round(result.elapsedMs)} ms`);
  return result;
}

function cameraRecord(camera) {
  return {
    type:camera.type,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),
    fov:camera.fov??null,aspect:camera.aspect??null,near:camera.near,far:camera.far,
    left:camera.left??null,right:camera.right??null,top:camera.top??null,bottom:camera.bottom??null,zoom:camera.zoom??1,
  };
}

function cloneCamera(camera, aspect) {
  const copy=camera.clone(); copy.aspect=aspect; copy.updateProjectionMatrix(); return copy;
}

function canvasBlob(canvas, type='image/png') {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('canvas.toBlob returned null')),type));
}

function dataViewWrite(view, offset, values) {
  for (const [kind,value] of values) { view[kind](offset,value,true); offset += kind.endsWith('16') ? 2 : 4; }
  return offset;
}

const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[i]=c>>>0;}return table;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function dosTime(date=new Date()) { return ((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((date.getSeconds()/2)&31); }
function dosDate(date=new Date()) { return (((date.getFullYear()-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31); }

export async function createStoreZip(entries) {
  if(!Array.isArray(entries))throw new Error('createStoreZip requires an array of entries');
  if(entries.length>0xffff)throw new Error('ZIP64 is not supported; too many entries');
  const enc=new TextEncoder(), prepared=[],seen=new Set(); let localSize=0, centralSize=0;
  for (const entry of entries) {
    const path=normalizedZipPath(entry?.name);
    if(seen.has(path))throw new Error(`duplicate ZIP entry path: ${path}`); seen.add(path);
    const name=enc.encode(path);
    let data;
    if(entry?.data instanceof Uint8Array)data=entry.data;
    else if(typeof entry?.data==='string')data=enc.encode(entry.data);
    else if(entry?.data?.arrayBuffer)data=new Uint8Array(await entry.data.arrayBuffer());
    else throw new Error(`ZIP entry ${path} has unsupported data`);
    if(data.length>0xffffffff)throw new Error(`ZIP64 is not supported; entry too large: ${path}`);
    const crc=crc32(data); prepared.push({name,data,crc}); localSize += 30+name.length+data.length; centralSize += 46+name.length;
  }
  if(localSize+centralSize+22>0xffffffff)throw new Error('ZIP64 is not supported; archive too large');
  const out=new Uint8Array(localSize+centralSize+22); const view=new DataView(out.buffer); let p=0, offset=0; const central=[]; const now=new Date(), dt=dosTime(now), dd=dosDate(now);
  for(const item of prepared){
    offset=p; view.setUint32(p,0x04034b50,true);p+=4;
    p=dataViewWrite(view,p,[['setUint16',20],['setUint16',0],['setUint16',0],['setUint16',dt],['setUint16',dd],['setUint32',item.crc],['setUint32',item.data.length],['setUint32',item.data.length],['setUint16',item.name.length],['setUint16',0]]);
    out.set(item.name,p);p+=item.name.length;out.set(item.data,p);p+=item.data.length;central.push({...item,offset});
  }
  const centralStart=p;
  for(const item of central){
    view.setUint32(p,0x02014b50,true);p+=4;
    p=dataViewWrite(view,p,[['setUint16',20],['setUint16',20],['setUint16',0],['setUint16',0],['setUint16',dt],['setUint16',dd],['setUint32',item.crc],['setUint32',item.data.length],['setUint32',item.data.length],['setUint16',item.name.length],['setUint16',0],['setUint16',0],['setUint16',0],['setUint16',0],['setUint32',0],['setUint32',item.offset]]);
    out.set(item.name,p);p+=item.name.length;
  }
  const centralLength=p-centralStart;
  view.setUint32(p,0x06054b50,true);p+=4;
  p=dataViewWrite(view,p,[['setUint16',0],['setUint16',0],['setUint16',central.length],['setUint16',central.length],['setUint32',centralLength],['setUint32',centralStart],['setUint16',0]]);
  return new Blob([out],{type:'application/zip'});
}

function triggerDownload(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}

function copyRendererSettings(from,to) {
  for (const key of ['outputColorSpace','toneMapping','toneMappingExposure']) if (key in from && key in to) to[key]=from[key];
  if (to.shadowMap && from.shadowMap) { to.shadowMap.enabled=from.shadowMap.enabled; to.shadowMap.type=from.shadowMap.type; }
}

function createCaptureRenderer(THREE, sourceRenderer, width, height, {antialias=true}={}) {
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const renderer=new THREE.WebGLRenderer({canvas,antialias,preserveDrawingBuffer:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(1); renderer.setSize(width,height,false); copyRendererSettings(sourceRenderer,renderer);
  return renderer;
}

function sceneMeshes(scene){const out=[];scene.traverse(o=>{if(o?.isMesh)out.push(o);});return out;}

async function renderPass({THREE,renderer,scene,camera,pass,physicalBundle=null,semanticBundle=null,overlayBundle=null,segmentationPalette=null}) {
  const bg=scene.background, override=scene.overrideMaterial; const temporary=[]; const materialStash=[]; const instanceColorStash=[];
  const meshes=sceneMeshes(scene);
  const setMaterials=(factory)=>{for(const mesh of meshes){materialStash.push([mesh,mesh.material]);mesh.material=factory(mesh);temporary.push(...(Array.isArray(mesh.material)?mesh.material:[mesh.material]));}};
  const renderBundle=async(bundle,label)=>{
    if(!bundle) throw new Error(`${label} pass requested without ${label} scene`);
    const oldBg=bundle.scene.background; bundle.scene.background=new THREE.Color(0x000000);
    try { renderer.render(bundle.scene,camera); return await canvasBlob(renderer.domElement); }
    finally { bundle.scene.background=oldBg; }
  };
  try {
    if(pass==='silhouette') { scene.background=new THREE.Color(0x000000); scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}); temporary.push(scene.overrideMaterial); }
    else if(pass==='normals') { scene.background=new THREE.Color(0x000000); scene.overrideMaterial=new THREE.MeshNormalMaterial({side:THREE.DoubleSide,toneMapped:false}); temporary.push(scene.overrideMaterial); }
    else if(pass==='depth') { scene.background=new THREE.Color(0xffffff); scene.overrideMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,side:THREE.DoubleSide,toneMapped:false}); temporary.push(scene.overrideMaterial); }
    else if(pass==='wireframe') { scene.background=new THREE.Color(0x000000); scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,side:THREE.DoubleSide,toneMapped:false}); temporary.push(scene.overrideMaterial); }
    else if(pass==='object-id') {
      if(!segmentationPalette)throw new Error('object-id pass requires segmentation palette');
      scene.background=new THREE.Color(0x000000); scene.overrideMaterial=null;
      setMaterials(mesh=>{const rgb=segmentationPalette.objectColors.get(mesh.uuid);if(!rgb)throw new Error(`missing object-id color for ${mesh.name||mesh.uuid}`);return new THREE.MeshBasicMaterial({color:intFromRgb(rgb),side:THREE.DoubleSide,toneMapped:false});});
    } else if(pass==='instance-id') {
      if(!segmentationPalette)throw new Error('instance-id pass requires segmentation palette');
      // A normal object-ID pass is not enough for JWEB because many unrelated stairs,
      // rails and facade pieces share one InstancedMesh. Give every visible instance
      // a stable color without mutating the live mesh's original instance colors.
      scene.background=new THREE.Color(0x000000); scene.overrideMaterial=null;
      for(const mesh of meshes){
        materialStash.push([mesh,mesh.material]);
        const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
        mesh.material=material; temporary.push(material);
        if(mesh.isInstancedMesh){
          instanceColorStash.push([mesh,mesh.instanceColor]);
          const colors=new Float32Array(Math.max(0,mesh.count)*3);
          for(let i=0;i<mesh.count;i++){
            const rgb=segmentationPalette.instanceColors.get(`${mesh.uuid}:${i}`),o=i*3;
            if(!rgb)throw new Error(`missing instance-id color for ${mesh.name||mesh.uuid} instance ${i}`);
            // Instance colors are raw linear shader attributes. Convert the exact
            // sRGB byte ID through THREE.Color so the output bytes round-trip.
            const c=new THREE.Color(intFromRgb(rgb));
            colors[o]=c.r;colors[o+1]=c.g;colors[o+2]=c.b;
          }
          mesh.instanceColor=new THREE.InstancedBufferAttribute(colors,3);
          mesh.instanceColor.needsUpdate=true;
        } else {
          const rgb=segmentationPalette.instanceColors.get(`${mesh.uuid}:mesh`);if(!rgb)throw new Error(`missing instance-id color for ${mesh.name||mesh.uuid}`);material.color.setHex(intFromRgb(rgb));
        }
      }
    } else if(pass==='collider') return renderBundle(physicalBundle,'collider');
    else if(pass==='semantic') return renderBundle(semanticBundle,'semantic');
    else if(pass==='visual-collider-overlay') {
      if(!overlayBundle) throw new Error('overlay pass requested without overlay scene');
      for(const record of overlayBundle.records){scene.add(record.mesh);record.mesh.userData.__visualProbeOverlay=true;}
    } else if(pass!=='beauty' && pass!=='world-context') throw new Error(`unknown render pass: ${pass}`);
    renderer.render(scene,camera);
    return canvasBlob(renderer.domElement);
  } finally {
    if(pass==='visual-collider-overlay' && overlayBundle) for(const record of overlayBundle.records) if(record.mesh.parent===scene) overlayBundle.scene.add(record.mesh);
    for(const [mesh,attr] of instanceColorStash){mesh.instanceColor=attr;if(attr)attr.needsUpdate=true;}
    for(const [mesh,mat] of materialStash) mesh.material=mat;
    scene.background=bg; scene.overrideMaterial=override;
    for(const material of temporary) material?.dispose?.();
  }
}

async function filteredBlob(blob,filter,width,height) {
  const bitmap=await createImageBitmap(blob); const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
  const image=ctx.getImageData(0,0,width,height); const filtered=applyImageFilterRGBA(image.data,width,height,filter);ctx.putImageData(new ImageData(filtered,width,height),0,0);
  return canvasBlob(canvas);
}

function payloadEntriesFromContext(context) {
  const raw=context.getPayloadEntries?.() ?? [];
  const seen=new Set(), out=[];
  for(const entry of raw){const payload=entry?.payload??entry;if(!payload?.root)continue;const key=payload.ownerId??payload.root.uuid;if(seen.has(key))continue;seen.add(key);out.push({...entry,payload});}
  return out;
}

function rootsFromEntries(entries){return entries.map(entry=>entry.payload?.root).filter(Boolean);}

function macroCeilingOccluders(THREE,roots,bounds){
  const out=[];
  if(!bounds)return out;
  for(const root of roots??[]){
    root?.traverse?.(object=>{
      if(!object?.isMesh||!/^ceiling-plane:/.test(String(object.name??'')))return;
      object.updateWorldMatrix?.(true,false);
      const box=new THREE.Box3().setFromObject(object,true);
      if(box.isEmpty())return;
      const b={minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z};
      const xzOverlap=!(b.maxX<bounds.minX||b.minX>bounds.maxX||b.maxZ<bounds.minZ||b.minZ>bounds.maxZ);
      if(xzOverlap&&b.maxY>=bounds.minY)out.push(object);
    });
  }
  return [...new Set(out)];
}

async function withHidden(objects,fn){
  const states=(objects??[]).map(object=>[object,object.visible]);
  try{for(const [object] of states)object.visible=false;return await fn();}
  finally{for(const [object,visible] of states)object.visible=visible;}
}

function meshDescendants(object){const out=[];if(object?.isMesh)out.push(object);else object?.traverse?.(o=>{if(o?.isMesh)out.push(o);});return [...new Set(out)];}

function objectOwner(object){let cursor=object;while(cursor){const id=cursor.userData?.worldChunkOwnerId??cursor.userData?.ownerId;if(id!=null)return String(id);cursor=cursor.parent;}return '';}

function objectChunkKey(object){let cursor=object;while(cursor){const key=cursor.userData?.worldChunkKey??cursor.userData?.chunkKey;if(key!=null)return String(key);cursor=cursor.parent;}return '';}

function fragmentManifest(fragments){return fragments.map(f=>({rootName:f.rootName,objectName:f.objectName,instances:f.instanceIndices?.length??1,triangleCount:f.triangleCount,bounds:f.bounds}));}

export function installJwebVisualProbe(context) {
  if (!context?.THREE || !context.scene || !context.camera || !context.renderer) throw new Error('visual probe requires THREE, scene, camera and renderer');
  const THREE=context.THREE;
  let lastCatalog=[];

  function catalog({refresh=true,...options}={}) {
    if(refresh || !lastCatalog.length) lastCatalog=buildTargetCatalog(THREE,payloadEntriesFromContext(context),options);
    return lastCatalog.map(serializableTarget);
  }

  function search(query,options={}) {
    if(!lastCatalog.length || options.refresh!==false) lastCatalog=buildTargetCatalog(THREE,payloadEntriesFromContext(context));
    return searchTargetCatalog(lastCatalog,query,options).map(serializableTarget);
  }

  function searchObjects(query,{limit=100}={}){
    const q=typeof query==='string'?{text:query}:(query??{}),text=String(q.text??q.name??'').toLowerCase(),uuid=String(q.uuid??'').toLowerCase();
    const requestedInstance=q.instanceId==null?null:Number(q.instanceId);const matches=[];
    context.scene.traverse(object=>{
      if(matches.length>=limit||object===context.scene)return;
      const name=String(object.name??''),id=String(object.uuid??'');
      if(uuid&&id.toLowerCase()!==uuid)return;if(text&&!`${name} ${id} ${object.type??''}`.toLowerCase().includes(text))return;
      if(requestedInstance!=null){
        if(!object.isInstancedMesh||!Number.isInteger(requestedInstance)||requestedInstance<0||requestedInstance>=object.count)return;
        const fragment=visualFragmentForInstance(THREE,object,requestedInstance);if(!fragment?.bounds)return;
        matches.push({targetKind:'render-instance',arrayName:'scene',index:matches.length,id:`${name||id}:instance:${requestedInstance}`,ownerId:objectOwner(object),chunkKey:objectChunkKey(object),bounds:fragment.bounds,labels:['render-instance',name,id,object.type,'instanced-mesh',`instance-${requestedInstance}`].filter(Boolean),raw:{visualFragments:[fragment],sourceObjectUuid:id,sourceObjectName:name,sourceInstanceId:requestedInstance}});
        return;
      }
      const objects=meshDescendants(object);if(!objects.length)return;const fragments=visualFragmentsForObjects(THREE,objects),bounds=unionBounds(fragments.map(f=>f.bounds));if(!bounds)return;
      matches.push({targetKind:'render-object',arrayName:'scene',index:matches.length,id:name||id,ownerId:objectOwner(object),chunkKey:objectChunkKey(object),bounds,labels:['render-object',name,id,object.type,object.isInstancedMesh?'instanced-mesh':null].filter(Boolean),raw:{visualObjects:objects,sourceObjectUuid:id,sourceObjectName:name}});
    });
    return matches;
  }

  function resolveObjectTargets(query,{index=0,all=false}={}){
    const matches=searchObjects(query,{limit:all?10000:index+1});if(all)return matches;const target=matches[index];if(!target)throw new Error(`no render object matched ${JSON.stringify(query)}`);return [target];
  }

  function resolve(query,{index=0,all=false}={}) {
    if(!lastCatalog.length) lastCatalog=buildTargetCatalog(THREE,payloadEntriesFromContext(context));
    const matches=searchTargetCatalog(lastCatalog,query,{limit:all?10000:index+1});
    if(all) return matches;
    const target=matches[index]; if(!target) throw new Error(`no visual-probe target matched ${JSON.stringify(query)}`); return [target];
  }

  function targetTokens(target){
    const text=[target?.id,...(target?.labels??[])].filter(Boolean).join(' ').toLowerCase();
    return new Set(text.split(/[^a-z0-9]+/g).filter(token=>token.length>=4 && !/^\d+$/.test(token)));
  }

  function relationScore(root,target){
    let score=0;
    const rootStructuralOwner=String(root?.raw?.stairOwnerId ?? (root?.targetKind==='stair-assembly'?root?.id:'') ?? '');
    const targetStructuralOwner=String(target?.raw?.stairOwnerId ?? (target?.targetKind==='stair-assembly'?target?.id:'') ?? '');
    if(rootStructuralOwner&&targetStructuralOwner===rootStructuralOwner)score+=5000;
    if(root?.raw?.elementId && target?.raw?.elementId===root.raw.elementId)score+=1000;
    else if(root?.targetKind==='fixture-element' && target?.raw?.elementId===root.id)score+=1200;
    const a=targetTokens(root),b=targetTokens(target);for(const token of a)if(b.has(token))score+=30;
    const rc=boundsCenter(root.bounds),tc=boundsCenter(target.bounds);const distance=Math.hypot(rc.x-tc.x,rc.y-tc.y,rc.z-tc.z);
    return score-(Number.isFinite(distance)?distance:1e6)*0.02;
  }

  function related(query,{index=0,padding=0.35,limit=24,maxPerKind=6,includeRoots=false}={}){
    const [root]=resolve(query,{index});const area=expandBounds(root.bounds,padding);const counts=new Map();
    const candidates=lastCatalog.filter(target=>target!==root&&(includeRoots||target.targetKind!=='payload-root')&&boundsIntersects(target.bounds,area))
      .map(target=>({target,score:relationScore(root,target)})).sort((a,b)=>b.score-a.score);
    const chosen=[],fixtureFamily=String(root.targetKind).startsWith('fixture-');
    if(fixtureFamily){
      // Fixture elements often have dozens of children of one catalog kind (all are
      // `fixture-component`). Round-robin semantic subfamilies so a decomposition
      // shows a step, riser, collider ramp, handrail, post, etc. instead of merely
      // the N geometrically closest rail posts.
      const groups=new Map(),prefix=String(root.raw?.elementId??root.id??'');
      for(const item of candidates){
        const id=String(item.target.id??''),tail=id.startsWith(prefix+':')?id.slice(prefix.length+1):id;
        const family=tail.split(':')[0]||'component';if(!groups.has(family))groups.set(family,[]);groups.get(family).push(item);
      }
      const priority=family=>/^collider/.test(family)?0:family==='step'?1:family==='riser'?2:/handrail|rail/.test(family)?3:4;
      const ordered=[...groups.entries()].sort((a,b)=>priority(a[0])-priority(b[0])||(b[1][0]?.score??0)-(a[1][0]?.score??0));
      for(let round=0;chosen.length<limit;round++){
        let added=false;for(const [,items] of ordered){if(items[round]){chosen.push(items[round].target);added=true;if(chosen.length>=limit)break;}}if(!added)break;
      }
    }else{
      for(const item of candidates){const kind=item.target.targetKind,n=counts.get(kind)??0;if(n>=maxPerKind)continue;counts.set(kind,n+1);chosen.push(item.target);if(chosen.length>=limit)break;}
    }
    return {root:serializableTarget(root),related:chosen.map(serializableTarget)};
  }

  async function waitForSettled({timeoutMs=45000,pollMs=100,localRender=true,prefetch=false,authoredStructures=false}={}) {
    const started=performance.now();let last=null;
    while(performance.now()-started<timeoutMs){
      last=context.getStatus?.()??{};
      const world=last.worldStream??last.world??{}; const authored=last.authored??{};
      const okLocal=!localRender || world.localRenderRing?.complete || world.localStructuralRenderRing?.complete;
      const okPrefetch=!prefetch || world.localPrefetchRing?.complete;
      const okAuthored=!authoredStructures || authored.structuresComplete===true || authored.pendingSites===0;
      if(okLocal&&okPrefetch&&okAuthored) return {ok:true,elapsedMs:performance.now()-started,status:last};
      await sleep(pollMs);
    }
    return {ok:false,elapsedMs:performance.now()-started,status:last};
  }

  async function captureWorld({width=1280,height=800,passes=['beauty','silhouette','normals','depth'],filters=['highpass-9','sobel'],wait=null,requireSettled=true,download=false,name='jweb-world'}={}) {
    const waitResult=await settleOrThrow(waitForSettled,wait,requireSettled,'world capture');
    const renderer=createCaptureRenderer(THREE,context.renderer,width,height,{antialias:true});
    const diagnosticRenderer=createCaptureRenderer(THREE,context.renderer,width,height,{antialias:false});
    const camera=cloneCamera(context.camera,width/height); const entries=[];
    const needsSegmentation=passes.some(pass=>pass==='object-id'||pass==='instance-id');
    const segmentationPalette=needsSegmentation?buildSegmentationPalette(context.scene):null;
    let screenExactCaptured=false;
    try{
      for(const pass of passes){
        const passRenderer=diagnosticPass(pass)?diagnosticRenderer:renderer;
        const blob=await renderPass({THREE,renderer:passRenderer,scene:context.scene,camera,pass,segmentationPalette});
        entries.push({name:`world/current.${safeFile(pass)}.png`,data:blob});
        if(pass==='beauty')for(const filter of filters)entries.push({name:`world/current.beauty.${safeFile(filter)}.png`,data:await filteredBlob(blob,filter,width,height)});
      }
      try{
        if(context.composer) context.composer.render(); else context.renderer.render(context.scene,context.camera);
        entries.push({name:'world/current.screen-exact.png',data:await canvasBlob(context.renderer.domElement)});screenExactCaptured=true;
      }catch(error){console.warn('[visual-probe] exact screen capture unavailable',error);}
      const warnings=[];if(!screenExactCaptured)warnings.push('exact live canvas capture was unavailable; off-screen world passes are still present');
      const meta={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'world',createdAt:new Date().toISOString(),width,height,screenExactCaptured,screenExactSize:{width:context.renderer.domElement.width,height:context.renderer.domElement.height},camera:cameraRecord(camera),status:context.getStatus?.()??null,waitResult,passes:[...passes],filters:[...filters],segmentation:segmentationPalette?.manifest??null,warnings};
      entries.push({name:'world/manifest.json',data:new Blob([JSON.stringify(meta,null,2)],{type:'application/json'})});
      const bundle={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'world',entries,manifest:meta,async zip(){return createStoreZip(entries);},async download(filename=`${safeFile(name)}.zip`){const blob=await createStoreZip(entries);triggerDownload(blob,filename);return filename;}};
      if(download) await bundle.download(); return bundle;
    } finally {renderer.dispose();diagnosticRenderer.dispose();}
  }

  async function captureTarget(query,{index=0,all=false,width=1100,height=800,padding=0.55,views=['iso','front','right','top'],projection='perspective',passes=DEFAULT_RENDER_PASSES,filters=DEFAULT_IMAGE_FILTERS,worldContext=true,wait=null,requireSettled=true,download=false,name=null}={}) {
    const waitResult=await settleOrThrow(waitForSettled,wait,requireSettled,'target capture');
    const payloadEntries=payloadEntriesFromContext(context); lastCatalog=buildTargetCatalog(THREE,payloadEntries);
    const objectQuery=query&&typeof query==='object'&&Object.prototype.hasOwnProperty.call(query,'renderObject');
    const targets=objectQuery?resolveObjectTargets(query.renderObject,{index,all}):resolve(query,{index,all}); const authorityBounds=unionBounds(targets.map(t=>t.bounds)); if(!authorityBounds) throw new Error('target has no finite bounds');
    const selectionBounds=expandBounds(authorityBounds,padding);
    const exactVisualFragments=targets.flatMap(t=>t.raw?.visualFragments??[]);
    const exactVisualObjects=[...new Set(targets.flatMap(t=>t.raw?.visualObjects??[]))];
    const exactColliderObjects=[...new Set(targets.flatMap(t=>t.raw?.colliderObjects??[]))];
    const structuralOwners=[...new Set(targets.map(t=>t.raw?.stairOwnerId??(t.targetKind==='stair-assembly'?t.id:null)).filter(Boolean).map(String))];
    const structuralOwnerId=structuralOwners.length===1?structuralOwners[0]:null;
    const exactDisplayObjects=exactVisualObjects.length?exactVisualObjects:(exactColliderObjects.length?exactColliderObjects:null);
    const isolatedSource=exactVisualFragments.length?'exact-render-fragments':(exactVisualObjects.length?'exact-visual-components':(exactColliderObjects.length?'exact-collider-components':'semantic-bounds'));
    const targetRoots=rootsFromEntries(payloadEntries);
    const ceilingTarget=targets.some(target=>[target?.id,...(target?.labels??[])].some(value=>/^ceiling-plane:/.test(String(value??''))));
    const rawFragments=exactVisualFragments.length?exactVisualFragments:(exactDisplayObjects?visualFragmentsForObjects(THREE,exactDisplayObjects):visualFragmentsForBounds(THREE,targetRoots,selectionBounds,{includeInvisible:true}));
    const suppressedIsolatedCeilings=ceilingTarget?[]:rawFragments.filter(fragment=>/^ceiling-plane:/.test(String(fragment?.object?.name??'')));
    const fragments=ceilingTarget?rawFragments:rawFragments.filter(fragment=>!/^ceiling-plane:/.test(String(fragment?.object?.name??''))); if(!fragments.length) console.warn('[visual-probe] target matched semantic authority but no visual mesh instances intersected its bounds',targets.map(t=>t.id));
    const topWorldCeilings=ceilingTarget?[]:macroCeilingOccluders(THREE,targetRoots,selectionBounds);
    const isolated=buildIsolatedVisualScene(THREE,fragments,{sourceScene:context.scene,background:0x080808}); isolated.scene.fog=null;
    const exactColliders=exactColliderObjects.length?exactColliderObjects:null;
    const physical=buildColliderProxyScene(THREE,payloadEntries,selectionBounds,{includePhysical:true,includeSemantic:false,background:0x000000,exactObjects:exactColliders,style:'mask',structuralOwnerId});
    const semantic=buildColliderProxyScene(THREE,payloadEntries,selectionBounds,{includePhysical:false,includeSemantic:true,background:0x000000,style:'mask',structuralOwnerId});
    const overlay=buildColliderProxyScene(THREE,payloadEntries,selectionBounds,{includePhysical:true,includeSemantic:true,background:0x000000,exactObjects:exactColliders,style:'overlay',structuralOwnerId});
    const fragmentBounds=unionBounds(fragments.map(f=>f.bounds));
    const frameBounds=exactDisplayObjects?unionBounds(authorityBounds,fragmentBounds):authorityBounds;
    const renderer=createCaptureRenderer(THREE,context.renderer,width,height,{antialias:true});
    const diagnosticRenderer=createCaptureRenderer(THREE,context.renderer,width,height,{antialias:false});
    const segmentationPalette=buildSegmentationPalette(isolated.scene);
    const entries=[]; const cameraRecords={}; const baseName=safeFile(name??targets[0]?.id??'target');
    try{
      for(const view of views){
        const camera=frameCameraForBounds(THREE,frameBounds,{view,projection,aspect:width/height});cameraRecords[view]=cameraRecord(camera);
        if(worldContext){const render=()=>renderPass({THREE,renderer,scene:context.scene,camera,pass:'world-context'});const blob=view==='top'&&topWorldCeilings.length?await withHidden(topWorldCeilings,render):await render();entries.push({name:`targets/${baseName}/${view}.world-context.beauty.png`,data:blob});}
        let beautyBlob=null;
        for(const pass of passes){
          const passRenderer=diagnosticPass(pass)?diagnosticRenderer:renderer;
          const blob=await renderPass({THREE,renderer:passRenderer,scene:isolated.scene,camera,pass,physicalBundle:physical,semanticBundle:semantic,overlayBundle:overlay,segmentationPalette});entries.push({name:`targets/${baseName}/${view}.isolated.${safeFile(pass)}.png`,data:blob});if(pass==='beauty')beautyBlob=blob;
        }
        if(beautyBlob) for(const filter of filters) entries.push({name:`targets/${baseName}/${view}.isolated.beauty.${safeFile(filter)}.png`,data:await filteredBlob(beautyBlob,filter,width,height)});
      }
      const warnings=[];if(!fragments.length)warnings.push('semantic target matched, but no visual fragments intersected the selection bounds');if(suppressedIsolatedCeilings.length||topWorldCeilings.length)warnings.push('macro ceiling plane was suppressed only for diagnostic visibility; suppression is recorded in this manifest');
      const meta={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'target',createdAt:new Date().toISOString(),query,index,all,width,height,padding,views,projection,passes:[...passes],filters:[...filters],worldContext,waitResult,targetBounds:authorityBounds,authorityBounds,selectionBounds,frameBounds,selectionMode:exactVisualFragments.length?'exact-render-fragments':(exactVisualObjects.length||exactColliderObjects.length?'exact-fixture-components':'semantic-bounds'),isolatedSource,structuralOwnerId,colliderSelectionMode:structuralOwnerId?'structural-owner':'bounds',diagnosticVisibility:{macroCeilingSuppressed:!!(suppressedIsolatedCeilings.length||topWorldCeilings.length),isolatedSuppressedNames:[...new Set(suppressedIsolatedCeilings.map(fragment=>fragment?.object?.name).filter(Boolean))],topWorldContextSuppressedNames:[...new Set(topWorldCeilings.map(object=>object?.name).filter(Boolean))]},exactVisualFragmentCount:exactVisualFragments.length,exactVisualObjectCount:exactVisualObjects.length,exactColliderObjectCount:exactColliderObjects.length,targets:targets.map(serializableTarget),fragments:fragmentManifest(fragments),colliderProxyCount:physical.records.length,physicalColliderProxyCount:physical.records.length,semanticProxyCount:semantic.records.length,overlayProxyCount:overlay.records.length,segmentation:segmentationPalette.manifest,diagnosticPalette:{collider:DIAGNOSTIC_COLORS.collider,connector:DIAGNOSTIC_COLORS.connector,reservation:DIAGNOSTIC_COLORS.reservation,surface:DIAGNOSTIC_COLORS.surface,edge:DIAGNOSTIC_COLORS.edge,guard:DIAGNOSTIC_COLORS.guard},warnings,cameras:cameraRecords,status:context.getStatus?.()??null};
      entries.push({name:`targets/${baseName}/manifest.json`,data:new Blob([JSON.stringify(meta,null,2)],{type:'application/json'})});
      const bundle={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'target',entries,manifest:meta,async zip(){return createStoreZip(entries);},async download(filename=`jweb-probe-${baseName}.zip`){const blob=await createStoreZip(entries);triggerDownload(blob,filename);return filename;}};
      if(download) await bundle.download(); return bundle;
    } finally {
      renderer.dispose();diagnosticRenderer.dispose();
      // Isolated clones deliberately share the live source geometry/materials; never dispose those here.
      for(const bundle of [physical,semantic,overlay]){
        const geometries=new Set(),materials=new Set(bundle.materials??[]);
        for(const record of bundle.records){if(record.ownsGeometry!==false&&record.mesh.geometry)geometries.add(record.mesh.geometry);for(const material of (Array.isArray(record.mesh.material)?record.mesh.material:[record.mesh.material]))if(material)materials.add(material);}
        for(const geometry of geometries)geometry.dispose?.();
        for(const material of materials)material.dispose?.();
      }
    }
  }

  async function captureObject(query,options={}){return captureTarget({renderObject:query},options);}

  async function captureDecomposition(query,{index=0,maxParts=12,relatedPadding=0.35,maxPerKind=4,width=960,height=720,views=['iso'],projection='perspective',passes=['beauty','silhouette','instance-id','collider','semantic','visual-collider-overlay'],filters=['sobel'],worldContext=false,padding=0.2,download=false,name=null}={}){
    if(!lastCatalog.length)lastCatalog=buildTargetCatalog(THREE,payloadEntriesFromContext(context));
    const [root]=resolve(query,{index});
    const total=Math.max(1,Number(maxParts)||1);
    const relations=total===1
      ? {root:serializableTarget(root),related:[]}
      : related({id:root.id,kind:root.targetKind,ownerId:root.ownerId},{padding:relatedPadding,limit:total-1,maxPerKind});
    const selected=[relations.root,...relations.related];const entries=[],captures=[];
    for(let partIndex=0;partIndex<selected.length;partIndex++){
      const target=selected[partIndex];
      const bundle=await captureTarget({id:target.id,kind:target.targetKind,ownerId:target.ownerId},{width,height,views,projection,passes,filters,worldContext,padding,download:false,name:`part-${String(partIndex).padStart(3,'0')}--${root.id}--${target.targetKind}--${target.id}`});
      entries.push(...bundle.entries);captures.push(bundle.manifest);
    }
    const meta={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'decomposition',createdAt:new Date().toISOString(),query,index,root:relations.root,related:relations.related,options:{maxParts,relatedPadding,maxPerKind,width,height,views,projection,passes,filters,worldContext,padding},captures};
    entries.push({name:'decomposition-manifest.json',data:new Blob([JSON.stringify(meta,null,2)],{type:'application/json'})});
    const baseName=safeFile(name??root.id??'decomposition');
    const bundle={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'decomposition',entries,manifest:meta,async zip(){return createStoreZip(entries);},async download(filename=`jweb-decompose-${baseName}.zip`){const blob=await createStoreZip(entries);triggerDownload(blob,filename);return filename;}};
    if(download)await bundle.download();return bundle;
  }

  async function captureSet(requests,{download=false,name='jweb-visual-probe-set'}={}){
    const entries=[], manifests=[];
    for(let requestIndex=0;requestIndex<requests.length;requestIndex++){const request=requests[requestIndex];const q=typeof request==='object'&&'query'in request?request.query:request;const opts=typeof request==='object'&&'query'in request?(request.options??{}):{};const bundle=await captureTarget(q,{...opts,name:opts.name??`set-${String(requestIndex).padStart(3,'0')}`,download:false});entries.push(...bundle.entries);manifests.push(bundle.manifest);}
    entries.push({name:'capture-set-manifest.json',data:new Blob([JSON.stringify({schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'set',createdAt:new Date().toISOString(),captures:manifests},null,2)],{type:'application/json'})});
    const bundle={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'set',entries,manifests,async zip(){return createStoreZip(entries);},async download(filename=`${safeFile(name)}.zip`){const blob=await createStoreZip(entries);triggerDownload(blob,filename);return filename;}};if(download)await bundle.download();return bundle;
  }

  async function captureInvestigation(requests=[],{
    wait={localRender:true,authoredStructures:true},
    includeWorld=true,
    worldOptions={width:1280,height:800,passes:['beauty'],filters:['sobel']},
    requireSettled=true,
    download=false,
    name='jweb-investigation',
  }={}){
    const settled=await settleOrThrow(waitForSettled,wait,requireSettled,'investigation capture');const entries=[],captures=[];
    if(includeWorld){
      const worldBundle=await captureWorld({...worldOptions,wait:null,download:false});entries.push(...worldBundle.entries);captures.push({kind:'world',manifest:worldBundle.manifest});
    }
    for(let requestIndex=0;requestIndex<requests.length;requestIndex++){
      const request=requests[requestIndex];const spec=typeof request==='object'&&request!==null?request:{query:request};const query=spec.query??spec.target??spec;
      const options={...(spec.options??{}),name:spec.options?.name??`investigation-${String(requestIndex).padStart(3,'0')}`,wait:null,download:false};
      const bundle=spec.decompose?await captureDecomposition(query,options):await captureTarget(query,options);
      entries.push(...bundle.entries);captures.push({kind:spec.decompose?'decomposition':'target',query,manifest:bundle.manifest});
    }
    const meta={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'investigation',createdAt:new Date().toISOString(),settled,includeWorld,worldOptions,requests,captures,status:context.getStatus?.()??null};
    entries.push({name:'investigation-manifest.json',data:new Blob([JSON.stringify(meta,null,2)],{type:'application/json'})});
    const bundle={schema:JWEB_VISUAL_PROBE_SCHEMA,mode:'investigation',entries,manifest:meta,async zip(){return createStoreZip(entries);},async download(filename=`${safeFile(name)}.zip`){const blob=await createStoreZip(entries);triggerDownload(blob,filename);return filename;}};
    if(download)await bundle.download();return bundle;
  }

  function pick(clientX=innerWidth/2,clientY=innerHeight/2){
    const rect=context.renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,-(((clientY-rect.top)/rect.height)*2-1));const ray=new THREE.Raycaster();ray.setFromCamera(ndc,context.camera);const hits=ray.intersectObject(context.scene,true);if(!hits.length)return null;const hit=hits[0],point=hit.point;const nearby=(lastCatalog.length?lastCatalog:(lastCatalog=buildTargetCatalog(THREE,payloadEntriesFromContext(context)))).map(t=>{const c=boundsCenter(t.bounds);return {target:t,d:Math.hypot(c.x-point.x,c.y-point.y,c.z-point.z)};}).sort((a,b)=>a.d-b.d).slice(0,8).map(x=>serializableTarget(x.target));return {object:{name:hit.object.name,type:hit.object.type,uuid:hit.object.uuid,userData:hit.object.userData},captureQuery:{renderObject:{uuid:hit.object.uuid,...(hit.instanceId!=null?{instanceId:hit.instanceId}:{})}},point:point.toArray(),distance:hit.distance,instanceId:hit.instanceId??null,nearbyTargets:nearby};
  }

  const api={schema:JWEB_VISUAL_PROBE_SCHEMA,catalog,search,searchObjects,related,pick,waitForSettled,captureWorld,captureTarget,captureObject,captureDecomposition,captureSet,captureInvestigation,defaults:{renderPasses:DEFAULT_RENDER_PASSES,imageFilters:DEFAULT_IMAGE_FILTERS},help(){return {
    world:`await __jwebVisualProbe.captureWorld({wait:{localRender:true,authoredStructures:true},download:true})`,
    investigation:`await __jwebVisualProbe.captureInvestigation([{query:'compound-stair',decompose:true},{query:'guarded-catwalk'}],{download:true})`,
    search:`__jwebVisualProbe.search('stair')`,
    object:`const hit=__jwebVisualProbe.pick(); await __jwebVisualProbe.captureObject({uuid:hit.object.uuid},{download:true})`,
    target:`await __jwebVisualProbe.captureTarget('compound-stair',{download:true})`,
    decompose:`await __jwebVisualProbe.captureDecomposition('compound-stair',{download:true})`,
    related:`__jwebVisualProbe.related('compound-stair')`,
    set:`await __jwebVisualProbe.captureSet([{query:'stair',options:{index:0}},{query:'guarded-catwalk',options:{index:0}}],{download:true})`,
    pick:`__jwebVisualProbe.pick() // center-screen raycast + nearest semantic targets`,
  };}};
  window.__jwebVisualProbe=api;
  console.info('[visual-probe] installed',api.help());
  return api;
}
