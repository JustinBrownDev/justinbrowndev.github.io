// tests/room-signifier-corpus-completeness-selftest.mjs
//
// Mechanically derives every semantic room/zone concept JWEB can currently
// produce (world/room-signifier-corpus.js) and asserts the guaranteed
// signifier catalogue (world/room-signifier-recipes.js) resolves every
// single one. MISSING must equal zero. This test derives its concept list
// from the real source exports -- it cannot silently fall behind a rename
// or a newly-added zone/program the way a hand-maintained list would.

import assert from 'node:assert/strict';
import { enumerateAllConcepts } from '../world/room-signifier-corpus.js';
import { resolveRoomSignifierRecipe } from '../world/room-signifier-recipes.js';

const corpus = enumerateAllConcepts();

const tierCounts = {};
const missing = [];
const fallbackHits = []; // role-fallback / generic-family-role on a KNOWN architecture concept

function check(label, descriptor) {
  const resolution = resolveRoomSignifierRecipe(descriptor);
  tierCounts[resolution.tier] = (tierCounts[resolution.tier] ?? 0) + 1;
  if (resolution.tier === 'missing') missing.push({ label, descriptor, tried: resolution.tried });
  if (resolution.tier === 'role-fallback' || resolution.tier === 'generic-family-role') {
    fallbackHits.push({ label, tier: resolution.tier, resolvedKey: resolution.resolvedKey });
  }
  return resolution;
}

// A. Every program-architecture zone (ground/upper/route/morphology templates).
for (const concept of corpus.architectureConcepts) {
  check(`${concept.program}:${concept.floorKind}:${concept.key}`, {
    semanticProgram: concept.program, operationalRole: concept.operationalRole, role: concept.role,
  });
}

// B. Every nested APARTMENT_UNIT-style dwelling room.
for (const concept of corpus.nestedConcepts) {
  check(`nested:${concept.program}:${concept.key}`, { nestedRoomKey: concept.key, role: concept.role });
}

// C. Every semantic-megapack recipe program that has NO dedicated
// program-architecture profile -- these can only resolve via the
// whole-program legacy tier (tier 4), since there is no operationalRole to
// key off. Programs that DO have a profile are already fully exercised
// zone-by-zone in section A above; re-probing them with operationalRole:null
// here would test an input shape that never actually occurs at runtime.
for (const concept of corpus.legacyConcepts) {
  if (concept.hasProgramArchitecture) continue;
  check(`legacy:${concept.program}`, { semanticProgram: concept.program, role: null });
}

// D. Every generic physical-use family program, exercised against the full
// (mechanically-derived) role vocabulary so a future new role is noticed too.
for (const concept of corpus.genericConcepts) {
  for (const role of corpus.roleVocabulary) {
    check(`generic:${concept.program}:${role}`, { semanticProgram: concept.program, operationalRole: null, role });
  }
}

// E. The role vocabulary itself must always resolve (defensive safety net).
for (const role of corpus.roleVocabulary) {
  check(`role-only:${role}`, { role });
}

const coverageMatrix = {
  'semantic programs discovered (legacy megapack)': corpus.stats.legacyRecipePrograms,
  'architecture program/operational-role pairs discovered': corpus.stats.architectureZoneConcepts,
  'nested unit room concepts discovered': corpus.stats.nestedDwellingRoomConcepts,
  'generic physical-use programs discovered': corpus.stats.genericPhysicalUsePrograms,
  'role vocabulary size (defensive net)': corpus.stats.roleVocabularySize,
  'concepts checked total': Object.values(tierCounts).reduce((a, b) => a + b, 0),
  'concepts with an explicit signifier recipe (exact/profile/legacy tiers)':
    (tierCounts['exact-program-role'] ?? 0) + (tierCounts['profile-role-fallback'] ?? 0)
    + (tierCounts['legacy-program'] ?? 0) + (tierCounts['nested-dwelling-room'] ?? 0),
  'concepts using defensive fallback (generic-family-role + role-fallback)':
    (tierCounts['generic-family-role'] ?? 0) + (tierCounts['role-fallback'] ?? 0),
  'concepts with NO furnishing strategy (MUST BE 0)': missing.length,
};

console.log('[room-signifier-corpus-completeness] tier breakdown', tierCounts);
console.log('[room-signifier-corpus-completeness] coverage matrix', coverageMatrix);
if (missing.length) console.log('[room-signifier-corpus-completeness] MISSING CONCEPTS', missing.slice(0, 20));

assert.equal(missing.length, 0, `UNMAPPED SEMANTIC CONCEPTS must be 0, got ${missing.length}: ${JSON.stringify(missing.slice(0, 5))}`);

// Known-concept fallback usage should approach zero: every REAL architecture
// zone concept (source A) should resolve via exact/profile/legacy tiers, not
// the defensive net. Fallback firing there means a real recipe is missing,
// not just an inherently-generic program being intentionally neutral.
const architectureFallbacks = [];
for (const concept of corpus.architectureConcepts) {
  const resolution = resolveRoomSignifierRecipe({ semanticProgram: concept.program, operationalRole: concept.operationalRole, role: concept.role });
  if (resolution.tier === 'role-fallback' || resolution.tier === 'generic-family-role') architectureFallbacks.push({ concept, resolution });
}
console.log('[room-signifier-corpus-completeness] defensive-fallback hits on REAL architecture zones (should be 0 or near it)', architectureFallbacks.length, architectureFallbacks.map(f => `${f.concept.program}:${f.concept.operationalRole}`));
assert.ok(architectureFallbacks.length === 0, `every real program-architecture zone should have an explicit (non-defensive) recipe; fell back for: ${architectureFallbacks.map(f => `${f.concept.program}:${f.concept.operationalRole}`).join(', ')}`);

console.log('[room-signifier-corpus-completeness-selftest] PASS', coverageMatrix);
