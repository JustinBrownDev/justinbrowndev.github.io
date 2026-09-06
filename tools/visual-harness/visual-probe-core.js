// JWEB visual probe core: pure selection, bounds, image-filter and scene-fragment logic.
// This module intentionally has no DOM dependency so Node selftests can exercise the
// same target selection used by the browser capture harness.

export const JWEB_VISUAL_PROBE_SCHEMA = 'jweb.visual-probe.v1';

export const DEFAULT_RENDER_PASSES = Object.freeze([
  'beauty', 'silhouette', 'normals', 'depth', 'wireframe', 'object-id', 'instance-id',
  'collider', 'semantic', 'visual-collider-overlay',
]);

export const DEFAULT_IMAGE_FILTERS = Object.freeze([
  'grayscale', 'lowpass-3', 'lowpass-9', 'highpass-3', 'highpass-9',
  'sobel', 'threshold',
]);

export const DIAGNOSTIC_COLORS = Object.freeze({
  collider: 0x00c9ff,
  connector: 0xa855f7,
  reservation: 0xff2f92,
  surface: 0xffa600,
  edge: 0xfff200,
  guard: 0x32ff8a,
});

const finite = Number.isFinite;
const n = value => Number(value);
const OWNERSHIP_SELECTORS = Symbol('jweb.visualProbeOwnershipSelectors');

function ownershipSelectorsFromItem(item) {
  if (!item) return [];
  const meta=item.metadata??{};
  const value=key=>item?.[key]??meta?.[key];
  const selectors=[];
  const stairPartId=value('stairPartId'), stairOwnerId=value('stairOwnerId')??value('stairId');
  const endpointId=value('endpointId'), surfaceId=value('surfaceId'), bridgeId=value('bridgeId');
  const guardSpanId=value('guardSpanId'), routeId=value('routeId');
  const shellPieceId=value('shellPieceId'), shellOwnerId=value('shellOwnerId');
  if (stairPartId!=null) selectors.push({stairPartId});
  if (stairOwnerId!=null) selectors.push({stairOwnerId});
  if (endpointId!=null) selectors.push({endpointId});
  if (surfaceId!=null && bridgeId!=null) selectors.push({surfaceId,bridgeId});
  if (surfaceId!=null) selectors.push({surfaceId});
  if (bridgeId!=null) selectors.push({bridgeId});
  if (guardSpanId!=null) selectors.push({guardSpanId});
  if (routeId!=null) selectors.push({routeId});
  if (shellPieceId!=null) selectors.push({shellPieceId});
  else if (shellOwnerId!=null) selectors.push({shellOwnerId});
  const seen=new Set();
  return selectors.filter(selector=>{const key=JSON.stringify(selector);if(seen.has(key))return false;seen.add(key);return true;});
}

function boundsOwnershipSelectors(bounds) {
  return bounds?.[OWNERSHIP_SELECTORS] ?? [];
}

function attachBoundsOwnership(bounds, selectors, { replace=false }={}) {
  if (!boundsValid(bounds)) return bounds;
  const combined=replace?[]:[...boundsOwnershipSelectors(bounds)];
  for (const selector of selectors??[]) {
    if (!selector || !Object.values(selector).some(value=>value!=null)) continue;
    const key=JSON.stringify(selector);
    if (!combined.some(existing=>JSON.stringify(existing)===key)) combined.push(Object.freeze({...selector}));
  }
  if (combined.length) Object.defineProperty(bounds,OWNERSHIP_SELECTORS,{value:Object.freeze(combined),enumerable:false,configurable:true});
  return bounds;
}

export function emptyBounds() {
  return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
}

export function boundsValid(b) {
  return !!b && [b.minX,b.minY,b.minZ,b.maxX,b.maxY,b.maxZ].every(finite)
    && b.maxX >= b.minX && b.maxY >= b.minY && b.maxZ >= b.minZ;
}

export function includePoint(b, x, y, z) {
  if (![x,y,z].every(finite)) return b;
  b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
  b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
  return b;
}

export function unionBounds(...items) {
  const out = emptyBounds();
  const selectors=[];
  for (const b of items.flat()) {
    if (!boundsValid(b)) continue;
    includePoint(out, b.minX, b.minY, b.minZ);
    includePoint(out, b.maxX, b.maxY, b.maxZ);
    selectors.push(...boundsOwnershipSelectors(b));
  }
  return boundsValid(out) ? attachBoundsOwnership(out,selectors) : null;
}

export function expandBounds(b, padding = 0) {
  if (!boundsValid(b)) return null;
  const p = Math.max(0, Number(padding) || 0);
  return attachBoundsOwnership({ minX:b.minX-p, minY:b.minY-p, minZ:b.minZ-p, maxX:b.maxX+p, maxY:b.maxY+p, maxZ:b.maxZ+p },boundsOwnershipSelectors(b));
}

export function boundsCenter(b) {
  return { x:(b.minX+b.maxX)/2, y:(b.minY+b.maxY)/2, z:(b.minZ+b.maxZ)/2 };
}

export function boundsSize(b) {
  return { x:b.maxX-b.minX, y:b.maxY-b.minY, z:b.maxZ-b.minZ };
}

export function boundsIntersects(a,b) {
  return boundsValid(a) && boundsValid(b)
    && a.maxX >= b.minX && a.minX <= b.maxX
    && a.maxY >= b.minY && a.minY <= b.maxY
    && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
}

function explicitAabb(item) {
  if (!item) return null;
  const minX=n(item.minX), maxX=n(item.maxX), minZ=n(item.minZ), maxZ=n(item.maxZ);
  const minY=n(item.minY ?? item.yMin), maxY=n(item.maxY ?? item.yMax);
  if ([minX,maxX,minZ,maxZ,minY,maxY].every(finite)) return {minX,minY,minZ,maxX,maxY,maxZ};
  return null;
}

function rectAabb(item, thickness = 0.12) {
  const x=n(item?.x), z=n(item?.z), hx=n(item?.hx ?? item?.halfX), hz=n(item?.hz ?? item?.halfZ), y=n(item?.y);
  if (![x,z,hx,hz,y].every(finite)) return null;
  const halfT=Math.max(0.02, Number(thickness)||0.12)/2;
  return { minX:x-Math.abs(hx), maxX:x+Math.abs(hx), minZ:z-Math.abs(hz), maxZ:z+Math.abs(hz), minY:y-halfT, maxY:y+halfT };
}

function segmentAabb(item, heightPadding = 0) {
  const x1=n(item?.x1), z1=n(item?.z1), x2=n(item?.x2), z2=n(item?.z2);
  const yMin=n(item?.yMin ?? item?.y0), yMax=n(item?.yMax ?? item?.y1);
  if (![x1,z1,x2,z2,yMin,yMax].every(finite)) return null;
  const p=Math.max(0.02, n(item?.thickness)||0.08)/2;
  return { minX:Math.min(x1,x2)-p, maxX:Math.max(x1,x2)+p, minZ:Math.min(z1,z2)-p, maxZ:Math.max(z1,z2)+p, minY:Math.min(yMin,yMax)-heightPadding, maxY:Math.max(yMin,yMax)+heightPadding };
}

function axisRunAabb(item, verticalPadding = 0.12) {
  const axis=String(item?.axis ?? '');
  const from=n(item?.from), to=n(item?.to), fixed=n(item?.fixedCoord), halfWidth=Math.abs(n(item?.halfWidth));
  const y0=n(item?.y0 ?? item?.yMin), y1=n(item?.y1 ?? item?.yMax);
  if (!['x','z'].includes(axis) || ![from,to,fixed,halfWidth,y0,y1].every(finite)) return null;
  const yMin=Math.min(y0,y1)-verticalPadding, yMax=Math.max(y0,y1)+verticalPadding;
  if (axis==='x') return { minX:Math.min(from,to), maxX:Math.max(from,to), minZ:fixed-halfWidth, maxZ:fixed+halfWidth, minY:yMin, maxY:yMax };
  return { minX:fixed-halfWidth, maxX:fixed+halfWidth, minZ:Math.min(from,to), maxZ:Math.max(from,to), minY:yMin, maxY:yMax };
}

function cylinderAabb(item) {
  const x=n(item?.x), z=n(item?.z), r=Math.abs(n(item?.radius));
  const yMin=n(item?.yMin ?? 0), yMax=n(item?.yMax ?? item?.height);
  if (![x,z,r,yMin,yMax].every(finite)) return null;
  return { minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r,minY:Math.min(yMin,yMax),maxY:Math.max(yMin,yMax) };
}

function endpointAabb(endpoint) {
  const x=n(endpoint?.x),y=n(endpoint?.y),z=n(endpoint?.z);
  if (![x,y,z].every(finite)) return null;
  const w=Math.max(0.25,Math.abs(n(endpoint?.width))||0.7), d=Math.max(0.25,Math.abs(n(endpoint?.depth))||0.7), h=Math.max(0.25,Math.abs(n(endpoint?.height))||2);
  return {minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y,maxY:y+h};
}

export function boundsFromSemanticConnector(item) {
  if (!item) return null;
  const parts=[];
  for (const reservation of item.clearanceGeometry?.reservations ?? []) parts.push(boundsFromPhysicsItem(reservation, 'circulation-reservation'));
  parts.push(boundsFromPhysicsItem(item.clearanceGeometry?.sweep ?? item.sweep, 'sweep'));
  for (const endpoint of item.endpoints ?? []) parts.push(endpointAabb(endpoint));
  return unionBounds(parts);
}

export function boundsFromPhysicsItem(item, kind = '') {
  if (!item) return null;
  if (kind==='semantic-connector' || item.schema==='jweb.semantic-connector.v1') return boundsFromSemanticConnector(item);
  const explicit=explicitAabb(item); if (explicit) return explicit;
  if (finite(n(item.x)) && finite(n(item.z)) && finite(n(item.hx ?? item.halfX)) && finite(n(item.hz ?? item.halfZ)) && finite(n(item.y))) return rectAabb(item);
  if (finite(n(item.x)) && finite(n(item.z)) && finite(n(item.width)) && finite(n(item.depth)) && finite(n(item.y))) {
    return rectAabb({ ...item, halfX: Math.abs(n(item.width)) * 0.5, halfZ: Math.abs(n(item.depth)) * 0.5 });
  }
  if (finite(n(item.x1)) && finite(n(item.z1)) && finite(n(item.x2)) && finite(n(item.z2))) return segmentAabb(item);
  if (['x','z'].includes(String(item.axis ?? '')) && finite(n(item.from)) && finite(n(item.to)) && finite(n(item.fixedCoord))) {
    const a=axisRunAabb(item, /guard/i.test(kind) ? 1.2 : 0.12);
    if (a) return a;
  }
  if (finite(n(item.radius))) return cylinderAabb(item);
  if (Array.isArray(item.endpoints)) return unionBounds(item.endpoints.map(endpointAabb));
  return null;
}

function payloadPhysicsTargets(entry, payloadIndex) {
  const p=entry.payload ?? entry;
  const ph=p?.physics ?? {};
  const ownerId=String(p?.ownerId ?? p?.root?.userData?.worldChunkOwnerId ?? entry.ownerId ?? `payload-${payloadIndex}`);
  const chunkKey=String(entry.chunkKey ?? p?.root?.userData?.worldChunkKey ?? '');
  const out=[];
  const push=(targetKind,item,index,arrayName,bounds=boundsFromPhysicsItem(item,targetKind))=>{
    if (!boundsValid(bounds)) return;
    const id=String(item?.id ?? item?.stairPartId ?? item?.stairId ?? item?.guardSpanId ?? item?.surfaceId ?? item?.routeId ?? `${arrayName}:${index}`);
    const metadata=item?.metadata??{};
    const labels=[targetKind,arrayName,id,item?.kind,item?.source,item?.supportKind,item?.visualRole,item?.stairOwnerId,item?.stairPartId,item?.stairPartParentId,item?.stairPartKind,item?.stairId,item?.flightId,item?.moduleKey,item?.surfaceId,item?.bridgeId,item?.endpointId,item?.routeId,item?.networkKey,item?.shellOwnerId,item?.shellPieceId,item?.shellPieceKind,item?.closureForOffset,metadata?.stairOwnerId,metadata?.stairPartId,metadata?.stairPartKind,metadata?.stairId,metadata?.flightId,metadata?.moduleKey,metadata?.surfaceId,metadata?.bridgeId,metadata?.endpointId,metadata?.routeId,metadata?.networkKey,metadata?.shellOwnerId,metadata?.shellPieceId,metadata?.shellPieceKind,metadata?.closureForOffset].filter(v=>v!=null).map(String);
    attachBoundsOwnership(bounds,ownershipSelectorsFromItem(item));
    out.push({ schema:JWEB_VISUAL_PROBE_SCHEMA, targetKind, arrayName, index, id, ownerId, chunkKey, bounds, labels, raw:item });
  };
  for (const [i,item] of (ph.semanticConnectors ?? []).entries()) push('semantic-connector',item,i,'semanticConnectors',boundsFromSemanticConnector(item));
  for (const [i,item] of (ph.circulationReservations ?? []).entries()) push('circulation-reservation',item,i,'circulationReservations');
  for (const [i,item] of (ph.exteriorTransportSurfaces ?? []).entries()) push('transport-surface',item,i,'exteriorTransportSurfaces');
  for (const [i,item] of (ph.exteriorTransportEdges ?? []).entries()) push('transport-edge',item,i,'exteriorTransportEdges');
  for (const [i,item] of (ph.guardSpans ?? []).entries()) push('guard-span',item,i,'guardSpans');
  for (const [i,item] of (ph.platforms ?? []).entries()) push('collider-platform',item,i,'platforms');
  for (const [i,item] of (ph.ramps ?? []).entries()) push('collider-ramp',item,i,'ramps');
  for (const [i,item] of (ph.mazeWalls ?? []).entries()) push('collider-wall',item,i,'mazeWalls');
  for (const [i,item] of (ph.props ?? []).entries()) push('collider-prop',item,i,'props');
  for (const [i,item] of (ph.ceilings ?? []).entries()) push('collider-ceiling',item,i,'ceilings');
  for (const [i,item] of (ph.structuralShellClosures ?? []).entries()) push('shell-closure',item,i,'structuralShellClosures');
  for (const [i,item] of (ph.structuralSurfaceClaims ?? []).entries()) push('structural-surface',item,i,'structuralSurfaceClaims');
  for (const [i,item] of (ph.visualProbeTargets ?? []).entries()) {
    const bounds=item?.bounds;
    if (!boundsValid(bounds)) continue;
    const targetKind=String(item?.targetKind ?? 'fixture-component');
    const id=String(item?.id ?? `visualProbeTargets:${i}`);
    const labels=[targetKind,'visualProbeTargets',id,item?.elementId,...(item?.labels??[]),...(item?.roles??[])].filter(v=>v!=null).map(String);
    out.push({schema:JWEB_VISUAL_PROBE_SCHEMA,targetKind,arrayName:'visualProbeTargets',index:i,id,ownerId,chunkKey,bounds,labels,raw:item});
  }
  for (const [i,ownership] of (ph.stairOwnership ?? []).entries()) {
    const stairOwnerId=String(ownership?.id ?? '');
    if (!stairOwnerId) continue;
    const owned=out.filter(target => {
      const raw=target.raw ?? {};
      return String(raw.stairOwnerId ?? '')===stairOwnerId
        || String(raw.stairId ?? '')===stairOwnerId
        || String(raw.id ?? '')===stairOwnerId;
    });
    const bounds=unionBounds(owned.map(target=>target.bounds));
    if (!boundsValid(bounds)) continue;
    const raw={...ownership,stairOwnerId,stairPartKind:'assembly-root'};
    const labels=['stair-assembly','stairOwnership',stairOwnerId,ownership?.moduleKey,ownership?.stairTopology,ownership?.ownershipAuthority].filter(Boolean).map(String);
    attachBoundsOwnership(bounds,[{stairOwnerId}],{replace:true});
    out.push({schema:JWEB_VISUAL_PROBE_SCHEMA,targetKind:'stair-assembly',arrayName:'stairOwnership',index:i,id:stairOwnerId,ownerId,chunkKey,bounds,labels,raw});
  }
  return out;
}

function rootBounds(THREE, root) {
  if (!root) return null;
  root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(root, true);
  return box.isEmpty() ? null : {minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z};
}

export function buildTargetCatalog(THREE, payloadEntries = [], { includeRoots = true } = {}) {
  const out=[];
  payloadEntries.forEach((entry,payloadIndex)=>{
    const payload=entry.payload ?? entry;
    const root=payload?.root;
    if (includeRoots && root) {
      const b=rootBounds(THREE,root);
      if (b) out.push({
        schema:JWEB_VISUAL_PROBE_SCHEMA,targetKind:'payload-root',arrayName:'root',index:0,
        id:String(root.name || payload.ownerId || `payload-${payloadIndex}`), ownerId:String(payload.ownerId ?? root.userData?.worldChunkOwnerId ?? ''),
        chunkKey:String(entry.chunkKey ?? root.userData?.worldChunkKey ?? ''), bounds:b,
        labels:['payload-root',root.name,payload.ownerId,root.userData?.worldChunkKey].filter(Boolean).map(String), raw:null,
      });
    }
    out.push(...payloadPhysicsTargets(entry,payloadIndex));
  });
  return out;
}

function queryMatcher(query) {
  if (query instanceof RegExp) return t=>{ query.lastIndex=0; return query.test(t.labels.join(' | ')); };
  if (typeof query==='string') {
    const needle=query.trim().toLowerCase();
    return t=>!needle || t.labels.join(' | ').toLowerCase().includes(needle);
  }
  const q=query ?? {};
  const text=String(q.text ?? q.q ?? '').trim().toLowerCase();
  const kind=q.kind ? String(q.kind).toLowerCase() : null;
  const id=q.id != null ? String(q.id).toLowerCase() : null;
  const idContains=q.idContains != null ? String(q.idContains).toLowerCase() : null;
  const ownerId=q.ownerId ? String(q.ownerId).toLowerCase() : null;
  const chunkKey=q.chunkKey ? String(q.chunkKey).toLowerCase() : null;
  return t => (!text || t.labels.join(' | ').toLowerCase().includes(text))
    && (!kind || String(t.targetKind).toLowerCase().includes(kind))
    && (id===null || String(t.id).toLowerCase()===id)
    && (!idContains || String(t.id).toLowerCase().includes(idContains))
    && (!ownerId || String(t.ownerId).toLowerCase().includes(ownerId))
    && (!chunkKey || String(t.chunkKey).toLowerCase()===chunkKey);
}

export function searchTargetCatalog(catalog, query, { limit = 100 } = {}) {
  const matches=catalog.filter(queryMatcher(query));
  return matches.slice(0,Math.max(1,Number(limit)||100));
}

export function stableHash32(text) {
  let h=2166136261>>>0;
  for (const ch of String(text)) { h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}

export function stableRgb(text) {
  const h=stableHash32(text);
  return [64+((h>>>16)&127),64+((h>>>8)&127),64+(h&127)];
}

function threeBoxToBounds(box) {
  return box && !box.isEmpty() ? {minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z} : null;
}

function localGeometryBox(THREE, geometry) {
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox?.();
  return geometry.boundingBox?.clone?.() ?? null;
}

export function visualFragmentsForObjects(THREE, objects) {
  const fragments=[];
  const tmpMatrix=new THREE.Matrix4(), instanceMatrix=new THREE.Matrix4();
  for(const object of objects ?? []){
    if(!object?.isMesh) continue;
    object.updateWorldMatrix?.(true,false);
    const localBox=localGeometryBox(THREE,object.geometry); if(!localBox||localBox.isEmpty()) continue;
    if(object.isInstancedMesh){
      const indices=[]; let merged=null;
      for(let i=0;i<object.count;i++){object.getMatrixAt(i,instanceMatrix);tmpMatrix.multiplyMatrices(object.matrixWorld,instanceMatrix);const wb=localBox.clone().applyMatrix4(tmpMatrix),b=threeBoxToBounds(wb);indices.push(i);merged=unionBounds(merged,b);}
      if(indices.length)fragments.push({object,instanceIndices:indices,bounds:merged,rootName:object.parent?.name??'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count??object.geometry.attributes?.position?.count??0)/3)*indices.length});
    }else{
      const wb=localBox.clone().applyMatrix4(object.matrixWorld),b=threeBoxToBounds(wb);fragments.push({object,instanceIndices:null,bounds:b,rootName:object.parent?.name??'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count??object.geometry.attributes?.position?.count??0)/3)});
    }
  }
  return fragments;
}

export function visualFragmentForInstance(THREE, object, instanceIndex) {
  if(!object?.isInstancedMesh) throw new Error('visualFragmentForInstance requires an InstancedMesh');
  const index=Number(instanceIndex);
  if(!Number.isInteger(index)||index<0||index>=object.count) throw new Error(`instance index ${instanceIndex} is outside 0..${Math.max(0,object.count-1)}`);
  object.updateWorldMatrix?.(true,false);
  const localBox=localGeometryBox(THREE,object.geometry);if(!localBox||localBox.isEmpty())return null;
  const instanceMatrix=new THREE.Matrix4(),worldMatrix=new THREE.Matrix4();object.getMatrixAt(index,instanceMatrix);worldMatrix.multiplyMatrices(object.matrixWorld,instanceMatrix);
  const bounds=threeBoxToBounds(localBox.clone().applyMatrix4(worldMatrix));
  return {object,instanceIndices:[index],bounds,rootName:object.parent?.name??'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count??object.geometry.attributes?.position?.count??0)/3)};
}

function sourceOwnershipMatches(source, selector) {
  if (!source || !selector) return false;
  const entries=Object.entries(selector).filter(([,value])=>value!=null);
  return !!entries.length && entries.every(([key,value])=>String(source?.[key]??'')===String(value));
}

export function visualFragmentsForSourceOwnership(THREE, roots, selectors, { includeInvisible = false } = {}) {
  const rootsArray=Array.isArray(roots)?roots:[roots];
  const wanted=(Array.isArray(selectors)?selectors:[selectors]).filter(selector=>selector&&Object.values(selector).some(value=>value!=null));
  if(!wanted.length)return [];
  const fragments=[];
  const instanceMatrix=new THREE.Matrix4(),worldMatrix=new THREE.Matrix4();
  for(const root of rootsArray){
    if(!root?.traverse)continue;
    root.updateMatrixWorld?.(true);
    root.traverse(object=>{
      if(!object?.isInstancedMesh)return;
      if(!includeInvisible){let cursor=object,visible=true;while(cursor){if(cursor.visible===false){visible=false;break;}if(cursor===root)break;cursor=cursor.parent;}if(!visible)return;}
      const sources=object.userData?.visualProbeInstanceSources;
      if(!(sources instanceof Map)||!sources.size)return;
      const localBox=localGeometryBox(THREE,object.geometry);if(!localBox||localBox.isEmpty())return;
      const indices=[];let merged=null;
      for(const [index,source] of sources){
        if(!Number.isInteger(index)||index<0||index>=object.count||!wanted.some(selector=>sourceOwnershipMatches(source,selector)))continue;
        object.getMatrixAt(index,instanceMatrix);worldMatrix.multiplyMatrices(object.matrixWorld,instanceMatrix);
        const bounds=threeBoxToBounds(localBox.clone().applyMatrix4(worldMatrix));indices.push(index);merged=unionBounds(merged,bounds);
      }
      if(indices.length)fragments.push({object,instanceIndices:indices,bounds:merged,rootName:root.name||'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count??object.geometry.attributes?.position?.count??0)/3)*indices.length,selectionAuthority:'exact-structural-instance-ownership-v2'});
    });
  }
  return fragments;
}

export function visualFragmentsForBounds(THREE, roots, selectionBounds, { includeInvisible = false } = {}) {
  const rootsArray=Array.isArray(roots)?roots:[roots];
  const selection=expandBounds(selectionBounds,0);
  const owned=visualFragmentsForSourceOwnership(THREE,rootsArray,boundsOwnershipSelectors(selection),{includeInvisible});
  if(owned.length)return owned;
  const fragments=[];
  const tmpMatrix=new THREE.Matrix4();
  const instanceMatrix=new THREE.Matrix4();
  for (const root of rootsArray) {
    if (!root?.traverse || !selection) continue;
    root.updateMatrixWorld?.(true);
    root.traverse(object=>{
      if (!object?.isMesh) return;
      if (!includeInvisible) {
        let cursor=object, visible=true;
        while(cursor){ if(cursor.visible===false){visible=false;break;} if(cursor===root) break; cursor=cursor.parent; }
        if(!visible) return;
      }
      const localBox=localGeometryBox(THREE,object.geometry); if(!localBox || localBox.isEmpty()) return;
      if (object.isInstancedMesh) {
        const indices=[]; let merged=null;
        for(let i=0;i<object.count;i++){
          object.getMatrixAt(i,instanceMatrix); tmpMatrix.multiplyMatrices(object.matrixWorld,instanceMatrix);
          const wb=localBox.clone().applyMatrix4(tmpMatrix); const b=threeBoxToBounds(wb);
          if (boundsIntersects(b,selection)) { indices.push(i); merged=unionBounds(merged,b); }
        }
        if(indices.length) fragments.push({object,instanceIndices:indices,bounds:merged,rootName:root.name||'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count ?? object.geometry.attributes?.position?.count ?? 0)/3)*indices.length});
      } else {
        const wb=localBox.clone().applyMatrix4(object.matrixWorld); const b=threeBoxToBounds(wb);
        if(boundsIntersects(b,selection)) fragments.push({object,instanceIndices:null,bounds:b,rootName:root.name||'',objectName:object.name||'',triangleCount:Math.floor((object.geometry.index?.count ?? object.geometry.attributes?.position?.count ?? 0)/3)});
      }
    });
  }
  return fragments;
}

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map(m=>m?.clone ? m.clone() : m);
  return material?.clone ? material.clone() : material;
}

export function buildIsolatedVisualScene(THREE, fragments, { sourceScene = null, cloneMaterials = false, background = null } = {}) {
  const scene=new THREE.Scene();
  if (background != null) scene.background = background?.isColor ? background.clone() : new THREE.Color(background);
  if (sourceScene) {
    for (const child of sourceScene.children ?? []) {
      if (child?.isLight) scene.add(child.clone());
    }
    if (sourceScene.fog?.clone) scene.fog=sourceScene.fog.clone();
  }
  const clones=[];
  const instanceMatrix=new THREE.Matrix4(), worldMatrix=new THREE.Matrix4();
  for (let fragmentIndex=0; fragmentIndex<fragments.length; fragmentIndex++) {
    const fragment=fragments[fragmentIndex], src=fragment.object;
    const provenance={
      fragmentIndex,
      rootName:String(fragment.rootName??''),
      sourceObjectName:String(src.name??''),
      sourceObjectUuid:String(src.uuid??''),
      sourceInstanceIndices:fragment.instanceIndices ? [...fragment.instanceIndices] : null,
    };
    if (src.isInstancedMesh) {
      const material=cloneMaterials?cloneMaterial(src.material):src.material;
      const mesh=new THREE.InstancedMesh(src.geometry,material,fragment.instanceIndices.length);
      mesh.name=`visual-probe:${src.name||'instanced'}:${fragmentIndex}`;
      mesh.userData={...src.userData,visualProbeSource:provenance};
      for(let j=0;j<fragment.instanceIndices.length;j++){
        const i=fragment.instanceIndices[j]; src.getMatrixAt(i,instanceMatrix); worldMatrix.multiplyMatrices(src.matrixWorld,instanceMatrix); mesh.setMatrixAt(j,worldMatrix);
        if (src.instanceColor) { const c=new THREE.Color(); src.getColorAt(i,c); mesh.setColorAt(j,c); }
      }
      mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
      scene.add(mesh); clones.push(mesh);
    } else {
      const clone=src.clone(false); clone.geometry=src.geometry; clone.material=cloneMaterials?cloneMaterial(src.material):src.material;
      clone.matrixAutoUpdate=false; clone.matrix.copy(src.matrixWorld); clone.matrixWorld.copy(src.matrixWorld); clone.name=`visual-probe:${src.name||'mesh'}:${fragmentIndex}`;
      clone.userData={...src.userData,visualProbeSource:provenance};
      scene.add(clone); clones.push(clone);
    }
  }
  scene.updateMatrixWorld(true);
  return {scene,clones};
}

function meshBox(THREE,b,material){
  const s=boundsSize(b), c=boundsCenter(b); const g=new THREE.BoxGeometry(Math.max(0.02,s.x),Math.max(0.02,s.y),Math.max(0.02,s.z));
  const m=new THREE.Mesh(g,material); m.position.set(c.x,c.y,c.z); return m;
}

function proxyForItem(THREE,item,kind,material) {
  const b=boundsFromPhysicsItem(item,kind); if(!b) return null;
  if (kind==='collider-prop' && finite(n(item.radius))) {
    const yMin=n(item.yMin ?? 0), yMax=n(item.yMax ?? item.height), h=Math.max(0.02,Math.abs(yMax-yMin));
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.02,Math.abs(n(item.radius))),Math.max(0.02,Math.abs(n(item.radius))),h,16),material);
    mesh.position.set(n(item.x),(yMin+yMax)/2,n(item.z)); return mesh;
  }
  if (kind==='collider-wall' && [item.x1,item.z1,item.x2,item.z2,item.yMin,item.yMax].map(n).every(finite)) {
    const x1=n(item.x1),z1=n(item.z1),x2=n(item.x2),z2=n(item.z2),dx=x2-x1,dz=z2-z1,len=Math.max(0.02,Math.hypot(dx,dz));
    const yMin=n(item.yMin),yMax=n(item.yMax),th=Math.max(0.02,Math.abs(n(item.thickness))||0.08);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(th,Math.max(0.02,yMax-yMin),len),material);
    mesh.position.set((x1+x2)/2,(yMin+yMax)/2,(z1+z2)/2); mesh.rotation.y=Math.atan2(dx,dz); return mesh;
  }
  if (kind==='collider-ramp' && ['x','z'].includes(String(item.axis??'')) && [item.from,item.to,item.fixedCoord,item.halfWidth,item.y0,item.y1].map(n).every(finite)) {
    const axis=String(item.axis),from=n(item.from),to=n(item.to),fixed=n(item.fixedCoord),y0=n(item.y0),y1=n(item.y1),width=Math.max(0.02,Math.abs(n(item.halfWidth))*2);
    const run=to-from,dy=y1-y0,len=Math.max(0.02,Math.hypot(run,dy)),th=Math.max(0.06,Math.abs(n(item.thickness))||0.12);
    const mesh=new THREE.Mesh(axis==='x'?new THREE.BoxGeometry(len,th,width):new THREE.BoxGeometry(width,th,len),material);
    if(axis==='x'){mesh.position.set((from+to)/2,(y0+y1)/2,fixed);mesh.rotation.z=Math.atan2(dy,run);}else{mesh.position.set(fixed,(y0+y1)/2,(from+to)/2);mesh.rotation.x=-Math.atan2(dy,run);}
    return mesh;
  }
  return meshBox(THREE,b,material);
}

function belongsToStructuralOwner(item, structuralOwnerId) {
  if (!structuralOwnerId) return true;
  const owner=String(structuralOwnerId);
  const direct=[item?.stairOwnerId,item?.stairId,item?.id,item?.fullReservationId].filter(v=>v!=null).map(String);
  if (direct.includes(owner)) return true;
  const id=String(item?.id ?? '');
  return id.startsWith(`${owner}:`);
}

export function buildColliderProxyScene(THREE, payloadEntries, selectionBounds, { includePhysical = true, includeSemantic = true, background = null, exactObjects = null, style = 'mask', structuralOwnerId = null } = {}) {
  const scene=new THREE.Scene(); if(background!=null) scene.background=background?.isColor?background.clone():new THREE.Color(background);
  const overlay=String(style).toLowerCase()==='overlay';
  const makeMaterial=(color,opacity=1)=>{const material=new THREE.MeshBasicMaterial({color,transparent:overlay,opacity:overlay?opacity:1,depthWrite:!overlay,side:THREE.DoubleSide});material.toneMapped=false;return material;};
  const colliderMaterial=makeMaterial(DIAGNOSTIC_COLORS.collider,0.78);
  const semanticMaterials={
    connector:makeMaterial(DIAGNOSTIC_COLORS.connector,0.42),
    reservation:makeMaterial(DIAGNOSTIC_COLORS.reservation,0.34),
    surface:makeMaterial(DIAGNOSTIC_COLORS.surface,0.36),
    edge:makeMaterial(DIAGNOSTIC_COLORS.edge,0.48),
    guard:makeMaterial(DIAGNOSTIC_COLORS.guard,0.42),
  };
  const records=[],materials=[colliderMaterial,...Object.values(semanticMaterials)];
  const sel=selectionBounds?expandBounds(selectionBounds,0):null;
  const addExactFragments=(fragments,ownerId='exact-selection')=>{
    const exact=buildIsolatedVisualScene(THREE,fragments,{sourceScene:null,cloneMaterials:false,background:null});
    for(const mesh of exact.clones){
      mesh.geometry=mesh.geometry?.clone?.()??mesh.geometry;
      mesh.material=colliderMaterial;mesh.userData.visualProbeExactCollider=true;scene.add(mesh);
      const box=new THREE.Box3().setFromObject(mesh,true),b=box.isEmpty()?null:threeBoxToBounds(box);records.push({mesh,kind:'exact-collider-mesh',bounds:b,raw:null,ownerId,ownsGeometry:true});
    }
  };
  const addExactObjects=(objects,ownerId='exact-selection')=>addExactFragments(visualFragmentsForObjects(THREE,objects),ownerId);
  const add=(item,kind,ownerId,material=colliderMaterial)=>{
    if(structuralOwnerId&&!belongsToStructuralOwner(item,structuralOwnerId)) return;
    const b=boundsFromPhysicsItem(item,kind); if(!b || (sel&&!boundsIntersects(b,sel))) return;
    const mesh=proxyForItem(THREE,item,kind,material); if(!mesh) return;
    mesh.name=`visual-probe:${kind}:${item?.id??item?.stairId??item?.supportKind??records.length}`; mesh.userData.visualProbeProxy={kind,ownerId,id:item?.id??null}; scene.add(mesh); records.push({mesh,kind,bounds:b,raw:item,ownerId});
  };
  const exactPhysical=includePhysical&&Array.isArray(exactObjects)&&exactObjects.length>0;
  if(exactPhysical)addExactObjects(exactObjects);
  for(const entry of payloadEntries){
    const p=entry.payload??entry,ph=p?.physics??{},ownerId=String(p?.ownerId??'');
    if(includePhysical&&!exactPhysical){
      for(const item of ph.platforms??[]) add(item,'collider-platform',ownerId);
      for(const item of ph.ramps??[]) add(item,'collider-ramp',ownerId);
      for(const item of ph.mazeWalls??[]) add(item,'collider-wall',ownerId);
      for(const item of ph.props??[]) add(item,'collider-prop',ownerId);
      for(const item of ph.ceilings??[]) add(item,'collider-ceiling',ownerId);
      const exactRoot=ph.visualProbeColliderRoot;
      if(exactRoot?.traverse){
        const fragments=visualFragmentsForBounds(THREE,[exactRoot],sel,{includeInvisible:true});
        addExactFragments(fragments,ownerId);
      }
    }
    if(includeSemantic){
      for(const item of ph.semanticConnectors??[]) add(item,'semantic-connector',ownerId,semanticMaterials.connector);
      for(const item of ph.circulationReservations??[]) add(item,'circulation-reservation',ownerId,semanticMaterials.reservation);
      for(const item of ph.exteriorTransportSurfaces??[]) add(item,'transport-surface',ownerId,semanticMaterials.surface);
      for(const item of ph.exteriorTransportEdges??[]) add(item,'transport-edge',ownerId,semanticMaterials.edge);
      for(const item of ph.guardSpans??[]) add(item,'guard-span',ownerId,semanticMaterials.guard);
    }
  }
  return {scene,records,materials,structuralOwnerId:structuralOwnerId??null,selectionMode:structuralOwnerId?'structural-owner':'bounds'};
}

export function frameCameraForBounds(THREE,bounds,{view='iso',projection='perspective',fov=55,aspect=1.5,padding=1.18,near=null,far=null}={}){
  if(!boundsValid(bounds)) throw new Error('frameCameraForBounds requires finite bounds');
  const c=boundsCenter(bounds),s=boundsSize(bounds),radius=Math.max(0.05,Math.hypot(s.x,s.y,s.z)/2);
  const dirs={iso:[1,0.72,1],front:[0,0.18,1],back:[0,0.18,-1],left:[-1,0.18,0],right:[1,0.18,0],top:[0,1,0.001],'top-oblique':[0.18,1,0.18]};
  const d=dirs[view]??dirs.iso,dir=new THREE.Vector3(...d).normalize(),forward=dir.clone().multiplyScalar(-1);
  const preferredUp=view==='top'?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
  const right=forward.clone().cross(preferredUp).normalize(),trueUp=right.clone().cross(forward).normalize();
  const corners=[];for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY,bounds.maxY])for(const z of [bounds.minZ,bounds.maxZ])corners.push(new THREE.Vector3(x-c.x,y-c.y,z-c.z));
  let maxX=0,maxY=0,maxToward=-Infinity,minToward=Infinity;
  for(const rel of corners){maxX=Math.max(maxX,Math.abs(rel.dot(right)));maxY=Math.max(maxY,Math.abs(rel.dot(trueUp)));const q=rel.dot(dir);maxToward=Math.max(maxToward,q);minToward=Math.min(minToward,q);}
  const pad=Math.max(1.01,Number(padding)||1.18),safeAspect=Math.max(0.05,Number(aspect)||1);
  let camera,dist;
  if(String(projection).toLowerCase().startsWith('ortho')){
    let halfW=Math.max(0.05,maxX*pad),halfH=Math.max(0.05,maxY*pad);
    if(halfW/halfH<safeAspect)halfW=halfH*safeAspect;else halfH=halfW/safeAspect;
    dist=Math.max(radius*2.5,1);const nearFit=Math.max(0.01,dist-maxToward-radius*0.1),farFit=Math.max(nearFit+1,dist-minToward+radius*0.1);
    camera=new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,near==null?nearFit:Number(near),far==null?farFit:Number(far));
  }else{
    const vfov=THREE.MathUtils.degToRad(fov),tanV=Math.tan(vfov/2),tanH=tanV*safeAspect;let required=radius;
    for(const rel of corners){const toward=rel.dot(dir),x=Math.abs(rel.dot(right)),y=Math.abs(rel.dot(trueUp));required=Math.max(required,toward+x/Math.max(1e-6,tanH),toward+y/Math.max(1e-6,tanV));}
    dist=Math.max(radius*1.05,required*pad);const nearFit=Math.max(0.01,dist-maxToward-radius*0.08),farFit=Math.max(nearFit+1,dist-minToward+radius*0.08);
    camera=new THREE.PerspectiveCamera(fov,safeAspect,near==null?nearFit:Number(near),far==null?farFit:Number(far));
  }
  camera.position.set(c.x+dir.x*dist,c.y+dir.y*dist,c.z+dir.z*dist);camera.up.copy(preferredUp);camera.lookAt(c.x,c.y,c.z);camera.updateProjectionMatrix();return camera;
}

function clampByte(v){return v<0?0:v>255?255:v|0;}
function grayOf(r,g,b){return 0.2126*r+0.7152*g+0.0722*b;}

function boxBlur(src,w,h,radius){
  const r=Math.max(1,Math.floor(radius)); const temp=new Float64Array(src.length); const out=new Uint8ClampedArray(src.length);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const idx=(y*w+x)*4; let rr=0,gg=0,bb=0,aa=0,c=0;
    for(let dx=-r;dx<=r;dx++){const xx=Math.max(0,Math.min(w-1,x+dx)),j=(y*w+xx)*4;rr+=src[j];gg+=src[j+1];bb+=src[j+2];aa+=src[j+3];c++;}
    temp[idx]=rr/c;temp[idx+1]=gg/c;temp[idx+2]=bb/c;temp[idx+3]=aa/c;
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const idx=(y*w+x)*4; let rr=0,gg=0,bb=0,aa=0,c=0;
    for(let dy=-r;dy<=r;dy++){const yy=Math.max(0,Math.min(h-1,y+dy)),j=(yy*w+x)*4;rr+=temp[j];gg+=temp[j+1];bb+=temp[j+2];aa+=temp[j+3];c++;}
    out[idx]=rr/c;out[idx+1]=gg/c;out[idx+2]=bb/c;out[idx+3]=aa/c;
  }
  return out;
}

export function applyImageFilterRGBA(input,width,height,filter){
  const src=input instanceof Uint8ClampedArray?input:new Uint8ClampedArray(input); const out=new Uint8ClampedArray(src.length);
  const name=String(filter).toLowerCase();
  if(name==='grayscale'){
    for(let i=0;i<src.length;i+=4){const g=clampByte(grayOf(src[i],src[i+1],src[i+2]));out[i]=out[i+1]=out[i+2]=g;out[i+3]=src[i+3];} return out;
  }
  const low=name.match(/^lowpass-(\d+)$/); if(low) return boxBlur(src,width,height,(Number(low[1])-1)/2);
  const high=name.match(/^highpass-(\d+)$/); if(high){const blur=boxBlur(src,width,height,(Number(high[1])-1)/2);for(let i=0;i<src.length;i+=4){out[i]=clampByte(128+src[i]-blur[i]);out[i+1]=clampByte(128+src[i+1]-blur[i+1]);out[i+2]=clampByte(128+src[i+2]-blur[i+2]);out[i+3]=src[i+3];}return out;}
  if(name==='threshold'){
    for(let i=0;i<src.length;i+=4){const g=grayOf(src[i],src[i+1],src[i+2])>=128?255:0;out[i]=out[i+1]=out[i+2]=g;out[i+3]=src[i+3];}return out;
  }
  if(name==='sobel'){
    const gray=new Float64Array(width*height); for(let p=0,i=0;p<gray.length;p++,i+=4) gray[p]=grayOf(src[i],src[i+1],src[i+2]);
    const gx=[-1,0,1,-2,0,2,-1,0,1],gy=[-1,-2,-1,0,0,0,1,2,1];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sx=0,sy=0,k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++,k++){const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy)),v=gray[yy*width+xx];sx+=v*gx[k];sy+=v*gy[k];}const g=clampByte(Math.hypot(sx,sy));const i=(y*width+x)*4;out[i]=out[i+1]=out[i+2]=g;out[i+3]=255;}return out;
  }
  throw new Error(`unknown image filter: ${filter}`);
}

export function serializableTarget(target){
  return target ? {schema:target.schema,targetKind:target.targetKind,arrayName:target.arrayName,index:target.index,id:target.id,ownerId:target.ownerId,chunkKey:target.chunkKey,bounds:target.bounds,labels:target.labels} : null;
}
