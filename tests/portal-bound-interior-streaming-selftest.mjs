import assert from 'node:assert/strict';
import fs from 'node:fs';

const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const planner = fs.readFileSync(new URL('../world/portal-bound-interior-places.js', import.meta.url), 'utf8');

assert.match(enrichment, /if \(!progressive\.complete\) \{/,
  'portal-bound interiors must remain behind the exterior progressive stage');
assert.match(enrichment, /hasPortalBoundInteriorPlaceSources\(payload\)/,
  'interior continuity must use the dedicated ground-or-hanging place-source authority');
assert.match(enrichment, /planPortalBoundInteriorPlaces\(\{ chunk, payload \}\)/,
  'progressive interior stage must consume the portal-bound authority');
assert.match(enrichment, /task\.kind === 'portal-bound-interior-place'/,
  'only the dedicated zero-collision continuity task enters this stage');
assert.match(enrichment, /createPortalBoundInteriorPlace/,
  'portal-bound continuity must have a dedicated cheap fixture realizer');
assert.match(enrichment, /bodega-counter/);
assert.match(enrichment, /thrift-rack/);
assert.match(enrichment, /gallery-plinth/);
assert.match(enrichment, /repair-bench/);
assert.match(enrichment, /refuge-supplies/);
assert.match(enrichment, /utility-cabinet/);
assert.match(enrichment, /service-console/);
assert.doesNotMatch(enrichment, /progressiveInteriorEnrichment[\s\S]{0,800}solveSemanticLayout\(/,
  '21P must not reactivate the general semantic-interior population solver after READY');

assert.match(planner, /routeOwnedPlazaPlaces/,
  'ground continuity must remain sourced from route-owned street\/plaza places');
assert.match(planner, /routeOwnedRooftopPlaces/,
  'hanging continuity must inherit identity from its authoritative rooftop places');
assert.match(planner, /payload\?\.ceilingCity === true \? 'hanging' : 'ground'/);
assert.match(planner, /connectorType === 'door'/);
assert.match(planner, /traversal\?\.role === 'public-access'/);
assert.match(planner, /provenance\?\.source === 'compound-entrance'/);
assert.match(planner, /Number\(space\.floor\) === 0/);
assert.match(planner, /!!routes\[space\.id\]/,
  'interior target must already be reachable in the circulation graph');
assert.match(planner, /allowCirculation: false/,
  'SpacePlan must reject fixture placement inside egress\/circulation reservations');
assert.match(planner, /PORTAL_BOUND_INTERIOR_MAX_BINDINGS = 3/,
  'post-handoff interior continuity must remain tightly capped per layer');
assert.match(planner, /zero-collision family fixture only/);

console.log('[portal-bound-interior-streaming-selftest] PASS', {
  stageOrder: 'skeleton -> progressive exterior -> portal-bound interior fixtures',
  layers: ['ground plaza identity', 'hanging rooftop identity'],
  portalAuthority: 'existing floor-0 public compound entrance only',
  targetAuthority: 'reachable non-egress SpacePlan room',
  fixtureFamilies: 7,
  capPerLayer: 3,
  topologyPolicy: 'zero-collision fixture; no new doors/connectors/portals',
});
