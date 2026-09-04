import assert from 'node:assert/strict';
import {
    deriveStairFlight,
    gameplayTraversalEnvelope,
    PHYSICAL_TRUTH_SCHEMA,
    resolvePhysicalTruth,
} from '../world/physical-truth.js';
import {
    classifyPhysicalUse,
    chooseCompatibleProgram,
    programCompatibleWithPhysicalUse,
} from '../world/physical-use.js';

const residentialUse = classifyPhysicalUse({ morphology: 'dense-tenement', stableKey: 'home', override: 'residential-lodging' });
const commercialUse = classifyPhysicalUse({ morphology: 'dense-tenement', stableKey: 'shop', override: 'mercantile-public' });
const industrialUse = classifyPhysicalUse({ morphology: 'service-tenement', stableKey: 'plant', override: 'industrial-service' });

const residential = resolvePhysicalTruth({ physicalUse: residentialUse, role: 'dwelling-entry', weirdness: 0, stableKey: 'home' });
const commercial = resolvePhysicalTruth({ physicalUse: commercialUse, role: 'accessible-public-entry', weirdness: 0, stableKey: 'shop' });
const industrial = resolvePhysicalTruth({ physicalUse: industrialUse, role: 'maintenance-access', weirdness: 0, stableKey: 'plant' });
const weirdCommercial = resolvePhysicalTruth({ physicalUse: commercialUse, role: 'accessible-public-entry', weirdness: 0.9, stableKey: 'shop' });

assert.equal(residential.schema, PHYSICAL_TRUTH_SCHEMA);
assert.equal(commercial.door.clearWidth.provenance.id, 'ADA-2010-404.2.3');
assert.equal(commercial.door.clearHeight.provenance.id, 'IBC-2024-1010.1.1');
assert.equal(residential.door.clearWidth.provenance.id, 'IRC-2021-R311.2/R311.7');
assert.equal(industrial.stair.riser.provenance.id, 'OSHA-29-CFR-1910.25');
assert.equal(industrial.stair.headroom.provenance.id, 'OSHA-29-CFR-1910.25');
assert.equal(commercial.route.accessibleClearWidthProvenance.id, 'ADA-2010-403.5.1');
assert.notEqual(weirdCommercial.door.clearWidth.realizedSI, weirdCommercial.door.clearWidth.baselineSI);
assert.equal(weirdCommercial.door.clearWidth.baselineSI, commercial.door.clearWidth.baselineSI);

const publicFlight = deriveStairFlight({ rise: 3.12, truth: commercial, stableKey: 'shop-stair', availableRun: 4.6 });
assert.ok(publicFlight.stepCount >= 17, 'public flight should derive riser count from rise/max-riser, not a fixed visual constant');
assert.ok(publicFlight.riserHeight <= commercial.stair.riser.realizedSI + 1e-9);
assert.equal(publicFlight.physicalTruth, commercial);

const forgivingPlayer = gameplayTraversalEnvelope({ maxStep: 0.65 });
assert.equal(forgivingPlayer.maxStep, 0.65);
assert.equal(forgivingPlayer.architecturalInput, false);
assert.ok(publicFlight.riserHeight < forgivingPlayer.maxStep, 'gameplay step forgiveness must not become stair geometry');
assert.ok(forgivingPlayer.jump.apexHeight > 0.9 && forgivingPlayer.jump.apexHeight < 1.0);
assert.ok(forgivingPlayer.jump.easySameLevelRange > 2.1 && forgivingPlayer.jump.easySameLevelRange < 2.4);
assert.ok(forgivingPlayer.jump.maxBidirectionalRise <= forgivingPlayer.maxStep);
assert.equal(forgivingPlayer.jump.authority, 'gameplay-controller-ballistic-envelope');

assert.equal(programCompatibleWithPhysicalUse('auto_shop', industrialUse), true);
assert.equal(programCompatibleWithPhysicalUse('motel_room', industrialUse), false);
assert.equal(chooseCompatibleProgram({ programs: ['motel_room', 'auto_shop', 'boiler_room'], physicalUse: industrialUse, stableKey: 'plant' }) !== 'motel_room', true);

console.log('PASS physical truth authority', {
    residentialDoor: residential.door.clearWidth.realizedSI,
    commercialDoor: commercial.door.clearWidth.realizedSI,
    industrialAuthority: industrial.stair.riser.provenance.id,
    derivedPublicSteps: publicFlight.stepCount,
    gameplayStep: forgivingPlayer.maxStep,
});
