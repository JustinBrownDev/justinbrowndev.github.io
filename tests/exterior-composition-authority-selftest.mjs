import assert from 'node:assert/strict';
import { attachSpectacleMedia, compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';

const entities = Array.from({ length: 10 }, (_, index) => ({
    id: `building:${index}`,
    kind: index === 0 ? 'district-landmark' : 'building',
}));
const payload = { entities };
const chunk = { key: '0,0', seed: 0x12345678 };

const authoredTasks = [];
const contextualTasks = [];
const fieldTasks = [];
for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].id;
    authoredTasks.push({ kind: 'sign', entityId, seed: i, width: 2.8, height: 1.1, firstPassBundle: true, firstPassClass: 'facade' });
    authoredTasks.push({ kind: 'awning', entityId, seed: 100 + i, width: 2.4, depth: 1.0 });
    authoredTasks.push({ kind: 'pipe', entityId, seed: 200 + i, height: 3.0 });
    for (let slot = 0; slot < 14; slot++) {
        contextualTasks.push({
            kind: 'semantic-context-prop', entityId, seed: i * 100 + slot,
            semanticContextRole: 'wall', semanticOpportunityRole: 'wall-mounted-prop-zone',
            semanticVisualImpact: 1.0 + slot * 0.02,
            semanticHostId: `${entityId}:surface:north`,
            semanticOpportunityId: `${entityId}:hardware:${slot}`,
        });
    }
    if (i < 8) {
        fieldTasks.push({
            kind: 'exterior-prop-field', entityId, seed: 900 + i,
            exteriorVisualTier: 'spectacle', exteriorVisualImpact: 28 - i,
            fieldPlan: { placements: [{
                shape: 'box', assemblyKind: 'facade-megascreen', surfaceId: `${entityId}:surface:north`,
                spectacleSurfaceIds: [`${entityId}:surface:north`], sx: 7, sy: 3.6, sz: 0.16,
            }] },
        });
    }
    fieldTasks.push({
        kind: 'exterior-prop-field', entityId, seed: 1200 + i,
        exteriorVisualTier: 'macro', exteriorVisualImpact: 8,
        fieldPlan: { placements: [{ shape: 'box', surfaceId: `${entityId}:surface:east`, sx: 3.4, sy: 2, sz: 0.2 }] },
    });
}

const unrelated = { kind: 'semantic-life', entityId: 'building:0', seed: 9999 };
authoredTasks.push(unrelated);

const result = compileExteriorCompositionAuthority({ chunk, payload, authoredTasks, contextualTasks, fieldTasks });
assert.equal(result.stats.singleAuthority, true);
assert.equal(result.stats.opportunityGridIsCandidateOnly, true);
assert.equal(result.stats.buildingsManaged, 10);
assert.equal(result.stats.spectacleEligible, 8);
assert.ok(result.stats.spectacleSelected >= 2 && result.stats.spectacleSelected <= 4, 'district should expose several but not every spectacle candidate');
assert.ok(result.tasks.includes(unrelated), 'non-exterior semantic work must remain untouched');
assert.ok(result.stats.rejected > result.stats.accepted, 'dense hardware candidate lattice must be aggressively thinned before realization');
assert.ok(result.stats.maxAcceptedPerEntity <= 7, 'no building may receive an unbounded facade lattice');

for (const entity of entities) {
    const accepted = result.acceptedExteriorTasks.filter(task => task.entityId === entity.id);
    assert.ok(accepted.length >= 1, `${entity.id} needs a visible composition anchor`);
    assert.equal(accepted.filter(task => task.firstPassBundle).length, 1, `${entity.id} must have exactly one exterior first-pass anchor`);
    const contextWall = accepted.filter(task => task.kind === 'semantic-context-prop' && task.semanticContextRole === 'wall');
    assert.ok(contextWall.length <= 2, `${entity.id} must not realize the hardware grid`);
    const spectacle = accepted.find(task => task.exteriorVisualTier === 'spectacle');
    if (spectacle) {
        assert.ok(contextWall.every(task => task.semanticHostId !== `${entity.id}:surface:north`), 'spectacle surface must suppress same-surface hardware');
        assert.equal(spectacle.firstPassBundle, true, 'selected spectacle should become the building coverage anchor');
    }
}

assert.ok(result.acceptedExteriorTasks.some(task => task.kind === 'sign'), 'real authored readable signage must survive composition');
console.log('[exterior-composition-authority-selftest] PASS', {
    eligible: result.stats.spectacleEligible,
    selected: result.stats.spectacleSelected,
    candidates: result.stats.candidates,
    accepted: result.stats.accepted,
    rejected: result.stats.rejected,
    maxPerBuilding: result.stats.maxAcceptedPerEntity,
});


const mediaTarget = result.acceptedExteriorTasks.find(task => task.exteriorVisualTier === 'spectacle');
assert.ok(mediaTarget, 'fixture should retain at least one spectacle task');
mediaTarget.fieldPlan.placements.push({
    shape: 'cylinder', assemblyKind: 'facade-megascreen', assemblyId: 'support-only', sx: 0.1, sy: 3, sz: 0.1,
});
const media = attachSpectacleMedia({
    chunk,
    tasks: result.acceptedExteriorTasks,
    pairFor: () => ['FERROUS MEMORY', 'AUTHORIZED EXCHANGE'],
});
assert.ok(media.assemblies >= 1 && media.surfaces >= 1, 'selected megascreens must receive media descriptors');
const screenPanels = result.acceptedExteriorTasks.flatMap(task => task.fieldPlan?.placements ?? [])
    .filter(item => item.shape === 'box' && /megascreen/i.test(String(item.assemblyKind ?? '')));
assert.ok(screenPanels.every(item => item.media?.title === 'FERROUS MEMORY'), 'wraparound panels should share one deterministic advertisement identity');
assert.ok(screenPanels.every(item => /AUTHORIZED EXCHANGE/.test(item.media?.subtitle ?? '')), 'advertisement subtitle should use corpus content');
assert.ok(screenPanels.every(item => /(?:CREDITS|TOKENS|MARKS|DINAR|YEN|UNITS|GUILDERS|SCRIP)$/.test(item.media?.subtitle ?? '')), 'advertisement subtitle should carry a strange deterministic price/currency');
const support = mediaTarget.fieldPlan.placements.find(item => item.assemblyId === 'support-only');
assert.equal(support.media, undefined, 'support geometry must not accidentally become a text screen');
console.log('[exterior-composition-media-selftest] PASS', media);
