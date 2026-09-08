// world/room-signifier-corpus.js
//
// Mechanical enumerator of every semantic room/zone concept JWEB can
// currently realize. This is the "source of truth" the coverage tests
// compare the recipe catalogue against -- it must be derived from the real
// exports of the corpus modules, never hand-maintained, so a new zone key or
// program added later shows up here automatically instead of silently
// falling through a stale list.
//
// Four sources, matching the assignment's section 4:
//   A. every program-architecture.js zone (ground/upper/route/morphology templates)
//   B. every nested APARTMENT_UNIT dwelling room (reached via the zone's own
//      unitEnvelope field -- never re-declared here)
//   C. every SEMANTIC_ROOM_RECIPES id (the legacy megapack program corpus)
//   D. every generic physical-use family program
// plus a defensive fifth: the role vocabulary itself, derived as the union
// of every `role` actually observed on any zone found above.

import { programArchitectureFor, isSpecificProgramArchitecture } from './architecture/program-architecture.js';
import { physicalUseFamiliesForProgram, PHYSICAL_USE_FAMILIES } from './physical-use.js';
import { SEMANTIC_ROOM_RECIPES } from '../vendor/city-pack/semantic-megapack/room-recipes.js';

export const ROOM_SIGNIFIER_CORPUS_SCHEMA = 'jweb.room-signifier-corpus.v1';

// Candidate program strings to probe program-architecture.js/physical-use.js
// with. This union only needs to be *wide enough* to reach every profile and
// every legacy program that exists today -- programArchitectureFor() and
// physicalUseFamiliesForProgram() are themselves the authority on whether a
// given string means anything; probing a string that resolves to nothing is
// simply ignored below (see PROGRAM_USE gap note in the assignment: some
// SEMANTIC_ROOM_RECIPES ids have no program-architecture profile at all --
// that's an intentional, tested condition, not a bug in this enumerator).
const KNOWN_GENERIC_PROGRAMS = Object.freeze([
  'generic_residential', 'generic_mercantile', 'generic_business',
  'generic_institutional', 'generic_industrial', 'generic_storage', 'generic_utility',
]);

const CANDIDATE_SPECIFIC_PROGRAMS = Object.freeze([...new Set([
  'apartment', 'motel_room', 'diner', 'laundromat', 'grocery', 'convenience', 'pharmacy',
  'florist', 'butcher', 'hardware_store', 'print_shop', 'photo_lab', 'electronics_repair',
  'bar', 'arcade', 'office', '1980s_office', 'bank', 'post_office', 'library', 'archive',
  'clinic', 'dentist', 'school_classroom', 'courtroom', 'police_booking', 'funeral_home',
  'fire_station', 'auto_shop', 'laboratory', 'projection_booth', 'radio_station',
  'boiler_room', 'factory_control', 'server_room', 'mainframe_room', 'warehouse',
  ...SEMANTIC_ROOM_RECIPES.map(recipe => recipe.id),
])]);

function pushZoneConcepts(out, { program, profile, floorKind, zones }) {
  for (const zoneDef of zones ?? []) {
    out.push(Object.freeze({
      source: 'program-architecture',
      program,
      profileId: profile.id,
      floorKind,
      key: zoneDef.key,
      role: zoneDef.role,
      operationalRole: zoneDef.operationalRole,
      functionalFixture: zoneDef.functionalFixture ?? null,
      unitEnvelope: zoneDef.unitEnvelope ?? null,
    }));
  }
}

// A. Every program-architecture zone reachable from any known program string.
export function enumerateProgramArchitectureConcepts() {
  const out = [];
  const seenProfiles = new Set();
  for (const program of CANDIDATE_SPECIFIC_PROGRAMS) {
    const profile = programArchitectureFor(program);
    if (!profile) continue;
    pushZoneConcepts(out, { program, profile, floorKind: 'ground', zones: profile.ground });
    pushZoneConcepts(out, { program, profile, floorKind: 'upper', zones: profile.upper });
    if (profile.route?.length) pushZoneConcepts(out, { program, profile, floorKind: 'route', zones: profile.route });
    for (const [morphId, template] of Object.entries(profile.morphologyTemplates ?? {})) {
      pushZoneConcepts(out, { program, profile, floorKind: `morphology:${morphId}:ground`, zones: template.ground });
      pushZoneConcepts(out, { program, profile, floorKind: `morphology:${morphId}:upper`, zones: template.upper });
    }
    seenProfiles.add(profile.id);
  }
  return Object.freeze({ concepts: Object.freeze(out), profileCount: seenProfiles.size });
}

// B. Every nested dwelling-unit room, reached only via a zone's own
// unitEnvelope field (never a re-declared constant here).
export function enumerateNestedDwellingRoomConcepts() {
  const { concepts } = enumerateProgramArchitectureConcepts();
  const out = [];
  const seenEnvelopes = new Set();
  for (const concept of concepts) {
    const envelope = concept.unitEnvelope;
    if (!envelope || seenEnvelopes.has(envelope)) continue;
    seenEnvelopes.add(envelope);
    for (const room of envelope.rooms ?? []) {
      out.push(Object.freeze({
        source: 'nested-dwelling-unit',
        program: concept.program,
        envelopeSchema: envelope.schema,
        key: room.key,
        role: room.role,
      }));
    }
  }
  return Object.freeze(out);
}

// C. Every legacy semantic-megapack recipe program, tagged with whether it
// also has a dedicated program-architecture profile (most do; a handful --
// laundromat/bar/arcade/library/dentist/school_classroom/funeral_home/
// projection_booth/radio_station at time of writing -- are recipe-only).
export function enumerateLegacyRecipeProgramConcepts() {
  return Object.freeze(SEMANTIC_ROOM_RECIPES.map(recipe => Object.freeze({
    source: 'semantic-megapack-recipe',
    program: recipe.id,
    hasProgramArchitecture: isSpecificProgramArchitecture(recipe.id),
  })));
}

// D. Every generic physical-use family program. Self-checks that the known
// generic names actually cover every PHYSICAL_USE_FAMILIES entry exactly
// once -- if physical-use.js ever grows an 8th family without a matching
// generic program name, this throws instead of silently under-covering.
export function enumerateGenericPhysicalUseConcepts() {
  const familyToProgram = new Map();
  for (const program of KNOWN_GENERIC_PROGRAMS) {
    const families = physicalUseFamiliesForProgram(program);
    if (families.length !== 1) {
      throw new Error(`generic program ${program} must map to exactly one physical-use family, got [${families.join(',')}]`);
    }
    familyToProgram.set(families[0], program);
  }
  const missing = PHYSICAL_USE_FAMILIES.filter(family => !familyToProgram.has(family));
  if (missing.length) {
    throw new Error(`no generic physical-use program covers famil${missing.length === 1 ? 'y' : 'ies'}: ${missing.join(', ')}`);
  }
  return Object.freeze(KNOWN_GENERIC_PROGRAMS.map(program => Object.freeze({
    source: 'generic-physical-use',
    program,
    family: physicalUseFamiliesForProgram(program)[0],
  })));
}

// E. Defensive role vocabulary: the union of every `role` actually observed
// on any zone discovered above, plus nested-room roles. Never hand-listed.
export function enumerateRoleVocabulary() {
  const { concepts } = enumerateProgramArchitectureConcepts();
  const nested = enumerateNestedDwellingRoomConcepts();
  const roles = new Set();
  for (const c of concepts) if (c.role) roles.add(c.role);
  for (const c of nested) if (c.role) roles.add(c.role);
  return Object.freeze([...roles].sort());
}

// The full merged corpus, each entry normalized to a common shape plus a
// `source` discriminator. This is what completeness tests iterate over.
export function enumerateAllConcepts() {
  const { concepts: architectureConcepts, profileCount } = enumerateProgramArchitectureConcepts();
  const nestedConcepts = enumerateNestedDwellingRoomConcepts();
  const legacyConcepts = enumerateLegacyRecipeProgramConcepts();
  const genericConcepts = enumerateGenericPhysicalUseConcepts();
  const roleVocabulary = enumerateRoleVocabulary();

  return Object.freeze({
    schema: ROOM_SIGNIFIER_CORPUS_SCHEMA,
    architectureConcepts,
    nestedConcepts,
    legacyConcepts,
    genericConcepts,
    roleVocabulary,
    stats: Object.freeze({
      architectureZoneConcepts: architectureConcepts.length,
      architectureProfiles: profileCount,
      nestedDwellingRoomConcepts: nestedConcepts.length,
      legacyRecipePrograms: legacyConcepts.length,
      legacyRecipeProgramsWithoutArchitecture: legacyConcepts.filter(c => !c.hasProgramArchitecture).length,
      genericPhysicalUsePrograms: genericConcepts.length,
      roleVocabularySize: roleVocabulary.length,
    }),
  });
}
