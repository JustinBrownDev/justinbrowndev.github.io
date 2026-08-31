import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine=fs.readFileSync(new URL('../kowloon-fabric-engine.js',import.meta.url),'utf8');
const connectors=fs.readFileSync(new URL('../world/semantic-connectors.js',import.meta.url),'utf8');
const layout=fs.readFileSync(new URL('../world/semantic-layout.js',import.meta.url),'utf8');

assert.match(engine,/classifyPhysicalUse/);
assert.match(engine,/resolvePhysicalTruth/);
assert.match(engine,/deriveStairFlight/);
assert.match(engine,/physicalTruthDecision/);
assert.doesNotMatch(engine,/const stepCount = 7/);
assert.doesNotMatch(engine,/const steps = 12/);
assert.doesNotMatch(engine,/width: 1\.55,[\s\S]{0,60}height: 2\.2,[\s\S]{0,60}depth: 1\.2/);
assert.match(engine,/connectorOpeningWidth\(entranceConnectorByKey/);
assert.match(engine,/servicePhysicalTruth\.door\.clearWidth\.realizedSI/);
assert.match(connectors,/legacy-fallback-explicitly-unresolved/);
assert.match(connectors,/solver-clearance-not-architecture/);
assert.match(connectors,/gameplay-clearance-not-architecture/);
assert.match(layout,/programCompatibleWithPhysicalUse/);
assert.match(layout,/remapped-before-realization/);
console.log('PASS physical authority source contract');
