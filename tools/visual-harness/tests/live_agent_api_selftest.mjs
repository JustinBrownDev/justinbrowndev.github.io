import assert from 'node:assert/strict';
import * as THREE from '../../../vendor/three/three.module.js';
import { installJwebVisualProbe } from '../runtime-visual-probe.js';

globalThis.window = {};
let freecam = false;
let moved = 0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16/9, 0.1, 1000);
const renderer = {
  domElement: { getBoundingClientRect(){ return {left:0,top:0,width:1280,height:720}; } },
};
const api = installJwebVisualProbe({
  THREE, scene, camera, renderer, chunkSize:64,
  setFreecam(value){ freecam = !!value; },
  onCameraMoved(){ moved++; },
  getPayloadEntries(){ return []; },
  getStatus(){ return { worldStream:{ chunkSize:64, localRenderRing:{complete:true}, localStructuralRenderRing:{complete:true}, localPrefetchRing:{complete:true} }, authored:{structuresComplete:true,pendingSites:0} }; },
});

const preset = api.artisticPreset(['composition','circulation','material']);
assert.deepEqual(preset.lenses,['composition','circulation','material']);
assert.ok(preset.questions.every(item=>item.question.length>20));
assert.ok(preset.world.passes.includes('beauty'));
assert.ok(preset.target.passes.includes('semantic'),'circulation lens should retain semantic design authority');
assert.ok(preset.target.filters.includes('lowpass-9'),'art review should include simplified value/massing evidence');

const movedTo = await api.gotoChunk(8,-3,{height:42,lookAtY:12,settle:false});
assert.equal(freecam,true);
assert.ok(moved>0);
assert.equal(movedTo.chunk.key,'8,-3');
assert.equal(camera.position.x,8*64);
assert.equal(camera.position.z,-3*64);
assert.equal(camera.position.y,42);

assert.equal(api.help().realCity.includes('captureArtPass'),true);
assert.equal(api.defaults.artisticLenses.facade.question.includes('facade'),true);
console.log(JSON.stringify({pass:true,lenses:preset.lenses,location:movedTo.chunk,freecam,moved},null,2));
delete globalThis.window;
