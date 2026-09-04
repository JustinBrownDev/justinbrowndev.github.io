import assert from 'node:assert/strict';
import {
  GUARDRAIL_AUTHORITY_SCHEMA,
  guardFamilyForContext,
  guardOpeningWidth,
  guardProfile,
  planFlightGuardPair,
  planHorizontalGuardSpan,
  splitHorizontalGuardSpan,
} from '../world/guardrail-authority.js';

const fire = guardProfile('fire-escape-pipe');
const civic = guardProfile('residential-civic-bar');
const municipal = guardProfile('municipal-concrete');
assert.ok(fire.memberThickness < civic.memberThickness, 'fire escape members must visibly read skinnier than ordinary civic/residential bars');
assert.ok(civic.height > fire.height, 'ordinary civic/residential guard may be more substantial than the accepted fire-escape guard');
assert.ok(municipal.bodyThickness >= 0.16 && municipal.construction === 'solid-mold', 'municipal guard must read as a real concrete mold/barrier');

assert.equal(guardFamilyForContext({ supportKind: 'scaffold-rail' }), 'fire-escape-pipe');
assert.equal(guardFamilyForContext({ supportKind: 'parapet' }), 'municipal-concrete');
const traversalParapet = guardProfile('roof-traversal-parapet');
assert.ok(traversalParapet.height < 0.65, 'transport-roof parapet must sit safely below the controller max-step threshold');
assert.equal(traversalParapet.construction, 'solid-mold');
assert.equal(guardFamilyForContext({ physicalUse: 'residential-lodging', visualRole: 'stair' }), 'residential-civic-bar');
assert.equal(guardFamilyForContext({ physicalUse: 'industrial-service', visualRole: 'transport-stair' }), 'fire-escape-pipe');
assert.equal(guardFamilyForContext({ physicalUse: 'assembly-institutional', visualRole: 'stair' }), 'residential-civic-bar');

const landing = planHorizontalGuardSpan({ id: 'landing', x1: -2.4, z1: 1, x2: 2.4, z2: 1, y: 3.2, family: 'fire-escape-pipe' });
assert.equal(landing.schema, GUARDRAIL_AUTHORITY_SCHEMA);
assert.ok(Math.abs((landing.collision.yMax - landing.collision.yMin) - fire.height) < 1e-9);
assert.ok(landing.visual.some(item => item.role === 'top-rail'));
assert.ok(landing.visual.some(item => item.role === 'mid-rail'));
assert.ok(landing.visual.filter(item => item.role === 'post').length >= 4);
assert.ok(landing.visual.every(item => item.material === 'metal'));

const mold = planHorizontalGuardSpan({ id: 'mold', x1: 0, z1: -2, x2: 0, z2: 2, y: 0, family: 'municipal-concrete' });
assert.deepEqual(new Set(mold.visual.map(item => item.role)), new Set(['concrete-body', 'concrete-cap']));
assert.ok(mold.visual.every(item => item.material === 'concrete'));

const xFlight = planFlightGuardPair({
  id: 'flight-x', axis: 'x', from: -3, to: 3, fixedCoord: 0, halfWidth: 0.46,
  y0: 0, y1: 3.2, family: 'fire-escape-pipe',
});
assert.equal(xFlight.length, 2);
assert.ok(xFlight.every(side => side.role === 'flight-side' && side.family === 'fire-escape-pipe'));
assert.ok(xFlight.every(side => side.visual.some(item => item.role === 'top-rail' && Math.abs(item.rz) > 0.01)),
  'x-axis stair top rails must actually tilt with the stair');

const zFlight = planFlightGuardPair({
  id: 'flight-z', axis: 'z', from: 4, to: -2, fixedCoord: 6, halfWidth: 0.55,
  y0: 0.8, y1: 4.0, family: 'residential-civic-bar',
});
assert.ok(zFlight.every(side => side.visual.some(item => item.role === 'top-rail' && Math.abs(item.rx) > 0.01)),
  'z-axis stair top rails must actually tilt with the stair');

const playerOpening = guardOpeningWidth(0.3, { playerRadius: 0.22 });
assert.ok(playerOpening >= 0.72, 'guard cuts must never collapse below the traversal minimum');
const split = splitHorizontalGuardSpan({ span: landing, point: { x: 0, z: 1 }, width: playerOpening });
assert.equal(split.length, 2, 'a real circulation opening should split one guard into two regenerated spans');
assert.ok(split.every(piece => piece.family === landing.family));
assert.ok(split[0].visual.some(item => item.role === 'post') && split[1].visual.some(item => item.role === 'post'),
  'carved guard ends regenerate posts instead of leaving chopped floating bars');

console.log('[guardrail-authority-selftest] PASS', {
  families: [fire.family, civic.family, municipal.family],
  fireMember: fire.memberThickness,
  civicMember: civic.memberThickness,
  municipalBody: municipal.bodyThickness,
  playerOpening,
  invariant: 'collision guard is continuous; visuals are semantic family geometry; carved openings regenerate clean ends',
});
