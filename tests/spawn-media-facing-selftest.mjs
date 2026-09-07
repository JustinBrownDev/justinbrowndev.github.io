import assert from 'node:assert/strict';
import { realizeSpawnLocation } from '../world/spawn-location-realizer.js';

class Vec3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
class Node {
    constructor(){this.children=[];this.position=new Vec3();this.scale=new Vec3(1,1,1);this.rotation={x:0,y:0,z:0,order:'XYZ'};this.userData={};this.matrixAutoUpdate=true;this.matrixWorldAutoUpdate=true;this.visible=true;}
    add(child){this.children.push(child);child.parent=this;}
    traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
    updateMatrix(){} updateMatrixWorld(){}
}
class Group extends Node {}
class Mesh extends Node { constructor(geometry,material){super();this.geometry=geometry;this.material=material;} }
class BoxGeometry { dispose(){} }
class PlaneGeometry { dispose(){} }
class MeshStandardMaterial { constructor(values){Object.assign(this,values);} dispose(){} }
const THREE={Group,Mesh,BoxGeometry,PlaneGeometry,MeshStandardMaterial};

const surfaceY=6;
const plan={
    schema:'jweb.spawn-spatial-plan.v2',ready:true,mediaKind:'radio',startProfile:{id:'radio-roof',artPartBudget:80},reservations:[],
    placements:[
        {instanceId:'support',slot:'tv-support',variantId:'support.plywood-crates',dimensionsM:[0.78,0.5,0.56],transform:{x:3,y:6.25,z:0,rotY:0}},
        {instanceId:'radio',slot:'primary-tv',familyId:'spawn.media.radio',variantId:'radio.portable-black',tags:['radio'],dimensionsM:[0.42,0.2,0.28],transform:{x:3,y:6.6,z:0,rotY:0}},
    ],
};
const boundLocation={locationId:'spawn.rooftop-reality-leak',hostSpace:{spaceId:'s',payloadKey:'p',entityId:'e',surfaceY},spatialPlan:plan,composition:{media:null}};
const payload={entity:{id:'e'},physics:{circulationReservations:[]}};
const scene={children:[],add(n){this.children.push(n);n.parent=this;},remove(n){const i=this.children.indexOf(n);if(i>=0)this.children.splice(i,1);}};
const camera={position:new Vec3(0,7.65,0),rotation:{x:0,y:0,z:0,order:'YXZ'},updateMatrix(){},updateMatrixWorld(){}};
const result=realizeSpawnLocation({THREE,scene,camera,boundLocation,fabricPayloads:new Map([['p',payload]]),propColliders:[]});
assert.ok(result?.initialView,'realizer must publish the initial media-facing view');
assert.ok(Math.abs(camera.rotation.y + Math.PI/2) < 0.001,`camera should face +X media; yaw=${camera.rotation.y}`);
assert.equal(camera.rotation.order,'YXZ');
console.log('[spawn-media-facing-selftest] PASS',result.initialView);
