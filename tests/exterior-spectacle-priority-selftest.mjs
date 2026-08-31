import assert from 'node:assert/strict';
import {
    EXTERIOR_FIRST_PASS_KIND_ORDER,
    EXTERIOR_OPPORTUNITY_PRIORITY,
    EXTERIOR_VISUAL_TIER,
    compareExteriorPriorityKeys,
    exteriorAssetVisualImpact,
    exteriorTaskPriorityKey,
} from '../world/exterior-spectacle-priority.js';

assert.ok(EXTERIOR_OPPORTUNITY_PRIORITY['corner-media-band'] < EXTERIOR_OPPORTUNITY_PRIORITY['wall-mounted-prop-zone']);
assert.ok(EXTERIOR_OPPORTUNITY_PRIORITY['facade-spectacle-span'] < EXTERIOR_OPPORTUNITY_PRIORITY['facade-poster-zone']);
assert.equal(EXTERIOR_VISUAL_TIER.spectacle, 0);
assert.ok(EXTERIOR_VISUAL_TIER.micro > EXTERIOR_VISUAL_TIER.macro);
assert.ok(
    EXTERIOR_FIRST_PASS_KIND_ORDER.indexOf('semantic-context-prop') < EXTERIOR_FIRST_PASS_KIND_ORDER.indexOf('graffiti'),
    'macro contextual corpus props must be eligible before graffiti in the visible birth pass',
);
assert.ok(
    EXTERIOR_FIRST_PASS_KIND_ORDER.indexOf('semantic-context-prop') < EXTERIOR_FIRST_PASS_KIND_ORDER.indexOf('flyer'),
    'macro contextual corpus props must be eligible before flyers in the visible birth pass',
);

const large = { dimensionsXYZ: [4.8, 2.8, 0.25] };
const small = { dimensionsXYZ: [0.45, 0.35, 0.18] };
const host = { width: 6, height: 4, depth: 1 };
assert.ok(
    exteriorAssetVisualImpact(large, 0.92, host, 'wall') > exteriorAssetVisualImpact(small, 1, host, 'wall'),
    'large near-native assets must outrank tiny wall hardware when semantic relevance is otherwise comparable',
);

const player = { x: 0, z: 0 };
const nearMedium = exteriorTaskPriorityKey(
    { kind: 'pipe', entityId: 'near', seed: 1 },
    { playerPosition: player, taskPosition: { x: 3, z: 0 }, firstPassIncomplete: false },
);
const farSpectacle = exteriorTaskPriorityKey(
    { kind: 'exterior-prop-field', exteriorVisualTier: 'spectacle', exteriorVisualImpact: 30, entityId: 'far', seed: 2 },
    { playerPosition: player, taskPosition: { x: 16, z: 0 }, firstPassIncomplete: false },
);
assert.ok(compareExteriorPriorityKeys(nearMedium, farSpectacle) < 0, 'near-before-far must remain stronger across distance bands');

const sameStreetSpectacle = exteriorTaskPriorityKey(
    { kind: 'exterior-prop-field', exteriorVisualTier: 'spectacle', exteriorVisualImpact: 30, entityId: 'hero', seed: 3 },
    { playerPosition: player, taskPosition: { x: 4.5, z: 0 }, firstPassIncomplete: false },
);
const sameStreetMicro = exteriorTaskPriorityKey(
    { kind: 'flyer', entityId: 'micro', seed: 4 },
    { playerPosition: player, taskPosition: { x: 2.5, z: 0 }, firstPassIncomplete: false },
);
assert.ok(compareExteriorPriorityKeys(sameStreetSpectacle, sameStreetMicro) < 0, 'within the same street pocket, spectacle must beat micro clutter');

const firstPass = exteriorTaskPriorityKey(
    { kind: 'sign', firstPassBundle: true, entityId: 'deprived', seed: 5 },
    { playerPosition: player, taskPosition: { x: 5, z: 0 }, firstPassIncomplete: true },
);
const deep = exteriorTaskPriorityKey(
    { kind: 'roof-topper', entityId: 'already-rich', seed: 6 },
    { playerPosition: player, taskPosition: { x: 2, z: 0 }, firstPassIncomplete: true },
);
assert.ok(compareExteriorPriorityKeys(firstPass, deep) < 0, 'coverage-floor first-pass work must beat deepening while entities remain deprived');

const macroContextBirth = exteriorTaskPriorityKey(
    {
        kind: 'semantic-context-prop', firstPassBundle: true, exteriorVisualTier: 'macro',
        semanticVisualImpact: 24, entityId: 'machine-host', seed: 7,
    },
    { playerPosition: player, taskPosition: { x: 4.2, z: 0 }, firstPassIncomplete: true },
);
const flyerBirth = exteriorTaskPriorityKey(
    { kind: 'flyer', firstPassBundle: true, entityId: 'paper-host', seed: 8 },
    { playerPosition: player, taskPosition: { x: 3.5, z: 0 }, firstPassIncomplete: true },
);
assert.ok(
    compareExteriorPriorityKeys(macroContextBirth, flyerBirth) < 0,
    'once both are legitimate visible births in the same street pocket, a macro corpus prop must beat a flyer',
);

console.log('[exterior-spectacle-priority-selftest] PASS');
