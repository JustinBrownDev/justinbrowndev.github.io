import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const url = rel => pathToFileURL(path.join(repo, rel)).href;
globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };
const [{ createKowloonFabricEngine }, THREE, stream, { createPlayerPhysics }] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?generated-stair-mouth-soak-selftest=1'),
  import(url('vendor/three/three.module.js') + '?generated-stair-mouth-soak-selftest=1'),
  import(url('world-chunk-streamer.js') + '?generated-stair-mouth-soak-selftest=1'),
  import(url('player-physics.js') + '?generated-stair-mouth-soak-selftest=1'),
]);

const worldSeed = 0x73A1B00C;
const coords = [[1,0],[0,1],[2,2]];
const relevant = new Set(['compound-stair','broad-vertical-stair','scaffold','exterior-transport-stair']);
const totals = Object.fromEntries([...relevant].map(k => [k, 0]));
let probes = 0, supportSamples = 0;
let minDistance = Infinity, maxSlope = 0;

function pointOn(ramp, along) {
  return ramp.axis === 'x' ? { x: along, z: ramp.fixedCoord } : { x: ramp.fixedCoord, z: along };
}
function slope(r) { return Math.abs((Number(r.y1)-Number(r.y0))/(Number(r.to)-Number(r.from))); }
function commands(ramp, sign, travel = 0.9, speed = 1.35) {
  const count = Math.ceil((travel / speed) * 60) + 5;
  return Array.from({length: count}, () => ({dt:1/60, wishVelocityX:ramp.axis==='x'?sign*speed:0, wishVelocityZ:ramp.axis==='z'?sign*speed:0}));
}
function probeRamp(controller, ramp, label) {
  const rising = Number(ramp.y1) >= Number(ramp.y0);
  const lowAlong = rising ? Number(ramp.from) : Number(ramp.to);
  const highAlong = rising ? Number(ramp.to) : Number(ramp.from);
  const lowY = Math.min(Number(ramp.y0), Number(ramp.y1));
  const highY = Math.max(Number(ramp.y0), Number(ramp.y1));
  const dir = Math.sign(highAlong-lowAlong) || 1;
  const endpointOverlap = Math.max(0.04, Math.min(0.10, Number(ramp.supportMargin) || 0.06));
  const down = controller.probeControllerPath({ start:{...pointOn(ramp, highAlong + dir*endpointOverlap), feetY:highY}, steps:commands(ramp,-dir) });
  const up = controller.probeControllerPath({ start:{...pointOn(ramp, lowAlong - dir*endpointOverlap), feetY:lowY}, steps:commands(ramp,dir) });
  for (const [name,res] of [['down',down],['up',up]]) {
    assert.equal(res.validStart,true,`${label}:${name}: invalid mouth start`);
    assert.equal(res.validEnd,true,`${label}:${name}: invalid end pose`);
    assert.ok(res.distance > 0.70,`${label}:${name}: wedged after ${res.distance.toFixed(3)}m`);
    minDistance = Math.min(minDistance,res.distance);
  }
  const localExpected = Math.abs((Number(ramp.y1)-Number(ramp.y0))/(Number(ramp.to)-Number(ramp.from))) * Math.min(down.distance, 0.70);
  const expectedDelta = Math.min(0.22, Math.max(0.004, localExpected * 0.55));
  assert.ok(highY-down.end.feetY > expectedDelta,`${label}:down did not follow ramp (${down.end.feetY} vs ${highY}; expected>${expectedDelta})`);
  assert.ok(up.end.feetY-lowY > expectedDelta,`${label}:up did not climb ramp (${up.end.feetY} vs ${lowY}; expected>${expectedDelta})`);
  probes += 2;
  maxSlope = Math.max(maxSlope,slope(ramp));
}

for (const [x,z] of coords) {
  const scene = new THREE.Scene();
  const publishStub = { registerOwnedWorld(){return {activationState:'active',deferredReason:null};}, unregisterOwnedWorld(){return true;} };
  const engine = createKowloonFabricEngine({THREE,scene,playerPhysics:publishStub,directSceneAdd:scene.add.bind(scene),worldSeed,chunkSize:64,landmarkSpacingChunks:4,yieldControl:null});
  const chunk={key:`${x},${z}`,x,z,centerX:x*64,centerZ:z*64,seed:stream.deterministicChunkSeed(worldSeed,x,z),weirdness:stream.worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
  const payload=await engine.build(chunk);
  const position={x:9999,y:1.65,z:9999};
  const controller=createPlayerPhysics({position,worldToCell:()=>({col:0,row:0}),grid:[[true]],buildingWallSegments:new Map(),propColliders:[],elevatedPlatforms:[],rampRuns:[],overheadCeilings:[],boundsHalf:Infinity});
  controller.registerOwnedWorld(`soak:${chunk.key}`,payload.physics);
  const ramps=(payload.physics.ramps??[]).filter(r=>relevant.has(r.supportKind));
  for (let i=0;i<ramps.length;i++) {
    const r=ramps[i]; totals[r.supportKind]++; probeRamp(controller,r,`${chunk.key}:${r.supportKind}:${r.flightId??r.transportLinkId??i}`);
    const highY=Math.max(Number(r.y0),Number(r.y1));
    for (const t of [0.2,0.4,0.6,0.8]) {
      const along=Number(r.from)+(Number(r.to)-Number(r.from))*t;
      const rampY=Number(r.y0)+(Number(r.y1)-Number(r.y0))*t;
      const p=pointOn(r,along);
      const support=controller.supportHeightAt(p.x,p.z,highY);
      assert.ok(support <= rampY+0.10,`${chunk.key}:${r.supportKind}: hidden support ${support.toFixed(3)} above ramp ${rampY.toFixed(3)} at t=${t}`);
      supportSamples++;
    }
  }
  assert.equal(payload.physics.exteriorTransportNetwork?.closure?.unreachableRequired ?? 0,0,`${chunk.key}: required transport closure`);
  engine.disposeShared();
}
for (const kind of relevant) assert.ok(totals[kind]>0,`soak never emitted ${kind}`);
console.log('[generated-stair-mouth-soak-selftest] PASS',{chunks:coords.length,totals,controllerDirections:probes,supportSamples,minDistance:Number(minDistance.toFixed(3)),maxSlope:Number(maxSlope.toFixed(3))});
