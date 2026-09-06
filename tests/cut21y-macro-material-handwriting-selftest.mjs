import assert from 'node:assert/strict';
import {
  ARCHITECTURE_MATERIAL_PALETTES,
  applyArchitectureMaterialHandwriting,
  architectureMaterialColor,
} from '../world/architecture/material-handwriting.js';
import {
  PROGRAM_MACRO_FAMILIES,
  STAIR_ARCHITECTURE_FAMILIES,
  planProgramMacroArchitecture,
  planStairArchitectureExpression,
} from '../world/architectural-family-system.js';

for (const family of [...STAIR_ARCHITECTURE_FAMILIES, ...PROGRAM_MACRO_FAMILIES]) {
  assert.ok(ARCHITECTURE_MATERIAL_PALETTES[family], `missing material palette for ${family}`);
  for (const materialKind of ['metal', 'concrete']) {
    const color = architectureMaterialColor({ family, materialKind });
    assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, `${family}/${materialKind}: invalid color`);
  }
}

const source = { family: 'utility-rack', metal: [{ id: 'm' }], concrete: [{ id: 'c', color: 0x123456 }] };
const tinted = applyArchitectureMaterialHandwriting({ ...source, field: 'ceiling', weightScale: 1.6 });
assert.equal(source.metal[0].color, undefined, 'material handwriting must not mutate planner input');
assert.equal(tinted.concrete[0].color, 0x123456, 'future explicit part color must remain authoritative');
assert.notEqual(
  architectureMaterialColor({ family: 'utility-rack', materialKind: 'metal', field: 'ground' }),
  architectureMaterialColor({ family: 'utility-rack', materialKind: 'metal', field: 'ceiling' }),
  'hanging field should receive the restrained cool shift',
);
assert.equal(
  architectureMaterialColor({ family: 'civic-monumental', materialKind: 'concrete', weightScale: 1.4 }),
  architectureMaterialColor({ family: 'civic-monumental', materialKind: 'concrete', weightScale: 1.4 }),
  'material tint must be deterministic',
);

const route = {
  id: '21y:route',
  clearWidth: 1.35,
  stairWidth: 1.35,
  flights: [
    { axis: 'x', from: 0, to: 3.2, y0: 0, y1: 1.8, fixedCoord: 0, clearWidth: 1.35 },
    { axis: 'x', from: 3.2, to: 0, y0: 1.8, y1: 3.6, fixedCoord: 1.55, clearWidth: 1.35 },
  ],
  landings: [
    { x: 0, z: 0, sx: 1.6, sz: 1.6, y: 0 },
    { x: 3.2, z: 0.78, sx: 1.6, sz: 1.6, y: 1.8 },
    { x: 0, z: 1.55, sx: 1.6, sz: 1.6, y: 3.6 },
  ],
};
const stair = planStairArchitectureExpression({
  id: '21y:stair', route, family: 'industrial-fire-escape', field: 'ground', routeWidthScale: 1.5,
});
assert.ok(stair?.parts > 0);
assert.equal(stair.parts, stair.metal.length + stair.concrete.length, 'tinting must not change part count');
assert.equal(stair.traversalAuthority, 'canonical-stair-kernel-unchanged');
assert.ok([...stair.metal, ...stair.concrete].every(part => Number.isInteger(part.color)), 'every stair wrapper part should use the existing instance-color channel');

const module = { key: 'main', cx: 0, cz: 0, halfX: 9, halfZ: 8, floors: 4, floorBase: 0 };
const macro = planProgramMacroArchitecture({
  id: '21y:macro',
  buildingPlan: { programArchitecture: { id: 'server-facility' }, topologySpaces: [] },
  footprintModules: [module],
  compoundBounds: { minX: -9, maxX: 9, minZ: -8, maxZ: 8 },
  floorH: 3.15,
  floors: 4,
  field: 'ceiling',
  stableKey: '21y:macro',
});
assert.ok(macro?.parts > 0);
assert.equal(macro.family, 'data-utility-megastructure');
assert.equal(macro.parts, macro.metal.length + macro.concrete.length, 'macro tinting must not change part count');
assert.equal(macro.traversalAuthority, 'building-plan-and-circulation-authority-unchanged');
assert.ok([...macro.metal, ...macro.concrete].every(part => Number.isInteger(part.color)), 'every macro wrapper part should use the existing instance-color channel');

console.log('[cut21y-macro-material-handwriting-selftest] PASS', {
  palettes: Object.keys(ARCHITECTURE_MATERIAL_PALETTES).length,
  stairParts: stair.parts,
  macroParts: macro.parts,
  stairFamily: stair.family,
  macroFamily: macro.family,
});
