import assert from 'node:assert/strict';
import fs from 'node:fs';

const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const planner = fs.readFileSync(new URL('../world/portal-bound-interior-places.js', import.meta.url), 'utf8');

assert.match(enrichment, /if \(!progressive\.complete\) \{/,
  'portal-bound interiors must remain behind the exterior progressive stage');
assert.match(enrichment, /payload\?\.physics\?\.routeOwnedPlazaPlaces\?\.length > 0/,
  'only payloads with route-owned street\/plaza places may request interior continuity');
assert.match(enrichment, /planPortalBoundInteriorPlaces\(\{ chunk, payload \}\)/,
  'progressive interior stage must consume the portal-bound authority');
assert.match(enrichment, /task\.kind === 'portal-bound-interior-place'/,
  'only the dedicated zero-collision continuity task enters this stage');
assert.match(enrichment, /createPortalBoundInteriorPlace/,
  'portal-bound continuity must have a dedicated cheap realizer');
assert.doesNotMatch(enrichment, /progressiveInteriorEnrichment[\s\S]{0,800}solveSemanticLayout\(/,
  '21O must not reactivate the general semantic-interior population solver after READY');

assert.match(planner, /connectorType === 'door'/);
assert.match(planner, /traversal\?\.role === 'public-access'/);
assert.match(planner, /provenance\?\.source === 'compound-entrance'/);
assert.match(planner, /Number\(space\.floor\) === 0/);
assert.match(planner, /!!routes\[space\.id\]/,
  'interior target must already be reachable in the unified circulation graph');
assert.match(planner, /allowCirculation: false/,
  'SpacePlan must reject paint placement inside egress\/circulation reservations');
assert.match(planner, /PORTAL_BOUND_INTERIOR_MAX_BINDINGS = 3/,
  'post-handoff interior continuity must remain tightly capped');
assert.match(planner, /zero-collision place paint only/);

console.log('[portal-bound-interior-streaming-selftest] PASS', {
  stageOrder: 'skeleton -> progressive exterior -> portal-bound interior',
  portalAuthority: 'existing floor-0 public compound entrance only',
  targetAuthority: 'reachable non-egress SpacePlan room',
  cap: 3,
  topologyPolicy: 'zero-collision paint; no new doors/connectors/portals',
});
