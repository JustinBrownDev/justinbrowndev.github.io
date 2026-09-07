import assert from 'node:assert/strict';
import { detailSpawnLocation } from '../world/spawn-location-art-detail.js';

class Vec3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
class Node {
    constructor(){this.children=[];this.position=new Vec3();this.scale=new Vec3(1,1,1);this.rotation={x:0,y:0,z:0};this.userData={};this.visible=true;}
    add(child){this.children.push(child);child.parent=this;}
}
class Group extends Node {}
class Mesh extends Node { constructor(geometry,material){super();this.geometry=geometry;this.material=material;} }
class BoxGeometry { dispose(){} }
class MeshStandardMaterial { constructor(values){Object.assign(this,values);} dispose(){} }
const THREE={Group,Mesh,BoxGeometry,MeshStandardMaterial};

function groupFor(p){const g=new Group();g.name=p.instanceId;g.userData.spawnInstanceId=p.instanceId;g.add(new Mesh({kind:'base'},{kind:'base'}));return g;}

const laptopPlacement={instanceId:'lap',slot:'primary-tv',familyId:'spawn.media.television',variantId:'media.laptop-salvage',constructionRecipe:'laptop',tags:['laptop','lcd'],dimensionsM:[0.46,0.30,0.055],transform:{}};
const laptopRoot=new Group();laptopRoot.add(groupFor(laptopPlacement));
const laptopSummary=detailSpawnLocation({THREE,root:laptopRoot,plan:{startProfile:{id:'small-tv-roof',progressionRank:1},placements:[laptopPlacement]},resources:{geometries:[],materials:[]},partBudget:100});
assert.equal(laptopSummary.applied,true);
assert.ok(laptopRoot.children[0].children.length > 15,'laptop should gain keyboard/hinge detail, not remain a vertical mini-TV');
assert.equal(laptopRoot.children[0].children[0].visible,true,'live-screen base geometry must remain visible for laptop');

const terraPlacements=[
    {instanceId:'ws',slot:'progression-workstation',familyId:'spawn.progression.workstation',dimensionsM:[1.55,1.42,0.78],transform:{}},
    {instanceId:'rack',slot:'progression-server-rack',familyId:'spawn.progression.server-rack',dimensionsM:[0.72,2.05,0.86],transform:{}},
    {instanceId:'chair',slot:'progression-operator-chair',familyId:'spawn.progression.operator-chair',dimensionsM:[0.62,0.94,0.66],transform:{}},
    {instanceId:'cart',slot:'progression-equipment-cart',familyId:'spawn.progression.equipment-cart',dimensionsM:[0.92,1.02,0.58],transform:{}},
    {instanceId:'crt',slot:'primary-tv',familyId:'spawn.media.television',variantId:'tv.crt.black-cube',constructionRecipe:'crt-box',tags:['crt'],dimensionsM:[6.8,3.3,3.1],transform:{}},
];
const terraRoot=new Group();for(const p of terraPlacements)terraRoot.add(groupFor(p));
const terraSummary=detailSpawnLocation({THREE,root:terraRoot,plan:{startProfile:{id:'terra-backroom',progressionRank:7},placements:terraPlacements},resources:{geometries:[],materials:[]},partBudget:430});
assert.ok(terraSummary.partCount > 80,'TERRA fixtures should receive substantial authored geometry');
for(const id of ['ws','rack','chair','cart'])assert.equal(terraRoot.children.find(g=>g.name===id).children[0].visible,false,`${id} generic proxy should be replaced`);
assert.equal(terraRoot.children.find(g=>g.name==='crt').children[0].visible,true,'massive CRT base/screen stays authoritative');
console.log('[spawn-progression-art-selftest] PASS',{laptopParts:laptopSummary.partCount,terraParts:terraSummary.partCount});
