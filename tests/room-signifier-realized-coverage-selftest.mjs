// tests/room-signifier-realized-coverage-selftest.mjs
//
// Generates representative real BuildingPlans (seed 671278205, section 34 of
// the assignment) across program families -- apartment/domestic, office,
// retail, food service, clinic, laboratory, warehouse, server facility,
// utility, industrial/workshop -- and asserts every eligible realized
// topologySpace actually receives a furnishing plan, using the real
// program-architecture/building-plan-sidecar/building-plan-authority
// pipeline (not a hand-rolled stand-in). Also exercises 'library', a program
// that uses the old semantic recipe corpus but has no dedicated
// program-architecture profile -- the valuable fallback case section 34
// asks for explicitly.

import assert from 'node:assert/strict';
import { buildRepresentativeBuildingPlan, REPRESENTATIVE_PROGRAMS, LEGACY_RECIPE_ONLY_PROGRAM, ROOM_SIGNIFIER_TEST_SEED } from './room-signifier-test-fixtures.mjs';
import { planRoomSignifiers } from '../world/room-signifier-planner.js';
import { resolveRoomSignifierRecipe } from '../world/room-signifier-recipes.js';

console.log('[room-signifier-realized-coverage] seed', ROOM_SIGNIFIER_TEST_SEED);

const perProgram = {};
let totalConsidered = 0, totalPlanned = 0, totalRealized = 0, totalNoStrategy = 0;

for (const program of REPRESENTATIVE_PROGRAMS) {
  const { buildingPlan, entity, payload, chunk } = buildRepresentativeBuildingPlan(program);
  const report = planRoomSignifiers({ buildingPlan, chunk, payload, entityId: entity.id });

  // Every eligible space (one with real region geometry) must have a
  // furnishing STRATEGY, even if the geometry couldn't realize it.
  const noStrategy = report.spaces.filter(s => s.resolutionTier !== 'skipped' && !s.semanticIdentityPlanned);
  assert.equal(noStrategy.length, 0, `${program}: ${noStrategy.length} realized spaces have no furnishing strategy at all: ${JSON.stringify(noStrategy.slice(0, 3))}`);

  perProgram[program] = report.stats;
  totalConsidered += report.stats.spacesConsidered;
  totalPlanned += report.stats.spacesConsidered - report.stats.spacesWithNoStrategy;
  totalRealized += report.stats.spacesFurnished;
  totalNoStrategy += report.stats.spacesWithNoStrategy;

  // At least SOME real furniture must land for a program family this common
  // and this well-covered by the recipe catalogue -- an all-zero result
  // would mean the space-plan integration is broken, not just one hard room.
  assert.ok(report.stats.spacesFurnished > 0, `${program}: expected at least one furnished space, got 0`);
  console.log(`[room-signifier-realized-coverage] ${program}`, report.stats);
}

assert.equal(totalNoStrategy, 0, `no realized space across any representative program should lack a strategy, got ${totalNoStrategy}`);
const realizedRatio = totalRealized / Math.max(1, totalPlanned);
console.log('[room-signifier-realized-coverage] aggregate', { totalConsidered, totalPlanned, totalRealized, totalNoStrategy, realizedRatio: realizedRatio.toFixed(3) });
assert.ok(realizedRatio >= 0.5, `expected the majority of planned spaces to actually realize a cue on representative fixtures, got ${realizedRatio}`);

// Deliberate fallback case: a semantic-megapack program with no dedicated
// program-architecture profile (physicalUseFamiliesForProgram still applies,
// programArchitectureFor returns null) must still resolve via the
// whole-program legacy tier, not silently fall through to nothing.
const legacyResolution = resolveRoomSignifierRecipe({ semanticProgram: LEGACY_RECIPE_ONLY_PROGRAM, operationalRole: null, role: 'public' });
console.log('[room-signifier-realized-coverage] legacy-recipe-only program resolution', LEGACY_RECIPE_ONLY_PROGRAM, legacyResolution.tier, legacyResolution.resolvedKey);
assert.equal(legacyResolution.tier, 'legacy-program', `${LEGACY_RECIPE_ONLY_PROGRAM} should resolve via the whole-program legacy tier`);
assert.ok(legacyResolution.recipe.cues.length > 0);

console.log('[room-signifier-realized-coverage-selftest] PASS', { programs: Object.keys(perProgram).length, totalConsidered, totalRealized, realizedRatio: +realizedRatio.toFixed(3) });
