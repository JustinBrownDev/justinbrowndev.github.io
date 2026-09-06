// Adapter from tools/geometry-harness authored fixtures to THREE scenes/payloads.
// This gives the visual probe a true zero-city specimen path: no main.js, no
// streamer and no Kowloon chunk build are required for fixture captures.
import { stableRgb, unionBounds } from './visual-probe-core.js';

const finite = Number.isFinite;
const v3 = (THREE, value=[0,0,0]) => value?.isVector3 ? value.clone() : new THREE.Vector3(Number(value[0])||0, Number(value[1])||0, Number(value[2])||0);
const hasRole = (roles, role) => (roles ?? []).map(String).includes(role);

function colorFor(id, role='visual') {
  if (role === 'collider') return 0x00c9ff;
  const [r,g,b]=stableRgb(id);
  return (r<<16)|(g<<8)|b;
}

function materialFor(THREE,id,role='visual') {
  if (role === 'collider') return new THREE.MeshBasicMaterial({color:colorFor(id,role),transparent:true,opacity:0.65,side:THREE.DoubleSide});
  return new THREE.MeshStandardMaterial({color:colorFor(id),roughness:0.72,metalness:0.08,side:THREE.DoubleSide});
}

function geometryBounds(THREE, object) {
  object.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(object,true);
  if(box.isEmpty()) return null;
  return {minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z};
}

function makeTriangleGeometry(THREE, vertices, faces) {
  const pos=[];
  for(const face of faces ?? []) for(const raw of face){const p=vertices[raw]; if(!p) throw new Error(`fixture face index ${raw} is out of range`); pos.push(Number(p[0]),Number(p[1]),Number(p[2]));}
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); return geometry;
}

function rampGeometry(THREE,start,end,width,thickness=0.14){
  const a=v3(THREE,start),b=v3(THREE,end),horizontal=new THREE.Vector3(b.x-a.x,0,b.z-a.z); const run=horizontal.length();
  if(!(run>1e-8)) throw new Error('fixture ramp/stair requires nonzero horizontal run');
  const d=horizontal.clone().divideScalar(run),side=new THREE.Vector3(-d.z,0,d.x),hw=Math.abs(Number(width))/2;
  const top=[a.clone().addScaledVector(side,-hw),a.clone().addScaledVector(side,hw),b.clone().addScaledVector(side,-hw),b.clone().addScaledVector(side,hw)];
  const bottom=top.map(p=>p.clone().add(new THREE.Vector3(0,-Math.abs(Number(thickness)||0.14),0)));
  const vertices=[...top,...bottom].map(p=>p.toArray());
  const faces=[[0,2,3],[0,3,1],[4,5,7],[4,7,6],[0,4,6],[0,6,2],[1,3,7],[1,7,5],[0,1,5],[0,5,4],[2,6,7],[2,7,3]];
  return makeTriangleGeometry(THREE,vertices,faces);
}

function orientedBoxBetween(THREE,a,b,thickness,id){
  const A=v3(THREE,a),B=v3(THREE,b),delta=B.clone().sub(A),len=delta.length(); if(!(len>1e-8)) return null;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(thickness,thickness,len),materialFor(THREE,id));
  mesh.position.copy(A).add(B).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize()); return mesh;
}

function applyGenericTransform(THREE,group,el){
  const scale=el.scale;
  if(scale!=null){ if(typeof scale==='number') group.scale.setScalar(Number(scale)); else group.scale.set(Number(scale[0])||1,Number(scale[1])||1,Number(scale[2])||1); }
  if(el.yaw_deg!=null) group.rotation.y += THREE.MathUtils.degToRad(Number(el.yaw_deg)||0);
  const p=el.position ?? el.translate; if(p) group.position.add(v3(THREE,p));
}

function parseObjGroups(THREE,text){
  const verts=[],groups=new Map(); let current='default'; groups.set(current,[]);
  const facesFor=()=>{if(!groups.has(current))groups.set(current,[]);return groups.get(current);};
  for(const rawLine of String(text).split(/\r?\n/)){
    const line=rawLine.trim(); if(!line||line.startsWith('#')) continue; const t=line.split(/\s+/);
    if(t[0]==='v'&&t.length>=4){const p=[Number(t[1]),Number(t[2]),Number(t[3])];if(!p.every(finite))throw new Error(`OBJ has non-finite vertex: ${line}`);verts.push(p);}
    else if((t[0]==='g'||t[0]==='o')){current=t[1]||'default';if(!groups.has(current))groups.set(current,[]);}
    else if(t[0]==='f'&&t.length>=4){const ids=t.slice(1).map(tok=>{const head=tok.split('/')[0],raw=Number(head);if(!Number.isInteger(raw)||raw===0)throw new Error(`OBJ invalid face index: ${line}`);const i=raw>0?raw-1:verts.length+raw;if(i<0||i>=verts.length)throw new Error(`OBJ face index out of range: ${raw}`);return i;});for(let i=1;i<ids.length-1;i++)facesFor().push([ids[0],ids[i],ids[i+1]]);}
  }
  if(!verts.length) throw new Error('OBJ contains no vertices');
  const out=[]; for(const [name,faces] of groups){if(!faces.length)continue;out.push({name,geometry:makeTriangleGeometry(THREE,verts,faces)});} if(!out.length)throw new Error('OBJ contains no triangles'); return out;
}

function meshFromGeometry(THREE,geometry,id,role){const mesh=new THREE.Mesh(geometry,materialFor(THREE,id,role));mesh.name=id;mesh.userData.visualProbeRoles=[role];mesh.userData.visualProbeFixtureId=id;return mesh;}

function addRoleGeometry(THREE,groups,records,{id,geometry,roles,setup=null}){
  const roleList=(roles??[]).map(String); const targets=[];
  const add=(root,role)=>{const mesh=meshFromGeometry(THREE,geometry,id,role);setup?.(mesh);root.add(mesh);targets.push(mesh);};
  if(hasRole(roleList,'visual')) add(groups.visual, 'visual');
  if(hasRole(roleList,'collider')) add(groups.collider, 'collider');
  if(!roleList.length) add(groups.diagnostic,'diagnostic');
  records.push({id,roles:roleList,objects:targets});
}

function addBox(THREE,groups,records,{id,center,size,yawDeg=0,roles=[]}){
  const s=(size??[]).map(Number); if(s.length<3||!s.every(finite))throw new Error(`${id}: invalid box size`);
  const geometry=new THREE.BoxGeometry(Math.abs(s[0]),Math.abs(s[1]),Math.abs(s[2]));
  addRoleGeometry(THREE,groups,records,{id,geometry,roles,setup:mesh=>{mesh.position.copy(v3(THREE,center));mesh.rotation.y=THREE.MathUtils.degToRad(Number(yawDeg)||0);}});
}

function addCylinder(THREE,groups,records,{id,center,radius,height,sides=16,roles=[]}){
  const geometry=new THREE.CylinderGeometry(Math.abs(Number(radius)),Math.abs(Number(radius)),Math.abs(Number(height)),Math.max(3,Number(sides)|0));
  addRoleGeometry(THREE,groups,records,{id,geometry,roles,setup:mesh=>mesh.position.copy(v3(THREE,center))});
}

function addRamp(THREE,groups,records,{id,start,end,width,thickness,roles=[]}){
  addRoleGeometry(THREE,groups,records,{id,geometry:rampGeometry(THREE,start,end,width,thickness),roles});
}

function addStair(THREE,groups,records,el){
  const id=String(el.id),a=v3(THREE,el.start),b=v3(THREE,el.end),steps=Number(el.steps)|0,width=Math.abs(Number(el.width));
  if(!(steps>0&&width>0))throw new Error(`${id}: invalid stair steps/width`);
  const hvec=new THREE.Vector3(b.x-a.x,0,b.z-a.z),run=hvec.length();if(!(run>1e-8))throw new Error(`${id}: stair requires horizontal run`);
  const d=hvec.clone().divideScalar(run),side=new THREE.Vector3(-d.z,0,d.x),yaw=Math.atan2(d.x,d.z),stepRun=run/steps,dy=(b.y-a.y)/steps;
  const treadT=Math.abs(Number(el.tread_thickness??0.08)),mode=String(el.construction??'jweb').toLowerCase();
  for(let i=0;i<steps;i++){
    const centerH=a.clone().addScaledVector(d,(i+0.5)*stepRun),topY=a.y+(i+1)*dy; let sy,cy;
    if(['jweb','open','treads','closed'].includes(mode)){sy=treadT;cy=topY-sy/2;} else if(['mass','solid-mass','stacked'].includes(mode)){const baseY=Math.min(a.y,b.y)-treadT;sy=Math.max(treadT,topY-baseY);cy=baseY+sy/2;} else throw new Error(`${id}: unknown stair construction ${mode}`);
    addBox(THREE,groups,records,{id:`${id}:step:${i}`,center:[centerH.x,cy,centerH.z],size:[width,sy,stepRun*1.01],yawDeg:THREE.MathUtils.radToDeg(yaw),roles:['visual']});
    if(mode==='closed'){const front=a.clone().addScaledVector(d,(i+1)*stepRun),rh=Math.max(Math.abs(dy),0.02),rmy=topY-dy/2;addBox(THREE,groups,records,{id:`${id}:riser:${i}`,center:[front.x,rmy,front.z],size:[width,rh,Math.min(0.045,stepRun*0.25)],yawDeg:THREE.MathUtils.radToDeg(yaw),roles:['visual']});}
  }
  addRamp(THREE,groups,records,{id:`${id}:collider-ramp`,start:el.start,end:el.end,width,thickness:el.collider_thickness??0.14,roles:['collider']});
  const rails=el.rails; if(rails&&rails.enabled!==false){const postH=Number(rails.height??0.95),postT=Number(rails.post_thickness??0.045),railT=Number(rails.rail_thickness??0.06),every=Math.max(1,Number(rails.post_every_steps??3)|0),roles=(rails.roles??['visual','collider']).map(String),sides=rails.sides??['left','right'];
    for(const [sideName,sign] of [['left',-1],['right',1]]){if(!sides.includes(sideName))continue;const lateral=side.clone().multiplyScalar(sign*(width/2-postT/2));
      for(let i=0;i<=steps;i+=every){const t=i/steps,p=a.clone().addScaledVector(hvec,t);p.y=a.y+(b.y-a.y)*t;p.add(lateral);addBox(THREE,groups,records,{id:`${id}:rail-post:${sideName}:${i}`,center:[p.x,p.y+postH/2,p.z],size:[postT,postH,postT],roles});}
      const r0=a.clone().add(lateral).add(new THREE.Vector3(0,postH,0)),r1=b.clone().add(lateral).add(new THREE.Vector3(0,postH,0)),railId=`${id}:handrail:${sideName}`,proto=orientedBoxBetween(THREE,r0,r1,railT,railId);
      if(proto){const geometry=proto.geometry,position=proto.position.clone(),quaternion=proto.quaternion.clone();proto.material.dispose();addRoleGeometry(THREE,groups,records,{id:railId,geometry,roles,setup:m=>{m.position.copy(position);m.quaternion.copy(quaternion);}});}
    }
  }
}

function transformElementGroups(THREE,groups,el,type){
  if(['box','landing','cylinder','vertical_cylinder'].includes(type)&&['position','translate','scale'].some(k=>k in el)) throw new Error(`${type} uses direct geometry fields; generic transform is unsupported`);
  if(!['box','landing','cylinder','vertical_cylinder'].includes(type)) for(const g of Object.values(groups)) applyGenericTransform(THREE,g,el);
}

export async function buildGeometryHarnessFixture(THREE,spec,{resolveObjText=null}={}){
  if(!THREE?.Scene||!spec?.elements)throw new Error('fixture adapter requires THREE and a geometry-harness spec');
  const visualRoot=new THREE.Group(),colliderRoot=new THREE.Group(),diagnosticRoot=new THREE.Group();
  visualRoot.name=`fixture:${spec.name??'unnamed'}:visual`;colliderRoot.name=`fixture:${spec.name??'unnamed'}:collider`;diagnosticRoot.name=`fixture:${spec.name??'unnamed'}:diagnostic`;
  const allRecords=[];
  for(let ei=0;ei<spec.elements.length;ei++){
    const el=spec.elements[ei]??{},type=String(el.type??'box').toLowerCase(),id=String(el.id??`element-${ei}`),roles=(el.roles??[]).map(String);
    const local={visual:new THREE.Group(),collider:new THREE.Group(),diagnostic:new THREE.Group()};const before=allRecords.length;
    if(type==='box'||type==='landing')addBox(THREE,local,allRecords,{id,center:el.center??[0,0,0],size:el.size,yawDeg:el.yaw_deg??0,roles});
    else if(type==='cylinder'||type==='vertical_cylinder')addCylinder(THREE,local,allRecords,{id,center:el.center,radius:el.radius,height:el.height,sides:el.sides,roles});
    else if(type==='mesh')addRoleGeometry(THREE,local,allRecords,{id,geometry:makeTriangleGeometry(THREE,el.vertices,el.faces),roles});
    else if(['ramp','ramp_prism'].includes(type))addRamp(THREE,local,allRecords,{id,start:el.start,end:el.end,width:el.width,thickness:el.thickness??0.12,roles});
    else if(['stair','stair_flight'].includes(type))addStair(THREE,local,allRecords,{...el,id});
    else if(['parallelepiped','bounds_box','obb'].includes(type)){
      if(!Array.isArray(el.corners)||el.corners.length!==8)throw new Error(`${id}: parallelepiped requires 8 corners`); const faces=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[0,3,7],[0,7,4],[1,5,6],[1,6,2]];addRoleGeometry(THREE,local,allRecords,{id,geometry:makeTriangleGeometry(THREE,el.corners,faces),roles});
    } else if(type==='obj'){
      if(!resolveObjText)throw new Error(`${id}: OBJ fixture requires resolveObjText`);const text=await resolveObjText(el.path,el,spec);for(const part of parseObjGroups(THREE,text)){const partId=part.name==='default'?id:`${id}:${part.name}`;addRoleGeometry(THREE,local,allRecords,{id:partId,geometry:part.geometry,roles});}
    } else throw new Error(`unsupported geometry-harness fixture element type ${type}`);
    transformElementGroups(THREE,local,el,type); visualRoot.add(local.visual);colliderRoot.add(local.collider);diagnosticRoot.add(local.diagnostic);
    for(let ri=before;ri<allRecords.length;ri++)allRecords[ri].elementId=id;
  }
  visualRoot.updateMatrixWorld(true);colliderRoot.updateMatrixWorld(true);diagnosticRoot.updateMatrixWorld(true);
  const targets=[];for(const record of allRecords){const bounds=unionBounds(record.objects.map(o=>geometryBounds(THREE,o)));if(!bounds)continue;const visualObjects=record.objects.filter(o=>o.userData?.visualProbeRoles?.includes('visual')),colliderObjects=record.objects.filter(o=>o.userData?.visualProbeRoles?.includes('collider')),diagnosticObjects=record.objects.filter(o=>o.userData?.visualProbeRoles?.includes('diagnostic'));targets.push({targetKind:'fixture-component',id:record.id,bounds,labels:['fixture-component',record.id,record.elementId,...record.roles],elementId:record.elementId,roles:record.roles,visualObjects,colliderObjects,diagnosticObjects});}
  const byElement=new Map();for(const target of targets){if(!byElement.has(target.elementId))byElement.set(target.elementId,[]);byElement.get(target.elementId).push(target);}
  for(const [elementId,parts] of byElement){const bounds=unionBounds(parts.map(p=>p.bounds));if(bounds)targets.push({targetKind:'fixture-element',id:elementId,bounds,labels:['fixture-element',elementId],elementId,roles:[...new Set(parts.flatMap(p=>p.roles))],visualObjects:[...new Set(parts.flatMap(p=>p.visualObjects??[]))],colliderObjects:[...new Set(parts.flatMap(p=>p.colliderObjects??[]))],diagnosticObjects:[...new Set(parts.flatMap(p=>p.diagnosticObjects??[]))]});}
  const payload={ownerId:`geometry-fixture:${spec.name??'unnamed'}`,formatVersion:1,root:visualRoot,physics:{visualProbeTargets:targets,visualProbeColliderRoot:colliderRoot},fixtureSpec:spec};
  return {spec,visualRoot,colliderRoot,diagnosticRoot,targets,payload};
}

export async function loadGeometryHarnessFixture(THREE,fixture='apartment-stair',{fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('loadGeometryHarnessFixture requires fetch');
  const safe=String(fixture).replace(/[^A-Za-z0-9_.-]+/g,''); if(!safe)throw new Error('invalid fixture name');
  const specUrl=new URL(`../geometry-harness/specs/${safe.endsWith('.json')?safe:`${safe}.json`}`,import.meta.url);
  const response=await fetchImpl(specUrl);if(!response.ok)throw new Error(`fixture spec load failed ${response.status}: ${specUrl}`);const spec=await response.json();
  return buildGeometryHarnessFixture(THREE,spec,{resolveObjText:async rel=>{const url=new URL(rel,specUrl);const r=await fetchImpl(url);if(!r.ok)throw new Error(`fixture OBJ load failed ${r.status}: ${url}`);return r.text();}});
}
