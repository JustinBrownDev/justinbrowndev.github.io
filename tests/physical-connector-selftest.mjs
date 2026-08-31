import assert from 'node:assert/strict';
import { classifyPhysicalUse } from '../world/physical-use.js';
import { deriveStairFlight, resolvePhysicalTruth } from '../world/physical-truth.js';
import { semanticPortalForRect, createPortalConnector, createStairConnector } from '../world/semantic-connectors.js';

const use=classifyPhysicalUse({morphology:'dense-tenement',stableKey:'shop',override:'mercantile-public'});
const truth=resolvePhysicalTruth({physicalUse:use,role:'accessible-public-entry',weirdness:.55,stableKey:'shop'});
const portal=semanticPortalForRect({id:'p',rect:{cx:0,cz:0,halfX:2,halfZ:2},side:'north',floorH:truth.floorHeight.realizedSI,physicalTruth:truth});
const door=createPortalConnector({id:'d',portal,physicalTruth:truth});
assert.equal(door.physicalTruth,truth);
assert.equal(door.aperture.width,truth.door.clearWidth.realizedSI);
assert.equal(door.aperture.height,truth.door.clearHeight.realizedSI);
assert.equal(door.endpoints[0].dimensionAuthority,'resolved-physical-truth');

const flight=deriveStairFlight({rise:truth.floorHeight.realizedSI,truth,stableKey:'stairs',availableRun:4.5});
const stair=createStairConnector({id:'s',x:0,z:0,openingWidth:1.3,openingDepth:4.8,baseY:0,roofY:truth.floorHeight.realizedSI,rampAxis:'z',rampFrom:-2.25,rampTo:2.25,rampHalfWidth:.5,physicalTruth:truth,stairFlight:flight});
assert.equal(stair.physicalTruth,truth);
assert.equal(stair.stairFlight.stepCount,flight.stepCount);
assert.equal(stair.endpoints[1].height,truth.stair.headroomSI);

const fallback=semanticPortalForRect({id:'legacy',rect:{cx:0,cz:0,halfX:2,halfZ:2},side:'south'});
assert.equal(fallback.physicalTruth.architecturalAuthority,false);
assert.equal(fallback.dimensionAuthority,'explicit-legacy-fallback');
console.log('PASS physical connector truth', {door:door.aperture, steps:flight.stepCount, fallback:fallback.dimensionAuthority});
