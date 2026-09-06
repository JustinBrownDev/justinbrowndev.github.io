import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import { programFacadeFrontageDirectives } from '../world/architecture/program-architecture.js';
import { planFastFacadeArchitecture } from '../world/fast-facade-architecture.js';

const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: 'cut21v-frontage:core', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.7, halfZ: 1.7,
  yMin: 0, yMax: 40,
  openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6,
  integratedFloorLanding: true,
};
const module = { key: 'main', cx: 0, cz: 0, halfX: 9, halfZ: 8, floors: 3, floorBase: 0 };
const sidecar = planBuildingSidecar({
  worldSeed: 0x21_16_22_05,
  chunkKey: '0,0',
  entityId: 'cut21v:elevated-retail',
  programHint: 'convenience',
  physicalUse: { family: 'mercantile-public' },
  physicalTruth,
  floorHeight: floorH,
  modules: [module],
  accessAnchors: [
    { id: 'main-entry', kind: 'main-entry', x: 0, z: 8, side: 'south', floor: 0 },
    {
      id: 'sky-entry', kind: 'city-exchange', endpointId: 'sky-endpoint', bridgeId: 'sky-bridge',
      x: -9, z: 0, side: 'west', floor: 1,
      traversalPermission: 'PUBLIC_THROUGH', routeCharacter: 'VERTICAL_COLLECTOR',
    },
  ],
  circulationReservations: [core],
});
const buildingPlan = promoteBuildingPlanAuthority(sidecar, {
  coreReservationId: core.id,
  coreReservation: core,
  chunkKey: '0,0',
  entityId: 'cut21v:elevated-retail',
});
const faces = [{
  moduleKey: 'main', dirKey: 'w', side: 'west', floors: 3, floorBase: 0,
  rect: { cx: 0, cz: 0, halfX: 9, halfZ: 8 },
  openings: [{
    floor: 1, kind: 'bridge-portal', openingKey: 'main:w:1',
    center: 0, width: 1.40, height: 2.08,
  }],
}];

const directives = programFacadeFrontageDirectives({ buildingPlan, faces });
assert.equal(directives.length, 1, 'one route-served retail facade should own one frontage authority');
const directive = directives[0];
assert.equal(directive.floor, 1);
assert.equal(directive.globalFloor, 1);
assert.equal(directive.side, 'west');
assert.equal(directive.routeAligned, true, 'route portal side should win when the sales floor exposes that facade');
assert.equal(directive.frontageKind, 'storefront');
assert.equal(directive.functionalFixture, 'primary-sales-display');

const facade = planFastFacadeArchitecture({
  stableKey: 'cut21v:elevated-retail:facade',
  faces,
  floorH,
  defaultDoorWidth: 1.35,
  defaultDoorHeight: 2.2,
  programFrontages: directives,
});
const treatment = facade.treatments.find(item => item.kind === 'program-frontage' && item.floor === 1);
assert.ok(treatment, 'elevated route floor should receive real program frontage architecture');
assert.equal(treatment.semanticProgram, 'convenience');
assert.equal(treatment.routeAligned, true);
assert.ok(treatment.width >= 1.5);
const aperture = facade.apertures.find(item => item.kind === 'program-frontage-window' && item.floor === 1);
assert.ok(aperture, 'program frontage should carve a broad glazed facade opening');
assert.ok(aperture.bottom >= 0.8, 'elevated commercial glazing must retain a real walk-safe sill');
const protectedPortal = faces[0].openings[0];
const intervalGap = Math.abs(aperture.center - protectedPortal.center)
  - (aperture.width + protectedPortal.width) * 0.5;
assert.ok(intervalGap >= 0.15, `commercial frontage must not collide with protected bridge portal; gap=${intervalGap}`);
assert.ok(facade.render.windows.some(item => item.facadeRole === 'program-frontage-glazing' && item.floor === 1));
assert.ok(facade.render.props.some(item => item.facadeRole === 'route-frontage-awning' && item.floor === 1));
assert.equal(facade.metrics.elevatedProgramFrontages, 1);
assert.equal(facade.metrics.programPortalFrontages, 0);

console.log('[cut21v-elevated-program-frontage-selftest] PASS', {
  directive,
  treatment: { width: treatment.width, floor: treatment.floor, routeAligned: treatment.routeAligned },
  portalToGlazingGap: intervalGap,
  metrics: facade.metrics,
});
