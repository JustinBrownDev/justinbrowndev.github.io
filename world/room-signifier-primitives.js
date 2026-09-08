// world/room-signifier-primitives.js
//
// Cheap primitive vocabulary for the guaranteed room-signifier layer.
//
// Every primitive "kind" below decomposes into a handful of axis-aligned box
// parts in a LOCAL frame (footprint centered on the anchor point, y measured
// up from the room floor). Nothing here touches THREE.js: this module is
// pure data so it can be unit-tested and reused by both the planner
// (candidate generation + spacePlanAcceptsBox validation) and the runtime
// (InstancedMesh batching). See world/room-signifier-runtime.js for the only
// place a THREE.BoxGeometry/Material actually gets created.
//
// Doctrine (see the assignment): one shared unit-cube geometry, a handful of
// shared materials, no per-object textures/canvas/animation. A primitive
// "kind" is just a named LOCAL arrangement of boxes -- it costs nothing extra
// at render time beyond the InstancedMesh entries its parts contribute,
// because every part is ultimately just another instance of the same unit
// box scaled/rotated/positioned, bucketed only by materialKey.

export const ROOM_SIGNIFIER_PRIMITIVES_SCHEMA = 'jweb.room-signifier-primitives.v1';

// Six-key shared material palette (section 27 of the assignment). Runtime
// maps each key to exactly one THREE.MeshStandardMaterial singleton.
export const MATERIAL_PALETTE_KEYS = Object.freeze([
  'paintedMetal',
  'woodLaminate',
  'darkEquipment',
  'lightAppliance',
  'upholsteryNeutral',
  'serviceIndustrial',
]);

export const MATERIAL_PALETTE_COLORS = Object.freeze({
  paintedMetal: 0x8f9aa3,
  woodLaminate: 0x9c7a52,
  darkEquipment: 0x24262b,
  lightAppliance: 0xe4e1d8,
  upholsteryNeutral: 0x5b6b6a,
  serviceIndustrial: 0xb3562e,
});

function part(dx, dy, dz, sx, sy, sz, materialKey) {
  if (!MATERIAL_PALETTE_KEYS.includes(materialKey)) {
    throw new Error(`room-signifier primitive part uses unknown materialKey ${materialKey}`);
  }
  return Object.freeze({ dx, dy, dz, sx, sy, sz, materialKey });
}

function kind(id, { halfX, halfZ, height, mount = 'floor', parts }) {
  return Object.freeze({
    schema: ROOM_SIGNIFIER_PRIMITIVES_SCHEMA,
    id,
    mount, // 'floor' | 'wall'
    footprint: Object.freeze({ halfX, halfZ }),
    height,
    parts: Object.freeze(parts.map(p => Object.freeze(p))),
  });
}

// --- floor-standing furniture ------------------------------------------------

const desk = kind('desk', {
  halfX: 0.6, halfZ: 0.35, height: 0.78,
  parts: [
    part(0, 0.70, 0, 1.2, 0.05, 0.65, 'woodLaminate'),
    part(-0.5, 0, -0.25, 0.08, 0.70, 0.08, 'paintedMetal'),
    part(0.5, 0, -0.25, 0.08, 0.70, 0.08, 'paintedMetal'),
  ],
});

const chair = kind('chair', {
  halfX: 0.24, halfZ: 0.24, height: 0.85,
  parts: [
    part(0, 0.23, 0, 0.44, 0.46, 0.44, 'upholsteryNeutral'),
    part(0, 0.65, -0.2, 0.44, 0.5, 0.06, 'upholsteryNeutral'),
  ],
});

const stool = kind('stool', {
  halfX: 0.18, halfZ: 0.18, height: 0.6,
  parts: [
    part(0, 0.28, 0, 0.34, 0.06, 0.34, 'paintedMetal'),
    part(0, 0.13, 0, 0.06, 0.26, 0.06, 'paintedMetal'),
  ],
});

const counter = kind('counter', {
  halfX: 0.8, halfZ: 0.3, height: 0.95,
  parts: [
    part(0, 0.45, 0, 1.6, 0.9, 0.55, 'woodLaminate'),
    part(0, 0.94, 0, 1.66, 0.05, 0.61, 'lightAppliance'),
  ],
});

const table = kind('table', {
  halfX: 0.55, halfZ: 0.4, height: 0.76,
  parts: [
    part(0, 0.72, 0, 1.1, 0.06, 0.75, 'woodLaminate'),
    part(-0.45, 0, -0.3, 0.07, 0.72, 0.07, 'paintedMetal'),
    part(0.45, 0, -0.3, 0.07, 0.72, 0.07, 'paintedMetal'),
    part(-0.45, 0, 0.3, 0.07, 0.72, 0.07, 'paintedMetal'),
    part(0.45, 0, 0.3, 0.07, 0.72, 0.07, 'paintedMetal'),
  ],
});

const bench = kind('bench', {
  halfX: 0.75, halfZ: 0.22, height: 0.46,
  parts: [
    part(0, 0.43, 0, 1.5, 0.06, 0.42, 'woodLaminate'),
    part(-0.6, 0.2, 0, 0.08, 0.4, 0.36, 'paintedMetal'),
    part(0.6, 0.2, 0, 0.08, 0.4, 0.36, 'paintedMetal'),
  ],
});

const shelfRack = kind('shelf_rack', {
  halfX: 0.6, halfZ: 0.25, height: 2.0,
  parts: [
    part(-0.55, 1.0, 0, 0.08, 2.0, 0.5, 'paintedMetal'),
    part(0.55, 1.0, 0, 0.08, 2.0, 0.5, 'paintedMetal'),
    part(0, 0.5, 0, 1.1, 0.05, 0.48, 'darkEquipment'),
    part(0, 1.1, 0, 1.1, 0.05, 0.48, 'darkEquipment'),
    part(0, 1.7, 0, 1.1, 0.05, 0.48, 'darkEquipment'),
  ],
});

const cabinet = kind('cabinet', {
  halfX: 0.45, halfZ: 0.28, height: 1.05,
  parts: [
    part(0, 0.52, 0, 0.9, 1.04, 0.55, 'paintedMetal'),
    part(0, 0.52, 0.24, 0.7, 0.9, 0.03, 'darkEquipment'),
  ],
});

const filingCabinet = kind('filing_cabinet', {
  halfX: 0.24, halfZ: 0.24, height: 1.3,
  parts: [
    part(0, 0.65, 0, 0.46, 1.3, 0.46, 'paintedMetal'),
    part(0, 0.65, 0.2, 0.4, 1.2, 0.03, 'darkEquipment'),
  ],
});

const bed = kind('bed', {
  halfX: 0.55, halfZ: 1.0, height: 0.6,
  parts: [
    part(0, 0.18, 0, 1.05, 0.36, 1.95, 'woodLaminate'),
    part(0, 0.45, 0, 1.0, 0.2, 1.85, 'upholsteryNeutral'),
    part(0, 0.62, -0.78, 0.5, 0.14, 0.32, 'lightAppliance'),
  ],
});

const nightstand = kind('nightstand', {
  halfX: 0.22, halfZ: 0.22, height: 0.55,
  parts: [part(0, 0.27, 0, 0.42, 0.54, 0.42, 'woodLaminate')],
});

const dresser = kind('dresser', {
  halfX: 0.5, halfZ: 0.28, height: 0.9,
  parts: [
    part(0, 0.45, 0, 1.0, 0.9, 0.55, 'woodLaminate'),
    part(0, 0.6, 0.24, 0.9, 0.5, 0.03, 'darkEquipment'),
  ],
});

const sofa = kind('sofa', {
  halfX: 0.9, halfZ: 0.45, height: 0.8,
  parts: [
    part(0, 0.22, 0.05, 1.8, 0.44, 0.8, 'upholsteryNeutral'),
    part(0, 0.6, -0.32, 1.8, 0.5, 0.16, 'upholsteryNeutral'),
  ],
});

const machineBlock = kind('machine_block', {
  halfX: 0.5, halfZ: 0.5, height: 1.5,
  parts: [
    part(0, 0.7, 0, 1.0, 1.4, 1.0, 'darkEquipment'),
    part(0, 1.1, 0.48, 0.7, 0.4, 0.04, 'paintedMetal'),
  ],
});

const console_ = kind('console', {
  halfX: 0.6, halfZ: 0.35, height: 1.1,
  parts: [
    part(0, 0.5, 0, 1.2, 1.0, 0.6, 'darkEquipment'),
    part(0, 0.95, -0.1, 1.1, 0.3, 0.35, 'paintedMetal'),
  ],
});

const tank = kind('tank', {
  halfX: 0.55, halfZ: 0.55, height: 2.1,
  parts: [
    part(0, 1.05, 0, 1.05, 2.1, 1.05, 'serviceIndustrial'),
    part(0, 2.15, 0, 0.5, 0.12, 0.5, 'darkEquipment'),
  ],
});

const serverRack = kind('server_rack', {
  halfX: 0.35, halfZ: 0.45, height: 2.0,
  parts: [
    part(0, 1.0, 0, 0.7, 2.0, 0.9, 'darkEquipment'),
    part(0, 1.0, 0.44, 0.6, 1.8, 0.03, 'paintedMetal'),
  ],
});

const crateCluster = kind('crate_cluster', {
  halfX: 0.55, halfZ: 0.55, height: 1.1,
  parts: [
    part(-0.28, 0.28, -0.28, 0.5, 0.56, 0.5, 'serviceIndustrial'),
    part(0.28, 0.22, -0.2, 0.44, 0.44, 0.44, 'woodLaminate'),
    part(0, 0.18, 0.32, 0.5, 0.36, 0.4, 'serviceIndustrial'),
  ],
});

const palletStack = kind('pallet_stack', {
  halfX: 0.6, halfZ: 0.5, height: 1.3,
  parts: [
    part(0, 0.06, 0, 1.2, 0.12, 1.0, 'woodLaminate'),
    part(-0.25, 0.55, 0, 0.5, 0.9, 0.8, 'serviceIndustrial'),
    part(0.25, 0.4, 0, 0.5, 0.6, 0.8, 'serviceIndustrial'),
  ],
});

const sinkVanity = kind('sink_vanity', {
  halfX: 0.4, halfZ: 0.3, height: 0.9,
  parts: [
    part(0, 0.42, 0, 0.8, 0.84, 0.55, 'lightAppliance'),
    part(0, 0.86, 0, 0.6, 0.05, 0.4, 'paintedMetal'),
  ],
});

const toilet = kind('toilet', {
  halfX: 0.2, halfZ: 0.3, height: 0.75,
  parts: [
    part(0, 0.2, 0.05, 0.38, 0.4, 0.5, 'lightAppliance'),
    part(0, 0.55, -0.18, 0.3, 0.35, 0.16, 'lightAppliance'),
  ],
});

const examTable = kind('exam_table', {
  halfX: 0.35, halfZ: 0.85, height: 0.7,
  parts: [
    part(0, 0.32, 0, 0.7, 0.1, 1.7, 'lightAppliance'),
    part(0, 0.13, 0, 0.6, 0.28, 1.6, 'paintedMetal'),
  ],
});

const judgeBench = kind('judge_bench', {
  halfX: 1.1, halfZ: 0.4, height: 1.2,
  parts: [
    part(0, 0.6, 0, 2.2, 1.2, 0.7, 'woodLaminate'),
    part(0, 1.22, 0, 2.3, 0.06, 0.8, 'darkEquipment'),
  ],
});

const witnessStand = kind('witness_stand', {
  halfX: 0.4, halfZ: 0.4, height: 1.05,
  parts: [part(0, 0.52, 0, 0.8, 1.05, 0.7, 'woodLaminate')],
});

const barCounter = kind('bar_counter', {
  halfX: 1.0, halfZ: 0.35, height: 1.05,
  parts: [
    part(0, 0.5, 0, 2.0, 1.0, 0.6, 'woodLaminate'),
    part(0, 1.03, 0, 2.06, 0.06, 0.66, 'darkEquipment'),
  ],
});

const backbarShelf = kind('backbar_shelf', {
  halfX: 0.9, halfZ: 0.14, height: 1.9,
  parts: [
    part(0, 0.95, 0, 1.8, 1.9, 0.24, 'darkEquipment'),
    part(0, 1.3, 0.13, 1.7, 0.04, 0.18, 'lightAppliance'),
  ],
});

const arcadeCabinet = kind('arcade_cabinet', {
  halfX: 0.35, halfZ: 0.4, height: 1.85,
  parts: [
    part(0, 0.9, 0, 0.7, 1.8, 0.8, 'darkEquipment'),
    part(0, 1.3, 0.36, 0.5, 0.5, 0.05, 'paintedMetal'),
  ],
});

const applianceBlock = kind('appliance_block', {
  halfX: 0.35, halfZ: 0.35, height: 0.9,
  parts: [
    part(0, 0.45, 0, 0.7, 0.9, 0.7, 'lightAppliance'),
    part(0, 0.45, 0.34, 0.5, 0.5, 0.03, 'darkEquipment'),
  ],
});

const foldingTable = kind('folding_table', {
  halfX: 0.6, halfZ: 0.35, height: 0.8,
  parts: [part(0, 0.75, 0, 1.2, 0.05, 0.7, 'paintedMetal')],
});

const workbench = kind('workbench', {
  halfX: 0.7, halfZ: 0.35, height: 0.9,
  parts: [
    part(0, 0.45, 0, 1.4, 0.9, 0.6, 'paintedMetal'),
    part(0, 0.92, 0, 1.46, 0.05, 0.66, 'woodLaminate'),
  ],
});

const fumeHood = kind('fume_hood', {
  halfX: 0.5, halfZ: 0.35, height: 2.0,
  parts: [
    part(0, 0.45, 0, 1.0, 0.9, 0.6, 'lightAppliance'),
    part(0, 1.5, -0.05, 0.9, 1.1, 0.5, 'paintedMetal'),
  ],
});

const boilerTank = kind('boiler_tank', {
  halfX: 0.7, halfZ: 0.7, height: 2.3,
  parts: [
    part(0, 1.15, 0, 1.4, 2.3, 1.4, 'serviceIndustrial'),
    part(0, 2.05, 0.6, 0.2, 0.5, 0.2, 'darkEquipment'),
  ],
});

const twoPostLift = kind('two_post_lift', {
  halfX: 0.9, halfZ: 1.6, height: 2.4,
  parts: [
    part(-0.85, 1.2, -1.4, 0.16, 2.4, 0.16, 'paintedMetal'),
    part(0.85, 1.2, -1.4, 0.16, 2.4, 0.16, 'paintedMetal'),
    part(-0.85, 1.2, 1.4, 0.16, 2.4, 0.16, 'paintedMetal'),
    part(0.85, 1.2, 1.4, 0.16, 2.4, 0.16, 'paintedMetal'),
    part(0, 0.55, 0, 1.6, 0.2, 3.2, 'darkEquipment'),
  ],
});

const bier = kind('bier', {
  halfX: 0.5, halfZ: 1.0, height: 0.55,
  parts: [
    part(0, 0.28, 0, 1.0, 0.56, 2.0, 'woodLaminate'),
    part(0, 0.58, 0, 0.9, 0.06, 1.9, 'upholsteryNeutral'),
  ],
});

const floralDisplay = kind('floral_display', {
  halfX: 0.4, halfZ: 0.4, height: 1.1,
  parts: [
    part(0, 0.5, 0, 0.7, 1.0, 0.7, 'paintedMetal'),
    part(0, 1.02, 0, 0.6, 0.05, 0.6, 'woodLaminate'),
  ],
});

const mailboxBank = kind('mailbox_bank', {
  halfX: 0.6, halfZ: 0.08, height: 1.4,
  mount: 'wall',
  parts: [part(0, 0.7, 0, 1.2, 1.4, 0.14, 'paintedMetal')],
});

// --- wall-mounted / near-zero-footprint cues -------------------------------

const wallPanel = kind('wall_panel', {
  halfX: 0.5, halfZ: 0.05, height: 0.8,
  mount: 'wall',
  parts: [part(0, 1.3, 0, 1.0, 0.7, 0.06, 'paintedMetal')],
});

const wallBoard = kind('wall_board', {
  halfX: 0.7, halfZ: 0.04, height: 1.1,
  mount: 'wall',
  parts: [part(0, 1.35, 0, 1.4, 1.0, 0.05, 'darkEquipment')],
});

const wallShelf = kind('wall_shelf', {
  halfX: 0.5, halfZ: 0.1, height: 0.1,
  mount: 'wall',
  parts: [part(0, 1.55, 0, 1.0, 0.06, 0.2, 'woodLaminate')],
});

const pipeManifold = kind('pipe_manifold', {
  halfX: 0.55, halfZ: 0.09, height: 2.0,
  mount: 'wall',
  parts: [
    part(-0.4, 1.2, 0, 0.1, 1.8, 0.14, 'serviceIndustrial'),
    part(0, 1.2, 0, 0.1, 1.8, 0.14, 'serviceIndustrial'),
    part(0.4, 1.2, 0, 0.1, 1.8, 0.14, 'serviceIndustrial'),
  ],
});

const handrail = kind('handrail', {
  halfX: 0.9, halfZ: 0.03, height: 0.1,
  mount: 'wall',
  parts: [part(0, 0.9, 0, 1.8, 0.06, 0.05, 'paintedMetal')],
});

const utilityCabinetShallow = kind('utility_cabinet_shallow', {
  halfX: 0.4, halfZ: 0.1, height: 1.0,
  mount: 'wall',
  parts: [part(0, 1.0, 0, 0.8, 1.0, 0.2, 'paintedMetal')],
});

export const PRIMITIVE_KINDS = Object.freeze({
  desk, chair, stool, counter, table, bench,
  shelf_rack: shelfRack, cabinet, filing_cabinet: filingCabinet,
  bed, nightstand, dresser, sofa,
  machine_block: machineBlock, console: console_, tank,
  server_rack: serverRack, crate_cluster: crateCluster, pallet_stack: palletStack,
  sink_vanity: sinkVanity, toilet, exam_table: examTable,
  judge_bench: judgeBench, witness_stand: witnessStand,
  bar_counter: barCounter, backbar_shelf: backbarShelf, arcade_cabinet: arcadeCabinet,
  appliance_block: applianceBlock, folding_table: foldingTable, workbench,
  fume_hood: fumeHood, boiler_tank: boilerTank, two_post_lift: twoPostLift,
  bier, floral_display: floralDisplay, mailbox_bank: mailboxBank,
  wall_panel: wallPanel, wall_board: wallBoard, wall_shelf: wallShelf,
  pipe_manifold: pipeManifold, handrail, utility_cabinet_shallow: utilityCabinetShallow,
});

export function primitiveKind(id) {
  const found = PRIMITIVE_KINDS[id];
  if (!found) throw new Error(`unknown room-signifier primitive kind ${id}`);
  return found;
}

const ROT_STEPS = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

export function normalizeRotationStep(rotY) {
  const twoPi = Math.PI * 2;
  let normalized = ((Number(rotY) || 0) % twoPi + twoPi) % twoPi;
  let best = ROT_STEPS[0];
  let bestDelta = Infinity;
  for (const step of ROT_STEPS) {
    const delta = Math.min(Math.abs(normalized - step), twoPi - Math.abs(normalized - step));
    if (delta < bestDelta) { bestDelta = delta; best = step; }
  }
  return best;
}

function rotateXZ(dx, dz, rotY) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

// Rotated footprint AABB half-extents. Only cardinal (90-degree) rotations
// are supported so the footprint stays axis-aligned for spacePlanAcceptsBox.
export function rotatedFootprintHalfExtents(kindDef, rotY) {
  const step = normalizeRotationStep(rotY);
  const swapped = Math.abs(step - Math.PI * 0.5) < 1e-6 || Math.abs(step - Math.PI * 1.5) < 1e-6;
  return swapped
    ? { halfX: kindDef.footprint.halfZ, halfZ: kindDef.footprint.halfX }
    : { halfX: kindDef.footprint.halfX, halfZ: kindDef.footprint.halfZ };
}

// Instantiate a primitive kind at a world anchor. Returns the world-space
// footprint box (for spacePlanAcceptsBox) and the resolved world-space parts
// (for the runtime InstancedMesh batcher). Pure function, no THREE.
export function instantiatePrimitive(kindId, { x, y, z, rotY = 0, scale = 1 } = {}) {
  const kindDef = primitiveKind(kindId);
  const step = normalizeRotationStep(rotY);
  const { halfX, halfZ } = rotatedFootprintHalfExtents(kindDef, step);
  const s = Math.max(0.2, Number(scale) || 1);
  const footprintBox = {
    x, z,
    halfX: halfX * s, halfZ: halfZ * s,
    minX: x - halfX * s, maxX: x + halfX * s,
    minZ: z - halfZ * s, maxZ: z + halfZ * s,
    yMin: y, yMax: y + kindDef.height * s,
  };
  const parts = kindDef.parts.map(p => {
    const [rx, rz] = rotateXZ(p.dx * s, p.dz * s, step);
    return Object.freeze({
      position: { x: x + rx, y: y + p.dy * s, z: z + rz },
      rotationY: step,
      scale: { x: p.sx * s, y: p.sy * s, z: p.sz * s },
      materialKey: p.materialKey,
    });
  });
  return Object.freeze({ kindId, footprintBox, parts: Object.freeze(parts), height: kindDef.height * s, mount: kindDef.mount });
}
