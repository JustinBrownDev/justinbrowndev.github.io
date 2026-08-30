const EPS = 1e-5;
function finite(name, value) { if (!Number.isFinite(value)) throw new Error(`finite ${name}`); return value; }
function ordered(a,b){return a<=b?[a,b]:[b,a];}
export function createBoxCirculationReservation({id,kind,x,z,halfX,halfZ,yMin,yMax,source=null,metadata=null}) {
  for (const [n,v] of Object.entries({x,z,halfX,halfZ,yMin,yMax})) finite(n,v);
  if (!id || !kind || !(halfX>0) || !(halfZ>0) || !(yMax>yMin)) throw new Error('bad box reservation');
  return {id,kind,x,z,halfX,halfZ,yMin,yMax,minX:x-halfX,maxX:x+halfX,minZ:z-halfZ,maxZ:z+halfZ,source,...(metadata||{})};
}
export function createStairShaftReservation({id,x,z,openingWidth,openingDepth,baseY=0,roofY,exitHeadroom=2.1,rampAxis=null,rampFrom=null,rampTo=null,rampHalfWidth=null,source='compound-stair'}) {
  return createBoxCirculationReservation({id,kind:'stair-shaft',x,z,halfX:openingWidth*.5,halfZ:openingDepth*.5,yMin:baseY,yMax:roofY+exitHeadroom,source,metadata:{openingWidth,openingDepth,roofY,exitHeadroom,rampAxis,rampFrom,rampTo,rampHalfWidth}});
}
export function createRampCirculationReservation({id,kind='ramp-corridor',axis,from,to,fixedCoord,halfWidth,y0,y1,capsuleRadius=.28,headroom=1.95,source=null}) {
  if(axis!=='x'&&axis!=='z') throw new Error('axis'); const [lo,hi]=ordered(from,to); const center=(lo+hi)*.5; const along=(hi-lo)*.5+capsuleRadius; const cross=halfWidth+capsuleRadius;
  return createBoxCirculationReservation({id,kind,x:axis==='x'?center:fixedCoord,z:axis==='z'?center:fixedCoord,halfX:axis==='x'?along:cross,halfZ:axis==='z'?along:cross,yMin:Math.min(y0,y1),yMax:Math.max(y0,y1)+headroom,source,metadata:{axis,from,to,fixedCoord,halfWidth,y0,y1,capsuleRadius,headroom}});
}
