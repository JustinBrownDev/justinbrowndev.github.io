// world/room-signifier-planner.js
//
// Per-space planner for the guaranteed room-signifier layer. Iterates every
// REALIZED semantic room (buildingPlan.topologySpaces, plus nested
// APARTMENT_UNIT-style rooms), resolves a recipe (room-signifier-recipes.js),
// and produces deterministic, spatially-validated cue placements using the
// existing space-plan authority (spacePlanAcceptsBox / spacePlanWallSegments /
// spacePlanCandidateCells from world/space-plan.js). No second spatial
// authority is introduced here -- every solid placement is validated by the
// same function the rest of the semantic pipeline already trusts.
//
// This module is pure geometry/data -- it never touches THREE.js. See
// world/room-signifier-runtime.js for the InstancedMesh batching consumer.

import { compileSpacePlans, spacePlanAcceptsBox, spacePlanCandidateCells, spacePlanWallSegments, spacePlanTouchesPoint } from './space-plan.js';
import { resolveRoomSignifierRecipe } from './room-signifier-recipes.js';
import { primitiveKind, instantiatePrimitive, normalizeRotationStep } from './room-signifier-primitives.js';

export const ROOM_SIGNIFIER_PLAN_SCHEMA = 'jweb.room-signifier-plan.v1';

const CARDINAL_ROTATIONS = Object.freeze([0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]);

// Size-class -> minimum guaranteed cue count (section 7 of the assignment).
const SIZE_CLASS_MIN_CUES = Object.freeze({ tiny: 2, normal: 3, large: 4, veryLarge: 5 });
const SIZE_CLASS_AREA_THRESHOLDS = Object.freeze({ tiny: 8, normal: 20, large: 45 });
const MIN_FURNISHABLE_AREA = 1.4;

function hashString32(value) {
  let h = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxesOverlapXZ(a, b, pad = 0.02) {
  return a.maxX + pad > b.minX && a.minX - pad < b.maxX
    && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
}

// Nested dwelling-unit rooms share their parent space's compiled SpacePlan
// (there is no separate raster/wall compile per sub-room) -- so a placement
// must additionally be contained within the nested room's own rectangle, or
// a "kitchen" cue could legally land in the "bedroom" footprint of the same
// unit. Top-level spaces pass restrictBounds=null (the plan already scopes
// them exactly).
function boxContainedInBounds(box, bounds, pad = 0.02) {
  if (!bounds) return true;
  return box.minX >= bounds.minX - pad && box.maxX <= bounds.maxX + pad
    && box.minZ >= bounds.minZ - pad && box.maxZ <= bounds.maxZ + pad;
}

function regionArea(space) {
  const regions = Array.isArray(space?.regions) ? space.regions : [];
  if (regions.length) {
    let sum = 0;
    for (const r of regions) {
      const w = Math.max(0, (Number(r.maxX) - Number(r.minX)) || 0);
      const d = Math.max(0, (Number(r.maxZ) - Number(r.minZ)) || 0);
      sum += w * d;
    }
    if (sum > 0) return sum;
  }
  const b = space?.bounds;
  if (!b) return 0;
  return Math.max(0, (Number(b.maxX) - Number(b.minX)) || 0) * Math.max(0, (Number(b.maxZ) - Number(b.minZ)) || 0);
}

function sizeClassFor(area) {
  if (area < SIZE_CLASS_AREA_THRESHOLDS.tiny) return 'tiny';
  if (area < SIZE_CLASS_AREA_THRESHOLDS.normal) return 'normal';
  if (area < SIZE_CLASS_AREA_THRESHOLDS.large) return 'large';
  return 'veryLarge';
}

function longAxisOfBounds(bounds) {
  const w = Math.max(0, Number(bounds.maxX) - Number(bounds.minX));
  const d = Math.max(0, Number(bounds.maxZ) - Number(bounds.minZ));
  return w >= d ? 'x' : 'z';
}

// Choose an inward-facing cardinal-aligned wall candidate. Returns
// {x,y,z,rotY} in world space, or null if no wall segment can host the
// primitive's footprint.
function chooseWallCandidate(plan, kindDef, rng) {
  const minLength = Math.max(0.6, kindDef.footprint.halfX * 2 + 0.3);
  const segments = spacePlanWallSegments(plan, minLength);
  if (!segments.length) return null;
  const order = [...segments.keys()];
  // deterministic shuffle
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const idx of order) {
    const wall = segments[idx];
    const length = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    const margin = kindDef.footprint.halfX + 0.2;
    if (length <= margin * 2) continue;
    const tx = (wall.x2 - wall.x1) / length;
    const tz = (wall.z2 - wall.z1) / length;
    const nx = -tz, nz = tx;
    const mx = (wall.x1 + wall.x2) * 0.5, mz = (wall.z1 + wall.z2) * 0.5;
    const probeY = plan.yBase + 0.1;
    const inwardSign = spacePlanTouchesPoint(plan, { x: mx + nx * 0.3, z: mz + nz * 0.3, y: probeY }, 0.05) ? 1 : -1;
    const inX = nx * inwardSign, inZ = nz * inwardSign;
    const usableSpan = length - margin * 2;
    const t = 0.5 + (rng() - 0.5) * 0.6;
    const along = margin + Math.max(0, Math.min(usableSpan, t * usableSpan));
    const wx = wall.x1 + tx * along;
    const wz = wall.z1 + tz * along;
    const inset = kindDef.footprint.halfZ + 0.1;
    const x = wx + inX * inset;
    const z = wz + inZ * inset;
    const rotY = normalizeRotationStep(Math.atan2(-inX, inZ));
    return { x, y: plan.yBase + 0.02, z, rotY };
  }
  return null;
}

function chooseFloorCandidate(plan, seed, usedCellKeys) {
  const cells = spacePlanCandidateCells(plan, seed);
  return cells.filter(cell => !usedCellKeys.has(`${cell.col},${cell.row}`));
}

function attemptCue({ plan, cue, rng, seed, usedCellKeys, acceptedFootprints, pairedAnchors, restrictBounds }) {
  const kindDef = primitiveKind(cue.primitiveKind);

  if (cue.placement === 'wall') {
    // Try a handful of distinct wall segments (chooseWallCandidate already
    // shuffles deterministically) since restrictBounds may reject several
    // before one that actually borders the target nested room is found.
    for (let tries = 0; tries < 6; tries++) {
      const candidate = chooseWallCandidate(plan, kindDef, rng);
      if (!candidate) break;
      const instance = instantiatePrimitive(cue.primitiveKind, candidate);
      if (!boxContainedInBounds(instance.footprintBox, restrictBounds)) continue;
      if (acceptedFootprints.some(box => boxesOverlapXZ(box, instance.footprintBox))) continue;
      if (!spacePlanAcceptsBox(plan, instance.footprintBox, { allowCirculation: false, requireSameRegion: true })) continue;
      return { accepted: true, instances: [instance] };
    }
    return { accepted: false, reason: 'no-wall-segment' };
  }

  if (cue.placement === 'floor' && cue.pairWith) {
    const anchor = pairedAnchors.get(cue.pairWith);
    if (!anchor) return { accepted: false, reason: 'pair-anchor-missing' };
    const step = normalizeRotationStep(anchor.rotY);
    const cos = Math.cos(step), sin = Math.sin(step);
    const rx = cue.pairOffset.x * cos - cue.pairOffset.z * sin;
    const rz = cue.pairOffset.x * sin + cue.pairOffset.z * cos;
    const candidate = { x: anchor.x + rx, y: anchor.y, z: anchor.z + rz, rotY: step };
    const instance = instantiatePrimitive(cue.primitiveKind, candidate);
    if (!boxContainedInBounds(instance.footprintBox, restrictBounds)) return { accepted: false, reason: 'outside-nested-room-bounds' };
    if (acceptedFootprints.some(box => boxesOverlapXZ(box, instance.footprintBox))) return { accepted: false, reason: 'overlaps-existing-cue' };
    if (!spacePlanAcceptsBox(plan, instance.footprintBox, { allowCirculation: false, requireSameRegion: true })) return { accepted: false, reason: 'space-plan-rejected-paired-cue' };
    return { accepted: true, instances: [instance], anchorPose: candidate };
  }

  if (cue.placement === 'floor') {
    const candidates = chooseFloorCandidate(plan, hashString32(`${seed}:${cue.id}`), usedCellKeys);
    for (const cell of candidates) {
      const rotIdx = Math.floor(rng() * CARDINAL_ROTATIONS.length) % CARDINAL_ROTATIONS.length;
      const rotY = CARDINAL_ROTATIONS[rotIdx];
      const candidate = { x: cell.x, y: plan.yBase + 0.02, z: cell.z, rotY };
      const instance = instantiatePrimitive(cue.primitiveKind, candidate);
      if (!boxContainedInBounds(instance.footprintBox, restrictBounds)) continue;
      if (acceptedFootprints.some(box => boxesOverlapXZ(box, instance.footprintBox))) continue;
      if (!spacePlanAcceptsBox(plan, instance.footprintBox, { allowCirculation: false, requireSameRegion: true })) continue;
      usedCellKeys.add(`${cell.col},${cell.row}`);
      return { accepted: true, instances: [instance], anchorPose: candidate };
    }
    return { accepted: false, reason: 'no-valid-floor-candidate' };
  }

  if (cue.placement === 'floor-row') {
    const axis = longAxisOfBounds(restrictBounds ?? plan.bounds);
    const candidates = chooseFloorCandidate(plan, hashString32(`${seed}:${cue.id}`), usedCellKeys)
      .filter(cell => !restrictBounds || (cell.x >= restrictBounds.minX && cell.x <= restrictBounds.maxX && cell.z >= restrictBounds.minZ && cell.z <= restrictBounds.maxZ));
    if (!candidates.length) return { accepted: false, reason: 'no-valid-floor-candidate' };
    const rotIdx = Math.floor(rng() * CARDINAL_ROTATIONS.length) % CARDINAL_ROTATIONS.length;
    const rotY = axis === 'x' ? CARDINAL_ROTATIONS[(rotIdx + 1) % 4] : CARDINAL_ROTATIONS[rotIdx];
    const start = candidates[0];
    const step = axis === 'x' ? { dx: cue.rowSpacing, dz: 0 } : { dx: 0, dz: cue.rowSpacing };
    const instances = [];
    let consecutiveMisses = 0;
    for (let i = 0; i < cue.rowMaxCount && consecutiveMisses < 2; i++) {
      const x = start.x + step.dx * i;
      const z = start.z + step.dz * i;
      const instance = instantiatePrimitive(cue.primitiveKind, { x, y: plan.yBase + 0.02, z, rotY });
      const collides = !boxContainedInBounds(instance.footprintBox, restrictBounds)
        || acceptedFootprints.some(box => boxesOverlapXZ(box, instance.footprintBox))
        || instances.some(prev => boxesOverlapXZ(prev.footprintBox, instance.footprintBox));
      if (collides || !spacePlanAcceptsBox(plan, instance.footprintBox, { allowCirculation: false, requireSameRegion: true })) {
        consecutiveMisses++;
        continue;
      }
      consecutiveMisses = 0;
      instances.push(instance);
    }
    if (instances.length < cue.rowMinCount) return { accepted: false, reason: 'row-below-minimum-count' };
    return { accepted: true, instances };
  }

  return { accepted: false, reason: 'unknown-placement-strategy' };
}

function planSingleSpace({ space, plan, seedBase, descriptor, restrictBounds = null }) {
  const resolution = resolveRoomSignifierRecipe(descriptor);
  const record = {
    schema: ROOM_SIGNIFIER_PLAN_SCHEMA,
    spaceId: space.id ?? space.key,
    semanticProgram: descriptor.semanticProgram ?? null,
    operationalRole: descriptor.operationalRole ?? null,
    role: descriptor.role ?? null,
    nestedRoomKey: descriptor.nestedRoomKey ?? null,
    recipeId: resolution.resolvedKey,
    resolutionTier: resolution.tier,
    sizeClass: null,
    minCues: 0,
    plannedCueCount: 0,
    acceptedCueCount: 0,
    rejectedCueCount: 0,
    rejectionReasons: [],
    primitiveInstanceCount: 0,
    semanticIdentityPlanned: resolution.recipe != null,
    semanticIdentityRealized: false,
    reason: null,
    cues: [],
  };

  if (!resolution.recipe) { record.reason = 'no-recipe-resolved'; return record; }
  if (!plan) { record.reason = 'no-space-plan-compiled'; return record; }

  const area = regionArea(space);
  if (area < MIN_FURNISHABLE_AREA) { record.reason = 'space-too-small'; return record; }

  record.sizeClass = sizeClassFor(area);
  record.minCues = SIZE_CLASS_MIN_CUES[record.sizeClass];

  const seed = hashString32(`${seedBase}:room-signifier:${record.spaceId}`);
  const rng = mulberry32(seed);
  const usedCellKeys = new Set();
  const acceptedFootprints = [];
  const pairedAnchors = new Map();
  const attemptCap = Math.min(resolution.recipe.cues.length, record.minCues + 2);
  let attempted = 0;

  for (const cue of resolution.recipe.cues) {
    if (attempted >= attemptCap && record.acceptedCueCount >= record.minCues) break;
    attempted++;
    record.plannedCueCount++;
    const result = attemptCue({ plan, cue, rng, seed, usedCellKeys, acceptedFootprints, pairedAnchors, restrictBounds });
    if (!result.accepted) {
      record.rejectedCueCount++;
      record.rejectionReasons.push(`${cue.id}:${result.reason}`);
      continue;
    }
    record.acceptedCueCount++;
    record.primitiveInstanceCount += result.instances.length;
    for (const instance of result.instances) acceptedFootprints.push(instance.footprintBox);
    if (result.anchorPose) pairedAnchors.set(cue.id, result.anchorPose);
    record.cues.push(Object.freeze({
      id: cue.id, primitiveKind: cue.primitiveKind, placement: cue.placement,
      instances: Object.freeze(result.instances),
    }));
  }

  record.semanticIdentityRealized = record.acceptedCueCount > 0;
  if (!record.semanticIdentityRealized) record.reason = 'no-cue-cleared-space-plan-validation';
  record.cues = Object.freeze(record.cues);
  record.rejectionReasons = Object.freeze(record.rejectionReasons);
  return Object.freeze(record);
}

function nestedRoomSpaces(space) {
  const unitPlan = space?.unitPlan;
  if (!unitPlan?.rooms?.length) return [];
  return unitPlan.rooms.map(room => ({
    id: `${space.id}:unit-room:${room.key}`,
    key: room.key,
    bounds: {
      minX: room.minX, maxX: room.maxX, minZ: room.minZ, maxZ: room.maxZ,
      yMin: space.bounds?.yMin ?? space.yBase, yMax: space.bounds?.yMax ?? ((space.yBase ?? 0) + (space.floorH ?? 3)),
    },
    regions: [{ minX: room.minX, maxX: room.maxX, minZ: room.minZ, maxZ: room.maxZ }],
    role: room.role,
    parentSpaceId: space.id,
  }));
}

/**
 * Plan guaranteed room signifiers for every realized space in a BuildingPlan.
 * @param {object} options
 * @param {object} options.buildingPlan - entity.buildingPlan (must have topologySpaces)
 * @param {object} options.chunk - { key }
 * @param {object} options.payload - engine payload (entities, physics)
 * @param {string} options.entityId
 * @returns {object} plan report with per-space records + aggregate stats
 */
export function planRoomSignifiers({ buildingPlan, chunk, payload, entityId }) {
  const startedAt = Date.now();
  const topologySpaces = Array.isArray(buildingPlan?.topologySpaces) ? buildingPlan.topologySpaces : [];
  const seedBase = buildingPlan?.deterministicKey ?? buildingPlan?.fingerprint ?? entityId ?? chunk?.key ?? 'room-signifier';

  const activeSpaceIds = new Set(topologySpaces.map(space => space.id));
  const spacePlans = activeSpaceIds.size ? compileSpacePlans({ chunk, payload, activeSpaceIds }) : [];
  const planById = new Map(spacePlans.map(plan => [plan.id, plan]));

  const spaceRecords = [];
  for (const space of topologySpaces) {
    if (!Array.isArray(space.regions) || !space.regions.length) {
      spaceRecords.push(Object.freeze({
        schema: ROOM_SIGNIFIER_PLAN_SCHEMA, spaceId: space.id, semanticProgram: space.semanticProgram ?? null,
        operationalRole: space.operationalRole ?? null, role: space.role ?? null, nestedRoomKey: null,
        recipeId: null, resolutionTier: 'skipped', sizeClass: null, minCues: 0, plannedCueCount: 0,
        acceptedCueCount: 0, rejectedCueCount: 0, rejectionReasons: [], primitiveInstanceCount: 0,
        semanticIdentityPlanned: false, semanticIdentityRealized: false, reason: 'no-regions-on-space', cues: [],
      }));
      continue;
    }

    const plan = planById.get(space.id);
    spaceRecords.push(planSingleSpace({
      space, plan, seedBase,
      descriptor: { semanticProgram: space.semanticProgram, operationalRole: space.operationalRole, role: space.role },
    }));

    for (const nested of nestedRoomSpaces(space)) {
      spaceRecords.push(planSingleSpace({
        space: nested, plan,
        seedBase: `${seedBase}:unit:${space.id}`,
        descriptor: { nestedRoomKey: nested.key, role: nested.role },
        restrictBounds: nested.bounds,
      }));
    }
  }

  const stats = {
    spacesConsidered: spaceRecords.length,
    spacesFurnished: spaceRecords.filter(r => r.semanticIdentityRealized).length,
    spacesPlannedButUnrealized: spaceRecords.filter(r => r.semanticIdentityPlanned && !r.semanticIdentityRealized).length,
    spacesWithNoStrategy: spaceRecords.filter(r => !r.semanticIdentityPlanned).length,
    totalPrimitiveInstances: spaceRecords.reduce((sum, r) => sum + r.primitiveInstanceCount, 0),
    totalAcceptedCues: spaceRecords.reduce((sum, r) => sum + r.acceptedCueCount, 0),
    totalRejectedCues: spaceRecords.reduce((sum, r) => sum + r.rejectedCueCount, 0),
    planningMillis: Date.now() - startedAt,
  };

  return Object.freeze({
    schema: ROOM_SIGNIFIER_PLAN_SCHEMA,
    entityId: entityId ?? null,
    buildingPlanId: buildingPlan?.deterministicKey ?? null,
    spaces: Object.freeze(spaceRecords),
    stats: Object.freeze(stats),
  });
}
