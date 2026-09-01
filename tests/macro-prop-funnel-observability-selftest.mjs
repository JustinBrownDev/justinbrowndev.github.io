import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectSemanticContextAsset } from '../world/semantic-context-multiplier.js';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';
import {
    createExteriorCoverageRuntime,
    exteriorCoverageSnapshot,
    recordExteriorCoverageResult,
} from '../world/exterior-composition-runtime.js';

const semanticDef = (id, { mount = 'ground', kind = id, dims = [1, 1, 1], collision = 'none' } = {}) => ({
    id,
    file: `semantic-megapack/assets/${id}.glb`,
    kind,
    semanticClass: kind,
    mount,
    collision,
    dimensionsXYZ: dims,
    programs: ['industrial'],
    semanticGraph: { roles: ['semantic-prop'] },
});

const chunk = { key: 'audit-05', seed: 0x05a11d };
const contextId = 'ctx:a';
const basePayload = {
    entities: [{ id: 'A', kind: 'building', program: 'industrial' }],
    semanticContext: { entities: [{ id: contextId, entityId: 'A', program: 'industrial' }], spaces: [], opportunities: [] },
};

// Selection diagnostics distinguish collision and fit scarcity without changing selection policy.
const collisionOpportunity = {
    id: 'A:ground', role: 'ground-open-zone', entityId: 'A', hostId: 'A', contextId,
    transform: { x: 0, y: 0, z: 0, rotY: 0 }, clearanceBudget: { width: 3, height: 3, depth: 3 },
};
const collisionDiagnostics = {};
const mediumCollider = selectSemanticContextAsset({
    chunk,
    payload: { ...basePayload, semanticContext: { ...basePayload.semanticContext, opportunities: [collisionOpportunity] } },
    assets: [semanticDef('collider-machine', { kind: 'industrial_machine', dims: [2, 2, 2], collision: 'box' })],
    opportunity: collisionOpportunity,
    request: { semanticFamily: 'any', desiredScaleClass: 'medium', priorityTier: 'medium' },
    diagnostics: collisionDiagnostics,
});
assert.equal(mediumCollider, null);
assert.equal(collisionDiagnostics.collisionRejected, 1);
assert.equal(collisionDiagnostics.outcome, 'collision-or-fit-exhausted');

const tinyOpportunity = {
    id: 'A:tiny', role: 'ground-open-zone', entityId: 'A', hostId: 'A', contextId,
    transform: { x: 1, y: 0, z: 0, rotY: 0 }, clearanceBudget: { width: 0.36, height: 1, depth: 0.36 },
};
const fitDiagnostics = {};
const oversized = selectSemanticContextAsset({
    chunk,
    payload: { ...basePayload, semanticContext: { ...basePayload.semanticContext, opportunities: [tinyOpportunity] } },
    assets: [semanticDef('oversized-machine', { kind: 'industrial_machine', dims: [10, 10, 10] })],
    opportunity: tinyOpportunity,
    request: { semanticFamily: 'any', desiredScaleClass: 'large', priorityTier: 'macro' },
    diagnostics: fitDiagnostics,
});
assert.equal(oversized, null);
assert.equal(fitDiagnostics.fitRejected, 1);
assert.equal(fitDiagnostics.outcome, 'collision-or-fit-exhausted');

// Composition diagnostics explain why valid candidates did not survive admission.
const opportunities = Array.from({ length: 5 }, (_, index) => ({
    id: `A:sign:${index}`,
    role: 'facade-sign-zone',
    entityId: 'A', hostId: 'A', surfaceId: `A:surface:${index}`, contextId,
    transform: { x: index * 2, y: 3, z: -2, rotY: 0 },
    clearanceBudget: { width: 1.4, height: 1.0, depth: 0.2 },
    decorationMayIntrude: true,
}));
const authoredTasks = opportunities.map((opportunity, index) => ({
    kind: 'sign', entityId: 'A', seed: index, width: 1.2, height: 0.8,
    exteriorVisualTier: 'identity', semanticOpportunityId: opportunity.id,
    semanticOpportunityRole: opportunity.role,
    semanticPlacement: { ...opportunity.transform, opportunityId: opportunity.id, surfaceId: opportunity.surfaceId, role: opportunity.role },
}));
const composition = compileExteriorCompositionAuthority({
    chunk,
    payload: {
        entities: [{ id: 'A', kind: 'building', program: 'industrial' }],
        semanticContext: { entities: [{ id: contextId, entityId: 'A', program: 'industrial' }], spaces: [], opportunities, spatialTopology: { reservations: [] } },
    },
    authoredTasks,
});
assert.equal(composition.stats.candidates, authoredTasks.length);
assert.ok(composition.stats.rejected > 0);
assert.ok(Object.values(composition.stats.admissionRejectionReasons).reduce((sum, value) => sum + value, 0) >= composition.stats.rejected);
assert.ok((composition.stats.admissionRejectionReasons['tier-cap'] ?? 0) > 0 || (composition.stats.admissionRejectionReasons['density-ceiling'] ?? 0) > 0);
assert.ok(composition.stats.perEntity.A.rejectionReasons);

// Runtime diagnostics expose accepted -> attempted -> published/no-op throughput and pending starvation.
const macroTask = {
    entityId: 'A', kind: 'semantic-context-prop',
    exteriorRequest: { desiredScaleClass: 'large' },
    exteriorComposition: { tier: 'macro', wave: 1, coverageRequired: true },
    semanticPlacement: { x: 2, z: 0 },
};
const runtimeComposition = {
    stats: {
        runtimeSchema: 'jweb.exterior-composition-runtime.v1',
        perEntity: {
            A: {
                style: 'pipe-nightmare', densityCeiling: 5,
                coverageFloor: { planned: 1 },
                tierCounts: { spectacle: 0, identity: 0, macro: 1, medium: 0, micro: 0 },
                plannedLargeMacro: 1,
            },
        },
    },
};
const state = { cursor: 0, firstPassComplete: true, tasks: [macroTask], exteriorCoverage: createExteriorCoverageRuntime(runtimeComposition) };
const payload = {
    entities: [{ id: 'A', x: 2, z: 0 }],
    semanticContextUpgradeTelemetry: {
        queued: 1, pending: 1, loaded: 0, realized: 0, loadFailed: 0, fitRejected: 0,
        structuralRejected: 0, invalidBounds: 0, cancelled: 0,
        cache: { hit: 0, inflight: 0, miss: 1, failed: 0 },
        byTier: { macro: { queued: 1, realized: 0, rejected: 0 } },
        settledLatencyMsTotal: 0, settledCount: 0, maxLatencyMs: 0, lastLatencyMs: 0,
    },
};
let snapshot = exteriorCoverageSnapshot(state, payload, { x: 0, z: 0 });
assert.equal(snapshot.acceptedLargeMacro, 1);
assert.equal(snapshot.pendingLargeMacro, 1);
assert.equal(snapshot.attemptedLargeMacro, 0);
assert.equal(snapshot.semanticContextUpgrades.pending, 1);

state.cursor = 1;
recordExteriorCoverageResult(state, macroTask, false, 'realizer-noop');
snapshot = exteriorCoverageSnapshot(state, payload, { x: 0, z: 0 });
assert.equal(snapshot.pendingLargeMacro, 0);
assert.equal(snapshot.attemptedLargeMacro, 1);
assert.equal(snapshot.publishedLargeMacro, 0);
assert.equal(snapshot.missedLargeMacro, 1);
assert.equal(snapshot.missedByReason['realizer-noop'], 1);

// The browser-side real-corpus upgrade path must retain explicit late-fit/load telemetry hooks.
const enrichmentSource = await readFile(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
assert.match(enrichmentSource, /semanticContextUpgradeTelemetry/);
assert.match(enrichmentSource, /fitRejected/);
assert.match(enrichmentSource, /structuralRejected/);
assert.match(enrichmentSource, /cacheState/);

console.log('[macro-prop-funnel-observability-selftest] PASS', {
    selection: { collisionDiagnostics, fitDiagnostics },
    admission: composition.stats.admissionRejectionReasons,
    runtime: snapshot,
});
