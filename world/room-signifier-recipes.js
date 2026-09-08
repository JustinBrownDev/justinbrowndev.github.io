// world/room-signifier-recipes.js
//
// The guaranteed-signifier recipe catalogue + layered resolver.
//
// A recipe is a short list of "cues" -- primitive-kind + placement strategy
// pairs, ordered by priority. The planner (world/room-signifier-planner.js)
// takes the highest-priority cues first, up to the room's size-class minimum,
// and degrades gracefully if a cue can't be placed (see section 40 of the
// assignment: never block the door, never silently render nothing).
//
// Resolution order for a realized space (most specific wins):
//   1. nested dwelling-unit room key      (apartment-unit:<roomKey>)
//   2. exact program:operationalRole      (e.g. grocery:sales-floor)
//   3. profile-id:operationalRole         (e.g. retail-service:sales-floor)
//   4. whole-program legacy recipe        (program:<id>, e.g. program:library)
//   5. generic physical-use family + role (e.g. generic_mercantile:public)
//   6. role-only defensive fallback       (role:<role>)
// Tier 6 always exists for every role in the 9-value vocabulary, so no
// concept can ever resolve to nothing -- but it should almost never fire for
// a concept that already has real coverage above it (the completeness test
// tracks fallback usage precisely so new concepts get noticed, not buried).

import { programArchitectureFor } from './architecture/program-architecture.js';
import { physicalUseFamiliesForProgram } from './physical-use.js';
import { enumerateGenericPhysicalUseConcepts } from './room-signifier-corpus.js';

export const ROOM_SIGNIFIER_RECIPES_SCHEMA = 'jweb.room-signifier-recipes.v1';

function F(primitiveKind, opts = {}) {
  return Object.freeze({
    id: opts.id ?? primitiveKind, placement: 'floor', primitiveKind,
    priority: opts.p ?? 1, pairWith: opts.pairWith ?? null, pairOffset: opts.pairOffset ?? null,
    rotation: opts.rotation ?? null, optional: opts.optional === true,
  });
}
function W(primitiveKind, opts = {}) {
  return Object.freeze({
    id: opts.id ?? primitiveKind, placement: 'wall', primitiveKind,
    priority: opts.p ?? 1, optional: opts.optional === true,
  });
}
function R(primitiveKind, opts = {}) {
  return Object.freeze({
    id: opts.id ?? `${primitiveKind}-row`, placement: 'floor-row', primitiveKind,
    priority: opts.p ?? 1, rowSpacing: opts.spacing ?? 1.15, rowMaxCount: opts.max ?? 5, rowMinCount: opts.min ?? 2,
    optional: opts.optional === true,
  });
}
function recipe(id, cues) {
  return Object.freeze({ id, cues: Object.freeze([...cues].sort((a, b) => a.priority - b.priority)) });
}

const entries = [];
const add = (id, cues) => entries.push([id, recipe(id, cues)]);

// ---------------------------------------------------------------------------
// APARTMENT (profile 'apartment')
// ---------------------------------------------------------------------------
add('apartment:entry', [W('mailbox_bank', { p: 1 }), W('wall_panel', { p: 2, optional: true })]);
add('apartment:circulation', [W('wall_board', { p: 1 }), W('wall_shelf', { p: 2, optional: true })]);
add('apartment:resident-passage', [W('mailbox_bank', { p: 1 }), W('wall_panel', { p: 2, optional: true })]);
add('apartment:dwelling-unit', [F('table', { p: 1 }), F('chair', { p: 2, pairWith: 'table', pairOffset: { x: 0, z: 0.8 } }), F('dresser', { p: 3 }), F('bed', { p: 4, optional: true })]);
add('apartment:shared-service', [F('cabinet', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('apartment:shared-room', [F('sofa', { p: 1 }), F('table', { p: 2 }), F('chair', { p: 3, pairWith: 'table', pairOffset: { x: 0.95, z: 0 } })]);
add('apartment:court-edge', [F('bench', { p: 1 }), F('floral_display', { p: 2, optional: true })]);

// nested dwelling-unit rooms (own namespace so 'entry' etc. never collides
// with the top-level building zone of the same key)
add('apartment-unit:entry', [F('cabinet', { p: 1 }), W('wall_panel', { p: 2, optional: true })]);
add('apartment-unit:living-dining', [F('sofa', { p: 1 }), F('table', { p: 2 }), F('chair', { id: 'chair-a', p: 3, pairWith: 'table', pairOffset: { x: 0.95, z: 0 } }), F('chair', { id: 'chair-b', p: 4, pairWith: 'table', pairOffset: { x: -0.95, z: 0 }, optional: true })]);
add('apartment-unit:kitchen', [F('counter', { p: 1 }), F('appliance_block', { p: 2 }), F('cabinet', { p: 3, optional: true })]);
add('apartment-unit:bedroom', [F('bed', { p: 1 }), F('nightstand', { p: 2, pairWith: 'bed', pairOffset: { x: 0.9, z: -0.75 } }), F('dresser', { p: 3 })]);
add('apartment-unit:bathroom', [F('sink_vanity', { p: 1 }), F('toilet', { p: 2 })]);

// ---------------------------------------------------------------------------
// MOTEL (profile 'motel-room-building')
// ---------------------------------------------------------------------------
add('motel-room-building:entry', [W('wall_panel', { p: 1 })]);
add('motel-room-building:lobby', [F('counter', { p: 1 }), F('bench', { p: 2 })]);
add('motel-room-building:circulation', [W('wall_board', { p: 1 })]);
add('motel-room-building:lodging-room', [F('bed', { p: 1 }), F('nightstand', { p: 2, pairWith: 'bed', pairOffset: { x: 0.9, z: -0.75 } }), F('dresser', { p: 3 }), W('wall_panel', { p: 4, optional: true })]);
add('motel-room-building:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// RETAIL (profile 'retail-service') + program-specific overrides
// ---------------------------------------------------------------------------
add('retail-service:entry', [W('wall_panel', { p: 1 })]);
add('retail-service:sales-floor', [R('shelf_rack', { p: 1, max: 4 }), F('counter', { p: 2 })]);
add('retail-service:back-work', [F('table', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('retail-service:stock', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2 })]);
add('retail-service:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('retail-service:circulation', [W('wall_panel', { p: 1 })]);
add('retail-service:work-floor', [F('shelf_rack', { p: 1 }), F('counter', { p: 2 })]);
add('retail-service:storage', [R('shelf_rack', { p: 1, max: 5 }), F('crate_cluster', { p: 2 })]);
add('retail-service:route-spine', [W('wall_panel', { p: 1 })]);

add('grocery:sales-floor', [R('shelf_rack', { p: 1, max: 5, id: 'gondola-row' }), F('counter', { p: 2 }), F('appliance_block', { p: 3 }), F('crate_cluster', { p: 4, optional: true })]);
add('grocery:back-work', [F('table', { p: 1 }), F('crate_cluster', { p: 2 })]);
add('convenience:sales-floor', [F('counter', { p: 1 }), R('shelf_rack', { p: 2, max: 3 }), F('appliance_block', { p: 3 })]);
add('pharmacy:sales-floor', [R('shelf_rack', { p: 1, max: 4 }), F('counter', { p: 2 })]);
add('pharmacy:back-work', [F('cabinet', { p: 1 }), F('table', { p: 2 })]);
add('florist:sales-floor', [F('floral_display', { p: 1 }), F('counter', { p: 2 }), F('shelf_rack', { p: 3, optional: true })]);
add('butcher:sales-floor', [F('counter', { p: 1 }), F('appliance_block', { p: 2 }), F('machine_block', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// FOOD SERVICE (profile 'food-service') + diner overrides
// ---------------------------------------------------------------------------
add('food-service:entry', [W('wall_panel', { p: 1 })]);
add('food-service:dining', [F('table', { p: 1 }), F('chair', { id: 'chair-a', p: 2, pairWith: 'table', pairOffset: { x: 0.95, z: 0 } }), F('chair', { id: 'chair-b', p: 3, pairWith: 'table', pairOffset: { x: -0.95, z: 0 }, optional: true })]);
add('food-service:counter', [F('counter', { p: 1 }), R('stool', { p: 2, max: 4 })]);
add('food-service:kitchen', [F('counter', { p: 1 }), F('machine_block', { p: 2 }), F('shelf_rack', { p: 3, optional: true })]);
add('food-service:prep', [F('table', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('food-service:storage', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2 })]);
add('food-service:wash', [F('sink_vanity', { p: 1 }), F('shelf_rack', { p: 2, optional: true })]);
add('food-service:circulation', [W('wall_panel', { p: 1 })]);
add('food-service:support', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } })]);
add('food-service:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('food-service:route-spine', [W('wall_panel', { p: 1 })]);

add('diner:dining', [F('table', { p: 1 }), F('bench', { id: 'booth-a', p: 2, pairWith: 'table', pairOffset: { x: 0, z: -0.75 } }), F('bench', { id: 'booth-b', p: 3, pairWith: 'table', pairOffset: { x: 0, z: 0.75 } })]);
add('diner:counter', [F('counter', { p: 1 }), R('stool', { p: 2, max: 4 }), W('wall_board', { p: 3, optional: true })]);
add('diner:kitchen', [F('machine_block', { p: 1 }), F('shelf_rack', { p: 2 }), F('appliance_block', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// WORKSHOP RETAIL (profile 'workshop-retail') + program overrides
// ---------------------------------------------------------------------------
add('workshop-retail:entry', [W('wall_panel', { p: 1 })]);
add('workshop-retail:customer-counter', [F('counter', { p: 1 }), F('stool', { p: 2, optional: true })]);
add('workshop-retail:work-bay', [F('workbench', { p: 1 }), F('machine_block', { p: 2 })]);
add('workshop-retail:service-band', [F('shelf_rack', { p: 1 }), F('cabinet', { p: 2 })]);
add('workshop-retail:parts', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2 })]);
add('workshop-retail:circulation', [W('wall_panel', { p: 1 })]);
add('workshop-retail:work-loft', [F('workbench', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('workshop-retail:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('workshop-retail:storage', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2 })]);
add('workshop-retail:route-spine', [W('wall_panel', { p: 1 })]);

add('hardware_store:customer-counter', [F('counter', { p: 1 }), R('shelf_rack', { p: 2, max: 3, id: 'bin-display' })]);
add('hardware_store:work-bay', [W('wall_board', { p: 1 }), F('workbench', { p: 2 })]);
add('electronics_repair:work-bay', [F('workbench', { p: 1 }), F('machine_block', { p: 2 }), F('cabinet', { p: 3, optional: true })]);
add('print_shop:work-bay', [F('machine_block', { p: 1 }), F('workbench', { p: 2 }), F('shelf_rack', { p: 3, optional: true })]);
add('photo_lab:work-bay', [F('workbench', { p: 1 }), F('cabinet', { p: 2 }), F('table', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// FIRE STATION (profile 'fire-station')
// ---------------------------------------------------------------------------
add('fire-station:public-entry', [W('wall_panel', { p: 1 })]);
add('fire-station:watch-admin', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } })]);
add('fire-station:apparatus-bay', [R('machine_block', { p: 1, max: 3, spacing: 3.4, id: 'apparatus-row' })]);
add('fire-station:response-spine', [W('wall_board', { p: 1 })]);
add('fire-station:gear-support', [F('shelf_rack', { p: 1 }), F('cabinet', { p: 2, optional: true })]);
add('fire-station:maintenance', [F('workbench', { p: 1 }), F('cabinet', { p: 2 })]);
add('fire-station:living-dayroom', [F('sofa', { p: 1 }), F('table', { p: 2 })]);
add('fire-station:sleep-room', [F('bed', { p: 1 }), F('nightstand', { p: 2, pairWith: 'bed', pairOffset: { x: 0.9, z: -0.75 } })]);
add('fire-station:dayroom', [F('sofa', { p: 1 }), F('table', { p: 2 }), F('chair', { p: 3, pairWith: 'table', pairOffset: { x: 0.95, z: 0 }, optional: true })]);
add('fire-station:admin', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } }), F('filing_cabinet', { p: 3, optional: true })]);
add('fire-station:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// AUTO SHOP (profile 'auto-shop')
// ---------------------------------------------------------------------------
add('auto-shop:customer-entry', [W('wall_panel', { p: 1 })]);
add('auto-shop:customer-counter', [F('counter', { p: 1 }), F('stool', { p: 2, optional: true })]);
add('auto-shop:repair-bay', [F('two_post_lift', { p: 1 }), F('workbench', { p: 2 })]);
add('auto-shop:parts-service', [R('shelf_rack', { p: 1, max: 4 }), F('cabinet', { p: 2 })]);
add('auto-shop:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('auto-shop:circulation', [W('wall_panel', { p: 1 })]);
add('auto-shop:work-loft', [F('workbench', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('auto-shop:parts', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2 })]);

// ---------------------------------------------------------------------------
// CLINIC (profile 'clinic')
// ---------------------------------------------------------------------------
add('clinic:entry', [W('wall_panel', { p: 1 })]);
add('clinic:waiting', [R('bench', { p: 1, max: 3, spacing: 1.6 }), F('table', { p: 2, optional: true })]);
add('clinic:reception', [F('counter', { p: 1 }), F('chair', { p: 2, pairWith: 'counter', pairOffset: { x: 0, z: -0.65 } })]);
add('clinic:patient-corridor', [W('handrail', { p: 1 }), W('utility_cabinet_shallow', { p: 2, optional: true })]);
add('clinic:exam-room', [F('exam_table', { p: 1 }), F('stool', { p: 2, pairWith: 'exam_table', pairOffset: { x: 0.9, z: 0.3 } }), F('cabinet', { p: 3 })]);
add('clinic:nurse-work', [F('counter', { p: 1 }), F('chair', { p: 2, optional: true }), F('filing_cabinet', { p: 3, optional: true })]);
add('clinic:clean-supply', [F('cabinet', { p: 1 }), F('shelf_rack', { p: 2, optional: true })]);
add('clinic:soiled-utility', [F('sink_vanity', { p: 1 }), F('cabinet', { p: 2, optional: true })]);
add('clinic:staff-support', [F('table', { p: 1 }), F('chair', { p: 2, pairWith: 'table', pairOffset: { x: 0.95, z: 0 }, optional: true })]);
add('clinic:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// COURTHOUSE (profile 'courthouse')
// ---------------------------------------------------------------------------
add('courthouse:entry', [W('wall_panel', { p: 1 })]);
add('courthouse:public-corridor', [W('wall_board', { p: 1 }), W('handrail', { p: 2, optional: true })]);
add('courthouse:courtroom', [F('judge_bench', { p: 1 }), F('witness_stand', { p: 2 }), R('bench', { p: 3, max: 4, spacing: 1.4, id: 'spectator-row' })]);
add('courthouse:judge-route', [W('wall_panel', { p: 1 })]);
add('courthouse:judge-support', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } }), F('filing_cabinet', { p: 3, optional: true })]);
add('courthouse:secure-route', [W('wall_panel', { p: 1 })]);
add('courthouse:holding', [F('bench', { p: 1 }), F('cabinet', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// POLICE BOOKING (profile 'police-booking')
// ---------------------------------------------------------------------------
add('police-booking:public-entry', [W('wall_panel', { p: 1 })]);
add('police-booking:public-desk', [F('counter', { p: 1 }), F('chair', { p: 2, optional: true })]);
add('police-booking:staff-route', [W('wall_board', { p: 1 })]);
add('police-booking:booking', [F('counter', { p: 1 }), F('cabinet', { p: 2 }), F('console', { p: 3, optional: true })]);
add('police-booking:secure-route', [W('wall_panel', { p: 1 })]);
add('police-booking:holding', [F('bench', { p: 1 }), F('cabinet', { p: 2, optional: true })]);
add('police-booking:staff-work', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } }), F('filing_cabinet', { p: 3, optional: true })]);
add('police-booking:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// LABORATORY (profile 'laboratory')
// ---------------------------------------------------------------------------
add('laboratory:entry', [W('wall_panel', { p: 1 })]);
add('laboratory:control', [F('desk', { p: 1 }), F('console', { p: 2 })]);
add('laboratory:lab-corridor', [W('wall_panel', { p: 1 }), W('handrail', { p: 2, optional: true })]);
add('laboratory:lab-room', [F('table', { p: 1 }), F('fume_hood', { p: 2 }), F('stool', { p: 3, pairWith: 'table', pairOffset: { x: 0.95, z: 0 } })]);
add('laboratory:service-corridor', [W('pipe_manifold', { p: 1 }), W('utility_cabinet_shallow', { p: 2, optional: true })]);
add('laboratory:utility-spine', [W('pipe_manifold', { p: 1 }), F('tank', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// WAREHOUSE (profile 'warehouse')
// ---------------------------------------------------------------------------
add('warehouse:receiving', [F('pallet_stack', { p: 1 }), F('table', { p: 2, optional: true })]);
add('warehouse:staging-in', [R('crate_cluster', { p: 1, max: 3, spacing: 1.3 })]);
add('warehouse:aisle-grid', [W('wall_panel', { p: 1 })]);
add('warehouse:storage', [R('shelf_rack', { p: 1, max: 6, spacing: 1.3 })]);
add('warehouse:pick-pack', [F('table', { p: 1 }), F('crate_cluster', { p: 2 })]);
add('warehouse:staging-out', [R('pallet_stack', { p: 1, max: 3, spacing: 1.4 })]);
add('warehouse:shipping', [F('pallet_stack', { p: 1 }), F('table', { p: 2, optional: true })]);
add('warehouse:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('warehouse:work', [F('table', { p: 1 }), F('chair', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// SERVER FACILITY (profile 'server-facility') + program overrides
// ---------------------------------------------------------------------------
add('server-facility:entry-control', [F('console', { p: 1 }), W('wall_panel', { p: 2, optional: true })]);
add('server-facility:control', [F('desk', { p: 1 }), F('console', { p: 2 })]);
add('server-facility:rack-aisles', [R('server_rack', { p: 1, max: 8, spacing: 1.1 })]);
add('server-facility:power-cooling-spine', [F('machine_block', { p: 1 }), W('pipe_manifold', { p: 2 })]);
add('server-facility:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('server-facility:secure-circulation', [W('wall_panel', { p: 1 })]);

add('server_room:rack-aisles', [R('server_rack', { p: 1, max: 8, spacing: 1.1 }), F('cabinet', { p: 2 }), F('console', { p: 3, optional: true })]);
add('mainframe_room:rack-aisles', [R('machine_block', { p: 1, max: 6, spacing: 1.3, id: 'mainframe-row' }), F('console', { p: 2 }), F('desk', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// OFFICE (profile 'office-public') + program overrides
// ---------------------------------------------------------------------------
add('office-public:entry', [W('wall_panel', { p: 1 })]);
add('office-public:reception', [F('counter', { p: 1 }), F('chair', { p: 2, optional: true })]);
add('office-public:work-floor', [R('desk', { p: 1, max: 4, spacing: 1.6 }), F('filing_cabinet', { p: 2, optional: true })]);
add('office-public:meeting', [F('table', { p: 1 }), R('chair', { p: 2, max: 4, spacing: 0.7 }), W('wall_board', { p: 3, optional: true })]);
add('office-public:core', [W('wall_panel', { p: 1 })]);
add('office-public:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('office-public:route-spine', [W('wall_panel', { p: 1 })]);

add('office:work-floor', [R('desk', { p: 1, max: 4, spacing: 1.6 }), F('filing_cabinet', { p: 2 }), F('cabinet', { p: 3, optional: true })]);
add('1980s_office:work-floor', [R('desk', { p: 1, max: 4, spacing: 1.6 }), F('console', { p: 2 }), F('filing_cabinet', { p: 3, optional: true })]);
add('bank:reception', [F('counter', { p: 1 }), F('console', { p: 2 }), F('chair', { p: 3, optional: true })]);
add('bank:work-floor', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } }), F('bench', { p: 3, optional: true })]);
add('post_office:reception', [F('counter', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('post_office:work-floor', [F('shelf_rack', { p: 1 }), F('table', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// ARCHIVE (profile 'archive')
// ---------------------------------------------------------------------------
add('archive:entry', [W('wall_panel', { p: 1 })]);
add('archive:index-control', [F('counter', { p: 1 }), F('desk', { p: 2, optional: true })]);
add('archive:stacks', [R('shelf_rack', { p: 1, max: 8, spacing: 1.2 })]);
add('archive:circulation', [W('wall_panel', { p: 1 })]);
add('archive:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// UTILITY PLANT (profile 'utility-plant') + program overrides
// ---------------------------------------------------------------------------
add('utility-plant:entry', [W('wall_panel', { p: 1 })]);
add('utility-plant:control', [F('console', { p: 1 }), F('desk', { p: 2, optional: true })]);
add('utility-plant:plant', [R('tank', { p: 1, max: 3, spacing: 1.6 }), F('machine_block', { p: 2 })]);
add('utility-plant:service-spine', [W('pipe_manifold', { p: 1 }), F('cabinet', { p: 2, optional: true })]);
add('utility-plant:storage', [F('shelf_rack', { p: 1 }), F('crate_cluster', { p: 2, optional: true })]);
add('utility-plant:circulation', [W('wall_panel', { p: 1 })]);

add('boiler_room:plant', [F('boiler_tank', { p: 1 }), W('pipe_manifold', { p: 2 }), F('machine_block', { p: 3, optional: true })]);
add('factory_control:control', [F('console', { p: 1 }), W('wall_board', { p: 2 }), F('shelf_rack', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// LEGACY MEGAPACK PROGRAMS WITHOUT A PROGRAM-ARCHITECTURE PROFILE
// ---------------------------------------------------------------------------
add('program:laundromat', [R('appliance_block', { p: 1, max: 4, spacing: 0.85, id: 'washer-row' }), F('folding_table', { p: 2 }), F('chair', { p: 3, optional: true })]);
add('program:bar', [F('bar_counter', { p: 1 }), F('backbar_shelf', { p: 2, pairWith: 'bar_counter', pairOffset: { x: 0, z: -0.7 } }), R('stool', { p: 3, max: 3 })]);
add('program:arcade', [R('arcade_cabinet', { p: 1, max: 4, spacing: 0.9 }), F('machine_block', { p: 2, optional: true })]);
add('program:library', [R('shelf_rack', { p: 1, max: 5, spacing: 1.2, id: 'stack-bay' }), F('table', { p: 2 }), F('chair', { p: 3, pairWith: 'table', pairOffset: { x: 0.95, z: 0 }, optional: true })]);
add('program:dentist', [F('exam_table', { p: 1 }), F('console', { p: 2, pairWith: 'exam_table', pairOffset: { x: 1.0, z: -0.3 } }), F('cabinet', { p: 3 })]);
add('program:school_classroom', [R('desk', { p: 1, max: 6, spacing: 1.0, id: 'student-desks' }), F('desk', { id: 'teacher-desk', p: 2 }), W('wall_board', { p: 3 })]);
add('program:funeral_home', [F('bier', { p: 1 }), F('counter', { p: 2 }), F('floral_display', { p: 3, optional: true })]);
add('program:projection_booth', [F('machine_block', { p: 1 }), F('workbench', { p: 2 }), F('shelf_rack', { p: 3, optional: true })]);
add('program:radio_station', [F('console', { p: 1 }), F('shelf_rack', { p: 2 }), F('desk', { p: 3, optional: true })]);

// ---------------------------------------------------------------------------
// GENERIC PHYSICAL-USE FAMILIES (deliberately plausible-but-unresolved)
// ---------------------------------------------------------------------------
add('generic_residential:private', [F('bed', { p: 1 }), F('dresser', { p: 2 })]);
add('generic_residential:shared', [F('table', { p: 1 }), F('chair', { p: 2, pairWith: 'table', pairOffset: { x: 0.95, z: 0 } })]);
add('generic_residential:entry', [W('wall_panel', { p: 1 })]);
add('generic_mercantile:public', [F('counter', { p: 1 }), F('shelf_rack', { p: 2 })]);
add('generic_mercantile:work', [F('table', { p: 1 }), F('shelf_rack', { p: 2, optional: true })]);
add('generic_business:work', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 } })]);
add('generic_business:shared', [F('table', { p: 1 }), F('chair', { p: 2, optional: true })]);
add('generic_institutional:public', [F('bench', { p: 1 }), F('table', { p: 2, optional: true })]);
add('generic_institutional:work', [F('desk', { p: 1 }), F('chair', { p: 2, optional: true })]);
add('generic_institutional:service', [F('cabinet', { p: 1 }), W('wall_board', { p: 2, optional: true })]);
add('generic_industrial:work', [F('workbench', { p: 1 }), F('machine_block', { p: 2, optional: true })]);
add('generic_industrial:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('generic_storage:storage', [R('shelf_rack', { p: 1, max: 4 }), F('crate_cluster', { p: 2, optional: true })]);
add('generic_utility:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2 })]);
add('generic_utility:program', [F('tank', { p: 1 }), F('machine_block', { p: 2, optional: true })]);

// ---------------------------------------------------------------------------
// ROLE-ONLY DEFENSIVE SAFETY NET (always defined, should rarely fire)
// ---------------------------------------------------------------------------
add('role:entry', [W('wall_panel', { p: 1 })]);
add('role:circulation', [W('wall_board', { p: 1 })]);
add('role:private', [F('bed', { p: 1 }), F('dresser', { p: 2, optional: true })]);
add('role:program', [F('desk', { p: 1 }), F('chair', { p: 2, pairWith: 'desk', pairOffset: { x: 0, z: 0.75 }, optional: true })]);
add('role:public', [F('bench', { p: 1 }), F('table', { p: 2, optional: true })]);
add('role:service', [F('cabinet', { p: 1 }), W('pipe_manifold', { p: 2, optional: true })]);
add('role:shared', [F('table', { p: 1 }), F('chair', { p: 2, optional: true })]);
add('role:storage', [F('shelf_rack', { p: 1 }), F('crate_cluster', { p: 2, optional: true })]);
add('role:work', [F('desk', { p: 1 }), F('chair', { p: 2, optional: true })]);

export const ROOM_SIGNIFIER_RECIPES = new Map(entries);

// Family -> generic-program lookup, derived (not hand-duplicated) from
// room-signifier-corpus.js's self-checking enumerator.
const GENERIC_PROGRAM_BY_FAMILY = new Map(
  enumerateGenericPhysicalUseConcepts().map(c => [c.family, c.program]));

/**
 * Resolve the recipe for a realized space (or nested dwelling-unit room).
 * @param {object} descriptor
 * @param {string|null} descriptor.semanticProgram
 * @param {string|null} descriptor.operationalRole
 * @param {string|null} descriptor.role
 * @param {string|null} [descriptor.nestedRoomKey] - set for APARTMENT_UNIT-style nested rooms
 * @returns {{ recipe: object|null, resolvedKey: string|null, tier: string, tried: string[] }}
 */
export function resolveRoomSignifierRecipe(descriptor = {}) {
  const { semanticProgram, operationalRole, role, nestedRoomKey } = descriptor;
  const tried = [];

  if (nestedRoomKey) {
    const key = `apartment-unit:${nestedRoomKey}`;
    tried.push(key);
    const found = ROOM_SIGNIFIER_RECIPES.get(key);
    if (found) return { recipe: found, resolvedKey: key, tier: 'nested-dwelling-room', tried };
  }

  if (semanticProgram && operationalRole) {
    const key = `${semanticProgram}:${operationalRole}`;
    tried.push(key);
    const found = ROOM_SIGNIFIER_RECIPES.get(key);
    if (found) return { recipe: found, resolvedKey: key, tier: 'exact-program-role', tried };
  }

  if (semanticProgram && operationalRole) {
    const profile = programArchitectureFor(semanticProgram);
    if (profile) {
      const key = `${profile.id}:${operationalRole}`;
      tried.push(key);
      const found = ROOM_SIGNIFIER_RECIPES.get(key);
      if (found) return { recipe: found, resolvedKey: key, tier: 'profile-role-fallback', tried };
    }
  }

  if (semanticProgram) {
    const key = `program:${semanticProgram}`;
    tried.push(key);
    const found = ROOM_SIGNIFIER_RECIPES.get(key);
    if (found) return { recipe: found, resolvedKey: key, tier: 'legacy-program', tried };
  }

  if (semanticProgram && role) {
    for (const family of physicalUseFamiliesForProgram(semanticProgram)) {
      const generic = GENERIC_PROGRAM_BY_FAMILY.get(family);
      if (!generic) continue;
      const key = `${generic}:${role}`;
      tried.push(key);
      const found = ROOM_SIGNIFIER_RECIPES.get(key);
      if (found) return { recipe: found, resolvedKey: key, tier: 'generic-family-role', tried };
    }
  }

  if (role) {
    const key = `role:${role}`;
    tried.push(key);
    const found = ROOM_SIGNIFIER_RECIPES.get(key);
    if (found) return { recipe: found, resolvedKey: key, tier: 'role-fallback', tried };
  }

  return { recipe: null, resolvedKey: null, tier: 'missing', tried };
}
