import assert from 'node:assert/strict';
import fs from 'node:fs';

const contextSource = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
const enrichmentSource = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const buildingSource = fs.readFileSync(new URL('../world/building-construction.js', import.meta.url), 'utf8');
const fabricSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');

// Portal topology must produce both sacred negative space and positive semantic complements.
assert.match(contextSource, /role: 'connector-adjacent-zone'/);
assert.match(contextSource, /decorationMayIntrude: false/);
assert.match(contextSource, /role: 'portal-flank-ground-zone'/);
assert.match(contextSource, /role: 'portal-flank-wall-zone'/);
assert.match(contextSource, /role: 'portal-lintel-zone'/);
assert.match(contextSource, /role: 'connector-service-zone'/);
assert.match(contextSource, /reservationIds:/);

// Exterior realization may not rediscover facade positions after semantic binding.
for (const name of ['createPanel','createPipe','createAwning','createIvy','createFlyer','createSecurity','createElevatorHardware','createStreetFixture']) {
    const start = enrichmentSource.indexOf(`function ${name}`);
    assert.ok(start >= 0, `missing ${name}`);
    const next = enrichmentSource.indexOf('\n    function ', start + 12);
    const body = enrichmentSource.slice(start, next > start ? next : start + 5000);
    assert.doesNotMatch(body, /facadePoint\(/, `${name} must consume semanticPlacement instead of recomputing facade geometry`);
    assert.match(body, /semanticPlacementPoint\(/, `${name} must consume the authoritative semantic transform`);
}

// Retire the old geometry-first authored fire escape. Exterior stair imagery must
// come from a connector-owned route, not a decorative staircase that invents travel.
assert.doesNotMatch(buildingSource, /buildFireEscape\(facade,/, 'legacy geometry-first fire escape must not be active');
assert.match(buildingSource, /legacyFireEscapeSuppressed/);
assert.match(fabricSource, /visualFamilies = \[/, 'connector-owned exterior scaffold needs deterministic visual families');
for (const family of ['switchback-mesh','tight-service','heavy-landing','long-industrial']) assert.match(fabricSource, new RegExp(family));
assert.match(fabricSource, /visualFamily: visualFamily\.id/);
assert.match(fabricSource, /registerSemanticConnector\(physics, createLandingConnector/);
assert.match(fabricSource, /registerSemanticConnector\(physics, createRampConnector/);
assert.match(fabricSource, /source: 'exterior-scaffold'/);

console.log('PASS semantic circulation exterior authority');
